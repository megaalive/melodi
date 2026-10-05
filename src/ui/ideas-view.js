/**
 * I1: view tab Ide. Tangkap ide dengan keyboard, mouse, atau sentuh; rekam
 * take memakai jam audio; take tetap di memori sampai user menekan Pakai.
 *
 * I2: satu take bisa dikembangkan jadi variasi atau dilanjutkan jadi frasa
 * berikutnya. Kedua arah hanya membaca take, jadi setiap kandidat bisa
 * didengar, dibandingkan A/B, dan baru masuk lagu lewat satu Terima.
 *
 * D3: waktu rekam dikurangi kompensasi latensi supaya nada yang ditekan tepat
 * pada klik metronom terekam pada tick yang sama dengan kliknya.
 */
import { PPQ } from "../core/model.js?v=20261003.92";
import {
  KEYBOARD_BLACK_COUNT,
  KEYBOARD_DEFAULT_OCTAVE,
  KEYBOARD_MAX_OCTAVE,
  KEYBOARD_MIN_OCTAVE,
  QUANTIZE_MODES,
  TAKE_LIMIT,
  KEYBOARD_WHITE_COUNT,
  contourGeometry,
  createTake,
  gridTicksFor,
  keyboardBaseFor,
  keyboardDisabled,
  keyboardRangeFor,
  keyboardRows,
  keyToPitch,
  quantizeTake
} from "./ideas.js?v=20261003.92";
import {
  LATENCY_STEP_MS,
  latencySeconds,
  normalizeRecordingPreferences,
  readRecordingPreferences,
  stepLatency,
  writeRecordingPreferences
} from "../storage/recording-preferences.js?v=20261003.92";

const PREVIEW_LIMIT = 16;
const COMPARE_SLOTS = 8;

const NOTE_NAMES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);

export function quantizeLabelKey(mode) {
  if (mode === "off") return "ideasQuantizeOff";
  if (mode === "strict") return "ideasQuantizeStrict";
  return "ideasQuantizeLight";
}

