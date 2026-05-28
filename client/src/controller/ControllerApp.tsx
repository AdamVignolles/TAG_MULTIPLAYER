import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LobbyMessage, ServerMessage } from '../types/ws'
import { getRandomCharacter } from '../utils/colorHelper'
import { disableControllerTextSelection, disableControllerZoom } from './disableTextSelection.js'
import { ConnectionPage } from './ConnectionPage'
import { PortraitWarningPage } from './PortraitWarningPage'
import { WaitingLaunchPage } from './WaitingLaunchPage'
import { GamepadPage } from './GamepadPage'
import { vibrateGameStart, vibrateGameOver, vibrateBecameTag, vibrateBecameFree, vibrateEliminated, flushVibration } from './vibration'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
const WS_RELATIVE = `${window.location.origin.replace(/^http/, 'ws')}/ws`

const CONTROLLER_NAME_STORAGE_KEY = 'tag.controller.name'
const CONTROLLER_SESSION_STORAGE_KEY = 'tag.controller.sessionId'

function readStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures and keep the controller usable.
  }
}

function createControllerSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }

  return `controller-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

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
  const [nameInput, setNameInput] = useState(() => readStoredValue(CONTROLLER_NAME_STORAGE_KEY) ?? '')
  const [name, setName] = useState<string | null>(() => readStoredValue(CONTROLLER_NAME_STORAGE_KEY)?.trim() || null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerTagState, setPlayerTagState] = useState<'TAG' | 'FREE' | 'TEAM_GREEN' | 'TEAM_BLUE'>('FREE')
  const [playerColor, setPlayerColor] = useState<string | null>(null)
  const [bombTimer, setBombTimer] = useState<number | null>(null)
  const [gameState, setGameState] = useState<{ countdownMs?: number } | null>(null)
  const [isEliminated, setIsEliminated] = useState(false)

  const [, setLog] = useState('')
  const [lobby, setLobby] = useState<LobbyMessage | null>(null)

  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)
  const [jump, setJump] = useState(false)
  const [down, setDown] = useState(false)
  const [isPortrait, setIsPortrait] = useState(window.matchMedia('(orientation: portrait)').matches)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))
  const [gameOver, setGameOver] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const playerIdRef = useRef<string | null>(null)
  const controllerSessionIdRef = useRef(readStoredValue(CONTROLLER_SESSION_STORAGE_KEY) ?? createControllerSessionId())
  const sentColorForPlayerIdRef = useRef<string | null>(null)
  const prevTagStateRef = useRef<'TAG' | 'FREE' | 'TEAM_GREEN' | 'TEAM_BLUE'>('FREE')
  const prevEliminatedRef = useRef(false)

  useEffect(() => {
    writeStoredValue(CONTROLLER_SESSION_STORAGE_KEY, controllerSessionIdRef.current)
  }, [])

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

  // Flush queued vibrations on any user touch/pointer interaction
  useEffect(() => {
    const handler = () => flushVibration()
    document.addEventListener('pointerdown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('pointerdown', handler)
      document.removeEventListener('touchstart', handler)
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
    })
  }, [])

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
                setGameState(data)
                const currentPlayerId = playerIdRef.current
                if (!currentPlayerId) return

                const me = data.players.find((p) => p.id === currentPlayerId)
                if (!me) return

                let newTagState: 'TAG' | 'FREE' | 'TEAM_GREEN' | 'TEAM_BLUE'
                if (data.mode === 'area') {
                  newTagState = me.areaTeam === 'green' ? 'TEAM_GREEN' : me.areaTeam === 'blue' ? 'TEAM_BLUE' : 'FREE'
                } else {
                  const isTag = data.mode === 'zombie' ? Boolean(me.isTag) : (data.mode === 'bomb' ? Boolean(me.isTag) : data.tagPlayerId === me.id)
                  newTagState = isTag ? 'TAG' : 'FREE'
                }
                if (prevTagStateRef.current !== newTagState) {
                  if (newTagState === 'TAG') vibrateBecameTag()
                  else if (newTagState === 'FREE') vibrateBecameFree()
                  prevTagStateRef.current = newTagState
                }
                setPlayerTagState(newTagState)
                setPlayerColor(me.character ?? null)
                setBombTimer(data.mode === 'bomb' && me.bombCounter !== undefined ? me.bombCounter : null)

                const nowEliminated = Boolean(me.isEliminated)
                if (nowEliminated && !prevEliminatedRef.current) {
                  vibrateEliminated()
                }
                prevEliminatedRef.current = nowEliminated
                setIsEliminated(nowEliminated)

                return
              }

              if (data.type === 'lobby') {
                setLobby(data)
                return
              }

              if (data.type === 'game_started') {
                vibrateGameStart()
                prevTagStateRef.current = 'FREE'
                prevEliminatedRef.current = false
                return
              }

              if (data.type === 'tag_event') {
                setLog(`${data.from} a tag ${data.to}`)
                return
              }

              if (data.type === 'game_over_result') {
                vibrateGameOver()
                setBombTimer(null)
                setGameState(null)
                prevTagStateRef.current = 'FREE'
                prevEliminatedRef.current = false
                // If this player is in the winner list, show waiting page
                if (data.result.winnersList.some((winner) => winner.id === playerIdRef.current)) {
                  setGameOver(true)
                }
                return
              }

              if (data.type === 'game_over' || data.type === 'error') {
                setLog(data.message)
                setBombTimer(null)
                setGameState(null)
                if (data.type === 'game_over') {
                  vibrateGameOver()
                  prevTagStateRef.current = 'FREE'
                  prevEliminatedRef.current = false
                  setGameOver(true)
                }
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
            setPlayerColor(null)
            setBombTimer(null)
            setGameState(null)
          }

          ws.send(JSON.stringify({
            type: 'join',
            role: 'controller',
            name,
            sessionId: controllerSessionIdRef.current,
          }))
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

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (!playerId) return
    if (lobby?.started) return

    // Envoyer couleur aléatoire si on n'l'a pas déjà fait pour ce playerId
    if (sentColorForPlayerIdRef.current !== playerId) {
      const randomColor = getRandomCharacter()
      wsRef.current.send(JSON.stringify({ type: 'set_character', character: randomColor }))
      setPlayerColor(randomColor)
      sentColorForPlayerIdRef.current = playerId
    }
  }, [playerId, lobby?.started])

  function submitName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return
    writeStoredValue(CONTROLLER_NAME_STORAGE_KEY, trimmed)
    writeStoredValue(CONTROLLER_SESSION_STORAGE_KEY, controllerSessionIdRef.current)
    setName(trimmed)
  }

  function requestFullscreen() {
    requestFullscreenIfPossible().then((ok) => {
      if (ok) setIsFullscreen(true)
    })
  }

  function handleChangePseudo() {
    setNameInput(name ?? '')
    setName(null)
    setLobby(null)
    setStatus('Deconnecte')
    setPlayerId(null)
    playerIdRef.current = null
    setPlayerTagState('FREE')
    setPlayerColor(null)
    sentColorForPlayerIdRef.current = null
    setGameOver(false)
    setGameState(null)
  }

  const playerLabel = (name ?? '').slice(0, 2).toUpperCase() || playerId || '--'

  if (!name) {
    return (
      <ConnectionPage
        isPortrait={isPortrait}
        nameInput={nameInput}
        onNameInputChange={setNameInput}
        onSubmitName={submitName}
      />
    )
  }

  const isCountdown = (gameState?.countdownMs ?? 0) > 0
  const controlsLocked = !gameState || isCountdown || isEliminated

  let lockMessage: string | null = null

  if (!gameState) {
    lockMessage = 'En attente...'
  } 
  else if (playerTagState === 'TAG' && isCountdown) {
  lockMessage = 'Vous êtes TAG, départ imminent'
  }
  else if (playerTagState === 'FREE' && isCountdown) {
    lockMessage = 'Vous êtes FREE, départ imminent'
  }
  else if (isEliminated) {
    lockMessage = 'Compteur vide, vous êtes éliminé 💀'
  }

  if (!lobby?.started || gameOver) {
    if (isPortrait) {
      return <PortraitWarningPage showFullscreenHint />
    }

    return (
      <WaitingLaunchPage
        name={name}
        status={status}
        playerLabel={playerLabel}
        playerColor={playerColor}
        isFullscreen={isFullscreen}
        onRequestFullscreen={requestFullscreen}
        onChangePseudo={handleChangePseudo}
      />
    )
  }

  if (isPortrait) {
    return <PortraitWarningPage showFullscreenHint />
  }

  return (
    <GamepadPage
      name={name}
      playerLabel={playerLabel}
      playerTagState={playerTagState}
      isFullscreen={isFullscreen}
      playerColor={playerColor}
      bombTimer={bombTimer}
      controlsLocked={controlsLocked}
      lockMessage={lockMessage}
      onRequestFullscreen={requestFullscreen}
      left={left}
      right={right}
      jump={jump}
      down={down}
      onLeftPointerDown={(e) => {
        if (controlsLocked) return
        e.preventDefault()
        activePointersRef.current.get('left')!.add(e.pointerId)
        setLeft(true)
      }}
      onLeftTouchStart={(e) => {
        if (controlsLocked) return
        e.preventDefault()
        if (e.changedTouches.length > 0) {
          for (const touch of Array.from(e.changedTouches)) {
            activePointersRef.current.get('left')!.add(touch.identifier)
          }
          setLeft(true)
        }
      }}
      onRightPointerDown={(e) => {
        if (controlsLocked) return
        e.preventDefault()
        activePointersRef.current.get('right')!.add(e.pointerId)
        setRight(true)
      }}
      onRightTouchStart={(e) => {
        if (controlsLocked) return
        e.preventDefault()
        if (e.changedTouches.length > 0) {
          for (const touch of Array.from(e.changedTouches)) {
            activePointersRef.current.get('right')!.add(touch.identifier)
          }
          setRight(true)
        }
      }}
      onJumpPointerDown={(e) => {
        if (controlsLocked) return
        e.preventDefault()
        activePointersRef.current.get('jump')!.add(e.pointerId)
        setJump(true)
      }}
      onJumpTouchStart={(e) => {
        if (controlsLocked) return
        e.preventDefault()
        if (e.changedTouches.length > 0) {
          for (const touch of Array.from(e.changedTouches)) {
            activePointersRef.current.get('jump')!.add(touch.identifier)
          }
          setJump(true)
        }
      }}
      onDownPointerDown={(e) => {
        if (controlsLocked) return
        e.preventDefault()
        activePointersRef.current.get('down')!.add(e.pointerId)
        setDown(true)
      }}
      onDownTouchStart={(e) => {
        if (controlsLocked) return
        e.preventDefault()
        if (e.changedTouches.length > 0) {
          for (const touch of Array.from(e.changedTouches)) {
            activePointersRef.current.get('down')!.add(touch.identifier)
          }
          setDown(true)
        }
      }}
      onProximityTrigger={(buttonKey, touchId) => {
        activePointersRef.current.get(buttonKey)!.add(touchId)
        if (buttonKey === 'left') setLeft(true)
        else if (buttonKey === 'right') setRight(true)
        else if (buttonKey === 'jump') setJump(true)
        else if (buttonKey === 'down') setDown(true)
      }}
    />
  )
}
