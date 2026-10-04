import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAuditServer } from "../tools/ui-audit.mjs";

// These selectors identify the operation itself. Dock tabs are intentionally not
// targets: reaching a feature's tab is not the same as reaching its control.
const CORE_TARGETS = [
  { key: "guitar", operation: "Guitar", selector: ".mobile-guitar-trigger, #guitar-mode-toggle" },
  { key: "chord-add", operation: "Chord", selector: '.studio-quick-chord button[data-action="add-chord"], #harmony-timeline-tools button[data-action="add-chord"]', outsideDock: true },
  { key: "generate-anchor-mark", operation: "Mark Generate anchors", selector: '#generation-anchor-actions [data-action="mark-selected-anchors"]', outsideDock: true },
  { key: "generate-anchor-use", operation: "Use Generate anchors", selector: '#generation-anchor-actions [data-action="use-selected-anchors"]', outsideDock: true },
  { key: "generate", operation: "Generate", selector: "#generate-gap", outsideDock: true },
  // C3a: volume hanya ada di panel Mixer, jadi satu klik tab sudah cukup.
  { key: "mixer-melody", operation: "Mixer melody", selector: '#studio-mixer-channels [data-channel-volume][data-channel-id="melody"]', maxSteps: 1 },
  { key: "mixer-harmony", operation: "Mixer harmony", selector: '#studio-mixer-channels [data-channel-volume][data-channel-id="harmony"]', maxSteps: 1 },
  { key: "mixer-bass", operation: "Mixer bass", selector: '#studio-mixer-channels [data-channel-volume][data-channel-id="bass"]', maxSteps: 1 },
  { key: "snap", operation: "Snap", selector: "#snap-select", outsideDock: true },
  { key: "zoom", operation: "Zoom", selector: "#roll-zoom", outsideDock: true },
  { key: "select-tool", operation: "Select tool", selector: "#roll-tool-select", outsideDock: true },
  { key: "draw-tool", operation: "Draw tool", selector: "#roll-tool-draw", outsideDock: true },
  { key: "add-note", operation: "Add Note", selector: '#add-note-form button[type="submit"], #roll-tool-draw', outsideDock: true },
  { key: "seek-input", operation: "Seek position", selector: "#seek-tick", outsideDock: true },
  { key: "seek-submit", operation: "Seek action", selector: 'form[data-action="seek"] button[type="submit"]', outsideDock: true },
  { key: "range-select", operation: "Select Range", selector: '#selection-form button[type="submit"], #roll-tool-select', outsideDock: true },
  { key: "loop-toggle", operation: "Loop toggle", selector: "#loop-enabled", outsideDock: true },
  { key: "loop-start", operation: "Loop start", selector: "#loop-start", outsideDock: true },
  { key: "loop-end", operation: "Loop end", selector: "#loop-end", outsideDock: true },
  { key: "loop-apply", operation: "Apply Loop range", selector: 'form.loop-range button[type="submit"]', outsideDock: true },
  { key: "undo", operation: "Undo", selector: "#undo" },
  { key: "redo", operation: "Redo", selector: "#redo" },
  { key: "project-new", operation: "New song", selector: '[data-action="new-song"]' },
  { key: "project-examples", operation: "Examples", selector: '[data-action="show-examples"]', projectSecondary: true },
  { key: "project-library", operation: "Open browser library", selector: '[data-action="show-browser-library"]', projectSecondary: true },
  { key: "project-save-browser", operation: "Save to browser library", selector: '[data-action="save-browser-direct"]', projectSecondary: true },
  { key: "project-save-as", operation: "Save as", selector: '[data-action="show-save-browser"]', projectSecondary: true },
  { key: "project-open-file", operation: "Open project file", selector: '[data-action="open-project-file"]' },
  { key: "project-save-file", operation: "Save project file", selector: '[data-action="save-project-file"]' },
  { key: "project-share", operation: "Share song", selector: '[data-action="share-song"]' },
];

const VIEWPORTS = [
  { name: "wide desktop (>=90rem)", width: 1600, height: 900, mobile: false, maxSteps: 0 },
  { name: "medium desktop (68–90rem)", width: 1200, height: 900, mobile: false, maxSteps: 0 },
  { name: "phone (<=46rem)", width: 390, height: 844, mobile: true, maxSteps: 1 },
];

