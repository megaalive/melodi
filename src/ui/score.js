import { midiToPitch } from "../core/model.js";
import { projectSongToAbc, expressionSummary } from "../notation/abc.js";
import { spellPitchNameInKey } from "../notation/project.js";
import { normalizePlaybackState, normalizeRuntimeState, normalizeViewState } from "../core/runtime-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function normalizeScoreLayout(value) {
  return value === "page" ? "page" : "flow";
}

export function scoreStaffWidth(layout, measureCount, viewportWidth = 760) {
  const viewport = Math.max(320, Number(viewportWidth) || 760);
  if (normalizeScoreLayout(layout) === "page") return Math.max(520, viewport - 20);
  const measures = Math.max(1, Number(measureCount) || 1);
  return Math.max(viewport - 20, Math.min(12000, 180 + measures * 170));
}

export function projectExpressionRuns(entries = []) {
  const ordered = entries.map((entry, index) => ({ ...entry, order: index }))
    .sort((left, right) => (left.systemOrder ?? 0) - (right.systemOrder ?? 0)
      || (left.x ?? 0) - (right.x ?? 0)
      || (left.startTick ?? 0) - (right.startTick ?? 0)
      || (left.pitch ?? 0) - (right.pitch ?? 0)
      || String(left.noteId ?? "").localeCompare(String(right.noteId ?? ""))
      || left.order - right.order);
  const runs = [];
  let active = null;

  function flush() {
    if (!active) return;
    runs.push({
      id: `expression:${active.noteIds.join(",")}`,
      kind: "expression",
      text: active.summary,
      noteIds: active.noteIds,
      x: active.x,
      preferredY: active.preferredY,
      textOffsetY: -8,
      selected: active.selected,
      current: active.current,
      systemId: active.systemId
    });
    active = null;
  }

  for (const entry of ordered) {
    const summary = entry.summary ?? "";
    if (!summary) {
      flush();
      continue;
    }
    if (!active || active.systemId !== entry.systemId || active.summary !== summary) {
      flush();
      active = {
        systemId: entry.systemId,
        summary,
        noteIds: [],
        x: Number.isFinite(entry.x) ? entry.x : 0,
        preferredY: Number.isFinite(entry.preferredY) ? entry.preferredY : 0,
        selected: false,
        current: false
      };
    }
    if (!active.noteIds.includes(entry.noteId)) active.noteIds.push(entry.noteId);
    active.selected ||= Boolean(entry.selected);
    active.current ||= Boolean(entry.current);
  }
  flush();
  return runs;
}

function annotationBounds(annotation, x, y, padding) {
  const top = y + (Number.isFinite(annotation.textOffsetY) ? annotation.textOffsetY : -8);
  const height = Math.max(1, Number(annotation.height) || 10);
  const width = Math.max(1, Number(annotation.width) || 1);
  return {
    left: x - width / 2 - padding,
    right: x + width / 2 + padding,
    top: top - padding,
    bottom: top + height + padding
  };
}

function boundsOverlap(left, right) {
  return left.left < right.right && left.right > right.left
    && left.top < right.bottom && left.bottom > right.top;
}

function clampAnnotationX(value, width, canvasWidth) {
  const halfWidth = width / 2;
  const minimum = halfWidth + 4;
  const maximum = Math.max(minimum, canvasWidth - halfWidth - 4);
  return Math.max(minimum, Math.min(maximum, value));
}

