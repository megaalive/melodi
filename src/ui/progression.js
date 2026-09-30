import { harmonyChordSymbol, harmonyContextRange, harmonyRangeLabel } from './harmony.js?v=20261001.32';

export function createProgressionWorkspace(commands, language, onError) {
  const host = document.getElementById('progression-workspace');
  let selected = 0;
  const copy = (id, en) => language() === 'id' ? id : en;
  const button = (text, action) => { const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.dataset.progressionFocus = 'action-' + text; node.addEventListener('click', action); return node; };
  const invoke = action => { try { action(); render(); } catch (error) { onError(error); } };
  function render() {
    const song = commands.getSong();
    const preview = commands.getHarmonyProgression();
    const previousFocus = document.activeElement?.dataset.progressionFocus;
    const previousScroll = host.querySelector('.progression-strip')?.scrollLeft ?? 0;
    const presetValue = host.querySelector('[name=preset]')?.value ?? 'pop';
    const scopeValue = host.querySelector('[name=scope]')?.value ?? 'song';
    host.replaceChildren();
    const toolbar = document.createElement('div'); toolbar.className = 'progression-toolbar';
    const title = document.createElement('strong'); title.textContent = copy('Progresi chord', 'Chord progression'); toolbar.append(title);
    const preset = document.createElement('select'); preset.name = 'preset'; preset.setAttribute('aria-label', copy('Gaya progresi', 'Progression style')); preset.dataset.progressionFocus = 'preset';
    for (const [value, text] of [['pop','Pop'],['jazz','Jazz · ii–V–I'],['ballad','Ballad'],['fifths','Circle of Fifths']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; preset.append(option); } preset.value = presetValue;
    const scope = document.createElement('select'); scope.name = 'scope'; scope.dataset.progressionFocus = 'scope'; scope.setAttribute('aria-label', copy('Bagian lagu', 'Song region'));
    for (const [value,text] of [['song',copy('Seluruh lagu','Whole song')],['selection',copy('Pilihan timeline','Timeline selection')]]) { const option = document.createElement('option'); option.value = value; option.textContent = text; scope.append(option); } scope.value = scopeValue;
    toolbar.append(preset, scope, button(copy('Buat progresi','Generate progression'), () => invoke(() => { selected = 0; const range = scope.value === 'selection' ? harmonyContextRange(song, commands.getState()) : {}; commands.generateHarmonyProgression({preset: preset.value, ...range}); })));
    host.append(toolbar);
    const hint = document.createElement('p'); hint.className = 'progression-hint'; hint.textContent = copy('Mengikuti melodi dan arah harmoni. Jazz memakai triad ii–V–I. Terapkan mengganti chord yang tidak terkunci; chord terkunci dipertahankan.','Follows melody and harmonic direction. Jazz uses ii–V–I triads. Apply replaces unlocked chords; locked chords are preserved.'); host.append(hint);
    if (!preview) { if (previousFocus) host.querySelector('button')?.focus({preventScroll:true}); return; }
    const status = document.createElement('p'); status.className = 'progression-hint'; status.setAttribute('role','status'); status.textContent = preview.status === 'stale' ? copy('Lagu berubah. Buat ulang preview sebelum menerapkan.','Song changed. Regenerate the preview before applying.') : `${copy('Preview','Preview')} · ${harmonyRangeLabel(song,preview, (key,values) => values.start === values.end ? `${copy('Birama','Bar')} ${values.start}` : `${copy('Birama','Bars')} ${values.start}–${values.end}`)} · ${preview.chords.length} chord`; host.append(status);
    const strip = document.createElement('div'); strip.className = 'progression-strip'; strip.setAttribute('role','group'); strip.setAttribute('aria-label',copy('Preview progresi chord','Chord progression preview'));
    preview.chords.forEach((chord,index) => { const node = button('', () => { selected = index; render(); }); node.dataset.progressionFocus = `chord-${index}`; node.className = 'progression-block'; node.setAttribute('aria-pressed',String(selected === index)); const bar = document.createElement('small'); bar.textContent = `${copy('Birama','Bar')} ${Math.floor(chord.startTick / preview.barTicks)+1}`; const symbol = document.createElement('strong'); symbol.textContent = harmonyChordSymbol(chord,song.key); node.append(bar,symbol); strip.append(node); }); host.append(strip); strip.scrollLeft = previousScroll;
    const chord = preview.chords[Math.min(selected,preview.chords.length-1)];
    if (chord) { const alternatives = document.createElement('div'); alternatives.className = 'progression-alternatives'; const label = document.createElement('span'); label.textContent = copy('Ganti chord:','Replace chord:'); alternatives.append(label); for (const alternative of chord.alternatives ?? []) { const node = button(harmonyChordSymbol(alternative,song.key), () => invoke(() => commands.chooseHarmonyProgressionChord(selected,alternative.rootPitchClass,alternative.quality))); node.disabled = preview.status === 'stale'; node.setAttribute('aria-pressed',String(chord.rootPitchClass === alternative.rootPitchClass && chord.quality === alternative.quality)); alternatives.append(node); } host.append(alternatives); const qualities = document.createElement('div'); qualities.className = 'progression-alternatives'; for (const quality of ['major','minor','diminished','augmented']) { const choice = {rootPitchClass:chord.rootPitchClass,quality}; const node = button(harmonyChordSymbol(choice,song.key), () => invoke(() => commands.chooseHarmonyProgressionChord(selected,choice.rootPitchClass,quality))); node.disabled = preview.status === 'stale'; node.setAttribute('aria-pressed',String(chord.quality === quality)); node.setAttribute('aria-label',copy('Kualitas ','Quality ') + harmonyChordSymbol(choice,song.key)); qualities.append(node); } host.append(qualities); }
    const actions = document.createElement('div'); actions.className = 'progression-toolbar'; const apply = button(copy('Terapkan ke timeline','Apply to timeline'), () => invoke(() => commands.applyHarmonyProgression())); apply.disabled = preview.status === 'stale' || !preview.chords.length;
    actions.append(apply,button(copy('Batalkan preview','Discard preview'), () => invoke(() => commands.clearHarmonyProgression()))); host.append(actions);
    if (previousFocus) host.querySelector(`[data-progression-focus="${previousFocus}"]`)?.focus({preventScroll:true});
  }
  return {render};
}

