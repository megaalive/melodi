import assert from "node:assert/strict";
import { test } from "node:test";
import { readAppStyles } from "./helpers/read-app-styles.js";

// Count normalized LF bytes so the budget is stable across Windows CRLF and
// Linux LF checkouts. 224 KB -> 225 KB: the Panel toggle became a real component
// (icon+label group in the transport plus its own states), which costs ~0.9 KB.
// 225 KB -> 226 KB: the mobile dock reads tempo and loop as two chips, and the
// empty-song hint becomes a centred, dismissible block. Both are covered by
// tests/dock-summary-hint.test.js, so the guard moves instead of losing its
// purpose: it still catches drift between rounds.
// 232 KB -> 235 KB: the Ideas tab became a real workspace: two-octave keyboard
// with data-driven black-key slots, candidate cards with mini-contour and A/B
// compare, latency compensation control, and an inline idea rename field. The
// behaviour is covered by tests/ideas-layout.test.js and
// tests/ideas-variations.test.js, so the guard moves with it.
// 235 KB -> 236 KB: the Ide tab grew a guided flow: step strip, empty state with
// "Try a sample", audio-ready chip, recording banner, and an accept toast. The
// behaviour is covered by tests/ideas-recording-flow.test.js and
// tests/ideas-guided-flow.test.js, so the guard moves with it.
const ACTIVE_CSS_BUDGET_BYTES = 236_000;

test("active imported CSS stays within its tracked byte budget", () => {
  const normalizedStyles = readAppStyles().replace(/\r\n?/g, "\n");
  const activeBytes = Buffer.byteLength(normalizedStyles, "utf8");
  assert.ok(
    activeBytes <= ACTIVE_CSS_BUDGET_BYTES,
    `active stylesheets are ${activeBytes} bytes; the hard guard is ${ACTIVE_CSS_BUDGET_BYTES} bytes`
  );
});
