import { deserializeProject, serializeProject } from "../core/serialization.js?v=20261001.43";

export const BROWSER_LIBRARY_DATABASE = "melodi";
export const BROWSER_LIBRARY_STORE = "songs";
export const BROWSER_LIBRARY_VERSION = 1;

export class BrowserLibraryError extends Error {
  constructor(status) {
    super(status);
    this.name = "BrowserLibraryError";
    this.status = status;
  }
}

function fail(status) {
  throw new BrowserLibraryError(status);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function statusFor(error) {
  if (error instanceof BrowserLibraryError) return error.status;
  if (error?.name === "QuotaExceededError") return "quota";
  if (error?.name === "SecurityError" || error?.name === "InvalidStateError") return "unavailable";
  return "error";
}

function errorResult(error, extra = {}) {
  const status = statusFor(error);
  return { ok: false, status, error: status, ...extra };
}

function isoTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) fail("invalid-time");
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    fail("invalid-time");
  }
}

function readTime(now) {
  let value;
  try { value = now(); } catch { fail("invalid-time"); }
  const milliseconds = value instanceof Date ? value.getTime()
    : typeof value === "string" ? Date.parse(value)
      : Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) fail("invalid-time");
  return milliseconds;
}

function readStoredRecord(value) {
  if (!isRecord(value)
    || Object.keys(value).sort().join(",") !== "createdAt,id,project,title,updatedAt"
    || typeof value.id !== "string" || value.id.trim() === ""
    || typeof value.title !== "string" || value.title.trim() === ""
    || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string"
    || typeof value.project !== "string") fail("corrupt");

  const createdMilliseconds = Date.parse(value.createdAt);
  const updatedMilliseconds = Date.parse(value.updatedAt);
  if (!Number.isFinite(createdMilliseconds) || !Number.isFinite(updatedMilliseconds)
    || new Date(createdMilliseconds).toISOString() !== value.createdAt
    || new Date(updatedMilliseconds).toISOString() !== value.updatedAt
    || updatedMilliseconds < createdMilliseconds) fail("corrupt");

  let song;
  try { song = deserializeProject(value.project); } catch { fail("corrupt"); }
  if (song.id !== value.id || song.title !== value.title) fail("corrupt");
  return { id: value.id, title: value.title, createdAt: value.createdAt, updatedAt: value.updatedAt, song };
}

