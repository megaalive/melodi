import { PPQ, createInitialSong, midiToPitch, pitchToMidi } from "./core/model.js";
import { createCommands } from "./core/commands.js";
import { MAX_ROLL_ZOOM, MIN_ROLL_ZOOM, ROLL_ZOOM_STEP, SNAP_TICKS } from "./core/editor.js";
import { normalizePlaybackState, normalizeRuntimeState, VIEW_REGION_MODES } from "./core/runtime-state.js";
import { DEFAULT_LANGUAGE, message } from "./i18n/messages.js";
import { createAudioPlayer } from "./audio/player.js";
import { createPianoRollView } from "./ui/piano-roll.js";
import { createScoreView } from "./ui/score.js";
import { createGuitarView, findGuitarPositions } from "./ui/guitar-view.js";
import { resolveSelectedAnchorGap } from "./ui/generation.js";
import { createPaletteCatalog, filterPaletteEntries, isEntryAvailable } from "./ui/command-palette.js";
import { createDraftPersistence } from "./storage/draft.js";

let language = DEFAULT_LANGUAGE;
let commands;
let rollView;
let scoreView;
let guitarView;
let statusTimer;
let pointerInteractionActive = false;
let lastFollowSyllableId = null;
let contextTarget = null;

const byId = (id) => document.getElementById(id);
const languageSelect = byId("language");
const themeSelect = byId("theme");
const translate = (key, values) => message(language, key, values);

// Berbeda dari bahasa (yang in-memory), pilihan tema disimpan: ini preferensi
// perangkat, dan reset tiap reload terasa seperti bug. Default tetap "system".
const THEME_KEY = "melodi.theme";
const THEMES = new Set(["system", "light", "dark"]);

function safeStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function readStoredTheme() {
  try {
    const stored = safeStorage()?.getItem(THEME_KEY);
    return THEMES.has(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

let theme = readStoredTheme();

function applyTheme() {
  // Tanpa atribut = colour-scheme dari media query, yaitu ikut sistem.
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  if (themeSelect) themeSelect.value = theme;
}

const paletteCatalog = createPaletteCatalog();
const paletteDialog = byId("command-palette");
const paletteInput = byId("command-palette-input");
const paletteList = byId("command-palette-list");
const paletteEmpty = byId("command-palette-empty");
let paletteRows = [];
let paletteActiveIndex = 0;
let paletteReturnFocus = null;

function paletteContext() {
  return { commands, byId, run, runAsync, announce, translate, setTheme, setLanguage };
}

function renderPalette() {
  const state = normalizeRuntimeState(commands.getState());
  const query = paletteInput.value;
  const matches = filterPaletteEntries(paletteCatalog, query, language, translate);
  paletteList.replaceChildren();
  paletteRows = matches.map((item) => {
    const available = isEntryAvailable(item, state);
    const row = document.createElement("li");
    row.className = "palette-row";
    row.id = `palette-row-${item.id}`;
    row.dataset.action = "palette-run";
    row.dataset.paletteId = item.id;
    row.dataset.available = String(available);
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    row.setAttribute("aria-disabled", String(!available));

    const group = document.createElement("span");
    group.className = "palette-row-group";
    group.textContent = translate(`paletteGroup${item.group[0].toUpperCase()}${item.group.slice(1)}`);
    const label = document.createElement("span");
    label.className = "palette-row-label";
    label.textContent = translate(item.labelKey);
    row.append(group, label);
    return { item, row, available };
  });
  paletteList.append(...paletteRows.map((entry) => entry.row));
  paletteEmpty.hidden = paletteRows.length > 0;
  paletteActiveIndex = Math.min(paletteActiveIndex, Math.max(0, paletteRows.length - 1));
  setPaletteActive(paletteActiveIndex, { scroll: false });
}

function setPaletteActive(index, { scroll = true } = {}) {
  paletteActiveIndex = index;
  paletteRows.forEach((entry, position) => {
    const active = position === index;
    entry.row.setAttribute("aria-selected", String(active));
    entry.row.classList.toggle("is-active", active);
  });
  const active = paletteRows[index];
  if (active) {
    paletteInput.setAttribute("aria-activedescendant", active.row.id);
    if (scroll) active.row.scrollIntoView({ block: "nearest" });
  } else {
    paletteInput.removeAttribute("aria-activedescendant");
  }
}

function movePaletteActive(delta) {
  if (paletteRows.length === 0) return;
  const next = (paletteActiveIndex + delta + paletteRows.length) % paletteRows.length;
  setPaletteActive(next);
}

function runPaletteEntry(id) {
  const entry = paletteRows.find((item) => item.item.id === id);
  if (!entry || !entry.available) return false;
  const item = entry.item;
  closePalette();
  try {
    item.perform(paletteContext());
  } catch (error) {
    reportError(error);
  }
  return true;
}

function openPalette() {
  if (!paletteDialog || paletteDialog.open) return;
  paletteReturnFocus = document.activeElement;
  paletteInput.value = "";
  // Placeholder dipasang lewat JS karena data-copy hanya mengisi textContent,
  // dan tanpa placeholder kolom pencarian yang borderless ini terlihat kosong.
  paletteInput.placeholder = translate("paletteSearchLabel");
  paletteActiveIndex = 0;
  renderPalette();
  paletteDialog.showModal();
  paletteInput.focus();
}

function closePalette() {
  if (paletteDialog?.open) paletteDialog.close();
}

paletteDialog?.addEventListener("close", () => {
  // Elemen asal bisa sudah terlepas dari DOM karena perintah yang baru dijalankan
  // memicu render ulang, jadi focuses hanya dilakukan kalau masih terhubung.
  if (paletteReturnFocus instanceof HTMLElement && paletteReturnFocus.isConnected) paletteReturnFocus.focus();
  paletteReturnFocus = null;
});
paletteDialog?.addEventListener("click", (event) => {
  if (event.target === paletteDialog) closePalette();
  const target = event.target;
  if (target.dataset?.action === "palette-run") runPaletteEntry(target.dataset.paletteId);
});
paletteInput?.addEventListener("input", () => {
  paletteActiveIndex = 0;
  renderPalette();
});
paletteInput?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") { event.preventDefault(); movePaletteActive(1); }
  else if (event.key === "ArrowUp") { event.preventDefault(); movePaletteActive(-1); }
  else if (event.key === "Home") { event.preventDefault(); setPaletteActive(0); }
  else if (event.key === "End") { event.preventDefault(); setPaletteActive(paletteRows.length - 1); }
  else if (event.key === "Enter") {
    event.preventDefault();
    const entry = paletteRows[paletteActiveIndex];
    if (entry) runPaletteEntry(entry.item.id);
  }
});

function setTheme(next) {
  if (!THEMES.has(next)) return;
  theme = next;
  try { safeStorage()?.setItem(THEME_KEY, theme); } catch {}
  applyTheme();
}

function setLanguage(next) {
  language = next === "en" ? "en" : DEFAULT_LANGUAGE;
  render();
  announce("languageChanged");
}

applyTheme();

function getR3ViewMarkup() {
  const modeControl = byId("view-mode");
  const followControl = byId("follow-mode");
  const regions = [...document.querySelectorAll("[data-view-region]")];
  const isR3AMarkup = !modeControl && !followControl && regions.length === 0;
  if (isR3AMarkup) return { modeControl: null, followControl: null, regions };

  const regionNames = new Set(regions.map((region) => region.dataset.viewRegion));
  const complete = modeControl && followControl
    && [...Object.keys(VIEW_REGION_MODES)].every((name) => regionNames.has(name));
  if (!complete) throw new Error("Incomplete R3 view markup.");
  return { modeControl, followControl, regions };
}

function copyFocusableElement(key) {
  return [...document.querySelectorAll("[data-focus-key]")].find((element) => element.dataset.focusKey === key);
}

function announce(key, kind = "success", values = {}) {
  const status = byId("operation-status");
  status.dataset.kind = kind;
  status.textContent = translate(key, values);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ""; }, 5000);
}

function reportError(error) {
  const key = `error_${error?.code ?? "default"}`;
  announce(`${translate("operationFailed")}: ${translate(key)}`, "error");
}

function reportNotificationError(error) {
  console.error("Melodi view update failed after canonical state was committed.", error);
}

function run(operation, successKey) {
  let result;
  try {
    result = operation();
  } catch (error) {
    reportError(error);
    return;
  }
  if (successKey) {
    try { announce(successKey); } catch (error) { reportNotificationError(error); }
  }
  return result;
}

function runAsync(operation, successKey, shouldAnnounce = () => true) {
  let result;
  try { result = operation(); } catch (error) { reportError(error); return; }
  Promise.resolve(result).then((value) => {
    if (successKey && shouldAnnounce(value)) announce(successKey);
  }).catch(reportError);
}

function closeNoteContextMenu() {
  const menu = byId("note-context-menu");
  if (!menu) return;
  menu.hidden = true;
  menu.style.left = "";
  menu.style.top = "";
  contextTarget = null;
}

function selectedSongNotes() {
  const selected = new Set(commands?.getSelectedNoteIds?.() ?? []);
  return commands ? commands.getSong().notes.filter((note) => selected.has(note.id)) : [];
}

function ensureContextSelection(detail) {
  if (detail?.kind !== "selection" || !detail.noteId || !commands) return;
  const selected = commands.getSelectedNoteIds();
  if (!selected.includes(detail.noteId)) commands.selectNotes([detail.noteId]);
}

