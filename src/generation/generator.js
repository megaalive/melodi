import { MelodiError } from "../core/model.js";
import { createGenerationContext } from "./context.js";
import { createRandom, stableHash, validateSeed } from "./random.js";
import {
  approachNote,
  directMove,
  leapNote,
  leapResolution,
  nearestScalePitch,
  neighborNote,
  nextScalePitch,
  repetition,
  scalePassingNotes,
  scalePitches,
  sequence
} from "./primitives.js";

export const GENERATOR_VERSION = 1;
export const DEFAULT_CANDIDATE_COUNT = 6;
export const DEFAULT_VOICE_RANGE = Object.freeze({ minPitch: 48, maxPitch: 84 });

const RHYTHM_UNITS = Object.freeze([4, 2, 1, 8]);
const MOVE_NAMES = Object.freeze([
  "direct",
  "passing",
  "neighbor",
  "approach",
  "leap",
  "leap-resolution",
  "repetition",
  "sequence"
]);

function fail(code) {
  throw new MelodiError(code);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeOptions(request) {
  const seed = validateSeed(request.seed ?? 1);
  const candidateCount = request.candidateCount ?? DEFAULT_CANDIDATE_COUNT;
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 4 || candidateCount > 8) {
    fail("generation-invalid-candidate-count");
  }
  const voiceRange = request.voiceRange ?? DEFAULT_VOICE_RANGE;
  if (!voiceRange || !Number.isSafeInteger(voiceRange.minPitch) || !Number.isSafeInteger(voiceRange.maxPitch)
    || voiceRange.minPitch < 0 || voiceRange.maxPitch > 127 || voiceRange.minPitch >= voiceRange.maxPitch) {
    fail("generation-invalid-voice-range");
  }
  const expectedSyllableCount = request.lyricSyllableCount;
  if (expectedSyllableCount !== undefined && (!Number.isSafeInteger(expectedSyllableCount) || expectedSyllableCount < 0)) {
    fail("generation-invalid-lyric-count");
  }
  return { seed, candidateCount, voiceRange: { ...voiceRange }, expectedSyllableCount };
}

function enumerateRhythmPlans(gapTicks) {
  const totalUnits = gapTicks / 120;
  const plans = [];
  function visit(remaining, plan) {
    if (remaining === 0) {
      plans.push(plan.map((unit) => unit * 120));
      return plans.length >= 256;
    }
    if (plan.length >= 8) return false;
    for (const unit of RHYTHM_UNITS) {
      if (unit > remaining) continue;
      if (visit(remaining - unit, [...plan, unit])) return true;
    }
    return false;
  }
  visit(totalUnits, []);
  return plans;
}

function directPitches(startPitch, targetPitch, count, context, range) {
  const path = directMove(startPitch, targetPitch, context, range.minPitch, range.maxPitch);
  const interior = path.slice(1, -1);
  if (interior.length === 0) return Array.from({ length: count }, () => path[0]);
  return Array.from({ length: count }, (_unused, index) => {
    const position = Math.min(interior.length - 1, Math.floor(index * interior.length / count));
    return interior[position];
  });
}

function priorSequence(context) {
  const earlier = context.neighboringNotes
    .filter((note) => note.startTick + note.durationTicks <= context.leftAnchor.startTick)
    .slice(-2);
  if (earlier.length < 2) return [1, -1];
  const scale = scalePitches(context, 0, 127);
  const first = nearestScalePitch(earlier[0].pitch, context, 0, 127);
  const second = nearestScalePitch(earlier[1].pitch, context, 0, 127);
  const firstIndex = scale.indexOf(first);
  const secondIndex = scale.indexOf(second);
  const interval = Math.max(1, Math.min(5, Math.abs(secondIndex - firstIndex)));
  return [secondIndex >= firstIndex ? interval : -interval, secondIndex >= firstIndex ? 1 : -1];
}

function pitchesForMove(move, count, context, range, variation) {
  const left = nearestScalePitch(context.leftAnchor.pitch, context, range.minPitch, range.maxPitch);
  const right = nearestScalePitch(context.rightAnchor.pitch, context, range.minPitch, range.maxPitch);
  const direction = right > left ? 1 : right < left ? -1 : (variation % 2 === 0 ? 1 : -1);
  let pitches = directPitches(left, right, count, context, range);

  if (move === "passing" && count > 0) {
    const passings = scalePassingNotes(left, right, context, range.minPitch, range.maxPitch);
    if (count < passings.length || passings.length === 0) return null;
    pitches = Array.from({ length: count }, (_unused, index) => passings[Math.min(index, passings.length - 1)]);
  } else if (move === "neighbor" && count >= 2) {
    const neighbor = neighborNote(left, context, variation % 2 === 0 ? 1 : -1, range.minPitch, range.maxPitch);
    if (neighbor) {
      pitches[0] = neighbor.neighborPitch;
      pitches[1] = neighbor.pitches[1];
    }
  } else if (move === "approach" && count > 0) {
    pitches[count - 1] = approachNote(right, left, context, range.minPitch, range.maxPitch);
  } else if (move === "leap" && count > 0) {
    const leap = leapNote(left, direction, context, 3 + variation % 2, range.minPitch, range.maxPitch);
    if (leap !== null) {
      pitches[0] = leap;
      for (let index = 1; index < count; index += 1) {
        pitches[index] = approachNote(right, pitches[index - 1], context, range.minPitch, range.maxPitch);
      }
    }
  } else if (move === "leap-resolution" && count >= 2) {
    const leap = leapResolution(left, direction, context, 3 + variation % 2, range.minPitch, range.maxPitch);
    if (leap) {
      pitches[0] = leap.leapPitch;
      pitches[1] = leap.resolutionPitch;
      for (let index = 2; index < count; index += 1) {
        pitches[index] = approachNote(right, pitches[index - 1], context, range.minPitch, range.maxPitch);
      }
    }
  } else if (move === "repetition" && count >= 2) {
    const repeatCount = Math.min(count - 1, 1 + variation % 2);
    const repeated = repetition(left, repeatCount);
    pitches.splice(0, repeatCount, ...repeated);
  } else if (move === "sequence" && count > 0) {
    pitches = sequence(left, priorSequence(context), count, context, range.minPitch, range.maxPitch);
    if (count > 1) pitches[count - 1] = approachNote(right, pitches[count - 2], context, range.minPitch, range.maxPitch);
  }

  return pitches.map((pitch) => nearestScalePitch(pitch, context, range.minPitch, range.maxPitch));
}

