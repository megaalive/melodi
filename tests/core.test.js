import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PPQ,
  createInitialSong,
  createSong,
  MelodiError,
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
  assert.deepEqual(song.notes.map((note) => note.pitch), [69, 74, 76, 76, 76, 76, 74, 72, 74, 74, 74, 72, 69, 71, 72, 72, 72, 71, 69, 67, 67]);
  assert.deepEqual(song.sections.map((section) => section.name), ["Melodi"]);
  assert.equal(song.phrases.length, 1);
  assert.deepEqual(song.phrases.map((phrase) => phrase.noteIds.length), [21]);
});

test("initial song matches the selected share project baseline", () => {
  let next = 0;
  const song = createInitialSong(() => `bend-${++next}`);
  assert.equal(song.timing.tempo, 81);
  assert.deepEqual(song.timing.timeSignature, { numerator: 6, denominator: 8 });
  assert.equal(song.key, "Am");
  assert.deepEqual(song.notes.map((note) => note.pitch), [69, 74, 76, 76, 76, 76, 74, 72, 74, 74, 74, 72, 69, 71, 72, 72, 72, 71, 69, 67, 67]);
  assert.deepEqual(song.notes.map((note) => [note.startTick, note.durationTicks]), [
    [0, 480], [480, 240], [720, 240], [960, 720], [1680, 480], [2160, 240], [2400, 480],
    [2880, 480], [3360, 240], [3600, 720], [4320, 720], [5040, 720],
    [5760, 240], [6000, 240], [6240, 240], [6480, 720], [7200, 720], [7920, 720],
    [8640, 720], [9360, 720], [10080, 1440]
  ]);
  assert.deepEqual(song.notes[3].pitchBend, [
    { position: 0, semitones: 0 },
    { position: 0.3, semitones: 1 },
    { position: 1, semitones: 1 }
  ]);
  assert.deepEqual(song.notes[10].pitchBend.at(-1), { position: 1, semitones: 0 });
  assert.deepEqual(song.notes[15].pitchBend.at(-1), { position: 1, semitones: 2 });
  assert.deepEqual(song.notes[16].pitchBend.at(-1), { position: 1, semitones: 0 });
  assert.deepEqual(song.notes[20].pitchBend.at(-1), { position: 1, semitones: 2 });
  assert.equal(song.notes.at(-1).startTick + song.notes.at(-1).durationTicks, 11520);
});

