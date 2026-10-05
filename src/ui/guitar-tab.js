import { PPQ, midiToPitch } from "../core/model.js";
import { chooseGuitarFingering, guitarBendLabel, STANDARD_TUNING, MAX_FRET } from "./guitar-view.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LABEL_WIDTH = 42;
const ROW_HEIGHT = 30;
const TOP_PAD = 28;
const BOTTOM_PAD = 24;
const MIN_PIXELS_PER_BEAT = 28;
const DEFAULT_VIEWPORT_WIDTH = 760;
const STRING_LABELS = Object.freeze(["e", "B", "G", "D", "A", "E"]);

function svgElement(name, attributes = {}, parent = null, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== null) element.textContent = text;
  parent?.append(element);
  return element;
}

export function createGuitarTabGeometry(song, viewportWidth = 760) {
  const notes = Array.isArray(song?.notes) ? song.notes : [];
  const endTick = Math.max(1, ...notes.map((note) => note.startTick + note.durationTicks));
  const timeSignature = song?.timing?.timeSignature ?? song?.timeSignature ?? { numerator: 4, denominator: 4 };
  const beatTicks = PPQ * 4 / timeSignature.denominator;
  const barTicks = beatTicks * timeSignature.numerator;
  const measuredWidth = Number(viewportWidth);
  const available = Number.isFinite(measuredWidth) && measuredWidth > 0
    ? measuredWidth
    : DEFAULT_VIEWPORT_WIDTH;
  const naturalWidth = LABEL_WIDTH + (endTick / beatTicks) * MIN_PIXELS_PER_BEAT + 28;
  const width = Math.max(available, naturalWidth);
  const pixelsPerTick = (width - LABEL_WIDTH - 28) / endTick;
  return {
    width,
    height: TOP_PAD + ROW_HEIGHT * 6 + BOTTOM_PAD,
    endTick,
    beatTicks,
    barTicks,
    pixelsPerTick,
    labelWidth: LABEL_WIDTH,
    rowHeight: ROW_HEIGHT,
    topPad: TOP_PAD
  };
}

export function projectGuitarTab(song, {
  tuning = STANDARD_TUNING,
  maxFret = MAX_FRET
} = {}) {
  const notes = [...(Array.isArray(song?.notes) ? song.notes : [])]
    .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || left.id.localeCompare(right.id));
  const route = chooseGuitarFingering(notes, { tuning, maxFret });
  return notes.map((note) => {
    const position = route.get(note.id) ?? null;
    return {
      noteId: note.id,
      pitch: note.pitch,
      startTick: note.startTick,
      durationTicks: note.durationTicks,
      string: position?.string ?? null,
      fret: position?.fret ?? null,
      bend: guitarBendLabel(note),
      vibratoDepth: note.vibrato?.depthSemitones ?? null
    };
  });
}

