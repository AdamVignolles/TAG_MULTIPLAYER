import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type PlayerView = {
  id: string
  name: string
  x: number
  y: number
  radius: number
}

type StateMessage = {
  type: 'state'
  arena: { width: number; height: number; floorY: number }
  remainingMs: number
  tagPlayerId: string | null
  players: PlayerView[]
  tiles?: Array<{ id: string; x: number; y: number; w: number; h: number; type: string }>
}

type ServerMessage =
  | { type: 'hello'; message: string }
  | { type: 'joined'; role: 'screen' | 'controller'; playerId?: string; name?: string }
  | { type: 'error'; message: string }
  | { type: 'tag_event'; from: string; to: string }
  | { type: 'game_over'; message: string }
  | StateMessage

type Role = 'home' | 'screen' | 'controller'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
const WS_RELATIVE = `${window.location.origin.replace(/^http/, 'ws')}/ws`

function formatTime(ms: number) {
  const sec = Math.ceil(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function App() {
  const initialRole = useMemo<Role>(() => {
    const roleParam = new URLSearchParams(window.location.search).get('role')
    if (roleParam === 'screen') return 'screen'
    if (roleParam === 'controller') return 'controller'
    return 'home'
  }, [])

  const [role, setRole] = useState<Role>(initialRole)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('Déconnecté')
  const [log, setLog] = useState('')
  const [joinedPlayerId, setJoinedPlayerId] = useState<string | null>(null)
  const [gameState, setGameState] = useState<StateMessage | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)
  const [jump, setJump] = useState(false)

  useEffect(() => {
    if (role === 'home') return

    let closed = false
    const candidates = [WS_RELATIVE, WS_URL, `ws://localhost:3001`]

    async function tryConnect() {
      setStatus('Connexion...')
      for (const url of candidates) {
        if (closed) return
        try {
          const ws = new WebSocket(url)
          wsRef.current = ws

          const openPromise = new Promise<void>((res, rej) => {
            const t = setTimeout(() => {
              rej(new Error('timeout'))
            }, 3000)
            ws.onopen = () => {
              clearTimeout(t)
              res()
            }
            ws.onerror = (e) => {
              clearTimeout(t)
              rej(e)
            }
            ws.onclose = () => {
              clearTimeout(t)
              rej(new Error('closed'))
            }
          })

          await openPromise
          setStatus('Connecté')

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data) as ServerMessage
              if (data.type === 'joined' && data.playerId) {
                setJoinedPlayerId(data.playerId)
              }
              if (data.type === 'state') {
                setGameState(data)
              }
              if (data.type === 'tag_event') {
                setLog(`${data.from} a tag ${data.to}`)
              }
              if (data.type === 'game_over') {
                setLog(data.message)
              }
              if (data.type === 'error') {
                setLog(data.message)
              }
            } catch (err) {
              console.error('ws message parse error', err)
            }
          }

          ws.onclose = () => {
            setStatus('Déconnecté')
            wsRef.current = null
          }

          // send join once open
          ws.send(
            JSON.stringify({
              type: 'join',
              role,
              name: role === 'controller' ? name.trim() || undefined : undefined,
            }),
          )

          return
        } catch (err) {
          console.warn('WebSocket connect failed', url, err)
          setLog(`Échec connexion ${url}`)
          // try next candidate
        }
      }

      setStatus('Déconnecté')
    }

    tryConnect()

    return () => {
      closed = true
      try {
        wsRef.current?.close()
      } catch {}
      wsRef.current = null
    }
  }, [role, name])

  useEffect(() => {
    if (role !== 'controller') return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'input', left, right, jump }))
  }, [left, right, jump, role])

  if (role === 'home') {
    return (
      <main className="home">
        <h1>TAG Multiplayer - Minimal</h1>
        <p>Choisis ton mode de connexion.</p>
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pseudo (optionnel)"
          maxLength={16}
        />
        <div className="actions">
          <button onClick={() => setRole('screen')}>Grand écran</button>
          <button onClick={() => setRole('controller')}>Contrôleur mobile</button>
        </div>
        <p className="hint">
          Astuce: ouvre <code>?role=screen</code> ou <code>?role=controller</code> directement.
        </p>
      </main>
    )
  }

  if (role === 'screen') {
    const arenaW = gameState?.arena.width ?? 900
    const arenaH = gameState?.arena.height ?? 500
    const controllerUrl = `${window.location.origin}${window.location.pathname}?role=controller`

    return (
      <main className="screen-layout">
        <header className="topbar">
          <strong>Mode écran</strong>
          <span>{status}</span>
          <span>Temps: {formatTime(gameState?.remainingMs ?? 0)}</span>
          <span>Joueurs: {gameState?.players.length ?? 0}</span>
        </header>

        <div className="screen-main">
          <section
            className="arena"
            style={{ width: `${arenaW}px`, height: `${arenaH}px` }}
          >
          {(gameState?.tiles ?? []).map((t) => {
            const color = t.type === 'solid' ? '#111' : t.type === 'jumpBoost' ? '#2b6cff' : t.type === 'passable' ? '#ff7fbf' : t.type === 'speedUp' ? '#ffd54f' : '#7bd389'
            return (
              <div
                key={t.id}
                className={`tile ${t.type}`}
                style={{
                  left: `${t.x}px`,
                  top: `${t.y}px`,
                  width: `${t.w}px`,
                  height: `${t.h}px`,
                  background: color,
                }}
              />
            )
          })}
          {(gameState?.players ?? []).map((p) => {
            const isTag = gameState?.tagPlayerId === p.id
            return (
              <div
                key={p.id}
                className={`player ${isTag ? 'tag' : ''}`}
                style={{
                  left: `${p.x - p.radius}px`,
                  top: `${p.y - p.radius}px`,
                  width: `${p.radius * 2}px`,
                  height: `${p.radius * 2}px`,
                }}
                title={p.name}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </div>
            )
          })}
        </section>

          <aside className="qr-panel">
            <h3>Scanne pour rejoindre</h3>
            <img
              className="qr-code"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
                controllerUrl,
              )}`}
              alt="QR code pour rejoindre en tant que contrôleur"
            />
            <div className="qr-url">{controllerUrl}</div>
            <div className="qr-hint">Ouvre sur ton téléphone et choisis un pseudo.</div>
          </aside>
        </div>

        <footer className="log">{log || 'Attente des joueurs...'}</footer>
      </main>
    )
  }

  return (
    <main className="controller-layout">
      <h1>Contrôleur</h1>
      <p>Statut: {status}</p>
      <p>Ton ID: {joinedPlayerId ?? 'en attente...'}</p>
      <p className="log">{log || 'Utilise les boutons pour jouer.'}</p>

      <div className="controller-grid">
        <button
          className={`control ${left ? 'active' : ''}`}
          onPointerDown={() => setLeft(true)}
          onPointerUp={() => setLeft(false)}
          onPointerLeave={() => setLeft(false)}
        >
          Gauche
        </button>
        <button
          className={`control ${right ? 'active' : ''}`}
          onPointerDown={() => setRight(true)}
          onPointerUp={() => setRight(false)}
          onPointerLeave={() => setRight(false)}
        >
          Droite
        </button>
        <button
          className={`control jump ${jump ? 'active' : ''}`}
          onPointerDown={() => setJump(true)}
          onPointerUp={() => setJump(false)}
          onPointerLeave={() => setJump(false)}
        >
          Saut
        </button>
      </div>
    </main>
  )
}

export default App
