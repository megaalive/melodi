import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { createIdeasView } from "../src/ui/ideas-view.js";

// L2: rekaman harus terlihat jelas (jumlah nada, waktu, hitung masuk), bisa
// berhenti sendiri, dan jeda awal tidak ikut masuk ke take.
const SCALE = Object.freeze({ name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] });

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value)
  };
}

function makeHarness({ clock = 10, autoStop = true } = {}) {
  let now = clock;
  const clicks = [];
  const previews = [];
  const song = createSong({
    id: "song-recording",
    title: "Ide",
    timing: { ppq: PPQ, tempo: 120, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: SCALE,
    sections: [{ id: "section-1", name: "Verse", phraseIds: ["phrase-1"] }],
    phrases: [{ id: "phrase-1", noteIds: [] }],
    notes: [],
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
  const player = {
    now: () => now,
    outputLatency: () => 0,
    contextState: () => "running",
    prime: async () => true,
    click: (atTime, accent) => { clicks.push({ atTime, accent }); return true; },
    noteOn: () => true,
    noteOff: () => true,
    noteOffAll: () => {},
    cancelPreview: () => true,
    playPreview: (notes, options) => { previews.push({ notes, options }); return true; }
  };
  const root = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  const view = createIdeasView({
    root,
    commands: createCommands(song),
    translate: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key),
    getPlayer: () => player,
    storage: memoryStorage(),
    autoStopIdleMs: 40,
    autoStopBarFactor: 0.01
  });
  view.setCountIn(false);
  view.setSnap("1/16");
  view.setAutoStop(autoStop);
  return {
    view,
    previews,
    advance(seconds) { now += seconds; },
    get clock() { return now; }
  };
}

const secondsPerTick = 60 / (PPQ * 120);

test("jeda awal dipangkas: nada pertama 3 detik setelah Rekam berakhir di tick 0", async () => {
  const harness = makeHarness();
  await harness.view.startRecording();
  harness.advance(3);
  harness.view.noteOn(60);
  harness.advance(0.5);
  harness.view.noteOff();
  harness.advance(0.5);
  harness.view.noteOn(64);
  harness.advance(0.5);
  harness.view.noteOff();
  const take = harness.view.stopRecording();
  assert.ok(take, "take terbentuk");
  assert.equal(take.notes[0].startTick, 0, "nada pertama dipindah ke tick 0");
  assert.ok(take.notes[1].startTick > 0, "ritme relatif tetap");
  const gapBefore = 0.5 / secondsPerTick;
  const gapAfter = (take.notes[1].startTick - (take.notes[0].startTick + take.notes[0].durationTicks));
  assert.ok(Math.abs(gapBefore - gapAfter) <= 120, "selisih antar nada tidak berubah oleh pemangkasan, selisih satu grid 1/16");
});

test("hitung masuk hidup: jeda di bawah satu birama tidak digeser, di atas satu birama dipangkas ke baris", async () => {
  const bar = PPQ * 4;
  const shortGap = makeHarness();
  shortGap.view.setCountIn(true);
  await shortGap.view.startRecording();
  assert.equal(shortGap.view.state.recording, "countin");
  shortGap.advance(2 + 0.4);
  shortGap.view.noteOn(60);
  shortGap.advance(0.5);
  shortGap.view.noteOff();
  const insideBar = shortGap.view.stopRecording();
  assert.ok(insideBar);
  assert.ok(insideBar.notes[0].startTick > 0 && insideBar.notes[0].startTick < bar,
    `jeda ${insideBar.notes[0].startTick} tick tetap di dalam birama pertama`);

  const longGap = makeHarness();
  longGap.view.setCountIn(true);
  await longGap.view.startRecording();
  longGap.advance(2 + 3);
  longGap.view.noteOn(60);
  longGap.advance(0.5);
  longGap.view.noteOff();
  const trimmed = longGap.view.stopRecording();
  assert.ok(trimmed);
  const rawFirst = 3 / secondsPerTick;
  const expected = rawFirst - Math.floor(rawFirst / bar) * bar;
  assert.ok(Math.abs(trimmed.notes[0].startTick - expected) <= 120,
    `jeda ${trimmed.notes[0].startTick} tick harus sisa dari kelipatan birama ${bar}`);
});

test("berhenti otomatis menutup rekaman dan memutar take sekali", async () => {
  const harness = makeHarness();
  await harness.view.startRecording();
  harness.view.noteOn(60);
  harness.advance(0.25);
  harness.view.noteOff();
  await new Promise(resolve => setTimeout(resolve, AUTO_STOP_WAIT_MS));
  assert.equal(harness.view.state.recording, false, "rekaman berhenti sendiri");
  assert.equal(harness.view.state.takes.length, 1, "take tersimpan tepat sekali");
  assert.equal(harness.previews.length, 1, "take diputar sekali");
  harness.view.suspend();
});

test("batas birama menghentikan rekaman meski nada masih dimainkan", async () => {
  const harness = makeHarness();
  harness.view.setAutoStopBars(2);
  await harness.view.startRecording();
  harness.view.noteOn(60);
  await new Promise(resolve => setTimeout(resolve, AUTO_STOP_WAIT_MS));
  assert.equal(harness.view.state.recording, false, "dua birama cukup");
  assert.equal(harness.view.state.takes.length, 1);
  harness.view.suspend();
});

test("berhenti otomatis dimatikan membuat rekaman berjalan terus", async () => {
  const harness = makeHarness({ autoStop: false });
  await harness.view.startRecording();
  harness.view.noteOn(60);
  harness.advance(0.25);
  harness.view.noteOff();
  await new Promise(resolve => setTimeout(resolve, AUTO_STOP_WAIT_MS));
  assert.equal(harness.view.state.recording, true, "tanpa berhenti otomatis rekaman terus");
  assert.equal(harness.view.state.takes.length, 0);
  harness.view.stopRecording();
  harness.view.suspend();
});

test("rekaman tanpa nada tidak membuat kartu take", async () => {
  const harness = makeHarness();
  await harness.view.startRecording();
  const take = harness.view.stopRecording();
  assert.equal(take, null);
  assert.equal(harness.view.state.takes.length, 0);
});

test("teks spanduk merekam tersedia dalam bahasa Indonesia dan Inggris", () => {
  const messages = readFileSync(new URL("../src/i18n/messages.js", import.meta.url), "utf8");
  for (const [key, id, en] of [
    ["ideasCountInBanner", "Hitung masuk 1-2-3-4", "Count-in 1-2-3-4"],
    ["ideasAutoStopLabel", "Berhenti otomatis", "Stop automatically"],
    ["ideasAutoStopBarsLabel", "Batas birama", "Bar limit"],
    ["ideasAutoStopBarsFree", "Bebas", "Free"],
    ["ideasAudioReady", "Suara: siap", "Sound: ready"],
    ["ideasAudioTap", "Suara: ketuk untuk mengaktifkan", "Sound: tap to enable"]
  ]) {
    assert.match(messages, new RegExp(`${key}: "${id}"`), `${key} bahasa Indonesia`);
    assert.match(messages, new RegExp(`${key}: "${en}"`), `${key} bahasa Inggris`);
  }
  assert.match(messages, /ideasRecordingBanner: "Merekam - mainkan nada, lalu tekan Berhenti/);
  assert.match(messages, /ideasRecordingBanner: "Recording - play notes, then press Stop/);
});

const AUTO_STOP_WAIT_MS = 60;