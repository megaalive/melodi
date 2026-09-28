import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommands } from "../src/core/commands.js";

// Menambah atau menempel note harus mendaftarkan note itu ke phrase, kalau tidak
// phrase jadi tidak lagi mencerminkan song. Akibatnya generateGap gagal dengan
// "generation-cross-phrase" karena kedua anchor tidak pernah ada di phrase yang sama.

function songFixture() {
  return {
    id: "song-1",
    title: "Ide baru",
    timing: { ppq: 480, tempo: 120, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [{ id: "section-1", name: "Verse", phraseIds: ["phrase-1"] }],
    phrases: [{ id: "phrase-1", noteIds: [] }],
    notes: [],
    lyrics: { rawText: "", syllables: [] },
    chords: []
  };
}

function setup() {
  let counter = 0;
  const commands = createCommands(songFixture(), { idFactory: () => `id-${++counter}` });
  return commands;
}

test("addNote mendaftarkan note ke phrase", () => {
  const commands = setup();
  commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
  commands.addNote({ pitch: 64, startTick: 480, durationTicks: 480 });

  const song = commands.getSong();
  const phrase = song.phrases[0];
  assert.deepEqual(phrase.noteIds, song.notes.map((note) => note.id));
});

test("addNote menyisipkan note berdasarkan urutan tick, bukan urutan tambah", () => {
  const commands = setup();
  commands.addNote({ pitch: 64, startTick: 960, durationTicks: 480 });
  commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
  commands.addNote({ pitch: 67, startTick: 1920, durationTicks: 480 });

  const song = commands.getSong();
  const byId = new Map(song.notes.map((note) => [note.id, note]));
  const ticks = song.phrases[0].noteIds.map((id) => byId.get(id).startTick);
  assert.deepEqual(ticks, [0, 960, 1920], "phrase harus terurut tick");
});

test("pasteNotes mendaftarkan note yang ditempel ke phrase", () => {
  const commands = setup();
  commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
  commands.selectNotes(commands.getSong().notes.map((note) => note.id));
  commands.copySelection();
  commands.selectNotes([]);
  commands.pasteNotes(480);

  const song = commands.getSong();
  assert.equal(song.notes.length, 2);
  assert.equal(song.phrases[0].noteIds.length, 2, "note hasil paste harus ikut terdaftar");
  const ids = new Set(song.notes.map((note) => note.id));
  assert.ok(song.phrases[0].noteIds.every((id) => ids.has(id)), "tidak boleh ada note asing di phrase");
});

test("note yang dihapus hilang dari phrase, dan tidak meninggalkan id yatim", () => {
  const commands = setup();
  const a = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
  const b = commands.addNote({ pitch: 64, startTick: 480, durationTicks: 480 });
  const c = commands.addNote({ pitch: 67, startTick: 960, durationTicks: 480 });

  commands.deleteNote(b.id);

  const song = commands.getSong();
  assert.deepEqual(song.phrases[0].noteIds, [a.id, c.id]);
  const ids = new Set(song.notes.map((note) => note.id));
  assert.ok(song.phrases[0].noteIds.every((id) => ids.has(id)));
});

test("phrase tetap konsisten setelah banyak tambah dan hapus", () => {
  const commands = setup();
  const made = [];
  for (let index = 0; index < 6; index += 1) {
    made.push(commands.addNote({ pitch: 60 + index, startTick: index * 480, durationTicks: 480 }));
  }
  commands.deleteNote(made[1].id);
  commands.deleteNote(made[4].id);
  commands.addNote({ pitch: 72, startTick: 6 * 480, durationTicks: 480 });

  const song = commands.getSong();
  const ids = new Set(song.notes.map((note) => note.id));
  assert.equal(song.phrases[0].noteIds.length, song.notes.length);
  assert.ok(song.phrases[0].noteIds.every((id) => ids.has(id)), "tidak ada id di phrase yang tidak ada di song");
});

test("generateGap tetap jalan setelah note ditambah manual, bukan dari demo", () => {
  const commands = setup();
  const left = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
  const right = commands.addNote({ pitch: 67, startTick: 1440, durationTicks: 480 });
  commands.setAnchor(left.id, true);
  commands.setAnchor(right.id, true);

  const generation = commands.generateGap({
    startTick: 480,
    endTick: 1440,
    leftAnchorNoteId: left.id,
    rightAnchorNoteId: right.id
  });

  assert.equal(generation.status, "ready");
  assert.ok(generation.candidates.length > 0);
});
