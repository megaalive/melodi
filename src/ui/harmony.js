import { spellPitchNameInKey } from "../notation/project.js?v=20261003.98";
import { songBarTicks, barRangeAtTick } from "../core/timeline.js?v=20261003.98";
export function harmonyChordSymbol(chord, key = "C") {
  return `${spellPitchNameInKey(60 + chord.rootPitchClass, key)}${({ major: '', minor: 'm', diminished: 'dim', augmented: 'aug' })[chord.quality] ?? chord.quality}`;
}
export function readChordDrawDefaults() {
  return { rootPitchClass: Number(document.getElementById('chord-draw-root').value), quality: document.getElementById('chord-draw-quality').value };
}
export function renderChordDrawControl(song) {
  document.getElementById('chord-draw-symbol').textContent = harmonyChordSymbol(readChordDrawDefaults(), song.key);
}
export function harmonyContextRange(song, state) {
  if (state.selection && state.selection.endTick > state.selection.startTick) return { startTick: state.selection.startTick, endTick: state.selection.endTick };
  const selected = (song.notes ?? []).filter(note => (state.selectedNoteIds ?? []).includes(note.id));
  if (selected.length) return { startTick: Math.min(...selected.map(note => note.startTick)), endTick: Math.max(...selected.map(note => note.startTick + note.durationTicks)) };
  if (state.playback?.loop?.enabled && state.playback.loop.endTick > state.playback.loop.startTick) {
    return { startTick: state.playback.loop.startTick, endTick: state.playback.loop.endTick };
  }
  if (state.harmonyRange?.endTick > state.harmonyRange?.startTick) return { ...state.harmonyRange };
  return barRangeAtTick(song, state.playback?.currentTick ?? 0);
}
export function harmonyRangeLabel(song, range, translate) {
  const ticks = songBarTicks(song);
  const first = Math.floor(range.startTick / ticks) + 1;
  const last = Math.floor(Math.max(range.startTick, range.endTick - 1) / ticks) + 1;
  return translate(first === last ? 'harmonyBar' : 'harmonyBars', { start: first, end: last });
}
export function setHarmonyEditorRange(range) {
  const form = document.getElementById('harmony-chord-form');
  form.elements.startTick.value = range.startTick;
  form.elements.durationTicks.value = range.endTick - range.startTick;
}
export function syncHarmonyRangeForm(song, state) {
  const form = document.getElementById('harmony-range-form');
  if (form.dataset.pending === 'true') return { startTick: Number(form.elements.startTick.value), endTick: Number(form.elements.endTick.value) };
  const range = harmonyContextRange(song, state);
  form.elements.startTick.value = range.startTick;
  form.elements.endTick.value = range.endTick;
  return range;
}
export function renderSketchControls(song) {
  document.getElementById('harmony-style').value = song.sketch?.harmony?.style ?? 'block';
  document.getElementById('bass-style').value = song.sketch?.bass?.style ?? 'root';
}
export function renderHarmonyInspector(song, state, session, translate) {
  const byId = id => document.getElementById(id);
  renderSketchControls(song);
  renderChordDrawControl(song);
  byId('chord-snap').value = state.editor?.chordSnap ?? 'bar';
  const range = syncHarmonyRangeForm(song, state);
  byId('harmony-location').textContent = harmonyRangeLabel(song, range, translate);
  byId('harmony-location').dataset.startTick = String(range.startTick);
  byId('harmony-location').dataset.endTick = String(range.endTick);
  byId('harmony-status').textContent = translate('harmonyInstruction');
  const list = byId('harmony-candidates');
  list.replaceChildren();
  const button = (action, label, id, disabled = false) => {
    const node = document.createElement('button'); node.type = 'button'; node.dataset.action = action;
    node.dataset.harmonyId = id; node.dataset.focusKey = `${action}-${id}`; node.textContent = label; node.disabled = disabled;
    return node;
  };
  for (const candidate of session.candidates) {
    const row = document.createElement('li'); row.dataset.entity = 'harmony-candidate'; row.dataset.entityId = candidate.id;
    const choose = button('select-harmony', `${harmonyChordSymbol(candidate, song.key)} · ${candidate.romanNumeral} · ${translate(`harmonyFunction_${candidate.function}`)}`, candidate.id);
    choose.setAttribute('aria-pressed', String(session.selectedCandidateId === candidate.id));
    const fit = document.createElement('p'); fit.className = 'muted';
    fit.textContent = translate('harmonyFit', { count: candidate.metadata.matchedChordToneCount, coverage: Math.round(candidate.metadata.weightedCoverage * 100) });
    row.append(choose, fit, button('accept-harmony', translate('harmonyAccept'), candidate.id, session.selectedCandidateId !== candidate.id)); list.append(row);
  }
  byId('harmony-clear').disabled = session.status !== 'ready';
  const selected = song.chords.find(chord => chord.id === state.selectedChordId);
  const selectedPanel = byId('harmony-selected-chord');
  selectedPanel.replaceChildren(); selectedPanel.hidden = !selected;
  const actionsFor = chord => {
    const actions = document.createElement('div'); actions.className = 'harmony-actions';
    actions.append(button('edit-chord', translate('harmonyEdit'), chord.id, chord.locked), button('toggle-chord-lock', translate(chord.locked ? 'harmonyUnlock' : 'harmonyLock'), chord.id), button('delete-chord', translate('harmonyDelete'), chord.id, chord.locked));
    return actions;
  };
  if (selected) {
    const label = document.createElement('strong');
    label.textContent = `${harmonyChordSymbol(selected, song.key)} · ${harmonyRangeLabel(song, {startTick:selected.startTick,endTick:selected.startTick+selected.durationTicks}, translate)}${selected.locked ? ' 🔒' : ''}`;
    selectedPanel.dataset.entityId = selected.id;
    selectedPanel.dataset.locked = String(selected.locked);
    selectedPanel.append(label, actionsFor(selected));
  } else delete selectedPanel.dataset.entityId;
  const chords = byId('harmony-chords'); chords.replaceChildren();
  for (const chord of [...song.chords].sort((a,b) => a.startTick - b.startTick || a.id.localeCompare(b.id))) {
    const row = document.createElement('li'); row.dataset.entity = 'chord'; row.dataset.entityId = chord.id; row.dataset.locked = String(chord.locked);
    row.dataset.selected = String(chord.id === state.selectedChordId);
    row.dataset.current = String(chord.startTick <= (state.playback?.currentTick ?? 0) && chord.startTick + chord.durationTicks > (state.playback?.currentTick ?? 0));
    row.dataset.overlapping = String(chord.startTick < range.endTick && chord.startTick + chord.durationTicks > range.startTick);
    const label = button('select-chord', `${harmonyChordSymbol(chord, song.key)} · ${harmonyRangeLabel(song, {startTick:chord.startTick,endTick:chord.startTick+chord.durationTicks}, translate)}${chord.locked ? ' 🔒' : ''}`, chord.id);
    label.setAttribute('aria-pressed', String(chord.id === state.selectedChordId));
    row.dataset.startTick = String(chord.startTick); row.dataset.durationTicks = String(chord.durationTicks);
    row.append(label, actionsFor(chord)); chords.append(row);
  }
  const chordForm = byId('harmony-chord-form');
  if (chordForm.dataset.pending !== 'true') {
    const editing = song.chords.find(chord => chord.id === chordForm.dataset.chordId);
    setHarmonyEditorRange(editing ? {startTick:editing.startTick,endTick:editing.startTick+editing.durationTicks} : range);
    if (editing) {
      chordForm.elements.rootPitchClass.value = editing.rootPitchClass;
      chordForm.elements.quality.value = editing.quality;
    }
  }
  const editStart = Number(chordForm.elements.startTick.value), editDuration = Number(chordForm.elements.durationTicks.value);
  byId('harmony-edit-location').textContent = harmonyRangeLabel(song, {startTick: editStart, endTick: editStart + editDuration}, translate);
}
