import { midiToPitch, PPQ } from "../core/model.js";
import { DEFAULT_ROLL_ZOOM, MAX_ROLL_ZOOM, MIN_ROLL_ZOOM, SNAP_TICKS } from "../core/editor.js";
import { normalizeRuntimeState } from "../core/runtime-state.js";
import { centeredScrollLeft } from "./roll-follow.js?v=20261001.33";
import { canonicalSongEndTick } from "../core/timeline.js?v=20261001.33";
import { harmonyChordSymbol } from "./harmony.js?v=20261001.33";

export { SNAP_TICKS };
export const DEFAULT_PITCH_RANGE = Object.freeze({ min: 48, max: 83 });
export const MAX_ROLL_BARS = 64;

const SVG_NS = "http://www.w3.org/2000/svg";
const PIANO_ROW_HEIGHT = 24;
export const PIANO_RULER_HEIGHT = 34;
export const HARMONY_LANE_HEIGHT = 44;
const PIANO_TOP = PIANO_RULER_HEIGHT + HARMONY_LANE_HEIGHT;
const PIANO_LABEL_WIDTH = 56;
const PIXELS_PER_QUARTER = 80;
const DRAG_TARGET_SIZE = 24;

export function snapTick(tick, snap = "1/8") {
  const interval = SNAP_TICKS[snap];
  if (!Number.isFinite(tick) || !interval) throw new RangeError("Invalid tick or snap.");
  return Math.max(0, Math.round(tick / interval) * interval);
}

function snapDelta(delta, snap) {
  const interval = SNAP_TICKS[snap];
  if (!Number.isFinite(delta) || !interval) throw new RangeError("Invalid tick delta or snap.");
  return Math.round(delta / interval) * interval;
}

export function resizeDurationFromDrag(originalDuration, startX, currentX, geometry, snap = "1/8") {
  if (!Number.isSafeInteger(originalDuration) || originalDuration <= 0
    || !Number.isFinite(startX) || !Number.isFinite(currentX)
    || !Number.isFinite(geometry?.ppq) || geometry.ppq <= 0
    || !Number.isFinite(geometry?.pixelsPerQuarter) || geometry.pixelsPerQuarter <= 0
    || !SNAP_TICKS[snap]) throw new RangeError("Invalid resize input.");
  const deltaTicks = (currentX - startX) * geometry.ppq / geometry.pixelsPerQuarter;
  const snappedDelta = snapDelta(deltaTicks, snap);
  if (snappedDelta === 0) return originalDuration;
  return Math.max(SNAP_TICKS[snap], originalDuration + snappedDelta);
}

