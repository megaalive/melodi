import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAppStyles } from './helpers/read-app-styles.js';
import { createStudioWorkspace, noteVolumeForVelocity, selectedNoteVelocity } from '../src/ui/studio.js';
import { createCommands } from '../src/core/commands.js';
import { createBlankSong } from '../src/core/model.js';

function fixture(narrow = false, landscape = false, wide = !narrow && !landscape, dockCapable = !narrow && !landscape) {
  const listeners = new Map();
  const nodes = new Map();
  const createdNodes = [];
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag;
      this.dataset = {};
      this.children = [];
      this.listeners = new Map();
      this.classList = { add() {} };
      this.attributes = new Map();
      this.style = { values: new Map(), setProperty(key, value) { this.values.set(key, value); }, removeProperty(key) { this.values.delete(key); } };
    }
    get parentElement() { return this.parent; }
    append(...children) {
      for (const child of children) {
        if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
        child.parent = this;
        this.children.push(child);
      }
    }
    prepend(...children) { this.append(...children); }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this);
      this.parent = null;
    }
    insertBefore(child) { this.append(child); }
    after() {}
    replaceChildren() { this.children = []; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    hasAttribute(key) { return this.attributes.has(key); }
    focus() { document.activeElement = this; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    querySelector(selector) {
      if (selector === 'summary' && this === nodes.get('.studio-more')) return nodes.get('.studio-more-summary');
      if (selector === '[data-copy]' && this === nodes.get('.studio-more-summary')) return nodes.get('.studio-more-summary-copy');
      return nodes.get(selector);
    }
    querySelectorAll(selector) {
      if (selector === '[data-studio-workspace]') return this.children.filter(child => child.dataset.studioWorkspace);
      if (selector === 'button[data-studio-panel]') return this.children.filter(child => child.dataset.studioPanel);
      if (selector === 'button[data-action]') return this.children.filter(child => child.dataset.action);
      if (selector === ':scope > [data-studio-view], :scope > .studio-more > summary') return this.children.filter(child => child.dataset.studioView);
      return [];
    }
    closest(selector) {
      if (selector === '.studio-panel-switches [role="tab"]') {
        return this.attributes.get('role') === 'tab' && this.parent === nodes.get('.studio-panel-switches') ? this : null;
      }
      for (let node = this; node; node = node.parent) {
        for (const part of selector.split(',').map(value => value.trim())) {
          const match = /^(button)?\[data-(studio-view|studio-panel|studio-panel-toggle|studio-close|studio-seek)\]$/.exec(part);
          if (!match || (match[1] && node.tagName !== match[1])) continue;
          const key = match[2].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          if (key in node.dataset) return node;
        }
      }
      return null;
    }
    removeAttribute(key) { this.attributes.delete(key); }
    getClientRects() { return this.hidden ? [] : [this]; }
    getBoundingClientRect() {
      const configuredWidth = Number.parseFloat(nodes.get('.workspace-grid')?.style.values.get('--studio-dock-width'));
      const width = this === nodes.get('.workspace-sidebar') ? configuredWidth || this.defaultWidth || 384 : 0;
      return { width, left: 0, right: width };
    }
    setPointerCapture() {}
    releasePointerCapture() {}
    click() { listeners.get('click')?.({ target: this }); }
  }
  const node = (selector, tag) => {
    const value = new Node(tag);
    nodes.set(selector, value);
    return value;
  };
  const media = matches => ({
    matches,
    listeners: [],
    addEventListener(_, listener) { this.listeners.push(listener); },
    change(value) { this.matches = value; this.listeners.forEach(listener => listener({ matches: value })); }
  });
  const body = node('body');
  for (const selector of ['.workspace-sidebar', '.studio-inspector-head', '.mobile-panel-peek-actions', '.studio-tools-content', '.follow-mode-tools-control', '.utility-card', '.workspace-sidebar-resizer', '.studio-more', '.studio-more-popover', '.studio-toolbar-actions', '.project-menu', '.project-menu-section', '.project-menu-popover', '.app-settings-section', '.expression-panel-heading', '.expression-toolbar', '.sketch-controls', '.instrument-mix-strip', '.brand-block', '.song-strip', '.history-buttons', '.header-actions', '.header-controls', '.page-header', '.workspace-chrome', '.app-shell', '.workspace-grid', '.transport-dock', '.transport-main', '.transport-buttons', '.playback-settings-group', '.transport-advanced-grid', '.tempo-control', '.loop-toggle', '.follow-mode-control', '.studio-panel-switches', '.studio-editor-settings', '.editor-tool-group', '.guitar-local-toolbar', '#guitar-section .guitar-local-toolbar', '.drums-pane-heading', '#drums-section .drums-toolbar', '.pane-title-row', '#lyrics-section .pane-heading', '.score-pane-heading', '.score-layout-group', '[data-sheet-close]', 'summary', 'summary [data-copy]', '[data-copy]']) node(selector);
  nodes.set('#workspace-sidebar-resizer', nodes.get('.workspace-sidebar-resizer'));
  for (const id of ['studio-mixer-channels', 'expression-collapse', 'harmony-panel', 'harmony-timeline-tools', 'studio-views', 'view-controls', 'mobile-workspace-dock', 'editor-toolbar', 'roll-selection', 'piano-roll-section', 'guitar-section', 'drums-section', 'score-section', 'studio-mixer', 'generation-panel', 'tools-panel', 'studio-panel-title', 'studio-overview', 'studio-position', 'reset-playback-range']) node(`#${id}`);
  nodes.set('.studio-overview', nodes.get('#studio-overview'));
  nodes.get('#piano-roll-section').hidden = false;
  nodes.get('#studio-mixer').hidden = true;
  nodes.get('#generation-panel').hidden = true;
  nodes.get('#tools-panel').hidden = true;
  nodes.get('.page-header').append(nodes.get('.brand-block'), nodes.get('.header-actions'));
  nodes.get('.workspace-chrome').append(nodes.get('.transport-dock'), nodes.get('#view-controls'));
  nodes.get('.transport-dock').append(nodes.get('.transport-main'));
  nodes.get('.transport-main').append(nodes.get('.transport-buttons'), nodes.get('.studio-overview'));
  nodes.get('.app-shell').append(nodes.get('.workspace-grid'));
  nodes.get('#drums-section').append(nodes.get('.drums-pane-heading'));
  nodes.get('.drums-pane-heading').append(nodes.get('#drums-section .drums-toolbar'));
  nodes.get('#score-section').append(nodes.get('.score-pane-heading'));
  nodes.get('.score-pane-heading').append(nodes.get('.score-layout-group'));
  nodes.get('.transport-advanced-grid').append(nodes.get('.follow-mode-control'));
  nodes.get('.playback-settings-group').append(nodes.get('.tempo-control'), nodes.get('.loop-toggle'), nodes.get('.transport-advanced-grid'), nodes.get('.history-buttons'));
  nodes.get('.workspace-grid').append(nodes.get('.workspace-sidebar-resizer'), nodes.get('.workspace-sidebar'));
  nodes.get('#tools-panel').append(nodes.get('.studio-tools-content'));
  nodes.get('#view-controls').append(nodes.get('#studio-views'), nodes.get('.studio-toolbar-actions'));
  const projectMenu = nodes.get('.project-menu');
  const projectPopover = nodes.get('.project-menu-popover');
  const projectSummary = nodes.get('summary');
  const moreSummary = node('.studio-more-summary', 'summary');
  const moreSummaryCopy = node('.studio-more-summary-copy', 'span');
  moreSummaryCopy.dataset.copy = 'transportAdvanced';
  moreSummary.append(moreSummaryCopy);
  nodes.get('[data-copy]').dataset.copy = 'appMenuLabel';
  projectSummary.append(nodes.get('[data-copy]'));
  projectMenu.dataset.ariaCopy = 'appMenuLabel';
  projectMenu.append(projectSummary, projectPopover);
  projectPopover.append(nodes.get('.project-menu-section'), nodes.get('.app-settings-section'), nodes.get('[data-sheet-close]'));
  nodes.get('.project-menu-section').append(...['new-song', 'show-examples', 'show-browser-library', 'save-browser-direct', 'show-save-browser', 'open-project-file', 'save-project-file', 'share-song'].map(action => {
    const button = new Node('button'); button.dataset.action = action; button.dataset.copy = action; return button;
  }));
  nodes.get('.app-settings-section').append(nodes.get('.header-controls'));
  nodes.get('.header-actions').append(projectMenu);
  nodes.get('.page-header').append(nodes.get('.brand-block'), nodes.get('.header-actions'));
  const guitar = node('[data-studio-view="guitar"]', 'button'); guitar.dataset.studioView = 'guitar'; guitar.dataset.entity = 'guitar-layer-toggle';
  nodes.set('#guitar-mode-toggle', guitar);
  const edit = node('workspace-edit', 'button'); edit.dataset.studioView = 'piano-roll'; edit.dataset.studioWorkspace = 'edit';
  const notation = node('workspace-notation', 'button'); notation.dataset.studioView = 'score'; notation.dataset.studioWorkspace = 'notation';
  const rhythm = node('workspace-rhythm', 'button'); rhythm.dataset.studioView = 'drums'; rhythm.dataset.studioWorkspace = 'rhythm';
  const lyrics = node('#score-section [data-studio-view="lyrics"]', 'button'); lyrics.dataset.studioView = 'lyrics';
  nodes.get('.pane-title-row').append(guitar);
  nodes.get('.studio-toolbar-actions').append(nodes.get('.studio-panel-switches'));
  nodes.get('.studio-more').append(moreSummary, nodes.get('.studio-more-popover'));
  nodes.get('.studio-toolbar-actions').append(nodes.get('.studio-more'));
  nodes.get('#studio-views').append(edit, notation, rhythm);
  nodes.get('.score-layout-group').append(lyrics);
  nodes.get('#piano-roll-section').append(nodes.get('.pane-title-row'));
  nodes.get('.pane-title-row').append(nodes.get('#editor-toolbar'), node('#guitar-layer-slot'));
  nodes.get('#editor-toolbar').append(nodes.get('.editor-tool-group'));
  nodes.get('#guitar-section').append(nodes.get('.guitar-local-toolbar'));
  const guitarTabScroll = node('#guitar-tab-scroll');
  const guitarFretboardScroll = node('#guitar-scroll');
  guitarTabScroll.hidden = false;
  guitarFretboardScroll.hidden = true;
  nodes.get('#guitar-section').append(guitarTabScroll, guitarFretboardScroll);
  nodes.get('#mobile-workspace-dock').hidden = false;
  const mixerTrigger = node('button[data-studio-panel="mixer"]', 'button'); mixerTrigger.dataset.studioPanel = 'mixer';
  const chordTrigger = node('button[data-studio-panel="chords"]', 'button'); chordTrigger.dataset.studioPanel = 'chords';
  const trigger = node('button[data-studio-panel="generate"]', 'button'); trigger.dataset.studioPanel = 'generate';
  const toolsTrigger = node('button[data-studio-panel="tools"]', 'button'); toolsTrigger.dataset.studioPanel = 'tools';
  nodes.get('.studio-panel-switches').append(mixerTrigger, chordTrigger, trigger, toolsTrigger);
  const closePopoverButton = node('[data-sheet-close]', 'button');
  nodes.get('.studio-more-popover').append(closePopoverButton);
  const sidebarClose = node('[data-studio-close]', 'button');
  sidebarClose.dataset.studioClose = '';
  sidebarClose.setAttribute('data-studio-close', '');
  nodes.get('.studio-inspector-head').append(nodes.get('#studio-panel-title'), nodes.get('.mobile-panel-peek-actions'), sidebarClose);
  nodes.get('.workspace-sidebar').append(nodes.get('.studio-inspector-head'), nodes.get('#tools-panel'), nodes.get('.utility-card'));
  const split = node('score-split', 'button'); split.dataset.studioView = 'combined';
  const child = node('panel-action', 'button');
  child.dataset.action = 'mark-selected-anchors';
  body.append(split, nodes.get('.app-shell'));
  nodes.get('.workspace-sidebar').append(child);
  const doc = {
    body,
    getElementById: id => nodes.get(`#${id}`),
    querySelector: selector => nodes.get(selector),
    querySelectorAll: selector => selector === 'button[data-studio-panel]' ? [mixerTrigger, chordTrigger, trigger, toolsTrigger] : selector === '[data-studio-panel]' ? [body, mixerTrigger, chordTrigger, trigger, toolsTrigger] : selector === '[data-studio-view]' ? [edit, notation, rhythm, guitar, split, lyrics] : [],
    createElement: tag => { const value = new Node(tag); createdNodes.push(value); return value; },
    createElementNS: (_, tag) => new Node(tag),
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  return {
    doc, nodes, createdNodes, trigger, child, split, guitar, mixerTrigger, chordTrigger, toolsTrigger,
    click: target => listeners.get('click')({ target }),
    keydown: (target, key) => {
      let prevented = false;
      listeners.get('keydown')({ target, key, defaultPrevented: false, preventDefault() { prevented = true; } });
      return prevented;
    },
    edit, notation, rhythm, lyrics,
    guitarTabScroll, guitarFretboardScroll,
  media: media(narrow), landscapeMedia: media(landscape),
    wideMedia: media(wide),
    dockMedia: media(dockCapable)
  };
}

const matchFixtureMedia = (setup, query) => query.includes('width >= 68rem')
  ? setup.wideMedia
  : query.includes('width >= 56rem') ? setup.dockMedia
    : query.startsWith('(orientation') ? setup.landscapeMedia : setup.media;

const isVisibleInTree = element => {
  for (let current = element; current; current = current.parent) if (current.hidden) return false;
  return true;
};

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
  assert.match(css, /\.studio \.mobile-workspace-dock:not\(\[hidden\]\)\s*\{[^}]*position: fixed/);
  assert.match(css, /\.studio \.mobile-workspace-dock > \.studio-views > button[^}]*min-height: 44px/);
  assert.match(css, /\.studio\[data-view-mode="combined"\] #score-section \{ display: none !important; \}/);
  assert.match(css, /\.studio \.workspace-sidebar\[data-sheet-size="half"\] \{ height: min\(55dvh, calc\(100dvh - 88px\)\)/);
  assert.match(css, /@media \(width >= 56rem\) and \(min-height: 501px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 8px var\(--studio-dock-width, clamp\(20rem, 24vw, 30rem\)\)/);
  assert.match(css, /\.workspace-sidebar-resizer:not\(\[hidden\]\):focus-visible/);
  assert.match(css, /\.workspace-sidebar \.studio-panel-switches button\[aria-selected="true"\]/);
  assert.doesNotMatch(css, /^\.studio #piano-roll-content\s*\{\s*position: relative;/m);
});

for (const narrow of [false, true]) test(`panel action clicks preserve context on ${narrow ? 'mobile' : 'desktop'}`, () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(narrow);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const note = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
    commands.selectNotes([note.id]);
    const before = commands.getSong();
    createStudioWorkspace(commands, key => key, error => { throw error; });
    setup.click(setup.trigger);
    if (narrow) assert.equal(setup.doc.activeElement, setup.trigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
    assert.equal(setup.trigger.attributes.get('aria-selected'), 'true');
    setup.click(setup.child);
    assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
    assert.equal(setup.nodes.get('#generation-panel').hidden, false);
    assert.deepEqual(commands.getSelectedNoteIds(), [note.id]);
    assert.deepEqual(commands.getSong(), before);
    if (narrow) {
      const panelButton = setup.nodes.get('#studio-views').children.find(node => 'studioPanelToggle' in node.dataset);
      setup.click(panelButton);
      assert.equal(setup.doc.body.dataset.studioPanel, 'none');
    } else {
      setup.click(setup.nodes.get('[data-studio-close]'));
      assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);
      assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
      const panelButton = setup.nodes.get('#studio-views').children.find(node => 'studioPanelToggle' in node.dataset);
      assert.equal(panelButton.hidden, false);
      setup.click(panelButton);
      assert.equal(setup.nodes.get('.workspace-sidebar').hidden, false);
      assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
    }
  } finally { Object.assign(globalThis, previous); }
});

