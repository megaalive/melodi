import test from "node:test";
import assert from "node:assert/strict";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import {
  VARIATION_KINDS,
  VARIATION_MAX,
  VARIATION_MIN,
  developVariations,
  seedForNotes,
  variationSpan
} from "../src/generation/ideas.js";
import { isScalePitch } from "../src/generation/primitives.js";

const SCALE = Object.freeze({ name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] });

function fixture() {
  return createSong({
    id: "song-variations",
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

const take = [
  { pitch: 72, startTick: 0, durationTicks: 240 },
  { pitch: 74, startTick: 480, durationTicks: 240 },
  { pitch: 76, startTick: 960, durationTicks: 480 }
];

test("variasi dibatasi dua sampai tiga kandidat", () => {
  assert.equal(VARIATION_MIN, 2);
  assert.equal(VARIATION_MAX, 3);
  assert.equal(developVariations({ notes: take, key: "C", scale: SCALE }).total, 3);
  assert.equal(developVariations({ notes: take, key: "C", scale: SCALE, count: 2 }).candidates.length, 2);
  assert.equal(developVariations({ notes: take, key: "C", scale: SCALE, count: 9 }).candidates.length, 3);
  assert.equal(developVariations({ notes: take, key: "C", scale: SCALE, count: 1 }).candidates.length, 2);
  assert.throws(() => developVariations({ notes: take, key: "C", scale: SCALE, count: 2.5 }), (error) => error?.code === "ideas-invalid-count");
});

test("seed sama menghasilkan variasi yang persis sama", () => {
  const first = developVariations({ notes: take, key: "C", scale: SCALE, seed: 4242 });
  const second = developVariations({ notes: take, key: "C", scale: SCALE, seed: 4242 });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const longer = Array.from({ length: 8 }, (unused, index) => ({
    pitch: 60 + index * 2,
    startTick: index * 240,
    durationTicks: 240
  }));
  const base = developVariations({ notes: longer, key: "C", scale: SCALE, seed: 4242 });
  const other = developVariations({ notes: longer, key: "C", scale: SCALE, seed: 99 });
  assert.notEqual(JSON.stringify(base.candidates), JSON.stringify(other.candidates),
    "seed berbeda harus menghasilkan variasi yang berbeda");
});

test("tanpa seed, take yang sama menghasilkan seed yang sama", () => {
  assert.equal(seedForNotes(take), seedForNotes([...take].reverse()));
  assert.equal(seedForNotes(take), developVariations({ notes: take, key: "C", scale: SCALE }).seed);
});

test("nada pembuka dan penutup take tidak pernah berubah", () => {
  const result = developVariations({ notes: take, key: "C", scale: SCALE, seed: 7 });
  for (const candidate of result.candidates) {
    const first = candidate.notes[0];
    const last = candidate.notes.at(-1);
    assert.equal(first.pitch, take[0].pitch);
    assert.equal(first.startTick, take[0].startTick);
    assert.equal(last.pitch, take.at(-1).pitch);
    assert.equal(last.startTick, take.at(-1).startTick);
  }
});

test("semua nada variasi tetap di dalam scale lagu dan tidak menabrak diri sendiri", () => {
  const result = developVariations({ notes: take, key: "C", scale: SCALE, seed: 11 });
  for (const candidate of result.candidates) {
    for (const note of candidate.notes) {
      assert.ok(isScalePitch(note.pitch, "C", SCALE), `nada ${note.pitch} di luar scale`);
      assert.ok(note.startTick >= 0);
      assert.ok(note.durationTicks >= 1);
      assert.ok(note.pitch >= 36 && note.pitch <= 96);
    }
    const sorted = [...candidate.notes].sort((left, right) => left.startTick - right.startTick);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      assert.ok(sorted[index].startTick >= previous.startTick + previous.durationTicks,
        `variasi ${candidate.id}: nada tumpang tindih di tick ${sorted[index].startTick}`);
    }
  }
});

test("jenis variasi mengikuti urutan yang bisa diandalkan", () => {
  const result = developVariations({ notes: take, key: "C", scale: SCALE, seed: 3 });
  assert.deepEqual(result.candidates.map(candidate => candidate.kind), [...VARIATION_KINDS].slice(0, result.total));
  assert.deepEqual(result.candidates.map(candidate => candidate.id), ["variation-1", "variation-2", "variation-3"]);
  assert.deepEqual(result.candidates[0].notes, take.map(note => ({ ...note })));
});

test("take rusak ditolak sebelum apa pun dihitung", () => {
  for (const input of [[], null, "take", [{ pitch: 72 }], [{ pitch: 200, startTick: 0, durationTicks: 120 }],
    [{ pitch: 72, startTick: 0, durationTicks: 120, anchor: true }]]) {
    assert.throws(() => developVariations({ notes: input, key: "C", scale: SCALE }), (error) => error?.code === "ideas-invalid-take");
  }
});

test("skala lagu tanpa nada yang cocok ditolak", () => {
  assert.throws(() => developVariations({ notes: take, key: "C", scale: { name: "empty", intervals: [] } }),
    (error) => error?.code === "ideas-invalid-scale");
});

test("developTake di command layer deterministik dan tidak mengubah lagu", () => {
  const commands = createCommands(fixture());
  const before = JSON.stringify(commands.getSong());
  const first = commands.developTake({ notes: take, seed: 5150 });
  const second = commands.developTake({ notes: take, seed: 5150 });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(commands.getSong()), before, "developTake hanya membaca lagu");
  assert.equal(commands.getState().history.undoDepth, 0, "mengembangkan ide bukan langkah undo");
  assert.ok(commands.getState().availableActions.includes("developTake"));
  assert.throws(() => commands.developTake({ notes: [] }), (error) => error?.code === "ideas-invalid-take");
});

test("menerima satu variasi menambah nada sebagai satu langkah undo", () => {
  const commands = createCommands(fixture());
  const variation = commands.developTake({ notes: take, seed: 8 }).candidates[1];
  const added = commands.commitTake({ notes: variation.notes });
  assert.equal(added.length, variation.notes.length);
  assert.equal(commands.getState().history.undoDepth, 1);
  assert.ok(commands.getSong().notes.every(note => !note.anchor && !note.locked));
  commands.undo();
  assert.equal(commands.getSong().notes.length, 0);
});

test("variationSpan membulatkan akhir take ke grid dengan lantai satu birama", () => {
  assert.equal(variationSpan(take), 1440);
  assert.equal(variationSpan([{ pitch: 60, startTick: 0, durationTicks: PPQ }]), PPQ);
  assert.equal(variationSpan([{ pitch: 60, startTick: 0, durationTicks: 121 }]), PPQ);
  assert.equal(variationSpan([{ pitch: 60, startTick: 0, durationTicks: 481 }]), 600);
});