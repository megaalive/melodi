/** Pick the first linked syllable in canonical lyric order for an active note. */
export function getActiveSyllableId(lyrics, currentNoteId) {
  if (typeof currentNoteId !== "string" || !currentNoteId) return null;
  const syllables = Array.isArray(lyrics?.syllables) ? lyrics.syllables : [];
  return syllables.find((syllable) => Array.isArray(syllable?.noteIds) && syllable.noteIds.includes(currentNoteId))?.id ?? null;
}

const VOWELS = /[aeiouyáàâäãåæéèêëíìîïóòôöõúùûüýÿ]+/giu;
const COMMON_ONSETS = ["bl", "br", "ch", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "kl", "kr", "ph", "pl", "pr", "sh", "sl", "sm", "sn", "sp", "st", "sw", "th", "tr", "tw", "wh", "wr"];

function syllabifyToken(token) {
  const first = token.search(/[\p{L}\p{M}\p{N}]/u);
  if (first < 0) return [];
  const last = Math.max(...[...token.matchAll(/[\p{L}\p{M}\p{N}]/gu)].map((match) => match.index + match[0].length));
  const prefix = token.slice(0, first);
  const body = token.slice(first, last);
  const suffix = token.slice(last);
  const nuclei = [...body.matchAll(VOWELS)];
  if (nuclei.length < 2) return [`${prefix}${body}${suffix}`];

  const pieces = [];
  let boundary = 0;
  for (let index = 1; index < nuclei.length; index += 1) {
    const previous = nuclei[index - 1];
    const current = nuclei[index];
    const gap = body.slice(previous.index + previous[0].length, current.index);
    const onset = COMMON_ONSETS.find((cluster) => gap.toLowerCase().endsWith(cluster))?.length ?? (gap.length ? 1 : 0);
    const nextBoundary = Math.max(boundary + 1, current.index + current[0].length - current[0].length - onset);
    if (nextBoundary > boundary && nextBoundary < body.length) {
      pieces.push(body.slice(boundary, nextBoundary));
      boundary = nextBoundary;
    }
  }
  pieces.push(body.slice(boundary));
  pieces[0] = `${prefix}${pieces[0]}`;
  pieces[pieces.length - 1] += suffix;
  return pieces.filter(Boolean);
}

/** Heuristic, editable syllable boundaries for lyric-first entry; not a speech/language oracle. */
export function syllabifyLyrics(rawText) {
  if (typeof rawText !== "string") return [];
  const syllables = [];
  for (const token of rawText.trim().split(/\s+/u).filter(Boolean)) {
    const parts = syllabifyToken(token);
    if (parts.length) syllables.push(...parts);
    else if (syllables.length) syllables[syllables.length - 1] += token;
  }
  return syllables;
}
