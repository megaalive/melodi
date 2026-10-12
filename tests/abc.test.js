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

test("expression summary stays empty at defaults and describes mix plus vibrato", () => {
  assert.equal(expressionSummary(note("plain", 60, 0, 480)), "");
  assert.equal(expressionSummary(note("expr", 60, 0, 480, {
    volume: 0.72,
    pan: -0.35,
    vibrato: { rateHz: 5.8, depthSemitones: 0.3, delayPosition: 0.2 }
  })), "V 72% · L 35 · Vib 5.8Hz ±0.3");
});

test("4/4 notation beams eighth notes by quarter-note beats, not across beats", () => {
  const fixture = song(Array.from({ length: 8 }, (_, index) =>
    note("beat-" + index, [60, 62, 64, 65, 67, 69, 71, 72][index], index * 240, 240)
  ));
  const result = projectSongToAbc(fixture);
  const music = result.abc.split("\n").find(line => line.startsWith("[V:1] "))
    .replace(/!class=melodi-note-\d+!/g, "").replace("[V:1] ", "");
  assert.equal(music, "CD EF GA Bc |");
  assert.equal(result.noteIdByClass.size, 8);
});

test("6/8 notation beams three eighth notes per dotted-quarter pulse", () => {
  const fixture = song(Array.from({ length: 6 }, (_, index) =>
    note("six-" + index, [60, 62, 64, 65, 67, 69][index], index * 240, 240)
  ), { timing: { ppq: PPQ, tempo: 96, timeSignature: { numerator: 6, denominator: 8 } } });
  const music = projectSongToAbc(fixture).abc.split("\n").find(line => line.startsWith("[V:1] "))
    .replace(/!class=melodi-note-\d+!/g, "").replace("[V:1] ", "");
  assert.equal(music, "CDE FGA |");
});

test("rests, long notes, and split ties never join an invalid beam", () => {
  const fixture = song([
    note("a", 60, 0, 240),
    note("b", 62, 480, 240),
    note("c", 64, 720, 240),
    note("d", 67, 1680, 480)
  ]);
  const result = projectSongToAbc(fixture);
  const music = result.abc.split("\n").find(line => line.startsWith("[V:1] "))
    .replace(/!class=melodi-note-\d+!/g, "").replace("[V:1] ", "");
  assert.match(music, /C z DE/);
  assert.match(music, /G- \| G/);
  assert.equal(result.noteIdByClass.size, 4);
});

test("irregular 5/8 groups 2+3 without changing event ticks", () => {
  const fixture = song(Array.from({ length: 5 }, (_, index) =>
    note("odd-" + index, [60, 62, 64, 65, 67][index], index * 240, 240)
  ), { timing: { ppq: PPQ, tempo: 96, timeSignature: { numerator: 5, denominator: 8 } } });
  const before = structuredClone(fixture);
  const music = projectSongToAbc(fixture).abc.split("\n").find(line => line.startsWith("[V:1] "))
    .replace(/!class=melodi-note-\d+!/g, "").replace("[V:1] ", "");
  assert.equal(music, "CD EFG |");
  assert.deepEqual(fixture, before);
});

test("a chord symbol on the second eighth keeps its onset and beam", () => {
  const fixture = song([
    note("a", 60, 0, 240),
    note("b", 62, 240, 240)
  ], { chords: [{ id: "c1", rootPitchClass: 9, quality: "minor", startTick: 240, durationTicks: 240 }] });
  const music = projectSongToAbc(fixture).abc.split("\n").find(line => line.startsWith("[V:1] "))
    .replace(/!class=melodi-note-\d+!/g, "").replace("[V:1] ", "");
  assert.match(music, /C"Am"D/);
});