function showNoteContextMenu(detail) {
  const menu = byId("note-context-menu");
  if (!menu || !commands) return;
  closeNoteContextMenu();
  ensureContextSelection(detail);
  contextTarget = { ...detail };

  const selectionGroup = menu.querySelector('[data-context-group="selection"]');
  const emptyGroup = menu.querySelector('[data-context-group="empty"]');
  const isSelection = detail?.kind === "selection";
  selectionGroup.hidden = !isSelection;
  emptyGroup.hidden = isSelection;

  if (isSelection) {
    const notes = selectedSongNotes();
    const allAnchored = notes.length > 0 && notes.every((note) => note.anchor);
    const allLocked = notes.length > 0 && notes.every((note) => note.locked);
    const anchor = byId("context-anchor");
    const lock = byId("context-lock");
    anchor.textContent = translate(allAnchored ? "contextRemoveAnchor" : "contextAnchor");
    anchor.setAttribute("aria-checked", String(allAnchored));
    lock.textContent = translate(allLocked ? "contextUnlock" : "contextLock");
    lock.setAttribute("aria-checked", String(allLocked));
  } else {
    const canPlace = Number.isSafeInteger(detail?.pitch)
      && Number.isSafeInteger(detail?.startTick);
    const add = menu.querySelector('[data-action="context-add-note"]');
    const paste = menu.querySelector('[data-action="context-paste-here"]');
    add.hidden = !canPlace;
    paste.hidden = !canPlace;
    paste.disabled = !commands.getState().editor.canPaste;
  }

  menu.hidden = false;
  const desiredX = Number(detail?.clientX ?? 0);
  const desiredY = Number(detail?.clientY ?? 0);
  menu.style.left = `${Math.max(8, desiredX)}px`;
  menu.style.top = `${Math.max(8, desiredY)}px`;
  requestAnimationFrame(() => {
    if (menu.hidden) return;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(desiredX, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(desiredY, window.innerHeight - rect.height - 8))}px`;
  });
}

function updateSelectedNotes(patchFactory) {
  const notes = selectedSongNotes();
  if (!notes.length) return [];
  return commands.updateNotes(notes.map((note) => ({ noteId: note.id, patch: patchFactory(note) })));
}

function transposeSelectedNotes(delta) {
  if (!Number.isInteger(delta) || delta === 0) return [];
  return updateSelectedNotes((note) => ({ pitch: note.pitch + delta }));
}

function setSelectedDuration(durationTicks) {
  if (!Number.isSafeInteger(durationTicks) || durationTicks <= 0) return [];
  return updateSelectedNotes(() => ({ durationTicks }));
}

function bendPreset(name) {
  if (name === "half") return [
    { position: 0, semitones: 0 },
    { position: 0.3, semitones: 1 },
    { position: 1, semitones: 1 }
  ];
  if (name === "whole") return [
    { position: 0, semitones: 0 },
    { position: 0.3, semitones: 2 },
    { position: 1, semitones: 2 }
  ];
  if (name === "whole-release") return [
    { position: 0, semitones: 0 },
    { position: 0.22, semitones: 2 },
    { position: 0.62, semitones: 2 },
    { position: 1, semitones: 0 }
  ];
  if (name === "clear") return null;
  return undefined;
}

function setSelectedBend(name) {
  const preset = bendPreset(name);
  if (preset === undefined) return [];
  return updateSelectedNotes(() => ({ pitchBend: preset }));
}

function moveSelectedNotes(deltaTicks) {
  if (!Number.isSafeInteger(deltaTicks) || deltaTicks === 0) return [];
  const notes = selectedSongNotes();
  if (!notes.length) return [];
  const minimumStart = Math.min(...notes.map((note) => note.startTick));
  const boundedDelta = Math.max(deltaTicks, -minimumStart);
  if (boundedDelta === 0) return notes;
  return commands.updateNotes(notes.map((note) => ({
    noteId: note.id,
    patch: { startTick: note.startTick + boundedDelta }
  })));
}

function deleteSelectedNotes() {
  const ids = [...commands.getSelectedNoteIds()];
  for (const noteId of ids) commands.deleteNote(noteId, { actor: "user" });
  return ids.length;
}

function duplicateSelectedNotes() {
  const notes = selectedSongNotes();
  if (!notes.length) return [];
  const targetTick = Math.max(...notes.map((note) => note.startTick + note.durationTicks));
  commands.copySelection();
  return commands.pasteNotes(targetTick);
}

function setSelectedFlag(flag, value) {
  const notes = selectedSongNotes();
  for (const note of notes) {
    if (flag === "anchor") commands.setAnchor(note.id, value);
    else if (flag === "locked") commands.setLocked(note.id, value);
  }
  return notes.length;
}

function makeButton(text, action, data = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.dataset.action = action;
  for (const [key, value] of Object.entries(data)) button.dataset[key] = String(value);
  return button;
}

function makeInputLabel(text, type, value, name, options = {}) {
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = text;
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.value = String(value);
  if (options.required !== false) input.required = true;
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);
  if (options.pattern !== undefined) input.pattern = options.pattern;
  if (options.action) input.dataset.action = options.action;
  if (options.focusKey) input.dataset.focusKey = options.focusKey;
  label.append(caption, input);
  return label;
}

function makeCheckboxLabel(text, checked, action, data = {}) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.dataset.action = action;
  for (const [key, value] of Object.entries(data)) input.dataset[key] = String(value);
  const caption = document.createElement("span");
  caption.textContent = text;
  label.append(input, caption);
  return label;
}

function renderNotes(song, state) {
  const list = byId("note-list");
  list.replaceChildren();
  const selected = new Set(state.selectedNoteIds);
  const selectedNotes = song.notes.filter((note) => selected.has(note.id));
  if (selectedNotes.length > 1) {
    const item = document.createElement("li");
    item.className = "note-card multi-note-summary";
    item.dataset.entity = "note-selection-summary";
    item.dataset.selected = "true";
    const heading = document.createElement("strong");
    heading.textContent = translate("contextSelectionCount", { count: selectedNotes.length });
    const help = document.createElement("p");
    help.className = "muted";
    help.textContent = translate("multiSelectionHelp");
    item.append(heading, help);
    list.append(item);
    return;
  }
  for (const note of song.notes) {
    const pitch = midiToPitch(note.pitch);
    const item = document.createElement("li");
    item.dataset.entity = "note";
    item.dataset.entityId = note.id;
    item.dataset.source = note.source;
    item.dataset.anchor = String(note.anchor);
    item.dataset.locked = String(note.locked);
    item.dataset.selected = String(selected.has(note.id));
    item.className = "note-card";

    const form = document.createElement("form");
    form.dataset.action = "update-note";
    form.dataset.noteId = note.id;

    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = translate("noteLegend", { pitch, tick: note.startTick });
    fieldset.append(legend);

    const grid = document.createElement("div");
    grid.className = "form-grid note-primary-fields";
    grid.append(
      makeInputLabel(translate("notePitchLabel", { pitch }), "text", pitch, `pitch-${note.id}`, {
        pattern: "[A-Ga-g][#b]?-?[0-9]+", action: "edit-note-pitch", focusKey: `pitch-${note.id}`
      })
    );

    const timing = document.createElement("details");
    timing.className = "note-timing-details";
    const timingSummary = document.createElement("summary");
    timingSummary.textContent = translate("generationAdvanced");
    const timingGrid = document.createElement("div");
    timingGrid.className = "form-grid note-timing-fields";
    timingGrid.append(
      makeInputLabel(translate("noteStartTickLabel", { pitch }), "number", note.startTick, `start-${note.id}`, {
        min: 0, step: 1, action: "edit-note-start", focusKey: `start-${note.id}`
      }),
      makeInputLabel(translate("noteDurationLabel", { pitch }), "number", note.durationTicks, `duration-${note.id}`, {
        min: 1, step: 1, action: "edit-note-duration", focusKey: `duration-${note.id}`
      })
    );
    timing.append(timingSummary, timingGrid);

    const flags = document.createElement("div");
    flags.className = "note-flags";
    flags.append(
      makeCheckboxLabel(translate("anchorLabel"), note.anchor, "set-anchor", { noteId: note.id, focusKey: `anchor-${note.id}` }),
      makeCheckboxLabel(translate("lockedLabel"), note.locked, "set-locked", { noteId: note.id, focusKey: `locked-${note.id}` })
    );

    const actions = document.createElement("div");
    actions.className = "note-actions";
    const save = document.createElement("button");
    save.type = "submit";
    save.dataset.focusKey = `save-${note.id}`;
    save.textContent = translate("saveNoteButton");
    const deleteButton = makeButton(translate("deleteNoteButton"), "delete-note", {
      noteId: note.id,
      focusFallback: "view-mode"
    });
    deleteButton.className = "secondary";
    deleteButton.dataset.focusKey = `delete-${note.id}`;
    const id = document.createElement("span");
    id.className = "entity-id";
    id.textContent = `${translate("noteId")}: ${note.id}`;
    actions.append(
      makeCheckboxLabel(translate("noteSelectLabel", { pitch, tick: note.startTick }), selected.has(note.id), "toggle-note-selection", { noteId: note.id, focusKey: `select-${note.id}` }),
      save,
      deleteButton,
      id
    );

    fieldset.append(grid, flags, actions, timing);
    form.append(fieldset);
    item.append(form);
    list.append(item);
  }
}

function renderSyllables(song, state) {
  const list = byId("syllable-list");
  const currentSyllableIds = normalizePlaybackState(state?.playback).currentSyllableIds;
  list.replaceChildren();
  song.lyrics.syllables.forEach((syllable, index) => {
    const item = document.createElement("li");
    item.dataset.entity = "lyric-syllable";
    item.dataset.entityId = syllable.id;
    item.dataset.text = syllable.text;
    item.dataset.noteIds = JSON.stringify(syllable.noteIds);
    item.dataset.current = String(currentSyllableIds.includes(syllable.id));
    item.className = "syllable-card";

    const form = document.createElement("form");
    form.dataset.action = "update-syllable";
    form.dataset.syllableId = syllable.id;
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = translate("lyricSyllableHeading", { index: index + 1 });
    fieldset.append(legend, makeInputLabel(translate("syllableTextLabel"), "text", syllable.text, "text", {
      required: false, focusKey: `syllable-text-${syllable.id}`
    }));
    const save = document.createElement("button");
    save.type = "submit";
    save.dataset.focusKey = `save-syllable-${syllable.id}`;
    save.textContent = translate("updateSyllableButton");
    form.append(fieldset, save);
    item.append(form);

    const mapping = document.createElement("fieldset");
    mapping.className = "note-selection";
    const mappingLegend = document.createElement("legend");
    mappingLegend.textContent = translate("syllableNotesLabel", { text: syllable.text || "…" });
    mapping.append(mappingLegend);
    const options = document.createElement("div");
    options.className = "syllable-assignment";
    const assigned = syllable.noteIds.map((id) => song.notes.find((note) => note.id === id)).filter(Boolean);
    const assignedIds = new Set(syllable.noteIds);
    const noteOptions = [...assigned, ...song.notes.filter((note) => !assignedIds.has(note.id))];
    for (const note of noteOptions) {
      const text = translate("syllableNoteOption", { pitch: midiToPitch(note.pitch), tick: note.startTick });
      options.append(makeCheckboxLabel(text, syllable.noteIds.includes(note.id), "assign-syllable-note", {
        syllableId: syllable.id,
        noteId: note.id,
        focusKey: `assign-${syllable.id}-${note.id}`
      }));
    }
    mapping.append(options);
    const mappingSummary = document.createElement("p");
    mappingSummary.className = "muted";
    mappingSummary.textContent = syllable.noteIds.length > 1
      ? translate("syllableMelisma", { count: syllable.noteIds.length })
      : syllable.noteIds.length === 0
        ? translate("syllableNoNotes")
        : textForNote(song, syllable.noteIds[0]);
    mapping.append(mappingSummary);
    item.append(mapping);

    const actions = document.createElement("div");
    actions.className = "syllable-actions";
    const earlier = makeButton(translate("moveSyllableEarlier"), "move-syllable", {
      syllableId: syllable.id,
      targetIndex: Math.max(0, index - 1),
      focusKey: `move-earlier-${syllable.id}`,
      focusFallback: `syllable-text-${syllable.id}`
    });
    earlier.disabled = index === 0;
    const later = makeButton(translate("moveSyllableLater"), "move-syllable", {
      syllableId: syllable.id,
      targetIndex: Math.min(song.lyrics.syllables.length - 1, index + 1),
      focusKey: `move-later-${syllable.id}`,
      focusFallback: `syllable-text-${syllable.id}`
    });
    later.disabled = index === song.lyrics.syllables.length - 1;
    const neighbor = song.lyrics.syllables[index - 1] ?? song.lyrics.syllables[index + 1];
    const remove = makeButton(translate("deleteSyllableButton"), "delete-syllable", {
      syllableId: syllable.id,
      focusKey: `delete-syllable-${syllable.id}`,
      focusFallback: neighbor ? `syllable-text-${neighbor.id}` : "new-syllable"
    });
    remove.className = "secondary";
    actions.append(earlier, later, remove);
    if (index + 1 < song.lyrics.syllables.length) {
      actions.append(makeButton(translate("mergeWithNext"), "merge-syllables", {
        leftId: syllable.id,
        rightId: song.lyrics.syllables[index + 1].id,
        focusKey: `merge-syllables-${syllable.id}-${song.lyrics.syllables[index + 1].id}`,
        focusFallback: `syllable-text-${syllable.id}`
      }));
    }
    item.append(actions);

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = translate("splitSyllableSummary");
    const splitHint = document.createElement("p");
    splitHint.className = "muted";
    splitHint.textContent = translate("splitAssignmentOrderHint");
    details.append(summary, splitHint);
    const splitForm = document.createElement("form");
    splitForm.dataset.action = "split-syllable";
    splitForm.dataset.syllableId = syllable.id;
    const splitFields = document.createElement("div");
    splitFields.className = "syllable-split-fields";
    splitFields.append(
      makeInputLabel(translate("splitLeftTextLabel"), "text", syllable.text, "leftText", {
        required: false, focusKey: `split-left-${syllable.id}`
      }),
      makeInputLabel(translate("splitRightTextLabel"), "text", "", "rightText", {
        required: false, focusKey: `split-right-${syllable.id}`
      }),
      makeInputLabel(translate("splitNoteCountLabel"), "number", syllable.noteIds.length, "noteSplitIndex", {
        min: 0, max: syllable.noteIds.length, step: 1, focusKey: `split-count-${syllable.id}`
      })
    );
    const split = document.createElement("button");
    split.type = "submit";
    split.dataset.focusKey = `split-syllable-${syllable.id}`;
    split.dataset.focusFallback = `syllable-text-${syllable.id}`;
    split.textContent = translate("splitSyllableButton");
    splitForm.append(splitFields, split);
    details.append(splitForm);
    item.append(details);
    list.append(item);
  });
}

function textForNote(song, noteId) {
  const note = song.notes.find((item) => item.id === noteId);
  return note ? `${midiToPitch(note.pitch)} · tick ${note.startTick}` : "";
}

function renderEditorControls() {
  if (!commands) return;
  const state = commands.getState();
  const song = commands.getSong();
  byId("snap-select").value = state.editor.snap;
  byId("editor-meter").textContent = `${song.timing.timeSignature.numerator}/${song.timing.timeSignature.denominator}`;
  for (const button of document.querySelectorAll('[data-action="set-tool"]')) {
    const active = button.dataset.tool === state.editor.tool;
    button.setAttribute("aria-pressed", String(active));
    button.dataset.active = String(active);
  }
  byId("piano-roll-scroll").dataset.tool = state.editor.tool;
  byId("paste-notes").disabled = !state.editor.canPaste;
  byId("copy-selection").disabled = state.selectedNoteIds.length === 0;
  byId("clear-selection").disabled = state.selectedNoteIds.length === 0 && !state.selection;
  const zoomControl = byId("roll-zoom");
  if (document.activeElement !== zoomControl) zoomControl.value = String(state.editor.zoom);
  byId("roll-zoom-value").textContent = translate("zoomValue", { percent: Math.round(state.editor.zoom * 100) });
  // Toolbar transpose dan durasi adalah jalur eksplisit; context menu tetap ada
  // sebagai pintasan, bukan satu-satunya jalan (PLAN.md: fungsi penting tidak
  // boleh hanya tersedia lewat context menu).
  for (const button of document.querySelectorAll('[data-action="transpose-selected"], [data-action="set-selected-duration"], [data-action="set-selected-bend"]')) {
    button.disabled = state.selectedNoteIds.length === 0;
  }
  const selectedNotes = song.notes.filter((note) => state.selectedNoteIds.includes(note.id));
  const bendSignature = (note) => JSON.stringify(note.pitchBend ?? null);
  for (const button of document.querySelectorAll('[data-action="set-selected-bend"]')) {
    const preset = bendPreset(button.dataset.bend);
    const targetSignature = JSON.stringify(preset ?? null);
    const active = selectedNotes.length > 0 && selectedNotes.every((note) => bendSignature(note) === targetSignature);
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }
  byId("piano-roll-scroll").setAttribute("aria-label", translate("pianoRollRegionLabel"));
  byId("editor-toolbar")?.setAttribute("aria-label", translate("pianoRollControlsLabel"));
  byId("roll-selection").textContent = state.selectedNoteIds.length
    ? translate("selectedNotesSummary", { count: state.selectedNoteIds.length, ids: state.selectedNoteIds.join(", ") })
    : state.selection
      ? translate("selectionSummary", { start: state.selection.startTick, end: state.selection.endTick, count: state.selection.noteIds.length })
      : translate("noNotesSelected");
}

function renderGeneration(state) {
  const panel = byId("generation-panel");
  if (!panel) return;
  const dock = byId("candidate-dock");
  const form = byId("generation-form");
  const list = byId("generation-candidates");
  const status = byId("generation-status");
  const gapStatus = byId("generation-gap-status");
  const anchorActions = byId("generation-anchor-actions");
  const sessionActions = byId("generation-session-actions");
  const shortcutHelp = panel.querySelector(".shortcut-help");
  const useSelection = panel.querySelector('[data-action="use-selection"]');
  const generate = byId("generate-gap");
  const regenerate = byId("regenerate-gap");
  const clear = byId("clear-generation");
  const lockAccepted = byId("lock-accepted-notes");
  const lockHelp = byId("generation-lock-help");
  const leftAnchorField = byId("generation-left-anchor");
  const rightAnchorField = byId("generation-right-anchor");
  if (!form || !list || !status || !gapStatus || !anchorActions || !sessionActions || !useSelection || !generate || !regenerate || !clear || !lockAccepted || !lockHelp || !leftAnchorField || !rightAnchorField) {
    panel.hidden = false;
    throw new Error("Incomplete R4 generation markup.");
  }
  panel.hidden = false;
  anchorActions.setAttribute("aria-label", translate("generationAnchorGroup"));
  sessionActions.setAttribute("aria-label", translate("generationSessionGroup"));

  const generation = state.generation ?? { status: "idle", candidates: [], acceptedNoteIds: [] };
  const sessionReady = generation.status === "ready" && Array.isArray(generation.candidates);
  const acceptedNoteIds = Array.isArray(generation.acceptedNoteIds) ? generation.acceptedNoteIds : [];
  if (dock) dock.hidden = !sessionReady;
  const fields = {
    "generation-start": generation.gap?.startTick,
    "generation-end": generation.gap?.endTick,
    "generation-seed": generation.seed,
    "generation-style": generation.styleProfile,
    "generation-min-pitch": generation.voiceRange?.minPitch ?? 48,
    "generation-max-pitch": generation.voiceRange?.maxPitch ?? 84,
    "generation-lyric-count": generation.expectedSyllableCount
  };
  if (form.dataset.pending !== "true") {
    for (const [id, value] of Object.entries(fields)) {
      const field = byId(id);
      if (!field) continue;
      if (field instanceof HTMLSelectElement && field.options.length === 0 && id.includes("pitch")) {
        for (let midi = 0; midi <= 127; midi += 1) {
          const option = document.createElement("option");
          option.value = String(midi);
          option.textContent = midiToPitch(midi);
          field.append(option);
        }
      }
      if (value !== null && value !== undefined && document.activeElement !== field) field.value = String(value);
    }
  }

  useSelection.disabled = !state.selection || state.selection.endTick <= state.selection.startTick;
  regenerate.disabled = !sessionReady;
  clear.disabled = !sessionReady && acceptedNoteIds.length === 0;
  sessionActions.hidden = !sessionReady && acceptedNoteIds.length === 0;
  if (shortcutHelp) shortcutHelp.hidden = !sessionReady;
  status.hidden = !sessionReady && acceptedNoteIds.length === 0;
  lockAccepted.hidden = acceptedNoteIds.length === 0;
  lockHelp.hidden = acceptedNoteIds.length === 0;
  if (sessionReady && generation.gap && form.dataset.pending !== "true") {
    form.dataset.gapReady = "true";
    leftAnchorField.value = generation.gap.leftAnchorNoteId ?? "";
    rightAnchorField.value = generation.gap.rightAnchorNoteId ?? "";
  } else if (acceptedNoteIds.length > 0 && form.dataset.pending !== "true") {
    form.dataset.gapReady = "false";
    form.dataset.gapHint = "generationGapAccepted";
  }
  generate.disabled = form.dataset.gapReady !== "true"
    || (sessionReady && generation.stale && form.dataset.pending !== "true");
  gapStatus.textContent = translate(form.dataset.gapHint ?? "generationGapChooseAnchors");
  status.textContent = sessionReady
    ? generation.stale
      ? translate("generationStatusStale")
      : generation.auditionCandidateId
        ? translate("generationStatusAuditioning", { number: generation.candidates.findIndex((candidate) => candidate.id === generation.auditionCandidateId) + 1 })
        : generation.activeCandidateId
          ? translate("generationStatusSelected", { number: generation.candidates.findIndex((candidate) => candidate.id === generation.activeCandidateId) + 1 })
          : translate("generationStatusReady", { count: generation.candidates.length })
    : acceptedNoteIds.length > 0
      ? translate("generationStatusAccepted")
      : translate("generationStatusIdle");

  list.replaceChildren();
  if (!sessionReady) return;
  const song = commands.getSong();
  const leftAnchor = song.notes.find((note) => note.id === generation.gap?.leftAnchorNoteId);
  const rightAnchor = song.notes.find((note) => note.id === generation.gap?.rightAnchorNoteId);
  const scoreKeys = ["tonalFit", "intervalSize", "leapResolution", "singability", "contour", "rhythm", "repetition", "anchorLanding", "lyricFit", "styleFit"];
  generation.candidates.forEach((candidate, index) => {
    const card = document.createElement("li");
    card.className = "generation-candidate-card";
    card.dataset.entity = "melody-candidate";
    card.dataset.entityId = candidate.id;
    card.dataset.candidateNumber = String(index + 1);
    const isActive = generation.activeCandidateId === candidate.id;
    card.dataset.active = String(isActive);
    if (isActive) card.setAttribute("aria-current", "true");

    const heading = document.createElement("h3");
    heading.textContent = translate("candidateHeading", { number: index + 1 });
    if (isActive) {
      const activeLabel = document.createElement("span");
      activeLabel.className = "candidate-active-label";
      activeLabel.textContent = translate("candidateActive");
      heading.append(" ", activeLabel);
    }

    const melody = document.createElement("p");
    melody.className = "candidate-melody";
    const melodyParts = candidate.notes.map((note) => {
      const pitch = midiToPitch(note.pitch);
      const beats = note.durationTicks / song.timing.ppq;
      const rhythm = Math.abs(beats - 0.25) < 0.001 ? "1/16"
        : Math.abs(beats - 0.5) < 0.001 ? "1/8"
          : Math.abs(beats - 0.75) < 0.001 ? "3/16"
            : Math.abs(beats - 1) < 0.001 ? "1/4"
              : Math.abs(beats - 1.5) < 0.001 ? "3/8"
                : Math.abs(beats - 2) < 0.001 ? "1/2"
                  : Math.abs(beats - 3) < 0.001 ? "3/4"
                    : Math.abs(beats - 4) < 0.001 ? "1/1"
                      : `${Number(beats.toFixed(2))} ${translate("candidateBeats")}`;
      return `${pitch} (${rhythm})`;
    });
    if (leftAnchor) melodyParts.unshift(`${midiToPitch(leftAnchor.pitch)} (${translate("candidateAnchorLabel")})`);
    if (rightAnchor) melodyParts.push(`${midiToPitch(rightAnchor.pitch)} (${translate("candidateAnchorLabel")})`);
    const melodyText = melodyParts.join(" → ");
    melody.textContent = melodyText;
    melody.setAttribute("role", "img");
    melody.setAttribute("aria-label", translate("candidateMelodyLabel", { sequence: melodyText }));

    const identifier = document.createElement("p");
    identifier.className = "candidate-id";
    const idLabel = document.createElement("span");
    idLabel.textContent = `${translate("candidateIdLabel")}: `;
    const idCode = document.createElement("code");
    idCode.textContent = candidate.id;
    identifier.append(idLabel, idCode);

    const metadata = candidate.metadata ?? {};
    const summary = document.createElement("p");
    summary.className = "candidate-metadata";
    const pitches = candidate.notes.map((note) => note.pitch);
    const range = pitches.length
      ? `${midiToPitch(Math.min(...pitches))}–${midiToPitch(Math.max(...pitches))}`
      : "—";
    summary.textContent = translate("candidateMetadata", {
      notes: metadata.noteCount ?? candidate.notes?.length ?? 0,
      range
    });
    const score = document.createElement("p");
    score.className = "candidate-score";
    score.textContent = `${translate("candidateScoreLabel")}: ${Number(candidate.score ?? 0).toFixed(2)}`;

    const actions = document.createElement("div");
    actions.className = "candidate-actions";
    const select = makeButton(translate("candidateSelect"), "select-candidate", { candidateId: candidate.id });
    select.setAttribute("aria-pressed", String(isActive));
    select.setAttribute("aria-label", translate("candidateSelectAction", { number: index + 1 }));
    select.dataset.focusKey = `candidate-select-${candidate.id}`;
    const audition = makeButton(translate(generation.auditionCandidateId === candidate.id ? "candidateAuditioning" : "candidateAudition"), "audition-candidate", { candidateId: candidate.id });
    audition.setAttribute("aria-label", translate("candidateAuditionAction", { number: index + 1 }));
    audition.setAttribute("aria-pressed", String(generation.auditionCandidateId === candidate.id));
    audition.setAttribute("aria-keyshortcuts", String(index + 1));
    audition.dataset.focusKey = `candidate-audition-${candidate.id}`;
    const accept = makeButton(translate("candidateAccept"), "accept-candidate", { candidateId: candidate.id });
    accept.setAttribute("aria-label", translate("candidateAcceptAction", { number: index + 1 }));
    accept.setAttribute("aria-keyshortcuts", "Enter");
    accept.dataset.focusKey = `candidate-accept-${candidate.id}`;
    accept.dataset.focusFallback = "lock-accepted-notes";
    select.disabled = Boolean(generation.stale);
    audition.disabled = Boolean(generation.stale);
    accept.disabled = Boolean(generation.stale);
    actions.append(select, audition, accept);

    const details = document.createElement("details");
    const detailsSummary = document.createElement("summary");
    detailsSummary.textContent = translate("candidateScoreDetails");
    const breakdown = document.createElement("dl");
    breakdown.className = "candidate-score-breakdown";
    for (const key of scoreKeys) {
      const term = document.createElement("dt");
      term.textContent = translate(`score${key[0].toUpperCase()}${key.slice(1)}`);
      const value = document.createElement("dd");
      value.textContent = Number(candidate.scoreBreakdown?.[key] ?? 0).toFixed(2);
      breakdown.append(term, value);
    }
    details.append(detailsSummary, identifier, breakdown);
    card.append(heading, melody, actions, summary, score, details);
    list.append(card);
  });
}

function renderPlayback() {
  if (!commands) return;
  const state = normalizeRuntimeState(commands.getState());
  const playback = state.playback;
  const song = commands.getSong();
  const statusKey = {
    stopped: "playbackStopped",
    playing: "playbackPlaying",
    paused: "playbackStatusPaused"
  }[playback.status];
  const note = song.notes.find((item) => item.id === playback.currentNoteId);
  const section = song.sections.find((item) => item.id === playback.currentSectionId);

  byId("playback-status").textContent = translate(statusKey);
  byId("current-tick").textContent = String(playback.currentTick);
  byId("current-note").textContent = note ? midiToPitch(note.pitch) : translate("noCurrentNote");
  byId("current-note").dataset.entityId = note?.id ?? "";
  byId("current-section").textContent = section ? `${section.name} (${section.id})` : translate("noCurrentSection");
  byId("current-section").dataset.entityId = section?.id ?? "";
  byId("play").disabled = playback.status === "playing";
  byId("pause").disabled = playback.status !== "playing";
  byId("undo").disabled = !state.history.canUndo;
  byId("redo").disabled = !state.history.canRedo;

  if (document.activeElement !== byId("seek-tick")) byId("seek-tick").value = String(playback.currentTick);
  if (document.activeElement !== byId("tempo-input")) byId("tempo-input").value = String(playback.tempo);
  if (document.activeElement !== byId("loop-start")) byId("loop-start").value = String(playback.loop.startTick);
  if (document.activeElement !== byId("loop-end")) byId("loop-end").value = String(playback.loop.endTick);
  byId("loop-enabled").checked = playback.loop.enabled;
  const active = document.activeElement;
  const textEntryActive = active instanceof HTMLTextAreaElement
    || (active instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range"].includes(active.type));
  const follow = state.view.follow && playback.status === "playing" && !textEntryActive && !pointerInteractionActive;
  rollView?.updatePlayback(playback, { follow });
  scoreView?.updatePlayback(playback, { ...state.view, follow });
  if (guitarView?.updatePlayback(state)) renderGuitar(state);
  const activeSyllableIds = new Set(playback.currentSyllableIds);
  for (const item of byId("syllable-list").querySelectorAll('[data-entity="lyric-syllable"]')) {
    item.dataset.current = String(activeSyllableIds.has(item.dataset.entityId));
  }
  if (follow && state.view.mode === "lyrics") {
    const syllableId = playback.currentSyllableIds[0] ?? null;
    if (syllableId && syllableId !== lastFollowSyllableId) {
      const item = [...byId("syllable-list").querySelectorAll('[data-entity="lyric-syllable"]')]
        .find((candidate) => candidate.dataset.entityId === syllableId);
      item?.scrollIntoView({ block: "nearest" });
    }
    lastFollowSyllableId = syllableId;
  } else {
    lastFollowSyllableId = null;
  }
}

function render() {
  if (!commands) return;
  const active = document.activeElement;
  const focusKey = active?.dataset?.focusKey;
  const focusFallback = active?.dataset?.focusFallback;
  const selectionStart = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active.selectionStart : null;
  const selectionEnd = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active.selectionEnd : null;
  const pendingFields = [...document.querySelectorAll('form[data-pending="true"] [data-focus-key]')]
    .filter((element) => (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
      && !(element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)))
    .map((element) => [element.dataset.focusKey, element.value]);
  const lyricsFormPending = byId("lyrics-form").dataset.pending === "true" && byId("lyrics-form").dataset.submitting !== "true";
  const rawLyricsDraft = byId("raw-lyrics").value;
  const song = commands.getSong();
  const state = normalizeRuntimeState(commands.getState());
  const viewMarkup = getR3ViewMarkup();

  document.documentElement.lang = language;
  document.querySelectorAll("[data-copy]").forEach((element) => {
    element.textContent = translate(element.dataset.copy);
  });
  document.querySelectorAll("[data-aria-copy]").forEach((element) => {
    const label = translate(element.dataset.ariaCopy);
    element.setAttribute("aria-label", label);
    element.setAttribute("title", label);
  });
  languageSelect.value = language;
  byId("tempo-value").textContent = `${song.timing.tempo} BPM`;
  byId("key-value").textContent = `${song.key} ${song.scale.name}`;
  byId("time-signature-value").textContent = `${song.timing.timeSignature.numerator}/${song.timing.timeSignature.denominator}`;
  byId("song-title").textContent = song.title;
  document.body.dataset.viewMode = state.view.mode;
  if (viewMarkup.modeControl) viewMarkup.modeControl.value = state.view.mode;
  if (viewMarkup.followControl) viewMarkup.followControl.checked = state.view.follow;
  for (const region of viewMarkup.regions) {
    const modes = VIEW_REGION_MODES[region.dataset.viewRegion];
    // Region dengan nama yang tidak dikenal disembunyikan, bukan ditampilkan.
    region.hidden = !modes?.includes(state.view.mode);
  }
  byId("raw-lyrics").value = lyricsFormPending ? rawLyricsDraft : song.lyrics.rawText;
  byId("syllable-summary").textContent = song.lyrics.syllables.length
    ? translate("syllableSummary", { count: song.lyrics.syllables.length })
    : translate("noSyllables");

  const selection = state.selection;
  byId("selection-summary").textContent = selection
    ? translate("selectionSummary", { start: selection.startTick, end: selection.endTick, count: selection.noteIds.length })
    : translate("noSelection");
  byId("add-start-tick").value = String(song.notes.reduce((end, item) => Math.max(end, item.startTick + item.durationTicks), 0));
  renderNotes(song, state);
  renderSyllables(song, state);
  renderEditorControls();
  renderGeneration(state);
  rollView.render(song, state);
  byId("piano-roll-empty").hidden = song.notes.length > 0;
  byId("score-scroll").setAttribute("aria-label", translate("scoreRegionLabel"));
  scoreView.render(song, state);
  renderGuitar(state);

  for (const [key, value] of pendingFields) {
    const target = copyFocusableElement(key);
    if (target && target.form?.dataset.submitting !== "true") {
      target.value = value;
      target.form.dataset.pending = "true";
    }
  }

  if (focusKey) {
    const target = copyFocusableElement(focusKey);
    const targetHidden = target?.hidden || target?.closest("[hidden], details:not([open])");
    if (target && !target.disabled && !targetHidden) {
      target.focus();
      if (selectionStart !== null && typeof target.setSelectionRange === "function") {
        try { target.setSelectionRange(selectionStart, selectionEnd); } catch {}
      }
    } else {
      const fallback = copyFocusableElement(focusFallback);
      if (fallback && !fallback.disabled) fallback.focus();
      else if (focusKey.startsWith("delete-")) copyFocusableElement("add-pitch")?.focus();
    }
  }
  renderPlayback();
}

function hasMeaningfulEdits(song) {
  const starter = createInitialSong((() => { let id = 0; return () => `starter-${++id}`; })());
  if (song.title !== starter.title || song.lyrics.rawText !== "" || song.lyrics.syllables.length !== 0 || song.notes.length !== starter.notes.length) return true;
  return song.notes.some((note, index) => {
    const initial = starter.notes[index];
    return !initial || ["pitch", "startTick", "durationTicks", "source", "anchor", "locked"]
      .some((key) => note[key] !== initial[key]);
  });
}

function shouldConfirmNewIdea() {
  return hasMeaningfulEdits(commands.getSong())
    || [...document.forms].some((form) => form.dataset.pending === "true");
}

let confirmPromise = null;

function confirmInApp() {
  const dialog = byId("confirm-dialog");
  if (!dialog) return Promise.resolve(false);
  if (confirmPromise) return confirmPromise;

  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.returnValue = "cancel";
  confirmPromise = new Promise((resolve) => {
    const finish = () => {
      const accepted = dialog.returnValue === "confirm";
      confirmPromise = null;
      queueMicrotask(() => {
        if (returnFocus?.isConnected) returnFocus.focus();
      });
      resolve(accepted);
    };
    dialog.addEventListener("close", finish, { once: true });
    dialog.showModal();
  });
  return confirmPromise;
}

async function requestNewIdea() {
  if (shouldConfirmNewIdea() && !(await confirmInApp())) return false;
  clearPendingForms();
  return run(() => commands.newIdea(), "newIdeaStarted");
}

function clearPendingForms() {
  for (const form of document.forms) {
    form.dataset.pending = "false";
    form.dataset.submitting = "false";
  }
  const generationForm = byId("generation-form");
  if (generationForm) {
    generationForm.dataset.gapReady = "false";
    generationForm.dataset.gapHint = "generationGapChooseAnchors";
    byId("generation-left-anchor").value = "";
    byId("generation-right-anchor").value = "";
  }
}

const persistence = createDraftPersistence({
  onStatus(status) {
    if (status === "saved") announce("draftSaved");
    else if (status === "save-failed") announce("draftSaveFailed", "error");
  }
});
const draft = persistence.load();

commands = createCommands(draft.song ?? createInitialSong(), {
  onChange(change) {
    render();
    if (change?.kind === "song") persistence.schedule(commands.getSong());
  },
  onEditorChange() {
    renderEditorControls();
    if (rollView) rollView.render(commands.getSong(), commands.getState());
  },
  onPlaybackChange: renderPlayback,
  onPlaybackEvent(event, error) {
    if (event === "ended") announce("playbackStoppedMessage");
    else if (event === "interrupted") announce("playbackPaused");
    else if (event === "error") reportError(error);
  },
  onNotificationError: reportNotificationError,
  audioPlayerFactory: (callbacks) => createAudioPlayer(callbacks)
});

rollView = createPianoRollView(byId("piano-roll"), commands, {
  onAddNote(input) {
    try {
      const note = commands.addNote(input, { actor: "user" });
      commands.selectNotes([note.id]);
      announce("noteAddedFromRoll");
    } catch (error) { reportError(error); }
  },
  onContextMenu: showNoteContextMenu,
  onError: reportError
});

scoreView = createScoreView(byId("score"), byId("score-status"), byId("score-fallback"), byId("score-scroll"), translate, {
  onSelectNote(noteId, additive) {
    const selected = commands.getSelectedNoteIds();
    const next = additive
      ? selected.includes(noteId) ? selected.filter((id) => id !== noteId) : [...selected, noteId]
      : [noteId];
    run(() => commands.selectNotes(next));
  },
  onSelectNotes(noteIds, additive) {
    const next = additive
      ? [...new Set([...commands.getSelectedNoteIds(), ...noteIds])]
      : noteIds;
    run(() => next.length ? commands.selectNotes(next) : commands.clearSelection());
  },
  onContextMenu: showNoteContextMenu
});

guitarView = createGuitarView(byId("guitar"));
const guitarStatus = byId("guitar-status");
const guitarLegend = byId("guitar-legend");
const guitarPlayhead = byId("guitar-playhead");

function renderGuitar(state) {
  const { note, positions, sounding, playheadTick } = guitarView.render(state);
  const pitch = note ? midiToPitch(note.pitch) : null;
  const labels = positions.map((position) => translate("guitarPosition", position));
  // Neck gitar tidak punya sumbu waktu, jadi playhead-nya berupa posisi bar dan
  // ketukan, bukan garis yang bergerak di sepanjang fret.
  // Snapshot tidak mengekspos song.timing, hanya timeSignature dan tempo di
  // level atas. PPQ adalah konstanta model, jadi diimpor dari sana.
  const { numerator, denominator } = state.song.timeSignature;
  const beatTicks = PPQ * 4 / denominator;
  const barTicks = beatTicks * numerator;
  const position = translate("guitarPlayheadPosition", {
    bar: Math.floor(playheadTick / barTicks) + 1,
    beat: Math.floor((playheadTick % barTicks) / beatTicks) + 1
  });
  if (!note) {
    // Bantuan soal apa yang harus dilakukan sudah ada di judul panel, jadi di sini
    // cukup dibiarkan kosong agar tidak mengulang kalimat yang sama.
    guitarStatus.textContent = "";
    guitarLegend.textContent = translate("guitarTuning");
    return;
  }
  guitarStatus.textContent = positions.length === 0
    ? translate("guitarUnplayable", { pitch })
    : translate("guitarPositions", { pitch, count: positions.length, positions: labels.join(", ") });
  guitarLegend.textContent = translate("guitarTuning");
  guitarPlayhead.textContent = sounding ? translate("guitarSounding", { position }) : "";
}

const publicCommands = Object.freeze({
  getSong: commands.getSong,
  getSelection: commands.getSelection,
  getSelectedNoteIds: commands.getSelectedNoteIds,
  addNote: (input) => commands.addNote(input, { actor: "user" }),
  updateNote: (noteId, patch) => commands.updateNote(noteId, patch, { actor: "user" }),
  updateNotes: (updates) => commands.updateNotes(updates, { actor: "user" }),
  deleteNote: (noteId) => commands.deleteNote(noteId, { actor: "user" }),
  setLyrics: commands.setLyrics,
  addLyricSyllable: commands.addLyricSyllable,
  updateLyricSyllable: commands.updateLyricSyllable,
  deleteLyricSyllable: commands.deleteLyricSyllable,
  splitLyricSyllable: commands.splitLyricSyllable,
  mergeLyricSyllables: commands.mergeLyricSyllables,
  moveLyricSyllable: commands.moveLyricSyllable,
  assignSyllableNotes: commands.assignSyllableNotes,
  setAnchor: (noteId, value) => commands.setAnchor(noteId, value, { actor: "user" }),
  setLocked: (noteId, value) => commands.setLocked(noteId, value, { actor: "user" }),
  selectRange: commands.selectRange,
  selectNotes: commands.selectNotes,
  clearSelection: commands.clearSelection,
  copySelection: commands.copySelection,
  pasteNotes: commands.pasteNotes,
  setSnap: commands.setSnap,
  setTool: commands.setTool,
  setZoom: commands.setZoom,
  setViewMode: commands.setViewMode,
  setFollowMode: commands.setFollowMode,
  undo: commands.undo,
  redo: commands.redo,
  canUndo: commands.canUndo,
  canRedo: commands.canRedo,
  newIdea: () => {
    clearPendingForms();
    return commands.newIdea();
  },
  play: commands.play,
  pause: commands.pause,
  stop: commands.stop,
  seek: commands.seek,
  setTempo: commands.setTempo,
  setLoop: commands.setLoop,
  setLoopEnabled: commands.setLoopEnabled,
  generateGap: commands.generateGap,
  getGenerationState: commands.getGenerationState,
  selectCandidate: commands.selectCandidate,
  auditionCandidate: commands.auditionCandidate,
  acceptCandidate: commands.acceptCandidate,
  lockAcceptedNotes: commands.lockAcceptedNotes,
  clearGeneration: commands.clearGeneration,
  regenerateGap: commands.regenerateGap
});
const publicSurface = Object.freeze({ getState: commands.getState, commands: publicCommands });
Object.defineProperty(window, "melodi", { value: publicSurface, enumerable: true, writable: false, configurable: false });

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
  event.preventDefault();
  const data = new FormData(form);
  const action = form.dataset.action;
  form.dataset.submitting = "true";
  let result;
  if (action === "add-note") {
    result = run(() => commands.addNote({
      pitch: pitchToMidi(data.get("pitch")),
      startTick: Number(data.get("startTick")),
      durationTicks: Number(data.get("durationTicks"))
    }), "noteAdded");
  } else if (action === "update-note") {
    result = run(() => commands.updateNote(form.dataset.noteId, {
      pitch: pitchToMidi(data.get(`pitch-${form.dataset.noteId}`)),
      startTick: Number(data.get(`start-${form.dataset.noteId}`)),
      durationTicks: Number(data.get(`duration-${form.dataset.noteId}`))
    }), "noteSaved");
  } else if (action === "set-lyrics") {
    result = run(() => commands.setLyrics(data.get("rawText")), "lyricsSaved");
  } else if (action === "select-range") {
    result = run(() => commands.selectRange(Number(data.get("startTick")), Number(data.get("endTick"))), "rangeSelected");
  } else if (action === "add-syllable") {
    result = run(() => commands.addLyricSyllable(data.get("text") ?? ""), "syllableAdded");
    form.reset();
  } else if (action === "update-syllable") {
    result = run(() => commands.updateLyricSyllable(form.dataset.syllableId, data.get("text") ?? ""), "syllableUpdated");
  } else if (action === "split-syllable") {
    result = run(() => commands.splitLyricSyllable(form.dataset.syllableId, {
      leftText: data.get("leftText") ?? "",
      rightText: data.get("rightText") ?? "",
      noteSplitIndex: Number(data.get("noteSplitIndex"))
    }), "syllableSplit");
  } else if (action === "seek") {
    result = run(() => commands.seek(Number(data.get("tick"))), "seekUpdated");
  } else if (action === "set-tempo") {
    result = run(() => commands.setTempo(Number(data.get("tempo"))), "tempoUpdated");
  } else if (action === "set-loop") {
    result = run(() => commands.setLoop(Number(data.get("startTick")), Number(data.get("endTick"))), "loopUpdated");
  } else if (action === "generate-gap") {
    if (form.dataset.gapReady !== "true") {
      byId("generation-gap-status").textContent = translate("generationGapChooseAnchors");
      return;
    }
    const lyricCount = String(data.get("lyricSyllableCount") ?? "").trim();
    result = run(() => commands.generateGap({
      startTick: Number(data.get("startTick")),
      endTick: Number(data.get("endTick")),
      seed: Number(data.get("seed")),
      styleProfile: data.get("styleProfile"),
      voiceRange: { minPitch: Number(data.get("minPitch")), maxPitch: Number(data.get("maxPitch")) },
      ...(data.get("leftAnchorNoteId") ? { leftAnchorNoteId: data.get("leftAnchorNoteId") } : {}),
      ...(data.get("rightAnchorNoteId") ? { rightAnchorNoteId: data.get("rightAnchorNoteId") } : {}),
      ...(lyricCount === "" ? {} : { lyricSyllableCount: Number(lyricCount) })
    }));
    if (result) announce("generationReady", "success", { count: result.candidates.length });
  }
  if (result !== undefined) form.dataset.pending = "false";
  form.dataset.submitting = "false";
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && ["checkbox", "radio"].includes(target.type)) return;
  if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) && target.form) {
    target.form.dataset.pending = "true";
    if (target.form.id === "generation-form" && ["generation-start", "generation-end"].includes(target.id)) {
      target.form.dataset.gapReady = "false";
      target.form.dataset.gapHint = "generationGapReapply";
      byId("generation-left-anchor").value = "";
      byId("generation-right-anchor").value = "";
      byId("generate-gap").disabled = true;
      byId("generation-gap-status").textContent = translate("generationGapReapply");
    }
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.dataset.action === "language-switch") {
    setLanguage(target.value);
  } else if (target.dataset.action === "theme-switch") {
    setTheme(target.value);
    announce("themeChanged");
  } else if (target.dataset.action === "set-tempo-direct") {
    run(() => commands.setTempo(Number(target.value)), "tempoUpdated");
    if (target.form) target.form.dataset.pending = "false";
  } else if (target.dataset.action === "set-anchor") {
    const form = byId("generation-form");
    form.dataset.pending = "true";
    form.dataset.gapReady = "false";
    form.dataset.gapHint = "generationGapReapply";
    byId("generation-left-anchor").value = "";
    byId("generation-right-anchor").value = "";
    run(() => commands.setAnchor(target.dataset.noteId, target.checked), "anchorChanged");
  } else if (target.dataset.action === "set-locked") {
    run(() => commands.setLocked(target.dataset.noteId, target.checked), "lockedChanged");
  } else if (target.dataset.action === "set-loop-enabled") {
    run(() => commands.setLoopEnabled(target.checked), target.checked ? "loopEnabled" : "loopDisabled");
  } else if (target.dataset.action === "set-snap") {
    run(() => commands.setSnap(target.value));
  } else if (target.dataset.action === "set-zoom") {
    run(() => commands.setZoom(Number(target.value)));
  } else if (target.dataset.action === "set-view-mode") {
    run(() => commands.setViewMode(target.value));
  } else if (target.dataset.action === "set-follow-mode") {
    run(() => commands.setFollowMode(target.checked));
  } else if (target.dataset.action === "toggle-note-selection") {
    const ids = commands.getSelectedNoteIds();
    const next = target.checked ? [...ids, target.dataset.noteId] : ids.filter((id) => id !== target.dataset.noteId);
    run(() => commands.selectNotes(next));
  } else if (target.dataset.action === "assign-syllable-note") {
    const syllable = commands.getSong().lyrics.syllables.find((item) => item.id === target.dataset.syllableId);
    if (!syllable) return;
    const noteIds = target.checked
      ? [...syllable.noteIds, target.dataset.noteId]
      : syllable.noteIds.filter((id) => id !== target.dataset.noteId);
    run(() => commands.assignSyllableNotes(target.dataset.syllableId, noteIds), "syllableNotesUpdated");
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!target) return;
  const state = commands.getState();
  if (target.dataset.action === "set-tool") {
    run(() => commands.setTool(target.dataset.tool));
  } else if (target.dataset.action === "context-duplicate") {
    closeNoteContextMenu();
    const notes = run(() => duplicateSelectedNotes());
    if (notes?.length) announce("notePasted", "success", { count: notes.length });
  } else if (target.dataset.action === "context-copy") {
    closeNoteContextMenu();
    const count = run(() => commands.copySelection());
    if (count) announce("noteCopied", "success", { count });
  } else if (target.dataset.action === "context-delete") {
    closeNoteContextMenu();
    const count = run(() => deleteSelectedNotes());
    if (count) announce("noteDeleted");
  } else if (target.dataset.action === "context-toggle-anchor") {
    const notes = selectedSongNotes();
    const next = !notes.length || !notes.every((note) => note.anchor);
    closeNoteContextMenu();
    const count = run(() => setSelectedFlag("anchor", next));
    if (count) announce("anchorChanged");
  } else if (target.dataset.action === "context-toggle-lock") {
    const notes = selectedSongNotes();
    const next = !notes.length || !notes.every((note) => note.locked);
    closeNoteContextMenu();
    const count = run(() => setSelectedFlag("locked", next));
    if (count) announce("lockedChanged");
  } else if (target.dataset.action === "context-transpose" || target.dataset.action === "transpose-selected") {
    const delta = Number(target.dataset.delta);
    closeNoteContextMenu();
    const notes = run(() => transposeSelectedNotes(delta));
    if (notes?.length) announce("noteSaved");
  } else if (target.dataset.action === "context-duration" || target.dataset.action === "set-selected-duration") {
    const snap = target.dataset.snap;
    const durationTicks = snap === "1/2" ? SNAP_TICKS["1/4"] * 2 : SNAP_TICKS[snap];
    closeNoteContextMenu();
    const notes = run(() => setSelectedDuration(durationTicks));
    if (notes?.length) announce("noteSaved");
  } else if (target.dataset.action === "set-selected-bend") {
    const notes = run(() => setSelectedBend(target.dataset.bend));
    if (notes?.length) announce(target.dataset.bend === "clear" ? "bendCleared" : "bendUpdated");
  } else if (target.dataset.action === "context-add-note") {
    const context = contextTarget ? { ...contextTarget } : null;
    closeNoteContextMenu();
    if (context && Number.isSafeInteger(context.pitch) && Number.isSafeInteger(context.startTick)) {
      const note = run(() => commands.addNote({
        pitch: context.pitch,
        startTick: context.startTick,
        durationTicks: Number.isSafeInteger(context.durationTicks)
          ? context.durationTicks
          : SNAP_TICKS[commands.getState().editor.snap]
      }, { actor: "user" }));
      if (note) {
        commands.selectNotes([note.id]);
        announce("noteAddedFromRoll");
      }
    }
  } else if (target.dataset.action === "context-paste-here") {
    const context = contextTarget ? { ...contextTarget } : null;
    closeNoteContextMenu();
    if (context && Number.isSafeInteger(context.pitch) && Number.isSafeInteger(context.startTick)) {
      const notes = run(() => commands.pasteNotes(context.startTick, context.pitch));
      if (notes?.length) announce("notePasted", "success", { count: notes.length });
    }
  } else if (target.dataset.action === "context-select-all") {
    closeNoteContextMenu();
    run(() => commands.selectNotes(commands.getSong().notes.map((note) => note.id)));
  } else if (target.dataset.action === "delete-note") {
    run(() => commands.deleteNote(target.dataset.noteId), "noteDeleted");
  } else if (target.dataset.action === "play") {
    runAsync(() => commands.play(), "playbackStarted", (playback) => playback.status === "playing");
  } else if (target.dataset.action === "pause") {
    run(() => commands.pause(), "playbackPaused");
  } else if (target.dataset.action === "stop") {
    run(() => commands.stop(), "playbackStoppedMessage");
  } else if (target.dataset.action === "command-palette") {
    openPalette();
  } else if (target.dataset.action === "undo") {
    run(() => commands.undo(), "editUndone");
  } else if (target.dataset.action === "redo") {
    run(() => commands.redo(), "editRedone");
  } else if (target.dataset.action === "copy-selection") {
    const count = run(() => commands.copySelection());
    if (count) announce("noteCopied", "success", { count });
  } else if (target.dataset.action === "paste-notes") {
    const notes = run(() => commands.pasteNotes(state.playback.currentTick));
    if (notes?.length) announce("notePasted", "success", { count: notes.length });
  } else if (target.dataset.action === "clear-selection") {
    run(() => commands.clearSelection(), "selectionCleared");
  } else if (target.dataset.action === "delete-syllable") {
    run(() => commands.deleteLyricSyllable(target.dataset.syllableId), "syllableDeleted");
  } else if (target.dataset.action === "move-syllable") {
    run(() => commands.moveLyricSyllable(target.dataset.syllableId, Number(target.dataset.targetIndex)), "syllableMoved");
  } else if (target.dataset.action === "merge-syllables") {
    run(() => commands.mergeLyricSyllables(target.dataset.leftId, target.dataset.rightId), "syllableMerged");
  } else if (target.dataset.action === "new-idea") {
    void requestNewIdea();
  } else if (target.dataset.action === "use-selection") {
    const selection = commands.getSelection();
    if (!selection || selection.endTick <= selection.startTick) return;
    const form = byId("generation-form");
    byId("generation-start").value = String(selection.startTick);
    byId("generation-end").value = String(selection.endTick);
    byId("generation-left-anchor").value = "";
    byId("generation-right-anchor").value = "";
    form.dataset.pending = "true";
    form.dataset.gapReady = "true";
    form.dataset.gapHint = "generationManualGapReady";
    render();
  } else if (target.dataset.action === "use-generation-ticks") {
    const form = byId("generation-form");
    const startValue = byId("generation-start").value.trim();
    const endValue = byId("generation-end").value.trim();
    const startTick = Number(startValue);
    const endTick = Number(endValue);
    const integerRange = Number.isSafeInteger(startTick) && Number.isSafeInteger(endTick)
      && startValue !== "" && endValue !== "" && startTick >= 0 && endTick > startTick;
    const onGrid = integerRange && startTick % 120 === 0 && endTick % 120 === 0;
    const valid = onGrid && endTick - startTick <= 64 * 120;
    if (!valid) {
      form.dataset.gapReady = "false";
      form.dataset.gapHint = !integerRange ? "generationManualGapInvalid"
        : !onGrid ? "generationGapGrid"
          : "generationGapTooLong";
      render();
      return;
    }
    byId("generation-left-anchor").value = "";
    byId("generation-right-anchor").value = "";
    form.dataset.pending = "true";
    form.dataset.gapReady = "true";
    form.dataset.gapHint = "generationManualGapReady";
    render();
  } else if (target.dataset.action === "mark-selected-anchors") {
    const selectedIds = commands.getSelectedNoteIds();
    const form = byId("generation-form");
    if (selectedIds.length !== 2) {
      form.dataset.gapHint = "generationGapSelectTwo";
      render();
      return;
    }
    form.dataset.gapReady = "false";
    form.dataset.pending = "true";
    byId("generation-left-anchor").value = "";
    byId("generation-right-anchor").value = "";
    form.dataset.gapHint = "generationAnchorsMarked";
    const marked = run(() => {
      for (const noteId of selectedIds) {
        if (!commands.getSong().notes.find((note) => note.id === noteId)?.anchor) commands.setAnchor(noteId, true);
      }
      return true;
    });
    if (marked) render();
  } else if (target.dataset.action === "use-selected-anchors") {
    const form = byId("generation-form");
    const selectedGap = resolveSelectedAnchorGap(commands.getSong(), commands.getSelectedNoteIds());
    if (selectedGap.status !== "ready") {
      const hintByStatus = {
        "select-two": "generationGapSelectTwo",
        "mark-two": "generationGapMarkTwo",
        empty: "generationGapEmpty",
        grid: "generationGapGrid",
        "too-long": "generationGapTooLong"
      };
      form.dataset.gapReady = "false";
      form.dataset.gapHint = hintByStatus[selectedGap.status] ?? "generationGapChooseAnchors";
      render();
      return;
    }
    byId("generation-start").value = String(selectedGap.gap.startTick);
    byId("generation-end").value = String(selectedGap.gap.endTick);
    byId("generation-left-anchor").value = selectedGap.gap.leftAnchorNoteId;
    byId("generation-right-anchor").value = selectedGap.gap.rightAnchorNoteId;
    form.dataset.pending = "true";
    form.dataset.gapReady = "true";
    form.dataset.gapHint = "generationGapReady";
    render();
  } else if (target.dataset.action === "regenerate-gap") {
    const result = run(() => commands.regenerateGap());
    if (result) announce("generationRegenerated");
  } else if (target.dataset.action === "clear-generation") {
    const cleared = run(() => commands.clearGeneration());
    if (cleared) announce("generationCleared");
  } else if (target.dataset.action === "select-candidate") {
    run(() => commands.selectCandidate(target.dataset.candidateId));
  } else if (target.dataset.action === "audition-candidate") {
    runAsync(() => commands.auditionCandidate(target.dataset.candidateId), "generationAuditioned");
  } else if (target.dataset.action === "accept-candidate") {
    const accepted = run(() => commands.acceptCandidate(target.dataset.candidateId));
    if (accepted) announce("generationAccepted");
  } else if (target.dataset.action === "lock-accepted-notes") {
    const locked = run(() => commands.lockAcceptedNotes());
    if (locked) announce("generationLocked");
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (event.isComposing || event.repeat || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    || target?.isContentEditable) return;

  const menu = byId("note-context-menu");
  if (event.key === "Escape" && menu && !menu.hidden) {
    event.preventDefault();
    closeNoteContextMenu();
    return;
  }

  // Undo/redo sengaja tidak dibatasi ke editor. Keduanya mengubah state canonical,
  // jadi harus tersedia dari mana saja; teks yang sedang diketik sudah dilewati
  // oleh guard input di atas supaya undo native browser tetap dipakai di sana.
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (paletteDialog?.open) closePalette();
    else openPalette();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "z" || key === "y") {
      const wantsRedo = key === "y" || event.shiftKey;
      const applied = wantsRedo
        ? run(() => commands.redo(), "editRedone")
        : run(() => commands.undo(), "editUndone");
      if (applied) event.preventDefault();
      return;
    }
  }

  const editorTarget = target instanceof Element
    ? target.closest("#piano-roll-scroll, #score-scroll, [data-entity='score-note']")
    : null;
  const pianoRollTarget = target instanceof Element ? target.closest("#piano-roll-scroll") : null;
  const selectedIds = commands.getSelectedNoteIds();

  if (pianoRollTarget && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    const key = event.key.toLowerCase();
    if (key === "v" || key === "d") {
      event.preventDefault();
      run(() => commands.setTool(key === "v" ? "select" : "draw"));
      return;
    }
  }

  if (editorTarget && selectedIds.length > 0 && event.altKey && !event.ctrlKey && !event.metaKey
    && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    const snapTicks = SNAP_TICKS[commands.getState().editor.snap];
    const delta = event.key === "ArrowRight" ? snapTicks : -snapTicks;
    const notes = run(() => moveSelectedNotes(delta));
    if (notes?.length) announce("noteSaved");
    return;
  }

  if (editorTarget && selectedIds.length > 0 && !event.ctrlKey && !event.metaKey && !event.altKey
    && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    const amount = event.shiftKey ? 12 : 1;
    const delta = event.key === "ArrowUp" ? amount : -amount;
    const notes = run(() => transposeSelectedNotes(delta));
    if (notes?.length) announce("noteSaved");
    return;
  }

  if (editorTarget && selectedIds.length > 0 && !event.ctrlKey && !event.metaKey && !event.altKey
    && (event.key === "Delete" || event.key === "Backspace")) {
    event.preventDefault();
    const count = run(() => deleteSelectedNotes());
    if (count) announce("noteDeleted");
    return;
  }

  if (editorTarget && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "d" && selectedIds.length > 0) {
    event.preventDefault();
    const notes = run(() => duplicateSelectedNotes());
    if (notes?.length) announce("notePasted", "success", { count: notes.length });
    return;
  }

  if (editorTarget && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    run(() => commands.selectNotes(commands.getSong().notes.map((note) => note.id)));
    return;
  }

  if (event.key === "Escape" && editorTarget && selectedIds.length > 0) {
    event.preventDefault();
    run(() => commands.clearSelection(), "selectionCleared");
    return;
  }

  if (editorTarget && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    && (event.key === "-" || event.key === "=" || event.key === "+" || event.key === "0")) {
    // Zoom memakai tombol biasa dan hanya di dalam editor, supaya Ctrl+Plus dan
    // Ctrl+Minus milik browser untuk zoom halaman tetap berfungsi.
    event.preventDefault();
    // Handler ini tidak punya state di scope, jadi dibaca lewat commands.
    const currentZoom = commands.getState().editor.zoom;
    const rawNext = event.key === "0" ? 1 : event.key === "-" ? currentZoom - ROLL_ZOOM_STEP : currentZoom + ROLL_ZOOM_STEP;
    const next = Math.min(MAX_ROLL_ZOOM, Math.max(MIN_ROLL_ZOOM, rawNext));
    run(() => commands.setZoom(Number(next.toFixed(2))));
    return;
  }

  if (!(event.ctrlKey || event.metaKey)) {
    if (event.altKey || event.shiftKey) return;
    const nativeInteractive = target instanceof Element
      ? target.closest("button, a, summary, [role='button'], [role='link']")
      : null;
    if (nativeInteractive) return;
    const generation = commands.getGenerationState();
    if (generation.status !== "ready") return;
    if (/^[1-8]$/.test(event.key)) {
      const candidate = generation.candidates[Number(event.key) - 1];
      if (!candidate) return;
      event.preventDefault();
      runAsync(() => commands.auditionCandidate(candidate.id), "generationAuditioned");
      return;
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      const result = run(() => commands.regenerateGap());
      if (result) announce("generationRegenerated");
      return;
    }
    if (event.key === "Enter" && generation.activeCandidateId) {
      event.preventDefault();
      const accepted = run(() => commands.acceptCandidate(generation.activeCandidateId));
      if (accepted) announce("generationAccepted");
    }
    return;
  }
  if (event.altKey) return;
  if (event.key.toLowerCase() === "c" && commands.getSelectedNoteIds().length > 0) {
    event.preventDefault();
    const count = commands.copySelection();
    announce("noteCopied", "success", { count });
  } else if (event.key.toLowerCase() === "v" && commands.getState().editor.canPaste) {
    event.preventDefault();
    const notes = commands.pasteNotes(commands.getState().playback.currentTick);
    announce("notePasted", "success", { count: notes.length });
  }
});

const confirmDialog = byId("confirm-dialog");
confirmDialog?.addEventListener("click", (event) => {
  if (event.target === confirmDialog) confirmDialog.close("cancel");
});

document.addEventListener("pointerdown", (event) => {
  pointerInteractionActive = true;
  const menu = byId("note-context-menu");
  const insideMenu = event.target instanceof Element && event.target.closest("#note-context-menu");
  if (menu && !menu.hidden && !insideMenu && event.button !== 2) closeNoteContextMenu();
}, true);
document.addEventListener("pointerup", () => { pointerInteractionActive = false; }, true);
document.addEventListener("pointercancel", () => { pointerInteractionActive = false; }, true);
document.addEventListener("scroll", () => closeNoteContextMenu(), true);

window.addEventListener("pagehide", () => persistence.flush());

// Mulai dari workspace yang bersih. Beberapa browser mempertahankan state <details>
// setelah reload/back-forward, yang dapat membuat beberapa panel advanced terbuka sekaligus.
document.querySelectorAll("details").forEach((details) => { details.open = false; });

render();
if (draft.status === "restored") announce("draftRestored");
else if (draft.status === "invalid") announce("draftInvalid", "error");
else if (draft.status === "unavailable") announce("draftUnavailable", "error");
