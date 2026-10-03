import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { configureState, STATES, THEMES, VIEWPORTS, startAuditServer } from "./ui-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_CLASS_EXCEPTIONS = [
  { pattern: /^abcjs-/, reason: "ABCJS creates notation classes at runtime." },
  { pattern: /^roll-note-generated$/, reason: "Piano Roll creates this note class from generated-note state." },
  { pattern: /^studio-overview-(?:note|chord|drum)$/, reason: "Studio Overview interpolates the track kind into this class." },
];

const DYNAMIC_SCENARIOS = [
  { id: "note-selection", viewport: "desktop", theme: "light", prepare: async page => page.evaluate(() => {
    const commands = window.melodi.commands;
    commands.newIdea();
    const note = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
    commands.selectNotes([note.id]);
  }) },
  { id: "phone-panel-sheet", viewport: "portrait", theme: "light", prepare: async page => {
    await page.evaluate(() => {
      window.melodi.commands.newIdea();
      document.querySelector("[data-studio-panel-toggle]")?.click();
    });
    await page.waitForFunction(() => document.querySelector("[data-studio-panel-toggle]")?.getAttribute("aria-expanded") === "true", null, { timeout: 3000 });
  } },
  { id: "drum-selection", viewport: "landscape", theme: "light", prepare: async page => page.evaluate(() => {
    const commands = window.melodi.commands;
    commands.newIdea();
    commands.setViewMode("drums");
    const { hit } = commands.addPercussionHit({ pieceId: "kick", startTick: 0 });
    commands.selectPercussionHits([hit.id]);
  }) },
  { id: "lyrics-content", viewport: "portrait", theme: "light", prepare: page => page.evaluate(() => {
    const commands = window.melodi.commands;
    commands.newIdea();
    commands.setLyrics("Pagi datang\nKita bernyanyi");
    commands.setViewMode("lyrics");
  }) },
  { id: "command-palette", viewport: "desktop", theme: "dark", prepare: async page => {
    await page.evaluate(() => {
      window.melodi.commands.newIdea();
      document.querySelector('[data-action="command-palette"]')?.click();
    });
    await page.waitForFunction(() => document.querySelector("#command-palette")?.open, null, { timeout: 3000 });
  } },
  { id: "reduced-motion", viewport: "portrait", theme: "dark", reducedMotion: "reduce", prepare: page => configureState(page, "edit-default") },
];

function parseArgs(argv) {
  const args = { out: "docs/ui-audit/round2/css-coverage", port: 4174 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--port") args.port = Number(argv[++i]);
    else if (argv[i] === "--smoke") args.smoke = true;
    else if (argv[i] === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) throw new Error("--port must be a valid TCP port");
  return args;
}

function listStyleRules(source) {
  const rules = [];
  const findBlockEnd = (open) => {
    let depth = 1;
    let quote = "";
    let comment = false;
    for (let i = open + 1; i < source.length; i += 1) {
      const char = source[i]; const next = source[i + 1];
      if (comment) { if (char === "*" && next === "/") { comment = false; i += 1; } continue; }
      if (quote) { if (char === "\\") { i += 1; continue; } if (char === quote) quote = ""; continue; }
      if (char === "/" && next === "*") { comment = true; i += 1; continue; }
      if (char === "\"" || char === "'") { quote = char; continue; }
      if (char === "{") depth += 1;
      else if (char === "}" && --depth === 0) return i;
    }
    return source.length - 1;
  };
  const scan = (from, to) => {
    let cursor = from;
    while (cursor < to) {
      while (cursor < to && /\s/.test(source[cursor])) cursor += 1;
      if (source[cursor] === "/" && source[cursor + 1] === "*") {
        const close = source.indexOf("*/", cursor + 2);
        cursor = close < 0 ? to : close + 2;
        continue;
      }
      const start = cursor;
      let quote = ""; let comment = false; let open = -1;
      for (; cursor < to; cursor += 1) {
        const char = source[cursor]; const next = source[cursor + 1];
        if (comment) { if (char === "*" && next === "/") { comment = false; cursor += 1; } continue; }
        if (quote) { if (char === "\\") { cursor += 1; continue; } if (char === quote) quote = ""; continue; }
        if (char === "/" && next === "*") { comment = true; cursor += 1; continue; }
        if (char === "\"" || char === "'") { quote = char; continue; }
        if (char === "{") { open = cursor; break; }
        if (char === ";" || char === "}") break;
      }
      if (open < 0) { cursor += source[cursor] === ";" || source[cursor] === "}" ? 1 : 0; continue; }
      const end = findBlockEnd(open);
      const prelude = source.slice(start, open).trim();
      if (prelude && !prelude.startsWith("@")) {
        const selectorStart = source.indexOf(prelude, start);
        rules.push({ start: selectorStart, end: end + 1, selector: prelude, classes: [...new Set([...prelude.matchAll(/\.((?:\\.|[\w-])+)/g)].map(match => match[1].replaceAll("\\.", ".")))] });
      }
      scan(open + 1, end);
      cursor = end + 1;
    }
  };
  scan(0, source.length);
  return rules;
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (entry.isFile() && /\.(?:js|html)$/.test(entry.name)) files.push(full);
  }
  return files;
}

