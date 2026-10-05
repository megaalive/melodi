import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { notesHash } from "../src/generation/ideas.js";
import { isScalePitch } from "../src/generation/primitives.js";
import {
  QUALITY_TAKES,
  QUALITY_THRESHOLDS,
  developForQuality,
  formatReport,
  measureCandidate,
  percent,
  runMetrics,
  thresholdFailures
} from "../tools/idea-quality.mjs";

// C1: skrip metrik harus bisa diulang, deterministik, dan mengukur hal yang
// benar. C2d: setelah generator lanjutan berbasis motif, ambang mutu itu
// ditegakkan di commit kedua ini.
const SCALE = Object.freeze({ name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] });
const SMALL = Object.freeze({ seeds: 4, bars: [1, 2] });

function fixture() {
  return createSong({
    id: "song-quality",
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

test("laporan metrik memakai tujuh take contoh, dua panjang birama, dan seed tetap", () => {
  const report = runMetrics(SMALL);
  assert.deepEqual(Object.keys(QUALITY_TAKES), [
    "legato 4 seperempat",
    "legato 8 stepwise",
    "empat nada dengan jeda",
    "ritme campur",
    "renggang dengan jeda",
    "rendah A3-C4",
    "phone 211 tick"
  ]);
  assert.equal(report.seeds, SMALL.seeds);
  assert.equal(report.takes, 7);
  assert.deepEqual(report.bars, SMALL.bars);
  assert.ok(report.candidates > 0, "setiap pengembangan harus punya kandidat");
  for (const [label, value] of Object.entries(report.distinctPerBarByLength)) {
    assert.equal(typeof value, "number", label);
  }
  const table = formatReport(report);
  assert.match(table, /transisi nada-sama/);
  assert.match(table, /p95 ideaDevelop/);
  assert.match(table, /nada berbeda per baris 2 birama/);
  assert.match(table, /durasi median 0,5x-2x take/);
  assert.match(table, /sambungan <= 5 semitone/);
  assert.match(table, /metode minimum per set/);
});

test("metrik kandidat berada di rentang yang masuk akal dan menghitung hal yang benar", () => {
  const take = QUALITY_TAKES["legato 4 seperempat"];
  const measured = measureCandidate(
    { notes: [
      { pitch: 79, startTick: 1920, durationTicks: 480 },
      { pitch: 81, startTick: 2400, durationTicks: 480 },
      { pitch: 79, startTick: 2880, durationTicks: 480 },
      { pitch: 77, startTick: 3360, durationTicks: 480 }
    ] },
    { take, anchorAPitch: 76, anchorBPitch: 72, gapStart: 1920, barTicks: 1920, bars: 1 }
  );
  assert.equal(measured.noteCount, 4);
  assert.equal(measured.sameRatio, 0, "tidak ada transisi nada-sama pada contoh ini");
  assert.equal(measured.distinctPerBar, 4, "tiga nada lanjutan plus anchor A");
  assert.equal(measured.meanInterval, (3 + 2 + 2 + 2 + 5) / 5);
  assert.equal(measured.leapRatio, 0, "tidak ada interval >= kuint");
  assert.equal(measured.leapResolveRatio, 1);
  assert.equal(measured.landsOnAnchor, false, "nada terakhir turun lima semitone ke anchor B, jadi bukan langkah");
  assert.equal(measured.onsetReuseRatio, 1, "ketika durasi 480, onset 0 dan 480 sama-sama terpakai");

  const repeated = measureCandidate(
    { notes: [
      { pitch: 76, startTick: 1920, durationTicks: 480 },
      { pitch: 76, startTick: 2400, durationTicks: 480 }
    ] },
    { take, anchorAPitch: 76, anchorBPitch: 76, gapStart: 1920, barTicks: 1920, bars: 1 }
  );
  assert.equal(repeated.sameRatio, 1, "dua nada sama berturut-turut dihitung sebagai transisi nada-sama");
  assert.equal(repeated.landsOnAnchor, false, "unison bukan langkah pendaratan");

  const leaping = measureCandidate(
    { notes: [
      { pitch: 71, startTick: 1920, durationTicks: 960 },
      { pitch: 79, startTick: 2880, durationTicks: 960 }
    ] },
    { take, anchorAPitch: 76, anchorBPitch: 79, gapStart: 1920, barTicks: 1920, bars: 1 }
  );
  assert.equal(leaping.leapRatio, 1 / 2, "interval ke anchor B tidak dihitung sebagai lompatan frasa");
  assert.equal(leaping.leapResolveRatio, 0, "lompatan itu tidak dibalikkan arah");
});

test("metrik diulang dengan seed yang sama menghasilkan angka yang sama", () => {
  const first = runMetrics(SMALL);
  const second = runMetrics(SMALL);
  for (const key of ["candidates", "sameRatio", "distinctPerBar", "meanInterval", "leapRatio", "landRatio", "onsetReuseRatio", "methodCounts"]) {
    assert.deepEqual(first[key], second[key], `${key} harus deterministik`);
  }
  assert.deepEqual(Object.keys(first.distinctPerBarByLength), Object.keys(second.distinctPerBarByLength));
  for (const key of Object.keys(first.distinctPerBarByLength)) {
    assert.equal(first.distinctPerBarByLength[key], second.distinctPerBarByLength[key]);
  }
});

test("developContinuation deterministik, di dalam skala, tidak menindih, dan tidak mengubah lagu", () => {
  const commands = createCommands(fixture());
  commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
  commands.setAnchor(commands.getSong().notes[0].id, true);
  const before = JSON.stringify(commands.getSong());
  const undoBefore = commands.getState().history.undoDepth;
  for (const [label, take] of Object.entries(QUALITY_TAKES)) {
    for (const bars of [1, 2]) {
      const first = commands.ideaDevelop({ kind: "continue", notes: take, seed: 4242, bars });
      const second = commands.ideaDevelop({ kind: "continue", notes: take, seed: 4242, bars });
      assert.deepEqual(first.candidates, second.candidates, `${label} ${bars} birama harus deterministik`);
      const hashes = new Set();
      for (const candidate of first.candidates) {
        assert.ok(candidate.notes.length > 0, `${label}: kandidat tidak boleh kosong`);
        const hash = notesHash(candidate.notes);
        assert.ok(!hashes.has(hash), `${label}: kandidat continue harus berbeda satu sama lain`);
        hashes.add(hash);
        const sorted = [...candidate.notes].sort((left, right) => left.startTick - right.startTick);
        for (const note of candidate.notes) {
          assert.ok(isScalePitch(note.pitch, "C", SCALE), `${label}: nada ${note.pitch} di luar skala`);
          assert.ok(note.startTick % 120 === 0, `${label}: nada tidak selaras GRID`);
          assert.ok(note.durationTicks >= 1);
        }
        for (let index = 1; index < sorted.length; index += 1) {
          const previous = sorted[index - 1];
          assert.ok(sorted[index].startTick >= previous.startTick + previous.durationTicks,
            `${label}: nada lanjutan saling menindih`);
        }
        const last = candidate.notes.at(-1);
        assert.ok(last.startTick + last.durationTicks <= first.gap.endTick, `${label}: nada melewati anchor B`);
      }
      assert.equal(JSON.stringify(commands.getSong()), before, "Lanjutkan hanya membaca lagu");
      assert.equal(commands.getState().history.undoDepth, undoBefore);
    }
  }
  assert.deepEqual(commands.getState().anchorNoteIds.length, 1);
});

test("Terima kandidat lanjutan tetap satu langkah undo", () => {
  const commands = createCommands(fixture());
  const take = QUALITY_TAKES["legato 4 seperempat"];
  const candidate = commands.ideaDevelop({ kind: "continue", notes: take, seed: 17, bars: 1 }).candidates[0];
  const notes = [...candidate.baseNotes, ...candidate.notes];
  commands.commitTake({ notes });
  assert.equal(commands.getState().history.undoDepth, 1);
  commands.undo();
  assert.equal(commands.getState().history.undoDepth, 0);
  assert.equal(commands.getSong().notes.length, 0);
});

test("ambang mutu C2d terpenuhi pada sampel penuh 30 seed dan dua panjang birama", () => {
  // Tujuh take contoh x 30 seed x 1 dan 2 birama, sama seperti
  // tools/idea-quality.mjs, jadi ambangnya diuji pada sampel yang sama.
  const report = runMetrics({ seeds: 30, bars: [1, 2] });
  const failures = thresholdFailures(report);
  // node --test menjalankan berkas test secara paralel, jadi p95 di dalam suite
  // naik tajam karena CPU dibagi (sekitar 90 ms). Ambang 30 ms tetap ditegakkan
  // oleh tools/idea-quality.mjs yang berjalan sendiri; tes ini memeriksa
  // ambang musiknya saja supaya tidak gagal karena beban CPU, bukan karena
  // regresi. Jalankan `node tools/idea-quality.mjs` untuk angka p95 yang resmi.
  const musicFailures = failures.filter((failure) => !failure.startsWith("p95 ideaDevelop"));
  assert.deepEqual(musicFailures, [], `ambang musik belum terpenuhi: ${musicFailures.join("; ")}`);
  assert.ok(report.sameRatio <= 0.25, `transisi nada-sama ${percent(report.sameRatio)} harus <= 25%`);
  assert.ok(report.distinctPerBarByLength["1 birama"] >= 4);
  assert.ok(report.distinctPerBarByLength["2 birama"] >= 5);
  assert.ok(report.meanInterval >= 1.5 && report.meanInterval <= 3.5);
  assert.ok(report.leapRatio <= 0.15);
  assert.ok(report.leapResolveRatio >= 0.8);
  assert.ok(report.landRatio >= 0.9);
  assert.ok(report.onsetReuseRatio >= 0.5, "setidaknya 3 dari 6 kandidat memakai ulang pola onset take");
  assert.ok(report.distinctMethods >= 3);
  // Ritme dan sambungan (C1): lookahead baru harus drapedari take, bukan grid
  // yang lebih halus, dan sambungan dari nada terakhir take harus berupa langkah.
  assert.ok(report.denseRatio >= QUALITY_THRESHOLDS.minDenseRatio,
    `durasi median dalam 0,5x-2x take hanya ${percent(report.denseRatio)}`);
  assert.ok(report.overNoteCountRatio <= QUALITY_THRESHOLDS.maxOverNoteCountRatio,
    `kandidat melewati batas nada per birama ${percent(report.overNoteCountRatio)}`);
  assert.ok(report.joinLeapRatio >= QUALITY_THRESHOLDS.minJoinLeapRatio,
    `sambungan <= ${QUALITY_THRESHOLDS.maxJoinLeap} semitone hanya ${percent(report.joinLeapRatio)}`);
  assert.ok(report.joinLeapMedian <= QUALITY_THRESHOLDS.maxJoinLeap);
  assert.ok(report.setsWithThreeMethods >= QUALITY_THRESHOLDS.minSetsWithThreeMethods,
    `hanya ${percent(report.setsWithThreeMethods)} set yang punya minimal tiga metode`);
  // p95 bergantung mesin dan CPU suite, jadi dijaga longgar di sini; angka resmi
  // ditegakkan tools/idea-quality.mjs.
  assert.ok(report.developP95 <= QUALITY_THRESHOLDS.looseDevelopP95,
    `p95 ${report.developP95.toFixed(2)} ms melewati batas longgar ${QUALITY_THRESHOLDS.looseDevelopP95} ms`);
});

test("kandidat lanjutan memakai motif take dan punya metode yang dikenal", () => {
  const methods = new Set();
  for (const [label, take] of Object.entries(QUALITY_TAKES)) {
    const developed = developForQuality(take, { seed: 31, bars: 1 });
    assert.ok(developed.candidates.length >= 3, `${label}: minimal tiga kandidat lanjutan`);
    assert.ok(developed.candidates.length <= 6, `${label}: maksimal enam kandidat`);
    assert.ok(developed.methods.length >= 1, `${label}: minimal satu metode`);
    for (const candidate of developed.candidates) {
      assert.equal(candidate.kind, "continue");
      assert.ok(typeof candidate.meta.method === "string" && candidate.meta.method.length > 0, `${label}: meta.method wajib ada`);
      methods.add(candidate.meta.method);
      assert.equal(candidate.baseNotes.length, take.length, "take ikut dikembalikan untuk satu langkah undo");
    }
  }
  assert.ok(methods.size >= 3, `metode yang terpakai: ${[...methods].join(", ")}`);
});

test("label metode lanjutan tersedia di id dan en", () => {
  const messages = readFileSync(new URL("../src/i18n/messages.js", import.meta.url), "utf8");
  for (const [key, id, en] of [
    ["ideasMethodSequence", "Sekuens", "Sequence"],
    ["ideasMethodAnswer", "Jawab", "Answer"],
    ["ideasMethodEcho", "Gema", "Echo"],
    ["ideasMethodSmooth", "Mulus", "Smooth"],
    ["ideasMethodLeaping", "Melompat", "Leaping"]
  ]) {
    assert.match(messages, new RegExp(`${key}: "${id}"`), `${key} harus ada dalam bahasa Indonesia`);
    assert.match(messages, new RegExp(`${key}: "${en}"`), `${key} harus ada dalam bahasa Inggris`);
  }
  assert.match(messages, /ideasNoCandidates: "Variasi butuh minimal 3 nada; coba Lanjutkan\."/);
  assert.match(messages, /ideasNoCandidates: "Variations need at least 3 notes; try Continue\."/);
});