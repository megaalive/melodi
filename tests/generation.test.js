import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createSong } from "../src/core/model.js";
import { generateGap } from "../src/generation/generator.js";
import {
  approachNote,
  directMove,
  isScalePitch,
  leapNote,
  leapResolution,
  neighborNote,
  repetition,
  scalePassingNote,
  scalePassingNotes,
  sequence
} from "../src/generation/primitives.js";

function fixture() {
  let next = 0;
  const song = createInitialSong(() => `entity-${++next}`);
  const left = { id: "anchor-left", pitch: 60, startTick: 0, durationTicks: 480, source: "user", anchor: true, locked: false };
  const right = { id: "anchor-right", pitch: 67, startTick: 1440, durationTicks: 480, source: "user", anchor: true, locked: false };
  return createSong({
    ...song,
    sections: [{ ...song.sections[0], phraseIds: ["phrase-main"] }],
    notes: [left, right],
    phrases: [{ id: "phrase-main", noteIds: [left.id, right.id] }]
  });
}

function request(overrides = {}) {
  return {
    startTick: 480,
    endTick: 1440,
    leftAnchorNoteId: "anchor-left",
    rightAnchorNoteId: "anchor-right",
    seed: 1947,
    ...overrides
  };
}

function expectGenerationCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

test("gap generation is deterministic for the same context and seed", () => {
  const song = fixture();
  const before = structuredClone(song);
  const first = generateGap(song, request());
  const second = generateGap(song, request());
  assert.deepEqual(first, second);
  assert.deepEqual(song, before);
  assert.equal(first.candidates.length, 6);
});

test("different seeds change candidate pitches or rhythms while retaining the gap", () => {
  const song = fixture();
  const first = generateGap(song, request({ seed: 1947 }));
  const second = generateGap(song, request({ seed: 1948 }));
  assert.notDeepEqual(first.candidates.map((candidate) => candidate.notes.map(({ pitch, startTick, durationTicks }) => [pitch, startTick, durationTicks])),
    second.candidates.map((candidate) => candidate.notes.map(({ pitch, startTick, durationTicks }) => [pitch, startTick, durationTicks])));
  for (const candidate of second.candidates) {
    assert.equal(candidate.notes[0].startTick, 480);
    assert.equal(candidate.notes.at(-1).startTick + candidate.notes.at(-1).durationTicks, 1440);
  }
});

test("all generated notes exactly fill the half-open gap on the allowed grid and in voice range", () => {
  const output = generateGap(fixture(), request({ voiceRange: { minPitch: 60, maxPitch: 72 } }));
  for (const candidate of output.candidates) {
    let cursor = 480;
    for (const note of candidate.notes) {
      assert.ok(Number.isSafeInteger(note.pitch));
      assert.ok(note.pitch >= 60 && note.pitch <= 72);
      assert.ok([120, 240, 480, 960].includes(note.durationTicks));
      assert.equal(note.startTick, cursor);
      assert.ok(note.startTick + note.durationTicks <= 1440);
      cursor += note.durationTicks;
    }
    assert.equal(cursor, 1440);
  }
});

test("gap validation rejects empty, inverted, occupied, stale-anchor, and cross-phrase gaps", () => {
  const song = fixture();
  expectGenerationCode(() => generateGap(song, request({ endTick: 480 })), "generation-empty-gap");
  expectGenerationCode(() => generateGap(song, request({ startTick: 1440, endTick: 480 })), "generation-empty-gap");
  expectGenerationCode(() => generateGap(createSong({
    ...song,
    notes: [...song.notes, { id: "locked-gap-note", pitch: 64, startTick: 720, durationTicks: 120, source: "user", anchor: false, locked: true }],
    phrases: [{ ...song.phrases[0], noteIds: [...song.phrases[0].noteIds, "locked-gap-note"] }]
  }), request()), "generation-protected-note");
  expectGenerationCode(() => generateGap(song, request({ leftAnchorNoteId: "missing" })), "generation-anchor-not-found");
  expectGenerationCode(() => generateGap(createSong({
    ...song,
    sections: [{ ...song.sections[0], phraseIds: ["phrase-left", "phrase-right"] }],
    phrases: [
      { id: "phrase-left", noteIds: ["anchor-left"] },
      { id: "phrase-right", noteIds: ["anchor-right"] }
    ]
  }), request()), "generation-cross-phrase");
});

test("passing note is a scale tone between its structural pitches", () => {
  const context = { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } };
  const passing = scalePassingNote(60, 64, context);
  assert.equal(passing, 62);
  assert.equal(isScalePitch(passing, "C", { intervals: [0, 2, 4, 5, 7, 9, 11] }), true);
  const path = [60, ...scalePassingNotes(60, 67, context), 67];
  assert.deepEqual(path, [60, 62, 64, 65, 67]);
});

test("neighbor move departs by one scale tone and returns", () => {
  const neighbor = neighborNote(60, { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } }, 1);
  assert.deepEqual(neighbor.pitches, [62, 60]);
});

test("approach note resolves by scale step to target", () => {
  const context = { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } };
  const approach = approachNote(67, 60, context);
  assert.equal(approach, 65);
  assert.equal(directMove(approach, 67, context).at(-1), 67);
});

test("leap is bounded and leap resolution steps in the opposite direction", () => {
  const context = { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } };
  const leap = leapNote(60, 1, context, 4, 48, 84);
  const resolved = leapResolution(60, 1, context, 4, 48, 84);
  assert.ok(leap > 60 && leap <= 84);
  assert.ok(resolved.leapPitch > 60);
  assert.ok(resolved.resolutionPitch < resolved.leapPitch);
  assert.equal(isScalePitch(resolved.leapPitch, "C", context.scale), true);
  assert.equal(isScalePitch(resolved.resolutionPitch, "C", context.scale), true);
});

test("repetition and sequence remain bounded melodic operations", () => {
  assert.deepEqual(repetition(64, 3), [64, 64, 64]);
  const result = sequence(60, [1, -1], 4, { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } }, 48, 84);
  assert.equal(result.length, 4);
  assert.ok(result.every((pitch) => pitch >= 48 && pitch <= 84 && isScalePitch(pitch, "C", { intervals: [0, 2, 4, 5, 7, 9, 11] })));
});

test("generation rejects invalid range, seed, and a range with no scale tone", () => {
  const song = fixture();
  expectGenerationCode(() => generateGap(song, request({ seed: -1 })), "generation-invalid-seed");
  expectGenerationCode(() => generateGap(song, request({ voiceRange: { minPitch: 61, maxPitch: 61 } })), "generation-invalid-voice-range");
  const pentatonic = createSong({ ...song, scale: { name: "pentatonic", intervals: [0, 2, 4, 7, 9] } });
  expectGenerationCode(() => generateGap(pentatonic, request({ voiceRange: { minPitch: 65, maxPitch: 66 } })), "generation-range-has-no-scale-tones");
});
