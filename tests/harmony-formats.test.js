import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createSong } from "../src/core/model.js";
import { deserializeProject, serializeProject } from "../src/core/serialization.js";
import { fromPortableProject, toPortableProject, encodeSharePayload, decodeSharePayload } from "../src/io/share.js";
import { projectSongToAbc } from "../src/notation/abc.js";

function ids(prefix) { let next = 0; return () => `${prefix}-${++next}`; }
function fixture() {
  const song = createInitialSong(ids("format"));
  song.chords = [{ id: "chord", rootPitchClass: 9, quality: "minor", startTick: 0, durationTicks: 1440, locked: true }];
  song.mix = { melody: 0.43, percussion: {} };
  return createSong(song);
}

test("canonical chord lock defaults false and rejects nonboolean flags", () => {
  const song = fixture();
  delete song.chords[0].locked;
  assert.equal(createSong(song).chords[0].locked, false);
  assert.equal(Object.hasOwn(song.chords[0], "locked"), false);
  for (const locked of [null, 0, 1, "false", undefined]) {
    song.chords[0].locked = locked;
    assert.throws(() => createSong(song), { code: "invalid-chord" });
  }
});

test("schema4 explicitly stores lock and preserves volume; old schemas migrate unlocked", () => {
  const song = fixture();
  const project = JSON.parse(serializeProject(song));
  assert.equal(project.schemaVersion, 5);
  assert.equal(project.song.chords[0].locked, true);
  assert.deepEqual(deserializeProject(project), song);
  for (const schemaVersion of [1, 2, 3]) {
    const old = structuredClone(project);
    old.schemaVersion = schemaVersion;
    delete old.song.chords[0].locked;
    const restored = deserializeProject(old);
    assert.equal(restored.chords[0].locked, false);
    assert.deepEqual(restored.mix, song.mix);
  }
  delete project.song.chords[0].locked;
  assert.throws(() => deserializeProject(project), { code: "invalid-chord" });
});

test("Share6 compact lock roundtrip regenerates IDs without changing volume", async () => {
  const song = fixture();
  const portable = toPortableProject(song);
  assert.equal(portable.version, 7);
  assert.deepEqual(portable.project.tracks.find((track) => track.kind === "chords").events, [[9, "minor", 0, 1440, 1]]);
  const payload = await encodeSharePayload(song, { CompressionStreamCtor: null });
  assert.ok(payload.startsWith("7.j."));
  const restored = await decodeSharePayload(payload, { idFactory: ids("receiver") });
  assert.equal(restored.chords[0].locked, true);
  assert.notEqual(restored.chords[0].id, song.chords[0].id);
  assert.deepEqual(restored.mix, song.mix);
  assert.deepEqual(toPortableProject(restored), portable);
});

test("Share1 through5 old four-item chord tuples remain unlocked", () => {
  for (const version of [1, 2, 3, 4, 5]) {
    const portable = toPortableProject(fixture());
    portable.version = version;
    const melody = portable.project.tracks.find((track) => track.kind === "notes");
    melody.events = melody.events.map((row) => row.slice(0, 4));
    portable.project.tracks.find((track) => track.kind === "chords").events = [[9, "minor", 0, 1440]];
    const restored = fromPortableProject(portable, ids(`v${version}`));
    assert.equal(restored.chords[0].locked, false);
    assert.equal(restored.mix?.melody ?? 1, version >= 5 ? 0.43 : 1);
  }
});

test("Share6 refuses malformed chord flags and legacy flag extensions", () => {
  for (const flags of [-1, 2, 1.5, "1", null, undefined]) {
    const portable = toPortableProject(fixture());
    portable.project.tracks.find((track) => track.kind === "chords").events[0][4] = flags;
    assert.throws(() => fromPortableProject(portable, ids("bad")), { code: "malformed-share" });
  }
  const portable = toPortableProject(fixture());
  portable.version = 5;
  assert.throws(() => fromPortableProject(portable, ids("old")), { code: "malformed-share" });
});

test("Score preserves chord lock and stable major/minor/diminished symbols", () => {
  for (const [quality, symbol] of [["major", "A"], ["minor", "Am"], ["diminished", "Adim"]]) {
    const song = fixture();
    song.chords[0].quality = quality;
    const projected = projectSongToAbc(song);
    assert.ok(projected.abc.includes(`"${symbol}"`));
    assert.equal(projected.projection.measures[0].chords[0].locked, true);
    assert.equal(projected.projection.measures[0].chords[0].chordId, "chord");
  }
});

test("explicit harmony tracks reject missing/null events across supported Share versions", () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    for (const events of [undefined, null, {}, "chords"]) {
      const portable = toPortableProject(fixture());
      portable.version = version;
      const melody = portable.project.tracks.find((track) => track.kind === "notes");
      melody.events = melody.events.map((row) => row.slice(0, 4));
      portable.project.tracks.find((track) => track.kind === "chords").events = events;
      assert.throws(() => fromPortableProject(portable, ids("malformed")), { code: "malformed-share" });
    }
  }
});

test("legacy project malformed chord rows cannot be repaired by lock migration", () => {
  for (const schemaVersion of [1, 2, 3, 4]) {
    for (const chord of [null, [], 3, "chord", { locked: false }]) {
      const song = fixture();
      song.chords = [chord];
      assert.throws(() => deserializeProject({ schemaVersion, song }), { code: "invalid-chord" });
    }
  }
});

test("Share5 and6 semantic piece volumes survive fresh IDs alongside harmony", () => {
  for (const version of [5, 6]) {
    const song = fixture();
    song.tracks = [{ id: "original-kit", kind: "percussion", role: "drums", kitId: "gm-standard", events: [] }];
    song.mix.percussion = { "original-kit": { ride: 0.43, kick: 0.78, snare: 0.66 } };
    const portable = toPortableProject(song);
    portable.version = version;
    if (version === 5) portable.project.tracks.find((track) => track.kind === "chords").events[0].pop();
    const restored = fromPortableProject(portable, ids(`semantic-v${version}`));
    assert.notEqual(restored.tracks[0].id, "original-kit");
    assert.deepEqual(restored.mix.percussion[restored.tracks[0].id], { ride: 0.43, kick: 0.78, snare: 0.66 });
    assert.equal(Object.hasOwn(restored.mix.percussion, "original-kit"), false);
    assert.equal(restored.mix.melody, 0.43);
    assert.equal(restored.chords[0].locked, version === 6);
  }
});
