import { projectSongToScore, spellPitchNameInKey } from "../notation/project.js";
import { midiToPitch } from "../core/model.js";
import { normalizePlaybackState, normalizeRuntimeState, normalizeViewState } from "../core/runtime-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const measureWidth = 280;
const scoreHeight = 220;
const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const NATURAL_MIDI = Object.freeze(Array.from({ length: 128 }, (_unused, midi) => midi)
  .filter((midi) => NATURAL_PITCH_CLASSES.has(midi % 12)));
const TREBLE_TOP_LINE_MIDI = 77; // F5
const TREBLE_TOP_LINE_INDEX = NATURAL_MIDI.indexOf(TREBLE_TOP_LINE_MIDI);

function createTickable(VF, event) {
  const duration = event.notation;
  const key = event.kind === "rest" ? "b/4" : event.spelling.key;
  const tickable = new VF.StaveNote({
    clef: "treble",
    keys: [key],
    duration: `${duration.value}${event.kind === "rest" ? "r" : ""}`
  });
  if (duration.dots) VF.Dot.buildAndAttach([tickable], { all: true });
  return tickable;
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

function markNoteElement(element, segment, note, { selected, tabStop, translate }) {
  if (!element) return;
  element.setAttribute("data-entity", "score-note");
  element.setAttribute("data-entity-id", note.id);
  element.setAttribute("data-note-id", note.id);
  element.setAttribute("data-pitch", note.pitch);
  element.setAttribute("data-start-tick", note.startTick);
  element.setAttribute("data-duration-ticks", note.durationTicks);
  element.setAttribute("data-fragment-start-tick", segment.startTick);
  element.setAttribute("data-fragment-duration-ticks", segment.durationTicks);
  element.setAttribute("data-measure-index", segment.measureIndex);
  element.setAttribute("data-fragment-index", segment.fragmentIndex);
  element.setAttribute("data-selected", String(selected));
  element.setAttribute("data-anchor", String(note.anchor));
  element.setAttribute("data-locked", String(note.locked));
  element.setAttribute("data-pitch-bend", JSON.stringify(note.pitchBend ?? null));
  element.setAttribute("data-current", "false");
  element.setAttribute("data-focus-key", `score-note-${note.id}`);
  element.setAttribute("role", tabStop ? "button" : "presentation");
  element.setAttribute("tabindex", tabStop ? "0" : "-1");
  if (tabStop) {
    element.setAttribute("aria-pressed", String(selected));
    const bend = scoreBendLabel(note);
    element.setAttribute("aria-label", translate("scoreNoteLabel", {
      pitch: midiToPitch(note.pitch),
      tick: note.startTick,
      duration: note.durationTicks
    }) + (bend ? `, bend ${bend}` : ""));
    element.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Alt+ArrowLeft Alt+ArrowRight Delete Backspace Control+D Meta+D Enter Space Shift+F10");
  } else {
    element.removeAttribute("aria-label");
  }
  element.classList.add("score-note");
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

export function createScoreView(svg, status, fallback, scrollContainer, translate, {
  onSelectNote = () => {},
  onSelectNotes = () => {},
  onContextMenu = () => {}
} = {}) {
  let projection = null;
  let lastFollowMeasure = null;
  let noteElementsById = new Map();
  let syllableElementsById = new Map();
  let activeNoteId = null;
  let activeSyllableIds = new Set();
  let noteNavigation = [];
  let focusElementByNoteId = new Map();
  let selectionDrag = null;
  let stavesByMeasure = new Map();

  function selectFromEvent(noteId, event) {
    onSelectNote(noteId, Boolean(event.shiftKey || event.ctrlKey || event.metaKey));
  }

  function findScoreNote(target) {
    const element = target instanceof Element ? target.closest('[data-entity="score-note"]') : null;
    return element && svg.contains(element) ? element : null;
  }

  function pointerPoint(event) {
    const bounds = svg.getBoundingClientRect();
    const width = Number(svg.getAttribute("width")) || bounds.width || 1;
    const height = Number(svg.getAttribute("height")) || bounds.height || 1;
    return {
      x: (event.clientX - bounds.left) * width / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) * height / Math.max(1, bounds.height)
    };
  }

  function contextPlacement(event) {
    if (!projection?.measures?.length) return null;
    const point = pointerPoint(event);
    const measureIndex = Math.max(0, Math.min(projection.measures.length - 1, Math.floor(point.x / measureWidth)));
    const measure = projection.measures[measureIndex];
    const stave = stavesByMeasure.get(measureIndex);
    if (!measure || !stave) return null;

    const noteStartX = typeof stave.getNoteStartX === "function"
      ? stave.getNoteStartX()
      : 16 + measureIndex * measureWidth + 66;
    const noteEndX = typeof stave.getNoteEndX === "function"
      ? stave.getNoteEndX()
      : 16 + (measureIndex + 1) * measureWidth - 34;
    const ratio = Math.max(0, Math.min(1, (point.x - noteStartX) / Math.max(1, noteEndX - noteStartX)));
    const beatTicks = projection.ticksPerMeasure / projection.timeSignature.numerator;
    const snapTicks = Math.max(1, Math.round(beatTicks / 2));
    const rawTick = measure.startTick + ratio * projection.ticksPerMeasure;
    const startTick = Math.round(rawTick / snapTicks) * snapTicks;

    const topY = typeof stave.getYForLine === "function" ? stave.getYForLine(0) : 50;
    const bottomY = typeof stave.getYForLine === "function" ? stave.getYForLine(4) : 90;
    const direction = bottomY >= topY ? 1 : -1;
    const diatonicStepHeight = Math.max(1, Math.abs(bottomY - topY) / 8);
    const stepsDown = Math.round((point.y - topY) / (diatonicStepHeight * direction));
    const pitchIndex = Math.max(0, Math.min(NATURAL_MIDI.length - 1, TREBLE_TOP_LINE_INDEX - stepsDown));
    return {
      pitch: NATURAL_MIDI[pitchIndex],
      startTick: Math.max(0, startTick),
      durationTicks: snapTicks
    };
  }

  function beginSelectionDrag(event) {
    if (event.button !== 0 || findScoreNote(event.target)) return;
    if (event.target.closest?.('[data-entity="score-chord"], [data-entity="score-syllable"]')) return;
    const point = pointerPoint(event);
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
  }

  function previewSelectionDrag(event) {
    if (!selectionDrag || selectionDrag.pointerId !== event.pointerId) return;
    const point = pointerPoint(event);
    selectionDrag.currentX = point.x;
    selectionDrag.currentY = point.y;
    const distance = Math.hypot(point.x - selectionDrag.startX, point.y - selectionDrag.startY);
    if (distance < 4 && !selectionDrag.moved) return;
    selectionDrag.moved = true;
    if (!selectionDrag.element) {
      selectionDrag.element = svgElement("rect", {
        class: "score-selection-box",
        "pointer-events": "none"
      });
      svg.append(selectionDrag.element);
    }
    selectionDrag.element.setAttribute("x", String(Math.min(selectionDrag.startX, point.x)));
    selectionDrag.element.setAttribute("y", String(Math.min(selectionDrag.startY, point.y)));
    selectionDrag.element.setAttribute("width", String(Math.abs(point.x - selectionDrag.startX)));
    selectionDrag.element.setAttribute("height", String(Math.abs(point.y - selectionDrag.startY)));
  }

  function finishSelectionDrag(event, cancelled = false) {
    if (!selectionDrag || selectionDrag.pointerId !== event.pointerId) return;
    const drag = selectionDrag;
    selectionDrag = null;
    drag.element?.remove();
    if (cancelled || !drag.moved) return;
    const left = Math.min(drag.startX, drag.currentX);
    const right = Math.max(drag.startX, drag.currentX);
    const top = Math.min(drag.startY, drag.currentY);
    const bottom = Math.max(drag.startY, drag.currentY);
    const hitIds = [];
    for (const [noteId, elements] of noteElementsById) {
      if (elements.some((element) => {
        const box = element.getBBox();
        return box.x + box.width >= left && box.x <= right && box.y + box.height >= top && box.y <= bottom;
      })) hitIds.push(noteId);
    }
    onSelectNotes(hitIds, drag.additive);
  }

  svg.addEventListener("pointerdown", beginSelectionDrag);
  svg.addEventListener("pointermove", previewSelectionDrag);
  svg.addEventListener("pointerup", (event) => finishSelectionDrag(event));
  svg.addEventListener("pointercancel", (event) => finishSelectionDrag(event, true));
  svg.addEventListener("lostpointercapture", (event) => finishSelectionDrag(event, true));

  svg.addEventListener("click", (event) => {
    const element = findScoreNote(event.target);
    if (element) selectFromEvent(element.dataset.noteId, event);
  });
  svg.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const element = findScoreNote(event.target);
    if (element) {
      const noteId = element.dataset.noteId;
      onContextMenu({
        kind: "selection",
        source: "score",
        noteId,
        clientX: event.clientX,
        clientY: event.clientY
      });
      return;
    }
    const placement = contextPlacement(event);
    onContextMenu({
      kind: "empty",
      source: "score",
      ...(placement ?? {}),
      clientX: event.clientX,
      clientY: event.clientY
    });
  });
  svg.addEventListener("keydown", (event) => {
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
    // Let the document-level editor shortcuts handle modified arrows (notably
    // Alt+Left/Right timing moves) without Score navigation changing selection.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const currentIndex = noteNavigation.indexOf(element.dataset.noteId);
    const nextIndex = currentIndex + (event.key === "ArrowRight" ? 1 : -1);
    const nextId = noteNavigation[nextIndex];
    if (!nextId) return;
    event.preventDefault();
    selectFromEvent(nextId, event);
    focusElementByNoteId.get(nextId)?.focus();
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

  function followMeasure(tick) {
    if (!projection || !scrollContainer || scrollContainer.clientWidth === 0) return;
    const measureIndex = Math.min(Math.floor(tick / projection.ticksPerMeasure), projection.measures.length - 1);
    if (measureIndex === lastFollowMeasure) return;
    lastFollowMeasure = measureIndex;
    const measureStartX = measureIndex * measureWidth;
    const visibleStartX = scrollContainer.scrollLeft;
    const visibleEndX = visibleStartX + scrollContainer.clientWidth;
    if (measureStartX < visibleStartX || measureStartX + measureWidth > visibleEndX) {
      const maximum = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
      scrollContainer.scrollLeft = Math.max(0, Math.min(maximum, measureStartX - scrollContainer.clientWidth * 0.2));
    }
  }

  function updatePlayback(playback = {}, view) {
    playback = normalizePlaybackState(playback);
    view = normalizeViewState(view);
    applyCurrentNote(playback.currentNoteId);
    applyCurrentSyllables(playback.currentSyllableIds);
    if (view.follow && playback.status === "playing") followMeasure(playback.currentTick);
    else lastFollowMeasure = null;
  }

  function renderChordSymbols(song) {
    for (const measure of projection.measures) {
      const baseX = 16 + measure.index * measureWidth;
      for (const chord of measure.chords) {
        const withinMeasure = chord.startTick - measure.startTick;
        const x = baseX + 66 + withinMeasure / projection.ticksPerMeasure * (measureWidth - 100);
        const label = `${chord.rootName}${chordQualitySuffix(chord.quality)}`;
        svg.append(svgElement("text", {
          x,
          y: 18,
          class: "score-chord",
          "data-entity": "score-chord",
          "data-entity-id": chord.chordId,
          "data-chord-id": chord.chordId,
          "data-root-pitch-class": chord.rootPitchClass,
          "data-quality": chord.quality,
          "data-start-tick": chord.startTick,
          "data-duration-ticks": chord.durationTicks,
          "data-measure-index": chord.measureIndex,
          "aria-label": translate("scoreChordLabel", { chord: label, tick: chord.startTick })
        }, label));
      }
    }
  }

  function renderLyrics(song, noteRefsById) {
    const noteById = new Map(song.notes.map((note) => [note.id, note]));
    const rowByMeasure = new Map();
    for (const syllable of song.lyrics.syllables) {
      const linkedNotes = syllable.noteIds.map((id) => noteById.get(id)).filter(Boolean)
        .sort((left, right) => left.startTick - right.startTick || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
      if (!linkedNotes.length) continue;
      const linkedRefs = linkedNotes.flatMap((note) => noteRefsById.get(note.id) ?? [])
        .sort((left, right) => left.startTick - right.startTick || left.measureIndex - right.measureIndex);
      if (!linkedRefs.length) continue;
      const first = linkedRefs[0];
      const last = linkedRefs[linkedRefs.length - 1];
      const row = rowByMeasure.get(first.measureIndex) ?? 0;
      rowByMeasure.set(first.measureIndex, row + 1);
      const x = first.tickable.getAbsoluteX();
      const y = 164 + row * 16;
      const noteIds = linkedNotes.map((note) => note.id);
      const text = svgElement("text", {
        x,
        y,
        class: "score-syllable",
        "data-entity": "score-syllable",
        "data-entity-id": syllable.id,
        "data-syllable-id": syllable.id,
        "data-note-ids": noteIds.join(","),
        "data-measure-index": first.measureIndex,
        "data-melisma": noteIds.length > 1,
        "data-current": "false",
        "aria-label": translate("scoreSyllableLabel", { text: syllable.text, count: noteIds.length })
      }, syllable.text);
      svg.append(text);
      let syllableElements = syllableElementsById.get(syllable.id);
      if (!syllableElements) syllableElementsById.set(syllable.id, syllableElements = []);
      syllableElements.push(text);
      if (noteIds.length > 1) {
        const firstX = first.tickable.getAbsoluteX();
        const lastX = last.tickable.getAbsoluteX();
        const melisma = svgElement("line", {
          x1: firstX + 10,
          x2: Math.max(firstX + 12, lastX + 18),
          y1: y + 3,
          y2: y + 3,
          class: "score-melisma",
          "data-entity": "score-melisma",
          "data-entity-id": syllable.id,
          "data-syllable-id": syllable.id,
          "data-note-ids": noteIds.join(","),
          "data-current": "false"
        });
        svg.append(melisma);
        syllableElements.push(melisma);
      }
    }
  }

  function render(song, state = {}) {
    state = normalizeRuntimeState(state);
    const VF = window.VexFlow;
    if (!VF?.Renderer || !VF?.StaveNote) {
      status.textContent = translate("scoreUnavailable");
      svg.replaceChildren();
      return;
    }

    projection = projectSongToScore(song);
    noteElementsById = new Map();
    syllableElementsById = new Map();
    focusElementByNoteId = new Map();
    stavesByMeasure = new Map();
    noteNavigation = [];
    activeNoteId = null;
    activeSyllableIds = new Set();
    lastFollowMeasure = null;
    const width = Math.max(measureWidth, projection.measures.length * measureWidth);
    svg.replaceChildren();
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", translate("scoreImageLabel", { count: projection.measures.length }));
    const renderer = new VF.Renderer(svg, VF.Renderer.Backends.SVG);
    renderer.resize(width, scoreHeight);
    const context = renderer.getContext();
    const noteRefs = new Map();
    const noteRefsById = new Map();
    const fragmentCounters = new Map();
    const selectedNoteIds = new Set(state.selectedNoteIds ?? []);
    const noteById = new Map(song.notes.map((note) => [note.id, note]));

    for (const measure of projection.measures) {
      const stave = new VF.Stave(16 + measure.index * measureWidth, 30, measureWidth - 30, 100);
      stavesByMeasure.set(measure.index, stave);
      if (measure.index === 0) {
        stave.addClef("treble");
        stave.addKeySignature(projection.keySignature);
        stave.addTimeSignature(`${projection.timeSignature.numerator}/${projection.timeSignature.denominator}`);
      }
      stave.setContext(context).draw();
      const voices = [];
      for (const lane of measure.lanes) {
        if (!lane.renderable || lane.events.length === 0) continue;
        const tickables = lane.events.map((event) => {
          const tickable = createTickable(VF, event);
          if (event.kind === "note") {
            noteRefs.set(`${event.noteId}:${measure.index}`, {
              event,
              tickable,
              measureIndex: measure.index,
              startTick: event.startTick
            });
          }
          return tickable;
        });
        const voice = new VF.Voice({
          num_beats: projection.timeSignature.numerator,
          beat_value: projection.timeSignature.denominator
        }).setMode(VF.Voice.Mode.SOFT).addTickables(tickables);
        voices.push(voice);
      }
      if (voices.length) {
        VF.Accidental.applyAccidentals?.(voices, projection.keySignature);
        new VF.Formatter().joinVoices(voices).format(voices, measureWidth - 74);
        for (const voice of voices) voice.draw(context, stave);
        for (const lane of measure.lanes) {
          if (!lane.renderable) continue;
          for (const event of lane.events) {
            if (event.kind !== "note") continue;
            const ref = noteRefs.get(`${event.noteId}:${measure.index}`);
            const note = noteById.get(event.noteId);
            if (!ref || !note) continue;
            const fragmentIndex = fragmentCounters.get(note.id) ?? 0;
            fragmentCounters.set(note.id, fragmentIndex + 1);
            ref.fragmentIndex = fragmentIndex;
            ref.startTick = event.startTick;
            ref.measureIndex = measure.index;
            let refs = noteRefsById.get(note.id);
            if (!refs) noteRefsById.set(note.id, refs = []);
            refs.push(ref);
          }
        }
      }
      const label = svgElement("text", {
        x: 20 + measure.index * measureWidth,
        y: 212,
        class: "score-measure-label",
        "data-entity": "score-measure",
        "data-entity-id": measure.index,
        "data-measure-index": measure.index
      }, String(measure.index + 1));
      svg.append(label);
    }

    for (const measure of projection.measures) {
      for (const segment of measure.segments) {
        if (!segment.tieToNext) continue;
        const first = noteRefs.get(`${segment.noteId}:${measure.index}`)?.tickable;
        const next = noteRefs.get(`${segment.noteId}:${measure.index + 1}`)?.tickable;
        if (first && next) new VF.StaveTie({ firstNote: first, lastNote: next }).setContext(context).draw();
      }
    }

    const visibleNoteIds = [...noteRefsById.keys()].sort((leftId, rightId) => {
      const left = noteById.get(leftId);
      const right = noteById.get(rightId);
      return left.startTick - right.startTick || left.pitch - right.pitch || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0);
    });
    const focusNoteId = (state.selectedNoteIds ?? []).find((id) => visibleNoteIds.includes(id)) ?? visibleNoteIds[0];
    for (const noteId of visibleNoteIds) {
      const refs = noteRefsById.get(noteId);
      for (const ref of refs) {
        const element = ref.tickable.getSVGElement?.();
        const note = noteById.get(noteId);
        const fragment = ref.event;
        if (!element || !note || !fragment) continue;
        const tabStop = noteId === focusNoteId && ref === refs[0];
        markNoteElement(element, { ...fragment, fragmentIndex: ref.fragmentIndex }, note, {
          selected: selectedNoteIds.has(noteId),
          tabStop,
          translate
        });
        let elements = noteElementsById.get(noteId);
        if (!elements) noteElementsById.set(noteId, elements = []);
        elements.push(element);

        // Bend harus tampak di notasi, bukan hanya hidup di playback/aria.
        // Hanya fragment pertama yang mendapat label agar note lintas bar tidak
        // menampilkan tanda bend berulang.
        if (ref.fragmentIndex === 0) {
          const bend = scoreBendLabel(note);
          if (bend) {
            const box = element.getBBox();
            svg.append(svgElement("text", {
              x: box.x + box.width / 2,
              y: Math.max(16, box.y - 6),
              "text-anchor": "middle",
              class: "score-bend-label",
              "data-entity": "score-bend",
              "data-note-id": note.id,
              "pointer-events": "none",
              "aria-hidden": "true"
            }, bend));
          }
        }
        if (tabStop) focusElementByNoteId.set(noteId, element);
      }
    }
    noteNavigation = visibleNoteIds;
    renderChordSymbols(song);
    renderLyrics(song, noteRefsById);

    const unsupportedWarning = projection.warnings.some((warning) => warning.code === "unsupported-rhythm");
    const voiceLimitWarning = projection.warnings.some((warning) => warning.code === "voice-limit");
    const windowLimitWarning = projection.warnings.some((warning) => warning.code === "score-window-limit" || warning.code === "score-chord-window-limit");
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
