import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { percussionExpressionPatch, resolvePercussionExpression } from "../src/ui/percussion-expression.js";

function fixture() {
  let next = 0;
  const song = createInitialSong(() => `perc-expr-${++next}`);
  const commands = createCommands(song, {
    idFactory: (() => {
      let id = 0;
      return () => `hit-expr-${++id}`;
    })()
  });
  const created = commands.addPercussionHit({
    pieceId: "open-hi-hat",
    startTick: 245,
    velocity: 84,
    articulation: "ghost",
    pan: -0.25,
    tuning: 1.5
  });
  return { commands, selection: { trackId: created.trackId, hitId: created.hit.id } };
}

test("Hit Expression memproyeksikan capability percussion dari canonical hit", () => {
  const { commands, selection } = fixture();
  const expression = resolvePercussionExpression(commands.getSong(), selection);
  assert.equal(expression.pieceId, "open-hi-hat");
  assert.equal(expression.pieceName, "Open HH");
  assert.equal(expression.startTick, 245);
  assert.equal(expression.velocity, 84);
  assert.equal(expression.pan, -0.25);
  assert.equal(expression.tuning, 1.5);
  assert.equal(expression.articulation, "ghost");
  assert.equal(expression.chokeGroup, "hi-hat");
});

test("Hit Expression tidak mengarang selection yang stale", () => {
  const { commands } = fixture();
  assert.equal(resolvePercussionExpression(commands.getSong(), { trackId: "missing", hitId: "missing" }), null);
  assert.equal(resolvePercussionExpression(commands.getSong(), null), null);
});

test("patch UI mengubah pan persen ke canonical dan menghapus default opsional", () => {
  assert.deepEqual(percussionExpressionPatch({
    startTick: "480",
    velocity: "110",
    pan: "-35",
    tuning: "2.5",
    articulation: "accent"
  }), {
    startTick: 480,
    velocity: 110,
    articulation: "accent",
    pan: -0.35,
    tuning: 2.5
  });

  assert.deepEqual(percussionExpressionPatch({
    startTick: "0",
    velocity: "100",
    pan: "0",
    tuning: "0",
    articulation: "normal"
  }), {
    startTick: 0,
    velocity: 100,
    articulation: "normal",
    pan: null,
    tuning: null
  });
});


test("patch Hit Expression diterapkan atomik dan default pan/tuning kembali optional", () => {
  const { commands, selection } = fixture();
  const updated = commands.updatePercussionHit(selection.trackId, selection.hitId, percussionExpressionPatch({
    startTick: "480",
    velocity: "120",
    pan: "0",
    tuning: "0",
    articulation: "accent"
  }));
  assert.equal(updated.startTick, 480);
  assert.equal(updated.velocity, 120);
  assert.equal(updated.articulation, "accent");
  assert.equal(Object.hasOwn(updated, "pan"), false);
  assert.equal(Object.hasOwn(updated, "tuning"), false);
  assert.equal(commands.canUndo(), true);
  commands.undo();
  const restored = resolvePercussionExpression(commands.getSong(), selection);
  assert.equal(restored.startTick, 245);
  assert.equal(restored.pan, -0.25);
  assert.equal(restored.tuning, 1.5);
});
