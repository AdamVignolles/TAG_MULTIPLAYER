import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameMode, LobbyMessage, ServerMessage, StateMessage, PlayerView } from '../types/ws'
import { getSpriteUrl } from '../utils/characterManager'
import { getModeRules, getFrenchMode, getModeDescription, getGameStats, isMinPlayersReached } from '../utils/rulesGameMode'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
const WS_RELATIVE = `${window.location.origin.replace(/^http/, 'ws')}/ws`

function getAnimationFrame(player: PlayerView): number {
  // Determine which sprite row (0-5) to display based on movement state
  // 0: static, 1: left, 2: right, 3: jump static, 4: jump left, 5: jump right
  
  const isJumping = player.vy !== undefined && player.vy !== 0
  const isMovingLeft = player.vx !== undefined && player.vx < -10
  const isMovingRight = player.vx !== undefined && player.vx > 10

  if (isJumping) {
    if (isMovingLeft) return 4  // jump left
    if (isMovingRight) return 5  // jump right
    return 3  // jump static
  }

  if (isMovingLeft) return 1  // walk left
  if (isMovingRight) return 2  // walk right
  
  return 0  // static
}

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

const TILE_COLORS: Record<string, string> = {
  solid: '#8b6b47',
  jumpBoost: '#4a7fff',
  jumpDown: '#7b5a9e',
  passable: '#a04a70',
  speedUp: '#ffd700 ',
  speedDown: '#4d8f3d ',
}

const TILE_DESCRIPTIONS: Record<string, { name: string; description: string; className: string }> = {
  solid: {
    name: 'Solide',
    description: 'Un bloc de base solide. Vous pouvez sauter dessus.',
    className: 'solid',
  },
  jumpBoost: {
    name: 'Rebond (+)',
    description: 'Augmente votre hauteur de saut et votre force.',
    className: 'jumpBoost',
  },
  jumpDown: {
    name: 'Rebond (-)',
    description: 'Réduit votre hauteur de saut et votre force.',
    className: 'jumpDown',
  },
  passable: {
    name: 'Passable',
    description: 'Un bloc transparent. Vous pouvez passer monter dessus ou passer à travers avec les boutons de saut.',
    className: 'passable',
  },
  speedUp: {
    name: 'Vitesse (+)',
    description: 'Augmente votre vitesse de déplacement.',
    className: 'speedUp',
  },
  speedDown: {
    name: 'Vitesse (-)',
    description: 'Réduit votre vitesse de déplacement.',
    className: 'speedDown',
  },
}

