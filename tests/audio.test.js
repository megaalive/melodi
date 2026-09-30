import test from "node:test";
import assert from "node:assert/strict";
import { createSong, MelodiError, PPQ } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { createAudioPlayer, pitchBendAt } from "../src/audio/player.js";
import { percussionVoiceSpec } from "../src/audio/percussion.js";
import { createInstrumentMix, instrumentChannelIds, isInstrumentAudible, percussionChannelId } from "../src/audio/mix.js";
import {
  findCurrentNoteId,
  findCurrentSectionId,
  planNoteEvents,
  planPercussionEvents,
  projectPlaybackState,
  secondsToTickOffset,
  ticksToSeconds,
  validateTempo,
  wrapLoopTick
} from "../src/audio/transport.js";

function fixture() {
  return createSong({
    id: "entity-1",
    title: "Ide awal",
    timing: { ppq: PPQ, tempo: 120, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [{ id: "entity-2", name: "Verse", phraseIds: ["entity-3"] }],
    phrases: [{ id: "entity-3", noteIds: ["entity-4", "entity-5", "entity-6", "entity-7"] }],
    notes: [
      { id: "entity-4", pitch: 60, startTick: 0, durationTicks: 480, source: "user", anchor: false, locked: false },
      { id: "entity-5", pitch: 64, startTick: 480, durationTicks: 480, source: "user", anchor: false, locked: false },
      { id: "entity-6", pitch: 69, startTick: 960, durationTicks: 480, source: "user", anchor: false, locked: false },
      { id: "entity-7", pitch: 67, startTick: 1440, durationTicks: 480, source: "user", anchor: false, locked: false }
    ],
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
}

function fakePlayerFactory(ref) {
  return (callbacks) => {
    ref.callbacks = callbacks;
    ref.position = 0;
    ref.calls = [];
    ref.player = {
      async play(tick, options) {
        ref.calls.push(["play", tick, options]);
        ref.position = tick;
        return true;
      },
      pause() {
        ref.calls.push(["pause"]);
        return ref.position;
      },
      stop() {
        ref.calls.push(["stop"]);
        ref.position = 0;
      },
      getPosition() { return ref.position; },
      seek(tick, options) {
        ref.calls.push(["seek", tick, options]);
        ref.position = tick;
      },
      updateTempo(tempo, tick, playing) {
        ref.calls.push(["tempo", tempo, tick, playing]);
        ref.position = tick;
      },
      updateLoop(loop, tick, playing) {
        ref.calls.push(["loop", loop, tick, playing]);
        ref.position = tick;
      },
      mixChanged(tick, loop) {
        ref.calls.push(["mix", tick, loop]);
        ref.position = tick;
      },
      songChanged(tick, loop) { ref.calls.push(["song", tick, loop]); }
    };
    return ref.player;
  };
}

class FakeAudioParam {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.value = value; this.events.push(["set", value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(["ramp", value, time]); }
  cancelScheduledValues(time) { this.events.push(["cancel", time]); }
  cancelAndHoldAtTime(time) { this.events.push(["hold", time]); }
}

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  oscillators = [];
  gains = [];
  panners = [];
  filters = [];
  bufferSources = [];
  buffers = [];
  listeners = new Map();
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  setState(state) {
    this.state = state;
    this.listeners.get("statechange")?.();
  }
  createGain() {
    const gain = { gain: new FakeAudioParam(), connect() {}, disconnect() { this.disconnected = true; } };
    this.gains.push(gain);
    return gain;
  }
  createStereoPanner() {
    const panner = { pan: new FakeAudioParam(), connect() {}, disconnect() {} };
    this.panners.push(panner);
    return panner;
  }
  createOscillator() {
    const oscillator = {
      frequency: new FakeAudioParam(),
      detune: new FakeAudioParam(),
      listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      connect() {},
      disconnect() {},
      start(time) { this.startTime = time; },
      stop(time) { this.stopTime = time; }
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBuffer(channelCount, length, sampleRate) {
    const channels = Array.from({ length: channelCount }, () => new Float32Array(length));
    const buffer = { length, sampleRate, getChannelData: (channel) => channels[channel] };
    this.buffers.push(buffer);
    return buffer;
  }
  createBiquadFilter() {
    const filter = { frequency: new FakeAudioParam(), Q: new FakeAudioParam(), connect() {}, disconnect() { this.disconnected = true; } };
    this.filters.push(filter);
    return filter;
  }
  createBufferSource() {
    const source = {
      listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      connect() {},
      disconnect() { this.disconnected = true; },
      start(time) { this.startTime = time; },
      stop(time) { this.stopTime = time; },
      emitEnded() { this.listeners.ended?.(); }
    };
    this.bufferSources.push(source);
    return source;
  }
}

function expectCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

test("tick timing converts quarter-note PPQ to seconds without touching canonical notes", () => {
  const song = fixture();
  const notesBefore = structuredClone(song.notes);
  assert.equal(ticksToSeconds(0, 120), 0);
  assert.equal(ticksToSeconds(480, 120), 0.5);
  assert.equal(ticksToSeconds(960, 120), 1);
  assert.equal(ticksToSeconds(480, 60), 1);
  assert.equal(secondsToTickOffset(0.5, 120), 480);
  assert.deepEqual(song.notes, notesBefore);
});

test("tempo commands accept bounded tempos and reject values outside the range", () => {
  const commands = createCommands(fixture());
  assert.equal(commands.setTempo(20), 20);
  assert.equal(commands.getSong().timing.tempo, 20);
  assert.equal(commands.setTempo(300), 300);
  for (const tempo of [0, 19.99, 300.01, Number.NaN, Number.POSITIVE_INFINITY, "120"]) {
    expectCode(() => commands.setTempo(tempo), "invalid-tempo");
  }
  expectCode(() => validateTempo(-1), "invalid-tempo");
});

test("tempo changes re-anchor at the old clock position before notifying the view", async () => {
  const ref = {};
  const commands = createCommands(fixture(), {
    audioPlayerFactory: fakePlayerFactory(ref),
    onChange() {
      // Model time passing during a slow synchronous render. Re-anchoring must
      // already have happened, so this later position cannot be rewound.
      ref.position = 1100;
    }
  });

  await commands.play();
  ref.position = 1000;
  commands.setTempo(84);

  assert.deepEqual(ref.calls.find((call) => call[0] === "tempo"), ["tempo", 84, 1000, true]);
  assert.equal(commands.getState().playback.currentTick, 1100);
});

test("overlap projection uses latest onset then the smallest note ID and half-open durations", () => {
  const song = fixture();
  const first = song.notes[0];
  song.notes.push(
    { id: "overlap-z", pitch: 62, startTick: 240, durationTicks: 480, source: "user", anchor: false, locked: false },
    { id: "overlap-a", pitch: 65, startTick: 240, durationTicks: 480, source: "user", anchor: false, locked: false }
  );
  song.phrases[0].noteIds.push("overlap-z", "overlap-a");
  assert.equal(findCurrentNoteId(song, 240), "overlap-a");
  assert.equal(findCurrentNoteId(song, 479), "overlap-a");
  assert.equal(findCurrentNoteId(song, 480), "entity-5");
  assert.equal(findCurrentNoteId(song, first.startTick + first.durationTicks), "entity-5");
});

test("gap has no current note and section is inferred from canonical member-note span", () => {
  const song = fixture();
  song.notes[2].startTick = 1200;
  const state = projectPlaybackState(song, 1000, "paused", { enabled: false, startTick: 0, endTick: 1920 });
  assert.equal(state.currentNoteId, null);
  assert.equal(state.currentSectionId, "entity-2");
  song.phrases[0].noteIds = song.phrases[0].noteIds.slice(0, 3);
  song.sections.push({ id: "section-second", name: "Chorus", phraseIds: ["phrase-second"] });
  song.phrases.push({ id: "phrase-second", noteIds: [song.notes[3].id] });
  assert.equal(findCurrentSectionId(song, 1500, song.notes[3].id), "section-second");
});

test("an active note without section membership is not assigned by a surrounding section span", () => {
  const song = fixture();
  song.notes.push({ id: "unassigned", pitch: 67, startTick: 120, durationTicks: 120, source: "user", anchor: false, locked: false });

  assert.equal(findCurrentNoteId(song, 180), "unassigned");
  assert.equal(findCurrentSectionId(song, 180, "unassigned"), null);
});

test("loop tick wrapping uses the explicit half-open range", () => {
  const loop = { enabled: true, startTick: 480, endTick: 1440 };
  assert.equal(wrapLoopTick(1439, loop), 1439);
  assert.equal(wrapLoopTick(1440, loop), 480);
  assert.equal(wrapLoopTick(2400, loop), 480);
  assert.equal(wrapLoopTick(2401.5, loop), 481.5);
  assert.equal(wrapLoopTick(2400, { ...loop, enabled: false }), 2400);
});

test("scheduler plans only notes inside the look-ahead window at audio-clock timestamps", () => {
  const song = fixture();
  const options = {
    audioNow: 12,
    anchorAudioTime: 12,
    anchorTick: 0,
    tempo: 120,
    lookAheadSeconds: 0.12,
    loop: { enabled: false, startTick: 0, endTick: 1920 }
  };
  const firstWake = planNoteEvents(song, options);
  assert.deepEqual(firstWake.map((event) => event.note.id), [song.notes[0].id]);
  assert.equal(firstWake[0].startTime, 12);
  assert.equal(firstWake[0].endTime, 12.5);

  const scheduled = new Set(firstWake.map((event) => event.key));
  assert.deepEqual(planNoteEvents(song, { ...options, scheduledKeys: scheduled }), []);
  const laterWake = planNoteEvents(song, { ...options, audioNow: 12.4, scheduledKeys: scheduled });
  assert.deepEqual(laterWake.map((event) => event.note.id), [song.notes[1].id]);
  assert.equal(laterWake[0].startTime, 12.5);
});

test("loop scheduler clips a voice at the end and schedules the next cycle from the same anchor", () => {
  const song = fixture();
  const loop = { enabled: true, startTick: 480, endTick: 1440 };
  const boundaryTime = ticksToSeconds(loop.endTick, 120);
  const scheduledKeys = new Set([JSON.stringify([0, song.notes[2].id])]);
  const events = planNoteEvents(song, {
    audioNow: ticksToSeconds(1400, 120),
    anchorAudioTime: 0,
    anchorTick: 0,
    tempo: 120,
    lookAheadSeconds: 0.12,
    loop,
    scheduledKeys
  });
  const repeatedNote = events.find((event) => event.note.id === song.notes[1].id && event.cycle === 1);
  assert.ok(repeatedNote);
  assert.equal(repeatedNote.startTime, boundaryTime);
  assert.equal(events.some((event) => event.note.id === song.notes[3].id), false);
  assert.ok(events.every((event) => event.endTime <= boundaryTime + 1e-10 || event.cycle > 0));
});

test("loop scheduler retriggers a note crossing loop start when playback seeks into it", () => {
  const song = fixture();
  const loop = { enabled: true, startTick: 240, endTick: 960 };
  const audioNow = ticksToSeconds(360, 120);
  const events = planNoteEvents(song, {
    audioNow,
    anchorAudioTime: audioNow,
    anchorTick: 360,
    tempo: 120,
    lookAheadSeconds: 0.12,
    loop
  });
  const crossing = events.find((event) => event.note.id === song.notes[0].id);

  assert.ok(crossing);
  assert.equal(crossing.startTime, audioNow);
  assert.equal(crossing.endTime, audioNow + ticksToSeconds(120, 120));
  assert.equal(crossing.noteProgressStart, 0.75);
  assert.equal(crossing.noteProgressEnd, 1);

  const nextCycle = planNoteEvents(song, {
    audioNow: ticksToSeconds(540, 120),
    anchorAudioTime: 0,
    anchorTick: 360,
    tempo: 120,
    lookAheadSeconds: 0.12,
    loop,
    scheduledKeys: new Set([JSON.stringify([0, song.notes[0].id])])
  }).find((event) => event.note.id === song.notes[0].id);
  assert.equal(nextCycle?.cycle, 1);
  assert.equal(nextCycle?.startTime, ticksToSeconds(600, 120));
});

test("percussion scheduler plans HitEvent without converting drums into pitched notes", () => {
  const song = fixture();
  song.tracks.push({
    id: "drums",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "kick-1", pieceId: "kick", startTick: 0, velocity: 110, articulation: "accent" },
      { id: "hat-1", pieceId: "closed-hi-hat", startTick: 240, velocity: 76, articulation: "normal" }
    ]
  });
  const options = {
    audioNow: 0,
    anchorAudioTime: 0,
    anchorTick: 0,
    tempo: 120,
    lookAheadSeconds: 0.3,
    loop: { enabled: false, startTick: 0, endTick: 1920 }
  };
  const events = planPercussionEvents(song, options);
  assert.deepEqual(events.map((event) => event.hit.id), ["kick-1", "hat-1"]);
  assert.equal(events[0].startTime, 0);
  assert.equal(events[1].startTime, 0.25);
  assert.deepEqual(planPercussionEvents(song, {
    ...options,
    scheduledKeys: new Set(events.map((event) => event.key))
  }), []);
});

test("percussion scheduler repeats hits inside an enabled loop and ignores hits outside it", () => {
  const song = fixture();
  song.tracks.push({
    id: "drums-loop",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "kick-loop", pieceId: "kick", startTick: 480, velocity: 100, articulation: "normal" },
      { id: "outside-loop", pieceId: "snare", startTick: 1600, velocity: 100, articulation: "normal" }
    ]
  });
  const loop = { enabled: true, startTick: 480, endTick: 1440 };
  const events = planPercussionEvents(song, {
    audioNow: ticksToSeconds(1400, 120),
    anchorAudioTime: 0,
    anchorTick: 0,
    tempo: 120,
    lookAheadSeconds: 0.2,
    loop
  });
  assert.ok(events.some((event) => event.hit.id === "kick-loop" && event.cycle === 1));
  assert.equal(events.some((event) => event.hit.id === "outside-loop"), false);
});

test("percussion voice specs honor velocity, articulation, pan, tuning, and choke", () => {
  const open = percussionVoiceSpec("gm-standard", {
    pieceId: "open-hi-hat",
    velocity: 100,
    articulation: "ghost",
    pan: -0.4,
    tuning: 12,
    durationTicks: 480
  });
  const closed = percussionVoiceSpec("gm-standard", {
    pieceId: "closed-hi-hat",
    velocity: 127,
    articulation: "accent"
  });
  assert.equal(open.chokeGroup, "hi-hat");
  assert.equal(closed.chokeGroup, "hi-hat");
  assert.equal(open.pan, -0.4);
  assert.ok(open.amplitude < closed.amplitude);
  assert.ok(open.oscillators[0].frequency > 9000, "tuning +12 menaikkan frekuensi satu oktaf");
});

test("Web Audio engine schedules canonical percussion together with melody", async () => {
  const song = fixture();
  song.tracks.push({
    id: "drums-audio",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "kick-audio", pieceId: "kick", startTick: 0, velocity: 127, articulation: "accent" }
    ]
  });
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => song, audioContextFactory: () => context });
  await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 1920 } });

  assert.equal(context.oscillators.length, 3, "1 oscillator melodi + 2 oscillator kick");
  assert.equal(context.oscillators[1].startTime, 0);
  assert.ok(context.oscillators[1].stopTime > 0);
  assert.ok(context.gains.length >= 5, "master + melody + percussion envelope/source gains");
  player.stop();
});

