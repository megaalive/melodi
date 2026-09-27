import { cloneData } from "./model.js";

const AVAILABLE_ACTIONS = Object.freeze([
  "getSong",
  "getSelection",
  "getSelectedNoteIds",
  "addNote",
  "updateNote",
  "updateNotes",
  "deleteNote",
  "setLyrics",
  "setAnchor",
  "setLocked",
  "selectRange",
  "selectNotes",
  "clearSelection",
  "copySelection",
  "pasteNotes",
  "setSnap",
  "addLyricSyllable",
  "updateLyricSyllable",
  "deleteLyricSyllable",
  "splitLyricSyllable",
  "mergeLyricSyllables",
  "moveLyricSyllable",
  "assignSyllableNotes",
  "newIdea",
  "play",
  "pause",
  "stop",
  "seek",
  "setTempo",
  "setLoop",
  "setLoopEnabled"
]);

export function createAgentSnapshot(song, selection, playback = {
  status: "stopped",
  currentTick: 0,
  currentNoteId: null,
  currentSectionId: song.sections[0]?.id ?? null,
  tempo: song.timing.tempo,
  loop: { enabled: false, startTick: 0, endTick: 1 }
}, editor = { snap: "1/8", canPaste: false, clipboardCount: 0 }, selectedNoteIds = []) {
  return {
    song: {
      id: song.id,
      title: song.title,
      tempo: song.timing.tempo,
      key: song.key,
      scale: cloneData(song.scale),
      timeSignature: cloneData(song.timing.timeSignature),
      currentSectionId: playback.currentSectionId,
      notes: cloneData(song.notes),
      lyrics: cloneData(song.lyrics)
    },
    playback: {
      status: playback.status,
      currentTick: playback.currentTick,
      currentNoteId: playback.currentNoteId,
      currentSectionId: playback.currentSectionId,
      tempo: playback.tempo,
      loop: cloneData(playback.loop)
    },
    selection: cloneData(selection),
    selectedNoteIds: cloneData(selectedNoteIds),
    editor: cloneData(editor),
    anchorNoteIds: song.notes.filter((note) => note.anchor).map((note) => note.id),
    lockedNoteIds: song.notes.filter((note) => note.locked).map((note) => note.id),
    availableActions: [...AVAILABLE_ACTIONS]
  };
}
