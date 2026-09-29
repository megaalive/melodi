import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAD_VELOCITY, drumPadInput } from "../src/ui/drum-pads.js";

test("Drum Pad menulis hit tepat di playhead canonical", () => {
  assert.deepEqual(drumPadInput("snare", { currentTick: 735 }), {
    pieceId: "snare",
    startTick: 735,
    velocity: DEFAULT_PAD_VELOCITY,
    articulation: "normal"
  });
});

test("Drum Pad tidak melakukan hidden quantize dan fallback aman ke tick 0", () => {
  assert.equal(drumPadInput("kick", { currentTick: 253 }).startTick, 253);
  assert.equal(drumPadInput("kick", { currentTick: -1 }).startTick, 0);
  assert.equal(drumPadInput("kick", { currentTick: 12.5 }).startTick, 0);
});

test("velocity Drum Pad dapat diteruskan eksplisit tanpa mengubah identity piece", () => {
  const input = drumPadInput("closed-hi-hat", { currentTick: 240 }, 64);
  assert.equal(input.pieceId, "closed-hi-hat");
  assert.equal(input.startTick, 240);
  assert.equal(input.velocity, 64);
  assert.equal(input.articulation, "normal");
});
