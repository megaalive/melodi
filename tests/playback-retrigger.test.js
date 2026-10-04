import test from "node:test";
import assert from "node:assert/strict";
import { createAudioPlayer } from "../src/audio/player.js";
import { createCommands } from "../src/core/commands.js";
import { createInstrumentMix } from "../src/audio/mix.js";

const PPQ = 480;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = {};
    this.oscillators = [];
  }

  createGain() {
    const self = this;
    return {
      gain: {
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        setTargetAtTime() {},
        cancelScheduledValues() {},
        cancelAndHoldAtTime() {}
      },
      connect() {},
      disconnect() {}
    };
  }

  createOscillator() {
    const context = this;
    const oscillator = {
      type: "sine",
      frequency: { value: 0, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime() {} },
      detune: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
      addEventListener(_type, listener) { this.endedListener = listener; },
      start(startTime = 0) {
        context.oscillators.push({ startTime, stopTime: 0, frequency: oscillator.frequency.value, type: oscillator.type });
      },
      stop(stopTime = 0) {
        const entry = context.oscillators.at(-1);
        if (entry) entry.stopTime = stopTime;
      }
    };
    return oscillator;
  }

  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      disconnect() {},
      addEventListener() {},
      start() {},
      stop() {}
    };
  }

  createBiquadFilter() {
    return {
      frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
      Q: { value: 0, setValueAtTime() {} },
      connect() {},
      disconnect() {}
    };
  }

  createStereoPanner() {
    return { pan: { value: 0, setValueAtTime() {} }, connect() {}, disconnect() {} };
  }

  createBuffer() {
    return { getChannelData: () => new Float32Array(64) };
  }

  addEventListener() {}
}

function retriggerSong({ notes, chords = [], withDrums = false }) {
  return {
    id: "song-retrigger",
    title: "Retrigger",
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    timing: { ppq: PPQ, tempo: 120, timeSignature: { numerator: 4, denominator: 4 } },
    mix: { melody: 1, percussion: withDrums ? { "track-drums": { kick: 1, snare: 1, "closed-hi-hat": 1 } } : {} },
    sketch: { harmony: { style: "block", volume: 1 }, bass: { style: "root", volume: 1 } },
    lyrics: { rawText: "", syllables: [] },
    sections: [{ id: "section-1", name: "Verse", phraseIds: [] }],
    phrases: [],
    notes: notes.map((note, index) => ({
      id: `note-${index}`,
      pitch: note.pitch,
      startTick: note.startTick,
      durationTicks: note.durationTicks,
      source: "user",
      anchor: false,
      locked: false
    })),
    chords: chords.map((chord, index) => ({
      id: `chord-${index}`,
      rootPitchClass: chord.rootPitchClass ?? 0,
      quality: chord.quality ?? "major",
      startTick: chord.startTick,
      durationTicks: chord.durationTicks,
      locked: false
    })),
    tracks: withDrums
      ? [{
        id: "track-drums",
        kind: "percussion",
        role: "drums",
        kitId: "gm-standard",
        events: [
          { id: "hit-kick-1", pieceId: "kick", startTick: 0, velocity: 100, articulation: "normal" },
          { id: "hit-kick-2", pieceId: "kick", startTick: 2 * PPQ, velocity: 100, articulation: "normal" },
          { id: "hit-snare", pieceId: "snare", startTick: PPQ, velocity: 100, articulation: "normal" }
        ]
      }]
      : []
  };
}

// Hitung berapa kali osilator dengan frekuensi nada tertentu dimulai.
function startsForPitch(context, pitch, { types = null } = {}) {
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  return context.oscillators.filter(entry =>
    Math.abs(entry.frequency - frequency) < 0.001
    && (!types || types.includes(entry.type))).length;
}

// Satu nada hanya boleh punya satu start per siklus loop. Jendela lookahead
// bisa menjadwalkan siklus berikutnya sebelum audiosnya terdengar, jadi yang
// dihitung adalah jumlah start per siklus, bukan jumlah osilator.
function maxStartsPerCycle(context, pitch, loopSeconds, types = null) {
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  const perCycle = new Map();
  for (const entry of context.oscillators) {
    if (Math.abs(entry.frequency - frequency) > 0.001) continue;
    if (types && !types.includes(entry.type)) continue;
    const cycle = Math.floor(entry.startTime / loopSeconds);
    perCycle.set(cycle, (perCycle.get(cycle) ?? 0) + 1);
  }
  return { cycles: perCycle.size, worst: Math.max(0, ...perCycle.values()) };
}

async function runWakeCycles(context, { seconds, step = 0.12 }) {
  const cycles = Math.max(1, Math.ceil(seconds / step));
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    context.currentTime += step;
    await sleep(38);
  }
}

function makePlayer(song) {
  const context = new FakeAudioContext();
  const commands = createCommands(song);
  const player = createAudioPlayer({
    getSong: () => commands.peekSong(),
    getMix: () => commands.peekMix(),
    audioContextFactory: () => context
  });
  return { context, commands, player };
}