async function inspectTargets(page) {
  return page.evaluate(targets => {
    const describe = element => {
      const accessible = element.getAttribute("aria-label") || element.getAttribute("title");
      const labelledBy = element.getAttribute("aria-labelledby")
        ?.split(/\s+/).map(id => document.getElementById(id)?.innerText?.trim()).filter(Boolean).join(" ");
      const labels = [...(element.labels ?? [])].map(label => label.innerText.trim()).filter(Boolean).join(" ");
      const wrappingLabel = element.closest("label")?.innerText?.trim();
      const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
      return accessible || labelledBy || labels || wrappingLabel || text;
    };
    const selectorOf = element => element.id ? `#${element.id}`
      : element.dataset.action ? `[data-action="${element.dataset.action}"]`
        : element.tagName.toLowerCase() === "summary" && element.closest("details")?.id
          ? `#${element.closest("details").id} > summary`
          : element.tagName.toLowerCase() === "summary" && element.closest("details")?.classList.length
            ? `.${[...element.closest("details").classList].join(".")} > summary`
            : element.tagName.toLowerCase();
    const revealPath = element => {
      const triggers = new Set();
      const unmapped = [];
      const addTrigger = (trigger, reason) => {
        if (trigger) triggers.add(trigger);
        else unmapped.push(reason);
      };
      for (let node = element; node; node = node.parentElement) {
        if (node.matches("details:not([open])") && !element.closest("summary")) {
          addTrigger(node.querySelector(":scope > summary") || node.querySelector("summary"), "closed disclosure without summary");
        }
        if (node.matches("[role=tabpanel][hidden]")) {
          const tab = [...document.querySelectorAll("[role=tab][aria-controls]")]
            .find(candidate => candidate.getAttribute("aria-controls") === node.id);
          addTrigger(tab, `inactive tabpanel ${node.id || "(unnamed)"}`);
        }
        if (node.matches(".workspace-sidebar[hidden], .workspace-sidebar[inert], .workspace-sidebar[aria-hidden=true]")) {
          const opener = document.querySelector("button[data-studio-panel-toggle], .mobile-panel-trigger");
          const panel = element.closest('[role="tabpanel"]');
          const tab = panel && [...document.querySelectorAll('[role="tab"][aria-controls]')]
            .find(candidate => candidate.getAttribute("aria-controls") === panel.id);
          addTrigger(tab || opener, "closed workspace sidebar");
        }
        if (node.matches('#studio-guitar-zone[data-open="false"]')) {
          addTrigger(document.querySelector("#guitar-mode-toggle"), "closed Guitar zone");
        }
        if (node.hasAttribute("hidden") && !node.matches("[role=tabpanel], .workspace-sidebar, #studio-guitar-zone")) {
          unmapped.push(`hidden ${selectorOf(node)}`);
        }
        if (node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") {
          if (!node.matches(".workspace-sidebar")) unmapped.push(`inert/aria-hidden ${selectorOf(node)}`);
        }
      }
      return { steps: triggers.size + unmapped.length, triggers: [...triggers], unmapped };
    };
    const visible = element => {
      if (!element.isConnected || !element.getClientRects().length) return false;
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (node.hidden || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        if (node.matches("details:not([open])") && !element.closest("summary")) return false;
      }
      return true;
    };
    const inViewport = element => {
      const rect = element.getBoundingClientRect();
      let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) {
          clip.left = Math.max(clip.left, rect.left + parent.clientLeft);
          clip.right = Math.min(clip.right, rect.left + parent.clientLeft + parent.clientWidth);
        }
        if (["hidden", "clip", "auto", "scroll"].includes(style.overflowY)) {
          clip.top = Math.max(clip.top, rect.top + parent.clientTop);
          clip.bottom = Math.min(clip.bottom, rect.top + parent.clientTop + parent.clientHeight);
        }
      }
      const roundingTolerance = 1;
      return rect.left >= clip.left - roundingTolerance && rect.top >= clip.top - roundingTolerance
        && rect.right <= clip.right + roundingTolerance && rect.bottom <= clip.bottom + roundingTolerance;
    };
    const scrollReachable = element => {
      const scroller = element.closest("#studio-core-controls");
      if (!scroller || !["auto", "scroll"].includes(getComputedStyle(scroller).overflowX)
        || scroller.scrollWidth <= scroller.clientWidth + 1) return false;
      const original = scroller.scrollLeft;
      const bounds = scroller.getBoundingClientRect();
      const target = element.getBoundingClientRect();
      const left = bounds.left + scroller.clientLeft;
      const right = left + scroller.clientWidth;
      if (target.left < left) scroller.scrollLeft += target.left - left;
      else if (target.right > right) scroller.scrollLeft += target.right - right;
      const reachable = inViewport(element);
      scroller.scrollLeft = original;
      return reachable;
    };
    const rectOf = element => {
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    return targets.map(target => {
      const candidates = [...document.querySelectorAll(target.selector)].map(element => {
        const path = revealPath(element);
        return {
          selector: selectorOf(element),
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          label: describe(element),
          rect: rectOf(element),
          disabled: Boolean(element.disabled),
          visible: visible(element),
          inViewport: visible(element) && inViewport(element),
          scrollReachable: visible(element) && scrollReachable(element),
          insideDock: Boolean(element.closest(".workspace-sidebar")),
          reveal: {
            steps: path.steps,
            unmapped: path.unmapped,
            triggers: path.triggers.map(trigger => ({
              selector: selectorOf(trigger),
              rect: rectOf(trigger),
              visible: visible(trigger),
              inViewport: visible(trigger) && inViewport(trigger),
            })),
          },
        };
      });
      candidates.sort((a, b) => a.reveal.steps - b.reveal.steps
        || (target.outsideDock ? Number(a.insideDock) - Number(b.insideDock) : 0)
        || Number(b.inViewport) - Number(a.inViewport)
        || Number(a.insideDock) - Number(b.insideDock)
        || Number(b.visible) - Number(a.visible));
      return { ...target, candidates, best: candidates[0] || null };
    });
  }, CORE_TARGETS);
}

