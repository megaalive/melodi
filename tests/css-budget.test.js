import assert from "node:assert/strict";
import { test } from "node:test";
import { readAppStyles } from "./helpers/read-app-styles.js";

// Count normalized LF bytes so the budget is stable across Windows CRLF and
// Linux LF checkouts. P14's accessible Guitar zone adds 771 active bytes; this
// cap records the measured 224,100-byte tree while keeping 165 KB as a target.
const ACTIVE_CSS_BUDGET_BYTES = 224_128;
const TARGET_CSS_BUDGET_BYTES = 165_000;

test("active imported CSS stays within its tracked byte budget", () => {
  const normalizedStyles = readAppStyles().replace(/\r\n?/g, "\n");
  const activeBytes = Buffer.byteLength(normalizedStyles, "utf8");
  assert.ok(
    activeBytes <= ACTIVE_CSS_BUDGET_BYTES,
    `active stylesheets are ${activeBytes} bytes; current guard is ${ACTIVE_CSS_BUDGET_BYTES} bytes, with a target of ${TARGET_CSS_BUDGET_BYTES} bytes after safe cleanup`
  );
});