export function ScreenApp() {
  const [status, setStatus] = useState('Deconnecte')
  const [log, setLog] = useState('')
  const [isPortrait, setIsPortrait] = useState(window.matchMedia('(orientation: portrait)').matches)
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
    const media = window.matchMedia('(orientation: portrait)')

    const updateOrientation = (event: MediaQueryListEvent) => {
      setIsPortrait(event.matches)
    }

    setIsPortrait(media.matches)

    if (media.addEventListener) {
      media.addEventListener('change', updateOrientation)
      return () => media.removeEventListener('change', updateOrientation)
    }

    media.addListener(updateOrientation)
    return () => media.removeListener(updateOrientation)
  }, [])

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

  function goHome() {
    setLobby((prev) => ({ ...prev, started: false }))
    setGameState(null)

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_game' }))
    }

    setLog('Retour a l accueil...')
  }

  if (isPortrait) {
    return (
      <main className="screen-layout screen-portrait-warning">
        <h1>Veuillez tourner votre telephone</h1>
        <p>L'ecran principal fonctionne en format paysage.</p>
      </main>
    )
  }

  if (!lobby.started) {
    return (
      <main className="screen-home">
        <div className="screen-home-layout">
          {/* Colonne gauche: Blocs */}
          <div className="screen-home-card">
            <section className="screen-home-blocks-section">
              <h1>Blocs du jeu</h1>
              <div className="blocks-grid">
                {Object.entries(TILE_DESCRIPTIONS).map(([type, info]) => (
                  <div key={type} className="block-card">
                    <div
                      className={`block-sample tile ${info.className}`}
                      aria-hidden="true"
                    />
                    <div className="block-info">
                      <h3>{info.name}</h3>
                      <p>{info.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Colonne centre: QR + Mode */}
          <section className="screen-home-card">
            <h1>Scannez pour rejoindre</h1>
            <img
              className="qr-code"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
                controllerUrl,
              )}`}
              alt="QR code pour rejoindre en tant que controleur"
            />
            <p className="qr-hint">Les joueurs rejoignent via ce QR code ou via l'url ci dessous.</p>
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
                {getFrenchMode('classic')}
              </button>
              <button
                className={lobby.mode === 'zombie' ? 'active' : ''}
                onClick={() => sendMode('zombie')}
              >
                {getFrenchMode('zombie')}
              </button>
              <button
                className={lobby.mode === 'bomb' ? 'active' : ''}
                onClick={() => sendMode('bomb')}
              >
                {getFrenchMode('bomb')}
              </button>
            </div>

            <button className="launch-button" onClick={startGame}>
              Lancer la partie
            </button>
            <p className="status">Statut: {status}</p>
          </section>

          <section className="screen-home-card mode-rules-card">
              <h1>Règles du jeu</h1>
              <div className="mode-description">
                <h2>{getModeDescription(lobby.mode)?.title}</h2>
                <p className="mode-tagline">{getModeDescription(lobby.mode)?.description}</p>
                <ul className="mode-rules-list">
                  {getModeRules(lobby.mode).map((rule, index) => (
                    <li key={index}>{rule}</li>
                  ))}
                </ul>
              </div>
              <div className="game-stats">
                <div className="stat-item">
                  <span className="stat-label">Durée</span>
                  <strong>{getGameStats(lobby.mode, lobby.connectedPlayers).duree}</strong>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Gagnant(s)</span>
                  <strong>{getGameStats(lobby.mode, lobby.connectedPlayers).gagnant}</strong>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Nombre de TAG</span>
                  <strong>{getGameStats(lobby.mode, lobby.connectedPlayers).tag}</strong>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Joueurs minimum</span>
                  <strong className={isMinPlayersReached(lobby.connectedPlayers, getGameStats(lobby.mode, lobby.connectedPlayers).minPlayers) ? 'stat-reached' : 'stat-not-reached'}>
                    {isMinPlayersReached(lobby.connectedPlayers, getGameStats(lobby.mode, lobby.connectedPlayers).minPlayers) ? '✓ Atteint' : '✗ Non atteint'}
                  </strong>
                </div>
              </div>
          </section>
        </div>
      </main>
    )
  }

  const arenaW = gameState?.arena.width ?? 900
  const arenaH = gameState?.arena.height ?? 500
  const playerCount = gameState?.players.length ?? lobby.connectedPlayers

  return (
    <main className="screen-layout game-screen">
      <header className="game-hud">
        <div className="hud-left">
          <button className="home-button" onClick={goHome} title="Retour a l accueil" aria-label="Retour a l accueil">
            <i className="fas fa-home" aria-hidden="true" />
          </button>
          <div>
            <strong className="hud-title">Tag Arena</strong>
            <p className="hud-subtitle">Partie en cours</p>
          </div>
        </div>

        <div className="hud-stats">
          <div className="hud-pill">
            <span className="hud-pill-label">Statut</span>
            <strong>{status}</strong>
          </div>
          <div className="hud-pill">
            <span className="hud-pill-label">Mode</span>
            <strong>{MODE_LABEL[lobby.mode]}</strong>
          </div>
          <div className="hud-pill">
            <span className="hud-pill-label">Temps</span>
            <strong>{formatTime(gameState?.remainingMs ?? 0)}</strong>
          </div>
          <div className="hud-pill">
            <span className="hud-pill-label">Joueurs</span>
            <strong>{playerCount}</strong>
          </div>
        </div>
      </header>

      <section className={`arena mode-${lobby.mode}`} style={{ width: `${arenaW}px`, height: `${arenaH}px` }}>
        <div className="arena-gradient" aria-hidden="true" />
        <div className="arena-grid" aria-hidden="true" />
        <div className="arena-noise" aria-hidden="true" />

        {(gameState?.tiles ?? []).map((tile) => {
          const color = TILE_COLORS[tile.type] ?? '#7bd389'

          return (
            <div
              key={tile.id}
              className={`tile ${tile.type} ${tile.className ?? ''}`}
              style={{
                left: `${tile.x}px`,
                top: `${tile.y}px`,
                width: `${tile.w}px`,
                height: `${tile.h}px`,
                backgroundColor: color,
                ['--tile-base' as string]: color,
              }}
            />
          )
        })}

        {(gameState?.players ?? []).map((player) => {
          const isTag = gameState?.mode === 'zombie' ? player.isTag : gameState?.tagPlayerId === player.id
          const spriteSize = 32
          const frameIndex = getAnimationFrame(player)
          const backgroundYOffset = frameIndex * spriteSize
          const playerLabel = (player.name ?? '').slice(0, 2).toUpperCase() || player.id || '--'

          return (
            <div key={player.id} style={{ position: 'absolute', left: `${player.x}px`, top: `${player.y}px`, transform: 'translate(-50%, -50%)', width: 0, height: 0 }}>
              <div
                className={`player ${isTag ? 'tag' : ''}`}
                style={{
                  position: 'absolute',
                  left: `${-spriteSize / 2}px`,
                  top: `${-spriteSize / 2}px`,
                  width: `${spriteSize}px`,
                  height: `${spriteSize}px`,
                  backgroundImage: player.character ? `url(${getSpriteUrl(player.character)})` : undefined,
                  backgroundPosition: `0 ${-backgroundYOffset}px`,
                  backgroundSize: `${spriteSize}px ${6 * spriteSize}px`,
                  backgroundRepeat: 'no-repeat',
                  imageRendering: 'pixelated' as any,
                }}
                title={player.name}
              >
                <div className="player-label">
                  {playerLabel}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      <footer className="log game-log">{log || 'Partie en cours.'}</footer>
    </main>
  )
}
