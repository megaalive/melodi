import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VIEWPORTS = [
  { name: "large-desktop", width: 1920, height: 1080, mobile: false },
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "medium-desktop", width: 1280, height: 900, mobile: false, states: ["edit-default", "edit-chord-panel", "edit-generate-candidates", "edit-mixer-panel", "not-score", "not-lyrics", "irama", "dual-dock", "dual-dock-not", "dual-dock-irama"] },
  { name: "desktop-short", width: 1440, height: 799, mobile: false, states: ["edit-default", "edit-guitar-zone-open", "dual-dock", "dual-dock-not", "dual-dock-irama"] },
  { name: "tablet", width: 1024, height: 768, mobile: false },
  { name: "portrait", width: 390, height: 844, mobile: true },
  { name: "landscape", width: 844, height: 390, mobile: true },
];
export const THEMES = ["light", "dark"];
export const STATES = [
  { id: "edit-default", label: "Edit (Piano Roll default)" },
  { id: "edit-guitar", label: "Edit + Guitar layer" },
  { id: "edit-chord-panel", label: "Edit + Chord panel open" },
  { id: "edit-generate-candidates", label: "Edit + Generate open with candidates" },
  { id: "edit-mixer-panel", label: "Edit + Mixer panel open" },
  { id: "not-score", label: "Not (Score)" },
  { id: "not-lyrics", label: "Not (Lyrics)" },
  { id: "irama", label: "Irama" },
  { id: "project-menu-open", label: "Project menu open" },
  { id: "more-open", label: "Lainnya popover/sheet open" },
  { id: "edit-guitar-zone-open", label: "Edit + Guitar zone open" },
  { id: "edit-guitar-fretboard", label: "Edit + Guitar fretboard" },
  { id: "not-guitar-zone-open", label: "Not + Guitar zone open" },
  { id: "irama-drum-expression", label: "Irama + Drum Expression" },
  { id: "dual-dock", label: "Dual dock (when viewport supports it)" },
  { id: "dual-dock-not", label: "Notation dual dock" },
  { id: "dual-dock-irama", label: "Rhythm dual dock" },
];

export const COMMON_CONTROL_TARGETS = [
  { key: "project-new", selector: '[data-action="new-song"]' },
  { key: "project-open", selector: '[data-action="open-project-file"]' },
  { key: "project-save", selector: '[data-action="save-project-file"]' },
  { key: "project-share", selector: '[data-action="share-song"]' },
  { key: "language", selector: "#language" },
  { key: "theme", selector: "#theme" },
  { key: "command-palette", selector: 'button[data-action="command-palette"]' },
  { key: "undo", selector: "#undo" },
  { key: "redo", selector: "#redo" },
  { key: "seek-tick", selector: "#seek-tick" },
  { key: "seek-submit", selector: 'form[data-action="seek"] button[type="submit"]' },
  { key: "loop-enabled", selector: "#loop-enabled" },
  { key: "loop-start", selector: "#loop-start" },
  { key: "loop-end", selector: "#loop-end" },
  { key: "loop-apply", selector: 'form.loop-range button[type="submit"]' },
  { key: "follow-playback", selector: "#follow-mode" },
  { key: "add-note", selector: "#add-note-form input, #add-note-form button" },
  { key: "select-range", selector: "#selection-form input, #selection-form button" },
  { key: "mixer-tab", selector: '[data-studio-panel="mixer"]' },
  { key: "chord-tab", selector: '[data-studio-panel="chords"]' },
  { key: "generate-tab", selector: '[data-studio-panel="generate"]' },
  { key: "tools-tab", selector: '[data-studio-panel="tools"]' },
  { key: "generation-options", selector: ".generation-options input, .generation-options select, .generation-options button:not([data-sheet-close])" },
  { key: "generation-shortcuts", selector: ".shortcut-help > p" },
  { key: "snap", selector: "#snap-select" },
  { key: "zoom", selector: "#roll-zoom" },
  { key: "select-tool", selector: "#roll-tool-select" },
  { key: "draw-tool", selector: "#roll-tool-draw" },
  { key: "guitar", selector: "#guitar-mode-toggle" },
];

const MIME = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"],
  [".png", "image/png"], [".woff", "font/woff"], [".woff2", "font/woff2"],
  [".mp3", "audio/mpeg"], [".wav", "audio/wav"], [".mid", "audio/midi"],
]);

