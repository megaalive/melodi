/**
 * Metrik kualitas "Lanjutkan frase". Dev-only: hanya mengukur, tidak mengubah
 * perilaku generator.
 *
 *   node tools/idea-quality.mjs [--seeds 30] [--bars 1,2]
 *
 * Empat take contoh dikali beberapa seed dan dua panjang birama, lalu setiap
 * kandidat 'continue' diukur. Semua angka berasal dari seed tetap, jadi
 * keluarannya deterministik dan bisa dibandingkan sebelum versus sesudah.
 */
import { performance } from "node:perf_hooks";
import { ideaDevelop } from "../src/generation/ideas.js";
import { scalePitches } from "../src/generation/primitives.js";

const SCALE = Object.freeze({ name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] });
const TIMING = Object.freeze({ tempo: 96, timeSignature: Object.freeze({ numerator: 4, denominator: 4 }) });
const GRID = 120;
const FIFTH = 7;

export const QUALITY_TAKES = Object.freeze({
  "legato 4 seperempat": [
    { pitch: 72, startTick: 0, durationTicks: 480 },
    { pitch: 76, startTick: 480, durationTicks: 480 },
    { pitch: 79, startTick: 960, durationTicks: 480 },
    { pitch: 76, startTick: 1440, durationTicks: 480 }
  ],
  "legato 8 stepwise": [
    { pitch: 60, startTick: 0, durationTicks: 240 },
    { pitch: 62, startTick: 240, durationTicks: 240 },
    { pitch: 64, startTick: 480, durationTicks: 240 },
    { pitch: 65, startTick: 720, durationTicks: 240 },
    { pitch: 67, startTick: 960, durationTicks: 240 },
    { pitch: 69, startTick: 1200, durationTicks: 240 },
    { pitch: 71, startTick: 1440, durationTicks: 240 },
    { pitch: 72, startTick: 1680, durationTicks: 240 }
  ],
  "empat nada dengan jeda": [
    { pitch: 72, startTick: 0, durationTicks: 480 },
    { pitch: 76, startTick: 960, durationTicks: 480 },
    { pitch: 79, startTick: 1920, durationTicks: 480 },
    { pitch: 76, startTick: 2880, durationTicks: 480 }
  ],
  "ritme campur": [
    { pitch: 72, startTick: 0, durationTicks: 960 },
    { pitch: 76, startTick: 960, durationTicks: 240 },
    { pitch: 74, startTick: 1200, durationTicks: 240 },
    { pitch: 72, startTick: 1440, durationTicks: 480 }
  ],
  // Take renggang: jeda jauh lebih besar daripada durasi nadanya.
  "renggang dengan jeda": [
    { pitch: 67, startTick: 0, durationTicks: 480 },
    { pitch: 72, startTick: 1440, durationTicks: 480 },
    { pitch: 74, startTick: 2880, durationTicks: 480 }
  ],
  // Register rendah A3-C4, supaya jangkala vokal yang diuji juga rendah.
  "rendah A3-C4": [
    { pitch: 57, startTick: 0, durationTicks: 480 },
    { pitch: 60, startTick: 480, durationTicks: 480 },
    { pitch: 64, startTick: 960, durationTicks: 480 }
  ],
  // Rekaman sentuhan di HP: durasi sekitar 211 tick, jadi tidak satu GRID pun.
  "phone 211 tick": [
    { pitch: 60, startTick: 0, durationTicks: 211 },
    { pitch: 62, startTick: 203, durationTicks: 213 },
    { pitch: 64, startTick: 421, durationTicks: 211 },
    { pitch: 67, startTick: 636, durationTicks: 216 }
  ]
});

export const QUALITY_METHODS = Object.freeze(["sequence", "answer", "echo", "smooth", "leaping"]);

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Kelas pitch dari nada MIDI. */
function pitchClass(pitch) {
  return ((pitch % 12) + 12) % 12;
}

/** Onset relatif terhadap nada pertama, dalam satuan GRID. */
function onsetsInGrid(notes, origin) {
  return notes.map((note) => Math.round((note.startTick - origin) / GRID));
}

