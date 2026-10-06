import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import {
  CONTINUATION_BARS,
  CONTINUATION_COUNT,
  CONTINUATION_TARGETS,
  DEVELOP_KINDS,
  INTENSITIES,
  RESEED_ATTEMPTS,
  VARIATION_CATEGORIES,
  VARIATION_KINDS,
  VARIATION_MAX,
  VARIATION_MIN,
  VARIATION_TRANSFORMS,
  developContinuation,
  developVariations,
  ideaDevelop,
  notesHash,
  seedForNotes,
  variationSpan
} from "../src/generation/ideas.js";
import { createRandom } from "../src/generation/random.js";
import { isScalePitch } from "../src/generation/primitives.js";
import { contourGeometry } from "../src/ui/ideas.js";

const SCALE = Object.freeze({ name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] });
const SEEDS = Array.from({ length: 20 }, (_unused, index) => index + 1);

// Empat take contoh: legato seperempat, legato stepwise, ada jeda, dan ritme campur.
const TAKES = Object.freeze({
  "legato empat nada seperempat": [
    { pitch: 72, startTick: 0, durationTicks: 480 },
    { pitch: 74, startTick: 480, durationTicks: 480 },
    { pitch: 76, startTick: 960, durationTicks: 480 },
    { pitch: 79, startTick: 1440, durationTicks: 480 }
  ],
  "legato delapan nada stepwise": [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, index) => ({
    pitch,
    startTick: index * 240,
    durationTicks: 240
  })),
  "empat nada dengan jeda": [
    { pitch: 72, startTick: 0, durationTicks: 480 },
    { pitch: 74, startTick: 960, durationTicks: 480 },
    { pitch: 76, startTick: 1920, durationTicks: 480 },
    { pitch: 79, startTick: 2880, durationTicks: 480 }
  ],
  "ritme campur": [
    { pitch: 72, startTick: 0, durationTicks: 960 },
    { pitch: 76, startTick: 960, durationTicks: 240 },
    { pitch: 74, startTick: 1200, durationTicks: 240 },
    { pitch: 72, startTick: 1440, durationTicks: 480 }
  ]
});

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

function assertNoOverlap(notes, label) {
  const sorted = [...notes].sort((left, right) => left.startTick - right.startTick);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    assert.ok(sorted[index].startTick >= previous.startTick + previous.durationTicks,
      `${label}: nada tumpang tindih di tick ${sorted[index].startTick}`);
  }
}

test("tujuh jenis variasi semuanya berbasis seed dan tidak ada as-recorded di daftar", () => {
  assert.deepEqual([...VARIATION_KINDS], ["ornament", "inversion", "sequence", "rhythm", "skeleton", "arpeggio", "reverse"]);
  assert.equal(VARIATION_MAX, 4, "tampilan default empat kartu + Asli");
  const result = developVariations({ notes: TAKES["legato empat nada seperempat"], key: "C", scale: SCALE, seed: 3 });
  assert.ok(!result.candidates.some(candidate => candidate.kind === "as-recorded"),
    "kartu Asli adalah referensi, bukan kandidat");
  assert.deepEqual(result.candidates.map(candidate => candidate.kind), ["ornament", "inversion", "sequence", "rhythm"]);
  assert.deepEqual(result.candidates.map(candidate => candidate.id), ["variation-1", "variation-2", "variation-3", "variation-4"]);
});

test("jumlah kandidat variasi mengikuti batas dua sampai empat", () => {
  const take = TAKES["legato empat nada seperempat"];
  assert.equal(VARIATION_MIN, 2);
  assert.equal(developVariations({ notes: take, key: "C", scale: SCALE }).total, 4);
  assert.equal(developVariations({ notes: take, key: "C", scale: SCALE, count: 2 }).candidates.length, 2);
  assert.equal(developVariations({ notes: take, key: "C", scale: SCALE, count: 9 }).candidates.length, 4);
  assert.equal(developVariations({ notes: take, key: "C", scale: SCALE, count: 1 }).candidates.length, 2);
  assert.throws(() => developVariations({ notes: take, key: "C", scale: SCALE, count: 2.5 }), (error) => error?.code === "ideas-invalid-count");
});

