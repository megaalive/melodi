import { cloneData } from "./model.js";

const AVAILABLE_ACTIONS = Object.freeze([
  "getSong",
  "getSelection",
  "addNote",
  "updateNote",
  "deleteNote",
  "setLyrics",
  "setAnchor",
  "setLocked",
  "selectRange"
]);

export function createAgentSnapshot(song, selection) {
  return {
    song: {
      id: song.id,
      title: song.title,
      tempo: song.timing.tempo,
      key: song.key,
      scale: cloneData(song.scale),
      timeSignature: cloneData(song.timing.timeSignature),
      currentSectionId: song.sections[0]?.id ?? null
    },
    selection: cloneData(selection),
    anchorNoteIds: song.notes.filter((note) => note.anchor).map((note) => note.id),
    lockedNoteIds: song.notes.filter((note) => note.locked).map((note) => note.id),
    availableActions: [...AVAILABLE_ACTIONS]
  };
}
