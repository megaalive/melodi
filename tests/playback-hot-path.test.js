import test from "node:test";
import assert from "node:assert/strict";
import { createCommands } from "../src/core/commands.js";
import { setCloneProbe, createSong } from "../src/core/model.js";
import { planNoteEvents, planPercussionEvents } from "../src/audio/transport.js";
import { planHarmonyEvents, planBassEvents } from "../src/harmony/sketch.js";
import { createAudioPlayer } from "../src/audio/player.js";

const PPQ = 480;

function fixture(barCount = 8, notesPerBar = 4) {
  const notes = [];
  for (let bar = 0; bar < barCount; bar += 1) {
    for (let index = 0; index < notesPerBar; index += 1) {
      notes.push({
        id: `note-${bar}-${index}`,
        pitch: 60 + ((bar + index) % 12),
        startTick: bar * 4 * PPQ + Math.floor((index * 4 * PPQ) / notesPerBar),
        durationTicks: Math.floor((4 * PPQ) / notesPerBar) - 24,
        source: "user",
        anchor: false,
        locked: false
      });
    }
  }
  const events = [];
  for (let bar = 0; bar < barCount; bar += 1) {
    for (let index = 0; index < 4; index += 1) {
      events.push({
        id: `hit-${bar}-${index}`,
        pieceId: index % 2 === 0 ? "kick" : "snare",
        startTick: bar * 4 * PPQ + index * PPQ,
        velocity: 90,
        articulation: "normal"
      });
    }
  }
  return {
    id: "song-perf",
    title: "Perf",
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    timing: { ppq: PPQ, tempo: 120, timeSignature: { numerator: 4, denominator: 4 } },
    mix: { melody: 1, percussion: { "track-perf": { kick: 1, snare: 1 } } },
    sketch: { harmony: { style: "block", volume: 1 }, bass: { style: "root", volume: 1 } },
    lyrics: { rawText: "", syllables: [] },
    sections: [{ id: "section-perf", name: "Verse", phraseIds: [] }],
    phrases: [],
    notes,
    chords: [
      { id: "chord-0", rootPitchClass: 0, quality: "major", startTick: 0, durationTicks: 8 * PPQ, locked: false }
    ],
    tracks: [{ id: "track-perf", kind: "percussion", role: "drums", kitId: "gm-standard", events }]
  };
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

function withCloneCounter(run) {
  let clones = 0;
  setCloneProbe(() => { clones += 1; });
  try {
    return run(() => clones);
  } finally {
    setCloneProbe(null);
  }
}

function fakePlayerFactory(ref) {
  return (callbacks) => {
    ref.callbacks = callbacks;
    ref.position = 0;
    ref.player = {
      async play(tick) { ref.position = tick; return true; },
      pause() { return ref.position; },
      stop() { ref.position = 0; return 0; },
      getPosition() { return ref.position; },
      seek(tick) { ref.position = tick; },
      updateTempo(_tempo, tick) { ref.position = tick; },
      updateLoop(_loop, tick) { ref.position = tick; },
      songChanged(_tick) {},
      mixChanged(_tick) {},
      async playPreview() { return true; },
      cancelPreview() { return true; }
    };
    return ref.player;
  };
}

test("playing never clones the song for the scheduler", async () => {
  const ref = {};
  await withCloneCounter(async readClones => {
    const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });
    await commands.play();
    // onPosition adalah satu-satunya callback per tick; di sinilah clone
    // akan terlihat kalau masih ada.
    for (let tick = 0; tick <= 40 * PPQ; tick += 240) {
      ref.position = tick;
      ref.callbacks.onPosition(tick);
    }
    const clonesDuringTicks = readClones();
    assert.equal(clonesDuringTicks, 0,
      `cloneData dipanggil ${clonesDuringTicks} kali selama tick playback`);
  });
});

test("the player reads the canonical song by reference and never mutates it", () => {
  const ref = {};
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });
  const song = ref.callbacks.getSong();
  assert.equal(song, commands.peekSong(), "player menerima referensi, bukan salinan");
  assert.equal(JSON.stringify(song), JSON.stringify(commands.getSong()),
    "isi referensi sama dengan salinan yang diberikan getSong()");

  const before = JSON.stringify(song);
  const options = {
    audioNow: 0,
    anchorAudioTime: 0,
    anchorTick: 0,
    tempo: 120,
    lookAheadSeconds: 0.12,
    loop: { enabled: false, startTick: 0, endTick: 8 * 4 * PPQ },
    scheduledKeys: new Set()
  };
  deepFreeze(song);
  planNoteEvents(song, options);
  planPercussionEvents(song, options);
  planHarmonyEvents(song, options);
  planBassEvents(song, options);
  assert.equal(JSON.stringify(song), before, "planner tidak memutasi song beku");
});

test("the audio player schedules from a frozen song reference", async () => {
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(() => {}) });
  const song = deepFreeze(commands.peekSong());
  const mix = deepFreeze(commands.peekMix());
  let scheduled = 0;
  const context = {
    state: "running",
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} }),
    createOscillator: () => ({ frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, detune: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {}, addEventListener() {} }),
    createBufferSource: () => ({ buffer: null, connect() {}, disconnect() {}, start() {}, stop() {}, addEventListener() {} }),
    createBiquadFilter: () => ({ frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, Q: { value: 0, setValueAtTime() {} }, connect() {}, disconnect() {} }),
    createStereoPanner: () => ({ pan: { value: 0, setValueAtTime() {} }, connect() {}, disconnect() {} }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(1024) }),
    addEventListener() {}
  };
  const player = createAudioPlayer({
    getSong: () => song,
    getMix: () => mix,
    audioContextFactory: () => context
  });
  const started = await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 8 * 4 * PPQ } });
  assert.equal(started, true, "player mulai dengan song beku");
  scheduled = player.getDebugState().scheduled;
  assert.ok(scheduled > 0, "ada event yang terjadwal dari referensi beku");
  player.pause();
});

test("undo history stays inside its snapshot budget", () => {
  const ref = {};
  const commands = createCommands(fixture(4, 2), { audioPlayerFactory: fakePlayerFactory(ref) });
  for (let index = 0; index < 12; index += 1) {
    commands.addNote({ pitch: 60 + index, startTick: index * 240, durationTicks: 240 });
  }
  const history = commands.getHistoryState();
  assert.ok(history.undoDepth > 0, "undo mencatat langkah");
  assert.ok(history.undoDepth <= 100, `undoDepth ${history.undoDepth} tidak melewati HISTORY_LIMIT`);
  assert.equal(typeof commands.peekSong().notes.length, "number", "peekSong memberi song yang bisa dibaca");
});

test("createSong still validates a song built from a reference", () => {
  const song = createSong(fixture(2, 2));
  assert.equal(song.notes.length, 4);
  assert.equal(song.tracks[0].events.length, 8);
});