test("closed hi-hat chokes an open hi-hat already scheduled in the same group", async () => {
  const song = fixture();
  song.notes = [];
  song.phrases[0].noteIds = [];
  song.tracks.push({
    id: "drums-choke",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "open-hat", pieceId: "open-hi-hat", startTick: 0, velocity: 100, articulation: "normal", durationTicks: 960 },
      { id: "closed-hat", pieceId: "closed-hi-hat", startTick: 60, velocity: 100, articulation: "normal" }
    ]
  });
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => song, audioContextFactory: () => context });
  await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 1920 } });

  assert.equal(context.oscillators.length, 8, "4 open-hat + 4 closed-hat oscillator");
  const chokeTime = ticksToSeconds(60, 120) + 0.012;
  assert.ok(context.oscillators.slice(0, 4).every((oscillator) => Math.abs(oscillator.stopTime - chokeTime) < 1e-9));
  assert.ok(Math.abs(context.bufferSources[0].stopTime - chokeTime) < 1e-9, "open-hat noise is choked with its metallic components");
  player.stop();
});

test("mix changes during transport reschedule at the current tick without restarting the position", async () => {
  const song = fixture();
  song.notes = [song.notes[0]];
  song.notes[0].durationTicks = 480;
  song.phrases[0].noteIds = [song.notes[0].id];
  song.tracks.push({ id: "drums-mix", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [
    { id: "kick-next", pieceId: "kick", startTick: 240, velocity: 100, articulation: "normal" },
    { id: "snare-next", pieceId: "snare", startTick: 240, velocity: 100, articulation: "normal" }
  ] });
  const context = new FakeAudioContext();
  let mix = createInstrumentMix(song);
  const player = createAudioPlayer({ getSong: () => song, getMix: () => mix, audioContextFactory: () => context });
  const loop = { enabled: false, startTick: 0, endTick: 1920 };

  try {
    await player.play(0, { tempo: 120, loop });
    assert.equal(context.oscillators.length, 1, "melody is initially scheduled");
    context.currentTime = 0.14;
    const positionBefore = player.getPosition();
    mix = { channels: { ...mix.channels,
      melody: { mute: false, solo: false },
      [percussionChannelId("drums-mix", "kick")]: { mute: false, solo: true },
      [percussionChannelId("drums-mix", "snare")]: { mute: false, solo: false }
    } };
    player.mixChanged(positionBefore, loop);
    assert.equal(player.getPosition(), positionBefore);
    assert.ok(context.oscillators[0].stopTime <= context.currentTime + 0.012, "the no-longer-audible melody voice is stopped promptly");
    assert.equal(context.oscillators.length, 3, "only the selected kick is newly scheduled");
    assert.ok(context.oscillators.slice(1).every((oscillator) => Math.abs(oscillator.startTime - 0.25) < 0.002));
    const kickNoiseComponents = percussionVoiceSpec("gm-standard", { pieceId: "kick", velocity: 100, articulation: "normal" }).noise.length;
    assert.equal(context.bufferSources.length, kickNoiseComponents, "solo filtering schedules only the kick's own noise components");
  } finally {
    player.stop();
  }
});

