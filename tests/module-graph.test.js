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
      const target = resolve(dirname(full), spec);
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

