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

test("UI tidak memakai dialog blocking bawaan browser", () => {
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const html = readFileSync(resolve("index.html"), "utf8");
  assert.doesNotMatch(app, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  assert.match(html, /<dialog[^>]+id="confirm-dialog"/);
});

test("Score tidak mengulang clef di setiap birama atau menebalkan semua glyph", () => {
  const score = readFileSync(resolve("src/ui/score.js"), "utf8");
  const css = readFileSync(resolve("styles/app.css"), "utf8");

  assert.match(score, /if \(measure\.index === 0\) \{\s*stave\.addClef\("treble"\);/);
  assert.doesNotMatch(css, /#score \[class\^="vf-"\][\s\S]*stroke:\s*currentColor;\s*fill:\s*currentColor/);
  assert.match(css, /#score path\[fill="black"\][\s\S]*stroke:\s*none/);
});

