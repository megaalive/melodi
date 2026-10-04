/**
 * Probe performa dev-only. Tidak aktif secara default: hanya dipasang kalau
 * halaman dibuka dengan ?perf=1 atau localStorage.melodiPerf = "1".
 *
 * Yang dicatat: long task (PerformanceObserver "longtask"), heap JS, durasi
 * tick scheduler, durasi renderPlayback, jumlah cloneData, ukuran map voice
 * dan scheduled, kedalaman undo, dan jumlah node DOM. Semuanya per detik
 * supaya tool ukur bisa membandingkan antar putaran.
 */

const FLAGS = { active: false };

const state = {
  windows: [],
  current: null,
  pendingLabel: null,
  totals: {
    clones: 0,
    cloneMs: 0,
    ticks: 0,
    tickMs: 0,
    renders: 0,
    renderMs: 0,
    longTasks: 0,
    longTaskMs: 0
  }
};

function now() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function emptyWindow(label) {
  return {
    label,
    from: now(),
    to: 0,
    durationMs: 0,
    clones: 0,
    cloneMs: 0,
    clonesPerSecond: 0,
    cloneMsShare: 0,
    ticks: [],
    tickMs: 0,
    tickP50: 0,
    tickP95: 0,
    tickMax: 0,
    renders: [],
    renderMs: 0,
    renderP50: 0,
    renderP95: 0,
    renderMax: 0,
    longTasks: 0,
    longestTaskMs: 0,
    heapEnd: 0,
    heapPeak: 0,
    voices: 0,
    scheduled: 0,
    undoDepth: 0,
    domNodes: 0
  };
}

function bucket() {
  if (!state.current) state.current = emptyWindow(state.pendingLabel ?? "");
  return state.current;
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function heapUsed() {
  const memory = globalThis.performance?.memory;
  return Number.isFinite(memory?.usedJSHeapSize) ? memory.usedJSHeapSize : 0;
}

export function perfEnabled() {
  if (typeof globalThis.performance === "undefined") return false;
  try {
    if (new URL(globalThis.location?.href ?? "file:///").searchParams.get("perf") === "1") return true;
    return globalThis.localStorage?.getItem("melodiPerf") === "1";
  } catch {
    return false;
  }
}

// Dipanggil model.js pada setiap cloneData. Satu increment dan satu cabang,
// tanpa timer kecuali probe aktif.
export function recordClone(durationMs) {
  const window = bucket();
  window.clones += 1;
  if (!FLAGS.active) return;
  window.cloneMs += durationMs;
  state.totals.cloneMs += durationMs;
  state.totals.clones += 1;
}

function installLongTaskObserver() {
  if (typeof PerformanceObserver === "undefined") return;
  if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const window = bucket();
      window.longTasks += 1;
      window.longestTaskMs = Math.max(window.longestTaskMs, entry.duration);
      state.totals.longTasks += 1;
      state.totals.longTaskMs += entry.duration;
    }
  });
  observer.observe({ entryTypes: ["longtask"] });
}

export function createPerfProbe({ player = null, commands = null } = {}) {
  let timer = null;
  // Pemanggil boleh mengoper fungsi agar lazy: player dan commands baru ada
  // setelah probe dipasang.
  const resolve = value => (typeof value === "function" ? value() : value);

  function sample() {
    const window = bucket();
    const heap = heapUsed();
    if (heap > 0) {
      window.heapEnd = heap;
      window.heapPeak = Math.max(window.heapPeak, heap);
    }
    window.domNodes = document.getElementsByTagName("*").length;
    const debug = resolve(player)?.getDebugState?.();
    if (debug) {
      window.voices = debug.voices;
      window.scheduled = debug.scheduled;
    }
    const history = resolve(commands)?.getHistoryState?.();
    if (history) window.undoDepth = history.undoDepth;
  }

  function closeWindow() {
    if (!state.current) return;
    sample();
    const window = state.current;
    window.to = now();
    window.durationMs = round(window.to - window.from);
    window.tickP50 = round(percentile(window.ticks, 0.5));
    window.tickP95 = round(percentile(window.ticks, 0.95));
    window.tickMax = round(window.ticks.length ? Math.max(...window.ticks) : 0);
    window.renderP50 = round(percentile(window.renders, 0.5));
    window.renderP95 = round(percentile(window.renders, 0.95));
    window.renderMax = round(window.renders.length ? Math.max(...window.renders) : 0);
    window.clonesPerSecond = window.durationMs > 0 ? round((window.clones * 1000) / window.durationMs, 1) : 0;
    window.cloneMsShare = window.durationMs > 0 ? round((window.cloneMs * 100) / window.durationMs, 1) : 0;
    state.windows.push(window);
    state.current = null;
  }

  const probe = {
    start() {
      if (timer !== null) return probe;
      FLAGS.active = true;
      installLongTaskObserver();
      bucket();
      timer = setInterval(() => {
        closeWindow();
        bucket();
        sample();
      }, 1000);
      return probe;
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      closeWindow();
      FLAGS.active = false;
      return probe;
    },
    // Memulai jendela baru dengan nama, jadi tool ukur bisa menandai putaran.
    label(name) {
      state.pendingLabel = name ?? null;
      if (state.current) closeWindow();
      else bucket();
      return probe;
    },
    recordTick(durationMs) {
      const window = bucket();
      window.ticks.push(round(durationMs));
      window.tickMs += durationMs;
      state.totals.ticks += 1;
      state.totals.tickMs += durationMs;
    },
    recordRender(durationMs) {
      const window = bucket();
      window.renders.push(round(durationMs));
      window.renderMs += durationMs;
      state.totals.renders += 1;
      state.totals.renderMs += durationMs;
    },
    recordRenderPart(label, durationMs) {
      const window = bucket();
      window.parts ??= {};
      const list = window.parts[label] ?? (window.parts[label] = []);
      list.push(durationMs);
    },
    recordClone(durationMs) {
      recordClone(durationMs);
    },
    report() {
      return { totals: { ...state.totals }, windows: state.windows.map(window => ({ ...window })) };
    },
    reset() {
      state.windows = [];
      state.current = null;
      state.pendingLabel = null;
      for (const key of Object.keys(state.totals)) state.totals[key] = 0;
      bucket();
      return probe;
    }
  };

  if (typeof globalThis.window !== "undefined") {
    Object.defineProperty(globalThis.window, "melodiPerf", {
      value: probe,
      enumerable: true,
      writable: false,
      configurable: true
    });
  }
  return probe;
}