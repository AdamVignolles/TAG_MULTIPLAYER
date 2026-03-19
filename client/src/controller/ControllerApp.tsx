import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LobbyMessage, ServerMessage } from '../types/ws'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
const WS_RELATIVE = `${window.location.origin.replace(/^http/, 'ws')}/ws`

export function ControllerApp() {
  const [status, setStatus] = useState('Deconnecte')
  const [nameInput, setNameInput] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const [lobby, setLobby] = useState<LobbyMessage | null>(null)

  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)
  const [jump, setJump] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!name) return

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

              if (data.type === 'joined' && data.playerId) {
                setPlayerId(data.playerId)
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

          ws.send(JSON.stringify({ type: 'join', role: 'controller', name }))
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
  }, [name])

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    wsRef.current.send(JSON.stringify({ type: 'input', left, right, jump }))
  }, [left, right, jump])

  function submitName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setName(trimmed)
  }

  if (!name) {
    return (
      <main className="controller-name-layout">
        <section className="controller-name-card">
          <h1>Choisis ton pseudo</h1>
          <p>Entre ton pseudo pour rejoindre la partie.</p>
          <form onSubmit={submitName}>
            <input
              className="name-input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Ton pseudo"
              maxLength={16}
            />
            <button type="submit">Rejoindre</button>
          </form>
        </section>
      </main>
    )
  }

  if (!lobby?.started) {
    return (
      <main className="controller-layout waiting">
        <h1>Salut {name}</h1>
        <p>Statut: {status}</p>
        <p>ID joueur: {playerId ?? 'en attente...'}</p>
        <p className="log">En attente du lancement de partie sur l'ecran principal.</p>
      </main>
    )
  }

  return (
    <main className="controller-layout">
      <h1>Controleur</h1>
      <p>Joueur: {name}</p>
      <p>ID: {playerId ?? 'en attente...'}</p>
      <p>Statut: {status}</p>
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
