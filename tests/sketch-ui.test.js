import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSketchControls } from '../src/ui/harmony.js';
import { message } from '../src/i18n/messages.js';
import { readAppStyles } from './helpers/read-app-styles.js';

const read = path => readFileSync(new URL(path, import.meta.url),'utf8');

test('sketch mute states have distinct neutral/active styles and preserve separate keyboard focus',()=>{
  const css=readAppStyles(), html=read('../index.html');
  assert.match(css,/\.sketch-controls button\[aria-pressed="false"\] \{[^}]*border-color: var\(--border-strong\)[^}]*background: var\(--surface\)[^}]*color: var\(--text\)/);
  assert.match(css,/\.sketch-controls button\[aria-pressed="true"\] \{[^}]*border-color: var\(--accent\)[^}]*background: var\(--accent\)[^}]*color: var\(--on-accent\)/);
  assert.match(css,/:focus-visible \{\s*outline: 3px solid var\(--focus\);\s*outline-offset: 2px/);
  assert.match(css,/\.sketch-controls button:focus-visible \{ outline: 3px solid var\(--focus\); outline-offset: 2px;/);
  assert.doesNotMatch(css,/\.sketch-controls[^}]*outline:\s*none/);
  assert.equal((html.match(/data-mix-flag="mute" data-aria-copy="sketch\w+Mute" aria-pressed="false"/g)??[]).length,2);
});

test('compact sketch controls expose labelled semantic channels and persistent style options',()=>{
  const html=read('../index.html');
  for (const channel of ['harmony','bass']) {
    assert.match(html,new RegExp(`data-entity="sketch-channel" data-channel-id="${channel}"`));
    assert.match(html,new RegExp(`data-action="toggle-instrument-mute" data-channel-id="${channel}" data-mix-flag="mute"`));
    assert.match(html,new RegExp(`data-channel-volume data-channel-id="${channel}"`));
    assert.match(html,new RegExp(`id="${channel}-style" data-action="set-${channel}-style" data-entity="sketch-style"`));
  }
  for (const value of ['block','arpeggio','root','root-fifth']) assert.match(html,new RegExp(`<option value="${value}" data-copy="sketch`));
  assert.equal((html.match(/data-entity="sketch-volume"/g)??[]).length,2);
});

test('sketch style controls reflect restored canonical settings and older default songs',()=>{
  const previous=globalThis.document;
  const elements={'harmony-style':{},'bass-style':{}};
  globalThis.document={getElementById:id=>elements[id]};
  try {
    renderSketchControls({sketch:{harmony:{style:'arpeggio'},bass:{style:'root-fifth'}}});
    assert.equal(elements['harmony-style'].value,'arpeggio');
    assert.equal(elements['bass-style'].value,'root-fifth');
    renderSketchControls({});
    assert.equal(elements['harmony-style'].value,'block');
    assert.equal(elements['bass-style'].value,'root');
  } finally {globalThis.document=previous;}
});

test('sketch commands are public and UI events use canonical command pathways',()=>{
  const app=read('../src/app.js');
  for (const name of ['setHarmonyStyle','setBassStyle']) {
    assert.match(app,new RegExp(`${name}: commands\\.${name}`));
    assert.match(app,new RegExp(`run\\(\\(\\) => commands\\.${name}\\(event.target.value\\)\\)`));
  }
  assert.match(app,/commands\.setInstrumentVolume\(event\.target\.dataset\.channelId, Number\(event\.target\.value\) \/ 100\)/);
  assert.match(read("../src/core/timeline.js"),/for \(const chord of song\.chords \?\? \[\]\)/);
});

test('sketch copy is bilingual and mobile layout can shrink without fixed width',()=>{
  for (const language of ['id','en']) for (const key of ['sketchHarmony','sketchBass','sketchHarmonyMute','sketchBassMute','sketchHarmonyStyle','sketchBassStyle','sketchBlock','sketchArpeggio','sketchRoot','sketchRootFifth']) assert.notEqual(message(language,key),key);
  assert.doesNotMatch(message('en','harmonyHelp'),/not available/);
  const css=readAppStyles();
  assert.match(css,/\.sketch-controls fieldset \{[^}]*minmax\(0, 1fr\)[^}]*min-width: 0/);
  assert.match(css,/\.sketch-controls fieldset label:last-child \{ grid-column: 1 \/ -1;/);
});
