import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioWorkspace } from '../src/ui/studio.js';
import { createCommands } from '../src/core/commands.js';
import { createBlankSong } from '../src/core/model.js';

function fixture(narrow = false, landscape = false) {
  const listeners = new Map();
  const nodes = new Map();
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag;
      this.dataset = {};
      this.children = [];
      this.listeners = new Map();
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
    addEventListener(type, listener) { this.listeners.set(type, listener); }
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
  for (const selector of ['.workspace-sidebar', '.mobile-panel-peek-actions', '.studio-settings', '.studio-menu', '.studio-menu-popover', '.studio-menu-actions', '.studio-more', '.studio-more-popover', '.studio-toolbar-actions', '.project-menu', '.expression-panel-heading', '.expression-toolbar', '.sketch-controls', '.instrument-mix-strip', '.brand-block', '.song-strip', '.history-buttons', '.header-actions', '.header-controls', '.transport-main', '.playback-settings-group', '.transport-advanced', '.transport-advanced-grid', '.tempo-control', '.follow-mode-control', '.studio-panel-switches', '.studio-overview', '.studio-settings-popover', '.studio-more-app-actions', '.editor-tool-group', '#piano-roll-section .pane-title-row', 'summary', 'summary [data-copy]', '[data-copy]']) node(selector);
  for (const id of ['studio-mixer-channels', 'expression-collapse', 'harmony-panel', 'harmony-timeline-tools', 'studio-views', 'view-controls', 'editor-toolbar', 'studio-mixer', 'generation-panel', 'studio-panel-title', 'studio-overview', 'studio-position']) node(`#${id}`);
  const guitar = node('[data-studio-view="guitar"]', 'button'); guitar.dataset.studioView = 'guitar';
  nodes.get('.studio-more-popover').append(guitar, nodes.get('.studio-panel-switches'));
  nodes.get('.studio-more').append(nodes.get('.studio-more-popover'));
  nodes.get('#studio-views').append(nodes.get('.studio-more'));
  const mixerTrigger = node('button[data-studio-panel="mixer"]', 'button'); mixerTrigger.dataset.studioPanel = 'mixer';
  const chordTrigger = node('button[data-studio-panel="chords"]', 'button'); chordTrigger.dataset.studioPanel = 'chords';
  const trigger = node('button[data-studio-panel="generate"]', 'button'); trigger.dataset.studioPanel = 'generate';
  const split = node('score-split', 'button'); split.dataset.studioView = 'combined';
  const child = node('panel-action', 'button');
  node('[data-studio-close]', 'button');
  child.dataset.action = 'mark-selected-anchors';
  body.append(trigger, split, nodes.get('.workspace-sidebar'));
  nodes.get('.workspace-sidebar').append(child);
  const doc = {
    body,
    getElementById: id => nodes.get(`#${id}`),
    querySelector: selector => nodes.get(selector),
    querySelectorAll: selector => selector === 'button[data-studio-panel]' ? [mixerTrigger, chordTrigger, trigger] : selector === '[data-studio-panel]' ? [body, mixerTrigger, chordTrigger, trigger] : selector === '[data-studio-view]' ? [guitar, split] : [],
    createElement: tag => new Node(tag),
    createElementNS: (_, tag) => new Node(tag),
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  return { doc, nodes, trigger, child, split, guitar, mixerTrigger, chordTrigger, click: target => listeners.get('click')({ target }), media: { matches: narrow, addEventListener() {} }, landscapeMedia: { matches: landscape, addEventListener() {} } };
}

for (const narrow of [false, true]) test(`panel action clicks preserve context on ${narrow ? 'mobile' : 'desktop'}`, () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(narrow);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => query.startsWith('(orientation') ? setup.landscapeMedia : setup.media;
  try {
    const commands = createCommands(createBlankSong());
    const note = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
    commands.selectNotes([note.id]);
    const before = commands.getSong();
    createStudioWorkspace(commands, key => key, error => { throw error; });
    setup.click(setup.trigger);
    assert.equal(setup.nodes.get('.studio-menu').open, !narrow);
    assert.equal(setup.doc.activeElement, setup.nodes.get('[data-studio-close]'));
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

test('transport overview is a single keyboard-operable seek slider', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture();
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => query.startsWith('(orientation') ? setup.landscapeMedia : setup.media;
  try {
    const commands = createCommands(createBlankSong());
    commands.addNote({ pitch: 60, startTick: 0, durationTicks: 960 });
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    workspace.render(commands.getSong(), commands.getState());
    const slider = setup.nodes.get('#studio-overview');
    assert.equal(slider.attributes.get('role'), 'slider');
    assert.equal(slider.children.length, 1, 'the minimap remains decorative inside the single slider');
    assert.equal(slider.children[0].tagName, 'svg');
    slider.listeners.get('keydown')({ key: 'ArrowRight', preventDefault() {} });
    assert.equal(commands.getState().playback.currentTick, 480);
  } finally { Object.assign(globalThis, previous); }
});

test('Score Split uses the existing view command without changing the song or selection', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => query.startsWith('(orientation') ? setup.landscapeMedia : setup.media;
  try {
    const commands = createCommands(createBlankSong());
    const note = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
    commands.selectNotes([note.id]);
    const song = commands.getSong();
    const selection = commands.getSelectedNoteIds();
    const availableActions = [...commands.getState().availableActions];
    createStudioWorkspace(commands, key => key, error => { throw error; });
    setup.click(setup.split);
    assert.equal(commands.getState().view.mode, 'combined');
    assert.deepEqual(commands.getSong(), song);
    assert.deepEqual(commands.getSelectedNoteIds(), selection);
    assert.deepEqual(commands.getState().availableActions, availableActions);
  } finally { Object.assign(globalThis, previous); }
});

test('compact Guitar mode remains visible on the closed More control', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => query.startsWith('(orientation') ? setup.landscapeMedia : setup.media;
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    setup.click(setup.guitar);
    workspace.render(commands.getSong(), commands.getState());
    assert.equal(commands.getState().view.mode, 'guitar');
    assert.equal(setup.nodes.get('summary').dataset.activeView, 'guitar');
    assert.equal(setup.nodes.get('[data-copy]').textContent, 'viewGuitarOption');
    assert.match(setup.nodes.get('summary').attributes.get('aria-label'), /studioMoreLabel/);
  } finally { Object.assign(globalThis, previous); }
});

