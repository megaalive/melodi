import { createInitialSong, midiToPitch, pitchToMidi } from "./core/model.js";
import { createCommands } from "./core/commands.js";
import { DEFAULT_LANGUAGE, message } from "./i18n/messages.js";

let language = DEFAULT_LANGUAGE;
let commands;
let statusTimer;

const byId = (id) => document.getElementById(id);
const languageSelect = byId("language");

function translated(key, values) {
  return message(language, key, values);
}

function copyFocusableElement(key) {
  return [...document.querySelectorAll("[data-focus-key]")].find((element) => element.dataset.focusKey === key);
}

function renderNotes(song) {
  const list = byId("note-list");
  list.replaceChildren();
  for (const note of song.notes) {
    const item = document.createElement("li");
    item.dataset.entity = "note";
    item.dataset.entityId = note.id;
    item.className = "note-card";

    const form = document.createElement("form");
    form.dataset.action = "update-note";
    form.dataset.noteId = note.id;

    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = translated("noteLegend", { pitch: midiToPitch(note.pitch), tick: note.startTick });
    fieldset.append(legend);

    const grid = document.createElement("div");
    grid.className = "form-grid";
    grid.append(
      makeInputLabel(translated("notePitchLabel", { pitch: midiToPitch(note.pitch) }), "text", midiToPitch(note.pitch), `pitch-${note.id}`, {
        pattern: "[A-Ga-g][#b]?-?[0-9]+",
        action: "edit-note-pitch",
        focusKey: `pitch-${note.id}`
      }),
      makeInputLabel(translated("noteStartTickLabel", { pitch: midiToPitch(note.pitch) }), "number", note.startTick, `start-${note.id}`, {
        min: "0", step: "1", action: "edit-note-start", focusKey: `start-${note.id}`
      }),
      makeInputLabel(translated("noteDurationLabel", { pitch: midiToPitch(note.pitch) }), "number", note.durationTicks, `duration-${note.id}`, {
        min: "1", step: "1", action: "edit-note-duration", focusKey: `duration-${note.id}`
      })
    );

    const flags = document.createElement("div");
    flags.className = "note-flags";
    flags.append(
      makeCheckboxLabel(translated("anchorLabel"), note.anchor, "set-anchor", note.id, `anchor-${note.id}`),
      makeCheckboxLabel(translated("lockedLabel"), note.locked, "set-locked", note.id, `locked-${note.id}`)
    );

    const actions = document.createElement("div");
    actions.className = "note-actions";
    const save = document.createElement("button");
    save.type = "submit";
    save.dataset.focusKey = `save-${note.id}`;
    save.textContent = translated("saveNoteButton");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete-note";
    deleteButton.dataset.noteId = note.id;
    deleteButton.dataset.focusKey = `delete-${note.id}`;
    deleteButton.className = "secondary";
    deleteButton.textContent = translated("deleteNoteButton");
    const id = document.createElement("span");
    id.className = "entity-id";
    id.textContent = `${translated("noteId")}: ${note.id}`;
    actions.append(save, deleteButton, id);

    fieldset.append(grid, flags, actions);
    form.append(fieldset);
    item.append(form);
    list.append(item);
  }
}

function makeInputLabel(text, type, value, name, options = {}) {
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = text;
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.value = String(value);
  input.required = true;
  if (options.min !== undefined) input.min = options.min;
  if (options.step !== undefined) input.step = options.step;
  if (options.pattern !== undefined) input.pattern = options.pattern;
  if (options.action) input.dataset.action = options.action;
  if (options.focusKey) input.dataset.focusKey = options.focusKey;
  label.append(caption, input);
  return label;
}

function makeCheckboxLabel(text, checked, action, noteId, focusKey) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.dataset.action = action;
  input.dataset.noteId = noteId;
  input.dataset.focusKey = focusKey;
  const caption = document.createElement("span");
  caption.textContent = text;
  label.append(input, caption);
  return label;
}

