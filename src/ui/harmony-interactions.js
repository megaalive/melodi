/** Delete note tetap didahulukan; Escape melepaskan fokus chord runtime. */
export function harmonyKeyboardIntent(event, state) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
  if (event.key === "Escape" && state.selectedChordId) return "clear-chord";
  if (event.key !== "Delete" && event.key !== "Backspace") return null;
  if (state.selectedNoteIds?.length) return "delete-notes";
  return state.selectedChordId ? "delete-chord" : null;
}