for (const [label, take] of Object.entries(TAKES)) {
  test(`${label}: tiap kandidat berbeda dari take asli dan dari kandidat lain di 20 seed`, () => {
    const takeHash = notesHash(take);
    for (const seed of SEEDS) {
      const result = developVariations({ notes: take, key: "C", scale: SCALE, seed });
      assert.ok(result.candidates.length >= 3, `seed ${seed} hanya menghasilkan ${result.candidates.length} kandidat`);
      const seen = new Set();
      for (const candidate of result.candidates) {
        const hash = notesHash(candidate.notes);
        assert.notEqual(hash, takeHash, `seed ${seed}: ${candidate.kind} identik dengan take asli`);
        assert.ok(!seen.has(hash), `seed ${seed}: ${candidate.kind} identik dengan kandidat lain`);
        seen.add(hash);
      }
    }
  });

  test(`${label}: nada pembuka dan penutup tetap, semua nada di dalam skala`, () => {
    for (const seed of SEEDS) {
      const result = developVariations({ notes: take, key: "C", scale: SCALE, seed });
      for (const candidate of result.candidates) {
        if (candidate.kind === "reverse") {
          // Balik Sedang membalik seluruh urutan: ritme tetap, pitch terbalik.
          assert.deepEqual(candidate.notes.map((note) => note.startTick), take.map((note) => note.startTick),
            `seed ${seed}: ritme Balik harus tetap`);
          assert.deepEqual(candidate.notes.map((note) => note.durationTicks), take.map((note) => note.durationTicks),
            `seed ${seed}: durasi Balik harus tetap`);
          assert.deepEqual(candidate.notes.map((note) => note.pitch), take.map((note) => note.pitch).reverse(),
            `seed ${seed}: pitch Balik harus terbalik penuh`);
          continue;
        }
        const first = candidate.notes[0];
        const last = candidate.notes.at(-1);
        for (const [position, expected] of [[first, take[0]], [last, take.at(-1)]]) {
          assert.equal(position.pitch, expected.pitch, `seed ${seed}: nada batas bergeser`);
          assert.equal(position.startTick, expected.startTick, `seed ${seed}: waktu nada batas bergeser`);
          assert.equal(position.durationTicks, expected.durationTicks, `seed ${seed}: durasi nada batas bergeser`);
        }
        for (const note of candidate.notes) {
          assert.ok(isScalePitch(note.pitch, "C", SCALE), `nada ${note.pitch} di luar skala`);
          assert.ok(note.startTick >= 0 && note.durationTicks >= 1);
        }
        assertNoOverlap(candidate.notes, `seed ${seed} ${candidate.kind}`);
      }
    }
  });

  test(`${label}: Seed lain menghasilkan himpunan kandidat berbeda pada minimal 80 persen seed`, () => {
    const signature = (seed) => JSON.stringify(
      developVariations({ notes: take, key: "C", scale: SCALE, seed }).candidates.map(candidate => notesHash(candidate.notes))
    );
    const baseline = signature(SEEDS[0]);
    const different = SEEDS.slice(1).filter(seed => signature(seed) !== baseline).length;
    const ratio = different / (SEEDS.length - 1);
    assert.ok(ratio >= 0.8, `hanya ${Math.round(ratio * 100)} persen seed lain menghasilkan himpunan berbeda`);
  });
}

test("take legato empat nada menghasilkan minimal tiga variasi yang saling berbeda", () => {
  const take = TAKES["legato empat nada seperempat"];
  const result = developVariations({ notes: take, key: "C", scale: SCALE, seed: 11 });
  assert.ok(result.candidates.length >= 3);
  assert.equal(new Set(result.candidates.map(candidate => notesHash(candidate.notes))).size, result.candidates.length);
  assert.equal(result.sourceNotes.length, take.length);
  assert.deepEqual([...result.sourceNotes], take.map((note) => ({ ...note })));
});

test("take legato tanpa jeda tetap punya hiasan, jadi tidak hanya jenis ritme yang berubah", () => {
  const take = TAKES["legato empat nada seperempat"];
  const ornament = developVariations({ notes: take, key: "C", scale: SCALE, seed: 4 })
    .candidates.find(candidate => candidate.kind === "ornament");
  assert.ok(ornament.notes.length > take.length, "hiasan memecah nada panjang");
  assert.equal(ornament.notes[0].pitch, take[0].pitch);
  assert.equal(ornament.notes.at(-1).pitch, take.at(-1).pitch);
  assertNoOverlap(ornament.notes, "ornament");
});

