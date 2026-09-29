import { PPQ } from "../core/model.js?v=20260929.15";
import { SNAP_TICKS } from "../core/editor.js?v=20260929.15";
import { GM_STANDARD_KIT } from "../instruments/percussion.js?v=20260929.15";
import { centeredScrollLeft, nearestScrollLeft } from "./roll-follow.js?v=20260929.15";

const DEFAULT_VELOCITY = 100;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function drumGridEndTick(song) {
  let end = Array.isArray(song?.notes)
    ? song.notes.reduce((value, note) => Math.max(value, note.startTick + note.durationTicks), 0)
    : 0;
  for (const track of song?.tracks ?? []) {
    if (track.kind !== "percussion") continue;
    for (const hit of track.events ?? []) end = Math.max(end, hit.startTick + (hit.durationTicks ?? 1));
  }
  const { numerator = 4, denominator = 4 } = song?.timing?.timeSignature ?? {};
  const barTicks = PPQ * 4 / denominator * numerator;
  return Math.max(barTicks, Math.ceil(Math.max(1, end) / barTicks) * barTicks);
}

export function projectDrumGrid(song, {
  kit = GM_STANDARD_KIT,
  snap = "1/8"
} = {}) {
  const snapTicks = SNAP_TICKS[snap] ?? SNAP_TICKS["1/8"];
  const endTick = drumGridEndTick(song);
  const track = (song?.tracks ?? []).find((candidate) => candidate.kind === "percussion") ?? null;
  const columns = [];
  for (let tick = 0; tick < endTick; tick += snapTicks) columns.push(tick);

  const cells = new Map();
  for (const hit of track?.events ?? []) {
    const columnIndex = clamp(Math.round(hit.startTick / snapTicks), 0, Math.max(0, columns.length - 1));
    const gridTick = columns[columnIndex] ?? 0;
    const key = `${hit.pieceId}@${gridTick}`;
    const candidate = {
      trackId: track.id,
      hitId: hit.id,
      pieceId: hit.pieceId,
      startTick: hit.startTick,
      gridTick,
      timingOffset: hit.startTick - gridTick,
      velocity: hit.velocity,
      articulation: hit.articulation,
      durationTicks: hit.durationTicks ?? null,
      pan: hit.pan ?? null,
      tuning: hit.tuning ?? null
    };
    const entries = cells.get(key) ?? [];
    entries.push(candidate);
    entries.sort((left, right) => Math.abs(left.timingOffset) - Math.abs(right.timingOffset)
      || left.startTick - right.startTick || left.hitId.localeCompare(right.hitId));
    cells.set(key, entries);
  }

  const { numerator = 4, denominator = 4 } = song?.timing?.timeSignature ?? {};
  const beatTicks = PPQ * 4 / denominator;
  const barTicks = beatTicks * numerator;
  return {
    kit,
    track,
    snap,
    snapTicks,
    endTick,
    beatTicks,
    barTicks,
    columns,
    cells
  };
}

export function nextDrumCellHit(hits, selectedHitId = null) {
  if (!Array.isArray(hits) || hits.length === 0) return null;
  const currentIndex = hits.findIndex((hit) => hit.hitId === selectedHitId);
  return currentIndex >= 0 && hits.length > 1
    ? hits[(currentIndex + 1) % hits.length]
    : hits[0];
}

export function drumCellIntent(tool, hasHit) {
  if (hasHit) return "select";
  return tool === "draw" ? "add" : "clear";
}

export function drumTimelineTickToX(tick, geometry) {
  if (!Number.isFinite(tick) || !Number.isFinite(geometry?.gutterWidth) || geometry.gutterWidth < 0
    || !Number.isFinite(geometry?.columnWidth) || geometry.columnWidth <= 0
    || !Number.isFinite(geometry?.snapTicks) || geometry.snapTicks <= 0) {
    throw new RangeError("Invalid Drum timeline geometry.");
  }
  const songEndTick = Number.isFinite(geometry.songEndTick) ? Math.max(0, geometry.songEndTick) : Number.POSITIVE_INFINITY;
  const boundedTick = clamp(tick, 0, songEndTick);
  return geometry.gutterWidth + boundedTick / geometry.snapTicks * geometry.columnWidth;
}

