import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { deserializeProject, serializeProject } from "../src/core/serialization.js";
import {
  BROWSER_LIBRARY_DATABASE,
  BROWSER_LIBRARY_STORE,
  BROWSER_LIBRARY_VERSION,
  createBrowserLibrary
} from "../src/storage/browser-library.js";

let nextId = 0;

function fixture(title = "Library song") {
  const song = createInitialSong(() => `library-${++nextId}`);
  song.title = title;
  return song;
}

class FakeTransaction {
  constructor(database, mode) {
    this.database = database;
    this.mode = mode;
    this.pending = 0;
    this.finished = false;
    this.error = null;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
  }

  objectStore(name) {
    if (name !== BROWSER_LIBRARY_STORE || !this.database.stores.has(name)) throw new Error("NotFoundError");
    return new FakeObjectStore(this, this.database.stores.get(name));
  }

  request(operation) {
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.pending += 1;
    setTimeout(() => {
      if (this.finished) return;
      try {
        request.result = operation();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
        this.error ??= error;
        this.onerror?.({ target: this });
      }
      this.pending -= 1;
      this.scheduleComplete();
    }, 0);
    return request;
  }

  scheduleComplete() {
    if (this.pending !== 0 || this.finished) return;
    setTimeout(() => {
      if (this.pending !== 0 || this.finished) return;
      this.finished = true;
      this.oncomplete?.({ target: this });
    }, 0);
  }

  abort(error = null) {
    if (this.finished) return;
    this.error ??= error;
    this.finished = true;
    setTimeout(() => this.onabort?.({ target: this }), 0);
  }
}

class FakeObjectStore {
  constructor(transaction, records) {
    this.transaction = transaction;
    this.records = records;
  }

  get(key) {
    return this.transaction.request(() => structuredClone(this.records.get(key)));
  }

  getAll() {
    return this.transaction.request(() => [...this.records.values()].map((record) => structuredClone(record)));
  }

  put(record) {
    return this.transaction.request(() => {
      if (this.transaction.mode !== "readwrite") throw new Error("ReadOnlyError");
      if (this.transaction.database.indexedDB.quota) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      this.records.set(record.id, structuredClone(record));
      return record.id;
    });
  }

  delete(key) {
    return this.transaction.request(() => {
      if (this.transaction.mode !== "readwrite") throw new Error("ReadOnlyError");
      this.records.delete(key);
      return undefined;
    });
  }
}

class FakeDatabase {
  constructor(indexedDB) {
    this.indexedDB = indexedDB;
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (name) => this.stores.has(name)
    };
    this.onversionchange = null;
    this.closed = false;
  }

  createObjectStore(name, { keyPath }) {
    assert.equal(keyPath, "id");
    const records = new Map();
    this.stores.set(name, records);
    return { name };
  }

  transaction(name, mode) {
    if (this.closed) throw new Error("InvalidStateError");
    if (name !== BROWSER_LIBRARY_STORE) throw new Error("NotFoundError");
    return new FakeTransaction(this, mode);
  }

  close() { this.closed = true; }
}

class FakeIndexedDB {
  constructor({ blocked = false, quota = false } = {}) {
    this.blocked = blocked;
    this.quota = quota;
    this.database = null;
    this.openArguments = null;
  }

  open(name, version) {
    this.openArguments = [name, version];
    const request = { result: null, error: null, onupgradeneeded: null, onblocked: null, onsuccess: null, onerror: null };
    setTimeout(() => {
      if (this.blocked) {
        request.onblocked?.({ target: request });
        return;
      }
      const isNew = this.database === null;
      this.database ??= new FakeDatabase(this);
      request.result = this.database;
      if (isNew) request.onupgradeneeded?.({ target: request });
      request.onsuccess?.({ target: request });
    }, 0);
    return request;
  }

  seed(record) {
    this.database ??= new FakeDatabase(this);
    if (!this.database.stores.has(BROWSER_LIBRARY_STORE)) this.database.createObjectStore(BROWSER_LIBRARY_STORE, { keyPath: "id" });
    this.database.stores.get(BROWSER_LIBRARY_STORE).set(record.id, structuredClone(record));
  }
}

function library(indexedDB, milliseconds = () => 1_000) {
  return createBrowserLibrary({ indexedDB, now: milliseconds });
}

test("save writes canonical project, stable ID, and createdAt-preserving increasing updates", async () => {
  const indexedDB = new FakeIndexedDB();
  let now = 1_000;
  const browserLibrary = library(indexedDB, () => now);
  const song = fixture("First title");

  const first = await browserLibrary.saveBrowserSong(song);
  assert.equal(first.ok, true);
  assert.equal(first.status, "saved");
  assert.deepEqual(indexedDB.openArguments, [BROWSER_LIBRARY_DATABASE, BROWSER_LIBRARY_VERSION]);
  const stored = indexedDB.database.stores.get(BROWSER_LIBRARY_STORE).get(song.id);
  assert.deepEqual(Object.keys(stored).sort(), ["createdAt", "id", "project", "title", "updatedAt"]);
  assert.equal(stored.title, song.title);
  assert.deepEqual(deserializeProject(stored.project), song);
  assert.equal(stored.project, serializeProject(song));
  assert.equal(stored.createdAt, new Date(1_000).toISOString());
  assert.equal(stored.updatedAt, stored.createdAt);

  now = 1_000;
  const changed = { ...song, title: "Renamed title" };
  const second = await browserLibrary.saveBrowserSong(changed);
  assert.equal(second.ok, true);
  assert.equal(second.song.id, song.id);
  const overwritten = indexedDB.database.stores.get(BROWSER_LIBRARY_STORE).get(song.id);
  assert.equal(overwritten.title, "Renamed title");
  assert.equal(overwritten.createdAt, stored.createdAt);
  assert.equal(Date.parse(overwritten.updatedAt), Date.parse(stored.updatedAt) + 1);
  assert.deepEqual(deserializeProject(overwritten.project), changed);
});

