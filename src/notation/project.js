const SHARP_KEYS = new Set(["C", "G", "D", "A", "E", "B", "F#", "C#", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"]);
const NOTE_NAMES = Object.freeze({
  sharp: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  flat: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
});
const NATURAL_PITCH_CLASSES = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
const LETTERS = Object.freeze(["C", "D", "E", "F", "G", "A", "B"]);
const MAJOR_INTERVALS = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
const MINOR_INTERVALS = Object.freeze([0, 2, 3, 5, 7, 8, 10]);
const MAX_SCORE_MEASURES = 128;
const MAX_SCORE_VOICES = 8;

function compareIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function durationTypes(ppq) {
  return [
    { ticks: ppq * 4, value: "w", dots: 0 },
    { ticks: ppq * 3, value: "h", dots: 1 },
    { ticks: ppq * 2, value: "h", dots: 0 },
    { ticks: ppq * 1.5, value: "q", dots: 1 },
    { ticks: ppq, value: "q", dots: 0 },
    { ticks: ppq * 0.75, value: "8", dots: 1 },
    { ticks: ppq / 2, value: "8", dots: 0 },
    { ticks: ppq * 0.375, value: "16", dots: 1 },
    { ticks: ppq / 4, value: "16", dots: 0 },
    { ticks: ppq * 0.1875, value: "32", dots: 1 },
    { ticks: ppq / 8, value: "32", dots: 0 }
  ].filter((type) => Number.isSafeInteger(type.ticks));
}

function exactDuration(ticks, types) {
  return types.find((type) => type.ticks === ticks) ?? null;
}

function decomposeRest(ticks, types) {
  const pieces = [];
  let remaining = ticks;
  while (remaining > 0) {
    const type = types.find((candidate) => candidate.ticks <= remaining);
    if (!type) return null;
    pieces.push({ ...type });
    remaining -= type.ticks;
  }
  return pieces;
}

function keyUsesFlats(key) {
  return !SHARP_KEYS.has(key);
}

export function spellPitchNameInKey(pitch, key) {
  const flatPreference = keyUsesFlats(key);
  const spelling = spellPitchInKey(pitch, key, flatPreference);
  return `${spelling.step}${spelling.accidental ?? ""}`;
}

function spellPitch(pitch, flatPreference) {
  const spelling = (flatPreference ? NOTE_NAMES.flat : NOTE_NAMES.sharp)[pitch % 12];
  const match = /^([A-G])([#b]?)$/.exec(spelling);
  return {
    step: match[1],
    accidental: match[2] || null,
    octave: Math.floor(pitch / 12) - 1,
    key: `${match[1].toLowerCase()}${match[2]}/${Math.floor(pitch / 12) - 1}`
  };
}

function spellPitchInKey(pitch, key, flatPreference) {
  const match = /^([A-G])([#b]?)(m?)$/.exec(key ?? "");
  if (!match) return spellPitch(pitch, flatPreference);
  const [, tonic, tonicAccidental, minor] = match;
  const tonicPitchClass = (NATURAL_PITCH_CLASSES[tonic] + (tonicAccidental === "#" ? 1 : tonicAccidental === "b" ? -1 : 0) + 12) % 12;
  const intervals = minor ? MINOR_INTERVALS : MAJOR_INTERVALS;
  const tonicIndex = LETTERS.indexOf(tonic);
  const pitchClass = pitch % 12;
  for (let degree = 0; degree < LETTERS.length; degree += 1) {
    const step = LETTERS[(tonicIndex + degree) % LETTERS.length];
    const expectedPitchClass = (tonicPitchClass + intervals[degree]) % 12;
    if (expectedPitchClass !== pitchClass) continue;
    let accidentalOffset = expectedPitchClass - NATURAL_PITCH_CLASSES[step];
    while (accidentalOffset > 6) accidentalOffset -= 12;
    while (accidentalOffset < -6) accidentalOffset += 12;
    if (accidentalOffset < -2 || accidentalOffset > 2) break;
    const accidental = accidentalOffset === 2 ? "##"
      : accidentalOffset === 1 ? "#"
        : accidentalOffset === -1 ? "b"
          : accidentalOffset === -2 ? "bb" : "";
    for (let octave = Math.floor(pitch / 12) - 2; octave <= Math.floor(pitch / 12) + 1; octave += 1) {
      const noteMidi = (octave + 1) * 12 + NATURAL_PITCH_CLASSES[step] + accidentalOffset;
      if (noteMidi === pitch) return { step, accidental: accidental || null, octave, key: `${step.toLowerCase()}${accidental}/${octave}` };
    }
    break;
  }
  return spellPitch(pitch, flatPreference);
}

function assignLanes(segments, fallbackNoteIds, overlapNoteIds) {
  const lanes = [];
  for (const segment of [...segments].sort((left, right) => left.startTick - right.startTick || compareIds(left.noteId, right.noteId))) {
    const overlappingLanes = lanes.filter((candidate) => candidate.endTick > segment.startTick);
    for (const candidate of overlappingLanes) {
      overlapNoteIds.add(segment.noteId);
      overlapNoteIds.add(candidate.events[candidate.events.length - 1].noteId);
    }
    let lane = lanes.find((candidate) => candidate.endTick <= segment.startTick);
    if (!lane) {
      if (lanes.length >= MAX_SCORE_VOICES) {
        segment.fallbackReason = "voice-limit";
        fallbackNoteIds.add(segment.noteId);
        continue;
      }
      lane = { index: lanes.length, endTick: 0, events: [], renderable: true, fallbackNoteIds: [] };
      lanes.push(lane);
    }
    segment.laneIndex = lane.index;
    lane.events.push(segment);
    lane.endTick = segment.startTick + segment.durationTicks;
    if (!segment.notation) {
      lane.renderable = false;
      lane.fallbackNoteIds.push(segment.noteId);
    }
  }
  return lanes;
}

function buildLaneContent(lane, measure, types, fallbackWarnings, fallbackNoteIds) {
  const events = [];
  let cursorTick = measure.startTick;
  for (const segment of lane.events) {
    if (segment.startTick > cursorTick) {
      const restTicks = segment.startTick - cursorTick;
      const pieces = decomposeRest(restTicks, types);
      if (pieces) {
        let restStartTick = cursorTick;
        for (const piece of pieces) {
          events.push({ kind: "rest", startTick: restStartTick, durationTicks: piece.ticks, measureIndex: measure.index, notation: piece });
          restStartTick += piece.ticks;
        }
      } else {
        lane.renderable = false;
        lane.fallbackNoteIds.push(...lane.events.map((event) => event.noteId));
        lane.fallbackNoteIds.forEach((noteId) => fallbackNoteIds.add(noteId));
      }
    }
    events.push(segment);
    cursorTick = Math.max(cursorTick, segment.startTick + segment.durationTicks);
  }
  if (cursorTick < measure.endTick) {
    const restTicks = measure.endTick - cursorTick;
    const pieces = decomposeRest(restTicks, types);
    if (pieces) {
      let restStartTick = cursorTick;
      for (const piece of pieces) {
        events.push({ kind: "rest", startTick: restStartTick, durationTicks: piece.ticks, measureIndex: measure.index, notation: piece });
        restStartTick += piece.ticks;
      }
    } else {
      lane.renderable = false;
      lane.fallbackNoteIds.push(...lane.events.map((event) => event.noteId));
      lane.fallbackNoteIds.forEach((noteId) => fallbackNoteIds.add(noteId));
    }
  }
  if (!lane.renderable) {
    lane.events.filter((event) => event.kind === "note").forEach((event) => {
      lane.fallbackNoteIds.push(event.noteId);
      fallbackNoteIds.add(event.noteId);
    });
  }
  if (!lane.renderable && lane.fallbackNoteIds.length) {
    fallbackWarnings.push({ code: "unsupported-rhythm", noteIds: [...new Set(lane.fallbackNoteIds)].sort(compareIds), measureIndex: measure.index });
  }
  return events;
}

/** Project canonical ticks to deterministic, read-only score segments. */
export function projectSongToScore(song) {
  const ppq = song?.timing?.ppq;
  const numerator = song?.timing?.timeSignature?.numerator;
  const denominator = song?.timing?.timeSignature?.denominator;
  if (!Number.isSafeInteger(ppq) || ppq <= 0
    || !Number.isSafeInteger(numerator) || numerator <= 0
    || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new TypeError("invalid-score-timing");
  }
  const ticksPerMeasure = ppq * 4 * numerator / denominator;
  if (!Number.isSafeInteger(ticksPerMeasure) || ticksPerMeasure <= 0 || !Array.isArray(song.notes)) {
    throw new TypeError("invalid-score-timing");
  }

  const types = durationTypes(ppq);
  const flatPreference = keyUsesFlats(song.key);
  const songEndTick = [...song.notes, ...(song.chords ?? [])]
    .reduce((end, event) => Math.max(end, event.startTick + event.durationTicks), 0);
  const totalMeasureCount = Math.max(1, Math.ceil(songEndTick / ticksPerMeasure));
  const measureCount = Math.min(totalMeasureCount, MAX_SCORE_MEASURES);
  const scoreEndTick = measureCount * ticksPerMeasure;
  const measures = Array.from({ length: measureCount }, (_, index) => ({
    index,
    startTick: index * ticksPerMeasure,
    endTick: (index + 1) * ticksPerMeasure,
    segments: [],
    lanes: [],
    rests: [],
    chords: []
  }));

  const warnings = [];
  const fallbackNoteIds = new Set();
  const windowLimitNoteIds = new Set();
  for (const note of [...song.notes].sort((left, right) => left.startTick - right.startTick || compareIds(left.id, right.id))) {
    const noteEndTick = note.startTick + note.durationTicks;
    const firstMeasure = Math.floor(note.startTick / ticksPerMeasure);
    const lastMeasure = Math.floor((noteEndTick - 1) / ticksPerMeasure);
    if (firstMeasure >= measureCount) {
      windowLimitNoteIds.add(note.id);
      fallbackNoteIds.add(note.id);
      continue;
    }
    if (lastMeasure >= measureCount) {
      windowLimitNoteIds.add(note.id);
      fallbackNoteIds.add(note.id);
    }
    for (let measureIndex = firstMeasure; measureIndex <= Math.min(lastMeasure, measureCount - 1); measureIndex += 1) {
      const measure = measures[measureIndex];
      const startTick = Math.max(note.startTick, measure.startTick);
      const endTick = Math.min(noteEndTick, measure.endTick);
      const durationTicks = endTick - startTick;
      const segment = {
        kind: "note",
        noteId: note.id,
        pitch: note.pitch,
        spelling: spellPitchInKey(note.pitch, song.key, flatPreference),
        startTick,
        durationTicks,
        measureIndex,
        tieFromPrevious: startTick > note.startTick,
        tieToNext: endTick < noteEndTick && measureIndex + 1 < measureCount,
        notation: exactDuration(durationTicks, types)
      };
      measure.segments.push(segment);
    }
  }

  const fallbackChordIds = new Set();
  const chordWindowLimitIds = new Set();
  for (const chord of [...(song.chords ?? [])].sort((left, right) => left.startTick - right.startTick || compareIds(left.id, right.id))) {
    const measureIndex = Math.floor(chord.startTick / ticksPerMeasure);
    if (measureIndex >= measureCount) {
      fallbackChordIds.add(chord.id);
      chordWindowLimitIds.add(chord.id);
      continue;
    }
    measures[measureIndex].chords.push({
      chordId: chord.id,
      rootPitchClass: chord.rootPitchClass,
      rootName: spellPitchNameInKey(60 + chord.rootPitchClass, song.key),
      quality: chord.quality,
      startTick: chord.startTick,
      durationTicks: chord.durationTicks,
      measureIndex
    });
  }

  for (const measure of measures) {
    measure.segments.sort((left, right) => left.startTick - right.startTick || compareIds(left.noteId, right.noteId));
    const overlapNoteIds = new Set();
    measure.lanes = measure.segments.length
      ? assignLanes(measure.segments, fallbackNoteIds, overlapNoteIds)
      : [{ index: 0, endTick: measure.startTick, events: [], renderable: true, fallbackNoteIds: [] }];
    const overLimitIds = measure.segments.filter((segment) => segment.fallbackReason === "voice-limit").map((segment) => segment.noteId);
    if (overLimitIds.length) warnings.push({ code: "voice-limit", noteIds: [...new Set(overLimitIds)].sort(compareIds), measureIndex: measure.index });
    if (overlapNoteIds.size) {
      warnings.push({
        code: "overlapping-notes",
        noteIds: [...overlapNoteIds].sort(compareIds),
        measureIndex: measure.index
      });
    }
    for (const lane of measure.lanes) lane.events = buildLaneContent(lane, measure, types, warnings, fallbackNoteIds);
    measure.rests = measure.lanes.flatMap((lane) => lane.events.filter((event) => event.kind === "rest"));
  }

  if (windowLimitNoteIds.size) {
    warnings.push({ code: "score-window-limit", noteIds: [...windowLimitNoteIds].sort(compareIds), measureIndex: measureCount - 1 });
  }
  if (chordWindowLimitIds.size) {
    warnings.push({ code: "score-chord-window-limit", chordIds: [...chordWindowLimitIds].sort(compareIds), measureIndex: measureCount - 1 });
  }

  const unsupportedNoteIds = [...new Set(measures.flatMap((measure) => measure.segments
    .filter((segment) => !segment.notation)
    .map((segment) => segment.noteId)))].sort(compareIds);
  const fallbackIds = [...fallbackNoteIds].sort(compareIds);
  return {
    ppq,
    key: song.key,
    keySignature: song.key,
    timeSignature: { numerator, denominator },
    ticksPerMeasure,
    status: warnings.some((warning) => warning.code === "unsupported-rhythm") ? "unsupported-rhythm" : warnings.length ? "warning" : "ready",
    warnings,
    unsupportedNoteIds,
    fallbackNoteIds: fallbackIds,
    fallbackChordIds: [...fallbackChordIds].sort(compareIds),
    totalMeasureCount,
    measureLimit: MAX_SCORE_MEASURES,
    voiceLimit: MAX_SCORE_VOICES,
    truncated: totalMeasureCount > measureCount || scoreEndTick < songEndTick,
    measures
  };
}
