import type { StateMessage, CharacterType } from '../types/ws'
import { getSpriteUrl } from '../utils/characterManager'

type AreaTeamSelectionPageProps = {
  gameState: StateMessage | null
  onStartGame: () => void
}

export function AreaTeamSelectionPage({ gameState, onStartGame }: AreaTeamSelectionPageProps) {
  if (!gameState) return null

  const totalPlayers = gameState.players.length
  const maxTeamSize = Math.ceil(totalPlayers / 2)

  const greenPlayers = gameState.players.filter(p => p.areaTeam === 'green')
  const bluePlayers = gameState.players.filter(p => p.areaTeam === 'blue')
  const unassignedPlayers = gameState.players.filter(p => !p.areaTeam)

  const PlayerBadge = ({ name, character }: { name: string; character?: CharacterType }) => (
    <div className="team-player-badge">
      {character && (
        <div
          className="team-player-sprite"
          style={{
            backgroundImage: `url('${getSpriteUrl(character)}')`,
            backgroundPosition: '0 0',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '32px 192px',
          }}
          title={character}
        />
      )}
      <span className="team-player-name">{name}</span>
    </div>
  )

  return (
    <main className="area-team-selection-layout">
      <h1>Sélection des équipes - Contrôle de zone</h1>

      <div className="team-columns-container">
        {/* Colonne Équipe Verte */}
        <div className="team-column team-green-column">
          <h2 className="team-column-title">
            Équipe Verte
            <span className="team-count">
              {greenPlayers.length}/{maxTeamSize}
            </span>
          </h2>
          <div className="team-players-list">
            {greenPlayers.map((player) => (
              <PlayerBadge key={player.id} name={player.name} character={player.character} />
            ))}
          </div>
        </div>

        {/* Colonne Non choisi */}
        <div className="team-column team-unassigned-column">
          <h2 className="team-column-title">Non choisi</h2>
          <div className="team-players-list">
            {unassignedPlayers.map((player) => (
              <PlayerBadge key={player.id} name={player.name} character={player.character} />
            ))}
          </div>
        </div>

        {/* Colonne Équipe Bleue */}
        <div className="team-column team-blue-column">
          <h2 className="team-column-title">
            Équipe Bleue
            <span className="team-count">
              {bluePlayers.length}/{maxTeamSize}
            </span>
          </h2>
          <div className="team-players-list">
            {bluePlayers.map((player) => (
              <PlayerBadge key={player.id} name={player.name} character={player.character} />
            ))}
          </div>
        </div>
      </div>

      <button className="launch-button" onClick={onStartGame}>
        Lancer la partie
      </button>
    </main>
  )
}
