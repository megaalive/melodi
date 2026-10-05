import test from "node:test";
import assert from "node:assert/strict";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { createIdeasView } from "../src/ui/ideas-view.js";
import {
  LATENCY_MAX_MS,
  LATENCY_STEP_MS,
  latencySeconds,
  normalizeRecordingPreferences,
  readRecordingPreferences,
  stepLatency,
  writeRecordingPreferences
} from "../src/storage/recording-preferences.js";

// D3: rekam tangkap ide memakai context palsu supaya jam dan latensi bisa
// dikendalikan. Root DOM sengaja dibuat kosong: view ini hanya perlu
// addEventListener untuk merekam, sehingga tesnya murni aritmetika waktu.
function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value)
  };
}

function fakeContext({ outputLatency = 0, baseLatency = undefined, resumeDelayMs = 0 } = {}) {
  let clock = 10;
  let audioState = resumeDelayMs > 0 ? "suspended" : "running";
  const clicks = [];
  const voices = [];
  const previews = [];
  const primes = [];
  return {
    clicks,
    voices,
    previews,
    primes,
    audioState() { return audioState; },
    advance(seconds) { clock += seconds; },
    setClock(seconds) { clock = seconds; },
    player: {
      now: () => clock,
      outputLatency: () => outputLatency,
      contextState: () => audioState,
      // Context resume butuh beberapa milidetik, sama seperti browser sungguhan.
      prime: async () => {
        primes.push(clock);
        if (audioState === "running") return true;
        if (resumeDelayMs > 0) await new Promise(resolve => setTimeout(resolve, resumeDelayMs));
        audioState = "running";
        return true;
      },
      click: (atTime, accent) => {
        if (audioState !== "running") return false;
        clicks.push({ atTime, accent });
        return true;
      },
      noteOn: pitch => { voices.push({ pitch, at: clock, on: true }); return true; },
      noteOff: pitch => { voices.push({ pitch, at: clock, on: false }); return true; },
      noteOffAll: () => {},
      cancelPreview: () => true,
      playPreview: (notes, options) => { previews.push({ notes, options }); return true; }
    }
  };
}

