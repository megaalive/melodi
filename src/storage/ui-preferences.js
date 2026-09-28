const STORAGE_KEY = "melodi.ui-preferences";

export const DEFAULT_UI_PREFERENCES = Object.freeze({
  pianoRollCollapsed: false,
  expressionCollapsed: false
});

export function normalizeUiPreferences(value) {
  return {
    pianoRollCollapsed: typeof value?.pianoRollCollapsed === "boolean"
      ? value.pianoRollCollapsed
      : DEFAULT_UI_PREFERENCES.pianoRollCollapsed,
    expressionCollapsed: typeof value?.expressionCollapsed === "boolean"
      ? value.expressionCollapsed
      : DEFAULT_UI_PREFERENCES.expressionCollapsed
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