function metadata(record) {
  return { id: record.id, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

function runTransaction(database, mode, operation) {
  return new Promise((resolve, reject) => {
    let transaction;
    let value;
    let operationError = null;
    try {
      transaction = database.transaction(BROWSER_LIBRARY_STORE, mode);
    } catch (error) {
      reject(error);
      return;
    }

    const abort = (error) => {
      operationError ??= error;
      try { transaction.abort(); } catch {}
    };
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => { operationError ??= transaction.error; };
    transaction.onabort = () => reject(operationError ?? transaction.error ?? new Error("transaction-aborted"));

    try {
      operation(transaction.objectStore(BROWSER_LIBRARY_STORE), {
        setValue(nextValue) { value = nextValue; },
        abort
      });
    } catch (error) {
      abort(error);
    }
  });
}

export function createBrowserLibrary({ indexedDB = globalThis.indexedDB, now = () => Date.now() } = {}) {
  let databasePromise = null;

  function getDatabase() {
    if (!indexedDB || typeof indexedDB.open !== "function") return Promise.reject(new BrowserLibraryError("unavailable"));
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      let settled = false;
      let upgradeError = null;
      let request;
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      try {
        request = indexedDB.open(BROWSER_LIBRARY_DATABASE, BROWSER_LIBRARY_VERSION);
      } catch (error) {
        rejectOnce(error);
        return;
      }

      request.onupgradeneeded = () => {
        try {
          const database = request.result;
          if (!database.objectStoreNames.contains(BROWSER_LIBRARY_STORE)) {
            database.createObjectStore(BROWSER_LIBRARY_STORE, { keyPath: "id" });
          }
        } catch (error) {
          upgradeError = error;
          try { request.transaction?.abort(); } catch {}
        }
      };
      request.onblocked = () => rejectOnce(new BrowserLibraryError("blocked"));
      request.onerror = () => rejectOnce(upgradeError ?? request.error ?? new Error("database-open-failed"));
      request.onsuccess = () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        settled = true;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }

  async function listBrowserSongs() {
    try {
      const database = await getDatabase();
      const rows = await runTransaction(database, "readonly", (store, result) => {
        const request = store.getAll();
        request.onsuccess = () => result.setValue(request.result);
        request.onerror = () => result.abort(request.error);
      });
      const songs = [];
      const corruptSongs = [];
      let corruptCount = 0;
      for (const row of rows) {
        try { songs.push(metadata(readStoredRecord(row))); } catch {
          corruptCount += 1;
          if (typeof row?.id === "string" && row.id.trim() !== "") {
            corruptSongs.push({
              id: row.id,
              title: typeof row.title === "string" && row.title.trim() !== "" ? row.title : null,
              updatedAt: typeof row.updatedAt === "string" && Number.isFinite(Date.parse(row.updatedAt)) ? row.updatedAt : null,
              corrupt: true
            });
          }
        }
      }
      songs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
      if (corruptCount > 0) {
        return { ok: false, status: "corrupt", error: "corrupt", songs, corruptSongs, corruptCount };
      }
      return { ok: true, status: "ok", songs };
    } catch (error) {
      return errorResult(error, { songs: [] });
    }
  }

  async function saveBrowserSong(songInput) {
    let project;
    let song;
    try {
      project = serializeProject(songInput);
      song = deserializeProject(project);
    } catch {
      return errorResult(new BrowserLibraryError("invalid-song"));
    }

    try {
      const database = await getDatabase();
      const record = await runTransaction(database, "readwrite", (store, result) => {
        const existingRequest = store.get(song.id);
        existingRequest.onerror = () => result.abort(existingRequest.error);
        existingRequest.onsuccess = () => {
          try {
            const existing = existingRequest.result;
            let createdAt;
            let updatedMilliseconds;
            const currentMilliseconds = readTime(now);
            if (existing === undefined) {
              createdAt = isoTime(currentMilliseconds);
              updatedMilliseconds = currentMilliseconds;
            } else {
              const parsedExisting = readStoredRecord(existing);
              createdAt = parsedExisting.createdAt;
              updatedMilliseconds = Math.max(currentMilliseconds, Date.parse(parsedExisting.updatedAt) + 1);
            }
            const nextRecord = {
              id: song.id,
              title: song.title,
              createdAt,
              updatedAt: isoTime(updatedMilliseconds),
              project
            };
            const putRequest = store.put(nextRecord);
            putRequest.onerror = () => result.abort(putRequest.error);
            putRequest.onsuccess = () => result.setValue(nextRecord);
          } catch (error) {
            result.abort(error);
          }
        };
      });
      return { ok: true, status: "saved", song: metadata(record) };
    } catch (error) {
      return errorResult(error);
    }
  }

  async function openBrowserSong(id) {
    if (typeof id !== "string" || id.trim() === "") return errorResult(new BrowserLibraryError("invalid-id"));
    try {
      const database = await getDatabase();
      const raw = await runTransaction(database, "readonly", (store, result) => {
        const request = store.get(id);
        request.onsuccess = () => result.setValue(request.result);
        request.onerror = () => result.abort(request.error);
      });
      if (raw === undefined) return { ok: false, status: "not-found", error: "not-found" };
      const record = readStoredRecord(raw);
      return { ok: true, status: "opened", song: record.song, record: metadata(record) };
    } catch (error) {
      return errorResult(error);
    }
  }

  async function deleteBrowserSong(id) {
    if (typeof id !== "string" || id.trim() === "") return errorResult(new BrowserLibraryError("invalid-id"));
    try {
      const database = await getDatabase();
      const deleted = await runTransaction(database, "readwrite", (store, result) => {
        const request = store.get(id);
        request.onerror = () => result.abort(request.error);
        request.onsuccess = () => {
          if (request.result === undefined) {
            result.setValue(false);
            return;
          }
          try {
            const deleteRequest = store.delete(id);
            deleteRequest.onerror = () => result.abort(deleteRequest.error);
            deleteRequest.onsuccess = () => result.setValue(true);
          } catch (error) {
            result.abort(error);
          }
        };
      });
      return { ok: true, status: "deleted", deleted };
    } catch (error) {
      return errorResult(error);
    }
  }

  return Object.freeze({ listBrowserSongs, saveBrowserSong, openBrowserSong, deleteBrowserSong });
}
