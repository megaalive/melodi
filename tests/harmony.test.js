import test from "node:test";
import assert from "node:assert/strict";
import { deriveDiatonicTriads, suggestHarmony } from "../src/harmony/harmony.js";
import { createExample } from "../src/examples/catalog.js";

function song(notes = [{ pitch: 60, startTick: 0, durationTicks: 1920 }]) {
  return { key: "C", scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] }, timing: { ppq: 480, timeSignature: { numerator: 4, denominator: 4 } }, notes, tracks: [] };
}

test("C major derives all seven diatonic triads with bounded functions", () => {
  const triads = deriveDiatonicTriads(song());
  assert.deepEqual(triads.map(chord => [chord.rootPitchClass, chord.quality, chord.romanNumeral, chord.function]), [
    [0, "major", "I", "tonic"], [2, "minor", "ii", "predominant"], [4, "minor", "iii", "tonic"],
    [5, "major", "IV", "predominant"], [7, "major", "V", "dominant"], [9, "minor", "vi", "tonic"], [11, "diminished", "vii°", "dominant"]
  ]);
});

test("minor and transposed flat keys derive triads without C-major assumptions", () => {
  const minor = { ...song(), key: "Am", scale: { name: "minor", intervals: [0, 2, 3, 5, 7, 8, 10] } };
  assert.deepEqual(deriveDiatonicTriads(minor).map(chord => [chord.rootPitchClass, chord.quality]), [[9, "minor"], [11, "diminished"], [0, "major"], [2, "minor"], [4, "minor"], [5, "major"], [7, "major"]]);
  assert.equal(deriveDiatonicTriads({ ...song(), key: "Bb" })[0].rootPitchClass, 10);
  assert.deepEqual(suggestHarmony(minor, { startTick: 0, endTick: 1920 }), suggestHarmony(minor, { startTick: 0, endTick: 1920 }));
});

test("candidates are deterministic, detached, bounded and offer multiple alternatives", () => {
  const fixture = song([{ pitch: 60, startTick: 0, durationTicks: 480 }, { pitch: 64, startTick: 480, durationTicks: 480 }, { pitch: 67, startTick: 960, durationTicks: 960 }]);
  const before = JSON.stringify(fixture);
  const candidates = suggestHarmony(fixture, { startTick: 0, endTick: 1920 });
  assert.equal(candidates.length, 4);
  assert.equal(new Set(candidates.map(candidate => candidate.id)).size, 4);
  assert.equal(candidates[0].rootPitchClass, 0);
  assert.equal(candidates[0].metadata.matchedChordToneCount, 3);
  assert.equal(candidates[0].metadata.weightedCoverage, 1);
  assert.deepEqual(candidates, suggestHarmony(fixture, { startTick: 0, endTick: 1920 }));
  candidates[0].metadata.chordTonePitchClasses[0] = 11;
  assert.equal(suggestHarmony(fixture, { startTick: 0, endTick: 1920 })[0].metadata.chordTonePitchClasses[0], 0);
  assert.equal(JSON.stringify(fixture), before);
});

test("held chord tones outweigh a brief passing tone and expose factual coverage", () => {
  const fixture = song([{ pitch: 60, startTick: 0, durationTicks: 1800 }, { pitch: 62, startTick: 1800, durationTicks: 120 }]);
  const candidates = suggestHarmony(fixture, { startTick: 0, endTick: 1920 });
  assert.equal(candidates[0].rootPitchClass, 0);
  assert.equal(candidates[0].metadata.matchedDurationTicks, 1800);
  assert.equal(candidates[0].metadata.nonChordDurationTicks, 120);
  assert.ok(candidates[0].metadata.weightedCoverage > 0.96);
});

