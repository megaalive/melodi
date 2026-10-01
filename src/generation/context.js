import { createSong, MelodiError } from "../core/model.js";

function fail(code) {
  throw new MelodiError(code);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function overlaps(note, startTick, endTick) {
  return note.startTick < endTick && note.startTick + note.durationTicks > startTick;
}

export function createGenerationContext(songInput, request) {
  let song;
  try {
    song = createSong(songInput);
  } catch {
    fail("generation-invalid-context");
  }
  if (!request || typeof request !== "object" || Array.isArray(request)) fail("generation-invalid-gap");

  const { startTick, endTick } = request;
  if (!Number.isSafeInteger(startTick) || startTick < 0
    || !Number.isSafeInteger(endTick) || endTick < 0) fail("generation-invalid-gap");
  if (endTick <= startTick) fail("generation-empty-gap");
  if (startTick % 120 !== 0 || endTick % 120 !== 0) fail("generation-gap-grid");
  if ((endTick - startTick) / 120 > 64) fail("generation-gap-too-long");

  const leftCandidates = song.notes.filter((note) => note.anchor
    && note.startTick + note.durationTicks === startTick);
  const rightCandidates = song.notes.filter((note) => note.anchor && note.startTick === endTick);
  const leftAnchorNoteId = request.leftAnchorNoteId ?? (leftCandidates.length === 1 ? leftCandidates[0].id : null);
  const rightAnchorNoteId = request.rightAnchorNoteId ?? (rightCandidates.length === 1 ? rightCandidates[0].id : null);
  if (typeof leftAnchorNoteId !== "string" || typeof rightAnchorNoteId !== "string") {
    fail("generation-anchor-not-found");
  }
  const leftAnchor = song.notes.find((note) => note.id === leftAnchorNoteId);
  const rightAnchor = song.notes.find((note) => note.id === rightAnchorNoteId);
  if (!leftAnchor || !rightAnchor) fail("generation-anchor-not-found");
  const transientAnchorNoteIds = request.transientAnchorNoteIds ?? [];
  if (!Array.isArray(transientAnchorNoteIds) || transientAnchorNoteIds.length > 2
    || new Set(transientAnchorNoteIds).size !== transientAnchorNoteIds.length
    || transientAnchorNoteIds.some((id) => id !== leftAnchorNoteId && id !== rightAnchorNoteId)) {
    fail("generation-anchor-required");
  }
  if ((!leftAnchor.anchor && !transientAnchorNoteIds.includes(leftAnchorNoteId))
    || (!rightAnchor.anchor && !transientAnchorNoteIds.includes(rightAnchorNoteId))) {
    fail("generation-anchor-required");
  }
  if (leftAnchor.startTick + leftAnchor.durationTicks !== startTick || rightAnchor.startTick !== endTick) {
    fail("generation-anchor-boundary");
  }

  for (const note of song.notes) {
    if (note.id === leftAnchorNoteId || note.id === rightAnchorNoteId || !overlaps(note, startTick, endTick)) continue;
    fail(note.anchor || note.locked ? "generation-protected-note" : "generation-gap-occupied");
  }

  const commonPhrases = song.phrases.filter((phrase) =>
    phrase.noteIds.includes(leftAnchorNoteId) && phrase.noteIds.includes(rightAnchorNoteId));
  if (commonPhrases.length !== 1) fail("generation-cross-phrase");
  const phrase = commonPhrases[0];
  if (phrase.noteIds.indexOf(leftAnchorNoteId) >= phrase.noteIds.indexOf(rightAnchorNoteId)) {
    fail("generation-anchor-order");
  }

  const leftSyllables = song.lyrics.syllables
    .map((syllable, index) => syllable.noteIds.includes(leftAnchorNoteId) ? index : -1)
    .filter((index) => index >= 0);
  const rightSyllables = song.lyrics.syllables
    .map((syllable, index) => syllable.noteIds.includes(rightAnchorNoteId) ? index : -1)
    .filter((index) => index >= 0);
  const mappedSyllableCount = leftSyllables.length === 1 && rightSyllables.length === 1
    && rightSyllables[0] > leftSyllables[0]
    ? rightSyllables[0] - leftSyllables[0] - 1
    : null;

  const neighboringNotes = song.notes
    .filter((note) => note.id !== leftAnchorNoteId && note.id !== rightAnchorNoteId)
    .sort((left, right) => left.startTick - right.startTick || compareText(left.id, right.id));
  return Object.freeze({
    song,
    gap: Object.freeze({ startTick, endTick, leftAnchorNoteId, rightAnchorNoteId, transientAnchorNoteIds: [...transientAnchorNoteIds] }),
    leftAnchor,
    rightAnchor,
    phraseId: phrase.id,
    mappedSyllableCount,
    key: song.key,
    scale: song.scale,
    tempo: song.timing.tempo,
    timeSignature: song.timing.timeSignature,
    neighboringNotes
  });
}
