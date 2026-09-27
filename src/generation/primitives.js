import { MelodiError } from "../core/model.js";

function fail(code) {
  throw new MelodiError(code);
}

export function tonicPitchClass(key) {
  if (typeof key !== "string") fail("generation-invalid-key");
  const match = /^([A-G])([#b]?)(?:m)?$/.exec(key);
  if (!match) fail("generation-invalid-key");
  const naturals = { A: 9, B: 11, C: 0, D: 2, E: 4, F: 5, G: 7 };
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return ((naturals[match[1]] + accidental) % 12 + 12) % 12;
}

export function isScalePitch(pitch, key, scale) {
  if (!Number.isInteger(pitch) || !scale || !Array.isArray(scale.intervals)) return false;
  const offset = ((pitch - tonicPitchClass(key)) % 12 + 12) % 12;
  return scale.intervals.includes(offset);
}

export function scalePitches(context, minPitch = 0, maxPitch = 127) {
  const result = [];
  for (let pitch = minPitch; pitch <= maxPitch; pitch += 1) {
    if (isScalePitch(pitch, context.key, context.scale)) result.push(pitch);
  }
  return result;
}

export function nearestScalePitch(pitch, context, minPitch = 0, maxPitch = 127) {
  const pitches = scalePitches(context, minPitch, maxPitch);
  if (pitches.length === 0) fail("generation-range-has-no-scale-tones");
  return pitches.sort((left, right) => Math.abs(left - pitch) - Math.abs(right - pitch) || left - right)[0];
}

export function nextScalePitch(pitch, direction, context, minPitch = 0, maxPitch = 127) {
  if (direction !== -1 && direction !== 1) fail("generation-invalid-direction");
  const pitches = scalePitches(context, minPitch, maxPitch);
  if (direction > 0) return pitches.find((candidate) => candidate > pitch) ?? null;
  return [...pitches].reverse().find((candidate) => candidate < pitch) ?? null;
}

export function scalePath(startPitch, targetPitch, context, minPitch = 0, maxPitch = 127) {
  const start = nearestScalePitch(startPitch, context, minPitch, maxPitch);
  const target = nearestScalePitch(targetPitch, context, minPitch, maxPitch);
  if (start === target) return [start];
  const direction = target > start ? 1 : -1;
  const pitches = [start];
  let current = start;
  while (current !== target && pitches.length <= 32) {
    const next = nextScalePitch(current, direction, context, minPitch, maxPitch);
    if (next === null || (direction > 0 && next > target) || (direction < 0 && next < target)) break;
    pitches.push(next);
    current = next;
  }
  if (pitches.at(-1) !== target) pitches.push(target);
  return pitches;
}

export function directMove(startPitch, targetPitch, context, minPitch = 0, maxPitch = 127) {
  return scalePath(startPitch, targetPitch, context, minPitch, maxPitch);
}

export function scalePassingNotes(startPitch, targetPitch, context, minPitch = 0, maxPitch = 127) {
  const low = Math.min(startPitch, targetPitch);
  const high = Math.max(startPitch, targetPitch);
  const direction = targetPitch >= startPitch ? 1 : -1;
  return scalePitches(context, Math.max(minPitch, low + 1), Math.min(maxPitch, high - 1))
    .sort((left, right) => direction > 0 ? left - right : right - left);
}

export function scalePassingNote(startPitch, targetPitch, context, minPitch = 0, maxPitch = 127) {
  const between = scalePassingNotes(startPitch, targetPitch, context, minPitch, maxPitch);
  if (between.length !== 1) return null;
  const direction = targetPitch >= startPitch ? 1 : -1;
  const first = nextScalePitch(startPitch, direction, context, minPitch, maxPitch);
  const after = first === null ? null : nextScalePitch(first, direction, context, minPitch, maxPitch);
  return first === between[0] && after === targetPitch ? between[0] : null;
}

export function neighborNote(pitch, context, direction = 1, minPitch = 0, maxPitch = 127) {
  const neighbor = nextScalePitch(pitch, direction, context, minPitch, maxPitch);
  if (neighbor === null) return null;
  return Object.freeze({ neighborPitch: neighbor, pitches: [neighbor, pitch] });
}

export function approachNote(targetPitch, sourcePitch, context, minPitch = 0, maxPitch = 127) {
  const target = nearestScalePitch(targetPitch, context, minPitch, maxPitch);
  const direction = sourcePitch < targetPitch ? -1 : sourcePitch > targetPitch ? 1 : -1;
  return nextScalePitch(target, direction, context, minPitch, maxPitch) ?? target;
}

export function leapNote(startPitch, direction, context, scaleSteps = 3, minPitch = 0, maxPitch = 127) {
  if (!Number.isSafeInteger(scaleSteps) || scaleSteps < 2 || scaleSteps > 5) fail("generation-invalid-leap");
  let pitch = nearestScalePitch(startPitch, context, minPitch, maxPitch);
  for (let step = 0; step < scaleSteps; step += 1) {
    pitch = nextScalePitch(pitch, direction, context, minPitch, maxPitch);
    if (pitch === null) return null;
  }
  return pitch;
}

export function leapResolution(startPitch, direction, context, scaleSteps = 4, minPitch = 0, maxPitch = 127) {
  const leap = leapNote(startPitch, direction, context, scaleSteps, minPitch, maxPitch);
  if (leap === null) return null;
  const resolution = nextScalePitch(leap, -direction, context, minPitch, maxPitch);
  if (resolution === null) return null;
  return Object.freeze({ leapPitch: leap, resolutionPitch: resolution, pitches: [leap, resolution] });
}

export function repetition(pitch, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 8) fail("generation-invalid-event-count");
  return Array.from({ length: count }, () => pitch);
}

export function sequence(startPitch, intervals, count, context, minPitch = 0, maxPitch = 127) {
  if (!Array.isArray(intervals) || intervals.length === 0) fail("generation-invalid-sequence");
  if (!Number.isSafeInteger(count) || count < 1 || count > 8) fail("generation-invalid-event-count");
  const pitches = [];
  let current = startPitch;
  for (let index = 0; index < count; index += 1) {
    const interval = intervals[index % intervals.length];
    if (!Number.isSafeInteger(interval) || interval === 0 || Math.abs(interval) > 5) fail("generation-invalid-sequence");
    const direction = Math.sign(interval);
    let next = current;
    for (let step = 0; step < Math.abs(interval); step += 1) {
      next = nextScalePitch(next, direction, context, minPitch, maxPitch);
      if (next === null) break;
    }
    if (next === null) next = nearestScalePitch(current, context, minPitch, maxPitch);
    pitches.push(next);
    current = next;
  }
  return pitches;
}