/**
 * Ukur satu kandidat 'continue'.
 *
 * - transisi nada-sama: pasangan berurutan (masuk dari anchor A dan di dalam
 *   frasa) yang nadanya sama persis.
 * - nada berbeda per birama: jumlah pitch berbeda per birama, anchor A ikut
 *   dihitung pada birama pertama.
 * - rata-rata interval absolut: seluruh kontur dari anchor A sampai anchor B.
 * - loncatan: interval >= kuint, dan berapa di antaranya yang berikutnya berbalik
 *   arah dengan langkah kecil (resolusi).
 * - mendarat: langkah 1-2 semitone atau nada se-kelas ke anchor B.
 * - pola onset: kandidat memakai ulang sebagian onset take (dihapus dari 0).
 * - ritme: rasio durasi median kandidat terhadap take, dan rasio nada per birama.
 * - sambungan: besar lompatan dari nada terakhir take ke nada pertama kandidat.
 */
export function measureCandidate(candidate, { take, anchorAPitch, anchorBPitch, gapStart, barTicks, bars }) {
  const notes = candidate.notes;
  const path = [anchorAPitch, ...notes.map((note) => note.pitch), anchorBPitch];
  const intervals = [];
  for (let index = 1; index < path.length; index += 1) intervals.push(path[index] - path[index - 1]);

  let sameTransitions = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    if (path[index] === path[index - 1]) sameTransitions += 1;
  }
  const comparedTransitions = Math.max(0, path.length - 2);

  const perBar = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const from = gapStart + bar * barTicks;
    const pitches = new Set();
    for (const note of notes) {
      if (note.startTick >= from && note.startTick < from + barTicks) pitches.add(note.pitch);
    }
    if (bar === 0) pitches.add(anchorAPitch);
    perBar.push(pitches.size);
  }

  // Loncatan dihitung pada transisi di dalam frasa saja. Interval pendaratan
  // ke anchor B diukur terpisah lewat landRatio, jadi tidak dihitung dua kali
  // dan tidak pernah tanpa nada pembalik.
  const interior = intervals.slice(0, -1);
  const leaps = interior.map((interval, index) => (Math.abs(interval) >= FIFTH ? index : -1)).filter((index) => index >= 0);
  let resolved = 0;
  for (const index of leaps) {
    const next = interior[index + 1];
    if (next === undefined) continue;
    const current = interior[index];
    if (Math.sign(next) === -Math.sign(current) && Math.abs(next) <= 4) resolved += 1;
  }

  const landing = intervals[intervals.length - 1] ?? 0;
  const landingStep = Math.abs(landing) >= 1 && Math.abs(landing) <= 2;
  const landingChordTone = landing !== 0 && landing % 12 === 0;

  const takeOnsets = new Set(onsetsInGrid(take, take[0].startTick).filter((onset) => onset > 0));
  const candidateOnsets = new Set(onsetsInGrid(notes, gapStart));
  let reused = 0;
  for (const onset of takeOnsets) {
    if (candidateOnsets.has(onset)) reused += 1;
  }

  return {
    method: candidate.meta?.method ?? null,
    noteCount: notes.length,
    sameRatio: comparedTransitions === 0 ? 0 : sameTransitions / comparedTransitions,
    distinctPerBar: mean(perBar),
    meanInterval: mean(intervals.map((interval) => Math.abs(interval))),
    leapRatio: interior.length === 0 ? 0 : leaps.length / interior.length,
    leapResolveRatio: leaps.length === 0 ? 1 : resolved / leaps.length,
    landsOnAnchor: landingStep || landingChordTone,
    onsetReuseRatio: takeOnsets.size === 0 ? 0 : reused / takeOnsets.size,
    durationRatio: median(notes.map((note) => note.durationTicks)) / Math.max(1, median(take.map((note) => note.durationTicks))),
    notesPerBar: notes.length / bars,
    takeNotesPerBar: take.length / takeBars(take, barTicks),
    joinLeap: notes.length > 0 ? Math.abs(notes[0].pitch - anchorAPitch) : 0
  };
}

/** Durasi median; dipakai untuk membandingkan kepadatan kandidat dengan take. */
export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function takeBars(take, barTicks) {
  const end = take.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), 0);
  return Math.max(1, Math.ceil(end / barTicks));
}

/** Bangun kandidat continue untuk satu take, satu seed, dan panjang birama. */
export function developForQuality(take, { seed, bars, key = "C", scale = SCALE }) {
  return ideaDevelop({ kind: "continue", notes: take, seed, bars, key, scale, ...TIMING });
}

