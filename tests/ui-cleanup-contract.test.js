import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCommands } from "../src/core/commands.js";
import { createBlankSong } from "../src/core/model.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const legacyModes = ["score", "piano-roll", "combined", "lyrics", "guitar", "drums"];

test("studio shell has unique IDs and one source for tempo, key, meter, and loop", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  assert.deepEqual(duplicates, []);

  const songStrip = html.match(/<section class="song-strip"[\s\S]*?<\/section>/)?.[0];
  assert.ok(songStrip, "song strip remains the read-only song identity row");
  assert.match(songStrip, /id="song-title"/);
  assert.match(songStrip, /id="key-value"/);
  assert.match(songStrip, /id="time-signature-value"/);
  assert.doesNotMatch(songStrip, /tempo-value/);
  assert.equal((songStrip.match(/data-entity="time-signature"/g) ?? []).length, 1);

  assert.equal((html.match(/id="tempo-input"/g) ?? []).length, 1);
  assert.match(html, /id="tempo-input"[^>]*data-action="set-tempo-direct"/);
  assert.match(html, /<form class="transport-form tempo-control" data-action="set-tempo">[\s\S]*?id="tempo-input"/);
  assert.doesNotMatch(html, /id="tempo-value"/);
  assert.doesNotMatch(html, /<button[^>]*class="visually-hidden"[^>]*data-action="set-tempo"/);
  assert.equal((html.match(/data-action="set-loop-enabled"/g) ?? []).length, 1);
});

test("view tabs replace the duplicate select and retain the old hooks", () => {
  assert.doesNotMatch(html, /<select\b[^>]*id="view-mode"/);
  assert.match(html, /<nav\b[^>]*id="studio-views"[^>]*data-entity="workspace-view"/);

  const nav = html.match(/<nav\b[^>]*id="studio-views"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, "the main workspace navigation remains present");
  const workspaceModes = [...nav.matchAll(/data-studio-view="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(workspaceModes, ["piano-roll", "score", "drums"]);
  assert.doesNotMatch(nav, /data-studio-view="guitar"/);

  const tabModes = [...html.matchAll(/data-studio-view="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(tabModes)].sort(), [...legacyModes].sort());
  assert.equal((html.match(/data-action="set-view-mode"/g) ?? []).length, legacyModes.length - 1);
  assert.match(html, /id="guitar-mode-toggle"[^>]*data-studio-view="guitar"/);
  assert.match(html, /data-studio-view="piano-roll"[^>]*data-focus-key="view-piano-roll"/);
  assert.match(app, /target\.dataset\.action === "set-view-mode"[\s\S]*?target\.dataset\.studioView/);
  assert.match(app, /focusFallback: "view-piano-roll"/);

  const commands = createCommands(createBlankSong(() => "ui-cleanup-contract"));
  for (const mode of legacyModes) {
    assert.equal(commands.setViewMode(mode), mode);
    assert.equal(commands.getState().view.mode, mode);
  }
});

test("duplicate key and meter readouts are removed while machine state hooks remain", () => {
  for (const id of ["editor-meter", "score-context-key", "score-context-meter"]) {
    assert.doesNotMatch(html, new RegExp(`\\bid="${id}"`));
  }
  assert.match(html, /class="machine-detail" hidden>[\s\S]*?id="current-tick" data-entity="current-tick"/);
  assert.match(app, /current-section"\)\.textContent = section\?\.name \?\?/);
  assert.match(app, /current-section"\)\.dataset\.entityId = section\?\.id/);
  assert.match(app, /const complete = followControl\s*&&/);
});
