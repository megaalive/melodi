import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createBlankSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
const ids = () => { let n = 0; return () => `sketch-command-${++n}`; };

test("unsupported new chord qualities fail explicitly without history or canonical mutation", () => {
  const c = fixture();
  const chord = c.addChord({ rootPitchClass: 0, quality: "major", startTick: 0, durationTicks: 1440 });
  const before = c.getSong(), history = c.getState().history;
  for (const quality of ["maj7", "constructor", "toString", "__proto__"]) {
    assert.throws(() => c.addChord({ rootPitchClass: 0, quality, startTick: 1440, durationTicks: 1440 }), { code: "unsupported-chord-quality" });
    assert.throws(() => c.updateChord(chord.id, { quality }), { code: "unsupported-chord-quality" });
    assert.deepEqual(c.getSong(), before);
    assert.deepEqual(c.getState().history, history);
  }
});
function fixture(options = {}) { const idFactory = ids(); return createCommands(createInitialSong(idFactory), { idFactory, ...options }); }
test("sketch style choices and volumes are undoable with no-op and validation guards", () => {
  const c = fixture();
  c.setHarmonyStyle("arpeggio"); c.setBassStyle("root-fifth");
  c.setInstrumentVolume("harmony", 0.43); c.setInstrumentVolume("bass", 0.78);
  assert.deepEqual(c.getSong().sketch, { harmony: { style: "arpeggio", volume: 0.43 }, bass: { style: "root-fifth", volume: 0.78 } });
  assert.equal(c.getState().history.undoDepth, 4);
  c.setHarmonyStyle("arpeggio"); c.setBassStyle("root-fifth"); c.setInstrumentVolume("bass", 0.78);
  assert.equal(c.getState().history.undoDepth, 4);
  for (const style of [undefined, null, "walking", 1]) {
    assert.throws(() => c.setHarmonyStyle(style), { code: "invalid-sketch-style" });
    assert.throws(() => c.setBassStyle(style), { code: "invalid-sketch-style" });
  }
  for (const volume of [-1, 2, NaN, Infinity, "0.5"]) assert.throws(() => c.setInstrumentVolume("bass", volume), { code: "invalid-instrument-volume" });
  c.undo(); assert.equal(c.getSong().sketch.bass.volume, 1); c.redo(); assert.equal(c.getSong().sketch.bass.volume, 0.78);
  c.undo(); c.undo(); c.undo(); c.undo();
  assert.deepEqual(c.getSong().sketch, { harmony: { style: "block", volume: 1 }, bass: { style: "root", volume: 1 } });
});
test("sketch monitoring survives ordinary history but resets on load/new; canonical settings persist", () => {
  const c = fixture(); c.setInstrumentMute("harmony", true); c.setInstrumentSolo("bass", true);
  assert.equal(c.getState().history.undoDepth, 0);
  c.setHarmonyStyle("arpeggio"); c.setInstrumentVolume("bass", 0.3); c.undo(); c.redo();
  assert.equal(c.getMixState().channels.harmony.mute, true); assert.equal(c.getMixState().channels.bass.solo, true);
  const song = c.getSong(); c.loadSong(song);
  assert.deepEqual(c.getSong().sketch, song.sketch);
  assert.equal(c.getMixState().channels.harmony.mute, false); assert.equal(c.getMixState().channels.bass.solo, false);
  c.newSong(); assert.equal(c.getSong().sketch.harmony.style, "block"); assert.equal(c.getMixState().channels.bass.volume, 1);
});
test("snapshot exposes detached sketch settings and style commands", () => {
  const c = fixture(), state = c.getState();
  assert.ok(state.availableActions.includes("setHarmonyStyle")); assert.ok(state.availableActions.includes("setBassStyle"));
  state.song.sketch.harmony.style = "arpeggio";
  assert.equal(c.getSong().sketch.harmony.style, "block");
});
test("chords determine full-song range even when no melody or drums exist", () => {
  const idFactory = ids(), c = createCommands(createBlankSong(idFactory), { idFactory });
  const chord = c.addChord({ rootPitchClass: 0, quality: "major", startTick: 960, durationTicks: 1920 });
  assert.equal(c.getState().playback.loop.endTick, 2880);
  c.updateChord(chord.id, { durationTicks: 3840 }); assert.equal(c.getState().playback.loop.endTick, 4800);
  c.deleteChord(chord.id); assert.equal(c.getState().playback.loop.endTick, 1);
});
test("playing style, chord and mix edits re-anchor from current audio clock", async () => {
  let position = 0; const calls = [];
  const c = fixture({ audioPlayerFactory: () => ({
    async play() { return true; }, getPosition() { return position; }, cancelPreview() {},
    songChanged(tick, loop) { calls.push(["song", tick, loop.endTick]); },
    mixChanged(tick) { calls.push(["mix", tick]); }
  }) });
  await c.play(); position = 321; c.setHarmonyStyle("arpeggio");
  assert.deepEqual(calls.at(-1).slice(0, 2), ["song", 321]);
  position = 432; const chord = c.addChord({ rootPitchClass: 0, quality: "major", startTick: 0, durationTicks: 1440 });
  assert.deepEqual(calls.at(-1).slice(0, 2), ["song", 432]);
  position = 543; c.updateChord(chord.id, { rootPitchClass: 7 }); assert.deepEqual(calls.at(-1).slice(0, 2), ["song", 543]);
  position = 654; c.deleteChord(chord.id); assert.deepEqual(calls.at(-1).slice(0, 2), ["song", 654]);
  position = 765; c.setInstrumentVolume("bass", 0.43); assert.deepEqual(calls.at(-1), ["mix", 765]);
  assert.equal(c.getState().playback.currentTick, 765);
  const count = calls.length; c.setInstrumentVolume("bass", 0.43); c.setHarmonyStyle("arpeggio"); assert.equal(calls.length, count);
});