export function layoutScoreAnnotations(annotations = [], {
  obstacles = [],
  canvasWidth = 12000,
  maxLanes = 3,
  laneGap = 12,
  padding = 2
} = {}) {
  const width = Math.max(1, Number(canvasWidth) || 12000);
  const sorted = annotations.map((annotation, index) => ({ ...annotation, order: index }))
    .sort((left, right) => (left.preferredY ?? 0) - (right.preferredY ?? 0)
      || (left.x ?? 0) - (right.x ?? 0)
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))
      || left.order - right.order);
  const occupied = obstacles.map((obstacle) => ({ ...obstacle }));
  const placed = [];

  for (const annotation of sorted) {
    const labelWidth = Math.max(1, Number(annotation.width) || 1);
    const isBend = annotation.kind === "bend";
    let placement = null;
    for (let lane = 0; lane < maxLanes && !placement; lane += 1) {
      const y = annotation.preferredY + (isBend ? -1 : 1) * lane * laneGap;
      const baseX = Number.isFinite(annotation.x) ? annotation.x : 0;
      const laneBounds = annotationBounds(annotation, baseX, y, padding);
      const nearby = occupied.filter((bounds) => laneBounds.top < bounds.bottom && laneBounds.bottom > bounds.top);
      const positions = new Set([clampAnnotationX(baseX, labelWidth, width)]);
      for (const bounds of nearby) {
        positions.add(clampAnnotationX(bounds.left - labelWidth / 2 - padding, labelWidth, width));
        positions.add(clampAnnotationX(bounds.right + labelWidth / 2 + padding, labelWidth, width));
      }
      const orderedPositions = [...positions].sort((left, right) => Math.abs(left - baseX) - Math.abs(right - baseX) || left - right);
      for (const x of orderedPositions) {
        const bounds = annotationBounds(annotation, x, y, padding);
        if (occupied.some((other) => boundsOverlap(bounds, other))) continue;
        placement = { ...annotation, x, y, lane, bounds };
        occupied.push(bounds);
        placed.push(placement);
        break;
      }
    }
    if (!placement) {
      const x = clampAnnotationX(Number(annotation.x) || 0, labelWidth, width);
      const y = annotation.preferredY + (isBend ? -1 : 1) * Math.max(0, maxLanes - 1) * laneGap;
      const bounds = annotationBounds(annotation, x, y, padding);
      placement = { ...annotation, x, y, lane: Math.max(0, maxLanes - 1), bounds, crowded: true };
      occupied.push(bounds);
      placed.push(placement);
    }
  }

  return placed.sort((left, right) => left.order - right.order).map(({ order, ...placement }) => placement);
}

function svgElement(name, attributes, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== null) element.textContent = text;
  return element;
}

function scoreBendLabel(note) {
  if (!Array.isArray(note.pitchBend) || note.pitchBend.length < 2) return "";
  const semitones = note.pitchBend.map((point) => point.semitones);
  const max = Math.max(...semitones);
  const min = Math.min(...semitones);
  const release = Math.abs(semitones.at(-1) ?? 0) < 0.001;
  if (max > 0) return `${max === 1 ? "½" : max / 2}↑${release ? "↓" : ""}`;
  if (min < 0) return `${Math.abs(min) === 1 ? "½" : Math.abs(min) / 2}↓${release ? "↑" : ""}`;
  return "";
}

function chordQualitySuffix(quality) {
  const normalized = quality.trim().toLowerCase();
  if (["major", "maj", "major triad"].includes(normalized)) return "";
  if (["minor", "min", "minor triad"].includes(normalized)) return "m";
  if (["dominant7", "dominant 7", "7"].includes(normalized)) return "7";
  if (["major7", "major 7", "maj7"].includes(normalized)) return "maj7";
  if (["minor7", "minor 7", "min7", "m7"].includes(normalized)) return "m7";
  return quality;
}

function addFallbackList(container, projection, song, translate) {
  const fallbackNoteIds = new Set(projection.fallbackNoteIds);
  const fallbackChordIds = new Set(projection.fallbackChordIds);
  if (!fallbackNoteIds.size && !fallbackChordIds.size && projection.warnings.length === 0) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }

  container.hidden = false;
  const children = [];
  if (fallbackNoteIds.size || fallbackChordIds.size) {
    const heading = document.createElement("p");
    heading.textContent = translate("scoreFallbackHeading");
    const list = document.createElement("ul");
    for (const noteId of [...fallbackNoteIds].sort()) {
      const note = song.notes.find((item) => item.id === noteId);
      const item = document.createElement("li");
      item.dataset.entity = "score-fallback-note";
      item.dataset.entityId = noteId;
      item.textContent = note ? `${midiToPitch(note.pitch)} · tick ${note.startTick} · ${note.durationTicks} ticks · ${noteId}` : noteId;
      list.append(item);
    }
    for (const chordId of [...fallbackChordIds].sort()) {
      const chord = song.chords.find((item) => item.id === chordId);
      const item = document.createElement("li");
      item.dataset.entity = "score-fallback-chord";
      item.dataset.entityId = chordId;
      const root = chord ? spellPitchNameInKey(60 + chord.rootPitchClass, song.key) : "";
      item.textContent = chord ? `${root}${chordQualitySuffix(chord.quality)} · tick ${chord.startTick} · ${chordId}` : chordId;
      list.append(item);
    }
    children.push(heading, list);
  }

  if (projection.warnings.length) {
    const warningList = document.createElement("ul");
    warningList.className = "score-warning-list";
    for (const warning of projection.warnings) {
      const item = document.createElement("li");
      item.dataset.entity = "score-warning";
      item.dataset.warning = warning.code;
      const ids = [...(warning.noteIds ?? []), ...(warning.chordIds ?? [])];
      item.textContent = `${translate(`scoreWarning_${warning.code}`)} · ${ids.join(", ")}`;
      warningList.append(item);
    }
    children.push(warningList);
  }
  container.replaceChildren(...children);
}

