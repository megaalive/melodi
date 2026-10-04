import { songBarTicks, canonicalSongEndTick } from '../core/timeline.js?v=20261003.80';

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
  initialDockSlots = null,
  initialDockVisibleCount = 2,
  initialDockPanelByWorkspace = null,
  initialGuitarZoneOpen = null,
  initialGuitarZoneHeight = null,
  onDockPreferencesChange = () => {},
  onGuitarZonePreferencesChange = () => {},
  onGuitarZoneLayout = () => {},
  onOpenPanel = () => {}
} = {}) {
  const byId = id => document.getElementById(id);
  let panel = null;
  let lastPanel = 'chords';
  let dockOpen = Boolean(initialDockOpen);
  let dockWidth = Number.isFinite(initialDockWidth) ? Math.max(320, Math.min(480, Math.round(initialDockWidth))) : null;
  let dockVisibleCount = Math.max(0, Math.min(2, Math.trunc(Number(initialDockVisibleCount)) || 0));
  let dockSlots = {
    generate: typeof initialDockSlots?.generate === 'boolean' ? initialDockSlots.generate : dockVisibleCount > 0,
    secondary: typeof initialDockSlots?.secondary === 'boolean' ? initialDockSlots.secondary : dockVisibleCount > 1
  };
  let dockPanelByWorkspace = {
    edit: initialDockPanelByWorkspace?.edit ?? 'chords',
    notation: initialDockPanelByWorkspace?.notation ?? 'mixer',
    rhythm: initialDockPanelByWorkspace?.rhythm ?? 'drum-expression'
  };
  let previousSideDock = false;
  let previousViewMode = null;
  let previousWorkspace = null;
  let coreControlsVisible = false;
  let lastChord = null;
  let overviewSong = null;
  const sidebar = document.querySelector('.workspace-sidebar');
  const dockResizer = byId('workspace-sidebar-resizer');
  const toolsPanel = byId('tools-panel');
  const toolsContent = toolsPanel?.querySelector('.studio-tools-content');
  const inspectorActions = sidebar.querySelector('.mobile-panel-peek-actions');
  const followToolsControl = document.querySelector('.follow-mode-tools-control');
  const guitarSection = byId('guitar-section');
  const workspaceCanvas = byId('workspace-canvas');
  const guitarZoneFloorHeight = 280;
  const guitarZoneMaxHeight = 440;
  const coreControls = document.createElement('section');
  coreControls.id = 'studio-core-controls';
  coreControls.className = 'studio-core-controls';
  coreControls.dataset.ariaCopy = 'studioCoreControlsHeading';
  coreControls.setAttribute('role', 'region');
  workspaceCanvas?.prepend(coreControls);
  const coreMixer = document.createElement('div');
  coreMixer.id = 'studio-core-mixer';
  coreMixer.className = 'studio-core-mixer';
  coreMixer.dataset.ariaCopy = 'studioMixer';
  coreMixer.setAttribute('role', 'group');
  const makeCoreMixChannel = (channelId, labelKey) => {
    const label = document.createElement('label');
    label.className = 'studio-core-mix-channel';
    label.dataset.channelId = channelId;
    const name = document.createElement('span');
    name.dataset.copy = labelKey;
    name.textContent = translate(labelKey);
    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.step = '1';
    volume.value = '100';
    volume.dataset.action = 'set-instrument-volume';
    volume.dataset.channelId = channelId;
    volume.dataset.channelVolume = '';
    volume.dataset.focusKey = `core-mix:${channelId}:volume`;
    label.append(name, volume);
    return label;
  };
  coreMixer.append(
    makeCoreMixChannel('melody', 'melodyInstrumentLabel'),
    makeCoreMixChannel('harmony', 'sketchHarmony'),
    makeCoreMixChannel('bass', 'sketchBass')
  );
  coreMixer.setAttribute('aria-label', translate('studioMixer'));
  const syncCoreMixerLabels = () => {
    coreMixer.setAttribute('aria-label', translate('studioMixer'));
    for (const name of coreMixer.querySelectorAll('[data-copy]')) name.textContent = translate(name.dataset.copy);
  };
  const guitarZone = document.createElement('section');
  guitarZone.id = 'studio-guitar-zone';
  guitarZone.className = 'studio-guitar-zone';
  guitarZone.dataset.entity = 'guitar-zone';
  let guitarZoneOpen = typeof initialGuitarZoneOpen === 'boolean'
    ? initialGuitarZoneOpen
    : typeof window !== 'undefined' && window.matchMedia('(width >= 90rem)').matches && window.innerHeight >= 800;
  const hasSavedGuitarZoneHeight = Number.isFinite(initialGuitarZoneHeight);
  const guitarZoneToggle = document.createElement('button');
  guitarZoneToggle.type = 'button';
  guitarZoneToggle.className = 'secondary guitar-zone-toggle';
  guitarZoneToggle.dataset.studioGuitarZoneToggle = '';
  guitarZoneToggle.dataset.entity = 'guitar-zone-toggle';
  guitarZoneToggle.dataset.copy = guitarZoneOpen ? 'guitarZoneCloseButton' : 'guitarZoneOpenButton';
  guitarZoneToggle.setAttribute('aria-controls', 'guitar-section');
  const guitarLocalToolbar = guitarSection?.querySelector('.guitar-local-toolbar');
  guitarLocalToolbar?.append(guitarZoneToggle);
  const guitarStatus = byId('guitar-status');
  if (guitarStatus && guitarLocalToolbar && guitarStatus.parentElement !== guitarLocalToolbar) {
    guitarLocalToolbar.append(guitarStatus);
  }
  const guitarLegend = byId('guitar-legend');
  if (guitarLegend && guitarLocalToolbar && guitarLegend.parentElement !== guitarLocalToolbar) {
    guitarLocalToolbar.append(guitarLegend);
  }
  const guitarResizer = document.createElement('div');
  guitarResizer.id = 'studio-guitar-resizer';
  guitarResizer.className = 'studio-guitar-resizer';
  guitarResizer.dataset.entity = 'guitar-zone-resizer';
  guitarResizer.setAttribute('role', 'separator');
  guitarResizer.setAttribute('aria-orientation', 'horizontal');
  guitarResizer.setAttribute('aria-controls', 'guitar-section');
  guitarResizer.setAttribute('tabindex', '0');
  const guitarHeading = guitarSection?.querySelector('.guitar-pane-heading');
  if (guitarHeading) guitarZone.append(guitarHeading);
  guitarZone.append(guitarResizer);
  if (guitarSection) guitarZone.append(guitarSection);
  workspaceCanvas?.append(guitarZone);
  // Tinggi minimum mengikuti isi zona: judul, splitter, dan kanvas TAB atau
  // Fretboard. Kalau splitter boleh lebih kecil, kanvas terpotong diam-diam.
  function guitarZoneContentHeight() {
    const headingHeight = guitarHeading?.offsetHeight ?? 0;
    const resizerHeight = guitarResizer.offsetHeight || 8;
    const canvasHeight = Math.max(
      Number(byId('guitar-tab')?.getAttribute('height')) || 0,
      Number(byId('guitar')?.getAttribute('height')) || 0,
    );
    let decoration = 0;
    const measureBox = element => {
      if (!element || typeof getComputedStyle !== 'function') return 0;
      const style = getComputedStyle(element);
      return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((total, property) => total + (Number.parseFloat(style[property]) || 0), 0);
    };
    decoration = measureBox(guitarSection) + Math.max(measureBox(byId('guitar-tab-scroll')), measureBox(byId('guitar-scroll')));
    return Math.ceil(headingHeight + resizerHeight + canvasHeight + decoration);
  }
  const guitarZoneMinHeight = () => Math.max(guitarZoneFloorHeight, guitarZoneContentHeight());
  const defaultGuitarZoneHeight = () => Math.max(guitarZoneMinHeight(), Math.min(guitarZoneMaxHeight,
    Math.round((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.34)));
  let guitarZoneHeight = hasSavedGuitarZoneHeight
    ? Math.max(guitarZoneMinHeight(), Math.min(guitarZoneMaxHeight, Math.round(initialGuitarZoneHeight)))
    : defaultGuitarZoneHeight();
  let guitarZoneHeightExplicit = hasSavedGuitarZoneHeight;
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
  const desktopProjectLabel = document.createElement('span');
  desktopProjectLabel.className = 'desktop-project-actions-label';
  desktopProjectLabel.dataset.copy = 'projectActionsHeading';
  const directProjectActions = ['new-song', 'open-project-file', 'save-project-file', 'share-song'];
  const directProjectButtons = directProjectActions.map(action => projectActionOrder.find(button => button.dataset.action === action));
  const additionalProjectButtons = projectActionOrder.filter(button => !directProjectActions.includes(button.dataset.action));
  for (const button of projectActionOrder) {
    if (!button) continue;
    button.classList.add('desktop-project-action');
    button.dataset.ariaCopy = button.dataset.copy;
  }
  desktopProjectActions.append(desktopProjectLabel, ...directProjectButtons.filter(Boolean));
  const mixer = byId('studio-mixer-channels');
  const expressionPanel = byId('expression-panel');
  if (expressionPanel) sidebar.append(expressionPanel);
  const melody = document.querySelector('.instrument-mix-strip');
  const melodyHome = melody?.parentElement;
  melody?.classList.add('studio-melody-channel');
  const harmonyTools = byId('harmony-timeline-tools');
  const chordAddButton = harmonyTools?.querySelector('[data-action="add-chord"]');
  const chordAddHome = chordAddButton?.parentElement;
  const chordQuickGroup = document.createElement('div');
  chordQuickGroup.className = 'studio-quick-chord';
  chordQuickGroup.setAttribute('role', 'group');
  chordQuickGroup.dataset.ariaCopy = 'studioChordQuickLabel';
  if (chordAddButton) chordQuickGroup.append(chordAddButton);
  const generationPanel = byId('generation-panel');
  const generationForm = byId('generation-form');
  const generationFormHome = generationForm?.parentElement;
  const generationAnchorActions = generationForm?.querySelector('#generation-anchor-actions');
  const generationPrimaryActions = generationForm?.querySelector('.generation-primary-actions');
  const generateButton = generationPrimaryActions?.querySelector('button[type="submit"]');
  const generationQuickGroup = document.createElement('div');
  generationQuickGroup.className = 'studio-generation-quick-group';
  generationQuickGroup.setAttribute('role', 'group');
  const generationQuickGroupLabel = document.createElement('span');
  generationQuickGroupLabel.className = 'studio-generation-quick-label';
  generationQuickGroupLabel.classList.add('visually-hidden');
  const syncGenerationQuickGroup = () => {
    const label = translate('generationHeading');
    generationQuickGroup.setAttribute('aria-label', label);
    generationQuickGroupLabel.textContent = label;
  };
  syncGenerationQuickGroup();
  generationQuickGroup.append(generationQuickGroupLabel);
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
  mixer.prepend(melody);
  mixer.append(document.querySelector('.sketch-controls'));
  for (const slider of document.querySelectorAll('[data-channel-volume]')) {
    const value = document.createElement('span');
    value.dataset.studioVolume = '';
    value.className = 'studio-volume-value';
    value.setAttribute('aria-hidden', 'true');
    slider.after(value);
  }
  byId('harmony-panel').prepend(harmonyTools);
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
  const seekForm = document.querySelector('form[data-action="seek"]');
  const loopRangeForm = advancedBody?.querySelector('form.loop-range') || coreControls.querySelector('form.loop-range');
  const loopSeekGroup = document.createElement('div');
  loopSeekGroup.className = 'studio-loop-seek-group';
  loopSeekGroup.setAttribute('role', 'group');
  const loopSeekLabel = document.createElement('span');
  loopSeekLabel.className = 'studio-loop-seek-label';
  const loopSeekGroupLabel = () => `${translate('loopEnabledLabel')} / ${translate('seekButton')}`;
  const loopSeekCopy = [
    [seekForm?.querySelector('label > span'), 'studioSeekTickShortLabel'],
    [loopRangeForm?.querySelector('label:nth-of-type(1) > span'), 'studioLoopStartShortLabel'],
    [loopRangeForm?.querySelector('label:nth-of-type(2) > span'), 'studioLoopEndShortLabel'],
    [loopRangeForm?.querySelector('button[type="submit"]'), 'studioApplyLoopShortButton']
  ].filter(([element]) => element);
  const loopSeekAria = [
    [seekForm?.querySelector('label > input'), 'seekTickLabel'],
    [loopRangeForm?.querySelector('label:nth-of-type(1) > input'), 'loopStartLabel'],
    [loopRangeForm?.querySelector('label:nth-of-type(2) > input'), 'loopEndLabel'],
    [loopRangeForm?.querySelector('button[type="submit"]'), 'applyLoopButton']
  ].filter(([element]) => element);
  for (const [element, copy] of loopSeekCopy) element.dataset.copy = copy;
  const syncLoopSeekCopy = () => {
    for (const [element, copy] of loopSeekCopy) element.textContent = translate(copy);
  };
  const syncLoopSeekAria = () => {
    for (const [element, copy] of loopSeekAria) element.setAttribute('aria-label', translate(copy));
  };
  syncLoopSeekCopy();
  syncLoopSeekAria();
  loopSeekGroup.setAttribute('aria-label', loopSeekGroupLabel());
  loopSeekLabel.textContent = loopSeekGroupLabel();
  loopSeekGroup.append(loopSeekLabel, ...[seekForm, loopRangeForm].filter(Boolean));
  const tempo = document.querySelector('.tempo-control');
  const follow = document.querySelector('.follow-mode-control');
  const transportMain = document.querySelector('.transport-main');
  const moreMenu = document.querySelector('.studio-more');
  const morePopover = document.querySelector('.studio-more-popover');
  const historyButtons = document.querySelector('.history-buttons');
  const utility = document.querySelector('.utility-card');
  const utilityHome = utility?.parentElement;
  const loopToggle = document.querySelector('.loop-toggle');
  const loopToggleHome = loopToggle?.parentElement;
  const resetRange = byId('reset-playback-range');
  const resetRangeHome = resetRange?.parentElement;
  const advancedBodyHome = advancedBody?.parentElement;
  if (utility) utility.classList.add('studio-advanced');
  if (toolsContent) {
    toolsContent.append(...[utility, advancedBody, expressionPanel].filter(Boolean));
  }
  const panelSwitches = document.querySelector('.studio-panel-switches');
  const panelBodyOrder = [drumExpression, byId('studio-mixer'), byId('harmony-panel'), generationPanel, toolsPanel].filter(Boolean);
  function makeDockSlot(name, copy) {
    const root = document.createElement('section');
    root.className = `studio-dock-slot studio-dock-slot-${name}`;
    root.dataset.slot = name;
    const header = document.createElement('div');
    header.className = 'studio-dock-slot-heading';
    const title = document.createElement('strong');
    title.dataset.copy = copy;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'secondary studio-dock-slot-toggle';
    toggle.dataset.dockSlotToggle = name;
    toggle.setAttribute('aria-controls', `studio-dock-slot-${name}-body`);
    const body = document.createElement('div');
    body.id = `studio-dock-slot-${name}-body`;
    body.className = 'studio-dock-slot-body';
    root.append(header, body);
    header.append(title, toggle);
    return { root, body, toggle, title };
  }
  const generateSlot = makeDockSlot('generate', 'studioGenerateSlot');
  const secondarySlot = makeDockSlot('secondary', 'studioSecondarySlot');
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
  const rollCollapse = byId('piano-roll-collapse');
  const rollCollapseHome = rollCollapse?.parentElement;
  const rollHelpTrigger = document.querySelector('#piano-roll-section [data-action="show-help"]');
  const rollHelpHome = rollHelpTrigger?.parentElement;
  const guitarSheetTrigger = document.createElement('button');
  guitarSheetTrigger.type = 'button';
  guitarSheetTrigger.className = 'secondary mobile-guitar-trigger';
  guitarSheetTrigger.dataset.studioPanel = 'guitar';
  guitarSheetTrigger.dataset.copy = 'guitarHeading';
  guitarSheetTrigger.dataset.entity = 'guitar-sheet-trigger';
  guitarSheetTrigger.setAttribute('aria-controls', 'studio-guitar-zone');
  guitarSheetTrigger.textContent = translate('guitarHeading');
  function syncGuitarZoneControls() {
    const copy = guitarZoneOpen ? 'guitarZoneCloseButton' : 'guitarZoneOpenButton';
    const buttonText = translate(copy);
    const fullLabel = `${buttonText} ${translate('guitarHeading')}`;
    guitarZoneToggle.dataset.copy = copy;
    guitarZoneToggle.textContent = buttonText;
    guitarZoneToggle.setAttribute('aria-label', fullLabel);
    guitarZoneToggle.setAttribute('title', fullLabel);
    guitarZoneToggle.setAttribute('aria-expanded', String(guitarZoneOpen));
    guitarZoneToggle.setAttribute('aria-pressed', String(guitarZoneOpen));
    guitarMode.setAttribute('aria-pressed', String(guitarZoneOpen));
    guitarSheetTrigger.setAttribute('aria-pressed', String(panel === 'guitar'));
    guitarZone.dataset.open = String(guitarZoneOpen);
    workspaceCanvas.dataset.guitarZoneOpen = String(guitarZoneOpen);
    guitarSection.dataset.guitarZoneOpen = String(guitarZoneOpen);
    guitarResizer.hidden = !guitarZoneOpen;
  }
  function setGuitarZoneOpen(value, persist = true) {
    const next = Boolean(value);
    if (guitarZoneOpen === next) return;
    guitarZoneOpen = next;
    syncGuitarZoneControls();
    if (persist) onGuitarZonePreferencesChange({ guitarZoneOpen });
    render(commands.getSong(), commands.getState(), false);
  }
  function setGuitarZoneHeight(value, persist = false) {
    guitarZoneHeight = Math.max(guitarZoneMinHeight(), Math.min(guitarZoneMaxHeight, Math.round(Number(value) || defaultGuitarZoneHeight())));
    guitarZoneHeightExplicit = true;
    workspaceCanvas?.style?.setProperty('--studio-guitar-zone-height', `${guitarZoneHeight}px`);
    syncGuitarZoneHeightAttributes();
    if (persist) onGuitarZonePreferencesChange({ guitarZoneHeight });
  }
  function syncGuitarZoneHeightAttributes() {
    const minimum = guitarZoneMinHeight();
    // CSS menegakkan minimum yang sama, jadi aria-valuenow tidak boleh lebih kecil.
    const announced = Math.max(minimum, guitarZoneHeight);
    workspaceCanvas?.style?.setProperty('--studio-guitar-zone-min', `${minimum}px`);
    guitarResizer.setAttribute('aria-label', translate('guitarZoneResizeLabel'));
    guitarResizer.setAttribute('aria-valuemin', String(minimum));
    guitarResizer.setAttribute('aria-valuemax', String(guitarZoneMaxHeight));
    guitarResizer.setAttribute('aria-valuenow', String(announced));
    guitarResizer.setAttribute('aria-valuetext', translate('guitarZoneResizeValue', { height: announced }));
  }
  syncGuitarZoneControls();
  if (hasSavedGuitarZoneHeight) setGuitarZoneHeight(guitarZoneHeight);
  else syncGuitarZoneHeightAttributes();
  if (typeof window !== 'undefined') window.addEventListener?.('resize', () => {
    if (guitarZoneHeightExplicit) return;
    guitarZoneHeight = defaultGuitarZoneHeight();
    syncGuitarZoneHeightAttributes();
  });
  let guitarResizePointer = null;
  guitarResizer.addEventListener('pointerdown', event => {
    if (!guitarZoneOpen || guitarResizer.hidden || event.button !== 0 || !event.isPrimary) return;
    const measuredHeight = Math.round(guitarZone.getBoundingClientRect?.().height || guitarZoneHeight);
    guitarZoneHeight = Math.max(guitarZoneMinHeight(), Math.min(guitarZoneMaxHeight, measuredHeight));
    syncGuitarZoneHeightAttributes();
    guitarResizePointer = {
      id: event.pointerId,
      y: event.clientY,
      height: guitarZoneHeight,
      wasExplicit: guitarZoneHeightExplicit
    };
    try { guitarResizer.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  });
  guitarResizer.addEventListener('pointermove', event => {
    if (guitarResizePointer?.id === event.pointerId) setGuitarZoneHeight(guitarResizePointer.height - (event.clientY - guitarResizePointer.y));
  });
  guitarResizer.addEventListener('pointerup', event => {
    if (guitarResizePointer?.id !== event.pointerId) return;
    setGuitarZoneHeight(guitarZoneHeight, true);
    guitarResizePointer = null;
    try { guitarResizer.releasePointerCapture(event.pointerId); } catch {}
  });
  guitarResizer.addEventListener('pointercancel', event => {
    if (guitarResizePointer?.id !== event.pointerId) return;
    if (guitarResizePointer.wasExplicit) setGuitarZoneHeight(guitarResizePointer.height);
    else {
      guitarZoneHeightExplicit = false;
      guitarZoneHeight = defaultGuitarZoneHeight();
      workspaceCanvas?.style?.removeProperty?.('--studio-guitar-zone-height');
      syncGuitarZoneHeightAttributes();
    }
    guitarResizePointer = null;
  });
  guitarResizer.addEventListener('keydown', event => {
    if (!guitarZoneOpen || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const step = event.shiftKey ? 32 : 16;
    const nextHeight = event.key === 'Home' ? guitarZoneMinHeight() : event.key === 'End' ? guitarZoneMaxHeight
      : guitarZoneHeight + (event.key === 'ArrowUp' ? step : -step);
    event.preventDefault();
    setGuitarZoneHeight(nextHeight, true);
  });
  const panelDockTrigger = document.createElement('button');
  panelDockTrigger.type = 'button';
  panelDockTrigger.className = 'secondary mobile-panel-trigger';
  panelDockTrigger.dataset.studioPanelToggle = '';
  panelDockTrigger.dataset.copy = 'studioPanelsButton';
  panelDockTrigger.dataset.ariaCopy = 'studioPanelsButton';
  panelDockTrigger.dataset.entity = 'studio-panel-trigger';
  panelDockTrigger.textContent = translate('studioPanelsButton');
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
  const scoreHeading = document.querySelector('.score-pane-heading');
  const drumsHeading = document.querySelector('#drums-section .drums-pane-heading');
  const workspaceHeadingRows = [rollTitleRow, scoreHeading, lyricsHeading, drumsHeading].filter(Boolean);
  const workspaceHeadingHomes = new Map(workspaceHeadingRows.map(row => [row, row.parentElement]));
  function syncWideWorkspaceHeading(mode = commands.getState().view.mode) {
    for (const row of workspaceHeadingRows) {
      if (row.parentElement === toolbarActions) {
        const home = workspaceHeadingHomes.get(row);
        home?.prepend(row);
        if (row === rollTitleRow && home) {
          if (rollCollapse?.parentElement === toolbarActions) home.append(rollCollapse);
          home.hidden = false;
        }
      }
    }
    if ((!wide.matches && !sideDock.matches) || shortLandscape.matches || !toolbarActions) return;
    const selectedRows = mode === 'drums'
      ? [drumsHeading]
      : mode === 'lyrics'
        ? [lyricsHeading]
        : mode === 'score'
          ? [scoreHeading]
          : mode === 'combined'
            ? [rollTitleRow, scoreHeading]
            : [rollTitleRow];
    for (const row of selectedRows.filter(Boolean)) {
      toolbarActions.append(row);
      if (row === rollTitleRow) {
        if (rollCollapse) toolbarActions.append(rollCollapse);
        workspaceHeadingHomes.get(row).hidden = true;
      }
    }
  }
  const editorToolbar = byId('editor-toolbar');
  const editorTools = editorToolbar.querySelector('.editor-tool-group');
  const editorToolsHome = editorToolbar;
  const editorZoomControl = editorToolbar.querySelector('.zoom-control');
  const editorToolbarHome = editorToolbar.parentElement;
  const selectionSummary = byId('roll-selection');
  const appShell = document.querySelector('.app-shell');
  const workspaceGrid = document.querySelector('.workspace-grid');
  if (appShell && workspaceGrid) appShell.insertBefore(coreControls, workspaceGrid);
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
  const extraWide = matchMedia('(width >= 90rem)');
  const dualDock = matchMedia('(width >= 90rem) and (min-height: 1000px)');
  const compact = matchMedia('(width <= 46rem), (orientation: landscape) and (max-height: 500px) and (width < 68rem)');
  const shortLandscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
  const sideDock = matchMedia('(width >= 56rem) and (min-height: 501px)');
  function workspaceForMode(mode = commands.getState().view.mode) {
    return mode === 'drums' ? 'rhythm'
      : mode === 'score' || mode === 'lyrics' || mode === 'combined' && !phone.matches ? 'notation'
        : 'edit';
  }
  const allowedPanels = {
    edit: ['generate', 'chords', 'mixer', 'tools'],
    notation: ['mixer', 'tools'],
    rhythm: ['drum-expression', 'mixer', 'tools']
  };
  const defaultPanel = { edit: 'chords', notation: 'mixer', rhythm: 'drum-expression' };
  for (const workspace of Object.keys(allowedPanels)) {
    if (!allowedPanels[workspace].includes(dockPanelByWorkspace[workspace])) dockPanelByWorkspace[workspace] = defaultPanel[workspace];
  }
  dockVisibleCount = Number(dockSlots.generate) + Number(dockSlots.secondary);
  function selectedDockPanel(workspace = workspaceForMode()) {
    const saved = dockPanelByWorkspace[workspace] ?? defaultPanel[workspace];
    return dualDock.matches && saved === 'generate' ? defaultPanel[workspace] : saved;
  }
  function dockTabFor(value, workspace = workspaceForMode()) {
    if (value === 'guitar' || !value) return null;
    if (value === 'expression') return allowedPanels[workspace].includes('tools') ? 'tools' : null;
    return allowedPanels[workspace].includes(value) ? value : null;
  }
  function arrangePanelSlots() {
    const generation = byId('generation-panel');
    const lowerPanels = panelBodyOrder.filter(node => node !== generation);
    const showGenerate = dualDock.matches && dockSlots.generate;
    if (generation) generation.dataset.studioPinnedGenerate = String(showGenerate);
    generateSlot.root.hidden = !dualDock.matches;
    if (dualDock.matches) {
      if (generation) generateSlot.body.append(generation);
      secondarySlot.body.append(...lowerPanels);
      sidebar.append(generateSlot.root, secondarySlot.root);
      sidebar.dataset.dualDock = 'true';
      return;
    }
    generateSlot.root.remove();
    secondarySlot.root.remove();
    delete sidebar.dataset.dualDock;
    sidebar.append(...panelBodyOrder);
  }
  function syncDockSlots() {
    if (!dualDock.matches) return;
    for (const [slot, name] of [[generateSlot, 'generate'], [secondarySlot, 'secondary']]) {
      const open = dockSlots[name];
      slot.root.dataset.open = String(open);
      slot.body.hidden = !open;
      slot.toggle.textContent = open ? '−' : '+';
      slot.toggle.setAttribute('aria-expanded', String(open));
      slot.toggle.setAttribute('aria-label', translate(open ? 'studioCollapsePanel' : 'studioExpandPanel'));
      slot.toggle.title = translate(open ? 'studioCollapsePanel' : 'studioExpandPanel');
    }
  }
  function setDockSlotOpen(name, value) {
    if (!(name in dockSlots)) return;
    dockSlots[name] = Boolean(value);
    dockVisibleCount = Number(dockSlots.generate) + Number(dockSlots.secondary);
    onDockPreferencesChange({ dockSlots: { ...dockSlots }, dockVisibleCount });
    syncDockSlots();
    render(commands.getSong(), commands.getState(), false);
  }
  function setDockOpen(value, persist = true) {
    const next = Boolean(value);
    if (dockOpen === next) return;
    dockOpen = next;
    if (dockOpen && !panel) panel = selectedDockPanel();
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
  generateSlot.toggle.addEventListener('click', () => setDockSlotOpen('generate', !dockSlots.generate));
  secondarySlot.toggle.addEventListener('click', () => setDockSlotOpen('secondary', !dockSlots.secondary));
  function syncPanelSwitches(activePanel = panel, workspace = workspaceForMode()) {
    panelSwitches.setAttribute('role', 'tablist');
    panelSwitches.setAttribute('aria-orientation', 'horizontal');
    panelSwitches.setAttribute('aria-label', translate('studioPanels'));
    const selectedTab = dockTabFor(activePanel, workspace);
    for (const button of panelSwitches.querySelectorAll('button[data-studio-panel]')) {
      const value = button.dataset.studioPanel;
      const available = allowedPanels[workspace].includes(value) && !(dualDock.matches && value === 'generate');
      button.hidden = !available;
      const active = available && value === selectedTab;
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
  function syncProjectActionLabels() {
    const groupLabel = translate('projectActionsHeading');
    desktopProjectLabel.textContent = groupLabel;
    desktopProjectActions.setAttribute('aria-label', groupLabel);
    for (const button of projectActionOrder) {
      const label = translate(button.dataset.copy);
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    const summaryKey = wide.matches ? 'projectActionsHeading' : projectSummaryCopy;
    projectSummaryLabel.dataset.copy = summaryKey;
    projectSummaryLabel.textContent = translate(summaryKey);
    projectMenu.dataset.ariaCopy = summaryKey;
    const summary = projectMenu.querySelector('summary');
    summary.setAttribute('aria-label', translate(summaryKey));
    summary.title = translate(summaryKey);
  }
  function syncProjectControls(wideLayout, extraWideLayout) {
    desktopProjectActions.remove();
    projectMenu.hidden = false;
    projectSection.hidden = false;
    projectSection.append(...projectActionOrder);
    projectMenu.open = false;
    if (wideLayout) {
      const directButtons = extraWideLayout
        ? projectActionOrder
        : directProjectButtons.filter(Boolean);
      desktopProjectActions.append(desktopProjectLabel, ...directButtons);
      if (!desktopProjectActions.parentElement) {
        if (extraWideLayout) toolbarActions?.append(desktopProjectActions);
        else headerActions.prepend(desktopProjectActions);
      }
      if (!extraWideLayout) projectSection.append(...additionalProjectButtons);
      headerActions.append(projectMenu, headerControls);
      appSettingsSection.hidden = true;
      projectMenu.hidden = extraWideLayout;
      projectSection.hidden = extraWideLayout;
      syncProjectActionLabels();
      return;
    }
    projectSection.append(...projectActionOrder);
    headerControlsHome.append(headerControls);
    appSettingsSection.hidden = false;
    syncProjectActionLabels();
  }
  function arrangeControls() {
    moreMenu.open = false;
    transportSettings.append(moreMenu);
    guitarSheetTrigger.remove();
    if (phone.matches && rollHelpTrigger) morePopover.append(rollHelpTrigger);
    else if (rollHelpTrigger) rollHelpHome?.append(rollHelpTrigger);
    mobileDock.hidden = !compact.matches;
    const wideLayout = wide.matches;
    const mediumLayout = !wide.matches && !compact.matches && !shortLandscape.matches;
    const shortLandscapeLayout = shortLandscape.matches && !wide.matches;
    const mediumDesktopLayout = wide.matches && !extraWide.matches && !shortLandscape.matches;
    const sideDockLayout = sideDock.matches && !shortLandscapeLayout;
    if (dualDock.matches) coreMixer.remove();
    for (const form of [seekForm, loopRangeForm]) {
      form?.querySelectorAll('label > span').forEach(label => label.classList.remove('visually-hidden'));
    }
    if (compact.matches && !shortLandscapeLayout && rollCollapse) {
      if (phone.matches) morePopover.append(rollCollapse);
      else modeNav.append(rollCollapse);
    }
    else if (shortLandscapeLayout && rollCollapse) morePopover.append(rollCollapse);
    else if (rollCollapse) rollCollapseHome?.append(rollCollapse);
    moreMenu.hidden = wideLayout;
    if (followToolsControl) followToolsControl.hidden = !(extraWide.matches && !shortLandscapeLayout);
    if (sideDockLayout && !panel) panel = lastPanel = selectedDockPanel();
    if (!sideDockLayout && previousSideDock && !dockOpen) panel = null;
    previousSideDock = sideDockLayout;
    syncProjectControls(wideLayout, extraWide.matches);
    syncWideWorkspaceHeading(commands.getState().view.mode);
    // Tombol Panel tidak pernah disembunyikan: ia satu-satunya kendali untuk
    // membuka dan menutup sidebar, jadi menghilangkannya saat panel terbuka
    // membuat pengguna kehilangan cara menutupnya.
    panelDockTrigger.hidden = false;
    panelDockTrigger.textContent = translate('studioPanelsButton');
    panelDockTrigger.setAttribute('aria-label', translate('studioPanelsButton'));
    panelDockTrigger.setAttribute('aria-expanded', String(sideDockLayout ? dockOpen : Boolean(panel)));
    if (!compact.matches || shortLandscapeLayout) inspectorActions.append(panelSwitches);
    modeToolbar.hidden = phone.matches && !shortLandscape.matches;
    overview.hidden = false;
    if (shortLandscapeLayout) {
      modeToolbar.append(modeNav);
      modeNav.append(guitarSheetTrigger);
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
      if (phone.matches) headerActions.prepend(guitarSheetTrigger);
      else modeNav.append(guitarSheetTrigger);
      mobileDock.append(transportDock, modeNav);
      advancedBody.append(tempo, loopToggle, resetRange, follow);
      editorSettings.hidden = false;
      editorSettings.setAttribute('aria-label', translate('editorSettingsHeading'));
      if (editorTools.parentElement !== editorSettings) editorSettings.prepend(editorTools);
      morePopover.append(editorSettings);
      if (sessionActions) byId('generation-panel').append(sessionActions);
    } else if (wideLayout || mediumLayout) {
      modeNav.append(panelDockTrigger);
      header.insertBefore(modeNav, headerActions);
      header.append(transportDock);
      transportMain.insertBefore(overview, transportSettings);
      transportButtons.append(tempo);
      if (wideLayout) {
        headerActions.append(projectMenu, headerControls);
        if (extraWide.matches) transportSettings.append(historyButtons, follow);
        else {
          overview.hidden = true;
        }
      } else {
        overview.hidden = true;
        transportButtons.parentElement.append(historyButtons);
        headerActions.prepend(projectMenu);
        toolbarActions.prepend(panelDockTrigger);
        toolbarActions.append(moreMenu);
      }
      editorToolbarHome.append(editorToolbar);
      editorToolsHome.prepend(editorTools);
      editorToolbar.append(...editorExtras);
      editorSettings.hidden = true;
      if (sessionActions) byId('generation-panel').append(sessionActions);
    } else {
      modeNav.append(panelDockTrigger);
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
    if (compact.matches) mobileDock.append(panelSwitches);
    coreControlsVisible = wideLayout || mediumLayout;
    coreControls.hidden = !coreControlsVisible;
    if (coreControlsVisible) coreControls.setAttribute('aria-label', translate('studioCoreControlsHeading'));
    if (coreControlsVisible && !compact.matches) {
      if (editorTools.parentElement !== editorToolbar) editorToolbar.prepend(editorTools);
      if (editorZoomControl && editorZoomControl.parentElement !== editorToolbar) {
        const zoomHome = editorToolbar.querySelector('#snap-select')?.closest('label');
        if (zoomHome) zoomHome.after(editorZoomControl);
        else editorToolbar.append(editorZoomControl);
      }
      generationFormHome?.append(generationForm);
      if (loopToggleHome) loopToggleHome.append(loopToggle);
      if (resetRangeHome) resetRangeHome.append(resetRange);
      loopSeekGroup.append(...[seekForm, loopRangeForm].filter(Boolean));
      generationQuickGroup.append(...[generationAnchorActions, generationPrimaryActions].filter(Boolean));
      generateButton?.setAttribute('form', generationForm.id || 'generation-form');
      coreControls.append(...[
        !dualDock.matches ? coreMixer : null,
        mediumDesktopLayout ? tempo : null,
        loopSeekGroup,
        editorToolbar,
        !extraWide.matches ? historyButtons : null,
        chordQuickGroup,
        generationQuickGroup,
        !extraWide.matches ? loopToggle : null,
        !extraWide.matches ? follow : null
      ].filter(Boolean));
    } else {
      generationFormHome?.append(generationForm);
      if (generationForm) {
        if (generationAnchorActions) generationForm.prepend(generationAnchorActions);
        if (generationPrimaryActions) generationForm.append(generationPrimaryActions);
      }
      generateButton?.removeAttribute('form');
      if (loopRangeForm && loopRangeForm.parentElement !== advancedBody) advancedBody.append(loopRangeForm);
      if (seekForm && loopRangeForm) advancedBody.insertBefore(seekForm, loopRangeForm);
      if (!compact.matches && !shortLandscapeLayout) {
        loopToggleHome?.append(loopToggle);
        resetRangeHome?.append(resetRange);
      }
      if (chordAddButton) {
        if (compact.matches) byId('harmony-panel').prepend(chordQuickGroup);
        else chordAddHome?.append(chordAddButton);
      }
      if (compact.matches && !shortLandscapeLayout) {
        editorToolbarHome.append(editorToolbar);
        if (editorTools.parentElement !== editorSettings) editorSettings.prepend(editorTools);
        if (editorZoomControl && editorZoomControl.parentElement !== editorSettings) editorSettings.append(editorZoomControl);
        morePopover.append(editorSettings);
        coreMixer.remove();
      } else if (shortLandscapeLayout) {
        if (editorTools.parentElement !== editorToolbar) editorToolbar.prepend(editorTools);
        if (editorZoomControl && editorZoomControl.parentElement !== editorToolbar) {
          const zoomHome = editorToolbar.querySelector('#snap-select')?.closest('label');
          if (zoomHome) zoomHome.after(editorZoomControl);
          else editorToolbar.append(editorZoomControl);
        }
      }
    }
    if (extraWide.matches) transportSettings.append(loopToggle);
    syncWideWorkspaceHeading(commands.getState().view.mode);
    arrangePanelSlots();
    syncDockSlots();
    sidebar.hidden = sideDockLayout ? !dockOpen : !panel;
    if (dockResizer) dockResizer.hidden = !sideDockLayout || !dockOpen;
    document.body.dataset.studioDockOpen = String(sideDockLayout && dockOpen);
    sidebar.dataset.sheetSize = panel ? 'half' : 'peek';
    syncPanelSwitches();
  }
  compact.addEventListener('change', arrangeControls);
  wide.addEventListener('change', arrangeControls);
  extraWide.addEventListener('change', arrangeControls);
  dualDock.addEventListener('change', () => {
    if (panel && panel !== 'guitar') panel = lastPanel = selectedDockPanel();
    arrangeControls();
    render(commands.getSong(), commands.getState(), false);
  });
  sideDock.addEventListener('change', () => {
    arrangeControls();
    render(commands.getSong(), commands.getState(), false);
  });
  shortLandscape.addEventListener('change', () => {
    arrangeControls();
    render(commands.getSong(), commands.getState(), false);
  });
  phone.addEventListener('change', () => {
    arrangeControls();
    render(commands.getSong(), commands.getState(), false);
  });
  if (dockWidth !== null) setDockWidth(dockWidth);
  arrangeControls();
  dockResizer.setAttribute('aria-valuenow', String(dockWidth ?? Math.round(Number(sidebar.getBoundingClientRect().width) || 384)));
  dockResizer.setAttribute('aria-valuetext', translate('dockResizeValue', { width: dockWidth ?? Math.round(Number(sidebar.getBoundingClientRect().width) || 384) }));
  function openPanel(value) {
    const wasOpen = sideDock.matches ? dockOpen : Boolean(panel);
    if (value) {
      if (value === 'guitar') {
        if (!guitarZoneOpen) {
          guitarZoneOpen = true;
          onGuitarZonePreferencesChange({ guitarZoneOpen });
          syncGuitarZoneControls();
        }
        if (compact.matches) panel = 'guitar';
      } else {
        const workspace = workspaceForMode();
        const tab = dockTabFor(value, workspace);
        if (!tab) return;
        panel = value === 'expression' ? 'expression'
          : dualDock.matches && tab === 'generate' ? selectedDockPanel(workspace) : tab;
        lastPanel = tab === 'generate' && dualDock.matches ? selectedDockPanel(workspace) : tab;
        dockPanelByWorkspace[workspace] = lastPanel;
        if (dualDock.matches && tab !== 'generate') dockSlots.secondary = true;
        dockVisibleCount = Number(dockSlots.generate) + Number(dockSlots.secondary);
        onDockPreferencesChange({
          dockPanelByWorkspace: { ...dockPanelByWorkspace },
          dockSlots: { ...dockSlots }, dockVisibleCount
        });
      }
      if (value !== 'guitar' && sideDock.matches && !dockOpen) {
        dockOpen = true;
        onDockPreferencesChange({ dockOpen });
      }
    } else {
      if (compact.matches && panel === 'guitar' && guitarZoneOpen) {
        if (commands.getState().view.mode === 'guitar') commands.setViewMode('piano-roll');
        guitarZoneOpen = false;
        onGuitarZonePreferencesChange({ guitarZoneOpen });
        syncGuitarZoneControls();
      }
      if (sideDock.matches) {
        dockOpen = false;
        onDockPreferencesChange({ dockOpen });
      } else panel = null;
    }
    render(commands.getSong(), commands.getState(), false);
    if (panel && !wasOpen && (sideDock.matches ? dockOpen : true)) {
      const initialFocus = panel === 'guitar' && compact.matches
        ? guitarZone.querySelector('.guitar-layout-group button')
        : panelSwitches.querySelector(`button[data-studio-panel="${dockTabFor(panel)}"]`)
          ?? panelDockTrigger;
      initialFocus?.focus({preventScroll:true});
    }
    if (panel && panel !== 'guitar' && (sideDock.matches ? dockOpen : true)) onOpenPanel(panel);
  }
  function restorePanelFocus(preferGuitar = false) {
    if (preferGuitar) {
      guitarSheetTrigger.focus({preventScroll:true});
      return;
    }
    if (compact.matches || !sideDock.matches || !dockOpen) {
      panelDockTrigger.focus({preventScroll:true});
      return;
    }
    const trigger = document.querySelector(`button[data-studio-panel="${lastPanel}"]`);
    const fallback = document.querySelector('[data-studio-view][aria-pressed="true"]');
      (compact.matches ? guitarSheetTrigger : trigger ?? fallback)?.focus({preventScroll:true});
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
    const target = event.target.closest?.('[data-studio-view], button[data-studio-panel], [data-studio-panel-toggle], [data-studio-guitar-zone-toggle], [data-studio-seek]');
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
        const closingGuitar = panel === 'guitar';
        openPanel(null); restorePanelFocus(closingGuitar);
      } else {
        openPanel(lastPanel || 'chords');
      }
      return;
    }
    if (target && 'studioGuitarZoneToggle' in target.dataset) {
      if (compact.matches) {
        if (panel === 'guitar') { openPanel(null); restorePanelFocus(true); }
        else openPanel('guitar');
      } else setGuitarZoneOpen(!guitarZoneOpen);
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
        const isGuitarToggle = target.dataset.studioView === 'guitar';
        const openingGuitar = isGuitarToggle && !guitarZoneOpen;
        const mode = isGuitarToggle
          ? openingGuitar ? 'guitar' : 'piano-roll'
          : target.dataset.studioView;
        commands.setViewMode(mode);
        if (isGuitarToggle) {
          guitarZoneOpen = openingGuitar;
          onGuitarZonePreferencesChange({ guitarZoneOpen });
          syncGuitarZoneControls();
          if (compact.matches) panel = openingGuitar ? 'guitar' : null;
          render(commands.getSong(), commands.getState(), false);
        }
        if (cameFromMoreMenu) moreMenu.querySelector('summary').focus({preventScroll:true});
      } else if (target.dataset.studioPanel) {
        moreMenu.open = false;
        selectionBar.querySelector('.selection-more')?.removeAttribute('open');
        const nextPanel = target.dataset.studioPanel === 'guitar' && panel === 'guitar'
          ? null
          : panel === target.dataset.studioPanel && !compact.matches && !sideDock.matches ? null : target.dataset.studioPanel;
        openPanel(nextPanel);
      }
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
    if (event.key === 'Escape' && !event.defaultPrevented && (sidebar.contains(event.target) || panelSwitches.contains(event.target)) && panel && !sideDock.matches) {
      const closingGuitar = panel === 'guitar';
      openPanel(null); restorePanelFocus(closingGuitar);
    }
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
    syncCoreMixerLabels();
    const loopSeekLabelText = loopSeekGroupLabel();
    loopSeekGroup.setAttribute('aria-label', loopSeekLabelText);
    loopSeekLabel.textContent = loopSeekLabelText;
    syncLoopSeekCopy();
    syncLoopSeekAria();
    syncGenerationQuickGroup();
    if (autoSelect && state.selectedChordId && state.selectedChordId !== lastChord) {
      panel = 'chords'; lastPanel = panel;
      if (sideDock.matches && !dockOpen) { dockOpen = true; onDockPreferencesChange({ dockOpen }); }
    }
    lastChord = state.selectedChordId;
    const mode = state.view.mode;
    const guitarInspector = mode === 'guitar';
    if (guitarInspector && previousViewMode !== 'guitar' && !guitarZoneOpen) {
      guitarZoneOpen = true;
      onGuitarZonePreferencesChange({ guitarZoneOpen });
      syncGuitarZoneControls();
    }
    if (compact.matches && guitarInspector && previousViewMode !== 'guitar') panel = 'guitar';
    previousViewMode = mode;
    const activeWorkspace = workspaceForMode(mode);
    if (dualDock.matches) arrangePanelSlots();
    if (previousWorkspace !== null && activeWorkspace !== previousWorkspace) {
      const previousTab = dockTabFor(panel, previousWorkspace);
      if (previousTab && !(dualDock.matches && dockPanelByWorkspace[previousWorkspace] === 'generate')) {
        dockPanelByWorkspace[previousWorkspace] = previousTab;
      }
      if (panel !== null && panel !== 'guitar') {
        panel = selectedDockPanel(activeWorkspace);
        lastPanel = panel;
      }
    }
    previousWorkspace = activeWorkspace;
    if (!compact.matches && panel === 'guitar') {
      panel = selectedDockPanel(activeWorkspace);
      lastPanel = panel;
    }
    if (panel && panel !== 'guitar') {
      const validTab = dockTabFor(panel, activeWorkspace);
      if (!validTab || dualDock.matches && validTab === 'generate') panel = selectedDockPanel(activeWorkspace);
      else {
        if (panel !== 'expression') panel = validTab;
        if (!(dualDock.matches && dockPanelByWorkspace[activeWorkspace] === 'generate')) {
          dockPanelByWorkspace[activeWorkspace] = validTab;
        }
      }
      lastPanel = dockTabFor(panel, activeWorkspace) ?? lastPanel;
    } else if (!panel && sideDock.matches && dockOpen) panel = selectedDockPanel(activeWorkspace);
    const guitarSheetOpen = compact.matches && panel === 'guitar';
    const guitarAvailable = activeWorkspace !== 'rhythm';
    chordQuickGroup.hidden = activeWorkspace !== 'edit';
    const tabValue = dockTabFor(panel, activeWorkspace);
    if (guitarZone.parentElement !== (guitarSheetOpen ? sidebar : workspaceCanvas)) {
      (guitarSheetOpen ? sidebar : workspaceCanvas).append(guitarZone);
    }
    document.body.dataset.studioPanel = panel ?? 'none';
    sidebar.dataset.sheetSize = panel ? 'half' : 'peek';
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
    if (drumExpression) drumExpression.hidden = tabValue !== 'drum-expression';
    if (expressionPanel) expressionPanel.hidden = panel !== 'expression';
    document.body.dataset.studioSelection = String(state.selectedNoteIds.length > 0);
    sidebar.hidden = sideDock.matches ? !dockOpen : !panel;
    if (dockResizer) dockResizer.hidden = !sideDock.matches || !dockOpen;
    document.body.dataset.studioDockOpen = String(sideDock.matches && dockOpen);
    if (dockResizer && !dockResizer.hidden) {
      const visibleWidth = dockWidth ?? Math.round(Number(sidebar.getBoundingClientRect().width) || 384);
      dockResizer.setAttribute('aria-valuenow', String(visibleWidth));
      dockResizer.setAttribute('aria-valuetext', translate('dockResizeValue', { width: visibleWidth }));
    }
    guitarZone.hidden = !guitarAvailable || compact.matches && !guitarSheetOpen;
    if (guitarZoneHeightExplicit) guitarZone.style.setProperty('--studio-guitar-zone-height', `${guitarZoneHeight}px`);
    if (guitarSection) guitarSection.hidden = !guitarZoneOpen || !guitarAvailable;
    byId('studio-mixer').hidden = panel !== 'mixer';
    byId('harmony-panel').hidden = panel !== 'chords';
    const generationPinned = dualDock.matches && dockSlots.generate;
    byId('generation-panel').hidden = !(generationPinned || tabValue === 'generate');
    toolsPanel.hidden = tabValue !== 'tools' || guitarSheetOpen;
    panelSwitches.hidden = guitarSheetOpen;
    byId('studio-panel-title').textContent = translate(({mixer:'studioMixer',chords:'harmonyLaneLabel',generate:'studioGenerate',tools:'toolsHeading',expression:'expressionHeading','drum-expression':'percussionExpressionHeading',guitar:'guitarHeading'})[panel] ?? 'studioPanels');
    panelDockTrigger.textContent = translate('studioPanelsButton');
    panelDockTrigger.setAttribute('aria-label', translate('studioPanelsButton'));
    const dockCapable = sideDock.matches && !shortLandscape.matches;
    // Satu-satunya kendali buka/tutup sidebar: tidak pernah disembunyikan,
    // termasuk saat dock samping sedang terbuka.
    panelDockTrigger.hidden = false;
    panelDockTrigger.setAttribute('aria-expanded', String(dockCapable ? dockOpen : Boolean(panel)));
    syncProjectActionLabels();
    for (const button of headerActions.querySelectorAll('button')) {
      if (button.classList.contains('icon-button') && button.getAttribute('aria-label')) {
        button.title = button.getAttribute('aria-label');
      }
    }
    syncPanelSwitches(panel, activeWorkspace);
    syncDockSlots();
    syncGuitarZoneControls();
    syncWideWorkspaceHeading(mode);
    document.body.dataset.studioWorkspace = activeWorkspace;
    modeNav.querySelectorAll('[data-studio-workspace]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.studioWorkspace === activeWorkspace));
    });
    document.querySelectorAll('[data-studio-view]').forEach(button => {
      if (!modeNav.contains(button)) button.setAttribute('aria-pressed', String(button.dataset.studioView === mode));
    });
    if (shortLandscape.matches) toolbarActions.append(guitarMode);
    else rollTitleRow.append(guitarMode);
    guitarMode.setAttribute('aria-pressed', String(guitarZoneOpen));
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
      const toolbarHome = coreControlsVisible ? coreControls : editorToolbarHome;
      if (editorToolbar.parentElement !== toolbarHome) toolbarHome.append(editorToolbar);
    }
    const moreSummary = moreMenu.querySelector('summary');
      moreSummary.removeAttribute('data-active-view');
      const moreLabel = moreSummary.querySelector('[data-copy]');
    moreLabel.textContent = translate('transportAdvanced');
    moreLabel.dataset.copy = 'transportAdvanced';
    moreSummary.setAttribute('aria-label', translate('transportAdvanced'));
    if (overviewSong !== JSON.stringify([song.notes,song.chords,song.tracks,song.timing,translate('studioSeekBar', {bar:1})])) renderOverview(song);
    updatePlayback(song,state.playback);
    if (!guitarZone.hidden && !guitarSection?.hidden) {
      // Kanvas TAB/Fretboard baru punya tinggi pasti setelah render, jadi minimum
      // zona dihitung ulang di sini; tanpa itu zona default masih boleh lebih kecil
      // dari isinya dan kanvas terpotong.
      onGuitarZoneLayout();
      syncGuitarZoneHeightAttributes();
      if (guitarZoneHeightExplicit) setGuitarZoneHeight(guitarZoneHeight);
    }
  }
  return {render,openPanel,updatePlayback};
}
