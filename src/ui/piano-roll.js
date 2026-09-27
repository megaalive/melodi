import { midiToPitch, PPQ } from "../core/model.js";
import { SNAP_TICKS } from "../core/editor.js";
import { normalizeRuntimeState } from "../core/runtime-state.js";

export { SNAP_TICKS };
export const DEFAULT_PITCH_RANGE = Object.freeze({ min: 48, max: 83 });
export const MAX_ROLL_BARS = 64;

const SVG_NS = "http://www.w3.org/2000/svg";
const PIANO_ROW_HEIGHT = 24;
const PIANO_TOP = 34;
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
  viewportWidth = 0
} = {}) {
  if (!Number.isSafeInteger(ppq) || ppq <= 0 || !Number.isSafeInteger(numerator) || numerator <= 0
    || !Number.isSafeInteger(denominator) || denominator <= 0) throw new RangeError("Invalid musical grid.");
  if (!Number.isFinite(endTick) || endTick < 0) throw new RangeError("Invalid grid end tick.");
  if (!Number.isFinite(focusTick) || focusTick < 0) throw new RangeError("Invalid grid focus tick.");
  const beatTicks = ppq * 4 / denominator;
  const barTicks = beatTicks * numerator;
  if (!Number.isSafeInteger(beatTicks) || !Number.isSafeInteger(barTicks) || barTicks <= 0) throw new RangeError("Invalid musical grid.");
  const barsToCoverSong = Math.max(1, Math.ceil(endTick / barTicks) + 1);
  const fitsWholeSong = barsToCoverSong <= MAX_ROLL_BARS;
  const requestedBars = fitsWholeSong ? barsToCoverSong : MAX_ROLL_BARS;
  const maxGridTicks = barTicks * MAX_ROLL_BARS;
  const gridTicks = requestedBars * barTicks;
  const usableViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > labelWidth
    ? viewportWidth - labelWidth
    : 0;
  const fittedPixelsPerQuarter = usableViewportWidth > 0
    ? usableViewportWidth * ppq / gridTicks
    : pixelsPerQuarter;
  // Zoom mengikuti lebar panel, dengan batas bawah saja. Dulu ada batas atas 2x,
  // dan itulah penyebab panel menyisakan ruang mati di kanan untuk lagu pendek:
  // satu bar di viewport 1113px butuh 264px per nada, lalu dipaksa turun ke
  // 160px sehingga 417px grid tidak pernah digambar. Batas bawah tetap
  // diperlukan supaya nada tidak terlalu rapat; kalau grid melebihi viewport,
  //panel yang menggulir secara horizontal, bukan grid yang mengecil.
  const resolvedPixelsPerQuarter = Math.max(pixelsPerQuarter, fittedPixelsPerQuarter);
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
  return geometry.startTick + (x - geometry.labelWidth) * geometry.ppq / geometry.pixelsPerQuarter;
}

export function midiToY(midi, geometry) {
  return geometry.top + (geometry.maxMidi - midi) * geometry.rowHeight;
}

