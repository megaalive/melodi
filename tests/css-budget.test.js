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
const ACTIVE_CSS_BUDGET_BYTES = 232_000;

test("active imported CSS stays within its tracked byte budget", () => {
  const normalizedStyles = readAppStyles().replace(/\r\n?/g, "\n");
  const activeBytes = Buffer.byteLength(normalizedStyles, "utf8");
  assert.ok(
    activeBytes <= ACTIVE_CSS_BUDGET_BYTES,
    `active stylesheets are ${activeBytes} bytes; the hard guard is ${ACTIVE_CSS_BUDGET_BYTES} bytes`
  );
});
