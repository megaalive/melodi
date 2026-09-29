import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScoreLayout, scoreStaffWidth } from "../src/ui/score.js";

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