test("mix commands reanchor the active transport at its current position", async () => {
  const song = fixture();
  song.tracks.push({ id: "drums-command-mix", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [] });
  const ref = {};
  const commands = createCommands(song, { audioPlayerFactory: fakePlayerFactory(ref) });
  await commands.play();
  ref.position = 720;
  commands.setInstrumentMute("melody", true);
  assert.deepEqual(ref.calls.find((call) => call[0] === "mix"), ["mix", 720, commands.getState().playback.loop]);
  assert.equal(commands.getMixState().channels.melody.mute, true);
  assert.equal(commands.getState().playback.currentTick, 720);
  assert.equal(ref.calls.some((call) => call[0] === "song"), false, "mix edits use their explicit player contract");
});

test("muted channels are never scheduled and explicit candidate audition bypasses the mix", async () => {
  const song = fixture();
  song.tracks.push({ id: "drums-muted", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [
    { id: "kick-muted", pieceId: "kick", startTick: 0, velocity: 100, articulation: "normal" }
  ] });
  const context = new FakeAudioContext();
  const mix = createInstrumentMix(song);
  mix.channels.melody.mute = true;
  mix.channels[percussionChannelId("drums-muted", "kick")].mute = true;
  const player = createAudioPlayer({ getSong: () => song, getMix: () => mix, audioContextFactory: () => context });
  await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 1920 } });
  assert.equal(context.oscillators.length, 0);
  assert.equal(context.bufferSources.length, 0);
  player.stop();

  await player.playPreview([{ id: "candidate", pitch: 72, startTick: 0, durationTicks: 240 }], { tempo: 120 });
  assert.equal(context.oscillators.length, 1, "explicit preview bypasses transport mute/solo");
  player.cancelPreview();
});

