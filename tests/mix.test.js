import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { createExample } from "../src/examples/catalog.js";
import { createInstrumentMix, instrumentChannelIds, instrumentGain, isInstrumentAudible, percussionChannelId, volumeGain } from "../src/audio/mix.js";

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
  assert.deepEqual(mix.channels.melody, { mute: false, solo: false, volume: 1 });
  assert.deepEqual(mix.channels[percussionChannelId("drums-a", "kick")], { mute: false, solo: false, volume: 1 });
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

test("channel gain squares volume while mute and global solo keep authority", () => {
  const mix = createInstrumentMix(songWithTrack());
  const kick = percussionChannelId("drums-a", "kick");
  assert.equal(volumeGain(0), 0);
  assert.equal(volumeGain(0.5), 0.25);
  assert.equal(volumeGain(1), 1);
  assert.equal(instrumentGain({ channels: {} }, "melody"), 1, "legacy missing volume remains unity");
  mix.channels.melody.volume = 0.5;
  mix.channels[kick].volume = 0.7;
  assert.equal(instrumentGain(mix, "melody"), 0.25);
  assert.ok(Math.abs(instrumentGain(mix, kick) - 0.49) < 1e-12);
  mix.channels[kick].solo = true;
  assert.equal(instrumentGain(mix, "melody"), 0);
  mix.channels[kick].mute = true;
  assert.equal(instrumentGain(mix, kick), 0);
  mix.channels[kick].mute = false;
  mix.channels[kick].volume = 0;
  assert.equal(instrumentGain(mix, kick), 0);
  assert.equal(instrumentGain(mix, "melody"), 0, "zero-volume solo still selects its channel");
});

test("volume commands validate channels and reset detached runtime levels on load", () => {
  const commands = createCommands(songWithTrack());
  const kick = percussionChannelId("drums-a", "kick");
  for (const channel of ["melody", kick]) {
    for (const volume of [0, 0.5, 1]) {
      assert.equal(commands.setInstrumentVolume(channel, volume), volume);
      assert.equal(commands.getState().mix.channels[channel].volume, volume);
    }
  }
  for (const invalid of [-0.01, 1.01, NaN, Infinity, "0.5", null]) {
    assert.throws(() => commands.setInstrumentVolume("melody", invalid), { code: "invalid-instrument-volume" });
  }
  assert.throws(() => commands.setInstrumentVolume("unknown", 0.5), { code: "instrument-channel-not-found" });
  commands.setInstrumentVolume("melody", 0.5);
  commands.setInstrumentVolume(kick, 0);
  const snapshot = commands.getState();
  snapshot.mix.channels.melody.volume = 0;
  assert.equal(commands.getMixState().channels.melody.volume, 0.5);
  assert.equal(Object.hasOwn(commands.getSong(), "mix"), false);
  commands.loadSong(songWithTrack());
  assert.equal(commands.getMixState().channels.melody.volume, 1);
  assert.equal(commands.getMixState().channels[kick].volume, 1);
  commands.setInstrumentVolume("melody", 0);
  commands.newSong();
  assert.deepEqual(commands.getMixState().channels, { melody: { mute: false, solo: false, volume: 1 } });
  commands.setInstrumentVolume("melody", 0.5);
  commands.loadSong(createExample("jazz-drums-medium-swing"));
  assert.ok(Object.values(commands.getMixState().channels).every((state) => state.volume === 1));
});
