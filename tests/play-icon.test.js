import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAuditServer } from "../tools/ui-audit.mjs";

// `.toolbar-icon{display:block}` pernah mengalahkan atribut hidden, jadi ikon
// play dan pause tampil bersamaan di dalam satu tombol. Aturan global
// [hidden] di base.css yang menutupnya; tes ini menjaga atribut itu menang lagi.
const ICONS = ['[data-playback-icon="play"]', '[data-playback-icon="pause"]'];

async function iconVisibility(page) {
  return page.evaluate(selectors => selectors.map(selector => {
    const icon = document.querySelector(`#play ${selector}`);
    if (!icon) return { selector, missing: true };
    const rect = icon.getBoundingClientRect();
    return {
      selector,
      missing: false,
      hidden: icon.hasAttribute("hidden"),
      visible: rect.width > 0 && rect.height > 0,
    };
  }), ICONS);
}

function assertSingleIcon(states, expected, label) {
  const visible = states.filter(state => state.visible).map(state => state.selector);
  assert.deepEqual(visible, [expected], `${label}: hanya satu ikon yang boleh terlihat, dapat ${JSON.stringify(states)}`);
  const hidden = states.find(state => !state.visible);
  assert.equal(hidden.hidden, true, `${label}: ikon tersembunyi harus memakai atribut hidden`);
}

test("tombol Play menampilkan satu ikon sesuai state playback", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });

    const stopped = await page.evaluate(() => window.melodi.getState().playback.status);
    assert.notEqual(stopped, "playing", "halaman baru harus dalam keadaan stopped");
    assertSingleIcon(await iconVisibility(page), '[data-playback-icon="play"]', "stopped");

    await page.locator("#play").click();
    await page.waitForFunction(() => window.melodi.getState().playback.status === "playing", null, { timeout: 10000 });
    await page.waitForFunction(
      () => document.querySelector('#play [data-playback-icon="pause"]').hasAttribute("hidden") === false,
      null,
      { timeout: 5000 },
    );
    assertSingleIcon(await iconVisibility(page), '[data-playback-icon="pause"]', "playing");

    await page.locator("#play").click();
    await page.waitForFunction(() => window.melodi.getState().playback.status !== "playing", null, { timeout: 10000 });
    assertSingleIcon(await iconVisibility(page), '[data-playback-icon="play"]', "dihentikan lagi");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});