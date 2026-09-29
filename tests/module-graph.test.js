import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

// Modul yang menyentuh DOM saat diimpor tidak bisa di-load di Node, jadi hanya
// diperiksa sintaksnya lewat `npm run check`. Modul lain di bawah diimpor sungguhan
// supaya file rusak langsung gagal di suite, bukan hanya saat Check dijalankan manual.
const DOM_TOUCHING = new Set([
  "app.js",
  "ui/guitar-view.js",
  "ui/expression-lane.js",
  "ui/piano-roll.js",
  "ui/score.js",
]);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith(".js")) acc.push(full);
  }
  return acc;
}

const srcRoot = resolve("src");
const files = walk(srcRoot).map((full) => ({
  full,
  rel: full.slice(srcRoot.length + 1).replace(/\\/g, "/"),
}));

test("setiap modul yang tidak butuh DOM bisa diimpor di Node", async () => {
  const pure = files.filter((f) => !DOM_TOUCHING.has(f.rel)).map((f) => f.rel);
  assert.ok(pure.length >= 15, `hanya ${pure.length} modul murni, daftarnya mencurigakan`);

  for (const rel of pure) {
    const url = pathToFileURL(join(srcRoot, rel)).href;
    const mod = await import(url);
    assert.ok(mod, `${rel} gagal diimpor`);
  }
});

test("setiap import di dalam src menunjuk file yang benar-benar ada", () => {
  for (const { full, rel } of files) {
    const source = readFileSync(full, "utf8");
    const specifiers = [...source.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g)]
      .map((m) => m[1])
      .concat([...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]));

    for (const spec of specifiers) {
      if (!spec.startsWith(".")) {
        assert.ok(
          !/^[a-z@]/i.test(spec),
          `${rel} mengimpor paket "${spec}", proyek ini harus tetap tanpa dependency`
        );
        continue;
      }
      const target = resolve(dirname(full), spec.split(/[?#]/, 1)[0]);
      assert.ok(
        statSync(target, { throwIfNoEntry: false })?.isFile(),
        `${rel} mengimpor "${spec}" yang tidak ada`
      );
    }
  }
});

test("modul DOM di daftar pengecualian memang ada dan tetap ada di sana", () => {
  for (const rel of DOM_TOUCHING) {
    assert.ok(
      files.some((f) => f.rel === rel),
      `daftar DOM_TOUCHING menyebut "${rel}" yang tidak ada`
    );
  }
});

test("entry assets GitHub Pages memakai build token yang sama", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const build = /<meta name="melodi-build" content="([^"]+)">/.exec(html)?.[1];
  assert.ok(build, "melodi-build harus ada");
  assert.ok(html.includes("styles/app.css?v=" + build));
  assert.ok(html.includes("vendor/abcjs/abcjs-basic-min.js?v=" + build));
  assert.ok(html.includes("src/app.js?v=" + build));

  const app = readFileSync(resolve("src/app.js"), "utf8");
  assert.ok(app.includes("./core/model.js?v=" + build));
  assert.ok(app.includes("./core/runtime-state.js?v=" + build));
  assert.ok(app.includes("./i18n/messages.js?v=" + build));
  assert.ok(app.includes("./ui/score.js?v=" + build));
  assert.ok(app.includes("./storage/ui-preferences.js?v=" + build));
});

test("Piano Roll dan Expression punya disclosure independen yang dapat diakses", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const preferences = readFileSync(resolve("src/storage/ui-preferences.js"), "utf8");

  assert.match(html, /id="piano-roll-collapse"[^>]*data-panel-collapse="pianoRoll"[^>]*aria-controls="piano-roll-content"[^>]*aria-expanded="true"/);
  assert.match(html, /id="expression-collapse"[^>]*data-panel-collapse="expression"[^>]*aria-controls="expression-content"[^>]*aria-expanded="true"/);
  assert.match(html, /id="piano-roll-content" class="panel-disclosure-content"/);
  assert.match(html, /id="expression-content" class="panel-disclosure-content"/);
  assert.match(html, /id="piano-roll-collapse-summary"[^>]*hidden/);
  assert.match(html, /id="expression-collapse-summary"[^>]*hidden/);
  assert.match(app, /content\.setAttribute\("aria-hidden", String\(collapsed\)\)/);
  assert.match(app, /content\.toggleAttribute\("inert", collapsed\)/);
  assert.match(app, /writeUiPreferences\(safeStorage\(\), uiPreferences\)/);
  assert.match(preferences, /pianoRollCollapsed:\s*false/);
  assert.match(preferences, /expressionCollapsed:\s*false/);
});

test("disclosure memakai chevron yang sama untuk Piano Roll, Expression, dan detail editor", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const css = readFileSync(resolve("styles/app.css"), "utf8");

  for (const id of ["piano-roll-collapse", "expression-collapse"]) {
    const start = html.indexOf(`id="${id}"`);
    const button = html.slice(start, html.indexOf("</button>", start));
    assert.match(button, /class="toolbar-icon disclosure-chevron"/);
  }

  for (const detailClass of ["transport-advanced", "bend-curve-editor", "expression-vibrato-details", "generation-options", "sidebar-tools"]) {
    const start = html.indexOf(`class="${detailClass}"`);
    const fragment = html.slice(start, html.indexOf("</summary>", start));
    assert.match(fragment, /class="disclosure-summary"/);
    assert.match(fragment, /class="toolbar-icon disclosure-chevron"/);
  }

  assert.doesNotMatch(html, /collapse-chevron/);
  assert.match(css, /details:not\(\[open\]\) > \.disclosure-summary \.disclosure-chevron/);
  assert.match(css, /panel-collapse-button\[aria-expanded="false"\] \.disclosure-chevron/);
});

