import { MelodiError, PPQ } from "../core/model.js?v=20261003.92";

const INTERVALS = { major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8] };

function settings(song, options, channel, styles) {
  const style = options.style ?? song.sketch?.[channel]?.style ?? styles[0];
  if (!styles.includes(style)) throw new MelodiError(`sketch-invalid-${channel}-style`);
  const startTick = options.startTick ?? 0;
  const endTick = options.endTick ?? Infinity;
  if (!Number.isSafeInteger(startTick) || startTick < 0 || (endTick !== Infinity && !Number.isSafeInteger(endTick)) || endTick <= startTick) throw new MelodiError("sketch-invalid-range");
  return { style, startTick, endTick };
}

function chords(song) {
  return [...(song.chords ?? [])].sort((a, b) => a.startTick - b.startTick || String(a.id).localeCompare(String(b.id)));
}

function voicings(chord) {
  const classes = INTERVALS[chord.quality].map(interval => (chord.rootPitchClass + interval) % 12);
  const result = [];
  for (let bottom = 48; bottom <= 64; bottom += 1) {
    const inversion = classes.indexOf(bottom % 12);
    if (inversion < 0) continue;
    const pitches = [bottom];
    for (let voice = 1; voice < 3; voice += 1) {
      let pitch = pitches.at(-1) + 1;
      while (pitch % 12 !== classes[(inversion + voice) % 3]) pitch += 1;
      pitches.push(pitch);
    }
    if (pitches.at(-1) <= 72) result.push(pitches);
  }
  return result;
}

function chooseVoicing(song, chord, previous) {
  const melody = (song.notes ?? []).filter(note => note.startTick < chord.startTick + chord.durationTicks && note.startTick + note.durationTicks > chord.startTick);
  const target = melody.length ? Math.max(52, Math.min(60, Math.min(...melody.map(note => note.pitch)) - 8)) : 56;
  return voicings(chord).sort((a, b) => {
    const movement = pitches => previous ? pitches.reduce((sum, pitch, index) => sum + Math.abs(pitch - previous[index]), 0) : 0;
    const placement = pitches => Math.abs(pitches.reduce((sum, pitch) => sum + pitch, 0) / 3 - target);
    return movement(a) - movement(b) || placement(a) - placement(b) || a[0] - b[0];
  })[0];
}

function add(events, chord, channel, pitch, tick, duration, range, slot) {
  const startTick = Math.max(tick, chord.startTick, range.startTick);
  const endTick = Math.min(tick + duration, chord.startTick + chord.durationTicks, range.endTick);
  if (endTick > startTick) events.push({ id: `${channel}:${chord.id}:${slot}:${pitch}`, pitch, startTick, durationTicks: endTick - startTick, chordId: chord.id, channel });
}

function meter(song) {
  const ppq = song.timing?.ppq ?? PPQ;
  const signature = song.timing?.timeSignature ?? { numerator: 4, denominator: 4 };
  const unit = ppq * 4 / signature.denominator;
  return { unit, compound: signature.denominator === 8 && signature.numerator >= 6 && signature.numerator % 3 === 0 };
}

/** Derive guide notes without changing canonical melody or chord data. */
export function planHarmonyEvents(song, options = {}) {
  const range = settings(song, options, "harmony", ["block", "arpeggio"]);
  const events = [];
  let previous;
  const { unit, compound } = meter(song);
  for (const chord of chords(song)) {
    if (!Object.hasOwn(INTERVALS, chord.quality)) continue;
    const pitches = chooseVoicing(song, chord, previous);
    previous = pitches;
    if (range.style === "block") pitches.forEach((pitch, index) => add(events, chord, "harmony", pitch, chord.startTick, chord.durationTicks, range, index));
    else {
      const pattern = compound ? [0, 1, 2, 1, 2, 0] : [0, 1, 2, 1];
      for (let tick = chord.startTick, index = 0; tick < chord.startTick + chord.durationTicks; tick += unit, index += 1) add(events, chord, "harmony", pitches[pattern[index % pattern.length]], tick, unit, range, index);
    }
  }
  return events.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.id.localeCompare(b.id));
}

export function planBassEvents(song, options = {}) {
  const range = settings(song, options, "bass", ["root", "root-fifth"]);
  const events = [];
  const { unit, compound } = meter(song);
  for (const chord of chords(song)) {
    if (!Object.hasOwn(INTERVALS, chord.quality)) continue;
    const root = 36 + chord.rootPitchClass;
    if (range.style === "root") add(events, chord, "bass", root, chord.startTick, chord.durationTicks, range, 0);
    else {
      const pulse = unit * (compound ? 3 : 1);
      const fifth = root + INTERVALS[chord.quality][2];
      for (let tick = chord.startTick, index = 0; tick < chord.startTick + chord.durationTicks; tick += pulse, index += 1) add(events, chord, "bass", index % 2 ? fifth : root, tick, pulse, range, index);
    }
  }
  return events;
}
