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
  "selectRange",
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
}) {
  return {
    song: {
      id: song.id,
      title: song.title,
      tempo: song.timing.tempo,
      key: song.key,
      scale: cloneData(song.scale),
      timeSignature: cloneData(song.timing.timeSignature),
      currentSectionId: playback.currentSectionId
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
    anchorNoteIds: song.notes.filter((note) => note.anchor).map((note) => note.id),
    lockedNoteIds: song.notes.filter((note) => note.locked).map((note) => note.id),
    availableActions: [...AVAILABLE_ACTIONS]
  };
}
