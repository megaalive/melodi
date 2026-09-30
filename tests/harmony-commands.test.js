import assert from "node:assert/strict";
import test from "node:test";
import { createBlankSong } from "../src/core/model.js";
import { projectSongToAbc } from "../src/notation/abc.js";
import { createCommands } from "../src/core/commands.js";

function fixture() {
  const song = createBlankSong(() => "song");
  song.notes = [{ id: "melody", pitch: 60, startTick: 0, durationTicks: 1920, source: "user", anchor: false, locked: false }];
  let next = 0;
  return createCommands(song, { idFactory: () => `chord-${++next}` });
}
const fields = { rootPitchClass: 0, quality: "major", startTick: 0, durationTicks: 960 };

test("chord CRUD validates atomically and records one step per canonical change", () => {
  const c = fixture();
  assert.throws(() => c.addChord({ ...fields, rootPitchClass: 12 }), { code: "invalid-chord" });
  assert.equal(c.getState().history.undoDepth, 0);
  const chord = c.addChord(fields);
  assert.equal(chord.locked, false);
  assert.equal(c.getState().history.undoDepth, 1);
  c.updateChord(chord.id, { quality: "minor", rootPitchClass: 9 });
  assert.equal(c.getState().history.undoDepth, 2);
  c.undo();
  assert.equal(c.getSong().chords[0].quality, "major");
  c.redo();
  assert.equal(c.getSong().chords[0].quality, "minor");
  assert.throws(() => c.updateChord(chord.id, { locked: true }), { code: "invalid-chord-patch" });
  assert.throws(() => c.updateChord(chord.id, { durationTicks: 0 }), { code: "invalid-duration" });
  assert.equal(c.getState().history.undoDepth, 2);
  c.deleteChord(chord.id);
  assert.equal(c.getSong().chords.length, 0);
  c.undo();
  assert.equal(c.getSong().chords[0].id, chord.id);
});

test("canonical chord lock requires explicit unlock and is undoable", () => {
  const c = fixture(); const chord = c.addChord(fields);
  c.setChordLocked(chord.id, true);
  const depth = c.getState().history.undoDepth;
  assert.throws(() => c.updateChord(chord.id, { quality: "minor" }), { code: "locked-chord" });
  assert.throws(() => c.deleteChord(chord.id), { code: "locked-chord" });
  assert.equal(c.getState().history.undoDepth, depth);
  c.undo(); assert.equal(c.getSong().chords[0].locked, false);
  c.redo(); assert.equal(c.getSong().chords[0].locked, true);
  c.setChordLocked(chord.id, false);
  c.updateChord(chord.id, { quality: "diminished" });
  c.deleteChord(chord.id);
  assert.equal(c.getSong().chords.length, 0);
});

test("accepting harmony adds a canonical chord and replaces only exact unlocked ranges", () => {
  const c = fixture();
  const session = c.suggestHarmony({ startTick: 0, endTick: 960 });
  assert.ok(session.candidates.length > 1);
  assert.equal(c.getState().history.undoDepth, 0);
  c.selectHarmonyCandidate(session.candidates[1].id);
  const chord = c.acceptHarmonyCandidate();
  assert.equal(chord.rootPitchClass, session.candidates[1].rootPitchClass);
  assert.equal(chord.durationTicks, 960);
  assert.equal(c.getHarmonyState().status, "idle");
  assert.equal(c.getState().history.undoDepth, 1);
  const next = c.suggestHarmony({ startTick: 0, endTick: 960 });
  const replacement = next.candidates.find((item) => item.rootPitchClass !== chord.rootPitchClass);
  c.acceptHarmonyCandidate(replacement.id);
  assert.equal(c.getSong().chords.length, 1);
  assert.equal(c.getSong().chords[0].id, chord.id);
  assert.equal(c.getSong().chords[0].rootPitchClass, replacement.rootPitchClass);
  c.undo(); assert.equal(c.getSong().chords[0].rootPitchClass, chord.rootPitchClass);
});

test("harmony acceptance rejects locked overlaps and unrelated partial overlaps without history", () => {
  const c = fixture(); const chord = c.addChord({ ...fields, startTick: 240 });
  c.setChordLocked(chord.id, true);
  let session = c.suggestHarmony({ startTick: 0, endTick: 960 });
  let depth = c.getState().history.undoDepth;
  assert.throws(() => c.acceptHarmonyCandidate(session.candidates[0].id), { code: "locked-chord" });
  assert.equal(c.getState().history.undoDepth, depth);
  c.setChordLocked(chord.id, false);
  session = c.suggestHarmony({ startTick: 0, endTick: 960 }); depth = c.getState().history.undoDepth;
  assert.throws(() => c.acceptHarmonyCandidate(session.candidates[0].id), { code: "chord-conflict" });
  assert.equal(c.getState().history.undoDepth, depth);
  assert.equal(c.getSong().chords[0].startTick, 240);
});

