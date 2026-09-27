const VIEW_MODES = new Set(["score", "piano-roll", "combined", "lyrics", "guitar"]);

/** Region mana yang tampil pada mode tampilan apa. */
export const VIEW_REGION_MODES = Object.freeze({
  score: ["score", "combined"],
  "piano-roll": ["piano-roll", "combined"],
  lyrics: ["lyrics"],
  guitar: ["guitar"]
});

function normalizeGenerationState(generation) {
  if (generation?.status !== "ready" || !Array.isArray(generation.candidates)) {
    return {
      status: "idle",
      stale: false,
      gap: null,
      seed: null,
      candidateIds: [],
      activeCandidateId: null,
      auditionCandidateId: null,
      candidates: [],
      acceptedNoteIds: Array.isArray(generation?.acceptedNoteIds) ? generation.acceptedNoteIds : []
    };
  }
  const candidates = generation.candidates.slice(0, 8);
  return {
    ...generation,
    stale: Boolean(generation.stale),
    candidateIds: Array.isArray(generation.candidateIds) ? generation.candidateIds.slice(0, 8) : candidates.map((candidate) => candidate.id),
    activeCandidateId: generation.activeCandidateId ?? null,
    auditionCandidateId: generation.auditionCandidateId ?? null,
    candidates,
    acceptedNoteIds: Array.isArray(generation.acceptedNoteIds) ? generation.acceptedNoteIds : []
  };
}

/** Normalize only the R3 runtime fields that may be absent during Pages skew. */
export function normalizeViewState(view) {
  return {
    mode: VIEW_MODES.has(view?.mode) ? view.mode : "combined",
    follow: typeof view?.follow === "boolean" ? view.follow : true
  };
}

export function normalizeHistoryState(history) {
  const canUndo = typeof history?.canUndo === "boolean" ? history.canUndo : false;
  const canRedo = typeof history?.canRedo === "boolean" ? history.canRedo : false;
  return {
    canUndo,
    canRedo,
    undoDepth: canUndo && Number.isSafeInteger(history.undoDepth) && history.undoDepth > 0 ? history.undoDepth : 0,
    redoDepth: canRedo && Number.isSafeInteger(history.redoDepth) && history.redoDepth > 0 ? history.redoDepth : 0
  };
}

export function normalizePlaybackState(playback) {
  const currentSyllableIds = Array.isArray(playback?.currentSyllableIds)
    ? playback.currentSyllableIds
    : playback?.currentSyllableId
      ? [playback.currentSyllableId]
      : [];
  return {
    ...playback,
    currentSyllableId: playback?.currentSyllableId ?? currentSyllableIds[0] ?? null,
    currentSyllableIds
  };
}

export function normalizeRuntimeState(state = {}) {
  return {
    ...state,
    selectedNoteIds: state.selectedNoteIds ?? [],
    generation: normalizeGenerationState(state.generation),
    view: normalizeViewState(state.view),
    playback: normalizePlaybackState(state.playback),
    history: normalizeHistoryState(state.history)
  };
}
