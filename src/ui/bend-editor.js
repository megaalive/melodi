const SVG_NS = "http://www.w3.org/2000/svg";
const RANGE_VALUES = [1, 2, 3, 4];
const TIME_SNAP = 0.05;
const PREVIEW = Object.freeze({ width: 320, height: 120, padX: 18, padY: 14 });

function svg(name, attrs = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatBendUnits(semitones) {
  if (semitones === 0) return "0";
  const sign = semitones > 0 ? "+" : "−";
  const absolute = Math.abs(semitones);
  const whole = Math.floor(absolute / 2);
  const half = absolute % 2;
  const body = whole === 0 && half ? "½"
    : half ? `${whole}½`
      : String(whole);
  return `${sign}${body}`;
}

export function normalizeBendDraft(points) {
  const source = Array.isArray(points) && points.length
    ? points.map((point) => ({ position: Number(point.position), semitones: Number(point.semitones) }))
    : [{ position: 0, semitones: 0 }, { position: 1, semitones: 0 }];

  source.sort((left, right) => left.position - right.position);
  if (source[0].position !== 0) source.unshift({ position: 0, semitones: source[0].semitones ?? 0 });
  if (source.at(-1).position !== 1) source.push({ position: 1, semitones: source.at(-1).semitones ?? 0 });
  source[0].position = 0;
  source.at(-1).position = 1;
  return source;
}

export function chooseBendRange(points) {
  const peak = Math.max(0, ...normalizeBendDraft(points).map((point) => Math.abs(point.semitones)));
  return RANGE_VALUES.find((value) => value >= peak) ?? RANGE_VALUES.at(-1);
}

export function snapBendPoint(position, semitones, range = 2) {
  const safeRange = RANGE_VALUES.includes(range) ? range : 2;
  const snappedPosition = clamp(Math.round(position / TIME_SNAP) * TIME_SNAP, 0, 1);
  const snappedSemitones = clamp(Math.round(semitones), -safeRange, safeRange);
  return {
    position: Number(snappedPosition.toFixed(2)),
    semitones: snappedSemitones
  };
}

export function insertBendPointAt(points, position, semitones, range = 2) {
  const next = normalizeBendDraft(points);
  if (next.length >= 16) return next;
  const snapped = snapBendPoint(position, semitones, range);
  if (snapped.position <= 0 || snapped.position >= 1) return next;
  const existing = next.findIndex((point) => Math.abs(point.position - snapped.position) < TIME_SNAP / 2);
  if (existing >= 0) {
    next[existing].semitones = snapped.semitones;
    return next;
  }
  next.push(snapped);
  next.sort((left, right) => left.position - right.position);
  return next;
}

export function insertBendPoint(points) {
  const next = normalizeBendDraft(points);
  if (next.length >= 16) return next;
  let bestIndex = 0;
  let bestGap = -1;
  for (let index = 0; index < next.length - 1; index += 1) {
    const gap = next[index + 1].position - next[index].position;
    if (gap > bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }
  const left = next[bestIndex];
  const right = next[bestIndex + 1];
  return insertBendPointAt(next, (left.position + right.position) / 2, left.semitones, chooseBendRange(next));
}

function pointSignature(points) {
  return JSON.stringify((points ?? []).map((point) => [
    Number(point.position.toFixed(4)),
    Number(point.semitones.toFixed(4))
  ]));
}

function makePitchOptions(select, range, selected) {
  select.replaceChildren();
  for (let semitones = -range; semitones <= range; semitones += 1) {
    const option = document.createElement("option");
    option.value = String(semitones);
    option.textContent = formatBendUnits(semitones);
    option.selected = semitones === selected;
    select.append(option);
  }
}

export function createBendCurveEditor({
  root,
  rangeSelect,
  preview,
  list,
  stateLabel,
  translate,
  onApply
}) {
  let noteId = null;
  let canonicalSignature = "null";
  let draft = normalizeBendDraft(null);
  let dirty = false;
  let selectedCount = 0;
  let dragIndex = null;
  let dragPointerId = null;

  function currentRange() {
    const value = Number(rangeSelect.value);
    return RANGE_VALUES.includes(value) ? value : 2;
  }

  function previewGeometry() {
    const graphWidth = PREVIEW.width - PREVIEW.padX * 2;
    const graphHeight = PREVIEW.height - PREVIEW.padY * 2;
    const range = currentRange();
    return {
      range,
      graphWidth,
      graphHeight,
      x: (position) => PREVIEW.padX + position * graphWidth,
      y: (semitones) => PREVIEW.padY + ((range - semitones) / (range * 2)) * graphHeight
    };
  }

  function eventToPoint(event) {
    const rect = preview.getBoundingClientRect();
    if (!rect.width || !rect.height) return { position: 0, semitones: 0 };
    const localX = ((event.clientX - rect.left) / rect.width) * PREVIEW.width;
    const localY = ((event.clientY - rect.top) / rect.height) * PREVIEW.height;
    const { range, graphWidth, graphHeight } = previewGeometry();
    const position = (localX - PREVIEW.padX) / graphWidth;
    const semitones = range - ((localY - PREVIEW.padY) / graphHeight) * range * 2;
    return snapBendPoint(position, semitones, range);
  }

  function drawPreview() {
    preview.replaceChildren();
    const { range, x, y } = previewGeometry();

    for (let value = -range; value <= range; value += 1) {
      preview.append(svg("line", {
        x1: PREVIEW.padX,
        x2: PREVIEW.width - PREVIEW.padX,
        y1: y(value),
        y2: y(value),
        class: value === 0 ? "bend-guide bend-zero" : "bend-guide"
      }));
      const label = svg("text", {
        x: 3,
        y: y(value) + 3,
        class: "bend-guide-label"
      });
      label.textContent = formatBendUnits(value);
      preview.append(label);
    }

    for (let position = 0; position <= 1.0001; position += 0.25) {
      preview.append(svg("line", {
        x1: x(position),
        x2: x(position),
        y1: PREVIEW.padY,
        y2: PREVIEW.height - PREVIEW.padY,
        class: "bend-time-guide"
      }));
    }

    const points = draft.map((point) => `${x(point.position)},${y(point.semitones)}`).join(" ");
    preview.append(svg("polyline", { points, class: "bend-preview-line", "pointer-events": "none" }));

    draft.forEach((point, index) => {
      const hit = svg("circle", {
        cx: x(point.position),
        cy: y(point.semitones),
        r: 12,
        class: "bend-preview-hit",
        "data-bend-point-index": index,
        "aria-hidden": "true"
      });
      const dot = svg("circle", {
        cx: x(point.position),
        cy: y(point.semitones),
        r: index === 0 || index === draft.length - 1 ? 4.5 : 5.5,
        class: index === dragIndex ? "bend-preview-point bend-preview-point-active" : "bend-preview-point",
        "pointer-events": "none"
      });
      preview.append(hit, dot);
    });
  }

  function renderRows() {
    list.replaceChildren();

    const header = document.createElement("div");
    header.className = "bend-point-header";
    const timeHeader = document.createElement("span");
    timeHeader.textContent = translate("bendPointTimeLabel");
    const pitchHeader = document.createElement("span");
    pitchHeader.textContent = translate("bendPointPitchLabel");
    header.append(timeHeader, pitchHeader, document.createElement("span"));
    list.append(header);

    const range = currentRange();
    draft.forEach((point, index) => {
      const row = document.createElement("div");
      row.className = "bend-point-row";
      row.dataset.bendPointIndex = String(index);

      const time = document.createElement("input");
      time.type = "number";
      time.min = "0";
      time.max = "100";
      time.step = "5";
      time.value = String(Math.round(point.position * 100));
      time.dataset.action = "bend-point-time";
      time.dataset.bendPointIndex = String(index);
      time.disabled = index === 0 || index === draft.length - 1;
      time.setAttribute("aria-label", translate("bendPointTimeLabel"));

      const pitch = document.createElement("select");
      pitch.dataset.action = "bend-point-pitch";
      pitch.dataset.bendPointIndex = String(index);
      pitch.setAttribute("aria-label", translate("bendPointPitchLabel"));
      makePitchOptions(pitch, range, point.semitones);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary bend-point-remove";
      remove.dataset.action = "bend-remove-point";
      remove.dataset.bendPointIndex = String(index);
      remove.textContent = "×";
      remove.setAttribute("aria-label", translate("bendRemovePointButton"));
      remove.disabled = index === 0 || index === draft.length - 1;

      row.append(time, pitch, remove);
      list.append(row);
    });
  }

  function renderState() {
    const available = selectedCount === 1;
    root.dataset.available = String(available);
    rangeSelect.disabled = !available;
    for (const button of root.querySelectorAll(
      '[data-action="bend-add-point"], [data-action="bend-reset-curve"], [data-action="bend-apply-curve"]'
    )) button.disabled = !available;
    if (!available) {
      for (const control of list.querySelectorAll("input, select, button")) control.disabled = true;
    }
    stateLabel.textContent = available
      ? dirty ? translate("bendCurveDirty") : translate("bendCurveReady")
      : translate("bendCurveSingleNote");
  }

  function rerender() {
    drawPreview();
    renderRows();
    renderState();
  }

  function load(note, count) {
    selectedCount = count;
    if (count !== 1 || !note) {
      noteId = null;
      dirty = false;
      draft = normalizeBendDraft(null);
      rangeSelect.value = "2";
      dragIndex = null;
      rerender();
      return;
    }
    const signature = pointSignature(note.pitchBend ?? null);
    if (note.id !== noteId || (!dirty && signature !== canonicalSignature)) {
      noteId = note.id;
      canonicalSignature = signature;
      draft = normalizeBendDraft(note.pitchBend ?? null);
      rangeSelect.value = String(chooseBendRange(draft));
      dirty = false;
      dragIndex = null;
    }
    rerender();
  }

  function changeTime(index, percent) {
    if (index <= 0 || index >= draft.length - 1) return;
    const snapped = snapBendPoint(percent / 100, draft[index].semitones, currentRange());
    const lower = draft[index - 1].position + TIME_SNAP;
    const upper = draft[index + 1].position - TIME_SNAP;
    draft[index].position = Number(clamp(snapped.position, lower, upper).toFixed(2));
    dirty = true;
    rerender();
  }

  function changePitch(index, semitones) {
    if (index < 0 || index >= draft.length) return;
    draft[index].semitones = snapBendPoint(draft[index].position, semitones, currentRange()).semitones;
    dirty = true;
    rerender();
  }

  function movePointFromPointer(index, event) {
    if (index < 0 || index >= draft.length) return;
    const snapped = eventToPoint(event);
    const first = index === 0;
    const last = index === draft.length - 1;
    if (!first && !last) {
      const lower = draft[index - 1].position + TIME_SNAP;
      const upper = draft[index + 1].position - TIME_SNAP;
      draft[index].position = Number(clamp(snapped.position, lower, upper).toFixed(2));
    }
    draft[index].semitones = snapped.semitones;
    dirty = true;
    rerender();
  }

  function addPoint(position = null, semitones = null) {
    draft = position === null
      ? insertBendPoint(draft)
      : insertBendPointAt(draft, position, semitones, currentRange());
    dirty = true;
    rerender();
  }

  function removePoint(index) {
    if (index <= 0 || index >= draft.length - 1) return;
    draft.splice(index, 1);
    dirty = true;
    rerender();
  }

  function reset() {
    draft = normalizeBendDraft(null);
    dirty = true;
    rerender();
  }

  function changeRange() {
    const range = currentRange();
    draft = draft.map((point) => ({
      ...point,
      semitones: clamp(Math.round(point.semitones), -range, range)
    }));
    dirty = true;
    rerender();
  }

  function apply() {
    if (selectedCount !== 1 || !noteId) return false;
    const points = normalizeBendDraft(draft).map((point) => ({
      position: Number(point.position.toFixed(2)),
      semitones: Number(point.semitones)
    }));
    const bend = points.every((point) => point.semitones === 0) ? null : points;
    onApply(noteId, bend);
    canonicalSignature = pointSignature(bend);
    dirty = false;
    rerender();
    return true;
  }

  preview.addEventListener("pointerdown", (event) => {
    if (selectedCount !== 1) return;
    const target = event.target instanceof Element ? event.target.closest("[data-bend-point-index]") : null;
    if (!target) return;
    event.preventDefault();
    dragIndex = Number(target.dataset.bendPointIndex);
    dragPointerId = event.pointerId;
    preview.setPointerCapture?.(event.pointerId);
    movePointFromPointer(dragIndex, event);
  });

  preview.addEventListener("pointermove", (event) => {
    if (dragIndex === null || dragPointerId !== event.pointerId) return;
    event.preventDefault();
    movePointFromPointer(dragIndex, event);
  });

  function finishDrag(event) {
    if (dragIndex === null || dragPointerId !== event.pointerId) return;
    preview.releasePointerCapture?.(event.pointerId);
    dragIndex = null;
    dragPointerId = null;
    drawPreview();
  }
  preview.addEventListener("pointerup", finishDrag);
  preview.addEventListener("pointercancel", finishDrag);

  preview.addEventListener("click", (event) => {
    if (selectedCount !== 1) return;
    const target = event.target instanceof Element ? event.target.closest("[data-bend-point-index]") : null;
    if (target) return;
    const point = eventToPoint(event);
    addPoint(point.position, point.semitones);
  });

  preview.addEventListener("dblclick", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-bend-point-index]") : null;
    if (!target) return;
    event.preventDefault();
    removePoint(Number(target.dataset.bendPointIndex));
  });

  preview.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-bend-point-index]") : null;
    if (!target) return;
    event.preventDefault();
    removePoint(Number(target.dataset.bendPointIndex));
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target === rangeSelect) changeRange();
    else if (target.dataset.action === "bend-point-time") changeTime(Number(target.dataset.bendPointIndex), Number(target.value));
    else if (target.dataset.action === "bend-point-pitch") changePitch(Number(target.dataset.bendPointIndex), Number(target.value));
  });

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;
    if (target.dataset.action === "bend-add-point") addPoint();
    else if (target.dataset.action === "bend-remove-point") removePoint(Number(target.dataset.bendPointIndex));
    else if (target.dataset.action === "bend-reset-curve") reset();
    else if (target.dataset.action === "bend-apply-curve") apply();
  });

  rerender();
  return Object.freeze({ load, reset });
}
