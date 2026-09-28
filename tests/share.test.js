import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createSong } from "../src/core/model.js";
import {
  SHARE_FORMAT,
  SHARE_VERSION,
  createShareUrl,
  decodeShareHash,
  decodeSharePayload,
  encodeSharePayload,
  fromPortableProject,
  toPortableProject
} from "../src/io/share.js";

function fixture() {
  let next = 0;
  const song = createInitialSong(() => `share-${++next}`);
  song.lyrics.rawText = "still got";
  song.lyrics.syllables = [
    { id: "share-syllable", text: "still", noteIds: [song.notes[0].id, song.notes[1].id] }
  ];
  song.chords = [
    { id: "share-chord", rootPitchClass: 9, quality: "m", startTick: 0, durationTicks: 1440 }
  ];
  return createSong(song);
}

function deterministicIds(prefix = "decoded") {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

test("default song portable form matches the selected shared project", () => {
  let next = 0;
  const portable = toPortableProject(createInitialSong(() => `baseline-${++next}`));
  assert.deepEqual(portable.project.transport, [480, 81, 6, 8]);
  assert.deepEqual(portable.project.tonality, ["Am", "minor", [0, 2, 3, 5, 7, 8, 10]]);
  assert.deepEqual(portable.project.arrangement.phrases, [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]]);
  assert.deepEqual(portable.project.arrangement.sections, [["Melodi", [0]]]);
  const melody = portable.project.tracks.find((track) => track.id === "melody");
  assert.deepEqual(melody.events, [
    [69, 0, 480, 0],
    [74, 480, 240, 0],
    [76, 720, 240, 0],
    [76, 960, 720, 0, [[0, 0], [0.3, 1], [1, 1]]],
    [76, 1680, 480, 0, [[0, 0], [0.3, 1], [1, 1]]],
    [76, 2160, 240, 0],
    [74, 2400, 480, 0],
    [72, 2880, 480, 0],
    [74, 3360, 240, 0],
    [74, 3600, 720, 0, [[0, 0], [0.28, 2], [1, 2]]],
    [74, 4320, 720, 0, [[0, 0], [0.22, 2], [0.42, 2], [1, 0]]],
    [72, 5040, 720, 0],
    [69, 5760, 240, 0],
    [71, 6000, 240, 0],
    [72, 6240, 240, 0],
    [72, 6480, 720, 0, [[0, 0], [0.28, 2], [1, 2]]],
    [72, 7200, 720, 0, [[0, 0], [0.22, 2], [0.42, 2], [1, 0]]],
    [71, 7920, 720, 0],
    [69, 8640, 720, 0],
    [67, 9360, 720, 0],
    [67, 10080, 1440, 0, [[0, 0], [0.24, 2], [1, 2]]]
  ]);
});

test("portable share envelope is versioned, track-oriented, and omits canonical UUIDs", () => {
  const song = fixture();
  const portable = toPortableProject(song);
  assert.equal(portable.format, SHARE_FORMAT);
  assert.equal(portable.version, SHARE_VERSION);
  assert.deepEqual(portable.project.transport, [480, 81, 6, 8]);
  assert.ok(portable.project.tracks.some((track) => track.kind === "notes" && track.role === "lead"));
  assert.ok(portable.project.tracks.some((track) => track.kind === "chords"));

  const serialized = JSON.stringify(portable);
  for (const id of [song.id, ...song.notes.map((note) => note.id), ...song.phrases.map((phrase) => phrase.id)]) {
    assert.equal(serialized.includes(id), false);
  }
});

test("portable share round-trip preserves musical data while regenerating IDs", () => {
  const song = fixture();
  const portable = toPortableProject(song);
  portable.project.tracks.push({
    id: "future-drums",
    kind: "drums",
    role: "accompaniment",
    events: [[0, 36, 100]]
  });

  const restored = fromPortableProject(portable, deterministicIds());
  assert.deepEqual(toPortableProject(restored), toPortableProject(song));
  assert.notEqual(restored.id, song.id);
  assert.notEqual(restored.notes[0].id, song.notes[0].id);
  assert.deepEqual(restored.notes[3].pitchBend, song.notes[3].pitchBend);
  assert.equal(restored.lyrics.rawText, "still got");
  assert.deepEqual(restored.lyrics.syllables[0].noteIds, [restored.notes[0].id, restored.notes[1].id]);
  assert.equal(restored.chords[0].quality, "m");
});

test("share payload encodes and decodes without external compression libraries", async () => {
  const song = fixture();
  const payload = await encodeSharePayload(song, { CompressionStreamCtor: null });
  assert.match(payload, /^1\.j\.[A-Za-z0-9_-]+$/);
  const restored = await decodeSharePayload(payload, {
    DecompressionStreamCtor: null,
    idFactory: deterministicIds("raw")
  });
  assert.deepEqual(toPortableProject(restored), toPortableProject(song));
});

test("gzip share payload round-trips when native compression streams are available", async (t) => {
  if (typeof CompressionStream !== "function" || typeof DecompressionStream !== "function") {
    t.skip("native compression streams unavailable");
    return;
  }
  const song = fixture();
  const payload = await encodeSharePayload(song);
  assert.match(payload, /^1\.g\.[A-Za-z0-9_-]+$/);
  const restored = await decodeSharePayload(payload, { idFactory: deterministicIds("gzip") });
  assert.deepEqual(toPortableProject(restored), toPortableProject(song));
});

test("share URL uses the fragment and decodes independently of query parameters", async () => {
  const song = fixture();
  const urlText = await createShareUrl(song, "https://megaalive.github.io/melodi/?lang=id#old", {
    CompressionStreamCtor: null
  });
  const url = new URL(urlText);
  assert.equal(url.origin + url.pathname, "https://megaalive.github.io/melodi/");
  assert.equal(url.search, "?lang=id");
  assert.match(url.hash, /^#m=1\.j\./);

  const restored = await decodeShareHash(url.hash, {
    DecompressionStreamCtor: null,
    idFactory: deterministicIds("hash")
  });
  assert.deepEqual(toPortableProject(restored), toPortableProject(song));
});

test("share decoder rejects malformed or unsupported envelopes", async () => {
  await assert.rejects(() => decodeSharePayload("2.j.AA", { DecompressionStreamCtor: null }), {
    code: "unsupported-share"
  });
  assert.throws(() => fromPortableProject({ format: "other", version: 1, project: {} }), {
    code: "unsupported-share"
  });

  const portable = toPortableProject(fixture());
  portable.project.arrangement.phrases = [[999]];
  assert.throws(() => fromPortableProject(portable, deterministicIds("bad")), {
    code: "malformed-share"
  });
});
