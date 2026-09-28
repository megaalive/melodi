import test from "node:test";
import assert from "node:assert/strict";
import { createSong, PPQ } from "../src/core/model.js";
import { expressionSummary, projectSongToAbc } from "../src/notation/abc.js";

function song(notes, extras = {}) {
  return createSong({
    id: "song",
    title: "Fixture",
    timing: { ppq: PPQ, tempo: 96, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [],
    phrases: [],
    notes,
    lyrics: { rawText: "", syllables: [] },
    chords: [],
    ...extras
  });
}

function note(id, pitch, startTick, durationTicks, extra = {}) {
  return { id, pitch, startTick, durationTicks, source: "user", anchor: false, locked: false, ...extra };
}

test("ABC projection keeps canonical note identity in classes and exact common durations", () => {
  const fixture = song([
    note("a", 60, 0, 240),
    note("b", 62, 240, 480),
    note("c", 64, 720, 720)
  ]);
  const result = projectSongToAbc(fixture);

  assert.match(result.abc, /M:4\/4/);
  assert.match(result.abc, /L:1\/8/);
  assert.match(result.abc, /!class=melodi-note-0!C/);
  assert.match(result.abc, /!class=melodi-note-1!D2/);
  assert.match(result.abc, /!class=melodi-note-2!E3/);
  assert.equal(result.noteIdByClass.get(result.noteClassById.get("b")), "b");
});

test("ABC projection preserves bar-crossing ties and emits chord symbols", () => {
  const fixture = song(
    [note("long", 67, 1680, 480)],
    { chords: [{ id: "chord", rootPitchClass: 0, quality: "major", startTick: 0, durationTicks: 1920 }] }
  );
  const result = projectSongToAbc(fixture);

  assert.match(result.abc, /"C"z/);
  assert.match(result.abc, /!class=melodi-note-0!G-\s+\|/);
  assert.match(result.abc, /!class=melodi-note-0!G/);
});

test("ABC projection creates bounded extra voices for overlapping melody notes", () => {
  const fixture = song([
    note("low", 60, 0, 960),
    note("high", 67, 0, 480)
  ]);
  const result = projectSongToAbc(fixture);

  assert.match(result.abc, /%%score \(1 2\)/);
  assert.match(result.abc, /\[V:1\]/);
  assert.match(result.abc, /\[V:2\]/);
});

test("expression summary stays empty at defaults and describes intentional pan and volume", () => {
  assert.equal(expressionSummary(note("plain", 60, 0, 480)), "");
  assert.equal(expressionSummary(note("expr", 60, 0, 480, { volume: 0.72, pan: -0.35 })), "V 72% · L 35");
});
