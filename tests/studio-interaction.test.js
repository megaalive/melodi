import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAppStyles } from './helpers/read-app-styles.js';
import { createStudioWorkspace, noteVolumeForVelocity, selectedNoteVelocity } from '../src/ui/studio.js';
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
  for (const selector of ['.workspace-sidebar', '.mobile-panel-peek-actions', '.studio-more', '.studio-more-popover', '.studio-toolbar-actions', '.project-menu', '.expression-panel-heading', '.expression-toolbar', '.sketch-controls', '.instrument-mix-strip', '.brand-block', '.song-strip', '.history-buttons', '.header-actions', '.header-controls', '.transport-main', '.playback-settings-group', '.transport-advanced', '.transport-advanced-grid', '.tempo-control', '.follow-mode-control', '.studio-panel-switches', '.studio-overview', '.editor-tool-group', '#piano-roll-section .pane-title-row', 'summary', 'summary [data-copy]', '[data-copy]']) node(selector);
  for (const id of ['studio-mixer-channels', 'expression-collapse', 'harmony-panel', 'harmony-timeline-tools', 'studio-views', 'view-controls', 'editor-toolbar', 'studio-mixer', 'generation-panel', 'studio-panel-title', 'studio-overview', 'studio-position']) node(`#${id}`);
  const guitar = node('[data-studio-view="guitar"]', 'button'); guitar.dataset.studioView = 'guitar';
  nodes.get('.studio-more-popover').append(guitar, nodes.get('.studio-panel-switches'));
  nodes.get('.studio-more').append(nodes.get('.studio-more-popover'));
  nodes.get('#studio-views').append(nodes.get('.studio-more'));
  nodes.get('.playback-settings-group').append(nodes.get('.transport-advanced'));
  nodes.get('.transport-advanced').append(nodes.get('.transport-advanced-grid'));
  const mixerTrigger = node('button[data-studio-panel="mixer"]', 'button'); mixerTrigger.dataset.studioPanel = 'mixer';
  const chordTrigger = node('button[data-studio-panel="chords"]', 'button'); chordTrigger.dataset.studioPanel = 'chords';
  const trigger = node('button[data-studio-panel="generate"]', 'button'); trigger.dataset.studioPanel = 'generate';
  nodes.get('.studio-panel-switches').append(mixerTrigger, chordTrigger, trigger);
  const split = node('score-split', 'button'); split.dataset.studioView = 'combined';
  const child = node('panel-action', 'button');
  node('[data-studio-close]', 'button');
  child.dataset.action = 'mark-selected-anchors';
  body.append(split, nodes.get('.workspace-sidebar'));
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
  return {
    doc, nodes, trigger, child, split, guitar, mixerTrigger, chordTrigger,
    click: target => listeners.get('click')({ target }),
    keydown: (target, key) => {
      let prevented = false;
      listeners.get('keydown')({ target, key, defaultPrevented: false, preventDefault() { prevented = true; } });
      return prevented;
    },
    media: { matches: narrow, addEventListener() {} }, landscapeMedia: { matches: landscape, addEventListener() {} }
  };
}

test('selected-note Velocity maps to the existing note volume field', () => {
  assert.equal(noteVolumeForVelocity(64), 64 / 127);
  assert.equal(noteVolumeForVelocity(0), 0);
  assert.equal(noteVolumeForVelocity(200), 1);
  assert.equal(selectedNoteVelocity([{ volume: 0.5 }, {}]), 95);
  assert.equal(selectedNoteVelocity([]), 127);
});

test('responsive roll positioning keeps compact canvases full-height and bounds the mobile sheet', () => {
  const css = readAppStyles();
  assert.match(css, /@media \(width >= 68rem\)\s*\{[\s\S]*?\.studio #piano-roll-content \{ position: relative; \}/);
  assert.match(css, /@media \(width <= 46rem\)\s*\{[\s\S]*?\.studio #piano-roll-content \{ position: absolute; inset: 0;/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 500px\) and \(width < 68rem\)\s*\{[\s\S]*?\.studio #piano-roll-content \{ position: absolute; inset: 0;/);
  assert.match(css, /@media \(width > 46rem\) and \(width < 68rem\)/);
  assert.match(css, /@media \(width >= 68rem\)/);
  assert.ok((css.match(/@media\b/g) ?? []).length < 20);
  assert.equal((css.match(/@media[^\n]*orientation/g) ?? []).length, 1);
  assert.match(css, /\.studio \.workspace-sidebar\[data-sheet-size="half"\]\s*\{\s*height: min\(39dvh, calc\(100dvh - 68px\)\)/);
  assert.doesNotMatch(css, /^\.studio #piano-roll-content\s*\{\s*position: relative;/m);
});

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
        assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.studio-toolbar-actions'));
        assert.equal(setup.mixerTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.chordTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.nodes.get('.transport-advanced').parent, setup.nodes.get('.playback-settings-group'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.guitar.parent, setup.nodes.get('#studio-views'));
      } else {
        assert.equal(setup.mixerTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.chordTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.nodes.get('.mobile-panel-peek-actions').children[0], setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.nodes.get('.studio-panel-switches').children.length, 3);
        assert.equal(setup.nodes.get('.transport-advanced').parent, setup.nodes.get('.playback-settings-group'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.nodes.get('.project-menu').parent, landscape ? setup.nodes.get('.playback-settings-group') : setup.nodes.get('.header-actions'));
        assert.equal(setup.guitar.parent, landscape ? setup.nodes.get('#studio-views') : setup.nodes.get('.studio-more-popover'));
        assert.equal(setup.nodes.get('.studio-more').parent, landscape ? setup.nodes.get('.studio-toolbar-actions') : setup.nodes.get('#studio-views'));
      }
    } finally { Object.assign(globalThis, previous); }
  }
});

test('flat popovers close on Escape and outside click with focus returned to their triggers', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => query.startsWith('(orientation') ? setup.landscapeMedia : setup.media;
  try {
    createStudioWorkspace(createCommands(createBlankSong()), key => key, error => { throw error; });
    const projectMenu = setup.nodes.get('.project-menu');
    projectMenu.open = true;
    setup.click(setup.split);
    assert.equal(projectMenu.open, false);
    assert.equal(setup.doc.activeElement, setup.nodes.get('summary'));

    const moreMenu = setup.nodes.get('.studio-more');
    moreMenu.open = true;
    assert.equal(setup.keydown(moreMenu, 'Escape'), true);
    assert.equal(moreMenu.open, false);
    assert.equal(setup.doc.activeElement, setup.nodes.get('summary'));
  } finally { Object.assign(globalThis, previous); }
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
