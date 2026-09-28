export const PPQ = 480;

export class MelodiError extends Error {
  constructor(code) {
    super(code);
    this.name = "MelodiError";
    this.code = code;
  }
}

function fail(code) {
  throw new MelodiError(code);
}

export function createId() {
  const id = globalThis.crypto?.randomUUID?.();
  if (typeof id !== "string" || id.length === 0) fail("id-unavailable");
  return id;
}

export function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireKeys(value, expected, code = "invalid-project") {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function requireId(value) {
  if (typeof value !== "string" || value.trim().length === 0) fail("invalid-id");
}

function requireText(value, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) fail("invalid-text");
}

function requireTick(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("invalid-tick");
}

function requireDuration(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail("invalid-duration");
}

function requireUniqueIds(values) {
  const seen = new Set();
  for (const value of values) {
    requireId(value);
    if (seen.has(value)) fail("duplicate-id");
    seen.add(value);
  }
}

function requireUniqueReferences(values) {
  const seen = new Set();
  for (const value of values) {
    requireId(value);
    if (seen.has(value)) fail("duplicate-reference");
    seen.add(value);
  }
}

function validatePitchBend(points) {
  if (points === undefined) return;
  if (!Array.isArray(points) || points.length < 2 || points.length > 16) fail("invalid-pitch-bend");
  let previousPosition = -1;
  for (const point of points) {
    requireKeys(point, ["position", "semitones"], "invalid-pitch-bend");
    if (typeof point.position !== "number" || !Number.isFinite(point.position)
      || point.position < 0 || point.position > 1 || point.position <= previousPosition) fail("invalid-pitch-bend");
    if (typeof point.semitones !== "number" || !Number.isFinite(point.semitones)
      || point.semitones < -12 || point.semitones > 12) fail("invalid-pitch-bend");
    previousPosition = point.position;
  }
  if (points[0].position !== 0) fail("invalid-pitch-bend");
}

function validateNote(note) {
  const required = ["id", "pitch", "startTick", "durationTicks", "source", "anchor", "locked"];
  const allowed = new Set([...required, "pitchBend", "volume", "pan"]);
  if (!isRecord(note)
    || required.some((key) => !Object.hasOwn(note, key))
    || Object.keys(note).some((key) => !allowed.has(key))) fail("invalid-note");
  requireId(note.id);
  if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) fail("invalid-pitch");
  requireTick(note.startTick);
  requireDuration(note.durationTicks);
  if (!Number.isSafeInteger(note.startTick + note.durationTicks)) fail("invalid-tick");
  if (note.source !== "user" && note.source !== "generated") fail("invalid-source");
  if (typeof note.anchor !== "boolean" || typeof note.locked !== "boolean") fail("invalid-note-flags");
  validatePitchBend(note.pitchBend);
  if (Object.hasOwn(note, "volume")
    && (typeof note.volume !== "number" || !Number.isFinite(note.volume) || note.volume < 0 || note.volume > 1)) {
    fail("invalid-note-volume");
  }
  if (Object.hasOwn(note, "pan")
    && (typeof note.pan !== "number" || !Number.isFinite(note.pan) || note.pan < -1 || note.pan > 1)) {
    fail("invalid-note-pan");
  }
}

