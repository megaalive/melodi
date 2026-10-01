import test from "node:test";
import assert from "node:assert/strict";
import { PPQ } from "../src/core/model.js";
import {
  appendPhraseTracePoint,
  createRollGeometry,
  drawNoteInputFromDrag,
  drawPhraseInputsFromTrace,
  MAX_ROLL_BARS,
  midiToY,
  moveDeltaFromDrag,
  noteHitLayout,
  resizeDurationFromDrag,
  SNAP_TICKS,
  snapTick,
  tickToX,
  xToTick,
  yToMidi
} from "../src/ui/piano-roll.js";

test("a continuous four-point trace becomes four snapped notes with the traced pitches", () => {
  const geometry = createRollGeometry({ endTick: 1920 });
  const points = [60, 64, 67, 65].map((pitch, index) => ({
    x: tickToX(index * 240, geometry),
    y: midiToY(pitch, geometry) + geometry.rowHeight / 2
  }));

  assert.deepEqual(drawPhraseInputsFromTrace(points, geometry, "1/8"), [
    { pitch: 60, startTick: 0, durationTicks: 240 },
    { pitch: 64, startTick: 240, durationTicks: 240 },
    { pitch: 67, startTick: 480, durationTicks: 240 },
    { pitch: 65, startTick: 720, durationTicks: 240 }
  ]);
});

test("short horizontal gestures remain single-note drags and reverse sweeps stay chronological", () => {
  const geometry = createRollGeometry({ endTick: 1920 });
  const short = [60, 60].map((pitch, index) => ({
    x: tickToX(index * 240, geometry),
    y: midiToY(pitch, geometry) + geometry.rowHeight / 2
  }));
  assert.equal(drawPhraseInputsFromTrace(short, geometry, "1/8"), null);

  const reverse = [67, 64, 60].map((pitch, index) => ({
    x: tickToX((2 - index) * 240, geometry),
    y: midiToY(pitch, geometry) + geometry.rowHeight / 2
  }));
  assert.deepEqual(drawPhraseInputsFromTrace(reverse, geometry, "1/8"), [
    { pitch: 60, startTick: 0, durationTicks: 240 },
    { pitch: 64, startTick: 240, durationTicks: 240 },
    { pitch: 67, startTick: 480, durationTicks: 240 }
  ]);
});

test("pointer release endpoint is retained when it arrives without a final move event", () => {
  const geometry = createRollGeometry({ endTick: 1920 });
  const path = [60, 64, 67].map((pitch, index) => ({
    x: tickToX(index * 240, geometry),
    y: midiToY(pitch, geometry) + geometry.rowHeight / 2
  }));
  const release = {
    x: tickToX(720, geometry),
    y: midiToY(65, geometry) + geometry.rowHeight / 2
  };

  assert.deepEqual(drawPhraseInputsFromTrace(appendPhraseTracePoint(path, release), geometry), [
    { pitch: 60, startTick: 0, durationTicks: 240 },
    { pitch: 64, startTick: 240, durationTicks: 240 },
    { pitch: 67, startTick: 480, durationTicks: 240 },
    { pitch: 65, startTick: 720, durationTicks: 240 }
  ]);
});

test("snap intervals come from PPQ and round ties upward deterministically", () => {
  assert.deepEqual(SNAP_TICKS, { "1/4": 480, "1/8": 240, "1/16": 120 });
  assert.equal(SNAP_TICKS["1/4"], PPQ);
  assert.equal(SNAP_TICKS["1/8"], PPQ / 2);
  assert.equal(SNAP_TICKS["1/16"], PPQ / 4);
  assert.equal(snapTick(60, "1/16"), 120);
  assert.equal(snapTick(180, "1/8"), 240);
  assert.equal(snapTick(240, "1/4"), 480);
  assert.equal(snapTick(-80, "1/8"), 0);
});

