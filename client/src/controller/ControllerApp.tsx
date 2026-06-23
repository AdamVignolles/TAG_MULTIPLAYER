import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LobbyMessage, ServerMessage, StateMessage } from '../types/ws'
import { getRandomCharacter } from '../utils/colorHelper'
import { disableControllerTextSelection, disableControllerZoom } from './disableTextSelection.js'
import { ConnectionPage } from './ConnectionPage'
import { PortraitWarningPage } from './PortraitWarningPage'
import { WaitingLaunchPage } from './WaitingLaunchPage'
import { GamepadPage } from './GamepadPage'
import { vibrateGameStart, vibrateGameOver, vibrateBecameTag, vibrateBecameFree, vibrateEliminated, flushVibration } from './vibration'
import { clearControllerSounds, flushControllerSounds, playBecameFreeSound, playBecameTagSound } from './controllerSounds'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
const WS_RELATIVE = `${window.location.origin.replace(/^http/, 'ws')}/ws`

const CONTROLLER_NAME_STORAGE_KEY = 'tag.controller.name'
const CONTROLLER_SESSION_STORAGE_KEY = 'tag.controller.sessionId'

function getRoomCodeFromUrl(): string | null {
  const path = window.location.pathname
  // Match /XXXX (4 letters) at the end of the path
  const match = path.match(/\/([A-Za-z]{4})$/)
  return match ? match[1].toUpperCase() : null
}

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

const colorCycle = ['blue', 'green', 'purple', 'red', 'yellow'] as const

function getNextColor(currentColor: string | null): string {
  if (!currentColor) return 'blue'
  const currentIndex = colorCycle.indexOf(currentColor as typeof colorCycle[number])
  if (currentIndex === -1) return 'blue'
  return colorCycle[(currentIndex + 1) % colorCycle.length]
}

