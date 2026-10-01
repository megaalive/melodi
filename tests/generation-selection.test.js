import test from "node:test";
import assert from "node:assert/strict";
import { resolveSelectedAnchorGap } from "../src/ui/generation.js";

function songWithAnchors({ leftStart = 0, leftDuration = 480, rightStart = 960, rightDuration = 480, leftAnchor = true, rightAnchor = true } = {}) {
  return {
    phrases: [{ id: "phrase", noteIds: ["left", "right"] }],
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

test("readiness rejects occupied, protected, and unassigned gaps before Generate", () => {
  const song = songWithAnchors();
  song.notes.push({ id: "inside", startTick: 480, durationTicks: 120 });
  assert.equal(resolveSelectedAnchorGap(song, ["left", "right"]).status, "occupied");
  song.notes[2].locked = true;
  assert.equal(resolveSelectedAnchorGap(song, ["left", "right"]).status, "protected");
  song.notes.pop();
  song.phrases = [];
  assert.equal(resolveSelectedAnchorGap(song, ["left", "right"]).status, "cross-phrase");
});

test("anchor gap selection explains incomplete and unusable pairs", () => {
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors(), ["left"]), { status: "select-two" });
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors({ rightAnchor: false }), ["left", "right"]), { status: "mark-two" });
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors({ rightStart: 480 }), ["left", "right"]), { status: "empty" });
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors({ rightStart: 950 }), ["left", "right"]), { status: "grid" });
  assert.deepEqual(resolveSelectedAnchorGap(songWithAnchors({ rightStart: 9000 }), ["left", "right"]), { status: "too-long" });
});
