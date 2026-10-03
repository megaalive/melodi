import assert from "node:assert/strict";
import { test } from "node:test";
import { readAppStyles } from "./helpers/read-app-styles.js";

// PR9 adds the wide and medium header/transport layouts. PR12 will use the
// expanded Playwright coverage to remove safe legacy rules and reset this cap.
const ACTIVE_CSS_BUDGET_BYTES = 240_000;
const TARGET_CSS_BUDGET_BYTES = 165_000;

test("active imported CSS stays within its tracked byte budget", () => {
  const activeBytes = Buffer.byteLength(readAppStyles(), "utf8");
  assert.ok(
    activeBytes <= ACTIVE_CSS_BUDGET_BYTES,
    `active stylesheets are ${activeBytes} bytes; current guard is ${ACTIVE_CSS_BUDGET_BYTES} bytes, with a target of ${TARGET_CSS_BUDGET_BYTES} bytes after safe cleanup`
  );
});
