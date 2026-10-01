import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioWorkspace } from '../src/ui/studio.js';
import { createCommands } from '../src/core/commands.js';
import { createBlankSong } from '../src/core/model.js';

function fixture(narrow = false) {
  const listeners = new Map();
  const nodes = new Map();
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag;
      this.dataset = {};
      this.children = [];
      this.classList = { add() {} };
      this.attributes = new Map();
    }
    append(...children) {
      for (const child of children) {
        if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
        child.parent = this;
        this.children.push(child);
      }
    }
    prepend(...children) { this.append(...children); }
    insertBefore(child) { this.append(child); }
    after() {}
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    hasAttribute(key) { return this.attributes.has(key); }
    focus() { document.activeElement = this; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    querySelector(selector) { return nodes.get(selector); }
    querySelectorAll() { return []; }
    closest(selector) {
      for (let node = this; node; node = node.parent) {
        for (const part of selector.split(',').map(value => value.trim())) {
          const match = /^(button)?\[data-(studio-view|studio-panel|studio-close|studio-seek)\]$/.exec(part);
          if (!match || (match[1] && node.tagName !== match[1])) continue;
          const key = match[2].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          if (key in node.dataset) return node;
        }
      }
      return null;
    }
  }
  const node = (selector, tag) => {
    const value = new Node(tag);
    nodes.set(selector, value);
    return value;
  };
  const body = node('body');
  for (const selector of ['.workspace-sidebar', '.studio-settings', '.expression-panel-heading', '.expression-toolbar', '.sketch-controls', '.instrument-mix-strip', '.brand-block', '.song-strip', '.history-buttons', '.header-actions', '.header-controls', '.playback-settings-group', '.transport-advanced', '.transport-advanced-grid', '.tempo-control', '.follow-mode-control', '.studio-panel-switches', '.studio-overview', '.studio-settings-popover', 'summary', '[data-copy]']) node(selector);
  for (const id of ['studio-mixer-channels', 'expression-collapse', 'harmony-panel', 'harmony-timeline-tools', 'view-controls', 'studio-mixer', 'generation-panel', 'studio-panel-title', 'studio-overview', 'studio-position']) node(`#${id}`);
  const trigger = node('panel-trigger', 'button');
  trigger.dataset.studioPanel = 'generate';
  const child = node('panel-action', 'button');
  node('[data-studio-close]', 'button');
  child.dataset.action = 'mark-selected-anchors';
  body.append(trigger, nodes.get('.workspace-sidebar'));
  nodes.get('.workspace-sidebar').append(child);
  const doc = {
    body,
    getElementById: id => nodes.get(`#${id}`),
    querySelector: selector => nodes.get(selector),
    querySelectorAll: selector => selector === 'button[data-studio-panel]' ? [trigger] : selector === '[data-studio-panel]' ? [body, trigger] : [],
    createElement: tag => new Node(tag),
    createElementNS: (_, tag) => new Node(tag),
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  return { doc, nodes, trigger, child, click: target => listeners.get('click')({ target }), media: { matches: narrow, addEventListener() {} } };
}

for (const narrow of [false, true]) test(`panel action clicks preserve context on ${narrow ? 'mobile' : 'desktop'}`, () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(narrow);
  globalThis.document = setup.doc;
  globalThis.matchMedia = () => setup.media;
  try {
    const commands = createCommands(createBlankSong());
    const note = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
    commands.selectNotes([note.id]);
    const before = commands.getSong();
    createStudioWorkspace(commands, key => key, error => { throw error; });
    setup.click(setup.trigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
    setup.click(setup.child);
    assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
    assert.equal(setup.nodes.get('#generation-panel').hidden, false);
    assert.deepEqual(commands.getSelectedNoteIds(), [note.id]);
    assert.deepEqual(commands.getSong(), before);
    setup.click(setup.trigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'none');
  } finally { Object.assign(globalThis, previous); }
});
