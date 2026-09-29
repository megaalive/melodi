import test from "node:test";
import assert from "node:assert/strict";
import { layoutScoreAnnotations, normalizeScoreLayout, projectExpressionRuns, scoreStaffWidth } from "../src/ui/score.js";

test("Score default memakai Flow dan hanya menerima Page sebagai alternatif eksplisit", () => {
  assert.equal(normalizeScoreLayout(undefined), "flow");
  assert.equal(normalizeScoreLayout("flow"), "flow");
  assert.equal(normalizeScoreLayout("page"), "page");
  assert.equal(normalizeScoreLayout("other"), "flow");
});

test("Flow memperlebar staff berdasarkan jumlah birama sementara Page mengikuti viewport", () => {
  assert.equal(scoreStaffWidth("page", 8, 1000), 980);
  assert.equal(scoreStaffWidth("page", 1, 400), 520);
  assert.equal(scoreStaffWidth("flow", 1, 1000), 980);
  assert.ok(scoreStaffWidth("flow", 8, 1000) > 1400);
  assert.equal(scoreStaffWidth("flow", 1000, 1000), 12000);
});

test("expression yang sama membentuk satu run, perubahan dan staff baru memulai annotation", () => {
  const runs = projectExpressionRuns([
    { noteId: "a", summary: "Vib 5.8Hz ±0.05", systemId: "staff-1", systemOrder: 0, x: 80, startTick: 0 },
    { noteId: "b", summary: "Vib 5.8Hz ±0.05", systemId: "staff-1", systemOrder: 0, x: 100, startTick: 240, current: true },
    { noteId: "c", summary: "V 72%", systemId: "staff-1", systemOrder: 0, x: 120, startTick: 480 },
    { noteId: "d", summary: "V 72%", systemId: "staff-1", systemOrder: 0, x: 140, startTick: 720 },
    { noteId: "e", summary: "V 72%", systemId: "staff-2", systemOrder: 1, x: 90, startTick: 960 }
  ]);

  assert.equal(runs.length, 3);
  assert.deepEqual(runs[0].noteIds, ["a", "b"]);
  assert.equal(runs[0].current, true);
  assert.equal(runs[1].text, "V 72%");
  assert.deepEqual(runs[1].noteIds, ["c", "d"]);
  assert.deepEqual(runs[2].noteIds, ["e"]);
});

test("expression dan bend annotation ditempatkan tanpa menimpa label tetangga atau lyric", () => {
  const annotations = layoutScoreAnnotations([
    { id: "mix-a", kind: "expression", text: "Vib 5.8Hz ±0.05", noteIds: ["a"], x: 200, preferredY: 180, width: 96, height: 9, textOffsetY: -8 },
    { id: "mix-b", kind: "expression", text: "V 72%", noteIds: ["b"], x: 208, preferredY: 180, width: 40, height: 9, textOffsetY: -8 },
    { id: "bend-a", kind: "bend", text: "½↑", noteIds: ["a"], x: 205, preferredY: 72, width: 18, height: 10, textOffsetY: -9 }
  ], {
    canvasWidth: 520,
    obstacles: [{ left: 150, right: 250, top: 210, bottom: 225 }]
  });

  assert.equal(annotations.length, 3, "bend label tetap menjadi kandidat setelah mix dedup");
  for (let left = 0; left < annotations.length; left += 1) {
    for (let right = left + 1; right < annotations.length; right += 1) {
      assert.equal(overlaps(annotations[left].bounds, annotations[right].bounds), false);
    }
    assert.equal(overlaps(annotations[left].bounds, { left: 150, right: 250, top: 210, bottom: 225 }), false);
  }
});

function overlaps(left, right) {
  return left.left < right.right && left.right > right.left
    && left.top < right.bottom && left.bottom > right.top;
}