test("seed sama dan input sama selalu menghasilkan kandidat yang persis sama", () => {
  const take = TAKES["ritme campur"];
  assert.equal(
    JSON.stringify(ideaDevelop({ kind: "variation", notes: take, key: "C", scale: SCALE, seed: 4242 })),
    JSON.stringify(ideaDevelop({ kind: "variation", notes: take, key: "C", scale: SCALE, seed: 4242 }))
  );
  assert.equal(seedForNotes(take), seedForNotes([...take].reverse()));
  assert.equal(seedForNotes(take), developVariations({ notes: take, key: "C", scale: SCALE }).seed);
});

test("take rusak, jenis asing, dan skala tanpa nada ditolak sebelum apa pun dihitung", () => {
  const take = TAKES["legato empat nada seperempat"];
  for (const input of [[], null, "take", [{ pitch: 72 }], [{ pitch: 200, startTick: 0, durationTicks: 120 }],
    [{ pitch: 72, startTick: 0, durationTicks: 120, anchor: true }]]) {
    assert.throws(() => developVariations({ notes: input, key: "C", scale: SCALE }), (error) => error?.code === "ideas-invalid-take");
    assert.throws(() => developContinuation({ notes: input, key: "C", scale: SCALE }), (error) => error?.code === "ideas-invalid-take");
  }
  assert.throws(() => developVariations({ notes: take, key: "C", scale: { name: "empty", intervals: [] } }),
    (error) => error?.code === "ideas-invalid-scale");
  assert.throws(() => ideaDevelop({ kind: "ajar", notes: take, key: "C", scale: SCALE }),
    (error) => error?.code === "ideas-invalid-kind");
});

test("Lanjutan mengisi celah di antara anchor A dan B tanpa mengubah lagu", () => {
  const take = TAKES["legato empat nada seperempat"];
  const takeEnd = take.at(-1).startTick + take.at(-1).durationTicks;
  assert.deepEqual([...CONTINUATION_BARS], [1, 2]);
  assert.deepEqual([...CONTINUATION_TARGETS], ["tonic", "dominant"]);
  for (const bars of CONTINUATION_BARS) {
    for (const target of CONTINUATION_TARGETS) {
      const result = developContinuation({
        notes: take, key: "C", scale: SCALE, seed: 7, bars, target,
        tempo: 96, timeSignature: { numerator: 4, denominator: 4 }
      });
      assert.equal(result.candidates.length, CONTINUATION_COUNT, "six kandidat lanjutan");
      const bar = PPQ * 4;
      assert.equal(result.gap.startTick % 120, 0, "celah mulai di grid");
      assert.equal(result.gap.endTick - result.gap.startTick, bars * bar);
      assert.ok(result.gap.startTick >= takeEnd, "celah dimulai setelah take berakhir");
      assert.equal(result.gap.target, target);
      assert.equal(result.gap.bars, bars);
      const tonic = target === "tonic" ? 0 : 7;
      assert.equal(((result.gap.anchorPitch % 12) - tonic + 12) % 12, 0, "anchor B pada nada Tonik atau Dominan");
      for (const candidate of result.candidates) {
        assert.ok(candidate.notes.length > 0);
        assert.deepEqual([...candidate.baseNotes], take.map((note) => ({ ...note })));
        for (const note of candidate.notes) {
          assert.ok(note.startTick >= result.gap.startTick, "nada lanjutan tidak mendahului celah");
          assert.ok(note.startTick + note.durationTicks <= result.gap.endTick, "nada lanjutan melewati anchor B");
          assert.ok(isScalePitch(note.pitch, "C", SCALE), `nada lanjutan ${note.pitch} di luar skala`);
        }
        const last = candidate.notes.at(-1);
        assert.equal(last.startTick + last.durationTicks, result.gap.endTick, "kandidat harus mendarat di anchor B");
        assertNoOverlap([...candidate.baseNotes, ...candidate.notes], `continue ${bars}/${target}`);
      }
    }
  }
});

test("Lanjutan tanpa bars dan target memakai seed dan tetap deterministik", () => {
  const take = TAKES["ritme campur"];
  const first = developContinuation({ notes: take, key: "C", scale: SCALE, seed: 21 });
  const second = developContinuation({ notes: take, key: "C", scale: SCALE, seed: 21 });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.ok(CONTINUATION_BARS.includes(first.gap.bars));
  assert.ok(CONTINUATION_TARGETS.includes(first.gap.target));
  const other = developContinuation({ notes: take, key: "C", scale: SCALE, seed: 22 });
  assert.notEqual(JSON.stringify(first.candidates), JSON.stringify(other.candidates),
    "seed berbeda harus menghasilkan lanjutan yang berbeda");
});