test("percussion shares one deterministic noise buffer and disconnects noise voices on end", async () => {
  const song = fixture();
  song.tracks.push({
    id: "noise-audio",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "snare-noise", pieceId: "snare", startTick: 0, velocity: 100, articulation: "normal" },
      { id: "ride-noise", pieceId: "ride", startTick: 60, velocity: 80, articulation: "normal" }
    ]
  });
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => song, audioContextFactory: () => context });
  await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 1920 } });

  assert.equal(context.buffers.length, 1);
  assert.ok(context.bufferSources.length >= 3);
  assert.ok(context.bufferSources.every((source) => source.buffer === context.buffers[0]));
  assert.equal(context.filters.length, context.bufferSources.length);
  const noiseSources = [...context.bufferSources];
  player.stop();
  for (const source of noiseSources) source.emitEnded();
  for (const oscillator of context.oscillators) oscillator.listeners.ended?.();
  assert.ok(noiseSources.every((source) => source.disconnected));
  assert.ok(context.filters.every((filter) => filter.disconnected));
  assert.ok(context.gains.slice(1).every((gain) => gain.disconnected));
});

test("Web Audio engine uses audio timestamps, de-duplicates wakes, and cancels old voices", async () => {
  const song = fixture();
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => song, audioContextFactory: () => context });
  const loop = { enabled: false, startTick: 0, endTick: 1920 };

  await player.play(0, { tempo: 120, loop });
  assert.equal(context.oscillators.length, 1);
  assert.equal(context.oscillators[0].startTime, 0);
  assert.equal(context.oscillators[0].stopTime, 0.5);
  context.currentTime = 0.03;
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(context.oscillators.length, 1);

  player.seek(480, { tempo: 120, loop, playing: true });
  assert.equal(context.oscillators.length, 2);
  assert.equal(context.oscillators[1].startTime, 0.03);
  player.pause();
  assert.ok(context.oscillators[1].stopTime <= 0.042);
  player.stop();
});