test("toolbar mengelompokkan file, preferences, transport, playback settings, dan view", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");

  const headerStart = html.indexOf('<header class="page-header">');
  const headerEnd = html.indexOf("</header>", headerStart);
  const header = html.slice(headerStart, headerEnd);
  assert.match(header, /class="header-actions"/);
  assert.match(header, /class="project-actions"/);
  assert.equal((header.match(/class="header-select-control"/g) ?? []).length, 2);
  assert.ok(header.indexOf('class="project-actions"') < header.indexOf('class="header-controls"'));

  const fileGroupStart = html.indexOf('data-aria-copy="fileProjectGroupLabel"');
  const fileGroup = html.slice(fileGroupStart, html.indexOf("</div>", fileGroupStart));
  for (const id of ["new-idea", "open-project-file", "save-project-file", "share-song"]) {
    assert.equal((fileGroup.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1, `${id} harus tunggal di grup file`);
  }

  const transport = html.indexOf('class="transport-action-group" role="group" data-aria-copy="transportControlsGroupLabel"');
  const settings = html.indexOf('class="playback-settings-group" role="group" data-aria-copy="playbackSettingsGroupLabel"');
  const view = html.indexOf('class="editor-view-controls" role="group" data-aria-copy="viewControlGroupLabel"');
  assert.ok(transport >= 0 && settings > transport && view > settings);
  const settingsGroup = html.slice(settings, view);
  assert.match(settingsGroup, /id="tempo-input"/);
  assert.match(settingsGroup, /id="loop-enabled"/);
  assert.match(settingsGroup, /class="transport-advanced"/);
  assert.match(settingsGroup, /id="follow-mode"/);

  const editorToolbar = html.slice(html.indexOf('id="editor-toolbar"'), html.indexOf('id="piano-roll-content"'));
  for (const id of ["roll-tool-select", "roll-tool-draw", "snap-select", "roll-zoom"]) assert.ok(editorToolbar.includes(`id="${id}"`));
  assert.match(app, /element\.setAttribute\("aria-label", label\)/);
  assert.match(app, /element\.setAttribute\("title", label\)/);

  const iconButtons = [...html.matchAll(/<button\b[^>]*class="[^"]*\bicon-button\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.ok(iconButtons.length >= 4);
  for (const [, button] of iconButtons) {
    assert.match(button, /<svg[^>]*aria-hidden="true"/);
  }
  const iconTags = iconButtons.map(([tag]) => tag);
  for (const tag of iconTags) {
    assert.match(tag, /data-aria-copy=/);
    assert.doesNotMatch(tag, /tabindex="-1"/);
  }

  const shortcutButton = html.match(/<button\b[^>]*data-action="command-palette"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(shortcutButton);
  assert.match(shortcutButton[0], /data-aria-copy=/);
  assert.match(shortcutButton[1], /<svg[^>]*aria-hidden="true"/);
});

test("editor note dikonsolidasikan ke Expression tanpa popup kanan atas", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const css = readFileSync(resolve("styles/app.css"), "utf8");

  assert.doesNotMatch(html, /editor-note-actions|note-actions-label|note-bend-status/);
  assert.doesNotMatch(app, /editor-note-actions|note-actions-label|note-bend-status/);
  assert.doesNotMatch(css, /editor-note-actions|note-menu-status|note-menu-list/);

  const start = html.indexOf('<section id="expression-panel"');
  const end = html.indexOf("</section>", start);
  assert.ok(start >= 0 && end > start, "panel Expression harus ada");
  const panel = html.slice(start, end);
  assert.match(panel, /id="expression-note-details"/);
  assert.match(panel, /id="expression-bend-tools"/);
  assert.match(panel, /id="expression-vibrato-tools"/);
  assert.match(panel, /id="note-list"/);
  assert.match(panel, /data-action="set-selected-bend"/);
  assert.match(panel, /data-action="set-selected-vibrato"/);

  assert.doesNotMatch(app, /note-expression-details|note-expression-fields/);
  assert.match(app, /grid\.className = "form-grid expression-note-fields"/);
});

test("UI tidak memakai dialog blocking bawaan browser", () => {
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const html = readFileSync(resolve("index.html"), "utf8");
  assert.doesNotMatch(app, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  assert.match(html, /<dialog[^>]+id="confirm-dialog"/);
});

test("Score memakai abcjs lokal dan tidak lagi bergantung pada VexFlow", () => {
  const score = readFileSync(resolve("src/ui/score.js"), "utf8");
  const html = readFileSync(resolve("index.html"), "utf8");
  const css = readFileSync(resolve("styles/app.css"), "utf8");

  assert.match(score, /ABCJS\.renderAbc\(/);
  assert.doesNotMatch(score, /VexFlow|\bVF\./);
  assert.match(html, /vendor\/abcjs\/abcjs-basic-min\.js/);
  assert.doesNotMatch(html, /vexflow/i);
  assert.match(css, /#score \.abcjs-note/);
  assert.doesNotMatch(css, /\.vf-/);
});

