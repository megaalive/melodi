import test from "node:test";
import assert from "node:assert/strict";
import { findGuitarPositions, MAX_FRET, STANDARD_TUNING } from "../src/ui/guitar-view.js";

test("standard tuning spans E2 to E4 across six strings", () => {
  assert.deepEqual(STANDARD_TUNING, [40, 45, 50, 55, 59, 64]);
  assert.equal(MAX_FRET, 24);
});

test("open strings are reported on the string a player would call them", () => {
  // E2 hanya ada di senar 6 terbuka; tidak ada senar yang lebih rendah.
  assert.deepEqual(findGuitarPositions(40), [{ string: 6, fret: 0 }]);
  // A2 ada di senar 5 terbuka dan juga di senar 6 fret 5.
  assert.deepEqual(findGuitarPositions(45), [{ string: 6, fret: 5 }, { string: 5, fret: 0 }]);
  // E4 tinggi bisa dimainkan di semua senar; senar 6 hanya mencapai di fret 24.
  assert.deepEqual(findGuitarPositions(64), [
    { string: 6, fret: 24 },
    { string: 5, fret: 19 },
    { string: 4, fret: 14 },
    { string: 3, fret: 9 },
    { string: 2, fret: 5 },
    { string: 1, fret: 0 }
  ]);
});

test("C4 is reachable on five strings and stays numbered from low to high string", () => {
  assert.deepEqual(findGuitarPositions(60), [
    { string: 6, fret: 20 },
    { string: 5, fret: 15 },
    { string: 4, fret: 10 },
    { string: 3, fret: 5 },
    { string: 2, fret: 1 }
  ]);
  // Senar 1 (e) butuh fret -4, jadi tidak masuk.
  assert.equal(findGuitarPositions(60).some((position) => position.string === 1), false);
});

test("out of range pitches return no positions instead of a wrong fret", () => {
  assert.deepEqual(findGuitarPositions(20), []);
  assert.deepEqual(findGuitarPositions(110), []);
  assert.deepEqual(findGuitarPositions(20, { maxFret: 24 }), []);
});

test("non integer or out of MIDI bounds pitches are rejected", () => {
  for (const value of [undefined, null, 60.5, -1, 128, "60", {}]) {
    assert.deepEqual(findGuitarPositions(value), []);
  }
});

test("a shorter neck drops the high positions and keeps the low ones", () => {
  const wide = findGuitarPositions(60);
  const short = findGuitarPositions(60, { maxFret: 12 });
  assert.equal(short.length, 3);
  assert.deepEqual(short, [
    { string: 4, fret: 10 },
    { string: 3, fret: 5 },
    { string: 2, fret: 1 }
  ]);
  assert.ok(wide.length > short.length);
});
