const SVG_NS = "http://www.w3.org/2000/svg";
const RANGE_VALUES = [1, 2, 3, 4];

function svg(name, attrs = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
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
  next.splice(bestIndex + 1, 0, {
    position: Number(((left.position + right.position) / 2).toFixed(3)),
    semitones: left.semitones
  });
  return next;
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

  function currentRange() {
    const value = Number(rangeSelect.value);
    return RANGE_VALUES.includes(value) ? value : 2;
  }

  function drawPreview() {
    preview.replaceChildren();
    const width = 320;
    const height = 120;
    const padX = 16;
    const padY = 14;
    const graphWidth = width - padX * 2;
    const graphHeight = height - padY * 2;
    const range = currentRange();
    const x = (position) => padX + position * graphWidth;
    const y = (semitones) => padY + ((range - semitones) / (range * 2)) * graphHeight;

    for (let value = -range; value <= range; value += 1) {
      preview.append(svg("line", {
        x1: padX, x2: width - padX, y1: y(value), y2: y(value),
        class: value === 0 ? "bend-guide bend-zero" : "bend-guide"
      }));
      const label = svg("text", {
        x: 2, y: y(value) + 3, class: "bend-guide-label"
      });
      label.textContent = formatBendUnits(value);
      preview.append(label);
    }

    const points = draft.map((point) => `${x(point.position)},${y(point.semitones)}`).join(" ");
    preview.append(svg("polyline", { points, class: "bend-preview-line" }));
    draft.forEach((point, index) => {
      preview.append(svg("circle", {
        cx: x(point.position), cy: y(point.semitones), r: index === 0 || index === draft.length - 1 ? 4 : 5,
        class: "bend-preview-point"
      }));
    });
  }

  function renderRows() {
    list.replaceChildren();
    const range = currentRange();
    draft.forEach((point, index) => {
      const row = document.createElement("div");
      row.className = "bend-point-row";
      row.dataset.bendPointIndex = String(index);

      const timeLabel = document.createElement("label");
      const timeCaption = document.createElement("span");
      timeCaption.textContent = translate("bendPointTimeLabel");
      const time = document.createElement("input");
      time.type = "number";
      time.min = "0";
      time.max = "100";
      time.step = "5";
      time.value = String(Math.round(point.position * 100));
      time.dataset.action = "bend-point-time";
      time.dataset.bendPointIndex = String(index);
      time.disabled = index === 0 || index === draft.length - 1;
      timeLabel.append(timeCaption, time);

      const pitchLabel = document.createElement("label");
      const pitchCaption = document.createElement("span");
      pitchCaption.textContent = translate("bendPointPitchLabel");
      const pitch = document.createElement("select");
      pitch.dataset.action = "bend-point-pitch";
      pitch.dataset.bendPointIndex = String(index);
      makePitchOptions(pitch, range, point.semitones);
      pitchLabel.append(pitchCaption, pitch);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary bend-point-remove";
      remove.dataset.action = "bend-remove-point";
      remove.dataset.bendPointIndex = String(index);
      remove.textContent = "×";
      remove.setAttribute("aria-label", translate("bendRemovePointButton"));
      remove.disabled = index === 0 || index === draft.length - 1;

      row.append(timeLabel, pitchLabel, remove);
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
    }
    rerender();
  }

  function changeTime(index, percent) {
    if (index <= 0 || index >= draft.length - 1) return;
    const lower = draft[index - 1].position + 0.01;
    const upper = draft[index + 1].position - 0.01;
    const next = Math.min(upper, Math.max(lower, percent / 100));
    draft[index].position = Number(next.toFixed(3));
    dirty = true;
    rerender();
  }

  function changePitch(index, semitones) {
    if (index < 0 || index >= draft.length) return;
    draft[index].semitones = Math.max(-currentRange(), Math.min(currentRange(), semitones));
    dirty = true;
    rerender();
  }

  function addPoint() {
    draft = insertBendPoint(draft);
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
      semitones: Math.max(-range, Math.min(range, point.semitones))
    }));
    dirty = true;
    rerender();
  }

  function apply() {
    if (selectedCount !== 1 || !noteId) return false;
    const points = normalizeBendDraft(draft).map((point) => ({
      position: Number(point.position.toFixed(3)),
      semitones: Number(point.semitones)
    }));
    const bend = points.every((point) => point.semitones === 0) ? null : points;
    onApply(noteId, bend);
    canonicalSignature = pointSignature(bend);
    dirty = false;
    rerender();
    return true;
  }

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
