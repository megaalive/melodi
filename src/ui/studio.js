import { songBarTicks, canonicalSongEndTick } from '../core/timeline.js?v=20261001.30';

export function musicalPosition(song, tick) {
  const barTicks = songBarTicks(song);
  const beatTicks = barTicks / song.timing.timeSignature.numerator;
  return { bar: Math.floor(tick / barTicks) + 1, beat: Math.floor((tick % barTicks) / beatTicks) + 1 };
}

/** Presentation only: one workspace, existing canonical commands, no Song preferences. */
export function createStudioWorkspace(commands, translate, onError) {
  const byId = id => document.getElementById(id);
  let panel = null;
  let lastPanel = 'chords';
  let lastChord = null;
  let overviewSong = null;
  const sidebar = document.querySelector('.workspace-sidebar');
  const settings = document.querySelector('.studio-settings');
  const mixer = byId('studio-mixer-channels');
  document.querySelector('.expression-panel-heading').insertBefore(document.querySelector('.expression-toolbar'), byId('expression-collapse'));
  mixer.append(document.querySelector('.sketch-controls'));
  const melody = document.querySelector('.instrument-mix-strip').cloneNode(true);
  melody.classList.add('studio-melody-channel');
  melody.querySelectorAll('[data-focus-key]').forEach(node => { node.dataset.focusKey = `studio:${node.dataset.focusKey}`; });
  mixer.prepend(melody);
  for (const slider of document.querySelectorAll('[data-channel-volume]')) {
    const value = document.createElement('span');
    value.dataset.studioVolume = '';
    value.className = 'studio-volume-value';
    value.setAttribute('aria-hidden', 'true');
    slider.after(value);
  }
  const utility = document.querySelector('.utility-card');
  if (utility) {
    utility.classList.add('studio-advanced');
    document.querySelector('.app-shell').append(utility);
  }

  function openPanel(value) {
    if (value) lastPanel = value;
    panel = value;
    render(commands.getSong(), commands.getState(), false);
    if (panel && matchMedia('(max-width: 760px)').matches) sidebar.querySelector('[data-studio-close]').focus({preventScroll:true});
  }
  document.addEventListener('click', event => {
    if (settings.open && !settings.contains(event.target)) settings.open = false;
    const target = event.target.closest?.('[data-studio-view], [data-studio-panel], [data-studio-close], [data-studio-seek]');
    if (!target) return;
    try {
      if (target.dataset.studioView) {
        panel = null;
        commands.setViewMode(target.dataset.studioView);
      } else if (target.dataset.studioPanel) openPanel(panel === target.dataset.studioPanel ? null : target.dataset.studioPanel);
      else if (target.hasAttribute('data-studio-close')) { openPanel(null); document.querySelector(`[data-studio-panel="${lastPanel}"]`)?.focus({preventScroll:true}); }
      else commands.seek(Number(target.dataset.studioSeek));
    } catch (error) { onError(error); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && settings.open && settings.contains(event.target)) {
      settings.open = false; settings.querySelector('summary').focus(); event.preventDefault(); return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented && sidebar.contains(event.target) && panel) { openPanel(null); document.querySelector(`[data-studio-panel="${lastPanel}"]`)?.focus(); }
    const current = event.target.closest?.('[data-studio-view]');
    if (!current || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('[data-studio-view]')];
    const index = tabs.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[next].focus(); tabs[next].click();
  });

  function renderOverview(song) {
    const track = byId('studio-overview'); track.replaceChildren();
    const barTicks = songBarTicks(song);
    const bars = Math.max(1, Math.ceil(canonicalSongEndTick(song) / barTicks));
    const barsPerCell = Math.max(1, Math.ceil(bars / 128));
    const pitches = song.notes.map(note => note.pitch);
    const high = pitches.length ? pitches.reduce((a,b) => Math.max(a,b)) : 84;
    const low = pitches.length ? pitches.reduce((a,b) => Math.min(a,b)) : 60;
    for (let bar = 0; bar < bars; bar += barsPerCell) {
      const endBar = Math.min(bars, bar + barsPerCell);
      const spanTicks = (endBar - bar) * barTicks;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.studioSeek = String(bar * barTicks);
      button.dataset.studioEnd = String(endBar * barTicks);
      button.setAttribute('aria-label', translate('studioSeekBar', {bar:bar + 1}));
      const number = document.createElement('span'); number.textContent = barsPerCell === 1 ? String(bar + 1) : `${bar + 1}–${endBar}`; button.append(number);
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 100 30'); svg.setAttribute('preserveAspectRatio','none'); svg.setAttribute('aria-hidden','true');
      const rect = (start,duration,y,height,kind) => {
        const left = Math.max(start,bar * barTicks), right = Math.min(start + duration,endBar * barTicks);
        if (right <= left) return;
        const node = document.createElementNS(svg.namespaceURI,'rect');
        for (const [key,value] of Object.entries({x:(left-bar*barTicks)/spanTicks*100,y,width:Math.max(1,(right-left)/spanTicks*100),height,rx:1,class:`studio-overview-${kind}`})) node.setAttribute(key,String(value));
        svg.append(node);
      };
      song.chords.forEach(chord=>rect(chord.startTick,chord.durationTicks,0,5,'chord'));
      song.notes.forEach(note=>rect(note.startTick,note.durationTicks,high === low ? 15 : 8+(high-note.pitch)/(high-low)*14,2,'note'));
      song.tracks.filter(track=>track.kind==='percussion').forEach(track=>track.events.forEach(hit=>rect(hit.startTick,hit.durationTicks??60,26,3,'drum')));
      button.append(svg);track.append(button);
    }
    overviewSong = JSON.stringify([song.notes,song.chords,song.tracks,song.timing]);
  }

  function updatePlayback(song, playback) {
    const position = musicalPosition(song,playback.currentTick ?? 0);
    byId('studio-position').textContent = `${position.bar} · ${position.beat}`;
    for (const button of byId('studio-overview').children) {
      const current = Number(button.dataset.studioSeek) <= (playback.currentTick??0) && Number(button.dataset.studioEnd) > (playback.currentTick??0);
      button.dataset.current = String(current);button.setAttribute('aria-current',current?'location':'false');
    }
  }
  function render(song,state,autoSelect=true) {
    if (autoSelect && state.selectedChordId && state.selectedChordId !== lastChord) { panel = 'chords'; lastPanel = panel; }
    lastChord = state.selectedChordId;
    document.body.dataset.studioPanel = panel ?? 'none';
    document.body.dataset.studioSelection = String(state.selectedNoteIds.length > 0);
    sidebar.hidden = !panel;
    byId('studio-mixer').hidden = panel !== 'mixer';
    byId('harmony-panel').hidden = panel !== 'chords';
    byId('generation-panel').hidden = panel !== 'generate';
    byId('studio-panel-title').textContent = translate(({mixer:'studioMixer',chords:'harmonyLaneLabel',generate:'studioGenerate'})[panel] ?? 'studioPanels');
    document.querySelectorAll('[data-studio-panel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studioPanel===panel)));
    document.querySelectorAll('[data-studio-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studioView===state.view.mode)));
    if (overviewSong !== JSON.stringify([song.notes,song.chords,song.tracks,song.timing])) renderOverview(song);
    updatePlayback(song,state.playback);
  }
  return {render,openPanel,updatePlayback};
}