export function createGuitarTabView(svg, scrollContainer, {
  onSelectNote = () => {}
} = {}) {
  let noteElementsById = new Map();
  let noteNavigation = [];
  let activeNoteId = null;
  let lastRender = null;

  function eventX(tick, geometry) {
    return geometry.labelWidth + tick * geometry.pixelsPerTick;
  }

  function stringY(string, geometry) {
    return geometry.topPad + (string - 1) * geometry.rowHeight + geometry.rowHeight / 2;
  }

  function findEvent(target) {
    const element = target instanceof Element ? target.closest('[data-entity="guitar-tab-note"]') : null;
    return element && svg.contains(element) ? element : null;
  }

  svg.addEventListener("click", (event) => {
    const element = findEvent(event.target);
    if (!element) return;
    onSelectNote(element.dataset.noteId, Boolean(event.shiftKey || event.ctrlKey || event.metaKey));
    element.focus?.();
  });

  svg.addEventListener("keydown", (event) => {
    const element = findEvent(event.target);
    if (!element) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectNote(element.dataset.noteId, Boolean(event.shiftKey || event.ctrlKey || event.metaKey));
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const index = noteNavigation.indexOf(element.dataset.noteId);
    const nextId = noteNavigation[index + (event.key === "ArrowRight" ? 1 : -1)];
    const next = noteElementsById.get(nextId)?.[0];
    if (!nextId || !next) return;
    event.preventDefault();
    onSelectNote(nextId, false);
    next.focus?.();
  });

  function updateSelection(selectedNoteIds = []) {
    const selected = new Set(selectedNoteIds);
    const tabStopId = selectedNoteIds.find((noteId) => noteElementsById.has(noteId)) ?? noteNavigation[0] ?? null;
    for (const [noteId, elements] of noteElementsById) {
      const value = String(selected.has(noteId));
      for (const element of elements) {
        element.dataset.selected = value;
        element.setAttribute("aria-pressed", value);
        element.setAttribute("tabindex", noteId === tabStopId ? "0" : "-1");
      }
    }
  }

  function updatePlayback(playback = {}, { follow = false } = {}) {
    const next = playback.currentNoteId ?? null;
    if (next !== activeNoteId) {
      for (const element of noteElementsById.get(activeNoteId) ?? []) element.dataset.current = "false";
      activeNoteId = next;
      for (const element of noteElementsById.get(activeNoteId) ?? []) element.dataset.current = "true";
    }
    if (follow && playback.status === "playing" && activeNoteId) {
      const element = noteElementsById.get(activeNoteId)?.[0];
      // Tab yang tersembunyi tidak punya client rect; scrollIntoView di sana
      // hanya memaksa layout yang tidak terlihat.
      if (element?.isConnected && element.getClientRects().length) {
        element.scrollIntoView?.({ inline: "nearest", block: "nearest" });
      }
    }
  }

  function render(song, state = {}) {
    lastRender = { song, state };
    const viewportWidth = Number(scrollContainer?.clientWidth) || 0;
    const geometry = createGuitarTabGeometry(song, viewportWidth || DEFAULT_VIEWPORT_WIDTH);
    const events = projectGuitarTab(song);
    const selected = new Set(state.selectedNoteIds ?? []);
    const focusedNoteId = svg.contains(document.activeElement)
      ? document.activeElement?.dataset?.noteId ?? null
      : null;
    activeNoteId = state.playback?.currentNoteId ?? null;
    noteElementsById = new Map();
    noteNavigation = events.filter((event) => event.string && event.fret !== null).map((event) => event.noteId);

    svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
    svg.setAttribute("width", geometry.width);
    svg.setAttribute("height", geometry.height);
    svg.setAttribute("aria-label", `Guitar tablature, ${events.length} note(s)`);
    svg.replaceChildren();

    for (let string = 1; string <= 6; string += 1) {
      const y = stringY(string, geometry);
      svgElement("line", {
        x1: geometry.labelWidth,
        y1: y,
        x2: geometry.width - 18,
        y2: y,
        class: "guitar-tab-string",
        "data-string": string
      }, svg);
      svgElement("text", {
        x: 8,
        y: y + 4,
        class: "guitar-tab-string-label"
      }, svg, STRING_LABELS[string - 1]);
    }

    for (let tick = 0; tick <= geometry.endTick; tick += geometry.beatTicks) {
      const x = eventX(tick, geometry);
      const isBar = tick % geometry.barTicks === 0;
      svgElement("line", {
        x1: x,
        y1: geometry.topPad,
        x2: x,
        y2: geometry.topPad + geometry.rowHeight * 6,
        class: isBar ? "guitar-tab-grid guitar-tab-bar" : "guitar-tab-grid"
      }, svg);
      if (isBar) {
        svgElement("text", {
          x: x + 4,
          y: 16,
          class: "guitar-tab-bar-label"
        }, svg, String(Math.floor(tick / geometry.barTicks) + 1));
      }
    }

    for (const event of events) {
      if (!event.string || event.fret === null) continue;
      const x = eventX(event.startTick, geometry);
      const endX = eventX(event.startTick + event.durationTicks, geometry);
      const y = stringY(event.string, geometry);
      const selectedNote = selected.has(event.noteId);
      const current = activeNoteId === event.noteId;
      const group = svgElement("g", {
        class: "guitar-tab-note",
        "data-entity": "guitar-tab-note",
        "data-note-id": event.noteId,
        "data-selected": selectedNote,
        "data-current": current,
        role: "button",
        tabindex: 0,
        "aria-pressed": selectedNote,
        "aria-label": `${midiToPitch(event.pitch)}, string ${event.string}, fret ${event.fret}`
      }, svg);

      svgElement("line", {
        x1: x + 7,
        y1: y,
        x2: Math.max(x + 7, endX - 3),
        y2: y,
        class: "guitar-tab-duration"
      }, group);
      svgElement("rect", {
        x: x - 8,
        y: y - 10,
        width: 20,
        height: 20,
        rx: 7,
        class: "guitar-tab-fret-bg"
      }, group);
      svgElement("text", {
        x: x + 2,
        y: y + 4,
        "text-anchor": "middle",
        class: "guitar-tab-fret"
      }, group, String(event.fret));

      if (event.bend) {
        svgElement("path", {
          d: `M ${x + 11} ${y - 4} q 9 -14 18 -14`,
          class: "guitar-tab-bend"
        }, group);
        svgElement("text", {
          x: x + 32,
          y: y - 14,
          class: "guitar-tab-expression-label"
        }, group, event.bend);
      }
      if (event.vibratoDepth !== null) {
        svgElement("path", {
          d: `M ${x + 12} ${y + 9} q 4 -4 8 0 t 8 0 t 8 0`,
          class: "guitar-tab-vibrato"
        }, group);
      }

      const list = noteElementsById.get(event.noteId) ?? [];
      list.push(group);
      noteElementsById.set(event.noteId, list);
    }

    updateSelection(state.selectedNoteIds ?? []);
    if (focusedNoteId) noteElementsById.get(focusedNoteId)?.[0]?.focus?.();
    return { geometry, events };
  }

  function resize() {
    const nextWidth = Number(scrollContainer?.clientWidth) || 0;
    if (nextWidth <= 0 || !lastRender) return false;
    const nextGeometryWidth = createGuitarTabGeometry(lastRender.song, nextWidth).width;
    const renderedWidth = Number(svg.getAttribute("width")) || 0;
    if (Math.abs(nextGeometryWidth - renderedWidth) < 1) return false;
    render(lastRender.song, lastRender.state);
    return true;
  }

  if (scrollContainer && typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(scrollContainer);
  }

  return Object.freeze({ render, resize, updateSelection, updatePlayback });
}
