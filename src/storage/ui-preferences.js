const STORAGE_KEY = "melodi.ui-preferences";

export const DEFAULT_UI_PREFERENCES = Object.freeze({
  pianoRollCollapsed: false,
  expressionCollapsed: false,
  scoreLayout: "flow",
  guitarLayout: "tab",
  guitarZoneOpen: null,
  guitarZoneHeight: 220,
  dockOpen: true,
  dockWidth: null
});

export function normalizeUiPreferences(value) {
  return {
    pianoRollCollapsed: typeof value?.pianoRollCollapsed === "boolean"
      ? value.pianoRollCollapsed
      : DEFAULT_UI_PREFERENCES.pianoRollCollapsed,
    expressionCollapsed: typeof value?.expressionCollapsed === "boolean"
      ? value.expressionCollapsed
      : DEFAULT_UI_PREFERENCES.expressionCollapsed,
    scoreLayout: value?.scoreLayout === "page" ? "page" : DEFAULT_UI_PREFERENCES.scoreLayout,
    guitarLayout: value?.guitarLayout === "fretboard" ? "fretboard" : DEFAULT_UI_PREFERENCES.guitarLayout,
    guitarZoneOpen: typeof value?.guitarZoneOpen === "boolean" ? value.guitarZoneOpen : DEFAULT_UI_PREFERENCES.guitarZoneOpen,
    guitarZoneHeight: Number.isFinite(value?.guitarZoneHeight)
      ? Math.max(120, Math.min(480, Math.round(value.guitarZoneHeight)))
      : DEFAULT_UI_PREFERENCES.guitarZoneHeight,
    dockOpen: typeof value?.dockOpen === "boolean" ? value.dockOpen : DEFAULT_UI_PREFERENCES.dockOpen,
    dockWidth: Number.isFinite(value?.dockWidth)
      ? Math.max(320, Math.min(480, Math.round(value.dockWidth)))
      : DEFAULT_UI_PREFERENCES.dockWidth
  };
}

export function readUiPreferences(storage) {
  try {
    const serialized = storage?.getItem(STORAGE_KEY);
    return serialized ? normalizeUiPreferences(JSON.parse(serialized)) : normalizeUiPreferences();
  } catch {
    return normalizeUiPreferences();
  }
}

export function writeUiPreferences(storage, preferences) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeUiPreferences(preferences)));
    return Boolean(storage);
  } catch {
    return false;
  }
}
