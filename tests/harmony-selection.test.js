import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { serializeProject } from "../src/core/serialization.js";
import { toPortableProject } from "../src/io/share.js";
import { songBarTicks, barRangeAtTick, canonicalSongEndTick, chordSnapTicks } from "../src/core/timeline.js";
const ids = () => { let n = 0; return () => `selection-${++n}`; };
function setup() { const idFactory = ids(); return createCommands(createInitialSong(idFactory), { idFactory }); }
function chord(c, startTick = 0) { return c.addChord({ rootPitchClass: 9, quality: "minor", startTick, durationTicks: 1440 }); }
test("harmony bar context derives current meter including arbitrary supported meters", () => {
  const c = setup(); assert.deepEqual(c.getState().harmonyRange, { startTick: 0, endTick: 1440 });
  const song = c.getSong();
  for (const [numerator, denominator, expected] of [[4, 4, 1920], [6, 8, 1440], [5, 8, 1200], [7, 16, 840]]) {
    song.timing.timeSignature = { numerator, denominator };
    assert.equal(songBarTicks(song), expected);
    assert.deepEqual(barRangeAtTick(song, expected + 20), { startTick: expected, endTick: 2 * expected });
    c.loadSong(song); assert.deepEqual(c.getState().harmonyRange, { startTick: 0, endTick: expected });
  }
});
test("clicked empty range clears all selections, candidate session, and adds no history", () => {
  const c = setup(); const a = chord(c); c.selectChord(a.id);
  c.selectNotes([c.getSong().notes[0].id]); c.suggestHarmony({ startTick: 0, endTick: 1440 });
  const before = c.getState().history.undoDepth;
  assert.deepEqual(c.setHarmonyRange(1440, 2880), { startTick: 1440, endTick: 2880 });
  const state = c.getState(); assert.equal(state.selectedChordId, null); assert.equal(state.selection, null);
  assert.deepEqual(state.selectedNoteIds, []); assert.deepEqual(state.selectedPercussionHitIds, []);
  assert.equal(state.harmony.status, "idle"); assert.equal(state.history.undoDepth, before);
  assert.deepEqual(state.harmonyRange, { startTick: 1440, endTick: 2880 });
});
test("chord selection exposes runtime context without canonical or format mutations", () => {
  const c = setup(), a = chord(c, 1440); const song = c.getSong();
  const before = serializeProject(song), portable = toPortableProject(song), depth = c.getState().history.undoDepth;
  c.selectNotes([song.notes[0].id]); c.selectChord(a.id);
  const state = c.getState(); assert.equal(state.selectedChordId, a.id);
  assert.deepEqual(state.harmonyRange, { startTick: 1440, endTick: 2880 });
  assert.deepEqual(state.selectedNoteIds, []); assert.equal(state.history.undoDepth, depth);
  assert.equal(serializeProject(c.getSong()), before); assert.deepEqual(toPortableProject(c.getSong()), portable);
  state.harmonyRange.startTick = 0; assert.equal(c.getState().harmonyRange.startTick, 1440);
  assert.throws(() => c.selectChord("missing"), { code: "chord-not-found" });
  c.clearChordSelection(); assert.equal(c.getState().selectedChordId, null);
});
test("explicit note selection and range outrank clicked context and invalidate suggestions", () => {
  const c = setup(); c.setHarmonyRange(2880, 4320);
  c.suggestHarmony({ startTick: 2880, endTick: 4320 });
  const note = c.getSong().notes[1]; c.selectNotes([note.id]);
  assert.deepEqual(c.getState().harmonyRange, { startTick: note.startTick, endTick: note.startTick + note.durationTicks });
  assert.equal(c.getState().harmony.status, "idle");
  c.selectRange(0, 2000); assert.deepEqual(c.getState().harmonyRange, { startTick: 0, endTick: 2000 });
  c.clearSelection(); assert.deepEqual(c.getState().harmonyRange, { startTick: 2880, endTick: 4320 });
});
test("pending range survives ordinary commits and undo while selected chord reconciles edit/delete/load", () => {
  const c = setup(); c.setHarmonyRange(1440, 2880); c.setSongTitle("Pending"); c.undo();
  assert.deepEqual(c.getState().harmonyRange, { startTick: 1440, endTick: 2880 });
  const a = chord(c); c.selectChord(a.id); c.updateChord(a.id, { startTick: 2880 });
  assert.deepEqual(c.getState().harmonyRange, { startTick: 2880, endTick: 4320 });
  c.undo(); assert.deepEqual(c.getState().harmonyRange, { startTick: 0, endTick: 1440 });
  c.deleteChord(a.id); assert.equal(c.getState().selectedChordId, null);
  c.undo(); assert.equal(c.getState().selectedChordId, null, "runtime selection is not restored from history");
  c.selectChord(a.id); c.loadSong(c.getSong()); assert.equal(c.getState().selectedChordId, null);
  c.setHarmonyRange(1440, 2880); c.newSong(); assert.deepEqual(c.getState().harmonyRange, { startTick: 0, endTick: 1920 });
});
test("invalid harmony range is atomic and selected chord lock remains canonical authority", () => {
  const c = setup(), a = chord(c); c.selectChord(a.id);
  for (const [start, end] of [[-1, 1440], [0, 0], [100, 50], [0.5, 1440], [0, Infinity]]) {
    assert.throws(() => c.setHarmonyRange(start, end), { code: "invalid-range" });
    assert.equal(c.getState().selectedChordId, a.id);
  }
  c.setChordLocked(a.id, true); assert.throws(() => c.deleteChord(a.id), { code: "locked-chord" });
  assert.equal(c.getState().selectedChordId, a.id);
});
test("canonical timeline end combines melody chord and percussion including duration fallback", () => {
  const song = createSong(createInitialSong(ids())); song.chords = [{ id: "end-chord", rootPitchClass: 0, quality: "major", startTick: 12000, durationTicks: 2000, locked: false }];
  assert.equal(canonicalSongEndTick(song), 14000);
  song.tracks = [{ kind: "percussion", events: [{ startTick: 16000 }, { startTick: 17000, durationTicks: 100 }] }];
  assert.equal(canonicalSongEndTick(song), 17100);
  assert.equal(canonicalSongEndTick({}), 0); assert.equal(songBarTicks({}), 1920);
});
test("chord snap supports bar half-bar beat with meter-aware ticks runtime only", () => {
  const c = setup(), song = c.getSong(), before = serializeProject(song);
  assert.equal(c.getState().editor.chordSnap, "bar");
  assert.equal(chordSnapTicks(song, "bar"), 1440); assert.equal(chordSnapTicks(song, "half-bar"), 720); assert.equal(chordSnapTicks(song, "beat"), 240);
  c.setChordSnap("half-bar"); assert.equal(c.getState().editor.chordSnap, "half-bar");
  c.setChordSnap("beat"); assert.equal(c.getState().editor.chordSnap, "beat");
  assert.equal(serializeProject(c.getSong()), before); assert.equal(c.getState().history.undoDepth, 0);
  for (const unit of ["1/8", null, undefined, 1]) assert.throws(() => c.setChordSnap(unit), { code: "invalid-chord-snap" });
  song.timing.timeSignature = { numerator: 5, denominator: 8 }; assert.equal(chordSnapTicks(song, "half-bar"), 600);
  c.loadSong(song); assert.equal(c.getState().editor.chordSnap, "bar");
});