export function ControllerApp() {
  const [status, setStatus] = useState('Deconnecte')
  const [nameInput, setNameInput] = useState(() => readStoredValue(CONTROLLER_NAME_STORAGE_KEY) ?? '')
  const [name, setName] = useState<string | null>(() => readStoredValue(CONTROLLER_NAME_STORAGE_KEY)?.trim() || null)
  const [roomCode, setRoomCode] = useState<string | null>(() => getRoomCodeFromUrl())
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [needsRoomCode, setNeedsRoomCode] = useState(!getRoomCodeFromUrl())
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerTagState, setPlayerTagState] = useState<'TAG' | 'FREE' | 'TEAM_GREEN' | 'TEAM_BLUE'>('FREE')
  const [playerColor, setPlayerColor] = useState<string | null>(null)
  const [bombTimer, setBombTimer] = useState<number | null>(null)
  const [gameState, setGameState] = useState<StateMessage | null>(null)
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
  const [selectedTeam, setSelectedTeam] = useState<'green' | 'blue' | null>(null)

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

    const updateOrientation = () => {
      setIsPortrait(media.matches)
    }

    const updateFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    updateOrientation()
    updateFullscreen()

    media.addEventListener('change', updateOrientation)
    window.addEventListener('resize', updateOrientation)
    window.addEventListener('orientationchange', updateOrientation)

    document.addEventListener('fullscreenchange', updateFullscreen)

    return () => {
      media.removeEventListener('change', updateOrientation)
      window.removeEventListener('resize', updateOrientation)
      window.removeEventListener('orientationchange', updateOrientation)
      document.removeEventListener('fullscreenchange', updateFullscreen)
    }
  }, [])

  // Flush queued vibrations on any user touch/pointer interaction
  useEffect(() => {
    const handler = () => {
      flushVibration()
      flushControllerSounds()
    }
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
    if (!roomCode) return

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
                clearControllerSounds()
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
                  if (newTagState === 'TAG') {
                    vibrateBecameTag()
                    playBecameTagSound()
                  } else if (newTagState === 'FREE') {
                    vibrateBecameFree()
                    playBecameFreeSound()
                  }
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
                clearControllerSounds()
                setGameOver(false)
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
                clearControllerSounds()
                // Clear active pointers to reset controller state
                activePointersRef.current.forEach((pointers) => pointers.clear())
                setLeft(false)
                setRight(false)
                setJump(false)
                setDown(false)
                // If this player is in the winner list, show waiting page
                if (data.result.winnersList.some((winner) => winner.id === playerIdRef.current)) {
                  setGameOver(true)
                }
                return
              }

              if (data.type === 'game_over' || data.type === 'error') {
                setLog(data.message)
                if (data.type === 'error' && data.message.includes('session invalide')) {
                  // Invalid room code - show room code input
                  setRoomCode(null)
                  setNeedsRoomCode(true)
                  setRoomCodeInput('')
                  return
                }
                setBombTimer(null)
                setGameState(null)
                if (data.type === 'game_over') {
                  vibrateGameOver()
                  prevTagStateRef.current = 'FREE'
                  prevEliminatedRef.current = false
                  clearControllerSounds()
                   // Clear active pointers to reset controller state
                   activePointersRef.current.forEach((pointers) => pointers.clear())
                   setLeft(false)
                   setRight(false)
                   setJump(false)
                   setDown(false)
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
            setGameOver(false)
            clearControllerSounds()
            activePointersRef.current.forEach((pointers) => pointers.clear())
            setLeft(false)
            setRight(false)
            setJump(false)
            setDown(false)
          }

          ws.send(JSON.stringify({
            type: 'join',
            role: 'controller',
            name,
            sessionId: controllerSessionIdRef.current,
            roomCode,
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
      clearControllerSounds()
    }
  }, [name, roomCode])

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
    // If no room code, keep needsRoomCode true so the room code input appears
    if (roomCode) {
      setNeedsRoomCode(false)
    }
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
    // Clear active pointers and control states
    activePointersRef.current.forEach((pointers) => pointers.clear())
    setLeft(false)
    setRight(false)
    setJump(false)
    setDown(false)
  }

  function handleChangeRoomCode() {
    setRoomCode(null)
    setNeedsRoomCode(true)
    setRoomCodeInput('')
    setLobby(null)
    setStatus('Deconnecte')
    setPlayerId(null)
    playerIdRef.current = null
    setPlayerTagState('FREE')
    setPlayerColor(null)
    sentColorForPlayerIdRef.current = null
    setGameOver(false)
    setGameState(null)
    activePointersRef.current.forEach((pointers) => pointers.clear())
    setLeft(false)
    setRight(false)
    setJump(false)
    setDown(false)
    try {
      wsRef.current?.close()
    } catch {
      // no-op
    }
    wsRef.current = null
  }

  function submitRoomCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = roomCodeInput.trim().toUpperCase()
    if (trimmed.length !== 4) return
    setRoomCode(trimmed)
    setNeedsRoomCode(false)
  }

  function handleChangeColor() {
    const nextColor = getNextColor(playerColor)
    setPlayerColor(nextColor)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_character', character: nextColor }))
    }
  }

  const playerLabel = (name ?? '').slice(0, 2).toUpperCase() || playerId || '--'

  if (!name || needsRoomCode) {
    return (
      <ConnectionPage
        isPortrait={isPortrait}
        nameInput={nameInput}
        onNameInputChange={setNameInput}
        onSubmitName={submitName}
        showRoomCodeInput={needsRoomCode && !!name}
        roomCodeInput={roomCodeInput}
        onRoomCodeInputChange={setRoomCodeInput}
        onSubmitRoomCode={submitRoomCode}
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

    const handleSelectTeam = (team: 'green' | 'blue') => {
      setSelectedTeam(team)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'set_area_team', team }))
      }
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
        onChangeColor={handleChangeColor}
        onChangeRoomCode={handleChangeRoomCode}
        mode={lobby?.mode}
        gameState={gameState}
        selectedTeam={selectedTeam}
        onSelectTeam={handleSelectTeam}
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
