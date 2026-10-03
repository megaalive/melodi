import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialSong } from "../src/core/model.js";
import {
  createDrumGridView,
  drumCellIntent,
  drumKeyboardIntent,
  isDrumKeyboardTarget,
  drumGridEndTick,
  drumTimelineTickAtX,
  drumTimelineTickToX,
  nextDrumCellHit,
  normalizeDrumPlaybackRange,
  projectDrumGrid
} from "../src/ui/drum-grid.js";

function songFixture() {
  let next = 0;
  return createInitialSong(() => `drum-grid-${++next}`);
}

test("Drum Grid mengikuti meter, Snap, dan panjang canonical song", () => {
  const song = songFixture();
  const projection = projectDrumGrid(song, { snap: "1/8" });
  assert.equal(projection.snapTicks, 240);
  assert.equal(projection.beatTicks, 240);
  assert.equal(projection.barTicks, 1440);
  assert.equal(projection.endTick, 11520);
  assert.equal(projection.columns.length, 48);
  assert.equal(projection.kit.id, "gm-standard");
  assert.equal(projection.kit.pieces.at(-1).id, "kick");
});

test("minimum empat bar hanya memperluas proyeksi visual dan tetap memakai batas lagu canonical", () => {
  const song = songFixture();
  song.notes = [];
  song.tracks = [];
  song.timing.timeSignature = { numerator: 4, denominator: 4 };

  const projection = projectDrumGrid(song, { snap: "1/8", minimumVisibleBars: 4 });

  assert.equal(projection.barTicks, 1920);
  assert.equal(projection.endTick, 1920);
  assert.equal(projection.viewEndTick, 7680);
  assert.equal(drumGridEndTick(song), 1920);
  assert.equal(projection.columns.length, 32);
  assert.deepEqual(
    projection.columns.filter((tick) => tick % projection.barTicks === 0),
    [0, 1920, 3840, 5760]
  );
});

test("Hit percussion diproyeksikan berdasarkan piece identity, bukan MIDI pitch", () => {
  const song = songFixture();
  song.tracks.push({
    id: "drums-1",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "hit-1", pieceId: "kick", startTick: 0, velocity: 120, articulation: "normal" },
      { id: "hit-2", pieceId: "snare", startTick: 720, velocity: 78, articulation: "ghost" }
    ]
  });
  const projection = projectDrumGrid(song, { snap: "1/8" });
  assert.equal(projection.cells.get("kick@0")[0].velocity, 120);
  assert.equal(projection.cells.get("snare@720")[0].articulation, "ghost");
  assert.equal(projection.cells.has("36@0"), false);
});

test("microtiming memakai cell terdekat tanpa membuang collision", () => {
  const song = songFixture();
  song.tracks.push({
    id: "drums-1",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "late", pieceId: "closed-hi-hat", startTick: 250, velocity: 90, articulation: "normal" },
      { id: "early", pieceId: "closed-hi-hat", startTick: 235, velocity: 70, articulation: "normal" }
    ]
  });
  const hits = projectDrumGrid(song, { snap: "1/8" }).cells.get("closed-hi-hat@240");
  assert.equal(hits.length, 2);
  assert.equal(hits[0].hitId, "early");
  assert.equal(hits[0].timingOffset, -5);
  assert.equal(hits[1].timingOffset, 10);
});

test("percussion dapat memperpanjang Drum Grid melewati melody", () => {
  const song = songFixture();
  song.tracks.push({
    id: "drums-1",
    kind: "percussion",
    role: "rhythm",
    kitId: "gm-standard",
    events: [
      { id: "tail", pieceId: "crash", startTick: 12000, velocity: 100, articulation: "normal", durationTicks: 480 }
    ]
  });
  assert.equal(drumGridEndTick(song), 12960);
});


test("collision microtiming dapat di-cycle tanpa menyembunyikan hit", () => {
  const hits = [
    { hitId: "a", timingOffset: -5 },
    { hitId: "b", timingOffset: 10 },
    { hitId: "c", timingOffset: 14 }
  ];
  assert.equal(nextDrumCellHit(hits, null).hitId, "a");
  assert.equal(nextDrumCellHit(hits, "a").hitId, "b");
  assert.equal(nextDrumCellHit(hits, "b").hitId, "c");
  assert.equal(nextDrumCellHit(hits, "c").hitId, "a");
  assert.equal(nextDrumCellHit([], "a"), null);
});


test("mode Pilih tidak pernah menambah hit pada cell kosong", () => {
  assert.equal(drumCellIntent("select", false), "clear");
  assert.equal(drumCellIntent("draw", false), "add");
  assert.equal(drumCellIntent("select", true), "select");
  assert.equal(drumCellIntent("draw", true), "select");
});

test("playhead Drum memakai pemetaan tick kontinu dari gutter dan lebar kolom aktual", () => {
  const geometry = { gutterWidth: 128, columnWidth: 28, snapTicks: 240, songEndTick: 960 };
  assert.equal(drumTimelineTickToX(0, geometry), 128);
  assert.equal(drumTimelineTickToX(120, geometry), 142);
  assert.equal(drumTimelineTickToX(240, geometry), 156);
  assert.notEqual(drumTimelineTickToX(121, geometry), drumTimelineTickToX(120, geometry));
});