function uniqueClosestNotes(elements) {
  const notes = [];
  const seen = new Set();
  for (const element of elements) {
    const note = element.closest?.(".abcjs-note") ?? element;
    if (seen.has(note)) continue;
    seen.add(note);
    notes.push(note);
  }
  return notes;
}

function markNoteElement(element, note, selected, tabStop, translate) {
  element.classList.add("score-note");
  element.dataset.entity = "score-note";
  element.dataset.entityId = note.id;
  element.dataset.noteId = note.id;
  element.dataset.pitch = String(note.pitch);
  element.dataset.startTick = String(note.startTick);
  element.dataset.durationTicks = String(note.durationTicks);
  element.dataset.selected = String(selected);
  element.dataset.anchor = String(note.anchor);
  element.dataset.locked = String(note.locked);
  element.dataset.pitchBend = JSON.stringify(note.pitchBend ?? null);
  element.dataset.volume = String(note.volume ?? 1);
  element.dataset.pan = String(note.pan ?? 0);
  element.dataset.vibrato = JSON.stringify(note.vibrato ?? null);
  element.dataset.current = "false";
  element.dataset.focusKey = `score-note-${note.id}`;
  element.setAttribute("role", tabStop ? "button" : "presentation");
  element.setAttribute("tabindex", tabStop ? "0" : "-1");
  if (!tabStop) {
    element.removeAttribute("aria-label");
    return;
  }

  element.setAttribute("aria-pressed", String(selected));
  const bend = scoreBendLabel(note);
  const expression = expressionSummary(note);
  const suffix = [bend ? `bend ${bend}` : "", expression].filter(Boolean).join(", ");
  element.setAttribute("aria-label", translate("scoreNoteLabel", {
    pitch: midiToPitch(note.pitch),
    tick: note.startTick,
    duration: note.durationTicks
  }) + (suffix ? `, ${suffix}` : ""));
  element.setAttribute(
    "aria-keyshortcuts",
    "ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Alt+ArrowLeft Alt+ArrowRight Delete Backspace Enter Space Shift+F10"
  );
}

function projectBendOverlay(element, note, selected) {
  if (!Array.isArray(note.pitchBend) || note.pitchBend.length < 2) return;
  const box = element.getBBox();
  const width = 34;
  const maxAbs = Math.max(1, ...note.pitchBend.map((point) => Math.abs(point.semitones)));
  const scaleY = Math.min(9, 18 / maxAbs);
  const left = box.x + box.width / 2 - width / 2;
  const baseline = Math.max(20, box.y - 9);
  const points = note.pitchBend.map((point) =>
    `${left + point.position * width},${baseline - point.semitones * scaleY}`).join(" ");
  const label = scoreBendLabel(note);
  return {
    noteId: note.id,
    selected,
    points,
    label,
    annotation: label ? {
      id: `bend:${note.id}`,
      kind: "bend",
      text: label,
      noteIds: [note.id],
      x: left + width / 2,
      preferredY: baseline - maxAbs * scaleY - 4
    } : null
  };
}

