import { deserializeProject, serializeProject } from "../core/serialization.js?v=20260930.26";

export const DRAFT_STORAGE_KEY = "melodi.draft.v1";

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function createDraftPersistence({
  storage,
  key = DRAFT_STORAGE_KEY,
  delayMs = 300,
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
  onStatus = () => {}
} = {}) {
  const targetStorage = storage === undefined ? safeLocalStorage() : storage;
  let timer = null;
  let pendingSerialized = null;
  let lastSavedSerialized = null;

  function report(status) {
    try { onStatus(status); } catch {}
  }

  function savePending() {
    timer = null;
    const serialized = pendingSerialized;
    pendingSerialized = null;
    if (!serialized || !targetStorage) return false;
    try {
      targetStorage.setItem(key, serialized);
      lastSavedSerialized = serialized;
      report("saved");
      return true;
    } catch {
      report("save-failed");
      return false;
    }
  }

  return Object.freeze({
    load() {
      if (!targetStorage) return { song: null, status: "unavailable" };
      let serialized;
      try {
        serialized = targetStorage.getItem(key);
      } catch {
        return { song: null, status: "unavailable" };
      }
      if (serialized === null || serialized === "") return { song: null, status: "empty" };
      try {
        const song = deserializeProject(serialized);
        lastSavedSerialized = serializeProject(song);
        return { song, status: "restored" };
      } catch {
        return { song: null, status: "invalid" };
      }
    },
    schedule(song) {
      if (!targetStorage) return false;
      let serialized;
      try { serialized = serializeProject(song); } catch {
        report("save-failed");
        return false;
      }
      if (serialized === lastSavedSerialized || serialized === pendingSerialized) return true;
      if (timer !== null) clearTimer(timer);
      pendingSerialized = serialized;
      timer = setTimer(savePending, delayMs);
      return true;
    },
    flush() {
      if (timer !== null) clearTimer(timer);
      if (timer === null && pendingSerialized === null) return true;
      return savePending();
    },
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      pendingSerialized = null;
    }
  });
}
