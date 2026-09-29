import test from "node:test";
import assert from "node:assert/strict";
import { GM_STANDARD_KIT } from "../src/instruments/percussion.js";
import { percussionVoiceSpec } from "../src/audio/percussion.js";

function hit(pieceId, overrides = {}) {
  return {
    pieceId,
    velocity: 100,
    articulation: "normal",
    ...overrides
  };
}

function spec(pieceId, overrides = {}, kitId = GM_STANDARD_KIT.id) {
  return percussionVoiceSpec(kitId, hit(pieceId, overrides));
}

test("every GM Standard piece has an explicit supported voice and no generic tone fallback", () => {
  assert.equal(GM_STANDARD_KIT.pieces.length, 9);
  for (const piece of GM_STANDARD_KIT.pieces) {
    const voice = spec(piece.id);
    assert.equal(voice.supported, true, piece.id);
    assert.equal(voice.kitId, GM_STANDARD_KIT.id, piece.id);
    assert.equal(voice.pieceId, piece.id, piece.id);
    assert.ok(voice.oscillators.length > 0, `${piece.id} has a pitched or metallic component`);
    assert.ok(Array.isArray(voice.noise), `${piece.id} returns a noise component list`);
    assert.equal(voice.chokeGroup, piece.chokeGroup, `${piece.id} retains kit choke metadata`);
    assert.equal(voice.oscillators.some((component) => component.frequency === 440), false, `${piece.id} is not the generic 440 Hz voice`);
  }
});

test("velocity, articulation, pan, tuning, and choke metadata remain part of the voice spec", () => {
  const normal = spec("open-hi-hat", { velocity: 64, articulation: "normal", pan: -0.4, tuning: 0 });
  const ghost = spec("open-hi-hat", { velocity: 64, articulation: "ghost", pan: -0.4, tuning: 0 });
  const accent = spec("closed-hi-hat", { velocity: 127, articulation: "accent", pan: 0.6, tuning: 12 });
  const untuned = spec("closed-hi-hat", { velocity: 127, articulation: "accent", pan: 0.6, tuning: 0 });

  assert.ok(ghost.amplitude < normal.amplitude);
  assert.ok(accent.amplitude > normal.amplitude);
  assert.equal(normal.pan, -0.4);
  assert.equal(accent.pan, 0.6);
  assert.equal(normal.chokeGroup, "hi-hat");
  assert.equal(accent.chokeGroup, "hi-hat");
  assert.equal(accent.oscillators[0].frequency, untuned.oscillators[0].frequency * 2);
  assert.equal(accent.noise[0].frequency, untuned.noise[0].frequency * 2);
});

test("kick has a low descending body and only a short optional transient", () => {
  const kick = spec("kick");
  assert.ok(kick.oscillators.some((component) => component.frequency < 160));
  assert.ok(kick.oscillators.some((component) => component.endFrequency < component.frequency));
  assert.ok(kick.noise.length > 0);
  assert.ok(kick.noise.every((component) => component.duration <= 0.03));
  assert.ok(kick.noise.every((component) => component.filterType === "highpass"));
});

test("snare body combines pitched membrane tone with filtered noise", () => {
  const snare = spec("snare", { velocity: 68, articulation: "ghost" });
  assert.ok(snare.oscillators.some((component) => component.frequency >= 130 && component.frequency <= 220));
  assert.ok(snare.noise.length >= 2, "snare has a filtered body burst and wire-like high component");
  assert.ok(snare.noise.some((component) => component.filterType === "bandpass"));
  assert.ok(snare.noise.some((component) => component.filterType === "highpass"));
  assert.ok(snare.noise.every((component) => component.duration < snare.duration));
});

test("closed and open hi-hats keep the metallic/noise family and open-hat duration mapping", () => {
  const closed = spec("closed-hi-hat");
  const openDefault = spec("open-hi-hat", { durationTicks: 480 });
  const openShort = spec("open-hi-hat", { durationTicks: 1 });
  const openLong = spec("open-hi-hat", { durationTicks: 2400 });

  assert.ok(closed.oscillators.length >= 3);
  assert.ok(openDefault.oscillators.length >= 3);
  assert.ok(closed.noise.some((component) => component.filterType === "highpass"));
  assert.ok(openDefault.noise.some((component) => component.filterType === "highpass"));
  assert.ok(closed.noise.every((component) => component.frequency >= 6000));
  assert.ok(openDefault.duration > closed.duration);
  assert.equal(openDefault.duration, 0.55);
  assert.equal(openShort.duration, 0.32);
  assert.equal(openLong.duration, 1.1);
  assert.equal(openLong.noise[0].duration, openLong.duration, "open noise tail follows the requested duration");
  assert.equal(openDefault.chokeGroup, closed.chokeGroup);
});

test("ride is a defined ping while crash has a longer, broader noise wash", () => {
  const ride = spec("ride");
  const crash = spec("crash");
  const rideNoiseGain = ride.noise.reduce((total, component) => total + component.gain, 0);
  const crashNoiseGain = crash.noise.reduce((total, component) => total + component.gain, 0);

  assert.ok(ride.oscillators.some((component) => component.frequency >= 2400 && component.frequency <= 2600));
  assert.ok(ride.noise.length > 0);
  assert.ok(crash.noise.length > 0);
  assert.ok(crash.duration > ride.duration);
  assert.ok(crashNoiseGain > rideNoiseGain * 3);
  assert.ok(Math.min(...crash.noise.map((component) => component.frequency)) < Math.min(...ride.noise.map((component) => component.frequency)));
  assert.ok(Math.max(...crash.noise.map((component) => component.duration)) > Math.max(...ride.noise.map((component) => component.duration)));
});

test("tom voice fundamentals and pitch sweeps descend high to mid to low", () => {
  const high = spec("high-tom").oscillators[0];
  const mid = spec("mid-tom").oscillators[0];
  const low = spec("low-tom").oscillators[0];

  assert.ok(high.frequency > mid.frequency && mid.frequency > low.frequency);
  assert.ok(high.endFrequency > mid.endFrequency && mid.endFrequency > low.endFrequency);
  for (const tom of [high, mid, low]) assert.ok(tom.endFrequency < tom.frequency);
});

test("unknown kits and pieces fail closed instead of returning a generic oscillator", () => {
  assert.throws(
    () => percussionVoiceSpec("unknown-kit", hit("kick")),
    (error) => error.code === "unsupported-percussion-voice"
  );
  assert.throws(
    () => percussionVoiceSpec(GM_STANDARD_KIT.id, hit("unknown-piece")),
    (error) => error.code === "unsupported-percussion-voice"
  );
});