async function staticClassReferences() {
  const files = [path.join(ROOT, "index.html"), ...await sourceFiles(path.join(ROOT, "src"))];
  const text = (await Promise.all(files.map(file => readFile(file, "utf8")))).join("\n");
  return new Set(text.match(/[A-Za-z_][\w-]*/g) ?? []);
}

function exceptionFor(className) { return RUNTIME_CLASS_EXCEPTIONS.find(item => item.pattern.test(className)); }

function mergeIntervals(intervals) {
  const sorted = [...intervals].filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || interval[0] > last[1]) merged.push([...interval]);
    else last[1] = Math.max(last[1], interval[1]);
  }
  return merged;
}

function bytesIn(intervals) { return mergeIntervals(intervals).reduce((sum, [start, end]) => sum + end - start, 0); }

function utf8ByteOffsets(source) {
  const offsets = new Uint32Array(source.length + 1);
  let bytes = 0;
  for (let index = 0; index < source.length;) {
    const point = source.codePointAt(index);
    const units = point > 0xffff ? 2 : 1;
    offsets[index] = bytes;
    if (units === 2) offsets[index + 1] = bytes;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    index += units;
    offsets[index] = bytes;
  }
  return offsets;
}

function readViewport(name) { return VIEWPORTS.find(viewport => viewport.name === name); }

async function captureScenario(browser, baseUrl, scenario, matrixCell = false) {
  const viewport = scenario.viewport ? readViewport(scenario.viewport) : scenario.viewportConfig;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1,
    isMobile: viewport.mobile, hasTouch: viewport.mobile, colorScheme: scenario.theme,
    reducedMotion: scenario.reducedMotion ?? "no-preference", serviceWorkers: "block",
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const headers = new Map();
  session.on("CSS.styleSheetAdded", ({ header }) => headers.set(header.styleSheetId, header));
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  await session.send("CSS.startRuleUsageTracking");
  try {
    await page.addInitScript(theme => localStorage.setItem("melodi.theme", theme), scenario.theme);
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 10000 });
    if (scenario.prepare) await scenario.prepare(page);
    else if (["edit-chord-panel", "edit-mixer-panel"].includes(scenario.state)) {
      await page.evaluate(state => {
        window.melodi.commands.newIdea();
        const panel = state === "edit-chord-panel" ? "chords" : "mixer";
        document.querySelector(`button[data-studio-panel="${panel}"]`)?.click();
      }, scenario.state);
      const panel = scenario.state === "edit-chord-panel" ? "chords" : "mixer";
      await page.waitForFunction(value => document.body.dataset.studioPanel === value, panel, { timeout: 3000 });
    } else if (scenario.state === "edit-generate-candidates") {
      await page.evaluate(() => {
        const commands = window.melodi.commands;
        commands.newIdea();
        const left = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
        const right = commands.addNote({ pitch: 67, startTick: 1440, durationTicks: 480 });
        commands.setAnchor(left.id, true);
        commands.setAnchor(right.id, true);
        commands.generateGap({ startTick: 480, endTick: 1440, leftAnchorNoteId: left.id, rightAnchorNoteId: right.id, seed: 1 });
        document.querySelector('button[data-studio-panel="generate"]')?.click();
      });
      await page.waitForFunction(() => document.querySelectorAll("#generation-candidates > li").length > 0, null, { timeout: 5000 });
    } else await configureState(page, scenario.state);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const { ruleUsage: coverage } = await session.send("CSS.stopRuleUsageTracking");
    const ruleUsage = new Map();
    for (const item of coverage ?? []) {
      if (!ruleUsage.has(item.styleSheetId)) ruleUsage.set(item.styleSheetId, []);
      ruleUsage.get(item.styleSheetId).push(item);
    }
    const sheets = [];
    for (const [styleSheetId, header] of headers) {
      if (header.origin !== "regular") continue;
      let text;
      try { ({ text } = await session.send("CSS.getStyleSheetText", { styleSheetId })); }
      catch { continue; }
      const usage = ruleUsage.get(styleSheetId) ?? [];
      sheets.push({
        url: header.sourceURL || "(inline stylesheet)",
        text,
        ranges: usage.filter(rule => rule.used).map(rule => [rule.startOffset, rule.endOffset]),
        allRanges: usage.map(rule => [rule.startOffset, rule.endOffset]),
        totalRuleCount: usage.length,
        usedRuleCount: usage.filter(rule => rule.used).length,
      });
    }
    return { id: scenario.id ?? `${scenario.width}x${scenario.height}-${scenario.theme}-${scenario.state}`, sheets, matrixCell };
  } finally {
    await session.detach().catch(() => {});
    await context.close();
  }
}

