type WaitingLaunchPageProps = {
  name: string
  status: string
  playerLabel: string
  isFullscreen: boolean
  onRequestFullscreen: () => void
  onChangePseudo: () => void
}

export function WaitingLaunchPage({
  name,
  status,
  playerLabel,    
  isFullscreen,
  onRequestFullscreen,
  onChangePseudo,
}: WaitingLaunchPageProps) {
  return (
    <main className="controller-layout waiting controller-force-landscape">
      {!isFullscreen && (
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
      <p className="log">En attente du lancement de partie sur l'ecran principal.</p>
    </main>
  )
}
