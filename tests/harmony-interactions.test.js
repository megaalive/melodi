import test from "node:test";
import assert from "node:assert/strict";
import { harmonyKeyboardIntent } from "../src/ui/harmony-interactions.js";

test("harmony keyboard gives melody deletion precedence and clears selected chord with Escape", () => {
  const state = { selectedNoteIds: ["note"], selectedChordId: "chord" };
  for (const key of ["Delete", "Backspace"]) {
    assert.equal(harmonyKeyboardIntent({ key }, state), "delete-notes");
    assert.equal(harmonyKeyboardIntent({ key }, { ...state, selectedNoteIds: [] }), "delete-chord");
    assert.equal(harmonyKeyboardIntent({ key }, { selectedNoteIds: [] }), null);
  }
  assert.equal(harmonyKeyboardIntent({ key: "Escape" }, state), "clear-chord");
  for (const flag of ["ctrlKey", "metaKey", "altKey", "isComposing"]) assert.equal(harmonyKeyboardIntent({ key: "Delete", [flag]: true }, state), null);
});
