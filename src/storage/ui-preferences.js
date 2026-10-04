const STORAGE_KEY = "melodi.ui-preferences";

export const DEFAULT_UI_PREFERENCES = Object.freeze({
  pianoRollCollapsed: false,
  expressionCollapsed: false,
  scoreLayout: "flow",
  guitarLayout: "tab",
  guitarZoneOpen: null,
  guitarZoneHeight: null,
  dockOpen: true,
  dockWidth: null,
  dockVisibleCount: 2,
  dockSlots: Object.freeze({ generate: true, secondary: true }),
  dockPanelByWorkspace: Object.freeze({ edit: "chords", notation: "mixer", rhythm: "drum-expression" })
});

export function normalizeUiPreferences(value) {
  const requestedCount = Number.isFinite(value?.dockVisibleCount)
    ? Math.max(0, Math.min(2, Math.trunc(value.dockVisibleCount)))
    : DEFAULT_UI_PREFERENCES.dockVisibleCount;
  const dockSlots = {
    generate: typeof value?.dockSlots?.generate === "boolean" ? value.dockSlots.generate : requestedCount > 0,
    secondary: typeof value?.dockSlots?.secondary === "boolean" ? value.dockSlots.secondary : requestedCount > 1
  };
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
      ? Math.max(280, Math.min(440, Math.round(value.guitarZoneHeight)))
      : DEFAULT_UI_PREFERENCES.guitarZoneHeight,
    dockOpen: typeof value?.dockOpen === "boolean" ? value.dockOpen : DEFAULT_UI_PREFERENCES.dockOpen,
    dockWidth: Number.isFinite(value?.dockWidth)
      ? Math.max(320, Math.min(480, Math.round(value.dockWidth)))
      : DEFAULT_UI_PREFERENCES.dockWidth,
    dockVisibleCount: Number(dockSlots.generate) + Number(dockSlots.secondary),
    dockSlots,
    dockPanelByWorkspace: {
      edit: ["generate", "chords", "mixer", "tools"].includes(value?.dockPanelByWorkspace?.edit)
        ? value.dockPanelByWorkspace.edit : DEFAULT_UI_PREFERENCES.dockPanelByWorkspace.edit,
      notation: ["mixer", "tools"].includes(value?.dockPanelByWorkspace?.notation)
        ? value.dockPanelByWorkspace.notation : DEFAULT_UI_PREFERENCES.dockPanelByWorkspace.notation,
      rhythm: ["drum-expression", "mixer", "tools"].includes(value?.dockPanelByWorkspace?.rhythm)
        ? value.dockPanelByWorkspace.rhythm : DEFAULT_UI_PREFERENCES.dockPanelByWorkspace.rhythm
    }
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
