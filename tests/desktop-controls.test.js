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
    assert.equal(audit.clickToRevealControls.some(control => control.key === "seek-tick"), false,
      "the Seek slider stays in the visible core control strip");
    assert.equal(audit.inactiveTabControls.some(control => control.key === "seek-tick"), false,
      "the Seek slider is not hidden in an inactive panel");
    assert.equal(audit.clickToRevealControls.some(control => control.key === "generation-options"), false,
      "the pinned Generate slot opens its routine options at the wide tier");
    assert.equal(audit.matchedCommonControlKeys.includes("generation-shortcuts"), true,
      "the audit targets shortcut help content rather than its visible disclosure summary");
    assert.equal(audit.clickToRevealCount, audit.clickToRevealControls.length,
      "the click-to-reveal total is the complete list of hidden common controls");
    assert.equal(audit.clickToRevealCount, audit.closedRevealTargetCount + audit.inactiveTabTargetCount,
      "closed disclosures and inactive tabs explain the complete strict click-to-reveal total");
    assert.equal(await page.locator(".desktop-project-actions button").count(), 8,
      "all project actions are direct controls from the extra-wide tier");
    assert.equal(await page.locator("#project-menu").isVisible(), false,
      "the empty project menu is removed when all actions fit in the Project group");
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
    assert.equal(summary, "projectActionsHeading", "the hidden menu keeps the localized Project label while all actions are direct");
    assert.equal(await page.locator(".studio-more").isVisible(), false, "the empty Advanced popover is removed from wide workspaces");
    assert.equal(COMMON_CONTROL_TARGETS.length, 29, "the audit allowlist includes all four dock tabs");
    const collapse = await page.locator("#piano-roll-collapse").evaluate(element => ({
      display: getComputedStyle(element).display,
      direction: getComputedStyle(element).flexDirection,
      width: element.getBoundingClientRect().width,
    }));
    assert.ok(["flex", "inline-flex"].includes(collapse.display));
    assert.equal(collapse.direction, "row");
    assert.ok(collapse.width >= 100, "the wide collapse label and chevron share one readable row");

    await page.setViewportSize({ width: 390, height: 844 });
    const phoneDock = await page.locator("#mobile-workspace-dock").boundingBox();
    const phoneTabs = await page.locator("#mobile-workspace-dock > .studio-panel-switches").boundingBox();
    assert.ok(phoneDock && phoneDock.height >= 88 && phoneDock.y + phoneDock.height <= 844,
      "portrait mobile reserves the second dock row for workspace and panel tabs");
    assert.ok(phoneTabs && phoneTabs.y + phoneTabs.height <= 844,
      "portrait panel tabs are not clipped below the viewport");
    const mobileMenu = await page.locator("#project-menu > summary").boundingBox();
    assert.ok(mobileMenu && mobileMenu.width > 0 && mobileMenu.height > 0, "the compact project menu remains reachable in the header");
    const mobileMenuLabel = await page.locator("#project-menu > summary > span").innerText();
    assert.ok(mobileMenuLabel && mobileMenuLabel.toLowerCase() !== "undefined", "resizing restores a real localized project-menu label");
    await page.locator("#project-menu > summary").click();
    assert.equal(await page.locator("#project-menu").evaluate(element => element.open), true, "the compact project sheet opens from its visible trigger");
    await page.setViewportSize({ width: 844, height: 390 });
    const landscapeDock = await page.locator("#mobile-workspace-dock").boundingBox();
    const landscapeTabs = await page.locator("#mobile-workspace-dock > .studio-panel-switches").boundingBox();
    assert.ok(landscapeDock && landscapeDock.height >= 44 && landscapeDock.y + landscapeDock.height <= 390,
      "short-landscape mobile keeps transport and panel tabs in one on-screen dock row");
    assert.ok(landscapeTabs && landscapeTabs.y + landscapeTabs.height <= 390,
      "short-landscape panel tabs remain inside the viewport");
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.waitForFunction(() => document.querySelectorAll(".desktop-project-actions button").length === 4, null, { timeout: 3000 });
    assert.equal(await page.locator(".desktop-project-actions button").count(), 4,
      "the 68–90rem tier keeps four routine project actions direct");
    assert.equal(await page.locator("#project-menu .project-menu-section > button").count(), 4,
      "the 68–90rem Project menu contains the four additional actions");
    assert.equal(await page.locator("#project-menu").isVisible(), true,
      "the 68–90rem Project menu remains visible");
    const mediumAudit = await measurePage(page);
    const mediumBoxes = await page.locator(".page-header, .transport-dock, .transport-main, .playback-settings-group, .history-buttons, .header-actions, .desktop-project-actions, .workspace-chrome, .workspace-toolbar, #view-controls, .studio-toolbar-actions, .studio-views, .app-shell, .workspace-canvas, #studio-core-controls, #editor-toolbar, #undo, #redo, #roll-tool-draw").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { id: element.id, className: element.className, ancestors: (() => { const path = []; for (let node = element; node && path.length < 5; node = node.parentElement) path.push(`${node.tagName}.${node.className || node.id}`); return path; })(), rect: [rect.x, rect.y, rect.width, rect.height], display: style.display, position: style.position, top: style.top, margin: style.margin, transform: style.transform, order: style.order };
    }));
    assert.equal(mediumAudit.overlapCount, 0, `medium project actions do not overlap nearby controls: ${JSON.stringify({ overlaps: mediumAudit.overlaps, mediumBoxes })}`);
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
