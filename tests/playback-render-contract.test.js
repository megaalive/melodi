import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const roll = readFileSync(new URL("../src/ui/piano-roll.js", import.meta.url), "utf8");
const commands = readFileSync(new URL("../src/core/commands.js", import.meta.url), "utf8");
const perf = readFileSync(new URL("../src/ui/perf.js", import.meta.url), "utf8");

// P3: tick audio tidak boleh menjalankan kerja DOM. several test below
// deliberately assert pada bentuk source, bukan pada perilaku, supaya
// regresi ini terlihat lebih cepat daripada probe performa.
test("the audio tick only marks a render, it never renders on the timer", () => {
  assert.match(commands, /onPosition\(tick\) \{[\s\S]*?setPlaybackPosition\(tick\);[\s\S]*?if \(onPlaybackTick\) onPlaybackTick\(\);[\s\S]*?else notifyPlaybackChange\(\);/,
    "onPosition memakai onPlaybackTick, bukan render langsung");
  assert.match(app, /onPlaybackTick: schedulePlaybackRender/,
    "app mengaitkan onPlaybackTick ke penjadwal frame");
  assert.match(app, /function schedulePlaybackRender\(\) \{[\s\S]*?requestAnimationFrame\(/,
    "render playback dijadwalkan lewat requestAnimationFrame");
  assert.match(app, /if \(playbackRenderHandle\) return;/,
    "paling banyak satu render per frame");
  assert.match(app, /if \(tick === lastRenderedTick && status === lastRenderedStatus\) return;/,
    "render dilewati kalau tick dan status tidak berubah");
});

test("playback renders never call the agent snapshot on the tick path", () => {
  const body = app.slice(app.indexOf("function renderPlaybackNow"), app.indexOf("function render()"));
  assert.doesNotMatch(body, /normalizeRuntimeState\(commands\.getState\(\)\)\s*;\s*\n\s*const playback/,
    "renderPlayback tidak boleh memulai dari agent snapshot");
  assert.match(body, /commands\.getPlaybackView\(\)/, "render playback memakai proyeksi ringan");
  assert.match(body, /commands\.peekSong\(\)/, "render playback membaca song lewat peekSong");
  assert.match(body, /uiPreferences\.guitarLayout === "fretboard"[\s\S]*?normalizeRuntimeState\(commands\.getState\(\)\)/,
    "snapshot penuh hanya diambil di cabang fretboard");
});

test("playback DOM writes are diffed instead of unconditional", () => {
  assert.match(app, /function writeText\(element, value\)/);
  assert.match(app, /function writeAttribute\(element, name, value\)/);
  assert.match(app, /function writeHidden\(element, hidden\)/);
  assert.match(app, /function writeProperty\(element, name, value\)/);
  assert.match(app, /if \(syllableKey !== lastSyllableKey\)/, "langkah suku kata hanya saat id berubah");
  assert.match(roll, /function indexPlaybackGroups\(\)/, "index nota/chord dibangun saat render");
  const updatePlaybackBody = roll.slice(roll.indexOf("function updatePlayback(playback"), roll.indexOf("function indexPlaybackGroups"));
  assert.doesNotMatch(updatePlaybackBody, /querySelectorAll\('\[data-entity="note"\]'\)/,
    "updatePlayback tidak lagi menyisir semua nota");
  assert.match(updatePlaybackBody, /applyCurrentNote\(playback\.currentNoteId\)/,
    "updatePlayback melepas hanya nota yang berubah");
});

test("the perf probe stays inert unless it is asked for", () => {
  assert.match(perf, /searchParams\.get\("perf"\) === "1"/, "probe hanya aktif dengan ?perf=1");
  assert.match(perf, /localStorage\?\.getItem\("melodiPerf"\) === "1"/, "atau lewat localStorage");
  assert.match(app, /const perfProbe = perfEnabled\(\)/, "app memasang probe hanya saat diminta");
});