test("pitch bend is interpolated in semitones and scheduled on detune", async () => {
  assert.equal(pitchBendAt([{ position: 0, semitones: 0 }, { position: 1, semitones: 2 }], 0.5), 1);

  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => fixture(), audioContextFactory: () => context });
  const note = {
    id: "bend-note",
    pitch: 69,
    startTick: 0,
    durationTicks: 480,
    pitchBend: [
      { position: 0, semitones: 0 },
      { position: 0.5, semitones: 1 },
      { position: 1, semitones: 0 }
    ]
  };

  await player.playPreview([note], { tempo: 120 });
  assert.deepEqual(context.oscillators[0].frequency.events[0].slice(0, 2), ["set", 440]);
  const events = context.oscillators[0].detune.events;
  assert.deepEqual(events, [
    ["set", 0, 0.04],
    ["ramp", 100, 0.29],
    ["ramp", 0, 0.54]
  ]);
  player.cancelPreview();
});

test("seek into a bent note resumes the canonical curve instead of compressing it", async () => {
  const song = fixture();
  song.notes = [{
    id: "resume-bend",
    pitch: 69,
    startTick: 0,
    durationTicks: 480,
    source: "user",
    anchor: false,
    locked: false,
    pitchBend: [{ position: 0, semitones: 0 }, { position: 1, semitones: 2 }]
  }];
  song.phrases[0].noteIds = ["resume-bend"];
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => song, audioContextFactory: () => context });

  await player.play(240, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 480 } });
  const events = context.oscillators[0].detune.events;
  assert.deepEqual(events[0], ["set", 100, 0]);
  assert.deepEqual(events[1], ["ramp", 200, 0.25]);
  player.stop();
});

test("vibrato uses an LFO on detune after the canonical delay", async () => {
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => fixture(), audioContextFactory: () => context });
  const note = {
    id: "vibrato-note",
    pitch: 69,
    startTick: 0,
    durationTicks: 480,
    vibrato: { rateHz: 5.8, depthSemitones: 0.3, delayPosition: 0.25 }
  };

  await player.playPreview([note], { tempo: 120 });
  assert.equal(context.oscillators.length, 2, "main oscillator + vibrato LFO");
  const lfo = context.oscillators[1];
  assert.equal(lfo.type, "sine");
  assert.deepEqual(lfo.frequency.events[0], ["set", 5.8, 0.165]);
  assert.equal(lfo.startTime, 0.165);
  assert.equal(lfo.stopTime, 0.54);
  assert.equal(context.gains.length, 3, "master + envelope + vibrato depth");
  assert.deepEqual(context.gains[2].gain.events[0], ["set", 30, 0.165]);

  player.cancelPreview();
  assert.equal(lfo.stopTime, 0, "cancel preview menghentikan LFO juga");
});

test("Web Audio menerapkan volume dan pan canonical per note", async () => {
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => fixture(), audioContextFactory: () => context });
  const note = {
    id: "expression-note",
    pitch: 69,
    startTick: 0,
    durationTicks: 480,
    volume: 0.5,
    pan: -0.4
  };

  await player.playPreview([note], { tempo: 120 });
  assert.equal(context.panners.length, 1);
  assert.deepEqual(context.panners[0].pan.events[0].slice(0, 2), ["set", -0.4]);

  assert.equal(context.oscillators.length, 1);
  assert.equal(context.gains.length, 2, "master gain + envelope note");
  const envelopeEvents = context.gains[1].gain.events;
  assert.ok(Math.abs(envelopeEvents[1][1] - 0.09) < 1e-12, "peak gain mengikuti volume 50%");
  assert.ok(Math.abs(envelopeEvents[2][1] - 0.07) < 1e-12, "sustain gain mengikuti volume 50%");
  player.cancelPreview();
});

test("candidate preview reuses the player, replaces an earlier audition, and cancels without leaking voices", async () => {
  const song = fixture();
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => song, audioContextFactory: () => context });
  const notes = [
    { id: "candidate-note-1", pitch: 60, startTick: 480, durationTicks: 240 },
    { id: "candidate-note-2", pitch: 64, startTick: 720, durationTicks: 240 },
    { id: "right-anchor", pitch: 67, startTick: 960, durationTicks: 480 }
  ];
  let completed = 0;

  await player.playPreview(notes, { tempo: 120, onEnded: () => { completed += 1; } });
  assert.equal(context.oscillators.length, 3);
  assert.equal(context.oscillators[0].startTime, 0.04);
  assert.equal(context.oscillators[1].startTime, 0.29);
  assert.equal(context.oscillators[2].startTime, 0.54);
  await player.playPreview(notes.slice(0, 1), { tempo: 120, onEnded: () => { completed += 1; } });
  assert.equal(context.oscillators.length, 4);
  assert.ok(context.oscillators.slice(0, 3).every((oscillator) => oscillator.stopTime === 0));
  player.cancelPreview();
  assert.equal(context.oscillators[3].stopTime, 0);
  assert.equal(completed, 0);
});