export async function runCssAudit({ out = "docs/ui-audit/round2/css-coverage", port = 4174, smoke = false } = {}) {
  const outputDir = path.resolve(ROOT, out);
  await mkdir(outputDir, { recursive: true });
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port });
  const browser = await chromium.launch({ headless: true });
  const captures = [];
  try {
    const matrix = [];
    for (const viewport of VIEWPORTS) for (const theme of THEMES) for (const state of STATES) {
      matrix.push({ viewport: viewport.name, theme, state: state.id });
    }
    for (const scenario of (smoke ? matrix.slice(0, 1) : matrix)) {
      const { viewport, theme, state } = scenario;
      const viewportConfig = readViewport(viewport);
      captures.push(await captureScenario(browser, url, { viewport, theme, state }, true));
      process.stdout.write(`CSS coverage ${captures.length}/${smoke ? 1 : VIEWPORTS.length * THEMES.length * STATES.length}: ${viewportConfig.width}x${viewportConfig.height} ${theme} ${state}\n`);
    }
    for (const scenario of DYNAMIC_SCENARIOS) {
      captures.push(await captureScenario(browser, url, scenario));
      process.stdout.write(`CSS coverage dynamic: ${scenario.id}\n`);
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const stylesheets = new Map();
  for (const capture of captures) for (const sheet of capture.sheets) {
    const key = `${sheet.url}\0${createHash("sha1").update(sheet.text).digest("hex")}`;
    let item = stylesheets.get(key);
    if (!item) {
      item = { url: sheet.url, text: sheet.text, usedRanges: [], matrixUse: new Set(), dynamicUse: new Set() };
      stylesheets.set(key, item);
    }
    item.usedRanges.push(...sheet.ranges);
    if (sheet.usedRuleCount) (capture.matrixCell ? item.matrixUse : item.dynamicUse).add(capture.id);
  }

  const refs = await staticClassReferences();
  const stylesheetRows = [];
  const candidateRules = [];
  const uncoveredStyleRules = [];
  let activeBytes = 0; let usedBytes = 0; let allRuleCount = 0; let usedRuleCount = 0;
  for (const sheet of stylesheets.values()) {
    const rules = listStyleRules(sheet.text);
    const byteOffsets = utf8ByteOffsets(sheet.text);
    const usedStarts = new Set(sheet.usedRanges.map(([start]) => start));
    const usedRule = rule => usedStarts.has(rule.start);
    const usedRules = rules.filter(usedRule);
    const unusedRules = rules.filter(rule => !usedRule(rule));
    for (const rule of unusedRules) {
      const missing = rule.classes.filter(name => !refs.has(name) && !exceptionFor(name));
      const startByteOffset = byteOffsets[rule.start];
      const endByteOffset = byteOffsets[rule.end];
      uncoveredStyleRules.push({
        url: sheet.url,
        selector: rule.selector,
        startByteOffset,
        endByteOffset,
        sourceBytes: endByteOffset - startByteOffset,
        classTokens: rule.classes,
        staticUnreferencedClassTokens: missing,
      });
      if (missing.length) candidateRules.push({ url: sheet.url, selector: rule.selector, classes: rule.classes, unreferencedClasses: missing });
    }
    const sheetBytes = Buffer.byteLength(sheet.text, "utf8");
    activeBytes += sheetBytes;
    const sheetUsedBytes = bytesIn(usedRules.map(rule => [rule.start, rule.end]));
    usedBytes += sheetUsedBytes;
    allRuleCount += rules.length;
    usedRuleCount += usedRules.length;
    stylesheetRows.push({
      url: sheet.url,
      bytes: sheetBytes,
      usedBytes: sheetUsedBytes,
      ruleCount: rules.length,
      usedRuleCount: usedRules.length,
      unusedRuleCount: unusedRules.length,
      coveredInMatrix: [...sheet.matrixUse].length,
      coveredInDynamicStates: [...sheet.dynamicUse].length,
    });
  }
  uncoveredStyleRules.sort((a, b) => a.url.localeCompare(b.url) || a.startByteOffset - b.startByteOffset);
  const safeStaticCandidateRuleCount = uncoveredStyleRules.filter(rule => rule.staticUnreferencedClassTokens.length > 0).length;
  const runtimeClasses = [...new Set([...stylesheets.values()].flatMap(sheet => listStyleRules(sheet.text).flatMap(rule => rule.classes)).filter(name => exceptionFor(name)))].sort();
  const report = {
    generatedAt: new Date().toISOString(),
    method: "Chromium CDP CSS.startRuleUsageTracking / CSS.stopRuleUsageTracking",
    matrixCells: captures.filter(capture => capture.matrixCell).length,
    dynamicScenarios: DYNAMIC_SCENARIOS.map(({ id }) => id),
    scenarioCount: captures.length,
    activeStylesheetBytes: activeBytes,
    usedStylesheetBytes: usedBytes,
    byteCoveragePercent: activeBytes ? Number((usedBytes / activeBytes * 100).toFixed(2)) : 0,
    cssRuleCount: allRuleCount,
    usedCssRuleCount: usedRuleCount,
    unusedCssRuleCount: allRuleCount - usedRuleCount,
    uncoveredStyleRuleCount: uncoveredStyleRules.length,
    safeStaticCandidateRuleCount,
    runtimeClassExceptionList: RUNTIME_CLASS_EXCEPTIONS.map(({ pattern, reason }) => ({ pattern: pattern.toString(), reason })),
    runtimeExceptionClassesFound: runtimeClasses,
    stylesheets: stylesheetRows.sort((a, b) => a.url.localeCompare(b.url)),
    uncoveredStyleRules,
    staticUnreferencedRuleCandidates: candidateRules.sort((a, b) => a.url.localeCompare(b.url) || a.selector.localeCompare(b.selector)),
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const markdown = [
    "# CSS usage audit",
    "",
    `Generated: ${report.generatedAt}. Measurement: ${report.method}.`,
    "",
    `Scenarios: ${report.matrixCells} UI matrix cells plus ${captures.length - report.matrixCells} dynamic states. Active CSS: ${activeBytes.toLocaleString()} bytes; covered bytes: ${usedBytes.toLocaleString()} (${report.byteCoveragePercent}%). Rules: ${usedRuleCount}/${allRuleCount} used; ${report.uncoveredStyleRuleCount} uncovered; ${safeStaticCandidateRuleCount} safe static candidates.`,
    "",
    "## Stylesheets",
    "",
    "| URL | Bytes | Used bytes | Rules used | Rules total | Matrix states with rules used | Dynamic states with rules used |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.stylesheets.map(sheet => `| ${sheet.url} | ${sheet.bytes} | ${sheet.usedBytes} | ${sheet.usedRuleCount} | ${sheet.ruleCount} | ${sheet.coveredInMatrix} | ${sheet.coveredInDynamicStates} |`),
    "",
    "## Rule review",
    "",
    `The JSON report lists all ${report.uncoveredStyleRuleCount} uncovered style rules with selectors, UTF-8 byte offsets, source lengths, and class tokens. ${safeStaticCandidateRuleCount} rules have class tokens with no static references after runtime exceptions are applied.`,
    "",
    "## Runtime class exceptions",
    "",
    ...report.runtimeClassExceptionList.map(item => `- \`${item.pattern}\`: ${item.reason}`),
    "",
  ].join("\n");
  await writeFile(path.join(outputDir, "report.md"), markdown);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) process.stdout.write("Usage: npm run css-audit -- [--out PATH] [--port 4174] [--smoke]\n");
  else runCssAudit(options).then(report => {
    process.stdout.write(`Saved CSS usage report for ${report.scenarioCount} scenarios to ${path.resolve(ROOT, options.out)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
