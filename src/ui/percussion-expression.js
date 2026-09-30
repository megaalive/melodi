import { findPercussionPiece, percussionChokeGroup } from "../instruments/percussion.js?v=20260930.20";

export function resolvePercussionExpression(song, selection) {
  if (!selection?.trackId || !selection?.hitId) return null;
  const track = (song?.tracks ?? []).find((candidate) =>
    candidate.id === selection.trackId && candidate.kind === "percussion");
  if (!track) return null;
  const hit = track.events.find((candidate) => candidate.id === selection.hitId);
  if (!hit) return null;
  const piece = findPercussionPiece(track.kitId, hit.pieceId);
  return {
    trackId: track.id,
    hitId: hit.id,
    kitId: track.kitId,
    pieceId: hit.pieceId,
    pieceName: piece?.name ?? hit.pieceId,
    startTick: hit.startTick,
    velocity: hit.velocity,
    pan: hit.pan ?? 0,
    tuning: hit.tuning ?? 0,
    articulation: hit.articulation,
    chokeGroup: percussionChokeGroup(track.kitId, hit.pieceId)
  };
}

export function percussionExpressionPatch(values) {
  const panPercent = Number(values.pan);
  const tuning = Number(values.tuning);
  return {
    startTick: Number(values.startTick),
    velocity: Number(values.velocity),
    articulation: String(values.articulation),
    pan: panPercent === 0 ? null : panPercent / 100,
    tuning: tuning === 0 ? null : tuning
  };
}
