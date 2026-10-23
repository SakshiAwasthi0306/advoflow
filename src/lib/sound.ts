// Small interface sounds and phone vibration, synthesised in the browser (no audio files). Off unless the
// person turns them on in Settings; the choice is kept in this browser only.

export type SoundKind = "tick" | "chime" | "error";
const KEY = "af-sound";

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
}

export function setSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage blocked: stays off */ }
}

let ctx: AudioContext | null = null;

function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + at);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + dur + 0.02);
}

export function play(kind: SoundKind, force = false) {
  if (typeof window === "undefined" || (!force && !soundOn())) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (kind === "tick") { tone(1320, 0, 0.07, 0.05, "triangle"); navigator.vibrate?.(8); }
    if (kind === "chime") { tone(784, 0, 0.5, 0.06); tone(1175, 0.09, 0.6, 0.05); tone(1568, 0.18, 0.7, 0.035); navigator.vibrate?.([12, 40, 18]); }
    if (kind === "error") { tone(220, 0, 0.18, 0.05, "triangle"); tone(185, 0.1, 0.22, 0.04, "triangle"); navigator.vibrate?.([30, 30, 30]); }
  } catch { /* audio unavailable */ }
}