test("harmony runtime snapshots are detached and canonical edits/history/load clear sessions", () => {
  const c = fixture();
  const suggest = () => c.suggestHarmony({ startTick: 0, endTick: 960 });
  const session = suggest(); session.candidates[0].quality = "changed";
  assert.notEqual(c.getHarmonyState().candidates[0].quality, "changed");
  const snapshot = c.getState(); snapshot.harmony.range.startTick = 600;
  assert.equal(c.getHarmonyState().range.startTick, 0);
  c.setSongTitle("changed"); assert.equal(c.getHarmonyState().status, "idle");
  assert.throws(() => c.acceptHarmonyCandidate(session.candidates[0].id), { code: "harmony-session-missing" });
  suggest(); c.undo(); assert.equal(c.getHarmonyState().status, "idle");
  suggest(); c.redo(); assert.equal(c.getHarmonyState().status, "idle");
  suggest(); c.loadSong(c.getSong()); assert.equal(c.getHarmonyState().status, "idle");
  suggest(); assert.equal(c.clearHarmonySuggestions(), true);
  assert.equal(c.clearHarmonySuggestions(), false);
  assert.throws(() => c.selectHarmonyCandidate("missing"), { code: "harmony-session-missing" });
});

test("all advertised harmony commands exist", () => {
  const c = fixture();
  for (const action of ["suggestHarmony", "getHarmonyState", "selectHarmonyCandidate", "acceptHarmonyCandidate", "clearHarmonySuggestions", "addChord", "updateChord", "deleteChord", "setChordLocked"]) {
    assert.ok(c.getState().availableActions.includes(action));
    assert.equal(typeof c[action], "function");
  }
});

test("adjacent locked chords do not overlap a half-open candidate range", () => {
  const c = fixture(); const chord = c.addChord({ ...fields, startTick: 960 });
  c.setChordLocked(chord.id, true);
  const session = c.suggestHarmony({ startTick: 0, endTick: 960 });
  c.acceptHarmonyCandidate(session.candidates[0].id);
  assert.equal(c.getSong().chords.length, 2);
});

test("acceptance refuses multiple exact chords instead of silently deleting a sequence", () => {
  const c = fixture(); c.addChord(fields); c.addChord({ ...fields, rootPitchClass: 5 });
  const session = c.suggestHarmony({ startTick: 0, endTick: 960 });
  const depth = c.getState().history.undoDepth;
  assert.throws(() => c.acceptHarmonyCandidate(session.candidates[0].id), { code: "chord-conflict" });
  assert.equal(c.getSong().chords.length, 2);
  assert.equal(c.getState().history.undoDepth, depth);
});

test("invalid and no-op chord edits preserve history and a valid harmony session", () => {
  const c = fixture(); const chord = c.addChord(fields);
  const session = c.suggestHarmony({ startTick: 0, endTick: 960 });
  const depth = c.getState().history.undoDepth;
  c.updateChord(chord.id, { quality: "major" });
  c.setChordLocked(chord.id, false);
  assert.throws(() => c.updateChord(chord.id, { rootPitchClass: -1 }), { code: "invalid-chord" });
  assert.throws(() => c.selectHarmonyCandidate("missing"), { code: "harmony-candidate-not-found" });
  assert.equal(c.getState().history.undoDepth, depth);
  assert.deepEqual(c.getHarmonyState(), session);
});


test("accepted chord at a held-note interior appears in ABC without changing canonical melody", () => {
  const c = fixture(); const melody = c.getSong().notes;
  const session = c.suggestHarmony({ startTick: 240, endTick: 960 });
  const chord = c.acceptHarmonyCandidate(session.candidates[0].id);
  const score = projectSongToAbc(c.getSong());
  assert.equal(score.projection.measures[0].chords[0].startTick, 240);
  assert.ok(score.abc.includes('"C"'), "accepted C chord is visible within held note");
  assert.ok(score.abc.includes('C- "C"'), "ABC note tied across the chord boundary");
  assert.deepEqual(c.getSong().notes, melody);
  assert.equal(chord.startTick, 240);
});