test("strong metric positions influence fit more than weak positions", () => {
  const strong = song([{ pitch: 60, startTick: 0, durationTicks: 240 }, { pitch: 62, startTick: 240, durationTicks: 240 }]);
  const weak = song([{ pitch: 62, startTick: 0, durationTicks: 240 }, { pitch: 60, startTick: 240, durationTicks: 240 }]);
  const cScore = fixture => suggestHarmony(fixture, { startTick: 0, endTick: 480 }).find(candidate => candidate.rootPitchClass === 0)?.score;
  assert.ok(cScore(strong) > cScore(weak));
});

test("equal evidence uses stable degree ordering", () => {
  const candidates = suggestHarmony(song(), { startTick: 0, endTick: 1920 });
  assert.deepEqual(candidates.slice(0, 3).map(candidate => candidate.scaleDegree), [1, 4, 6]);
  assert.equal(candidates[0].score, candidates[1].score);
});

test("half-open overlap clips held notes and excludes adjacent onsets", () => {
  const fixture = song([{ pitch: 60, startTick: 0, durationTicks: 960 }, { pitch: 62, startTick: 960, durationTicks: 480 }]);
  const result = suggestHarmony(fixture, { startTick: 480, endTick: 960 });
  assert.equal(result[0].metadata.matchedDurationTicks, 480);
  assert.equal(result[0].metadata.nonChordDurationTicks, 0);
  assert.equal(result[0].durationTicks, 480);
});

test("range rejects fractional, empty, negative and beyond-timeline requests", () => {
  for (const range of [null, [], "0..480", false, {}, { startTick: -1, endTick: 480 }, { startTick: 0.5, endTick: 480 }, { startTick: 0, endTick: 0 }, { startTick: 480, endTick: 0 }, { startTick: 0, endTick: 1921 }, { startTick: 0, endTick: Infinity }]) {
    assert.throws(() => suggestHarmony(song(), range), { code: "harmony-invalid-range" });
  }
  const gap = song([{ pitch: 60, startTick: 480, durationTicks: 480 }]);
  assert.throws(() => suggestHarmony(gap, { startTick: 0, endTick: 480 }), { code: "harmony-empty-range" });
});

test("repeated supplied chorus bars retain equivalent chord identities and scores", () => {
  let nextId = 0;
  const fixture = createExample("day-by-day-chorus", () => `harmony-fixture-${++nextId}`);
  const musicalResult = (startTick, endTick) => suggestHarmony(fixture, { startTick, endTick }).map(({ id, startTick: ignoredStart, ...candidate }) => candidate);
  assert.deepEqual(musicalResult(0, 1920), musicalResult(7680, 9600));
  assert.deepEqual(musicalResult(1920, 3840), musicalResult(9600, 11520));
  assert.equal(musicalResult(0, 1920).length, 4);
  assert.ok(musicalResult(0, 1920).every(candidate => Number.isFinite(candidate.score)));
});

test("unusual scales use neutral functions and unsupported shapes fail explicitly", () => {
  const dorian = { ...song(), scale: { name: "dorian", intervals: [0, 2, 3, 5, 7, 9, 10] } };
  assert.ok(deriveDiatonicTriads(dorian).every(candidate => candidate.function === "other"));
  assert.throws(() => deriveDiatonicTriads({ ...song(), scale: { name: "pentatonic", intervals: [0, 2, 4, 7, 9] } }), { code: "harmony-unsupported-scale" });
});


test("score metadata permits factual reconstruction without hidden scoring state", () => {
  const candidates = suggestHarmony(song([{ pitch: 60, startTick: 0, durationTicks: 960 }, { pitch: 62, startTick: 960, durationTicks: 960 }]), { startTick: 0, endTick: 1920 });
  for (const candidate of candidates) {
    const data = candidate.metadata;
    assert.equal(data.weightedCoverage, data.matchedWeight / data.totalWeight);
    assert.equal(candidate.score, Number((100 * data.weightedCoverage - 20 * data.penaltyWeight / data.totalWeight + 2 * data.matchedChordToneCount).toFixed(6)));
  }
});
