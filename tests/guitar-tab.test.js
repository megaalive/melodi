import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { createGuitarTabGeometry, projectGuitarTab } from "../src/ui/guitar-tab.js";

function defaultSong() {
  let next = 0;
  return createInitialSong(() => `guitar-tab-${++next}`);
}

test("TAB memproyeksikan fingering frase tanpa mengubah pitch canonical", () => {
  const song = defaultSong();
  const events = projectGuitarTab(song);
  assert.equal(events.length, song.notes.length);
  assert.deepEqual(
    events.slice(0, 3).map(({ string, fret }) => ({ string, fret })),
    [
      { string: 3, fret: 14 },
      { string: 2, fret: 15 },
      { string: 2, fret: 17 }
    ]
  );
  assert.deepEqual(events.map((event) => event.pitch), song.notes.map((note) => note.pitch));
  assert.deepEqual(events.map((event) => event.startTick), song.notes.map((note) => note.startTick));
});

test("TAB membawa bend dan vibrato dari canonical expression", () => {
  const events = projectGuitarTab(defaultSong());
  assert.equal(events[0].bend, "");
  assert.equal(events[1].vibratoDepth, 0.05);
  assert.equal(events[3].bend, "½↑");
  assert.equal(events[3].vibratoDepth, 0.05);
  assert.equal(events[10].bend, "1↑↓");
  assert.equal(events[20].bend, "1↑");
  assert.equal(events[20].vibratoDepth, 0.2);
});

test("geometry TAB mengikuti meter dan panjang canonical song", () => {
  const song = defaultSong();
  const geometry = createGuitarTabGeometry(song, 1000);
  assert.equal(geometry.beatTicks, 240);
  assert.equal(geometry.barTicks, 1440);
  assert.equal(geometry.endTick, 11520);
  assert.ok(geometry.width > 1000);
  assert.ok(geometry.width <= 12000);
  assert.ok(geometry.pixelsPerTick > 0);
});
