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
  if ((endTick - startTick) % 120 !== 0 || (endTick - startTick) / 120 > 64) {
    fail("generation-gap-grid");
  }

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
  if (!leftAnchor.anchor || !rightAnchor.anchor) fail("generation-anchor-required");
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

  const neighboringNotes = song.notes
    .filter((note) => note.id !== leftAnchorNoteId && note.id !== rightAnchorNoteId)
    .sort((left, right) => left.startTick - right.startTick || compareText(left.id, right.id));
  return Object.freeze({
    song,
    gap: Object.freeze({ startTick, endTick, leftAnchorNoteId, rightAnchorNoteId }),
    leftAnchor,
    rightAnchor,
    phraseId: commonPhrases[0].id,
    key: song.key,
    scale: song.scale,
    tempo: song.timing.tempo,
    timeSignature: song.timing.timeSignature,
    neighboringNotes
  });
}