test("tick to x and back preserves canonical tick positions on every supported snap", () => {
  const geometry = createRollGeometry({ endTick: 5000 });
  for (const tick of [0, 120, 240, 480, 1440, 1920, 5000]) {
    assert.equal(xToTick(tickToX(tick, geometry), geometry), tick);
  }
  assert.equal(tickToX(480, geometry) - tickToX(0, geometry), geometry.pixelsPerQuarter);
  assert.equal(xToTick(tickToX(240, geometry) + 10, geometry), 300);
});

test("MIDI pitch to row and back matches the R0 C4=60 convention including range edges", () => {
  const geometry = createRollGeometry();
  assert.equal(yToMidi(midiToY(60, geometry) + geometry.rowHeight / 2, geometry), 60);
  for (const midi of [0, 48, 60, 83, 127]) {
    assert.equal(yToMidi(midiToY(midi, geometry) + geometry.rowHeight / 2, geometry), midi);
  }
  assert.deepEqual([geometry.minMidi, geometry.maxMidi], [48, 83]);
});

test("grid geometry derives beat and bar boundaries from time signature", () => {
  const common = createRollGeometry({ endTick: 2880, numerator: 4, denominator: 4 });
  assert.equal(common.beatTicks, 480);
  assert.equal(common.barTicks, 1920);
  const sixEight = createRollGeometry({ endTick: 2880, numerator: 6, denominator: 8 });
  assert.equal(sixEight.beatTicks, 240);
  assert.equal(sixEight.barTicks, 1440);
  assert.ok(sixEight.gridTicks >= 2880);
});

test("roll geometry stays bounded when a project or playhead has a very large tick", () => {
  const geometry = createRollGeometry({ endTick: 1_000_000_000 });
  assert.equal(geometry.gridTicks, geometry.maxGridTicks);
  assert.equal(geometry.gridTicks / geometry.barTicks, MAX_ROLL_BARS);
  assert.ok(Number.isFinite(geometry.width));
  assert.ok(geometry.width < 25_000);
  assert.throws(() => createRollGeometry({ endTick: -1 }), /Invalid grid end tick/);
});

test("bounded roll windows can focus and round-trip late absolute ticks", () => {
  const focusTick = 1_000_000_000;
  const geometry = createRollGeometry({ endTick: focusTick, focusTick });
  assert.equal(geometry.gridTicks, geometry.maxGridTicks);
  assert.ok(geometry.startTick > 0);
  assert.ok(geometry.startTick <= focusTick);
  assert.ok(geometry.endTick > focusTick);
  assert.ok(tickToX(focusTick, geometry) > geometry.labelWidth);
  assert.ok(tickToX(focusTick, geometry) < geometry.width);
  assert.equal(xToTick(tickToX(focusTick, geometry), geometry), focusTick);
  assert.equal(geometry.startTick % geometry.barTicks, 0);
});

test("roll zoom supports real zoom-out, fit at 100%, and zoom-in", () => {
  const base = createRollGeometry({ endTick: 2880, viewportWidth: 1113, zoom: 1 });
  const out75 = createRollGeometry({ endTick: 2880, viewportWidth: 1113, zoom: 0.75 });
  const out50 = createRollGeometry({ endTick: 2880, viewportWidth: 1113, zoom: 0.5 });
  const zoomed = createRollGeometry({ endTick: 2880, viewportWidth: 1113, zoom: 2 });

  assert.ok(out75.endTick > base.endTick, "75% harus menampilkan lebih banyak timeline");
  assert.ok(out50.endTick > out75.endTick, "50% harus menampilkan timeline lebih luas dari 75%");
  assert.ok(out50.width >= 1113 * 0.9, "zoom-out tidak boleh meninggalkan ruang mati besar");
  assert.equal(zoomed.pixelsPerQuarter, base.pixelsPerQuarter * 2);
  assert.ok(zoomed.width > base.width, "zoom-in harus memperlebar grid agar panel scroll");

  for (const geometry of [out50, out75, base, zoomed]) {
    for (const tick of [0, 120, 240, 480, 1440, 2880]) {
      assert.equal(xToTick(tickToX(tick, geometry), geometry), tick);
      assert.ok(Number.isSafeInteger(xToTick(tickToX(tick, geometry), geometry)));
    }
  }
  assert.throws(() => createRollGeometry({ endTick: 2880, zoom: 0.25 }), /Invalid roll zoom/);
  assert.throws(() => createRollGeometry({ endTick: 2880, zoom: 4.25 }), /Invalid roll zoom/);
  assert.throws(() => createRollGeometry({ endTick: 2880, zoom: Number.NaN }), /Invalid roll zoom/);
});

