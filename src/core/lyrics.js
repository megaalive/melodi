/** Pick the first linked syllable in canonical lyric order for an active note. */
export function getActiveSyllableId(lyrics, currentNoteId) {
  if (typeof currentNoteId !== "string" || !currentNoteId) return null;
  const syllables = Array.isArray(lyrics?.syllables) ? lyrics.syllables : [];
  return syllables.find((syllable) => Array.isArray(syllable?.noteIds) && syllable.noteIds.includes(currentNoteId))?.id ?? null;
}
