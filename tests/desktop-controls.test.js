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
    assert.equal(audit.clickToRevealControls.some(control => control.key === "seek-tick"), true,
      "the strict click-to-reveal metric includes common controls in inactive tabpanels");
    assert.equal(audit.inactiveTabControls.some(control => control.key === "seek-tick"), true,
      `inactive tab content also has a separate cause breakdown: ${JSON.stringify(audit.inactiveTabControls)}`);
    assert.equal(audit.clickToRevealControls.some(control => control.key === "generation-options"), true,
      "a closed disclosure still counts even when it is inside an inactive tab");
    assert.equal(audit.matchedCommonControlKeys.includes("generation-shortcuts"), true,
      "the audit targets shortcut help content rather than its visible disclosure summary");
    assert.equal(audit.clickToRevealCount, audit.clickToRevealControls.length,
      "the click-to-reveal total is the complete list of hidden common controls");
    assert.equal(audit.clickToRevealCount, audit.closedRevealTargetCount + audit.inactiveTabTargetCount,
      "closed disclosures and inactive tabs explain the complete strict click-to-reveal total");
    const dockResize = page.locator("#workspace-sidebar-resizer");
    assert.equal(await dockResize.getAttribute("aria-label"), "Ubah lebar panel studio");
    await page.locator("#studio-panel-tools-tab").click();
    const follow = page.locator("#follow-mode");
    const toolsFollow = page.locator("#follow-mode-tools");
    assert.equal(await follow.isVisible(), true, "Follow remains in the wide transport row");
    assert.equal(await toolsFollow.isVisible(), true, "Alat also exposes Follow directly");
    const wasFollowing = await follow.isChecked();
    if (wasFollowing) await toolsFollow.uncheck(); else await toolsFollow.check();
    assert.equal(await follow.isChecked(), !wasFollowing, "the two Follow controls mirror the same playback setting");
    await page.selectOption("#language", "en");
    assert.equal(await dockResize.getAttribute("aria-label"), "Resize studio panel", "the splitter label follows the active language");
    const summary = await page.locator("#project-menu > summary > span").getAttribute("data-copy");
    assert.equal(summary, "projectMoreLabel", "the wide project disclosure is reserved for rare actions, not labelled Menu");
    assert.equal(await page.locator(".studio-more").isVisible(), false, "the empty Advanced popover is removed from wide workspaces");
    assert.equal(COMMON_CONTROL_TARGETS.length, 29, "the audit allowlist includes all four dock tabs");
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
