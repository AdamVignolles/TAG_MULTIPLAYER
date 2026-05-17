import { getReadableBackground, getReadableColor, getFrenchColor } from './colorUtils'
import { isIPhone } from './deviceDetection'

type WaitingLaunchPageProps = {
  name: string
  status: string
  playerLabel: string
  playerColor: string | null
  isFullscreen: boolean
  onRequestFullscreen: () => void
  onChangePseudo: () => void
}

export function WaitingLaunchPage({
  name,
  status,
  playerLabel,
  playerColor,
  isFullscreen,
  onRequestFullscreen,
  onChangePseudo,
}: WaitingLaunchPageProps) {
  const isPhone = isIPhone()

  return (
    <main className="controller-layout waiting controller-force-landscape" style={isFullscreen ? { minHeight: '100vh' } : {}}>
      {!isFullscreen && !isPhone && (
        <>         
          <button
            className="fullscreen-button"
            onClick={onRequestFullscreen}
            aria-label="Passer en plein écran"
            title="Passer en plein écran"
            type="button"
          >
          <i className="fa-solid fa-expand"></i>
          </button>
        </>
      )}

      <h1>
        {name}
        <button
          className="change-pseudo-button"
          onClick={onChangePseudo}
          aria-label="Changer le nom"
          title="Changer le nom"
          type="button"
        >
          <i className="fa-solid fa-pen"></i>
        </button>
      </h1>
      <p>Statut: {status}</p>
      <p>
        ID joueur: <span className="player-label-text">{playerLabel}</span>
      </p>
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
    </main>
  )
}
