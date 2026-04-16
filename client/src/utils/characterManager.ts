import type { CharacterType } from '../types/ws'

const CHARACTERS: CharacterType[] = ['blue', 'yellow', 'green', 'purple', 'red']

const SPRITE_ANIMATIONS = {
  idle: 0, // ligne statique
  walkLeft: 1,
  walkRight: 2,
  jumpIdle: 3,
  jumpLeft: 4,
  jumpRight: 5,
}

export type AnimationState = keyof typeof SPRITE_ANIMATIONS

/**
 * Obtient un personnage aléatoire
 */
export function getRandomCharacter(): CharacterType {
  return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
}

/**
 * Obtient l'URL du sprite pour un personnage et son animation
 */
export function getSpriteUrl(character: CharacterType, animation: AnimationState = 'idle'): string {
  return `/characters/${character}.png`
}

/**
 * Obtient la position Y du sprite dans la feuille d'animation
 * pour une animation donnée
 */
export function getAnimationRow(animation: AnimationState): number {
  return SPRITE_ANIMATIONS[animation]
}

/**
 * Dimensions du sprite d'un personnage
 */
export const SPRITE_DIMENSIONS = {
  width: 32,
  height: 32,
  rowHeight: 32,
}
