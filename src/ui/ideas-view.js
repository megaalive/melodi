/**
 * I1: view tab Ide. Tangkap ide dengan keyboard, mouse, atau sentuh; rekam
 * take memakai jam audio; take tetap di memori sampai user menekan Pakai.
 */
import { PPQ } from "../core/model.js?v=20261003.87";
import {
  BLACK_KEY_ROWS,
  KEYBOARD_OCTAVE_LOW,
  QUANTIZE_MODES,
  TAKE_LIMIT,
  WHITE_KEY_ROWS,
  createTake,
  gridTicksFor,
  keyboardDisabled,
  keyToPitch,
  quantizeTake
} from "./ideas.js?v=20261003.87";

const OCTAVE_MIN = 0;
const OCTAVE_MAX = 4;
const PREVIEW_LIMIT = 16;

const NOTE_NAMES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);

// Posisi tombol hitam dalam baris sembilan tombol putih: setelah C, E, F, G, B.
const BLACK_KEY_SLOTS = Object.freeze([1, 2, 3, 4, 6]);

export function quantizeLabelKey(mode) {
  if (mode === "off") return "ideasQuantizeOff";
  if (mode === "strict") return "ideasQuantizeStrict";
  return "ideasQuantizeLight";
}

export function noteName(pitch) {
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function createIdeasView({ root, commands, translate, getPlayer }) {
  const state = {
    octave: 2,
    recording: false,
    countIn: true,
    quantize: "light",
    snap: "1/8",
takes: [],
    ideas: null,
    savedIdeaId: null,
    variations: null,
    events: [],
    openPitch: null,
    openAt: 0,
    countInUntil: 0,
    paletteOpen: false
  };

  let onChange = () => {};

  function audio() {
    return getPlayer?.() ?? null;
  }

  function song() {
    return commands.peekSong();
  }

  function secondsPerTick() {
    return 60 / (PPQ * song().timing.tempo);
  }

  function barTicks() {
    const { numerator, denominator } = song().timing.timeSignature;
    return PPQ * 4 * (numerator / denominator);
  }

  function now() {
    return audio().now?.() ?? 0;
  }

  function emit() {
    onChange();
  }

  function noteOn(pitch) {
    audio().noteOn?.(pitch, 100);
    if (state.recording !== true) {
      state.openPitch = pitch;
      emit();
      return;
    }
    if (state.openPitch !== null) noteOff();
    state.openPitch = pitch;
    state.openAt = now();
    emit();
  }

  function noteOff() {
    if (state.openPitch === null) return;
    const pitch = state.openPitch;
    const at = now();
    state.openPitch = null;
    audio().noteOff?.(pitch);
    if (state.recording === true) {
      const secondsPerTickValue = secondsPerTick();
      const startTick = Math.round((state.openAt - state.startedAt) / secondsPerTickValue);
      const durationTicks = Math.max(1, Math.round((at - state.openAt) / secondsPerTickValue));
      state.events.push({ pitch, startTick: Math.max(0, startTick), durationTicks });
    }
    emit();
  }

  function scheduleCountIn() {
    if (!state.countIn) {
      state.recording = true;
      state.startedAt = now();
      return;
    }
    const step = PPQ;
    const total = barTicks();
    const start = now();
    for (let tick = 0; tick < total; tick += step) {
      audio().click?.(start + tick * secondsPerTick(), tick % (PPQ * 4) === 0);
    }
    state.recording = "countin";
    state.countInUntil = start + total * secondsPerTick();
    state.startedAt = state.countInUntil;
  }

  function startRecording() {
    if (state.recording) return false;
    state.events = [];
    state.openPitch = null;
    scheduleCountIn();
    emit();
    return true;
  }

  function stopRecording() {
    if (!state.recording) return null;
    if (state.recording === "countin") {
      state.recording = false;
      emit();
      return null;
    }
    if (state.openPitch !== null) {
      state.events.push({ pitch: state.openPitch, startTick: 0, durationTicks: gridTicksFor(state.snap) });
      state.openPitch = null;
    }
    const notes = quantizeTake(state.events, { quantize: state.quantize, snap: state.snap });
    state.recording = false;
    state.events = [];
    if (notes.length === 0) {
      emit();
      return null;
    }
    const take = createTake({
      id: `take-${notes.length}-${song().id}`,
      notes,
      quantize: state.quantize,
      tempo: song().timing.tempo,
      key: song().key
    });
    state.takes = [take, ...state.takes.filter((item) => item.id !== take.id)].slice(0, TAKE_LIMIT);
    emit();
    return take;
  }

  function commitTake(take) {
    if (!take) return null;
    return commands.commitTake({ notes: take.notes, insertAtTick: null });
  }

function discardTake(take) {
    if (state.variations?.takeId === take.id) state.variations = null;
    state.takes = state.takes.filter((item) => item.id !== take.id);
    emit();
  }

  function playTake(take) {
    const notes = take.notes.slice(0, PREVIEW_LIMIT);
    const result = audio().playPreview?.(notes, { tempo: take.tempo || song().timing.tempo });
    if (result && typeof result.catch === "function") result.catch(() => {});
  }

  function pressKey(key) {
    const lower = String(key).toLowerCase();
    if (lower === "z") return shiftOctave(-1);
    if (lower === "x") return shiftOctave(1);
    const pitch = keyToPitch(lower, state.octave);
    if (pitch === null) return false;
    noteOn(pitch);
    return true;
  }

  function releaseKey(key) {
    const lower = String(key).toLowerCase();
    if (lower === "z" || lower === "x") return true;
    if (keyToPitch(lower, state.octave) === null) return false;
    noteOff();
    return true;
  }

  function shiftOctave(delta) {
    state.octave = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, state.octave + delta));
    emit();
    return true;
  }

  function setOctave(value) {
    state.octave = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, Math.round(Number(value) || 0)));
    emit();
  }

  function setQuantize(value) {
    if (!QUANTIZE_MODES.includes(value)) return;
    state.quantize = value;
    emit();
  }

  function setSnap(value) {
    state.snap = value;
    emit();
  }

  function setCountIn(enabled) {
    state.countIn = Boolean(enabled);
    emit();
  }

  function setPaletteOpen(open) {
    state.paletteOpen = Boolean(open);
  }

  function keyboardActive(target) {
    return !keyboardDisabled(target, state.paletteOpen);
  }


  function button(label, action, handler, extra = {}) {
    const element = document.createElement("button");
    element.type = "button";
    element.dataset.action = action;
    element.dataset.copy = label;
    element.textContent = translate(label);
    for (const [key, value] of Object.entries(extra)) element.dataset[key] = String(value);
    element.addEventListener("click", handler);
    return element;
  }

