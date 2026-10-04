import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAppStyles } from './helpers/read-app-styles.js';
import { createStudioWorkspace, noteVolumeForVelocity, selectedNoteVelocity } from '../src/ui/studio.js';
import { createCommands } from '../src/core/commands.js';
import { createBlankSong } from '../src/core/model.js';

// Tombol Panel adalah satu-satunya kendali buka/tutup sidebar; tombol tutup
// kedua di dalam sidebar sudah dihapus.
function panelToggle(setup) {
  return setup.createdNodes.find(node => 'studioPanelToggle' in node.dataset);
}

function fixture(narrow = false, landscape = false, wide = !narrow && !landscape, dockCapable = !narrow && !landscape, dual = false, extraWide = dual, phoneNarrow = narrow) {
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
    prepend(...children) {
      for (const child of children) {
        if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
        child.parent = this;
      }
      this.children.unshift(...children);
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this);
      this.parent = null;
    }
    insertBefore(child, reference = null) {
      if (this.strictInsertions && reference && reference.parent !== this) {
        throw new DOMException('The reference node is not a child of this node.', 'NotFoundError');
      }
      if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
      const index = reference ? this.children.indexOf(reference) : -1;
      child.parent = this;
      if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    }
    after(...siblings) {
      if (!this.parent) return;
      const parent = this.parent;
      let index = parent.children.indexOf(this) + 1;
      for (const sibling of siblings) {
        if (sibling.parent) sibling.parent.children = sibling.parent.children.filter(item => item !== sibling);
        sibling.parent = parent;
        parent.children.splice(index++, 0, sibling);
      }
    }
    replaceChildren() { this.children = []; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    hasAttribute(key) { return this.attributes.has(key); }
    focus() { document.activeElement = this; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    querySelector(selector) {
      if (selector === 'form.loop-range' || selector === 'form[data-action="seek"]') {
        const form = nodes.get(selector);
        return form && this.contains(form) ? form : null;
      }
      if (selector === 'summary' && this === nodes.get('.studio-more')) return nodes.get('.studio-more-summary');
      if (selector === '[data-copy]' && this === nodes.get('.studio-more-summary')) return nodes.get('.studio-more-summary-copy');
      if (selector === '.guitar-layout-group button') return nodes.get('#guitar-layout-tab');
      return nodes.get(selector);
    }
    querySelectorAll(selector) {
      if (selector === '[data-studio-workspace]') return this.children.filter(child => child.dataset.studioWorkspace);
      if (selector === 'button[data-studio-panel]') return this.children.filter(child => child.dataset.studioPanel);
      if (selector === 'button[data-action]') return this.children.filter(child => child.dataset.action);
      if (selector === ':scope > button[data-action]') return this.children.filter(child => child.dataset.action);
      if (selector === ':scope > [data-studio-view], :scope > .studio-more > summary') return this.children.filter(child => child.dataset.studioView);
      return [];
    }
    closest(selector) {
      if (selector === '.studio-panel-switches [role="tab"]') {
        return this.attributes.get('role') === 'tab' && this.parent === nodes.get('.studio-panel-switches') ? this : null;
      }
      for (let node = this; node; node = node.parent) {
        for (const part of selector.split(',').map(value => value.trim())) {
          const match = /^(button)?\[data-(studio-view|studio-panel|studio-panel-toggle|studio-guitar-zone-toggle|studio-close|studio-seek)\]$/.exec(part);
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
  const compactMedia = media(narrow);
  const phoneMedia = phoneNarrow === narrow ? compactMedia : media(phoneNarrow);
  const body = node('body');
  for (const selector of ['.workspace-sidebar', '.studio-inspector-head', '.mobile-panel-peek-actions', '.studio-tools-content', '.follow-mode-tools-control', '.utility-card', '.workspace-sidebar-resizer', '.studio-more', '.studio-more-popover', '.studio-toolbar-actions', '.project-menu', '.project-menu-section', '.project-menu-popover', '.app-settings-section', '.expression-panel-heading', '.expression-toolbar', '.sketch-controls', '.instrument-mix-strip', '.brand-block', '.song-strip', '.history-buttons', '.header-actions', '.header-controls', '.page-header', '.workspace-chrome', '.app-shell', '.workspace-grid', '.transport-dock', '.transport-main', '.transport-buttons', '.playback-settings-group', '.transport-advanced-grid', '.tempo-control', '.loop-toggle', '.follow-mode-control', '.studio-panel-switches', '.studio-editor-settings', '.editor-tool-group', '.guitar-layout-group', '.guitar-zone-header', '.guitar-zone-info', '.drums-pane-heading', '#drums-section .drums-toolbar', '#studio-drum-expression', '#percussion-multi-selection', '#percussion-expression-form', '.pane-title-row', '#lyrics-section .pane-heading', '.score-pane-heading', '.score-layout-group', '[data-sheet-close]', 'summary', 'summary [data-copy]', '[data-copy]']) node(selector);
  nodes.set('#workspace-sidebar-resizer', nodes.get('.workspace-sidebar-resizer'));
  for (const id of ['studio-mixer-channels', 'expression-collapse', 'harmony-panel', 'harmony-timeline-tools', 'studio-views', 'view-controls', 'mobile-workspace-dock', 'editor-toolbar', 'roll-selection', 'piano-roll-section', 'guitar-section', 'drums-section', 'score-section', 'studio-mixer', 'generation-panel', 'generation-form', 'generation-anchor-actions', 'tools-panel', 'studio-panel-title', 'studio-overview', 'studio-position', 'reset-playback-range', 'workspace-canvas', 'guitar-heading']) node(`#${id}`);
  node('.generation-primary-actions');
  const generateButton = node('button[type="submit"]', 'button');
  nodes.get('.generation-primary-actions').append(generateButton);
  nodes.get('#generation-form').id = 'generation-form';
  nodes.set('.studio-overview', nodes.get('#studio-overview'));
  nodes.get('#piano-roll-section').hidden = false;
  nodes.get('#studio-mixer').hidden = true;
  nodes.get('#generation-panel').hidden = true;
  nodes.get('#tools-panel').hidden = true;
  nodes.get('#generation-panel').append(nodes.get('#generation-form'));
  nodes.get('#generation-form').append(nodes.get('#generation-anchor-actions'), nodes.get('.generation-primary-actions'));
  nodes.get('.page-header').append(nodes.get('.brand-block'), nodes.get('.header-actions'));
  nodes.get('.workspace-chrome').append(nodes.get('.transport-dock'), nodes.get('#view-controls'));
  nodes.get('.transport-dock').append(nodes.get('.transport-main'));
  nodes.get('.transport-main').append(nodes.get('.transport-buttons'), nodes.get('.studio-overview'));
  nodes.get('.app-shell').append(nodes.get('.workspace-grid'));
  nodes.get('#drums-section').append(nodes.get('.drums-pane-heading'));
  nodes.get('.drums-pane-heading').append(nodes.get('#drums-section .drums-toolbar'));
  nodes.get('#score-section').append(nodes.get('.score-pane-heading'));
  nodes.get('.score-pane-heading').append(nodes.get('.score-layout-group'));
  const seekForm = node('form[data-action="seek"]', 'form');
  seekForm.dataset.action = 'seek';
  const loopRangeForm = node('form.loop-range', 'form');
  loopRangeForm.dataset.action = 'set-loop';
  loopRangeForm.className = 'transport-form loop-range';
  nodes.get('.transport-advanced-grid').append(seekForm, loopRangeForm, nodes.get('.follow-mode-control'));
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
  // Struktur zona Gitar mengikuti index.html: header (judul, segmented, playhead,
  // lalu tombol Tutup dari studio.js), info (status + legenda), dan body diagram.
  const zoneHeader = node('.guitar-zone-header');
  zoneHeader.append(nodes.get('#guitar-heading'), nodes.get('.guitar-layout-group'), node('#guitar-playhead'));
  const zoneInfo = node('.guitar-zone-info');
  zoneInfo.append(node('#guitar-status'), node('#guitar-legend'));
  nodes.get('#guitar-section').className = 'guitar-zone-body';
  const guitarTabScroll = node('#guitar-tab-scroll');
  const guitarFretboardScroll = node('#guitar-scroll');
  guitarTabScroll.hidden = false;
  guitarFretboardScroll.hidden = true;
  nodes.get('#guitar-section').append(guitarTabScroll, guitarFretboardScroll);
  const guitarZoneNode = node('#studio-guitar-zone', 'section');
  guitarZoneNode.dataset.entity = 'guitar-zone';
  guitarZoneNode.append(zoneHeader, zoneInfo, nodes.get('#guitar-section'));
  nodes.get('.workspace-grid').append(nodes.get('#workspace-canvas'));
  nodes.get('#workspace-canvas').append(nodes.get('#piano-roll-section'), guitarZoneNode);
  nodes.get('#mobile-workspace-dock').hidden = false;
  const trigger = node('button[data-studio-panel="generate"]', 'button'); trigger.dataset.studioPanel = 'generate';
  const chordTrigger = node('button[data-studio-panel="chords"]', 'button'); chordTrigger.dataset.studioPanel = 'chords';
  const mixerTrigger = node('button[data-studio-panel="mixer"]', 'button'); mixerTrigger.dataset.studioPanel = 'mixer';
  const drumExpressionTrigger = node('button[data-studio-panel="drum-expression"]', 'button'); drumExpressionTrigger.dataset.studioPanel = 'drum-expression';
  const toolsTrigger = node('button[data-studio-panel="tools"]', 'button'); toolsTrigger.dataset.studioPanel = 'tools';
  nodes.get('.studio-panel-switches').append(trigger, chordTrigger, mixerTrigger, drumExpressionTrigger, toolsTrigger);
  const closePopoverButton = node('[data-sheet-close]', 'button');
  nodes.get('.studio-more-popover').append(closePopoverButton);
  nodes.get('.studio-inspector-head').append(nodes.get('#studio-panel-title'), nodes.get('.mobile-panel-peek-actions'));
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
    querySelectorAll: selector => selector === 'button[data-studio-panel]' ? [trigger, chordTrigger, mixerTrigger, drumExpressionTrigger, toolsTrigger] : selector === '[data-studio-panel]' ? [body, trigger, chordTrigger, mixerTrigger, drumExpressionTrigger, toolsTrigger] : selector === '[data-studio-view]' ? [edit, notation, rhythm, guitar, split, lyrics] : [],
    createElement: tag => { const value = new Node(tag); createdNodes.push(value); return value; },
    createElementNS: (_, tag) => new Node(tag),
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  return {
    doc, nodes, createdNodes, trigger, child, split, guitar, mixerTrigger, chordTrigger, drumExpressionTrigger, toolsTrigger,
    click: target => listeners.get('click')({ target }),
    keydown: (target, key) => {
      let prevented = false;
      listeners.get('keydown')({ target, key, defaultPrevented: false, preventDefault() { prevented = true; } });
      return prevented;
    },
    edit, notation, rhythm, lyrics,
    guitarTabScroll, guitarFretboardScroll,
    media: compactMedia, phoneMedia, landscapeMedia: media(landscape),
    wideMedia: media(wide),
    dockMedia: media(dockCapable),
    dualMedia: media(dual),
    extraWideMedia: media(extraWide)
  };
}

  const matchFixtureMedia = (setup, query) => query === '(width <= 46rem)'
  ? setup.phoneMedia
  : query.includes('min-height: 1000px')
  ? setup.dualMedia
  : query.includes('width >= 90rem') ? setup.extraWideMedia
  : query.includes('width >= 68rem') ? setup.wideMedia
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
  assert.match(css, /@media \(width < 68rem\)\s*\{[\s\S]*?\.studio #piano-roll-content \{ position: absolute; inset: 0;/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 500px\) and \(width < 68rem\)\s*\{[\s\S]*?\.studio \.workspace-canvas, \.studio #piano-roll-section \{ height: 100%; min-height: 0; overflow: hidden; \}/);
  assert.match(css, /@media \(width > 46rem\) and \(width < 68rem\)/);
  assert.match(css, /@media \(width >= 68rem\)/);
  // 21 -> 22: blok "Guitar zone" di studio.css memakai satu breakpoint sendiri
  // untuk dua baris header di HP. Postgres ini grown per breakpoint, bukan per
  // komponen, dan breakpoint ini bisa dihapus tanpa sisa aturan lain.
  assert.ok((css.match(/@media\b/g) ?? []).length <= 22);
  assert.equal((css.match(/@media[^\n]*orientation/g) ?? []).length, 2);
  assert.match(css, /\.studio \.mobile-workspace-dock:not\(\[hidden\]\)\s*\{[^}]*position: fixed/);
  assert.match(css, /\.studio \.mobile-workspace-dock > \.studio-views > button[^}]*min-height: 44px/);
  assert.match(css, /\.studio\[data-view-mode="combined"\] #score-section \{ display: none !important; \}/);
  assert.match(css, /\.studio \.workspace-sidebar\[data-sheet-size="half"\] \{ height: min\(45dvh, calc\(100dvh - 128px\)\)/);
  assert.match(css, /\.studio \.mobile-workspace-dock > \.studio-panel-switches:not\(\[hidden\]\) \{ display: flex; flex: 0 0 44px/);
  assert.match(css, /\.studio \.mobile-workspace-dock > \.studio-panel-switches > button\[aria-selected="true"\] \{ border-top-color: var\(--studio-accent\)/);
  assert.match(css, /@media \(width >= 56rem\) and \(min-height: 501px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 8px var\(--studio-dock-width, clamp\(20rem, 24vw, 30rem\)\)/);
  assert.match(css, /\.workspace-sidebar-resizer:not\(\[hidden\]\):focus-visible/);
  assert.match(css, /\.workspace-sidebar \.studio-panel-switches button\[aria-selected="true"\]/);
  // Aturan state memakai id yang sama dengan zonanya, kalau tidak min/max height
  // kalah spesifisitas dan zona bisa menyusut di bawah tinggi isinya.
  assert.match(css, /#studio-guitar-zone\[data-open="true"\]/);
  assert.match(css, /height:var\(--studio-guitar-zone-height,clamp\(280px,34dvh,440px\)\)/);
  // Selector lama (guitar-pane-heading, guitar-local-toolbar, guitar-status,
  // guitar-legend, guitar-playhead, guitar-heading-copy) dihapus: zona Gitar
  // kini satu blok "Guitar zone" di studio.css.
  assert.match(css, /#guitar-section\.guitar-zone-body\{[^}]*min-height:0;\s*overflow:hidden/);
  assert.match(css, /\.guitar-zone-body > div\{[^}]*overflow:auto/);
  for (const legacy of ['guitar-pane-heading', 'guitar-local-toolbar', 'guitar-heading-copy']) {
    assert.doesNotMatch(css, new RegExp(`\\.${legacy}[\\s{,:]`), `${legacy} tidak lagi punya aturan sendiri`);
  }
  const zoneBlock = css.slice(css.indexOf('/* Guitar zone:'), css.indexOf('/* Guitar zone:') + 4000)
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(zoneBlock, /!important/, 'blok zona Gitar tidak memakai !important');
  assert.doesNotMatch(css, /\.studio \.guitar-tab-scroll\s*\{\s*min-height:\s*290px/);
  assert.match(css, /\.studio-guitar-resizer:focus-visible/);
  // 44px hanya pada pointer coarse dan <= 46rem; desktop memakai --control-h. Aturan
  // touch global mengecualikan tombol segmented karena tinggi grupnya sudah
  // --control-h, jadi tombol di dalamnya boleh lebih pendek.
  assert.match(css, /@media \(pointer:coarse\)\{[\s\S]*?:not\(\.guitar-layout-group button\)\{/);
  assert.match(css, /:is\(\.guitar-mode-toggle,\.mobile-guitar-trigger\)\{[^}]*min-height:var\(--control-h\)/);
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
      const panelButton = panelToggle(setup);
      setup.click(panelButton);
      assert.equal(setup.doc.body.dataset.studioPanel, 'none');
    } else {
      const panelButton = panelToggle(setup);
      setup.click(panelButton);
      assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);
      assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
      assert.equal(panelButton.hidden, false, 'the Panel toggle never disappears');
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
    const guitarZone = guitarSection.parent;
    assert.equal(guitarZone.dataset.entity, 'guitar-zone');
    assert.equal(guitarZone.parent, setup.nodes.get('.workspace-sidebar'), 'phone Guitar content is a dedicated sheet, not Alat content');
    assert.equal(setup.nodes.get('#tools-panel').hidden, true, 'the phone Guitar sheet does not expose Alat');
    assert.equal(setup.nodes.get('.studio-panel-switches').hidden, true, 'the Guitar sheet hides the unrelated Alat tab row');
    assert.equal(setup.guitarTabScroll.parent, guitarSection);
    assert.equal(setup.guitarTabScroll.hidden, false);
    assert.equal(isVisibleInTree(setup.guitarTabScroll), true, 'TAB is visible through every sheet ancestor');
    setup.click(setup.guitar);
    workspace.render(commands.getSong(), commands.getState());
    assert.equal(commands.getState().view.mode, 'piano-roll');
    assert.equal(setup.nodes.get('#guitar-section').hidden, true);
    assert.equal(guitarZone.hidden, true);
    assert.equal(guitarZone.parent, setup.nodes.get('#workspace-canvas'));
    assert.equal(setup.guitar.attributes.get('aria-pressed'), 'false');
  } finally { Object.assign(globalThis, previous); }
});

test('mobile Panel opens the workspace tabs and restores focus to its dock trigger', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    createStudioWorkspace(commands, key => key, error => { throw error; });
    const panelButton = panelToggle(setup);
    assert.ok(panelButton);
    setup.click(panelButton);
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords');
    assert.equal(panelButton.attributes.get('aria-expanded'), 'true');
    assert.equal(setup.doc.activeElement, setup.chordTrigger);
    assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('#mobile-workspace-dock'));
    assert.equal(setup.nodes.get('.studio-panel-switches').attributes.get('role'), 'tablist');
    assert.equal(setup.chordTrigger.attributes.get('aria-selected'), 'true');
    assert.equal(setup.nodes.get('.studio-panel-switches').children.length, 5);
    setup.keydown(setup.chordTrigger, 'ArrowLeft');
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
    assert.equal(guitarSection.parent.dataset.entity, 'guitar-zone');
    assert.equal(guitarSection.parent.parent, setup.nodes.get('.workspace-sidebar'));
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
        assert.equal(setup.nodes.get('.project-menu').querySelector('summary').querySelector('[data-copy]').dataset.copy, 'projectActionsHeading');
        assert.equal(setup.nodes.get('.transport-dock').parent, setup.nodes.get('.page-header'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.createdNodes.find(node => node.id === 'studio-core-controls'));
        assert.equal(setup.nodes.get('.follow-mode-tools-control').hidden, true);
        assert.equal(setup.nodes.get('.loop-toggle').parent, setup.createdNodes.find(node => node.id === 'studio-core-controls'));
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
        assert.equal(setup.nodes.get('#studio-views').children.some(node => node.dataset.studioPanelToggle !== undefined && node.hidden), false,
          'the Panel toggle stays visible while the side dock is open');
        assert.equal(panelToggle(setup).attributes.get('aria-expanded'), 'true');
      } else if (!narrow && !landscape) {
        assert.equal(setup.nodes.get('#view-controls').hidden, false);
        assert.equal(setup.nodes.get('.studio-more').parent, setup.nodes.get('.studio-toolbar-actions'));
        assert.equal(setup.nodes.get('.studio-more').hidden, false);
        assert.equal(setup.nodes.get('.project-menu').parent, setup.nodes.get('.header-actions'));
        assert.equal(setup.nodes.get('.project-menu').querySelector('summary').querySelector('[data-copy]').dataset.copy, 'appMenuLabel');
        assert.equal(setup.nodes.get('.app-settings-section').hidden, false);
        assert.equal(setup.nodes.get('.header-controls').parent, setup.nodes.get('.app-settings-section'));
        assert.equal(setup.nodes.get('.header-actions').children.some(node => node.className === 'desktop-project-actions'), false);
        assert.equal(setup.nodes.get('.transport-dock').parent, setup.nodes.get('.page-header'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.createdNodes.find(node => node.id === 'studio-core-controls'));
        assert.equal(setup.nodes.get('.history-buttons').parent, setup.createdNodes.find(node => node.id === 'studio-core-controls'));
        assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.mobile-panel-peek-actions'));
        assert.equal(setup.nodes.get('.studio-toolbar-actions').children.some(node => node.dataset.studioPanelToggle !== undefined && node.hidden), false,
          'the Panel toggle in the medium toolbar stays visible');
        assert.equal(panelToggle(setup).attributes.get('aria-expanded'), 'true');
        assert.equal(setup.nodes.get('.workspace-sidebar-resizer').hidden, false);
        assert.equal(setup.nodes.get('.transport-advanced-grid').parent, setup.nodes.get('.studio-tools-content'));
        assert.equal(setup.nodes.get('.loop-toggle').parent, setup.createdNodes.find(node => node.id === 'studio-core-controls'));
        assert.equal(setup.guitar.parent, setup.nodes.get('.pane-title-row'));
      } else if (landscape && wide) {
        const panelButton = panelToggle(setup);
        assert.ok(panelButton);
        assert.equal(panelButton.hidden, false);
        assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);
        assert.equal(setup.nodes.get('.workspace-sidebar-resizer').hidden, true);
      } else {
        assert.equal(setup.nodes.get('#view-controls').hidden, !landscape);
        assert.equal(setup.mixerTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.chordTrigger.parent, setup.nodes.get('.studio-panel-switches'));
        assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('#mobile-workspace-dock'));
        assert.equal(setup.nodes.get('.studio-panel-switches').children.length, 5);
        assert.equal(setup.nodes.get('.transport-advanced-grid').parent, setup.nodes.get('.studio-tools-content'));
        assert.equal(setup.nodes.get('.follow-mode-control').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.nodes.get('.project-menu').parent, landscape ? setup.nodes.get('.studio-toolbar-actions') : setup.nodes.get('.header-actions'));
        assert.equal(setup.nodes.get('.loop-toggle').parent, setup.nodes.get('.transport-advanced-grid'));
        assert.equal(setup.nodes.get('.history-buttons').parent, setup.nodes.get('.transport-main'));
        assert.equal(setup.nodes.get('.transport-dock').parent, setup.nodes.get('#mobile-workspace-dock'));
        assert.equal(setup.nodes.get('#studio-views').parent, landscape ? setup.nodes.get('#view-controls') : setup.nodes.get('#mobile-workspace-dock'));
        assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('#mobile-workspace-dock'));
        const panelButton = panelToggle(setup);
        assert.ok(panelButton);
        assert.equal(panelButton.hidden, false);
        assert.equal(setup.guitar.parent, landscape ? setup.nodes.get('.studio-toolbar-actions') : setup.nodes.get('.pane-title-row'));
        assert.equal(setup.nodes.get('.studio-more').parent, setup.nodes.get('.playback-settings-group'));
      }
    } finally { Object.assign(globalThis, previous); }
  }
});

test('Project actions switch from four direct plus four menu actions to eight direct actions at 90rem', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  for (const { extraWide, directCount, menuCount, menuHidden } of [
    { extraWide: false, directCount: 4, menuCount: 4, menuHidden: false },
    { extraWide: true, directCount: 8, menuCount: 0, menuHidden: true },
  ]) {
    const setup = fixture(false, false, true, true, false, extraWide);
    globalThis.document = setup.doc;
    globalThis.matchMedia = query => matchFixtureMedia(setup, query);
    try {
      const commands = createCommands(createBlankSong());
      const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
      workspace.render(commands.getSong(), commands.getState(), false);
      const actionGroup = [...setup.nodes.get('.header-actions').children, ...setup.nodes.get('.studio-toolbar-actions').children]
        .find(node => node.className === 'desktop-project-actions');
      assert.equal(actionGroup.parent, extraWide ? setup.nodes.get('.studio-toolbar-actions') : setup.nodes.get('.header-actions'));
      const directActions = actionGroup.children.filter(node => node.dataset.action).map(node => node.dataset.action);
      const menuActions = setup.nodes.get('.project-menu-section').children.map(node => node.dataset.action);
      assert.equal(directActions.length, directCount);
      assert.equal(menuActions.length, menuCount);
      assert.equal(setup.nodes.get('.project-menu').hidden, menuHidden);
    } finally { Object.assign(globalThis, previous); }
  }
});

test('dock selection restores independently for Edit, Notation, and Rhythm workspaces', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; }, {
      initialDockPanelByWorkspace: { edit: 'chords', notation: 'mixer', rhythm: 'drum-expression' }
    });
    const renderMode = mode => {
      commands.setViewMode(mode);
      workspace.render(commands.getSong(), commands.getState(), false);
    };
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords');

    renderMode('score');
    assert.equal(setup.doc.body.dataset.studioPanel, 'mixer');
    setup.click(setup.toolsTrigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'tools');

    renderMode('piano-roll');
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords');
    renderMode('drums');
    assert.equal(setup.doc.body.dataset.studioPanel, 'drum-expression');
    assert.equal(setup.drumExpressionTrigger.attributes.get('aria-selected'), 'true');
    assert.equal(setup.nodes.get('#studio-drum-expression').hidden, false);

    renderMode('score');
    assert.equal(setup.doc.body.dataset.studioPanel, 'tools');
    renderMode('piano-roll');
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords');
  } finally { Object.assign(globalThis, previous); }
});

