import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRuntimeState } from "../src/core/runtime-state.js";

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
