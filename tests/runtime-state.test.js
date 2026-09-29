import test from "node:test";
import assert from "node:assert/strict";
import { VIEW_REGION_MODES, normalizeRuntimeState } from "../src/core/runtime-state.js";

test("R3-A runtime state defaults R3 view fields without changing the source", () => {
  const legacyState = {
    selectedNoteIds: ["note-1"],
    playback: {
      status: "playing",
      currentTick: 240,
      currentNoteId: "note-1",
      tempo: 120,
      loop: { enabled: false, startTick: 0, endTick: 1920 }
    }
  };

  const normalized = normalizeRuntimeState(legacyState);

  assert.deepEqual(normalized.view, { mode: "combined", follow: true });
  assert.equal(normalized.playback.currentSyllableId, null);
  assert.deepEqual(normalized.playback.currentSyllableIds, []);
  assert.equal(normalized.playback.currentNoteId, "note-1");
  assert.equal("view" in legacyState, false);
  assert.equal("currentSyllableIds" in legacyState.playback, false);
});

test("runtime normalization keeps an available active syllable mapping", () => {
  const normalized = normalizeRuntimeState({
    playback: { currentSyllableId: "syllable-1" }
  });

  assert.equal(normalized.playback.currentSyllableId, "syllable-1");
  assert.deepEqual(normalized.playback.currentSyllableIds, ["syllable-1"]);
});

test("invalid runtime view mode falls back without changing playback state", () => {
  const normalized = normalizeRuntimeState({
    view: { mode: "unknown", follow: false },
    playback: { currentSyllableIds: ["syllable-2"] }
  });

  assert.deepEqual(normalized.view, { mode: "combined", follow: false });
  assert.equal(normalized.playback.currentSyllableId, "syllable-2");
  assert.deepEqual(normalized.playback.currentSyllableIds, ["syllable-2"]);
});

test("history state defaults when a cached Pages bundle predates the field", () => {
  const legacy = { selectedNoteIds: [] };

  const normalized = normalizeRuntimeState(legacy);

  assert.deepEqual(normalized.history, { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  assert.equal("history" in legacy, false);
});

test("history depth is only trusted when the matching capability is set", () => {
  assert.deepEqual(normalizeRuntimeState({ history: { canUndo: true, canRedo: false, undoDepth: 4, redoDepth: 7 } }).history, {
    canUndo: true,
    canRedo: false,
    undoDepth: 4,
    redoDepth: 0
  });
  assert.deepEqual(normalizeRuntimeState({ history: { canUndo: "yes", undoDepth: 3 } }).history, {
    canUndo: false,
    canRedo: false,
    undoDepth: 0,
    redoDepth: 0
  });
  assert.deepEqual(normalizeRuntimeState({ history: { canRedo: true, redoDepth: -1 } }).history, {
    canUndo: false,
    canRedo: true,
    undoDepth: 0,
    redoDepth: 0
  });
});

test("editor tool defaults safely to select and preserves known tools", () => {
  assert.equal(normalizeRuntimeState({ editor: { snap: "1/8", zoom: 1 } }).editor.tool, "select");
  assert.equal(normalizeRuntimeState({ editor: { tool: "draw", zoom: 1 } }).editor.tool, "draw");
  assert.equal(normalizeRuntimeState({ editor: { tool: "erase", zoom: 1 } }).editor.tool, "select");
});


test("Expression tetap hanya tersedia di view pitched/fretted", () => {
  assert.deepEqual(VIEW_REGION_MODES.expression, ["score", "piano-roll", "combined", "guitar"]);
  assert.equal(VIEW_REGION_MODES.expression.includes("lyrics"), false);
  assert.equal(VIEW_REGION_MODES.expression.includes("drums"), false);
  assert.deepEqual(VIEW_REGION_MODES.drums, ["drums"]);
  assert.equal(normalizeRuntimeState({ view: { mode: "drums", follow: true } }).view.mode, "drums");
});