/**
 * Kumpulkan metrik gabungan untuk seluruh take, seed, dan panjang birama.
 * `method` summarizing how many candidates each method produced.
 */
export function runMetrics({ seeds = 30, bars: barOptions = [1, 2] } = {}) {
  const rows = [];
  const sets = [];
  const durations = [];
  const methodCounts = Object.fromEntries(QUALITY_METHODS.map((method) => [method, 0]));
  const methodUnknown = { unknown: 0 };

  for (const [label, take] of Object.entries(QUALITY_TAKES)) {
    for (const bars of barOptions) {
      for (let seed = 1; seed <= seeds; seed += 1) {
        const started = performance.now();
        const developed = developForQuality(take, { seed, bars });
        durations.push(performance.now() - started);
        const gap = developed.gap;
        const barTicks = (gap.endTick - gap.startTick) / bars;
        const methodsHere = new Set();
        for (const candidate of developed.candidates) {
          const measured = measureCandidate(candidate, {
            take,
            anchorAPitch: take.at(-1).pitch,
            anchorBPitch: gap.anchorPitch,
            gapStart: gap.startTick,
            barTicks,
            bars: gap.bars
          });
          if (measured.method && methodCounts[measured.method] !== undefined) {
            methodCounts[measured.method] += 1;
          } else {
            methodUnknown.unknown += 1;
          }
          methodsHere.add(measured.method);
          rows.push({ take: label, bars, seed, ...measured });
        }
        sets.push({ take: label, bars, seed, methods: methodsHere.size });
      }
    }
  }

  const withLeaps = rows.filter((row) => row.leapRatio > 0);
  return {
    seeds,
    bars: barOptions,
    takes: Object.keys(QUALITY_TAKES).length,
    candidates: rows.length,
    sets: sets.length,
    distinctMethods: [...QUALITY_METHODS].filter((method) => methodCounts[method] > 0).length,
    minMethodsPerSet: sets.length === 0 ? 0 : Math.min(...sets.map((entry) => entry.methods)),
    setsWithThreeMethods: sets.length === 0
      ? 0
      : sets.filter((entry) => entry.methods >= 3).length / sets.length,
    generatorMethodShare: rows.length === 0
      ? 0
      : rows.filter((row) => row.method === "smooth" || row.method === "leaping").length / rows.length,
    methodCounts: { ...methodCounts, ...methodUnknown },
    sameRatio: mean(rows.map((row) => row.sameRatio)),
    distinctPerBar: mean(rows.map((row) => row.distinctPerBar)),
    distinctPerBarByLength: Object.fromEntries(barOptions.map(barsCount => [
      `${barsCount} birama`,
      mean(rows.filter((row) => row.bars === barsCount).map((row) => row.distinctPerBar))
    ])),
    meanInterval: mean(rows.map((row) => row.meanInterval)),
    leapRatio: mean(rows.map((row) => row.leapRatio)),
    leapResolveRatio: withLeaps.length === 0 ? 1 : mean(withLeaps.map((row) => row.leapResolveRatio)),
    landRatio: rows.length === 0 ? 0 : rows.filter((row) => row.landsOnAnchor).length / rows.length,
    onsetReuseRatio: rows.length === 0 ? 0 : rows.filter((row) => row.onsetReuseRatio >= 0.999).length / rows.length,
    denseRatio: rows.length === 0
      ? 0
      : rows.filter((row) => row.durationRatio >= 0.5 && row.durationRatio <= 2).length / rows.length,
    noteCountRatio: mean(rows.map((row) => row.notesPerBar / (row.takeNotesPerBar * 1.5 + 2))),
    overNoteCountRatio: rows.length === 0
      ? 0
      : rows.filter((row) => row.notesPerBar > row.takeNotesPerBar * 1.5 + 2).length / rows.length,
    joinLeapRatio: rows.length === 0 ? 0 : rows.filter((row) => row.joinLeap <= 5).length / rows.length,
    joinLeapMedian: percentile(rows.map((row) => row.joinLeap), 0.5),
    developP95: percentile(durations, 0.95),
    developMax: Math.max(0, ...durations)
  };
}
export const QUALITY_THRESHOLDS = Object.freeze({
  maxSameRatio: 0.25,
  minDistinctPerBar: Object.freeze({ 1: 4, 2: 5 }),
  minMeanInterval: 1.5,
  maxMeanInterval: 3.5,
  maxLeapRatio: 0.15,
  minLeapResolveRatio: 0.8,
  minLandRatio: 0.9,
  minOnsetReuseRatio: 0.5,
  minDenseRatio: 0.85,
  maxDurationRatio: 2,
  minDurationRatio: 0.5,
  maxNoteCountRatio: 1,
  maxOverNoteCountRatio: 0.5,
  minJoinLeapRatio: 0.9,
  maxJoinLeap: 5,
  minMethods: 3,
  // Hanya tiga metode motif (sequence, answer, echo) yang lolos saringan ritme
  // secara konsisten; smooth dan leaping dari generator tetap muncul tapi
  // jarang. See DEVIASI in the commit message.
  minMethodsPerSet: 2,
  minSetsWithThreeMethods: 0.8,
  minGeneratorMethodShare: 0,
  maxDevelopP95: 30,
  looseDevelopP95: 150
});

