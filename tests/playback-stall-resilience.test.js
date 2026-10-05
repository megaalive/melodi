import test from "node:test";
import assert from "node:assert/strict";
import { PPQ, createSong } from "../src/core/model.js";
import { ticksToSeconds } from "../src/audio/transport.js";
import { createAudioPlayer, schedulerLookAheadSeconds } from "../src/audio/player.js";

const TEMPO = 120;

// Context audio palsu: jamnya dikendalikan tes, jadi stall main thread bisa
// disimulasikan tanpa browser dan tanpa perangkat audio.
function fakeAudioContext() {
  return {
    state: "running",
    currentTime: 0,
    destination: {},
    oscillators: [],
    listeners: new Map(),
    addEventListener(name, callback) { this.listeners.set(name, callback); },
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelAndHoldAtTime() {} }, connect() {}, disconnect() {} }; },
    createStereoPanner() { return { pan: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; },
    createBiquadFilter() { return { frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, Q: { value: 0 }, type: "bandpass", connect() {}, disconnect() {} }; },
    createOscillator() {
      const oscillator = {
        frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        detune: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
        listeners: {},
        addEventListener(name, callback) { this.listeners[name] = callback; },
        connect() {},
        disconnect() {},
        start(time) { this.startTime = time; },
        stop(time) { this.stopTime = time; }
      };
      this.oscillators.push(oscillator);
      return oscillator;
    },
    createBufferSource() {
      return {
        listeners: {},
        addEventListener(name, callback) { this.listeners[name] = callback; },
        connect() {},
        disconnect() {},
        start(time) { this.startTime = time; },
        stop(time) { this.stopTime = time; }
      };
    },
    createBuffer(channelCount, length, sampleRate) {
      return { length, sampleRate, getChannelData: () => new Float32Array(channelCount * length) };
    }
  };
}

// Lagu uji: satu nada tiap detik, cukup panjang untuk beberapa stall berurutan.
function stallSong(noteCount = 12) {
  const notes = Array.from({ length: noteCount }, (_unused, index) => ({
    id: `note-${index}`,
    pitch: 60 + (index % 5),
    startTick: index * PPQ,
    durationTicks: PPQ - 24,
    source: "user",
    anchor: false,
    locked: false
  }));
  return createSong({
    id: "song-stall",
    title: "Uji stall",
    timing: { ppq: PPQ, tempo: TEMPO, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [{ id: "section-1", name: "Verse", phraseIds: ["phrase-1"] }],
    phrases: [{ id: "phrase-1", noteIds: notes.map(note => note.id) }],
    notes,
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
}

// Timer interval diganti supaya wake scheduler bisa dipicu manual. Ini yang
// membuat simulasi stall jadi deterministik.
function withManualScheduler(run) {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const handles = [];
  globalThis.setInterval = (callback) => {
    handles.push(callback);
    return handles.length;
  };
  globalThis.clearInterval = () => {};
  try {
    return run(() => {
      for (const wake of handles) wake();
    });
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
}

test("jendela jadwal mengikuti kemacetan wake dan dibatasi satu jendela penuh", () => {
  assert.equal(schedulerLookAheadSeconds(0), 0.5);
  assert.equal(schedulerLookAheadSeconds(0.4), 0.9);
  assert.equal(schedulerLookAheadSeconds(0.05), 0.55);
  // Stall panjang tidak boleh menjadwalkan seluruh lagu sekaligus.
  assert.equal(schedulerLookAheadSeconds(30), 1);
  // Nilai rusak tidak boleh memperpendek atau memperpanjang jendela.
  assert.equal(schedulerLookAheadSeconds(-5), 0.5);
  assert.equal(schedulerLookAheadSeconds(Number.NaN), 0.5);
});

test("stall main thread tidak membuat nada hilang dari jadwal audio", async () => {
  const song = stallSong(12);
  const context = fakeAudioContext();
  const player = createAudioPlayer({
    getSong: () => song,
    audioContextFactory: () => context,
    getMix: () => ({ channels: { melody: { volume: 1 } } })
  });

  await withManualScheduler(async tick => {
    await player.play(0, { tempo: TEMPO, loop: { enabled: false, startTick: 0, endTick: 12 * PPQ } });
    // Wake pertama lalu stall 0,4 detik: lebih besar dari jendela 0,2 detik
    // yang lama, jadi nada di dalam stall akan hilang kalau jendela kecil.
    tick();
    for (let step = 1; step <= 12; step += 1) {
      context.currentTime = step * 0.4;
      tick();
    }
    player.stop();

    const scheduled = context.oscillators
      .map(oscillator => oscillator.startTime)
      .filter(time => typeof time === "number");
    const expected = song.notes.map(note => ticksToSeconds(note.startTick, TEMPO));
    const missing = expected.filter(onset => !scheduled.some(start => Math.abs(start - onset) < 1e-6));
    assert.deepEqual(missing, [], "setiap nada harus tetap terjadwal meski wake terlambat");
    // Tidak ada nada yang dijadwalkan lewat masa lalu: itu bunyi yang meleset.
    assert.ok(scheduled.every(start => start >= -1e-9), "tidak ada nada yang dijadwalkan di masa lalu");
    assert.equal(scheduled.length, expected.length, "jumlah suara sama dengan jumlah nada");
  });
});