test('transport overview is a single keyboard-operable seek slider', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture();
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
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
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
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

test('Guitar is a direct, reversible toggle in the Edit toolbar', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    setup.click(setup.guitar);
    workspace.render(commands.getSong(), commands.getState());
    assert.equal(commands.getState().view.mode, 'guitar');
    assert.equal(setup.doc.body.dataset.studioWorkspace, 'edit');
    assert.equal(setup.doc.body.dataset.studioPanel, 'guitar');
    assert.equal(setup.nodes.get('#piano-roll-section').hidden, false);
    assert.equal(setup.nodes.get('#guitar-section').hidden, false);
    assert.equal(setup.guitar.parent, setup.nodes.get('.pane-title-row'));
    assert.equal(setup.guitar.attributes.get('aria-pressed'), 'true');
    assert.equal(setup.guitar.dataset.entity, 'guitar-layer-toggle');
    const guitarSection = setup.nodes.get('#guitar-section');
    assert.equal(guitarSection.parent, setup.nodes.get('.workspace-sidebar'), 'phone Guitar content is a sheet body, not Alat content');
    assert.equal(setup.nodes.get('#tools-panel').hidden, true, 'the phone Guitar sheet does not expose Alat');
    assert.equal(setup.nodes.get('.studio-panel-switches').hidden, true, 'the Guitar sheet hides the unrelated Alat tab row');
    assert.equal(setup.guitarTabScroll.parent, guitarSection);
    assert.equal(setup.guitarTabScroll.hidden, false);
    assert.equal(isVisibleInTree(setup.guitarTabScroll), true, 'TAB is visible through every sheet ancestor');
    setup.click(setup.guitar);
    workspace.render(commands.getSong(), commands.getState());
    assert.equal(commands.getState().view.mode, 'piano-roll');
    assert.equal(setup.nodes.get('#guitar-section').hidden, true);
    assert.equal(setup.guitar.attributes.get('aria-pressed'), 'false');
  } finally { Object.assign(globalThis, previous); }
});