test('responsive panel triggers keep desktop, portrait, and landscape destinations', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  for (const [narrow, landscape] of [[false, false], [true, false], [true, true]]) {
    const setup = fixture(narrow, landscape);
    globalThis.document = setup.doc;
    globalThis.matchMedia = query => query.startsWith('(orientation') ? setup.landscapeMedia : setup.media;
    try {
      const commands = createCommands(createBlankSong());
      createStudioWorkspace(commands, key => key, error => { throw error; });
      if (!narrow) {
        assert.equal(setup.nodes.get('.studio-more').parent, setup.nodes.get('.studio-toolbar-actions'));
        assert.equal(setup.nodes.get('.project-menu').parent, setup.nodes.get('.header-actions'));
        assert.equal(setup.mixerTrigger.parent, setup.nodes.get('.playback-settings-group'));
        assert.equal(setup.chordTrigger.parent, setup.nodes.get('.studio-toolbar-actions'));
        assert.equal(setup.nodes.get('.transport-advanced').parent, setup.nodes.get('.studio-more-popover'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.guitar.parent, setup.nodes.get('#studio-views'));
      } else {
        assert.equal(setup.mixerTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.chordTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.nodes.get('.mobile-panel-peek-actions').children.length, 1, 'one peek control keeps the mobile T0 budget at 14');
        assert.equal(setup.nodes.get('.transport-advanced').parent, setup.nodes.get('.studio-more-popover'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.nodes.get('.studio-menu').hidden, landscape);
        if (landscape) assert.equal(setup.nodes.get('.studio-menu-actions').parent.className, 'studio-more-app-actions');
        else assert.equal(setup.nodes.get('.studio-menu-actions').parent, setup.nodes.get('.studio-menu'));
        assert.equal(setup.nodes.get('.project-menu').parent, landscape ? setup.nodes.get('.playback-settings-group') : setup.nodes.get('.header-actions'));
        assert.equal(setup.guitar.parent, landscape ? setup.nodes.get('#studio-views') : setup.nodes.get('.studio-more-popover'));
        assert.equal(setup.nodes.get('.studio-more').parent, landscape ? setup.nodes.get('.studio-toolbar-actions') : setup.nodes.get('#studio-views'));
      }
    } finally { Object.assign(globalThis, previous); }
  }
});

test('opening the Chord panel notifies the app after the drawer is rendered', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  const openedPanels = [];
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => query.startsWith('(orientation') ? setup.landscapeMedia : setup.media;
  try {
    const commands = createCommands(createBlankSong());
    createStudioWorkspace(commands, key => key, error => { throw error; }, {
      onOpenPanel(panel) {
        openedPanels.push(panel);
        assert.equal(setup.doc.body.dataset.studioPanel, panel);
      }
    });

    setup.click(setup.chordTrigger);

    assert.deepEqual(openedPanels, ['chords']);
    assert.equal(setup.doc.activeElement, setup.nodes.get('[data-studio-close]'));
  } finally { Object.assign(globalThis, previous); }
});