test("candidate preview completion follows AudioContext time while suspended", async () => {
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => fixture(), audioContextFactory: () => context });
  const note = { id: "candidate-note", pitch: 60, startTick: 0, durationTicks: 120 };
  let completed = 0;

  await player.playPreview([note], { tempo: 120, onEnded: () => { completed += 1; } });
  context.currentTime = 0.08;
  context.setState("suspended");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(completed, 0);

  context.currentTime = 0.16;
  context.setState("running");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(completed, 0);
  context.setState("suspended");
  context.currentTime = 0.3;
  context.setState("running");
  assert.equal(completed, 1);
});

test("Web Audio loop voices stop at the exact boundary before the next cycle starts", async () => {
  const song = fixture();
  const context = new FakeAudioContext();
  const player = createAudioPlayer({ getSong: () => song, audioContextFactory: () => context });
  const loop = { enabled: true, startTick: 480, endTick: 1440 };

  await player.play(1400, { tempo: 120, loop });
  assert.equal(context.oscillators.length, 2);
  assert.equal(context.oscillators[0].stopTime, context.oscillators[1].startTime);
  assert.equal(context.oscillators[1].startTime, ticksToSeconds(40, 120));
  player.stop();
});

test("commands transition through play, pause, resume, seek, tempo, loop, and stop", async () => {
  const ref = {};
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });
  const notesBefore = structuredClone(commands.getSong().notes);

  assert.equal(commands.getState().playback.status, "stopped");
  await commands.play();
  assert.equal(commands.getState().playback.status, "playing");
  ref.position = 480;
  ref.callbacks.onPosition(480);
  assert.equal(commands.getState().playback.currentNoteId, "entity-5");
  commands.pause();
  assert.equal(commands.getState().playback.status, "paused");
  assert.equal(commands.getState().playback.currentTick, 480);

  await commands.play();
  commands.seek(960);
  assert.equal(commands.getState().playback.currentTick, 960);
  assert.equal(commands.getState().playback.currentNoteId, "entity-6");
  commands.setTempo(84);
  assert.equal(commands.getSong().timing.tempo, 84);
  assert.deepEqual(ref.calls.find((call) => call[0] === "tempo"), ["tempo", 84, 960, true]);
  assert.deepEqual(commands.setLoop(480, 1440), { enabled: true, startTick: 480, endTick: 1440 });
  commands.setLoopEnabled(true);
  assert.equal(commands.getState().playback.loop.enabled, true);
  commands.stop();
  const stopped = commands.getState().playback;
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.currentTick, 0);
  assert.equal(stopped.currentNoteId, null);
  assert.deepEqual(stopped.loop, { enabled: true, startTick: 0, endTick: 1920 });
  assert.deepEqual(commands.getSong().notes, notesBefore);
});

test("automatic loop range follows song length until the user sets a manual range", () => {
  const ref = {};
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });

  assert.deepEqual(commands.getState().playback.loop, { enabled: true, startTick: 0, endTick: 1920 });

  commands.addNote({ pitch: 72, startTick: 3840, durationTicks: 480 });
  assert.deepEqual(commands.getState().playback.loop, { enabled: true, startTick: 0, endTick: 4320 });
  assert.deepEqual(ref.calls.at(-1), ["song", 0, { enabled: true, startTick: 0, endTick: 4320 }]);

  commands.setLoop(480, 1440);
  commands.setLoopEnabled(false);
  commands.addNote({ pitch: 74, startTick: 4800, durationTicks: 480 });
  assert.deepEqual(commands.getState().playback.loop, { enabled: false, startTick: 480, endTick: 1440 });

  commands.setLoopEnabled(true);
  assert.deepEqual(commands.getState().playback.loop, { enabled: true, startTick: 480, endTick: 1440 });
});

test("seeking to or beyond an enabled loop end normalizes the playhead to the loop range", () => {
  const ref = {};
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });
  commands.setLoop(480, 1440);
  commands.setLoopEnabled(true);

  const playback = commands.seek(2400);

  assert.equal(playback.currentTick, 480);
  assert.equal(ref.calls.find((call) => call[0] === "seek")[1], 480);
});

test("seek and loop validation require safe non-negative integer ticks and a nonempty range", () => {
  const commands = createCommands(fixture());
  for (const tick of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expectCode(() => commands.seek(tick), "invalid-tick");
  }
  for (const [start, end] of [[-1, 10], [0, 0], [2, 1], [0, 1.5], [0, Number.MAX_SAFE_INTEGER + 1]]) {
    expectCode(() => commands.setLoop(start, end), "invalid-loop");
  }
  expectCode(() => commands.setLoopEnabled("yes"), "invalid-loop");
});

test("failed audio activation does not report a playing state", async () => {
  const commands = createCommands(fixture(), {
    audioPlayerFactory: () => ({ play: async () => { throw new MelodiError("audio-activation-required"); } })
  });
  await assert.rejects(commands.play(), (error) => error.code === "audio-activation-required");
  assert.equal(commands.getState().playback.status, "stopped");
});

