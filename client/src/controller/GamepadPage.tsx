import type { PointerEvent, TouchEvent } from 'react'

type GamepadPageProps = {
  name: string
  playerLabel: string
  playerTagState: 'TAG' | 'FREE'
  isFullscreen: boolean
  onRequestFullscreen: () => void
  left: boolean
  right: boolean
  jump: boolean
  down: boolean
  onLeftPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onLeftTouchStart: (event: TouchEvent<HTMLButtonElement>) => void
  onRightPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onRightTouchStart: (event: TouchEvent<HTMLButtonElement>) => void
  onJumpPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onJumpTouchStart: (event: TouchEvent<HTMLButtonElement>) => void
  onDownPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onDownTouchStart: (event: TouchEvent<HTMLButtonElement>) => void
}

export function GamepadPage({
  name,
  playerLabel,
  playerTagState,
  isFullscreen,
  onRequestFullscreen,
  left,
  right,
  jump,
  down,
  onLeftPointerDown,
  onLeftTouchStart,
  onRightPointerDown,
  onRightTouchStart,
  onJumpPointerDown,
  onJumpTouchStart,
  onDownPointerDown,
  onDownTouchStart,
}: GamepadPageProps) {
  return (
    <main className="controller-layout controller-force-landscape">
      {!isFullscreen && (
        <button className="fullscreen-button" onClick={onRequestFullscreen}>
          Plein ecran
        </button>
      )}
      <div className="infosJoueur">
        <p>Joueur: {name}</p>
        <p>
          ID joueur: <span className="player-label-text">{playerLabel}</span>
        </p>
        <p>
          <span className={`player-tag-state ${playerTagState === 'TAG' ? 'tag' : 'free'}`}>
            Tu es {playerTagState}
          </span>
        </p>
      </div>

      <div className="controller-grid">
        <div className="control-column horizontal-controls">
          <button
            className={`control ${left ? 'active' : ''}`}
            onPointerDown={onLeftPointerDown}
            onTouchStart={onLeftTouchStart}
          >
            Gauche
          </button>
          <button
            className={`control ${right ? 'active' : ''}`}
            onPointerDown={onRightPointerDown}
            onTouchStart={onRightTouchStart}
          >
            Droite
          </button>
        </div>

        <div className="control-column vertical-controls">
          <button
            className={`control jump ${jump ? 'active' : ''}`}
            onPointerDown={onJumpPointerDown}
            onTouchStart={onJumpTouchStart}
          >
            Haut
          </button>
          <button
            className={`control down ${down ? 'active' : ''}`}
            onPointerDown={onDownPointerDown}
            onTouchStart={onDownTouchStart}
          >
            Bas
          </button>
        </div>
      </div>
    </main>
  )
}