test('editor controls stay in the visible core strip after subsequent renders', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  for (const wide of [false, true]) {
    const setup = fixture(false, false, wide, true);
    globalThis.document = setup.doc;
    globalThis.matchMedia = query => matchFixtureMedia(setup, query);
    try {
      const commands = createCommands(createBlankSong());
      const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
      const coreControls = setup.createdNodes.find(node => node.id === 'studio-core-controls');
      workspace.render(commands.getSong(), commands.getState(), false);
      assert.equal(coreControls.hidden, false);
      assert.equal(setup.nodes.get('#editor-toolbar').parent, coreControls);
      commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
      workspace.render(commands.getSong(), commands.getState(), false);
      assert.equal(setup.nodes.get('#editor-toolbar').parent, coreControls);
    } finally { Object.assign(globalThis, previous); }
  }
});

test('Seek and Loop forms survive repeated desktop to phone and back arrangements', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true, true);
  const advancedBody = setup.nodes.get('.transport-advanced-grid');
  advancedBody.strictInsertions = true;
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const translate = key => key;
    const workspace = createStudioWorkspace(commands, translate, error => { throw error; });
    const coreControls = setup.createdNodes.find(node => node.id === 'studio-core-controls');
    const seekForm = setup.nodes.get('form[data-action="seek"]');
    const loopRangeForm = setup.nodes.get('form.loop-range');
    const loopSeekGroup = setup.createdNodes.find(node => node.className === 'studio-loop-seek-group');
    const setPhoneLayout = phone => {
      // MatchMedia changes together for a real viewport resize, before callbacks run.
      const changes = new Map([
        [setup.media, phone],
        [setup.phoneMedia, phone],
        [setup.wideMedia, !phone],
        [setup.dockMedia, !phone],
        [setup.extraWideMedia, !phone],
        [setup.dualMedia, !phone]
      ]);
      for (const [media, matches] of changes) media.matches = matches;
      for (const [media, matches] of changes) media.change(matches);
      workspace.render(commands.getSong(), commands.getState(), false);
    };
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(loopSeekGroup.parent, coreControls);
    assert.equal(seekForm.parent, loopSeekGroup);
    assert.equal(loopRangeForm.parent, loopSeekGroup);
    assert.equal(loopSeekGroup.attributes.get('aria-label'), `${translate('loopEnabledLabel')} / ${translate('seekButton')}`);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      assert.doesNotThrow(() => setPhoneLayout(true), `phone arrangement ${cycle + 1} must use a valid insertBefore reference`);
      assert.equal(coreControls.hidden, true);
      assert.equal(seekForm.parent, advancedBody);
      assert.equal(loopRangeForm.parent, advancedBody);
      assert.ok(advancedBody.children.indexOf(seekForm) < advancedBody.children.indexOf(loopRangeForm));
      setup.click(setup.toolsTrigger);
      assert.equal(isVisibleInTree(seekForm), true, 'Seek is available through the phone Alat sheet');
      assert.equal(isVisibleInTree(loopRangeForm), true, 'Loop is available through the phone Alat sheet');

      assert.doesNotThrow(() => setPhoneLayout(false), `desktop arrangement ${cycle + 1} must restore both forms`);
      assert.equal(coreControls.hidden, false);
      assert.equal(loopSeekGroup.parent, coreControls);
      assert.equal(seekForm.parent, loopSeekGroup);
      assert.equal(loopRangeForm.parent, loopSeekGroup);
      assert.equal(isVisibleInTree(seekForm), true);
      assert.equal(isVisibleInTree(loopRangeForm), true);
      assert.equal(loopSeekGroup.children.filter(node => node === seekForm).length, 1);
      assert.equal(loopSeekGroup.children.filter(node => node === loopRangeForm).length, 1);
    }
  } finally { Object.assign(globalThis, previous); }
});

