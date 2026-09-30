import { MelodiError, PPQ } from "../core/model.js?v=20260930.26";

const MAJOR = "0,2,4,5,7,9,11";
const MINOR = "0,2,3,5,7,8,10";
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

function tonic(key) {
  const match = /^([A-G])([#b]?)(?:m)?$/.exec(key ?? "");
  if (!match) throw new MelodiError("harmony-invalid-key");
  return ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) + 12) % 12;
}

export function deriveDiatonicTriads(song) {
  const root = tonic(song.key);
  const intervals = song.scale.intervals;
  if (intervals.length !== 7) throw new MelodiError("harmony-unsupported-scale");
  const ordinary = [MAJOR, MINOR].includes(intervals.join(","));
  return intervals.flatMap((interval, degree) => {
    const third = (intervals[(degree + 2) % 7] - interval + 12) % 12;
    const fifth = (intervals[(degree + 4) % 7] - interval + 12) % 12;
    const quality = third === 4 && fifth === 7 ? "major" : third === 3 && fifth === 7 ? "minor" : third === 3 && fifth === 6 ? "diminished" : null;
    if (!quality) return [];
    const rootPitchClass = (root + interval) % 12;
    // Model fungsi sengaja terbatas; skala lain tidak diberi kepastian palsu.
    const family = [0, 2, 5].includes(degree) ? "tonic" : [1, 3].includes(degree) ? "predominant" : "dominant";
    const numeral = quality === "major" ? ROMAN[degree] : ROMAN[degree].toLowerCase();
    return [{ rootPitchClass, quality, scaleDegree: degree + 1, romanNumeral: numeral + (quality === "diminished" ? "°" : ""), function: ordinary ? family : "other", chordTonePitchClasses: [rootPitchClass, (rootPitchClass + third) % 12, (rootPitchClass + fifth) % 12] }];
  });
}

function timelineEnd(song) {
  let end = song.notes.reduce((value, note) => Math.max(value, note.startTick + note.durationTicks), 0);
  for (const track of song.tracks ?? []) {
    if (track.kind === "percussion") for (const hit of track.events) end = Math.max(end, hit.startTick + (hit.durationTicks ?? 1));
  }
  return end;
}

function metricWeight(song, tick) {
  const beat = PPQ * 4 / song.timing.timeSignature.denominator;
  const bar = beat * song.timing.timeSignature.numerator;
  if (tick % bar === 0) return 2;
  if (tick % beat === 0) return 1.5;
  return 1;
}

export function suggestHarmony(song, range = {}) {
  if (!range || typeof range !== "object" || Array.isArray(range)) throw new MelodiError("harmony-invalid-range");
  const { startTick, endTick } = range;
  if (!Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTick) || startTick < 0 || endTick <= startTick || endTick > timelineEnd(song)) throw new MelodiError("harmony-invalid-range");
  const notes = song.notes.filter(note => note.startTick < endTick && note.startTick + note.durationTicks > startTick);
  if (!notes.length) throw new MelodiError("harmony-empty-range");
  const durationTicks = endTick - startTick;
  return deriveDiatonicTriads(song).map(triad => {
    let totalWeight = 0;
    let matchedWeight = 0;
    let penaltyWeight = 0;
    let matchedDurationTicks = 0;
    let nonChordDurationTicks = 0;
    const matched = new Set();
    for (const note of notes) {
      const overlap = Math.min(endTick, note.startTick + note.durationTicks) - Math.max(startTick, note.startTick);
      const strength = metricWeight(song, note.startTick);
      const weight = overlap * strength;
      totalWeight += weight;
      const pitchClass = note.pitch % 12;
      if (triad.chordTonePitchClasses.includes(pitchClass)) {
        matchedWeight += weight;
        matchedDurationTicks += overlap;
        matched.add(pitchClass);
      } else {
        nonChordDurationTicks += overlap;
        // Silang kuat yang ditahan mendapat penalti lebih besar dari nada lewat.
        if (strength > 1 && overlap >= PPQ / 2) penaltyWeight += weight;
      }
    }
    const weightedCoverage = matchedWeight / totalWeight;
    const score = Number((100 * weightedCoverage - 20 * penaltyWeight / totalWeight + 2 * matched.size).toFixed(6));
    const { chordTonePitchClasses, ...identity } = triad;
    return { ...identity, id: `harmony-${startTick}-${endTick}-${triad.scaleDegree}-${triad.rootPitchClass}-${triad.quality}`, startTick, durationTicks, score, metadata: { totalWeight, matchedWeight, penaltyWeight, weightedCoverage, matchedChordToneCount: matched.size, chordTonePitchClasses, matchedDurationTicks, nonChordDurationTicks } };
  }).sort((left, right) => right.score - left.score || left.scaleDegree - right.scaleDegree).slice(0, 4);
}
