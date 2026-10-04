import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAuditServer } from "../tools/ui-audit.mjs";

// Keluhan aslinya: tombol show/hide panel di kiri Play ikut hilang. Tes ini
// melewati empat breakpoint, menutup dan membuka panel dua kali, dan pada
// setiap langkah menuntut satu tombol toggle yang terlihat dan dapat diklik.
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

async function readPanelTrigger(page) {
  return page.evaluate(() => {
    const triggers = [...document.querySelectorAll("[data-studio-panel-toggle]")];
    const visible = triggers.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    });
    const trigger = visible[0] ?? null;
    const closeButtons = [...document.querySelectorAll("#workspace-sidebar [data-studio-close]")]
      .filter(element => element.getBoundingClientRect().width > 0);
    return {
      count: triggers.length,
      visibleCount: visible.length,
      label: trigger?.getAttribute("aria-label") ?? null,
      ariaExpanded: trigger?.getAttribute("aria-expanded") ?? null,
      sidebarHidden: document.querySelector("#workspace-sidebar")?.hidden ?? null,
      dockOpen: document.body.dataset.studioDockOpen ?? null,
      home: trigger?.parentElement?.className ?? null,
      closeButtonCount: closeButtons.length,
    };
  });
}

function assertUsable(state, label) {
  assert.equal(state.count, 1, `${label}: harus ada tepat satu tombol toggle panel`);
  assert.equal(state.visibleCount, 1, `${label}: tombol toggle panel harus terlihat`);
  assert.ok(state.label, `${label}: tombol toggle panel harus punya aria-label`);
  assert.equal(state.label.trim().toLowerCase(), "panel", `${label}: label tombol tetap "Panel"`);
  assert.ok(["true", "false"].includes(state.ariaExpanded), `${label}: aria-expanded harus selalu ada`);
}

test("satu tombol Panel selalu terlihat dan dapat diklik di semua breakpoint", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
      await page.waitForTimeout(250);
      const label = `${viewport.width}x${viewport.height}`;

      const initial = await readPanelTrigger(page);
      assertUsable(initial, `${label} awal`);
      report.push({ label, step: "awal", ...initial });

      for (let round = 1; round <= 2; round += 1) {
        const openedBefore = initial.sidebarHidden === false
          ? (await readPanelTrigger(page)).sidebarHidden === false
          : (await readPanelTrigger(page)).sidebarHidden === false;
        await page.locator("[data-studio-panel-toggle]:visible").click();
        await page.waitForTimeout(300);
        const afterToggle = await readPanelTrigger(page);
        assertUsable(afterToggle, `${label} putaran ${round} setelah klik`);
        report.push({ label, step: `putaran ${round}`, ...afterToggle, wasOpen: openedBefore });

        // Klik lagi harus mengembalikan keadaan, dan tombol tetap bisa diklik.
        await page.locator("[data-studio-panel-toggle]:visible").click();
        await page.waitForTimeout(300);
        const back = await readPanelTrigger(page);
        assertUsable(back, `${label} putaran ${round} setelah klik kedua`);
        report.push({ label, step: `putaran ${round} balik`, ...back });
      }

      // Tidak boleh ada tombol tutup kedua yang bertentangan dengan toggle.
      const finalState = await readPanelTrigger(page);
      assert.equal(finalState.closeButtonCount, 0,
        `${label}: tombol tutup duplikat di sidebar harus dihapus, tersisa ${finalState.closeButtonCount}`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  assert.ok(report.length >= VIEWPORTS.length * 5, "laporan harus memuat semua langkah");
});