function appendBendOverlay(svg, bend, placement) {
  const group = svgElement("g", {
    class: "score-expression-overlay score-bend-overlay",
    "data-entity": "score-bend",
    "data-note-id": bend.noteId,
    "data-selected": String(bend.selected),
    "data-current": "false",
    "pointer-events": "none",
    "aria-hidden": "true"
  });
  group.append(svgElement("polyline", { points: bend.points, class: "score-bend-curve" }));
  if (bend.label && placement) {
    group.append(svgElement("text", {
      x: placement.x,
      y: placement.y,
      "text-anchor": "middle",
      class: "score-bend-label"
    }, bend.label));
  }
  svg.append(group);
}

function appendMixOverlay(svg, run, placement) {
  svg.append(svgElement("text", {
    x: placement.x,
    y: placement.y,
    "text-anchor": "middle",
    class: "score-expression-label",
    "data-entity": "score-expression",
    "data-note-id": run.noteIds[0],
    "data-note-ids": run.noteIds.join(","),
    "data-selected": String(run.selected),
    "data-current": String(run.current),
    "pointer-events": "none",
    "aria-hidden": "true"
  }, run.text));
}

function measureScoreAnnotations(svg, annotations) {
  const layer = svgElement("g", { visibility: "hidden", "aria-hidden": "true" });
  svg.append(layer);
  const measured = annotations.map((annotation) => {
    const className = annotation.kind === "bend" ? "score-bend-label" : "score-expression-label";
    const text = svgElement("text", { x: 0, y: 0, class: className }, annotation.text);
    layer.append(text);
    const box = text.getBBox();
    return {
      ...annotation,
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
      textOffsetY: box.y
    };
  });
  layer.remove();
  return measured;
}

function lyricCollisionBounds(svg) {
  const elements = svg.querySelectorAll('[data-entity="score-syllable"], [data-entity="score-melisma"]');
  return [...elements].map((element) => {
    const box = element.getBBox();
    const linePadding = element.dataset.entity === "score-melisma" ? 3 : 1;
    return {
      left: box.x - 2,
      right: box.x + box.width + 2,
      top: box.y - linePadding,
      bottom: box.y + box.height + linePadding
    };
  });
}

function scoreCanvasWidth(svg) {
  const viewBox = (svg.getAttribute("viewBox") ?? "").trim().split(/[ ,]+/).map(Number);
  return viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0
    ? viewBox[2]
    : Number(svg.getAttribute("width")) || 12000;
}

function renderLyricOverlay(svg, song, noteElementsById, syllableElementsById, translate) {
  for (const syllable of song.lyrics.syllables) {
    const linked = syllable.noteIds.flatMap((noteId) => noteElementsById.get(noteId) ?? []);
    if (!linked.length) continue;
    const first = linked[0];
    const last = linked.at(-1);
    const firstBox = first.getBBox();
    const lastBox = last.getBBox();
    const y = firstBox.y + firstBox.height + 46;
    const noteIds = syllable.noteIds.filter((noteId) => noteElementsById.has(noteId));

    const text = svgElement("text", {
      x: firstBox.x + firstBox.width / 2,
      y,
      "text-anchor": "middle",
      class: "score-syllable",
      "data-entity": "score-syllable",
      "data-entity-id": syllable.id,
      "data-syllable-id": syllable.id,
      "data-note-ids": noteIds.join(","),
      "data-current": "false",
      "aria-label": translate("scoreSyllableLabel", { text: syllable.text, count: noteIds.length })
    }, syllable.text);
    svg.append(text);

    const elements = [text];
    if (noteIds.length > 1 && Math.abs(firstBox.y - lastBox.y) < 40) {
      const line = svgElement("line", {
        x1: firstBox.x + firstBox.width / 2 + 8,
        x2: Math.max(firstBox.x + firstBox.width / 2 + 10, lastBox.x + lastBox.width / 2 + 14),
        y1: y + 3,
        y2: y + 3,
        class: "score-melisma",
        "data-entity": "score-melisma",
        "data-syllable-id": syllable.id,
        "data-current": "false"
      });
      svg.append(line);
      elements.push(line);
    }
    syllableElementsById.set(syllable.id, elements);
  }
}