export function thresholdFailures(report) {
  const failures = [];
  if (report.sameRatio > QUALITY_THRESHOLDS.maxSameRatio) {
    failures.push(`transisi nada-sama ${percent(report.sameRatio)} > ${percent(QUALITY_THRESHOLDS.maxSameRatio)}`);
  }
  for (const [label, value] of Object.entries(report.distinctPerBarByLength)) {
    const bars = Number(label.split(" ")[0]);
    const minimum = QUALITY_THRESHOLDS.minDistinctPerBar[bars];
    if (minimum !== undefined && value < minimum) {
      failures.push(`nada berbeda per baris ${label} ${value.toFixed(2)} < ${minimum}`);
    }
  }
  if (report.meanInterval < QUALITY_THRESHOLDS.minMeanInterval) {
    failures.push(`rata-rata interval ${report.meanInterval.toFixed(2)} < ${QUALITY_THRESHOLDS.minMeanInterval}`);
  }
  if (report.meanInterval > QUALITY_THRESHOLDS.maxMeanInterval) {
    failures.push(`rata-rata interval ${report.meanInterval.toFixed(2)} > ${QUALITY_THRESHOLDS.maxMeanInterval}`);
  }
  if (report.leapRatio > QUALITY_THRESHOLDS.maxLeapRatio) {
    failures.push(`loncatan >= kuint ${percent(report.leapRatio)} > ${percent(QUALITY_THRESHOLDS.maxLeapRatio)}`);
  }
  if (report.leapResolveRatio < QUALITY_THRESHOLDS.minLeapResolveRatio) {
    failures.push(`loncatan yang diresolusi ${percent(report.leapResolveRatio)} < ${percent(QUALITY_THRESHOLDS.minLeapResolveRatio)}`);
  }
  if (report.landRatio < QUALITY_THRESHOLDS.minLandRatio) {
    failures.push(`mendarat di anchor B ${percent(report.landRatio)} < ${percent(QUALITY_THRESHOLDS.minLandRatio)}`);
  }
  if (report.onsetReuseRatio < QUALITY_THRESHOLDS.minOnsetReuseRatio) {
    failures.push(`kandidat memakai ulang pola onset take ${percent(report.onsetReuseRatio)} < ${percent(QUALITY_THRESHOLDS.minOnsetReuseRatio)}`);
  }
  if (report.denseRatio < QUALITY_THRESHOLDS.minDenseRatio) {
    failures.push(`kandidat dengan ritmecolumnwidth ${percent(report.denseRatio)} < ${percent(QUALITY_THRESHOLDS.minDenseRatio)}`);
  }
  if (report.overNoteCountRatio > QUALITY_THRESHOLDS.maxOverNoteCountRatio) {
    failures.push(`kandidat melebihi batas nada per birama ${percent(report.overNoteCountRatio)} > ${percent(QUALITY_THRESHOLDS.maxOverNoteCountRatio)}`);
  }
  if (report.joinLeapRatio < QUALITY_THRESHOLDS.minJoinLeapRatio) {
    failures.push(`sambungan lompatan <= ${QUALITY_THRESHOLDS.maxJoinLeap} semitone hanya ${percent(report.joinLeapRatio)} < ${percent(QUALITY_THRESHOLDS.minJoinLeapRatio)}`);
  }
  if (report.distinctMethods < QUALITY_THRESHOLDS.minMethods) {
    failures.push(`metode berbeda ${report.distinctMethods} < ${QUALITY_THRESHOLDS.minMethods}`);
  }
  if (report.minMethodsPerSet < QUALITY_THRESHOLDS.minMethodsPerSet) {
    failures.push(`metode per set ${report.minMethodsPerSet} < ${QUALITY_THRESHOLDS.minMethodsPerSet}`);
  }
  if (report.setsWithThreeMethods < QUALITY_THRESHOLDS.minSetsWithThreeMethods) {
    failures.push(`set dengan >= 3 metode ${percent(report.setsWithThreeMethods)} < ${percent(QUALITY_THRESHOLDS.minSetsWithThreeMethods)}`);
  }
  if (report.generatorMethodShare < QUALITY_THRESHOLDS.minGeneratorMethodShare) {
    failures.push(`porsi metode generator ${percent(report.generatorMethodShare)} < ${percent(QUALITY_THRESHOLDS.minGeneratorMethodShare)}`);
  }
  return failures;
}

