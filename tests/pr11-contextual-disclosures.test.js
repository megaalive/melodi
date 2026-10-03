import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { configureState, startAuditServer } from "../tools/ui-audit.mjs";

async function withPage(viewport, run) {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 10000 });
    await run(page);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

async function selectStudioTab(page, name) {
  const panelToggle = page.locator("[data-studio-panel-toggle]");
  if (await panelToggle.isVisible() && await panelToggle.getAttribute("aria-expanded") !== "true") {
    await panelToggle.click();
  }
  await page.locator(`#studio-panel-${name}-tab`).click();
  await page.waitForFunction(panel => document.body.dataset.studioPanel === panel, name, { timeout: 3000 });
}

test("wide Generate tab opens routine generator details without hiding targets behind disclosures", async () => {
  await withPage({ width: 1440, height: 900 }, async page => {
    await selectStudioTab(page, "generate");

    const panel = page.locator("#generation-panel");
    assert.equal(await panel.isVisible(), true);
    assert.equal(await page.locator(".generation-options").evaluate(details => details.open), true,
      "generator options are open by default at the wide tier");
    assert.equal(await page.locator(".shortcut-help").evaluate(details => details.open), true,
      "shortcut help is open by default at the wide tier");
    for (const selector of ["#generation-start", "#generation-style", ".shortcut-help > p", "#generate-gap"]) {
      assert.equal(await page.locator(selector).isVisible(), true, `${selector} is visible on the selected Generate tab`);
    }

    const hiddenBehindClosedDetails = await panel.evaluate(element => [...element.querySelectorAll(
      'input:not([type="hidden"]), select, textarea, button, .shortcut-help > p'
    )].filter(target => {
      const details = target.closest("details:not([open])");
      return details && !target.closest("summary");
    }).map(target => target.id || target.dataset.action || target.className));
    assert.deepEqual(hiddenBehindClosedDetails, [], "routine generator targets do not sit behind closed details on wide screens");

    await selectStudioTab(page, "chords");
    assert.equal(await page.locator("#generation-panel").isVisible(), false,
      "switching dock tabs keeps the inactive Generate panel hidden");
  });
});

test("wide chord-draw controls open with the Chord panel while the harmony editor stays contextual", async () => {
  await withPage({ width: 1440, height: 900 }, async page => {
    await selectStudioTab(page, "chords");
    const picker = page.locator("#chord-draw-picker");
    assert.equal(await picker.evaluate(details => details.open), true,
      "chord-draw settings open when the Chord panel is active on a wide screen");
    assert.equal(await page.locator("#chord-draw-root").isVisible(), true,
      "chord-draw controls are inline and visible without another disclosure click");
    assert.equal(await page.locator("#harmony-editor").evaluate(details => details.open), false,
      "the harmony editor remains closed until a chord edit starts");
  });
});

test("candidate cards use the wide dock grid at 68rem and one column just below it", async () => {
  await withPage({ width: 1088, height: 768 }, async page => {
    await configureState(page, "edit-generate-candidates");
    const list = page.locator("#generation-candidates");
    for (const width of [320, 480]) {
      await page.locator(".workspace-grid").evaluate((element, dockWidth) => {
        element.style.setProperty("--studio-dock-width", `${dockWidth}px`);
      }, width);
      const layout = await list.evaluate(element => ({
        columns: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth
      }));
      assert.ok(layout.columns >= 2, `${width}px dock fits at least two candidate columns`);
      assert.ok(layout.scrollWidth <= layout.clientWidth, `${width}px dock candidate grid has no horizontal overflow`);
    }
  });

  await withPage({ width: 1087, height: 768 }, async page => {
    await configureState(page, "edit-generate-candidates");
    const layout = await page.locator("#generation-candidates").evaluate(element => ({
      flow: getComputedStyle(element).gridAutoFlow,
      columns: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
    }));
    assert.deepEqual(layout, { flow: "row", columns: 1 },
      "the compact single-column dock remains below the desktop-grid threshold");
  });
});

