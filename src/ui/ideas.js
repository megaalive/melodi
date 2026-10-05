/**
 * I1: tangkap ide. Keyboard dua oktaf penuh, rekam take dengan jam audio, dan
 * kuantisasi ke grid snap. Modul ini tidak menyentuh canonical song; take
 * hanya hidup di memori UI sampai user menekan Pakai (satu langkah undo).
 */
import { PPQ } from "../core/model.js?v=20261003.93";
import { SNAP_TICKS } from "../core/editor.js?v=20261003.93";

export const WHITE_KEY_ROWS = Object.freeze([["a", 0], ["s", 2], ["d", 4], ["f", 5], ["g", 7], ["h", 9], ["j", 11], ["k", 12], ["l", 14]]);
export const BLACK_KEY_ROWS = Object.freeze([["w", 1], ["e", 3], ["t", 6], ["y", 8], ["u", 10]]);
export const KEYBOARD_OCTAVE_LOW = 48;
export const KEYBOARD_OCTAVES = 2;
export const KEYBOARD_WHITE_COUNT = KEYBOARD_OCTAVES * 7;
export const KEYBOARD_BLACK_COUNT = KEYBOARD_OCTAVES * 5;
export const KEYBOARD_MIN_OCTAVE = 0;
export const KEYBOARD_MAX_OCTAVE = 3;
export const KEYBOARD_DEFAULT_OCTAVE = 1;
export const TAKE_LIMIT = 5;
export const QUANTIZE_MODES = Object.freeze(["off", "light", "strict"]);
export const CONTOUR_WIDTH = 96;
export const CONTOUR_HEIGHT = 24;
export const CONTOUR_PADDING = 2;

const SEMITONE_OFFSETS = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
const BLACK_SLOT_OFFSETS = Object.freeze([0, 1, 3, 4, 5]);

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

/** Nada terendah keyboard yang bisa dipilih, dibatasi supaya dua oktaf selalu utuh. */
export function keyboardBaseFor(octave) {
  const bounded = Math.max(KEYBOARD_MIN_OCTAVE, Math.min(KEYBOARD_MAX_OCTAVE, Math.round(Number(octave) || 0)));
  return KEYBOARD_OCTAVE_LOW + bounded * 12;
}

/** Rentang nada yang ditampilkan keyboard untuk satu octave pilihan. */
export function keyboardRangeFor(octave) {
  const base = keyboardBaseFor(octave);
  const rows = keyboardRows(base);
  return Object.freeze({
    low: rows.white[0].pitch,
    high: rows.white[rows.white.length - 1].pitch
  });
}

/**
 * Dua oktaf penuh dari nada dasar. Slot tombol hitam dihitung dari posisi putih
 * di sebelah kiri supaya penempatan tidak bergantung pada daftar CSS.
 */
export function keyboardRows(basePitch = KEYBOARD_OCTAVE_LOW) {
  const white = [];
  const black = [];
  const hotkeys = new Map([...WHITE_KEY_ROWS, ...BLACK_KEY_ROWS].map(([name, offset]) => [offset, name]));
  for (let octave = 0; octave < KEYBOARD_OCTAVES; octave += 1) {
    for (const [index, semitone] of SEMITONE_OFFSETS.entries()) {
      white.push({
        pitch: basePitch + octave * 12 + semitone,
        hotkey: hotkeys.get(octave * 12 + semitone) ?? null
      });
    }
    for (const leftIndex of BLACK_SLOT_OFFSETS) {
      const semitone = SEMITONE_OFFSETS[leftIndex] + 1;
      const slot = octave * SEMITONE_OFFSETS.length + leftIndex + 1;
      black.push({
        pitch: basePitch + octave * 12 + semitone,
        hotkey: hotkeys.get(octave * 12 + semitone) ?? null,
        slot,
        slotPercent: ((slot / KEYBOARD_WHITE_COUNT) * 100).toFixed(4)
      });
    }
  }
  return { white, black };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Geometri mini-kontur untuk satu kartu kandidat. Sumbu waktu memakai durasi
 * nada supaya jeda ikut terlihat, sumbu tinggi memakai rentang pitch supaya
 * garis selalu mengisi kotaknya tanpa perlu library gambar.
 */
export function contourGeometry(notes, {
  width = CONTOUR_WIDTH,
  height = CONTOUR_HEIGHT,
  padding = CONTOUR_PADDING
} = {}) {
  const list = Array.isArray(notes) ? notes.filter((note) => note && Number.isFinite(note.pitch)) : [];
  const viewBox = `0 0 ${width} ${height}`;
  if (list.length === 0) return { points: "", viewBox, noteCount: 0, empty: true };
  const sorted = [...list].sort((left, right) => left.startTick - right.startTick);
  const lowest = Math.min(...sorted.map((note) => note.pitch));
  const highest = Math.max(...sorted.map((note) => note.pitch));
  const pitchSpan = Math.max(1, highest - lowest);
  const first = sorted[0].startTick;
  const last = sorted.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), first);
  const timeSpan = Math.max(1, last - first);
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);
  const points = sorted.map((note) => {
    const x = padding + ((note.startTick - first) / timeSpan) * innerWidth;
    const y = padding + innerHeight - ((note.pitch - lowest) / pitchSpan) * innerHeight;
    return `${round(x)},${round(y)}`;
  }).join(" ");
  return { points, viewBox, noteCount: sorted.length, empty: false };
}

export function createTake({ id, notes, quantize, tempo, key }) {
  return { id, notes, quantize, tempo, key, createdAt: Date.now(), noteCount: notes.length };
}