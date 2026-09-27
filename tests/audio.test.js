import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, MelodiError } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { createAudioPlayer } from "../src/audio/player.js";
import {
  findCurrentNoteId,
  findCurrentSectionId,
  planNoteEvents,
  projectPlaybackState,
  secondsToTickOffset,
  ticksToSeconds,
  validateTempo,
  wrapLoopTick
} from "../src/audio/transport.js";

function fixture() {
  let next = 0;
  return createInitialSong(() => `entity-${++next}`);
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
      songChanged(tick) { ref.calls.push(["song", tick]); }
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
  addEventListener() {}
  createGain() {
    return { gain: new FakeAudioParam(), connect() {}, disconnect() {} };
  }
  createOscillator() {
    const oscillator = {
      frequency: new FakeAudioParam(),
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
  assert.deepEqual(commands.setLoop(480, 1440), { enabled: false, startTick: 480, endTick: 1440 });
  commands.setLoopEnabled(true);
  assert.equal(commands.getState().playback.loop.enabled, true);
  commands.stop();
  const stopped = commands.getState().playback;
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.currentTick, 0);
  assert.equal(stopped.currentNoteId, null);
  assert.deepEqual(commands.getSong().notes, notesBefore);
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
  snapshot.playback.loop.enabled = true;
  snapshot.playback.currentNoteId = "changed";
  assert.equal(commands.getState().playback.currentTick, 480);
  assert.equal(commands.getState().playback.loop.enabled, false);
  assert.equal(commands.getState().playback.currentNoteId, "entity-5");
});