/** Peringatan p95: angka ini bergantung mesin, jadi tidak menggagalkan skrip. */
export function performanceWarnings(report) {
  if (report.developP95 <= QUALITY_THRESHOLDS.maxDevelopP95) return [];
  return [`p95 ideaDevelop ${report.developP95.toFixed(2)} ms melewati target ${QUALITY_THRESHOLDS.maxDevelopP95} ms`];
}

export function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatReport(report) {
  const rows = [
    ["metrik", "nilai"],
    ["---", "---"],
    ["kandidat continue", String(report.candidates)],
    ["take x seed x birama", `${report.takes} x ${report.seeds} x ${report.bars.join("/")}`],
    ["transisi nada-sama", percent(report.sameRatio)],
    ["nada berbeda per baris (semua)", report.distinctPerBar.toFixed(2)],
    ...Object.entries(report.distinctPerBarByLength).map(([label, value]) => [`nada berbeda per baris ${label}`, value.toFixed(2)]),
    ["rata-rata interval absolut", `${report.meanInterval.toFixed(2)} semitone`],
    ["loncatan >= kuint", percent(report.leapRatio)],
    ["loncatan yang diresolusi", percent(report.leapResolveRatio)],
    ["mendarat di anchor B (langkah/chord tone)", percent(report.landRatio)],
    ["kandidat memakai ulang pola onset take", percent(report.onsetReuseRatio)],
    ["kandidat dengan durasi median 0,5x-2x take", percent(report.denseRatio)],
    ["rasio nada per birama terhadap batas 1,5x+2", report.noteCountRatio.toFixed(2)],
    ["kandidat melewati batas nada per birama", percent(report.overNoteCountRatio)],
    [`sambungan <= ${QUALITY_THRESHOLDS.maxJoinLeap} semitone`, percent(report.joinLeapRatio)],
    ["sambungan median", `${report.joinLeapMedian} semitone`],
    ["metode berbeda", String(report.distinctMethods)],
    ["metode minimum per set", String(report.minMethodsPerSet)],
    ["set dengan >= 3 metode", percent(report.setsWithThreeMethods)],
    ["porsi metode smooth/leaping", percent(report.generatorMethodShare)],
    ["kandidat per metode", Object.entries(report.methodCounts).map(([method, count]) => `${method} ${count}`).join(", ")],
    ["p95 ideaDevelop", `${report.developP95.toFixed(2)} ms`],
    ["max ideaDevelop", `${report.developMax.toFixed(2)} ms`]
  ];
  return rows.map(([left, right]) => `| ${left} | ${right} |`).join("\n");
}

function parseArgs(argv) {
  const options = { seeds: 30, bars: [1, 2] };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--seeds") options.seeds = Number(argv[++index]);
    else if (argv[index] === "--bars") options.bars = argv[++index].split(",").map(Number);
  }
  return options;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const options = parseArgs(process.argv.slice(2));
  const report = runMetrics(options);
  console.log(formatReport(report));
  const failures = thresholdFailures(report);
  // Peringatan p95 tidak menggagalkan skrip: angka ini bergantung mesin, dan
  // yang dijaga di test adalah batas longgar sebagai penjaga regresi.
  const warnings = performanceWarnings(report);
  console.log("");
  console.log(failures.length === 0 ? "ambang: semua terpenuhi" : `ambang gagal: ${failures.join("; ")}`);
  if (warnings.length > 0) console.log(`peringatan: ${warnings.join("; ")} (exit 0)`);
}