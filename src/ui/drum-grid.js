import { PPQ } from "../core/model.js?v=20260929.12";
import { SNAP_TICKS } from "../core/editor.js?v=20260929.12";
import { GM_STANDARD_KIT } from "../instruments/percussion.js?v=20260929.12";

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
  onDeleteHit = () => {}
} = {}) {
  let currentProjection = null;
  let currentStep = null;
  let currentTool = "select";
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
    if (button.dataset.hit === "true") {
      selectCellHit(button);
      return;
    }
    if (currentTool !== "draw") {
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

  function render(song, state = {}) {
    const projection = projectDrumGrid(song, { snap: state.editor?.snap ?? "1/8" });
    currentProjection = projection;
    currentTool = state.editor?.tool === "draw" ? "draw" : "select";
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
    root.replaceChildren();
    root.style.setProperty("--drum-column-count", String(projection.columns.length));

    const corner = makeElement("div", "drum-grid-corner", translate("drumsPieceHeading"));
    corner.dataset.entity = "drum-row-label";
    root.append(corner);

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
      root.append(header);
    }

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

    return projection;
  }

  function updatePlayback(playback = {}, { follow = false } = {}) {
    if (!currentProjection || !currentProjection.columns.length) return;
    const tick = Number.isFinite(playback.currentTick) ? playback.currentTick : 0;
    const index = clamp(Math.floor(tick / currentProjection.snapTicks), 0, currentProjection.columns.length - 1);
    const nextStep = currentProjection.columns[index];
    if (nextStep !== currentStep) {
      for (const element of root.querySelectorAll('[data-current-step="true"]')) element.dataset.currentStep = "false";
      for (const element of root.querySelectorAll(`[data-tick="${nextStep}"]`)) element.dataset.currentStep = "true";
      currentStep = nextStep;
    }
    if (follow && playback.status === "playing") {
      root.querySelector(`.drum-grid-step[data-tick="${nextStep}"]`)?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
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
