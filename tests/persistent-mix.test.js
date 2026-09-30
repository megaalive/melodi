import test from "node:test";
import assert from "node:assert/strict";
import { createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { createExample } from "../src/examples/catalog.js";
import { createInstrumentMix, percussionChannelId } from "../src/audio/mix.js";
import { deserializeProject, serializeProject, SCHEMA_VERSION } from "../src/core/serialization.js";
import { toPortableProject } from "../src/io/share.js";

function fixture() {
  let next = 0;
  return createExample("punk-drums-fast-drive", () => `persistent-${++next}`);
}

test("optional song mix keeps malformed root validation in the canonical error contract", () => {
  for (const malformed of [null, undefined, [], 1, "song"]) {
    assert.throws(() => createSong(malformed), { code: "invalid-project" });
  }
});

test("canonical song mix validates volumes and semantic track/piece references", () => {
  const song = fixture();
  const trackId = song.tracks[0].id;
  assert.ok(Object.values(createInstrumentMix(song).channels).every((channel) => channel.volume === 1));
  song.mix = { melody: 0.3, percussion: { [trackId]: { ride: 0.42, kick: 0 } } };
  const canonical = createSong(song);
  assert.deepEqual(canonical.mix, song.mix);
  for (const invalid of [NaN, Infinity, -0.01, 1.01, "0.5", null]) {
    assert.throws(() => createSong({ ...song, mix: { ...song.mix, melody: invalid } }), { code: "invalid-song-mix" });
    assert.throws(() => createSong({ ...song, mix: { melody: 1, percussion: { [trackId]: { ride: invalid } } } }), { code: "invalid-song-mix" });
  }
  for (const percussion of [{ missing: { ride: 0.5 } }, { [trackId]: { missing: 0.5 } }]) {
    assert.throws(() => createSong({ ...song, mix: { melody: 1, percussion } }), { code: "invalid-song-mix" });
  }
  assert.throws(() => createSong({ ...song, mix: { ...song.mix, mute: true } }), { code: "invalid-song-mix" });
  canonical.mix.percussion[trackId].ride = 0;
  assert.equal(song.mix.percussion[trackId].ride, 0.42);
});

test("volume edits have one history step while monitoring survives edits and undo/redo", () => {
  const song = fixture();
  const trackId = song.tracks[0].id;
  const ride = percussionChannelId(trackId, "ride");
  const crash = percussionChannelId(trackId, "crash");
  const commands = createCommands(song);
  commands.setInstrumentSolo(ride, true);
  commands.setInstrumentMute(crash, true);
  assert.equal(commands.getState().history.undoDepth, 0);
  commands.setInstrumentVolume(ride, 0.43);
  assert.equal(commands.getSong().mix.percussion[trackId].ride, 0.43);
  assert.equal(commands.getState().history.undoDepth, 1);
  commands.setInstrumentVolume(ride, 0.43);
  assert.equal(commands.getState().history.undoDepth, 1, "no-op is not an edit");
  commands.undo();
  assert.equal(commands.getMixState().channels[ride].volume, 1);
  assert.equal(commands.getMixState().channels[ride].solo, true);
  assert.equal(commands.getMixState().channels[crash].mute, true);
  commands.redo();
  assert.equal(commands.getMixState().channels[ride].volume, 0.43);
  assert.equal(commands.getMixState().channels[ride].solo, true);
  commands.setSongTitle("Volume authority");
  assert.equal(commands.getMixState().channels[ride].volume, 0.43);
  assert.equal(commands.getMixState().channels[ride].solo, true);
  const previous = commands.getMixState();
  previous.channels[ride].volume = 0.99;
  assert.equal(createInstrumentMix(commands.getSong(), previous).channels[ride].volume, 0.43);
  commands.loadSong(commands.getSong());
  assert.equal(commands.getMixState().channels[ride].volume, 0.43);
  assert.equal(commands.getMixState().channels[ride].solo, false);
  assert.equal(commands.getMixState().channels[crash].mute, false);
});

test("project schema3 preserves only song volumes; v1/v2 missing mix remains unity", () => {
  const song = fixture();
  const commands = createCommands(song);
  const ride = percussionChannelId(song.tracks[0].id, "ride");
  commands.setInstrumentVolume("melody", 0.57);
  commands.setInstrumentVolume(ride, 0.42);
  commands.setInstrumentSolo(ride, true);
  commands.setInstrumentMute("melody", true);
  const project = serializeProject(commands.getSong());
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(JSON.parse(project).schemaVersion, 3);
  assert.equal(project.includes('"mute"'), false);
  assert.equal(project.includes('"solo"'), false);
  const portable = JSON.stringify(toPortableProject(commands.getSong()));
  assert.equal(portable.includes('"mute"'), false);
  assert.equal(portable.includes('"solo"'), false);
  const restored = createCommands(deserializeProject(project));
  assert.equal(restored.getMixState().channels.melody.volume, 0.57);
  assert.equal(restored.getMixState().channels[ride].volume, 0.42);
  assert.ok(Object.values(restored.getMixState().channels).every((channel) => !channel.mute && !channel.solo));
  for (const schemaVersion of [1, 2]) {
    const legacy = deserializeProject({ schemaVersion, song });
    assert.ok(Object.values(createInstrumentMix(legacy).channels).every((channel) => channel.volume === 1));
  }
});

test("percussion channel identity is resolved exactly for track IDs containing colons", () => {
  const song = fixture();
  song.tracks[0].id = "track:with:colons";
  const commands = createCommands(song);
  commands.setInstrumentVolume(percussionChannelId(song.tracks[0].id, "ride"), 0.42);
  assert.deepEqual(commands.getSong().mix.percussion, { "track:with:colons": { ride: 0.42 } });
});
