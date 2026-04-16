import type { PointerEvent, TouchEvent } from 'react'
import { getReadableBackground, getFrenchColor } from './colorUtils'

type GamepadPageProps = {
  name: string
  playerLabel: string
  playerTagState: 'TAG' | 'FREE'
  isFullscreen: boolean
  playerColor: string | null
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
  playerColor,
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
        <button
            className="fullscreen-button"
            onClick={onRequestFullscreen}
            aria-label="Passer en plein écran"
            title="Passer en plein écran"
            type="button"
          >
          <i className="fa-solid fa-expand"></i>
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
        {playerColor && <p><span style={{ color: playerColor,
        backgroundColor: getReadableBackground(playerColor),
        padding: "4px 10px",
        borderRadius: "8px",
        boxShadow: `0 4px 12px ${playerColor}80`,
        border: `1px solid ${playerColor}`,
        display: "inline-block"}}>Perso {getFrenchColor(playerColor)}</span></p>}
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
