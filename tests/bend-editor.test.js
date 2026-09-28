import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseBendRange,
  formatBendUnits,
  insertBendPoint,
  insertBendPointAt,
  normalizeBendDraft,
  snapBendPoint
} from "../src/ui/bend-editor.js";

test("bend units follow guitar bend notation", () => {
  assert.equal(formatBendUnits(0), "0");
  assert.equal(formatBendUnits(1), "+½");
  assert.equal(formatBendUnits(2), "+1");
  assert.equal(formatBendUnits(3), "+1½");
  assert.equal(formatBendUnits(-2), "−1");
});

test("bend draft always has note-start and note-end points", () => {
  assert.deepEqual(normalizeBendDraft(null), [
    { position: 0, semitones: 0 },
    { position: 1, semitones: 0 }
  ]);
  assert.deepEqual(normalizeBendDraft([
    { position: 0.25, semitones: 1 },
    { position: 0.75, semitones: 2 }
  ]), [
    { position: 0, semitones: 1 },
    { position: 0.25, semitones: 1 },
    { position: 0.75, semitones: 2 },
    { position: 1, semitones: 2 }
  ]);
});

test("adding points makes arbitrary staged bend curves possible", () => {
  let points = normalizeBendDraft(null);
  points = insertBendPoint(points); // 50%
  points = insertBendPoint(points); // 25%
  points = insertBendPoint(points); // 75%
  assert.deepEqual(points.map((point) => point.position), [0, 0.25, 0.5, 0.75, 1]);

  // Contoh user: naik 1/2, tahan, naik ke 1, lalu release 1 ke pitch awal.
  points[1].semitones = 1;
  points[2].semitones = 1;
  points[3].semitones = 2;
  points[4].semitones = 0;
  assert.deepEqual(points.map((point) => point.semitones), [0, 1, 1, 2, 0]);
  assert.equal(chooseBendRange(points), 2);
});

test("bend range expands to the smallest range that contains the curve", () => {
  assert.equal(chooseBendRange([{ position: 0, semitones: 0 }, { position: 1, semitones: 1 }]), 1);
  assert.equal(chooseBendRange([{ position: 0, semitones: 0 }, { position: 1, semitones: 2 }]), 2);
  assert.equal(chooseBendRange([{ position: 0, semitones: -3 }, { position: 1, semitones: 0 }]), 3);
});

test("mouse editing snaps time to 5% and pitch to half-step units", () => {
  assert.deepEqual(snapBendPoint(0.278, 1.42, 2), { position: 0.3, semitones: 1 });
  assert.deepEqual(snapBendPoint(0.731, -1.6, 2), { position: 0.75, semitones: -2 });
  assert.deepEqual(snapBendPoint(1.4, 9, 1), { position: 1, semitones: 1 });
});

test("click insertion keeps points ordered and replaces a point on the same snap slot", () => {
  let points = normalizeBendDraft(null);
  points = insertBendPointAt(points, 0.27, 1, 2);
  assert.deepEqual(points, [
    { position: 0, semitones: 0 },
    { position: 0.25, semitones: 1 },
    { position: 1, semitones: 0 }
  ]);

  points = insertBendPointAt(points, 0.26, 2, 2);
  assert.equal(points.length, 3);
  assert.deepEqual(points[1], { position: 0.25, semitones: 2 });
});

