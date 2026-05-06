/**
 * Vibration patterns for controller haptic feedback.
 *
 * Browsers require a recent user gesture to allow navigator.vibrate().
 * Since vibration events come from WebSocket handlers (no gesture context),
 * we queue patterns and flush them on the next touch/pointer interaction
 * on the gamepad buttons.
 */

type VibrationPattern = number | number[]

let pendingPattern: VibrationPattern | null = null

function enqueue(pattern: VibrationPattern) {
  // Keep only the latest pending vibration to avoid stacking
  pendingPattern = pattern
}

/** Call this from a user gesture handler (pointerdown / touchstart) to fire pending vibrations. */
export function flushVibration() {
  if (pendingPattern === null) return
  const pattern = pendingPattern
  pendingPattern = null
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Vibration API not available
  }
}

/** Game start: two short pulses */
export function vibrateGameStart() {
  enqueue([100, 50, 100])
}

/** Game over: one long pulse */
export function vibrateGameOver() {
  enqueue(400)
}

/** Became TAG: strong pulse */
export function vibrateBecameTag() {
  enqueue([200, 100, 200])
}

/** Became FREE: short pulse */
export function vibrateBecameFree() {
  enqueue(100)
}

/** Eliminated: three rapid pulses */
export function vibrateEliminated() {
  enqueue([150, 50, 150, 50, 150])
}
