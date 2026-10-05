import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { measurePage, startAuditServer } from "../tools/ui-audit.mjs";

// L3: alur Ide harus terbaca tanpa membuka menu. Keadaan kosong menampilkan
// tiga langkah bernomor dan tombol "Coba contoh", setelah take muncul kartu
// dengan Lanjutan sebagai tindakan utama, dan Pakai memunculkan toast dengan
// tombol Buka di Edit.
const CASES = [
  { label: "hp-light", width: 390, height: 844, theme: "light", coarse: true },
  { label: "hp-dark", width: 390, height: 844, theme: "dark", coarse: true },
  { label: "desktop-light", width: 1440, height: 900, theme: "light", coarse: false },
  { label: "desktop-dark", width: 1440, height: 900, theme: "dark", coarse: false }
];

async function openIde(browser, testCase, url) {
  const context = await browser.newContext({
    viewport: { width: testCase.width, height: testCase.height },
    hasTouch: testCase.coarse,
    isMobile: testCase.coarse,
    colorScheme: testCase.theme,
    serviceWorkers: "block"
  });
  await context.addInitScript(theme => localStorage.setItem("melodi.theme", theme), testCase.theme);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
  await page.waitForTimeout(250);
  return { context, page };
}

async function readFlow(page) {
  return page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const steps = [...document.querySelectorAll("[data-entity='ideas-step']")].map(item => ({
      step: item.dataset.step,
      active: item.dataset.active,
      text: item.textContent ?? ""
    }));
    const emptyList = [...document.querySelectorAll(".ideas-empty-list li")];
    const tabLines = [...document.querySelectorAll(".studio-panel-switches [role='tab']")]
      .map(element => ({ text: (element.textContent ?? "").trim(), rect: element.getBoundingClientRect() }));
    const dock = document.querySelector("#mobile-workspace-dock, .mobile-workspace-dock");
    return {
      steps,
      stepState: document.querySelector("[data-entity='ideas-steps']")?.dataset.step ?? null,
      emptyOpen: document.querySelector("[data-entity='ideas-empty']")?.dataset.open ?? null,
      emptyItems: emptyList.length,
      emptyTexts: emptyList.map(item => (item.textContent ?? "").trim()),
      sampleButton: Boolean(document.querySelector("[data-action='ideas-try-sample']")),
      sampleRect: rect("[data-action='ideas-try-sample']"),
      emptyRect: rect("[data-entity='ideas-empty']"),
      takes: document.querySelectorAll("[data-entity='ideas-take']").length,
      primaryActions: [...document.querySelectorAll(".ideas-take-actions button[data-role='primary']")]
        .map(element => element.dataset.action),
      toastHidden: document.querySelector("[data-entity='ideas-toast']")?.hidden ?? true,
      tabCount: tabLines.length,
      tabLines: tabLines.map(item => ({
        text: item.text,
        lines: Math.round(item.rect.height) > 0 ? item.rect.height / 18 : 0
      })),
      dockTop: dock ? dock.getBoundingClientRect().top : null
    };
  });
}

test("keadaan kosong Ide menampilkan tiga langkah, Coba contoh, dan tanpa teks terpotong", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const testCase of CASES) {
      const { context, page } = await openIde(browser, testCase, url);
      const state = await readFlow(page);
      assert.equal(state.steps.length, 3, `${testCase.label}: strip langkah punya tiga item`);
      assert.deepEqual(state.steps.map(item => item.step), ["record", "develop", "use"],
        `${testCase.label}: urutan langkah`);
      assert.ok(state.steps.every(item => item.text.length > 0), `${testCase.label}: langkah punya teks`);
      assert.equal(state.steps.filter(item => item.active === "true").length, 1,
        `${testCase.label}: tepat satu langkah aktif`);
      assert.equal(state.stepState, "empty", `${testCase.label}: keadaan awal adalah kosong`);
      assert.equal(state.emptyOpen, "true", `${testCase.label}: keadaan kosong terbuka`);
      assert.equal(state.emptyItems, 3, `${testCase.label}: tiga petunjuk bernomor`);
      assert.ok(state.emptyTexts.every(text => text.length > 8), `${testCase.label}: petunjuk berisi kalimat`);
      assert.equal(state.sampleButton, true, `${testCase.label}: tombol Coba contoh ada`);
      if (testCase.coarse) {
        assert.ok(state.sampleRect.height >= 44, `${testCase.label}: tombol Coba contoh ${Math.round(state.sampleRect.height)}px, harus >= 44px`);
      }
      if (testCase.coarse) {
        assert.equal(state.tabCount, 5, `${testCase.label}: bar tab bawah tetap lima item`);
        assert.ok(state.dockTop !== null, `${testCase.label}: dock bawah terukur`);
        assert.ok(state.sampleRect.bottom <= state.dockTop + 1,
          `${testCase.label}: tombol Coba contoh tertutup dock bawah`);
      }
      const metrics = await measurePage(page);
      if (testCase.coarse) {
        assert.ok(metrics.chrome.percentExact <= 25,
          `${testCase.label}: chrome ${metrics.chrome.percentExact.toFixed(1)}% di atas 25%`);
      }
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("Coba contoh langsung memberi take, Lanjutkan jadi tindakan utama, dan Pakai memunculkan toast", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const testCase of CASES) {
      const { context, page } = await openIde(browser, testCase, url);
      await page.locator("[data-action='ideas-try-sample']").click();
      await page.waitForTimeout(200);
      const withTake = await readFlow(page);
      assert.equal(withTake.takes, 1, `${testCase.label}: contoh memuat satu take`);
      assert.equal(withTake.stepState, "develop", `${testCase.label}: langkah aktif pindah ke Dengar & kembangkan`);
      assert.deepEqual(withTake.primaryActions, ["ideas-continue"],
        `${testCase.label}: Lanjutkan adalah tindakan utama`);
      assert.equal(withTake.emptyOpen, "false", `${testCase.label}: keadaan kosong tertutup`);

      await page.locator("[data-action='ideas-use']").first().click();
      await page.waitForTimeout(200);
      const afterUse = await readFlow(page);
      assert.equal(afterUse.toastHidden, false, `${testCase.label}: toast Pakai tampil`);
      const toast = await page.locator("[data-entity='ideas-toast']").textContent();
      assert.match(toast, /Ditambahkan ke lagu|Buka di Edit/, `${testCase.label}: isi toast: ${toast}`);
      assert.equal(await page.evaluate(() => window.melodi.getState().view.mode), "ideas",
        `${testCase.label}: Pakai tidak memaksa pindah tab`);

      await page.locator("[data-action='ideas-toast-open']").click();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.melodi.getState().view.mode), "piano-roll",
        `${testCase.label}: Buka di Edit pindah ke workspace Edit`);
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("take satu sampai dua nada menjelaskan bahwa Kembangkan butuh minimal tiga nada", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await page.locator("[data-action='ideas-count-in']").uncheck();
    await page.locator("[data-action='ideas-auto-stop']").uncheck();
    await page.locator("#ideas-record").click();
    const key = await page.locator("[data-pitch='60']").boundingBox();
    await page.mouse.move(key.x + key.width / 2, key.y + key.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(220);
    await page.mouse.up();
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator("[data-entity='ideas-take']").count(), 1, "take satu nada terbentuk");
    const help = await page.locator("[data-entity='ideas-take-help']").first().textContent();
    assert.match(help, /min\. 3 nada|least 3 notes/, `pesan take pendek: ${help}`);
    await page.close();
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});