test("a pending Play invalidated by Stop resolves without a playing state", async () => {
  let finishStart;
  const commands = createCommands(fixture(), {
    audioPlayerFactory: () => ({
      play: () => new Promise((resolve) => { finishStart = resolve; }),
      stop() {}
    })
  });

  const pendingPlay = commands.play();
  commands.stop();
  finishStart(true);
  const result = await pendingPlay;

  assert.equal(result.status, "stopped");
  assert.equal(commands.getState().playback.status, "stopped");
});

test("late player failures pause playback and emit a discrete playback error event", async () => {
  const ref = {};
  const events = [];
  const commands = createCommands(fixture(), {
    audioPlayerFactory: fakePlayerFactory(ref),
    onNotificationError() {},
    onPlaybackEvent: (event, error) => events.push([event, error?.code])
  });

  await commands.play();
  ref.position = 240;
  ref.callbacks.onError(new MelodiError("audio-scheduling-failed"));

  assert.equal(commands.getState().playback.status, "paused");
  assert.equal(commands.getState().playback.currentTick, 240);
  assert.deepEqual(events, [["error", "audio-scheduling-failed"]]);
});

test("seek state snapshots are detached from transport runtime", () => {
  const commands = createCommands(fixture());
  commands.seek(480);
  const snapshot = commands.getState();
  snapshot.playback.currentTick = 9000;
  snapshot.playback.loop.enabled = false;
  snapshot.playback.currentNoteId = "changed";
  assert.equal(commands.getState().playback.currentTick, 480);
  assert.equal(commands.getState().playback.loop.enabled, true);
  assert.equal(commands.getState().playback.currentNoteId, "entity-5");
});

test("manual playback range works once when Loop is off", async () => {
  const ref = {};
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });
  commands.setLoop(480, 1440);
  commands.setLoopEnabled(false);
  commands.seek(0);

  await commands.play();

  assert.deepEqual(ref.calls.find((call) => call[0] === "play").slice(0, 2), ["play", 480]);
  assert.equal(commands.getState().playback.currentTick, 480);
  commands.stop();
  assert.equal(commands.getState().playback.currentTick, 0);
  assert.deepEqual(commands.getState().playback.loop, { enabled: false, startTick: 0, endTick: 1920 });
});

test("normal scheduler clips notes to the playback range", () => {
  const song = fixture();
  const events = planNoteEvents(song, {
    audioNow: 0,
    anchorAudioTime: 0,
    anchorTick: 480,
    tempo: 120,
    lookAheadSeconds: 1,
    loop: { enabled: false, startTick: 480, endTick: 960 }
  });

  assert.ok(events.length > 0);
  assert.ok(events.every((event) => event.note.startTick < 960));
  assert.ok(events.every((event) => event.endTime <= ticksToSeconds(480, 120) + 1e-10));
});

test("Stop clears a manual playback range back to the full timeline", () => {
  const ref = {};
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });
  commands.setLoop(480, 1440);
  commands.setLoopEnabled(true);
  commands.seek(960);

  const stopped = commands.stop();

  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.currentTick, 0);
  assert.deepEqual(stopped.loop, { enabled: true, startTick: 0, endTick: 1920 });
});


test("transport channel volume scales canonical note envelopes without changing their expression", async () => {
  const peaks = [];
  for (const volume of [1, 0.5, 0]) {
    const song = fixture();
    song.notes[0].volume = 0.5;
    const mix = createInstrumentMix(song);
    mix.channels.melody.volume = volume;
    const context = new FakeAudioContext();
    const player = createAudioPlayer({ getSong: () => song, getMix: () => mix, audioContextFactory: () => context });
    try {
      await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 1920 } });
      assert.equal(context.oscillators.length, volume === 0 ? 0 : 1);
      peaks.push(volume === 0 ? 0 : context.gains[1].gain.events[1][1]);
      assert.equal(song.notes[0].volume, 0.5);
    } finally { player.stop(); }
  }
  assert.equal(peaks[0], 0.09, "100% preserves the existing note peak");
  assert.equal(peaks[1], peaks[0] * 0.25);
  assert.equal(peaks[2], 0);
});

test("Ride output scalar combines with channel volume and zero skips every source", async () => {
  const peaks = [];
  const hit = { id: "ride-volume", pieceId: "ride", startTick: 0, velocity: 100, articulation: "normal" };
  for (const volume of [1, 0.5, 0]) {
    const song = fixture();
    song.notes = [];
    song.phrases[0].noteIds = [];
    song.tracks.push({ id: "ride-volume-track", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [hit] });
    const mix = createInstrumentMix(song);
    mix.channels[percussionChannelId("ride-volume-track", "ride")].volume = volume;
    const context = new FakeAudioContext();
    const player = createAudioPlayer({ getSong: () => song, getMix: () => mix, audioContextFactory: () => context });
    try {
      await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 1920 } });
      assert.equal(context.oscillators.length, volume === 0 ? 0 : 4);
      assert.equal(context.bufferSources.length, volume === 0 ? 0 : 1);
      peaks.push(volume === 0 ? 0 : context.gains[1].gain.events[1][1]);
    } finally { player.stop(); }
  }
  const expectedPeak = 0.42 * percussionVoiceSpec("gm-standard", hit).amplitude * 0.5;
  assert.equal(peaks[0], expectedPeak);
  assert.equal(peaks[1], expectedPeak * 0.25);
  assert.equal(peaks[2], 0);
});