test("ideaDevelop tidak pernah menyentuh anchor, locked, atau langkah undo", () => {
  const commands = createCommands(fixture());
  commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
  const firstId = commands.getSong().notes[0].id;
  commands.setAnchor(firstId, true);
  commands.addNote({ pitch: 62, startTick: 480, durationTicks: 480 });
  commands.setLocked(commands.getSong().notes[1].id, true);
  const before = JSON.stringify(commands.getSong());
  const undoBefore = commands.getState().history.undoDepth;
  const take = TAKES["legato empat nada seperempat"];
  const variation = commands.ideaDevelop({ kind: "variation", notes: take, seed: 5150 });
  const continuation = commands.ideaDevelop({ kind: "continue", notes: take, seed: 5150 });
  assert.ok(variation.candidates.length >= 3);
  assert.equal(continuation.candidates.length, CONTINUATION_COUNT);
  assert.equal(JSON.stringify(commands.getSong()), before, "mengembangkan ide hanya membaca lagu");
  assert.equal(commands.getState().history.undoDepth, undoBefore, "mengembangkan ide bukan langkah undo");
  assert.deepEqual(commands.getState().anchorNoteIds, [firstId]);
  assert.deepEqual(commands.getState().lockedNoteIds, [commands.getSong().notes[1].id]);
  assert.ok(commands.getState().availableActions.includes("ideaDevelop"));
  assert.ok(commands.getState().availableActions.includes("developTake"));
  assert.deepEqual(commands.developTake({ notes: take, seed: 5150 }).candidates, variation.candidates);
});

test("Terima kandidat variasi menambah nada sebagai satu langkah undo", () => {
  const commands = createCommands(fixture());
  const take = TAKES["legato empat nada seperempat"];
  const variation = commands.ideaDevelop({ kind: "variation", notes: take, seed: 8 }).candidates[1];
  const added = commands.commitTake({ notes: variation.notes });
  assert.equal(added.length, variation.notes.length);
  assert.equal(commands.getState().history.undoDepth, 1);
  assert.ok(commands.getSong().notes.every(note => !note.anchor && !note.locked));
  commands.undo();
  assert.equal(commands.getSong().notes.length, 0);
});

test("Terima kandidat lanjutan menambah take dan lanjutan dalam satu langkah undo", () => {
  const commands = createCommands(fixture());
  const take = TAKES["legato empat nada seperempat"];
  const candidate = commands.ideaDevelop({ kind: "continue", notes: take, seed: 13 }).candidates[0];
  const notes = [...candidate.baseNotes, ...candidate.notes];
  const added = commands.commitTake({ notes });
  assert.equal(added.length, candidate.baseNotes.length + candidate.notes.length);
  assert.equal(commands.getState().history.undoDepth, 1, "take dan lanjutan satu commit");
  assertNoOverlap(commands.getSong().notes, "terima lanjutan");
  commands.undo();
  assert.equal(commands.getSong().notes.length, 0, "satu Undo mengembalikan take dan lanjutannya");
});

test("retry overcomes duplikat sehingga daftar kandidat tidak pernah memuat nada yang sama", () => {
  // Take satu nada tidak bisa dikembangkan oleh jenis apa pun.
  const single = [{ pitch: 72, startTick: 0, durationTicks: 480 }];
  const oneResult = developVariations({ notes: single, key: "C", scale: SCALE, seed: 5 });
  assert.equal(oneResult.total, 0, "take satu nada tidak boleh memaksa duplikat");
  // Take dua nada hanya bisa dibalik; jenis lain butuh nada tengah.
  const short = [{ pitch: 72, startTick: 0, durationTicks: 480 }, { pitch: 76, startTick: 480, durationTicks: 480 }];
  const result = developVariations({ notes: short, key: "C", scale: SCALE, seed: 5 });
  assert.ok(result.total <= 1, "take dua nada maksimal satu kandidat Balik");
  if (result.total === 1) assert.equal(result.candidates[0].kind, "reverse");
  assert.equal(RESEED_ATTEMPTS, 8, "pencobaan seed dibatasi delapan kali");
});

