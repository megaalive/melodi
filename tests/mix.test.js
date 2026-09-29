import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { createInstrumentMix, instrumentChannelIds, isInstrumentAudible, percussionChannelId } from "../src/audio/mix.js";

function songWithTrack(trackId = "drums-a") {
  let next = 0;
  const song = createInitialSong(() => `mix-${++next}`);
  song.tracks.push({ id: trackId, kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [
    { id: `kick-${trackId}`, pieceId: "kick", startTick: 0, velocity: 100, articulation: "normal" }
  ] });
  return song;
}

test("runtime mix exposes melody and nine separate GM percussion-piece channels", () => {
  const song = songWithTrack();
  const mix = createInstrumentMix(song);
  assert.equal(instrumentChannelIds(song).length, 10);
  assert.deepEqual(mix.channels.melody, { mute: false, solo: false });
  assert.deepEqual(mix.channels[percussionChannelId("drums-a", "kick")], { mute: false, solo: false });
  assert.equal(Object.keys(mix.channels).some((id) => id.includes(":pitch:")), false);
});

test("audibility implements global solo and mute overrides solo", () => {
  const normal = { channels: {
    melody: { mute: false, solo: false },
    kick: { mute: false, solo: false },
    snare: { mute: false, solo: false }
  } };
  assert.equal(isInstrumentAudible(normal, "melody"), true);
  normal.channels.melody.mute = true;
  assert.equal(isInstrumentAudible(normal, "melody"), false);
  normal.channels.melody.mute = false;
  normal.channels.kick.solo = true;
  assert.equal(isInstrumentAudible(normal, "kick"), true);
  assert.equal(isInstrumentAudible(normal, "snare"), false);
  assert.equal(isInstrumentAudible(normal, "melody"), false);
  normal.channels.kick.mute = true;
  assert.equal(isInstrumentAudible(normal, "kick"), false);
  normal.channels.snare.solo = true;
  normal.channels.snare.mute = false;
  assert.equal(isInstrumentAudible(normal, "snare"), true);
  assert.equal(isInstrumentAudible(normal, "kick"), false, "a soloed channel stays muted if mute is enabled");
  normal.channels.kick.mute = false;
  assert.equal(isInstrumentAudible(normal, "kick"), true);
});

test("commands keep mix runtime-only, detach snapshots, and reset or sanitize channels on project replacement", () => {
  const commands = createCommands(songWithTrack());
  const kick = percussionChannelId("drums-a", "kick");
  commands.setInstrumentMute("melody", true);
  commands.setInstrumentSolo(kick, true);
  assert.equal(commands.getState().mix.channels.melody.mute, true);
  assert.equal(commands.getState().mix.channels[kick].solo, true);
  const snapshot = commands.getState();
  snapshot.mix.channels.melody.mute = false;
  assert.equal(commands.getMixState().channels.melody.mute, true);
  assert.equal(Object.hasOwn(commands.getSong(), "mix"), false);

  const replacement = songWithTrack("drums-b");
  commands.loadSong(replacement);
  const mix = commands.getMixState();
  assert.equal(mix.channels.melody.mute, false);
  assert.equal(mix.channels[percussionChannelId("drums-b", "kick")].solo, false);
  assert.equal(Object.hasOwn(mix.channels, kick), false);
  assert.throws(() => commands.setInstrumentSolo(kick, true), { code: "instrument-channel-not-found" });
});

test("instrument actions require a known channel and boolean values", () => {
  const commands = createCommands(songWithTrack());
  assert.throws(() => commands.setInstrumentMute("unknown", true), { code: "instrument-channel-not-found" });
  assert.throws(() => commands.setInstrumentSolo("melody", 1), { code: "invalid-instrument-state" });
  assert.equal(commands.setInstrumentMute("melody", true), true);
  assert.equal(commands.setInstrumentMute("melody", true), true);
});