for (const tempo of [60, 120, 240]) {
  for (const loop of [false, true]) {
    test(`a note sounds exactly once at ${tempo} BPM with loop ${loop ? "on" : "off"}`, async () => {
      const beat = (60 / tempo);
      const song = retriggerSong({
        // Satu nada 1 ketukan dan satu nada 2 ketukan, keduanya mulai di 0.
        notes: [
          { pitch: 84, startTick: 0, durationTicks: PPQ },
          { pitch: 91, startTick: 0, durationTicks: 2 * PPQ }
        ],
        chords: [{ startTick: 0, durationTicks: 4 * PPQ }],
        withDrums: true
      });
      const { context, player } = makePlayer(song);
      const loopRange = { enabled: loop, startTick: 0, endTick: 4 * PPQ };
      try {
        await player.play(0, { tempo, loop: loopRange });
        // Simulasikan playback selama dua kali panjang nada terpanjang.
        await runWakeCycles(context, { seconds: beat * 2 + 0.3 });
        const loopSeconds = (4 * PPQ) / (PPQ * tempo / 60);
        const short = loop
          ? maxStartsPerCycle(context, 84, loopSeconds)
          : { worst: startsForPitch(context, 84) };
        const long = loop
          ? maxStartsPerCycle(context, 91, loopSeconds)
          : { worst: startsForPitch(context, 91) };
        assert.equal(short.worst, 1, `nada 1 ketukan hanya boleh mulai sekali per siklus, mulai ${short.worst}x`);
        assert.equal(long.worst, 1, `nada 2 ketukan hanya boleh mulai sekali per siklus, mulai ${long.worst}x`);
        if (!loop) {
          const started = context.oscillators.filter(entry => entry.startTime <= 0.001).length;
          assert.ok(started > 0, "ada osilator yang mulai tepat di awal");
        }
      } finally {
        player.stop();
      }
    });
  }
}

test("looping replays each note once per cycle, never more", async () => {
  const tempo = 240;
  const barSeconds = (4 * PPQ) / (PPQ * tempo / 60);
  const song = retriggerSong({
    notes: [{ pitch: 84, startTick: 0, durationTicks: PPQ }],
    chords: [{ startTick: 0, durationTicks: 4 * PPQ }],
    withDrums: false
  });
  const { context, player } = makePlayer(song);
  try {
    await player.play(0, { tempo, loop: { enabled: true, startTick: 0, endTick: 4 * PPQ } });
    const cycles = 2;
    await runWakeCycles(context, { seconds: barSeconds * cycles + 0.2, step: 0.1 });
    const perCycle = maxStartsPerCycle(context, 84, barSeconds);
    assert.ok(perCycle.cycles >= cycles, `nada harus mulai di setiap siklus, dapat ${perCycle.cycles} siklus`);
    assert.equal(perCycle.worst, 1, `nada tidak boleh mulai lebih dari sekali per siklus, mulai ${perCycle.worst}x`);
  } finally {
    player.stop();
  }
});

test("block harmony and bass start once per chord, not nine times per bar", async () => {
  const tempo = 120;
  const song = retriggerSong({
    notes: [{ pitch: 84, startTick: 0, durationTicks: 4 * PPQ }],
    chords: [{ startTick: 0, durationTicks: 4 * PPQ }],
    withDrums: false
  });
  const { context, player } = makePlayer(song);
  const barSeconds = 2;
  try {
    await player.play(0, { tempo, loop: { enabled: false, startTick: 0, endTick: 4 * PPQ } });
    await runWakeCycles(context, { seconds: barSeconds, step: 0.12 });
    // Satu nada melodi, tiga nada harmoni blok, satu nada bass, masing-masing
    // satu osilator untuk bass dan dua untuk harmoni (sine + triangle).
    const melody = startsForPitch(context, 84);
    assert.equal(melody, 1, `nada melodi mulai sekali, dapat ${melody}`);
    const bass = startsForPitch(context, 36, { types: ["sine"] });
    assert.equal(bass, 1, `bass mulai sekali, dapat ${bass}`);
    assert.ok(context.oscillators.length <= 12,
      `jumlah osilator satu birama tetap wajar, dapat ${context.oscillators.length}`);
  } finally {
    player.stop();
  }
});

test("seeking mid-note rehydrates the note exactly once from the new position", async () => {
  const tempo = 120;
  const song = retriggerSong({
    notes: [{ pitch: 84, startTick: 0, durationTicks: 4 * PPQ }],
    chords: [],
    withDrums: false
  });
  const { context, player } = makePlayer(song);
  try {
    await player.play(0, { tempo, loop: { enabled: false, startTick: 0, endTick: 4 * PPQ } });
    await runWakeCycles(context, { seconds: 0.5, step: 0.12 });
    const beforeSeek = context.oscillators.length;
    player.seek(PPQ, { tempo, loop: { enabled: false, startTick: 0, endTick: 4 * PPQ }, playing: true });
    const afterSeek = context.oscillators.length - beforeSeek;
    assert.equal(afterSeek, 1, `rehidrasi setelah seek memulai ${afterSeek} osilator, harus tepat 1`);
    await runWakeCycles(context, { seconds: 0.5, step: 0.12 });
    const melody = startsForPitch(context, 84);
    assert.equal(melody, 2, `nada dimulai sekali di awal dan sekali setelah seek, dapat ${melody}`);
    const restarted = context.oscillators.filter(entry => entry.frequency === 440 * 2 ** ((84 - 69) / 12) && entry.startTime > 0.2);
    assert.equal(restarted.length, 1, "hanya ada satu oscillator yang dimulai ulang, dari posisi seek");
  } finally {
    player.stop();
  }
});