test("loading a project resets editor/runtime state and keeps the imported canonical song", () => {
  const commands = createCommands(fixture());
  commands.setSnap("1/16");
  commands.setTool("draw");
  commands.selectNotes(["note-1"]);
  commands.addNote({ pitch: 72, startTick: 1920, durationTicks: 240 });
  assert.equal(commands.canUndo(), true);

  let next = 0;
  const imported = createInitialSong(() => `import-${++next}`);
  const loaded = commands.loadSong(imported);

  assert.deepEqual(loaded, imported);
  assert.deepEqual(commands.getSong(), imported);
  assert.deepEqual(commands.getSelectedNoteIds(), []);
  assert.deepEqual(commands.getState().editor, { snap: "1/8", tool: "select", zoom: 1, canPaste: false, clipboardCount: 0 });
  assert.deepEqual(commands.getState().history, { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  assert.equal(commands.getState().playback.currentTick, 0);
  assert.deepEqual(commands.getState().playback.loop, { enabled: true, startTick: 0, endTick: 11520 });
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

test("manual notes on the default baseline join the melody phrase", () => {
  let next = 0;
  const commands = createCommands(createInitialSong(() => `part-${++next}`), {
    idFactory: () => `new-${++next}`
  });
  const before = commands.getSong();
  const added = commands.addNote({ pitch: 71, startTick: 3300, durationTicks: 120 });
  const after = commands.getSong();

  const phraseIndex = after.phrases.findIndex((phrase) => phrase.noteIds.includes(added.id));
  assert.equal(phraseIndex, 0);
  assert.equal(before.phrases[0].noteIds.includes(added.id), false);
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

test("user can add, replace, and clear canonical pitch bend", () => {
  const commands = createCommands(fixture());
  const bend = [
    { position: 0, semitones: 0 },
    { position: 0.3, semitones: 2 },
    { position: 1, semitones: 2 }
  ];
  commands.updateNote("note-4", { pitchBend: bend });
  assert.deepEqual(commands.getSong().notes.find((note) => note.id === "note-4").pitchBend, bend);

  commands.updateNotes([
    { noteId: "note-3", patch: { pitchBend: bend } },
    { noteId: "note-4", patch: { pitchBend: null } }
  ]);
  assert.deepEqual(commands.getSong().notes.find((note) => note.id === "note-3").pitchBend, bend);
  assert.equal(Object.hasOwn(commands.getSong().notes.find((note) => note.id === "note-4"), "pitchBend"), false);

  expectCode(() => commands.updateNote("note-3", { pitchBend: [{ position: 0, semitones: 0 }] }), "invalid-pitch-bend");
  expectCode(() => commands.updateNote("note-3", {
    pitchBend: [{ position: 0, semitones: 0 }, { position: 0.5, semitones: 13 }]
  }), "invalid-pitch-bend");
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
  assert.throws(
    () => commands.updateNote("note-4", { pitch: 128 }),
    (error) => error instanceof MelodiError && error.code === "invalid-pitch"
  );
  assert.deepEqual(commands.getSong(), before);
  assert.equal(changes, 0);
});

test("each successful mutation and selection notifies exactly once", () => {
  let notifications = 0;
  const commands = createCommands(fixture(), {
    idFactory: () => "note-new",
    onChange: () => { notifications += 1; }
  });
  const expectOneNotification = (operation) => {
    const before = notifications;
    operation();
    assert.equal(notifications, before + 1);
  };

  expectOneNotification(() => commands.addNote({ pitch: 72, startTick: 1920, durationTicks: 240 }));
  expectOneNotification(() => commands.updateNote("note-4", { pitch: 68 }));
  expectOneNotification(() => commands.setLyrics("new lyrics"));
  expectOneNotification(() => commands.setAnchor("note-4", true));
  expectOneNotification(() => commands.setLocked("note-4", true));
  expectOneNotification(() => commands.selectRange(1920, 2160));
  expectOneNotification(() => commands.deleteNote("note-new"));
});

test("notification failures do not turn committed mutations or selections into command failures", () => {
  let notifications = 0;
  const reportedErrors = [];
  const commands = createCommands(fixture(), {
    idFactory: () => "note-notified",
    onChange() {
      notifications += 1;
      throw new Error(`view failed ${notifications}`);
    },
    onNotificationError(error) {
      reportedErrors.push(error.message);
    }
  });

  let added;
  assert.doesNotThrow(() => {
    added = commands.addNote({ pitch: 72, startTick: 1920, durationTicks: 240 });
  });
  assert.equal(added.id, "note-notified");
  assert.equal(commands.getSong().notes.some((note) => note.id === added.id), true);
  assert.equal(notifications, 1);

  let selection;
  assert.doesNotThrow(() => {
    selection = commands.selectRange(1920, 2160);
  });
  assert.deepEqual(selection, { startTick: 1920, endTick: 2160, noteIds: [added.id] });
  assert.deepEqual(commands.getSelection(), selection);
  assert.equal(notifications, 2);
  assert.deepEqual(reportedErrors, ["view failed 1", "view failed 2"]);

  const beforeSelection = commands.getSelection();
  expectCode(() => commands.selectRange(2160, 1920), "invalid-range");
  assert.deepEqual(commands.getSelection(), beforeSelection);
  assert.equal(notifications, 2);
  assert.deepEqual(reportedErrors, ["view failed 1", "view failed 2"]);
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

test("state snapshot is detached and reports the actual command surface", () => {
  const commands = createCommands(fixture());
  const snapshot = commands.getState();
  snapshot.song.scale.intervals[0] = 11;
  snapshot.anchorNoteIds.push("fake");
  snapshot.availableActions.push("play");
  snapshot.playback.loop.startTick = 200;
  snapshot.selection = { noteIds: ["fake"] };
  snapshot.song.notes[0].pitch = 10;
  snapshot.song.lyrics.syllables[0].noteIds.push("fake");
  snapshot.selectedNoteIds.push("fake");
  snapshot.editor.snap = "1/4";
  snapshot.view.mode = "lyrics";
  snapshot.generation.candidateIds.push("fake");
  snapshot.generation.candidates.push({ id: "fake" });
  snapshot.song.chords[0].quality = "changed";
  const next = commands.getState();
  const expected = {
    song: {
      id: "song-1",
      title: "Ide awal",
      tempo: 96,
      key: "C",
      scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
      timeSignature: { numerator: 4, denominator: 4 },
      currentSectionId: "section-1",
      notes: fixture().notes,
      lyrics: fixture().lyrics,
      sections: fixture().sections,
      phrases: fixture().phrases,
      chords: fixture().chords
    },
    playback: {
      status: "stopped",
      currentTick: 0,
      currentNoteId: null,
      currentSyllableId: null,
      currentSyllableIds: [],
      currentSectionId: "section-1",
      tempo: 96,
      loop: { enabled: true, startTick: 0, endTick: 1920 }
    },
    selection: null,
    selectedNoteIds: [],
    editor: { snap: "1/8", tool: "select", zoom: 1, canPaste: false, clipboardCount: 0 },
    view: { mode: "piano-roll", follow: true },
    generation: {
      status: "idle",
      stale: false,
      gap: null,
      seed: null,
      candidateIds: [],
      activeCandidateId: null,
      auditionCandidateId: null,
      candidates: [],
      acceptedNoteIds: []
    },
    anchorNoteIds: ["note-1"],
    lockedNoteIds: ["note-2"],
    history: { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 },
    availableActions: [
      "getSong", "getSelection", "getSelectedNoteIds", "addNote", "updateNote", "updateNotes", "deleteNote", "setLyrics",
      "setAnchor", "setLocked", "selectRange", "selectNotes", "clearSelection", "copySelection", "pasteNotes",
      "setSnap", "setTool", "setZoom", "addLyricSyllable", "updateLyricSyllable", "deleteLyricSyllable", "splitLyricSyllable",
      "mergeLyricSyllables", "moveLyricSyllable", "assignSyllableNotes", "newIdea", "loadSong",
      "generateGap", "getGenerationState", "selectCandidate", "auditionCandidate", "acceptCandidate",
      "lockAcceptedNotes", "clearGeneration", "regenerateGap",
      "play", "pause", "stop", "seek", "setTempo", "setLoop", "resetLoopRange", "setLoopEnabled", "setViewMode", "setFollowMode",
      "undo", "redo", "canUndo", "canRedo"
    ]
  };
  assert.deepEqual(next, expected);
  assert.deepEqual(commands.getState(), commands.getState());
});

test("every advertised action exists on the command object", () => {
  const commands = createCommands(fixture());
  const advertised = commands.getState().availableActions;
  const missing = advertised.filter((name) => typeof commands[name] !== "function");
  assert.deepEqual(missing, []);
});

test("every advertised action is re-exported on the browser surface", () => {
  // availableActions adalah janji ke agent, jadi nama yang diiklankan harus benar
  //-benar tersedia di window.melodi.commands juga. publicCommands ada di app.js
  // yang tidak bisa diimpor di Node karena menyentuh DOM, jadi bloknya dibaca
  // sebagai teks. Kegagalan parser sengaja dibiarkan menggagalkan test.
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const start = app.indexOf("const publicCommands = Object.freeze({");
  assert.notEqual(start, -1, "publicCommands block not found in app.js");
  const end = app.indexOf("\n});", start);
  assert.notEqual(end, -1, "publicCommands block is not terminated");
  const block = app.slice(start, end);
  const exportedNames = new Set([
    ...[...block.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)\s*[,:]/gm)].map((match) => match[1])
  ]);
  const commands = createCommands(fixture());
  const missing = commands.getState().availableActions.filter((name) => !exportedNames.has(name));
  assert.deepEqual(missing, []);
});

test("view mode and Follow Mode are detached editor state, not song edits", () => {
  const changes = [];
  const commands = createCommands(fixture(), { onChange: (change) => changes.push(change.kind) });
  const originalSong = commands.getSong();
  for (const mode of ["score", "piano-roll", "combined", "lyrics", "guitar"]) assert.equal(commands.setViewMode(mode), mode);
  assert.equal(commands.setFollowMode(false), false);
  const state = commands.getState();
  assert.deepEqual(state.view, { mode: "guitar", follow: false });
  assert.deepEqual(commands.getSong(), originalSong);
  assert.deepEqual(changes, ["view", "view", "view", "view", "view", "view"]);
  expectCode(() => commands.setViewMode("editor"), "invalid-view-mode");
  expectCode(() => commands.setFollowMode("false"), "invalid-follow-mode");
  assert.deepEqual(commands.getState().view, { mode: "guitar", follow: false });
});

test("snapshot picks the first linked syllable in canonical lyric order", () => {
  const commands = createCommands(fixture());
  commands.assignSyllableNotes("syllable-1", ["note-1"]);
  commands.seek(0);
  const snapshot = commands.getState();
  assert.equal(snapshot.playback.currentNoteId, "note-1");
  assert.equal(snapshot.playback.currentSyllableId, "syllable-1");
  assert.deepEqual(snapshot.playback.currentSyllableIds, ["syllable-1"]);
});

test("transport state stays outside the canonical song and project serialization", () => {
  const commands = createCommands(fixture());
  commands.seek(960);
  commands.setLoop(240, 1680);
  commands.setLoopEnabled(true);
  assert.deepEqual(Object.keys(commands.getSong()).sort(), ["chords", "id", "key", "lyrics", "notes", "phrases", "scale", "sections", "timing", "title"]);
  const restored = deserializeProject(serializeProject(commands.getSong()));
  assert.equal(Object.hasOwn(restored, "playback"), false);
  assert.deepEqual(restored.notes, fixture().notes);
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

test("note-ID selection supports multiple notes, rejects stale IDs, and prunes deleted notes", () => {
  const commands = createCommands(fixture());
  assert.deepEqual(commands.selectNotes(["note-4", "note-1"]), ["note-4", "note-1"]);
  assert.deepEqual(commands.getSelectedNoteIds(), ["note-4", "note-1"]);
  assert.deepEqual(commands.getState().selectedNoteIds, ["note-4", "note-1"]);
  assert.equal(commands.getSelection(), null);
  expectCode(() => commands.selectNotes(["note-1", "missing"]), "note-not-found");
  expectCode(() => commands.selectNotes(["note-1", "note-1"]), "duplicate-reference");
  commands.deleteNote("note-1");
  assert.deepEqual(commands.getSelectedNoteIds(), ["note-4"]);
  assert.deepEqual(commands.clearSelection(), []);
  assert.deepEqual(commands.getState().selectedNoteIds, []);
});

test("multi-note edits commit atomically once and preserve source, anchor, and lock", () => {
  let changes = 0;
  const commands = createCommands(fixture(), { onChange: () => { changes += 1; } });
  const before = commands.getSong();
  commands.updateNotes([
    { noteId: "note-1", patch: { startTick: 240 } },
    { noteId: "note-2", patch: { pitch: 65 } }
  ]);
  const after = commands.getSong();
  assert.equal(changes, 1);
  assert.deepEqual(after.notes.map(({ startTick, pitch, source, anchor, locked }) => ({ startTick, pitch, source, anchor, locked })), [
    { startTick: 240, pitch: 60, source: "user", anchor: true, locked: false },
    { startTick: 480, pitch: 65, source: "user", anchor: false, locked: true },
    { startTick: 960, pitch: 69, source: "generated", anchor: false, locked: false },
    { startTick: 1440, pitch: 67, source: "user", anchor: false, locked: false }
  ]);
  expectCode(() => commands.updateNotes([
    { noteId: "note-4", patch: { pitch: 68 } },
    { noteId: "note-2", patch: { pitch: 66 } }
  ], { actor: "generator" }), "protected-note");
  expectCode(() => commands.updateNotes([
    { noteId: "note-4", patch: { pitch: 68 } },
    { noteId: "note-3", patch: { pitch: 128 } }
  ]), "invalid-pitch");
  assert.deepEqual(commands.getSong(), after);
  assert.equal(changes, 1);
  assert.notDeepEqual(after, before);
});

test("editor tool is explicit runtime state and rejects unknown tools", () => {
  const changes = [];
  const commands = createCommands(fixture(), { onEditorChange: () => changes.push("editor") });
  const originalSong = commands.getSong();
  assert.equal(commands.getState().editor.tool, "select");
  assert.equal(commands.setTool("draw"), "draw");
  assert.equal(commands.getState().editor.tool, "draw");
  expectCode(() => commands.setTool("erase"), "invalid-editor-tool");
  assert.equal(commands.getState().editor.tool, "draw");
  assert.deepEqual(commands.getSong(), originalSong);
  assert.deepEqual(changes, ["editor"]);
  assert.equal(commands.setTool("select"), "select");
});

test("roll zoom is editor runtime state, clamped, and not a song edit", () => {
  const changes = [];
  const commands = createCommands(fixture(), { onEditorChange: () => changes.push("editor") });
  const originalSong = commands.getSong();
  assert.equal(commands.getState().editor.zoom, 1);
  assert.equal(commands.setZoom(2), 2);
  assert.equal(commands.getState().editor.zoom, 2);
  assert.equal(commands.setZoom(0.5), 0.5);
  assert.equal(commands.getState().editor.zoom, 0.5);
  expectCode(() => commands.setZoom(0.25), "invalid-zoom");
  expectCode(() => commands.setZoom(4.5), "invalid-zoom");
  expectCode(() => commands.setZoom("2"), "invalid-zoom");
  expectCode(() => commands.setZoom(Number.NaN), "invalid-zoom");
  assert.equal(commands.getState().editor.zoom, 0.5);
  assert.deepEqual(commands.getSong(), originalSong);
  assert.deepEqual(changes, ["editor", "editor"]);
  // Batas atas dan bawah diterima.
  assert.equal(commands.setZoom(4), 4);
  assert.equal(commands.setZoom(1), 1);
  assert.deepEqual(commands.getSong(), originalSong);
});

test("copy and paste create new user notes with relative timing and pitch but no protection flags", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), { idFactory: () => `paste-${++nextId}` });
  commands.selectNotes(["note-1", "note-3"]);
  assert.equal(commands.copySelection(), 2);
  assert.deepEqual(commands.getState().editor, { snap: "1/8", tool: "select", zoom: 1, canPaste: true, clipboardCount: 2 });

  const pasted = commands.pasteNotes(1920, 72);
  assert.deepEqual(pasted.map(({ pitch, startTick, durationTicks, source, anchor, locked }) => ({ pitch, startTick, durationTicks, source, anchor, locked })), [
    { pitch: 72, startTick: 1920, durationTicks: 480, source: "user", anchor: false, locked: false },
    { pitch: 81, startTick: 2880, durationTicks: 480, source: "user", anchor: false, locked: false }
  ]);
  assert.equal(new Set(commands.getSong().notes.map((note) => note.id)).size, commands.getSong().notes.length);
  assert.deepEqual(commands.getSelectedNoteIds(), pasted.map((note) => note.id));

  const beforeInvalidPaste = commands.getSong();
  expectCode(() => commands.pasteNotes(4000, 120), "invalid-pitch");
  expectCode(() => commands.pasteNotes(-1, 72), "invalid-tick");
  assert.deepEqual(commands.getSong(), beforeInvalidPaste);

  commands.clearSelection();
  assert.equal(commands.copySelection(), 0);
  assert.deepEqual(commands.pasteNotes(5000), []);
});

test("syllable add, edit, assign, unassign, delete, and reorder preserve stable IDs and raw lyrics", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), { idFactory: () => `syllable-new-${++nextId}` });
  const originalRawText = commands.getSong().lyrics.rawText;
  const created = commands.addLyricSyllable("la", 1);
  assert.equal(created.id, "syllable-new-1");
  commands.updateLyricSyllable(created.id, "LÁ");
  commands.assignSyllableNotes(created.id, ["note-2", "note-3"]);
  assert.deepEqual(commands.getSong().lyrics.syllables[1], { id: created.id, text: "LÁ", noteIds: ["note-2", "note-3"] });
  assert.equal(commands.getSong().lyrics.rawText, originalRawText);
  expectCode(() => commands.assignSyllableNotes(created.id, ["note-2", "note-2"]), "duplicate-reference");
  expectCode(() => commands.assignSyllableNotes(created.id, ["missing-note"]), "invalid-reference");
  assert.deepEqual(commands.getSong().lyrics.syllables[1].noteIds, ["note-2", "note-3"]);

  commands.moveLyricSyllable(created.id, 0);
  assert.deepEqual(commands.getSong().lyrics.syllables.map((item) => item.id), [created.id, "syllable-1", "syllable-2"]);
  commands.moveLyricSyllable(created.id, 2);
  assert.deepEqual(commands.getSong().lyrics.syllables.map((item) => item.id), ["syllable-1", "syllable-2", created.id]);
  commands.assignSyllableNotes(created.id, []);
  commands.deleteLyricSyllable(created.id);
  expectCode(() => commands.updateLyricSyllable(created.id, "stale"), "syllable-not-found");
  assert.equal(commands.getSong().lyrics.rawText, originalRawText);
});

test("syllable split keeps the original ID on the left and merge is adjacent, ordered, and deduplicated", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), { idFactory: () => `split-${++nextId}` });
  const split = commands.splitLyricSyllable("syllable-2", {
    leftText: "ku-",
    rightText: "lah",
    noteSplitIndex: 1
  });
  assert.deepEqual(split, {
    left: { id: "syllable-2", text: "ku-", noteIds: ["note-1"] },
    right: { id: "split-1", text: "lah", noteIds: ["note-2"] }
  });
  expectCode(() => commands.splitLyricSyllable("syllable-2", { leftText: "x", rightText: "y", noteSplitIndex: 2 }), "invalid-syllable-split");
  expectCode(() => commands.mergeLyricSyllables("split-1", "syllable-2"), "syllables-not-adjacent");
  commands.mergeLyricSyllables("syllable-2", "split-1");
  assert.deepEqual(commands.getSong().lyrics.syllables[1], { id: "syllable-2", text: "ku-lah", noteIds: ["note-1", "note-2"] });

  commands.assignSyllableNotes("syllable-1", ["note-1", "note-2"]);
  commands.mergeLyricSyllables("syllable-1", "syllable-2");
  assert.deepEqual(commands.getSong().lyrics.syllables[0], { id: "syllable-1", text: "aku-lah", noteIds: ["note-1", "note-2"] });
  assert.equal(commands.getSong().lyrics.syllables.some((item) => item.id === "syllable-2"), false);
  assert.equal(commands.getSong().lyrics.rawText, "aku menyanyi");
  assert.deepEqual(deserializeProject(serializeProject(commands.getSong())).lyrics, commands.getSong().lyrics);
});

