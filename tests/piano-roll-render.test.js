import assert from "node:assert/strict";
import { test } from "node:test";
import { createPianoRollView, createRollGeometry, midiToY, tickToX } from "../src/ui/piano-roll.js";

// Piano Roll adalah file yang menyentuh DOM, jadi tidak bisa diimpor di Node tanpa
// stub. Stub ini cukup untuk exercise render(): yang diuji adalah apa yang digambar,
// bukan perilaku pointer.
class StubElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.textContent = "";
    this.parentElement = null;
    this.clientWidth = 900;
    this.clientHeight = 600;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.listeners = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  append(child) { child.parentElement = this; this.children.push(child); }
  replaceChildren() { this.children = []; }
  contains(node) { return node === this; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, event = {}) {
    const payload = {
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      target: this,
      ...event
    };
    for (const listener of this.listeners.get(type) ?? []) listener(payload);
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  querySelectorAll(selector) {
    const wanted = selector.replace(/^\[|\]$/g, "").split("=");
    return this.walk().filter((el) => wanted[1] && el.dataset[wanted[0]] === wanted[1]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest() { return null; }

  walk() {
    return this.children.flatMap((child) => [child, ...child.walk()]);
  }

  all() { return this.walk(); }

  byClass(name) {
    return this.all().filter((el) => String(el.getAttribute("class") ?? "").split(/\s+/).includes(name));
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";
globalThis.document = {
  createElementNS(_ns, tag) { return new StubElement(tag); }
};
globalThis.CSS = { escape: (value) => String(value) };

function setup({ tool = "select" } = {}) {
  const scroll = new StubElement("div");
  const svg = new StubElement("svg");
  scroll.append(svg);
  const added = [];
  const state = {
    playback: { status: "stopped", currentTick: 0, currentNoteId: null },
    editor: { snap: "1/8", tool, zoom: 1 },
    selectedNoteIds: [],
    generation: null
  };
  const commands = {
    getState: () => state,
    getSong: () => state.song,
    getSelectedNoteIds: () => state.selectedNoteIds,
    clearSelection: () => { state.selectedNoteIds = []; }
  };
  const view = createPianoRollView(svg, commands, { onAddNote: (input) => added.push(input) });
  return { svg, scroll, state, view, added };
}

const song = (notes) => ({
  timing: { ppq: 480, timeSignature: { numerator: 4, denominator: 4 } },
  notes,
  tempo: 120,
  key: "C major"
});

const note = (id, pitch, startTick = 0, durationTicks = 240) => ({ id, pitch, startTick, durationTicks });

/**
 * Generation state harus punya `status: "ready"`. Kalau tidak, normalizeRuntimeState
 * akan membuang seluruh kandidat jadi idle, dan test lulus kosong tanpa benar-benar
 * menguji apa pun.
 */
function setGeneration(state, candidates, activeCandidateId) {
  state.generation = {
    status: "ready",
    stale: false,
    gap: { startTick: 0, endTick: 960 },
    seed: 1,
    candidateIds: candidates.map((candidate) => candidate.id),
    activeCandidateId,
    auditionCandidateId: null,
    candidates,
    acceptedNoteIds: []
  };
}

/** Jumlah baris yang benar-benar digambar, dibaca dari tinggi SVG hasil render. */
function visibleRowCount(svg) {
  const height = Number(svg.getAttribute("height"));
  const geometry = createRollGeometry();
  return Math.round((height - geometry.top) / geometry.rowHeight);
}

test("label pitch digambar di setiap baris, bukan hanya baris C", () => {
  const { svg, view, state } = setup();
  view.render(song([note("n1", 60)]), state);

  const labels = svg.byClass("roll-pitch-label");
  const rowCount = visibleRowCount(svg);

  // Satu label per baris yang terlihat. Kalau ini masih hanya C, jumlahnya
  // akan jauh lebih kecil dari jumlah baris.
  assert.equal(labels.length, rowCount, `label=${labels.length} baris=${rowCount}`);

  const texts = labels.map((el) => el.textContent);
  assert.ok(texts.includes("C4"), "harus ada C4, acuan oktaf");
  assert.ok(texts.includes("A4"), "harus ada A4, bukan hanya C");
  assert.ok(texts.some((text) => text.startsWith("A#")), "black key juga harus berlabel");
});

test("label black key diberi kelas redup, white key tidak", () => {
  const { svg, view, state } = setup();
  view.render(song([note("n1", 60)]), state);

  const labels = svg.byClass("roll-pitch-label");
  const isBlack = (el) => String(el.getAttribute("class") ?? "").includes("roll-pitch-label-black");
  const black = labels.filter(isBlack);
  const white = labels.filter((el) => !isBlack(el));

  assert.ok(black.length > 0, "ada baris black key");
  assert.ok(white.length > 0, "ada baris white key");
  assert.ok(black.every((el) => el.textContent.includes("#")), "black key memakai notasi #");
  // C4 tidak boleh ikut diredupkan, itu acuan oktaf.
  const c4 = labels.find((el) => el.textContent === "C4");
  assert.ok(c4, "C4 ada");
  assert.ok(!isBlack(c4), "C4 bukan black key");
});

test("kandidat non-aktif digambar sebagai ghost yang tidak bisa diklik", () => {
  const { svg, view, state } = setup();
  setGeneration(state, [
    { id: "c1", notes: [note("a1", 64), note("a2", 67)] },
    { id: "c2", notes: [note("b1", 65), note("b2", 68)] },
    { id: "c3", notes: [note("d1", 67)] }
  ], "c2");
  view.render(song([note("n1", 60)]), state);

  const ghosts = svg.byClass("roll-candidate-ghost");
  // c1 punya 2 note, c3 punya 1 note. c2 aktif jadi tidak digambar sebagai ghost.
  assert.equal(ghosts.length, 3, `ghost=${ghosts.length}`);

  const ghostIds = new Set(ghosts.map((el) => el.dataset.candidateId));
  assert.ok(ghostIds.has("c1") && ghostIds.has("c3"), "ghost berasal dari kandidat non-aktif");
  assert.ok(!ghostIds.has("c2"), "kandidat aktif tidak boleh digambar dua kali");

  // Kelembutan harus ada di satu lapisan, bukan per rect. Kalau per rect, ghost
  // yang menumpuk di pitch yang sama akan saling menambah alpha sampai lebih
  // pekat dari kandidat aktif.
  const layer = ghosts[0].parentElement;
  assert.equal(layer.getAttribute("class"), "roll-candidate-ghost-layer", "semua ghost harus di satu lapisan");
  for (const ghost of ghosts) {
    assert.equal(ghost.parentElement, layer, "ghost tidak boleh tersebar di beberapa lapisan");
    assert.equal(ghost.getAttribute("fill-opacity"), null, "fill-opacity per rect akan terakumulasi");
  }
  assert.equal(layer.getAttribute("pointer-events"), "none", "lapisan tidak boleh menutupi note di atasnya");
  assert.equal(layer.getAttribute("aria-hidden"), "true", "ghost dekoratif, tidak perlu diumumkan");
});

test("kandidat aktif tetap interaktif seperti sebelumnya", () => {
  const { svg, view, state } = setup();
  setGeneration(state, [
    { id: "c1", notes: [note("a1", 64)] },
    { id: "c2", notes: [note("b1", 65), note("b2", 68)] }
  ], "c2");
  view.render(song([note("n1", 60)]), state);

  const active = svg.byClass("roll-candidate-note");
  assert.equal(active.length, 2, "kedua note kandidat aktif digambar penuh");
  for (const el of active) {
    assert.equal(el.getAttribute("pointer-events"), "all", "kandidat aktif harus bisa diklik");
  }

  const groups = svg.all().filter((el) => el.dataset.entity === "candidate-note");
  assert.equal(groups.length, 2);
  assert.ok(groups.every((el) => el.dataset.candidateId === "c2"));
  assert.ok(groups.every((el) => typeof el.getAttribute("aria-label") === "string"), "ada aria-label");
});

test("tanpa sesi generation tidak ada ghost sama sekali", () => {
  const { svg, view, state } = setup();
  view.render(song([note("n1", 60)]), state);
  assert.equal(svg.byClass("roll-candidate-ghost").length, 0);
  assert.equal(svg.byClass("roll-candidate-note").length, 0);
});

test("blank click is safe in Select and only Draw creates a note", () => {
  const select = setup({ tool: "select" });
  select.state.song = song([]);
  select.view.render(select.state.song, select.state);
  const selectGeometry = select.view.getGeometry();
  const selectX = tickToX(480, selectGeometry) * select.svg.clientWidth / selectGeometry.width;
  const selectY = (midiToY(60, selectGeometry) + selectGeometry.rowHeight / 2) * select.svg.clientHeight / selectGeometry.height;
  select.svg.dispatch("pointerdown", { clientX: selectX, clientY: selectY });
  select.svg.dispatch("pointerup", { clientX: selectX, clientY: selectY });
  select.svg.dispatch("click", { clientX: selectX, clientY: selectY });
  assert.equal(select.added.length, 0);

  const draw = setup({ tool: "draw" });
  draw.state.song = song([]);
  draw.view.render(draw.state.song, draw.state);
  const drawGeometry = draw.view.getGeometry();
  const drawX = tickToX(480, drawGeometry) * draw.svg.clientWidth / drawGeometry.width;
  const drawY = (midiToY(60, drawGeometry) + drawGeometry.rowHeight / 2) * draw.svg.clientHeight / drawGeometry.height;
  draw.svg.dispatch("pointerdown", { clientX: drawX, clientY: drawY });
  draw.svg.dispatch("pointerup", { clientX: drawX, clientY: drawY });
  draw.svg.dispatch("click", { clientX: drawX, clientY: drawY });
  assert.deepEqual(draw.added, [{ pitch: 60, startTick: 480, durationTicks: 240 }]);
});
