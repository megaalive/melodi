import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAuditServer } from "../tools/ui-audit.mjs";

/*
* Kontras kontrol dihitung dari getComputedStyle pada keadaan nyata, bukan dari
* nilai token asumsi: setiap varian tombol harus punya satu pasangan latar dan
* tinta untuk normal, hover, dan aktif. Aturan global
* `button:hover{color:var(--on-accent)}` dulu menimpa tombol ghost sehingga tinta
* on-accent berada di atas surface dan teksnya hilang. Tes ini menjaga
* perbaikan itu tidak kembali.
*/

const MINIMUM_RATIO = 4.5;

const COMMON_TARGETS = [
  ["tab Edit/Not/Irama", ".studio-views button"],
  ["Undo", "#undo"],
  ["Redo", "#redo"],
  ["guitar TAB", "#guitar-layout-tab"],
  ["guitar Fretboard", "#guitar-layout-fretboard"],
  ["Tutup panel", "#workspace-sidebar [data-studio-close]"],
  ["tombol primer Play", "#play"],
  ["toggle Panel", "[data-studio-panel-toggle]"],
  ["tombol sekunder Stop", "#stop"],
];

function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value ?? "");
  if (!match) return null;
  const parts = match[1].split(",").map(part => Number.parseFloat(part));
  const [r, g, b, a = 1] = parts;
  return { r, g, b, a };
}

function channel(value) {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
}

function composite(foreground, background) {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
  };
}

function luminance(color) {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(foregroundValue, backgroundValue) {
  const rawForeground = parseColor(foregroundValue);
  const rawBackground = parseColor(backgroundValue);
  assert.ok(rawForeground, `warna teks tidak bisa dibaca: ${foregroundValue}`);
  assert.ok(rawBackground, `warna latar tidak bisa dibaca: ${backgroundValue}`);
  const page = { r: 255, g: 255, b: 255 };
  const background = rawBackground.a < 1 ? composite(rawBackground, page) : rawBackground;
  const foreground = rawForeground.a < 1 ? composite(rawForeground, background) : rawForeground;
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function readPair(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    let background = style.backgroundColor;
    let node = element;
    while (background === "rgba(0, 0, 0, 0)" && node.parentElement) {
      node = node.parentElement;
      background = getComputedStyle(node).backgroundColor;
    }
    return { color: style.color, background, disabled: element.matches(":disabled") };
  });
}

async function openStudio(browser, url, { width, height, theme }) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
  await page.evaluate(next => {
    const select = document.querySelector("#theme");
    select.value = next;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, theme);
  await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme, { timeout: 5000 });
  await page.waitForTimeout(250);
  // Blank song punya Undo dan Redo disabled, jadi buat dua perubahan lalu undo:
  // baru keduanya punya tinta normal untuk diukur.
  await page.locator("#tempo-input").fill("101");
  await page.locator("#tempo-input").press("Enter");
  await page.waitForTimeout(150);
  await page.locator("#tempo-input").fill("102");
  await page.locator("#tempo-input").press("Enter");
  await page.waitForTimeout(150);
  await page.locator("#undo").click();
  await page.waitForTimeout(150);
  return page;
}

async function measureStates(page, label, selector, failures) {
  const locator = page.locator(selector).first();
  assert.equal(await locator.count(), 1, `${label} (${selector}) harus ada di DOM`);
  const states = { normal: await readPair(locator) };
  await locator.hover();
  await page.waitForTimeout(120);
  states.hover = await readPair(locator);
  await page.mouse.down();
  await page.waitForTimeout(120);
  states.active = await readPair(locator);
  await page.mouse.up();
  for (const [state, pair] of Object.entries(states)) {
    assert.equal(pair.disabled, false, `${label} tidak boleh disabled saat diuji`);
    const ratio = contrastRatio(pair.color, pair.background);
    if (ratio < MINIMUM_RATIO) {
      failures.push(`${label} ${state}: ${ratio.toFixed(2)}:1 (${pair.color} di ${pair.background})`);
    }
  }
}

test("setiap varian tombol tetap kontras di light dan dark pada normal, hover, dan aktif", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const theme of ["light", "dark"]) {
      // 90rem: aksi Proyek tampil langsung di toolbar dan menu Proyek disembunyikan.
      const toolbarPage = await openStudio(browser, url, { width: 1440, height: 900, theme });
      for (const [name, selector] of COMMON_TARGETS) {
        await measureStates(toolbarPage, `${theme} ${name}`, selector, failures);
      }
      await measureStates(
        toolbarPage,
        `${theme} aksi Proyek di toolbar`,
        ".studio-toolbar-actions .desktop-project-actions button[data-action]",
        failures,
      );
      await toolbarPage.close();

      // 68rem: aksi Proyek sebagian masuk menu, jadi item menu harus diukur juga.
      const menuPage = await openStudio(browser, url, { width: 1200, height: 900, theme });
      await menuPage.locator("#project-menu > summary").click();
      await menuPage.waitForTimeout(250);
      await measureStates(
        menuPage,
        `${theme} item menu Proyek`,
        "#project-menu .project-menu-section button[data-action]",
        failures,
      );
      await menuPage.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  assert.deepEqual(failures, [], `kontras tombol di bawah ${MINIMUM_RATIO}:1\n${failures.join("\n")}`);
});