test("channel volume change during playback reanchors at the clock position and applies the new envelope", async () => {
  const song = fixture();
  const context = new FakeAudioContext();
  const mix = createInstrumentMix(song);
  const player = createAudioPlayer({ getSong: () => song, getMix: () => mix, audioContextFactory: () => context });
  const loop = { enabled: false, startTick: 0, endTick: 1920 };
  try {
    await player.play(0, { tempo: 120, loop });
    context.currentTime = 0.25;
    assert.equal(player.getPosition(), 240);
    mix.channels.melody.volume = 0.5;
    player.mixChanged(player.getPosition(), loop);
    assert.equal(player.getPosition(), 240);
    assert.equal(context.oscillators[1].startTime, 0.25);
    assert.equal(context.gains[2].gain.events[1][1], 0.18 * 0.25);
    assert.ok(context.oscillators[0].stopTime <= 0.262);
    context.currentTime = 0.3;
    assert.equal(player.getPosition(), 288);
    mix.channels.melody.volume = 0;
    player.mixChanged(player.getPosition(), loop);
    assert.equal(player.getPosition(), 288);
    assert.equal(context.oscillators.length, 2, "zero does not create replacement voices");
  } finally { player.stop(); }
});

test("volume command passes active position through the existing mix contract", async () => {
  const ref = {};
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });
  await commands.play();
  ref.position = 720;
  commands.setInstrumentVolume("melody", 0.5);
  assert.deepEqual(ref.calls.find((call) => call[0] === "mix"), ["mix", 720, commands.getState().playback.loop]);
  assert.equal(commands.getState().playback.currentTick, 720);
  assert.equal(commands.getState().playback.status, "playing");
  assert.equal(ref.calls.filter((call) => call[0] === "play").length, 1);
  commands.stop();
});

test("100 percent uses nominal calibrated percussion peaks", async () => {
  for (const pieceId of ["kick", "snare", "closed-hi-hat", "crash"]) {
    const song = fixture();
    song.notes = [];
    song.phrases[0].noteIds = [];
    const hit = { id: `unity-${pieceId}`, pieceId, startTick: 0, velocity: 100, articulation: "normal" };
    song.tracks.push({ id: "unity-track", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [hit] });
    const mix = createInstrumentMix(song);
    const context = new FakeAudioContext();
    const player = createAudioPlayer({ getSong: () => song, getMix: () => mix, audioContextFactory: () => context });
    try {
      await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 1920 } });
      assert.equal(context.gains[1].gain.events[1][1], 0.42 * percussionVoiceSpec("gm-standard", hit).amplitude * percussionVoiceSpec("gm-standard", hit).outputGain, pieceId);
    } finally { player.stop(); }
  }
});


test("every percussion factory trim is multiplied once by the square user gain", async () => {
  const trims = { kick: 1, snare: 0.8, "closed-hi-hat": 0.75, "open-hi-hat": 0.7, ride: 0.5, crash: 0.6, "high-tom": 0.85, "mid-tom": 0.85, "low-tom": 0.85 };
  for (const [pieceId, trim] of Object.entries(trims)) {
    for (const volume of [1, 0.5, 0]) {
      const song = fixture();
      song.notes = [];
      song.phrases[0].noteIds = [];
      const hit = { id: `trim-${pieceId}`, pieceId, startTick: 0, velocity: 100, articulation: "normal" };
      song.tracks.push({ id: "trim-track", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [hit] });
      const mix = createInstrumentMix(song);
      mix.channels[percussionChannelId("trim-track", pieceId)].volume = volume;
      const context = new FakeAudioContext();
      const player = createAudioPlayer({ getSong: () => song, getMix: () => mix, audioContextFactory: () => context });
      try {
        await player.play(0, { tempo: 120, loop: { enabled: false, startTick: 0, endTick: 1920 } });
        if (volume === 0) {
          assert.equal(context.oscillators.length + context.bufferSources.length, 0, pieceId);
        } else {
          const expected = 0.42 * percussionVoiceSpec("gm-standard", hit).amplitude * trim * volume ** 2;
          assert.equal(context.gains[1].gain.events[1][1], expected, `${pieceId} at ${volume}`);
        }
      } finally { player.stop(); }
    }
  }
});

test("canonical volume undo and redo reanchor at the running clock without restarting monitoring", async () => {
  const ref = {};
  const commands = createCommands(fixture(), { audioPlayerFactory: fakePlayerFactory(ref) });
  await commands.play();
  commands.setInstrumentSolo("melody", true);
  ref.position = 720;
  commands.setInstrumentVolume("melody", 0.5);
  assert.equal(ref.callbacks.getMix().channels.melody.volume, 0.5);
  ref.position = 800;
  commands.undo();
  assert.deepEqual(ref.calls.at(-1), ["song", 800, commands.getState().playback.loop]);
  assert.equal(ref.callbacks.getMix().channels.melody.volume, 1);
  assert.equal(ref.callbacks.getMix().channels.melody.solo, true);
  ref.position = 880;
  commands.redo();
  assert.deepEqual(ref.calls.at(-1), ["song", 880, commands.getState().playback.loop]);
  assert.equal(ref.callbacks.getMix().channels.melody.volume, 0.5);
  assert.equal(commands.getState().playback.status, "playing");
  assert.equal(ref.calls.filter(([name]) => name === "play").length, 1);
  commands.stop();
});