function variationKindLabel(kind) {
  if (kind === "passing") return "ideasVariationPassing";
  if (kind === "syncopation") return "ideasVariationSyncopation";
  if (kind === "register") return "ideasVariationRegister";
  return "ideasVariationRecorded";
}

function developTake(take, seed) {
  const result = commands.developTake({ notes: take.notes, count: undefined, seed });
  state.variations = { takeId: take.id, seed: result.seed, candidates: result.candidates };
  emit();
  return state.variations;
}

function reseedTake(take) {
  const current = state.variations?.takeId === take.id ? state.variations.seed : 0;
  return developTake(take, (current + 1) >>> 0);
}

function playVariation(candidate) {
  const result = audio()?.playPreview?.(candidate.notes.slice(0, PREVIEW_LIMIT), { tempo: song().timing.tempo });
  if (result && typeof result.catch === "function") result.catch(() => {});
}

function acceptVariation(candidate) {
  if (state.recording) stopRecording();
  return commands.commitTake({ notes: candidate.notes.map(note => ({ ...note })), insertAtTick: null });
}

function saveToBoard(notes, source = "take") {
    const idea = commands.saveIdea({ notes: notes.map(note => ({ ...note })), title: null, source });
    state.ideas = commands.listIdeas();
    state.savedIdeaId = idea.id;
    emit();
    return idea;
  }

  function loadIdea(idea) {
    if (state.recording) stopRecording();
    return commands.commitTake({ notes: idea.notes.map(note => ({ ...note })), insertAtTick: null });
  }

  function removeIdea(idea) {
    commands.deleteIdea(idea.id);
    state.ideas = commands.listIdeas();
    if (state.savedIdeaId === idea.id) state.savedIdeaId = null;
    emit();
  }

  function renderBoard() {
    const host = root?.querySelector('[data-entity="ideas-ideas"]');
    const empty = root?.querySelector('[data-entity="ideas-board-empty"]');
    const section = root?.querySelector('[data-entity="ideas-board"]');
    if (!host || !section) return;
    const ideas = state.ideas?.ideas ?? [];
    section.dataset.count = String(ideas.length);
    host.dataset.count = String(ideas.length);
    host.replaceChildren(...ideas.map(renderIdeaRow));
    if (empty) {
      empty.hidden = ideas.length > 0;
      empty.textContent = translate("ideasBoardEmpty");
    }
  }

  function renderIdeaRow(idea) {
    const row = document.createElement("li");
    row.className = "ideas-idea";
    row.dataset.entity = "ideas-idea";
    row.dataset.ideaId = idea.id;
    row.dataset.noteCount = String(idea.notes.length);
    row.dataset.source = idea.source;
    if (idea.id === state.savedIdeaId) row.dataset.saved = "true";
    const title = document.createElement("strong");
    title.textContent = translate("ideasTakeTitle", { count: idea.notes.length });
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = idea.source === "variation"
      ? translate("ideasVariationPassing")
      : translate("ideasVariationRecorded");
    const actions = document.createElement("div");
    actions.className = "ideas-take-actions";
    actions.append(
      button("ideasPlay", "ideas-idea-play", () => playVariation({ notes: idea.notes })),
      button("ideasBoardLoad", "ideas-idea-load", () => loadIdea(idea)),
      button("ideasDiscard", "ideas-idea-remove", () => removeIdea(idea))
    );
    row.append(title, meta, actions);
    return row;
  }

  function renderVariations() {
  const host = root?.querySelector('[data-entity="ideas-variations"]');
  if (!host) return null;
  const data = state.variations;
  host.dataset.open = String(Boolean(data));
  host.dataset.seed = data ? String(data.seed) : "";
  host.replaceChildren();
  if (!data) return null;
  const head = document.createElement("div");
  head.className = "ideas-variations-head";
  head.textContent = translate("ideasVariationSeed", { seed: data.seed });
  const strip = document.createElement("div");
  strip.className = "ideas-variations-strip";
  strip.setAttribute("role", "group");
  strip.setAttribute("aria-label", translate("ideasVariationsHeading"));
  for (const candidate of data.candidates) {
    const card = document.createElement("div");
    card.className = "ideas-variation";
    card.dataset.entity = "ideas-variation";
    card.dataset.variationId = candidate.id;
    card.dataset.kind = candidate.kind;
    card.dataset.noteCount = String(candidate.notes.length);
    const name = document.createElement("strong");
    name.textContent = translate(variationKindLabel(candidate.kind));
    const count = document.createElement("span");
    count.className = "muted";
    count.textContent = translate("ideasTakeTitle", { count: candidate.notes.length });
    const row = document.createElement("div");
    row.className = "ideas-take-actions";
    row.append(
      button("ideasPlay", "ideas-variation-play", () => playVariation(candidate)),
      button("ideasUse", "ideas-variation-use", () => acceptVariation(candidate)),
      button("ideasSaveBoard", "ideas-variation-save", () => saveToBoard(candidate.notes, "variation"))
    );
    card.append(name, count, row);
    strip.append(card);
  }
  const reseed = button("ideasVariationReseed", "ideas-variation-reseed", () => {
    const take = state.takes.find(item => item.id === data.takeId);
    if (take) reseedTake(take);
  });
  reseed.classList.add("secondary");
  head.append(reseed);
  host.append(head, strip);
  return host;
}