test("ruler mengonversi X ke tick dengan Snap editor aktif dan clamp ke batas lagu", () => {
  const geometry = { gutterWidth: 128, columnWidth: 28, snapTicks: 240, songEndTick: 1000 };
  assert.equal(drumTimelineTickAtX(128, geometry, "1/4"), 0);
  assert.equal(drumTimelineTickAtX(184, geometry, "1/4"), 480);
  assert.equal(drumTimelineTickAtX(168.25, geometry, "1/8"), 240);
  assert.equal(drumTimelineTickAtX(168.25, geometry, "1/16"), 360);
  assert.equal(drumTimelineTickAtX(10000, geometry, "1/8"), 1000);
  assert.equal(drumTimelineTickAtX(32, geometry, "1/8"), 0, "gutter tidak dihitung sebagai waktu");
});

test("ruler menormalkan drag range dari kiri ke kanan maupun sebaliknya", () => {
  assert.deepEqual(normalizeDrumPlaybackRange(480, 1920), { startTick: 480, endTick: 1920 });
  assert.deepEqual(normalizeDrumPlaybackRange(1920, 480), { startTick: 480, endTick: 1920 });
});

class GridElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.dataset = {};
    this.children = [];
    this.attributes = new Map();
    this.style = {
      properties: new Map(),
      setProperty(name, value) { this.properties.set(name, String(value)); },
      getPropertyValue(name) { return this.properties.get(name) ?? ""; }
    };
    this.parentElement = null;
    this.textContent = "";
    this.listeners = new Map();
    this.capturedPointers = new Set();
    this.hidden = false;
  }

  append(...items) {
    for (const item of items) {
      item.parentElement = this;
      this.children.push(item);
    }
  }

  replaceChildren(...items) {
    this.children = [];
    this.append(...items);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  closest(selector) {
    for (let element = this; element; element = element.parentElement) {
      if (element.matches?.(selector)) return element;
    }
    return null;
  }
  matches(selector) {
    const classNames = [...selector.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
    if (classNames.some((className) => !this.className.split(/\s+/).includes(className))) return false;
    for (const [, key, value] of selector.matchAll(/\[data-([\w-]+)="([^"]+)"\]/g)) {
      const datasetKey = key.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      if (this.dataset[datasetKey] !== value) return false;
    }
    return true;
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.preventDefault ??= function preventDefault() { this.defaultPrevented = true; };
    event.stopPropagation ??= function stopPropagation() { this.propagationStopped = true; };
    for (let element = this; element; element = element.parentElement) {
      event.currentTarget = element;
      for (const listener of element.listeners?.get(event.type) ?? []) listener(event);
      if (event.bubbles === false || event.propagationStopped) break;
    }
    return !event.defaultPrevented;
  }
  setPointerCapture(pointerId) { this.capturedPointers.add(pointerId); }
  releasePointerCapture(pointerId) { this.capturedPointers.delete(pointerId); }
  hasPointerCapture(pointerId) { return this.capturedPointers.has(pointerId); }
  contains(item) { return item === this || this.walk().includes(item); }
  walk() { return this.children.flatMap((child) => [child, ...child.walk()]); }

  querySelectorAll(selector) {
    return this.walk().filter((element) => element.matches(selector));
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  getBoundingClientRect() {
    const grid = this.closest('[data-entity="drum-grid"]');
    if (grid?.timelineGeometry) {
      const { gutterWidth, snapTicks } = grid.timelineGeometry;
      const stepWidth = Number.parseFloat(grid.style.getPropertyValue("--drum-step-width")) || 28.8;
      const columns = Number(grid.style.getPropertyValue("--drum-column-count"));
      const left = -(grid.parentElement?.scrollLeft ?? 0);
      const width = Math.max(grid.parentElement?.clientWidth ?? 0, gutterWidth + columns * stepWidth);
      if (this === grid) return { left, top: 40, right: left + width, bottom: 540, width, height: 500 };
      if (this.className === "drum-grid-corner") {
        const frozenLeft = left + Number(this.style.transform?.match(/translateX\(([-\d.]+)px\)/)?.[1] ?? 0);
        return { left: frozenLeft, top: 40, right: frozenLeft + gutterWidth, bottom: 70, width: gutterWidth, height: 30 };
      }
      if (this.dataset.entity === "drum-ruler") {
        return { left: left + gutterWidth, top: 40, right: left + width, bottom: 70, width: width - gutterWidth, height: 30 };
      }
      if (this.className === "drum-grid-step" || this.dataset.entity === "drum-cell") {
        const stepLeft = left + gutterWidth + Number(this.dataset.tick) / snapTicks * stepWidth;
        const labels = grid.children.filter((item) => item.className === "drum-row-label");
        const row = labels.findIndex((item) => item.dataset.pieceId === this.dataset.pieceId);
        const top = this.dataset.entity === "drum-cell" ? 70 + Math.max(0, row) * 30 : 40;
        return { left: stepLeft, top, right: stepLeft + stepWidth, bottom: top + 30, width: stepWidth, height: 30 };
      }
    }
    const scroll = this.parentElement;
    const rootLeft = -(scroll?.scrollLeft ?? 0);
    if (this.dataset.entity === "drum-grid") return { left: rootLeft, top: 40, right: rootLeft + 1568, bottom: 540, width: 1568, height: 500 };
    if (this.className === "drum-grid-corner") {
      const left = -(this.parentElement?.parentElement?.scrollLeft ?? 0) + Number(this.style.transform?.match(/translateX\(([-\d.]+)px\)/)?.[1] ?? 0);
      return { left, top: 40, right: left + 128, bottom: 70, width: 128, height: 30 };
    }
    if (this.dataset.entity === "drum-ruler") return { left: rootLeft + 128, top: 40, right: rootLeft + 1568, bottom: 70, width: 1440, height: 30 };
    if (this.className === "drum-grid-step") {
      const tick = Number(this.dataset.tick);
      const left = rootLeft + 128 + (tick / 240) * 30;
      return { left, top: 40, right: left + 30, bottom: 70, width: 30, height: 30 };
    }
    if (this.dataset.entity === "drum-cell") {
      const labels = this.parentElement?.children.filter((item) => item.className === "drum-row-label") ?? [];
      const row = labels.findIndex((item) => item.dataset.pieceId === this.dataset.pieceId);
      const left = rootLeft + 128 + (Number(this.dataset.tick) / 240) * 30;
      const top = 70 + Math.max(0, row) * 30;
      return { left, top, right: left + 30, bottom: top + 30, width: 30, height: 30 };
    }
    return { left: rootLeft, top: 40, right: rootLeft + 30, bottom: 70, width: 30, height: 30 };
  }
}

function drumViewFixture(options = {}, timelineGeometry = null) {
  globalThis.document = { createElement: (tag) => new GridElement(tag) };
  globalThis.Element = GridElement;
  const scroll = Object.assign(new GridElement("div"), { clientWidth: 400, scrollWidth: 1568, scrollLeft: 0, scrollTop: 72 });
  const root = new GridElement("div");
  root.dataset.entity = "drum-grid";
  root.scrollWidth = 1568;
  root.parentElement = scroll;
  if (timelineGeometry) {
    root.timelineGeometry = timelineGeometry;
    scroll.clientWidth = timelineGeometry.clientWidth;
    Object.defineProperty(scroll, "scrollWidth", {
      get: () => Math.ceil(root.getBoundingClientRect().width), configurable: true
    });
    Object.defineProperty(root, "scrollWidth", {
      get: () => scroll.scrollWidth, configurable: true
    });
  }
  const view = createDrumGridView(root, options);
  view.render(songFixture(), { editor: { snap: "1/8", tool: "select" } });
  return { root, scroll, view };
}

test("blank Drum Grid fits four complete 4/4 bars at a 1440px viewport and preserves canonical ruler duration", () => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  try {
    const seeks = [];
    const { root, scroll, view } = drumViewFixture({ onSeek: (tick) => seeks.push(tick) }, {
      clientWidth: 1019, gutterWidth: 192, snapTicks: 240
    });
    const song = songFixture();
    song.notes = [];
    song.tracks = [];
    song.timing.timeSignature = { numerator: 4, denominator: 4 };

    const originalSong = structuredClone(song);
    const projection = view.render(song, { editor: { snap: "1/8", tool: "select", zoom: 1 } }, 1);
    const barStarts = root.querySelectorAll('.drum-grid-step[data-bar="true"]');
    const stepWidth = Number.parseFloat(root.style.getPropertyValue("--drum-step-width"));

    assert.equal(projection.endTick, 1920);
    assert.equal(projection.viewEndTick, 7680);
    assert.deepEqual(barStarts.map((step) => Number(step.dataset.tick)), [0, 1920, 3840, 5760]);
    assert.ok(stepWidth * projection.columns.length + 192 <= scroll.clientWidth + 0.001,
      "all four bars fit in the available timeline width after the measured gutter");
    assert.ok(drumCell(root, "kick", 7440).getBoundingClientRect().right <= scroll.clientWidth + 0.001,
      "the final cell of bar four fits, not just its bar-start label");
    assert.equal(scroll.scrollWidth, scroll.clientWidth);
    const ruler = root.querySelector('[data-entity="drum-ruler"]');
    assert.equal(ruler.getAttribute("aria-valuemax"), "1");
    ruler.dispatchEvent({ type: "keydown", key: "End", bubbles: true });
    assert.deepEqual(seeks, [1]);
    view.updatePlayback({ status: "playing", currentTick: 7680 }, { followMode: "center" });
    assert.equal(ruler.getAttribute("aria-valuenow"), "1");
    assert.equal(scroll.scrollLeft, 0, "view-only bars never extend canonical playback scrolling");
    assert.deepEqual(song, originalSong);

    view.render(song, { editor: { snap: "1/8", tool: "select", zoom: 2 } });
    assert.equal(root.style.getPropertyValue("--drum-step-width"), "57.6px");
    assert.equal(root.querySelectorAll('.drum-grid-step[data-bar="true"]').length, 4);

    globalThis.matchMedia = () => ({ matches: true });
    view.render(song, { editor: { snap: "1/8", tool: "select", zoom: 1 } });
    assert.equal(root.style.getPropertyValue("--drum-step-width"), "44px");
    assert.equal(root.querySelectorAll('.drum-grid-step[data-bar="true"]').length, 4);
  } finally {
    if (previousMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previousMatchMedia;
  }
});

for (const { meter, barTicks, bars } of [
  { meter: { numerator: 4, denominator: 4 }, barTicks: 1920, bars: 4 },
  { meter: { numerator: 4, denominator: 4 }, barTicks: 1920, bars: 5 },
  { meter: { numerator: 4, denominator: 4 }, barTicks: 1920, bars: 8 },
  { meter: { numerator: 6, denominator: 8 }, barTicks: 1440, bars: 8 }
]) {
  test(`${bars}-bar ${meter.numerator}/${meter.denominator} Drum Grid fits four complete bars at 1440px for every Snap`, () => {
    const previousMatchMedia = globalThis.matchMedia;
    globalThis.matchMedia = () => ({ matches: false });
    try {
      const seeks = [];
      const timelineGeometry = { clientWidth: 1019, gutterWidth: 192, snapTicks: 240 };
      const { root, scroll, view } = drumViewFixture({ onSeek: (tick) => seeks.push(tick) }, timelineGeometry);
      const song = songFixture();
      song.tracks = [];
      song.timing.timeSignature = meter;
      const note = song.notes[0];
      for (const [snap, snapTicks] of [["1/4", 480], ["1/8", 240], ["1/16", 120]]) {
        const canonicalEndTick = bars * barTicks - snapTicks / 2;
        song.notes = [{ ...note, startTick: 0, durationTicks: canonicalEndTick }];
        const originalSong = structuredClone(song);
        timelineGeometry.snapTicks = snapTicks;
        scroll.scrollLeft = 0;
        const projection = view.render(song, { editor: { snap, tool: "select", zoom: 1 } }, canonicalEndTick);
        const stepWidth = Number.parseFloat(root.style.getPropertyValue("--drum-step-width"));
        const lastFourthBarTick = projection.columns.filter((tick) => tick < barTicks * 4).at(-1);
        const lastFourthBarCell = drumCell(root, "kick", lastFourthBarTick);
        assert.ok(lastFourthBarCell.getBoundingClientRect().right <= scroll.clientWidth + 0.001,
          `${snap}: every cell through bar four fits inside the scrollport`);
        assert.equal(projection.endTick, bars * barTicks);
        assert.equal(projection.viewEndTick, bars * barTicks);
        assert.equal(projection.columns.length, bars * barTicks / snapTicks);
        assert.ok(drumCell(root, "kick", projection.columns.at(-1)), `${snap}: the entire later song remains rendered`);

        const ruler = root.querySelector('[data-entity="drum-ruler"]');
        assert.equal(ruler.getAttribute("aria-valuemax"), String(canonicalEndTick));
        ruler.dispatchEvent({ type: "keydown", key: "End", bubbles: true });
        assert.equal(seeks.at(-1), canonicalEndTick, `${snap}: ruler End stops at the canonical unrounded duration`);
        const canonicalEndX = 192 + canonicalEndTick / snapTicks * stepWidth;
        view.updatePlayback({ status: "playing", currentTick: canonicalEndTick }, { followMode: "center" });
        assert.ok(Math.abs(scroll.scrollLeft - Math.max(0, canonicalEndX - scroll.clientWidth)) < 0.001,
          `${snap}: playback scroll ends at the canonical duration using the fitted step width`);
        assert.ok(Math.abs(Number.parseFloat(root.querySelector(".drum-playhead-line").style.left) - canonicalEndX) < 0.001);
        assert.equal(ruler.getAttribute("aria-valuenow"), String(canonicalEndTick));
        assert.equal(scroll.scrollTop, 72);
        assert.deepEqual(song, originalSong);
      }
    } finally {
      if (previousMatchMedia === undefined) delete globalThis.matchMedia;
      else globalThis.matchMedia = previousMatchMedia;
    }
  });
}

test("desktop Drum Grid refits four bars on resize while wider canvases retain more bars", () => {
  const previousMatchMedia = globalThis.matchMedia;
  const previousResizeObserver = globalThis.ResizeObserver;
  let resize;
  let observed;
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe(element) { observed = element; }
  };
  try {
    const { root, scroll, view } = drumViewFixture({}, { clientWidth: 1019, gutterWidth: 192, snapTicks: 240 });
    const song = songFixture();
    song.timing.timeSignature = { numerator: 4, denominator: 4 };
    song.notes = [{ ...song.notes[0], startTick: 0, durationTicks: 15360 }];
    song.tracks = [];
    view.render(song, { editor: { snap: "1/8", tool: "select", zoom: 1 } }, 15360);
    assert.equal(observed, scroll);
    assert.equal(root.style.getPropertyValue("--drum-step-width"), "25.84375px");
    assert.ok(drumCell(root, "kick", 7440).getBoundingClientRect().right <= scroll.clientWidth + 0.001);

    scroll.clientWidth = 1519;
    resize();
    assert.equal(root.style.getPropertyValue("--drum-step-width"), "28.8px");
    assert.ok(drumCell(root, "kick", 9360).getBoundingClientRect().right <= scroll.clientWidth + 0.001,
      "a wider canvas keeps at least five full bars visible at the normal step width");
    assert.equal(root.querySelector('[data-entity="drum-ruler"]').getAttribute("aria-valuemax"), "15360");

    scroll.clientWidth = 1019;
    resize();
    assert.equal(root.style.getPropertyValue("--drum-step-width"), "25.84375px");
    assert.ok(drumCell(root, "kick", 7440).getBoundingClientRect().right <= scroll.clientWidth + 0.001);
    assert.equal(root.querySelectorAll(".drum-grid-step").length, 64);
  } finally {
    if (previousMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previousMatchMedia;
    if (previousResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previousResizeObserver;
  }
});

test("Drum Grid memusatkan step di area setelah kolom label dan mempertahankan posisi vertikal", () => {
  const { root, scroll, view } = drumViewFixture();
  view.updatePlayback({ status: "playing", currentTick: 6000 }, { followMode: "center" });

  assert.equal(scroll.scrollLeft, 614);
  assert.equal(scroll.scrollTop, 72);
  assert.ok(root.querySelectorAll('[data-entity="drum-row-label"]').every((label) => label.style.transform === "translateX(614px)"));
  assert.ok(root.querySelectorAll('[data-tick="6000"]').every((element) => element.dataset.currentStep === "true"));
});

test("playhead dan full-song center follow berubah pada tick berbeda di Snap cell yang sama", () => {
  const { root, scroll, view } = drumViewFixture();
  view.updatePlayback({ status: "playing", currentTick: 6000 }, { followMode: "center" });
  const line = root.querySelector(".drum-playhead-line");
  assert.equal(line.style.left, "878px");
  const firstScrollLeft = scroll.scrollLeft;

  view.updatePlayback({ status: "playing", currentTick: 6010 }, { followMode: "center" });
  assert.equal(line.style.left, "879.25px");
  assert.equal(scroll.scrollLeft, firstScrollLeft + 1.25);
  assert.ok(root.querySelectorAll('[data-tick="6000"]').every((element) => element.dataset.currentStep === "true"));
  assert.ok(root.querySelectorAll('[data-tick="6240"]').every((element) => element.dataset.currentStep !== "true"));
});

test("Drum Grid custom range memakai nearest horizontal follow dan Follow mati tidak menggulir", () => {
  const { root, scroll, view } = drumViewFixture();
  view.updatePlayback({ status: "playing", currentTick: 6000 }, { followMode: "nearest" });
  assert.equal(scroll.scrollLeft, 478);
  assert.ok(root.querySelectorAll('[data-entity="drum-row-label"]').every((label) => label.style.transform === "translateX(478px)"));
  assert.equal(scroll.scrollTop, 72);

  scroll.scrollLeft = 73;
  view.updatePlayback({ status: "playing", currentTick: 9000 }, { followMode: "none" });
  assert.equal(scroll.scrollLeft, 73);
  assert.equal(scroll.scrollTop, 72);
});

test("native horizontal scroll freezes corner and every piece control, including after snap render", () => {
  const { root, scroll, view } = drumViewFixture();
  for (const offset of [0, 320, 1200]) {
    scroll.scrollLeft = offset;
    scroll.dispatchEvent({ type: "scroll", bubbles: false });
    const gutter = root.querySelectorAll('[data-entity="drum-row-label"]');
    assert.equal(gutter.length, 10);
    assert.ok(gutter.every((label) => label.style.transform === `translateX(${offset}px)`));
    assert.equal(scroll.scrollTop, 72);
  }
  view.render(songFixture(), { editor: { snap: "1/16", tool: "select" } });
  assert.equal(scroll.scrollLeft, 1200);
  assert.equal(scroll.scrollTop, 72);
  assert.ok(root.querySelectorAll('[data-entity="drum-row-label"]').every((label) => label.style.transform === "translateX(1200px)"));
});

test("Drum Grid berhenti pada batas konten dan tidak meminta browser scrollIntoView", () => {
  const { root, scroll, view } = drumViewFixture();
  view.updatePlayback({ status: "playing", currentTick: 11280 }, { followMode: "center" });
  assert.equal(scroll.scrollLeft, scroll.scrollWidth - scroll.clientWidth);
  assert.equal(scroll.scrollTop, 72);
  const source = readFileSync(resolve("src/ui/drum-grid.js"), "utf8");
  assert.doesNotMatch(source, /scrollIntoView/);
  assert.ok(root.querySelectorAll('[data-tick="11280"]').some((element) => element.dataset.currentStep === "true"));
});

function pointer(type, clientX, pointerId = 1) {
  return { type, clientX, clientY: 60, pointerId, button: 0, bubbles: true };
}

function rulerPoint(root, tick) {
  const scroll = root.parentElement;
  const rootLeft = -(scroll?.scrollLeft ?? 0);
  return rootLeft + 128 + tick / 240 * 30;
}

test("click ruler seeks dengan Snap aktif tanpa menambah percussion hit", () => {
  const seeks = [];
  let addedHits = 0;
  const { root, view } = drumViewFixture({
    onSeek: (tick) => seeks.push(tick),
    onAddHit: () => { addedHits += 1; }
  });
  view.render(songFixture(), { editor: { snap: "1/8", tool: "draw" } }, 11520);
  const ruler = root.querySelector('[data-entity="drum-ruler"]');
  ruler.dispatchEvent(pointer("pointerdown", rulerPoint(root, 960)));
  ruler.dispatchEvent(pointer("pointerup", rulerPoint(root, 960)));
  ruler.dispatchEvent({ type: "click", bubbles: true });

  assert.deepEqual(seeks, [960]);
  assert.equal(addedHits, 0);
  assert.equal(ruler.getAttribute("role"), "slider");
  assert.equal(ruler.getAttribute("aria-valuemax"), "11520");
});

test("ruler drag commits normalized range then seeks its start; pointer cancel and Escape clear preview", () => {
  const song = songFixture();
  const actions = [];
  const { root, view } = drumViewFixture({
    onAddHit: () => actions.push("add"),
    onSeek: (tick) => actions.push(["seek", tick]),
    onSetPlaybackRange: (start, end) => actions.push(["range", start, end])
  });
  view.render(song, { editor: { snap: "1/8", tool: "draw" } }, 11520);
  const ruler = root.querySelector('[data-entity="drum-ruler"]');

  ruler.dispatchEvent(pointer("pointerdown", rulerPoint(root, 960)));
  ruler.dispatchEvent(pointer("pointermove", rulerPoint(root, 2400)));
  assert.equal(root.querySelector(".drum-playback-range").dataset.state, "preview");
  ruler.dispatchEvent(pointer("pointerup", rulerPoint(root, 2400)));
  assert.deepEqual(actions, [["range", 960, 2400], ["seek", 960]]);
  assert.equal(root.querySelector(".drum-playback-range").hidden, true);
  assert.equal(ruler.hasPointerCapture(1), false);

  actions.length = 0;
  ruler.dispatchEvent(pointer("pointerdown", rulerPoint(root, 2400)));
  ruler.dispatchEvent(pointer("pointermove", rulerPoint(root, 960)));
  assert.deepEqual(
    [root.querySelector(".drum-playback-range").dataset.startTick, root.querySelector(".drum-playback-range").dataset.endTick],
    ["960", "2400"]
  );
  ruler.dispatchEvent(pointer("pointercancel", rulerPoint(root, 960)));
  assert.equal(actions.length, 0);
  assert.equal(root.querySelector(".drum-playback-range").hidden, true);

  ruler.dispatchEvent(pointer("pointerdown", rulerPoint(root, 2400)));
  ruler.dispatchEvent(pointer("pointermove", rulerPoint(root, 960)));
  ruler.dispatchEvent(pointer("pointerup", rulerPoint(root, 960)));
  assert.deepEqual(actions, [["range", 960, 2400], ["seek", 960]]);
  assert.equal(ruler.hasPointerCapture(1), false);

  actions.length = 0;
  ruler.dispatchEvent(pointer("pointerdown", rulerPoint(root, 960)));
  ruler.dispatchEvent(pointer("pointermove", rulerPoint(root, 2400)));
  const escapeEvent = { type: "keydown", key: "Escape", bubbles: true };
  ruler.dispatchEvent(escapeEvent);
  assert.equal(actions.length, 0);
  assert.equal(escapeEvent.propagationStopped, true);
  assert.equal(root.querySelector(".drum-playback-range").hidden, true);
  assert.equal(ruler.hasPointerCapture(1), false);
});

test("custom playback range ditampilkan dari playback.loop canonical", () => {
  const { root, view } = drumViewFixture();
  const range = root.querySelector(".drum-playback-range");
  view.updatePlayback({ currentTick: 960, loop: { startTick: 480, endTick: 2400, enabled: false } });
  assert.equal(range.hidden, false);
  assert.equal(range.dataset.state, "committed");
  assert.equal(range.dataset.startTick, "480");
  assert.equal(range.dataset.endTick, "2400");

  view.updatePlayback({ currentTick: 0, loop: { startTick: 0, endTick: 11520, enabled: true } });
  assert.equal(range.hidden, true, "full-song range does not fill the ruler");
});

test("app menghubungkan ruler Drum ke command canonical dan batas song canonical", () => {
  const app = readFileSync(resolve("src/app.js"), "utf8");
  assert.match(app, /onSeek\(tick\)\s*\{\s*run\(\(\) => commands\.seek\(tick\)\)/);
  assert.match(app, /onSetPlaybackRange\(startTick, endTick\)\s*\{\s*run\(\(\) => commands\.setLoop\(startTick, endTick\)/);
  assert.match(app, /drumGridView\.render\(song, state, canonicalSongEndTick\(song\)\)/);
  assert.match(app, /followMode: state\.view\.mode === "drums" \? followMode : "none",\s*songEndTick/);
});

function songWithHits(hits) {
  const song = songFixture();
  song.tracks.push({ id: "drums-main", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: hits });
  return song;
}

function drumCell(root, pieceId, tick) {
  return root.querySelectorAll('[data-entity="drum-cell"]')
    .find((cell) => cell.dataset.pieceId === pieceId && Number(cell.dataset.tick) === tick);
}

function click(element, modifiers = {}) {
  element.dispatchEvent({ type: "click", bubbles: true, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers });
}

test("Drum hit click selects one; Ctrl/Shift add and toggle; collisions remain cycle-selectable", () => {
  const selected = [];
  const song = songWithHits([
    { id: "kick-a", pieceId: "kick", startTick: 0, velocity: 100, articulation: "normal" },
    { id: "kick-b", pieceId: "kick", startTick: 5, velocity: 80, articulation: "ghost" },
    { id: "snare-a", pieceId: "snare", startTick: 480, velocity: 90, articulation: "normal" }
  ]);
  const { root, view } = drumViewFixture({ onSelectHits: (ids) => selected.push(ids) });
  view.render(song, { editor: { snap: "1/8", tool: "select" }, selectedPercussionHitIds: [] }, 11520);
  const kick = drumCell(root, "kick", 0);
  click(kick);
  assert.deepEqual(selected.at(-1), ["kick-a"]);
  assert.equal(kick.dataset.selected, "true");
  assert.equal(kick.getAttribute("aria-pressed"), "true");
  click(kick, { shiftKey: true });
  assert.deepEqual(selected.at(-1), ["kick-a", "kick-b"]);
  click(drumCell(root, "snare", 480), { ctrlKey: true });
  assert.deepEqual(new Set(selected.at(-1)), new Set(["kick-a", "kick-b", "snare-a"]));
  click(kick, { metaKey: true });
  assert.deepEqual(selected.at(-1), ["kick-b", "snare-a"]);
});

test("empty-body rectangle selects intersecting hits, supports additive selection, and cancel clears preview", () => {
  const selected = [];
  const song = songWithHits([
    { id: "kick-a", pieceId: "kick", startTick: 240, velocity: 100, articulation: "normal" },
    { id: "snare-a", pieceId: "snare", startTick: 480, velocity: 90, articulation: "normal" },
    { id: "ride-a", pieceId: "ride", startTick: 4800, velocity: 85, articulation: "normal" }
  ]);
  const { root, view } = drumViewFixture({ onSelectHits: (ids) => selected.push(ids) });
  view.render(song, { editor: { snap: "1/8", tool: "select" }, selectedPercussionHitIds: ["ride-a"] }, 11520);
  const empty = drumCell(root, "crash", 0);
  const start = empty.getBoundingClientRect();
  empty.dispatchEvent({ ...pointer("pointerdown", start.left + 2), clientY: start.top + 2 });
  root.dispatchEvent({ ...pointer("pointermove", 128 + 550), clientY: 70 + 8 * 30 + 22 });
  assert.equal(root.querySelector(".drum-selection-rect").hidden, false);
  root.dispatchEvent({ ...pointer("pointerup", 128 + 550), clientY: 70 + 8 * 30 + 22 });
  assert.deepEqual(new Set(selected.at(-1)), new Set(["kick-a", "snare-a"]));
  assert.equal(root.querySelector(".drum-selection-rect").hidden, true);

  view.render(song, { editor: { snap: "1/8", tool: "select" }, selectedPercussionHitIds: ["ride-a"] }, 11520);
  const additiveStart = drumCell(root, "crash", 0).getBoundingClientRect();
  drumCell(root, "crash", 0).dispatchEvent({ ...pointer("pointerdown", additiveStart.left + 2), clientY: additiveStart.top + 2, ctrlKey: true });
  root.dispatchEvent({ ...pointer("pointermove", 128 + 550), clientY: 70 + 8 * 30 + 22 });
  root.dispatchEvent({ ...pointer("pointerup", 128 + 550), clientY: 70 + 8 * 30 + 22 });
  assert.ok(selected.at(-1).includes("ride-a"));

  const beforeCancel = selected.length;
  const cancelStart = drumCell(root, "crash", 0).getBoundingClientRect();
  drumCell(root, "crash", 0).dispatchEvent({ ...pointer("pointerdown", cancelStart.left + 2), clientY: cancelStart.top + 2 });
  root.dispatchEvent({ ...pointer("pointermove", 128 + 550), clientY: 70 + 8 * 30 + 22 });
  root.dispatchEvent(pointer("pointercancel", 128 + 550));
  assert.equal(selected.length, beforeCancel);
  assert.equal(root.querySelector(".drum-selection-rect").hidden, true);
});

test("Draw mode adds from an empty body cell and never starts a rubber-band", () => {
  const added = [];
  const song = songWithHits([]);
  const { root, view } = drumViewFixture({ onAddHit: (hit) => { added.push(hit); return { trackId: "drums-main", hit: { ...hit, id: "new-hit" } }; } });
  view.render(song, { editor: { snap: "1/8", tool: "draw" }, selectedPercussionHitIds: [] }, 11520);
  const empty = drumCell(root, "kick", 240);
  const bounds = empty.getBoundingClientRect();
  empty.dispatchEvent({ ...pointer("pointerdown", bounds.left + 2), clientY: bounds.top + 2 });
  root.dispatchEvent({ ...pointer("pointermove", bounds.left + 40), clientY: bounds.top + 40 });
  root.dispatchEvent({ ...pointer("pointerup", bounds.left + 40), clientY: bounds.top + 40 });
  click(empty);
  assert.equal(added.length, 1);
  assert.deepEqual(added[0], { pieceId: "kick", startTick: 240, velocity: 100, articulation: "normal" });
  assert.equal(root.querySelector(".drum-selection-rect").hidden, true);
  assert.deepEqual(view.getSelectedHitIds(), ["new-hit"]);
});

test("keyboard intents cover select all, duplicate, delete, and Escape only inside Drum Roll", () => {
  assert.equal(drumKeyboardIntent({ key: "a", ctrlKey: true }, { withinDrumGrid: true }), "select-all");
  assert.equal(drumKeyboardIntent({ key: "a", metaKey: true }, { withinDrumGrid: true }), "select-all");
  assert.equal(drumKeyboardIntent({ key: "d", ctrlKey: true }, { withinDrumGrid: true, selectedHitCount: 2 }), "duplicate");
  assert.equal(drumKeyboardIntent({ key: "Delete" }, { withinDrumGrid: true, selectedHitCount: 1 }), "delete");
  assert.equal(drumKeyboardIntent({ key: "Backspace" }, { withinDrumGrid: true, selectedHitCount: 1 }), "delete");
  assert.equal(drumKeyboardIntent({ key: "Escape" }, { withinDrumGrid: true, selectedHitCount: 1 }), "clear");
  assert.equal(drumKeyboardIntent({ key: "d", ctrlKey: true }, { withinDrumGrid: true, selectedHitCount: 0 }), null);
  assert.equal(drumKeyboardIntent({ key: "Delete" }, { withinDrumGrid: false, selectedHitCount: 1 }), null);
  assert.equal(drumKeyboardIntent({ key: "d", ctrlKey: true, shiftKey: true }, { withinDrumGrid: true, selectedHitCount: 1 }), null);
});

test("Drum Roll shortcuts are scoped to its grid or selection actions, not mute/solo controls", () => {
  const targetFor = (...matches) => ({
    closest(selector) {
      return matches.some((match) => selector.split(", ").includes(match)) ? {} : null;
    }
  });
  assert.equal(isDrumKeyboardTarget(targetFor("#drum-grid-scroll")), true);
  assert.equal(isDrumKeyboardTarget(targetFor("#drums-selection-toolbar")), true);
  assert.equal(isDrumKeyboardTarget(targetFor("#drum-grid-scroll", ".instrument-mix-button")), false);
  assert.equal(isDrumKeyboardTarget(targetFor("#drum-grid-scroll", "input")), false);
  assert.equal(isDrumKeyboardTarget(targetFor("#drums-section")), false);
});

test("per-piece mix controls stay in frozen labels and expose accessible mute/solo/volume state", () => {
  const song = songWithHits([{ id: "kick", pieceId: "kick", startTick: 0, velocity: 100, articulation: "normal" }]);
  const mix = { channels: {
    melody: { mute: false, solo: false },
    "percussion:drums-main:kick": { mute: true, solo: false, volume: 0.72 }
  } };
  const { root, view } = drumViewFixture({ translate: (key, values = {}) => key === "mixMutePieceAria"
    ? `Toggle ${values.piece} mute`
    : key === "mixSoloPieceAria" ? `Toggle ${values.piece} solo`
    : key === "mixVolumeAria" ? `Volume ${values.piece}, ${values.percent}%` : key });
  view.render(song, { editor: { snap: "1/8", tool: "select" }, mix }, 11520);
  const kickLabel = root.querySelectorAll(".drum-row-label").find((label) => label.dataset.pieceId === "kick");
  const controls = kickLabel.children.filter((item) => item.dataset.mixFlag);
  assert.equal(controls.length, 2);
  assert.deepEqual(controls.map((button) => button.dataset.mixFlag), ["mute", "solo"]);
  assert.deepEqual(controls.map((button) => button.getAttribute("aria-pressed")), ["true", "false"]);
  assert.deepEqual(controls.map((button) => button.getAttribute("aria-label")), ["Toggle Kick mute", "Toggle Kick solo"]);
  const slider = kickLabel.children.find((item) => item.dataset.channelVolume);
  assert.equal(slider.type, "range");
  assert.equal(slider.min, "0");
  assert.equal(slider.max, "100");
  assert.equal(slider.step, "1");
  assert.equal(slider.value, "72");
  assert.equal(slider.dataset.channelId, "percussion:drums-main:kick");
  assert.equal(slider.getAttribute("aria-label"), "Volume Kick, 72%");
  assert.equal(slider.title, "Volume Kick, 72%");
  assert.equal(root.querySelectorAll(".drum-row-volume").length, 9);
  assert.ok(root.querySelectorAll(".drum-row-volume").filter((item) => item !== slider).every((item) => item.value === "100"));
});

test("drum volume pointer and click cannot create hits or rectangle selections", () => {
  const added = [];
  const { root, view } = drumViewFixture({ onAddHit: (hit) => added.push(hit) });
  view.render(songWithHits([]), { editor: { snap: "1/8", tool: "draw" } });
  const slider = root.querySelector(".drum-row-volume");
  slider.dispatchEvent(pointer("pointerdown", 50));
  slider.dispatchEvent(pointer("pointermove", 150));
  slider.dispatchEvent(pointer("pointerup", 150));
  slider.dispatchEvent({ type: "click", bubbles: true });
  assert.deepEqual(added, []);
  assert.deepEqual(view.getSelectedHitIds(), []);
  assert.equal(root.querySelector(".drum-selection-rect").hidden, true);
});

test("Drum Roll markup places the roll before Hit Expression and renders separate multi-selection summary", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  assert.ok(html.indexOf('id="drum-grid-scroll"') < html.indexOf('id="percussion-multi-selection"'));
  assert.ok(html.indexOf('id="percussion-multi-selection"') < html.indexOf('id="percussion-expression-form"'));
  const app = readFileSync(resolve("src/app.js"), "utf8");
  assert.match(app, /selectedIds\.length > 1/);
  assert.match(app, /percussion-multi-selection-summary/);
});
