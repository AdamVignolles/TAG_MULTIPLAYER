import { isIPhone } from './deviceDetection'

type PortraitWarningPageProps = {
  showFullscreenHint?: boolean
}

export function PortraitWarningPage({ showFullscreenHint = false }: PortraitWarningPageProps) {
  const isPhone = isIPhone()

  return (
    <main className="controller-layout turnPhone controller-portrait-warning">
      <h1>Veuillez tourner votre telephone</h1>
      <p>Le controleur fonctionne en format paysage.</p>
      {showFullscreenHint && !isPhone && <p>Passez en plein ecran pour masquer la barre du navigateur.</p>}
      {showFullscreenHint && isPhone && (
        <>
          <p>Sur iPhone, pour une expérience sans barre Safari :</p>
          <ol style={{ textAlign: 'left', paddingLeft: '20px' }}>
            <li>Appuyez sur le bouton de partage (carré avec flèche)</li>
            <li>Sélectionnez "Ajouter à l'écran d'accueil"</li>
            <li>Validez, puis lancez l'app depuis l'écran d'accueil</li>
          </ol>
          <p style={{ fontSize: '0.9em', marginTop: '10px' }}>Cette app lancée depuis l'écran d'accueil n'aura plus la barre Safari.</p>
        </>
      )}
    </main>
  )
}