export function noteName(pitch) {
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

const CONTINUATION_METHOD_LABELS = Object.freeze({
  sequence: "ideasMethodSequence",
  answer: "ideasMethodAnswer",
  echo: "ideasMethodEcho",
  smooth: "ideasMethodSmooth",
  leaping: "ideasMethodLeaping",
  balanced: "ideasMethodBalanced"
});

export function candidateKindLabel(kind) {
  if (kind === "ornament") return "ideasVariationOrnament";
  if (kind === "inversion") return "ideasVariationInversion";
  if (kind === "sequence") return "ideasVariationSequence";
  if (kind === "rhythm") return "ideasVariationRhythm";
  return "ideasVariationRecorded";
}

/** Kartu variasi memakai jenisnya; kartu lanjutan memakai metodenya. */
export function candidateLabelKey(candidate) {
  if (candidate?.kind !== 'continue') return candidateKindLabel(candidate?.kind);
  return CONTINUATION_METHOD_LABELS[candidate?.meta?.method] ?? 'ideasContinueCandidate';
}

export function sourceLabelKey(source) {
  if (source === "variation") return "ideasIdeaSourceVariation";
  if (source === "continue") return "ideasIdeaSourceContinue";
  return "ideasIdeaSourceTake";
}

/** Potong deretan nada jadi potongan yang muat di playPreview tanpa kehilangan ritme. */
export function previewChunks(notes, limit = PREVIEW_LIMIT) {
  const ordered = [...(Array.isArray(notes) ? notes : [])].sort((left, right) => left.startTick - right.startTick);
  const chunks = [];
  let current = [];
  let previousEnd = null;
  for (const note of ordered) {
    if (current.length >= limit || (previousEnd !== null && note.startTick - previousEnd > 240)) {
      if (current.length > 0) chunks.push(current);
      current = [];
    }
    current.push(note);
    previousEnd = note.startTick + note.durationTicks;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function createIdeasView({ root, commands, translate, getPlayer, storage } = {}) {
  const state = {
    octave: KEYBOARD_DEFAULT_OCTAVE,
    recording: false,
    countIn: true,
    quantize: "light",
    snap: "1/8",
    takes: [],
    ideas: null,
    savedIdeaId: null,
    developed: null,
    activeCandidateId: null,
    compare: { a: null, b: null },
    comparePlaying: false,
    events: [],
    openPitch: null,
    openAt: 0,
    countInUntil: 0,
    paletteOpen: false,
    multiNote: false,
    compensation: readRecordingPreferences(storage)
  };

  let onChange = () => {};
  let compareToken = 0;

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

  /**
   * Jam untuk menulis waktu rekam. Nilai yang ditekan user sudah keluar lewat
   * speaker saat audio context masih berjalan, jadi sisi waktu yang diketik
   * manusia dikurangi latensi; acuan hitung masuk tetap memakai jam audio.
   */
  function heardNow() {
    return now() - compensationSeconds();
  }

  function reportedLatency() {
    return audio()?.outputLatency?.() ?? 0;
  }

  function compensationSeconds() {
    return latencySeconds(state.compensation, reportedLatency());
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
    if (state.openPitch !== null) {
      state.multiNote = true;
      noteOff();
    }
    state.openPitch = pitch;
    state.openAt = heardNow();
    emit();
  }

  function noteOff() {
    if (state.openPitch === null) return;
    const pitch = state.openPitch;
    const at = heardNow();
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
    state.multiNote = false;
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
    if (state.developed?.takeId === take.id) resetDevelopment();
    state.takes = state.takes.filter((item) => item.id !== take.id);
    emit();
  }

  function playTake(take) {
    playSequence(take.notes, song().timing.tempo);
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
    state.octave = Math.max(KEYBOARD_MIN_OCTAVE, Math.min(KEYBOARD_MAX_OCTAVE, state.octave + delta));
    emit();
    return true;
  }

  function setOctave(value) {
    state.octave = Math.max(KEYBOARD_MIN_OCTAVE, Math.min(KEYBOARD_MAX_OCTAVE, Math.round(Number(value) || 0)));
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

  function adjustCompensation(deltaMs) {
    state.compensation = stepLatency(state.compensation, deltaMs);
    writeRecordingPreferences(storage, state.compensation);
    emit();
    return state.compensation.latencyMs;
  }

  function resetCompensation() {
    state.compensation = normalizeRecordingPreferences();
    writeRecordingPreferences(storage, state.compensation);
    emit();
    return state.compensation.latencyMs;
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

  function resetDevelopment() {
    state.developed = null;
    state.activeCandidateId = null;
    state.compare = { a: null, b: null };
    state.comparePlaying = false;
    compareToken += 1;
  }

  function candidates() {
    return state.developed?.candidates ?? [];
  }

  function findCandidate(candidateId) {
    return candidates().find((candidate) => candidate.id === candidateId) ?? null;
  }

  /**
   * Kdevelopmen: satu arah pengembangan untuk satu take. Seed boleh diubah
   * dari luar; tanpa seed, seed diturunkan dari isi take sehingga hasilnya
   * selalu sama untuk take yang sama.
   */
  function developTake(take, { kind = "variation", seed, bars, target } = {}) {
    if (!take) return null;
    const result = commands.ideaDevelop({ kind, notes: take.notes, seed, bars, target });
    resetDevelopment();
    state.developed = {
      takeId: take.id,
      kind: result.kind,
      seed: result.seed,
      gap: result.gap ?? null,
      candidates: result.candidates
    };
    state.activeCandidateId = result.candidates[0]?.id ?? null;
    emit();
    return state.developed;
  }

  function developVariations(take) {
    return developTake(take, { kind: "variation" });
  }

  function developContinuation(take, options) {
    return developTake(take, { kind: "continue", ...options });
  }

  function reseedTake(take) {
    const current = state.developed?.takeId === take.id ? state.developed.seed : 0;
    return developTake(take, { kind: state.developed?.kind ?? "variation", seed: (current + 1) >>> 0 });
  }

  function stopPreview() {
    compareToken += 1;
    state.comparePlaying = false;
    try { audio()?.cancelPreview?.(); } catch {}
  }

  /** playPreview menerima maksimal 16 nada, jadi frasa panjang dipecah per potongan. */
  function playChunks(chunks, index, tempo, token, onEnd) {
    if (token !== compareToken || index >= chunks.length) {
      if (token === compareToken) onEnd?.();
      return;
    }
    const result = audio()?.playPreview?.(chunks[index], {
      tempo,
      onEnded: () => playChunks(chunks, index + 1, tempo, token, onEnd)
    });
    if (result && typeof result.catch === "function") {
      result.catch(() => { if (token === compareToken) onEnd?.(); });
    }
  }

  function playSequence(notes, tempo) {
    stopPreview();
    const chunks = previewChunks(notes);
    if (chunks.length === 0) return false;
    playChunks(chunks, 0, tempo, compareToken, null);
    return true;
  }

  function playVariation(candidate) {
    if (!candidate) return false;
    state.activeCandidateId = candidate.id;
    const started = playSequence(candidate.notes, song().timing.tempo);
    emit();
    return started;
  }

  function toggleComparePick(candidate) {
    if (!candidate) return null;
    if (state.compare.a === candidate.id) {
      state.compare = { a: state.compare.b, b: null };
    } else if (state.compare.b === candidate.id) {
      state.compare = { ...state.compare, b: null };
    } else if (state.compare.a === null) {
      state.compare = { ...state.compare, a: candidate.id };
    } else if (state.compare.b === null) {
      state.compare = { ...state.compare, b: candidate.id };
    } else {
      state.compare = { a: state.compare.b, b: candidate.id };
    }
    state.activeCandidateId = candidate.id;
    emit();
    return state.compare;
  }

  function compareSlot(candidateId) {
    if (!candidateId) return "";
    if (state.compare.a === candidateId) return "a";
    if (state.compare.b === candidateId) return "b";
    return "";
  }

  function hasComparePair() {
    return Boolean(state.compare.a && state.compare.b);
  }

  /** Bandingkan: A diputar penuh, lalu B, lalu A lagi pada loop yang sama. */
  function startCompare() {
    if (!hasComparePair()) return false;
    const first = findCandidate(state.compare.a);
    const second = findCandidate(state.compare.b);
    if (!first || !second) return false;
    stopPreview();
    const token = compareToken;
    state.comparePlaying = true;
    const tempo = song().timing.tempo;
    const cycle = () => {
      if (token !== compareToken) return;
      const loop = () => {
        if (token !== compareToken) return;
        emit();
        cycle();
      };
      emit();
      playChunks(previewChunks(first.notes), 0, tempo, token, () => playChunks(previewChunks(second.notes), 0, tempo, token, loop));
    };
    cycle();
    return true;
  }

  function stopCompare() {
    if (!state.comparePlaying) return false;
    stopPreview();
    emit();
    return true;
  }

  /** Terima satu kandidat: satu commit, satu langkah undo. */
  function acceptCandidate(candidate) {
    if (!candidate) return null;
    if (state.recording) stopRecording();
    stopPreview();
    const notes = [...(candidate.baseNotes ?? []), ...candidate.notes].map((note) => ({ ...note }));
    const committed = notes.length > 0 ? commands.commitTake({ notes, insertAtTick: null }) : null;
    emit();
    return committed;
  }

  function selectCandidateBySlot(slot) {
    const candidate = candidates()[slot - 1];
    if (!candidate) return false;
    playVariation(candidate);
    return true;
  }

  function acceptActiveCandidate() {
    const candidate = findCandidate(state.activeCandidateId) ?? candidates()[0];
    return candidate ? acceptCandidate(candidate) : null;
  }

  function saveToBoard(notes, source = "take") {
    const idea = commands.saveIdea({ notes: notes.map((note) => ({ ...note })), title: null, source });
    state.ideas = commands.listIdeas();
    state.savedIdeaId = idea.id;
    emit();
    return idea;
  }

  function loadIdea(idea) {
    if (state.recording) stopRecording();
    return commands.commitTake({ notes: idea.notes.map((note) => ({ ...note })), insertAtTick: null });
  }

  function removeIdea(idea) {
    commands.deleteIdea(idea.id);
    state.ideas = commands.listIdeas();
    if (state.savedIdeaId === idea.id) state.savedIdeaId = null;
    emit();
  }

  function renameIdea(idea, title) {
    const renamed = commands.renameIdea(idea.id, title);
    state.ideas = commands.listIdeas();
    emit();
    return renamed;
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
    const title = document.createElement("input");
    title.type = "text";
    title.className = "ideas-idea-name";
    title.dataset.action = "ideas-idea-rename";
    title.dataset.ideaId = idea.id;
    title.value = idea.title ?? "";
    title.setAttribute("aria-label", translate("ideasIdeaRename"));
    title.addEventListener("change", () => renameIdea(idea, title.value));
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = `${translate(sourceLabelKey(idea.source))} · ${translate("ideasTakeTitle", { count: idea.notes.length })}`;
    const actions = document.createElement("div");
    actions.className = "ideas-take-actions";
    actions.append(
      button("ideasPlay", "ideas-idea-play", () => playSequence(idea.notes, song().timing.tempo)),
      button("ideasBoardLoad", "ideas-idea-load", () => loadIdea(idea)),
      button("ideasDiscard", "ideas-idea-remove", () => removeIdea(idea))
    );
    row.append(title, meta, actions);
    return row;
  }

  function renderContour(notes) {
    const geometry = contourGeometry(notes);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ideas-contour");
    svg.setAttribute("viewBox", geometry.viewBox);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.dataset.noteCount = String(geometry.noteCount);
    if (geometry.empty) return svg;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", geometry.points);
    svg.append(line);
    return svg;
  }

  function renderCandidateCard(candidate, slot) {
    const card = document.createElement("div");
    card.className = "ideas-variation";
    card.dataset.entity = "ideas-variation";
    card.dataset.variationId = candidate.id;
    card.dataset.kind = candidate.kind;
    card.dataset.noteCount = String(candidate.notes.length);
    card.dataset.slot = String(slot);
    card.dataset.method = candidate.meta?.method ?? '';
    card.dataset.compare = compareSlot(candidate.id);
    if (candidate.id === state.activeCandidateId) card.dataset.active = "true";
    const head = document.createElement("div");
    head.className = "ideas-variation-head";
    const index = document.createElement("span");
    index.className = "ideas-variation-slot";
    index.textContent = String(slot);
    index.setAttribute("aria-label", translate("ideasSlotLabel", { index: slot }));
    const name = document.createElement("strong");
    name.textContent = translate(candidateLabelKey(candidate));
    const count = document.createElement("span");
    count.className = "muted";
    count.textContent = translate("ideasTakeTitle", { count: candidate.notes.length });
    head.append(index, name, count);
    const actions = document.createElement("div");
    actions.className = "ideas-take-actions";
    const pick = button("ideasComparePick", "ideas-compare-pick", () => toggleComparePick(candidate));
    pick.dataset.variationId = candidate.id;
    pick.setAttribute("aria-pressed", String(compareSlot(candidate.id) !== ""));
    actions.append(
      button("ideasPlay", "ideas-variation-play", () => playVariation(candidate)),
      button(candidate.kind === "continue" ? "ideasAccept" : "ideasUse", "ideas-variation-use", () => acceptCandidate(candidate)),
      button("ideasSaveBoard", "ideas-variation-save", () => saveToBoard([...(candidate.baseNotes ?? []), ...candidate.notes], candidate.kind === "continue" ? "continue" : "variation")),
      pick
    );
    card.append(renderContour(candidate.notes), head, actions);
    return card;
  }

  function renderReferenceCard() {
    const data = state.developed;
    const take = data ? state.takes.find((item) => item.id === data.takeId) : null;
    if (!data || !take) return null;
    const card = document.createElement("div");
    card.className = "ideas-variation ideas-variation-reference";
    card.dataset.entity = "ideas-variation-reference";
    card.dataset.kind = "reference";
    card.dataset.noteCount = String(take.notes.length);
    const head = document.createElement("div");
    head.className = "ideas-variation-head";
    const name = document.createElement("strong");
    name.textContent = translate("ideasReferenceCard");
    const count = document.createElement("span");
    count.className = "muted";
    count.textContent = translate("ideasTakeTitle", { count: take.notes.length });
    head.append(name, count);
    const actions = document.createElement("div");
    actions.className = "ideas-take-actions";
    actions.append(
      button("ideasPlay", "ideas-reference-play", () => playTake(take)),
      button("ideasUse", "ideas-reference-use", () => commitTake(take))
    );
    card.append(renderContour(take.notes), head, actions);
    return card;
  }

  function renderDeveloped() {
    const host = root?.querySelector('[data-entity="ideas-variations"]');
    if (!host) return null;
    const data = state.developed;
    host.dataset.open = String(Boolean(data));
    host.dataset.seed = data ? String(data.seed) : "";
    host.dataset.kind = data?.kind ?? "";
    host.dataset.count = String(data?.candidates.length ?? 0);
    host.dataset.compare = String(state.comparePlaying);
    host.replaceChildren();
    if (!data) return null;
    const head = document.createElement("div");
    head.className = "ideas-variations-head";
    const seedLabel = document.createElement("span");
    seedLabel.textContent = translate("ideasVariationSeed", { seed: data.seed });
    const reseed = button("ideasVariationReseed", "ideas-variation-reseed", () => {
      const take = state.takes.find((item) => item.id === data.takeId);
      if (take) reseedTake(take);
    });
    reseed.classList.add("secondary");
    head.append(seedLabel, reseed);

    const strip = document.createElement("div");
    strip.className = "ideas-variations-strip";
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", translate("ideasVariationsHeading"));
    const reference = renderReferenceCard();
    if (reference) strip.append(reference);
    data.candidates.slice(0, COMPARE_SLOTS).forEach((candidate, index) => strip.append(renderCandidateCard(candidate, index + 1)));

    const compare = document.createElement("div");
    compare.className = "ideas-compare";
    const compareButton = button(
      state.comparePlaying ? "ideasCompareStop" : "ideasCompare",
      state.comparePlaying ? "ideas-compare-stop" : "ideas-compare",
      () => (state.comparePlaying ? stopCompare() : startCompare())
    );
    compareButton.disabled = !state.comparePlaying && !hasComparePair();
    const status = document.createElement("span");
    status.className = "muted";
    status.dataset.entity = "ideas-compare-state";
    status.textContent = compareStatusText();
    compare.append(compareButton, status);
    host.append(head, strip, compare);
    if (data.candidates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.dataset.entity = "ideas-candidates-empty";
      empty.textContent = translate("ideasNoCandidates");
      host.append(empty);
    }
    return host;
  }

  function compareStatusText() {
    if (state.comparePlaying) return translate("ideasComparePlaying");
    if (!hasComparePair()) return translate("ideasCompareNeedsTwo");
    const list = candidates();
    const label = (candidateId) => translate(candidateLabelKey(
      list.find((item) => item.id === candidateId) ?? { kind: "recorded" }
    ));
    return translate("ideasCompareState", { a: label(state.compare.a), b: label(state.compare.b) });
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
      button("ideasDevelop", "ideas-develop", () => developVariations(take)),
      button("ideasContinue", "ideas-continue", () => developContinuation(take)),
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
    const base = keyboardBaseFor(state.octave);
    board.dataset.labels = matchMedia("(pointer: fine)").matches ? "qwerty" : "none";
    if (board.dataset.base === String(base)) return;
    board.dataset.base = String(base);
    board.dataset.octave = String(state.octave);
    const rows = keyboardRows(base);
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
    const range = keyboardRangeFor(state.octave);
    label.textContent = `${noteName(range.low)}-${noteName(range.high)}`;
    for (const entry of rows.white) {
      whiteRow.append(keyButton(entry.pitch, entry.hotkey, "ideas-key ideas-key-white"));
    }
    // Tombol hitam duduk di antara tombol putih, bukan di baris terpisah.
    for (const entry of rows.black) {
      const key = keyButton(entry.pitch, entry.hotkey, "ideas-key ideas-key-black");
      key.dataset.slot = String(entry.slot);
      key.style.setProperty("--key-slot", `${entry.slotPercent}%`);
      blackRow.append(key);
    }
    const hint = document.createElement("p");
    hint.className = "ideas-keyboard-hint";
    hint.textContent = translate("ideasKeyboardHint");
    whiteRow.append(blackRow);
    board.replaceChildren(label, whiteRow, hint);
  }

  function keyButton(pitch, hotkey, className) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = className;
    key.dataset.entity = `ideas-key-${pitch}`;
    key.dataset.pitch = String(pitch);
    key.append(keyLabel(noteName(pitch), "ideas-key-note"));
    if (hotkey) {
      key.dataset.hotkey = hotkey.toUpperCase();
      key.append(keyLabel(hotkey.toUpperCase(), "ideas-key-label"));
    }
    key.setAttribute("aria-label", noteName(pitch));
    return key;
  }

  function keyLabel(text, className) {
    const label = document.createElement("span");
    label.className = className;
    label.textContent = text;
    return label;
  }

  function suspend() {
    if (state.openPitch !== null) noteOff();
    if (state.recording) stopRecording();
    stopPreview();
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
    root.dataset.candidateCount = String(candidates().length);
    root.dataset.candidateSeed = state.developed ? String(state.developed.seed) : "";
    root.dataset.developKind = state.developed?.kind ?? "";
    root.dataset.compare = String(state.comparePlaying);
    root.dataset.multiNote = String(state.multiNote);
    root.dataset.recording = String(state.recording === true);
    root.dataset.countIn = String(state.recording === "countin");
    root.dataset.takeCount = String(state.takes.length);
    root.dataset.octave = String(state.octave);
    root.dataset.quantize = state.quantize;
    root.dataset.snap = state.snap;
    root.dataset.gridTicks = String(grid);
    root.dataset.compensation = String(state.compensation.latencyMs ?? "auto");
    root.dataset.latencyMs = String(Math.round(compensationSeconds() * 1000));

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
    if (octaveOut) octaveOut.textContent = noteName(keyboardBaseFor(state.octave));
    const quantizeSelect = root.querySelector('[data-action="ideas-quantize"]');
    if (quantizeSelect && quantizeSelect.value !== state.quantize) quantizeSelect.value = state.quantize;
    const snapSelect = root.querySelector('[data-action="ideas-snap"]');
    if (snapSelect && snapSelect.value !== state.snap) snapSelect.value = state.snap;
    const countInToggle = root.querySelector('[data-action="ideas-count-in"]');
    if (countInToggle) countInToggle.checked = state.countIn;
    const compensationOut = root.querySelector('[data-entity="ideas-compensation"]');
    if (compensationOut) {
      compensationOut.textContent = state.compensation.latencyMs === null
        ? translate("ideasCompensationAutoValue", { ms: Math.round(compensationSeconds() * 1000) })
        : String(state.compensation.latencyMs);
    }

    for (const key of root.querySelectorAll("[data-entity^='ideas-key-']")) {
      const active = state.openPitch === Number(key.dataset.pitch);
      key.setAttribute("aria-pressed", String(active));
      key.dataset.active = String(active);
    }

    const hint = root.querySelector('[data-entity="ideas-empty-hint"]');
    if (hint) hint.hidden = state.takes.length > 0;
    const monoHint = root.querySelector('[data-entity="ideas-mono-hint"]');
    if (monoHint) monoHint.hidden = !state.multiNote;

    const list = root.querySelector('[data-entity="ideas-takes"]');
    if (list) {
      list.replaceChildren(...state.takes.map(renderTakeRow));
      list.dataset.count = String(state.takes.length);
    }
    renderDeveloped();
    renderBoard();
  }

  function onDigitKey(key) {
    const slot = Number(key);
    if (!Number.isSafeInteger(slot) || slot < 1 || slot > COMPARE_SLOTS) return false;
    return selectCandidateBySlot(slot);
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
      if (onDigitKey(event.key)) {
        event.preventDefault();
        return;
      }
      if (event.key === "Enter") {
        const interactive = event.target instanceof Element
          && Boolean(event.target.closest("button, a, input, select, textarea"));
        if (interactive) return;
        acceptActiveCandidate();
        event.preventDefault();
        return;
      }
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
      if (action === "ideas-octave-down") shiftOctave(-1);
      if (action === "ideas-octave-up") shiftOctave(1);
      if (action === "ideas-compensation-less") adjustCompensation(-LATENCY_STEP_MS);
      if (action === "ideas-compensation-more") adjustCompensation(LATENCY_STEP_MS);
      if (action === "ideas-compensation-auto") resetCompensation();
    });
  }

  bind();
// Label QWERTY mengikuti capabilities pointer, jadi perpindahan perangkat
// tetap sinkron tanpa render ulang seluruh panel.
if (typeof matchMedia === "function") {
  matchMedia("(pointer: fine)").addEventListener?.("change", () => render({ visible: true }));
}

  return {
    state,
    render,
    emit,
    onChange(handler) { onChange = handler; },
    saveToBoard,
    loadIdea,
    removeIdea,
    renameIdea,
    startRecording,
    stopRecording,
    suspend,
    commitTake,
    developTake,
    developVariations,
    developContinuation,
    reseedTake,
    playVariation,
    playTake,
    acceptCandidate,
    acceptActiveCandidate,
    candidateKindLabel,
    candidateLabelKey,
    toggleComparePick,
    compareSlot,
    hasComparePair,
    startCompare,
    stopCompare,
    stopPreview,
    selectCandidateBySlot,
    adjustCompensation,
    resetCompensation,
    compensationSeconds,
    discardTake,
    pressKey,
    releaseKey,
    noteOn,
    noteOff,
    shiftOctave,
    setOctave,
    setQuantize,
    setSnap,
    setCountIn,
    setPaletteOpen,
    keyboardActive,
    keyboardRows: () => keyboardRows(keyboardBaseFor(state.octave)),
    keyboardSize: { white: KEYBOARD_WHITE_COUNT, black: KEYBOARD_BLACK_COUNT },
    gridTicks: () => gridTicksFor(state.snap),
    secondsPerTick
  };
}