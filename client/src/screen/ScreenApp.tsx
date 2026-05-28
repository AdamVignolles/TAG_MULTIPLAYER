import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { GameMode, LobbyMessage, ServerMessage, StateMessage, PlayerView, GameOverResult } from '../types/ws'
import { getSpriteUrl } from '../utils/characterManager'
import { getModeRules, getFrenchMode, getModeDescription, getGameStats, isMinPlayersReached, isAreaPlayerCountEven } from '../utils/rulesGameMode'

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
  if (!Number.isFinite(ms)) {
    return '∞'
  }

  const sec = Math.ceil(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Classique',
  zombie: 'Zombie',
  bomb: 'Bombe',
  area: 'Contrôle de zone',
}

const TEAM_COLORS = {
  green: '#00ff6a',
  blue: '#007bff',
}

const FLAG_LABELS = {
  boost_control: 'Contrôle +',
  slow_enemy: 'Ralentit',
  deny_capture: 'Blocage',
  tag_self: 'TAG',
}

const FLAG_POWER_CLASSES = {
  boost_control: 'area-flag--boost-control',
  slow_enemy: 'area-flag--slow-enemy',
  deny_capture: 'area-flag--deny-capture',
  tag_self: 'area-flag--tag-self',
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
  const [, setLog] = useState('')
  const [isPortrait, setIsPortrait] = useState(window.matchMedia('(orientation: portrait)').matches)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [lobby, setLobby] = useState<LobbyMessage>({
    type: 'lobby',
    mode: 'classic',
    modeLabel: MODE_LABEL.classic,
    connectedPlayers: 0,
    started: false,
  })
  const [gameState, setGameState] = useState<StateMessage | null>(null)
  const [gameTiles, setGameTiles] = useState<import('../types/ws').TileView[]>([])
  const [gameArena, setGameArena] = useState<{ width: number; height: number; floorY: number } | null>(null)
  const [gameOverResult, setGameOverResult] = useState<GameOverResult | null>(null)
  const [launchBurstUntil, setLaunchBurstUntil] = useState(0)
  const [playerDeaths, setPlayerDeaths] = useState<Set<string>>(new Set())
  const [auraTransfers, setAuraTransfers] = useState<Array<{ id: string; fromPlayerId: string; toPlayerId: string; duration: number; startTime: number }>>([])
  const wsRef = useRef<WebSocket | null>(null)
  const previousCountdownMsRef = useRef(0)
  const countdownMs = gameState?.countdownMs ?? 0
  const countdownSeconds = countdownMs > 0 ? Math.ceil(countdownMs / 1000) : 0
  const showLaunchBurst = Date.now() < launchBurstUntil
  const countdownLabel = countdownSeconds > 0 ? String(countdownSeconds) : (showLaunchBurst ? 'GO!' : '')

  const controllerUrl = useMemo(() => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

    if (isLocalhost && import.meta.env.VITE_LOCAL_IP) {
      // Si c'est local, utiliser l'IP du réseau local
      const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
      const port = window.location.port ? `:${window.location.port}` : ''
      return `${protocol}://${import.meta.env.VITE_LOCAL_IP}${port}`
    }

    // Sinon (Codespace, production, etc.), utiliser l'origin courant
    return `${window.location.origin}`
  }, [])

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

              if (data.type === 'game_started') {
                setGameTiles(data.tiles)
                setGameArena(data.arena)
                return
              }

              if (data.type === 'tag_event') {
                setLog(`${data.from} a tag ${data.to}`)
                return
              }

              if (data.type === 'player_death') {
                setPlayerDeaths(prev => new Set([...prev, data.playerId]))
                setTimeout(() => {
                  setPlayerDeaths(prev => {
                    const newSet = new Set(prev)
                    newSet.delete(data.playerId)
                    return newSet
                  })
                }, 800)
                return
              }

              if (data.type === 'aura_transfer') {
                const transferId = `${data.fromPlayerId}-${Date.now()}`
                setAuraTransfers(prev => [...prev, {
                  id: transferId,
                  fromPlayerId: data.fromPlayerId,
                  toPlayerId: data.toPlayerId,
                  duration: data.duration,
                  startTime: Date.now(),
                }])
                setTimeout(() => {
                  setAuraTransfers(prev => prev.filter(t => t.id !== transferId))
                }, data.duration + 100)
                return
              }

              if (data.type === 'game_over_result') {
                setGameOverResult(data.result)
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

  useEffect(() => {
    const previousCountdownMs = previousCountdownMsRef.current

    if (previousCountdownMs > 0 && countdownMs === 0) {
      setLaunchBurstUntil(Date.now() + 650)

      try {
        const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioContextCtor) {
          const audioContext = new AudioContextCtor()
          const oscillator = audioContext.createOscillator()
          const gainNode = audioContext.createGain()

          oscillator.type = 'triangle'
          oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
          oscillator.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.18)

          gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.9, audioContext.currentTime + 0.02)
          gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22)

          oscillator.connect(gainNode)
          gainNode.connect(audioContext.destination)
          oscillator.start()
          oscillator.stop(audioContext.currentTime + 0.24)

          oscillator.onended = () => {
            audioContext.close().catch(() => {
              // no-op
            })
          }
        }
      } catch {
        // Audio is optional; the visual burst still runs.
      }
    }

    previousCountdownMsRef.current = countdownMs
  }, [countdownMs])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 100)

    return () => {
      window.clearInterval(intervalId)
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
    setGameTiles([])
    setGameArena(null)
    setGameOverResult(null)
    setPlayerDeaths(new Set())
    setAuraTransfers([])

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_game' }))
    }

    setLog('Retour a l accueil...')
  }

  const areaFlagStyle: CSSProperties & Record<string, string> = {
    '--flag-x': `${gameState?.areaState?.flag?.x ?? 0}px`,
    '--flag-y': `${gameState?.areaState?.flag?.y ?? 0}px`,
    '--flag-w': `${gameState?.areaState?.flag?.w ?? 0}px`,
    '--flag-h': `${gameState?.areaState?.flag?.h ?? 0}px`,
    '--flag-gradient': gameState?.areaState?.flag?.power === 'boost_control'
      ? 'linear-gradient(135deg, #fff176, #ffb300)'
      : gameState?.areaState?.flag?.power === 'slow_enemy'
        ? 'linear-gradient(135deg, #7dd3fc, #2563eb)'
        : gameState?.areaState?.flag?.power === 'tag_self'
          ? 'linear-gradient(135deg, #fecaca, #dc2626)'
          : 'linear-gradient(135deg, #fca5a5, #ef4444)',
  }

  const areaFlag = gameState?.areaState?.flag ?? null
  const areaFlagOpacity = areaFlag
    ? Math.max(0.2, Math.min(1, (areaFlag.expiresAt - nowMs) / 2000))
    : 1

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
              <button
                className={lobby.mode === 'area' ? 'active' : ''}
                onClick={() => sendMode('area')}
              >
                {getFrenchMode('area')}
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
                  <span className="stat-label">{lobby.mode === 'area' ? 'Équipes équilibrées' : 'Nombre de TAG'}</span>
                  <strong className={lobby.mode === 'area' ? (isAreaPlayerCountEven(lobby.connectedPlayers) ? 'stat-reached' : 'stat-not-reached') : ''}>
                    {lobby.mode === 'area' ? (isAreaPlayerCountEven(lobby.connectedPlayers) ? '✓ Oui' : '✗ Non') : getGameStats(lobby.mode, lobby.connectedPlayers).tag}
                  </strong>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Joueurs minimum</span>
                  <strong className={isMinPlayersReached(lobby.connectedPlayers, getGameStats(lobby.mode, lobby.connectedPlayers).minPlayers) ? 'stat-reached' : 'stat-not-reached'}>
                    {`${lobby.connectedPlayers}/${getGameStats(lobby.mode, lobby.connectedPlayers).minPlayers}`}
                  </strong>
                </div>
              </div>
          </section>
        </div>
      </main>
    )
  }

  const arenaW = gameArena?.width ?? gameState?.arena.width ?? 900
  const arenaH = gameArena?.height ?? gameState?.arena.height ?? 500
  const playerCount = gameState?.players.length ?? lobby.connectedPlayers

  // Game over screen
  if (gameOverResult) {
    const modeLabel = MODE_LABEL[gameOverResult.mode]
    const isBombMode = gameOverResult.mode === 'bomb'
    const winnersList = gameOverResult.winnersList ?? gameOverResult.winners
    const losersList = gameOverResult.losersList
    const winnersCount = winnersList.length

    return (
      <main className="screen-layout game-screen">
        <header className="game-hud">
          <div className="hud-left">
            <button className="home-button" onClick={goHome} title="Retour a l accueil" aria-label="Retour a l accueil">
              <i className="fas fa-home" aria-hidden="true" />
            </button>
            <div>
              <strong className="hud-title">Tag Arena</strong>
              <p className="hud-subtitle">Partie terminée</p>
            </div>
          </div>

          <div className="hud-stats">
            <div className="hud-pill">
              <span className="hud-pill-label">Statut</span>
              <strong>{status}</strong>
            </div>
            <div className="hud-pill">
              <span className="hud-pill-label">Mode</span>
              <strong>{modeLabel}</strong>
            </div>
            {!isBombMode && (
              <div className="hud-pill">
                <span className="hud-pill-label">Temps</span>
                <strong>{formatTime(gameState?.remainingMs ?? 0)}</strong>
              </div>
            )}
            <div className="hud-pill">
              <span className="hud-pill-label">Joueurs</span>
              <strong>{playerCount}</strong>
            </div>
          </div>
        </header>

        <section className="game-over-screen">
          <div className="game-over-container">
            <h1 className="game-over-title">🎉 Partie Terminée! 🎉</h1>
            
            <div className="game-over-reason">
              <p>{gameOverResult.reason}</p>
            </div>

            <div className={`game-over-winners ${isBombMode ? 'bomb-mode' : 'multi-winners'}`}>
              <div className="winners-label">
                {isBombMode ? '👑 Gagnant 👑' : `🏆 Gagnants (${winnersCount}) 🏆`}
              </div>
              
              <div className="winners-list winners">
                {winnersList.map((winner) => (
                  <div key={winner.id} className="winner-card">
                    <div className="winner-name">{winner.name}</div>
                  </div>
                ))}
              </div>

              {losersList.length > 0 && (
                <div>
                  <div className="loser-label">💔 Perdants 💔</div>
                  <div className="winners-list losers">
                    {losersList.map((loser) => (
                      <div key={loser.id} className="winner-card loser">
                        <div className="loser-name">{loser.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button className="home-button-large" onClick={goHome}>
              Retour à l'accueil
            </button>
          </div>
        </section>
      </main>
    )
  }

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
          {lobby.mode !== 'bomb' && (
            <div className="hud-pill">
              <span className="hud-pill-label">Temps</span>
              <strong>{formatTime(gameState?.remainingMs ?? 0)}</strong>
            </div>
          )}
          <div className="hud-pill">
            <span className="hud-pill-label">Joueurs</span>
            <strong>{playerCount}</strong>
          </div>
          {lobby.mode === 'area' && gameState?.areaScores && (
            <div className="hud-pill area-score-pill">
              <span className="hud-pill-label">Scores</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {Object.entries(gameState.areaScores)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 2)
                  .map(([id, score]) => {
                    const color = TEAM_COLORS[id as keyof typeof TEAM_COLORS] ?? '#fff'
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 12, height: 12, background: color, borderRadius: 3 }} />
                        <strong style={{ fontSize: 12 }}>{Math.floor(score)}</strong>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </header>

      <section className={`arena mode-${lobby.mode}`} style={{ width: `${arenaW}px`, height: `${arenaH}px` }}>
        <div className="arena-gradient" aria-hidden="true" />
        <div className="arena-grid" aria-hidden="true" />
        <div className="arena-noise" aria-hidden="true" />

        {gameTiles.map((tile) => {
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

        {(gameState?.players ?? [])
          .filter(player => !(gameState?.mode === 'bomb' && player.isEliminated))
          .map((player) => {
          const isTag = gameState?.mode === 'zombie'
            ? player.isTag
            : gameState?.mode === 'bomb'
              ? player.isTag
              : gameState?.mode === 'area'
                ? player.areaTag
                : gameState?.tagPlayerId === player.id
          const isFrozen = gameState?.mode === 'area' ? Boolean(player.areaFrozen) : false
          const spriteSize = 32
          const frameIndex = getAnimationFrame(player)
          const backgroundYOffset = frameIndex * spriteSize
          const playerLabel = (player.name ?? '').slice(0, 2).toUpperCase() || player.id || '--'
          const teamColor = player.areaTeam ? TEAM_COLORS[player.areaTeam] : undefined

          return (
            <div key={player.id} style={{ position: 'absolute', left: `${player.x}px`, top: `${player.y}px`, transform: 'translate(-50%, -50%)', width: 0, height: 0 }}>
              <div
                className={`player ${isTag ? 'tag' : ''} ${isFrozen ? 'frozen' : ''}`}
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
                  outline: teamColor ? `2px solid ${teamColor}` : undefined,
                  border: teamColor ? `2px solid ${teamColor}` : undefined
                }}
                title={player.name}
              >
                <div className="player-label">
                  {playerLabel}
                </div>
                {isFrozen && (
                  <div className="player-state-badge">
                    IMMOBILE
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Area zones (visualisation) */}
        {gameState?.areaState?.zones.map((zone) => {
          const controllingTeam = zone.controllingTeam
          const color = controllingTeam ? TEAM_COLORS[controllingTeam] : 'rgb(246, 255, 114)'
          const score = controllingTeam ? (gameState.areaScores?.[controllingTeam] ?? 0) : 0
          const ratio = Math.min(1, Math.abs(zone.control) / 100)
          
          // Determine progression color based on which team is capturing
          const progressionColor = zone.control > 0 ? TEAM_COLORS.green : zone.control < 0 ? TEAM_COLORS.blue : '#888888'
          
          // Calculate progression for each side: bottom -> left -> top -> right
          const perimeter = 2 * (zone.w + zone.h)
          const progressionPixels = ratio * perimeter
          
          // Bottom: 0 to zone.w (right to left)
          const bottomFilled = Math.min(Math.max(progressionPixels, 0), zone.w)
          
          // Left: zone.w to zone.w + zone.h (bottom to top)
          const leftFilled = Math.min(Math.max(progressionPixels - zone.w, 0), zone.h)
          
          // Top: zone.w + zone.h to 2*zone.w + zone.h (left to right)
          const topFilled = Math.min(Math.max(progressionPixels - zone.w - zone.h, 0), zone.w)
          
          // Right: 2*zone.w + zone.h to 2*zone.w + 2*zone.h (top to bottom)
          const rightFilled = Math.min(Math.max(progressionPixels - 2*zone.w - zone.h, 0), zone.h)

          return (
            <div
              key={zone.id}
              className={`area-zone ${controllingTeam ? 'controlled' : 'neutral'}`}
              style={{
                position: 'absolute',
                left: `${zone.x}px`,
                top: `${zone.y}px`,
                width: `${zone.w}px`,
                height: `${zone.h}px`,
                border: `3px solid ${controllingTeam ? color : '#ff4d4d'}`,
                background: controllingTeam ? `${color}33` : 'transparent',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '6px',
                boxSizing: 'border-box',
                pointerEvents: 'none',
                transition: 'background 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
                overflow: 'visible',
              }}
            >
              <div style={{ color: '#ffffff', fontWeight: 700, textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}>{zone.id}</div>
              <div style={{ color: '#fff', fontSize: 12, textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)' }}>{controllingTeam ? `${Math.floor(score)}` : ''}</div>
              
              {/* Bottom side progression (right to left) */}
              <div
                style={{
                  position: 'absolute',
                  right: '0',
                  bottom: '-6px',
                  width: `${bottomFilled}px`,
                  height: '6px',
                  background: progressionColor,
                  boxShadow: `0 0 16px ${progressionColor}, 0 0 24px ${progressionColor}66, inset 0 0 12px ${progressionColor}`,
                  transition: 'width 100ms ease',
                  pointerEvents: 'none',
                }}
              />
              
              {/* Left side progression (bottom to top) */}
              <div
                style={{
                  position: 'absolute',
                  left: '-6px',
                  bottom: '0',
                  width: '6px',
                  height: `${leftFilled}px`,
                  background: progressionColor,
                  boxShadow: `0 0 16px ${progressionColor}, 0 0 24px ${progressionColor}66, inset 0 0 12px ${progressionColor}`,
                  transition: 'height 100ms ease',
                  pointerEvents: 'none',
                }}
              />
              
              {/* Top side progression (left to right) */}
              <div
                style={{
                  position: 'absolute',
                  left: '0',
                  top: '-6px',
                  width: `${topFilled}px`,
                  height: '6px',
                  background: progressionColor,
                  boxShadow: `0 0 16px ${progressionColor}, 0 0 24px ${progressionColor}66, inset 0 0 12px ${progressionColor}`,
                  transition: 'width 100ms ease',
                  pointerEvents: 'none',
                }}
              />
              
              {/* Right side progression (top to bottom) */}
              <div
                style={{
                  position: 'absolute',
                  right: '-6px',
                  top: '0',
                  width: '6px',
                  height: `${rightFilled}px`,
                  background: progressionColor,
                  boxShadow: `0 0 16px ${progressionColor}, 0 0 24px ${progressionColor}66, inset 0 0 12px ${progressionColor}`,
                  transition: 'height 100ms ease',
                  pointerEvents: 'none',
                }}
              />
            </div>
          )
        })}

        {gameState?.areaState?.flag && (
          <div
            className="area-flag-shell"
            style={{
              position: 'absolute',
              left: `${gameState.areaState.flag.x}px`,
              top: `${gameState.areaState.flag.y}px`,
              transform: 'translate(-50%, -50%)',
              opacity: areaFlagOpacity,
            }}
          >
            <span className="area-flag-label">{FLAG_LABELS[gameState.areaState.flag.power]}</span>
            <div
              className={`area-flag ${FLAG_POWER_CLASSES[gameState.areaState.flag.power]}`}
              style={areaFlagStyle}
            />
          </div>
        )}

        {/* Death animations */}
        {(gameState?.players ?? [])
          .filter(player => playerDeaths.has(player.id))
          .map((player) => {
            return (
              <div
                key={`death-${player.id}`}
                style={{
                  position: 'absolute',
                  left: `${player.x}px`,
                  top: `${player.y}px`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="death-pulse"
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    border: '3px solid #ff4444',
                    animation: 'deathPulse 0.8s ease-out forwards',
                    boxShadow: '0 0 20px rgba(255, 68, 68, 0.8)',
                  }}
                />
              </div>
            )
          })}

        {/* Aura transfer animations */}
        {auraTransfers.map((transfer) => {
          const fromPlayer = gameState?.players.find(p => p.id === transfer.fromPlayerId)
          const toPlayer = gameState?.players.find(p => p.id === transfer.toPlayerId)
          
          if (!fromPlayer || !toPlayer) return null
          
          const elapsed = Date.now() - transfer.startTime
          const progress = Math.min(elapsed / transfer.duration, 1)
          
          const currentX = fromPlayer.x + (toPlayer.x - fromPlayer.x) * progress
          const currentY = fromPlayer.y + (toPlayer.y - fromPlayer.y) * progress
          
          return (
            <div
              key={transfer.id}
              style={{
                position: 'absolute',
                left: `${currentX}px`,
                top: `${currentY}px`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <div
                className="aura-orb"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 30% 30%, #ffff00, #ff8800)',
                  boxShadow: '0 0 30px rgba(255, 200, 0, 0.9), inset -2px -2px 5px rgba(0, 0, 0, 0.3)',
                  animation: 'auraFloat 0.5s ease-in-out infinite',
                  opacity: Math.sin(progress * Math.PI) * 0.8 + 0.2,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 200, 0, 0.6)',
                  left: '-20px',
                  top: '-20px',
                  animation: 'auraRing 0.8s linear infinite',
                }}
              />
            </div>
          )
        })}

        {countdownLabel && (
          <div className={`start-countdown-overlay ${countdownSeconds === 0 ? 'go-state' : ''}`} aria-live="polite" aria-atomic="true">
            <div className="start-countdown-number">{countdownLabel}</div>
            <div className="start-countdown-caption">Préparez-vous</div>
          </div>
        )}
      </section>
    </main>
  )
}