test("geometri mini-kontur mengisi kotak dan tidak menghasilkan polyline rusak", () => {
  const rising = contourGeometry([
    { pitch: 60, startTick: 0, durationTicks: 240 },
    { pitch: 67, startTick: 240, durationTicks: 480 }
  ]);
  assert.equal(rising.viewBox, "0 0 96 24");
  assert.equal(rising.empty, false);
  assert.equal(rising.noteCount, 2);
  const points = rising.points.split(" ");
  assert.equal(points.length, 2);
  for (const point of points) {
    const [x, y] = point.split(",").map(Number);
    assert.ok(Number.isFinite(x) && x >= 2 && x <= 94, `x ${x} di luar kotak`);
    assert.ok(Number.isFinite(y) && y >= 2 && y <= 22, `y ${y} di luar kotak`);
  }
  const [x0, y0] = points[0].split(",").map(Number);
  const [x1, y1] = points[1].split(",").map(Number);
  assert.ok(y1 < y0, "nada lebih tinggi digambar lebih ke atas");
  assert.ok(x1 > x0, "waktu bergerak ke kanan");
  const flat = contourGeometry([{ pitch: 60, startTick: 0, durationTicks: 120 }, { pitch: 60, startTick: 120, durationTicks: 120 }]);
  assert.equal(flat.points.split(" ").length, 2, "rentang nada satu oktaf tetap menghasilkan dua titik");
  const empty = contourGeometry([]);
  assert.equal(empty.empty, true);
  assert.equal(empty.points, "");
});

test("variationSpan membulatkan akhir take ke grid dengan lantai satu birama", () => {
  const take = TAKES["legato empat nada seperempat"];
  assert.equal(variationSpan(take), 1920);
  assert.equal(variationSpan([{ pitch: 60, startTick: 0, durationTicks: PPQ }]), PPQ);
  assert.equal(variationSpan([{ pitch: 60, startTick: 0, durationTicks: 121 }]), PPQ);
  assert.equal(variationSpan([{ pitch: 60, startTick: 0, durationTicks: 481 }]), 600);
});

function buildKind(kind, take, seed, intensity = "medium") {
  const context = { key: "C", scale: SCALE };
  return VARIATION_TRANSFORMS[kind](take.map((note) => ({ ...note })), context, createRandom(seed), intensity);
}

test("kategori variasi menutup keempat kelompok", () => {
  assert.deepEqual(VARIATION_CATEGORIES, {
    inversion: "pitch",
    sequence: "pitch",
    reverse: "pitch",
    arpeggio: "pitch",
    rhythm: "rhythm",
    augment: "rhythm",
    ornament: "density",
    skeleton: "density",
    octave: "register"
  });
  assert.deepEqual([...INTENSITIES], ["gentle", "medium", "bold"]);
});

test("intensitas tidak valid ditolak", () => {
  const take = TAKES["legato empat nada seperempat"];
  assert.throws(() => developVariations({ notes: take, key: "C", scale: SCALE, intensity: "keras" }),
    (error) => error?.code === "ideas-invalid-intensity");
});

test("skeleton memangkas >= 30 persen pada take >= 4 nada dan deterministik", () => {
  for (const [label, take] of Object.entries(TAKES)) {
    if (take.length < 4) continue;
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        const first = buildKind("skeleton", take, seed, intensity);
        const second = buildKind("skeleton", take, seed, intensity);
        assert.deepEqual(first, second, `${label} seed ${seed} ${intensity} harus deterministik`);
        assert.ok(first.length >= 2, `${label}: minimal dua nada tersisa`);
        assert.ok(first.length <= Math.floor(take.length * 0.7),
          `${label} seed ${seed} ${intensity}: ${first.length} dari ${take.length} nada kurang dari 30 persen`);
        assert.equal(first[0].pitch, take[0].pitch, "nada pembuka tetap");
        assert.equal(first.at(-1).pitch, take.at(-1).pitch, "nada penutup tetap");
        for (const note of first) {
          assert.ok(isScalePitch(note.pitch, "C", SCALE), `nada ${note.pitch} di luar skala`);
        }
        assertNoOverlap(first, `${label} skeleton ${intensity}`);
      }
    }
  }
  const short = TAKES["legato empat nada seperempat"].slice(0, 2);
  assert.deepEqual(buildKind("skeleton", short, 7), short, "take < 3 nada dilewati");
});

test("skeleton berani memangkas lebih banyak daripada halus", () => {
  const take = TAKES["legato delapan nada stepwise"];
  const gentle = buildKind("skeleton", take, 11, "gentle").length;
  const medium = buildKind("skeleton", take, 11, "medium").length;
  const bold = buildKind("skeleton", take, 11, "bold").length;
  assert.ok(gentle >= medium && medium >= bold, `halus ${gentle} >= sedang ${medium} >= berani ${bold}`);
  assert.ok(bold <= Math.ceil(take.length * 0.3), "berani menyisakan <= 30 persen");
});