export function moveDeltaFromDrag(drag, point, geometry) {
  if (!Array.isArray(drag?.originals) || drag.originals.length === 0
    || !Number.isFinite(drag.startX) || !Number.isFinite(drag.startY)
    || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new RangeError("Invalid move input.");
  let tickDelta = snapDelta((point.x - drag.startX) * geometry.ppq / geometry.pixelsPerQuarter, drag.snap);
  const pitchDelta = Math.round((drag.startY - point.y) / geometry.rowHeight);
  const minStart = Math.min(...drag.originals.map((item) => item.startTick));
  tickDelta = Math.max(tickDelta, -minStart);
  const minPitch = Math.min(...drag.originals.map((item) => item.pitch));
  const maxPitch = Math.max(...drag.originals.map((item) => item.pitch));
  const boundedPitchDelta = Math.max(-minPitch, Math.min(127 - maxPitch, pitchDelta));
  return { tickDelta, pitchDelta: boundedPitchDelta };
}

export function createRollGeometry({
  endTick = 0,
  focusTick = 0,
  ppq = PPQ,
  numerator = 4,
  denominator = 4,
  pitchRange = DEFAULT_PITCH_RANGE,
  rowHeight = PIANO_ROW_HEIGHT,
  top = PIANO_TOP,
  labelWidth = PIANO_LABEL_WIDTH,
  pixelsPerQuarter = PIXELS_PER_QUARTER,
  viewportWidth = 0,
  zoom = DEFAULT_ROLL_ZOOM
} = {}) {
  if (!Number.isSafeInteger(ppq) || ppq <= 0 || !Number.isSafeInteger(numerator) || numerator <= 0
    || !Number.isSafeInteger(denominator) || denominator <= 0) throw new RangeError("Invalid musical grid.");
  if (!Number.isFinite(endTick) || endTick < 0) throw new RangeError("Invalid grid end tick.");
  if (!Number.isFinite(focusTick) || focusTick < 0) throw new RangeError("Invalid grid focus tick.");
  if (!Number.isFinite(zoom) || zoom < MIN_ROLL_ZOOM || zoom > MAX_ROLL_ZOOM) throw new RangeError("Invalid roll zoom.");
  const beatTicks = ppq * 4 / denominator;
  const barTicks = beatTicks * numerator;
  if (!Number.isSafeInteger(beatTicks) || !Number.isSafeInteger(barTicks) || barTicks <= 0) throw new RangeError("Invalid musical grid.");
  const barsToCoverSong = Math.max(1, Math.ceil(endTick / barTicks) + 1);
  const fitsWholeSong = barsToCoverSong <= MAX_ROLL_BARS;
  const baseRequestedBars = fitsWholeSong ? barsToCoverSong : MAX_ROLL_BARS;
  // Di bawah 100%, isi ruang yang terbuka dengan bar tambahan. Inilah yang
  // membuat zoom-out menambah konteks waktu alih-alih hanya mengecilkan kanvas.
  const requestedBars = zoom < DEFAULT_ROLL_ZOOM
    ? Math.min(MAX_ROLL_BARS, Math.ceil(baseRequestedBars / zoom))
    : baseRequestedBars;
  const maxGridTicks = barTicks * MAX_ROLL_BARS;
  const baseGridTicks = baseRequestedBars * barTicks;
  const gridTicks = requestedBars * barTicks;
  const usableViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > labelWidth
    ? viewportWidth - labelWidth
    : 0;
  // Fit dihitung terhadap jendela 100%. Bar tambahan saat zoom-out tidak boleh
  // ikut mengubah baseline, kalau tidak multiplier <1 akan saling membatalkan.
  const fittedPixelsPerQuarter = usableViewportWidth > 0
    ? usableViewportWidth * ppq / baseGridTicks
    : pixelsPerQuarter;
  // Pixels per quarter dibulatkan agar xToTick tetap deterministik pada drag.
  const resolvedPixelsPerQuarter = Math.round(Math.max(pixelsPerQuarter, fittedPixelsPerQuarter) * zoom);
  /*
   * Jendela grid SELALU mulai dari bar 1 selama seluruh lagu masih muat dalam
   * batas. Dulu jendela ikut bergeser ke fokus, dan itulah akar bug "hanya bar 3
   * dan 4 yang terlihat": begitu sebuah note di bar jauh menjadi terpilih, bar 1
   * sampai 2 jatuh di luar jendela, tidak digambar sama sekali, dan tidak bisa
   * dijangkau lagi karena tidak ada kontennya di sana.
   *
   * Jendela baru boleh bergeser ke fokus kalau lagu benar-benar melebihi
   * MAX_ROLL_BARS, karena saat itu yang perlu dijaga adalah playhead tetap
   * terjangkau dan DOM tidak membengkak.
   */
  const focusBar = Math.floor(focusTick / barTicks);
  const contextBars = fitsWholeSong ? 0 : Math.floor((requestedBars - 1) * 0.3);
  const startTick = fitsWholeSong ? 0 : Math.max(0, focusBar - contextBars) * barTicks;
  const endWindowTick = startTick + gridTicks;
  return {
    ppq,
    beatTicks,
    barTicks,
    startTick,
    endTick: endWindowTick,
    gridTicks,
    maxGridTicks,
    minMidi: pitchRange.min,
    maxMidi: pitchRange.max,
    rowHeight,
    top,
    labelWidth,
    pixelsPerQuarter: resolvedPixelsPerQuarter,
    width: labelWidth + gridTicks * resolvedPixelsPerQuarter / ppq,
    height: top + (pitchRange.max - pitchRange.min + 1) * rowHeight
  };
}

export function tickToX(tick, geometry) {
  return geometry.labelWidth + (tick - geometry.startTick) * geometry.pixelsPerQuarter / geometry.ppq;
}

export function xToTick(x, geometry) {
  // Error floating point sekecil apa pun harus hilang, karena hasil ini dipakai
  // untuk snapped tick yang wajib integer agar lolos validasi canonical Song.
  return Math.round(geometry.startTick + (x - geometry.labelWidth) * geometry.ppq / geometry.pixelsPerQuarter);
}

export function rulerSeekTick(x, geometry, snap = "1/8") {
  if (!Number.isFinite(x) || !geometry || !SNAP_TICKS[snap]) throw new RangeError("Invalid ruler seek input.");
  const boundedX = Math.max(geometry.labelWidth, Math.min(geometry.width, x));
  const tick = snapTick(xToTick(boundedX, geometry), snap);
  return Math.max(geometry.startTick, Math.min(geometry.endTick, tick));
}

export function chordSnapTicks(geometry, snap = "bar") {
  return snap === "beat" ? geometry.beatTicks : snap === "half-bar" ? geometry.barTicks / 2 : geometry.barTicks;
}

export function chordGesturePatch(chord, deltaX, geometry, kind, snap = "bar") {
  const unit = chordSnapTicks(geometry, snap);
  const delta = Math.round(deltaX * geometry.ppq / geometry.pixelsPerQuarter / unit) * unit;
  return kind === "resize" ? { durationTicks: Math.max(unit, chord.durationTicks + delta) }
    : { startTick: Math.max(0, chord.startTick + delta) };
}

export function chordDrawRange(startX, endX, geometry, snap = "bar") {
  const unit = chordSnapTicks(geometry, snap);
  const first = Math.max(0, Math.floor(xToTick(startX, geometry) / unit) * unit);
  const last = Math.max(0, Math.round(xToTick(endX, geometry) / unit) * unit);
  return { startTick: Math.min(first, last), durationTicks: Math.max(unit, Math.abs(last - first)) };
}

export function midiToY(midi, geometry) {
  return geometry.top + (geometry.maxMidi - midi) * geometry.rowHeight;
}

export function yToMidi(y, geometry) {
  return geometry.maxMidi - Math.floor((y - geometry.top) / geometry.rowHeight);
}

export function drawNoteInputFromDrag(startPoint, currentPoint, geometry, snap = "1/8") {
  if (!Number.isFinite(startPoint?.x) || !Number.isFinite(startPoint?.y)
    || !Number.isFinite(currentPoint?.x) || !Number.isFinite(currentPoint?.y)
    || !SNAP_TICKS[snap]) throw new RangeError("Invalid draw input.");
  const firstTick = snapTick(xToTick(startPoint.x, geometry), snap);
  const lastTick = snapTick(xToTick(currentPoint.x, geometry), snap);
  const startTick = Math.min(firstTick, lastTick);
  const durationTicks = Math.max(SNAP_TICKS[snap], Math.abs(lastTick - firstTick));
  const pitch = Math.max(0, Math.min(127, yToMidi(startPoint.y, geometry)));
  return { pitch, startTick, durationTicks };
}

export function noteHitLayout(note, x, width, geometry, notes) {
  const noteEnd = note.startTick + note.durationTicks;
  const pixelsPerTick = geometry.pixelsPerQuarter / geometry.ppq;
  const samePitch = notes.filter((other) => other.id !== note.id && other.pitch === note.pitch);
  const previousEnds = samePitch.map((other) => other.startTick + other.durationTicks)
    .filter((end) => end <= note.startTick);
  const noteOverlap = samePitch.some((other) => other.startTick < noteEnd
    && other.startTick + other.durationTicks > note.startTick);
  const nextStarts = samePitch.map((other) => other.startTick)
    .filter((start) => start >= noteEnd);
  const previousEnd = Math.max(geometry.startTick, ...previousEnds);
  const nextStart = Math.min(geometry.endTick, ...nextStarts);
  const gapBefore = noteOverlap ? 0 : Math.max(0, note.startTick - previousEnd) * pixelsPerTick;
  const gapAfter = noteOverlap ? 0 : Math.max(0, nextStart - noteEnd) * pixelsPerTick;
  const isLong = width >= DRAG_TARGET_SIZE * 2;
  const canExtendMove = !isLong && gapBefore >= DRAG_TARGET_SIZE * 2 && x - DRAG_TARGET_SIZE >= geometry.labelWidth;
  const canExtendResize = !isLong && gapAfter >= DRAG_TARGET_SIZE * 2 && noteEnd <= geometry.endTick
    && x + width + DRAG_TARGET_SIZE <= geometry.width;
  const canResize = noteEnd <= geometry.endTick;

  if (isLong) {
    return {
      moveX: x,
      moveWidth: width - (canResize ? DRAG_TARGET_SIZE : 0),
      resizeX: x + width - DRAG_TARGET_SIZE,
      resizeWidth: DRAG_TARGET_SIZE,
      canResize
    };
  }
  const inlineWidth = width / 2;
  return {
    moveX: canExtendMove ? x - DRAG_TARGET_SIZE : x,
    moveWidth: canExtendMove ? DRAG_TARGET_SIZE : canResize ? inlineWidth : width,
    resizeX: canExtendResize ? x + width : x + inlineWidth,
    resizeWidth: canExtendResize ? DRAG_TARGET_SIZE : inlineWidth,
    canResize
  };
}

function svgElement(name, attributes = {}, parent = null, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== null) element.textContent = text;
  parent?.append(element);
  return element;
}

/*
 * Gradien pitch: baris paling atas (pitch tertinggi) condong hangat, baris paling
 * bawah (pitch terendah) condong dingin. Selisihnya sengaja sangat kecil karena
 * tujuannya memberi arti pada sumbu Y, bukan dekorasi. Satu gradient untuk
 * seluruh tinggi roll, jadi tidak ada biaya per baris.
 */
function appendPitchTint(svg) {
  const defs = svgElement("defs", {}, svg);
  const gradient = svgElement("linearGradient", {
    id: "melodi-pitch-tint",
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1
  }, defs);
  svgElement("stop", { offset: "0%", class: "pitch-tint-high" }, gradient);
  svgElement("stop", { offset: "100%", class: "pitch-tint-low" }, gradient);
}

function bendLabel(note) {
  if (!Array.isArray(note.pitchBend) || note.pitchBend.length < 2) return "";
  const semitones = note.pitchBend.map((point) => point.semitones);
  const max = Math.max(...semitones);
  const min = Math.min(...semitones);
  const endsAtBase = Math.abs(semitones.at(-1) ?? 0) < 0.001;
  if (max > 0) return `bend +${max}${endsAtBase ? " release" : ""}`;
  if (min < 0) return `bend ${min}${endsAtBase ? " release" : ""}`;
  return "bend";
}

function expressionLabel(note) {
  const parts = [];
  if (typeof note.volume === "number" && Math.abs(note.volume - 1) > 0.001) {
    parts.push(`V${Math.round(note.volume * 100)}`);
  }
  if (typeof note.pan === "number" && Math.abs(note.pan) > 0.001) {
    const amount = Math.round(Math.abs(note.pan) * 100);
    parts.push(note.pan < 0 ? `L${amount}` : `R${amount}`);
  }
  if (note.vibrato) parts.push(`~${Number(note.vibrato.depthSemitones.toFixed(2))}`);
  return parts.join(" ");
}

