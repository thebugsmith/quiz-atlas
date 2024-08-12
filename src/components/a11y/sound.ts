"use client";

let context: AudioContext | null = null;

function tone(frequency: number, durationMs: number, delayMs = 0) {
  try {
    context ??= new AudioContext();
    const start = context.currentTime + delayMs / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    // Quiet by design: this must never be the only signal, and never startling.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + durationMs / 1000 + 0.02);
  } catch {
    // Audio is optional; a blocked context must not interrupt play.
  }
}

export const playCorrect = () => {
  tone(660, 90);
  tone(880, 110, 90);
};

export const playWrong = () => {
  tone(220, 160);
};
