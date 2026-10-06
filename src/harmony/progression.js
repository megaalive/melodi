import { MelodiError } from "../core/model.js?v=20261003.98";
import { songBarTicks, canonicalSongEndTick } from "../core/timeline.js?v=20261003.98";
import { deriveDiatonicTriads } from "./harmony.js?v=20261003.98";

export const HARMONY_PROGRESSION_PRESETS = Object.freeze(["pop", "jazz", "fifths", "ballad"]);

function transition(left, right, preset) {
  const fifth = (left.rootPitchClass - right.rootPitchClass + 12) % 12 === 7;
  const same = left.scaleDegree === right.scaleDegree;
  let score = same ? -5 : 0;
  if (left.function === "predominant" && right.function === "dominant") score += 9;
  if (left.function === "dominant" && right.function === "tonic") score += 10;
  if (preset === "jazz") {
    if (left.scaleDegree === 2 && right.scaleDegree === 5) score += 19;
    if (left.scaleDegree === 5 && right.scaleDegree === 1) score += 19;
    if (fifth) score += 13;
  } else if (preset === "fifths") {
    if (fifth) score += 27;
    if ((left.scaleDegree + 2) % 7 + 1 === right.scaleDegree) score += 12;
  } else if (preset === "pop") {
    if ([[1,5],[5,6],[6,4],[4,1]].some(([a,b]) => left.scaleDegree === a && right.scaleDegree === b)) score += 20;
  } else {
    if (same) score += 10;
    if ([[1,6],[6,4],[4,5],[5,1]].some(([a,b]) => left.scaleDegree === a && right.scaleDegree === b)) score += 15;
  }
  return score;
}

function melodicScores(song, segment, triads, notes) {
  const unit = song.timing.ppq * 4 / song.timing.timeSignature.denominator;
  const bar = songBarTicks(song);
  let total = 0;
  const matched = triads.map(() => 0);
  const penalty = triads.map(() => 0);
  for (const note of notes) {
    const overlap = Math.min(segment.endTick, note.startTick + note.durationTicks) - Math.max(segment.startTick, note.startTick);
    if (overlap <= 0) continue;
    const onset = Math.max(segment.startTick, note.startTick);
    const strength = onset % bar === 0 ? 2 : onset % unit === 0 ? 1.5 : 1;
    const weight = overlap * strength;
    total += weight;
    triads.forEach((triad, index) => {
      if (triad.chordTonePitchClasses.includes(note.pitch % 12)) matched[index] += weight;
      else if (strength > 1 && overlap >= unit / 2) penalty[index] += weight;
    });
  }
  return triads.map((_, index) => total ? 100 * matched[index] / total - 20 * penalty[index] / total : 0);
}

