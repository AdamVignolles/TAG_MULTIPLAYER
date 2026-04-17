import type { PointerEvent, TouchEvent } from 'react'
import { useRef, useEffect } from 'react'
import { getReadableBackground, getReadableColor, getFrenchColor } from './colorUtils'
import type { ButtonKey } from './proximityDetection'
import { getButtonRects, getClosestButtonWithFallback } from './proximityDetection'

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
  onProximityTrigger?: (buttonKey: ButtonKey) => void
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
  onProximityTrigger,
}: GamepadPageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRectsRef = useRef<ReturnType<typeof getButtonRects>>([])

  // Mettre à jour les rectangles des boutons quand le composant change
  useEffect(() => {
    function updateButtonRects() {
      if (containerRef.current) {
        buttonRectsRef.current = getButtonRects(containerRef.current)
      }
    }

    updateButtonRects()
    window.addEventListener('resize', updateButtonRects)
    window.addEventListener('orientationchange', updateButtonRects)

    return () => {
      window.removeEventListener('resize', updateButtonRects)
      window.removeEventListener('orientationchange', updateButtonRects)
    }
  }, [])

  const handleProximityTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!onProximityTrigger || buttonRectsRef.current.length === 0) return

    for (const touch of Array.from(e.changedTouches)) {
      const closestButton = getClosestButtonWithFallback(
        touch.clientX,
        touch.clientY,
        buttonRectsRef.current
      )

      if (closestButton) {
        onProximityTrigger(closestButton)
      }
    }
  }
  return (
    <main className="controller-layout gamepad" ref={containerRef} onTouchStart={handleProximityTouchStart}>

      <div className="top-buttons">
        <div className="top-buttons-player">
          <div className="hud-label">Joueur</div> 
          <div className="hud-value">{name}</div>
          <div className="hud-sep"></div>
          <div className="hud-label">ID</div>
          {playerColor && <span style= {{ color: getReadableColor(playerColor), 
          padding: '4px 12px',
          borderRadius: '15px',
          border: '1.5px solid ' + getReadableColor(playerColor),
          backgroundColor: getReadableBackground(playerColor),
          fontSize: '16px',
          fontWeight: 700,
          letterSpacing: '0.04em'
          }}>{playerLabel}</span>}
      </div>
        
        <div className={`player-tag-state ${playerTagState === 'TAG' ? 'tag' : 'free'}`}>
            <div className={`status-dot ${playerTagState === 'TAG' ? 'tag' : 'free'}`}></div>
            {playerTagState}
        </div>
        
        {playerColor && <p><span style=
        {{ color: getReadableColor(playerColor), 
          padding: '4px 12px',
          borderRadius: '15px',
          border: '1.5px solid ' + getReadableColor(playerColor),
          backgroundColor: getReadableBackground(playerColor),
          fontSize: '16px',
          fontWeight: 700,
          letterSpacing: '0.04em'
          }}>Perso {getFrenchColor(playerColor)}</span></p>}

          {!isFullscreen && (
        <button
            className="fullscreen-button"
            onClick={onRequestFullscreen}
            aria-label="Passer en plein écran"
            title="Passer en plein écran"
            type="button"
          >
          <i className="fa-solid fa-expand"></i>
          </button>)}
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