test("snap state and New Idea reset are editor runtime, not canonical song data", () => {
  let next = 0;
  const commands = createCommands(fixture(), { idFactory: () => `new-idea-${++next}` });
  commands.setSnap("1/16");
  commands.setTool("draw");
  commands.selectNotes(["note-1"]);
  commands.copySelection();
  commands.setLyrics("draft lyric");
  commands.setAnchor("note-2", true);
  expectCode(() => commands.setSnap("1/32"), "invalid-snap");
  const fresh = commands.newIdea();
  assert.equal(fresh.title, "Ide baru");
  assert.equal(fresh.lyrics.rawText, "");
  assert.deepEqual(fresh.notes.map((note) => note.pitch), [69, 74, 76, 76, 76, 76, 74, 72, 74, 74, 74, 72, 69, 71, 72, 72, 72, 71, 69, 67, 67]);
  assert.ok(fresh.notes.every((note) => !note.anchor && !note.locked));
  assert.deepEqual(commands.getSelectedNoteIds(), []);
  assert.deepEqual(commands.getState().editor, { snap: "1/8", tool: "select", zoom: 1, canPaste: false, clipboardCount: 0 });
  assert.equal(commands.getState().playback.status, "stopped");
  assert.equal(commands.getState().playback.currentTick, 0);
  assert.equal(Object.hasOwn(fresh, "playback"), false);
});

