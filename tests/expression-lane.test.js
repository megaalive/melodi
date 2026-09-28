import test from "node:test";
import assert from "node:assert/strict";
import {
  bendLaneRange,
  createExpressionLaneView,
  expressionY,
  valueFromExpressionY
} from "../src/ui/expression-lane.js";
import { createRollGeometry } from "../src/ui/piano-roll.js";

class StubElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.textContent = "";
    this.scrollLeft = 0;
    this.clientWidth = 900;
    this.clientHeight = 126;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
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
  contains(node) {
    for (let current = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, event = {}) {
    const payload = {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 63,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      target: this,
      ...event
    };
    for (const listener of this.listeners.get(type) ?? []) listener(payload);
  }
  setPointerCapture() {}
  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: Number(this.getAttribute("width")) || this.clientWidth,
      height: Number(this.getAttribute("height")) || this.clientHeight
    };
  }
  walk() { return this.children.flatMap((child) => [child, ...child.walk()]); }
  querySelectorAll(selector) {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.walk().filter((el) => String(el.getAttribute("class") ?? "").split(/\s+/).includes(className));
    }
    const match = /^\[data-([a-z0-9-]+)="([^"]+)"\]$/.exec(selector);
    if (match) {
      const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return this.walk().filter((el) => el.dataset[key] === match[2]);
    }
    return [];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) {
    let current = this;
    while (current) {
      if (selector === '[data-entity="expression-note"]' && current.dataset.entity === "expression-note") return current;
      current = current.parentElement;
    }
    return null;
  }
}

globalThis.Element = StubElement;
globalThis.document = {
  createElementNS(_ns, tag) { return new StubElement(tag); }
};

function fixture() {
  const scroll = new StubElement("div");
  const peer = new StubElement("div");
  const svg = new StubElement("svg");
  scroll.append(svg);
  const changes = [];
  const selections = [];
  const edits = [];
  const interactions = [];
  const view = createExpressionLaneView(svg, scroll, peer, {
    onSelectNote: (...args) => selections.push(args),
    onChange: (...args) => changes.push(args),
    onEditBend: (id) => edits.push(id),
    onInteractionChange: (active) => interactions.push(active)
  });
  const song = {
    notes: [
      {
        id: "n1", pitch: 60, startTick: 0, durationTicks: 960,
        volume: 0.72, pan: -0.35,
        pitchBend: [{ position: 0, semitones: 0 }, { position: 0.5, semitones: 2 }, { position: 1, semitones: 0 }]
      },
      { id: "n2", pitch: 64, startTick: 960, durationTicks: 480, volume: 0.9, pan: 0.2 }
    ]
  };
  const state = {
    selectedNoteIds: ["n1", "n2"],
    playback: { currentNoteId: "n1" }
  };
  const geometry = createRollGeometry({
    endTick: 1920, focusTick: 0, ppq: 480,
    numerator: 4, denominator: 4, viewportWidth: 900
  });
  return { scroll, peer, svg, view, song, state, geometry, changes, selections, edits, interactions };
}

test("expression scale maps volume and pan in both directions", () => {
  assert.equal(expressionY("volume", 1), 20);
  assert.equal(expressionY("volume", 0), 106);
  assert.equal(valueFromExpressionY("volume", 63), 0.5);
  assert.equal(expressionY("pan", 0), 63);
  assert.equal(valueFromExpressionY("pan", 20), 1);
  assert.equal(valueFromExpressionY("pan", 106), -1);
});

test("bend lane range expands without clipping large canonical bends", () => {
  assert.equal(bendLaneRange([{ pitchBend: [{ semitones: 0 }, { semitones: 1 }] }]), 1);
  assert.equal(bendLaneRange([{ pitchBend: [{ semitones: 0 }, { semitones: 2 }] }]), 2);
  assert.equal(bendLaneRange([{ pitchBend: [{ semitones: -3 }, { semitones: 0 }] }]), 4);
  assert.equal(bendLaneRange([{ pitchBend: [{ semitones: 8 }, { semitones: 0 }] }]), 12);
});

test("lane renders bend, volume, and pan from the same piano-roll geometry", () => {
  const f = fixture();
  f.view.render(f.song, f.state, f.geometry);
  assert.equal(f.svg.dataset.mode, "bend");
  assert.equal(f.svg.querySelectorAll('[data-entity="expression-note"]').length, 2);
  assert.equal(f.svg.querySelectorAll(".expression-bend-curve").length, 2);

  f.view.setMode("volume");
  assert.ok(f.svg.querySelectorAll(".expression-value-label").some((el) => el.textContent === "72%"));

  f.view.setMode("pan");
  assert.ok(f.svg.querySelectorAll(".expression-value-label").some((el) => el.textContent === "L35"));
});

test("volume drag edits the whole current multi-selection in one callback", () => {
  const f = fixture();
  f.view.setMode("volume");
  f.view.render(f.song, f.state, f.geometry);
  const target = f.svg.querySelectorAll('[data-entity="expression-note"]')[0].querySelector(".expression-note-hit");

  f.svg.dispatch("pointerdown", { target, clientY: 63 });
  f.svg.dispatch("pointerup", { target, clientY: 63 });

  assert.deepEqual(f.interactions, [true, false]);
  assert.deepEqual(f.changes, [[["n1", "n2"], "volume", 0.5]]);
});

test("double-click bend selects the note and opens the detailed curve editor", () => {
  const f = fixture();
  f.state.selectedNoteIds = [];
  f.view.render(f.song, f.state, f.geometry);
  const target = f.svg.querySelectorAll('[data-entity="expression-note"]')[0].querySelector(".expression-note-hit");
  f.svg.dispatch("dblclick", { target });

  assert.deepEqual(f.selections, [["n1", false]]);
  assert.deepEqual(f.edits, ["n1"]);
});

test("expression labels stay frozen and horizontal scroll stays synchronized", () => {
  const f = fixture();
  f.view.render(f.song, f.state, f.geometry);
  const labels = f.svg.querySelector('[data-entity="expression-label-layer"]');
  assert.equal(labels.getAttribute("transform"), "translate(0 0)");

  f.peer.scrollLeft = 180;
  f.peer.dispatch("scroll");
  assert.equal(f.scroll.scrollLeft, 180);
  assert.equal(labels.getAttribute("transform"), "translate(180 0)");

  f.scroll.scrollLeft = 240;
  f.scroll.dispatch("scroll");
  assert.equal(f.peer.scrollLeft, 240);
});
