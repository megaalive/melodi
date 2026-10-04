import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong } from "../src/core/model.js";
import { createGuitarTabGeometry, createGuitarTabView, projectGuitarTab } from "../src/ui/guitar-tab.js";

function defaultSong() {
  let next = 0;
  return createInitialSong(() => `guitar-tab-${++next}`);
}

test("TAB memproyeksikan fingering frase tanpa mengubah pitch canonical", () => {
  const song = defaultSong();
  const events = projectGuitarTab(song);
  assert.equal(events.length, song.notes.length);
  assert.deepEqual(
    events.slice(0, 3).map(({ string, fret }) => ({ string, fret })),
    [
      { string: 3, fret: 14 },
      { string: 2, fret: 15 },
      { string: 2, fret: 17 }
    ]
  );
  assert.deepEqual(events.map((event) => event.pitch), song.notes.map((note) => note.pitch));
  assert.deepEqual(events.map((event) => event.startTick), song.notes.map((note) => note.startTick));
});

test("TAB membawa bend dan vibrato dari canonical expression", () => {
  const events = projectGuitarTab(defaultSong());
  assert.equal(events[0].bend, "");
  assert.equal(events[1].vibratoDepth, 0.05);
  assert.equal(events[3].bend, "½↑");
  assert.equal(events[3].vibratoDepth, 0.05);
  assert.equal(events[10].bend, "1↑↓");
  assert.equal(events[20].bend, "1↑");
  assert.equal(events[20].vibratoDepth, 0.2);
});

test("geometry TAB mengikuti meter dan panjang canonical song", () => {
  const song = defaultSong();
  const geometry = createGuitarTabGeometry(song, 1000);
  assert.equal(geometry.beatTicks, 240);
  assert.equal(geometry.barTicks, 1440);
  assert.equal(geometry.endTick, 11520);
  assert.ok(geometry.width > 1000);
  assert.ok(geometry.width <= 12000);
  assert.ok(geometry.pixelsPerTick > 0);
});

test("TAB mengisi wadah lebar dan menjaga jarak beat minimum saat perlu scroll", () => {
  const song = defaultSong();
  const wide = createGuitarTabGeometry(song, 1600);
  const compact = createGuitarTabGeometry(song, 320);
  const shortSong = {
    ...song,
    notes: [{ ...song.notes[0], startTick: 0, durationTicks: 240 }]
  };

  assert.equal(wide.width, 1600);
  assert.ok(wide.pixelsPerTick * wide.beatTicks >= 28);
  assert.ok(compact.width > 320);
  assert.ok(compact.pixelsPerTick * compact.beatTicks >= 28);
  assert.equal(createGuitarTabGeometry(shortSong, 1000).width, 1000);
});

test("TAB yang dirender sebelum wadah dibuka mengikuti lebar saat sheet menjadi terlihat", () => {
  const previous = {
    document: globalThis.document,
    Element: globalThis.Element,
    ResizeObserver: globalThis.ResizeObserver
  };
  let observeResize;
  class FakeElement {
    constructor() { this.attributes = new Map(); this.children = []; this.dataset = {}; }
    addEventListener() {}
    append(...children) { this.children.push(...children); }
    contains() { return false; }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
  }
  globalThis.document = { activeElement: null, createElementNS: () => new FakeElement() };
  globalThis.Element = FakeElement;
  globalThis.ResizeObserver = class {
    constructor(callback) { observeResize = callback; }
    observe() {}
  };
  try {
    const source = defaultSong();
    const song = { ...source, notes: [{ ...source.notes[0], startTick: 0, durationTicks: 240 }] };
    const svg = new FakeElement();
    const scrollContainer = { clientWidth: 0 };
    const view = createGuitarTabView(svg, scrollContainer);
    view.render(song, { selectedNoteIds: [] });
    assert.equal(svg.getAttribute("width"), "760");

    scrollContainer.clientWidth = 1034;
    observeResize();
    assert.equal(svg.getAttribute("width"), "1034");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
