import { songBarTicks, canonicalSongEndTick } from '../core/timeline.js?v=20261001.56';

export function musicalPosition(song, tick) {
  const barTicks = songBarTicks(song);
  const beatTicks = barTicks / song.timing.timeSignature.numerator;
  return { bar: Math.floor(tick / barTicks) + 1, beat: Math.floor((tick % barTicks) / beatTicks) + 1 };
}

/** Presentation only: one workspace, existing canonical commands, no Song preferences. */
export function createStudioWorkspace(commands, translate, onError, { onOpenPanel = () => {} } = {}) {
  const byId = id => document.getElementById(id);
  let panel = null;
  let sheetSize = 'peek';
  let lastPanel = 'chords';
  let lastChord = null;
  let overviewSong = null;
  const sidebar = document.querySelector('.workspace-sidebar');
  const settings = document.querySelector('.studio-settings');
  const studioMenu = document.querySelector('.studio-menu');
  const headerActions = document.querySelector('.header-actions');
  const projectMenu = document.querySelector('.project-menu');
  const studioMenuActions = studioMenu.querySelector('.studio-menu-actions');
  const mixer = byId('studio-mixer-channels');
  const expressionPanel = byId('expression-panel');
  if (expressionPanel) sidebar.append(expressionPanel);
  const selectionBar = document.createElement('div');
  selectionBar.id = 'note-selection-bar';
  selectionBar.className = 'note-selection-bar';
  selectionBar.hidden = true;
  const noteTools = document.querySelector('.expression-note-tools');
  if (noteTools) {
    for (const group of [...noteTools.querySelectorAll('.editor-toolbar-group')]) selectionBar.append(group);
    for (const [action, label] of [['context-duplicate','contextDuplicate'],['context-delete','contextDelete'],['context-toggle-anchor','contextAnchor'],['context-toggle-lock','contextLock']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.action = action; button.dataset.copy = label;
      selectionBar.append(button);
    }
    const expression = document.createElement('button');
    expression.type = 'button'; expression.dataset.studioPanel = 'expression'; expression.dataset.copy = 'expressionHeading';
    selectionBar.append(expression);
    document.querySelector('.roll-surface').after(selectionBar);
  }
  const drumExpression = byId('studio-drum-expression');
  if (drumExpression) drumExpression.append(byId('percussion-multi-selection'),byId('percussion-expression-form'));
  document.querySelector('.expression-panel-heading').insertBefore(document.querySelector('.expression-toolbar'), byId('expression-collapse'));
  mixer.append(document.querySelector('.sketch-controls'));
  const melody = document.querySelector('.instrument-mix-strip');
  melody.classList.add('studio-melody-channel');
  mixer.prepend(melody);
  for (const slider of document.querySelectorAll('[data-channel-volume]')) {
    const value = document.createElement('span');
    value.dataset.studioVolume = '';
    value.className = 'studio-volume-value';
    value.setAttribute('aria-hidden', 'true');
    slider.after(value);
  }
  byId('harmony-panel').prepend(byId('harmony-timeline-tools'));
  const candidateDock = byId('candidate-dock');
  if (candidateDock) {
    const rollSurface = document.querySelector('.roll-surface');
    const selectionBar = byId('note-selection-bar');
    rollSurface?.before(candidateDock);
    if (selectionBar) {
      const fillGap = document.createElement('button');
      fillGap.type = 'button';
      fillGap.dataset.action = 'generate-selected-gap';
      fillGap.dataset.copy = 'generationFillGap';
      fillGap.dataset.focusKey = 'generate-selected-gap';
      fillGap.hidden = true;
      const lastGroup = [...selectionBar.querySelectorAll('.editor-toolbar-group')].at(-1);
      selectionBar.insertBefore(fillGap, lastGroup?.nextSibling ?? selectionBar.firstChild);
    }
  }
  document.querySelector('.brand-block').append(document.querySelector('.song-strip'));
  const transportSettings = document.querySelector('.playback-settings-group');
  const advanced = document.querySelector('.transport-advanced');
  const advancedBody = document.querySelector('.transport-advanced-grid');
  const tempo = document.querySelector('.tempo-control');
  const follow = document.querySelector('.follow-mode-control');
  const transportMain = document.querySelector('.transport-main');
  const moreMenu = document.querySelector('.studio-more');
  const morePopover = document.querySelector('.studio-more-popover');
  const utility = document.querySelector('.utility-card');
  if (utility) {
    utility.classList.add('studio-advanced');
    morePopover.append(utility);
  }
  const panelSwitches = document.querySelector('.studio-panel-switches');
  const mobilePeek = sidebar.querySelector('.mobile-panel-peek-actions');
  const sessionActions = byId('generation-session-actions');
  const toolbarActions = document.querySelector('.studio-toolbar-actions');
  const moreAppActions = document.createElement('div');
  moreAppActions.className = 'studio-more-app-actions';
  morePopover.append(moreAppActions);
  const mixerTrigger = document.querySelector('button[data-studio-panel="mixer"]');
  const chordTrigger = document.querySelector('button[data-studio-panel="chords"]');
  const generateTrigger = document.querySelector('button[data-studio-panel="generate"]');
  const guitarMode = morePopover.querySelector('[data-studio-view="guitar"]');
  const modeNav = byId('studio-views');
  const modeToolbar = byId('view-controls');
  const editorToolbar = byId('editor-toolbar');
  const editorTools = editorToolbar.querySelector('.editor-tool-group');
  const editorToolsHome = editorToolbar;
  const editorExtras = [...editorToolbar.children].filter(child => child !== editorTools);
  const editorSettings = document.createElement('section');
  editorSettings.className = 'studio-editor-settings';
  editorSettings.setAttribute('aria-label', translate('editorSettingsHeading'));
  const editorSettingsHeading = document.createElement('h3');
  editorSettingsHeading.textContent = translate('editorSettingsHeading');
  editorSettings.append(editorSettingsHeading, ...editorExtras);
  morePopover.append(editorSettings);
  const overview = document.querySelector('.studio-overview');
  transportMain.insertBefore(overview, transportSettings);
  const compact = matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px)');
  const shortLandscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
  const overviewTrack = byId('studio-overview');
  let overviewPointerId = null;
  function seekOverview(clientX) {
    const rect = overviewTrack.getBoundingClientRect();
    const endTick = Number(overviewTrack.dataset.endTick);
    const song = commands.getSong();
    const barTicks = songBarTicks(song);
    const beatTicks = barTicks / song.timing.timeSignature.numerator;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const tick = Math.round((ratio * endTick) / beatTicks) * beatTicks;
    try { commands.seek(Math.max(0, Math.min(endTick, tick))); }
    catch (error) { onError(error); }
  }
  overviewTrack.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    overviewPointerId = event.pointerId;
    try { overviewTrack.setPointerCapture(event.pointerId); } catch {}
    seekOverview(event.clientX);
    event.preventDefault();
  });
  overviewTrack.addEventListener('pointermove', event => {
    if (overviewPointerId === event.pointerId) seekOverview(event.clientX);
  });
  overviewTrack.addEventListener('pointerup', event => {
    if (overviewPointerId !== event.pointerId) return;
    seekOverview(event.clientX);
    overviewPointerId = null;
    try { overviewTrack.releasePointerCapture(event.pointerId); } catch {}
  });
  overviewTrack.addEventListener('pointercancel', event => {
    if (overviewPointerId !== event.pointerId) return;
    overviewPointerId = null;
  });
  overviewTrack.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const song = commands.getSong();
    const endTick = Number(overviewTrack.dataset.endTick);
    const beatTicks = songBarTicks(song) / song.timing.timeSignature.numerator;
    const current = commands.getState().playback.currentTick ?? 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End'
      ? Math.max(0, endTick - beatTicks)
      : Math.max(0, Math.min(endTick, current + (event.key === 'ArrowRight' ? beatTicks : -beatTicks)));
    event.preventDefault();
    try { commands.seek(next); } catch (error) { onError(error); }
  });
  function arrangeControls() {
    const advancedSummary = advanced.querySelector('summary');
    advancedSummary.dataset.ariaCopy = compact.matches ? 'transportOptions' : 'transportAdvanced';
    advancedSummary.setAttribute('aria-label', translate(advancedSummary.dataset.ariaCopy));
    const advancedLabel = advancedSummary.querySelector('[data-copy]');
    advancedLabel.dataset.copy = advancedSummary.dataset.ariaCopy;
    advancedLabel.textContent = translate(advancedLabel.dataset.copy);
    transportSettings.prepend(tempo);
    moreMenu.open = false;
    if (compact.matches) {
      settings.open = false;
      morePopover.prepend(guitarMode);
      studioMenu.open = false;
      advancedBody.append(follow);
      morePopover.append(advanced);
      if (shortLandscape.matches) {
        studioMenu.hidden = true;
        moreAppActions.append(studioMenuActions);
        mobilePeek.append(mixerTrigger, chordTrigger);
        panelSwitches.append(generateTrigger);
        modeNav.insertBefore(guitarMode, moreMenu);
        toolbarActions.append(editorTools);
        toolbarActions.append(moreMenu);
        transportSettings.append(projectMenu);
      } else {
        studioMenu.hidden = false;
        headerActions.prepend(projectMenu, studioMenu);
        studioMenu.append(studioMenuActions);
        modeNav.append(moreMenu);
        mobilePeek.append(mixerTrigger, chordTrigger);
        panelSwitches.append(generateTrigger);
        editorToolsHome.prepend(editorTools);
      }
      editorSettings.hidden = false;
      editorSettings.setAttribute('aria-label', translate('editorSettingsHeading'));
      if (sessionActions) byId('generation-panel').append(sessionActions);
    } else {
      headerActions.prepend(projectMenu, studioMenu);
      studioMenu.append(studioMenuActions);
      studioMenu.hidden = false;
      editorToolsHome.prepend(editorTools);
      modeNav.insertBefore(guitarMode, moreMenu);
      studioMenu.open = true;
      transportSettings.append(advanced);
      transportSettings.insertBefore(mixerTrigger, advanced);
      transportSettings.append(follow);
      toolbarActions.append(moreMenu, chordTrigger);
      editorToolbar.append(...editorExtras);
      editorSettings.hidden = true;
      if (candidateDock && sessionActions) candidateDock.insertBefore(sessionActions, byId('generation-candidates'));
    }
    sidebar.hidden = !panel && !compact.matches;
    sidebar.dataset.sheetSize = panel ? sheetSize : 'peek';
    const moreLabel = moreMenu.querySelector('summary [data-copy]');
    moreLabel.dataset.copy = 'studioMoreButton';
    moreLabel.textContent = translate('studioMoreButton');
    moreMenu.querySelector('summary').setAttribute('aria-label', translate('studioMoreLabel'));
  }
  compact.addEventListener('change', arrangeControls);
  shortLandscape.addEventListener('change', arrangeControls);
  arrangeControls();
  function openPanel(value) {
    if (value && value !== panel) sheetSize = 'half';
    else if (!value && compact.matches) sheetSize = 'peek';
    if (value) lastPanel = value;
    panel = value;
    render(commands.getSong(), commands.getState(), false);
    if (panel) sidebar.querySelector('[data-studio-close]').focus({preventScroll:true});
    if (panel) onOpenPanel(panel);
  }
  function restorePanelFocus() {
    const trigger = document.querySelector(`button[data-studio-panel="${lastPanel}"]`);
    const fallback = document.querySelector('[data-studio-view][aria-pressed="true"]');
    (trigger?.getClientRects().length ? trigger : fallback)?.focus({preventScroll:true});
  }
  document.addEventListener('click', event => {
    if (settings.open && !settings.contains(event.target)) settings.open = false;
    if (compact.matches && studioMenu.open && !studioMenu.contains(event.target)) studioMenu.open = false;
    if (moreMenu.open && !moreMenu.contains(event.target)) moreMenu.open = false;
    if (compact.matches && studioMenu.open && studioMenu.contains(event.target) && !settings.contains(event.target) && event.target.closest?.('button[data-action]')) {
      studioMenu.open = false;
      studioMenu.querySelector('summary').focus({preventScroll:true});
    }
    const target = event.target.closest?.('[data-studio-view], button[data-studio-panel], [data-studio-close], [data-studio-seek], [data-studio-size]');
    if (!target) return;
    try {
      if (target.dataset.studioSize) { sheetSize = target.dataset.studioSize; render(commands.getSong(),commands.getState(),false); }
      else if (target.dataset.studioView) {
        const cameFromMoreMenu = moreMenu.contains(target);
        moreMenu.open = false;
        panel = null;
        commands.setViewMode(target.dataset.studioView);
        if (cameFromMoreMenu) moreMenu.querySelector('summary').focus({preventScroll:true});
      } else if (target.dataset.studioPanel) { moreMenu.open = false; openPanel(panel === target.dataset.studioPanel ? null : target.dataset.studioPanel); }
      else if (target.hasAttribute('data-studio-close')) { openPanel(null); restorePanelFocus(); }
      else commands.seek(Number(target.dataset.studioSeek));
    } catch (error) { onError(error); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && moreMenu.open && moreMenu.contains(event.target)) {
      moreMenu.open = false; moreMenu.querySelector('summary').focus(); event.preventDefault(); return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented && settings.open && settings.contains(event.target)) {
      settings.open = false; settings.querySelector('summary').focus(); event.preventDefault(); return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented && compact.matches && studioMenu.open && studioMenu.contains(event.target)) {
      studioMenu.open = false; studioMenu.querySelector('summary').focus(); event.preventDefault(); return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented && sidebar.contains(event.target) && panel) { openPanel(null); restorePanelFocus(); }
    const current = event.target.closest?.('#studio-views > [data-studio-view], #studio-views > .studio-more > summary');
    if (!current || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = [...modeNav.querySelectorAll(':scope > [data-studio-view], :scope > .studio-more > summary')].filter(tab => tab.getClientRects().length);
    const index = tabs.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[next].focus(); tabs[next].click();
  });

  function renderOverview(song) {
    const track = overviewTrack; track.replaceChildren();
    const barTicks = songBarTicks(song);
    const endTick = Math.max(barTicks, canonicalSongEndTick(song));
    const bars = Math.max(1, Math.ceil(endTick / barTicks));
    track.dataset.endTick = String(endTick);
    track.dataset.barTicks = String(barTicks);
    track.setAttribute('role', 'slider');
    track.setAttribute('tabindex', '0');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(endTick));
    track.setAttribute('aria-label', translate('studioOverview'));
    track.setAttribute('data-entity', 'timeline-overview');
    const pitches = song.notes.map(note => note.pitch);
    const high = pitches.length ? pitches.reduce((a,b) => Math.max(a,b)) : 84;
    const low = pitches.length ? pitches.reduce((a,b) => Math.min(a,b)) : 60;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 30');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const current = document.createElementNS(svg.namespaceURI, 'rect');
    current.dataset.currentBar = '';
    current.setAttribute('class', 'studio-overview-current');
    current.setAttribute('y', '0');
    current.setAttribute('height', '30');
    current.setAttribute('rx', '1');
    svg.append(current);
    for (let bar = 1; bar < bars; bar += 1) {
      const line = document.createElementNS(svg.namespaceURI, 'line');
      line.setAttribute('x1', String(bar / bars * 100));
      line.setAttribute('x2', String(bar / bars * 100));
      line.setAttribute('y1', '0');
      line.setAttribute('y2', '30');
      line.setAttribute('class', 'studio-overview-barline');
      svg.append(line);
    }
    const rect = (start, duration, y, height, kind) => {
      const left = Math.max(0, start);
      const right = Math.min(endTick, start + duration);
      if (right <= left) return;
      const node = document.createElementNS(svg.namespaceURI, 'rect');
      for (const [key, value] of Object.entries({x:left / endTick * 100,y,width:Math.max(.5,(right-left) / endTick * 100),height,rx:1,class:`studio-overview-${kind}`})) node.setAttribute(key, String(value));
      svg.append(node);
    };
    song.chords.forEach(chord => rect(chord.startTick, chord.durationTicks, 0, 5, 'chord'));
    song.notes.forEach(note => rect(note.startTick, note.durationTicks, high === low ? 15 : 8 + (high - note.pitch) / (high - low) * 14, 2, 'note'));
    song.tracks.filter(track => track.kind === 'percussion').forEach(track => track.events.forEach(hit => rect(hit.startTick, hit.durationTicks ?? 60, 26, 3, 'drum')));
    track.append(svg);
    overviewSong = JSON.stringify([song.notes,song.chords,song.tracks,song.timing,translate('studioSeekBar', {bar:1})]);
  }

  function updatePlayback(song, playback) {
    const position = musicalPosition(song,playback.currentTick ?? 0);
    byId('studio-position').textContent = `${position.bar} · ${position.beat}`;
    const track = overviewTrack;
    const barTicks = Number(track.dataset.barTicks ?? songBarTicks(song));
    const endTick = Number(track.dataset.endTick ?? Math.max(barTicks, canonicalSongEndTick(song)));
    const tick = Math.max(0, Math.min(endTick, playback.currentTick ?? 0));
    const barStart = Math.min(endTick - barTicks, Math.floor(tick / barTicks) * barTicks);
    const current = track.querySelector('[data-current-bar]');
    if (current) {
      current.setAttribute('x', String(barStart / endTick * 100));
      current.setAttribute('width', String(Math.min(barTicks, endTick - barStart) / endTick * 100));
    }
    track.setAttribute('aria-valuenow', String(tick));
    track.setAttribute('aria-valuetext', translate('studioSeekBar', {bar:position.bar, beat:position.beat}));
  }
  function render(song,state,autoSelect=true) {
    if (autoSelect && state.selectedChordId && state.selectedChordId !== lastChord) { panel = 'chords'; lastPanel = panel; }
    lastChord = state.selectedChordId;
    document.body.dataset.studioPanel = panel ?? 'none';
    sidebar.dataset.sheetSize = sheetSize;
    selectionBar.hidden = !state.selectedNoteIds.length || state.generation?.status === 'ready';
    for (const button of selectionBar.querySelectorAll('button[data-copy]')) {
      button.textContent = translate(button.dataset.copy);
      button.title = button.textContent;
      const flag = ({'context-toggle-anchor':'anchor','context-toggle-lock':'locked'})[button.dataset.action];
      if (flag) button.setAttribute('aria-pressed',String(song.notes.filter(note=>state.selectedNoteIds.includes(note.id)).every(note=>note[flag])));
    }
    const drumToolbar = byId('drums-selection-toolbar');
    if (drumToolbar) drumToolbar.hidden = !state.selectedPercussionHitIds?.length;
    if (drumExpression) drumExpression.hidden = panel !== 'drum-expression';
    if (expressionPanel) expressionPanel.hidden = panel !== 'expression';
    document.body.dataset.studioSelection = String(state.selectedNoteIds.length > 0);
    sidebar.hidden = !panel && !compact.matches;
    byId('studio-mixer').hidden = panel !== 'mixer';
    byId('harmony-panel').hidden = panel !== 'chords';
    byId('generation-panel').hidden = panel !== 'generate';
    byId('studio-panel-title').textContent = translate(({mixer:'studioMixer',chords:'harmonyLaneLabel',generate:'studioGenerate',expression:'expressionHeading','drum-expression':'percussionExpressionHeading'})[panel] ?? 'studioPanels');
    document.querySelectorAll('button[data-studio-panel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studioPanel===panel)));
    document.querySelectorAll('[data-studio-view]').forEach(button=>{
      const mode = button.dataset.studioView;
      button.setAttribute('aria-pressed',String(mode===state.view.mode || mode==='score' && state.view.mode==='combined'));
    });
    const moreSummary = moreMenu.querySelector('summary');
    const guitarActive = compact.matches && state.view.mode === 'guitar';
    moreSummary.dataset.activeView = guitarActive ? 'guitar' : '';
    const moreLabel = moreSummary.querySelector('[data-copy]');
    moreLabel.textContent = guitarActive ? translate('viewGuitarOption') : translate('studioMoreButton');
    moreSummary.setAttribute('aria-label', guitarActive
      ? `${translate('viewGuitarOption')}. ${translate('studioMoreLabel')}`
      : translate('studioMoreLabel'));
    if (overviewSong !== JSON.stringify([song.notes,song.chords,song.tracks,song.timing,translate('studioSeekBar', {bar:1})])) renderOverview(song);
    updatePlayback(song,state.playback);
  }
  return {render,openPanel,updatePlayback};
}
