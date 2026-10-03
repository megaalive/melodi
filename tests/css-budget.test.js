import assert from "node:assert/strict";
import { test } from "node:test";
import { readAppStyles } from "./helpers/read-app-styles.js";

// PR11 adds the wide candidate grid and contextual chord controls. PR12 will
// use expanded coverage to remove safe legacy rules and reset this cap.
const ACTIVE_CSS_BUDGET_BYTES = 241_000;
const TARGET_CSS_BUDGET_BYTES = 165_000;

test("active imported CSS stays within its tracked byte budget", () => {
  const activeBytes = Buffer.byteLength(readAppStyles(), "utf8");
  assert.ok(
    activeBytes <= ACTIVE_CSS_BUDGET_BYTES,
    `active stylesheets are ${activeBytes} bytes; current guard is ${ACTIVE_CSS_BUDGET_BYTES} bytes, with a target of ${TARGET_CSS_BUDGET_BYTES} bytes after safe cleanup`
  );
});