test('wide dual dock keeps Generate and the relevant workspace panel visible together', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true, true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    const generateSlot = setup.createdNodes.find(node => node.dataset.slot === 'generate');
    const secondarySlot = setup.createdNodes.find(node => node.dataset.slot === 'secondary');
    const generateBody = generateSlot.children.find(node => node.className === 'studio-dock-slot-body');
    const secondaryBody = secondarySlot.children.find(node => node.className === 'studio-dock-slot-body');
    const panels = new Map([
      ['generate', setup.nodes.get('#generation-panel')],
      ['chords', setup.nodes.get('#harmony-panel')],
      ['mixer', setup.nodes.get('#studio-mixer')],
      ['drum-expression', setup.nodes.get('#studio-drum-expression')],
      ['tools', setup.nodes.get('#tools-panel')]
    ]);
    for (const [mode, selectedPanel] of [
      ['piano-roll', 'chords'], ['score', 'mixer'], ['drums', 'drum-expression'],
      ['score', 'mixer'], ['piano-roll', 'chords']
    ]) {
      commands.setViewMode(mode);
      workspace.render(commands.getSong(), commands.getState(), false);
      assert.equal(setup.doc.body.dataset.studioPanel, selectedPanel);
      assert.equal(isVisibleInTree(generateBody), true, `${mode} keeps the upper slot open`);
      assert.equal(isVisibleInTree(secondaryBody), true, `${mode} keeps the lower slot open`);
      assert.equal(panels.get('generate').parent, generateBody);
      assert.equal(panels.get(selectedPanel).parent, secondaryBody);
      assert.deepEqual([...panels].filter(([, panel]) => isVisibleInTree(panel)).map(([name]) => name),
        ['generate', selectedPanel], `${mode} exposes both panels through every dock ancestor`);
    }
    setup.click(setup.mixerTrigger);
    assert.deepEqual([...panels].filter(([, panel]) => isVisibleInTree(panel)).map(([name]) => name), ['generate', 'mixer']);
  } finally { Object.assign(globalThis, previous); }
});

