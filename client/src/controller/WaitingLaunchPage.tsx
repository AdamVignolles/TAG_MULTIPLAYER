type WaitingLaunchPageProps = {
  name: string
  status: string
  playerLabel: string
  isFullscreen: boolean
  onRequestFullscreen: () => void
}

export function WaitingLaunchPage({
  name,
  status,
  playerLabel,
  isFullscreen,
  onRequestFullscreen,
}: WaitingLaunchPageProps) {
  return (
    <main className="controller-layout waiting controller-force-landscape">
      {!isFullscreen && (
        <button className="fullscreen-button" onClick={onRequestFullscreen}>
          Plein ecran
        </button>
      )}
      <h1>Salut {name}</h1>
      <p>Statut: {status}</p>
      <p>
        ID joueur: <span className="player-label-text">{playerLabel}</span>
      </p>
      <p className="log">En attente du lancement de partie sur l'ecran principal.</p>
    </main>
  )
}
