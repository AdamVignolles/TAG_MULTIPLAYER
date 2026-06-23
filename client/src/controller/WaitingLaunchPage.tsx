import type { StateMessage } from '../types/ws'
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
  onChangeColor?: () => void
  onChangeRoomCode?: () => void
  mode?: string
  gameState?: StateMessage | null
  selectedTeam?: 'green' | 'blue' | null
  onSelectTeam?: (team: 'green' | 'blue') => void
}

export function WaitingLaunchPage({
  name,
  status,
  playerLabel,
  playerColor,
  isFullscreen,
  onRequestFullscreen,
  onChangePseudo,
  onChangeColor,
  onChangeRoomCode,
  mode,
  gameState,
  selectedTeam,
  onSelectTeam,
}: WaitingLaunchPageProps) {
  const isPhone = isIPhone()
  const isAreaMode = mode === 'area' && gameState?.areaTeamSelectionActive === true

  // Count players in each team
  const greenCount = gameState ? gameState.players.filter(p => p.areaTeam === 'green').length : 0
  const blueCount = gameState ? gameState.players.filter(p => p.areaTeam === 'blue').length : 0
  const totalPlayers = gameState ? gameState.players.length : 0
  const maxTeamSize = Math.ceil(totalPlayers / 2)

  const isGreenFull = greenCount >= maxTeamSize && greenCount > 0
  const isBlueFull = blueCount >= maxTeamSize && blueCount > 0

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
        {isAreaMode && onSelectTeam && (
          <>
            <button
              className={`team-button team-green ${selectedTeam === 'green' ? 'selected' : ''} ${isGreenFull ? 'disabled' : ''}`}
              onClick={() => !isGreenFull && onSelectTeam('green')}
              aria-label="Choisir équipe verte"
              title={isGreenFull ? 'Équipe verte pleine' : 'Choisir équipe verte'}
              type="button"
              disabled={isGreenFull}
            >
              <i className="fa-solid fa-users"></i> Vert {greenCount}/{maxTeamSize}
            </button>
            <button
              className={`team-button team-blue ${selectedTeam === 'blue' ? 'selected' : ''} ${isBlueFull ? 'disabled' : ''}`}
              onClick={() => !isBlueFull && onSelectTeam('blue')}
              aria-label="Choisir équipe bleue"
              title={isBlueFull ? 'Équipe bleue pleine' : 'Choisir équipe bleue'}
              type="button"
              disabled={isBlueFull}
            >
              <i className="fa-solid fa-users"></i> Bleu {blueCount}/{maxTeamSize}
            </button>
          </>
        )}
      </h1>
      <p>Statut: {status}</p>
      <p>
        ID joueur: <span className="player-label-text">{playerLabel}</span>
      </p>
              {playerColor && (
                <p>
                  <button
                    onClick={onChangeColor}
                    style={{
                      color: getReadableColor(playerColor),
                      padding: '4px 12px',
                      borderRadius: '15px',
                      border: '1.5px solid ' + getReadableColor(playerColor),
                      backgroundColor: getReadableBackground(playerColor),
                      fontSize: '16px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      background: getReadableBackground(playerColor),
                      display: 'inline-block'
                    }}
                    type="button"
                    aria-label={`Changer de couleur (actuellement ${getFrenchColor(playerColor)})`}
                    title="Cliquer pour changer de couleur"
                  >
                    Perso {getFrenchColor(playerColor)}
                  </button>
                </p>
              )}
              {onChangeRoomCode && (
                <p>
                  <button
                    onClick={onChangeRoomCode}
                    style={{
                      marginTop: '0.5rem',
                      background: 'transparent',
                      border: '1px solid #666',
                      color: '#ccc',
                      padding: '0.4rem 0.8rem',
                      cursor: 'pointer',
                      borderRadius: '0.5rem',
                      fontSize: '14px',
                    }}
                    type="button"
                    aria-label="Changer de partie"
                    title="Changer de partie"
                  >
                    <i className="fa-solid fa-right-from-bracket"></i> Changer de partie
                  </button>
                </p>
              )}
    </main>
  )
}