test("core operations have a real, labelled control within the reveal-step budget", async t => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) await t.test(viewport.name, async () => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
        colorScheme: "light",
      });
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 10000 });
        const controls = await inspectTargets(page);
        const errors = [];
        for (const target of controls) {
          const control = target.best;
          if (!control) {
            errors.push(`${target.operation}: no matching action control (${target.selector})`);
            continue;
          }
          if (!["button", "input", "select", "textarea", "summary"].includes(control.tag)) {
            errors.push(`${target.operation}: ${control.selector} is not an actionable form/control element`);
          }
          if (control.role === "tab") {
            errors.push(`${target.operation}: ${control.selector} is only a tab, not the operation itself`);
          }
          if (!control.label) errors.push(`${target.operation}: ${control.selector} has no default accessible/text label`);
          const maxSteps = target.projectSecondary && viewport.width >= 1088 && viewport.width < 1440
            ? 1 : target.maxSteps ?? viewport.maxSteps;
          if (control.reveal.steps > maxSteps) {
            errors.push(`${target.operation}: needs ${control.reveal.steps} reveal step(s), budget ${maxSteps}; path=${JSON.stringify(control.reveal)}`);
          }
          if (control.visible && !control.inViewport && !control.scrollReachable) {
            errors.push(`${target.operation}: ${control.selector} at ${JSON.stringify(control.rect)} is clipped or outside the viewport`);
          }
          if (control.reveal.steps === 0 && !control.inViewport && !control.scrollReachable) {
            errors.push(`${target.operation}: zero-step target at ${JSON.stringify(control.rect)} is not fully visible inside the viewport`);
          }
          if (control.reveal.steps > 0 && !control.reveal.triggers.every(trigger => trigger.visible && trigger.inViewport)) {
            errors.push(`${target.operation}: reveal control is not visible inside the viewport; path=${JSON.stringify(control.reveal)}`);
          }
          if (control.reveal.steps > 0
            && (control.reveal.unmapped.length > 0 || control.reveal.triggers.length !== control.reveal.steps)) {
            errors.push(`${target.operation}: reveal path does not map to visible controls; path=${JSON.stringify(control.reveal)}`);
          }
          if (viewport.width >= 1088 && target.outsideDock) {
            const directOutsideDock = target.candidates.some(candidate => candidate.reveal.steps === 0
              && candidate.visible && (candidate.inViewport || candidate.scrollReachable) && !candidate.insideDock);
            if (!directOutsideDock) errors.push(`${target.operation}: no zero-step compact control outside the dock`);
          }
        }
        assert.deepEqual(errors, [], `Core reachability failures at ${viewport.width}×${viewport.height}:\n${errors.join("\n")}`);
      } finally {
        await context.close();
      }
    });
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
