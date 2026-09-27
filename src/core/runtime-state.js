const VIEW_MODES = new Set(["score", "piano-roll", "combined", "lyrics"]);

/** Normalize only the R3 runtime fields that may be absent during Pages skew. */
export function normalizeViewState(view) {
  return {
    mode: VIEW_MODES.has(view?.mode) ? view.mode : "combined",
    follow: typeof view?.follow === "boolean" ? view.follow : true
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
    view: normalizeViewState(state.view),
    playback: normalizePlaybackState(state.playback)
  };
}
