let audioCtx: AudioContext | null = null

export function playBeep(frequency = 1200, durationMs = 50) {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000)
    osc.stop(audioCtx.currentTime + durationMs / 1000)
  } catch {
    /* silence */
  }
}

export function playAddSound() {
  playBeep(1200, 50)
}

export function playErrorSound() {
  playBeep(400, 120)
}