test("list sorts newest first, open returns a canonical song, and delete handles missing IDs", async () => {
  const indexedDB = new FakeIndexedDB();
  let now = 1_000;
  const browserLibrary = library(indexedDB, () => now);
  const older = fixture("Older");
  const newer = fixture("Newer");
  assert.equal((await browserLibrary.saveBrowserSong(older)).ok, true);
  now = 3_000;
  assert.equal((await browserLibrary.saveBrowserSong(newer)).ok, true);
  assert.deepEqual((await browserLibrary.listBrowserSongs()).songs.map(({ id }) => id), [newer.id, older.id]);

  const opened = await browserLibrary.openBrowserSong(newer.id);
  assert.equal(opened.status, "opened");
  assert.deepEqual(opened.song, newer);
  assert.equal(opened.record.title, "Newer");
  assert.deepEqual(await browserLibrary.deleteBrowserSong(newer.id), { ok: true, status: "deleted", deleted: true });
  assert.deepEqual(await browserLibrary.deleteBrowserSong(newer.id), { ok: true, status: "deleted", deleted: false });
  assert.deepEqual(await browserLibrary.openBrowserSong(newer.id), { ok: false, status: "not-found", error: "not-found" });
  assert.deepEqual((await browserLibrary.listBrowserSongs()).songs.map(({ id }) => id), [older.id]);
});

test("corrupt records are reported without hiding valid entries and can be deleted", async () => {
  const indexedDB = new FakeIndexedDB();
  const good = fixture("Good");
  indexedDB.seed({
    id: "corrupt-id",
    title: "Broken entry",
    createdAt: new Date(1_000).toISOString(),
    updatedAt: new Date(1_000).toISOString(),
    project: "{"
  });
  const browserLibrary = library(indexedDB);
  assert.equal((await browserLibrary.saveBrowserSong(good)).ok, true);

  const listed = await browserLibrary.listBrowserSongs();
  assert.equal(listed.ok, false);
  assert.equal(listed.status, "corrupt");
  assert.equal(listed.corruptCount, 1);
  assert.deepEqual(listed.corruptSongs, [{
    id: "corrupt-id",
    title: "Broken entry",
    updatedAt: new Date(1_000).toISOString(),
    corrupt: true
  }]);
  assert.deepEqual(listed.songs.map(({ id }) => id), [good.id]);
  assert.deepEqual(await browserLibrary.openBrowserSong("corrupt-id"), { ok: false, status: "corrupt", error: "corrupt" });
  assert.deepEqual(await browserLibrary.deleteBrowserSong("corrupt-id"), { ok: true, status: "deleted", deleted: true });
  const remaining = await browserLibrary.listBrowserSongs();
  assert.equal(remaining.ok, true);
  assert.equal(remaining.status, "ok");
  assert.deepEqual(remaining.songs.map(({ id }) => id), [good.id]);
});

test("unavailable, blocked, and quota failures return explicit JSON-friendly status", async () => {
  const unavailable = createBrowserLibrary({ indexedDB: null });
  assert.deepEqual(await unavailable.listBrowserSongs(), { ok: false, status: "unavailable", error: "unavailable", songs: [] });

  const blocked = library(new FakeIndexedDB({ blocked: true }));
  assert.deepEqual(await blocked.openBrowserSong("song-id"), { ok: false, status: "blocked", error: "blocked" });

  const quotaIndexedDB = new FakeIndexedDB({ quota: true });
  const quota = library(quotaIndexedDB);
  assert.deepEqual(await quota.saveBrowserSong(fixture()), { ok: false, status: "quota", error: "quota" });
  assert.equal(quotaIndexedDB.database.stores.get(BROWSER_LIBRARY_STORE).size, 0);
});

test("invalid IDs and noncanonical song input return safe validation statuses", async () => {
  const browserLibrary = library(new FakeIndexedDB());
  assert.deepEqual(await browserLibrary.openBrowserSong(" "), { ok: false, status: "invalid-id", error: "invalid-id" });
  assert.deepEqual(await browserLibrary.deleteBrowserSong(" "), { ok: false, status: "invalid-id", error: "invalid-id" });
  assert.deepEqual(await browserLibrary.saveBrowserSong({ id: "missing-title" }), { ok: false, status: "invalid-song", error: "invalid-song" });
});

test("browser library preserves canonical channel volumes without runtime mute or solo state", async () => {
  const indexedDB = new FakeIndexedDB();
  const browserLibrary = library(indexedDB);
  const song = fixture("Balanced kit");
  song.tracks = [{ id: "library-kit", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [] }];
  song.mix = { melody: 0.75, percussion: { "library-kit": { kick: 0, ride: 0.46 } } };
  assert.equal((await browserLibrary.saveBrowserSong(song)).ok, true);
  const opened = await browserLibrary.openBrowserSong(song.id);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.song.mix, { melody: 0.75, percussion: { "library-kit": { kick: 0, ride: 0.46 } } });
  const envelope = JSON.parse(indexedDB.database.stores.get(BROWSER_LIBRARY_STORE).get(song.id).project);
  assert.equal(envelope.schemaVersion, 3);
  assert.deepEqual(Object.keys(envelope.song.mix).sort(), ["melody", "percussion"]);
  assert.deepEqual(Object.keys(envelope.song.mix.percussion["library-kit"]).sort(), ["kick", "ride"]);
  assert.equal(Object.hasOwn(envelope.song, "playback"), false);
});
