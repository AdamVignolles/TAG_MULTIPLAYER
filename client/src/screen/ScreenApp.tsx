import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameMode, LobbyMessage, ServerMessage, StateMessage } from '../types/ws'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
const WS_RELATIVE = `${window.location.origin.replace(/^http/, 'ws')}/ws`

function formatTime(ms: number) {
  const sec = Math.ceil(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Classique',
  zombie: 'Zombie',
  bomb: 'Bombe',
}

export function ScreenApp() {
  const [status, setStatus] = useState('Deconnecte')
  const [log, setLog] = useState('')
  const [lobby, setLobby] = useState<LobbyMessage>({
    type: 'lobby',
    mode: 'classic',
    modeLabel: MODE_LABEL.classic,
    connectedPlayers: 0,
    started: false,
  })
  const [gameState, setGameState] = useState<StateMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const controllerUrl = useMemo(
    () => `${window.location.origin}${window.location.pathname}?role=controller`,
    [],
  )

  useEffect(() => {
    let closed = false
    const candidates = [WS_RELATIVE, WS_URL, 'ws://localhost:3001']

    async function tryConnect() {
      setStatus('Connexion...')
      for (const url of candidates) {
        if (closed) return

        try {
          const ws = new WebSocket(url)
          wsRef.current = ws

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('timeout')), 3000)

            ws.onopen = () => {
              clearTimeout(timeout)
              resolve()
            }
            ws.onerror = (event) => {
              clearTimeout(timeout)
              reject(event)
            }
            ws.onclose = () => {
              clearTimeout(timeout)
              reject(new Error('closed'))
            }
          })

          setStatus('Connecte')

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data) as ServerMessage

              if (data.type === 'state') {
                setGameState(data)
                return
              }

              if (data.type === 'lobby') {
                setLobby(data)
                return
              }

              if (data.type === 'tag_event') {
                setLog(`${data.from} a tag ${data.to}`)
                return
              }

              if (data.type === 'game_over' || data.type === 'error') {
                setLog(data.message)
              }
            } catch (error) {
              console.error('ws message parse error', error)
            }
          }

          ws.onclose = () => {
            setStatus('Deconnecte')
            wsRef.current = null
          }

          ws.send(JSON.stringify({ type: 'join', role: 'screen' }))
          return
        } catch (error) {
          console.warn('WebSocket connect failed', url, error)
          setLog(`Echec connexion ${url}`)
        }
      }

      setStatus('Deconnecte')
    }

    tryConnect()

    return () => {
      closed = true
      try {
        wsRef.current?.close()
      } catch {
        // no-op
      }
      wsRef.current = null
    }
  }, [])

  function sendMode(mode: GameMode) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'set_mode', mode }))
  }

  function startGame() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'start_game' }))
  }

  if (!lobby.started) {
    return (
      <main className="screen-home">
        <section className="screen-home-card">
          <h1>Scannez pour rejoindre</h1>
          <img
            className="qr-code"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
              controllerUrl,
            )}`}
            alt="QR code pour rejoindre en tant que controleur"
          />
          <p className="qr-hint">Les joueurs rejoignent uniquement via ce QR code.</p>
          <p className="small-url">{controllerUrl}</p>

          <div className="lobby-info-grid">
            <div>
              <span className="label">Joueurs connectes</span>
              <strong>{lobby.connectedPlayers}</strong>
            </div>
            <div>
              <span className="label">Mode choisi</span>
              <strong>{MODE_LABEL[lobby.mode]}</strong>
            </div>
          </div>

          <div className="mode-actions">
            <button
              className={lobby.mode === 'classic' ? 'active' : ''}
              onClick={() => sendMode('classic')}
            >
              Classique
            </button>
            <button
              className={lobby.mode === 'zombie' ? 'active' : ''}
              onClick={() => sendMode('zombie')}
            >
              Zombie
            </button>
            <button
              className={lobby.mode === 'bomb' ? 'active' : ''}
              onClick={() => sendMode('bomb')}
            >
              Bombe
            </button>
          </div>

          <button className="launch-button" onClick={startGame}>
            Lancer la partie
          </button>
          <p className="status">Statut: {status}</p>
          <p className="status">{log || 'En attente des joueurs...'}</p>
        </section>
      </main>
    )
  }

  const arenaW = gameState?.arena.width ?? 900
  const arenaH = gameState?.arena.height ?? 500

  return (
    <main className="screen-layout">
      <header className="topbar">
        <strong>Ecran principal</strong>
        <span>{status}</span>
        <span>Mode: {MODE_LABEL[lobby.mode]}</span>
        <span>Temps: {formatTime(gameState?.remainingMs ?? 0)}</span>
        <span>Joueurs: {gameState?.players.length ?? lobby.connectedPlayers}</span>
      </header>

      <section className="arena" style={{ width: `${arenaW}px`, height: `${arenaH}px` }}>
        {(gameState?.tiles ?? []).map((tile) => {
          const color =
            tile.type === 'solid'
              ? '#111'
              : tile.type === 'jumpBoost'
                ? '#2b6cff'
                : tile.type === 'passable'
                  ? '#ff7fbf'
                  : tile.type === 'speedUp'
                    ? '#ffd54f'
                    : '#7bd389'

          return (
            <div
              key={tile.id}
              className={`tile ${tile.type}`}
              style={{
                left: `${tile.x}px`,
                top: `${tile.y}px`,
                width: `${tile.w}px`,
                height: `${tile.h}px`,
                background: color,
              }}
            />
          )
        })}

        {(gameState?.players ?? []).map((player) => {
          const isTag = gameState?.tagPlayerId === player.id

          return (
            <div
              key={player.id}
              className={`player ${isTag ? 'tag' : ''}`}
              style={{
                left: `${player.x - player.radius}px`,
                top: `${player.y - player.radius}px`,
                width: `${player.radius * 2}px`,
                height: `${player.radius * 2}px`,
              }}
              title={player.name}
            >
              {player.name.slice(0, 2).toUpperCase()}
            </div>
          )
        })}
      </section>

      <footer className="log">{log || 'Partie en cours.'}</footer>
    </main>
  )
}
