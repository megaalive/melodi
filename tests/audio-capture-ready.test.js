import test from "node:test";
import assert from "node:assert/strict";
import { PPQ, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { createAudioPlayer } from "../src/audio/player.js";
import { createIdeasView } from "../src/ui/ideas-view.js";

// L1: audio tangkap ide harus siap sebelum nada pertama. Context yang baru
// dibuat di browser suspended beberapa milidetik, jadi test memakai context
// palsu yang butuh 15 ms sebelum running.
const SCALE = Object.freeze({ name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] });
const RESUME_MS = 15;

function song() {
  return createSong({
    id: "song-audio-ready",
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
}

/** Context palsu: suspended sampai 15 ms setelah resume() dipanggil. */
class SuspendedContext {
  constructor({ resumeMs = RESUME_MS } = {}) {
    this.resumeMs = resumeMs;
    this.state = "suspended";
    this.currentTime = 1;
    this.destination = {};
    this.listeners = new Map();
    this.oscillators = [];
    this.bufferSources = [];
    this.ended = [];
    this.resumeCalls = 0;
    this.pendingResume = [];
  }

  addEventListener(name, callback) { this.listeners.set(name, callback); }

  setState(state) {
    this.state = state;
    this.listeners.get("statechange")?.();
  }

  resume() {
    this.resumeCalls += 1;
    const done = new Promise(resolve => setTimeout(() => {
      this.currentTime += 0.015;
      this.setState("running");
      resolve();
    }, this.resumeMs));
    this.pendingResume.push(done);
    return done;
  }

  createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
  createOscillator() {
    const oscillator = {
      frequency: param(),
      listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      connect() {}, disconnect() {},
      start(time) { this.startTime = time; },
      stop(time) { this.stopTime = time; if (!this.stopped) { this.stopped = true; this.listeners.ended?.(); } }
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBuffer(length) { return { length, getChannelData: () => new Float32Array(length) }; }
  createBiquadFilter() { return { frequency: param(), Q: param(), connect() {}, disconnect() {} }; }
  createBufferSource() {
    const source = {
      listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      connect() {}, disconnect() {},
      start(time) { this.startTime = time; },
      stop() { this.listeners.ended?.(); }
    };
    this.bufferSources.push(source);
    return source;
  }

  liveVoices() {
    return this.oscillators.filter(oscillator => oscillator.startTime !== undefined && !oscillator.stopped).length;
  }
}

function param() {
  return {
    value: 0,
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { this.value = value; },
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {}
  };
}

function makePlayer(context) {
  return createAudioPlayer({ getSong: song, audioContextFactory: () => context });
}

function makeView(player, handlers = new Map()) {
  const root = {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    querySelector: () => null
  };
  const view = createIdeasView({
    root,
    commands: createCommands(song()),
    translate: key => key,
    getPlayer: () => player,
    storage: null
  });
  return { view, handlers };
}

test("prime() mengembalikan true hanya setelah context benar-benar berjalan", async () => {
  const context = new SuspendedContext();
  const player = makePlayer(context);
  assert.equal(player.contextState(), "unknown", "context belum ada sebelum prime");
  const started = await player.prime();
  assert.equal(started, true);
  assert.equal(player.contextState(), "running");
  assert.equal(context.resumeCalls, 1);
});

test("Rekam pertama: keempat klik hitung masuk terjadwal setelah resume", async () => {
  const context = new SuspendedContext();
  const player = makePlayer(context);
  const { view } = makeView(player);
  view.setCountIn(true);
  const started = await view.startRecording();
  assert.equal(started, true, "rekaman mulai setelah audio siap");
  const bar = PPQ * 4;
  assert.equal(context.bufferSources.length, bar / PPQ, "keempat klik terjadwal");
  assert.equal(view.state.recording, "countin");
  const spacing = 60 / (PPQ * 120) * PPQ;
  for (let index = 1; index < context.bufferSources.length; index += 1) {
    assert.ok(Math.abs(context.bufferSources[index].startTime - context.bufferSources[index - 1].startTime - spacing) < 1e-9,
      "klik dihitung dari jam audio yang sedang berjalan");
  }
  view.stopRecording();
});

test("noteOn pertama berbunyi setelah resume, bukan hilang, dan terlambat <= 50 ms", async () => {
  const context = new SuspendedContext();
  const player = makePlayer(context);
  const before = context.currentTime;
  const accepted = player.noteOn(60, 100);
  assert.equal(accepted, true, "nada diterima walau context belum running");
  assert.equal(player.pendingNoteCount(), 1, "nada ditahan sampai resume selesai");
  const resumed = await player.prime();
  assert.equal(resumed, true);
  assert.equal(player.pendingNoteCount(), 0, "nada sudah diputar");
  assert.equal(context.oscillators.length, 1, "ada satu osilator berbunyi");
  const delaySeconds = context.oscillators[0].startTime - before;
  assert.ok(delaySeconds <= 0.05, `nada terlambat ${(delaySeconds * 1000).toFixed(0)} ms, harus <= 50 ms`);
});

test("noteOff sebelum resume membatalkan nada tertunda tanpa meninggalkan node", async () => {
  const context = new SuspendedContext();
  const player = makePlayer(context);
  player.noteOn(62, 100);
  assert.equal(player.noteOff(62), true, "noteOff membatalkan nada tertunda");
  assert.equal(player.pendingNoteCount(), 0);
  await player.prime();
  assert.equal(context.oscillators.length, 0, "tidak ada node yang dibuat");
  assert.equal(player.monitorVoiceCount(), 0, "tidak ada suara bocor");
});

test("noteOn dan noteOff yang bergantian membersihkan node dengan rapi", async () => {
  const context = new SuspendedContext();
  const player = makePlayer(context);
  player.noteOn(64, 100);
  player.noteOff(64);
  player.noteOn(67, 100);
  await player.prime();
  player.noteOff(67);
  assert.equal(player.monitorVoiceCount(), 0, "semua suara dilepas");
  assert.equal(context.liveVoices(), 0, "tidak ada osilator yang menggantung");
});

test("prime() pada gerakan pertama di tab Ide lalu tuts langsung berbunyi", async () => {
  const context = new SuspendedContext();
  const player = makePlayer(context);
  const { view, handlers } = makeView(player);
  for (const type of ["pointerup", "click", "keydown"]) {
    assert.ok(handlers.has(type), `Ide memasang pengaktiv audio pada ${type}`);
  }
  for (const handler of handlers.get("pointerup")) handler({ target: { closest: () => null } });
  await new Promise(resolve => setTimeout(resolve, RESUME_MS + 5));
  assert.equal(player.contextState(), "running", "primer gerakan mengaktifkan context");
  assert.equal(view.audioReady(), true);
});