import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { COMMON_CONTROL_TARGETS, measurePage, startAuditServer } from "../tools/ui-audit.mjs";

test("wide default exposes routine project, language, palette, history, and follow controls", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 10000 });
    const audit = await measurePage(page);
    const expected = new Set([
      "project-new", "project-open", "project-save", "project-share", "language", "theme",
      "command-palette", "undo", "redo", "follow-playback",
    ]);
    assert.deepEqual(
      audit.matchedCommonControlKeys.filter(key => expected.has(key)).sort(),
      [...expected].sort(),
      "each routine header control must be present in the default DOM",
    );
    assert.deepEqual(
      audit.clickToRevealControls.filter(control => expected.has(control.key)),
      [],
      "routine header controls must not sit inside a closed disclosure or hidden ancestor",
    );
    const summary = await page.locator("#project-menu > summary > span").getAttribute("data-copy");
    assert.equal(summary, "projectMoreLabel", "the wide project disclosure is reserved for rare actions, not labelled Menu");
    assert.equal(COMMON_CONTROL_TARGETS.length, 28, "the audit allowlist stays complete and explicit");
    const collapse = await page.locator("#piano-roll-collapse").evaluate(element => ({
      display: getComputedStyle(element).display,
      direction: getComputedStyle(element).flexDirection,
      width: element.getBoundingClientRect().width,
    }));
    assert.equal(collapse.display, "flex");
    assert.equal(collapse.direction, "row");
    assert.ok(collapse.width >= 100, "the wide collapse label and chevron share one readable row");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMenu = await page.locator("#project-menu > summary").boundingBox();
    assert.ok(mobileMenu && mobileMenu.width > 0 && mobileMenu.height > 0, "the compact project menu remains reachable in the header");
    const mobileMenuLabel = await page.locator("#project-menu > summary > span").innerText();
    assert.ok(mobileMenuLabel && mobileMenuLabel.toLowerCase() !== "undefined", "resizing restores a real localized project-menu label");
    await page.locator("#project-menu > summary").click();
    assert.equal(await page.locator("#project-menu").evaluate(element => element.open), true, "the compact project sheet opens from its visible trigger");
    await page.setViewportSize({ width: 1024, height: 768 });
    const tabletAudit = await measurePage(page);
    assert.equal(tabletAudit.overlapCount, 0, "the intermediate header and editor controls do not overlap");
    const tabletMenuLabel = await page.locator("#project-menu > summary > span").innerText();
    assert.ok(tabletMenuLabel && tabletMenuLabel.toLowerCase() !== "undefined", "the tablet project menu keeps a translated label");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
