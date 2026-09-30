import { spellPitchNameInKey } from "../notation/project.js";
export function harmonyChordSymbol(chord, key = "C") {
  return `${spellPitchNameInKey(60 + chord.rootPitchClass, key)}${({ major: '', minor: 'm', diminished: 'dim' })[chord.quality] ?? chord.quality}`;
}
export function harmonyContextRange(song, state) {
  if (state.selection && state.selection.endTick > state.selection.startTick) return { startTick: state.selection.startTick, endTick: state.selection.endTick };
  const selected = song.notes.filter(note => state.selectedNoteIds.includes(note.id));
  if (!selected.length) return null;
  return { startTick: Math.min(...selected.map(note => note.startTick)), endTick: Math.max(...selected.map(note => note.startTick + note.durationTicks)) };
}
export function renderHarmonyInspector(song, state, session, translate) {
  const byId = id => document.getElementById(id);
  const context = harmonyContextRange(song, state);
  const rangeForm = byId('harmony-range-form');
  const pendingRange = rangeForm.dataset.pending === 'true'
    ? { startTick: Number(rangeForm.elements.startTick.value), endTick: Number(rangeForm.elements.endTick.value) } : null;
  const range = session.range ?? pendingRange ?? context;
  if (range && rangeForm.dataset.pending !== 'true') {
    rangeForm.elements.startTick.value = range.startTick;
    rangeForm.elements.endTick.value = range.endTick;
  }
  byId('harmony-status').textContent = range ? translate('harmonyRange', { start: range.startTick, end: range.endTick }) : translate('harmonyInstruction');
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
  const chords = byId('harmony-chords'); chords.replaceChildren();
  for (const chord of song.chords.filter(chord => !range || chord.startTick < range.endTick && chord.startTick + chord.durationTicks > range.startTick)) {
    const row = document.createElement('li'); row.dataset.entity = 'chord'; row.dataset.entityId = chord.id; row.dataset.locked = String(chord.locked);
    const label = document.createElement('p'); label.textContent = `${harmonyChordSymbol(chord, song.key)} · ${chord.startTick}–${chord.startTick + chord.durationTicks}`;
    const actions = document.createElement('div'); actions.className = 'harmony-actions';
    actions.append(button('edit-chord', translate('harmonyEdit'), chord.id, chord.locked), button('toggle-chord-lock', translate(chord.locked ? 'harmonyUnlock' : 'harmonyLock'), chord.id), button('delete-chord', translate('harmonyDelete'), chord.id, chord.locked));
    row.append(label, actions); chords.append(row);
  }
}