test('mobile Panel opens a four-tab sheet and restores focus to its dock trigger', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    createStudioWorkspace(commands, key => key, error => { throw error; });
    const panelButton = setup.nodes.get('#studio-views').children.find(node => 'studioPanelToggle' in node.dataset);
    assert.ok(panelButton);
    setup.click(panelButton);
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords');
    assert.equal(panelButton.attributes.get('aria-expanded'), 'true');
    assert.equal(setup.doc.activeElement, setup.chordTrigger);
    assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.mobile-panel-peek-actions'));
    assert.equal(setup.nodes.get('.studio-panel-switches').attributes.get('role'), 'tablist');
    assert.equal(setup.chordTrigger.attributes.get('aria-selected'), 'true');
    setup.keydown(setup.chordTrigger, 'ArrowRight');
    assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
    assert.equal(setup.doc.activeElement, setup.trigger);
    setup.keydown(setup.trigger, 'Escape');
    assert.equal(setup.doc.body.dataset.studioPanel, 'none');
    assert.equal(panelButton.attributes.get('aria-expanded'), 'false');
    assert.equal(setup.doc.activeElement, panelButton);
  } finally { Object.assign(globalThis, previous); }
});

test('mobile Guitar API mode shows its guitar payload without exposing the Alat panel', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    commands.setViewMode('guitar');
    workspace.render(commands.getSong(), commands.getState(), false);
    const guitarSection = setup.nodes.get('#guitar-section');
    assert.equal(commands.getState().view.mode, 'guitar', 'the public setViewMode contract is preserved');
    assert.equal(setup.doc.body.dataset.studioWorkspace, 'edit');
    assert.equal(guitarSection.parent, setup.nodes.get('.workspace-sidebar'));
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(isVisibleInTree(setup.guitarTabScroll) || isVisibleInTree(setup.guitarFretboardScroll), true);
    assert.equal(setup.nodes.get('#studio-panel-title').textContent, 'guitarHeading');
  } finally { Object.assign(globalThis, previous); }
});