test('dual dock pins Generate over the workspace panel and restores a saved Generate choice below 90rem', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true, false, true);
  const changes = [];
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; }, {
      initialDockSlots: { generate: true, secondary: true },
      initialDockVisibleCount: 2,
      initialDockPanelByWorkspace: { edit: 'generate', notation: 'mixer', rhythm: 'drum-expression' },
      onDockPreferencesChange: patch => changes.push(patch)
    });
    const generatePanel = setup.nodes.get('#generation-panel');
    workspace.render(commands.getSong(), commands.getState(), false);
    setup.dualMedia.change(true);

    const generateSlot = setup.createdNodes.find(node => node.dataset.slot === 'generate');
    const secondarySlot = setup.createdNodes.find(node => node.dataset.slot === 'secondary');
    const secondaryBody = secondarySlot.children.find(node => node.className === 'studio-dock-slot-body');
    const coreControls = setup.createdNodes.find(node => node.id === 'studio-core-controls');
    const generationQuickGroup = setup.createdNodes.find(node => node.className === 'studio-generation-quick-group');
    const generationAnchorActions = setup.nodes.get('#generation-anchor-actions');
    const generationPrimaryActions = setup.nodes.get('.generation-primary-actions');
    assert.equal(generatePanel.parent, generateSlot.children.find(node => node.className === 'studio-dock-slot-body'));
    assert.equal(generatePanel.hidden, false);
    assert.equal(generationQuickGroup.parent, coreControls);
    assert.equal(generationAnchorActions.parent, generationQuickGroup);
    assert.equal(generationPrimaryActions.parent, generationQuickGroup);
    assert.equal(setup.nodes.get('button[type="submit"]').attributes.get('form'), 'generation-form');
    assert.equal(coreControls.children.some(node => node.id === 'studio-core-mixer'), false);
    assert.equal(isVisibleInTree(generationAnchorActions), true);
    assert.equal(isVisibleInTree(generationPrimaryActions), true);
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords', 'Generate remains pinned while a valid lower panel is selected');
    assert.equal(setup.nodes.get('#harmony-panel').parent, secondaryBody);
    assert.equal(setup.nodes.get('#harmony-panel').hidden, false);
    assert.equal(setup.trigger.hidden, true, 'the pinned Generate slot replaces the tab destination');

    commands.setViewMode('drums');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(generatePanel.hidden, false, 'the pinned Generate slot stays available in Rhythm');
    assert.equal(generateSlot.hidden, false, 'Rhythm keeps both dock slots visible');
    assert.equal(isVisibleInTree(generationAnchorActions), true, 'Rhythm keeps the pinned Generate setup available');
    assert.equal(isVisibleInTree(generationPrimaryActions), true, 'Rhythm keeps the pinned Generate action available');
    assert.equal(setup.nodes.get('#studio-drum-expression').hidden, false, 'Rhythm opens its drum Expression panel');

    commands.setViewMode('score');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(generatePanel.hidden, false, 'the pinned Generate slot stays available in Notation');
    assert.equal(generateSlot.hidden, false, 'Notation keeps both dock slots visible');
    assert.equal(isVisibleInTree(generationAnchorActions), true);
    assert.equal(isVisibleInTree(generationPrimaryActions), true);
    assert.equal(setup.nodes.get('#studio-mixer').hidden, false, 'Notation keeps Mixer in the secondary slot');

    commands.setViewMode('piano-roll');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(generatePanel.hidden, false, 'Generate returns when Edit is active again');
    assert.equal(generateSlot.hidden, false, 'Edit restores the Generate slot');
    assert.equal(isVisibleInTree(generationAnchorActions), true, 'Edit keeps Generate anchor actions in the compact core group');
    assert.equal(isVisibleInTree(generationPrimaryActions), true, 'Edit keeps Generate primary action in the compact core group');

    const secondaryToggle = secondarySlot.children[0].children.find(node => 'dockSlotToggle' in node.dataset);
    secondaryToggle.listeners.get('click')();
    assert.equal(secondaryBody.hidden, true);
    assert.equal(generatePanel.hidden, false);
    assert.deepEqual(changes.at(-1), { dockSlots: { generate: true, secondary: false }, dockVisibleCount: 1 });

    setup.dualMedia.change(false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'generate');
    assert.equal(generatePanel.hidden, false);
    assert.equal(generatePanel.parent, setup.nodes.get('.workspace-sidebar'));
  } finally { Object.assign(globalThis, previous); }
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
    assert.equal(setup.nodes.get('#harmony-panel').hidden, false);
    assert.equal(setup.nodes.get('#studio-mixer').hidden, true);
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(setup.chordTrigger.attributes.get('aria-selected'), 'true');
    assert.equal(setup.nodes.get('.studio-panel-switches').parent, setup.nodes.get('.mobile-panel-peek-actions'));

    setup.click(setup.toolsTrigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'tools');
    assert.equal(setup.nodes.get('#tools-panel').hidden, false);
    assert.equal(setup.toolsTrigger.attributes.get('aria-selected'), 'true');
    setup.click(setup.toolsTrigger);
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, false, 'reselecting the active dock tab does not close the dock');

    setup.click(panelToggle(setup));
    assert.equal(setup.nodes.get('.workspace-sidebar').hidden, true);
    assert.equal(setup.doc.body.dataset.studioDockOpen, 'false');
    assert.equal(changes.at(-1).dockOpen, false);
    const panelButton = panelToggle(setup);
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
    assert.equal(guitarSection.parent.dataset.entity, 'guitar-zone');
    assert.equal(guitarSection.parent.parent, setup.nodes.get('.workspace-sidebar'));
    assert.equal(guitarSection.hidden, false);
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(isVisibleInTree(setup.guitarTabScroll) || isVisibleInTree(setup.guitarFretboardScroll), true);
    assert.equal(setup.nodes.get('#studio-panel-title').textContent, 'guitarHeading');
  } finally { Object.assign(globalThis, previous); }
});