function makeView(context, storage = memoryStorage()) {
  const song = createSong({
    id: "song-latency",
    title: "Ide",
    timing: { ppq: PPQ, tempo: 120, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [{ id: "section-1", name: "Verse", phraseIds: ["phrase-1"] }],
    phrases: [{ id: "phrase-1", noteIds: [] }],
    notes: [],
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
  const commands = createCommands(song);
  const root = { addEventListener() {} };
  const view = createIdeasView({
    root,
    commands,
    translate: (key, values) => key,
    getPlayer: () => context.player,
    storage
  });
  view.setCountIn(false);
  view.setSnap("1/16");
  return { view, storage };
}

const secondsPerTick = 60 / (PPQ * 120);

test("kompensasi memakai outputLatency dan tetap memakai jam audio sebagai acuan", () => {
  assert.equal(latencySeconds({ latencyMs: null }, 0.25), 0.25);
  assert.equal(latencySeconds({ latencyMs: null }, 0.9), 0.25, "laporan context dijepit 0,25 detik");
  assert.equal(latencySeconds({ latencyMs: null }, -1), 0);
  assert.equal(latencySeconds({ latencyMs: null }, Number.NaN), 0);
  assert.equal(latencySeconds({ latencyMs: null }, undefined), 0);
  assert.equal(latencySeconds({ latencyMs: 40 }, 0.25), 0.04, "nilai manual selalu menang");
  assert.equal(latencySeconds({}, 0.12), 0.12);
});

test("preferensi kompensasi dinormalisasi, dibaca, dan ditulis tanpa melempar", () => {
  assert.deepEqual(normalizeRecordingPreferences(), { latencyMs: null });
  assert.deepEqual(normalizeRecordingPreferences({ latencyMs: 40.6 }), { latencyMs: 41 });
  assert.deepEqual(normalizeRecordingPreferences({ latencyMs: -20 }), { latencyMs: 0 });
  assert.deepEqual(normalizeRecordingPreferences({ latencyMs: 9999 }), { latencyMs: LATENCY_MAX_MS });
  assert.deepEqual(normalizeRecordingPreferences({ latencyMs: "abc" }), { latencyMs: null });
  assert.deepEqual(normalizeRecordingPreferences(null), { latencyMs: null });
  const storage = memoryStorage();
  assert.deepEqual(readRecordingPreferences(storage), { latencyMs: null });
  writeRecordingPreferences(storage, { latencyMs: 25 });
  assert.deepEqual(readRecordingPreferences(storage), { latencyMs: 25 });
  assert.deepEqual(stepLatency({ latencyMs: null }, LATENCY_STEP_MS), { latencyMs: 5 });
  assert.deepEqual(stepLatency({ latencyMs: 0 }, -LATENCY_STEP_MS), { latencyMs: 0 });
  const broken = { getItem() { throw new Error("ditolak"); }, setItem() { throw new Error("ditolak"); } };
  assert.deepEqual(readRecordingPreferences(broken), { latencyMs: null });
  assert.equal(writeRecordingPreferences(broken, { latencyMs: 10 }), false);
  assert.equal(writeRecordingPreferences(null, { latencyMs: 10 }), false);
});

test("nada yang ditekan tepat pada klik terekam pada tick 0 setelah kompensasi", async () => {
  const context = fakeContext({ outputLatency: 0.25 });
  const { view } = makeView(context);
  await view.startRecording();
  const startedAt = context.player.now();
  // Pengguna menekan tepat saat klik tick 0 terdengar, yaitu latency kemudian.
  context.advance(0.25);
  view.noteOn(60);
  context.advance(0.5);
  view.noteOff();
  const take = view.stopRecording();
  assert.ok(take, "take harus terbentuk");
  assert.equal(take.notes[0].startTick, 0, "kompensasi mengembalikan nada ke tick 0");
  assert.ok(take.notes[0].durationTicks > 0);
  assert.ok(Math.abs(take.notes[0].durationTicks - Math.round(0.5 / secondsPerTick)) <= 1,
    "durasi memakai selisih waktu yang sama, jadi tidak terpengaruh latensi");
});

test("tanpa kompensasi nada yang ditekan telat bergeser mundur hanya bila jeda tidak dipangkas", async () => {
  const context = fakeContext({ outputLatency: 0.25 });
  const { view, storage } = makeView(context);
  // Pengguna mematikan kompensasi otomatis dan mengaturnya ke 0 ms.
  view.adjustCompensation(-LATENCY_STEP_MS * 100);
  assert.deepEqual(readRecordingPreferences(storage), { latencyMs: 0 });
  view.setCountIn(true);
  await view.startRecording();
  context.advance(2 + 0.25);
  view.noteOn(60);
  context.advance(0.5);
  view.noteOff();
  const take = view.stopRecording();
  // Hitung masuk hidup: jeda dipangkas ke kelipatan birama, jadi selisih 0,25
  // detik dari baris masuk masih terlihat.
  assert.equal(take.notes[0].startTick, Math.round(0.25 / secondsPerTick));
});

test("tanpa kompensasi dan tanpa hitung masuk, jeda awal dipangkas ke tick 0", async () => {
  const context = fakeContext({ outputLatency: 0.25 });
  const { view, storage } = makeView(context);
  view.adjustCompensation(-LATENCY_STEP_MS * 100);
  await view.startRecording();
  context.advance(0.25);
  view.noteOn(60);
  context.advance(0.5);
  view.noteOff();
  const take = view.stopRecording();
  assert.equal(take.notes[0].startTick, 0, "jeda awal dipangkas, jadi latensi tidak terlihat sebagai tick kosong");
});

test("kompensasi manual mengikuti tombol -/+ dan tombol Otomatis", async () => {
  const context = fakeContext({ outputLatency: 0.25 });
  const { view, storage } = makeView(context);
  assert.equal(view.compensationSeconds(), 0.25);
  assert.equal(view.adjustCompensation(LATENCY_STEP_MS), 5);
  assert.equal(view.adjustCompensation(LATENCY_STEP_MS), 10);
  assert.equal(view.compensationSeconds(), 0.01);
  assert.deepEqual(readRecordingPreferences(storage), { latencyMs: 10 });
  view.adjustCompensation(-LATENCY_STEP_MS);
  assert.equal(view.compensationSeconds(), 0.005);
  assert.equal(view.resetCompensation(), null);
  assert.equal(view.compensationSeconds(), 0.25, "kembali ke laporan context");
  assert.deepEqual(readRecordingPreferences(storage), { latencyMs: null });
});

test("klik metronom tetap dijadwalkan dengan jam audio saat kompensasi aktif", async () => {
  const context = fakeContext({ outputLatency: 0.2 });
  const { view } = makeView(context);
  view.setCountIn(true);
  await view.startRecording();
  assert.equal(view.state.recording, "countin");
  const bar = PPQ * 4;
  assert.equal(context.clicks.length, bar / PPQ);
  const spacing = secondsPerTick * PPQ;
  for (let index = 1; index < context.clicks.length; index += 1) {
    assert.ok(Math.abs(context.clicks[index].atTime - context.clicks[index - 1].atTime - spacing) < 1e-9,
      "klik metronom tetap dihitung dari jam audio, bukan jam yang dikompensasi");
  }
  assert.deepEqual(context.clicks.map(click => click.accent), [true, false, false, false]);
  assert.equal(context.clicks.at(-1).atTime, context.clicks[0].atTime + bar * secondsPerTick - spacing);
  view.stopRecording();
  assert.equal(view.state.recording, false);
});

test("take tetap monofonik saat dua tuts ditekan bersamaan", async () => {
  const context = fakeContext({ outputLatency: 0 });
  const { view } = makeView(context);
  await view.startRecording();
  view.noteOn(60);
  context.advance(0.2);
  view.noteOn(64);
  assert.equal(view.state.multiNote, true, "tab Ide mencatat bahwa lebih dari satu tuts ditekan");
  context.advance(0.2);
  view.noteOff();
  const take = view.stopRecording();
  assert.equal(take.noteCount, 2, "dua nada berurutan, bukan dua nada bertumpuk");
  assert.deepEqual(take.notes.map(note => note.pitch), [60, 64]);
  assert.ok(take.notes[1].startTick >= take.notes[0].startTick + take.notes[0].durationTicks,
    "take monofonik tidak boleh menindih");
  await view.startRecording();
  assert.equal(view.state.multiNote, false, "catatan multi-nada dibersihkan saat rekaman berikutnya dimulai");
  view.stopRecording();
});

test("kompensasi dijepit 0 sampai 0,25 detik walau context melaporkan lebih besar", async () => {
  const context = fakeContext({ outputLatency: 1.4 });
  const { view } = makeView(context);
  assert.equal(view.compensationSeconds(), 0.25);
  await view.startRecording();
  context.advance(0.25);
  view.noteOn(67);
  context.advance(0.25);
  view.noteOff();
  const take = view.stopRecording();
  assert.equal(take.notes[0].startTick, 0);
});