export function drumTimelineTickAtX(x, geometry, snap = "1/8") {
  const interval = SNAP_TICKS[snap];
  if (!Number.isFinite(x) || !Number.isFinite(geometry?.gutterWidth) || geometry.gutterWidth < 0
    || !Number.isFinite(geometry?.columnWidth) || geometry.columnWidth <= 0
    || !Number.isFinite(geometry?.snapTicks) || geometry.snapTicks <= 0 || !interval) {
    throw new RangeError("Invalid Drum ruler input.");
  }
  const timelineX = Math.max(geometry.gutterWidth, x);
  const rawTick = (timelineX - geometry.gutterWidth) / geometry.columnWidth * geometry.snapTicks;
  const snappedTick = Math.round(rawTick / interval) * interval;
  const songEndTick = Number.isFinite(geometry.songEndTick) ? Math.max(0, geometry.songEndTick) : Number.POSITIVE_INFINITY;
  return clamp(snappedTick, 0, songEndTick);
}

export function normalizeDrumPlaybackRange(firstTick, lastTick) {
  if (!Number.isFinite(firstTick) || !Number.isFinite(lastTick)) throw new RangeError("Invalid Drum playback range.");
  return {
    startTick: Math.min(firstTick, lastTick),
    endTick: Math.max(firstTick, lastTick)
  };
}

function cellKey(pieceId, tick) {
  return `${pieceId}@${tick}`;
}

