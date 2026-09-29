import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { drumGridEndTick, projectDrumGrid } from "../src/ui/drum-grid.js";

function songFixture() {
  let next = 0;
  return createInitialSong(() => `drum-grid-${++next}`);
}

test("Drum Grid mengikuti meter, Snap, dan panjang canonical song", () => {
  const song = songFixture();
  const projection = projectDrumGrid(song, { snap: "1/8" });
  assert.equal(projection.snapTicks, 240);
  assert.equal(projection.beatTicks, 240);
  assert.equal(projection.barTicks, 1440);
  assert.equal(projection.endTick, 11520);
  assert.equal(projection.columns.length, 48);
  assert.equal(projection.kit.id, "gm-standard");
  assert.equal(projection.kit.pieces.at(-1).id, "kick");
});

test("Hit percussion diproyeksikan berdasarkan piece identity, bukan MIDI pitch", () => {
  const song = songFixture();
  song.tracks.push({
    id: "drums-1",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "hit-1", pieceId: "kick", startTick: 0, velocity: 120, articulation: "normal" },
      { id: "hit-2", pieceId: "snare", startTick: 720, velocity: 78, articulation: "ghost" }
    ]
  });
  const projection = projectDrumGrid(song, { snap: "1/8" });
  assert.equal(projection.cells.get("kick@0")[0].velocity, 120);
  assert.equal(projection.cells.get("snare@720")[0].articulation, "ghost");
  assert.equal(projection.cells.has("36@0"), false);
});

test("microtiming memakai cell terdekat tanpa membuang collision", () => {
  const song = songFixture();
  song.tracks.push({
    id: "drums-1",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "late", pieceId: "closed-hi-hat", startTick: 250, velocity: 90, articulation: "normal" },
      { id: "early", pieceId: "closed-hi-hat", startTick: 235, velocity: 70, articulation: "normal" }
    ]
  });
  const hits = projectDrumGrid(song, { snap: "1/8" }).cells.get("closed-hi-hat@240");
  assert.equal(hits.length, 2);
  assert.equal(hits[0].hitId, "early");
  assert.equal(hits[0].timingOffset, -5);
  assert.equal(hits[1].timingOffset, 10);
});

test("percussion dapat memperpanjang Drum Grid melewati melody", () => {
  const song = songFixture();
  song.tracks.push({
    id: "drums-1",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "tail", pieceId: "crash", startTick: 12000, velocity: 100, articulation: "normal", durationTicks: 480 }
    ]
  });
  assert.equal(drumGridEndTick(song), 12960);
});
