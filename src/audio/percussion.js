import { MelodiError } from "../core/model.js?v=20261003.95";
import { findPercussionKit, findPercussionPiece, percussionChokeGroup } from "../instruments/percussion.js?v=20261003.95";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function semitoneRatio(semitones) {
  return 2 ** ((Number(semitones) || 0) / 12);
}

function articulationGain(articulation) {
  if (articulation === "ghost") return 0.55;
  if (articulation === "accent") return 1.18;
  return 1;
}

function oscillator(type, frequency, gain, endFrequency) {
  return {
    type,
    frequency,
    ...(endFrequency ? { endFrequency } : {}),
    gain
  };
}

function noise(frequency, gain, duration, {
  filterType = "highpass",
  q = 0.707,
  attack = 0.001,
  release = Math.min(0.018, duration * 0.25)
} = {}) {
  return {
    type: "white",
    filterType,
    frequency,
    q,
    gain,
    duration,
    attack,
    release
  };
}

// Voice definitions are inharmonic modal frequencies for cymbal-like pieces,
// plus filtered noise where the physical source needs a broadband component.
// Frequencies are multiplied by hit tuning when percussionVoiceSpec is called.
// Trim pabrik menentukan keluaran nominal saat volume user 100%.
// Kick tetap unity; karakter komponen voice dipertahankan.
const VOICE_SPECS = Object.freeze({
  kick: Object.freeze({
    outputGain: 1,
    duration: 0.34,
    oscillators: Object.freeze([
      Object.freeze(oscillator("sine", 145, 0.92, 48)),
      Object.freeze(oscillator("triangle", 72, 0.24, 42))
    ]),
    noise: Object.freeze([
      Object.freeze(noise(2800, 0.16, 0.022, { attack: 0.001, release: 0.012 }))
    ])
  }),
  snare: Object.freeze({
    outputGain: 0.8,
    duration: 0.23,
    oscillators: Object.freeze([
      Object.freeze(oscillator("triangle", 185, 0.43, 132)),
      Object.freeze(oscillator("sine", 205, 0.13, 155))
    ]),
    noise: Object.freeze([
      Object.freeze(noise(1550, 0.76, 0.19, { filterType: "bandpass", q: 0.72, attack: 0.0015, release: 0.038 })),
      Object.freeze(noise(4700, 0.36, 0.14, { attack: 0.001, release: 0.035 }))
    ])
  }),
  "closed-hi-hat": Object.freeze({
    outputGain: 0.75,
    duration: 0.075,
    oscillators: Object.freeze([
      Object.freeze(oscillator("sine", 5100, 0.1)),
      Object.freeze(oscillator("sine", 6170, 0.085)),
      Object.freeze(oscillator("sine", 7330, 0.07)),
      Object.freeze(oscillator("sine", 8610, 0.055))
    ]),
    noise: Object.freeze([
      Object.freeze(noise(6400, 0.72, 0.075, { attack: 0.0007, release: 0.024 }))
    ])
  }),
  "open-hi-hat": Object.freeze({
    outputGain: 0.7,
    // Its hit duration follows the existing MIDI-duration mapping below.
    duration: 0.55,
    oscillators: Object.freeze([
      Object.freeze(oscillator("sine", 4850, 0.11)),
      Object.freeze(oscillator("sine", 5930, 0.09)),
      Object.freeze(oscillator("sine", 7010, 0.075)),
      Object.freeze(oscillator("sine", 8290, 0.06))
    ]),
    noise: Object.freeze([
      Object.freeze(noise(5700, 0.74, 0.55, { attack: 0.001, release: 0.16 }))
    ])
  }),
  ride: Object.freeze({
    outputGain: 0.5,
    duration: 0.78,
    oscillators: Object.freeze([
      Object.freeze(oscillator("sine", 2480, 0.24)),
      Object.freeze(oscillator("sine", 3370, 0.15)),
      Object.freeze(oscillator("sine", 4210, 0.13)),
      Object.freeze(oscillator("sine", 5960, 0.08))
    ]),
    noise: Object.freeze([
      Object.freeze(noise(5600, 0.2, 0.52, { attack: 0.002, release: 0.18 }))
    ])
  }),
  crash: Object.freeze({
    outputGain: 0.6,
    duration: 1.28,
    oscillators: Object.freeze([
      Object.freeze(oscillator("sine", 2310, 0.16)),
      Object.freeze(oscillator("sine", 2930, 0.14)),
      Object.freeze(oscillator("sine", 3670, 0.13)),
      Object.freeze(oscillator("sine", 4630, 0.1)),
      Object.freeze(oscillator("sine", 5790, 0.08)),
      Object.freeze(oscillator("sine", 7120, 0.055))
    ]),
    noise: Object.freeze([
      Object.freeze(noise(3600, 0.9, 1.22, { attack: 0.001, release: 0.42 })),
      Object.freeze(noise(7200, 0.42, 1.05, { attack: 0.001, release: 0.36 }))
    ])
  }),
  "high-tom": Object.freeze({
    outputGain: 0.85,
    duration: 0.3,
    oscillators: Object.freeze([
      Object.freeze(oscillator("sine", 205, 0.78, 155)),
      Object.freeze(oscillator("triangle", 310, 0.12, 248))
    ]),
    noise: Object.freeze([])
  }),
  "mid-tom": Object.freeze({
    outputGain: 0.85,
    duration: 0.34,
    oscillators: Object.freeze([
      Object.freeze(oscillator("sine", 165, 0.8, 120)),
      Object.freeze(oscillator("triangle", 248, 0.1, 198))
    ]),
    noise: Object.freeze([])
  }),
  "low-tom": Object.freeze({
    outputGain: 0.85,
    duration: 0.4,
    oscillators: Object.freeze([
      Object.freeze(oscillator("sine", 125, 0.84, 88)),
      Object.freeze(oscillator("triangle", 186, 0.09, 142))
    ]),
    noise: Object.freeze([])
  })
});

function unsupportedVoice() {
  throw new MelodiError("unsupported-percussion-voice");
}

export function percussionVoiceSpec(kitId, hit) {
  const pieceId = hit?.pieceId;
  const kit = findPercussionKit(kitId);
  const piece = findPercussionPiece(kitId, pieceId);
  const voice = Object.hasOwn(VOICE_SPECS, pieceId) ? VOICE_SPECS[pieceId] : null;
  if (!kit || !piece || !voice) unsupportedVoice();

  const velocity = clamp((Number(hit?.velocity) || 1) / 127, 1 / 127, 1);
  const amplitude = clamp(Math.sqrt(velocity) * articulationGain(hit?.articulation), 0.04, 1.1);
  const tune = semitoneRatio(hit?.tuning ?? 0);
  const pan = clamp(Number(hit?.pan) || 0, -1, 1);
  const duration = pieceId === "open-hi-hat"
    ? Math.max(0.32, Math.min(1.1, (hit?.durationTicks ?? 480) / 480 * 0.55))
    : voice.duration;

  return {
    supported: true,
    kitId: kit.id,
    pieceId: piece.id,
    amplitude,
    outputGain: voice.outputGain,
    pan,
    chokeGroup: percussionChokeGroup(kitId, pieceId),
    duration,
    oscillators: voice.oscillators.map((component) => ({
      ...component,
      frequency: component.frequency * tune,
      ...(component.endFrequency ? { endFrequency: component.endFrequency * tune } : {})
    })),
    noise: voice.noise.map((component) => ({
      ...component,
      frequency: component.frequency * tune,
      duration: pieceId === "open-hi-hat" ? duration : Math.min(component.duration, duration)
    }))
  };
}
