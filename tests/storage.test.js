import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { serializeProject } from "../src/core/serialization.js";
import { createDraftPersistence, DRAFT_STORAGE_KEY } from "../src/storage/draft.js";

function fixture() {
  let next = 0;
  return createInitialSong(() => `storage-${++next}`);
}

function memoryStorage(seed = null) {
  const values = new Map(seed === null ? [] : [[DRAFT_STORAGE_KEY, seed]]);
  const writes = [];
  return {
    values,
    writes,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push([key, value]); values.set(key, value); }
  };
}

function fakeTimers() {
  const pending = new Map();
  let next = 0;
  return {
    pending,
    setTimer(callback) {
      const id = ++next;
      pending.set(id, callback);
      return id;
    },
    clearTimer(id) { pending.delete(id); },
    runNext() {
      const first = pending.entries().next().value;
      if (!first) return false;
      pending.delete(first[0]);
      first[1]();
      return true;
    }
  };
}

function draftStore(storage, timers, options = {}) {
  return createDraftPersistence({
    storage,
    delayMs: 300,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    ...options
  });
}

test("autosave debounces rapid canonical edits and skips identical serialized drafts", () => {
  const storage = memoryStorage();
  const timers = fakeTimers();
  const persistence = draftStore(storage, timers);
  const song = fixture();

  persistence.schedule(song);
  song.lyrics.rawText = "aku";
  persistence.schedule(song);
  song.lyrics.rawText = "aku bernyanyi";
  persistence.schedule(song);
  assert.equal(storage.writes.length, 0);
  assert.equal(timers.pending.size, 1);
  assert.equal(timers.runNext(), true);
  assert.equal(storage.writes.length, 1);
  assert.equal(JSON.parse(storage.writes[0][1]).song.lyrics.rawText, "aku bernyanyi");

  persistence.schedule(song);
  assert.equal(timers.pending.size, 0);
  assert.equal(persistence.flush(), false);
  assert.equal(storage.writes.length, 1);
});

test("valid saved draft restores through validation and does not trigger a restore save loop", () => {
  const song = fixture();
  song.lyrics.rawText = "draft lirik";
  song.lyrics.syllables = [{ id: "saved-syllable", text: "draft", noteIds: [song.notes[0].id, song.notes[1].id] }];
  const storage = memoryStorage(serializeProject(song));
  const timers = fakeTimers();
  const persistence = draftStore(storage, timers);

  const restored = persistence.load();
  assert.equal(restored.status, "restored");
  assert.deepEqual(restored.song, song);
  persistence.schedule(restored.song);
  assert.equal(timers.pending.size, 0);
  assert.equal(storage.writes.length, 0);
});

test("corrupt or unsupported drafts fail safely and storage errors do not escape", () => {
  const timers = fakeTimers();
  const corrupt = draftStore(memoryStorage("{"), timers);
  assert.deepEqual(corrupt.load(), { song: null, status: "invalid" });

  const unsupported = draftStore(memoryStorage(JSON.stringify({ schemaVersion: 99, song: fixture() })), timers);
  assert.deepEqual(unsupported.load(), { song: null, status: "invalid" });

  const blockedStorage = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("quota"); }
  };
  const statuses = [];
  const blocked = draftStore(blockedStorage, timers, { onStatus: (status) => statuses.push(status) });
  assert.deepEqual(blocked.load(), { song: null, status: "unavailable" });
  assert.equal(blocked.schedule(fixture()), true);
  assert.equal(blocked.flush(), false);
  assert.deepEqual(statuses, ["save-failed"]);
});

test("syntactically valid but semantically invalid v1 drafts fall back safely", () => {
  const song = fixture();
  song.lyrics.syllables = [{ id: "dangling-syllable", text: "la", noteIds: ["missing-note"] }];
  const semanticallyInvalid = JSON.stringify({ schemaVersion: 1, song });
  const persistence = draftStore(memoryStorage(semanticallyInvalid), fakeTimers());
  assert.deepEqual(persistence.load(), { song: null, status: "invalid" });
});

test("playback position notifications and selection do not schedule draft writes", async () => {
  const storage = memoryStorage();
  const timers = fakeTimers();
  const persistence = draftStore(storage, timers);
  let callbacks;
  let position = 0;
  let commands;
  commands = createCommands(fixture(), {
    onChange(change) {
      if (change.kind === "song") persistence.schedule(commands.getSong());
    },
    audioPlayerFactory(playerCallbacks) {
      callbacks = playerCallbacks;
      return {
        async play(tick) { position = tick; return true; },
        pause() { return position; },
        stop() { position = 0; },
        getPosition() { return position; },
        seek(tick) { position = tick; },
        updateTempo(_tempo, tick) { position = tick; },
        updateLoop(_loop, tick) { position = tick; },
        songChanged(tick) { position = tick; }
      };
    }
  });

  commands.selectNotes([commands.getSong().notes[0].id]);
  assert.equal(timers.pending.size, 0);
  commands.setLyrics("autosaved after debounce");
  assert.equal(timers.pending.size, 1);
  await commands.play();
  for (const tick of [1, 20, 120, 240, 480, 720]) {
    position = tick;
    callbacks.onPosition(tick);
  }
  assert.equal(timers.pending.size, 1);
  assert.equal(timers.runNext(), true);
  assert.equal(storage.writes.length, 1);
  assert.equal(timers.pending.size, 0);
  callbacks.onPosition(900);
  callbacks.onPosition(1000);
  assert.equal(storage.writes.length, 1);
  commands.stop();
});

test("autosave keeps the canonical project only and stores lyric ordering and note edits", () => {
  const storage = memoryStorage();
  const timers = fakeTimers();
  const persistence = draftStore(storage, timers);
  const song = fixture();
  song.notes[0].startTick = 120;
  song.lyrics.syllables = [
    { id: "second", text: "sing", noteIds: [song.notes[0].id] },
    { id: "first", text: "la", noteIds: [] }
  ];
  persistence.schedule(song);
  persistence.flush();
  const payload = JSON.parse(storage.values.get(DRAFT_STORAGE_KEY));
  assert.equal(Object.hasOwn(payload, "playback"), false);
  assert.deepEqual(payload.song.lyrics.syllables.map((item) => item.id), ["second", "first"]);
  assert.equal(payload.song.notes[0].startTick, 120);
});