function candidateSignature(notes, gap) {
  return JSON.stringify(notes.map((note) => [note.pitch, note.startTick - gap.startTick, note.durationTicks]));
}

function makeCandidate(pitches, durations, gap, seed, move, generationIndex) {
  const notes = [];
  let startTick = gap.startTick;
  for (let index = 0; index < pitches.length; index += 1) {
    notes.push({ pitch: pitches[index], startTick, durationTicks: durations[index] });
    startTick += durations[index];
  }
  if (startTick !== gap.endTick || notes.length === 0) return null;
  const signature = candidateSignature(notes, gap);
  return { signature, move, generationIndex, seed, notes };
}

function chooseSingleNoteCandidates(context, range, rhythms, seed, startIndex, count) {
  const duration = context.gap.endTick - context.gap.startTick;
  const oneEvent = rhythms.find((plan) => plan.length === 1);
  if (!oneEvent) return [];
  const midpoint = (context.leftAnchor.pitch + context.rightAnchor.pitch) / 2;
  const pitches = scalePitches(context, range.minPitch, range.maxPitch)
    .sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint) || left - right);
  return pitches.slice(startIndex, startIndex + count).map((pitch, index) =>
    makeCandidate([pitch], [duration], context.gap, seed, "approach", index));
}

function materializeCandidate(candidate, seed) {
  const id = `candidate-${seed.toString(36)}-${stableHash(candidate.signature).toString(36)}`;
  return {
    id,
    seed,
    notes: candidate.notes.map((note, index) => ({ ...note, id: `${id}:note:${index + 1}` })),
    score: 0,
    scoreBreakdown: {},
    metadata: {},
    sourceMoves: [candidate.move],
    generationIndex: candidate.generationIndex
  };
}

export function generateGap(song, request) {
  const context = createGenerationContext(song, request);
  const options = normalizeOptions(request);
  const rhythms = enumerateRhythmPlans(context.gap.endTick - context.gap.startTick);
  if (rhythms.length === 0) fail("generation-gap-too-long");

  const scaleNotes = scalePitches(context, options.voiceRange.minPitch, options.voiceRange.maxPitch);
  if (scaleNotes.length === 0) fail("generation-range-has-no-scale-tones");
  const random = createRandom(options.seed);
  const seen = new Set();
  const pool = [];
  let generationIndex = 0;

  for (const move of MOVE_NAMES) {
    for (let variant = 0; variant < 2; variant += 1) {
      const durations = rhythms[Math.floor(random() * rhythms.length)];
      const pitches = pitchesForMove(move, durations.length, context, options.voiceRange, variant + Math.floor(random() * 2));
      if (!pitches) continue;
      const candidate = makeCandidate(pitches, durations, context.gap, options.seed, move, generationIndex++);
      if (!candidate || seen.has(candidate.signature)) continue;
      seen.add(candidate.signature);
      pool.push(candidate);
    }
  }

  if (pool.length < options.candidateCount && rhythms.some((plan) => plan.length === 1)) {
    for (const candidate of chooseSingleNoteCandidates(context, options.voiceRange, rhythms, options.seed, 0, scaleNotes.length)) {
      if (!candidate || seen.has(candidate.signature)) continue;
      seen.add(candidate.signature);
      pool.push({ ...candidate, generationIndex: generationIndex++ });
    }
  }

  const start = Math.floor(random() * pool.length);
  const ordered = pool.length === 0 ? [] : [...pool.slice(start), ...pool.slice(0, start)];
  const selected = ordered.slice(0, options.candidateCount);
  if (selected.length < 4) fail("generation-insufficient-candidates");
  const candidates = selected.map((candidate) => materializeCandidate(candidate, options.seed));
  return {
    seed: options.seed,
    generatorVersion: GENERATOR_VERSION,
    gap: { ...context.gap },
    voiceRange: options.voiceRange,
    expectedSyllableCount: options.expectedSyllableCount ?? null,
    candidates
  };
}

export const GENERATION_PRIMITIVES = MOVE_NAMES;
