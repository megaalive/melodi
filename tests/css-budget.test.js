import assert from "node:assert/strict";
import { test } from "node:test";
import { readAppStyles } from "./helpers/read-app-styles.js";

// PR12 removes proven old-parent candidate-dock rules and exact responsive
// duplicates. Count normalized LF bytes so the budget is stable across
// Windows CRLF and Linux LF checkouts. The current imported tree is 223,329
// bytes; 106-scenario coverage supports this cap while keeping 165 KB as a target.
const ACTIVE_CSS_BUDGET_BYTES = 224_000;
const TARGET_CSS_BUDGET_BYTES = 165_000;

test("active imported CSS stays within its tracked byte budget", () => {
  const normalizedStyles = readAppStyles().replace(/\r\n?/g, "\n");
  const activeBytes = Buffer.byteLength(normalizedStyles, "utf8");
  assert.ok(
    activeBytes <= ACTIVE_CSS_BUDGET_BYTES,
    `active stylesheets are ${activeBytes} bytes; current guard is ${ACTIVE_CSS_BUDGET_BYTES} bytes, with a target of ${TARGET_CSS_BUDGET_BYTES} bytes after safe cleanup`
  );
});
