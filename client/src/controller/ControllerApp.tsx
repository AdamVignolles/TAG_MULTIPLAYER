import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LobbyMessage, ServerMessage } from '../types/ws'
import { disableControllerTextSelection, disableControllerZoom } from './disableTextSelection.js'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
const WS_RELATIVE = `${window.location.origin.replace(/^http/, 'ws')}/ws`

async function requestFullscreenIfPossible(): Promise<boolean> {
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }

  try {
    if (document.fullscreenElement) return true
    if (root.requestFullscreen) {
      await root.requestFullscreen()
      return true
    }
    if (root.webkitRequestFullscreen) {
      await root.webkitRequestFullscreen()
      return true
    }
  } catch {
    return false
  }

  return false
}

export function ControllerApp() {
  const [status, setStatus] = useState('Deconnecte')
  const [nameInput, setNameInput] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerTagState, setPlayerTagState] = useState<'TAG' | 'FREE'>('FREE')
  const [, setLog] = useState('')
  const [lobby, setLobby] = useState<LobbyMessage | null>(null)

  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)
  const [jump, setJump] = useState(false)
  const [down, setDown] = useState(false)
  const [isPortrait, setIsPortrait] = useState(window.matchMedia('(orientation: portrait)').matches)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))

  const wsRef = useRef<WebSocket | null>(null)
  const playerIdRef = useRef<string | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)')

    const updateOrientation = (event: MediaQueryListEvent) => {
      setIsPortrait(event.matches)
    }

    const updateFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    setIsPortrait(media.matches)
    updateFullscreen()

    media.addEventListener('change', updateOrientation)

    document.addEventListener('fullscreenchange', updateFullscreen)

    return () => {
      media.removeEventListener('change', updateOrientation)
      document.removeEventListener('fullscreenchange', updateFullscreen)
    }
  }, [])

  useEffect(() => {
    const restoreSelection = disableControllerTextSelection()
    const restoreZoom = disableControllerZoom()

    return () => {
      restoreZoom()
      restoreSelection()
    }
  }, [])

  useEffect(() => {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>
    }
    if (!orientation.lock) return

    orientation.lock('landscape').catch(() => {
      // Certains navigateurs bloquent le verrouillage sans plein ecran.
    })
  }, [])

  useEffect(() => {
    if (isPortrait || isFullscreen) return

    requestFullscreenIfPossible().then((ok) => {
      if (ok) {
        setIsFullscreen(true)
      }
    })
  }, [isPortrait, isFullscreen])

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
                playerIdRef.current = data.playerId
                setPlayerTagState('FREE')
                return
              }

              if (data.type === 'state') {
                const currentPlayerId = playerIdRef.current
                if (!currentPlayerId) return

                const me = data.players.find((p) => p.id === currentPlayerId)
                if (!me) return

                const isTag = data.mode === 'zombie' ? Boolean(me.isTag) : data.tagPlayerId === me.id
                setPlayerTagState(isTag ? 'TAG' : 'FREE')
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
            playerIdRef.current = null
            setPlayerTagState('FREE')
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
      playerIdRef.current = null
    }
  }, [name])

  // Refs pour tracker les pointers actifs sur chaque bouton
  const activePointersRef = useRef<Map<string, Set<number>>>(new Map([
    ['left', new Set()],
    ['right', new Set()],
    ['jump', new Set()],
    ['down', new Set()]
  ]))

  // Gestion robuste des événements de relâchement au niveau du document
  useEffect(() => {
    function handlePointerUp(e: PointerEvent) {
      for (const pointers of activePointersRef.current.values()) {
        pointers.delete(e.pointerId)
      }
      
      // Mettre à jour l'état en fonction des pointers restants
      setLeft(activePointersRef.current.get('left')!.size > 0)
      setRight(activePointersRef.current.get('right')!.size > 0)
      setJump(activePointersRef.current.get('jump')!.size > 0)
      setDown(activePointersRef.current.get('down')!.size > 0)
    }

    function handleTouchEnd(e: TouchEvent) {
      // Pour les touches, on utilise l'identifier
      const activeTouches = new Set(Array.from(e.touches).map(t => t.identifier))
      
      for (const [button, pointers] of activePointersRef.current.entries()) {
        const newPointers = new Set([...pointers].filter(p => activeTouches.has(p)))
        activePointersRef.current.set(button, newPointers)
      }
      
      // Mettre à jour l'état
      setLeft(activePointersRef.current.get('left')!.size > 0)
      setRight(activePointersRef.current.get('right')!.size > 0)
      setJump(activePointersRef.current.get('jump')!.size > 0)
      setDown(activePointersRef.current.get('down')!.size > 0)
    }

    document.addEventListener('pointerup', handlePointerUp as EventListener)
    document.addEventListener('pointercancel', handlePointerUp as EventListener)
    document.addEventListener('touchend', handleTouchEnd)
    document.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      document.removeEventListener('pointerup', handlePointerUp as EventListener)
      document.removeEventListener('pointercancel', handlePointerUp as EventListener)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [])

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    wsRef.current.send(JSON.stringify({ type: 'input', left, right, jump, down }))
  }, [left, right, jump, down])

  function submitName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setName(trimmed)
  }

  const playerLabel = (name ?? '').slice(0, 2).toUpperCase() || playerId || '--'

  if (!name) {
    return (
      <main className={`controller-name-layout ${isPortrait ? 'controller-name-portrait' : ''}`}>
        <section className={`controller-name-card ${isPortrait ? 'controller-name-portrait' : ''}`}>
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
    if (isPortrait) {
      return (
        <main className="controller-layout controller-portrait-warning">
          <h1>Veuillez tourner votre telephone</h1>
          <p>Le controleur fonctionne en format paysage.</p>
        </main>
      )
    }

    return (
      <main className="controller-layout waiting controller-force-landscape">
        {!isFullscreen && (
          <button
            className="fullscreen-button"
            onClick={() => {
              requestFullscreenIfPossible().then((ok) => {
                if (ok) setIsFullscreen(true)
              })
            }}
          >
            Plein ecran
          </button>
        )}
        <h1>Salut {name}</h1>
        <p>Statut: {status}</p>
        <p>ID joueur: <span className="player-label-text">{playerLabel}</span></p>
        <p className="log">En attente du lancement de partie sur l'ecran principal.</p>
      </main>
    )
  }

  if (isPortrait) {
    return (
      <main className="controller-layout controller-portrait-warning">
        <h1>Veuillez tourner votre telephone</h1>
        <p>Le controleur fonctionne en format paysage.</p>
      </main>
    )
  }

  return (
    <main className="controller-layout controller-force-landscape">
      {!isFullscreen && (
        <button
          className="fullscreen-button"
          onClick={() => {
            requestFullscreenIfPossible().then((ok) => {
              if (ok) setIsFullscreen(true)
            })
          }}
        >
          Plein ecran
        </button>
      )}
      <div className="infosJoueur">
        <p>Joueur: {name}</p>
        <p>ID joueur: <span className="player-label-text">{playerLabel}</span></p>
        <p>
          <span className={`player-tag-state ${playerTagState === 'TAG' ? 'tag' : 'free'}`}>Tu es {playerTagState}</span>
        </p>
      </div>

      <div className="controller-grid">
        

        <div className="control-column horizontal-controls">
          <button
            className={`control ${left ? 'active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault()
              activePointersRef.current.get('left')!.add(e.pointerId)
              setLeft(true)
            }}
            onTouchStart={(e) => {
              e.preventDefault()
              if (e.changedTouches.length > 0) {
                for (const touch of Array.from(e.changedTouches)) {
                  activePointersRef.current.get('left')!.add(touch.identifier)
                }
                setLeft(true)
              }
            }}
          >
            Gauche
          </button>
          <button
            className={`control ${right ? 'active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault()
              activePointersRef.current.get('right')!.add(e.pointerId)
              setRight(true)
            }}
            onTouchStart={(e) => {
              e.preventDefault()
              if (e.changedTouches.length > 0) {
                for (const touch of Array.from(e.changedTouches)) {
                  activePointersRef.current.get('right')!.add(touch.identifier)
                }
                setRight(true)
              }
            }}
          >
            Droite
          </button>
        </div>

        <div className="control-column vertical-controls">
          <button
            className={`control jump ${jump ? 'active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault()
              activePointersRef.current.get('jump')!.add(e.pointerId)
              setJump(true)
            }}
            onTouchStart={(e) => {
              e.preventDefault()
              if (e.changedTouches.length > 0) {
                for (const touch of Array.from(e.changedTouches)) {
                  activePointersRef.current.get('jump')!.add(touch.identifier)
                }
                setJump(true)
              }
            }}
          >
            Haut
          </button>
          <button
            className={`control down ${down ? 'active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault()
              activePointersRef.current.get('down')!.add(e.pointerId)
              setDown(true)
            }}
            onTouchStart={(e) => {
              e.preventDefault()
              if (e.changedTouches.length > 0) {
                for (const touch of Array.from(e.changedTouches)) {
                  activePointersRef.current.get('down')!.add(touch.identifier)
                }
                setDown(true)
              }
            }}
          >
            Bas
          </button>
        </div>
      </div>
    </main>
  )
}
