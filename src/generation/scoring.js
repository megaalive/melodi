import { midiToPitch, MelodiError } from "../core/model.js";
import { isScalePitch } from "./primitives.js";

export const SCORING_WEIGHTS = Object.freeze({
  tonalFit: 0.16,
  intervalSize: 0.12,
  leapResolution: 0.11,
  singability: 0.13,
  contour: 0.10,
  rhythm: 0.10,
  repetition: 0.07,
  anchorLanding: 0.10,
  lyricFit: 0.06,
  styleFit: 0.05
});

export const STYLE_PROFILES = Object.freeze(["balanced", "smooth", "leaping", "repetitive"]);

function clamp(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function rounded(value) {
  return Math.round(clamp(value) * 1_000_000) / 1_000_000;
}

function sign(value) {
  return value === 0 ? 0 : value > 0 ? 1 : -1;
}

function pitchesWithAnchors(candidate, context) {
  return [context.leftAnchor.pitch, ...candidate.notes.map((note) => note.pitch), context.rightAnchor.pitch];
}

function intervalSizes(candidate, context) {
  const pitches = pitchesWithAnchors(candidate, context);
  return pitches.slice(1).map((pitch, index) => pitch - pitches[index]);
}

function tonalFit(candidate, context) {
  if (candidate.notes.length === 0) return 0;
  let scaleCount = 0;
  let stableCount = 0;
  const stableIntervals = new Set([0, context.scale.intervals[2], context.scale.intervals[4]]);
  for (const note of candidate.notes) {
    const inScale = isScalePitch(note.pitch, context.key, context.scale);
    if (inScale) scaleCount += 1;
    const degree = ((note.pitch - tonicPitchClass(context.key)) % 12 + 12) % 12;
    if (inScale && stableIntervals.has(degree)) stableCount += 1;
  }
  return 0.7 * (scaleCount / candidate.notes.length) + 0.3 * (stableCount / candidate.notes.length);
}

function tonicPitchClass(key) {
  const match = /^([A-G])([#b]?)(?:m)?$/.exec(key);
  const natural = { A: 9, B: 11, C: 0, D: 2, E: 4, F: 5, G: 7 }[match[1]];
  return ((natural + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0)) % 12 + 12) % 12;
}

function intervalSize(intervals) {
  if (intervals.length === 0) return 1;
  const values = intervals.map((interval) => {
    const size = Math.abs(interval);
    if (size <= 4) return 1;
    if (size <= 7) return 0.82 - (size - 5) * 0.04;
    if (size <= 12) return 0.65 - (size - 8) * 0.07;
    return Math.max(0, 0.37 - (size - 13) * 0.025);
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function leapResolution(intervals) {
  const leaps = [];
  for (let index = 0; index < intervals.length; index += 1) {
    if (Math.abs(intervals[index]) > 7) leaps.push(index);
  }
  if (leaps.length === 0) return 1;
  const resolved = leaps.filter((index) => {
    const next = intervals[index + 1];
    return next !== undefined && sign(next) === -sign(intervals[index]) && Math.abs(next) <= 4;
  }).length;
  return resolved / leaps.length;
}

function singability(candidate, intervals, voiceRange) {
  if (candidate.notes.length === 0) return 0;
  const inRange = candidate.notes.every((note) => note.pitch >= voiceRange.minPitch && note.pitch <= voiceRange.maxPitch);
  const comfortableIntervals = intervals.filter((interval) => Math.abs(interval) <= 12).length / Math.max(1, intervals.length);
  const pitches = candidate.notes.map((note) => note.pitch);
  const spread = Math.max(...pitches) - Math.min(...pitches);
  const registerComfort = spread <= 12 ? 1 : spread <= 19 ? 0.85 : spread <= 24 ? 0.65 : Math.max(0.2, 1 - (spread - 24) / 36);
  return (inRange ? 0.7 : 0) + 0.3 * (0.65 * comfortableIntervals + 0.35 * registerComfort);
}

function contour(intervals) {
  const directions = intervals.map(sign).filter((direction) => direction !== 0);
  let turns = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) turns += 1;
  }
  return directions.length <= 1 ? 1 : Math.max(0.2, 1 - Math.max(0, turns - 1) / directions.length);
}

function rhythm(candidate, context) {
  if (candidate.notes.length === 0) return 0;
  let cursor = context.gap.startTick;
  const allowed = new Set([120, 240, 480, 960]);
  let validCount = 0;
  for (const note of candidate.notes) {
    if (note.startTick === cursor && allowed.has(note.durationTicks)
      && note.startTick + note.durationTicks <= context.gap.endTick) validCount += 1;
    cursor = note.startTick + note.durationTicks;
  }
  return cursor === context.gap.endTick ? validCount / candidate.notes.length : 0;
}

function repetitionScore(candidate) {
  const pitches = candidate.notes.map((note) => note.pitch);
  if (pitches.length <= 1) return 0.65;
  const unique = new Set(pitches).size;
  const ratio = unique / pitches.length;
  if (ratio === 1) return 0.78;
  if (ratio >= 0.6) return 1;
  if (ratio >= 0.4) return 0.74;
  return 0.35;
}

function anchorLanding(candidate, context) {
  if (candidate.notes.length === 0) return 0;
  const distance = Math.abs(candidate.notes.at(-1).pitch - context.rightAnchor.pitch);
  if (distance <= 2) return 1;
  if (distance <= 4) return 0.86;
  if (distance <= 7) return 0.68;
  if (distance <= 12) return 0.42;
  return Math.max(0.05, 0.35 - (distance - 13) * 0.015);
}

function lyricFit(candidate, expectedSyllableCount) {
  if (expectedSyllableCount === null || expectedSyllableCount === undefined) return 0.5;
  if (expectedSyllableCount === 0) return candidate.notes.length === 0 ? 1 : 0.4;
  const difference = candidate.notes.length - expectedSyllableCount;
  const penalty = difference > 0 ? difference * 0.12 : -difference * 0.28;
  return Math.max(0, 1 - penalty / Math.max(1, expectedSyllableCount));
}

function styleFit(styleProfile, dimensions, intervals) {
  if (styleProfile === "smooth") return 0.5 * dimensions.intervalSize + 0.3 * dimensions.leapResolution + 0.2 * dimensions.contour;
  if (styleProfile === "repetitive") return 0.65 * dimensions.repetition + 0.2 * dimensions.rhythm + 0.15 * dimensions.anchorLanding;
  if (styleProfile === "leaping") {
    const leaps = intervals.filter((interval) => Math.abs(interval) >= 5 && Math.abs(interval) <= 9).length;
    const ratio = leaps / Math.max(1, intervals.length);
    const target = Math.max(0, 1 - Math.abs(ratio - 0.25) / 0.25);
    return 0.45 * target + 0.35 * dimensions.leapResolution + 0.2 * dimensions.anchorLanding;
  }
  return 0.55 * dimensions.tonalFit + 0.25 * dimensions.intervalSize + 0.2 * dimensions.anchorLanding;
}

function signature(candidate, gap) {
  return JSON.stringify(candidate.notes.map((note) => [note.pitch, note.startTick - gap.startTick, note.durationTicks]));
}

export function scoreCandidate(candidate, context, options = {}) {
  if (!Array.isArray(candidate.notes) || candidate.notes.length === 0) throw new MelodiError("generation-invalid-candidate");
  const voiceRange = options.voiceRange ?? { minPitch: 48, maxPitch: 84 };
  const expectedSyllableCount = options.expectedSyllableCount ?? context.mappedSyllableCount ?? null;
  const styleProfile = options.styleProfile ?? "balanced";
  if (!STYLE_PROFILES.includes(styleProfile)) throw new MelodiError("generation-invalid-style");
  const intervals = intervalSizes(candidate, context);
  const dimensions = {
    tonalFit: tonalFit(candidate, context),
    intervalSize: intervalSize(intervals),
    leapResolution: leapResolution(intervals),
    singability: singability(candidate, intervals, voiceRange),
    contour: contour(intervals),
    rhythm: rhythm(candidate, context),
    repetition: repetitionScore(candidate),
    anchorLanding: anchorLanding(candidate, context),
    lyricFit: lyricFit(candidate, expectedSyllableCount)
  };
  dimensions.styleFit = styleFit(styleProfile, dimensions, intervals);
  const scoreBreakdown = Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, rounded(value)]));
  const score = rounded(Object.entries(SCORING_WEIGHTS)
    .reduce((total, [key, weight]) => total + scoreBreakdown[key] * weight, 0));
  const allPitches = candidate.notes.map((note) => note.pitch);
  const noteIntervals = candidate.notes.slice(1).map((note, index) => note.pitch - candidate.notes[index].pitch);
  const leaps = noteIntervals.filter((interval) => Math.abs(interval) > 7).length;
  return {
    ...candidate,
    score,
    scoreBreakdown,
    metadata: {
      noteCount: candidate.notes.length,
      range: {
        minPitch: Math.min(...allPitches),
        maxPitch: Math.max(...allPitches),
        label: `${midiToPitch(Math.min(...allPitches))}–${midiToPitch(Math.max(...allPitches))}`
      },
      stepCount: noteIntervals.filter((interval) => Math.abs(interval) <= 4).length,
      leapCount: leaps,
      landingInterval: candidate.notes.length ? candidate.notes.at(-1).pitch - context.rightAnchor.pitch : null,
      smoothLanding: candidate.notes.length > 0 && Math.abs(candidate.notes.at(-1).pitch - context.rightAnchor.pitch) <= 4
    }
  };
}

export function rankCandidates(candidates, context, options = {}) {
  const bySignature = new Map();
  for (const candidate of candidates) {
    const key = signature(candidate, context.gap);
    const existing = bySignature.get(key);
    if (!existing) {
      bySignature.set(key, { ...candidate, _signature: key });
      continue;
    }
    existing.sourceMoves = [...new Set([...(existing.sourceMoves ?? []), ...(candidate.sourceMoves ?? [])])].sort();
    existing.generationIndex = Math.min(existing.generationIndex ?? Infinity, candidate.generationIndex ?? Infinity);
  }
  return [...bySignature.values()]
    .map((candidate) => scoreCandidate(candidate, context, options))
    .map((candidate) => ({ ...candidate, _signature: signature(candidate, context.gap) }))
    .sort((left, right) => right.score - left.score
      || (left._signature < right._signature ? -1 : left._signature > right._signature ? 1 : 0)
      || (left.generationIndex ?? 0) - (right.generationIndex ?? 0))
    .map(({ _signature, ...candidate }) => candidate)
    .slice(0, options.candidateCount ?? 6);
}
