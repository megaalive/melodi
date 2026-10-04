/**
 * I1: tangkap ide. Keyboard dua oktaf, rekam take dengan jam audio, dan
 * kuantisasi ke grid snap. Modul ini tidak menyentuh canonical song; take
 * hanya hidup di memori UI sampai user menekan Pakai (satu langkah undo).
 */
import { PPQ } from "../core/model.js?v=20261003.85";
import { SNAP_TICKS } from "../core/editor.js?v=20261003.85";

export const WHITE_KEY_ROWS = Object.freeze([["a", 0], ["s", 2], ["d", 4], ["f", 5], ["g", 7], ["h", 9], ["j", 11], ["k", 12], ["l", 14]]);
export const BLACK_KEY_ROWS = Object.freeze([["w", 1], ["e", 3], ["t", 6], ["y", 8], ["u", 10]]);
export const KEYBOARD_OCTAVE_LOW = 48;
export const KEYBOARD_OCTAVE_HIGH = 72;
export const TAKE_LIMIT = 5;
export const QUANTIZE_MODES = Object.freeze(["off", "light", "strict"]);

export function gridTicksFor(snap) {
  return SNAP_TICKS[snap] ?? SNAP_TICKS["1/8"];
}

/**
 * Kuantisasi satu take. Ringan menarik 50% ke grid, Ketat 100%, dan Off
 * membiarkan waktu apa adanya. Durasi minimal satu grid supaya setiap nada
 * tetap bisa dikejar dan diedit.
 */
export function quantizeTake(events, { quantize = "off", snap = "1/8" } = {}) {
  const list = [...events].sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch);
  const grid = gridTicksFor(snap);
  const strength = quantize === "strict" ? 1 : quantize === "light" ? 0.5 : 0;
  const notes = [];
  for (const event of list) {
    const snapped = Math.round(event.startTick / grid) * grid;
    const moved = event.startTick + (snapped - event.startTick) * strength;
    const previous = notes.at(-1);
    const earliest = previous ? previous.startTick + previous.durationTicks : 0;
    notes.push({
      pitch: event.pitch,
      startTick: Math.max(0, Math.round(moved), earliest),
      durationTicks: Math.max(grid, Math.round(event.durationTicks))
    });
  }
  return notes;
}

export function takeToNotes(take, { snap = "1/8" } = {}) {
  if (!take || !Array.isArray(take.events)) return [];
  return quantizeTake(take.events, { quantize: take.quantize ?? "off", snap, originTick: 0 });
}

export function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;
  const tag = typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function keyToPitch(key, octave) {
  const lower = String(key).toLowerCase();
  const white = WHITE_KEY_ROWS.find(([name]) => name === lower);
  if (white) return KEYBOARD_OCTAVE_LOW + octave * 12 + white[1];
  const black = BLACK_KEY_ROWS.find(([name]) => name === lower);
  if (black) return KEYBOARD_OCTAVE_LOW + octave * 12 + black[1];
  return null;
}

export function keyboardDisabled(target, paletteOpen) {
  return isTypingTarget(target) || Boolean(paletteOpen);
}

export function createTake({ id, notes, quantize, tempo, key }) {
  return { id, notes, quantize, tempo, key, createdAt: Date.now(), noteCount: notes.length };
}