function parseArgs(argv) {
  const args = { out: "docs/ui-audit/generated", basePath: "/melodi/", port: 4173, screenshots: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--base-path") args.basePath = argv[++i];
    else if (argv[i] === "--port") args.port = Number(argv[++i]);
    else if (argv[i] === "--screenshots") args.screenshots = argv[++i].split(",").filter(Boolean);
    else if (argv[i] === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  args.basePath = `/${args.basePath.split("/").filter(Boolean).join("/")}/`;
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) throw new Error("--port must be a valid TCP port");
  return args;
}

export async function startAuditServer({ basePath = "/melodi/", port = 4173 } = {}) {
  const prefix = `/${basePath.split("/").filter(Boolean).join("/")}/`;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      if (pathname !== prefix && !pathname.startsWith(prefix)) {
        response.writeHead(404).end("Not found");
        return;
      }
      const relative = decodeURIComponent(pathname.slice(prefix.length));
      const file = path.resolve(ROOT, relative || "index.html");
      if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": MIME.get(path.extname(file).toLowerCase()) ?? "application/octet-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}${prefix}` };
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function configureState(page, stateId) {
  await page.evaluate(id => {
    const commands = window.melodi?.commands;
    if (!commands) throw new Error("window.melodi.commands is not ready");
    commands.newIdea();
    const addSelectedGuitarNote = () => {
      const note = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
      commands.selectNotes([note.id]);
    };
    if (id === "edit-guitar") {
      addSelectedGuitarNote();
      commands.setViewMode("guitar");
    } else if (id === "edit-guitar-fretboard") {
      addSelectedGuitarNote();
      commands.setViewMode("guitar");
      document.querySelector("#guitar-layout-fretboard")?.click();
    } else if (id === "edit-chord-panel" || id === "edit-mixer-panel") {
      const panel = id === "edit-chord-panel" ? "chords" : "mixer";
      const more = document.querySelector("details.studio-more");
      if (more) more.open = true;
      document.querySelector(`button[data-studio-panel="${panel}"]`)?.click();
    } else if (id === "edit-generate-candidates") {
      const left = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
      const right = commands.addNote({ pitch: 67, startTick: 1440, durationTicks: 480 });
      commands.setAnchor(left.id, true);
      commands.setAnchor(right.id, true);
      commands.generateGap({ startTick: 480, endTick: 1440, leftAnchorNoteId: left.id, rightAnchorNoteId: right.id, seed: 1 });
      const more = document.querySelector("details.studio-more");
      if (more) more.open = true;
      document.querySelector('button[data-studio-panel="generate"]')?.click();
    } else if (id === "not-score") {
      commands.setViewMode("score");
    } else if (id === "not-lyrics") {
      commands.setViewMode("lyrics");
    } else if (id === "irama") {
      commands.setViewMode("drums");
    } else if (id === "edit-guitar-zone-open") {
      addSelectedGuitarNote();
      commands.setViewMode("guitar");
    } else if (id === "not-guitar-zone-open") {
      addSelectedGuitarNote();
      commands.setViewMode("score");
      if (matchMedia("(max-width: 46rem), (max-height: 500px)").matches) {
        document.querySelector('[data-entity="guitar-sheet-trigger"]')?.click();
      } else {
        commands.setViewMode("guitar");
        commands.setViewMode("score");
      }
    } else if (id === "irama-drum-expression") {
      const { hit } = commands.addPercussionHit({ pieceId: "crash", startTick: 0, velocity: 96 });
      commands.selectPercussionHits([hit.id]);
      commands.setViewMode("drums");
      document.querySelector('button[data-studio-panel="drum-expression"]')?.click();
    } else if (id === "dual-dock") {
      commands.setViewMode("piano-roll");
    } else if (id === "dual-dock-not") {
      commands.setViewMode("score");
    } else if (id === "dual-dock-irama") {
      const { hit } = commands.addPercussionHit({ pieceId: "crash", startTick: 0, velocity: 96 });
      commands.selectPercussionHits([hit.id]);
      commands.setViewMode("drums");
      document.querySelector('button[data-studio-panel="drum-expression"]')?.click();
    } else if (id === "project-menu-open") {
      document.querySelector("details#project-menu > summary")?.click();
    } else if (id === "more-open") {
      document.querySelector("details.studio-more > summary")?.click();
    }
  }, stateId);
  if (stateId === "edit-generate-candidates") {
    await page.waitForFunction(() => document.querySelectorAll("#generation-candidates > li").length > 0, null, { timeout: 5000 });
  }
  if (stateId === "edit-chord-panel") {
    await page.waitForFunction(() => document.body.dataset.studioPanel === "chords", null, { timeout: 3000 });
  }
  if (stateId === "edit-mixer-panel") {
    await page.waitForFunction(() => document.body.dataset.studioPanel === "mixer", null, { timeout: 3000 });
  }
  if (stateId === "edit-guitar-zone-open") {
    await page.waitForFunction(() => document.querySelector("#studio-guitar-zone")?.dataset.open === "true"
      && document.querySelector("#studio-guitar-zone")?.hidden === false
      && document.querySelector("#guitar-section")?.hidden === false, null, { timeout: 3000 });
  }
  if (stateId === "not-guitar-zone-open") {
    await page.waitForFunction(() => document.querySelector('#studio-views [data-studio-view="score"][aria-pressed="true"]')
      && document.querySelector("#studio-guitar-zone")?.dataset.open === "true"
      && document.querySelector("#studio-guitar-zone")?.hidden === false
      && document.querySelector("#guitar-section")?.hidden === false, null, { timeout: 3000 });
  }
  if (stateId === "edit-guitar-fretboard") {
    await page.waitForFunction(() => document.querySelector("#guitar-layout-fretboard")?.getAttribute("aria-pressed") === "true"
      && document.querySelector("#guitar-scroll")?.hidden === false, null, { timeout: 3000 });
  }
  if (stateId === "irama-drum-expression") {
    await page.waitForFunction(() => document.body.dataset.studioPanel === "drum-expression"
      && document.querySelector("#studio-drum-expression")?.hidden === false
      && document.querySelector('.drum-cell[data-hit="true"][data-selected="true"]')
      && document.querySelector("#percussion-expression-form"), null, { timeout: 3000 });
  }
  if (stateId === "dual-dock-irama") {
    await page.waitForFunction(() => document.body.dataset.studioPanel === "drum-expression"
      && document.querySelector("#studio-drum-expression")?.hidden === false
      && document.querySelector("#percussion-expression-form"), null, { timeout: 3000 });
  }
  if (stateId.startsWith("dual-dock")) {
    await page.waitForFunction(() => !matchMedia("(width >= 90rem) and (min-height: 800px)").matches
      || document.querySelector('.workspace-sidebar[data-dual-dock="true"] [data-slot="generate"]')
        && document.querySelector('.workspace-sidebar[data-dual-dock="true"] [data-slot="secondary"]')
        && document.querySelector('#generation-panel')?.dataset.studioPinnedGenerate === "true", null, { timeout: 3000 });
  }
  if (stateId === "project-menu-open" || stateId === "more-open") {
    const selector = stateId === "project-menu-open" ? "details#project-menu" : "details.studio-more";
    await page.waitForFunction(sel => document.querySelector(sel)?.open, selector, { timeout: 3000 });
  }
  await settle(page);
}

export async function measurePage(page, stateId = "") {
  return page.evaluate(({ commonTargets, stateId }) => {
    const selector = "button, input:not([type=hidden]), select, textarea, summary, a[href], [role=button], [role=slider], [role=checkbox], [role=tab], [role=menuitem]";
    const viewport = { width: innerWidth, height: innerHeight };
    const round = value => Math.round(value * 10) / 10;
    const isUsable = element => {
      if (!element.isConnected || element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const closedDisclosure = element.closest("details:not([open])");
      if (closedDisclosure && !element.closest("summary")) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    };
    const effectiveRect = element => {
      const rect = element.getBoundingClientRect();
      const clip = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
      let outsideFixedAncestors = getComputedStyle(element).position === "fixed";
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const backdropFilter = style.backdropFilter || style.getPropertyValue("backdrop-filter") || "none";
        const generatesBox = style.display !== "contents" && style.display !== "none";
        const establishesFixedContainingBlock = generatesBox && (style.transform !== "none" || style.perspective !== "none"
          || style.filter !== "none" || backdropFilter !== "none"
          || /\b(layout|paint|strict|content)\b/.test(style.contain)
          || /\b(transform|perspective|filter)\b/.test(style.willChange));
        if (outsideFixedAncestors && !establishesFixedContainingBlock) continue;
        const parentRect = parent.getBoundingClientRect();
        const clipX = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX);
        const clipY = ["hidden", "clip", "auto", "scroll"].includes(style.overflowY);
        if (clipX) {
          clip.left = Math.max(clip.left, parentRect.left + parent.clientLeft);
          clip.right = Math.min(clip.right, parentRect.left + parent.clientLeft + parent.clientWidth);
        }
        if (clipY) {
          clip.top = Math.max(clip.top, parentRect.top + parent.clientTop);
          clip.bottom = Math.min(clip.bottom, parentRect.top + parent.clientTop + parent.clientHeight);
        }
        if (outsideFixedAncestors && establishesFixedContainingBlock) outsideFixedAncestors = false;
        if (style.position === "fixed") outsideFixedAncestors = true;
      }
      return {
        left: Math.max(rect.left, clip.left), top: Math.max(rect.top, clip.top),
        right: Math.min(rect.right, clip.right), bottom: Math.min(rect.bottom, clip.bottom), original: rect,
      };
    };
    const controlLabel = element => element.getAttribute("aria-label")
      || element.getAttribute("data-aria-copy") || element.getAttribute("data-copy")
      || element.getAttribute("title") || element.getAttribute("placeholder")
      || element.id || element.textContent.trim().replace(/\s+/g, " ").slice(0, 70) || element.tagName.toLowerCase();
    const clickToRevealControls = [];
    const closedRevealControls = [];
    const inactiveTabControls = [];
    const visiblePrimaryControls = [];
    const matchedCommonControlKeys = [];
    const hiddenReason = element => {
      const closedDisclosure = element.closest("details:not([open])");
      if (closedDisclosure && !element.closest("summary")) {
        return { type: "closed-disclosure", revealBy: controlLabel(closedDisclosure.querySelector("summary") ?? closedDisclosure) };
      }
      const tabPanel = element.closest("[role='tabpanel'][hidden]");
      if (tabPanel && !tabPanel.closest(".workspace-sidebar[hidden], .workspace-sidebar[inert], .workspace-sidebar[aria-hidden='true']")) {
        const tab = [...document.querySelectorAll("[role='tab'][aria-controls]")]
          .find(candidate => candidate.getAttribute("aria-controls") === tabPanel.id);
        if (tab?.getClientRects().length) return { type: "inactive-tab", revealBy: controlLabel(tab) };
      }
      const hidden = element.closest("[hidden], [inert], [aria-hidden='true']");
      if (hidden) {
        const panel = hidden.closest(".workspace-sidebar, [data-studio-panel], .studio-panel-content");
        return { type: panel ? "closed-panel" : "hidden-ancestor", revealBy: panel?.id || panel?.dataset.studioPanel || hidden.id || hidden.className || hidden.tagName.toLowerCase() };
      }
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
          const panel = node.closest(".workspace-sidebar, [data-studio-panel], .studio-panel-content");
          return { type: panel ? "closed-panel" : "css-hidden", revealBy: panel?.id || panel?.dataset.studioPanel || node.id || node.className || node.tagName.toLowerCase() };
        }
      }
      return null;
    };
    const seenTargets = new Set();
    for (const { key, selector: targetSelector } of commonTargets) for (const element of document.querySelectorAll(targetSelector)) {
      if (seenTargets.has(element)) continue;
      seenTargets.add(element);
      matchedCommonControlKeys.push(key);
      const reason = hiddenReason(element);
      if (reason) {
        const control = { key, label: controlLabel(element), id: element.id || null, selector: targetSelector, ...reason };
        clickToRevealControls.push(control);
        if (reason.type === "inactive-tab") inactiveTabControls.push(control);
        else closedRevealControls.push(control);
      }
      else if (element.getClientRects().length) visiblePrimaryControls.push({ key, label: controlLabel(element), id: element.id || null });
    }
    const controls = [...document.querySelectorAll(selector)].filter(isUsable).map(element => {
      const box = effectiveRect(element);
      return { element, label: controlLabel(element), box, width: Math.max(0, box.right - box.left), height: Math.max(0, box.bottom - box.top) };
    }).filter(control => control.width > 1 && control.height > 1);
    const clipped = controls.filter(control => {
      const rect = control.box.original;
      return control.box.left > rect.left + 1 || control.box.top > rect.top + 1
        || control.box.right < rect.right - 1 || control.box.bottom < rect.bottom - 1;
    }).map(({ element, label, box }) => {
      const clippedAxes = [];
      if (box.left > box.original.left + 1 || box.right < box.original.right - 1) clippedAxes.push("x");
      if (box.top > box.original.top + 1 || box.bottom < box.original.bottom - 1) clippedAxes.push("y");
      const reachableAxes = { x: null, y: null };
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (reachableAxes.x === null && ["auto", "scroll"].includes(style.overflowX)
          && parent.scrollWidth > parent.clientWidth + 1) {
          reachableAxes.x = parent.id ? `#${parent.id}` : parent.className?.baseVal ?? parent.className ?? parent.tagName.toLowerCase();
        }
        if (reachableAxes.y === null && ["auto", "scroll"].includes(style.overflowY)
          && parent.scrollHeight > parent.clientHeight + 1) {
          reachableAxes.y = parent.id ? `#${parent.id}` : parent.className?.baseVal ?? parent.className ?? parent.tagName.toLowerCase();
        }
      }
      const unreachableAxes = clippedAxes.filter(axis => !reachableAxes[axis]);
      const scrollableAncestor = reachableAxes.x || reachableAxes.y;
      return {
        label, tag: element.tagName.toLowerCase(), id: element.id || null,
        action: element.dataset.action || null,
        scrollableAncestor: scrollableAncestor ? [...new Set([reachableAxes.x, reachableAxes.y].filter(Boolean))].join(", ") : null,
        clippedAxes,
        unreachableAxes,
        visibleBox: [round(box.left), round(box.top), round(box.right - box.left), round(box.bottom - box.top)],
        elementBox: [round(box.original.left), round(box.original.top), round(box.original.width), round(box.original.height)],
      };
    });
    const overlaps = [];
    const overlaySelector = "dialog[open], .app-menu-popover, .studio-more-popover, .workspace-sidebar:not([hidden]), .transport-advanced[open] .transport-advanced-grid, .selection-more[open] .selection-more-actions, .generation-options[open]";
    for (let i = 0; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        const a = controls[i]; const b = controls[j];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const overlayA = a.element.closest(overlaySelector);
        const overlayB = b.element.closest(overlaySelector);
        if (overlayA !== overlayB && (overlayA || overlayB)) continue;
        const left = Math.max(a.box.left, b.box.left); const top = Math.max(a.box.top, b.box.top);
        const right = Math.min(a.box.right, b.box.right); const bottom = Math.min(a.box.bottom, b.box.bottom);
        if (right - left <= 2 || bottom - top <= 2) continue;
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        if (!hit || !(hit === a.element || a.element.contains(hit) || hit === b.element || b.element.contains(hit))) continue;
        overlaps.push({ a: a.label, b: b.label, intersection: [round(left), round(top), round(right - left), round(bottom - top)] });
      }
    }
    const canvasLabels = [...document.querySelectorAll("#piano-roll-section .roll-bar-label, #piano-roll-section .roll-pitch-label")];
    const canvasLabelOverlaps = [];
    const pianoViewport = document.querySelector("#piano-roll-section .piano-roll-scroll")?.getBoundingClientRect();
    for (const control of controls) {
      if (control.element.closest("#piano-roll-section")) continue;
      if (control.element.closest(overlaySelector)) continue;
      for (const label of canvasLabels) {
        if (!label.getClientRects().length) continue;
        let bounds;
        try { bounds = label.getBBox(); } catch { continue; }
        const matrix = label.getScreenCTM();
        if (!matrix) continue;
        const topLeft = new DOMPoint(bounds.x, bounds.y).matrixTransform(matrix);
        const bottomRight = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height).matrixTransform(matrix);
        const left = Math.max(control.box.left, topLeft.x, pianoViewport?.left ?? 0);
        const top = Math.max(control.box.top, topLeft.y, pianoViewport?.top ?? 0);
        const right = Math.min(control.box.right, bottomRight.x, pianoViewport?.right ?? viewport.width);
        const bottom = Math.min(control.box.bottom, bottomRight.y, pianoViewport?.bottom ?? viewport.height);
        if (right - left <= 1 || bottom - top <= 1) continue;
        canvasLabelOverlaps.push({ control: control.label, canvasLabel: label.textContent.trim(), intersection: [round(left), round(top), round(right - left), round(bottom - top)] });
      }
    }
    const activePane = [...document.querySelectorAll("#piano-roll-section, #score-section, #lyrics-section, #drums-section")]
      .find(element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const canvas = activePane?.querySelector(".piano-roll-scroll, .score-scroll, #drum-grid-scroll, textarea, [contenteditable='true']");
    const canvasRect = canvas?.getClientRects().length ? canvas.getBoundingClientRect() : null;
    const dock = document.getElementById("mobile-workspace-dock");
    const dockVisible = dock?.getClientRects().length && getComputedStyle(dock).visibility !== "hidden";
    const dockRect = dockVisible ? dock.getBoundingClientRect() : null;
    const workspace = document.getElementById("workspace-canvas");
    const chromeTop = workspace?.getClientRects().length
      ? Math.max(0, workspace.getBoundingClientRect().top)
      : canvasRect ? Math.max(0, canvasRect.top) : (activePane ? Math.max(0, activePane.getBoundingClientRect().top) : 0);
    const chromeBottom = dockRect && dockRect.top < viewport.height ? Math.max(0, viewport.height - dockRect.top) : 0;
    const roll = document.querySelector("#piano-roll-section .piano-roll-scroll");
    const rollRect = roll?.getClientRects().length ? roll.getBoundingClientRect() : null;
    const isActuallyVisible = element => {
      if (!element || !isUsable(element) || !element.getClientRects().length) return false;
      const box = effectiveRect(element);
      return box.right - box.left > 1 && box.bottom - box.top > 1;
    };
    const commands = window.melodi?.commands;
    const state = commands?.getState?.() ?? {};
    const song = commands?.getSong?.() ?? {};
    const selectedGuitarNoteId = commands?.getSelectedNoteIds?.()?.[0] ?? null;
    const guitarTab = document.querySelector("#guitar-tab-scroll #guitar-tab");
    const guitarFretboard = document.querySelector("#guitar-scroll #guitar");
    const guitarPayloads = [
      { name: "TAB", element: guitarTab, strings: guitarTab?.querySelectorAll(".guitar-tab-string").length ?? 0,
        notes: selectedGuitarNoteId ? guitarTab?.querySelectorAll(`[data-entity="guitar-tab-note"][data-note-id="${selectedGuitarNoteId}"]`).length ?? 0 : 0 },
      { name: "Fretboard", element: guitarFretboard, strings: guitarFretboard?.querySelectorAll(".neck-string").length ?? 0,
        notes: selectedGuitarNoteId ? guitarFretboard?.querySelectorAll(`[data-entity="guitar-position"][data-note-id="${selectedGuitarNoteId}"]`).length ?? 0 : 0 },
    ].map(payload => ({ ...payload, visible: isActuallyVisible(payload.element), hasSixStrings: payload.strings >= 6, hasSelectedNote: payload.notes > 0 }));
    const expectedGuitarLayout = stateId === "edit-guitar-fretboard" ? "Fretboard" : "TAB";
    const guitarPayloadVisible = guitarPayloads.some(payload => payload.name === expectedGuitarLayout
      && payload.visible && payload.hasSixStrings && payload.hasSelectedNote);
    const timeSignature = song.timing?.timeSignature ?? {};
    const barTicks = (song.timing?.ppq ?? 480) * 4 / (timeSignature.denominator ?? 4) * (timeSignature.numerator ?? 4);
    const snap = document.querySelector("#drums-snap-select")?.value
      ?? document.querySelector("#snap-select")?.value ?? state.editor?.snap ?? null;
    const snapTicks = { "1/4": song.timing?.ppq ?? 480, "1/8": (song.timing?.ppq ?? 480) / 2, "1/16": (song.timing?.ppq ?? 480) / 4 }[snap];
    const renderedBarStarts = [...document.querySelectorAll("#drum-grid-scroll .drum-grid-step[data-bar='true'][data-tick]")]
      .map(element => Number(element.dataset.tick)).filter(Number.isFinite).sort((left, right) => left - right);
    const projectedBarTicks = renderedBarStarts.length >= 2 ? renderedBarStarts[1] - renderedBarStarts[0] : null;
    const fourthBarLastTick = Number.isFinite(snapTicks) && snapTicks > 0
      ? (Math.ceil(4 * barTicks / snapTicks) - 1) * snapTicks : null;
    const fourthBarCell = Number.isFinite(fourthBarLastTick)
      ? document.querySelector(`#drum-grid-scroll .drum-cell[data-piece-id="crash"][data-tick="${fourthBarLastTick}"]`) : null;
    const drumScroll = document.querySelector("#drum-grid-scroll");
    const fourthBarCellRect = fourthBarCell?.getBoundingClientRect();
    const drumScrollRect = drumScroll?.getBoundingClientRect();
    const drumScrollBounds = drumScrollRect && drumScroll ? {
      left: drumScrollRect.left + drumScroll.clientLeft,
      right: drumScrollRect.left + drumScroll.clientLeft + drumScroll.clientWidth,
      top: drumScrollRect.top + drumScroll.clientTop,
      bottom: drumScrollRect.top + drumScroll.clientTop + drumScroll.clientHeight,
    } : null;
    const expectedDockPanel = { "dual-dock": "#harmony-panel", "dual-dock-not": "#studio-mixer", "dual-dock-irama": "#studio-drum-expression" }[stateId] ?? null;
    const dualDockSlots = ["generate", "secondary"].map(name => {
      const slot = document.querySelector(`.workspace-sidebar[data-dual-dock="true"] [data-slot="${name}"]`);
      const body = slot?.querySelector(".studio-dock-slot-body");
      const rect = body?.getBoundingClientRect();
      const visibleControlsInBody = [...(body?.querySelectorAll("button, input:not([type=hidden]), select, textarea, summary, a[href], [role=button], [role=tab]") ?? [])]
        .filter(isActuallyVisible).length;
      return { name, visible: Boolean(slot && body && isActuallyVisible(slot) && isActuallyVisible(body)
        && rect.width > 100 && rect.height > 60 && visibleControlsInBody > 0), visibleControls: visibleControlsInBody };
    });
    const secondarySlotBody = document.querySelector("#studio-dock-slot-secondary-body");
    const expectedDockPanelElement = expectedDockPanel ? document.querySelector(expectedDockPanel) : null;
    const dualDockSupported = matchMedia("(width >= 90rem) and (min-height: 800px)").matches;
    const dockCapable = matchMedia("(width >= 68rem)").matches;
    const dockContentRoot = dualDockSupported ? secondarySlotBody : dockCapable ? document.querySelector(".workspace-sidebar") : null;
    const expectedDockPanelVisible = expectedDockPanel && dockContentRoot
      ? Boolean(dockContentRoot.contains(expectedDockPanelElement) && isActuallyVisible(expectedDockPanelElement)) : null;
    const expressionForm = document.querySelector("#percussion-expression-form");
    const visibleExpressionControls = [...(expressionForm?.querySelectorAll("button, input:not([type=hidden]), select, textarea") ?? [])]
      .filter(isActuallyVisible).length;
    const selectedPercussionHitIds = commands?.getSelectedPercussionHitIds?.() ?? [];
    const selectedPercussionHitId = selectedPercussionHitIds.at(-1) ?? null;
    const percussionTrack = song.tracks?.find(track => track.kind === "percussion" && track.events?.some(hit => hit.id === selectedPercussionHitId));
    const selectedHit = percussionTrack?.events?.find(hit => hit.id === selectedPercussionHitId) ?? null;
    const selectedDrumHits = [...document.querySelectorAll('#drum-grid-scroll .drum-cell[data-hit="true"][data-selected="true"]')]
      .filter(isActuallyVisible).length;
    const expressionVelocity = document.querySelector("#percussion-velocity");
    const expressionPan = document.querySelector("#percussion-pan");
    const expressionSubmit = expressionForm?.querySelector('button[type="submit"]');
    const chromeBudgetPercent = matchMedia("(width >= 68rem)").matches
      ? 14 : matchMedia("(max-width: 46rem), (max-height: 500px)").matches ? 25 : null;
    const chromeTotalPxExact = chromeTop + chromeBottom;
    const chromePercentExact = chromeTotalPxExact / viewport.height * 100;
    const chromeBudgetExceeded = chromeBudgetPercent !== null
      && chromeTotalPxExact * 100 > viewport.height * chromeBudgetPercent;
    const sidebar = document.querySelector(".workspace-sidebar");
    const dualDockEnabled = sidebar?.dataset.dualDock === "true";
    return {
      build: document.querySelector('meta[name="melodi-build"]')?.content ?? null,
      activeView: document.querySelector("#studio-views [data-studio-view][aria-pressed='true']")?.dataset.studioView ?? null,
      activePane: activePane?.id ?? null,
      canvasTopPx: round(chromeTop),
      viewport,
      chrome: { topPx: round(chromeTop), bottomPx: round(chromeBottom), totalPx: round(chromeTop + chromeBottom), percent: round(chromePercentExact), percentExact: chromePercentExact },
      chromeBudgetPercent,
      chromeBudgetExceeded,
      visibleControls: controls.length,
      visiblePrimaryCount: visiblePrimaryControls.length,
      visiblePrimaryControls,
      matchedCommonControlKeys,
      clickToRevealCount: clickToRevealControls.length,
      clickToRevealControls,
      closedRevealTargetCount: closedRevealControls.length,
      closedRevealControls,
      inactiveTabTargetCount: inactiveTabControls.length,
      inactiveTabControls,
      controls: controls.map(({ element, label, box }) => ({ label, tag: element.tagName.toLowerCase(), id: element.id || null, action: element.dataset.action || null, rect: [round(box.left), round(box.top), round(box.right - box.left), round(box.bottom - box.top)] })),
      openDetails: [...document.querySelectorAll("details[open]")].map(element => element.id || element.className || "details"),
      detailsCount: document.querySelectorAll("details").length,
      nestedDetails: document.querySelectorAll("details details").length,
      overlapCount: overlaps.length,
      overlaps,
      canvasLabelOverlapCount: canvasLabelOverlaps.length,
      canvasLabelOverlaps,
      clippedCount: clipped.length,
      unreachableClipCount: clipped.filter(control => control.unreachableAxes.length > 0).length,
      clipped,
      guitarPayloads: guitarPayloads.map(({ name, visible, strings, hasSixStrings, notes, hasSelectedNote }) => ({ name, visible, strings, hasSixStrings, notes, hasSelectedNote })),
      guitarPayloadVisible,
      selectedDrumHits,
      percussionExpressionIdentity: {
        selectedHitId: selectedPercussionHitId,
        formHitId: expressionForm?.dataset.hitId ?? null,
        hitIdentityMatches: Boolean(selectedHit && expressionForm?.dataset.hitId === selectedHit.id),
        selectedTrackId: percussionTrack?.id ?? null,
        formTrackId: expressionForm?.dataset.trackId ?? null,
        trackIdentityMatches: Boolean(percussionTrack && expressionForm?.dataset.trackId === percussionTrack.id),
        expectedVelocity: selectedHit?.velocity ?? null,
        formVelocity: expressionVelocity ? Number(expressionVelocity.value) : null,
        velocityMatches: Boolean(selectedHit && expressionVelocity && Number(expressionVelocity.value) === selectedHit.velocity),
      },
      drumExpression: {
        panelVisible: isActuallyVisible(document.querySelector("#studio-drum-expression")),
        formVisible: isActuallyVisible(expressionForm),
        visibleControls: visibleExpressionControls,
        velocityVisible: isActuallyVisible(expressionVelocity),
        panVisible: isActuallyVisible(expressionPan),
        submitVisible: isActuallyVisible(expressionSubmit),
        selectedHitVisible: selectedDrumHits > 0 || Boolean(isActuallyVisible(expressionForm)
          && selectedHit && expressionForm?.dataset.hitId === selectedHit.id),
      },
      dualDock: {
        supported: dualDockSupported,
        enabled: dualDockEnabled,
        breakpointMatchesState: dualDockEnabled === dualDockSupported,
        expectedPanel: expectedDockPanel,
        expectedPanelVisible: expectedDockPanelVisible,
        bothBodiesVisible: dualDockSlots.length === 2 && dualDockSlots.every(slot => slot.visible),
        slots: dualDockSlots,
      },
      drumGrid: {
        numerator: timeSignature.numerator ?? 4,
        denominator: timeSignature.denominator ?? 4,
        projectedBarTicks,
        fourthBarLastTick,
        snap,
        cellExists: Boolean(fourthBarCell),
        fourthBarLastCellFullyVisible: Boolean(fourthBarCellRect && drumScrollBounds
          && fourthBarCellRect.left >= drumScrollBounds.left - 1
          && fourthBarCellRect.right <= drumScrollBounds.right + 1
          && fourthBarCellRect.top >= drumScrollBounds.top - 1
          && fourthBarCellRect.bottom <= drumScrollBounds.bottom + 1),
      },
      rollBottomGapPx: rollRect ? round(Math.max(0, (dockRect?.top < viewport.height ? dockRect.top : viewport.height) - rollRect.bottom)) : null,
      pageOverflowX: document.documentElement.scrollWidth > viewport.width,
      pageOverflowXPx: Math.max(0, document.documentElement.scrollWidth - viewport.width),
    };
  }, { commonTargets: COMMON_CONTROL_TARGETS, stateId });
}