test("expression editors stay contextual and open only for a matching selected-note mode", async () => {
  await withPage({ width: 1440, height: 900 }, async page => {
    const noteId = await page.evaluate(() => {
      const commands = window.melodi.commands;
      commands.newIdea();
      const note = commands.addNote({ pitch: 64, startTick: 0, durationTicks: 480 });
      commands.selectNotes([note.id]);
      return note.id;
    });
    await page.locator("#note-selection-bar .selection-more > summary").click();
    await page.locator('#note-selection-bar [data-studio-panel="expression"]').click();
    await page.waitForFunction(() => document.body.dataset.studioPanel === "expression", null, { timeout: 3000 });

    await page.evaluate(() => window.melodi.commands.selectNotes([]));
    await page.waitForFunction(() => document.body.dataset.studioSelection === "false", null, { timeout: 3000 });

    const status = page.locator("#expression-status");
    assert.equal(await status.isVisible(), true);
    const emptyHint = (await status.innerText()).trim();
    assert.ok(emptyHint.length > 0 && emptyHint.length <= 100, `no-selection guidance should stay concise: ${emptyHint}`);
    for (const selector of ["#expression-note-details", "#bend-editor-details", "#expression-vibrato-details"]) {
      const details = page.locator(selector);
      assert.equal(await details.evaluate(element => element.open), false, `${selector} stays closed without a selected note`);
    }
    assert.equal(await page.locator("#expression-note-details").evaluate(element => element.hidden), true,
      "note-specific editing stays hidden until selection provides context");

    await page.evaluate(id => window.melodi.commands.selectNotes([id]), noteId);
    await page.waitForFunction(() => document.querySelector("#expression-note-details")?.open, null, { timeout: 3000 });
    assert.equal(await page.locator("#expression-note-details").isVisible(), true,
      "selected-note controls are shown and expanded");
    assert.equal(await page.locator("#bend-editor-details").evaluate(element => element.open), true,
      "the bend editor opens for a selected note in bend mode");

    await page.locator('[data-action="set-expression-mode"][data-expression-mode="vibrato"]').click();
    await page.waitForFunction(() => document.querySelector("#expression-vibrato-details")?.open, null, { timeout: 3000 });
    assert.equal(await page.locator("#expression-vibrato-details").isVisible(), true,
      "vibrato details open when vibrato mode has a single selected note");
    assert.equal(await page.locator("#expression-vibrato-depth").isVisible(), true);
  });
});

test("phone generator disclosures remain collapsible and keep form controls and actions reachable", async () => {
  await withPage({ width: 390, height: 844 }, async page => {
    await configureState(page, "edit-generate-candidates");

    const options = page.locator(".generation-options");
    const shortcuts = page.locator(".shortcut-help");
    assert.equal(await options.evaluate(details => details.open), false, "phone generator options start collapsed");
    assert.equal(await shortcuts.evaluate(details => details.open), false, "phone shortcut help starts collapsed");
    assert.equal(await options.locator(":scope > summary").isVisible(), true, "generator options disclosure is reachable");
    assert.equal(await shortcuts.locator(":scope > summary").isVisible(), true, "shortcut disclosure is reachable");

    await options.locator(":scope > summary").click();
    assert.equal(await options.evaluate(details => details.open), true, "generator options can be expanded on phone");
    for (const selector of ["#generation-start", "#generation-style"]) {
      const control = page.locator(selector);
      await control.scrollIntoViewIfNeeded();
      assert.equal(await control.isVisible(), true, `${selector} is reachable after expansion`);
      const insideViewport = await control.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      });
      assert.equal(insideViewport, true, `${selector} can be brought into the phone viewport`);
    }
    const primaryAction = page.locator("#generate-gap");
    await primaryAction.scrollIntoViewIfNeeded();
    assert.equal(await primaryAction.isVisible(), true, "primary generation action remains reachable outside the disclosure");
    assert.equal(await primaryAction.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    }), true, "the primary action can be brought into the phone viewport");

    await options.locator(":scope > summary").click();
    assert.equal(await options.evaluate(details => details.open), false, "generator options can be collapsed again");
    assert.equal(await page.locator("#generation-start").isVisible(), false, "collapsed options hide their fields");
    await shortcuts.locator(":scope > summary").click();
    assert.equal(await shortcuts.evaluate(details => details.open), true, "shortcut help can be expanded on phone");
    assert.equal(await page.locator(".shortcut-help > p").isVisible(), true, "shortcut text is reachable when expanded");
    await shortcuts.locator(":scope > summary").click();
    assert.equal(await shortcuts.evaluate(details => details.open), false, "shortcut help can be collapsed again");
  });
});
