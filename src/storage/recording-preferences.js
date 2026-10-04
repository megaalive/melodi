/**
 * D3: preferensi rekam tangkap ide. Kompensasi latensi disimpan terpisah dari
 * Song, ui-preferences, dan papan ide: yang ini hanya memengaruhi pencatatan
 * take di tab Ide, tidak masuk undo, tidak masuk share, dan tidak mengubah
 * model lagu.
 */
const STORAGE_KEY = "melodi.recording-preferences";

export const LATENCY_STEP_MS = 5;
export const LATENCY_MIN_MS = 0;
export const LATENCY_MAX_MS = 250;
export const REPORTED_LATENCY_MAX_SECONDS = 0.25;

export function normalizeRecordingPreferences(value) {
  const raw = value?.latencyMs;
  if (raw === null || raw === undefined) return Object.freeze({ latencyMs: null });
  if (!Number.isFinite(raw)) return Object.freeze({ latencyMs: null });
  return Object.freeze({
    latencyMs: Math.max(LATENCY_MIN_MS, Math.min(LATENCY_MAX_MS, Math.round(raw)))
  });
}

export function readRecordingPreferences(storage) {
  try {
    const serialized = storage?.getItem(STORAGE_KEY);
    return serialized ? normalizeRecordingPreferences(JSON.parse(serialized)) : normalizeRecordingPreferences();
  } catch {
    return normalizeRecordingPreferences();
  }
}

export function writeRecordingPreferences(storage, preferences) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeRecordingPreferences(preferences)));
    return Boolean(storage);
  } catch {
    return false;
  }
}

/**
 * Kompensasi yang benar-benar dipakai. Nilai manual selalu menang; tanpa nilai
 * manual latensi yang dilaporkan context dipakai dan dijepit 0-0,25 detik.
 */
export function latencySeconds(preferences, reportedSeconds) {
  const manual = preferences?.latencyMs;
  if (Number.isFinite(manual)) return manual / 1000;
  const reported = Number(reportedSeconds);
  if (!Number.isFinite(reported) || reported <= 0) return 0;
  return Math.min(REPORTED_LATENCY_MAX_SECONDS, reported);
}

export function stepLatency(preferences, deltaMs) {
  const current = Number.isFinite(preferences?.latencyMs) ? preferences.latencyMs : 0;
  return normalizeRecordingPreferences({ latencyMs: current + deltaMs });
}