const csvEscape = value => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function runUiAudit({ out = "docs/ui-audit/generated", basePath = "/melodi/", port = 4173, screenshots = null } = {}) {
  const outputDir = path.resolve(ROOT, out);
  await mkdir(outputDir, { recursive: true });
  const { server, url } = await startAuditServer({ basePath, port });
  const browser = await chromium.launch({ headless: true });
  const cells = []; const failures = [];
  try {
    for (const viewport of VIEWPORTS) for (const theme of THEMES) for (const state of (viewport.states
      ? STATES.filter(candidate => viewport.states.includes(candidate.id)) : STATES)) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1,
        isMobile: viewport.mobile, hasTouch: viewport.mobile, colorScheme: theme, serviceWorkers: "block",
      });
          const page = await context.newPage(); const pageErrors = [];
          page.on("pageerror", error => pageErrors.push(error.message));
      const key = `${viewport.width}x${viewport.height}-${theme}-${state.id}`;
      const shouldCapture = !screenshots || screenshots.includes(state.id);
      const screenshot = shouldCapture ? `${key}.png` : null;
      try {
        await page.addInitScript(themeName => localStorage.setItem("melodi.theme", themeName), theme);
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 10000 });
        await configureState(page, state.id);
        const metrics = await measurePage(page, state.id);
        if (screenshot) await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: false, animations: "disabled" });
        const cell = {
          viewport: viewport.name, width: viewport.width, height: viewport.height,
          theme, state: state.id, stateLabel: state.label,
          screenshot: screenshot ? path.relative(ROOT, path.join(outputDir, screenshot)).replaceAll(path.sep, "/") : null,
          ...metrics, pageErrors,
        };
        cells.push(cell);
        if (pageErrors.length) failures.push({ key, reason: "pageerror", errors: pageErrors });
        if (metrics.chromeBudgetExceeded) {
          failures.push({ key, reason: "chrome-budget", actualPercent: metrics.chrome.percentExact, budgetPercent: metrics.chromeBudgetPercent });
        }
        if (["edit-guitar", "edit-guitar-fretboard", "edit-guitar-zone-open", "not-guitar-zone-open"].includes(state.id)
          && !metrics.guitarPayloadVisible) {
          failures.push({ key, reason: "guitar-payload-not-visible", payloads: metrics.guitarPayloads });
        }
        if (state.id === "irama-drum-expression" && (!metrics.drumExpression.panelVisible
          || !metrics.drumExpression.formVisible || !metrics.drumExpression.velocityVisible || !metrics.drumExpression.panVisible
          || !metrics.drumExpression.submitVisible || !metrics.drumExpression.selectedHitVisible
          || !metrics.percussionExpressionIdentity.hitIdentityMatches || !metrics.percussionExpressionIdentity.trackIdentityMatches
          || !metrics.percussionExpressionIdentity.velocityMatches)) {
          failures.push({ key, reason: "drum-expression-payload-not-visible", drumExpression: metrics.drumExpression,
            identity: metrics.percussionExpressionIdentity });
        }
        if (state.id.startsWith("dual-dock") && !metrics.dualDock.breakpointMatchesState) {
          failures.push({ key, reason: "dual-dock-breakpoint-mismatch", enabled: metrics.dualDock.enabled, supported: metrics.dualDock.supported });
        }
        if (state.id.startsWith("dual-dock") && metrics.dualDock.expectedPanelVisible === false) {
          failures.push({ key, reason: "workspace-dock-panel-not-visible", expectedPanel: metrics.dualDock.expectedPanel });
        }
        if (state.id.startsWith("dual-dock") && metrics.dualDock.supported
          && (!metrics.dualDock.bothBodiesVisible || !metrics.dualDock.expectedPanelVisible)) {
          failures.push({ key, reason: "dual-dock-workspace-panel-not-visible", slots: metrics.dualDock.slots,
            expectedPanel: metrics.dualDock.expectedPanel, expectedPanelVisible: metrics.dualDock.expectedPanelVisible });
        }
        if (["irama", "irama-drum-expression"].includes(state.id) && viewport.width >= 1440
          && viewport.height >= 800 && !metrics.drumGrid.fourthBarLastCellFullyVisible) {
          failures.push({ key, reason: "fourth-drum-bar-not-fully-visible", drumGrid: metrics.drumGrid });
        }
        if (cell.overlapCount || cell.canvasLabelOverlapCount || cell.unreachableClipCount) {
          failures.push({ key, reason: "layout", overlaps: cell.overlapCount, canvasLabelOverlaps: cell.canvasLabelOverlapCount, unreachableClips: cell.unreachableClipCount });
        }
        process.stdout.write(`${key}: ${metrics.visibleControls} controls, ${metrics.overlapCount} control overlaps, ${metrics.canvasLabelOverlapCount} canvas-label overlaps, ${metrics.clippedCount} clipped, chrome ${metrics.chrome.totalPx}px (${metrics.chrome.percent}%)\n`);
      } catch (error) {
        failures.push({ key, reason: error.message });
        process.stderr.write(`${key}: FAILED ${error.message}\n`);
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  const report = {
    generatedAt: new Date().toISOString(), url, subpath: new URL(url).pathname,
    cellCount: cells.length,
    expectedCellCount: VIEWPORTS.reduce((count, viewport) => count + (viewport.states?.length ?? STATES.length), 0) * THEMES.length,
    failures, cells,
  };
  await writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  const columns = ["viewport", "width", "height", "theme", "state", "build", "chromePx", "chromePercent", "chromeBudgetPercent", "visibleControls", "visiblePrimaryCount", "clickToRevealCount", "closedRevealTargetCount", "inactiveTabTargetCount", "detailsCount", "nestedDetails", "overlapCount", "canvasLabelOverlapCount", "clippedCount", "unreachableClipCount", "guitarPayloadVisible", "selectedDrumHits", "drumExpressionControlsVisible", "drumExpressionHitMatch", "dualDockBodiesVisible", "dualDockPanelVisible", "drumGridFourthBarFull", "rollBottomGapPx", "screenshot"];
  const rows = cells.map(cell => [`${cell.width}x${cell.height}`, cell.width, cell.height, cell.theme, cell.state, cell.build, cell.chrome.totalPx, cell.chrome.percentExact, cell.chromeBudgetPercent, cell.visibleControls, cell.visiblePrimaryCount, cell.clickToRevealCount, cell.closedRevealTargetCount, cell.inactiveTabTargetCount, cell.detailsCount, cell.nestedDetails, cell.overlapCount, cell.canvasLabelOverlapCount, cell.clippedCount, cell.unreachableClipCount, cell.guitarPayloadVisible, cell.selectedDrumHits, cell.drumExpression.visibleControls, cell.percussionExpressionIdentity.hitIdentityMatches && cell.percussionExpressionIdentity.trackIdentityMatches && cell.percussionExpressionIdentity.velocityMatches, cell.dualDock.bothBodiesVisible, cell.dualDock.expectedPanelVisible, cell.drumGrid.fourthBarLastCellFullyVisible, cell.rollBottomGapPx, cell.screenshot]);
  await writeFile(path.join(outputDir, "results.csv"), `${[columns, ...rows].map(row => row.map(csvEscape).join(",")).join("\n")}\n`);
  const matrix = [
    "# UI audit matrix",
    "",
    `Build: ${cells[0]?.build ?? "unknown"}; generated: ${report.generatedAt}; served from ${report.subpath}.`,
    "",
    "Chrome is the distance from viewport top to the workspace canvas shell plus any fixed bottom dock; workspace-specific tools inside the shell are measured as controls. Desktop chrome budget is 14% from 68rem, compact and short-landscape budget is 25% through 500px height. Visible-control count excludes hidden and fully clipped controls, and includes disabled controls. Click-to-reveal is the strict total of matching common controls hidden behind closed disclosures, panels, hidden ancestors, CSS visibility rules, or inactive tabpanels. Closed disclosure/panel and inactive-tab columns explain the total; inactive tab content is included even though its tab remains visible. Control overlaps exclude parent/child controls and intersections across intentional overlay layers. Canvas-label overlaps compare visible controls against Piano Roll bar/pitch labels, excluding controls inside an open panel or menu overlay. Clipping includes viewport and overflow-ancestor clipping; unreachable clips are judged per clipped axis against an actually scrollable ancestor.",
    "",
    "| Viewport | Theme | State | Screenshot | Chrome px (%) | Budget | Visible controls | Visible primary | Click-to-reveal | Closed disclosure/panel | Inactive tab targets | `<details>` | Control overlaps | Canvas label overlaps | Clipped controls | Unreachable clips | Guitar payload | Drum hits selected | Drum Expression controls | Hit identity | Dual dock bodies | Workspace panel | Drum bar 4 full |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- |",
    ...cells.map(cell => `| ${cell.width}×${cell.height} | ${cell.theme} | ${cell.stateLabel} | ${cell.screenshot ? `[Screenshot](${path.basename(cell.screenshot)})` : "—"} | ${cell.chrome.totalPx} (${cell.chrome.percentExact.toFixed(2)}%) | ${cell.chromeBudgetPercent === null ? "—" : `${cell.chromeBudgetPercent}%`} | ${cell.visibleControls} | ${cell.visiblePrimaryCount} | ${cell.clickToRevealCount} | ${cell.closedRevealTargetCount} | ${cell.inactiveTabTargetCount} | ${cell.detailsCount} | ${cell.overlapCount} | ${cell.canvasLabelOverlapCount} | ${cell.clippedCount} | ${cell.unreachableClipCount} | ${cell.guitarPayloadVisible ? "yes" : "no"} | ${cell.selectedDrumHits} | ${cell.drumExpression.visibleControls} | ${cell.percussionExpressionIdentity.hitIdentityMatches && cell.percussionExpressionIdentity.trackIdentityMatches && cell.percussionExpressionIdentity.velocityMatches ? "yes" : "—"} | ${cell.dualDock.bothBodiesVisible ? "yes" : "no"} | ${cell.dualDock.expectedPanelVisible === null ? "—" : cell.dualDock.expectedPanelVisible ? "yes" : "no"} | ${cell.drumGrid.fourthBarLastCellFullyVisible ? "yes" : "no"} |`),
    "",
    `Cell count: ${cells.length}/${report.expectedCellCount}. Failures: ${failures.length}.`,
    "",
  ].join("\n");
  await writeFile(path.join(outputDir, "matrix.md"), matrix);
  if (cells.length !== report.expectedCellCount || failures.length) throw new Error(`UI audit incomplete: ${cells.length}/${report.expectedCellCount} cells, ${failures.length} failure(s). See ${path.join(outputDir, "results.json")}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) process.stdout.write("Usage: npm run ui-audit -- [--out PATH] [--base-path /melodi/] [--port 4173] [--screenshots state,state,...]\n");
  else runUiAudit(options).then(report => {
    process.stdout.write(`Saved ${report.cellCount} cells to ${path.resolve(ROOT, options.out)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
