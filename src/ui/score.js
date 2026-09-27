import { projectSongToScore } from "../notation/project.js";
import { midiToPitch } from "../core/model.js";

const measureWidth = 280;
const scoreHeight = 160;

function markNoteElement(note, noteId) {
  const element = note.getSVGElement?.();
  if (!element) return;
  element.setAttribute("data-entity", "score-note");
  element.setAttribute("data-entity-id", noteId);
  element.classList.add("score-note");
}

function createTickable(VF, event, noteRefs) {
  const duration = event.notation;
  const key = event.kind === "rest" ? "b/4" : event.spelling.key;
  const tickable = new VF.StaveNote({
    clef: "treble",
    keys: [key],
    duration: `${duration.value}${event.kind === "rest" ? "r" : ""}`
  });
  if (duration.dots) VF.Dot.buildAndAttach([tickable], { all: true });
  if (event.kind === "note") noteRefs.set(`${event.noteId}:${event.measureIndex}`, tickable);
  return tickable;
}

function addFallbackList(container, projection, song, translate) {
  const fallbackIds = new Set(projection.fallbackNoteIds);
  if (!fallbackIds.size && projection.warnings.length === 0) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }
  container.hidden = false;
  const children = [];
  if (fallbackIds.size) {
    const heading = document.createElement("p");
    heading.textContent = translate("scoreFallbackHeading");
    const list = document.createElement("ul");
    for (const noteId of [...fallbackIds].sort()) {
      const note = song.notes.find((item) => item.id === noteId);
      const item = document.createElement("li");
      item.dataset.entity = "score-fallback-note";
      item.dataset.entityId = noteId;
      item.textContent = note ? `${midiToPitch(note.pitch)} · tick ${note.startTick} · ${note.durationTicks} ticks · ${noteId}` : noteId;
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
      item.textContent = `${translate(`scoreWarning_${warning.code}`)} · ${warning.noteIds.join(", ")}`;
      warningList.append(item);
    }
    children.push(warningList);
  }
  container.replaceChildren(...children);
}

export function createScoreView(svg, status, fallback, translate) {
  let projection = null;
  let currentNoteId = null;

  function updatePlayback(playback) {
    currentNoteId = playback.currentNoteId;
    svg.querySelectorAll('[data-entity="score-note"]').forEach((element) => {
      element.dataset.current = String(element.dataset.entityId === currentNoteId);
    });
  }

  function render(song) {
    const VF = window.VexFlow;
    if (!VF?.Renderer || !VF?.StaveNote) {
      status.textContent = translate("scoreUnavailable");
      svg.replaceChildren();
      return;
    }

    projection = projectSongToScore(song);
    const width = Math.max(measureWidth, projection.measures.length * measureWidth);
    svg.replaceChildren();
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", translate("scoreImageLabel", { count: projection.measures.length }));
    const renderer = new VF.Renderer(svg, VF.Renderer.Backends.SVG);
    renderer.resize(width, scoreHeight);
    const context = renderer.getContext();
    const noteRefs = new Map();

    for (const measure of projection.measures) {
      const stave = new VF.Stave(16 + measure.index * measureWidth, 30, measureWidth - 30, 100);
      stave.addClef("treble");
      if (measure.index === 0) {
        stave.addKeySignature(projection.keySignature);
        stave.addTimeSignature(`${projection.timeSignature.numerator}/${projection.timeSignature.denominator}`);
      }
      stave.setContext(context).draw();
      const voices = [];
      for (const lane of measure.lanes) {
        if (!lane.renderable || lane.events.length === 0) continue;
        const tickables = lane.events.map((event) => createTickable(VF, event, noteRefs));
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
            if (event.kind === "note") markNoteElement(noteRefs.get(`${event.noteId}:${measure.index}`), event.noteId);
          }
        }
      }
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(20 + measure.index * measureWidth));
      label.setAttribute("y", "148");
      label.setAttribute("class", "score-measure-label");
      label.setAttribute("data-entity", "score-measure");
      label.setAttribute("data-entity-id", String(measure.index));
      label.textContent = String(measure.index + 1);
      svg.append(label);
    }

    for (const measure of projection.measures) {
      for (const segment of measure.segments) {
        if (!segment.tieToNext) continue;
        const first = noteRefs.get(`${segment.noteId}:${measure.index}`);
        const next = noteRefs.get(`${segment.noteId}:${measure.index + 1}`);
        if (first && next) {
          new VF.StaveTie({ firstNote: first, lastNote: next }).setContext(context).draw();
        }
      }
    }
    const unsupportedWarning = projection.warnings.some((warning) => warning.code === "unsupported-rhythm");
    const voiceLimitWarning = projection.warnings.some((warning) => warning.code === "voice-limit");
    const windowLimitWarning = projection.warnings.some((warning) => warning.code === "score-window-limit");
    const overlapIds = new Set(projection.warnings
      .filter((warning) => warning.code === "overlapping-notes")
      .flatMap((warning) => warning.noteIds));
    status.textContent = unsupportedWarning
      ? translate("scoreUnsupportedRhythm", { count: projection.fallbackNoteIds.length })
      : voiceLimitWarning
        ? translate("scoreVoiceLimit", { count: projection.fallbackNoteIds.length })
        : windowLimitWarning
          ? translate("scoreWindowLimit", { count: projection.fallbackNoteIds.length })
          : overlapIds.size
            ? translate("scoreOverlapWarning", { count: overlapIds.size })
            : translate("scoreReady", { count: projection.measures.length });
    addFallbackList(fallback, projection, song, translate);
    updatePlayback({ currentNoteId });
  }

  return Object.freeze({ render, updatePlayback, getProjection: () => projection });
}
