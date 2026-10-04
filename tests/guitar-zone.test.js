import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAuditServer } from "../tools/ui-audit.mjs";

// Kanvas TAB/Fretboard pernah terpotong diam-diam: zona punya overflow-y:hidden
// dan splitter boleh menariknya lebih kecil dari tinggi isinya. Tes ini menuntut
// kanvas tidak pernah terpotong tanpa scroll, tinggi tombol seragam, dan lebar
// kanvas mengisi kontainer.
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function openZone(page) {
  await page.goto(page.__url, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const openToggle = page.locator("[data-studio-guitar-zone-toggle]");
  if (await page.evaluate(() => document.querySelector("#studio-guitar-zone")?.dataset.open !== "true")) {
    await openToggle.click();
  }
  await page.waitForTimeout(400);
}

async function readZone(page) {
  return page.evaluate(() => {
    const zone = document.querySelector("#studio-guitar-zone");
    const resizer = document.querySelector("#studio-guitar-resizer");
    const visibleCanvas = [...document.querySelectorAll("#guitar-tab-scroll, #guitar-scroll")]
      .find(element => !element.hidden);
    const svg = visibleCanvas.querySelector("svg");
    const svgRect = svg.getBoundingClientRect();
    const boxRect = visibleCanvas.getBoundingClientRect();
    const height = element => Math.round(element?.getBoundingClientRect().height ?? 0);
    const style = getComputedStyle(visibleCanvas);
    return {
      canvasScrolls: style.overflowY === "auto" || style.overflowY === "scroll",
      canvasClient: visibleCanvas.clientHeight,
      canvasScroll: visibleCanvas.scrollHeight,
      svgHeight: Math.round(svgRect.height),
      svgWidth: Math.round(svgRect.width),
      boxWidth: Math.round(boxRect.width),
      contentBoxWidth: visibleCanvas.clientWidth,
      resizerHeight: height(resizer),
      minHeight: Number(resizer.getAttribute("aria-valuemin")),
      zoneHeight: Math.round(zone.getBoundingClientRect().height),
      zoneToggleHeight: height(document.querySelector(".guitar-zone-toggle")),
      layoutHeights: [
        height(document.querySelector("#guitar-layout-tab")),
        height(document.querySelector("#guitar-layout-fretboard")),
      ],
      guitarToggleHeight: height(document.querySelector(".guitar-mode-toggle")),
      headingHeight: height(document.querySelector("#studio-guitar-zone .guitar-pane-heading")),
      headingFont: getComputedStyle(document.querySelector("#studio-guitar-zone .guitar-heading-copy h2")).fontSize,
      otherPaneFont: getComputedStyle(document.querySelector("#piano-roll-section h2, #drums-section h2")).fontSize,
    };
  });
}

test("kanvas Gitar tidak terpotong dan seragam di 1440x900 serta 1920x1080", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      page.__url = url;
      await openZone(page);
      const label = `${viewport.width}x${viewport.height}`;

      for (const layout of ["tab", "fretboard"]) {
        await page.click(`#guitar-layout-${layout}`);
        await page.waitForTimeout(300);
        const state = await readZone(page);
        const where = `${label} ${layout}`;

        assert.equal(state.canvasScrolls, true, `${where}: kanvas harus bisa di-scroll vertikal`);
        assert.ok(state.canvasClient >= state.svgHeight,
          `${where}: kanvas terpotong (${where}: ${state.canvasClient}px untuk SVG ${state.svgHeight}px)`);
        assert.equal(state.resizerHeight, 8, `${where}: splitter harus 8px`);
        assert.ok(state.minHeight >= state.headingHeight + state.resizerHeight + state.svgHeight,
          `${where}: minimum splitter ${state.minHeight}px harus memuat judul, splitter, dan kanvas ${state.svgHeight}px`);
        assert.deepEqual(new Set(state.layoutHeights).size, 1, `${where}: tinggi TAB dan Fretboard harus sama`);
        assert.ok(Math.abs(state.layoutHeights[0] - state.zoneToggleHeight) <= 0.5,
          `${where}: tinggi tombol zona harus seragam`);
        assert.ok(Math.abs(state.svgWidth - state.contentBoxWidth) <= 1,
          `${where}: kanvas harus mengisi lebar kontainer (${state.svgWidth} vs ${state.contentBoxWidth})`);
        assert.equal(state.headingFont, state.otherPaneFont, `${where}: judul Gitar seukuran judul pane lain`);
      }

      // Splitter tidak boleh bisa menarik zona di bawah tinggi isinya.
      await page.click("#guitar-layout-tab");
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        const resizer = document.querySelector("#studio-guitar-resizer");
        resizer.focus();
        resizer.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      });
      await page.waitForTimeout(350);
      const atMinimum = await readZone(page);
      assert.ok(atMinimum.canvasClient >= atMinimum.svgHeight,
        `${label}: di minimum splitter kanvas masih terpotong (${atMinimum.canvasClient} < ${atMinimum.svgHeight})`);
      assert.ok(atMinimum.zoneHeight >= atMinimum.minHeight,
        `${label}: zona boleh lebih kecil dari minimumnya`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});