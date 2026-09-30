import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harmonyChordSymbol, harmonyContextRange } from '../src/ui/harmony.js';

test('Harmony inspector symbols distinguish major minor and diminished', () => {
  assert.equal(harmonyChordSymbol({ rootPitchClass: 0, quality: 'major' }), 'C');
  assert.equal(harmonyChordSymbol({ rootPitchClass: 9, quality: 'minor' }), 'Am');
  assert.equal(harmonyChordSymbol({ rootPitchClass: 11, quality: 'diminished' }), 'Bdim');
  assert.equal(harmonyChordSymbol({ rootPitchClass: 8, quality: 'diminished' }, 'F#'), 'G#dim');
  assert.equal(harmonyChordSymbol({ rootPitchClass: 6, quality: 'minor' }, 'F#'), 'F#m');
  assert.equal(harmonyChordSymbol({ rootPitchClass: 10, quality: 'major' }, 'Bb'), 'Bb');
});
test('Harmony context prefers explicit range and otherwise uses selected melody span', () => {
  const song = { notes: [{ id: 'a', startTick: 120, durationTicks: 480 }, { id: 'b', startTick: 720, durationTicks: 240 }] };
  assert.deepEqual(harmonyContextRange(song, { selection: { startTick: 0, endTick: 1920 }, selectedNoteIds: ['a'] }), { startTick: 0, endTick: 1920 });
  assert.deepEqual(harmonyContextRange(song, { selection: null, selectedNoteIds: ['a','b'] }), { startTick: 120, endTick: 960 });
  assert.deepEqual(harmonyContextRange(song, { selection: null, selectedNoteIds: [] }), { startTick: 0, endTick: 1920 });
});
test('Harmony browser command surface exports complete inference and CRUD contract', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const name of ['suggestHarmony','getHarmonyState','selectHarmonyCandidate','acceptHarmonyCandidate','clearHarmonySuggestions','addChord','updateChord','deleteChord','setChordLocked']) {
    assert.match(app, new RegExp(`${name}: commands\\.${name}`));
  }
});
test('Harmony inspector has semantic explicit forms and stable entity hooks', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/ui/harmony.js', import.meta.url), 'utf8');
  assert.match(html, /id="harmony-range-form" data-action="suggest-harmony"/);
  assert.match(html, /id="harmony-chord-form" data-action="save-chord"/);
  for (const name of ['rootPitchClass','quality','startTick','durationTicks']) assert.match(html, new RegExp(`name="${name}"`));
  assert.match(view, /node.type = 'button'/);
  assert.match(view, /aria-pressed/);
  assert.match(view, /row.dataset.locked = String\(chord.locked\)/);
  assert.match(view, /harmonyFit/);
});

test('Harmony inspector resets stale chord editing and disables locked musical controls', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/ui/harmony.js', import.meta.url), 'utf8');
  assert.match(app, /chordEditor\?\.dataset.chordId && !editedChord/);
  assert.match(app, /control.disabled = Boolean\(editedChord\?\.locked\)/);
  assert.match(app, /delete chordForm.dataset.chordId; chordForm.reset\(\)/);
  assert.match(view, /syncHarmonyRangeForm\(song, state\)/);
  assert.match(view, /harmonyChordSymbol\(candidate, song.key\)/);
});