test('mobile has a one-tap Guitar opener separate from the Alat panel tabs', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    createStudioWorkspace(commands, key => key, error => { throw error; });
    const trigger = setup.createdNodes.find(node => node.dataset.entity === 'guitar-sheet-trigger');
    assert.ok(trigger);
    assert.equal(trigger.parent, setup.nodes.get('.header-actions'));
    assert.equal(trigger.dataset.studioPanel, 'guitar');
    setup.click(trigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'guitar');
    assert.equal(setup.nodes.get('#guitar-section').parent.parent, setup.nodes.get('.workspace-sidebar'));
    assert.equal(setup.guitarTabScroll.hidden, false);
    assert.equal(setup.guitarTabScroll.parent.hidden, false);
    assert.equal(isVisibleInTree(setup.guitarTabScroll), true);
    assert.equal(setup.nodes.get('.studio-panel-switches').hidden, true);
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(trigger.attributes.get('aria-pressed'), 'true');
    setup.click(panelToggle(setup));
    assert.equal(commands.getState().view.mode, 'piano-roll');
    assert.equal(setup.doc.body.dataset.studioPanel, 'none');
    assert.equal(trigger.attributes.get('aria-pressed'), 'false');
    assert.equal(setup.doc.activeElement, trigger);
  } finally { Object.assign(globalThis, previous); }
});

