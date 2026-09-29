import assert from "node:assert/strict";
import test from "node:test";
import { createBlankSong, createSong } from "../src/core/model.js";
import { createExample, listExamples } from "../src/examples/catalog.js";

test("blank song validates with no hidden musical events", () => {
  const song = createSong(createBlankSong(() => "blank-song"));
  assert.deepEqual(song.notes, []);
  assert.deepEqual(song.chords, []);
  assert.deepEqual(song.tracks, []);
  assert.deepEqual(song.lyrics, { rawText: "", syllables: [] });
  assert.equal(song.timing.tempo, 120);
  assert.deepEqual(song.timing.timeSignature, { numerator: 4, denominator: 4 });
  assert.equal(song.key, "C");
  assert.equal(song.title, "Untitled");
});

test("starter melody example preserves the existing 81 BPM Am 6/8 arrangement", () => {
  const song = createExample("starter-melody", (() => { let id = 0; return () => `starter-example-${++id}`; })());
  assert.equal(song.timing.tempo, 81);
  assert.deepEqual(song.timing.timeSignature, { numerator: 6, denominator: 8 });
  assert.equal(song.key, "Am");
  assert.equal(song.notes.length, 21);
  assert.ok(song.notes.some((note) => note.pitchBend));
  assert.ok(song.notes.some((note) => note.vibrato));
  assert.equal(song.chords.length, 0);
  assert.equal(song.tracks.length, 0);
  assert.equal(listExamples()[0].id, "starter-melody");
});

test("Jazz Drums example is drums-only, swung, fills two phrases, and ends in a crash", () => {
  const song = createExample("jazz-drums-medium-swing", (() => { let id = 0; return () => `jazz-example-${++id}`; })());
  assert.equal(song.timing.tempo, 132);
  assert.deepEqual(song.timing.timeSignature, { numerator: 4, denominator: 4 });
  assert.equal(song.notes.length, 0);
  assert.equal(song.chords.length, 0);
  assert.deepEqual(song.lyrics, { rawText: "", syllables: [] });
  assert.equal(song.tracks.length, 1);
  const track = song.tracks[0];
  assert.equal(track.kitId, "gm-standard");
  const byPiece = (pieceId) => track.events.filter((hit) => hit.pieceId === pieceId);
  for (const piece of ["ride", "closed-hi-hat", "kick", "snare", "low-tom", "mid-tom", "high-tom", "crash"]) {
    assert.ok(byPiece(piece).length > 0, `${piece} is present`);
  }
  assert.ok(byPiece("ride").some((hit) => hit.startTick % 480 === 320), "Ride uses a triplet swing subdivision");
  assert.ok(byPiece("snare").some((hit) => hit.articulation === "ghost"));
  assert.ok(byPiece("kick").every((hit) => hit.velocity <= 54), "kick stays feathered");
  assert.equal(byPiece("crash").at(-1).startTick, 7 * 1920 + 3 * 480);
  const endTick = Math.max(...track.events.map((hit) => hit.startTick + (hit.durationTicks ?? 1)));
  assert.ok(endTick <= 8 * 1920);
  assert.ok(endTick > 7 * 1920);
});

test("every example factory returns independent Song and entity IDs", () => {
  for (const { id } of listExamples()) {
    const first = createExample(id);
    const second = createExample(id);
    const allIds = (song) => [song.id, ...song.notes.map((note) => note.id), ...song.phrases.map((phrase) => phrase.id),
      ...song.sections.map((section) => section.id), ...song.lyrics.syllables.map((syllable) => syllable.id),
      ...song.tracks.flatMap((track) => [track.id, ...track.events.map((hit) => hit.id)])];
    assert.notEqual(first, second);
    assert.notEqual(first.id, second.id);
    assert.equal(new Set([...allIds(first), ...allIds(second)]).size, allIds(first).length + allIds(second).length);
  }
});