test('responsive panel triggers and dock destinations cover desktop, medium, and short landscape layouts', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  for (const { narrow, landscape, wide, dockCapable } of [
    { narrow: false, landscape: false, wide: true, dockCapable: true },
    { narrow: false, landscape: false, wide: false, dockCapable: true },
    { narrow: true, landscape: false, wide: false, dockCapable: false },
    { narrow: true, landscape: true, wide: false, dockCapable: false },
    { narrow: false, landscape: true, wide: true, dockCapable: false },
  ]) {
    const setup = fixture(narrow, landscape, wide, dockCapable);
    globalThis.document = setup.doc;
    globalThis.matchMedia = query => matchFixtureMedia(setup, query);
    try {
      const commands = createCommands(createBlankSong());
      const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
      workspace.render(commands.getSong(), commands.getState(), false);
      if (wide && !landscape) {
        assert.equal(setup.nodes.get('#view-controls').hidden, false);
        assert.equal(setup.nodes.get('.studio-more').parent, setup.nodes.get('.playback-settings-group'));
        assert.equal(setup.nodes.get('.studio-more').hidden, true);
        assert.equal(setup.nodes.get('.project-menu').parent, setup.nodes.get('.header-actions'));
        assert.equal(setup.nodes.get('.header-controls').parent, setup.nodes.get('.header-actions'));
        assert.equal(setup.nodes.get('.header-actions').children.find(node => node.className === 'desktop-project-actions')?.parent, setup.nodes.get('.header-actions'));
        assert.equal(setup.nodes.get('.project-menu').querySelector('summary').querySelector('[data-copy]').dataset.copy, 'projectMoreLabel');
        assert.equal(setup.nodes.get('.transport-dock').parent, setup.nodes.get('.page-header'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.nodes.get('.playback-settings-group'));
        assert.equal(setup.nodes.get('.follow-mode-tools-control').hidden, false);
        assert.equal(setup.nodes.get('.loop-toggle').parent, setup.nodes.get('.studio-tools-content'));
        assert.equal(setup.nodes.get('#reset-playback-range').parent, setup.nodes.get('.studio-tools-content'));
        assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.mobile-panel-peek-actions'));
        assert.equal(setup.mixerTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.chordTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.nodes.get('.transport-advanced-grid').parent, setup.nodes.get('.studio-tools-content'));
        assert.equal(setup.nodes.get('#tools-panel').hidden, true);
        assert.equal(setup.nodes.get('.workspace-sidebar').hidden, false);
        assert.equal(setup.nodes.get('.workspace-sidebar-resizer').hidden, false);
        assert.equal(setup.doc.body.dataset.studioDockOpen, 'true');
        assert.equal(setup.nodes.get('#studio-views').parent, setup.nodes.get('.page-header'));
        assert.equal(setup.guitar.parent, setup.nodes.get('.pane-title-row'));
        assert.equal(setup.nodes.get('#studio-views').children.some(node => node.dataset.studioPanelToggle !== undefined && node.hidden), true);
      } else if (!narrow && !landscape) {
        assert.equal(setup.nodes.get('#view-controls').hidden, false);
        assert.equal(setup.nodes.get('.studio-more').parent, setup.nodes.get('.playback-settings-group'));
        assert.equal(setup.nodes.get('.studio-more').hidden, false);
        assert.equal(setup.nodes.get('.project-menu').parent, setup.nodes.get('.header-actions'));
        assert.equal(setup.nodes.get('.project-menu').querySelector('summary').querySelector('[data-copy]').dataset.copy, 'appMenuLabel');
        assert.equal(setup.nodes.get('.app-settings-section').hidden, false);
        assert.equal(setup.nodes.get('.header-controls').parent, setup.nodes.get('.app-settings-section'));
        assert.equal(setup.nodes.get('.header-actions').children.some(node => node.className === 'desktop-project-actions'), false);
        assert.equal(setup.nodes.get('.transport-dock').parent, setup.nodes.get('.page-header'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.nodes.get('.history-buttons').parent, setup.nodes.get('.playback-settings-group'));
        assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.mobile-panel-peek-actions'));
        assert.equal(setup.nodes.get('.studio-toolbar-actions').children.some(node => node.dataset.studioPanelToggle !== undefined && node.hidden), true);
        assert.equal(setup.nodes.get('.workspace-sidebar-resizer').hidden, false);
        assert.equal(setup.guitar.parent, setup.nodes.get('.pane-title-row'));
      } else if (landscape && wide) {
        const panelButton = setup.nodes.get('#studio-views').children.find(node => node.dataset.studioPanelToggle !== undefined);
        assert.ok(panelButton);
        assert.equal(panelButton.hidden, false);
        assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);
        assert.equal(setup.nodes.get('.workspace-sidebar-resizer').hidden, true);
      } else {
        assert.equal(setup.nodes.get('#view-controls').hidden, !landscape);
        assert.equal(setup.mixerTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.chordTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.mobile-panel-peek-actions'));
        assert.equal(setup.nodes.get('.studio-panel-switches').children.length, 4);
        assert.equal(setup.nodes.get('.transport-advanced-grid').parent, setup.nodes.get('.studio-tools-content'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.nodes.get('.project-menu').parent, landscape ? setup.nodes.get('.studio-toolbar-actions') : setup.nodes.get('.header-actions'));
        assert.equal(setup.nodes.get('.loop-toggle').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.nodes.get('.history-buttons').parent, setup.nodes.get('.transport-main'));
        assert.equal(setup.nodes.get('.transport-dock').parent, setup.nodes.get('#mobile-workspace-dock'));
        assert.equal(setup.nodes.get('#studio-views').parent, landscape ? setup.nodes.get('#view-controls') : setup.nodes.get('#mobile-workspace-dock'));
        assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.mobile-panel-peek-actions'));
        const panelButton = landscape
          ? setup.nodes.get('.transport-main').children.find(node => node.dataset.studioPanelToggle !== undefined)
          : setup.nodes.get('#studio-views').children.find(node => node.dataset.studioPanelToggle !== undefined);
        assert.ok(panelButton);
        assert.equal(panelButton.hidden, false);
        assert.equal(setup.guitar.parent, landscape ? setup.nodes.get('.studio-toolbar-actions') : setup.nodes.get('.pane-title-row'));
        assert.equal(setup.nodes.get('.studio-more').parent, setup.nodes.get('.playback-settings-group'));
      }
    } finally { Object.assign(globalThis, previous); }
  }
});

test('dock resizer controls existing named regions and keeps both Follow controls in the markup', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const resizer = html.match(/<div id="workspace-sidebar-resizer"[^>]*>/)?.[0];
  assert.ok(resizer);
  assert.match(resizer, /data-aria-copy="dockResizeLabel"/);
  const controlledIds = resizer.match(/aria-controls="([^"]+)"/)?.[1].split(/\s+/) ?? [];
  assert.deepEqual(controlledIds.sort(), ['workspace-canvas', 'workspace-sidebar']);
  for (const id of controlledIds) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="follow-mode"[^>]*data-action="set-follow-mode"/);
  assert.match(html, /id="follow-mode-tools"[^>]*data-action="set-follow-mode"/);
});