test('opening the phone Guitar sheet from Not preserves the workspace and selected Alat tab', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    workspace.render(commands.getSong(), commands.getState(), false);
    commands.setViewMode('score');
    workspace.render(commands.getSong(), commands.getState(), false);
    setup.click(setup.mixerTrigger);
    assert.equal(setup.mixerTrigger.attributes.get('aria-selected'), 'true');

    const trigger = setup.createdNodes.find(node => node.dataset.entity === 'guitar-sheet-trigger');
    setup.click(trigger);

    assert.equal(commands.getState().view.mode, 'score', 'the Guitar sheet does not issue the public Guitar view command');
    assert.equal(setup.doc.body.dataset.studioWorkspace, 'notation');
    assert.equal(setup.doc.body.dataset.studioPanel, 'guitar');
    assert.equal(setup.nodes.get('.studio-panel-switches').hidden, true);
    assert.equal(setup.nodes.get('#guitar-section').parent.parent, setup.nodes.get('.workspace-sidebar'));
    assert.equal(isVisibleInTree(setup.guitarTabScroll), true);

    setup.click(panelToggle(setup));
    const panelButton = panelToggle(setup);
    setup.click(panelButton);
    assert.equal(commands.getState().view.mode, 'score');
    assert.equal(setup.doc.body.dataset.studioWorkspace, 'notation');
    assert.equal(setup.doc.body.dataset.studioPanel, 'mixer', 'the saved Notation tab reopens after closing the Guitar sheet');
    assert.equal(setup.mixerTrigger.attributes.get('aria-selected'), 'true');
  } finally { Object.assign(globalThis, previous); }
});

