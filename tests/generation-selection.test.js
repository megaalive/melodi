import test from "node:test";
import assert from "node:assert/strict";
import { resolveSelectedAnchorGap } from "../src/ui/generation.js";

function songWithAnchors({ leftStart = 0, leftDuration = 480, rightStart = 960, rightDuration = 480, leftAnchor = true, rightAnchor = true } = {}) {
  return {
    notes: [
      { id: "left", startTick: leftStart, durationTicks: leftDuration, anchor: leftAnchor },
      { id: "right", startTick: rightStart, durationTicks: rightDuration, anchor: rightAnchor }
    ]
  };
}

test("selected anchors derive the empty gap in musical order", () => {
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors(), ["right", "left"]), {
    status: "ready",
    gap: {
      startTick: 480,
      endTick: 960,
      leftAnchorNoteId: "left",
      rightAnchorNoteId: "right"
    }
  });
});

test("anchor gap selection explains incomplete and unusable pairs", () => {
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors(), ["left"]), { status: "select-two" });
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors({ rightAnchor: false }), ["left", "right"]), { status: "mark-two" });
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors({ rightStart: 480 }), ["left", "right"]), { status: "empty" });
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors({ rightStart: 950 }), ["left", "right"]), { status: "grid" });
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors({ rightStart: 9000 }), ["left", "right"]), { status: "too-long" });
});
