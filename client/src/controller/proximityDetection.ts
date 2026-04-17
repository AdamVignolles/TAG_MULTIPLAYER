export type ButtonKey = 'left' | 'right' | 'jump' | 'down'

export interface ButtonRect {
  key: ButtonKey
  element: HTMLButtonElement
  rect: DOMRect
}

const PROXIMITY_RADIUS = 80 // pixels de détection

export function getButtonRects(container: HTMLElement): ButtonRect[] {
  const buttons = container.querySelectorAll<HTMLButtonElement>('.control')
  const rects: ButtonRect[] = []

  buttons.forEach((element) => {
    let key: ButtonKey | null = null
    const text = element.textContent?.trim()
    
    if (text === 'Gauche') key = 'left'
    else if (text === 'Droite') key = 'right'
    else if (element.classList.contains('jump')) key = 'jump'
    else if (element.classList.contains('down')) key = 'down'

    if (key) {
      rects.push({
        key,
        element,
        rect: element.getBoundingClientRect(),
      })
    }
  })

  return rects
}

export function findClosestButton(
  x: number,
  y: number,
  buttons: ButtonRect[]
): ButtonKey | null {
  let closest: { key: ButtonKey; distance: number } | null = null
  const proximityRadiusSq = PROXIMITY_RADIUS * PROXIMITY_RADIUS

  for (const button of buttons) {
    const rect = button.rect
    
    // Calculer la distance minimale du point au rectangle
    const dx = Math.max(rect.left - x, 0, x - rect.right)
    const dy = Math.max(rect.top - y, 0, y - rect.bottom)
    const distanceSq = dx * dx + dy * dy

    // Si le point est dans le rayon de proximité
    if (distanceSq <= proximityRadiusSq) {
      if (!closest || distanceSq < closest.distance * closest.distance) {
        closest = { key: button.key, distance: Math.sqrt(distanceSq) }
      }
    }
  }

  return closest?.key || null
}

export function isPointInButton(x: number, y: number, button: ButtonRect): boolean {
  const rect = button.rect
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

export function getClosestButtonWithFallback(
  x: number,
  y: number,
  buttons: ButtonRect[]
): ButtonKey | null {
  // D'abord vérifier si on est directement sur un bouton
  for (const button of buttons) {
    if (isPointInButton(x, y, button)) {
      return button.key
    }
  }

  // Sinon, chercher le plus proche dans la zone de proximité
  return findClosestButton(x, y, buttons)
}
