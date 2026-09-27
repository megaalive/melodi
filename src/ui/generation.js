const GENERATION_GRID_TICKS = 120;
const MAX_GENERATION_TICKS = 64 * GENERATION_GRID_TICKS;

export function resolveSelectedAnchorGap(song, selectedNoteIds) {
  if (!Array.isArray(selectedNoteIds) || selectedNoteIds.length !== 2) {
    return { status: "select-two" };
  }

  const selectedNotes = selectedNoteIds.map((noteId) => song.notes.find((note) => note.id === noteId));
  if (selectedNotes.some((note) => !note)) return { status: "select-two" };
  if (selectedNotes.some((note) => !note.anchor)) return { status: "mark-two" };

  const [leftAnchor, rightAnchor] = selectedNotes.sort((left, right) =>
    left.startTick - right.startTick || left.durationTicks - right.durationTicks || left.id.localeCompare(right.id));
  const startTick = leftAnchor.startTick + leftAnchor.durationTicks;
  const endTick = rightAnchor.startTick;
  if (endTick <= startTick) return { status: "empty" };
  if (startTick % GENERATION_GRID_TICKS !== 0 || endTick % GENERATION_GRID_TICKS !== 0) {
    return { status: "grid" };
  }
  if (endTick - startTick > MAX_GENERATION_TICKS) return { status: "too-long" };

  return {
    status: "ready",
    gap: {
      startTick,
      endTick,
      leftAnchorNoteId: leftAnchor.id,
      rightAnchorNoteId: rightAnchor.id
    }
  };
}