function makeElement(name, className, text = "") {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function createDrumGridView(root, {
  translate = (key) => key,
  onAddHit = () => {},
  onSelectHit = () => {},
  onDeleteHit = () => {},
  onSeek = () => {},
  onSetPlaybackRange = () => {}
} = {}) {
  let currentProjection = null;
  let currentStep = null;
  let currentTool = "select";
  let currentSnap = "1/8";
  let currentSongEndTick = 0;
  let currentPlayback = {};
  let lastRangeSignature = null;
  let rulerDrag = null;
  let selectedTrackId = null;
  let selectedHitId = null;

  function updateSelectionDom() {
    for (const cell of root.querySelectorAll('[data-entity="drum-cell"]')) {
      const selected = Boolean(selectedHitId && cell.dataset.hitIds?.split(",").includes(selectedHitId));
      cell.dataset.selected = String(selected);
    }
  }

  function selectHit(trackId, hitId, notify = true) {
    selectedTrackId = trackId ?? null;
    selectedHitId = hitId ?? null;
    updateSelectionDom();
    if (notify) onSelectHit(selectedHitId ? { trackId: selectedTrackId, hitId: selectedHitId } : null);
  }

  function hitsForCell(button) {
    if (!currentProjection) return [];
    return currentProjection.cells.get(cellKey(button.dataset.pieceId, Number(button.dataset.tick))) ?? [];
  }

  function selectCellHit(button) {
    const hits = hitsForCell(button);
    if (!hits.length) return false;
    const next = nextDrumCellHit(hits, selectedHitId);
    selectHit(next.trackId, next.hitId);
    return true;
  }

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-entity="drum-cell"]')
      : null;
    if (!button || !root.contains(button)) return;
    const intent = drumCellIntent(currentTool, button.dataset.hit === "true");
    if (intent === "select") {
      selectCellHit(button);
      return;
    }
    if (intent === "clear") {
      selectHit(null, null);
      return;
    }
    const created = onAddHit({
      pieceId: button.dataset.pieceId,
      startTick: Number(button.dataset.tick),
      velocity: DEFAULT_VELOCITY,
      articulation: "normal"
    });
    if (created?.trackId && created?.hit?.id) selectHit(created.trackId, created.hit.id);
  });

  root.addEventListener("keydown", (event) => {
    const ruler = event.target instanceof Element
      ? event.target.closest('[data-entity="drum-ruler"]')
      : null;
    if (ruler && root.contains(ruler)) {
      if (event.key === "Escape" && rulerDrag) {
        event.preventDefault();
        finishRulerDrag(rulerDrag.pointerId, true);
        return;
      }
      const interval = SNAP_TICKS[currentSnap] ?? SNAP_TICKS["1/8"];
      let nextTick = Number.isFinite(currentPlayback.currentTick) ? currentPlayback.currentTick : 0;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextTick -= interval;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextTick += interval;
      else if (event.key === "Home") nextTick = 0;
      else if (event.key === "End") nextTick = currentSongEndTick;
      else return;
      event.preventDefault();
      onSeek(clamp(nextTick, 0, currentSongEndTick));
      return;
    }
    const button = event.target instanceof Element
      ? event.target.closest('[data-entity="drum-cell"]')
      : null;
    if (!button || !root.contains(button)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      selectHit(null, null);
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const hits = hitsForCell(button);
    const hit = hits.find((candidate) => candidate.hitId === selectedHitId) ?? hits[0] ?? null;
    if (!hit) return;
    event.preventDefault();
    const deleted = onDeleteHit(hit.trackId, hit.hitId);
    if (deleted !== undefined && hit.hitId === selectedHitId) selectHit(null, null);
  });

  function measureTimelineGeometry() {
    const steps = [...root.querySelectorAll(".drum-grid-step")];
    const firstBounds = steps[0]?.getBoundingClientRect?.();
    const secondBounds = steps[1]?.getBoundingClientRect?.();
    const corner = root.querySelector(".drum-grid-corner");
    const gutterWidth = corner?.getBoundingClientRect?.().width ?? corner?.offsetWidth ?? 0;
    const columnWidth = secondBounds && firstBounds
      ? secondBounds.left - firstBounds.left
      : firstBounds?.width ?? 0;
    return {
      gutterWidth,
      columnWidth,
      snapTicks: currentProjection?.snapTicks ?? 0,
      songEndTick: currentSongEndTick
    };
  }

  function setOverlayBounds(element, left, width) {
    element.style.left = `${left}px`;
    element.style.width = `${Math.max(0, width)}px`;
  }

  function setRangeVisual(range, state, geometry = measureTimelineGeometry()) {
    const bodyOverlay = root.querySelector(".drum-playback-range");
    const rulerOverlay = root.querySelector(".drum-ruler-range");
    if (!range || range.endTick <= range.startTick || !bodyOverlay || !rulerOverlay) {
      if (bodyOverlay) bodyOverlay.hidden = true;
      if (rulerOverlay) rulerOverlay.hidden = true;
      return;
    }
    const left = drumTimelineTickToX(range.startTick, geometry);
    const right = drumTimelineTickToX(range.endTick, geometry);
    const width = Math.max(1, right - left);
    for (const overlay of [bodyOverlay, rulerOverlay]) {
      overlay.hidden = false;
      overlay.dataset.state = state;
      overlay.dataset.startTick = String(range.startTick);
      overlay.dataset.endTick = String(range.endTick);
    }
    setOverlayBounds(bodyOverlay, left, width);
    setOverlayBounds(rulerOverlay, left - geometry.gutterWidth, width);
  }

  function updateCanonicalRange(playback = currentPlayback) {
    const loop = playback?.loop;
    const startTick = Number.isFinite(loop?.startTick) ? loop.startTick : 0;
    const endTick = Number.isFinite(loop?.endTick) ? loop.endTick : currentSongEndTick;
    const signature = `${startTick}:${endTick}:${currentSongEndTick}`;
    if (signature === lastRangeSignature) return;
    lastRangeSignature = signature;
    const isCustom = startTick !== 0 || endTick !== currentSongEndTick;
    setRangeVisual(isCustom ? { startTick, endTick } : null, "committed");
  }

  function syncPlayhead(tick) {
    const geometry = measureTimelineGeometry();
    if (geometry.columnWidth <= 0) return;
    const x = drumTimelineTickToX(tick, geometry);
    const line = root.querySelector(".drum-playhead-line");
    const rulerLine = root.querySelector(".drum-ruler-playhead");
    if (line) {
      line.style.left = `${x}px`;
      line.dataset.tick = String(clamp(tick, 0, currentSongEndTick));
    }
    if (rulerLine) rulerLine.style.left = `${x - geometry.gutterWidth}px`;
  }

  function rulerTickFromClientX(clientX) {
    const geometry = measureTimelineGeometry();
    const bounds = root.getBoundingClientRect?.();
    if (!bounds || geometry.columnWidth <= 0) return 0;
    return drumTimelineTickAtX(clientX - bounds.left, geometry, currentSnap);
  }

  function finishRulerDrag(pointerId, cancelled = false, clientX = Number.NaN) {
    if (!rulerDrag || rulerDrag.pointerId !== pointerId) return;
    const drag = rulerDrag;
    rulerDrag = null;
    if (Number.isFinite(clientX)) {
      drag.currentTick = rulerTickFromClientX(clientX);
      if (Math.abs(clientX - drag.startClientX) >= 3) drag.moved = true;
    }
    setRangeVisual(null, "preview");
    try { drag.surface.releasePointerCapture?.(pointerId); } catch {}
    if (cancelled) return;
    if (!drag.moved || drag.startTick === drag.currentTick) {
      onSeek(drag.startTick);
      return;
    }
    const range = normalizeDrumPlaybackRange(drag.startTick, drag.currentTick);
    onSetPlaybackRange(range.startTick, range.endTick);
    onSeek(range.startTick);
  }

  root.addEventListener("pointerdown", (event) => {
    const surface = event.target instanceof Element
      ? event.target.closest('[data-entity="drum-ruler"]')
      : null;
    if (!surface || !root.contains(surface) || event.button !== 0) return;
    event.preventDefault();
    const tick = rulerTickFromClientX(event.clientX);
    rulerDrag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startTick: tick,
      currentTick: tick,
      moved: false,
      surface
    };
    try { surface.setPointerCapture?.(event.pointerId); } catch {}
  });

  root.addEventListener("pointermove", (event) => {
    if (!rulerDrag || rulerDrag.pointerId !== event.pointerId) return;
    const distance = Math.abs(event.clientX - rulerDrag.startClientX);
    rulerDrag.currentTick = rulerTickFromClientX(event.clientX);
    if (distance >= 3) rulerDrag.moved = true;
    if (rulerDrag.moved && rulerDrag.startTick !== rulerDrag.currentTick) {
      setRangeVisual(normalizeDrumPlaybackRange(rulerDrag.startTick, rulerDrag.currentTick), "preview");
    } else {
      setRangeVisual(null, "preview");
    }
  });

  root.addEventListener("pointerup", (event) => finishRulerDrag(event.pointerId, false, event.clientX));
  root.addEventListener("pointercancel", (event) => finishRulerDrag(event.pointerId, true));
  root.addEventListener("lostpointercapture", (event) => finishRulerDrag(event.pointerId, true));

  function render(song, state = {}, songEndTick = drumGridEndTick(song)) {
    const projection = projectDrumGrid(song, { snap: state.editor?.snap ?? "1/8" });
    currentProjection = projection;
    currentTool = state.editor?.tool === "draw" ? "draw" : "select";
    currentSnap = state.editor?.snap ?? "1/8";
    currentSongEndTick = Number.isFinite(songEndTick) ? Math.max(0, songEndTick) : projection.endTick;
    currentPlayback = state.playback ?? currentPlayback;
    lastRangeSignature = null;
    root.dataset.tool = currentTool;
    currentStep = null;
    if (selectedHitId) {
      const stillExists = projection.track?.events.some((hit) => hit.id === selectedHitId) ?? false;
      if (!stillExists) {
        selectedTrackId = null;
        selectedHitId = null;
        onSelectHit(null);
      }
    }
    if (rulerDrag) finishRulerDrag(rulerDrag.pointerId, true);
    root.replaceChildren();
    root.style.position = "relative";
    root.style.setProperty("--drum-column-count", String(projection.columns.length));

    const corner = makeElement("div", "drum-grid-corner", translate("drumsPieceHeading"));
    corner.dataset.entity = "drum-row-label";
    root.append(corner);

    const ruler = makeElement("button", "drum-grid-ruler-surface");
    ruler.type = "button";
    ruler.dataset.entity = "drum-ruler";
    ruler.setAttribute("role", "slider");
    ruler.setAttribute("tabindex", "0");
    ruler.setAttribute("aria-orientation", "horizontal");
    ruler.setAttribute("aria-label", translate("drumsRulerLabel"));
    ruler.setAttribute("aria-valuemin", "0");
    ruler.setAttribute("aria-valuemax", String(currentSongEndTick));
    ruler.setAttribute("aria-valuenow", String(currentPlayback.currentTick ?? 0));
    ruler.setAttribute("aria-valuetext", translate("drumsRulerValue", { tick: currentPlayback.currentTick ?? 0 }));
    ruler.title = translate("drumsRulerLabel");

    for (const tick of projection.columns) {
      const header = makeElement("div", "drum-grid-step");
      header.dataset.tick = String(tick);
      const isBar = tick % projection.barTicks === 0;
      const isBeat = tick % projection.beatTicks === 0;
      header.dataset.bar = String(isBar);
      header.dataset.beat = String(isBeat);
      header.textContent = isBar
        ? String(Math.floor(tick / projection.barTicks) + 1)
        : isBeat
          ? "•"
          : "";
      ruler.append(header);
    }

    const rulerRange = makeElement("span", "drum-ruler-range");
    rulerRange.setAttribute("aria-hidden", "true");
    rulerRange.hidden = true;
    const rulerPlayhead = makeElement("span", "drum-ruler-playhead");
    rulerPlayhead.setAttribute("aria-hidden", "true");
    ruler.append(rulerRange, rulerPlayhead);
    root.append(ruler);

    for (const piece of projection.kit.pieces) {
      const label = makeElement("div", "drum-row-label", piece.name);
      label.dataset.pieceId = piece.id;
      root.append(label);

      for (const tick of projection.columns) {
        const hits = projection.cells.get(cellKey(piece.id, tick)) ?? [];
        const hit = hits[0] ?? null;
        const button = makeElement("button", "drum-cell");
        button.type = "button";
        button.dataset.entity = "drum-cell";
        button.dataset.pieceId = piece.id;
        button.dataset.tick = String(tick);
        button.dataset.bar = String(tick % projection.barTicks === 0);
        button.dataset.beat = String(tick % projection.beatTicks === 0);
        button.dataset.hit = String(Boolean(hit));
        button.dataset.selected = String(Boolean(hit && hits.some((candidate) => candidate.hitId === selectedHitId)));
        button.setAttribute("aria-pressed", String(Boolean(hit)));
        button.setAttribute("aria-label", hit
          ? translate(hits.length > 1 ? "drumsMultiHitCellLabel" : "drumsHitCellLabel", {
              piece: piece.name,
              tick: hit.startTick,
              velocity: hit.velocity,
              count: hits.length
            })
          : translate(currentTool === "draw" ? "drumsEmptyCellDrawLabel" : "drumsEmptyCellSelectLabel", { piece: piece.name, tick }));
        if (hit) {
          button.dataset.hitId = hit.hitId;
          button.dataset.hitIds = hits.map((candidate) => candidate.hitId).join(",");
          button.dataset.trackId = hit.trackId;
          button.dataset.velocity = String(hit.velocity);
          button.dataset.timingOffset = String(hit.timingOffset);
          button.dataset.hitCount = String(hits.length);
          button.style.setProperty("--hit-strength", String(clamp(hit.velocity / 127, 0.12, 1)));
          const marker = makeElement("span", "drum-hit-marker");
          marker.setAttribute("aria-hidden", "true");
          button.append(marker);
          if (hits.length > 1) {
            const count = makeElement("span", "drum-hit-count", String(hits.length));
            count.setAttribute("aria-hidden", "true");
            button.append(count);
          }
          if (hit.timingOffset !== 0) {
            const offset = makeElement("span", "drum-hit-offset", hit.timingOffset > 0 ? "›" : "‹");
            offset.setAttribute("aria-hidden", "true");
            button.append(offset);
          }
        }
        root.append(button);
      }
    }

    const bodyRange = makeElement("div", "drum-playback-range");
    bodyRange.setAttribute("aria-hidden", "true");
    bodyRange.hidden = true;
    const playheadLine = makeElement("div", "drum-playhead-line");
    playheadLine.setAttribute("aria-hidden", "true");
    root.append(bodyRange, playheadLine);
    updatePlayback(currentPlayback, { songEndTick: currentSongEndTick });

    return projection;
  }

  function updatePlayback(playback = {}, { followMode = "none", songEndTick = currentSongEndTick } = {}) {
    if (!currentProjection || !currentProjection.columns.length) return;
    currentPlayback = playback;
    if (Number.isFinite(songEndTick)) currentSongEndTick = Math.max(0, songEndTick);
    const tick = clamp(Number.isFinite(playback.currentTick) ? playback.currentTick : 0, 0, currentSongEndTick);
    const ruler = root.querySelector('[data-entity="drum-ruler"]');
    if (ruler) {
      ruler.setAttribute("aria-valuemax", String(currentSongEndTick));
      ruler.setAttribute("aria-valuenow", String(tick));
      ruler.setAttribute("aria-valuetext", translate("drumsRulerValue", { tick }));
    }
    updateCanonicalRange(playback);
    syncPlayhead(tick);
    const index = clamp(Math.floor(tick / currentProjection.snapTicks), 0, currentProjection.columns.length - 1);
    const nextStep = currentProjection.columns[index];
    if (nextStep !== currentStep) {
      for (const element of root.querySelectorAll('[data-current-step="true"]')) element.dataset.currentStep = "false";
      for (const element of root.querySelectorAll(`[data-tick="${nextStep}"]`)) element.dataset.currentStep = "true";
      currentStep = nextStep;
    }
    if (followMode !== "none" && playback.status === "playing") {
      const scrollContainer = root.parentElement;
      const timelineGeometry = measureTimelineGeometry();
      const playheadX = drumTimelineTickToX(tick, timelineGeometry);
      if (scrollContainer?.clientWidth > 0 && timelineGeometry.columnWidth > 0 && root.getBoundingClientRect) {
        // Projection boleh menyisakan padding sampai ujung birama, tetapi follow
        // berhenti pada akhir canonical song supaya playhead masih bergerak ke
        // kanan setelah viewport mencapai ujung musik sebenarnya.
        const gridWidth = scrollContainer.scrollWidth ?? root.scrollWidth ?? 0;
        const contentWidth = Math.min(gridWidth, drumTimelineTickToX(currentSongEndTick, timelineGeometry));
        const scrollGeometry = {
          playheadX,
          playheadWidth: 0,
          viewportWidth: scrollContainer.clientWidth,
          gutterWidth: timelineGeometry.gutterWidth,
          contentWidth,
          scrollLeft: scrollContainer.scrollLeft
        };
        scrollContainer.scrollLeft = followMode === "nearest"
          ? nearestScrollLeft(scrollGeometry)
          : centeredScrollLeft(scrollGeometry);
      }
    }
  }

  function getProjection() {
    return currentProjection;
  }

  function getSelectedHit() {
    return selectedHitId ? { trackId: selectedTrackId, hitId: selectedHitId } : null;
  }

  return Object.freeze({
    render,
    updatePlayback,
    getProjection,
    getSelectedHit,
    selectHit: (trackId, hitId) => selectHit(trackId, hitId)
  });
}
