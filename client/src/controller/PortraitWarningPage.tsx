type PortraitWarningPageProps = {
  showFullscreenHint?: boolean
}

export function PortraitWarningPage({ showFullscreenHint = false }: PortraitWarningPageProps) {
  return (
    <main className="controller-layout controller-portrait-warning">
      <h1>Veuillez tourner votre telephone</h1>
      <p>Le controleur fonctionne en format paysage.</p>
      {showFullscreenHint && <p>Passez en plein ecran pour masquer la barre du navigateur.</p>}
    </main>
  )
}