test('wide dock tabs stay open, expose their selected panels, and persist close/reopen state', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true);
  const changes = [];
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; }, {
      onDockPreferencesChange: patch => changes.push(patch)
    });
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioDockOpen, 'true');
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, false);
    assert.equal(setup.nodes.get('#studio-mixer').hidden, false);
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(setup.mixerTrigger.attributes.get('aria-selected'), 'true');
    assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.mobile-panel-peek-actions'));

    setup.click(setup.toolsTrigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'tools');
    assert.equal(setup.nodes.get('#tools-panel').hidden, false);
    assert.equal(setup.toolsTrigger.attributes.get('aria-selected'), 'true');
    setup.click(setup.toolsTrigger);
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, false, 'reselecting the active dock tab does not close the dock');

    setup.click(setup.nodes.get('[data-studio-close]'));
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);
    assert.equal(setup.doc.body.dataset.studioDockOpen, 'false');
    assert.equal(changes.at(-1).dockOpen, false);
    const panelButton = setup.nodes.get('#studio-views').children.find(node => 'studioPanelToggle' in node.dataset);
    assert.equal(panelButton.hidden, false);
    setup.click(panelButton);
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'tools');
    assert.equal(changes.at(-1).dockOpen, true);
  } finally { Object.assign(globalThis, previous); }
});

