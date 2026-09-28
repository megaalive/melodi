import test from "node:test";
import assert from "node:assert/strict";
import { chooseGuitarFingering, findGuitarPositions, fretCenterX, MAX_FRET, STANDARD_TUNING } from "../src/ui/guitar-view.js";
import { createInitialSong } from "../src/core/model.js";

test("standard tuning spans E2 to E4 across six strings", () => {
  assert.deepEqual(STANDARD_TUNING, [40, 45, 50, 55, 59, 64]);
  assert.equal(MAX_FRET, 24);
});

test("a fret centre sits between its own fret wires, so labels and hits cannot drift apart", () => {
  const labelWidth = 34;
  const fretWidth = 26;
  const options = { labelWidth, fretWidth };
  for (let fret = 0; fret <= MAX_FRET; fret += 1) {
    const centre = fretCenterX(fret, options);
    //-space of a fret is bounded by the two wires around it; wire n is at labelWidth + (n+1)*fretWidth.
    const leftWire = labelWidth + fret * fretWidth;
    const rightWire = labelWidth + (fret + 1) * fretWidth;
    assert.ok(centre > leftWire, `fret ${fret} centre left of its own wire`);
    assert.ok(centre < rightWire, `fret ${fret} centre right of its own wire`);
    assert.equal(centre, (leftWire + rightWire) / 2);
    // Fret spaces must never overlap.
    assert.equal(fretCenterX(fret + 1, options) - centre, fretWidth);
  }
});

// Fret 0 is the nut itself, not the space after the first wire.
test("fret 0 is the nut itself, not the space after the first wire", () => {
  const labelWidth = 34;
  const fretWidth = 26;
  // Fret 0 is the nut itself, not the space after the first wire.
  const centre = fretCenterX(0, { labelWidth, fretWidth });
  // The nut is drawn from labelWidth with width fretWidth, so an open string
  // marker must land in the middle of that bar.
  assert.equal(centre, labelWidth + fretWidth / 2);
  assert.ok(centre < labelWidth + fretWidth);
});

test("every playable position maps to a fret centre inside the drawn neck", () => {
  const neckWidth = 34 + (MAX_FRET + 1) * 26;
  for (let pitch = 0; pitch <= 127; pitch += 1) {
    for (const position of findGuitarPositions(pitch)) {
      const centre = fretCenterX(position.fret);
      assert.ok(centre > 34, `pitch ${pitch} fret ${position.fret} lands left of the nut`);
      assert.ok(centre < neckWidth, `pitch ${pitch} fret ${position.fret} lands off the neck`);
      assert.ok(Number.isInteger(position.fret) && position.fret >= 0 && position.fret <= MAX_FRET);
    }
  }
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

test("fingering route follows one playable path instead of highlighting every duplicate equally", () => {
  let next = 0;
  const song = createInitialSong(() => `guitar-route-${++next}`);
  const route = chooseGuitarFingering(song.notes);
  const ordered = [...song.notes].sort((a, b) => a.startTick - b.startTick);

  assert.deepEqual(route.get(ordered[0].id), { string: 3, fret: 14 });
  assert.deepEqual(route.get(ordered[1].id), { string: 2, fret: 15 });
  assert.deepEqual(route.get(ordered[2].id), { string: 2, fret: 17 });
  assert.deepEqual(route.get(ordered[7].id), { string: 2, fret: 13 });

  for (const note of ordered) {
    const chosen = route.get(note.id);
    assert.ok(chosen, `missing fingering for ${note.id}`);
    assert.ok(findGuitarPositions(note.pitch).some(
      (position) => position.string === chosen.string && position.fret === chosen.fret
    ));
  }
});

