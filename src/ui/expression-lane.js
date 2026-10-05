import { tickToX } from "./piano-roll.js?v=20261003.92";

const SVG_NS = "http://www.w3.org/2000/svg";
const MODES = new Set(["bend", "volume", "pan", "vibrato"]);
const HEIGHT = 126;
const TOP = 20;
const BOTTOM = 106;

function svg(name, attrs = {}, parent = null, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  if (text !== null) element.textContent = text;
  if (parent) parent.append(element);
  return element;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function expressionY(mode, value, { top = TOP, bottom = BOTTOM, bendRange = 2 } = {}) {
  const height = bottom - top;
  if (mode === "volume") return top + (1 - clamp(value, 0, 1)) * height;
  if (mode === "pan") return top + (1 - (clamp(value, -1, 1) + 1) / 2) * height;
  if (mode === "vibrato") return top + (1 - clamp(value, 0, 2) / 2) * height;
  if (mode === "bend") return top + (1 - (clamp(value, -bendRange, bendRange) + bendRange) / (bendRange * 2)) * height;
  throw new RangeError("invalid-expression-mode");
}

export function valueFromExpressionY(mode, y, { top = TOP, bottom = BOTTOM } = {}) {
  const ratio = clamp((y - top) / Math.max(1, bottom - top), 0, 1);
  if (mode === "volume") return Number((1 - ratio).toFixed(2));
  if (mode === "pan") return Number((1 - ratio * 2).toFixed(2));
  if (mode === "vibrato") return Number((Math.round((1 - ratio) * 40) / 20).toFixed(2));
  throw new RangeError("expression-mode-not-editable");
}

export function bendLaneRange(notes = []) {
  const peak = Math.max(0, ...notes.flatMap((note) =>
    Array.isArray(note.pitchBend) ? note.pitchBend.map((point) => Math.abs(point.semitones)) : [0]));
  if (peak <= 1) return 1;
  if (peak <= 2) return 2;
  if (peak <= 4) return 4;
  return 12;
}

function valueLabel(mode, value) {
  if (mode === "volume") return `${Math.round(value * 100)}%`;
  if (mode === "pan") {
    const amount = Math.round(Math.abs(value) * 100);
    if (amount === 0) return "C";
    return value < 0 ? `L${amount}` : `R${amount}`;
  }
  if (mode === "vibrato") return value > 0 ? `±${Number(value.toFixed(2))}` : "Off";
  return "";
}

function axis(mode, bendRange) {
  if (mode === "volume") return [
    { value: 1, label: "100" },
    { value: 0.5, label: "50" },
    { value: 0, label: "0" }
  ];
  if (mode === "pan") return [
    { value: 1, label: "R" },
    { value: 0, label: "C" },
    { value: -1, label: "L" }
  ];
  if (mode === "vibrato") return [
    { value: 2, label: "±2" },
    { value: 1, label: "±1" },
    { value: 0, label: "Off" }
  ];
  return [
    { value: bendRange, label: `+${bendRange}` },
    { value: 0, label: "0" },
    { value: -bendRange, label: `−${bendRange}` }
  ];
}

function closestExpressionNote(target, root) {
  const element = target instanceof Element ? target.closest('[data-entity="expression-note"]') : null;
  return element && root.contains(element) ? element : null;
}

export function createExpressionLaneView(svgRoot, scrollContainer, peerScrollContainer, {
  onSelectNote = () => {},
  onChange = () => {},
  onEditBend = () => {},
  onInteractionChange = () => {}
} = {}) {
  let mode = "bend";
  let song = null;
  let state = null;
  let geometry = null;
  let bendRange = 2;
  let activeNoteId = null;
  let labelLayer = null;
  let drag = null;
  let suppressClick = false;
  let syncingScroll = false;
  const synchronizedScrollOffsets = new WeakMap();

  function localPoint(event) {
    const bounds = svgRoot.getBoundingClientRect();
    const width = Number(svgRoot.getAttribute("width")) || bounds.width || 1;
    const height = Number(svgRoot.getAttribute("height")) || bounds.height || 1;
    return {
      x: (event.clientX - bounds.left) * width / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) * height / Math.max(1, bounds.height)
    };
  }

  function updateFrozenLabels() {
    if (labelLayer) labelLayer.setAttribute("transform", `translate(${scrollContainer.scrollLeft} 0)`);
  }

  function isVisibleScrollport(element) {
    if (!element || element.clientWidth <= 0) return false;
    const bounds = element.getBoundingClientRect?.();
    if (bounds && (bounds.width <= 0 || bounds.height <= 0)) return false;
    const visibility = element.ownerDocument?.defaultView?.getComputedStyle?.(element)?.visibility;
    return visibility !== "hidden";
  }

  function syncScroll(source, target) {
    if (syncingScroll) {
      synchronizedScrollOffsets.delete(source);
      return;
    }
    const expectedLeft = synchronizedScrollOffsets.get(source);
    if (expectedLeft !== undefined) {
      synchronizedScrollOffsets.delete(source);
      if (source.scrollLeft === expectedLeft) {
        updateFrozenLabels();
        return;
      }
    }
    // The Piano Roll remains usable when the Expression pane is absent or
    // collapsed. A hidden peer has no meaningful scroll range and must never
    // pull the active editor back to zero.
    if (!isVisibleScrollport(source) || !isVisibleScrollport(target)) {
      updateFrozenLabels();
      return;
    }

    syncingScroll = true;
    const previousTargetLeft = target.scrollLeft;
    target.scrollLeft = source.scrollLeft;
    if (target.scrollLeft !== previousTargetLeft) {
      synchronizedScrollOffsets.set(target, target.scrollLeft);
    }
    // Expression scrolling follows the Piano Roll's actual range. If the
    // expression lane is the source, keep both panes aligned at the Piano
    // Roll's reachable edge. A Piano Roll follow update remains authoritative.
    if (source === scrollContainer && target.scrollLeft !== source.scrollLeft) {
      const previousSourceLeft = source.scrollLeft;
      source.scrollLeft = target.scrollLeft;
      if (source.scrollLeft !== previousSourceLeft) {
        synchronizedScrollOffsets.set(source, source.scrollLeft);
      }
    }
    updateFrozenLabels();
    syncingScroll = false;
  }

  scrollContainer.addEventListener("scroll", () => syncScroll(scrollContainer, peerScrollContainer));
  peerScrollContainer.addEventListener("scroll", () => syncScroll(peerScrollContainer, scrollContainer));

  function drawGrid() {
    const { labelWidth, startTick, endTick, beatTicks, barTicks } = geometry;
    svg("rect", { x: 0, y: 0, width: geometry.width, height: HEIGHT, class: "expression-background" }, svgRoot);
    for (let tick = Math.ceil(startTick / beatTicks) * beatTicks; tick <= endTick; tick += beatTicks) {
      const bar = tick % barTicks === 0;
      svg("line", {
        x1: tickToX(tick, geometry), x2: tickToX(tick, geometry),
        y1: TOP, y2: BOTTOM,
        class: bar ? "expression-bar-line" : "expression-beat-line"
      }, svgRoot);
    }

    for (const item of axis(mode, bendRange)) {
      const y = expressionY(mode, item.value, { bendRange });
      svg("line", { x1: labelWidth, x2: geometry.width, y1: y, y2: y, class: item.value === 0 ? "expression-zero-line" : "expression-guide" }, svgRoot);
    }

    labelLayer = svg("g", { "data-entity": "expression-label-layer", class: "expression-label-layer" }, svgRoot);
    svg("rect", { x: 0, y: 0, width: labelWidth, height: HEIGHT, class: "expression-label-gutter" }, labelLayer);
    for (const item of axis(mode, bendRange)) {
      svg("text", {
        x: labelWidth - 8,
        y: expressionY(mode, item.value, { bendRange }) + 4,
        "text-anchor": "end",
        class: "expression-axis-label"
      }, labelLayer, item.label);
    }
    svg("line", { x1: labelWidth, x2: labelWidth, y1: 0, y2: HEIGHT, class: "expression-label-divider" }, labelLayer);
    updateFrozenLabels();
  }

  function renderBend(note, group, x, width) {
    const points = Array.isArray(note.pitchBend) && note.pitchBend.length > 1
      ? note.pitchBend
      : [{ position: 0, semitones: 0 }, { position: 1, semitones: 0 }];
    const coords = points.map((point) =>
      `${x + width * point.position},${expressionY("bend", point.semitones, { bendRange })}`).join(" ");
    svg("polyline", { points: coords, class: "expression-bend-curve", "pointer-events": "none" }, group);
    for (const point of points) {
      svg("circle", {
        cx: x + width * point.position,
        cy: expressionY("bend", point.semitones, { bendRange }),
        r: 3,
        class: "expression-bend-point",
        "pointer-events": "none"
      }, group);
    }
  }

  function renderScalar(note, group, x, width) {
    const value = mode === "volume" ? note.volume ?? 1
      : mode === "pan" ? note.pan ?? 0
        : note.vibrato?.depthSemitones ?? 0;
    const y = expressionY(mode, value);
    svg("line", {
      x1: x + 3, x2: Math.max(x + 3, x + width - 3), y1: y, y2: y,
      class: "expression-value-line", "pointer-events": "none"
    }, group);
    if (mode === "vibrato") {
      const wave = svg("polyline", {
        class: "expression-vibrato-wave", "pointer-events": "none",
        "aria-hidden": "true"
      }, group);
      updateVibratoWave(wave, note, x, width, value);
    }
    svg("circle", {
      cx: x + Math.min(Math.max(8, width / 2), Math.max(8, width - 5)),
      cy: y, r: 4.5,
      class: "expression-value-point", "pointer-events": "none"
    }, group);
    if (width >= 42) {
      svg("text", {
        x: x + width / 2, y: Math.max(TOP + 10, y - 7),
        "text-anchor": "middle", class: "expression-value-label", "pointer-events": "none"
      }, group, valueLabel(mode, value));
    }
  }

  function updateVibratoWave(wave, note, x, width, depth) {
    if (!(depth > 0) || width < 12) {
      wave.setAttribute("points", "");
      return;
    }
    const delay = clamp(note.vibrato?.delayPosition ?? 0, 0, 1);
    const left = x + 3 + Math.max(0, width - 6) * delay;
    const span = Math.max(0, x + width - 3 - left);
    if (span < 6) { wave.setAttribute("points", ""); return; }
    // Gelombang memperjelas adanya vibrato; handle tetap menunjukkan depth asli.
    const depthY = expressionY("vibrato", depth);
    const center = depthY > TOP + 36 ? depthY - 20 : depthY + 26;
    const amplitude = Math.min(8, Math.max(4, depth * 12));
    const seconds = note.durationTicks / (song.timing?.ppq ?? 480) * 60 / (song.timing?.tempo ?? 120);
    const cycles = clamp(seconds * (note.vibrato?.rateHz ?? 5.5) * (1 - delay), 1, Math.max(1, span / 12));
    const samples = Math.max(16, Math.ceil(cycles * 16));
    const points = Array.from({ length: samples + 1 }, (_, index) => {
      const position = index / samples;
      return `${left + span * position},${center - Math.sin(position * cycles * Math.PI * 2) * amplitude}`;
    });
    wave.setAttribute("points", points.join(" "));
  }

  function renderNotes() {
    const selected = new Set(state?.selectedNoteIds ?? []);
    for (const note of song.notes) {
      const noteEnd = note.startTick + note.durationTicks;
      if (noteEnd <= geometry.startTick || note.startTick >= geometry.endTick) continue;
      const visibleStart = Math.max(note.startTick, geometry.startTick);
      const visibleEnd = Math.min(noteEnd, geometry.endTick);
      const x = tickToX(visibleStart, geometry);
      const width = Math.max(2, (visibleEnd - visibleStart) * geometry.pixelsPerQuarter / geometry.ppq);
      const group = svg("g", {
        "data-entity": "expression-note",
        "data-note-id": note.id,
        "data-selected": selected.has(note.id),
        "data-current": activeNoteId === note.id,
        "data-mode": mode,
        class: "expression-note"
      }, svgRoot);
      svg("rect", {
        x, y: TOP, width, height: BOTTOM - TOP,
        class: "expression-note-hit",
        fill: "transparent",
        "pointer-events": "all"
      }, group);
      if (mode === "bend") renderBend(note, group, x, width);
      else renderScalar(note, group, x, width);
    }
  }

  function render(nextSong, nextState, nextGeometry) {
    song = nextSong;
    state = nextState;
    geometry = nextGeometry;
    activeNoteId = nextState?.playback?.currentNoteId ?? null;
    bendRange = bendLaneRange(song?.notes ?? []);
    svgRoot.replaceChildren();
    if (!geometry) return;
    svgRoot.setAttribute("width", String(geometry.width));
    svgRoot.setAttribute("height", String(HEIGHT));
    svgRoot.setAttribute("viewBox", `0 0 ${geometry.width} ${HEIGHT}`);
    svgRoot.dataset.mode = mode;
    drawGrid();
    renderNotes();
  }

  function previewScalar(noteIds, value) {
    for (const id of noteIds) {
      const group = [...svgRoot.querySelectorAll('[data-entity="expression-note"]')]
        .find((candidate) => candidate.dataset.noteId === id);
      if (!group) continue;
      const line = group.querySelector(".expression-value-line");
      const point = group.querySelector(".expression-value-point");
      const label = group.querySelector(".expression-value-label");
      const wave = group.querySelector(".expression-vibrato-wave");
      const y = expressionY(mode, value);
      if (line) { line.setAttribute("y1", String(y)); line.setAttribute("y2", String(y)); }
      if (point) point.setAttribute("cy", String(y));
      if (wave) {
        const note = song.notes.find((candidate) => candidate.id === id);
        const hit = group.querySelector(".expression-note-hit");
        if (note && hit) updateVibratoWave(wave, note, Number(hit.getAttribute("x")), Number(hit.getAttribute("width")), value);
      }
      if (label) {
        label.setAttribute("y", String(Math.max(TOP + 10, y - 7)));
        label.textContent = valueLabel(mode, value);
      }
    }
  }

  svgRoot.addEventListener("click", (event) => {
    if (drag || suppressClick) {
      suppressClick = false;
      return;
    }
    const target = closestExpressionNote(event.target, svgRoot);
    if (target) onSelectNote(target.dataset.noteId, Boolean(event.shiftKey || event.ctrlKey || event.metaKey));
  });

  svgRoot.addEventListener("dblclick", (event) => {
    const target = closestExpressionNote(event.target, svgRoot);
    if (!target) return;
    event.preventDefault();
    if (mode === "bend") {
      onSelectNote(target.dataset.noteId, false);
      onEditBend(target.dataset.noteId);
      return;
    }
    const reset = mode === "volume" ? 1 : 0;
    onSelectNote(target.dataset.noteId, false);
    onChange([target.dataset.noteId], mode, reset);
  });

  svgRoot.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || mode === "bend") return;
    const target = closestExpressionNote(event.target, svgRoot);
    if (!target) return;
    event.preventDefault();
    const noteId = target.dataset.noteId;
    const selected = state?.selectedNoteIds ?? [];
    const noteIds = selected.includes(noteId) ? [...selected] : [noteId];
    if (!selected.includes(noteId)) onSelectNote(noteId, false);
    const value = valueFromExpressionY(mode, localPoint(event).y);
    drag = { pointerId: event.pointerId, noteIds, value };
    onInteractionChange(true);
    previewScalar(noteIds, value);
    try { svgRoot.setPointerCapture(event.pointerId); } catch {}
  });

  svgRoot.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.value = valueFromExpressionY(mode, localPoint(event).y);
    previewScalar(drag.noteIds, drag.value);
  });

  function finishDrag(event, cancelled = false) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const completed = drag;
    drag = null;
    suppressClick = !cancelled;
    onInteractionChange(false);
    if (!cancelled) onChange(completed.noteIds, mode, completed.value);
    else if (song && state && geometry) render(song, state, geometry);
  }

  svgRoot.addEventListener("pointerup", (event) => finishDrag(event));
  svgRoot.addEventListener("pointercancel", (event) => finishDrag(event, true));
  svgRoot.addEventListener("lostpointercapture", (event) => finishDrag(event, true));

  function setMode(next) {
    if (!MODES.has(next)) return false;
    mode = next;
    if (song && state && geometry) render(song, state, geometry);
    return true;
  }

  function updatePlayback(playback) {
    const next = playback?.currentNoteId ?? null;
    if (next === activeNoteId) return;
    for (const element of svgRoot.querySelectorAll('[data-entity="expression-note"]')) {
      element.dataset.current = String(element.dataset.noteId === next);
    }
    activeNoteId = next;
  }

  return Object.freeze({
    render,
    setMode,
    getMode: () => mode,
    updatePlayback,
    syncFromPeer: () => syncScroll(peerScrollContainer, scrollContainer)
  });
}