export function generateHarmonyProgression(song, request = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new MelodiError("harmony-invalid-range");
  const preset = request.preset ?? "pop";
  if (!HARMONY_PROGRESSION_PRESETS.includes(preset)) throw new MelodiError("harmony-invalid-preset");
  const end = canonicalSongEndTick(song);
  const startTick = request.startTick ?? 0;
  const endTick = request.endTick ?? end;
  if (!Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTick) || startTick < 0 || endTick <= startTick || endTick > end) throw new MelodiError("harmony-invalid-range");
  if (!song.notes.some(note => note.startTick < endTick && note.startTick + note.durationTicks > startTick)) throw new MelodiError("harmony-empty-range");
  const barTicks = songBarTicks(song);
  const triads = deriveDiatonicTriads(song);
  if (!triads.length) throw new MelodiError("harmony-unsupported-scale");
  const locked = song.chords.filter(chord => chord.locked && chord.startTick < endTick && chord.startTick + chord.durationTicks > startTick).sort((a,b) => a.startTick - b.startTick);
  const segments = [];
  let lockCursor = 0;
  const lockAtStart = new Map(locked.map(chord => [chord.startTick, chord]));
  const lockAtEnd = new Map(locked.map(chord => [chord.startTick + chord.durationTicks, chord]));
  for (let start = startTick; start < endTick;) {
    const stop = Math.min(endTick, (Math.floor(start / barTicks) + 1) * barTicks);
    let cursor = start;
    while (lockCursor < locked.length && locked[lockCursor].startTick + locked[lockCursor].durationTicks <= start) lockCursor++;
    for (let lockIndex = lockCursor; lockIndex < locked.length; lockIndex++) {
      const chord = locked[lockIndex];
      const lockEnd = chord.startTick + chord.durationTicks;
      if (lockEnd <= cursor) continue;
      if (chord.startTick >= stop) break;
      if (chord.startTick > cursor) segments.push({startTick: cursor, endTick: Math.min(chord.startTick,stop)});
      cursor = Math.max(cursor,lockEnd);
      if (cursor >= stop) break;
    }
    if (cursor < stop) segments.push({startTick:cursor,endTick:stop});
    start = stop;
  }
  const sortedNotes = [...song.notes].sort((a,b) => a.startTick - b.startTick);
  let noteCursor = 0;
  let activeNotes = [];
  const scores = segments.map(segment => {
    activeNotes = activeNotes.filter(note => note.startTick + note.durationTicks > segment.startTick);
    while (noteCursor < sortedNotes.length && sortedNotes[noteCursor].startTick < segment.endTick) activeNotes.push(sortedNotes[noteCursor++]);
    return melodicScores(song,segment,triads,activeNotes);
  });
  const predecessors = [];
  let previous = null;
  segments.forEach((segment,index) => {
    const back = [];
    const values = triads.map((triad,right) => {
      let best = 0;
      let from = -1;
      const precedingLock = lockAtEnd.get(segment.startTick);
      const lockTriad = precedingLock && triads.find(item => item.rootPitchClass === precedingLock.rootPitchClass && item.quality === precedingLock.quality);
      if (index && segments[index - 1].endTick === segment.startTick) {
        best = -Infinity;
        triads.forEach((left,leftIndex) => {
          const value = previous[leftIndex] + transition(left,triad,preset);
          if (value > best) { best = value; from = leftIndex; }
        });
      } else {
        best = index ? Math.max(...previous) : 0;
        from = index ? previous.indexOf(best) : -1;
        if (lockTriad) best += transition(lockTriad,triad,preset);
      }
      back[right] = from;
      const followingLock = lockAtStart.get(segment.endTick);
      const followingTriad = followingLock && triads.find(item => item.rootPitchClass === followingLock.rootPitchClass && item.quality === followingLock.quality);
      const phraseEnd = segment.endTick === endTick || (segment.endTick % (4 * barTicks) === 0);
      return best + scores[index][right] + (followingTriad ? transition(triad,followingTriad,preset) : 0) + (index === 0 && triad.scaleDegree === 1 ? 8 : 0)
        + (phraseEnd && triad.scaleDegree === 1 ? 16 : 0)
        + (!phraseEnd && (Math.floor(segment.startTick / barTicks) % 4 === 2) && triad.scaleDegree === 5 ? 8 : 0);
    });
    predecessors.push(back);
    previous = values;
  });
  const chosen = [];
  let current = previous ? previous.indexOf(Math.max(...previous)) : -1;
  for (let index = segments.length - 1; index >= 0; index--) { chosen[index] = current; current = predecessors[index][current]; }
  const chords = segments.map((segment,index) => {
    const triad = triads[chosen[index]];
    const alternatives = triads.map((item,itemIndex) => ({rootPitchClass:item.rootPitchClass,quality:item.quality,romanNumeral:item.romanNumeral,scaleDegree:item.scaleDegree,score:Number(scores[index][itemIndex].toFixed(3))})).sort((a,b) => b.score - a.score || a.scaleDegree - b.scaleDegree);
    return {startTick:segment.startTick,durationTicks:segment.endTick-segment.startTick,rootPitchClass:triad.rootPitchClass,quality:triad.quality,romanNumeral:triad.romanNumeral,alternatives};
  });
  return {status:"ready",preset,startTick,endTick,barTicks,chords,lockedChordCount:locked.length};
}
