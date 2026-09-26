import test from "node:test";
import assert from "node:assert/strict";
import {
  PPQ,
  createInitialSong,
  createSong,
  midiToPitch,
  pitchToMidi
} from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { deserializeProject, serializeProject } from "../src/core/serialization.js";

function rawFixture() {
  return {
    id: "song-1",
    title: "Ide awal",
    timing: { ppq: PPQ, tempo: 96, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [{ id: "section-1", name: "Verse", phraseIds: ["phrase-1"] }],
    phrases: [{ id: "phrase-1", noteIds: ["note-1", "note-2", "note-3", "note-4"] }],
    notes: [
      { id: "note-1", pitch: 60, startTick: 0, durationTicks: 480, source: "user", anchor: true, locked: false },
      { id: "note-2", pitch: 64, startTick: 480, durationTicks: 480, source: "user", anchor: false, locked: true },
      { id: "note-3", pitch: 69, startTick: 960, durationTicks: 480, source: "generated", anchor: false, locked: false },
      { id: "note-4", pitch: 67, startTick: 1440, durationTicks: 480, source: "user", anchor: false, locked: false }
    ],
    lyrics: {
      rawText: "aku menyanyi",
      syllables: [
        { id: "syllable-1", text: "a", noteIds: [] },
        { id: "syllable-2", text: "ku", noteIds: ["note-1", "note-2"] }
      ]
    },
    chords: [{ id: "chord-1", rootPitchClass: 0, quality: "major", startTick: 0, durationTicks: 1920 }]
  };
}

function fixture() {
  return createSong(rawFixture());
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

test("canonical song validates and uses the fixed PPQ", () => {
  const song = fixture();
  assert.equal(song.timing.ppq, 480);
  assert.equal(song.timing.tempo, 96);
  assert.equal(song.title, "Ide awal");
});

test("C4 E4 A4 G4 use canonical MIDI pitches and derive note names", () => {
  const song = fixture();
  assert.deepEqual(song.notes.map((note) => note.pitch), [60, 64, 69, 67]);
  assert.deepEqual(song.notes.map((note) => midiToPitch(note.pitch)), ["C4", "E4", "A4", "G4"]);
  assert.deepEqual(["C4", "E4", "A4", "G4"].map(pitchToMidi), [60, 64, 69, 67]);
});

test("initial song gets stable, project-unique IDs for each entity", () => {
  let next = 0;
  const song = createInitialSong(() => `generated-${++next}`);
  const ids = [song.id, ...song.notes.map((item) => item.id), ...song.phrases.map((item) => item.id), ...song.sections.map((item) => item.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(song.notes.map((note) => note.pitch), [60, 64, 69, 67]);
});

test("duplicate entity IDs across the project are rejected", () => {
  const song = fixture();
  song.lyrics.syllables[0].id = song.notes[0].id;
  expectCode(() => createSong(song), "duplicate-id");
});

test("zero or negative note duration is rejected", () => {
  for (const durationTicks of [0, -1]) {
    const song = fixture();
    song.notes[0].durationTicks = durationTicks;
    expectCode(() => createSong(song), "invalid-duration");
  }
});

test("non-integer and unsafe musical ticks are rejected", () => {
  for (const startTick of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
    const song = fixture();
    song.notes[0].startTick = startTick;
    expectCode(() => createSong(song), "invalid-tick");
  }
});

test("out-of-range canonical MIDI pitch is rejected", () => {
  const song = fixture();
  song.notes[0].pitch = 128;
  expectCode(() => createSong(song), "invalid-pitch");
  expectCode(() => pitchToMidi("C10"), "invalid-pitch");
});

test("invalid note provenance is rejected", () => {
  const song = fixture();
  song.notes[0].source = "assistant";
  expectCode(() => createSong(song), "invalid-source");
});

test("scale intervals start at the song key tonic", () => {
  const song = fixture();
  song.scale.intervals = [2, 4, 5, 7, 9, 11];
  expectCode(() => createSong(song), "invalid-scale");
});

test("phrase, section, and syllable references must resolve", () => {
  const song = fixture();
  song.lyrics.syllables[1].noteIds.push("missing-note");
  expectCode(() => createSong(song), "invalid-reference");
  const other = fixture();
  other.sections[0].phraseIds = ["missing-phrase"];
  expectCode(() => createSong(other), "invalid-reference");
});

test("generator cannot update an anchor note", () => {
  const commands = createCommands(fixture());
  const before = commands.getSong();
  expectCode(() => commands.updateNote("note-1", { pitch: 61 }, { actor: "generator" }), "protected-note");
  assert.deepEqual(commands.getSong(), before);
});

test("generator cannot delete an anchor note", () => {
  const commands = createCommands(fixture());
  const before = commands.getSong();
  expectCode(() => commands.deleteNote("note-1", { actor: "generator" }), "protected-note");
  assert.deepEqual(commands.getSong(), before);
});

test("generator cannot update a locked note", () => {
  const commands = createCommands(fixture());
  const before = commands.getSong();
  expectCode(() => commands.updateNote("note-2", { pitch: 65 }, { actor: "generator" }), "protected-note");
  assert.deepEqual(commands.getSong(), before);
});

test("generator cannot delete a locked note", () => {
  const commands = createCommands(fixture());
  const before = commands.getSong();
  expectCode(() => commands.deleteNote("note-2", { actor: "generator" }), "protected-note");
  assert.deepEqual(commands.getSong(), before);
});

test("generator cannot clear anchor or lock through a patch or flag command", () => {
  const commands = createCommands(fixture());
  const before = commands.getSong();
  expectCode(() => commands.updateNote("note-1", { pitch: 62, anchor: false }, { actor: "generator" }), "invalid-note-patch");
  expectCode(() => commands.updateNote("note-2", { pitch: 62, locked: false }, { actor: "generator" }), "invalid-note-patch");
  expectCode(() => commands.setAnchor("note-1", false, { actor: "generator" }), "generator-flag-change");
  expectCode(() => commands.setLocked("note-2", false, { actor: "generator" }), "generator-flag-change");
  assert.deepEqual(commands.getSong(), before);
});

test("provenance is independent from mutation actor", () => {
  const commands = createCommands(fixture());
  commands.updateNote("note-4", { pitch: 68 }, { actor: "generator" });
  assert.equal(commands.getSong().notes.find((note) => note.id === "note-4").source, "user");
  commands.updateNote("note-3", { pitch: 70 }, { actor: "user" });
  assert.equal(commands.getSong().notes.find((note) => note.id === "note-3").source, "generated");
  expectCode(() => commands.updateNote("note-1", { pitch: 61 }, { actor: "generator" }), "protected-note");
});

test("user can explicitly edit an anchor and locked note", () => {
  const commands = createCommands(fixture());
  commands.updateNote("note-1", { pitch: 61 }, { actor: "user" });
  commands.updateNote("note-2", { startTick: 500 }, { actor: "user" });
  const notes = commands.getSong().notes;
  assert.equal(notes[0].pitch, 61);
  assert.equal(notes[0].anchor, true);
  assert.equal(notes[1].startTick, 500);
  assert.equal(notes[1].locked, true);
});

test("raw lyric text is separate from zero-note and melisma mappings", () => {
  const song = fixture();
  assert.equal(song.lyrics.rawText, "aku menyanyi");
  assert.deepEqual(song.lyrics.syllables[0].noteIds, []);
  assert.deepEqual(song.lyrics.syllables[1].noteIds, ["note-1", "note-2"]);
  const commands = createCommands(song);
  commands.setLyrics("aku bernyanyi");
  assert.equal(commands.getSong().lyrics.rawText, "aku bernyanyi");
  assert.deepEqual(commands.getSong().lyrics.syllables, song.lyrics.syllables);
});

test("serialization round trip preserves the independently specified project", () => {
  const expected = rawFixture();
  const serialized = serializeProject(expected);
  assert.deepEqual(deserializeProject(serialized), expected);
});

test("serialization retains IDs, source, anchor, lock, and lyric note mapping", () => {
  const song = deserializeProject(serializeProject(fixture()));
  assert.deepEqual(song.notes.map(({ id, source, anchor, locked }) => ({ id, source, anchor, locked })), [
    { id: "note-1", source: "user", anchor: true, locked: false },
    { id: "note-2", source: "user", anchor: false, locked: true },
    { id: "note-3", source: "generated", anchor: false, locked: false },
    { id: "note-4", source: "user", anchor: false, locked: false }
  ]);
  assert.deepEqual(song.lyrics.syllables[1].noteIds, ["note-1", "note-2"]);
  assert.equal(song.sections[0].id, "section-1");
  assert.equal(song.phrases[0].id, "phrase-1");
  assert.equal(song.chords[0].id, "chord-1");
});

test("deserialize returns detached data from the supplied object", () => {
  const input = { schemaVersion: 1, song: fixture() };
  const result = deserializeProject(input);
  input.song.notes[0].pitch = 10;
  input.song.lyrics.syllables[1].noteIds.length = 0;
  assert.equal(result.notes[0].pitch, 60);
  assert.deepEqual(result.lyrics.syllables[1].noteIds, ["note-1", "note-2"]);
});

test("deserialize rejects malformed data, unsupported versions, and dangling mappings", () => {
  expectCode(() => deserializeProject("{"), "malformed-project");
  expectCode(() => deserializeProject({ schemaVersion: 2, song: fixture() }), "unsupported-version");
  const malformed = { schemaVersion: 1, song: fixture() };
  malformed.song.notes = null;
  expectCode(() => deserializeProject(malformed), "invalid-project");
  const invalidPitch = { schemaVersion: 1, song: fixture() };
  invalidPitch.song.notes[0].pitch = 128;
  expectCode(() => deserializeProject(invalidPitch), "invalid-pitch");
  const dangling = { schemaVersion: 1, song: fixture() };
  dangling.song.lyrics.syllables[0].noteIds = ["missing"];
  expectCode(() => deserializeProject(dangling), "invalid-reference");
});

test("invalid command input leaves song and change count untouched", () => {
  let changes = 0;
  const commands = createCommands(fixture(), { onChange: () => { changes += 1; } });
  const before = commands.getSong();
  expectCode(() => commands.updateNote("note-4", { startTick: -1 }), "invalid-tick");
  expectCode(() => commands.updateNote("note-4", { pitch: 62, startTick: -1 }), "invalid-tick");
  expectCode(() => commands.addNote({ pitch: 60, startTick: 2000, durationTicks: 0 }), "invalid-duration");
  expectCode(() => commands.addNote({ pitch: 60, startTick: 2000, durationTicks: 240, source: "generated" }), "invalid-note");
  expectCode(() => commands.addNote({ pitch: 60, startTick: 2000, durationTicks: 240, anchor: true }), "invalid-note");
  expectCode(() => commands.addNote({ pitch: 60, startTick: 2000, durationTicks: 240, locked: true }), "invalid-note");
  assert.deepEqual(commands.getSong(), before);
  assert.equal(changes, 0);
});

test("commands add, update, lyrics, flags, and delete notes through one boundary", () => {
  let next = 0;
  const commands = createCommands(fixture(), { idFactory: () => `new-${++next}` });
  const added = commands.addNote({ pitch: 72, startTick: 1920, durationTicks: 240 });
  assert.equal(added.id, "new-1");
  assert.deepEqual({ source: added.source, anchor: added.anchor, locked: added.locked }, { source: "user", anchor: false, locked: false });
  commands.updateNote(added.id, { pitch: 74 });
  commands.setAnchor(added.id, true);
  commands.setLocked(added.id, true);
  commands.setLyrics("lirik baru");
  assert.equal(commands.getSong().notes.at(-1).pitch, 74);
  assert.equal(commands.getSong().notes.at(-1).anchor, true);
  assert.equal(commands.getSong().notes.at(-1).locked, true);
  assert.equal(commands.getSong().lyrics.rawText, "lirik baru");
  assert.equal(commands.deleteNote(added.id), true);
  assert.equal(commands.getSong().notes.some((note) => note.id === added.id), false);
});

test("generator-created notes carry generated provenance and no protection flags", () => {
  const commands = createCommands(fixture(), { idFactory: () => "generated-note" });
  const added = commands.addNote({ pitch: 72, startTick: 1920, durationTicks: 240 }, { actor: "generator" });
  assert.deepEqual({ source: added.source, anchor: added.anchor, locked: added.locked }, { source: "generated", anchor: false, locked: false });
});

test("deleting a note prunes its phrase and lyric references atomically", () => {
  const commands = createCommands(fixture());
  commands.deleteNote("note-1");
  const song = commands.getSong();
  assert.equal(song.phrases[0].noteIds.includes("note-1"), false);
  assert.equal(song.lyrics.syllables[1].noteIds.includes("note-1"), false);
  assert.deepEqual(song.lyrics.syllables[1].noteIds, ["note-2"]);
  commands.deleteNote("note-2");
  const afterLastMelismaNote = commands.getSong();
  assert.deepEqual(afterLastMelismaNote.lyrics.syllables[1].noteIds, []);
  assert.equal(afterLastMelismaNote.lyrics.rawText, "aku menyanyi");
  assert.deepEqual(song.lyrics.syllables[0].noteIds, []);
});

test("selection uses a half-open range and can be read through commands", () => {
  const commands = createCommands(fixture());
  assert.deepEqual(commands.selectRange(480, 960), { startTick: 480, endTick: 960, noteIds: ["note-2"] });
  assert.deepEqual(commands.getSelection(), { startTick: 480, endTick: 960, noteIds: ["note-2"] });
  assert.deepEqual(commands.selectRange(960, 960).noteIds, []);
  const before = commands.getSelection();
  expectCode(() => commands.selectRange(961, 960), "invalid-range");
  assert.deepEqual(commands.getSelection(), before);
});

test("state snapshot is detached and reports only real R0 actions", () => {
  const commands = createCommands(fixture());
  const snapshot = commands.getState();
  snapshot.song.scale.intervals[0] = 11;
  snapshot.anchorNoteIds.push("fake");
  snapshot.availableActions.push("play");
  snapshot.selection = { noteIds: ["fake"] };
  const next = commands.getState();
  const expected = {
    song: {
      id: "song-1",
      title: "Ide awal",
      tempo: 96,
      key: "C",
      scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
      timeSignature: { numerator: 4, denominator: 4 },
      currentSectionId: "section-1"
    },
    selection: null,
    anchorNoteIds: ["note-1"],
    lockedNoteIds: ["note-2"],
    availableActions: ["getSong", "getSelection", "addNote", "updateNote", "deleteNote", "setLyrics", "setAnchor", "setLocked", "selectRange"]
  };
  assert.deepEqual(next, expected);
  assert.deepEqual(commands.getState(), commands.getState());
});

test("returned song copies cannot mutate canonical state and IDs stay attached when reordered", () => {
  const commands = createCommands(fixture());
  const returned = commands.getSong();
  returned.notes.reverse();
  returned.notes[0].id = "changed";
  assert.deepEqual(commands.getSong().notes.map((note) => note.id), ["note-1", "note-2", "note-3", "note-4"]);
  const reordered = commands.getSong();
  reordered.notes.reverse();
  assert.deepEqual(deserializeProject(serializeProject(reordered)).notes.map(({ id, pitch }) => ({ id, pitch })), [
    { id: "note-4", pitch: 67 },
    { id: "note-3", pitch: 69 },
    { id: "note-2", pitch: 64 },
    { id: "note-1", pitch: 60 }
  ]);
});
