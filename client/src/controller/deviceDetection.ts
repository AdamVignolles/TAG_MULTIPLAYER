/**
 * Détecte si l'appareil est un iOS (iPhone, iPad, iPod)
 */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/**
 * Détecte spécifiquement si c'est un iPhone
 */
export function isIPhone(): boolean {
  return /iPhone/.test(navigator.userAgent)
}