export function createScoreView(host, status, fallback, scrollContainer, translate, {
  onSelectNote = () => {},
  onSelectNotes = () => {},
  onTransposeNotes = () => {},
  onNudgeNotes = () => {},
  onDeleteNotes = () => {},
  onContextMenu = () => {}
} = {}) {
  let projection = null;
  let noteElementsById = new Map();
  let syllableElementsById = new Map();
  let noteNavigation = [];
  let activeNoteId = null;
  let activeSyllableIds = new Set();
  let selectedNoteIds = new Set();
  let layout = "flow";
  let layoutChanged = false;
  const layoutScroll = new Map();

  function setLayout(nextLayout) {
    const next = normalizeScoreLayout(nextLayout);
    if (next === layout) return layout;
    if (scrollContainer) {
      layoutScroll.set(layout, { left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop });
    }
    layout = next;
    layoutChanged = true;
    return layout;
  }

  function interactionNoteIds(noteId) {
    const selected = noteNavigation.filter((id) =>
      (noteElementsById.get(id) ?? []).some((element) => element.dataset.selected === "true"));
    return selected.includes(noteId) ? selected : [noteId];
  }

  function findScoreNote(target) {
    const element = target instanceof Element ? target.closest('[data-entity="score-note"]') : null;
    return element && host.contains(element) ? element : null;
  }

  function selectFromEvent(noteId, event) {
    onSelectNote(noteId, Boolean(event.shiftKey || event.ctrlKey || event.metaKey));
  }

  host.addEventListener("click", (event) => {
    const element = findScoreNote(event.target);
    if (element) selectFromEvent(element.dataset.noteId, event);
  });

  host.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const element = findScoreNote(event.target);
    if (element) {
      onContextMenu({
        kind: "selection",
        source: "score",
        noteId: element.dataset.noteId,
        clientX: event.clientX,
        clientY: event.clientY
      });
      return;
    }
    onContextMenu({
      kind: "empty",
      source: "score",
      clientX: event.clientX,
      clientY: event.clientY
    });
  });

  host.addEventListener("keydown", (event) => {
    const element = findScoreNote(event.target);
    if (!element) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectFromEvent(element.dataset.noteId, event);
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      onContextMenu({
        kind: "selection",
        source: "score",
        noteId: element.dataset.noteId,
        clientX: rect.left + rect.width / 2,
        clientY: rect.bottom
      });
      return;
    }
    const noteId = element.dataset.noteId;
    const selectedIds = interactionNoteIds(noteId);

    if (!event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      onTransposeNotes(selectedIds, direction * (event.shiftKey ? 12 : 1));
      return;
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      onNudgeNotes(selectedIds, event.key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (!event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      const index = noteNavigation.indexOf(noteId);
      const remaining = noteNavigation.filter((id) => !selectedIds.includes(id));
      const nextFocusId = noteNavigation.slice(index + 1).find((id) => !selectedIds.includes(id))
        ?? [...noteNavigation.slice(0, index)].reverse().find((id) => !selectedIds.includes(id))
        ?? remaining[0]
        ?? null;
      onDeleteNotes(selectedIds);
      if (nextFocusId && noteElementsById.has(nextFocusId)) {
        onSelectNotes([nextFocusId], false);
        noteElementsById.get(nextFocusId)?.[0]?.focus();
      }
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const currentIndex = noteNavigation.indexOf(noteId);
    const nextId = noteNavigation[currentIndex + (event.key === "ArrowRight" ? 1 : -1)];
    const next = noteElementsById.get(nextId)?.[0];
    if (!nextId || !next) return;
    event.preventDefault();
    onSelectNotes([nextId], false);
    next.focus();
  });

  function applyCurrentNote(noteId) {
    if (activeNoteId === noteId) return;
    for (const element of noteElementsById.get(activeNoteId) ?? []) element.dataset.current = "false";
    setExpressionOverlayState(activeNoteId, "current", false);
    activeNoteId = noteId ?? null;
    for (const element of noteElementsById.get(activeNoteId) ?? []) element.dataset.current = "true";
    setExpressionOverlayState(activeNoteId, "current", true);
    refreshExpressionOverlayStates();
  }

  function setExpressionOverlayState(noteId, state, value) {
    if (!noteId) return;
    for (const element of host.querySelectorAll('[data-entity="score-bend"]')) {
      if (element.dataset.noteId === noteId) element.dataset[state] = String(value);
    }
  }

  function refreshExpressionOverlayStates() {
    for (const element of host.querySelectorAll('[data-entity="score-expression"]')) {
      const members = element.dataset.noteIds?.split(",") ?? [element.dataset.noteId];
      element.dataset.selected = String(members.some((noteId) => selectedNoteIds.has(noteId)));
      element.dataset.current = String(Boolean(activeNoteId && members.includes(activeNoteId)));
    }
  }

  function applyCurrentSyllables(syllableIds) {
    const next = new Set(syllableIds ?? []);
    for (const syllableId of activeSyllableIds) {
      if (!next.has(syllableId)) {
        for (const element of syllableElementsById.get(syllableId) ?? []) element.dataset.current = "false";
      }
    }
    for (const syllableId of next) {
      if (!activeSyllableIds.has(syllableId)) {
        for (const element of syllableElementsById.get(syllableId) ?? []) element.dataset.current = "true";
      }
    }
    activeSyllableIds = next;
  }

  function updateSelection(selectedIds = []) {
    const selected = new Set(selectedIds);
    selectedNoteIds = selected;
    for (const [noteId, elements] of noteElementsById) {
      const active = selected.has(noteId);
      for (const element of elements) {
        element.dataset.selected = String(active);
        if (element.getAttribute("role") === "button") element.setAttribute("aria-pressed", String(active));
      }
      setExpressionOverlayState(noteId, "selected", active);
    }
  }

  function updatePlayback(playback = {}, view) {
    playback = normalizePlaybackState(playback);
    view = normalizeViewState(view);
    applyCurrentNote(playback.currentNoteId);
    applyCurrentSyllables(playback.currentSyllableIds);
    if (view.follow && playback.status === "playing" && playback.currentNoteId) {
      noteElementsById.get(playback.currentNoteId)?.[0]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  }

  function render(song, state = {}) {
    state = normalizeRuntimeState(state);
    const ABCJS = window.ABCJS;
    if (typeof ABCJS?.renderAbc !== "function") {
      status.textContent = translate("scoreUnavailable");
      host.replaceChildren();
      return;
    }

    const projected = projectSongToAbc(song);
    projection = projected.projection;
    noteElementsById = new Map();
    syllableElementsById = new Map();
    noteNavigation = [];
    activeNoteId = null;
    activeSyllableIds = new Set();
    host.replaceChildren();

    if (scrollContainer && !layoutChanged) {
      layoutScroll.set(layout, { left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop });
    }
    const staffWidth = scoreStaffWidth(layout, projection.measures.length, scrollContainer?.clientWidth ?? 760);
    const renderOptions = {
      add_classes: true,
      staffwidth: staffWidth,
      selectTypes: false
    };
    if (layout === "page") {
      renderOptions.responsive = "resize";
      renderOptions.wrap = {
        preferredMeasuresPerLine: 4,
        minSpacing: 1.35,
        maxSpacing: 2.4,
        lastLineLimit: 1
      };
    }
    host.dataset.layout = layout;
    if (scrollContainer) scrollContainer.dataset.layout = layout;
    ABCJS.renderAbc(host, projected.abc, renderOptions);

    const svg = host.querySelector("svg");
    if (!svg) {
      status.textContent = translate("scoreUnavailable");
      return;
    }
    svg.setAttribute("role", "group");
    svg.dataset.layout = layout;
    svg.setAttribute("aria-label", translate("scoreImageLabel", { count: projection.measures.length }));

    if (scrollContainer) {
      const saved = layoutScroll.get(layout) ?? { left: 0, top: 0 };
      scrollContainer.scrollLeft = saved.left;
      scrollContainer.scrollTop = saved.top;
      layoutChanged = false;
    }

    const selected = new Set(state.selectedNoteIds ?? []);
    selectedNoteIds = selected;
    const noteById = new Map(song.notes.map((note) => [note.id, note]));
    noteNavigation = [...song.notes]
      .filter((note) => projected.noteClassById.has(note.id))
      .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || left.id.localeCompare(right.id))
      .map((note) => note.id);
    const focusNoteId = (state.selectedNoteIds ?? []).find((id) => noteNavigation.includes(id)) ?? noteNavigation[0] ?? null;
    const staffWrappers = [...svg.querySelectorAll(".abcjs-staff-wrapper")];
    const staffOrderByElement = new Map(staffWrappers.map((element, index) => [element, index]));
    const staffBoundsByElement = new Map();
    const expressionEntries = [];
    const bendOverlays = [];

    for (const noteId of noteNavigation) {
      const className = projected.noteClassById.get(noteId);
      const note = noteById.get(noteId);
      if (!className || !note) continue;
      const elements = uniqueClosestNotes(host.querySelectorAll(`.${className}`));
      if (!elements.length) continue;
      noteElementsById.set(noteId, elements);
      elements.forEach((element, index) => markNoteElement(
        element,
        note,
        selected.has(noteId),
        noteId === focusNoteId && index === 0,
        translate
      ));
      const element = elements[0];
      const box = element.getBBox();
      const staff = element.closest?.(".abcjs-staff-wrapper")
        ?? element.closest?.(".abcjs-system")
        ?? svg;
      if (!staffBoundsByElement.has(staff)) {
        let bounds;
        try {
          bounds = staff.getBBox();
        } catch {
          bounds = box;
        }
        staffBoundsByElement.set(staff, bounds);
      }
      const staffBounds = staffBoundsByElement.get(staff);
      expressionEntries.push({
        noteId,
        summary: expressionSummary(note),
        systemId: staff,
        systemOrder: staffOrderByElement.get(staff) ?? staffOrderByElement.size,
        startTick: note.startTick,
        pitch: note.pitch,
        x: box.x + box.width / 2,
        preferredY: staffBounds.y + staffBounds.height + 20,
        selected: selected.has(noteId),
        current: false
      });
      const bend = projectBendOverlay(element, note, selected.has(noteId));
      if (bend) bendOverlays.push(bend);
    }

    renderLyricOverlay(svg, song, noteElementsById, syllableElementsById, translate);
    const expressionRuns = projectExpressionRuns(expressionEntries);
    const annotations = [
      ...expressionRuns,
      ...bendOverlays.map((bend) => bend.annotation).filter(Boolean)
    ];
    const measured = measureScoreAnnotations(svg, annotations);
    const placements = new Map(layoutScoreAnnotations(measured, {
      obstacles: lyricCollisionBounds(svg),
      canvasWidth: scoreCanvasWidth(svg),
      maxLanes: 2
    }).map((placement) => [placement.id, placement]));
    for (const bend of bendOverlays) {
      appendBendOverlay(svg, bend, placements.get(`bend:${bend.noteId}`));
    }
    for (const run of expressionRuns) appendMixOverlay(svg, run, placements.get(run.id));
    refreshExpressionOverlayStates();

    const unsupportedWarning = projection.warnings.some((warning) => warning.code === "unsupported-rhythm");
    const voiceLimitWarning = projection.warnings.some((warning) => warning.code === "voice-limit");
    const windowLimitWarning = projection.warnings.some((warning) =>
      warning.code === "score-window-limit" || warning.code === "score-chord-window-limit");
    const overlapIds = new Set(projection.warnings
      .filter((warning) => warning.code === "overlapping-notes")
      .flatMap((warning) => warning.noteIds));
    const fallbackItemCount = projection.fallbackNoteIds.length + projection.fallbackChordIds.length;
    status.textContent = unsupportedWarning
      ? translate("scoreUnsupportedRhythm", { count: projection.fallbackNoteIds.length })
      : voiceLimitWarning
        ? translate("scoreVoiceLimit", { count: projection.fallbackNoteIds.length })
        : windowLimitWarning
          ? translate("scoreWindowLimit", { count: fallbackItemCount })
          : overlapIds.size
            ? translate("scoreOverlapWarning", { count: overlapIds.size })
            : translate("scoreReady", { count: projection.measures.length });
    addFallbackList(fallback, projection, song, translate);
    updatePlayback(state.playback ?? {}, { ...(state.view ?? {}), follow: false });
  }

  return Object.freeze({
    render,
    updatePlayback,
    updateSelection,
    setLayout,
    getLayout: () => layout,
    getProjection: () => projection
  });
}