export function yToMidi(y, geometry) {
  return geometry.maxMidi - Math.floor((y - geometry.top) / geometry.rowHeight);
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

function noteDescription(note, selected, current) {
  const states = [note.source, note.anchor ? "anchor" : "", note.locked ? "locked" : "", selected ? "selected" : "", current ? "playing" : ""]
    .filter(Boolean).join(", ");
  return `${midiToPitch(note.pitch)}, tick ${note.startTick}, duration ${note.durationTicks}, ${states}`;
}

function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

export function createPianoRollView(svg, commands, { onAddNote = () => {}, onContextMenu = () => {}, onError = () => {} } = {}) {
  const scrollContainer = svg.parentElement;
  let geometry = createRollGeometry();
  let activeDrag = null;
  let finishingDrag = false;
  let ignoreNextClick = false;
  let pendingNoteClickId = null;
  let selectionDrag = null;
  let lastPlaybackTick = 0;
  let pendingPlaybackFollow = false;
  let lastFocusTick = null;

  function pointerPoint(event) {
    const bounds = svg.getBoundingClientRect();
    const scaleX = bounds.width > 0 ? geometry.width / bounds.width : 1;
    const scaleY = bounds.height > 0 ? geometry.height / bounds.height : 1;
    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY
    };
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

  function render(song, state = commands.getState(), focusTickOverride = null) {
    state = normalizeRuntimeState(state);
    const savedLeft = scrollContainer?.scrollLeft ?? 0;
    const savedTop = scrollContainer?.scrollTop ?? 0;
    const endTick = song.notes.reduce((end, note) => Math.max(end, note.startTick + note.durationTicks), state.playback.currentTick);
    const selectedNote = [...state.selectedNoteIds].reverse().map((id) => song.notes.find((note) => note.id === id)).find(Boolean);
    const activeCandidate = state.generation?.candidates?.find((candidate) => candidate.id === state.generation.activeCandidateId);
    const focusTick = focusTickOverride ?? (activeCandidate ? state.generation.gap?.startTick : null) ?? selectedNote?.startTick ?? state.playback.currentTick;
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
      viewportWidth: scrollContainer?.clientWidth ?? 0
    });
    svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
    svg.setAttribute("width", geometry.width);
    svg.setAttribute("height", geometry.height);
    svg.setAttribute("aria-label", `Piano Roll, ${numerator}/${denominator}, snap ${state.editor.snap}`);
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
      if (midi % 12 === 0) {
        svgElement("text", { x: geometry.labelWidth - 7, y: y + 14, "text-anchor": "end", class: "roll-pitch-label" }, svg, midiToPitch(midi));
      }
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
      y1: geometry.top,
      y2: geometry.height,
      class: "roll-playhead",
      "data-entity": "playhead",
      "data-tick": state.playback.currentTick,
      "pointer-events": "none"
    }, svg);
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
    }
    lastFocusTick = focusTick;
  }

  function updatePlayback(playback, { follow = true } = {}) {
    const playbackTickChanged = playback.currentTick !== lastPlaybackTick;
    lastPlaybackTick = playback.currentTick;
    if (playback.currentTick < geometry.startTick || playback.currentTick >= geometry.endTick) {
      if (follow && playback.status === "playing" && (playbackTickChanged || pendingPlaybackFollow)) {
        if (activeDrag || finishingDrag) {
          pendingPlaybackFollow = true;
        } else {
          pendingPlaybackFollow = false;
          render(commands.getSong(), commands.getState(), playback.currentTick);
        }
      } else {
        pendingPlaybackFollow = false;
      }
    } else {
      if (!activeDrag) pendingPlaybackFollow = false;
      const x = tickToX(playback.currentTick, geometry);
      const playhead = svg.querySelector('[data-entity="playhead"]');
      if (playhead) {
        playhead.setAttribute("x1", String(x));
        playhead.setAttribute("x2", String(x));
        playhead.setAttribute("data-tick", String(playback.currentTick));
      }
      if (follow && playback.status === "playing" && scrollContainer?.clientWidth > 0 && !activeDrag && !finishingDrag) {
        const left = scrollContainer.scrollLeft;
        const right = left + scrollContainer.clientWidth;
        if (x < left + geometry.labelWidth || x > right - 24) {
          const maximum = Math.max(0, geometry.width - scrollContainer.clientWidth);
          scrollContainer.scrollLeft = Math.max(0, Math.min(maximum, x - scrollContainer.clientWidth * 0.35));
        }
      }
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
    const handle = event.target.closest?.('[data-action="resize-note"]');
    const group = event.target.closest?.('[data-entity="note"]');
    if (!group || !svg.contains(group)) {
      if (event.target.closest?.('[data-entity="candidate-note"], [data-action], text')) return;
      const point = pointerPoint(event);
      if (point.x < geometry.labelWidth || point.y < geometry.top || point.y >= geometry.height) return;
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
    const state = commands.getState();
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
    const pitch = Math.max(0, Math.min(127, yToMidi(point.y, geometry)));
    const startTick = snapTick(xToTick(point.x, geometry), state.editor.snap);
    onAddNote({ pitch, startTick, durationTicks: SNAP_TICKS[state.editor.snap] });
  }

  svg.addEventListener("contextmenu", (event) => {
    event.preventDefault();
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
