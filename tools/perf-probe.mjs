/**
 * Probe performa playback. Dev-only: hanya mengukur, tidak mengubah kontrak.
 *
 *   node tools/perf-probe.mjs [--rounds 10] [--seconds 20] [--bars 128]
 *                            [--label baseline] [--out docs/...json]
 *
 * Membuka app dengan ?perf=1 supaya window.melodiPerf terpasang, membuat lagu
 * uji 128 bar (16 note per bar + 48 hit drum per bar) dalam satu commit,
 * lalu memutar 10 putaran: ganjil tanpa loop, genap dengan loop, tiap
 * putaran 20 detik. Lagu uji jauh lebih besar dari contoh repo supaya
 * selisih biaya per tick terlihat.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { startAuditServer } from "./ui-audit.mjs";

const args = {
  rounds: 10,
  seconds: 20,
  bars: 128,
  notesPerBar: 16,
  hitsPerBar: 48,
  width: 1440,
  height: 900,
  out: "",
  label: "baseline"
};

for (let index = 0; index < process.argv.length; index += 1) {
  const flag = process.argv[index];
  if (flag === "--rounds") args.rounds = Number(process.argv[++index]);
  else if (flag === "--seconds") args.seconds = Number(process.argv[++index]);
  else if (flag === "--bars") args.bars = Number(process.argv[++index]);
  else if (flag === "--label") args.label = process.argv[++index];
  else if (flag === "--out") args.out = process.argv[++index];
}

const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
const target = new URL(url);
target.searchParams.set("perf", "1");
await page.goto(target.href, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 20000 });
if (!await page.evaluate(() => Boolean(window.melodiPerf))) {
  throw new Error("window.melodiPerf tidak terpasang; buka dengan ?perf=1");
}

// Satu commit: bangun song utuh di memori lalu loadSong. Menambah note satu
// per satu akan mengukur commands, bukan playback.
const songInfo = await page.evaluate(({ bars, notesPerBar, hitsPerBar }) => {
  const PPQ = 480;
  const commands = window.melodi.commands;
  const id = () => crypto.randomUUID();
  const song = commands.getSong();
  song.title = "Perf probe 128 bar";
  song.notes = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * 4 * PPQ;
    for (let note = 0; note < notesPerBar; note += 1) {
      song.notes.push({
        id: id(),
        pitch: 60 + ((bar * 3 + note * 5) % 24),
        startTick: barStart + Math.floor((note * 4 * PPQ) / notesPerBar),
        durationTicks: Math.max(60, Math.floor((4 * PPQ) / notesPerBar) - 24),
        source: "user",
        anchor: false,
        locked: false
      });
    }
  }
  const events = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * 4 * PPQ;
    for (let hit = 0; hit < hitsPerBar; hit += 1) {
      events.push({
        id: id(),
        pieceId: ["kick", "snare", "closed-hi-hat", "mid-tom"][hit % 4],
        startTick: barStart + Math.floor((hit * 4 * PPQ) / hitsPerBar),
        velocity: 90,
        articulation: "normal"
      });
    }
  }
  song.tracks = [{ id: "perf-track", kind: "percussion", role: "drums", kitId: "gm-standard", events }];
  song.mix = { melody: 1, percussion: { "perf-track": { kick: 1, snare: 1, "closed-hi-hat": 1, "mid-tom": 1 } } };
  commands.loadSong(song);
  const loaded = commands.getSong();
  return {
    notes: loaded.notes.length,
    hits: loaded.tracks[0]?.events.length ?? 0,
    bytes: JSON.stringify(loaded).length,
    endTick: bars * 4 * PPQ
  };
}, { bars: args.bars, notesPerBar: args.notesPerBar, hitsPerBar: args.hitsPerBar });

await page.evaluate(() => {
  const toggle = document.querySelector("#guitar-mode-toggle");
  if (toggle?.getAttribute("aria-pressed") !== "true") toggle?.click();
});
await page.waitForFunction(() => document.querySelector("#studio-guitar-zone")?.dataset.open === "true", null, { timeout: 5000 })
  .catch(() => {});
await page.waitForTimeout(400);
await page.evaluate(() => window.melodiPerf.reset());
console.log(`lagu uji: ${songInfo.notes} note, ${songInfo.hits} hit drum, ${(songInfo.bytes / 1024).toFixed(0)} KB JSON`);

async function playRound(loop) {
  await page.evaluate(async ({ loop: loopOn, endTick }) => {
    const commands = window.melodi.commands;
    commands.setLoop(0, endTick);
    commands.setLoopEnabled(loopOn);
    commands.seek(0);
    await commands.play();
  }, { loop, endTick: songInfo.endTick });
  await page.waitForTimeout(args.seconds * 1000);
  await page.evaluate(() => window.melodi.commands.pause());
  await page.waitForTimeout(400);
}

const rows = [];
for (let round = 1; round <= args.rounds; round += 1) {
  const loop = round % 2 === 0;
  await page.evaluate(name => window.melodiPerf.label(name), `round-${round}`);
  await playRound(loop);
  const stats = await page.evaluate(label => {
    const { windows } = window.melodiPerf.report();
    const mine = windows.filter(item => item.label === label);
    const flat = key => mine.flatMap(item => item[key] ?? []);
    const sum = key => mine.reduce((total, item) => total + (item[key] ?? 0), 0);
    const last = key => {
      const values = flat(key).filter(value => typeof value === "number");
      return values.length ? values[values.length - 1] : 0;
    };
    const peak = key => Math.max(0, ...flat(key));
    const p = (values, ratio) => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((left, right) => left - right);
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
    };
    const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
    const seconds = sum("durationMs") / 1000;
    return {
      seconds: round(seconds, 1),
      longTasks: sum("longTasks"),
      longestTaskMs: round(peak("longestTaskMs")),
      heapMB: round(last("heapEnd") / 1048576, 1),
      heapPeakMB: round(peak("heapPeak") / 1048576, 1),
      tickP50: round(p(flat("ticks"), 0.5), 3),
      tickP95: round(p(flat("ticks"), 0.95), 3),
      tickMax: round(peak("ticks"), 3),
      renderP95: round(p(flat("renders"), 0.95), 3),
      renderMax: round(peak("renders"), 3),
      clones: sum("clones"),
      clonesPerSecond: round(seconds > 0 ? sum("clones") / seconds : 0, 1),
      cloneShare: round(seconds > 0 ? sum("cloneMs") / (seconds * 1000) * 100 : 0, 1),
      voices: peak("voices"),
      scheduled: peak("scheduled"),
      undoDepth: last("undoDepth"),
      domNodes: last("domNodes")
    };
  }, `round-${round}`);
  rows.push({
    putaran: round,
    loop: loop ? "ya" : "tidak",
    "long task": stats.longTasks,
    "longest ms": stats.longestTaskMs,
    "heap MB": stats.heapMB,
    "tick p50": stats.tickP50,
    "tick p95": stats.tickP95,
    "tick max": stats.tickMax,
    "render p95": stats.renderP95,
    "render max": stats.renderMax,
    "clone/dtk": stats.clonesPerSecond,
    "clone %": stats.cloneShare,
    voices: stats.voices,
    scheduled: stats.scheduled,
    undo: stats.undoDepth,
    "node DOM": stats.domNodes
  });
  console.log(`putaran ${round} (loop ${loop ? "ya" : "tidak"}): long=${stats.longTasks}/${stats.longestTaskMs}ms heap=${stats.heapMB}MB tickP95=${stats.tickP95}ms renderP95=${stats.renderP95}ms clone/s=${stats.clonesPerSecond} clone=${stats.cloneShare}%`);
}

const totals = await page.evaluate(() => window.melodiPerf.report().totals);
const header = ["putaran", "loop", "long task", "longest ms", "heap MB", "tick p50", "tick p95", "tick max", "render p95", "render max", "clone/dtk", "clone %", "voices", "scheduled", "undo", "node DOM"];
const table = [
  `| ${header.join(" | ")} |`,
  `| ${header.map(() => "---").join(" | ")} |`,
  ...rows.map(row => `| ${header.map(key => row[key]).join(" | ")} |`)
].join("\n");
console.log("");
console.log(`label: ${args.label}`);
console.log(table);
console.log("");
console.log(`total: tick=${totals.ticks} render=${totals.renders} clone=${totals.clones} longTask=${totals.longTasks}`);

if (args.out) {
  const file = resolve(args.out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ label: args.label, song: songInfo, totals, rounds: rows }, null, 2)}\n`);
  console.log(`JSON: ${file}`);
}

await browser.close();
await new Promise(done => server.close(done));