function renderTakeRow(take) {
    const row = document.createElement("li");
    row.className = "ideas-take";
    row.dataset.entity = "ideas-take";
    row.dataset.takeId = take.id;
    row.dataset.noteCount = String(take.noteCount);
    const title = document.createElement("strong");
    title.textContent = translate("ideasTakeTitle", { count: take.noteCount });
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = `${take.key} · ${take.tempo} BPM · ${translate(quantizeLabelKey(take.quantize))}`;
    const actions = document.createElement("div");
    actions.className = "ideas-take-actions";
    actions.append(
      button("ideasPlay", "ideas-play", () => playTake(take)),
      button("ideasDevelop", "ideas-develop", () => developTake(take)),
      button("ideasUse", "ideas-use", () => commitTake(take)),
      button("ideasSaveBoard", "ideas-take-save", () => saveToBoard(take.notes, "take")),
      button("ideasDiscard", "ideas-discard", () => discardTake(take))
    );
    row.append(title, meta, actions);
    return row;
  }

  function renderKeyboard() {
    const board = root?.querySelector('[data-entity="ideas-keyboard"]');
    if (!board) return;
    const base = KEYBOARD_OCTAVE_LOW + state.octave * 12;
    if (board.dataset.octave === String(state.octave)) return;
    board.dataset.octave = String(state.octave);
    const whites = WHITE_KEY_ROWS.map(([key, offset]) => ({ key, pitch: base + offset }));
    const blacks = BLACK_KEY_ROWS.map(([key, offset]) => ({ key, pitch: base + offset }));
    // Baris keyboard hanya boleh memakai aria-label: elemen[data-copy] ditulis
    // ulang oleh sinkronisasi i18n dan akan menghapus tombol di dalamnya.
    const whiteRow = document.createElement("div");
    whiteRow.className = "ideas-keyboard-white";
    whiteRow.setAttribute("role", "group");
    whiteRow.setAttribute("aria-label", translate("ideasKeyboardWhite"));
    const blackRow = document.createElement("div");
    blackRow.className = "ideas-keyboard-black";
    blackRow.setAttribute("role", "group");
    blackRow.setAttribute("aria-label", translate("ideasKeyboardBlack"));
    const label = document.createElement("span");
    label.className = "ideas-keyboard-label";
    label.textContent = `${noteName(base)}-${noteName(base + 12)}`;
    for (const entry of whites) {
      const key = document.createElement("button");
      key.type = "button";
      key.className = "ideas-key ideas-key-white";
      key.dataset.entity = `ideas-key-${entry.pitch}`;
      key.dataset.pitch = String(entry.pitch);
      key.dataset.hotkey = entry.key.toUpperCase();
      key.setAttribute("aria-label", noteName(entry.pitch));
key.append(keyLabel(noteName(entry.pitch)));
      whiteRow.append(key);
    }
    // Tombol hitam duduk di antara tombol putih, bukan di baris terpisah.
    for (const [index, entry] of blacks.entries()) {
      const key = document.createElement("button");
      key.type = "button";
      key.className = "ideas-key ideas-key-black";
      key.dataset.entity = `ideas-key-${entry.pitch}`;
      key.dataset.pitch = String(entry.pitch);
      key.dataset.hotkey = entry.key.toUpperCase();
      key.dataset.slot = String(BLACK_KEY_SLOTS[index]);
      key.setAttribute("aria-label", noteName(entry.pitch));
key.append(keyLabel(entry.key.toUpperCase()));
      blackRow.append(key);
    }
    const hint = document.createElement("p");
    hint.className = "ideas-keyboard-hint";
    hint.textContent = translate("ideasKeyboardHint");
    whiteRow.append(blackRow);
    board.replaceChildren(label, whiteRow, hint);
  }

  function keyLabel(text) {
    const label = document.createElement("span");
    label.className = "ideas-key-label";
    label.textContent = text;
    return label;
  }

  function suspend() {
    if (state.openPitch !== null) noteOff();
    if (state.recording) stopRecording();
  }

  function render({ visible = true } = {}) {
    if (!root) return;
    if (!visible) {
      suspend();
      return;
    }
    const current = song();
    const grid = gridTicksFor(state.snap);
    const remaining = state.recording === "countin" ? Math.max(0, state.countInUntil - now()) : 0;
renderKeyboard();
    root.dataset.variationCount = String(state.variations?.candidates.length ?? 0);
    root.dataset.variationSeed = state.variations ? String(state.variations.seed) : "";
    root.dataset.recording = String(state.recording === true);
    root.dataset.countIn = String(state.recording === "countin");
    root.dataset.takeCount = String(state.takes.length);
    root.dataset.octave = String(state.octave);
    root.dataset.quantize = state.quantize;
    root.dataset.snap = state.snap;
    root.dataset.gridTicks = String(grid);

    const recordButton = root.querySelector('[data-action="ideas-record"]');
    if (recordButton) {
      recordButton.dataset.state = state.recording ? "stop" : "record";
      recordButton.setAttribute("aria-pressed", String(Boolean(state.recording)));
      recordButton.textContent = translate(state.recording ? "ideasStop" : "ideasRecord");
    }
    const status = root.querySelector('[data-entity="ideas-status"]');
    if (status) {
      status.textContent = state.recording === "countin"
        ? translate("ideasCountIn", { seconds: remaining.toFixed(1) })
        : state.recording
          ? translate("ideasRecording")
          : translate("ideasIdle", { count: state.events.length });
    }
    const readout = root.querySelector('[data-entity="ideas-readout"]');
    if (readout) readout.textContent = state.openPitch === null ? "" : noteName(state.openPitch);
    const tempoOut = root.querySelector('[data-entity="ideas-tempo"]');
    if (tempoOut) tempoOut.textContent = String(current.timing.tempo);
    const octaveOut = root.querySelector('[data-entity="ideas-octave"]');
    if (octaveOut) octaveOut.textContent = String(state.octave + 1);
    const quantizeSelect = root.querySelector('[data-action="ideas-quantize"]');
    if (quantizeSelect && quantizeSelect.value !== state.quantize) quantizeSelect.value = state.quantize;
    const snapSelect = root.querySelector('[data-action="ideas-snap"]');
    if (snapSelect && snapSelect.value !== state.snap) snapSelect.value = state.snap;
    const countInToggle = root.querySelector('[data-action="ideas-count-in"]');
    if (countInToggle) countInToggle.checked = state.countIn;

    for (const key of root.querySelectorAll("[data-entity^='ideas-key-']")) {
      const active = state.openPitch === Number(key.dataset.pitch);
      key.setAttribute("aria-pressed", String(active));
      key.dataset.active = String(active);
    }

const list = root.querySelector('[data-entity="ideas-takes"]');
    if (list) {
      list.replaceChildren(...state.takes.map(renderTakeRow));
      list.dataset.count = String(state.takes.length);
    }
    renderVariations();
    renderBoard();
  }

  function bind() {
    if (!root) return;
    root.addEventListener("pointerdown", event => {
      const key = event.target.closest?.("[data-entity^='ideas-key-']");
      if (!key) return;
      event.preventDefault();
      try { root.setPointerCapture?.(event.pointerId); } catch {}
      noteOn(Number(key.dataset.pitch));
    });
    root.addEventListener("pointerup", () => noteOff());
    root.addEventListener("pointercancel", () => noteOff());
    root.addEventListener("keydown", event => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!keyboardActive(event.target)) return;
      if (pressKey(event.key)) event.preventDefault();
    });
    root.addEventListener("keyup", event => {
      if (!keyboardActive(event.target)) return;
      if (releaseKey(event.key)) event.preventDefault();
    });
    root.addEventListener("change", event => {
      const action = event.target.dataset?.action;
      if (action === "ideas-quantize") setQuantize(event.target.value);
      if (action === "ideas-snap") setSnap(event.target.value);
      if (action === "ideas-octave") setOctave(event.target.value);
      if (action === "ideas-count-in") setCountIn(event.target.checked);
    });
    root.addEventListener("click", event => {
      const action = event.target.closest?.("[data-action]")?.dataset.action;
      if (action === "ideas-record") {
        if (state.recording) stopRecording();
        else startRecording();
      }
    });
  }

  bind();

return {
    state,
    render,
    emit,
    onChange(handler) { onChange = handler; },
    saveToBoard,
    loadIdea,
    removeIdea,
    startRecording,
    stopRecording,
    suspend,
commitTake,
    developTake,
    reseedTake,
    playVariation,
    acceptVariation,
    variationKindLabel,
    discardTake,
    playTake,
    noteOn,
    noteOff,
    pressKey,
    releaseKey,
    shiftOctave,
    setOctave,
    setQuantize,
    setSnap,
    setCountIn,
    setPaletteOpen,
    keyboardActive,
    keyboardRows: { white: WHITE_KEY_ROWS, black: BLACK_KEY_ROWS },
    basePitch: KEYBOARD_OCTAVE_LOW,
    gridTicks: () => gridTicksFor(state.snap),
    secondsPerTick
  };
}