test('mobile setViewMode("guitar") opens a true Guitar sheet with TAB or Fretboard', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    commands.setViewMode('guitar');
    workspace.render(commands.getSong(), commands.getState(), false);
    const guitarSection = setup.nodes.get('#guitar-section');
    assert.equal(commands.getState().view.mode, 'guitar', 'the public view command remains accepted');
    assert.equal(setup.doc.body.dataset.studioWorkspace, 'edit');
    assert.equal(setup.doc.body.dataset.studioPanel, 'guitar');
    assert.equal(guitarSection.parent, setup.nodes.get('.workspace-sidebar'));
    assert.equal(guitarSection.hidden, false);
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(isVisibleInTree(setup.guitarTabScroll) || isVisibleInTree(setup.guitarFretboardScroll), true);
    assert.equal(setup.nodes.get('#studio-panel-title').textContent, 'guitarHeading');
  } finally { Object.assign(globalThis, previous); }
});

test('dock width restores, resizes by keyboard and pointer, clamps, and announces its value', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true);
  const changes = [];
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    createStudioWorkspace(commands, (key, values) => key === 'dockResizeValue' ? `Panel width ${values.width} pixels` : key, error => { throw error; }, {
      initialDockWidth: 448,
      initialDockOpen: false,
      onDockPreferencesChange: patch => changes.push(patch)
    });
    const grid = setup.nodes.get('.workspace-grid');
    const resizer = setup.nodes.get('.workspace-sidebar-resizer');
    assert.equal(grid.style.values.get('--studio-dock-width'), '448px');
    assert.equal(resizer.attributes.get('aria-valuenow'), '448');
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);
    const panelButton = setup.nodes.get('#studio-views').children.find(node => 'studioPanelToggle' in node.dataset);
    setup.click(panelButton);
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, false);

    const keydown = key => {
      let prevented = false;
      resizer.listeners.get('keydown')({ key, shiftKey: false, preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    };
    keydown('ArrowLeft');
    assert.equal(resizer.attributes.get('aria-valuenow'), '464');
    assert.equal(resizer.attributes.get('aria-valuetext'), 'Panel width 464 pixels');
    assert.equal(changes.at(-1).dockWidth, 464);
    keydown('End');
    assert.equal(resizer.attributes.get('aria-valuenow'), '480');
    keydown('ArrowRight');
    assert.equal(resizer.attributes.get('aria-valuenow'), '464');
    keydown('Home');
    assert.equal(resizer.attributes.get('aria-valuenow'), '320');

    resizer.listeners.get('pointerdown')({ button: 0, isPrimary: true, pointerId: 7, clientX: 100, preventDefault() {} });
    resizer.listeners.get('pointermove')({ pointerId: 7, clientX: 500 });
    assert.equal(resizer.attributes.get('aria-valuenow'), '320');
    resizer.listeners.get('pointerup')({ pointerId: 7 });
    assert.equal(changes.at(-1).dockWidth, 320);

    const persistedCount = changes.length;
    resizer.listeners.get('pointerdown')({ button: 0, isPrimary: true, pointerId: 8, clientX: 100, preventDefault() {} });
    resizer.listeners.get('pointermove')({ pointerId: 8, clientX: 50 });
    assert.equal(resizer.attributes.get('aria-valuenow'), '370');
    resizer.listeners.get('pointercancel')({ pointerId: 8 });
    assert.equal(resizer.attributes.get('aria-valuenow'), '320');
    assert.equal(changes.length, persistedCount, 'cancel restores the saved width without persisting the drag');
  } finally { Object.assign(globalThis, previous); }
});