test("undo restores the previous canonical song and redo re-applies it", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), { idFactory: () => `added-${++nextId}` });
  const original = commands.getSong();
  assert.equal(commands.canUndo(), false);
  assert.equal(commands.canRedo(), false);
  assert.deepEqual(commands.getState().history, { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });

  const added = commands.addNote({ pitch: 72, startTick: 1920, durationTicks: 240 });
  assert.equal(commands.getSong().notes.length, 5);
  assert.deepEqual(commands.getState().history, { canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });

  commands.undo();
  assert.deepEqual(commands.getSong(), original);
  assert.deepEqual(commands.getState().history, { canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 });

  commands.redo();
  assert.deepEqual(commands.getSong().notes, [...original.notes, added]);
  assert.deepEqual(commands.getState().history, { canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });
});

test("undo and redo report a stable code when there is nothing to restore", () => {
  const commands = createCommands(fixture());
  const original = commands.getSong();
  expectCode(() => commands.undo(), "nothing-to-undo");
  expectCode(() => commands.redo(), "nothing-to-redo");
  assert.deepEqual(commands.getSong(), original);
  assert.deepEqual(commands.getState().history, { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
});

test("a new canonical change discards the redo branch", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), { idFactory: () => `added-${++nextId}` });
  commands.addNote({ pitch: 72, startTick: 1920, durationTicks: 240 });
  commands.undo();
  assert.equal(commands.canRedo(), true);
  commands.addNote({ pitch: 74, startTick: 1920, durationTicks: 240 });
  assert.equal(commands.canRedo(), false);
  assert.equal(commands.getState().history.redoDepth, 0);
  expectCode(() => commands.redo(), "nothing-to-redo");
  assert.deepEqual(commands.getSong().notes.map((note) => note.pitch), [60, 64, 69, 67, 74]);
});