function noteDescription(note, selected, current) {
  const states = [
    note.source,
    note.anchor ? "anchor" : "",
    note.locked ? "locked" : "",
    bendLabel(note),
    expressionLabel(note),
    selected ? "selected" : "",
    current ? "playing" : ""
  ].filter(Boolean).join(", ");
  return `${midiToPitch(note.pitch)}, tick ${note.startTick}, duration ${note.durationTicks}, ${states}`;
}

function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

export function createPianoRollView(svg, commands, { onAddNote = () => {}, onContextMenu = () => {}, onChordContextMenu = () => {}, getChordDrawDefaults = () => ({ rootPitchClass: 0, quality: "major" }), onError = () => {}, translate = () => "Chords" } = {}) {
  const scrollContainer = svg.parentElement;
  let geometry = createRollGeometry();
  let activeDrag = null;
  let finishingDrag = false;
  let ignoreNextClick = false;
  let pendingNoteClickId = null;
  let selectionDrag = null;
  let drawDrag = null;
  let rulerDrag = null;
  let chordDrag = null;
  let chordLongPress = null;
  let chordPressPoint = null;
  let timelineEndTick = 1;
  let lastPlaybackTick = 0;
  let lastPlaybackRange = "0:1";
  let pendingPlaybackFollow = false;
  let lastFocusTick = null;

  function focusChordEditor() {
    const editor = svg.closest?.("#piano-roll-scroll") ?? scrollContainer;
    editor?.focus?.({ preventScroll: true });
  }

  function pointerPoint(event) {
    const bounds = svg.getBoundingClientRect();
    const scaleX = bounds.width > 0 ? geometry.width / bounds.width : 1;
    const scaleY = bounds.height > 0 ? geometry.height / bounds.height : 1;
    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY
    };
  }

  function syncFrozenPitchLabels() {
    const layer = svg.querySelector('[data-entity="pitch-label-layer"]');
    if (!layer) return;
    const left = scrollContainer?.scrollLeft ?? 0;
    layer.setAttribute("transform", `translate(${left} 0)`);
  }

  function setGroupSelection(noteId, event) {
    const current = commands.getSelectedNoteIds();
    let next;
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      next = current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId];
    } else {
      next = [noteId];
    }
    commands.selectNotes(next);
  }

  function render(song, state = commands.getState(), focusTickOverride = null, songEndTickOverride = null) {
    state = normalizeRuntimeState(state);
    const savedLeft = scrollContainer?.scrollLeft ?? 0;
    const savedTop = scrollContainer?.scrollTop ?? 0;
    timelineEndTick = Math.max(1, Number.isFinite(songEndTickOverride)
      ? songEndTickOverride
      : canonicalSongEndTick(song));
    const endTick = Math.max(timelineEndTick, state.playback.currentTick);
    const selectedNote = [...state.selectedNoteIds].reverse().map((id) => song.notes.find((note) => note.id === id)).find(Boolean);
    const activeCandidate = state.generation?.candidates?.find((candidate) => candidate.id === state.generation.activeCandidateId);
    const selectedChord = (song.chords ?? []).find(chord => chord.id === state.selectedChordId);
    const focusTick = focusTickOverride ?? (activeCandidate ? state.generation.gap?.startTick : null) ?? selectedNote?.startTick ?? selectedChord?.startTick ?? state.playback.currentTick;
    const { numerator, denominator } = song.timing.timeSignature;
    const candidatePitches = activeCandidate?.notes?.map((note) => note.pitch) ?? [];
    const musicalPitches = [...song.notes.map((note) => note.pitch), ...candidatePitches];
    let pitchRange = DEFAULT_PITCH_RANGE;
    if (musicalPitches.length > 0) {
      const lowest = Math.min(...musicalPitches);
      const highest = Math.max(...musicalPitches);
      const center = Math.round((lowest + highest) / 2);
      const minimumSpan = 18;
      let min = Math.max(0, Math.min(lowest - 4, center - Math.floor(minimumSpan / 2)));
      let max = Math.min(127, Math.max(highest + 4, min + minimumSpan));
      if (max - min < minimumSpan) min = Math.max(0, max - minimumSpan);
      pitchRange = { min, max };
    }
    geometry = createRollGeometry({
      endTick,
      focusTick,
      ppq: song.timing.ppq,
      numerator,
      denominator,
      pitchRange,
      zoom: state.editor.zoom,
      viewportWidth: scrollContainer?.clientWidth ?? 0
    });
    svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
    svg.setAttribute("width", geometry.width);
    svg.setAttribute("height", geometry.height);
    svg.setAttribute("aria-label", `Piano Roll, ${numerator}/${denominator}, snap ${state.editor.snap}, tool ${state.editor.tool}`);
    svg.replaceChildren();

    svgElement("title", {}, svg, `Piano Roll ${numerator}/${denominator}`);
    appendPitchTint(svg);
    svgElement("rect", { x: 0, y: 0, width: geometry.width, height: geometry.height, class: "roll-background" }, svg);

    for (let midi = geometry.maxMidi; midi >= geometry.minMidi; midi -= 1) {
      const y = midiToY(midi, geometry);
      svgElement("rect", {
        x: geometry.labelWidth,
        y,
        width: geometry.width - geometry.labelWidth,
        height: geometry.rowHeight,
        class: isBlackKey(midi) ? "roll-row roll-row-black" : "roll-row"
      }, svg);
      svgElement("line", {
        x1: geometry.labelWidth,
        x2: geometry.width,
        y1: y + geometry.rowHeight,
        y2: y + geometry.rowHeight,
        class: "roll-row-line"
      }, svg);

    }

    const subdivisionTicks = SNAP_TICKS[state.editor.snap] ?? geometry.beatTicks;
    for (let tick = geometry.startTick; tick <= geometry.endTick; tick += subdivisionTicks) {
      const x = tickToX(tick, geometry);
      const isBar = tick % geometry.barTicks === 0;
      const isBeat = tick % geometry.beatTicks === 0;
      svgElement("line", {
        x1: x,
        x2: x,
        y1: geometry.top,
        y2: geometry.height,
        class: isBar ? "roll-bar-line" : isBeat ? "roll-beat-line" : "roll-subdivision-line",
        "data-grid-tick": tick
      }, svg);
      if (isBar) svgElement("text", { x: x + 4, y: 18, class: "roll-bar-label" }, svg, String(tick / geometry.barTicks + 1));
    }
    svgElement("line", { x1: 0, x2: geometry.width, y1: geometry.top, y2: geometry.top, class: "roll-header-line" }, svg);
    const playbackRange = state.playback.loop ?? { enabled: false, startTick: 0, endTick: timelineEndTick };
    lastPlaybackRange = `${playbackRange.startTick}:${playbackRange.endTick}`;
    const rangeStart = Math.max(geometry.startTick, playbackRange.startTick);
    const rangeEnd = Math.min(geometry.endTick, playbackRange.endTick);
    const hasCustomRange = playbackRange.startTick !== 0 || playbackRange.endTick !== timelineEndTick;
    if (hasCustomRange && rangeEnd > rangeStart) {
      const rangeX = tickToX(rangeStart, geometry);
      const rangeRight = tickToX(rangeEnd, geometry);
      svgElement("rect", {
        x: rangeX,
        y: 0,
        width: Math.max(1, rangeRight - rangeX),
        height: PIANO_RULER_HEIGHT,
        class: "roll-timeline-selection",
        "data-entity": "timeline-selection",
        "data-start-tick": playbackRange.startTick,
        "data-end-tick": playbackRange.endTick,
        "pointer-events": "none",
        "aria-hidden": "true"
      }, svg);
    }
    // Hit-layer ditempatkan setelah label/grid/selection sehingga seluruh ruler,
    // termasuk tepat di atas nomor birama, menerima click seek dan drag range.
    svgElement("rect", {
      x: geometry.labelWidth,
      y: 0,
      width: geometry.width - geometry.labelWidth,
      height: PIANO_RULER_HEIGHT,
      class: "roll-ruler-hit",
      "data-action": "seek-ruler",
      "data-entity": "timeline-ruler",
      role: "button",
      tabindex: "0",
      "aria-label": "Timeline ruler. Click to move the playhead; drag to select a playback range."
    }, svg);

    const chordLane = svgElement("g", { "data-entity": "harmony-lane", "aria-label": translate("harmonyLaneLabel") }, svg);
    for (let tick = geometry.startTick; tick < geometry.endTick; tick += geometry.barTicks) {
      const x = tickToX(tick, geometry);
      const bar = svgElement("g", {
        "data-entity": "harmony-bar", "data-action": "select-harmony-bar", "data-start-tick": tick,
        "data-focus-key": `harmony-bar-${tick}`,
        "data-end-tick": tick + geometry.barTicks, role: "button", tabindex: "0",
        "aria-label": `${translate("harmonyLaneLabel")} · ${tick / geometry.barTicks + 1}`
      }, chordLane);
      svgElement("rect", { x, y: PIANO_RULER_HEIGHT, width: geometry.barTicks * geometry.pixelsPerQuarter / geometry.ppq,
        height: HARMONY_LANE_HEIGHT, class: "roll-row", stroke: "var(--border)", "stroke-width": 1 }, bar);
    }
    for (const chord of song.chords ?? []) {
      const end = chord.startTick + chord.durationTicks;
      if (end <= geometry.startTick || chord.startTick >= geometry.endTick) continue;
      const x = tickToX(Math.max(chord.startTick, geometry.startTick), geometry);
      const width = (Math.min(end, geometry.endTick) - Math.max(chord.startTick, geometry.startTick)) * geometry.pixelsPerQuarter / geometry.ppq;
      const selectedChord = state.selectedChordId === chord.id;
      const currentChord = state.playback.status === "playing" && state.playback.currentTick >= chord.startTick && state.playback.currentTick < end;
      const symbol = harmonyChordSymbol(chord, song.key);
      const group = svgElement("g", { "data-entity": "chord", "data-action": "select-chord", "data-entity-id": chord.id,
        "data-start-tick": chord.startTick, "data-duration-ticks": chord.durationTicks, "data-locked": chord.locked,
        "data-selected": selectedChord, role: "button", tabindex: "0", "aria-pressed": selectedChord,
        "data-current": currentChord, "data-focus-key": `chord-${chord.id}`,
        "aria-label": `${symbol} · ${Math.floor(chord.startTick / geometry.barTicks) + 1}–${Math.ceil(end / geometry.barTicks)}${chord.locked ? " 🔒" : ""}` }, chordLane);
      svgElement("rect", { x, y: PIANO_RULER_HEIGHT + 2, width, height: HARMONY_LANE_HEIGHT - 4, rx: 4,
        "data-chord-shape": "true", fill: selectedChord ? "var(--accent)" : "var(--surface)",
        stroke: "var(--accent)", "stroke-width": selectedChord ? 3 : 1 }, group);
      svgElement("title", {}, group, `${symbol}${chord.locked ? " 🔒" : ""}`);
      // Short spans keep their full canonical width; label fits inside that span.
      const label = svgElement("svg", { x: x + 4, y: PIANO_RULER_HEIGHT + 2, width: Math.max(0, width - 8), height: HARMONY_LANE_HEIGHT - 4,
        overflow: "hidden", "pointer-events": "none", "aria-hidden": "true" }, group);
      svgElement("text", { x: 0, y: 25, fill: selectedChord ? "var(--on-accent)" : "var(--text)", "font-size": 13 }, label, `${symbol}${chord.locked ? " 🔒" : ""}`);
      if (selectedChord && !chord.locked) svgElement("rect", { x: x + Math.max(0, width - 20), y: PIANO_RULER_HEIGHT + 2,
        width: Math.min(20, width), height: HARMONY_LANE_HEIGHT - 4, rx: 3, fill: "var(--accent)", opacity: .6,
        "data-action": "resize-chord", "aria-hidden": "true", style: "cursor: ew-resize" }, group);
    }

    const selected = new Set(state.selectedNoteIds);
    for (const note of song.notes) {
      const noteEnd = note.startTick + note.durationTicks;
      if (note.pitch < geometry.minMidi || note.pitch > geometry.maxMidi
        || noteEnd <= geometry.startTick || note.startTick >= geometry.endTick) continue;
      const isSelected = selected.has(note.id);
      const isCurrent = state.playback.currentNoteId === note.id;
      const visibleStartTick = Math.max(note.startTick, geometry.startTick);
      const visibleEndTick = Math.min(noteEnd, geometry.endTick);
      const x = tickToX(visibleStartTick, geometry);
      const y = midiToY(note.pitch, geometry) + 2;
      const width = (visibleEndTick - visibleStartTick) * geometry.pixelsPerQuarter / geometry.ppq;
      const group = svgElement("g", {
        "data-entity": "note",
        "data-entity-id": note.id,
        "data-source": note.source,
        "data-anchor": note.anchor,
        "data-locked": note.locked,
        "data-selected": isSelected,
        "data-current": isCurrent,
        "data-pitch": note.pitch,
        "data-start-tick": note.startTick,
        "data-duration-ticks": note.durationTicks,
        "data-volume": note.volume ?? 1,
        "data-pan": note.pan ?? 0,
        "data-vibrato": JSON.stringify(note.vibrato ?? null),
        role: "img",
        "aria-label": noteDescription(note, isSelected, isCurrent)
      }, svg);
      const shape = svgElement("rect", {
        x,
        y,
        width,
        height: geometry.rowHeight - 4,
        rx: 3,
        class: `roll-note roll-note-${note.source}`,
        "data-note-shape": "true"
      }, group);
      if (isSelected) shape.setAttribute("stroke-width", "3");
      if (Array.isArray(note.pitchBend) && note.pitchBend.length > 1 && width >= 18) {
        const maxAbs = Math.max(1, ...note.pitchBend.map((point) => Math.abs(point.semitones)));
        const curvePoints = note.pitchBend.map((point) => {
          const curveX = x + 3 + (Math.max(6, width - 6) * point.position);
          const curveY = y + (geometry.rowHeight - 4) * 0.72 - (point.semitones / maxAbs) * (geometry.rowHeight - 8) * 0.42;
          return `${curveX},${curveY}`;
        }).join(" ");
        svgElement("polyline", {
          points: curvePoints,
          class: "roll-note-bend",
          "pointer-events": "none",
          "aria-hidden": "true"
        }, group);
      }
      const expression = expressionLabel(note);
      if (expression && width >= 42) {
        svgElement("text", {
          x: x + width / 2,
          y: y + geometry.rowHeight - 8,
          "text-anchor": "middle",
          class: "roll-note-expression",
          "pointer-events": "none",
          "aria-hidden": "true"
        }, group, expression);
      }
      if (note.anchor) {
        svgElement("text", { x: x + 5, y: y + 13, class: "roll-note-mark" }, group, "A");
      }
      if (note.locked) {
        svgElement("text", { x: x + width - 5, y: y + 13, "text-anchor": "end", class: "roll-note-mark" }, group, "L");
      }
      if (isCurrent) {
        shape.setAttribute("stroke-width", "4");
      }
      const hitLayout = noteHitLayout(note, x, width, geometry, song.notes);
      const resizeHandle = svgElement("rect", {
        x: hitLayout.resizeX,
        y: y - 2,
        width: hitLayout.resizeWidth,
        height: geometry.rowHeight,
        class: "roll-resize-handle",
        "data-action": "resize-note",
        "data-note-id": note.id,
        "aria-hidden": "true"
      }, group);
      const moveHit = svgElement("rect", {
        x: hitLayout.moveX,
        y: y - 2,
        width: hitLayout.moveWidth,
        height: geometry.rowHeight,
        class: "roll-move-hit",
        fill: "transparent",
        "pointer-events": "all",
        "aria-hidden": "true"
      }, group);
      if (!hitLayout.canResize) resizeHandle.setAttribute("display", "none");
    }

    // Kandidat lain digambar sangat tipis dulu, di belakang kandidat aktif. Jadi
    // user bisa lihat arah tiap opsi tanpa harus pindah-pindah card di dock.
    //
    // Kelembutannya pakai `opacity` pada satu lapisan, bukan `fill-opacity` per
    // rect. fill-opacity terakumulasi kalau dua ghost menumpuk, dan di pitch yang
    // sama beberapa kandidat memang often overlap, sehingga ghost bisa terlihat
    // lebih pekat dari kandidat aktif. `opacity` pada group melapis sekali di akhir.
    const idleCandidates = (state.generation?.candidates ?? []).filter((candidate) => candidate.id !== state.generation.activeCandidateId);
    const ghostLayer = idleCandidates.length > 0
      ? svgElement("g", {
        class: "roll-candidate-ghost-layer",
        "aria-hidden": "true",
        "pointer-events": "none"
      }, svg)
      : null;

    if (ghostLayer) {
      for (const candidate of idleCandidates) {
        for (const note of candidate.notes) {
          if (note.pitch < geometry.minMidi || note.pitch > geometry.maxMidi
            || note.startTick + note.durationTicks <= geometry.startTick || note.startTick >= geometry.endTick) continue;
          const x = tickToX(note.startTick, geometry);
          const y = midiToY(note.pitch, geometry) + 2;
          const width = note.durationTicks * geometry.pixelsPerQuarter / geometry.ppq;
          svgElement("rect", {
            x,
            y,
            width,
            height: geometry.rowHeight - 4,
            rx: 3,
            class: "roll-candidate-ghost",
            "data-entity": "candidate-ghost",
            "data-candidate-id": candidate.id
          }, ghostLayer);
        }
      }
    }

    if (activeCandidate) {
      for (const note of activeCandidate.notes) {
        if (note.pitch < geometry.minMidi || note.pitch > geometry.maxMidi
          || note.startTick + note.durationTicks <= geometry.startTick || note.startTick >= geometry.endTick) continue;
        const x = tickToX(note.startTick, geometry);
        const y = midiToY(note.pitch, geometry) + 2;
        const width = note.durationTicks * geometry.pixelsPerQuarter / geometry.ppq;
        const group = svgElement("g", {
          "data-entity": "candidate-note",
          "data-candidate-id": activeCandidate.id,
          "data-candidate-note-id": note.id,
          "data-pitch": note.pitch,
          "data-start-tick": note.startTick,
          "data-duration-ticks": note.durationTicks,
          "pointer-events": "all",
          role: "img",
          "aria-label": `${midiToPitch(note.pitch)}, candidate, tick ${note.startTick}, duration ${note.durationTicks}`
        }, svg);
        svgElement("rect", {
          x,
          y,
          width,
          height: geometry.rowHeight - 4,
          rx: 3,
          class: "roll-candidate-note",
          "pointer-events": "all"
        }, group);
      }
    }

    const playheadX = tickToX(state.playback.currentTick, geometry);
    svgElement("line", {
      x1: playheadX,
      x2: playheadX,
      y1: 0,
      y2: geometry.height,
      class: "roll-playhead",
      "data-entity": "playhead",
      "data-tick": state.playback.currentTick,
      "pointer-events": "none"
    }, svg);

    const pitchLayer = svgElement("g", {
      class: "roll-pitch-label-layer",
      "data-entity": "pitch-label-layer",
      "pointer-events": "none"
    }, svg);
    svgElement("rect", {
      x: 0,
      y: PIANO_RULER_HEIGHT,
      width: geometry.labelWidth,
      height: geometry.height - PIANO_RULER_HEIGHT,
      class: "roll-pitch-label-gutter"
    }, pitchLayer);
    svgElement("text", { x: 4, y: PIANO_RULER_HEIGHT + 27, class: "roll-bar-label", "font-size": 12 }, pitchLayer, translate("harmonyLaneLabel"));
    for (let midi = geometry.maxMidi; midi >= geometry.minMidi; midi -= 1) {
      const y = midiToY(midi, geometry);
      svgElement("text", {
        x: geometry.labelWidth - 7,
        y: y + 14,
        "text-anchor": "end",
        class: isBlackKey(midi) ? "roll-pitch-label roll-pitch-label-black" : "roll-pitch-label"
      }, pitchLayer, midiToPitch(midi));
    }
    svgElement("line", {
      x1: geometry.labelWidth,
      x2: geometry.labelWidth,
      y1: geometry.top,
      y2: geometry.height,
      class: "roll-pitch-label-divider"
    }, pitchLayer);

    if (scrollContainer) {
      // Auto-scroll hanya boleh jalan kalau tujuan fokus benar-benar BERUBAH.
      // Sebelumnya setiap render memaksa scrollLeft ke focusTick, dan focusTick
      // jatuh ke playback.currentTick yaitu 0 saat transport berhenti. Akibatnya
      // menggulir ke kanan akan ditarik balik ke kiri pada render berikutnya
      // (misalnya saat mengubah tempo), dan baris yang sudah digulir user hilang.
      const focusChanged = focusTick !== lastFocusTick;
      if (focusChanged) {
        const maxScrollLeft = Math.max(0, geometry.width - scrollContainer.clientWidth);
        scrollContainer.scrollLeft = Math.max(0, Math.min(maxScrollLeft, tickToX(focusTick, geometry) - scrollContainer.clientWidth * 0.35));
      } else {
        scrollContainer.scrollLeft = savedLeft;
      }
      scrollContainer.scrollTop = savedTop;
      syncFrozenPitchLabels();
    }
    lastFocusTick = focusTick;
  }

  function updatePlayback(playback, {
    followMode = "center",
    songEndTick = timelineEndTick
  } = {}) {
    const rangeSignature = `${playback.loop?.startTick ?? 0}:${playback.loop?.endTick ?? songEndTick}`;
    if (rangeSignature !== lastPlaybackRange) {
      render(commands.getSong(), commands.getState(), null, songEndTick);
      return;
    }
    const playbackTickChanged = playback.currentTick !== lastPlaybackTick;
    lastPlaybackTick = playback.currentTick;
    if (playback.currentTick < geometry.startTick || playback.currentTick >= geometry.endTick) {
      if (followMode !== "none" && playback.status === "playing" && (playbackTickChanged || pendingPlaybackFollow)) {
        if (activeDrag || chordDrag || finishingDrag) {
          pendingPlaybackFollow = true;
        } else {
          pendingPlaybackFollow = false;
          render(commands.getSong(), commands.getState(), playback.currentTick, songEndTick);
          if (followMode === "center" && scrollContainer?.clientWidth > 0) {
            const x = tickToX(playback.currentTick, geometry);
            scrollContainer.scrollLeft = centeredScrollLeft({
              playheadX: x,
              viewportWidth: scrollContainer.clientWidth,
              gutterWidth: geometry.labelWidth,
              contentWidth: geometry.width
            });
            syncFrozenPitchLabels();
          }
        }
      } else {
        pendingPlaybackFollow = false;
      }
    } else {
      if (!activeDrag && !chordDrag) pendingPlaybackFollow = false;
      const x = tickToX(playback.currentTick, geometry);
      const playhead = svg.querySelector('[data-entity="playhead"]');
      if (playhead) {
        playhead.setAttribute("x1", String(x));
        playhead.setAttribute("x2", String(x));
        playhead.setAttribute("data-tick", String(playback.currentTick));
      }
      if (followMode !== "none" && playback.status === "playing" && scrollContainer?.clientWidth > 0 && !activeDrag && !chordDrag && !finishingDrag) {
        if (followMode === "center") {
          scrollContainer.scrollLeft = centeredScrollLeft({
            playheadX: x,
            viewportWidth: scrollContainer.clientWidth,
            gutterWidth: geometry.labelWidth,
            contentWidth: geometry.width
          });
          syncFrozenPitchLabels();
        } else {
          const left = scrollContainer.scrollLeft;
          const right = left + scrollContainer.clientWidth;
          if (x < left + geometry.labelWidth || x > right - 24) {
            const maximum = Math.max(0, geometry.width - scrollContainer.clientWidth);
            scrollContainer.scrollLeft = Math.max(0, Math.min(maximum, x - scrollContainer.clientWidth * 0.35));
            syncFrozenPitchLabels();
          }
        }
      }
    }
    for (const group of svg.querySelectorAll('[data-entity="chord"]')) {
      const start = Number(group.dataset.startTick);
      const end = start + Number(group.dataset.durationTicks);
      const current = playback.status === "playing" && playback.currentTick >= start && playback.currentTick < end;
      group.setAttribute("data-current", String(current));
      const shape = group.querySelector('[data-chord-shape]');
      shape?.setAttribute("stroke-width", current ? "4" : group.dataset.selected === "true" ? "3" : "1");
    }
    for (const group of svg.querySelectorAll('[data-entity="note"]')) {
      const current = group.dataset.entityId === playback.currentNoteId;
      group.dataset.current = String(current);
      const shape = group.querySelector("[data-note-shape]");
      if (shape) shape.setAttribute("stroke-width", current ? "4" : group.dataset.selected === "true" ? "3" : "1.5");
      const note = {
        pitch: Number(group.dataset.pitch),
        startTick: Number(group.dataset.startTick),
        durationTicks: Number(group.dataset.durationTicks),
        source: group.dataset.source,
        anchor: group.dataset.anchor === "true",
        locked: group.dataset.locked === "true"
      };
      group.setAttribute("aria-label", noteDescription(note, group.dataset.selected === "true", current));
    }
  }

  function beginDrag(event) {
    if (event.button !== 0) return;
    const chordGroup = event.target.closest?.('[data-entity="chord"]');
    const harmonyBar = event.target.closest?.('[data-entity="harmony-bar"]');
    if (chordGroup || harmonyBar) {
      event.preventDefault();
      const point = pointerPoint(event);
      const state = commands.getState();
      if (chordGroup) {
        const chord = commands.getSong().chords.find(item => item.id === chordGroup.dataset.entityId);
        if (!chord) return;
        const selectedBefore = state.selectedChordId === chord.id;
        commands.selectChord(chord.id);
        chordPressPoint = point;
        if (event.pointerType === "touch") chordLongPress = setTimeout(() => {
          chordLongPress = null; chordDrag = null; ignoreNextClick = true;
          onChordContextMenu(chord, event);
        }, 550);
        if (!chord.locked && selectedBefore && state.editor.tool !== "draw") chordDrag = {
          pointerId: event.pointerId, kind: event.target.closest?.('[data-action="resize-chord"]') ? "resize" : "move",
          chord: { ...chord }, startX: point.x, currentX: point.x, snap: state.editor.chordSnap ?? "bar", moved: false
        };
      } else if (state.editor.tool === "draw") chordDrag = {
        pointerId: event.pointerId, kind: "draw", startX: point.x, currentX: point.x, snap: state.editor.chordSnap ?? "bar", moved: false,
        defaults: { ...getChordDrawDefaults() }
      };
      else commands.setHarmonyRange(Number(harmonyBar.dataset.startTick), Number(harmonyBar.dataset.endTick));
      focusChordEditor();
      try { svg.setPointerCapture?.(event.pointerId); } catch {}
      return;
    }
    const state = commands.getState();
    const ruler = event.target.closest?.('[data-action="seek-ruler"]');
    if (ruler && svg.contains(ruler)) {
      event.preventDefault();
      try {
        const point = pointerPoint(event);
        const tick = Math.min(timelineEndTick, rulerSeekTick(point.x, geometry, state.editor.snap));
        rulerDrag = {
          pointerId: event.pointerId,
          startX: point.x,
          startTick: tick,
          currentTick: tick,
          moved: false,
          element: null
        };
        svg.setPointerCapture?.(event.pointerId);
      } catch (error) {
        onError(error);
      }
      return;
    }
    const handle = event.target.closest?.('[data-action="resize-note"]');
    const group = event.target.closest?.('[data-entity="note"]');
    if (!group || !svg.contains(group)) {
      if (event.target.closest?.('[data-entity="candidate-note"], [data-action], text')) return;
      const point = pointerPoint(event);
      if (point.x < geometry.labelWidth || point.y < geometry.top || point.y >= geometry.height) return;
      if (state.editor.tool === "draw") {
        event.preventDefault();
        drawDrag = {
          pointerId: event.pointerId,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y,
          snap: state.editor.snap,
          moved: false,
          element: null
        };
        try { svg.setPointerCapture(event.pointerId); } catch {}
        return;
      }
      selectionDrag = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
        additive: Boolean(event.shiftKey || event.ctrlKey || event.metaKey),
        moved: false,
        element: null
      };
      try { svg.setPointerCapture(event.pointerId); } catch {}
      return;
    }
    if (state.editor.tool !== "select") return;
    event.preventDefault();
    const noteId = handle?.dataset.noteId ?? group.dataset.entityId;
    const song = commands.getSong();
    const note = song.notes.find((item) => item.id === noteId);
    if (!note) return;
    const selectedBefore = commands.getSelectedNoteIds();
    if (event.ctrlKey || event.metaKey || event.shiftKey || !selectedBefore.includes(noteId)) {
      setGroupSelection(noteId, event);
    }
    pendingNoteClickId = noteId;
    const currentNotes = new Map(song.notes.map((item) => [item.id, item]));
    const moveIds = !handle && state.selectedNoteIds.includes(noteId) ? state.selectedNoteIds : [noteId];
    const originals = moveIds.map((id) => currentNotes.get(id)).filter(Boolean).map((item) => ({
      noteId: item.id,
      pitch: item.pitch,
      startTick: item.startTick,
      durationTicks: item.durationTicks
    }));
    const point = pointerPoint(event);
    activeDrag = {
      pointerId: event.pointerId,
      mode: handle ? "resize" : "move",
      noteId,
      originals,
      startX: point.x,
      startY: point.y,
      snap: state.editor.snap,
      moved: false
    };
    try { svg.setPointerCapture(event.pointerId); } catch {}
  }

  function previewDrag(event) {
    if (chordDrag && chordDrag.pointerId === event.pointerId) {
      const point = pointerPoint(event);
      chordDrag.currentX = point.x;
      if (Math.abs(point.x - chordDrag.startX) < 4) return;
      chordDrag.moved = true;
      clearTimeout(chordLongPress); chordLongPress = null;
      const range = chordDrag.kind === "draw" ? chordDrawRange(chordDrag.startX, point.x, geometry, chordDrag.snap)
        : { ...chordDrag.chord, ...chordGesturePatch(chordDrag.chord, point.x - chordDrag.startX, geometry, chordDrag.kind, chordDrag.snap) };
      if (!chordDrag.preview) chordDrag.preview = svgElement("rect", { y: PIANO_RULER_HEIGHT + 2, height: HARMONY_LANE_HEIGHT - 4,
        fill: "var(--accent)", opacity: .5, "pointer-events": "none", "data-entity": "chord-preview" }, svg);
      chordDrag.preview.setAttribute("x", String(tickToX(range.startTick, geometry)));
      chordDrag.preview.setAttribute("width", String(range.durationTicks * geometry.pixelsPerQuarter / geometry.ppq));
      return;
    }
    if (chordLongPress && chordPressPoint) {
      const point = pointerPoint(event);
      if (Math.hypot(point.x - chordPressPoint.x, point.y - chordPressPoint.y) > 8) { clearTimeout(chordLongPress); chordLongPress = null; }
    }
    if (rulerDrag && rulerDrag.pointerId === event.pointerId) {
      try {
        const point = pointerPoint(event);
        const tick = Math.min(timelineEndTick, rulerSeekTick(point.x, geometry, commands.getState().editor.snap));
        if (!rulerDrag.moved && Math.abs(point.x - rulerDrag.startX) < 4) return;
        rulerDrag.moved = true;
        rulerDrag.currentTick = tick;
        const startTick = Math.min(rulerDrag.startTick, tick);
        const endTick = Math.max(rulerDrag.startTick, tick);
        const x = tickToX(startTick, geometry);
        const right = tickToX(endTick, geometry);
        if (!rulerDrag.element) {
          rulerDrag.element = svgElement("rect", {
            y: 0,
            height: PIANO_RULER_HEIGHT,
            class: "roll-timeline-selection roll-timeline-selection-preview",
            "pointer-events": "none",
            "aria-hidden": "true"
          }, svg);
        }
        rulerDrag.element.setAttribute("x", String(x));
        rulerDrag.element.setAttribute("width", String(Math.max(1, right - x)));
      } catch (error) {
        onError(error);
      }
      return;
    }
    if (drawDrag && drawDrag.pointerId === event.pointerId) {
      const point = pointerPoint(event);
      drawDrag.currentX = point.x;
      drawDrag.currentY = point.y;
      if (Math.hypot(point.x - drawDrag.startX, point.y - drawDrag.startY) >= 3) drawDrag.moved = true;
      const input = drawNoteInputFromDrag({ x: drawDrag.startX, y: drawDrag.startY }, point, geometry, drawDrag.snap);
      const x = tickToX(input.startTick, geometry);
      const y = midiToY(input.pitch, geometry) + 2;
      const width = input.durationTicks * geometry.pixelsPerQuarter / geometry.ppq;
      if (!drawDrag.element) {
        drawDrag.element = svgElement("rect", { class: "roll-draw-preview", "pointer-events": "none", "aria-hidden": "true" }, svg);
      }
      drawDrag.element.setAttribute("x", String(x));
      drawDrag.element.setAttribute("y", String(y));
      drawDrag.element.setAttribute("width", String(width));
      drawDrag.element.setAttribute("height", String(geometry.rowHeight - 4));
      return;
    }
    if (selectionDrag && selectionDrag.pointerId === event.pointerId) {
      const point = pointerPoint(event);
      selectionDrag.currentX = point.x;
      selectionDrag.currentY = point.y;
      const distance = Math.hypot(point.x - selectionDrag.startX, point.y - selectionDrag.startY);
      if (distance < 4 && !selectionDrag.moved) return;
      selectionDrag.moved = true;
      const x = Math.min(selectionDrag.startX, point.x);
      const y = Math.min(selectionDrag.startY, point.y);
      const width = Math.abs(point.x - selectionDrag.startX);
      const height = Math.abs(point.y - selectionDrag.startY);
      if (!selectionDrag.element) {
        selectionDrag.element = svgElement("rect", {
          class: "roll-selection-box",
          "pointer-events": "none"
        }, svg);
      }
      selectionDrag.element.setAttribute("x", String(x));
      selectionDrag.element.setAttribute("y", String(y));
      selectionDrag.element.setAttribute("width", String(width));
      selectionDrag.element.setAttribute("height", String(height));
      return;
    }
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const point = pointerPoint(event);
    const distance = Math.hypot(point.x - activeDrag.startX, point.y - activeDrag.startY);
    if (distance < 3 && !activeDrag.moved) return;
    activeDrag.moved = true;
    if (activeDrag.mode === "move") {
      const { tickDelta, pitchDelta } = moveDeltaFromDrag(activeDrag, point, geometry);
      const dx = tickDelta * geometry.pixelsPerQuarter / geometry.ppq;
      const dy = -pitchDelta * geometry.rowHeight;
      for (const noteInfo of activeDrag.originals) {
        const target = [...svg.querySelectorAll('[data-entity="note"]')].find((group) => group.dataset.entityId === noteInfo.noteId);
        target?.setAttribute("transform", `translate(${dx} ${dy})`);
      }
    } else {
      const original = activeDrag.originals[0];
      const duration = resizeDurationFromDrag(original.durationTicks, activeDrag.startX, point.x, geometry, activeDrag.snap);
      const group = svg.querySelector(`[data-entity="note"][data-entity-id="${CSS.escape(activeDrag.noteId)}"]`);
      const shape = group?.querySelector("[data-note-shape]");
      const handle = group?.querySelector('[data-action="resize-note"]');
      const visibleStartTick = Math.max(original.startTick, geometry.startTick);
      const visibleEndTick = Math.min(original.startTick + duration, geometry.endTick);
      const width = Math.max(0, visibleEndTick - visibleStartTick)
        * geometry.pixelsPerQuarter / geometry.ppq;
      shape?.setAttribute("width", String(width));
      const x = Number(shape?.getAttribute("x") ?? 0);
      const hitLayout = noteHitLayout({ ...original, id: original.noteId, durationTicks: duration }, x, width, geometry, commands.getSong().notes);
      handle?.setAttribute("x", String(hitLayout.resizeX));
      handle?.setAttribute("width", String(hitLayout.resizeWidth));
      handle?.setAttribute("y", String(Number(shape?.getAttribute("y") ?? 0) - 2));
      handle?.setAttribute("height", String(geometry.rowHeight));
      handle?.setAttribute("display", hitLayout.canResize ? "" : "none");
      const moveHit = group?.querySelector(".roll-move-hit");
      moveHit?.setAttribute("x", String(hitLayout.moveX));
      moveHit?.setAttribute("width", String(hitLayout.moveWidth));
      moveHit?.setAttribute("y", String(Number(shape?.getAttribute("y") ?? 0) - 2));
      moveHit?.setAttribute("height", String(geometry.rowHeight));
    }
  }

  function finishDrag(event, cancelled = false) {
    clearTimeout(chordLongPress); chordLongPress = null;
    chordPressPoint = null;
    if (chordDrag && chordDrag.pointerId === event.pointerId) {
      const gesture = chordDrag; chordDrag = null;
      gesture.preview?.remove();
      try { svg.releasePointerCapture?.(event.pointerId); } catch {}
      ignoreNextClick = true;
      if (!cancelled) try {
        if (gesture.kind === "draw") {
          const range = chordDrawRange(gesture.startX, gesture.moved ? gesture.currentX : gesture.startX, geometry, gesture.snap);
          const chord = commands.addChord({ ...gesture.defaults, ...range });
          commands.selectChord(chord.id);
        } else if (gesture.moved) {
          const patch = chordGesturePatch(gesture.chord, gesture.currentX - gesture.startX, geometry, gesture.kind, gesture.snap);
          if (Object.entries(patch).some(([key,value]) => value !== gesture.chord[key])) commands.updateChord(gesture.chord.id, patch);
        }
      } catch (error) { onError(error); }
      render(commands.getSong(), commands.getState());
      focusChordEditor();
      return;
    }
    if (rulerDrag && rulerDrag.pointerId === event.pointerId) {
      const drag = rulerDrag;
      rulerDrag = null;
      drag.element?.remove();
      try { svg.releasePointerCapture?.(event.pointerId); } catch {}
      if (!cancelled) {
        try {
          if (!drag.moved || drag.startTick === drag.currentTick) {
            commands.seek(drag.startTick);
          } else {
            const startTick = Math.min(drag.startTick, drag.currentTick);
            const endTick = Math.max(drag.startTick, drag.currentTick);
            commands.setLoop(startTick, endTick);
            commands.seek(startTick);
          }
        } catch (error) {
          onError(error);
        }
      }
      ignoreNextClick = true;
      setTimeout(() => { ignoreNextClick = false; }, 0);
      return;
    }
    if (drawDrag && drawDrag.pointerId === event.pointerId) {
      const drag = drawDrag;
      drawDrag = null;
      drag.element?.remove();
      if (!cancelled) {
        try {
          const point = pointerPoint(event);
          onAddNote(drawNoteInputFromDrag({ x: drag.startX, y: drag.startY }, point, geometry, drag.snap));
        } catch (error) {
          onError(error);
        }
      }
      ignoreNextClick = true;
      setTimeout(() => { ignoreNextClick = false; }, 0);
      return;
    }
    if (selectionDrag && selectionDrag.pointerId === event.pointerId) {
      const drag = selectionDrag;
      selectionDrag = null;
      drag.element?.remove();
      if (cancelled || !drag.moved) return;
      const left = Math.min(drag.startX, drag.currentX);
      const right = Math.max(drag.startX, drag.currentX);
      const top = Math.min(drag.startY, drag.currentY);
      const bottom = Math.max(drag.startY, drag.currentY);
      const song = commands.getSong();
      const hitIds = song.notes.filter((note) => {
        if (note.pitch < geometry.minMidi || note.pitch > geometry.maxMidi) return false;
        const noteLeft = tickToX(Math.max(note.startTick, geometry.startTick), geometry);
        const noteRight = tickToX(Math.min(note.startTick + note.durationTicks, geometry.endTick), geometry);
        const noteTop = midiToY(note.pitch, geometry);
        const noteBottom = noteTop + geometry.rowHeight;
        return noteRight >= left && noteLeft <= right && noteBottom >= top && noteTop <= bottom;
      }).map((note) => note.id);
      const next = drag.additive
        ? [...new Set([...commands.getSelectedNoteIds(), ...hitIds])]
        : hitIds;
      if (next.length) commands.selectNotes(next);
      else commands.clearSelection();
      ignoreNextClick = true;
      setTimeout(() => { ignoreNextClick = false; }, 0);
      return;
    }
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const drag = activeDrag;
    activeDrag = null;
    const pendingClickId = pendingNoteClickId;
    if (pendingClickId) {
      setTimeout(() => {
        if (pendingNoteClickId === pendingClickId) pendingNoteClickId = null;
      }, 0);
    }
    ignoreNextClick = drag.moved;
    if (drag.moved) setTimeout(() => { ignoreNextClick = false; }, 0);
    if (cancelled || !drag.moved) {
      render(commands.getSong(), commands.getState());
      followPendingPlayback();
      return;
    }
    finishingDrag = true;
    try {
      const point = pointerPoint(event);
      if (drag.mode === "move") {
        const { tickDelta, pitchDelta } = moveDeltaFromDrag(drag, point, geometry);
        commands.updateNotes(drag.originals.map((item) => ({
          noteId: item.noteId,
          patch: { startTick: item.startTick + tickDelta, pitch: item.pitch + pitchDelta }
        })));
        commands.selectNotes(drag.originals.map((item) => item.noteId));
      } else {
        const original = drag.originals[0];
        const durationTicks = resizeDurationFromDrag(original.durationTicks, drag.startX, point.x, geometry, drag.snap);
        if (durationTicks !== original.durationTicks) commands.updateNote(drag.noteId, { durationTicks });
        commands.selectNotes([drag.noteId]);
      }
    } catch (error) {
      onError(error);
      render(commands.getSong(), commands.getState());
    } finally {
      finishingDrag = false;
      followPendingPlayback();
    }
  }

  function followPendingPlayback() {
    if (pendingPlaybackFollow && !activeDrag) {
      const state = normalizeRuntimeState(commands.getState());
      updatePlayback(state.playback, { follow: state.view.follow });
    }
  }

  function handleClick(event) {
    if (ignoreNextClick) {
      ignoreNextClick = false;
      return;
    }
    const chord = event.target.closest?.('[data-entity="chord"]');
    const bar = event.target.closest?.('[data-entity="harmony-bar"]');
    if (chord && svg.contains(chord)) { commands.selectChord(chord.dataset.entityId); focusChordEditor(); return; }
    if (bar && svg.contains(bar)) { commands.setHarmonyRange(Number(bar.dataset.startTick), Number(bar.dataset.endTick)); focusChordEditor(); return; }
    const group = event.target.closest?.('[data-entity="note"]');
    if (pendingNoteClickId) {
      pendingNoteClickId = null;
      return;
    }
    if (group && svg.contains(group)) {
      setGroupSelection(group.dataset.entityId, event);
      return;
    }
    if (event.target.closest?.('[data-entity="candidate-note"]')) return;
    if (event.target.closest?.("[data-action]") || event.target.closest?.("text")) return;
    const point = pointerPoint(event);
    if (point.x < geometry.labelWidth || point.y < geometry.top || point.y >= geometry.height) return;
    const state = commands.getState();
    if (state.editor.tool === "select" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      commands.clearSelection();
    }
  }

  svg.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const chordGroup = event.target.closest?.('[data-entity="chord"]');
    if (chordGroup) {
      const chord = commands.getSong().chords.find(item => item.id === chordGroup.dataset.entityId);
      if (chord) { commands.selectChord(chord.id); focusChordEditor(); onChordContextMenu(chord, event); }
      return;
    }
    const group = event.target.closest?.('[data-entity="note"]');
    if (group && svg.contains(group)) {
      const noteId = group.dataset.entityId;
      if (!commands.getSelectedNoteIds().includes(noteId)) commands.selectNotes([noteId]);
      onContextMenu({
        kind: "selection",
        source: "piano-roll",
        noteId,
        clientX: event.clientX,
        clientY: event.clientY
      });
      return;
    }
    const point = pointerPoint(event);
    if (point.x < geometry.labelWidth || point.y < geometry.top || point.y >= geometry.height) return;
    const state = commands.getState();
    onContextMenu({
      kind: "empty",
      source: "piano-roll",
      pitch: Math.max(0, Math.min(127, yToMidi(point.y, geometry))),
      startTick: snapTick(xToTick(point.x, geometry), state.editor.snap),
      clientX: event.clientX,
      clientY: event.clientY
    });
  });

  svg.addEventListener("keydown", (event) => {
    const chord = event.target.closest?.('[data-entity="chord"]');
    const bar = event.target.closest?.('[data-entity="harmony-bar"]');
    if ((chord || bar) && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      if (chord) commands.selectChord(chord.dataset.entityId);
      else commands.setHarmonyRange(Number(bar.dataset.startTick), Number(bar.dataset.endTick));
      focusChordEditor();
      return;
    }
    const ruler = event.target.closest?.('[data-action="seek-ruler"]');
    if (!ruler || !svg.contains(ruler)) return;
    const state = commands.getState();
    const interval = SNAP_TICKS[state.editor.snap] ?? SNAP_TICKS["1/8"];
    let nextTick = state.playback.currentTick;
    if (event.key === "ArrowLeft") nextTick -= interval;
    else if (event.key === "ArrowRight") nextTick += interval;
    else if (event.key === "Home") nextTick = geometry.startTick;
    else return;
    event.preventDefault();
    commands.seek(Math.max(geometry.startTick, Math.min(geometry.endTick, nextTick)));
  });

  scrollContainer?.addEventListener("scroll", syncFrozenPitchLabels, { passive: true });

  svg.addEventListener("pointerdown", beginDrag);
  svg.addEventListener("pointermove", previewDrag);
  svg.addEventListener("pointerup", (event) => finishDrag(event));
  svg.addEventListener("pointercancel", (event) => finishDrag(event, true));
  svg.addEventListener("lostpointercapture", (event) => finishDrag(event, true));
  svg.addEventListener("click", handleClick);

  return Object.freeze({
    render,
    updatePlayback,
    getGeometry: () => ({ ...geometry })
  });
}
