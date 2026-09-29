import { percussionChokeGroup } from "../instruments/percussion.js?v=20260929.13";

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

export function percussionVoiceSpec(kitId, hit) {
  const velocity = clamp((Number(hit?.velocity) || 1) / 127, 1 / 127, 1);
  const amplitude = clamp(Math.sqrt(velocity) * articulationGain(hit?.articulation), 0.04, 1.1);
  const tune = semitoneRatio(hit?.tuning ?? 0);
  const pan = clamp(Number(hit?.pan) || 0, -1, 1);
  const common = {
    amplitude,
    pan,
    chokeGroup: percussionChokeGroup(kitId, hit?.pieceId),
    duration: 0.12,
    oscillators: []
  };

  switch (hit?.pieceId) {
    case "kick":
      return {
        ...common,
        duration: 0.34,
        oscillators: [
          { type: "sine", frequency: 145 * tune, endFrequency: 48 * tune, gain: 1 },
          { type: "triangle", frequency: 72 * tune, endFrequency: 42 * tune, gain: 0.32 }
        ]
      };
    case "snare":
      return {
        ...common,
        duration: 0.2,
        oscillators: [
          { type: "triangle", frequency: 185 * tune, endFrequency: 135 * tune, gain: 0.48 },
          { type: "square", frequency: 1760 * tune, gain: 0.22 },
          { type: "square", frequency: 2470 * tune, gain: 0.17 },
          { type: "square", frequency: 3190 * tune, gain: 0.12 }
        ]
      };
    case "closed-hi-hat":
      return {
        ...common,
        duration: 0.075,
        oscillators: [
          { type: "square", frequency: 5100 * tune, gain: 0.19 },
          { type: "square", frequency: 6170 * tune, gain: 0.16 },
          { type: "square", frequency: 7330 * tune, gain: 0.13 },
          { type: "square", frequency: 8610 * tune, gain: 0.1 }
        ]
      };
    case "open-hi-hat":
      return {
        ...common,
        duration: Math.max(0.32, Math.min(1.1, (hit?.durationTicks ?? 480) / 480 * 0.55)),
        oscillators: [
          { type: "square", frequency: 4850 * tune, gain: 0.17 },
          { type: "square", frequency: 5930 * tune, gain: 0.15 },
          { type: "square", frequency: 7010 * tune, gain: 0.12 },
          { type: "square", frequency: 8290 * tune, gain: 0.1 }
        ]
      };
    case "crash":
      return {
        ...common,
        duration: 1.15,
        oscillators: [
          { type: "square", frequency: 2780 * tune, gain: 0.12 },
          { type: "square", frequency: 3310 * tune, gain: 0.11 },
          { type: "square", frequency: 4070 * tune, gain: 0.09 },
          { type: "square", frequency: 4930 * tune, gain: 0.08 },
          { type: "square", frequency: 6110 * tune, gain: 0.07 }
        ]
      };
    case "ride":
      return {
        ...common,
        duration: 0.72,
        oscillators: [
          { type: "square", frequency: 2510 * tune, gain: 0.1 },
          { type: "square", frequency: 3760 * tune, gain: 0.09 },
          { type: "square", frequency: 5120 * tune, gain: 0.07 }
        ]
      };
    case "high-tom":
      return {
        ...common,
        duration: 0.3,
        oscillators: [{ type: "sine", frequency: 205 * tune, endFrequency: 155 * tune, gain: 0.8 }]
      };
    case "mid-tom":
      return {
        ...common,
        duration: 0.34,
        oscillators: [{ type: "sine", frequency: 165 * tune, endFrequency: 120 * tune, gain: 0.82 }]
      };
    case "low-tom":
      return {
        ...common,
        duration: 0.4,
        oscillators: [{ type: "sine", frequency: 125 * tune, endFrequency: 88 * tune, gain: 0.86 }]
      };
    default:
      return {
        ...common,
        duration: 0.14,
        oscillators: [{ type: "triangle", frequency: 440 * tune, gain: 0.25 }]
      };
  }
}