function render() {
  const active = document.activeElement;
  const focusKey = active?.dataset?.focusKey;
  const selectionStart = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active.selectionStart : null;
  const selectionEnd = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active.selectionEnd : null;
  const song = commands.getSong();

  document.documentElement.lang = language;
  document.querySelectorAll("[data-copy]").forEach((element) => {
    element.textContent = translated(element.dataset.copy);
  });
  languageSelect.value = language;
  byId("tempo-value").textContent = `${song.timing.tempo} BPM`;
  byId("key-value").textContent = `${song.key} ${song.scale.name}`;
  byId("time-signature-value").textContent = `${song.timing.timeSignature.numerator}/${song.timing.timeSignature.denominator}`;
  byId("song-title").textContent = song.title;
  byId("raw-lyrics").value = song.lyrics.rawText;
  byId("syllable-summary").textContent = song.lyrics.syllables.length
    ? translated("syllableSummary", { count: song.lyrics.syllables.length })
    : translated("noSyllables");

  const selection = commands.getSelection();
  byId("selection-summary").textContent = selection
    ? translated("selectionSummary", { start: selection.startTick, end: selection.endTick, count: selection.noteIds.length })
    : translated("noSelection");
  byId("add-start-tick").value = String(song.notes.reduce((end, note) => Math.max(end, note.startTick + note.durationTicks), 0));
  renderNotes(song);

  if (focusKey) {
    const target = copyFocusableElement(focusKey);
    if (target) {
      target.focus();
      if (selectionStart !== null && typeof target.setSelectionRange === "function") {
        try { target.setSelectionRange(selectionStart, selectionEnd); } catch {}
      }
    } else if (focusKey.startsWith("delete-")) {
      copyFocusableElement("add-pitch")?.focus();
    }
  }
}

function announce(key, kind = "success") {
  const status = byId("operation-status");
  status.dataset.kind = kind;
  status.textContent = translated(key);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ""; }, 5000);
}

function reportError(error) {
  const key = `error_${error?.code ?? "default"}`;
  announce(`${translated("operationFailed")}: ${translated(key)}`, "error");
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
    try {
      announce(successKey);
    } catch (error) {
      reportNotificationError(error);
    }
  }
  return result;
}

commands = createCommands(createInitialSong(), { onChange: render, onNotificationError: reportNotificationError });

const publicCommands = Object.freeze({
  getSong: commands.getSong,
  getSelection: commands.getSelection,
  addNote: (input) => commands.addNote(input, { actor: "user" }),
  updateNote: (noteId, patch) => commands.updateNote(noteId, patch, { actor: "user" }),
  deleteNote: (noteId) => commands.deleteNote(noteId, { actor: "user" }),
  setLyrics: commands.setLyrics,
  setAnchor: (noteId, value) => commands.setAnchor(noteId, value, { actor: "user" }),
  setLocked: (noteId, value) => commands.setLocked(noteId, value, { actor: "user" }),
  selectRange: commands.selectRange
});
const publicSurface = Object.freeze({ getState: commands.getState, commands: publicCommands });
Object.defineProperty(window, "melodi", { value: publicSurface, enumerable: true, writable: false, configurable: false });

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const action = form.dataset.action;
  if (!action) return;
  event.preventDefault();
  const data = new FormData(form);
  if (action === "add-note") {
    run(() => commands.addNote({
      pitch: pitchToMidi(data.get("pitch")),
      startTick: Number(data.get("startTick")),
      durationTicks: Number(data.get("durationTicks"))
    }), "noteAdded");
  } else if (action === "update-note") {
    run(() => commands.updateNote(form.dataset.noteId, {
      pitch: pitchToMidi(data.get(`pitch-${form.dataset.noteId}`)),
      startTick: Number(data.get(`start-${form.dataset.noteId}`)),
      durationTicks: Number(data.get(`duration-${form.dataset.noteId}`))
    }), "noteSaved");
  } else if (action === "set-lyrics") {
    run(() => commands.setLyrics(data.get("rawText")), "lyricsSaved");
  } else if (action === "select-range") {
    run(() => commands.selectRange(Number(data.get("startTick")), Number(data.get("endTick"))), "rangeSelected");
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.dataset.action === "language-switch") {
    language = target.value === "en" ? "en" : DEFAULT_LANGUAGE;
    render();
    announce(language === "en" ? "languageChanged" : "languageChanged");
  } else if (target.dataset.action === "set-anchor") {
    run(() => commands.setAnchor(target.dataset.noteId, target.checked), "anchorChanged");
  } else if (target.dataset.action === "set-locked") {
    run(() => commands.setLocked(target.dataset.noteId, target.checked), "lockedChanged");
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-action="delete-note"]') : null;
  if (!target) return;
  run(() => commands.deleteNote(target.dataset.noteId), "noteDeleted");
});

render();