test("short same-pitch notes keep disjoint in-note move and resize targets", () => {
  const geometry = createRollGeometry({ endTick: 1000 });
  const notes = [0, 120, 240, 360].map((startTick, index) => ({
    id: `short-${index}`,
    pitch: 60,
    startTick,
    durationTicks: 120
  }));
  const targets = notes.map((note) => noteHitLayout(note, tickToX(note.startTick, geometry), 20, geometry, notes));
  for (const [index, target] of targets.slice(0, 3).entries()) {
    assert.equal(target.moveX, tickToX(notes[index].startTick, geometry));
    assert.equal(target.moveWidth, 10);
    assert.equal(target.resizeX, target.moveX + target.moveWidth);
    assert.equal(target.resizeWidth, 10);
  }
  for (let index = 1; index < 3; index += 1) {
    const previousEnd = targets[index - 1].resizeX + targets[index - 1].resizeWidth;
    assert.ok(previousEnd <= targets[index].moveX);
  }
  const isolated = { id: "isolated", pitch: 72, startTick: 960, durationTicks: 1 };
  const isolatedX = tickToX(isolated.startTick, geometry);
  const isolatedWidth = geometry.pixelsPerQuarter / geometry.ppq;
  const isolatedTargets = noteHitLayout(isolated, isolatedX, isolatedWidth, geometry, [...notes, isolated]);
  assert.deepEqual(
    [isolatedTargets.moveX, isolatedTargets.moveWidth, isolatedTargets.resizeX, isolatedTargets.resizeWidth],
    [isolatedX - 24, 24, isolatedX + isolatedWidth, 24]
  );
});

test("move drag deltas snap consistently and clamp the group to valid tick and MIDI boundaries", () => {
  const geometry = createRollGeometry();
  const drag = {
    startX: 100,
    startY: 100,
    snap: "1/16",
    originals: [
      { startTick: 240, pitch: 60 },
      { startTick: 480, pitch: 64 }
    ]
  };
  assert.deepEqual(moveDeltaFromDrag(drag, { x: -500, y: 2100 }, geometry), { tickDelta: -240, pitchDelta: -60 });
  assert.deepEqual(moveDeltaFromDrag(drag, { x: 1000, y: -1900 }, geometry), { tickDelta: 5400, pitchDelta: 63 });
});

test("resize drag uses pointer delta, preserves sub-snap notes on neutral movement, and enforces snap minimum", () => {
  const geometry = createRollGeometry();
  assert.equal(resizeDurationFromDrag(240, 100, 97, geometry, "1/16"), 240);
  assert.equal(resizeDurationFromDrag(1, 100, 100, geometry, "1/16"), 1);
  assert.equal(resizeDurationFromDrag(240, 100, 160, geometry, "1/16"), 600);
  assert.equal(resizeDurationFromDrag(240, 100, 40, geometry, "1/16"), 120);
});

test("draw input snaps click duration and horizontal drag without changing pitch", () => {
  const geometry = createRollGeometry({ endTick: 1920 });
  const y = midiToY(64, geometry) + geometry.rowHeight / 2;
  assert.deepEqual(drawNoteInputFromDrag(
    { x: tickToX(480, geometry), y },
    { x: tickToX(480, geometry), y },
    geometry,
    "1/8"
  ), { pitch: 64, startTick: 480, durationTicks: 240 });

  assert.deepEqual(drawNoteInputFromDrag(
    { x: tickToX(960, geometry), y },
    { x: tickToX(240, geometry), y: midiToY(72, geometry) },
    geometry,
    "1/8"
  ), { pitch: 64, startTick: 240, durationTicks: 720 });
});
