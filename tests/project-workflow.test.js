import test from "node:test";
import assert from "node:assert/strict";
import { createCommands } from "../src/core/commands.js";
import { createBlankSong, createInitialSong } from "../src/core/model.js";

test("browser save updates the canonical title and uses the same Song ID", async () => {
  let savedSong = null;
  let nextId = 0;
  const initial = createInitialSong(() => `starter-${++nextId}`);
  const commands = createCommands(initial, {
    browserLibrary: {
      async saveBrowserSong(song) {
        savedSong = song;
        return { ok: true, status: "saved", song: { id: song.id, title: song.title } };
      }
    }
  });

  const result = await commands.saveBrowserSong("  Swing draft  ");

  assert.equal(result.ok, true);
  assert.equal(commands.getSong().title, "Swing draft");
  assert.equal(savedSong.id, initial.id);
  assert.equal(savedSong.title, commands.getSong().title);
  assert.equal(commands.getState().history.undoDepth, 1);
});

test("opening a Browser song loads canonical data and resets editor runtime", async () => {
  let nextId = 0;
  const initial = createInitialSong(() => `starter-${++nextId}`);
  const stored = createBlankSong(() => "browser-song-id", "Saved melody");
  const commands = createCommands(initial, {
    browserLibrary: {
      async openBrowserSong(id) {
        assert.equal(id, stored.id);
        return { ok: true, status: "opened", song: stored };
      }
    }
  });
  commands.selectNotes([initial.notes[0].id]);
  commands.setZoom(1.5);
  commands.setViewMode("drums");
  commands.setFollowMode(false);

  const result = await commands.openBrowserSong(stored.id);

  assert.equal(result.ok, true);
  assert.equal(commands.getSong().title, "Saved melody");
  assert.deepEqual(commands.getSelectedNoteIds(), []);
  assert.deepEqual(commands.getState().editor, { snap: "1/8", chordSnap: "bar", tool: "select", zoom: 1, canPaste: false, clipboardCount: 0 });
  assert.deepEqual(commands.getState().view, { mode: "piano-roll", follow: true });
  assert.equal(commands.canUndo(), false);
});

test("Browser library absence has explicit async status and does not change the project", async () => {
  const initial = createBlankSong(() => "blank-song-id");
  const commands = createCommands(initial);

  assert.deepEqual(await commands.listBrowserSongs(), {
    ok: false, status: "unavailable", error: "unavailable", songs: []
  });
  assert.deepEqual(await commands.saveBrowserSong("Saved"), {
    ok: false, status: "unavailable", error: "unavailable"
  });
  assert.equal(commands.getSong().id, initial.id);
});