for (const route of ['sheet opener', 'toolbar toggle', 'public Guitar command']) test(`compact short landscape routes the ${route} to a true Guitar sheet`, () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true, true, false, false, false, false, false);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    assert.equal(setup.media.matches, true, 'short landscape uses the compact layout');
    assert.equal(setup.phoneMedia.matches, false, 'landscape can be wider than the phone breakpoint');
    const commands = createCommands(createBlankSong());
    const note = commands.addNote({ pitch: 60, startTick: 0, durationTicks: 480 });
    commands.selectNotes([note.id]);
    const initialMode = route === 'sheet opener' ? 'score' : 'piano-roll';
    commands.setViewMode(initialMode);
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    workspace.render(commands.getSong(), commands.getState(), false);
    const song = commands.getSong();
    const opener = setup.createdNodes.find(node => node.dataset.entity === 'guitar-sheet-trigger');
    if (route === 'sheet opener') setup.click(opener);
    else if (route === 'toolbar toggle') setup.click(setup.guitar);
    else commands.setViewMode('guitar');
    workspace.render(commands.getSong(), commands.getState(), false);

    const zone = setup.nodes.get('#guitar-section').parent;
    assert.equal(commands.getState().view.mode, route === 'sheet opener' ? 'score' : 'guitar');
    assert.equal(setup.doc.body.dataset.studioPanel, 'guitar');
    assert.equal(zone.parent, setup.nodes.get('.workspace-sidebar'));
    assert.equal(zone.dataset.open, 'true');
    assert.equal(isVisibleInTree(setup.guitarTabScroll) || isVisibleInTree(setup.guitarFretboardScroll), true);
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(setup.nodes.get('.studio-panel-switches').hidden, true);
    assert.equal(setup.nodes.get('#studio-panel-title').textContent, 'guitarHeading');
    assert.equal(opener.attributes.get('aria-pressed'), 'true');
    assert.deepEqual(commands.getSong(), song);
    assert.deepEqual(commands.getSelectedNoteIds(), [note.id]);

    setup.click(panelToggle(setup));
    assert.equal(setup.doc.body.dataset.studioPanel, 'none');
    assert.equal(commands.getState().view.mode, initialMode);
    assert.equal(zone.dataset.open, 'false');
    assert.equal(isVisibleInTree(setup.guitarTabScroll), false);
    assert.equal(opener.attributes.get('aria-pressed'), 'false');
    assert.equal(setup.doc.activeElement, opener);
  } finally { Object.assign(globalThis, previous); }
});

