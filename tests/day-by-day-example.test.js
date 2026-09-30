import assert from "node:assert/strict";
import test from "node:test";
import { createExample } from "../src/examples/catalog.js";
import { createCommands } from "../src/core/commands.js";
import { projectSongToScore } from "../src/notation/project.js";
import { projectSongToAbc } from "../src/notation/abc.js";
import { serializeProject, deserializeProject, SCHEMA_VERSION } from "../src/core/serialization.js";
import { toPortableProject, fromPortableProject, SHARE_VERSION } from "../src/io/share.js";

test("user-supplied chorus maps exactly to sixteen unembellished half notes", () => {
  const song = createExample("day-by-day-chorus");
  assert.equal(song.title, "Day by Day — Chorus");
  assert.equal(song.timing.tempo, 118);
  assert.deepEqual(song.timing.timeSignature, { numerator: 4, denominator: 4 });
  assert.equal(song.key, "F#m");
  assert.deepEqual(song.scale.intervals, [0, 2, 3, 5, 7, 8, 10]);
  assert.equal(song.notes.length, 16);
  assert.deepEqual(song.notes.map(n => n.pitch), [78,71,74,76,78,78,78,78,78,71,74,76,78,78,78,78]);
  assert.deepEqual(song.notes.map(n => n.startTick), [0,960,1920,2880,3840,4800,5760,6720,7680,8640,9600,10560,11520,12480,13440,14400]);
  for (const note of song.notes) {
    assert.equal(note.durationTicks, 960);
    assert.equal(note.source, "user");
    assert.deepEqual(Object.keys(note).sort(), ["anchor","durationTicks","id","locked","pitch","source","startTick"]);
  }
  assert.equal(Math.max(...song.notes.map(n => n.startTick + n.durationTicks)), 15360);
  assert.deepEqual(song.chords, []); assert.deepEqual(song.tracks, []);
  assert.deepEqual(song.lyrics, { rawText: "", syllables: [] });
  assert.equal(song.mix, undefined);
  assert.equal(song.phrases.length, 1);
  assert.deepEqual(song.phrases[0].noteIds, song.notes.map(n => n.id));
  assert.equal(song.sections.length, 1); assert.equal(song.sections[0].name, "Chorus");
  assert.deepEqual(song.sections[0].phraseIds, [song.phrases[0].id]);
});

test("chorus Score projects sixteen notes across eight measures with F-sharp spelling", () => {
  const song = createExample("day-by-day-chorus");
  const score = projectSongToScore(song);
  assert.equal(score.measures.length, 8);
  const segments = score.measures.flatMap(m => m.segments);
  assert.equal(segments.length, 16);
  assert.deepEqual(segments.map(n => n.noteId), song.notes.map(n => n.id));
  assert.deepEqual(segments.map(n => n.spelling.step), ["F","B","D","E","F","F","F","F","F","B","D","E","F","F","F","F"]);
  assert.ok(segments.filter(n => n.spelling.step === "F").every(n => n.spelling.accidental === "#"));
  const abc = projectSongToAbc(song).abc;
  assert.ok(abc.includes("K:F#m"));
  assert.equal((abc.match(/\^f4/g) ?? []).length, 10);
});

test("chorus retains old project/share formats and roundtrips through canonical infrastructure", () => {
  const song = createExample("day-by-day-chorus");
  assert.equal(SCHEMA_VERSION, 3); assert.equal(SHARE_VERSION, 5);
  assert.deepEqual(deserializeProject(serializeProject(song)), song);
  const receiver = fromPortableProject(toPortableProject(song));
  assert.deepEqual(receiver.notes.map(({ pitch, startTick, durationTicks }) => [pitch,startTick,durationTicks]), song.notes.map(({ pitch, startTick, durationTicks }) => [pitch,startTick,durationTicks]));
  assert.notEqual(receiver.id, song.id);
});

test("chorus automatic no-loop playback ends naturally at tick 15360", async () => {
  let callbacks; let completed = false;
  const commands = createCommands(createExample("day-by-day-chorus"), {
    audioPlayerFactory(options) {
      callbacks = options;
      return { async play() { return true; }, getPosition() { return 15360; }, stop() {} };
    },
    onPlaybackEvent(event) { if (event === "ended") completed = true; }
  });
  assert.equal(commands.getState().playback.loop.endTick, 15360);
  commands.setLoopEnabled(false); await commands.play();
  callbacks.onPosition(15360); callbacks.onComplete();
  assert.equal(completed, true);
  assert.equal(commands.getState().playback.status, "stopped");
  assert.equal(commands.getState().playback.loop.enabled, false);
});
