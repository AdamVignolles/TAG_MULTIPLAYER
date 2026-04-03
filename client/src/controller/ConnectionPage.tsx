import type { FormEvent } from 'react'

type ConnectionPageProps = {
  isPortrait: boolean
  nameInput: string
  onNameInputChange: (value: string) => void
  onSubmitName: (event: FormEvent<HTMLFormElement>) => void
}

export function ConnectionPage({
  isPortrait,
  nameInput,
  onNameInputChange,
  onSubmitName,
}: ConnectionPageProps) {
  return (
    <main className={`controller-name-layout ${isPortrait ? 'controller-name-portrait' : ''}`}>
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
