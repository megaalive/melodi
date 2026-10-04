import test from "node:test";
import assert from "node:assert/strict";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import {
  IDEA_BOARD_LIMIT,
  createIdeaBoard,
  ideaSpanTicks,
  normalizeIdeaBoard,
  readIdeaBoard
} from "../src/storage/idea-board.js";

const SCALE = Object.freeze({ name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] });

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value)
  };
}

function fixture() {
  return createSong({
    id: "song-board",
    title: "Ide",
    timing: { ppq: PPQ, tempo: 96, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: SCALE,
    sections: [{ id: "section-1", name: "Verse", phraseIds: ["phrase-1"] }],
    phrases: [{ id: "phrase-1", noteIds: [] }],
    notes: [],
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
}

const notes = [
  { pitch: 72, startTick: 0, durationTicks: 240 },
  { pitch: 76, startTick: 240, durationTicks: 240 }
];

function fakeStore(seed) {
  let counter = 0;
  return createIdeaBoard({
    storage: memoryStorage(seed),
    idFactory: () => `idea-${++counter}`,
    now: () => 1000 + counter
  });
}

test("papan ide menyimpan, membaca ulang, dan menghapus ide", () => {
  const storage = memoryStorage();
  const board = createIdeaBoard({ storage, idFactory: () => "idea-1", now: () => 5 });
  const saved = board.save({ notes });
  assert.equal(saved.id, "idea-1");
  assert.equal(saved.notes.length, 2);
  assert.equal(saved.spanTicks, 480);
  assert.equal(board.list().ideas.length, 1);
  assert.equal(board.list().ideas[0].createdAt, 5);

  // Memuat ulang dari storage yang sama mempertahankan isi papan ide.
  const reopened = readIdeaBoard(storage);
  assert.equal(reopened.ideas.length, 1);
  assert.deepEqual(reopened.ideas[0].notes, notes);
  assert.equal(board.remove("idea-1").id, "idea-1");
  assert.equal(board.list().ideas.length, 0);
  assert.equal(readIdeaBoard(storage).ideas.length, 0);
  assert.equal(board.remove("tidak-ada"), null);
});

test("papan ide menolak nada bertindih, di luar jangkala nada, dan kosong", () => {
  const board = fakeStore();
  for (const input of [[], [{ pitch: 72, startTick: 0, durationTicks: 0 }],
    [{ pitch: 200, startTick: 0, durationTicks: 240 }],
    [{ pitch: 72, startTick: 100, durationTicks: 240 }, { pitch: 74, startTick: 200, durationTicks: 240 }]]) {
    assert.throws(() => board.save({ notes: input }), (error) => error?.code === "idea-board-invalid-notes" || error?.code === "idea-board-overlap");
  }
  assert.equal(board.list().ideas.length, 0);
});

test("papan ide dibatasi 24 entri terbaru dan membuang entitas rusak", () => {
  const board = fakeStore();
  for (let index = 0; index < IDEA_BOARD_LIMIT + 5; index += 1) {
    board.save({ notes: [{ pitch: 60 + (index % 12), startTick: 0, durationTicks: 240 }] });
  }
  assert.equal(board.list().ideas.length, IDEA_BOARD_LIMIT);
  const normalized = normalizeIdeaBoard({
    ideas: [
      ...board.list().ideas,
      { id: "rusak", notes: "bukan nada" },
      { notes: [{ pitch: 60, startTick: 0, durationTicks: 240 }] }
    ]
  });
  assert.equal(normalized.ideas.filter(idea => idea.id === "rusak").length, 0);
  assert.ok(normalized.ideas.every(idea => Array.isArray(idea.notes)));
});

test("storage yang tidak bisa dipakai tidak membuat papan ide melempar", () => {
  const broken = {
    getItem() { throw new Error("ditolak"); },
    setItem() { throw new Error("ditolak"); }
  };
  const board = createIdeaBoard({ storage: broken, idFactory: () => "idea-x", now: () => 1 });
  assert.equal(board.list().ideas.length, 0);
  assert.equal(board.save({ notes }).id, "idea-x");
  assert.equal(board.list().ideas.length, 1);
  assert.equal(readIdeaBoard(null).ideas.length, 0);
});

test("ideaSpanTicks membulatkan ke grid dengan lantai satu grid", () => {
  assert.equal(ideaSpanTicks(notes), 480);
  assert.equal(ideaSpanTicks([{ pitch: 60, startTick: 0, durationTicks: 1 }]), 120);
  assert.equal(ideaSpanTicks([{ pitch: 60, startTick: 0, durationTicks: 121 }]), 240);
});

test("commands.saveIdea, listIdeas, dan deleteIdea tidak menyentuh lagu", () => {
  const board = fakeStore();
  const commands = createCommands(fixture(), { ideaBoard: board });
  const before = JSON.stringify(commands.getSong());
  const saved = commands.saveIdea({ notes, title: " refrain ", source: "variation" });
  assert.equal(saved.title, "refrain");
  assert.equal(saved.source, "variation");
  assert.equal(commands.listIdeas().ideas.length, 1);
  assert.equal(JSON.stringify(commands.getSong()), before, "papan ide bukan bagian dari Song");
  assert.equal(commands.getState().history.undoDepth, 0, "menyimpan ide bukan langkah undo");
  assert.ok(commands.getState().availableActions.includes("saveIdea"));
  assert.ok(commands.getState().availableActions.includes("listIdeas"));
  assert.ok(commands.getState().availableActions.includes("deleteIdea"));
  assert.equal(commands.deleteIdea(saved.id).id, saved.id);
  assert.equal(commands.listIdeas().ideas.length, 0);
  assert.equal(commands.deleteIdea("tidak-ada"), null);
  assert.throws(() => commands.deleteIdea(""), (error) => error?.code === "idea-board-invalid-entry");
});

test("tanpa store, commands.listIdeas mengembalikan papan kosong", () => {
  const commands = createCommands(fixture());
  assert.deepEqual(commands.listIdeas(), { version: 1, ideas: [] });
  assert.throws(() => commands.saveIdea({ notes }), (error) => error?.code === "idea-board-unavailable");
});

test("memuat ide ke lagu tetap satu langkah undo", () => {
  const board = fakeStore();
  const commands = createCommands(fixture(), { ideaBoard: board });
  const saved = commands.saveIdea({ notes });
  const added = commands.commitTake({ notes: saved.notes });
  assert.equal(added.length, 2);
  assert.equal(commands.getState().history.undoDepth, 1);
  assert.ok(commands.getSong().notes.every(note => !note.anchor && !note.locked && note.source === "user"));
});