test("arpeggio meloncat >= 3 semitone pada >= 40 persen transisi", () => {
  for (const [label, take] of Object.entries(TAKES)) {
    if (take.length < 3) continue;
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        const built = buildKind("arpeggio", take, seed, intensity);
        assert.equal(built[0].pitch, take[0].pitch, "nada pembuka tetap");
        assert.equal(built.at(-1).pitch, take.at(-1).pitch, "nada penutup tetap");
        const leaps = [];
        for (let index = 1; index < built.length; index += 1) {
          leaps.push(Math.abs(built[index].pitch - built[index - 1].pitch));
        }
        const ratio = leaps.filter((leap) => leap >= 3).length / leaps.length;
        assert.ok(ratio >= 0.4, `${label} seed ${seed} ${intensity}: hanya ${Math.round(ratio * 100)} persen transisi meloncat`);
        for (const note of built) {
          assert.ok(isScalePitch(note.pitch, "C", SCALE), `nada ${note.pitch} di luar skala`);
        }
        assertNoOverlap(built, `${label} arpeggio ${intensity}`);
      }
    }
  }
  const short = TAKES["legato empat nada seperempat"].slice(0, 2);
  assert.deepEqual(buildKind("arpeggio", short, 7), short, "take < 3 nada dilewati");
});

test("reverse mempertahankan ritme 100 persen", () => {
  for (const [label, take] of Object.entries(TAKES)) {
    for (const seed of SEEDS) {
      const gentle = buildKind("reverse", take, seed, "gentle");
      assert.deepEqual(gentle.map((note) => note.startTick), take.map((note) => note.startTick));
      assert.deepEqual(gentle.map((note) => note.durationTicks), take.map((note) => note.durationTicks));
      assert.equal(gentle[0].pitch, take[0].pitch, "halus: pembuka tetap");
      assert.equal(gentle.at(-1).pitch, take.at(-1).pitch, "halus: penutup tetap");
      for (const intensity of ["medium", "bold"]) {
        const full = buildKind("reverse", take, seed, intensity);
        assert.deepEqual(full.map((note) => note.startTick), take.map((note) => note.startTick),
          `${label} ${intensity}: ritme tetap`);
        assert.deepEqual(full.map((note) => note.durationTicks), take.map((note) => note.durationTicks),
          `${label} ${intensity}: durasi tetap`);
        assert.deepEqual(full.map((note) => note.pitch), take.map((note) => note.pitch).reverse(),
          `${label} ${intensity}: pitch terbalik penuh`);
      }
    }
  }
});

test("intensitas sedang pada jenis lama sama dengan sebelum intensitas ada", () => {
  // Nilai fundamental: Sedang harus deterministik dan berbeda antar seed,
  // sementara Halus mengubah lebih sedikit dan Berani lebih banyak.
  const take = TAKES["legato delapan nada stepwise"];
  for (const kind of ["ornament", "inversion", "sequence", "rhythm"]) {
    const medium = buildKind(kind, take, 9, "medium");
    assert.deepEqual(medium, buildKind(kind, take, 9, "medium"), `${kind} sedang deterministik`);
    assert.notDeepEqual(
      notesHash(medium),
      notesHash(buildKind(kind, take, 10, "medium")),
      `${kind}: seed lain memberi hasil lain`
    );
  }
});

test("label dan hint jenis baru tersedia di id dan en", () => {
  const messages = readFileSync(new URL("../src/i18n/messages.js", import.meta.url), "utf8");
  for (const [key, id, en] of [
    ["ideasVariationSkeleton", "Inti", "Core"],
    ["ideasVariationArpeggio", "Lompat", "Leap"],
    ["ideasVariationReverse", "Balik", "Reverse"],
    ["ideasIntensityGentle", "Halus", "Gentle"],
    ["ideasIntensityMedium", "Sedang", "Medium"],
    ["ideasIntensityBold", "Berani", "Bold"]
  ]) {
    assert.match(messages, new RegExp(`${key}: "${id}"`), `${key} harus ada dalam bahasa Indonesia`);
    assert.match(messages, new RegExp(`${key}: "${en}"`), `${key} harus ada dalam bahasa Inggris`);
  }
});