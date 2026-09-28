import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createSong, PPQ } from "../src/core/model.js";
import { projectSongToScore, spellPitchNameInKey } from "../src/notation/project.js";

function makeSong({ timeSignature = { numerator: 4, denominator: 4 }, key = "C", notes, chords } = {}) {
  const base = createInitialSong((() => { let id = 0; return () => `fixture-${++id}`; })());
  const selectedNotes = notes ?? base.notes;
  return createSong({
    ...base,
    timing: { ...base.timing, ppq: PPQ, timeSignature },
    key,
    notes: selectedNotes,
    chords: chords ?? (selectedNotes === base.notes ? base.chords : []),
    sections: selectedNotes === base.notes ? base.sections : [],
    phrases: selectedNotes === base.notes ? base.phrases : [],
    lyrics: selectedNotes === base.notes ? base.lyrics : { rawText: "", syllables: [] }
  });
}

test("score projection calculates 4/4 measure math and maps leading, inner, and trailing rests", () => {
  const song = makeSong({ notes: [
    { id: "rest-note-a", pitch: 60, startTick: 120, durationTicks: 240, source: "user", anchor: false, locked: false },
    { id: "rest-note-b", pitch: 64, startTick: 600, durationTicks: 480, source: "user", anchor: false, locked: false }
  ] });
  const projection = projectSongToScore(song);
  assert.equal(projection.ticksPerMeasure, 1920);
  assert.equal(projection.measures.length, 1);
  assert.deepEqual(projection.measures[0].segments.map((segment) => segment.noteId), ["rest-note-a", "rest-note-b"]);
  assert.deepEqual(projection.measures[0].rests.map((rest) => [rest.startTick, rest.durationTicks]), [
    [0, 120], [360, 240], [1080, 720], [1800, 120]
  ]);
});

test("default 6/8 phrase projects to four score measures", () => {
  const song = createInitialSong((() => { let id = 0; return () => `default-score-${++id}`; })());
  const projection = projectSongToScore(song);
  assert.equal(projection.ticksPerMeasure, 1440);
  assert.equal(projection.measures.length, 4);
  assert.equal(projection.totalMeasureCount, 4);
  assert.equal(projection.status, "ok");
});

test("score projection calculates 3/4 and 6/8 measure lengths from PPQ", () => {
  assert.equal(projectSongToScore(makeSong({ timeSignature: { numerator: 3, denominator: 4 }, notes: [] })).ticksPerMeasure, 1440);
  assert.equal(projectSongToScore(makeSong({ timeSignature: { numerator: 6, denominator: 8 }, notes: [] })).ticksPerMeasure, 1440);
});

test("bar-crossing notes keep one canonical ID and project tied segments", () => {
  const song = makeSong({ notes: [{ id: "long-note", pitch: 60, startTick: 1680, durationTicks: 480, source: "user", anchor: false, locked: false }] });
  const projection = projectSongToScore(song);
  const segments = projection.measures.flatMap((measure) => measure.segments);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments.map((segment) => [segment.startTick, segment.durationTicks]), [[1680, 240], [1920, 240]]);
  assert.deepEqual(segments.map((segment) => [segment.tieFromPrevious, segment.tieToNext]), [[false, true], [true, false]]);
  assert.deepEqual(segments.map((segment) => segment.noteId), ["long-note", "long-note"]);
});

test("overlapping notes use deterministic lanes and remain present with warning IDs", () => {
  const notes = [
    { id: "note-b", pitch: 64, startTick: 0, durationTicks: 960, source: "user", anchor: false, locked: false },
    { id: "note-a", pitch: 60, startTick: 0, durationTicks: 480, source: "user", anchor: false, locked: false }
  ];
  const projection = projectSongToScore(makeSong({ notes }));
  assert.equal(projection.measures[0].lanes.length, 2);
  assert.deepEqual(projection.measures[0].segments.map((segment) => segment.noteId), ["note-a", "note-b"]);
  assert.equal(projection.warnings[0].code, "overlapping-notes");
  assert.deepEqual(projection.warnings[0].noteIds, ["note-a", "note-b"]);
});

