export type CharacterType = 'blue' | 'yellow' | 'green' | 'purple' | 'red'

const CHARACTERS: CharacterType[] = ['blue', 'yellow', 'green', 'purple', 'red']

export function getRandomCharacter(): CharacterType {
  return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
}
