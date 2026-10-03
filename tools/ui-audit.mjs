import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
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
];

const MIME = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"],
  [".png", "image/png"], [".woff", "font/woff"], [".woff2", "font/woff2"],
  [".mp3", "audio/mpeg"], [".wav", "audio/wav"], [".mid", "audio/midi"],
]);

function parseArgs(argv) {
  const args = { out: "docs/ui-audit/generated", basePath: "/melodi/", port: 4173 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--base-path") args.basePath = argv[++i];
    else if (argv[i] === "--port") args.port = Number(argv[++i]);
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
  return { server, url: `http://127.0.0.1:${port}${prefix}` };
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function configureState(page, stateId) {
  await page.evaluate(id => {
    const commands = window.melodi?.commands;
    if (!commands) throw new Error("window.melodi.commands is not ready");
    commands.newIdea();
    if (id === "edit-guitar") {
      commands.setViewMode("guitar");
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
  if (stateId === "project-menu-open" || stateId === "more-open") {
    const selector = stateId === "project-menu-open" ? "details#project-menu" : "details.studio-more";
    await page.waitForFunction(sel => document.querySelector(sel)?.open, selector, { timeout: 3000 });
  }
  await settle(page);
}

export async function measurePage(page) {
  return page.evaluate(() => {
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
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
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
    const controls = [...document.querySelectorAll(selector)].filter(isUsable).map(element => {
      const box = effectiveRect(element);
      return { element, label: controlLabel(element), box, width: Math.max(0, box.right - box.left), height: Math.max(0, box.bottom - box.top) };
    }).filter(control => control.width > 1 && control.height > 1);
    const scrollableAncestor = element => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (["auto", "scroll"].includes(style.overflowX) || ["auto", "scroll"].includes(style.overflowY)) {
          return parent.id ? `#${parent.id}` : parent.className?.baseVal ?? parent.className ?? parent.tagName.toLowerCase();
        }
      }
      return null;
    };
    const clipped = controls.filter(control => {
      const rect = control.box.original;
      return control.box.left > rect.left + 1 || control.box.top > rect.top + 1
        || control.box.right < rect.right - 1 || control.box.bottom < rect.bottom - 1;
    }).map(({ element, label, box }) => ({
      label, tag: element.tagName.toLowerCase(), id: element.id || null,
      action: element.dataset.action || null,
      scrollableAncestor: scrollableAncestor(element),
      visibleBox: [round(box.left), round(box.top), round(box.right - box.left), round(box.bottom - box.top)],
      elementBox: [round(box.original.left), round(box.original.top), round(box.original.width), round(box.original.height)],
    }));
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
    const chromeTop = canvasRect ? Math.max(0, canvasRect.top) : (activePane ? Math.max(0, activePane.getBoundingClientRect().top) : 0);
    const chromeBottom = dockRect && dockRect.top < viewport.height ? Math.max(0, viewport.height - dockRect.top) : 0;
    const roll = document.querySelector("#piano-roll-section .piano-roll-scroll");
    const rollRect = roll?.getClientRects().length ? roll.getBoundingClientRect() : null;
    return {
      build: document.querySelector('meta[name="melodi-build"]')?.content ?? null,
      activeView: document.querySelector("#studio-views [data-studio-view][aria-pressed='true']")?.dataset.studioView ?? null,
      activePane: activePane?.id ?? null,
      canvasTopPx: round(chromeTop),
      viewport,
      chrome: { topPx: round(chromeTop), bottomPx: round(chromeBottom), totalPx: round(chromeTop + chromeBottom), percent: round((chromeTop + chromeBottom) / viewport.height * 100) },
      visibleControls: controls.length,
      controls: controls.map(({ element, label, box }) => ({ label, tag: element.tagName.toLowerCase(), id: element.id || null, action: element.dataset.action || null, rect: [round(box.left), round(box.top), round(box.right - box.left), round(box.bottom - box.top)] })),
      openDetails: [...document.querySelectorAll("details[open]")].map(element => element.id || element.className || "details"),
      detailsCount: document.querySelectorAll("details").length,
      nestedDetails: document.querySelectorAll("details details").length,
      overlapCount: overlaps.length,
      overlaps,
      canvasLabelOverlapCount: canvasLabelOverlaps.length,
      canvasLabelOverlaps,
      clippedCount: clipped.length,
      unreachableClipCount: clipped.filter(control => !control.scrollableAncestor).length,
      clipped,
      rollBottomGapPx: rollRect ? round(Math.max(0, (dockRect?.top < viewport.height ? dockRect.top : viewport.height) - rollRect.bottom)) : null,
      pageOverflowX: document.documentElement.scrollWidth > viewport.width,
      pageOverflowXPx: Math.max(0, document.documentElement.scrollWidth - viewport.width),
    };
  });
}

const csvEscape = value => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function runUiAudit({ out = "docs/ui-audit/generated", basePath = "/melodi/", port = 4173 } = {}) {
  const outputDir = path.resolve(ROOT, out);
  await mkdir(outputDir, { recursive: true });
  const { server, url } = await startAuditServer({ basePath, port });
  const browser = await chromium.launch({ headless: true });
  const cells = []; const failures = [];
  try {
    for (const viewport of VIEWPORTS) for (const theme of THEMES) for (const state of STATES) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1,
        isMobile: viewport.mobile, hasTouch: viewport.mobile, colorScheme: theme, serviceWorkers: "block",
      });
          const page = await context.newPage(); const pageErrors = [];
          page.on("pageerror", error => pageErrors.push(error.message));
      const key = `${viewport.width}x${viewport.height}-${theme}-${state.id}`;
      const screenshot = `${key}.png`;
      try {
        await page.addInitScript(themeName => localStorage.setItem("melodi.theme", themeName), theme);
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 10000 });
        await configureState(page, state.id);
        const metrics = await measurePage(page);
        await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: false, animations: "disabled" });
        const cell = {
          viewport: viewport.name, width: viewport.width, height: viewport.height,
          theme, state: state.id, stateLabel: state.label,
          screenshot: path.relative(ROOT, path.join(outputDir, screenshot)).replaceAll(path.sep, "/"),
          ...metrics, pageErrors,
        };
        cells.push(cell);
        if (pageErrors.length) failures.push({ key, reason: "pageerror", errors: pageErrors });
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
    cellCount: cells.length, expectedCellCount: VIEWPORTS.length * THEMES.length * STATES.length,
    failures, cells,
  };
  await writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  const columns = ["viewport", "width", "height", "theme", "state", "build", "chromePx", "chromePercent", "visibleControls", "detailsCount", "nestedDetails", "overlapCount", "canvasLabelOverlapCount", "clippedCount", "unreachableClipCount", "rollBottomGapPx", "screenshot"];
  const rows = cells.map(cell => [cell.viewport, cell.width, cell.height, cell.theme, cell.state, cell.build, cell.chrome.totalPx, cell.chrome.percent, cell.visibleControls, cell.detailsCount, cell.nestedDetails, cell.overlapCount, cell.canvasLabelOverlapCount, cell.clippedCount, cell.unreachableClipCount, cell.rollBottomGapPx, cell.screenshot]);
  await writeFile(path.join(outputDir, "results.csv"), `${[columns, ...rows].map(row => row.map(csvEscape).join(",")).join("\n")}\n`);
  const matrix = [
    "# UI audit matrix",
    "",
    `Build: ${cells[0]?.build ?? "unknown"}; generated: ${report.generatedAt}; served from ${report.subpath}.`,
    "",
    "Chrome is the distance from viewport top to the visible workspace plus any fixed bottom dock. Visible-control count excludes hidden and fully clipped controls, and includes disabled controls. Control overlaps exclude parent/child controls and intersections across intentional overlay layers. Canvas-label overlaps compare visible controls against Piano Roll bar/pitch labels, excluding controls inside an open panel or menu overlay. Clipping includes viewport and overflow-ancestor clipping; unreachable clips are targets without a scrollable ancestor.",
    "",
    "| Viewport | Theme | State | Screenshot | Chrome px (%) | Visible controls | `<details>` | Control overlaps | Canvas label overlaps | Clipped controls | Unreachable clips |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...cells.map(cell => `| ${cell.width}×${cell.height} | ${cell.theme} | ${cell.stateLabel} | [Screenshot](${path.basename(cell.screenshot)}) | ${cell.chrome.totalPx} (${cell.chrome.percent}%) | ${cell.visibleControls} | ${cell.detailsCount} | ${cell.overlapCount} | ${cell.canvasLabelOverlapCount} | ${cell.clippedCount} | ${cell.unreachableClipCount} |`),
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
  if (options.help) process.stdout.write("Usage: npm run ui-audit -- [--out PATH] [--base-path /melodi/] [--port 4173]\n");
  else runUiAudit(options).then(report => {
    process.stdout.write(`Saved ${report.cellCount} cells to ${path.resolve(ROOT, options.out)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
