import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { COMMON_CONTROL_TARGETS, measurePage, startAuditServer } from "../tools/ui-audit.mjs";

test("Panel is a transport button on desktop and only Play stays filled in the chrome", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
      // Chrome Edit: tab Ide sengaja tidak menampilkan toggle Gitar maupun
      // collapse Piano Roll, jadi kedua tes ini pindah ke workspace Edit.
      await page.evaluate(() => window.melodi.commands.setViewMode("piano-roll"));
      await page.waitForTimeout(120);
      await page.evaluate(next => {
        const select = document.querySelector("#theme");
        select.value = next;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, theme);
      await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme, { timeout: 5000 });
      await page.waitForTimeout(300);

      // C2a: Panel bukan tab dan tidak lagi di dalam baris Edit/Not/Irama.
      const panelState = await page.evaluate(() => {
        const trigger = document.querySelector("[data-studio-panel-toggle]");
        const nav = document.querySelector("#studio-views");
        return {
          insideViewTabs: Boolean(nav && nav.contains(trigger)),
          role: trigger.getAttribute("role"),
          expanded: trigger.getAttribute("aria-expanded"),
          controls: trigger.getAttribute("aria-controls"),
          hasIcon: Boolean(trigger.querySelector("svg.toolbar-icon")),
          label: (trigger.textContent || "").trim(),
          height: Math.round(trigger.getBoundingClientRect().height),
        };
      });
      assert.equal(panelState.insideViewTabs, false, `${theme}: Panel tidak boleh berada di baris tab`);
      assert.equal(panelState.role, null, `${theme}: Panel bukan tab, jadi tanpa role=tab`);
      assert.equal(panelState.expanded, "true", `${theme}: aria-expanded mengikuti dock`);
      assert.equal(panelState.controls, "workspace-sidebar");
      assert.equal(panelState.hasIcon, true, `${theme}: Panel di desktop memakai ikon + label`);
      assert.equal(panelState.label, "Panel");
      assert.ok(Math.abs(panelState.height - 32) <= 1, `${theme}: tinggi Panel ${panelState.height}px harus --control-h`);

// C2c: hanya Play yang terisi di chrome. Terisi berarti latar tombol sama
      // dengan token accent atau accent-strong, bukan sekadar berbeda dari body.
const filled = await page.evaluate(() => {
        // Token accent berisi light-dark(), jadi nilainya harus di-resolve lewat
        // elemen sementara sebelum dibandingkan dengan warnanya.
        const probe = document.createElement("span");
        probe.style.display = "none";
        document.body.append(probe);
        const resolve = value => {
          probe.style.backgroundColor = "";
          probe.style.backgroundColor = `var(${value})`;
          return getComputedStyle(probe).backgroundColor;
        };
        const accent = [resolve("--accent"), resolve("--accent-strong")];
        probe.remove();
        // C2c: transport chrome hanya boleh punya Play terisi; baris aksi cepat
        // hanya boleh punya Generate, karena itu aksi primer panel Generate.
        const collect = selector => [...document.querySelectorAll(`${selector} button`)]
          .filter(button => button.getBoundingClientRect().width > 0)
          .map(button => ({
            id: button.id || null,
            label: (button.textContent || "").trim().slice(0, 20),
            filled: accent.includes(getComputedStyle(button).backgroundColor),
          }))
          .filter(entry => entry.filled);
        return {
          transport: collect(".transport-main"),
          quickActions: collect("#studio-core-controls"),
        };
      });
      // C3c: Generate nonaktif karena belum ada dua note, jadi warnanya bukan lagi
      // accent; yang diuji di sini: tombol primer lain di baris
      // aksi cepat tidak boleh ikut terisi.
      const primaryActions = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.display = "none";
        document.body.append(probe);
        probe.style.backgroundColor = "var(--accent)";
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return [...document.querySelectorAll("#studio-core-controls button")]
          .filter(button => button.getBoundingClientRect().width > 0)
          .map(button => ({
            id: button.id || null,
            label: (button.textContent || "").trim().slice(0, 20),
            filled: getComputedStyle(button).backgroundColor === accent,
            disabled: button.matches(":disabled"),
          }));
      });
      assert.deepEqual(
        primaryActions.filter(entry => entry.filled && !entry.disabled).map(entry => entry.id ?? entry.label),
        [],
        `${theme}: tanpa dua note tidak boleh ada tombol terisi di baris aksi cepat, dapat ${JSON.stringify(primaryActions)}`,
      );
      const generateButton = primaryActions.find(entry => entry.id === "generate-gap");
      assert.equal(generateButton.disabled, true, `${theme}: Generate harus nonaktif tanpa dua note`);
      assert.equal(await page.locator("#generate-gap").getAttribute("aria-describedby"), "generation-gap-status");
      const generateTitle = await page.locator("#generate-gap").getAttribute("title");
      assert.ok(generateTitle && generateTitle.trim().length > 8, `${theme}: tombol nonaktif punya alasan yang terbaca`);

      // C2b: toggle Gitar ikut --text-sm dan --control-h.
      const guitar = await page.evaluate(() => {
        const toggle = document.querySelector(".guitar-mode-toggle");
        const style = getComputedStyle(toggle);
        return {
          height: Math.round(toggle.getBoundingClientRect().height),
          fontSize: style.fontSize,
          pressed: toggle.getAttribute("aria-pressed"),
        };
      });
      assert.ok(Math.abs(guitar.height - 32) <= 1, `${theme}: tinggi toggle Gitar ${guitar.height}px harus --control-h`);
      assert.equal(guitar.fontSize, "13px", `${theme}: toggle Gitar harus --text-sm`);
      assert.ok(["true", "false"].includes(guitar.pressed));

      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("wide default exposes routine project, language, palette, history, and follow controls", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 10000 });
    // Tes ini menghitung chrome workspace Edit, bukan chrome Ide.
    await page.evaluate(() => window.melodi.commands.setViewMode("piano-roll"));
    await page.waitForTimeout(200);
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
    const phoneTabs = await page.locator("#mobile-workspace-dock > .studio-views").boundingBox();
    assert.ok(phoneDock && phoneDock.height >= 44 && phoneDock.y + phoneDock.height <= 844,
      "portrait mobile keeps the transport and workspace tabs in one on-screen dock");
    assert.ok(phoneTabs && phoneTabs.y + phoneTabs.height <= 844,
      "portrait workspace tabs are not clipped below the viewport");
    assert.equal(await page.locator("#mobile-workspace-dock > .studio-views > button").count(), 5,
      "the phone dock row is Ide, Edit, Not, Irama, Panel and nothing else");
    const mobileMenu = await page.locator("#project-menu > summary").boundingBox();
    assert.ok(mobileMenu && mobileMenu.width > 0 && mobileMenu.height > 0, "the compact project menu remains reachable in the header");
    const mobileMenuLabel = await page.locator("#project-menu > summary > span").innerText();
    assert.ok(mobileMenuLabel && mobileMenuLabel.toLowerCase() !== "undefined", "resizing restores a real localized project-menu label");
    await page.locator("#project-menu > summary").click();
    assert.equal(await page.locator("#project-menu").evaluate(element => element.open), true, "the compact project sheet opens from its visible trigger");
    await page.setViewportSize({ width: 844, height: 390 });
    const landscapeDock = await page.locator("#mobile-workspace-dock").boundingBox();
    const landscapeTabs = await page.locator("#studio-views").boundingBox();
    assert.ok(landscapeDock && landscapeDock.height >= 44 && landscapeDock.y + landscapeDock.height <= 390,
      "short-landscape mobile keeps transport and workspace tabs on screen");
    assert.ok(landscapeTabs && landscapeTabs.y + landscapeTabs.height <= 390,
      "short-landscape workspace tabs remain inside the viewport");
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
