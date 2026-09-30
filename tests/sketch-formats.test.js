import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createSong, createDefaultSketch } from "../src/core/model.js";
import { serializeProject, deserializeProject } from "../src/core/serialization.js";
import { toPortableProject, fromPortableProject, encodeSharePayload, decodeSharePayload } from "../src/io/share.js";
const ids = (prefix) => { let n = 0; return () => `${prefix}-${++n}`; };
function fixture() {
  const song = createInitialSong(ids("sketch"));
  song.sketch = { harmony: { style: "arpeggio", volume: 0.43 }, bass: { style: "root-fifth", volume: 0.78 } };
  song.mix = { melody: 0.66, percussion: {} };
  song.chords = [{ id: "chord", rootPitchClass: 9, quality: "minor", startTick: 0, durationTicks: 1440, locked: true }];
  return createSong(song);
}
test("sketch defaults normalize absent data and are detached from input and other songs", () => {
  const input = fixture(); delete input.sketch;
  const a = createSong(input), b = createSong(input);
  assert.deepEqual(a.sketch, createDefaultSketch());
  assert.equal(Object.hasOwn(input, "sketch"), false);
  a.sketch.harmony.volume = 0;
  assert.equal(b.sketch.harmony.volume, 1);
  const custom = fixture(), copied = createSong(custom);
  copied.sketch.bass.volume = 0;
  assert.equal(custom.sketch.bass.volume, 0.78);
});
test("canonical sketch strictly rejects unknown keys, styles and invalid volumes", () => {
  for (const sketch of [null, [], {}, { ...createDefaultSketch(), enabled: true },
    { ...createDefaultSketch(), harmony: { style: "block", volume: 1, mute: true } }]) {
    const song = fixture(); song.sketch = sketch;
    assert.throws(() => createSong(song), { code: "invalid-song-sketch" });
  }
  for (const channel of ["harmony", "bass"]) {
    for (const volume of [-0.1, 1.1, NaN, Infinity, "0.5", null, undefined]) {
      const song = fixture(); song.sketch[channel].volume = volume;
      assert.throws(() => createSong(song), { code: "invalid-song-sketch" });
    }
    const song = fixture(); song.sketch[channel].style = "swing";
    assert.throws(() => createSong(song), { code: "invalid-song-sketch" });
    for (const volume of [0, 1]) { song.sketch = createDefaultSketch(); song.sketch[channel].volume = volume; assert.equal(createSong(song).sketch[channel].volume, volume); }
  }
});
test("schema5 saves sketch choices while schemas1 through4 migrate to unity defaults", () => {
  const song = fixture(), project = JSON.parse(serializeProject(song));
  assert.equal(project.schemaVersion, 5);
  assert.deepEqual(deserializeProject(project), song);
  for (const schemaVersion of [1, 2, 3, 4]) {
    const legacy = structuredClone(project); legacy.schemaVersion = schemaVersion; delete legacy.song.sketch;
    legacy.song.sketch = { harmony: { style: "arpeggio", volume: 0.1 }, bass: { style: "root-fifth", volume: 0.2 } };
    if (schemaVersion < 4) delete legacy.song.chords[0].locked;
    const restored = deserializeProject(legacy);
    assert.deepEqual(restored.sketch, createDefaultSketch());
    assert.deepEqual(restored.mix, song.mix);
    assert.equal(restored.chords[0].locked, schemaVersion >= 4);
  }
});
test("Share7 stores semantic sketch settings without generated note events and restores fresh IDs", async () => {
  const song = fixture(), portable = toPortableProject(song);
  assert.equal(portable.version, 7);
  const harmony = portable.project.tracks.find(t => t.role === "harmony");
  const bass = portable.project.tracks.find(t => t.role === "bass");
  assert.equal(harmony.style, "arpeggio"); assert.equal(harmony.volume, 0.43);
  assert.equal(bass.style, "root-fifth"); assert.equal(bass.volume, 0.78);
  assert.deepEqual(bass.events, []);
  assert.equal(portable.project.tracks.filter(t => t.kind === "notes").length, 1);
  assert.equal(JSON.stringify(portable).includes('"mute"'), false);
  const payload = await encodeSharePayload(song, { CompressionStreamCtor: null });
  assert.ok(payload.startsWith("7.j."));
  const restored = await decodeSharePayload(payload, { idFactory: ids("receiver") });
  assert.deepEqual(restored.sketch, song.sketch); assert.deepEqual(restored.mix, song.mix);
  assert.equal(restored.chords[0].locked, true); assert.notEqual(restored.chords[0].id, song.chords[0].id);
  assert.deepEqual(toPortableProject(restored), portable);
});
test("Share1 through6 migrate missing sketch settings without altering legacy chord semantics", () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const portable = toPortableProject(fixture()); portable.version = version;
    portable.project.tracks = portable.project.tracks.filter(t => t.role !== "bass");
    const harmony = portable.project.tracks.find(t => t.role === "harmony"); delete harmony.style; delete harmony.volume;
    if (version < 6) harmony.events[0].pop();
    if (version < 3) portable.project.tracks[0].events = portable.project.tracks[0].events.map(row => row.slice(0, 4));
    const restored = fromPortableProject(portable, ids(`old${version}`));
    assert.deepEqual(restored.sketch, createDefaultSketch());
    assert.equal(restored.chords[0].locked, version >= 6);
    assert.equal(restored.mix?.melody ?? 1, version >= 5 ? 0.66 : 1);
  }
});
test("Share7 rejects malformed sketch tracks and invalid settings", () => {
  for (const mutate of [p => { p.project.tracks = p.project.tracks.filter(t => t.role !== "bass"); },
    p => { p.project.tracks.find(t => t.role === "bass").events = [[48, 0, 480]]; },
    p => { p.project.tracks.find(t => t.role === "harmony").volume = 2; },
    p => { p.project.tracks.find(t => t.role === "bass").style = "walking"; }]) {
    const portable = toPortableProject(fixture()); mutate(portable);
    assert.throws(() => fromPortableProject(portable, ids("bad")));
  }
});
test("schema5 and Share7 preserve percussion semantic volumes beside sketch settings", () => {
  const song = fixture();
  song.tracks = [{ id: "original-kit", kind: "percussion", role: "drums", kitId: "gm-standard", events: [] }];
  song.mix.percussion = { "original-kit": { kick: 0.78, snare: 0.66, ride: 0.43 } };
  const file = deserializeProject(serializeProject(song));
  assert.deepEqual(file.sketch, song.sketch);
  assert.deepEqual(file.mix, song.mix);
  const receiver = fromPortableProject(toPortableProject(song), ids("semantic"));
  assert.notEqual(receiver.tracks[0].id, "original-kit");
  assert.deepEqual(receiver.mix.percussion[receiver.tracks[0].id], { kick: 0.78, snare: 0.66, ride: 0.43 });
  assert.deepEqual(receiver.sketch, song.sketch);
  assert.equal(receiver.chords[0].locked, true);
});
