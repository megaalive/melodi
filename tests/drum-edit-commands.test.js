import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";

function drumSong() {
  let next = 0;
  const song = createInitialSong(() => `drum-cmd-${++next}`);
  song.tracks.push({
    id: "drums-main",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "hit-kick", pieceId: "kick", startTick: 0, velocity: 110, articulation: "accent", durationTicks: 90, pan: -0.25, tuning: -1.5 },
      { id: "hit-snare", pieceId: "snare", startTick: 480, velocity: 62, articulation: "ghost", durationTicks: 75, pan: 0.4, tuning: 1.25 },
      { id: "hit-hat", pieceId: "closed-hi-hat", startTick: 480, velocity: 84, articulation: "normal" },
      { id: "hit-ride", pieceId: "ride", startTick: 960, velocity: 94, articulation: "accent" }
    ]
  });
  return createSong(song);
}

function commandFixture() {
  let next = 0;
  return createCommands(drumSong(), { idFactory: () => `duplicate-${++next}` });
}

test("percussion selection is canonical, detached, exclusive with pitched selection, and clearable", () => {
  const commands = commandFixture();
  assert.deepEqual(commands.selectPercussionHits(["hit-snare", "hit-hat"]), ["hit-snare", "hit-hat"]);
  assert.deepEqual(commands.getState().selectedPercussionHitIds, ["hit-snare", "hit-hat"]);
  const returned = commands.getSelectedPercussionHitIds();
  returned.push("fake");
  assert.deepEqual(commands.getSelectedPercussionHitIds(), ["hit-snare", "hit-hat"]);
  assert.deepEqual(commands.getSelectedNoteIds(), []);
  commands.selectNotes([commands.getSong().notes[0].id]);
  assert.deepEqual(commands.getSelectedPercussionHitIds(), []);
  commands.selectPercussionHits(["hit-snare"]);
  assert.deepEqual(commands.getSelectedNoteIds(), []);
  assert.deepEqual(commands.clearPercussionSelection(), []);
  assert.deepEqual(commands.getSelectedPercussionHitIds(), []);
  assert.throws(() => commands.selectPercussionHits(["missing"]), { code: "percussion-hit-not-found" });
});

test("batch delete is one undo step and undo/redo never retains dead selection IDs", () => {
  const commands = commandFixture();
  commands.selectPercussionHits(["hit-kick", "hit-snare", "hit-hat"]);
  const beforeDepth = commands.getState().history.undoDepth;
  assert.deepEqual(commands.deletePercussionHits(), ["hit-kick", "hit-snare", "hit-hat"]);
  assert.equal(commands.getState().history.undoDepth, beforeDepth + 1);
  assert.deepEqual(commands.getSelectedPercussionHitIds(), []);
  assert.deepEqual(commands.getSong().tracks[0].events.map((hit) => hit.id), ["hit-ride"]);
  commands.undo();
  assert.deepEqual(commands.getSong().tracks[0].events.map((hit) => hit.id), ["hit-kick", "hit-snare", "hit-hat", "hit-ride"]);
  assert.deepEqual(commands.getSelectedPercussionHitIds(), []);
  commands.redo();
  assert.deepEqual(commands.getSong().tracks[0].events.map((hit) => hit.id), ["hit-ride"]);
  assert.deepEqual(commands.getSelectedPercussionHitIds(), []);
});

test("duplicate one hit advances by current snap and preserves every expression field", () => {
  const commands = commandFixture();
  commands.setSnap("1/16");
  commands.selectPercussionHits(["hit-kick"]);
  const beforeDepth = commands.getState().history.undoDepth;
  const [duplicate] = commands.duplicatePercussionHits();
  assert.equal(commands.getState().history.undoDepth, beforeDepth + 1);
  assert.deepEqual(duplicate, {
    id: "duplicate-1",
    pieceId: "kick",
    startTick: 120,
    velocity: 110,
    articulation: "accent",
    durationTicks: 90,
    pan: -0.25,
    tuning: -1.5
  });
  assert.deepEqual(commands.getSelectedPercussionHitIds(), ["duplicate-1"]);
  commands.undo();
  assert.deepEqual(commands.getSong().tracks[0].events.map((hit) => hit.id), ["hit-kick", "hit-snare", "hit-hat", "hit-ride"]);
});

test("duplicate block is placed after its start span and becomes the selected block", () => {
  const commands = commandFixture();
  commands.setSnap("1/8");
  commands.selectPercussionHits(["hit-kick", "hit-snare", "hit-hat"]);
  const clones = commands.duplicatePercussionHits();
  assert.deepEqual(clones.map((hit) => [hit.pieceId, hit.startTick]), [
    ["kick", 720], ["snare", 1200], ["closed-hi-hat", 1200]
  ]);
  assert.deepEqual(commands.getSelectedPercussionHitIds(), clones.map((hit) => hit.id));
  assert.equal(new Set(clones.map((hit) => hit.id)).size, clones.length);
  assert.equal(commands.getState().history.undoDepth, 1);
});

test("load, single-hit deletion, same-cell selection, and stale selection stay safe", () => {
  const commands = commandFixture();
  commands.selectPercussionHits(["hit-snare", "hit-hat"]);
  commands.deletePercussionHit("drums-main", "hit-snare");
  assert.deepEqual(commands.getSelectedPercussionHitIds(), ["hit-hat"]);
  commands.selectPercussionHits(["hit-hat", "hit-ride"]);
  assert.deepEqual(commands.getState().selectedPercussionHitIds, ["hit-hat", "hit-ride"]);
  commands.loadSong(drumSong());
  assert.deepEqual(commands.getSelectedPercussionHitIds(), []);
});