test("unrepresentable rhythm is explicit and does not quantize the model", () => {
  const song = makeSong({ notes: [{ id: "odd-note", pitch: 61, startTick: 30, durationTicks: 30, source: "user", anchor: false, locked: false }] });
  const before = structuredClone(song);
  const projection = projectSongToScore(song);
  assert.equal(projection.status, "unsupported-rhythm");
  assert.deepEqual(projection.unsupportedNoteIds, ["odd-note"]);
  assert.equal(projection.measures[0].segments[0].startTick, 30);
  assert.equal(projection.measures[0].segments[0].durationTicks, 30);
  assert.deepEqual(song, before);
});

test("unsupported note duration at the bar start is reported without changing its timing", () => {
  const song = makeSong({ notes: [
    { id: "odd-at-zero", pitch: 60, startTick: 0, durationTicks: 30, source: "user", anchor: false, locked: false },
    { id: "following-note", pitch: 64, startTick: 30, durationTicks: 480, source: "user", anchor: false, locked: false }
  ] });
  const projection = projectSongToScore(song);
  assert.equal(projection.status, "unsupported-rhythm");
  assert.deepEqual(projection.unsupportedNoteIds, ["odd-at-zero"]);
  assert.deepEqual(projection.fallbackNoteIds, ["following-note", "odd-at-zero"]);
});

test("overlap voice count and distant measure count are bounded with explicit fallback IDs", () => {
  const overlaps = Array.from({ length: 9 }, (_, index) => ({
    id: `voice-${index}`, pitch: 60 + index, startTick: 0, durationTicks: 120, source: "user", anchor: false, locked: false
  }));
  const voiceProjection = projectSongToScore(makeSong({ notes: overlaps }));
  assert.equal(voiceProjection.measures[0].lanes.length, voiceProjection.voiceLimit);
  assert.equal(voiceProjection.measures[0].segments.length, overlaps.length);
  assert.deepEqual(voiceProjection.fallbackNoteIds, ["voice-8"]);
  assert.equal(voiceProjection.warnings.some((warning) => warning.code === "voice-limit"), true);

  const farProjection = projectSongToScore(makeSong({ notes: [{
    id: "far-note", pitch: 60, startTick: Number.MAX_SAFE_INTEGER - 480, durationTicks: 480, source: "user", anchor: false, locked: false
  }] }));
  assert.equal(farProjection.measures.length, farProjection.measureLimit);
  assert.deepEqual(farProjection.fallbackNoteIds, ["far-note"]);
  assert.equal(farProjection.truncated, true);
});

test("pitch spelling follows flat-key preference and keeps MIDI unchanged", () => {
  const notes = [60, 61, 63, 65].map((pitch, index) => ({
    id: `spell-${index}`, pitch, startTick: index * 480, durationTicks: 480, source: "user", anchor: false, locked: false
  }));
  const flatProjection = projectSongToScore(makeSong({ key: "Bb", notes }));
  assert.deepEqual(flatProjection.measures[0].segments.map((segment) => segment.spelling.key), ["c/4", "db/4", "eb/4", "f/4"]);
  assert.deepEqual(flatProjection.measures[0].segments.map((segment) => segment.pitch), [60, 61, 63, 65]);
});

test("pitch and chord spelling follows C, G, and F key signatures", () => {
  assert.equal(spellPitchNameInKey(60, "C"), "C");
  assert.equal(spellPitchNameInKey(66, "G"), "F#");
  assert.equal(spellPitchNameInKey(70, "F"), "Bb");

  const chord = { id: "late-b-flat", rootPitchClass: 10, quality: "major", startTick: 1920, durationTicks: 480 };
  const song = makeSong({ key: "F", notes: [], chords: [chord] });
  const before = structuredClone(song);
  const projection = projectSongToScore(song);
  assert.equal(projection.totalMeasureCount, 2);
  assert.deepEqual(projection.measures[0].chords, []);
  assert.deepEqual(projection.measures[1].chords, [{
    chordId: chord.id,
    rootPitchClass: 10,
    rootName: "Bb",
    quality: "major",
    startTick: 1920,
    durationTicks: 480,
    measureIndex: 1
  }]);
  assert.deepEqual(song, before);
});

test("projection output is deterministic for the same canonical song", () => {
  const song = makeSong();
  assert.deepEqual(projectSongToScore(song), projectSongToScore(song));
});
