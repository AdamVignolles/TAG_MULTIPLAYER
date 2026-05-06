/**
 * Vibration patterns for controller haptic feedback.
 * Uses the Vibration API (navigator.vibrate) — silently no-ops on unsupported devices.
 */

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Vibration API not available
  }
}

/** Game start: two short pulses */
export function vibrateGameStart() {
  vibrate([100, 50, 100])
}

/** Game over: one long pulse */
export function vibrateGameOver() {
  vibrate(400)
}

/** Became TAG: strong pulse */
export function vibrateBecameTag() {
  vibrate([200, 100, 200])
}

/** Became FREE: short pulse */
export function vibrateBecameFree() {
  vibrate(100)
}

/** Eliminated: three rapid pulses */
export function vibrateEliminated() {
  vibrate([150, 50, 150, 50, 150])
}
