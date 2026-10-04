import test from "node:test";
import assert from "node:assert/strict";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { notesHash } from "../src/generation/ideas.js";
import { isScalePitch } from "../src/generation/primitives.js";
import {
  QUALITY_TAKES,
  QUALITY_THRESHOLDS,
  formatReport,
  measureCandidate,
  percent,
  runMetrics,
  thresholdFailures
} from "../tools/idea-quality.mjs";

// C1: skrip metrik harus bisa diulang, deterministik, dan mengukur hal yang
// benar. Ambang mutu C2d ditegakkan di commit kedua, setelah generator
// lanjutan berbasis motif masuk.
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

test("laporan metrik memakai empat take contoh, dua panjang birama, dan seed tetap", () => {
  const report = runMetrics(SMALL);
  assert.deepEqual(Object.keys(QUALITY_TAKES), [
    "legato 4 seperempat",
    "legato 8 stepwise",
    "empat nada dengan jeda",
    "ritme campur"
  ]);
  assert.equal(report.seeds, SMALL.seeds);
  assert.deepEqual(report.bars, SMALL.bars);
  assert.ok(report.candidates > 0, "setiap pengembangan harus punya kandidat");
  for (const [label, value] of Object.entries(report.distinctPerBarByLength)) {
    assert.equal(typeof value, "number", label);
  }
  const table = formatReport(report);
  assert.match(table, /transisi nada-sama/);
  assert.match(table, /p95 ideaDevelop/);
  assert.match(table, /nada berbeda per baris 2 birama/);
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
  assert.equal(leaping.leapRatio, 1 / 3, "satu dari tiga interval >= kuint");
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

test("ambang mutu C2d belum ditegakkan pada baseline ini", () => {
  // Baseline .90 masih memakai generateGap profil balanced apa adanya, jadi
  // ambang C2d sengaja gagal di sini dan ditutup pada commit generator.
  const failures = thresholdFailures(runMetrics(SMALL));
  assert.ok(failures.length > 0, "baseline harus gagal ambang, kalau tidak tidak ada yang dibenahi");
  assert.ok(failures.some(failure => failure.includes("transisi nada-sama")));
  assert.ok(QUALITY_THRESHOLDS.maxSameRatio === 0.25);
  assert.equal(percent(QUALITY_THRESHOLDS.maxSameRatio), "25.0%");
});