import test from "node:test";
import assert from "node:assert/strict";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import {
  KEYBOARD_BLACK_COUNT,
  KEYBOARD_DEFAULT_OCTAVE,
  KEYBOARD_MAX_OCTAVE,
  KEYBOARD_MIN_OCTAVE,
  KEYBOARD_OCTAVE_LOW,
  BLACK_KEY_ROWS,
  QUANTIZE_MODES,
  TAKE_LIMIT,
  KEYBOARD_WHITE_COUNT,
  WHITE_KEY_ROWS,
  gridTicksFor,
  isTypingTarget,
  keyboardBaseFor,
  keyboardDisabled,
  keyboardRangeFor,
  keyboardRows,
  keyToPitch,
  quantizeTake
} from "../src/ui/ideas.js";

function fixture() {
  return createSong({
    id: "song-ideas",
    title: "Ide",
    timing: { ppq: PPQ, tempo: 96, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [{ id: "section-1", name: "Verse", phraseIds: ["phrase-1"] }],
    phrases: [{ id: "phrase-1", noteIds: [] }],
    notes: [],
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
}

const events = [
  { pitch: 72, startTick: 4, durationTicks: 90 },
  { pitch: 74, startTick: 250, durationTicks: 40 },
  { pitch: 76, startTick: 505, durationTicks: 10 }
];

test("grid tangkap ide mengikuti snap yang sama dengan editor", () => {
  assert.equal(gridTicksFor("1/8"), PPQ / 2);
  assert.equal(gridTicksFor("1/16"), PPQ / 4);
  assert.equal(gridTicksFor("1/4"), PPQ);
  assert.equal(gridTicksFor("tidak-ada"), PPQ / 2, "snap asing harus jatuh ke default");
  assert.deepEqual([...QUANTIZE_MODES], ["off", "light", "strict"]);
});

test("kuantisasi Ringan menarik 50 persen dan Ketat 100 persen ke grid", () => {
  const strict = quantizeTake(events, { quantize: "strict", snap: "1/8" });
  assert.deepEqual(strict.map((note) => note.startTick), [0, PPQ / 2, PPQ]);
  const light = quantizeTake(events, { quantize: "light", snap: "1/8" });
  assert.deepEqual(light.map((note) => note.startTick), [2, 245, 493]);
  const off = quantizeTake(events, { quantize: "off", snap: "1/8" });
  assert.deepEqual(off.map((note) => note.startTick), [4, 250, 505]);
  assert.ok(off.every((note) => note.durationTicks >= 1));
});

test("durasi take minimal satu grid dan nada tidak saling menindih", () => {
  const notes = quantizeTake([
    { pitch: 72, startTick: 0, durationTicks: 2 },
    { pitch: 72, startTick: 10, durationTicks: 2 }
  ], { quantize: "strict", snap: "1/8" });
  assert.ok(notes.every((note) => note.durationTicks === PPQ / 2));
  for (let index = 1; index < notes.length; index += 1) {
    const previous = notes[index - 1];
    assert.ok(notes[index].startTick >= previous.startTick + previous.durationTicks);
  }
});

test("take tanpa nada tidak pernah dibuat", () => {
  assert.deepEqual(quantizeTake([], { quantize: "strict", snap: "1/8" }), []);
});

test("keyboard QWERTY memetakan A-L dan W-E-T-Y-U ke dua oktaf", () => {
  assert.equal(keyToPitch("a", 0), KEYBOARD_OCTAVE_LOW);
  assert.equal(keyToPitch("l", 0), KEYBOARD_OCTAVE_LOW + 14);
  assert.equal(keyToPitch("w", 0), KEYBOARD_OCTAVE_LOW + 1);
  assert.equal(keyToPitch("e", 0), KEYBOARD_OCTAVE_LOW + 3);
  assert.equal(keyToPitch("y", 1), KEYBOARD_OCTAVE_LOW + 12 + 8);
  assert.equal(keyToPitch("u", 0), KEYBOARD_OCTAVE_LOW + 10);
  assert.equal(keyToPitch("z", 0), null, "Z bukan nada");
  assert.equal(keyToPitch("x", 0), null, "X bukan nada");
  assert.equal(keyToPitch("Enter", 0), null);
  const pitches = [...WHITE_KEY_ROWS, ...BLACK_KEY_ROWS].map(([, offset]) => offset);
  assert.equal(new Set(pitches).size, pitches.length, "tiap nada punya satu tombol saja");
  assert.equal(Math.max(...pitches), 14, "sembilan tombol putih menutup satu oktaf lebih satu nada");
});

test("keyboard tangkap ide dua oktaf penuh C4-B5 dengan posisi tombol hitam dari celah putih", () => {
  assert.equal(KEYBOARD_WHITE_COUNT, 14, "dua oktaf penuh berarti empat belas tombol putih");
  assert.equal(KEYBOARD_BLACK_COUNT, 10);
  assert.equal(KEYBOARD_DEFAULT_OCTAVE, 1, "buka di C4");
  const range = keyboardRangeFor(KEYBOARD_DEFAULT_OCTAVE);
  assert.equal(range.low, 60);
  assert.equal(range.high, 83);
  const rows = keyboardRows(range.low);
  assert.deepEqual(rows.white.map((entry) => entry.pitch),
    [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83]);
  assert.deepEqual(rows.black.map((entry) => entry.pitch), [61, 63, 66, 68, 70, 73, 75, 78, 80, 82]);
  // C# duduk di tengah celah C dan D, jadi 1 dari 14 lebar baris tombol putih.
  assert.deepEqual(rows.black.map((entry) => entry.slot), [1, 2, 4, 5, 6, 8, 9, 11, 12, 13]);
  for (const entry of rows.black) {
    const expected = Math.round(entry.slot / KEYBOARD_WHITE_COUNT * 1000000) / 10000;
    assert.equal(Number(entry.slotPercent), expected);
    assert.ok(Math.abs(Number(entry.slotPercent) - entry.slot / KEYBOARD_WHITE_COUNT * 100) < 0.001);
  }
  const pitches = [...rows.white, ...rows.black].map((entry) => entry.pitch);
  assert.equal(new Set(pitches).size, pitches.length, "tiap nada punya satu tombol saja");
  // QWERTY hanya melabeli nada yang benar-benar bisa dibunyikan huruf.
  const labelled = [...rows.white, ...rows.black].filter((entry) => entry.hotkey).map((entry) => entry.pitch);
  assert.deepEqual(labelled, [...WHITE_KEY_ROWS, ...BLACK_KEY_ROWS].map(([, offset]) => offset + 60));
});

test("rentang keyboard dijepit supaya dua oktaf selalu utuh", () => {
  assert.equal(keyboardBaseFor(-4), keyboardBaseFor(KEYBOARD_MIN_OCTAVE));
  assert.equal(keyboardBaseFor(99), keyboardBaseFor(KEYBOARD_MAX_OCTAVE));
  assert.equal(keyboardBaseFor(0), KEYBOARD_OCTAVE_LOW);
});

test("keyboard QWERTY mati saat fokus di input, textarea, select, atau palette", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(keyboardDisabled({ tagName: "INPUT" }, false), true);
  assert.equal(keyboardDisabled({ tagName: "DIV" }, true), true);
  assert.equal(keyboardDisabled({ tagName: "DIV" }, false), false);
});

test("commitTake menambah satu take sebagai satu langkah undo", () => {
  const commands = createCommands(fixture());
  const before = commands.getSong().notes.length;
  const added = commands.commitTake({ notes: [
    { pitch: 72, startTick: 0, durationTicks: 240 },
    { pitch: 76, startTick: 240, durationTicks: 240 }
  ] });
  assert.equal(added.length, 2);
  assert.equal(commands.getSong().notes.length, before + 2);
  assert.ok(commands.getSong().notes.every((note) => note.source === "user" && note.anchor === false && note.locked === false));
  assert.equal(commands.getState().history.undoDepth, 1, "take utuh harus satu langkah undo");
  commands.undo();
  assert.equal(commands.getSong().notes.length, before);
});

test("commitTake menggeser take ke posisi sisip dan menjaganya dari tumpang tindih", () => {
  const commands = createCommands(fixture());
  commands.commitTake({ notes: [{ pitch: 60, startTick: 0, durationTicks: 480 }] });
  const second = commands.commitTake({ notes: [{ pitch: 62, startTick: 0, durationTicks: 480 }], insertAtTick: 1920 });
  assert.equal(second[0].startTick, 1920);
  const notes = commands.getSong().notes;
  assert.ok(notes.every((note, index) => index === 0 || note.startTick >= notes[index - 1].startTick + notes[index - 1].durationTicks));
});

test("commitTake menolak take kosong, properti asing, dan nada di luar schema", () => {
  const commands = createCommands(fixture());
  assert.throws(() => commands.commitTake({ notes: [] }), (error) => error?.code === "invalid-note");
  assert.throws(() => commands.commitTake({ notes: [{ pitch: 60, startTick: 0, durationTicks: 120, source: "generated" }] }),
    (error) => error?.code === "invalid-note");
  assert.throws(() => commands.commitTake({ notes: [{ pitch: 60, startTick: 0 }] }), (error) => error?.code === "invalid-duration");
  assert.throws(() => commands.commitTake({ notes: [{ pitch: 200, startTick: 0, durationTicks: 120 }] }),
    (error) => error?.code === "invalid-pitch");
  assert.equal(commands.getSong().notes.length, 0, "take yang gagal tidak boleh meninggalkan nada setengah jadi");
});

test("commitTake tersedia di kontrak availableActions", () => {
  const commands = createCommands(fixture());
  assert.ok(commands.getState().availableActions.includes("commitTake"));
});

test("mode tampilan ideas hanya tampilkan region Ide", () => {
  const commands = createCommands(fixture());
  assert.equal(commands.setViewMode("ideas"), "ideas");
  assert.equal(commands.getState().view.mode, "ideas");
  assert.throws(() => commands.setViewMode("ide"), (error) => error?.code === "invalid-view-mode");
});

test("daftar take dibatasi lima take terbaru", () => {
  assert.equal(TAKE_LIMIT, 5);
});