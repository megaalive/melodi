import assert from "node:assert/strict";
import test from "node:test";
import { createBlankSong, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
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
  assert.equal(song.title, "Melodi awal");
  assert.ok(song.notes.some((note) => note.pitchBend));
  assert.ok(song.notes.some((note) => note.vibrato));
  assert.equal(song.chords.length, 0);
  assert.equal(song.tracks.length, 0);
  assert.equal(listExamples()[0].id, "starter-melody");
});

test("catalog contains starter, Punk and user-supplied chorus with no Jazz alias", () => {
  assert.deepEqual(listExamples().map(({ id }) => id), ["starter-melody", "punk-drums-fast-drive", "day-by-day-chorus"]);
  assert.equal(listExamples()[1].titleKey, "examplePunkDrumsTitle");
  assert.throws(() => createExample("jazz-drums-medium-swing"), { code: "example-not-found" });
});

test("Punk Drums is a straight 184 BPM drums-only eight-bar arrangement", () => {
  const song = createExample("punk-drums-fast-drive");
  assert.equal(song.title, "Punk Drums — Fast Drive");
  assert.equal(song.timing.tempo, 184);
  assert.equal(song.timing.ppq, 480);
  assert.deepEqual(song.timing.timeSignature, { numerator: 4, denominator: 4 });
  assert.deepEqual(song.notes, []);
  assert.deepEqual(song.chords, []);
  assert.deepEqual(song.lyrics, { rawText: "", syllables: [] });
  assert.equal(song.tracks.length, 1);
  const track = song.tracks[0];
  assert.equal(track.kind, "percussion");
  assert.equal(track.kitId, "gm-standard");
  const byPiece = (pieceId) => track.events.filter((hit) => hit.pieceId === pieceId);
  for (const piece of ["closed-hi-hat", "open-hi-hat", "kick", "snare", "low-tom", "mid-tom", "high-tom", "crash"]) {
    assert.ok(byPiece(piece).length > 0, `${piece} is present`);
  }
  assert.equal(byPiece("ride").length, 0);
  const hats = track.events.filter((hit) => hit.pieceId.endsWith("hi-hat"));
  for (const bar of [0, 1, 2, 4, 5, 6]) {
    assert.deepEqual(hats.filter((hit) => Math.floor(hit.startTick / 1920) === bar)
      .map((hit) => hit.startTick % 1920), [0, 240, 480, 720, 960, 1200, 1440, 1680]);
  }
  assert.ok(hats.every((hit) => hit.startTick % 240 === 0));
  assert.ok(track.events.every((hit) => hit.startTick % 120 === 0), "no inherited triplet swing subdivision");
  assert.ok(hats.every((hit) => hit.velocity >= 72 && hit.velocity <= 88));
  for (let bar = 0; bar < 8; bar += 1) {
    for (const beat of [1, 3]) {
      assert.ok(byPiece("snare").some((hit) => hit.startTick === bar * 1920 + beat * 480));
    }
    for (const offset of (bar === 7 ? [0, 240] : [0, 240, 960, 1200])) {
      assert.ok(byPiece("kick").some((hit) => hit.startTick === bar * 1920 + offset));
    }
  }
  assert.ok(byPiece("kick").every((hit) => hit.articulation === "normal" && hit.velocity >= 92 && hit.velocity <= 108));
  assert.ok(byPiece("snare").every((hit) => hit.velocity >= 104 && hit.velocity <= 116));
  assert.deepEqual(byPiece("crash").map((hit) => hit.startTick), [4 * 1920, 7 * 1920 + 3 * 480]);
  for (const start of [3 * 1920 + 1440, 7 * 1920 + 960]) {
    assert.deepEqual(track.events.filter((hit) => hit.startTick >= start && hit.startTick < start + 480 && hit.pieceId.endsWith("tom"))
      .map((hit) => [hit.pieceId, hit.startTick - start]), [["low-tom", 0], ["mid-tom", 120], ["high-tom", 240]]);
  }
  assert.ok(track.events.filter((hit) => hit.pieceId.endsWith("tom") || hit.pieceId === "crash")
    .every((hit) => hit.velocity >= 96 && hit.velocity <= 116));
  assert.equal(byPiece("crash").at(-1).durationTicks, 480);
  assert.equal(Math.max(...track.events.map((hit) => hit.startTick + (hit.durationTicks ?? 1))), 15360);
  assert.equal(song.mix, undefined, "example carries no custom volume preset");
  assert.ok(Object.values(createCommands(song).getMixState().channels).every((channel) => channel.volume === 1));
});

test("Punk Drums automatic full-song playback range ends at exactly eight bars", () => {
  assert.deepEqual(createCommands(createExample("punk-drums-fast-drive")).getState().playback.loop, {
    enabled: true, startTick: 0, endTick: 15360
  });
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