test('large desktop Guitar zone defaults open, can be resized by keyboard and pointer, and stays out of the dock', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia, window: globalThis.window };
  const setup = fixture(false, false, true, true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  globalThis.window = { innerHeight: 900, matchMedia: query => ({ matches: query === '(width >= 90rem)' }) };
  const preferencePatches = [];
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, (key, values) => values?.height ? `height ${values.height}` : key, error => { throw error; }, {
      onGuitarZonePreferencesChange: patch => preferencePatches.push(patch)
    });
    workspace.render(commands.getSong(), commands.getState(), false);
    const guitarSection = setup.nodes.get('#guitar-section');
    const zone = guitarSection.parent;
    const toggle = setup.createdNodes.find(node => node.dataset.entity === 'guitar-zone-toggle');
    const resizer = setup.createdNodes.find(node => node.dataset.entity === 'guitar-zone-resizer');
    assert.equal(zone.dataset.open, 'true');
    assert.equal(zone.parent, setup.nodes.get('#workspace-canvas'));
    assert.equal(guitarSection.hidden, false);
    assert.equal(toggle.attributes.get('aria-pressed'), 'true');
    assert.equal(resizer.attributes.get('aria-label'), 'guitarZoneResizeLabel');
    assert.equal(resizer.attributes.get('aria-valuemin'), '280');
    assert.equal(resizer.attributes.get('aria-valuemax'), '440');
    // Status dan legenda kini satu baris info di bawah header, bukan lagi di dalam
  // toolbar lokal: itulah struktur zona Gitar yang baru.
  assert.equal(setup.nodes.get('#guitar-status').parent, setup.nodes.get('.guitar-zone-info'));
  assert.equal(setup.nodes.get('#guitar-legend').parent, setup.nodes.get('.guitar-zone-info'));
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords');
    toggle.click();
    assert.equal(zone.dataset.open, 'false');
    assert.equal(toggle.attributes.get('aria-pressed'), 'false');
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords', 'the Guitar zone does not change the dock selection');
    assert.deepEqual(preferencePatches.at(-1), { guitarZoneOpen: false });
    toggle.click();
    const before = Number(resizer.attributes.get('aria-valuenow'));
    let prevented = false;
    resizer.listeners.get('keydown')({ key: 'ArrowUp', shiftKey: false, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(Number(resizer.attributes.get('aria-valuenow')), before + 16);
    assert.deepEqual(preferencePatches.at(-1), { guitarZoneHeight: before + 16 });
    resizer.listeners.get('pointerdown')({ button: 0, isPrimary: true, pointerId: 11, clientY: 300, preventDefault() {} });
    resizer.listeners.get('pointermove')({ pointerId: 11, clientY: 270 });
    resizer.listeners.get('pointerup')({ pointerId: 11 });
    assert.equal(Number(resizer.attributes.get('aria-valuenow')), before + 46);
    assert.deepEqual(preferencePatches.at(-1), { guitarZoneHeight: before + 46 });
    commands.setViewMode('score');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioWorkspace, 'notation');
    assert.equal(zone.hidden, false, 'the open Guitar zone remains available in Notation');
    commands.setViewMode('drums');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioWorkspace, 'rhythm');
    assert.equal(zone.hidden, true, 'the Guitar zone is hidden in Irama');
  } finally { Object.assign(globalThis, previous); }
});

test('below the large desktop breakpoint Guitar starts closed with its heading and toggle visible', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia, window: globalThis.window };
  const setup = fixture(false, false, false, true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  globalThis.window = { innerHeight: 900, matchMedia: () => ({ matches: false }) };
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    workspace.render(commands.getSong(), commands.getState(), false);
    const zone = setup.nodes.get('#guitar-section').parent;
    const heading = setup.nodes.get('.guitar-pane-heading');
    const toggle = setup.createdNodes.find(node => node.dataset.entity === 'guitar-zone-toggle');
    assert.equal(zone.dataset.open, 'false');
    assert.equal(zone.hidden, false);
    assert.equal(setup.nodes.get('#guitar-section').hidden, true);
    assert.equal(isVisibleInTree(heading), true);
    assert.equal(isVisibleInTree(toggle), true);
    assert.equal(toggle.attributes.get('aria-expanded'), 'false');
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
    const panelButton = panelToggle(setup);
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

test('entering Guitar mode opens its zone without switching the dock panel', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(false, false, true, true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.chordTrigger.attributes.get('aria-selected'), 'true');

    commands.setViewMode('guitar');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords');
    assert.equal(setup.toolsTrigger.attributes.get('aria-selected'), 'false');
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(setup.nodes.get('#guitar-section').hidden, false);
    assert.equal(setup.nodes.get('#guitar-section').parent.parent, setup.nodes.get('#workspace-canvas'));

    setup.click(setup.mixerTrigger);
    assert.equal(setup.doc.body.dataset.studioPanel, 'mixer');
    assert.equal(setup.mixerTrigger.attributes.get('aria-selected'), 'true');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'mixer');
    assert.equal(setup.mixerTrigger.attributes.get('aria-selected'), 'true');

    commands.setViewMode('piano-roll');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.nodes.get('#tools-panel').hidden, true);
    assert.equal(setup.nodes.get('#guitar-section').hidden, false, 'the independent Guitar zone stays open below the Edit canvas');

    commands.setViewMode('guitar');
    workspace.render(commands.getSong(), commands.getState(), false);
    assert.equal(setup.doc.body.dataset.studioPanel, 'mixer');
    assert.equal(setup.toolsTrigger.attributes.get('aria-selected'), 'false');
    assert.equal(setup.nodes.get('#guitar-section').hidden, false);
  } finally { Object.assign(globalThis, previous); }
});

test('Guitar sheet stays open while switching to Not on a phone', () => {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const setup = fixture(true);
  globalThis.document = setup.doc;
  globalThis.matchMedia = query => matchFixtureMedia(setup, query);
  try {
    const commands = createCommands(createBlankSong());
    const workspace = createStudioWorkspace(commands, key => key, error => { throw error; });
    workspace.render(commands.getSong(), commands.getState(), false);

    commands.setViewMode('score');
    workspace.render(commands.getSong(), commands.getState(), false);
    commands.setViewMode('guitar');
    workspace.render(commands.getSong(), commands.getState(), false);
    commands.setViewMode('score');
    workspace.render(commands.getSong(), commands.getState(), false);

    const guitarZone = setup.nodes.get('#guitar-section').parent;
    assert.equal(setup.notation.attributes.get('aria-pressed'), 'true');
    assert.equal(setup.doc.body.dataset.studioPanel, 'guitar');
    assert.equal(guitarZone.hidden, false);
    assert.equal(setup.nodes.get('#guitar-section').hidden, false);
    assert.equal(guitarZone.parent, setup.nodes.get('.workspace-sidebar'));
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
    assert.equal(setup.doc.body.dataset.studioPanel, 'chords');
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
