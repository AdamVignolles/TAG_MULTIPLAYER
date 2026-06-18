type ControllerCue = 'tag' | 'free'

type AudioContextCtor = typeof AudioContext & {
  new (): AudioContext
}

let pendingCue: ControllerCue | null = null
let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null

function getAudioContextCtor(): AudioContextCtor | null {
  return window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext || null
}

function getAudioContext(): AudioContext | null {
  const AudioContextConstructor = getAudioContextCtor()
  if (!AudioContextConstructor) return null

  if (!audioContext) {
    audioContext = new AudioContextConstructor()
    masterGain = audioContext.createGain()
    masterGain.gain.value = 0.22
    masterGain.connect(audioContext.destination)
  }

  return audioContext
}

function scheduleTone(
  context: AudioContext,
  output: GainNode,
  frequency: number,
  startTime: number,
  direction: 'up' | 'down'
) {
  const oscillator = context.createOscillator()
  const toneGain = context.createGain()
  const sparkle = context.createOscillator()
  const sparkleGain = context.createGain()

  oscillator.type = 'square'
  sparkle.type = 'triangle'

  oscillator.frequency.setValueAtTime(direction === 'up' ? frequency * 0.94 : frequency * 1.06, startTime)
  oscillator.frequency.exponentialRampToValueAtTime(direction === 'up' ? frequency * 1.04 : frequency * 0.9, startTime + 0.11)
  sparkle.frequency.setValueAtTime(frequency * 2, startTime)
  sparkle.frequency.exponentialRampToValueAtTime(frequency * 2.2, startTime + 0.11)

  toneGain.gain.setValueAtTime(0.0001, startTime)
  toneGain.gain.exponentialRampToValueAtTime(0.22, startTime + 0.012)
  toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.13)

  sparkleGain.gain.setValueAtTime(0.0001, startTime)
  sparkleGain.gain.exponentialRampToValueAtTime(0.06, startTime + 0.01)
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08)

  oscillator.connect(toneGain)
  sparkle.connect(sparkleGain)
  toneGain.connect(output)
  sparkleGain.connect(output)

  oscillator.start(startTime)
  sparkle.start(startTime)
  oscillator.stop(startTime + 0.16)
  sparkle.stop(startTime + 0.12)
}

async function playPendingCue() {
  if (!pendingCue) return

  const context = getAudioContext()
  if (!context) return

  try {
    if (context.state === 'suspended') {
      await context.resume()
    }
  } catch {
    return
  }

  if (context.state !== 'running' || !masterGain) return

  const cue = pendingCue
  pendingCue = null
  const output = masterGain

  const startTime = context.currentTime + 0.02
  const notes = cue === 'tag' ? [659.25, 880, 1174.66] : [1174.66, 880, 659.25]
  const direction = cue === 'tag' ? 'up' : 'down'

  notes.forEach((frequency, index) => {
    scheduleTone(context, output, frequency, startTime + index * 0.095, direction)
  })
}

export function flushControllerSounds() {
  void playPendingCue()
}

export function clearControllerSounds() {
  pendingCue = null
}

export function playBecameTagSound() {
  pendingCue = 'tag'
  void playPendingCue()
}

export function playBecameFreeSound() {
  pendingCue = 'free'
  void playPendingCue()
}