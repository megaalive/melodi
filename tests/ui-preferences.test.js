import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_UI_PREFERENCES,
  normalizeUiPreferences,
  readUiPreferences,
  writeUiPreferences
} from "../src/storage/ui-preferences.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    values
  };
}

test("panel disclosure preferences default expanded and normalize fields independently", () => {
  assert.deepEqual(normalizeUiPreferences(), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(normalizeUiPreferences({ pianoRollCollapsed: true, expressionCollapsed: "yes", scoreLayout: "page", guitarLayout: "fretboard" }), {
    pianoRollCollapsed: true,
    expressionCollapsed: false,
    scoreLayout: "page",
    guitarLayout: "fretboard",
    guitarZoneOpen: null,
    guitarZoneHeight: null,
    dockOpen: true,
    dockWidth: null,
    dockVisibleCount: 2,
    dockSlots: { generate: true, secondary: true },
    dockPanelByWorkspace: { edit: "chords", notation: "mixer", rhythm: "drum-expression" }
  });
  assert.equal(normalizeUiPreferences({ scoreLayout: "unknown" }).scoreLayout, "flow");
  assert.equal(normalizeUiPreferences({ guitarLayout: "unknown" }).guitarLayout, "tab");
});

test("panel disclosure preferences persist independently without storing song data", () => {
  const storage = memoryStorage();
  assert.equal(writeUiPreferences(storage, { pianoRollCollapsed: true, expressionCollapsed: false, scoreLayout: "page", guitarLayout: "fretboard", guitarZoneOpen: true, guitarZoneHeight: 315 }), true);
  assert.deepEqual(readUiPreferences(storage), { pianoRollCollapsed: true, expressionCollapsed: false, scoreLayout: "page", guitarLayout: "fretboard", guitarZoneOpen: true, guitarZoneHeight: 315, dockOpen: true, dockWidth: null, dockVisibleCount: 2, dockSlots: { generate: true, secondary: true }, dockPanelByWorkspace: { edit: "chords", notation: "mixer", rhythm: "drum-expression" } });
  assert.equal(storage.values.size, 1);
  assert.deepEqual(JSON.parse(storage.values.get("melodi.ui-preferences")), {
    pianoRollCollapsed: true,
    expressionCollapsed: false,
    scoreLayout: "page",
    guitarLayout: "fretboard",
    guitarZoneOpen: true,
    guitarZoneHeight: 315,
    dockOpen: true,
    dockWidth: null,
    dockVisibleCount: 2,
    dockSlots: { generate: true, secondary: true },
    dockPanelByWorkspace: { edit: "chords", notation: "mixer", rhythm: "drum-expression" }
  });
});

test("dock preferences are bounded and legacy preference records keep safe defaults", () => {
  assert.deepEqual(normalizeUiPreferences({ dockOpen: false, dockWidth: 512, unrelated: true }), {
    ...DEFAULT_UI_PREFERENCES,
    dockOpen: false,
    dockWidth: 480
  });
  assert.equal(normalizeUiPreferences({ dockWidth: 319.5 }).dockWidth, 320);
  assert.equal(normalizeUiPreferences({ dockWidth: "400", dockOpen: "false" }).dockWidth, null);
  assert.equal(normalizeUiPreferences({}).dockOpen, true);
  assert.deepEqual(normalizeUiPreferences({ dockSlots: { generate: false, secondary: true }, dockVisibleCount: 2 }).dockSlots,
    { generate: false, secondary: true });
  assert.equal(normalizeUiPreferences({ dockPanelByWorkspace: { edit: "drum-expression", notation: "tools", rhythm: "chords" } }).dockPanelByWorkspace.edit, "chords");
});

test("Guitar zone visibility and height are bounded UI preferences", () => {
  assert.equal(normalizeUiPreferences({ guitarZoneOpen: false, guitarZoneHeight: 1 }).guitarZoneOpen, false);
  assert.equal(normalizeUiPreferences({ guitarZoneOpen: false, guitarZoneHeight: 1 }).guitarZoneHeight, 280);
  assert.equal(normalizeUiPreferences({ guitarZoneOpen: true, guitarZoneHeight: 900 }).guitarZoneHeight, 440);
  assert.equal(normalizeUiPreferences({ guitarZoneOpen: "open", guitarZoneHeight: "240" }).guitarZoneOpen, null);
  assert.equal(normalizeUiPreferences({ guitarZoneHeight: "240" }).guitarZoneHeight, null);
});

test("invalid or unavailable UI preference storage falls back safely", () => {
  assert.deepEqual(readUiPreferences(memoryStorage({ "melodi.ui-preferences": "{" })), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(readUiPreferences(null), DEFAULT_UI_PREFERENCES);
  assert.equal(writeUiPreferences(null, DEFAULT_UI_PREFERENCES), false);
});