test('a click or cancelled drag keeps the CSS default dock width unpersisted', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true);
  setup.nodes.get('.workspace-sidebar').defaultWidth = 320;
  const changes = [];
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    createStudioWorkspace(commands, key => key, error => { throw error; }, {
      onDockPreferencesChange: patch => changes.push(patch)
    });
    const grid = setup.nodes.get('.workspace-grid');
    const resizer = setup.nodes.get('.workspace-sidebar-resizer');
    resizer.listeners.get('pointerdown')({ button: 0, isPrimary: true, pointerId: 9, clientX: 100, preventDefault() {} });
    resizer.listeners.get('pointerup')({ pointerId: 9 });
    assert.equal(grid.style.values.has('--studio-dock-width'), false);
    assert.equal(changes.some(change => 'dockWidth' in change), false);
    assert.equal(resizer.attributes.get('aria-valuenow'), '320');

    resizer.listeners.get('pointerdown')({ button: 0, isPrimary: true, pointerId: 10, clientX: 100, preventDefault() {} });
    resizer.listeners.get('pointermove')({ pointerId: 10, clientX: 50 });
    assert.equal(grid.style.values.get('--studio-dock-width'), '370px');
    resizer.listeners.get('pointercancel')({ pointerId: 10 });
    assert.equal(grid.style.values.has('--studio-dock-width'), false);
    assert.equal(changes.some(change => 'dockWidth' in change), false);
  } finally { Object.assign(globalThis, previous); }
});

