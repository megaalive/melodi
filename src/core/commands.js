import { cloneData, createId, createSong, MelodiError } from "./model.js";
import { createAgentSnapshot } from "./snapshot.js";

function fail(code) {
  throw new MelodiError(code);
}

function validateActor(actor) {
  if (actor !== "user" && actor !== "generator") fail("invalid-actor");
}

function validatePatch(patch) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) fail("invalid-note");
  const keys = Object.keys(patch);
  const allowed = new Set(["pitch", "startTick", "durationTicks"]);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) fail("invalid-note-patch");
}

export function createCommands(initialSong, { idFactory = createId, onChange = () => {} } = {}) {
  let song = createSong(initialSong);
  let selection = null;

  function commit(mutator, afterCommit = () => {}) {
    const candidate = cloneData(song);
    const result = mutator(candidate);
    const validated = createSong(candidate);
    song = validated;
    afterCommit();
    onChange();
    return result;
  }

  const commands = {
    getSong() {
      return cloneData(song);
    },
    getSelection() {
      return cloneData(selection);
    },
    getState() {
      return createAgentSnapshot(song, selection);
    },
    addNote(input, { actor = "user" } = {}) {
      validateActor(actor);
      if (input === null || typeof input !== "object" || Array.isArray(input)) fail("invalid-note");
      const allowed = new Set(["pitch", "startTick", "durationTicks"]);
      if (Object.keys(input).some((key) => !allowed.has(key))) fail("invalid-note");
      const note = {
        id: idFactory(),
        pitch: input.pitch,
        startTick: input.startTick,
        durationTicks: input.durationTicks,
        source: actor === "generator" ? "generated" : "user",
        anchor: false,
        locked: false
      };
      commit((candidate) => candidate.notes.push(note));
      return cloneData(note);
    },
    updateNote(noteId, patch, { actor = "user" } = {}) {
      validateActor(actor);
      validatePatch(patch);
      const note = song.notes.find((item) => item.id === noteId);
      if (!note) fail("note-not-found");
      if (actor === "generator" && (note.anchor || note.locked)) fail("protected-note");
      commit((candidate) => {
        const target = candidate.notes.find((item) => item.id === noteId);
        Object.assign(target, patch);
      });
      return cloneData(song.notes.find((item) => item.id === noteId));
    },
    deleteNote(noteId, { actor = "user" } = {}) {
      validateActor(actor);
      const note = song.notes.find((item) => item.id === noteId);
      if (!note) fail("note-not-found");
      if (actor === "generator" && (note.anchor || note.locked)) fail("protected-note");
      commit((candidate) => {
        candidate.notes = candidate.notes.filter((item) => item.id !== noteId);
        candidate.phrases = candidate.phrases.map((phrase) => ({
          ...phrase,
          noteIds: phrase.noteIds.filter((id) => id !== noteId)
        }));
        candidate.lyrics.syllables = candidate.lyrics.syllables.map((syllable) => ({
          ...syllable,
          noteIds: syllable.noteIds.filter((id) => id !== noteId)
        }));
      }, () => {
        if (selection) selection = { ...selection, noteIds: selection.noteIds.filter((id) => id !== noteId) };
      });
      return true;
    },
    setLyrics(rawText) {
      if (typeof rawText !== "string") fail("invalid-lyrics");
      commit((candidate) => { candidate.lyrics.rawText = rawText; });
      return rawText;
    },
    setAnchor(noteId, value, { actor = "user" } = {}) {
      validateActor(actor);
      if (typeof value !== "boolean") fail("invalid-note-flags");
      if (actor === "generator") fail("generator-flag-change");
      if (!song.notes.some((item) => item.id === noteId)) fail("note-not-found");
      commit((candidate) => { candidate.notes.find((item) => item.id === noteId).anchor = value; });
      return value;
    },
    setLocked(noteId, value, { actor = "user" } = {}) {
      validateActor(actor);
      if (typeof value !== "boolean") fail("invalid-note-flags");
      if (actor === "generator") fail("generator-flag-change");
      if (!song.notes.some((item) => item.id === noteId)) fail("note-not-found");
      commit((candidate) => { candidate.notes.find((item) => item.id === noteId).locked = value; });
      return value;
    },
    selectRange(startTick, endTick) {
      if (!Number.isSafeInteger(startTick) || startTick < 0 || !Number.isSafeInteger(endTick) || endTick < startTick) fail("invalid-range");
      const noteIds = song.notes
        .filter((note) => note.startTick < endTick && note.startTick + note.durationTicks > startTick)
        .map((note) => note.id);
      selection = { startTick, endTick, noteIds };
      onChange();
      return cloneData(selection);
    }
  };
  return Object.freeze(commands);
}
