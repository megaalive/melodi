import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve("styles/app.css"), "utf8");

test("expression colors are semantic aliases of theme and note-state tokens", () => {
  assert.match(css, /--expression-ink:\s*var\(--accent-strong\)/);
  assert.match(css, /--expression-selected-ink:\s*var\(--highlight-selected-ink\)/);
  assert.match(css, /--expression-selected-fill:\s*var\(--highlight-selected\)/);
  assert.match(css, /--expression-current-ink:\s*var\(--highlight-current-ink\)/);
  assert.match(css, /--expression-current-fill:\s*var\(--highlight-current\)/);
  assert.match(css, /--expression-muted:\s*var\(--text-muted\)/);
  assert.match(css, /--expression-guide:\s*var\(--border\)/);
  assert.match(css, /--expression-zero:\s*var\(--border-strong\)/);
  assert.match(css, /--expression-bend-label:\s*var\(--ember\)/);

  const rollBend = css.slice(css.indexOf(".roll-note-bend {"), css.indexOf(".bend-context-actions {", css.indexOf(".roll-note-bend {")));
  const lane = css.slice(css.indexOf(".expression-background {"), css.indexOf(".score-scroll {", css.indexOf(".expression-background {")));
  const score = css.slice(css.indexOf(".score-expression-overlay {"), css.indexOf(".score-syllable {", css.indexOf(".score-expression-overlay {")));
  assert.doesNotMatch(`${rollBend}\n${lane}\n${score}`, /#[0-9a-f]{3,8}\b/i);
  assert.match(rollBend, /stroke:\s*var\(--expression-note-ink\)/);
  assert.match(lane, /stroke:\s*var\(--expression-ink\)/);
  assert.match(lane, /data-selected="true"/);
  assert.match(lane, /data-current="true"/);
  assert.match(score, /stroke:\s*var\(--expression-ink\)/);
});

test("selected and current expression states use distinct ink and shape emphasis", () => {
  assert.match(css, /\.expression-note\[data-selected="true"\][\s\S]*?--expression-selected-ink/);
  assert.match(css, /\.expression-note\[data-current="true"\][\s\S]*?--expression-current-ink/);
  assert.match(css, /\.roll-note-bend[\s\S]*?data-current="true"[\s\S]*?--expression-current-ink/);
  assert.match(css, /\.score-bend-overlay\[data-current="true"\][\s\S]*?--expression-current-ink/);
});
