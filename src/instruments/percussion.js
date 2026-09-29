export const PERCUSSION_CAPABILITIES = Object.freeze([
  "velocity",
  "timing",
  "pan",
  "tuning",
  "articulation",
  "choke"
]);

export const GM_STANDARD_KIT = Object.freeze({
  id: "gm-standard",
  name: "GM Standard",
  pieces: Object.freeze([
    Object.freeze({ id: "crash", name: "Crash", midiNote: 49, chokeGroup: null }),
    Object.freeze({ id: "ride", name: "Ride", midiNote: 51, chokeGroup: null }),
    Object.freeze({ id: "open-hi-hat", name: "Open HH", midiNote: 46, chokeGroup: "hi-hat" }),
    Object.freeze({ id: "closed-hi-hat", name: "Closed HH", midiNote: 42, chokeGroup: "hi-hat" }),
    Object.freeze({ id: "high-tom", name: "High Tom", midiNote: 50, chokeGroup: null }),
    Object.freeze({ id: "mid-tom", name: "Mid Tom", midiNote: 47, chokeGroup: null }),
    Object.freeze({ id: "low-tom", name: "Low Tom", midiNote: 45, chokeGroup: null }),
    Object.freeze({ id: "snare", name: "Snare", midiNote: 38, chokeGroup: null }),
    Object.freeze({ id: "kick", name: "Kick", midiNote: 36, chokeGroup: null })
  ])
});

export const PERCUSSION_KITS = Object.freeze([GM_STANDARD_KIT]);

export function findPercussionKit(kitId) {
  return PERCUSSION_KITS.find((kit) => kit.id === kitId) ?? null;
}

export function findPercussionPiece(kitId, pieceId) {
  return findPercussionKit(kitId)?.pieces.find((piece) => piece.id === pieceId) ?? null;
}

export function percussionMidiNote(kitId, pieceId) {
  return findPercussionPiece(kitId, pieceId)?.midiNote ?? null;
}

export function percussionChokeGroup(kitId, pieceId) {
  return findPercussionPiece(kitId, pieceId)?.chokeGroup ?? null;
}
