import type { FormEvent } from 'react'

type ConnectionPageProps = {
  isPortrait: boolean
  nameInput: string
  onNameInputChange: (value: string) => void
  onSubmitName: (event: FormEvent<HTMLFormElement>) => void
  showRoomCodeInput?: boolean
  roomCodeInput?: string
  onRoomCodeInputChange?: (value: string) => void
  onSubmitRoomCode?: (event: FormEvent<HTMLFormElement>) => void
}

export function ConnectionPage({
  isPortrait,
  nameInput,
  onNameInputChange,
  onSubmitName,
  showRoomCodeInput,
  roomCodeInput,
  onRoomCodeInputChange,
  onSubmitRoomCode,
}: ConnectionPageProps) {
  if (showRoomCodeInput) {
    return (
      <main className={`controller-name-layout ${isPortrait ? 'controller-name-portrait' : ''} turnPhone`}>
        <section className={`controller-name-card ${isPortrait ? 'controller-name-portrait' : ''}`}>
          <h1>Code de la partie</h1>
          <p>Entrez le code affiché sur l'écran de jeu.</p>
          <form onSubmit={onSubmitRoomCode}>
            <input
              className="name-input room-code-input"
              value={roomCodeInput ?? ''}
              onChange={(e) => onRoomCodeInputChange?.(e.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={4}
              style={{ textTransform: 'uppercase', letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.5rem' }}
            />
            <button type="submit">Rejoindre</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className={`controller-name-layout ${isPortrait ? 'controller-name-portrait' : ''} turnPhone`}>
      <section className={`controller-name-card ${isPortrait ? 'controller-name-portrait' : ''}`}>
        <h1>Choisis ton pseudo</h1>
        <p>Entre ton pseudo pour rejoindre la partie.</p>
        <form onSubmit={onSubmitName}>
          <input
            className="name-input"
            value={nameInput}
            onChange={(e) => onNameInputChange(e.target.value)}
            placeholder="Ton pseudo"
            maxLength={16}
          />
          <button type="submit">Rejoindre</button>
        </form> 
      </section>
    </main>
  )
}