test("undo restores deleted notes with their phrase and lyric references", () => {
  const commands = createCommands(fixture());
  const before = commands.getSong();
  commands.deleteNote("note-2");
  assert.deepEqual(commands.getSong().phrases[0].noteIds, ["note-1", "note-3", "note-4"]);
  assert.deepEqual(commands.getSong().lyrics.syllables[1].noteIds, ["note-1"]);
  commands.undo();
  assert.deepEqual(commands.getSong(), before);
  assert.deepEqual(commands.getSong().lyrics.syllables[1].noteIds, ["note-1", "note-2"]);
});

test("selection, view, clipboard, and loop state stay outside the history stack", () => {
  const commands = createCommands(fixture());
  commands.selectNotes(["note-1"]);
  commands.selectRange(0, 1920);
  commands.clearSelection();
  commands.setViewMode("score");
  commands.setFollowMode(false);
  commands.setSnap("1/16");
  commands.copySelection();
  commands.setLoop(0, 960);
  commands.setLoopEnabled(true);
  assert.equal(commands.canUndo(), false);
  assert.deepEqual(commands.getState().history, { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
});

test("tempo is canonical so undo restores it", () => {
  const commands = createCommands(fixture());
  commands.setTempo(120);
  assert.equal(commands.getSong().timing.tempo, 120);
  commands.undo();
  assert.equal(commands.getSong().timing.tempo, 96);
  commands.redo();
  assert.equal(commands.getSong().timing.tempo, 120);
});

test("new Idea is undoable so a replaced draft is recoverable", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), { idFactory: () => `idea-${++nextId}` });
  const before = commands.getSong();
  commands.newIdea();
  assert.equal(commands.getSong().title, "Ide baru");
  assert.equal(commands.canUndo(), true);
  commands.undo();
  assert.deepEqual(commands.getSong(), before);
});

