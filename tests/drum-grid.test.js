import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialSong } from "../src/core/model.js";
import { createDrumGridView, drumCellIntent, drumGridEndTick, nextDrumCellHit, projectDrumGrid } from "../src/ui/drum-grid.js";

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

class GridElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.dataset = {};
    this.children = [];
    this.attributes = new Map();
    this.style = { setProperty() {} };
    this.parentElement = null;
    this.textContent = "";
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

  addEventListener() {}
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  contains(item) { return item === this || this.walk().includes(item); }
  walk() { return this.children.flatMap((child) => [child, ...child.walk()]); }

  querySelectorAll(selector) {
    const currentMatch = /^\[data-current-step="([^"]+)"\]$/.exec(selector);
    const tickMatch = /\[data-tick="([^"]+)"\]/.exec(selector);
    const stepOnly = selector.startsWith(".drum-grid-step");
    return this.walk().filter((element) => {
      if (currentMatch) return element.dataset.currentStep === currentMatch[1];
      if (tickMatch && element.dataset.tick !== tickMatch[1]) return false;
      return !stepOnly || element.className.split(/\s+/).includes("drum-grid-step");
    });
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  getBoundingClientRect() {
    const scroll = this.parentElement;
    const rootLeft = -(scroll?.scrollLeft ?? 0);
    if (this.dataset.entity === "drum-grid") return { left: rootLeft, top: 40, width: 1568, height: 500 };
    if (this.className === "drum-grid-corner") return { left: 0, top: 40, width: 128, height: 30 };
    if (this.className === "drum-grid-step") {
      const tick = Number(this.dataset.tick);
      return { left: rootLeft + 128 + (tick / 240) * 30, top: 40, width: 30, height: 30 };
    }
    return { left: rootLeft, top: 40, width: 30, height: 30 };
  }
}

function drumViewFixture() {
  globalThis.document = { createElement: (tag) => new GridElement(tag) };
  const scroll = { clientWidth: 400, scrollWidth: 1568, scrollLeft: 0, scrollTop: 72 };
  const root = new GridElement("div");
  root.dataset.entity = "drum-grid";
  root.scrollWidth = 1568;
  root.parentElement = scroll;
  const view = createDrumGridView(root);
  view.render(songFixture(), { editor: { snap: "1/8", tool: "select" } });
  return { root, scroll, view };
}

test("Drum Grid memusatkan step di area setelah kolom label dan mempertahankan posisi vertikal", () => {
  const { root, scroll, view } = drumViewFixture();
  view.updatePlayback({ status: "playing", currentTick: 6000 }, { followMode: "center" });

  assert.equal(scroll.scrollLeft, 629);
  assert.equal(scroll.scrollTop, 72);
  assert.ok(root.querySelectorAll('[data-tick="6000"]').every((element) => element.dataset.currentStep === "true"));
});

test("Drum Grid custom range memakai nearest horizontal follow dan Follow mati tidak menggulir", () => {
  const { scroll, view } = drumViewFixture();
  view.updatePlayback({ status: "playing", currentTick: 6000 }, { followMode: "nearest" });
  assert.equal(scroll.scrollLeft, 508);
  assert.equal(scroll.scrollTop, 72);

  scroll.scrollLeft = 73;
  view.updatePlayback({ status: "playing", currentTick: 9000 }, { followMode: "none" });
  assert.equal(scroll.scrollLeft, 73);
  assert.equal(scroll.scrollTop, 72);
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
