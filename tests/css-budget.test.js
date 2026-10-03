import assert from "node:assert/strict";
import { test } from "node:test";
import { readAppStyles } from "./helpers/read-app-styles.js";

// Count normalized LF bytes so the budget is stable across Windows CRLF and
// Linux LF checkouts. Keep the active CSS at the original 224 KB hard limit.
const ACTIVE_CSS_BUDGET_BYTES = 224_000;

test("active imported CSS stays within its tracked byte budget", () => {
  const normalizedStyles = readAppStyles().replace(/\r\n?/g, "\n");
  const activeBytes = Buffer.byteLength(normalizedStyles, "utf8");
  assert.ok(
    activeBytes <= ACTIVE_CSS_BUDGET_BYTES,
    `active stylesheets are ${activeBytes} bytes; the hard guard is ${ACTIVE_CSS_BUDGET_BYTES} bytes`
  );
});