test("undo returns a detached song copy", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), { idFactory: () => `added-${++nextId}` });
  commands.addNote({ pitch: 72, startTick: 1920, durationTicks: 240 });
  const restored = commands.undo();
  restored.notes[0].pitch = 10;
  restored.title = "changed";
  assert.equal(commands.getSong().notes[0].pitch, 60);
  assert.equal(commands.getSong().title, "Ide awal");
});

test("a failed command leaves the history stack untouched", () => {
  const commands = createCommands(fixture());
  commands.setLyrics("draft");
  expectCode(() => commands.deleteNote("missing"), "note-not-found");
  expectCode(() => commands.setAnchor("missing", true), "note-not-found");
  expectCode(() => commands.addNote({ pitch: 999, startTick: 0, durationTicks: 480 }), "invalid-pitch");
  assert.equal(commands.getState().history.undoDepth, 1);
  assert.equal(commands.getSong().lyrics.rawText, "draft");
});

test("history depth is reported per direction and stays bounded", () => {
  const commands = createCommands(fixture());
  for (let index = 0; index < 3; index += 1) commands.setLyrics(`draft ${index}`);
  const history = commands.getState().history;
  assert.equal(history.canUndo, true);
  assert.equal(history.undoDepth, 3);
  assert.equal(history.redoDepth, 0);

  for (let index = 0; index < 120; index += 1) commands.setLyrics(`long session ${index}`);
  assert.equal(commands.getState().history.undoDepth, 100);
});

test("reset loop range restores the full timeline without changing loop mode", () => {
  const commands = createCommands(fixture());
  commands.setLoop(480, 1440);
  commands.setLoopEnabled(false);
  commands.seek(960);

  const reset = commands.resetLoopRange();

  assert.deepEqual(reset, { enabled: false, startTick: 0, endTick: 1920 });
  assert.deepEqual(commands.getState().playback.loop, { enabled: false, startTick: 0, endTick: 1920 });
  assert.equal(commands.getState().playback.currentTick, 960);
});