function validateSong(song) {
  requireKeys(song, ["id", "title", "timing", "key", "scale", "sections", "phrases", "notes", "lyrics", "chords"]);
  requireId(song.id);
  requireText(song.title);

  requireKeys(song.timing, ["ppq", "tempo", "timeSignature"]);
  if (song.timing.ppq !== PPQ) fail("invalid-ppq");
  if (typeof song.timing.tempo !== "number" || !Number.isFinite(song.timing.tempo) || song.timing.tempo <= 0) fail("invalid-tempo");
  requireKeys(song.timing.timeSignature, ["numerator", "denominator"]);
  const { numerator, denominator } = song.timing.timeSignature;
  if (!Number.isSafeInteger(numerator) || numerator < 1 || numerator > 32) fail("invalid-time-signature");
  if (!Number.isSafeInteger(denominator) || denominator < 1 || denominator > 32 || (denominator & (denominator - 1)) !== 0) fail("invalid-time-signature");

  requireText(song.key);
  if (!/^[A-G](?:#|b)?(?:m)?$/.test(song.key)) fail("invalid-key");
  requireKeys(song.scale, ["name", "intervals"]);
  requireText(song.scale.name);
  if (!Array.isArray(song.scale.intervals) || song.scale.intervals.length === 0 || song.scale.intervals.length > 12 || song.scale.intervals[0] !== 0) fail("invalid-scale");
  let priorInterval = -1;
  for (const interval of song.scale.intervals) {
    if (!Number.isSafeInteger(interval) || interval < 0 || interval > 11 || interval <= priorInterval) fail("invalid-scale");
    priorInterval = interval;
  }

  for (const list of [song.sections, song.phrases, song.notes, song.chords]) {
    if (!Array.isArray(list)) fail("invalid-project");
  }
  if (!isRecord(song.lyrics)) fail("invalid-lyrics");
  requireKeys(song.lyrics, ["rawText", "syllables"], "invalid-lyrics");
  requireText(song.lyrics.rawText, true);
  if (!Array.isArray(song.lyrics.syllables)) fail("invalid-lyrics");

  const ids = [song.id];
  for (const note of song.notes) {
    validateNote(note);
    ids.push(note.id);
  }

  for (const phrase of song.phrases) {
    requireKeys(phrase, ["id", "noteIds"], "invalid-phrase");
    requireId(phrase.id);
    if (!Array.isArray(phrase.noteIds)) fail("invalid-phrase");
    requireUniqueReferences(phrase.noteIds);
    ids.push(phrase.id);
  }
  for (const section of song.sections) {
    requireKeys(section, ["id", "name", "phraseIds"], "invalid-section");
    requireId(section.id);
    requireText(section.name);
    if (!Array.isArray(section.phraseIds)) fail("invalid-section");
    requireUniqueReferences(section.phraseIds);
    ids.push(section.id);
  }
  for (const syllable of song.lyrics.syllables) {
    requireKeys(syllable, ["id", "text", "noteIds"], "invalid-syllable");
    requireId(syllable.id);
    requireText(syllable.text, true);
    if (!Array.isArray(syllable.noteIds)) fail("invalid-syllable");
    requireUniqueReferences(syllable.noteIds);
    ids.push(syllable.id);
  }
  for (const chord of song.chords) {
    requireKeys(chord, ["id", "rootPitchClass", "quality", "startTick", "durationTicks"], "invalid-chord");
    requireId(chord.id);
    if (!Number.isSafeInteger(chord.rootPitchClass) || chord.rootPitchClass < 0 || chord.rootPitchClass > 11) fail("invalid-chord");
    requireText(chord.quality);
    requireTick(chord.startTick);
    requireDuration(chord.durationTicks);
    if (!Number.isSafeInteger(chord.startTick + chord.durationTicks)) fail("invalid-tick");
    ids.push(chord.id);
  }
  requireUniqueIds(ids);

  const noteIds = new Set(song.notes.map((note) => note.id));
  const phraseIds = new Set(song.phrases.map((phrase) => phrase.id));
  for (const phrase of song.phrases) {
    if (phrase.noteIds.some((id) => !noteIds.has(id))) fail("invalid-reference");
  }
  for (const section of song.sections) {
    if (section.phraseIds.some((id) => !phraseIds.has(id))) fail("invalid-reference");
  }
  for (const syllable of song.lyrics.syllables) {
    if (syllable.noteIds.some((id) => !noteIds.has(id))) fail("invalid-reference");
  }
}

export function createSong(data) {
  validateSong(data);
  return cloneData(data);
}

export function createInitialSong(idFactory = createId) {
  const songId = idFactory();

  // Baseline ini persis mengikuti project share yang dipilih user:
  // 81 BPM internal, A minor, 6/8, 21 note, panjang 8 birama.
  const defaultMelody = [
    { pitch: 69, startTick: 0, durationTicks: 480 },
    { pitch: 74, startTick: 480, durationTicks: 240 },
    { pitch: 76, startTick: 720, durationTicks: 240 },
    {
      pitch: 76, startTick: 960, durationTicks: 720,
      pitchBend: [{ position: 0, semitones: 0 }, { position: 0.3, semitones: 1 }, { position: 1, semitones: 1 }]
    },
    {
      pitch: 76, startTick: 1680, durationTicks: 480,
      pitchBend: [{ position: 0, semitones: 0 }, { position: 0.3, semitones: 1 }, { position: 1, semitones: 1 }]
    },
    { pitch: 76, startTick: 2160, durationTicks: 240 },
    { pitch: 74, startTick: 2400, durationTicks: 480 },

    { pitch: 72, startTick: 2880, durationTicks: 480 },
    { pitch: 74, startTick: 3360, durationTicks: 240 },
    {
      pitch: 74, startTick: 3600, durationTicks: 720,
      pitchBend: [{ position: 0, semitones: 0 }, { position: 0.28, semitones: 2 }, { position: 1, semitones: 2 }]
    },
    {
      pitch: 74, startTick: 4320, durationTicks: 720,
      pitchBend: [
        { position: 0, semitones: 0 },
        { position: 0.22, semitones: 2 },
        { position: 0.42, semitones: 2 },
        { position: 1, semitones: 0 }
      ]
    },
    { pitch: 72, startTick: 5040, durationTicks: 720 },

    { pitch: 69, startTick: 5760, durationTicks: 240 },
    { pitch: 71, startTick: 6000, durationTicks: 240 },
    { pitch: 72, startTick: 6240, durationTicks: 240 },
    {
      pitch: 72, startTick: 6480, durationTicks: 720,
      pitchBend: [{ position: 0, semitones: 0 }, { position: 0.28, semitones: 2 }, { position: 1, semitones: 2 }]
    },
    {
      pitch: 72, startTick: 7200, durationTicks: 720,
      pitchBend: [
        { position: 0, semitones: 0 },
        { position: 0.22, semitones: 2 },
        { position: 0.42, semitones: 2 },
        { position: 1, semitones: 0 }
      ]
    },
    { pitch: 71, startTick: 7920, durationTicks: 720 },

    { pitch: 69, startTick: 8640, durationTicks: 720 },
    { pitch: 67, startTick: 9360, durationTicks: 720 },
    {
      pitch: 67, startTick: 10080, durationTicks: 1440,
      pitchBend: [{ position: 0, semitones: 0 }, { position: 0.24, semitones: 2 }, { position: 1, semitones: 2 }]
    }
  ];

  const notes = defaultMelody.map((note) => ({
    id: idFactory(),
    ...cloneData(note),
    source: "user",
    anchor: false,
    locked: false
  }));

  // Struktur internal default sengaja sederhana: satu phrase untuk seluruh
  // excerpt 8 birama. Jangan membuat section kosong hanya karena payload lama
  // pernah membawa struktur "Bagian 1..8" hasil iterasi UI sebelumnya.
  const phrase = {
    id: idFactory(),
    noteIds: notes.map((note) => note.id)
  };
  const phrases = [phrase];
  const sections = [{
    id: idFactory(),
    name: "Melodi",
    phraseIds: [phrase.id]
  }];

  return createSong({
    id: songId,
    title: "Ide baru",
    timing: { ppq: PPQ, tempo: 81, timeSignature: { numerator: 6, denominator: 8 } },
    key: "Am",
    scale: { name: "minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
    sections,
    phrases,
    notes,
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
}

export function pitchToMidi(value) {
  if (typeof value !== "string") fail("invalid-pitch");
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(value.trim());
  if (!match) fail("invalid-pitch");
  const pitchClasses = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pitchClass = pitchClasses[match[1].toUpperCase()];
  if (match[2] === "#") pitchClass += 1;
  if (match[2] === "b") pitchClass -= 1;
  const octave = Number(match[3]);
  const midi = (octave + 1) * 12 + pitchClass;
  if (!Number.isSafeInteger(midi) || midi < 0 || midi > 127) fail("invalid-pitch");
  return midi;
}

export function midiToPitch(pitch) {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) fail("invalid-pitch");
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}
