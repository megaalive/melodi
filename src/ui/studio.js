import { songBarTicks, canonicalSongEndTick } from '../core/timeline.js?v=20261002.70';

export function musicalPosition(song, tick) {
  const barTicks = songBarTicks(song);
  const beatTicks = barTicks / song.timing.timeSignature.numerator;
  return { bar: Math.floor(tick / barTicks) + 1, beat: Math.floor((tick % barTicks) / beatTicks) + 1 };
}

export function noteVolumeForVelocity(value) {
  const velocity = Number(value);
  if (!Number.isFinite(velocity)) return 1;
  return Math.max(0, Math.min(127, Math.round(velocity))) / 127;
}

export function selectedNoteVelocity(notes) {
  if (!notes?.length) return 127;
  const volume = notes.reduce((sum, note) => sum + (note.volume ?? 1), 0) / notes.length;
  return Math.max(0, Math.min(127, Math.round(volume * 127)));
}

/** Presentation only: one workspace, existing canonical commands, no Song preferences. */
export function createStudioWorkspace(commands, translate, onError, { onOpenPanel = () => {} } = {}) {
  const byId = id => document.getElementById(id);
  let panel = null;
  let lastPanel = 'chords';
  let lastChord = null;
  let overviewSong = null;
  const sidebar = document.querySelector('.workspace-sidebar');
  const guitarSection = byId('guitar-section');
  sidebar.append(guitarSection);
  const headerActions = document.querySelector('.header-actions');
  const projectMenu = document.querySelector('.project-menu');
  const mixer = byId('studio-mixer-channels');
  const expressionPanel = byId('expression-panel');
  if (expressionPanel) sidebar.append(expressionPanel);
  const selectionBar = document.createElement('div');
  selectionBar.id = 'note-selection-bar';
  selectionBar.className = 'note-selection-bar';
  selectionBar.hidden = true;
  const noteTools = document.querySelector('.expression-note-tools');
  const fillGap = document.createElement('button');
  fillGap.type = 'button';
  fillGap.dataset.action = 'generate-selected-gap';
  fillGap.dataset.copy = 'generationFillGap';
  fillGap.dataset.focusKey = 'generate-selected-gap';
  fillGap.hidden = true;
  if (noteTools) {
    const groups = [...noteTools.querySelectorAll('.editor-toolbar-group')];
    const transpose = groups.find(group => group.dataset.ariaCopy === 'transposeGroupLabel');
    const duration = groups.find(group => group.dataset.ariaCopy === 'durationGroupLabel');
    const more = document.createElement('details');
    more.className = 'selection-more';
    const moreSummary = document.createElement('summary');
    moreSummary.dataset.copy = 'studioMoreButton';
    moreSummary.dataset.ariaCopy = 'studioMoreLabel';
    more.append(moreSummary);
    const moreBody = document.createElement('div');
    moreBody.className = 'selection-more-actions';
    more.append(moreBody);
    selectionBar.append(fillGap);
    if (transpose) {
      const octaveGroup = document.createElement('div');
      octaveGroup.className = 'editor-toolbar-group selection-octave-group';
      octaveGroup.setAttribute('role', 'group');
      octaveGroup.dataset.ariaCopy = 'transposeGroupLabel';
      for (const button of [...transpose.querySelectorAll('[data-delta]')]) {
        if (button.dataset.delta === '-12' || button.dataset.delta === '12') octaveGroup.append(button);
      }
      selectionBar.append(transpose);
      if (octaveGroup.children.length) moreBody.append(octaveGroup);
    }
    if (duration) {
      const quickDuration = document.createElement('div');
      quickDuration.className = 'editor-toolbar-group selection-duration-group';
      quickDuration.setAttribute('role', 'group');
      quickDuration.dataset.ariaCopy = 'durationGroupLabel';
      for (const button of [...duration.querySelectorAll('[data-snap]')]) {
        if (button.dataset.snap === '1/4') quickDuration.append(button);
        else moreBody.append(button);
      }
      selectionBar.append(quickDuration);
    }
    const velocity = document.createElement('details');
    velocity.className = 'selection-velocity';
    const velocitySummary = document.createElement('summary');
    velocitySummary.dataset.copy = 'studioNoteVelocity';
    velocitySummary.dataset.ariaCopy = 'studioNoteVelocityHelp';
    velocity.append(velocitySummary);
    const velocityPopover = document.createElement('div');
    velocityPopover.className = 'selection-velocity-popover';
    const velocityLabel = document.createElement('label');
    const velocityLabelText = document.createElement('span');
    velocityLabelText.dataset.copy = 'studioNoteVelocity';
    const velocityInput = document.createElement('input');
    velocityInput.type = 'range';
    velocityInput.min = '0';
    velocityInput.max = '127';
    velocityInput.step = '1';
    velocityInput.dataset.action = 'set-selected-velocity';
    velocityInput.dataset.ariaCopy = 'studioNoteVelocityHelp';
    const velocityOutput = document.createElement('output');
    velocityOutput.value = '127';
    velocityOutput.textContent = '127';
    velocityLabel.append(velocityLabelText, velocityInput, velocityOutput);
    velocityPopover.append(velocityLabel);
    velocity.append(velocityPopover);
    selectionBar.append(velocity);
    for (const [action, label] of [['context-duplicate','contextDuplicate'],['context-delete','contextDelete']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.action = action; button.dataset.copy = label;
      selectionBar.append(button);
    }
    const advancedActions = document.createElement('div');
    advancedActions.className = 'selection-advanced-actions';
    for (const [action, label] of [['context-toggle-anchor','contextAnchor'],['context-toggle-lock','contextLock']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.action = action; button.dataset.copy = label;
      advancedActions.append(button);
    }
    const expression = document.createElement('button');
    expression.type = 'button'; expression.dataset.studioPanel = 'expression'; expression.dataset.copy = 'expressionHeading';
    advancedActions.append(expression);
    moreBody.append(advancedActions);
    if (moreBody.children.length) selectionBar.append(more);
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
    rollSurface?.before(candidateDock);
    const candidateActions = candidateDock.querySelector('.candidate-primary-actions');
    candidateActions?.append(candidateDock.querySelector('.candidate-navigation'));
    candidateActions?.append(byId('lock-accepted-notes'), byId('regenerate-gap'));
    if (!noteTools) byId('note-selection-bar')?.append(fillGap);
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
  const historyButtons = document.querySelector('.history-buttons');
  const loopToggle = document.querySelector('.loop-toggle');
  const resetRange = byId('reset-playback-range');
  const utility = document.querySelector('.utility-card');
  if (utility) {
    utility.classList.add('studio-advanced');
    morePopover.append(utility);
  }
  const panelSwitches = document.querySelector('.studio-panel-switches');
  const sessionActions = byId('generation-session-actions');
  const toolbarActions = document.querySelector('.studio-toolbar-actions');
  const mixerTrigger = document.querySelector('button[data-studio-panel="mixer"]');
  const chordTrigger = document.querySelector('button[data-studio-panel="chords"]');
  const generateTrigger = document.querySelector('button[data-studio-panel="generate"]');
  const guitarMode = morePopover.querySelector('[data-studio-view="guitar"]');
  const lyricsMode = document.querySelector('#score-section [data-studio-view="lyrics"]');
  const modeNav = byId('studio-views');
  const modeToolbar = byId('view-controls');
  const header = document.querySelector('.page-header');
  const mobileDock = byId('mobile-workspace-dock');
  const transportDock = document.querySelector('.transport-dock');
  const transportHome = transportDock.parentElement;
  const scoreLayoutGroup = document.querySelector('.score-layout-group');
  const rollTitleRow = byId('piano-roll-section').querySelector('.pane-title-row');
  const guitarToolbar = document.querySelector('#guitar-section .guitar-local-toolbar');
  const lyricsHeading = document.querySelector('#lyrics-section .pane-heading');
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
  const phone = matchMedia('(width <= 46rem)');
  const compact = matchMedia('(width <= 46rem), (orientation: landscape) and (max-height: 500px) and (width < 68rem)');
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
    transportSettings.append(moreMenu);
    mobileDock.hidden = !compact.matches;
    modeToolbar.hidden = !shortLandscape.matches;
    if (compact.matches) {
      advancedBody.append(follow, loopToggle, resetRange, historyButtons);
      if (shortLandscape.matches) {
        toolbarActions.append(editorTools);
        transportSettings.append(projectMenu);
      } else {
        advancedBody.append(tempo);
        headerActions.prepend(projectMenu);
        editorToolsHome.prepend(editorTools);
      }
      mobileDock.append(transportDock, modeNav);
      editorSettings.hidden = false;
      editorSettings.setAttribute('aria-label', translate('editorSettingsHeading'));
      if (sessionActions) byId('generation-panel').append(sessionActions);
    } else {
      transportHome.append(transportDock);
      headerActions.prepend(projectMenu);
      header.insertBefore(modeNav, headerActions);
      editorToolsHome.prepend(editorTools);
      transportSettings.append(tempo, loopToggle, resetRange, historyButtons);
      advancedBody.append(follow);
      editorToolbar.append(...editorExtras);
      editorSettings.hidden = true;
      if (sessionActions) byId('generation-panel').append(sessionActions);
    }
    sidebar.hidden = !panel;
    sidebar.dataset.sheetSize = panel ? 'half' : 'peek';
  }
  compact.addEventListener('change', arrangeControls);
  shortLandscape.addEventListener('change', arrangeControls);
  phone.addEventListener('change', () => render(commands.getSong(), commands.getState(), false));
  arrangeControls();
  function openPanel(value) {
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
  const popoverDetails = [projectMenu, moreMenu, advanced].filter(Boolean);
  function closePopover(details, restoreFocus = true) {
    if (!details?.open) return;
    details.open = false;
    if (restoreFocus) details.querySelector('summary')?.focus({preventScroll:true});
  }
  document.addEventListener('click', event => {
    const targetNode = event.target && typeof event.target === 'object' ? event.target : null;
    for (const details of popoverDetails) {
      if (details.open && targetNode && !details.contains(targetNode)) {
        closePopover(details, !document.querySelector(':modal'));
      }
    }
    if (panel === 'mixer' && !sidebar.contains(event.target) && !mixerTrigger.contains(event.target)) openPanel(null);
    if (event.target.closest?.('[data-sheet-close]')) {
      closePopover(event.target.closest('details'));
      return;
    }
    const target = event.target.closest?.('[data-studio-view], button[data-studio-panel], [data-studio-close], [data-studio-seek]');
    if (!target) return;
    try {
      if (target.dataset.studioView) {
        const cameFromMoreMenu = moreMenu.contains(target);
        moreMenu.open = false;
        panel = null;
        commands.setViewMode(target.dataset.studioView);
        if (cameFromMoreMenu) moreMenu.querySelector('summary').focus({preventScroll:true});
      } else if (target.dataset.studioPanel) {
        moreMenu.open = false;
        selectionBar.querySelector('.selection-more')?.removeAttribute('open');
        openPanel(panel === target.dataset.studioPanel ? null : target.dataset.studioPanel);
      }
      else if (target.hasAttribute('data-studio-close')) { openPanel(null); restorePanelFocus(); }
      else commands.seek(Number(target.dataset.studioSeek));
    } catch (error) { onError(error); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      const openPopover = popoverDetails.find(details => details.open && details.contains(event.target));
      if (openPopover) {
        closePopover(openPopover);
        event.preventDefault();
        return;
      }
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
    const mode = state.view.mode;
    const guitarInspector = mode === 'guitar';
    document.body.dataset.studioPanel = panel ?? (guitarInspector ? 'guitar' : 'none');
    sidebar.dataset.sheetSize = panel || guitarInspector ? 'half' : 'peek';
    selectionBar.hidden = !state.selectedNoteIds.length || state.generation?.status === 'ready';
    const selectedNotes = song.notes.filter(note => state.selectedNoteIds.includes(note.id));
    const velocityInput = selectionBar.querySelector('[data-action="set-selected-velocity"]');
    if (velocityInput) {
      velocityInput.value = String(selectedNoteVelocity(selectedNotes));
      velocityInput.disabled = selectedNotes.length === 0;
      velocityInput.setAttribute('aria-label', translate('studioNoteVelocityHelp'));
      const output = velocityInput.nextElementSibling;
      if (output) { output.value = velocityInput.value; output.textContent = velocityInput.value; }
    }
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
    sidebar.hidden = !panel && !guitarInspector;
    guitarSection.hidden = !guitarInspector || Boolean(panel);
    byId('studio-mixer').hidden = panel !== 'mixer';
    byId('harmony-panel').hidden = panel !== 'chords';
    byId('generation-panel').hidden = panel !== 'generate';
    byId('studio-panel-title').textContent = translate(({mixer:'studioMixer',chords:'harmonyLaneLabel',generate:'studioGenerate',expression:'expressionHeading','drum-expression':'percussionExpressionHeading',guitar:'guitarHeading'})[panel ?? (guitarInspector ? 'guitar' : null)] ?? 'studioPanels');
    document.querySelectorAll('button[data-studio-panel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studioPanel===panel)));
    const activeWorkspace = mode === 'drums' ? 'rhythm'
      : mode === 'score' || mode === 'lyrics' || mode === 'combined' && !phone.matches ? 'notation'
        : 'edit';
    document.body.dataset.studioWorkspace = activeWorkspace;
    modeNav.querySelectorAll('[data-studio-workspace]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.studioWorkspace === activeWorkspace));
    });
    document.querySelectorAll('[data-studio-view]').forEach(button => {
      if (!modeNav.contains(button)) button.setAttribute('aria-pressed', String(button.dataset.studioView === mode));
    });
    if (mode === 'piano-roll' || mode === 'combined' && compact.matches) rollTitleRow.append(guitarMode);
    else if (mode === 'guitar') guitarToolbar.prepend(guitarMode);
    else morePopover.prepend(guitarMode);
    guitarMode.setAttribute('aria-pressed', String(mode === 'guitar'));
    if (mode === 'lyrics') lyricsHeading.append(lyricsMode);
    else scoreLayoutGroup.append(lyricsMode);
    const moreSummary = moreMenu.querySelector('summary');
    moreSummary.removeAttribute('data-active-view');
    const moreLabel = moreSummary.querySelector('[data-copy]');
    moreLabel.textContent = translate('studioMoreButton');
    moreSummary.setAttribute('aria-label', translate('studioMoreLabel'));
    if (overviewSong !== JSON.stringify([song.notes,song.chords,song.tracks,song.timing,translate('studioSeekBar', {bar:1})])) renderOverview(song);
    updatePlayback(song,state.playback);
  }
  return {render,openPanel,updatePlayback};
}
