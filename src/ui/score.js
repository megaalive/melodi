import { midiToPitch } from "../core/model.js";
import { projectSongToAbc, expressionSummary } from "../notation/abc.js";
import { spellPitchNameInKey } from "../notation/project.js";
import { normalizePlaybackState, normalizeRuntimeState, normalizeViewState } from "../core/runtime-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";

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
    "ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Alt+ArrowLeft Alt+ArrowRight Delete Backspace Control+D Meta+D Enter Space Shift+F10"
  );
}

function appendBendOverlay(svg, element, note) {
  if (!Array.isArray(note.pitchBend) || note.pitchBend.length < 2) return;
  const box = element.getBBox();
  const width = 34;
  const maxAbs = Math.max(1, ...note.pitchBend.map((point) => Math.abs(point.semitones)));
  const scaleY = Math.min(9, 18 / maxAbs);
  const left = box.x + box.width / 2 - width / 2;
  const baseline = Math.max(20, box.y - 9);
  const points = note.pitchBend.map((point) =>
    `${left + point.position * width},${baseline - point.semitones * scaleY}`).join(" ");

  const group = svgElement("g", {
    class: "score-expression-overlay score-bend-overlay",
    "data-entity": "score-bend",
    "data-note-id": note.id,
    "pointer-events": "none",
    "aria-hidden": "true"
  });
  group.append(
    svgElement("polyline", { points, class: "score-bend-curve" }),
    svgElement("text", {
      x: left + width / 2,
      y: baseline - maxAbs * scaleY - 4,
      "text-anchor": "middle",
      class: "score-bend-label"
    }, scoreBendLabel(note))
  );
  svg.append(group);
}

function appendMixOverlay(svg, element, note) {
  const summary = expressionSummary(note);
  if (!summary) return;
  const box = element.getBBox();
  svg.append(svgElement("text", {
    x: box.x + box.width / 2,
    y: box.y + box.height + 20,
    "text-anchor": "middle",
    class: "score-expression-label",
    "data-entity": "score-expression",
    "data-note-id": note.id,
    "pointer-events": "none",
    "aria-hidden": "true"
  }, summary));
}

function renderLyricOverlay(svg, song, noteElementsById, syllableElementsById, translate) {
  for (const syllable of song.lyrics.syllables) {
    const linked = syllable.noteIds.flatMap((noteId) => noteElementsById.get(noteId) ?? []);
    if (!linked.length) continue;
    const first = linked[0];
    const last = linked.at(-1);
    const firstBox = first.getBBox();
    const lastBox = last.getBBox();
    const y = firstBox.y + firstBox.height + 38;
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
  onContextMenu = () => {}
} = {}) {
  let projection = null;
  let noteElementsById = new Map();
  let syllableElementsById = new Map();
  let noteNavigation = [];
  let activeNoteId = null;
  let activeSyllableIds = new Set();

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
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const currentIndex = noteNavigation.indexOf(element.dataset.noteId);
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
    activeNoteId = noteId ?? null;
    for (const element of noteElementsById.get(activeNoteId) ?? []) element.dataset.current = "true";
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

    const staffWidth = Math.max(520, (scrollContainer?.clientWidth ?? 760) - 20);
    ABCJS.renderAbc(host, projected.abc, {
      add_classes: true,
      responsive: "resize",
      staffwidth: staffWidth,
      wrap: {
        preferredMeasuresPerLine: 4,
        minSpacing: 1.35,
        maxSpacing: 2.4,
        lastLineLimit: 1
      },
      selectTypes: false
    });

    const svg = host.querySelector("svg");
    if (!svg) {
      status.textContent = translate("scoreUnavailable");
      return;
    }
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", translate("scoreImageLabel", { count: projection.measures.length }));

    const selected = new Set(state.selectedNoteIds ?? []);
    const noteById = new Map(song.notes.map((note) => [note.id, note]));
    noteNavigation = [...song.notes]
      .filter((note) => projected.noteClassById.has(note.id))
      .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || left.id.localeCompare(right.id))
      .map((note) => note.id);
    const focusNoteId = (state.selectedNoteIds ?? []).find((id) => noteNavigation.includes(id)) ?? noteNavigation[0] ?? null;

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
      appendBendOverlay(svg, elements[0], note);
      appendMixOverlay(svg, elements[0], note);
    }

    renderLyricOverlay(svg, song, noteElementsById, syllableElementsById, translate);

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

  return Object.freeze({ render, updatePlayback, getProjection: () => projection });
}
