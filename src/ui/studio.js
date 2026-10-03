import { songBarTicks, canonicalSongEndTick } from '../core/timeline.js?v=20261003.76';

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
export function createStudioWorkspace(commands, translate, onError, {
  initialDockOpen = true,
  initialDockWidth = null,
  onDockPreferencesChange = () => {},
  onOpenPanel = () => {}
} = {}) {
  const byId = id => document.getElementById(id);
  let panel = null;
  let lastPanel = 'chords';
  let dockOpen = Boolean(initialDockOpen);
  let dockWidth = Number.isFinite(initialDockWidth) ? Math.max(320, Math.min(480, Math.round(initialDockWidth))) : null;
  let previousSideDock = false;
  let previousViewMode = null;
  let lastChord = null;
  let overviewSong = null;
  const sidebar = document.querySelector('.workspace-sidebar');
  const dockResizer = byId('workspace-sidebar-resizer');
  const toolsPanel = byId('tools-panel');
  const toolsContent = toolsPanel?.querySelector('.studio-tools-content');
  const inspectorActions = sidebar.querySelector('.mobile-panel-peek-actions');
  const followToolsControl = document.querySelector('.follow-mode-tools-control');
  const guitarSection = byId('guitar-section');
  sidebar.append(guitarSection);
  const headerActions = document.querySelector('.header-actions');
  const projectMenu = document.querySelector('.project-menu');
  const projectSummary = projectMenu.querySelector('summary');
  const projectSummaryLabel = projectSummary.querySelector('[data-copy]');
  const projectSection = projectMenu.querySelector('.project-menu-section');
  const appSettingsSection = projectMenu.querySelector('.app-settings-section');
  const headerControls = projectMenu.querySelector('.header-controls');
  const projectActionOrder = [...projectSection.querySelectorAll(':scope > button[data-action]')];
  const desktopProjectActions = document.createElement('div');
  desktopProjectActions.className = 'desktop-project-actions';
  desktopProjectActions.setAttribute('role', 'group');
  desktopProjectActions.dataset.ariaCopy = 'projectActionsHeading';
  const directProjectActions = ['new-song', 'open-project-file', 'save-project-file', 'share-song'];
  const directProjectButtons = directProjectActions.map(action => projectActionOrder.find(button => button.dataset.action === action));
  for (const button of directProjectButtons) {
    if (!button) continue;
    button.classList.add('desktop-project-action');
    button.dataset.ariaCopy = button.dataset.copy;
    desktopProjectActions.append(button);
  }
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
    byId('generation-panel').append(candidateDock);
    const candidateActions = candidateDock.querySelector('.candidate-primary-actions');
    candidateActions?.append(candidateDock.querySelector('.candidate-navigation'));
    candidateActions?.append(byId('lock-accepted-notes'), byId('regenerate-gap'));
    if (!noteTools) byId('note-selection-bar')?.append(fillGap);
  }
  document.querySelector('.brand-block').append(document.querySelector('.song-strip'));
  const transportSettings = document.querySelector('.playback-settings-group');
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
  if (utility) utility.classList.add('studio-advanced');
  if (toolsContent) {
    toolsContent.append(...[utility, advancedBody, loopToggle, resetRange].filter(Boolean));
    if (guitarSection) toolsContent.append(guitarSection);
    if (expressionPanel) toolsContent.append(expressionPanel);
    if (drumExpression) toolsContent.append(drumExpression);
  }
  const panelSwitches = document.querySelector('.studio-panel-switches');
  const mobilePanelActions = document.querySelector('.mobile-panel-peek-actions');
  const sessionActions = byId('generation-session-actions');
  const toolbarActions = document.querySelector('.studio-toolbar-actions');
  const mixerTrigger = document.querySelector('button[data-studio-panel="mixer"]');
  const chordTrigger = document.querySelector('button[data-studio-panel="chords"]');
  const generateTrigger = document.querySelector('button[data-studio-panel="generate"]');
  const guitarMode = byId('guitar-mode-toggle');
  const lyricsMode = document.querySelector('#score-section [data-studio-view="lyrics"]');
  const modeNav = byId('studio-views');
  const modeToolbar = byId('view-controls');
  const panelDockTrigger = document.createElement('button');
  panelDockTrigger.type = 'button';
  panelDockTrigger.className = 'secondary mobile-panel-trigger';
  panelDockTrigger.dataset.studioPanelToggle = '';
  panelDockTrigger.dataset.copy = 'studioPanelsButton';
  panelDockTrigger.dataset.ariaCopy = 'studioPanelsButton';
  panelDockTrigger.dataset.entity = 'studio-panel-trigger';
  panelDockTrigger.textContent = translate('studioPanelsButton');
  panelDockTrigger.hidden = true;
  panelDockTrigger.setAttribute('aria-controls', 'workspace-sidebar');
  panelDockTrigger.setAttribute('aria-expanded', 'false');
  const header = document.querySelector('.page-header');
  const mobileDock = byId('mobile-workspace-dock');
  const transportDock = document.querySelector('.transport-dock');
  const transportHome = transportDock.parentElement;
  const transportButtons = document.querySelector('.transport-buttons');
  const scoreLayoutGroup = document.querySelector('.score-layout-group');
  const scoreLayoutHome = scoreLayoutGroup.parentElement;
  const drumsToolbar = document.querySelector('#drums-section .drums-toolbar');
  const drumsToolbarHome = drumsToolbar.parentElement;
  const rollTitleRow = byId('piano-roll-section').querySelector('.pane-title-row');
  const lyricsHeading = document.querySelector('#lyrics-section .pane-heading');
  const editorToolbar = byId('editor-toolbar');
  const editorTools = editorToolbar.querySelector('.editor-tool-group');
  const editorToolsHome = editorToolbar;
  const editorToolbarHome = editorToolbar.parentElement;
  const selectionSummary = byId('roll-selection');
  const appShell = document.querySelector('.app-shell');
  const workspaceGrid = document.querySelector('.workspace-grid');
  const projectSummaryCopy = projectSummaryLabel.dataset.copy;
  const headerControlsHome = headerControls.parentElement;
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
  editorToolbar.append(selectionSummary);
  transportButtons.append(tempo);
  morePopover.append(morePopover.querySelector('[data-sheet-close]'));
  const phone = matchMedia('(width <= 46rem)');
  const wide = matchMedia('(width >= 68rem)');
  const compact = matchMedia('(width <= 46rem), (orientation: landscape) and (max-height: 500px) and (width < 68rem)');
  const shortLandscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
  const sideDock = matchMedia('(width >= 56rem) and (min-height: 501px)');
  function dockTabFor(value) {
    return ['mixer', 'chords', 'generate', 'tools'].includes(value) ? value : value ? 'tools' : null;
  }
  function setDockOpen(value, persist = true) {
    const next = Boolean(value);
    if (dockOpen === next) return;
    dockOpen = next;
    if (dockOpen && !panel) panel = lastPanel || 'mixer';
    if (persist) onDockPreferencesChange({ dockOpen });
    render(commands.getSong(), commands.getState(), false);
  }
  function setDockWidth(value, persist = false) {
    dockWidth = value === null ? null : Math.max(320, Math.min(480, Math.round(Number(value) || 384)));
    if (dockWidth === null) workspaceGrid?.style?.removeProperty('--studio-dock-width');
    else workspaceGrid?.style?.setProperty('--studio-dock-width', `${dockWidth}px`);
    const announcedWidth = dockWidth ?? Math.round(Number(sidebar.getBoundingClientRect().width) || 384);
    dockResizer?.setAttribute('aria-valuenow', String(announcedWidth));
    dockResizer?.setAttribute('aria-valuetext', translate('dockResizeValue', { width: announcedWidth }));
    if (persist) onDockPreferencesChange({ dockWidth });
  }
  function syncPanelSwitches(activePanel = panel) {
    panelSwitches.setAttribute('role', 'tablist');
    panelSwitches.setAttribute('aria-orientation', 'horizontal');
    panelSwitches.setAttribute('aria-label', translate('studioPanels'));
    const selectedTab = dockTabFor(activePanel);
    for (const button of panelSwitches.querySelectorAll('button[data-studio-panel]')) {
      const active = button.dataset.studioPanel === selectedTab;
      button.textContent = translate(button.dataset.copy);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      button.removeAttribute('aria-pressed');
    }
  }
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
  function syncProjectControls(wideLayout) {
    if (wideLayout) {
      if (!desktopProjectActions.parentElement) headerActions.prepend(desktopProjectActions);
      headerActions.append(projectMenu, headerControls);
      appSettingsSection.hidden = true;
      projectSummaryLabel.dataset.copy = 'projectMoreLabel';
      projectSummaryLabel.textContent = translate('projectMoreLabel');
      projectMenu.dataset.ariaCopy = 'projectMoreLabel';
      return;
    }
    desktopProjectActions.remove();
    projectSection.append(...projectActionOrder);
    headerControlsHome.append(headerControls);
    appSettingsSection.hidden = false;
    projectSummaryLabel.dataset.copy = projectSummaryCopy;
    projectSummaryLabel.textContent = translate(projectSummaryCopy);
    projectMenu.dataset.ariaCopy = 'appMenuLabel';
  }
  function arrangeControls() {
    moreMenu.open = false;
    transportSettings.append(moreMenu);
    mobileDock.hidden = !compact.matches;
    const wideLayout = wide.matches;
    const mediumLayout = !wide.matches && !compact.matches && !shortLandscape.matches;
    const shortLandscapeLayout = shortLandscape.matches && !wide.matches;
    const sideDockLayout = sideDock.matches && !shortLandscapeLayout;
    moreMenu.hidden = wideLayout;
    if (followToolsControl) followToolsControl.hidden = !(wideLayout && !shortLandscapeLayout);
    if (sideDockLayout && !panel) panel = lastPanel = 'mixer';
    if (!sideDockLayout && previousSideDock && !dockOpen) panel = null;
    previousSideDock = sideDockLayout;
    syncProjectControls(wideLayout);
    panelDockTrigger.hidden = sideDockLayout ? dockOpen : !(compact.matches || mediumLayout || shortLandscape.matches);
    panelDockTrigger.textContent = translate('studioPanelsButton');
    panelDockTrigger.setAttribute('aria-label', translate('studioPanelsButton'));
    panelDockTrigger.setAttribute('aria-expanded', String(sideDockLayout ? dockOpen : Boolean(panel)));
    if (compact.matches) mobilePanelActions.append(panelSwitches);
    else inspectorActions.append(panelSwitches);
    modeToolbar.hidden = phone.matches && !shortLandscape.matches;
    if (shortLandscapeLayout) {
      modeToolbar.append(modeNav);
      if (overview.parentElement !== transportMain) transportMain.insertBefore(overview, transportSettings);
      transportMain.insertBefore(historyButtons, overview);
      transportMain.append(panelDockTrigger);
      toolbarActions.append(projectMenu);
      mobileDock.append(transportDock);
      advancedBody.append(tempo, loopToggle, resetRange, follow);
    } else if (compact.matches) {
      transportMain.insertBefore(overview, transportSettings);
      header.insertBefore(modeNav, headerActions);
      headerActions.prepend(projectMenu);
      editorToolbarHome.append(editorToolbar);
      editorToolsHome.prepend(editorTools);
      transportMain.insertBefore(historyButtons, transportSettings);
      modeNav.append(panelDockTrigger);
      mobileDock.append(transportDock, modeNav);
      advancedBody.append(tempo, loopToggle, resetRange, follow);
      editorSettings.hidden = false;
      editorSettings.setAttribute('aria-label', translate('editorSettingsHeading'));
      if (sessionActions) byId('generation-panel').append(sessionActions);
    } else if (wideLayout || mediumLayout) {
      modeNav.append(panelDockTrigger);
      header.insertBefore(modeNav, headerActions);
      header.append(transportDock);
      transportMain.insertBefore(overview, transportSettings);
      transportButtons.append(tempo);
      transportSettings.append(historyButtons);
      if (wideLayout) {
        headerActions.append(projectMenu, headerControls);
        transportSettings.append(follow);
      } else {
        headerActions.prepend(projectMenu);
        toolbarActions.prepend(panelDockTrigger);
      }
      editorToolbarHome.append(editorToolbar);
      editorToolsHome.prepend(editorTools);
      editorToolbar.append(...editorExtras);
      editorSettings.hidden = true;
      if (sessionActions) byId('generation-panel').append(sessionActions);
    } else {
      modeNav.append(panelDockTrigger);
      panelDockTrigger.hidden = true;
      transportHome.append(transportDock);
      headerActions.prepend(projectMenu);
      header.insertBefore(modeNav, headerActions);
      editorToolbarHome.append(editorToolbar);
      editorToolsHome.prepend(editorTools);
      transportMain.insertBefore(overview, transportSettings);
      transportButtons.append(tempo);
      transportSettings.append(historyButtons);
      editorToolbar.append(...editorExtras);
      editorSettings.hidden = true;
      if (sessionActions) byId('generation-panel').append(sessionActions);
    }
    sidebar.hidden = sideDockLayout ? !dockOpen : !panel;
    if (dockResizer) dockResizer.hidden = !sideDockLayout || !dockOpen;
    document.body.dataset.studioDockOpen = String(sideDockLayout && dockOpen);
    sidebar.dataset.sheetSize = panel ? 'half' : 'peek';
    syncPanelSwitches();
  }
  compact.addEventListener('change', arrangeControls);
  wide.addEventListener('change', arrangeControls);
  sideDock.addEventListener('change', () => {
    arrangeControls();
    render(commands.getSong(), commands.getState(), false);
  });
  shortLandscape.addEventListener('change', () => {
    arrangeControls();
    render(commands.getSong(), commands.getState(), false);
  });
  phone.addEventListener('change', () => render(commands.getSong(), commands.getState(), false));
  if (dockWidth !== null) setDockWidth(dockWidth);
  arrangeControls();
  dockResizer.setAttribute('aria-valuenow', String(dockWidth ?? Math.round(Number(sidebar.getBoundingClientRect().width) || 384)));
  dockResizer.setAttribute('aria-valuetext', translate('dockResizeValue', { width: dockWidth ?? Math.round(Number(sidebar.getBoundingClientRect().width) || 384) }));
  function openPanel(value) {
    const wasOpen = sideDock.matches ? dockOpen : Boolean(panel);
    if (value) {
      const tab = dockTabFor(value);
      if (tab) lastPanel = tab;
      panel = value;
      if (sideDock.matches && !dockOpen) {
        dockOpen = true;
        onDockPreferencesChange({ dockOpen });
      }
    } else if (sideDock.matches) {
      dockOpen = false;
      onDockPreferencesChange({ dockOpen });
    } else panel = null;
    render(commands.getSong(), commands.getState(), false);
    if (panel && !wasOpen && (sideDock.matches ? dockOpen : true)) {
      const initialFocus = compact.matches
        ? panelSwitches.querySelector(`button[data-studio-panel="${dockTabFor(panel)}"]`)
        : sideDock.matches
          ? panelSwitches.querySelector(`button[data-studio-panel="${dockTabFor(panel)}"]`)
          : sidebar.querySelector('[data-studio-close]');
      initialFocus?.focus({preventScroll:true});
    }
    if (panel && (sideDock.matches ? dockOpen : true)) onOpenPanel(panel);
  }
  function restorePanelFocus() {
    if (compact.matches || !sideDock.matches || !dockOpen) {
      panelDockTrigger.focus({preventScroll:true});
      return;
    }
    const trigger = document.querySelector(`button[data-studio-panel="${lastPanel}"]`);
    const fallback = document.querySelector('[data-studio-view][aria-pressed="true"]');
    (trigger ?? fallback)?.focus({preventScroll:true});
  }
  const popoverDetails = [projectMenu, moreMenu].filter(Boolean);
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
    const target = event.target.closest?.('[data-studio-view], button[data-studio-panel], [data-studio-panel-toggle], [data-studio-close], [data-studio-seek]');
    if (target && 'studioPanelToggle' in target.dataset) {
      if (sideDock.matches) {
        if (dockOpen) {
          setDockOpen(false);
          restorePanelFocus();
        } else {
          setDockOpen(true);
          const tab = panelSwitches.querySelector(`button[data-studio-panel="${dockTabFor(panel)}"]`);
          tab?.focus({ preventScroll: true });
          onOpenPanel(panel);
        }
      } else if (panel) {
        openPanel(null); restorePanelFocus();
      } else {
        openPanel(lastPanel || 'chords');
      }
      return;
    }
    if (!sideDock.matches && panel === 'mixer' && !sidebar.contains(event.target) && !mixerTrigger.contains(event.target)) openPanel(null);
    if (event.target.closest?.('[data-sheet-close]')) {
      closePopover(event.target.closest('details'));
      return;
    }
    if (!target) return;
    try {
      if (target.dataset.studioView) {
        moreMenu.open = false;
        const cameFromMoreMenu = moreMenu.contains(target);
        if (!sideDock.matches) panel = null;
        const mode = target.dataset.studioView === 'guitar' && commands.getState().view.mode === 'guitar'
          ? 'piano-roll' : target.dataset.studioView;
        commands.setViewMode(mode);
        if (cameFromMoreMenu) moreMenu.querySelector('summary').focus({preventScroll:true});
      } else if (target.dataset.studioPanel) {
        moreMenu.open = false;
        selectionBar.querySelector('.selection-more')?.removeAttribute('open');
        const nextPanel = panel === target.dataset.studioPanel && !compact.matches && !sideDock.matches ? null : target.dataset.studioPanel;
        openPanel(nextPanel);
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
    if (event.key === 'Escape' && !event.defaultPrevented && sidebar.contains(event.target) && panel && !sideDock.matches) { openPanel(null); restorePanelFocus(); }
    const currentPanelTab = event.target.closest?.('.studio-panel-switches [role="tab"]');
    if (currentPanelTab && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      const tabs = [...panelSwitches.querySelectorAll('button[data-studio-panel]')].filter(tab => tab.getClientRects().length);
      const index = tabs.indexOf(currentPanelTab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[next]?.focus({preventScroll:true});
      tabs[next]?.click();
      return;
    }
    const current = event.target.closest?.('#studio-views > [data-studio-view], #studio-views > .studio-more > summary');
    if (!current || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = [...modeNav.querySelectorAll(':scope > [data-studio-view], :scope > .studio-more > summary')].filter(tab => tab.getClientRects().length);
    const index = tabs.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[next].focus(); tabs[next].click();
  });

  let dockResizePointer = null;
  dockResizer.addEventListener('pointerdown', event => {
    if (!sideDock.matches || dockResizer.hidden || event.button !== 0 || !event.isPrimary) return;
    dockResizePointer = {
      id: event.pointerId,
      x: event.clientX,
      width: Number(sidebar.getBoundingClientRect().width) || dockWidth || 384,
      savedWidth: dockWidth
    };
    try { dockResizer.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  });
  dockResizer.addEventListener('pointermove', event => {
    if (dockResizePointer?.id === event.pointerId) setDockWidth(dockResizePointer.width + dockResizePointer.x - event.clientX);
  });
  dockResizer.addEventListener('pointerup', event => {
    if (dockResizePointer?.id !== event.pointerId) return;
    if (dockWidth !== null) setDockWidth(dockWidth, true);
    dockResizePointer = null;
    try { dockResizer.releasePointerCapture(event.pointerId); } catch {}
  });
  dockResizer.addEventListener('pointercancel', event => {
    if (dockResizePointer?.id !== event.pointerId) return;
    setDockWidth(dockResizePointer.savedWidth);
    dockResizePointer = null;
  });
  dockResizer.addEventListener('keydown', event => {
    if (!sideDock.matches || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const currentWidth = dockWidth ?? (Number(sidebar.getBoundingClientRect().width) || 384);
    const step = event.shiftKey ? 32 : 16;
    const nextWidth = event.key === 'Home' ? 320 : event.key === 'End' ? 480
      : currentWidth + (event.key === 'ArrowLeft' ? step : -step);
    event.preventDefault();
    setDockWidth(nextWidth, true);
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
    if (autoSelect && state.selectedChordId && state.selectedChordId !== lastChord) {
      panel = 'chords'; lastPanel = panel;
      if (sideDock.matches && !dockOpen) { dockOpen = true; onDockPreferencesChange({ dockOpen }); }
    }
    lastChord = state.selectedChordId;
    const mode = state.view.mode;
    const guitarInspector = mode === 'guitar';
    if (guitarInspector && previousViewMode !== 'guitar' && sideDock.matches && dockOpen) panel = lastPanel = 'tools';
    previousViewMode = mode;
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
    sidebar.hidden = sideDock.matches ? !dockOpen : !panel && !guitarInspector;
    if (dockResizer) dockResizer.hidden = !sideDock.matches || !dockOpen;
    document.body.dataset.studioDockOpen = String(sideDock.matches && dockOpen);
    if (dockResizer && !dockResizer.hidden) {
      const visibleWidth = dockWidth ?? Math.round(Number(sidebar.getBoundingClientRect().width) || 384);
      dockResizer.setAttribute('aria-valuenow', String(visibleWidth));
      dockResizer.setAttribute('aria-valuetext', translate('dockResizeValue', { width: visibleWidth }));
    }
    const tabValue = dockTabFor(panel ?? (guitarInspector ? 'guitar' : null));
    guitarSection.hidden = !(guitarInspector || panel === 'guitar');
    byId('studio-mixer').hidden = panel !== 'mixer';
    byId('harmony-panel').hidden = panel !== 'chords';
    byId('generation-panel').hidden = panel !== 'generate';
    toolsPanel.hidden = tabValue !== 'tools';
    byId('studio-panel-title').textContent = translate(({mixer:'studioMixer',chords:'harmonyLaneLabel',generate:'studioGenerate',tools:'toolsHeading',expression:'expressionHeading','drum-expression':'percussionExpressionHeading',guitar:'guitarHeading'})[panel ?? (guitarInspector ? 'guitar' : null)] ?? 'studioPanels');
    panelDockTrigger.textContent = translate('studioPanelsButton');
    panelDockTrigger.setAttribute('aria-label', translate('studioPanelsButton'));
    const dockCapable = sideDock.matches && !shortLandscape.matches;
    panelDockTrigger.hidden = dockCapable ? dockOpen : !(compact.matches || (!wide.matches && !shortLandscape.matches) || shortLandscape.matches);
    panelDockTrigger.setAttribute('aria-expanded', String(dockCapable ? dockOpen : Boolean(panel)));
    syncPanelSwitches(panel ?? (guitarInspector ? 'guitar' : null));
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
    if (shortLandscape.matches) toolbarActions.append(guitarMode);
    else rollTitleRow.append(guitarMode);
    guitarMode.setAttribute('aria-pressed', String(mode === 'guitar'));
    if (mode === 'lyrics') lyricsHeading.append(lyricsMode);
    else scoreLayoutGroup.append(lyricsMode);
    if (shortLandscape.matches) {
      if (scoreLayoutGroup.parentElement !== scoreLayoutHome) scoreLayoutHome.append(scoreLayoutGroup);
      if (drumsToolbar.parentElement !== drumsToolbarHome) drumsToolbarHome.append(drumsToolbar);
      if (editorToolbar.parentElement !== editorToolbarHome) editorToolbarHome.append(editorToolbar);
      if (mode === 'score') toolbarActions.append(scoreLayoutGroup);
      else if (mode === 'lyrics') toolbarActions.append(lyricsMode);
      else if (mode === 'drums') toolbarActions.append(drumsToolbar);
      else toolbarActions.append(editorToolbar);
      toolbarActions.append(projectMenu);
    } else {
      if (scoreLayoutGroup.parentElement !== scoreLayoutHome) scoreLayoutHome.append(scoreLayoutGroup);
      if (drumsToolbar.parentElement !== drumsToolbarHome) drumsToolbarHome.append(drumsToolbar);
      if (editorToolbar.parentElement !== editorToolbarHome) editorToolbarHome.append(editorToolbar);
    }
    const moreSummary = moreMenu.querySelector('summary');
      moreSummary.removeAttribute('data-active-view');
      const moreLabel = moreSummary.querySelector('[data-copy]');
    moreLabel.textContent = translate('transportAdvanced');
    moreLabel.dataset.copy = 'transportAdvanced';
    moreSummary.setAttribute('aria-label', translate('transportAdvanced'));
    if (overviewSong !== JSON.stringify([song.notes,song.chords,song.tracks,song.timing,translate('studioSeekBar', {bar:1})])) renderOverview(song);
    updatePlayback(song,state.playback);
  }
  return {render,openPanel,updatePlayback};
}