test('entering guitar mode opens Tools once and keeps later panel selections', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.mixerTrigger.attributes.get('aria-selected'), 'true');

    commands.setViewMode('guitar');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'tools');
    assert.equal(setup.toolsTrigger.attributes.get('aria-selected'), 'true');
    assert.equal(setup.nodes.get('#tools-panel').hidden, false);
    assert.equal(setup.nodes.get('#guitar-section').hidden, false);

    setup.click(setup.mixerTrigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'mixer');
    assert.equal(setup.mixerTrigger.attributes.get('aria-selected'), 'true');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'mixer');
    assert.equal(setup.mixerTrigger.attributes.get('aria-selected'), 'true');

    commands.setViewMode('piano-roll');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(setup.nodes.get('#guitar-section').hidden, true);

    commands.setViewMode('guitar');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'tools');
    assert.equal(setup.toolsTrigger.attributes.get('aria-selected'), 'true');
  } finally { Object.assign(globalThis, previous); }
});

for (const target of ['medium', 'short landscape']) test(`a closed desktop dock stays closed after switching to ${target}`, () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; }, { initialDockOpen: false });
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);

    if (target === 'medium') {
      setup.wideMedia.change(false);
      setup.dockMedia.change(false);
    } else {
      setup.landscapeMedia.change(true);
      setup.dockMedia.change(false);
    }
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);
    const trigger = setup.createdNodes.find(node => 'studioPanelToggle' in node.dataset);
    assert.ok(trigger);
    assert.equal(trigger.hidden, false);
    setup.click(trigger);
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'mixer');
  } finally { Object.assign(globalThis, previous); }
});

test('flat popovers close on Escape and outside click with focus returned to their triggers', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
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
    assert.equal(setup.doc.activeElement, setup.nodes.get('.studio-more-summary'));
  } finally { Object.assign(globalThis, previous); }
});

test('opening the Chord panel notifies the app after the drawer is rendered', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  const openedPanels = [];
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
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
    assert.equal(setup.doc.activeElement, setup.chordTrigger);
  } finally { Object.assign(globalThis, previous); }
});
