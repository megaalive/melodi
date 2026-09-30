import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { deserializeProject, SCHEMA_VERSION, serializeProject } from "../src/core/serialization.js";
import { fromPortableProject, SHARE_VERSION, toPortableProject } from "../src/io/share.js";
import {
  GM_STANDARD_KIT,
  PERCUSSION_CAPABILITIES,
  percussionChokeGroup,
  percussionMidiNote
} from "../src/instruments/percussion.js";

function songFixture() {
  let next = 0;
  return createInitialSong(() => `song-${++next}`);
}

function deterministic(prefix) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

test("GM percussion kit memakai piece identity, bukan MIDI pitch sebagai canonical identity", () => {
  assert.equal(GM_STANDARD_KIT.id, "gm-standard");
  assert.equal(percussionMidiNote("gm-standard", "kick"), 36);
  assert.equal(percussionMidiNote("gm-standard", "snare"), 38);
  assert.equal(percussionChokeGroup("gm-standard", "open-hi-hat"), "hi-hat");
  assert.equal(percussionChokeGroup("gm-standard", "closed-hi-hat"), "hi-hat");
  assert.equal(percussionMidiNote("gm-standard", "missing"), null);
  assert.deepEqual(PERCUSSION_CAPABILITIES, ["velocity", "timing", "pan", "tuning", "articulation", "choke"]);
});

test("percussion hit masuk melalui command boundary dan track dibuat lazily", () => {
  const commands = createCommands(songFixture(), { idFactory: deterministic("perc") });
  const first = commands.addPercussionHit({ pieceId: "kick", startTick: 0, velocity: 110 });
  const second = commands.addPercussionHit({ pieceId: "closed-hi-hat", startTick: 240, velocity: 82 });

  assert.equal(first.trackId, second.trackId);
  const [track] = commands.getSong().tracks;
  assert.equal(track.kind, "percussion");
  assert.equal(track.role, "rhythm");
  assert.equal(track.kitId, "gm-standard");
  assert.deepEqual(track.events.map((hit) => [hit.pieceId, hit.startTick, hit.velocity, hit.articulation]), [
    ["kick", 0, 110, "normal"],
    ["closed-hi-hat", 240, 82, "normal"]
  ]);

  const updated = commands.updatePercussionHit(track.id, second.hit.id, { velocity: 64, pan: -0.25, tuning: 1 });
  assert.equal(updated.velocity, 64);
  assert.equal(updated.pan, -0.25);
  assert.equal(updated.tuning, 1);

  assert.equal(commands.deletePercussionHit(track.id, first.hit.id), true);
  assert.deepEqual(commands.getSong().tracks[0].events.map((hit) => hit.id), [second.hit.id]);
  commands.undo();
  assert.equal(commands.getSong().tracks[0].events.length, 2);
});

test("project schema v4 menyimpan percussion dan tetap membaca schema v1 tanpa tracks", () => {
  const commands = createCommands(songFixture(), { idFactory: deterministic("schema") });
  commands.addPercussionHit({ pieceId: "snare", startTick: 480, velocity: 96, articulation: "ghost" });

  const serialized = serializeProject(commands.getSong());
  const envelope = JSON.parse(serialized);
  assert.equal(SCHEMA_VERSION, 4);
  assert.equal(envelope.schemaVersion, 4);
  assert.equal(envelope.song.tracks[0].events[0].pieceId, "snare");
  assert.deepEqual(deserializeProject(serialized), commands.getSong());

  const legacySong = songFixture();
  delete legacySong.tracks;
  const migrated = deserializeProject({ schemaVersion: 1, song: legacySong });
  assert.deepEqual(migrated.tracks, []);
});

test("share v6 membawa percussion track tanpa membocorkan canonical IDs", () => {
  const commands = createCommands(songFixture(), { idFactory: deterministic("share-perc") });
  const added = commands.addPercussionHit({
    pieceId: "open-hi-hat",
    startTick: 720,
    velocity: 88,
    articulation: "normal",
    durationTicks: 480,
    pan: 0.2
  });
  const canonical = commands.getSong();
  const portable = toPortableProject(canonical);

  assert.equal(SHARE_VERSION, 6);
  const track = portable.project.tracks.find((item) => item.kind === "percussion");
  assert.ok(track);
  assert.equal(track.id, "percussion-1");
  assert.equal(track.kit, "gm-standard");
  assert.deepEqual(track.events, [["open-hi-hat", 720, 88, "normal", 480, 0.2, null]]);
  const serialized = JSON.stringify(portable);
  assert.equal(serialized.includes(added.trackId), false);
  assert.equal(serialized.includes(added.hit.id), false);

  const decoded = fromPortableProject(portable, deterministic("decoded"));
  assert.equal(decoded.tracks.length, 1);
  assert.notEqual(decoded.tracks[0].id, added.trackId);
  assert.notEqual(decoded.tracks[0].events[0].id, added.hit.id);
  assert.deepEqual(
    decoded.tracks[0].events.map(({ id, ...hit }) => hit),
    canonical.tracks[0].events.map(({ id, ...hit }) => hit)
  );
});
