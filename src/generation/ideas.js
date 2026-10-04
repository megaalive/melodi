/**
 * I2: kembangkan satu take jadi beberapa variasi deterministik. Tidak ada LLM
 * dan tidak ada jaringan: seed yang sama dengan input yang sama selalu
 * menghasilkan variasi yang sama, jadi agent dan pengguna melihat hasil
 * yang identik.
 *
 * Aturan yang dijaga:
 * - Nada pertama dan nada terakhir take tidak pernah berubah atau bergeser,
 *   jadi ide asli selalu audible di setiap variasi.
 * - Nada anchor atau locked milik lagu tidak pernah ikut tersentuh; variasi
 *   hanya berisi nada hasil sendiri.
 * - Semua nada tetap di dalam key dan scale lagu.
 */
import { MelodiError, PPQ } from "../core/model.js";
import { createRandom, stableHash, validateSeed } from "./random.js";
import { nearestScalePitch, nextScalePitch, scalePitches } from "./primitives.js";

export const VARIATION_KINDS = Object.freeze(["as-recorded", "passing", "syncopation", "register"]);
export const VARIATION_MIN = 2;
export const VARIATION_MAX = 3;
const GRID = 120;
const MIN_PITCH = 36;
const MAX_PITCH = 96;
const MAX_NOTES_PER_VARIATION = 64;

function fail(code) {
  throw new MelodiError(code);
}

function normalizeNotes(input) {
  if (!Array.isArray(input) || input.length === 0) fail("ideas-invalid-take");
  const allowed = new Set(["pitch", "startTick", "durationTicks"]);
  const notes = input.map((note) => {
    if (note === null || typeof note !== "object" || Array.isArray(note)
      || Object.keys(note).some((key) => !allowed.has(key))) fail("ideas-invalid-take");
    const { pitch, startTick, durationTicks } = note;
    if (!Number.isSafeInteger(pitch) || pitch < 0 || pitch > 127) fail("ideas-invalid-take");
    if (!Number.isSafeInteger(startTick) || startTick < 0) fail("ideas-invalid-take");
    if (!Number.isSafeInteger(durationTicks) || durationTicks < 1) fail("ideas-invalid-take");
    return { pitch, startTick, durationTicks };
  }).sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch);
  return notes;
}

function clampCount(count) {
  if (count === undefined) return VARIATION_MAX;
  if (!Number.isSafeInteger(count)) fail("ideas-invalid-count");
  return Math.max(VARIATION_MIN, Math.min(VARIATION_MAX, count));
}

function fit(context, pitch, fallback) {
  const fitted = nearestScalePitch(Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch)), context, MIN_PITCH, MAX_PITCH);
  return fitted ?? fallback;
}

/** Nada transitif satu arah: mengisi celah nada tanpa melodik yang jauh. */
function passingTones(notes, context, random) {
  const result = [];
  for (let index = 0; index < notes.length - 1; index += 1) {
    const current = notes[index];
    const next = notes[index + 1];
    result.push(current);
    const gap = next.startTick - (current.startTick + current.durationTicks);
    if (gap < GRID * 2) continue;
    const start = current.startTick + current.durationTicks;
    const duration = Math.max(GRID, Math.floor(gap / 2));
    if (start + duration > next.startTick) continue;
    const preferred = next.pitch >= current.pitch ? 1 : -1;
    const directions = preferred === 1 ? [1, -1] : [-1, 1];
    // Nada transitif harus berbeda dari nada kiri dan kanan supaya tidak
    // hanya mengulang nada yang sudah ada.
    const pitch = directions
      .map(direction => fit(context, nextScalePitch(current.pitch, direction, context, MIN_PITCH, MAX_PITCH) ?? current.pitch, current.pitch))
      .find(candidate => candidate !== current.pitch && candidate !== next.pitch);
    if (pitch === undefined) continue;
    result.push({ pitch, startTick: start, durationTicks: duration });
  }
  result.push(notes[notes.length - 1]);
  return result;
}

/** Sinkopasi: sebagian nada digeser setengah grid dan durasinya dipadatkan. */
function syncopation(notes, context, random) {
  return notes.map((note, index) => {
    if (index === 0 || index === notes.length - 1) return note;
    if (random() < 0.35) return note;
    const duration = Math.max(GRID, note.durationTicks - GRID);
    const shift = (note.durationTicks - duration) / 2;
    return {
      pitch: fit(context, note.pitch + (random() < 0.5 ? 1 : -1), note.pitch),
      startTick: Math.round(note.startTick + shift),
      durationTicks: duration
    };
  });
}

/** Register: satu oktaf ke atas atau ke bawah, pembuka dan penutup dijaga. */
function registerShift(notes, context, random) {
  const up = random() < 0.5 ? 1 : -1;
  return notes.map((note, index) => {
    if (index === 0 || index === notes.length - 1) return note;
    const shifted = note.pitch + up * 12;
    if (shifted < MIN_PITCH || shifted > MAX_PITCH) return note;
    return { pitch: fit(context, shifted, note.pitch), startTick: note.startTick, durationTicks: note.durationTicks };
  });
}

function capNotes(notes) {
  return notes.length <= MAX_NOTES_PER_VARIATION ? notes : notes.slice(0, MAX_NOTES_PER_VARIATION);
}

export function seedForNotes(notes) {
  const list = normalizeNotes(notes);
  return stableHash(list.map(note => `${note.pitch}:${note.startTick}:${note.durationTicks}`).join("|"));
}

export function developVariations({ notes: input, count, seed, key, scale } = {}) {
  const notes = normalizeNotes(input);
  const total = clampCount(count);
  const safeSeed = validateSeed(seed ?? seedForNotes(notes));
  const context = Object.freeze({ key, scale });
  if (scalePitches(context, MIN_PITCH, MAX_PITCH).length === 0) fail("ideas-invalid-scale");
  const kinds = VARIATION_KINDS.slice(0, total);
  return Object.freeze({
    seed: safeSeed,
    total,
    candidates: Object.freeze(kinds.map((kind, index) => {
      const candidateSeed = (safeSeed + index * 0x9e3779b1) >>> 0;
      const random = createRandom(candidateSeed);
      const built = kind === "as-recorded" ? notes
        : kind === "passing" ? passingTones(notes, context, random)
          : kind === "syncopation" ? syncopation(notes, context, random)
            : registerShift(notes, context, random);
      return Object.freeze({
        id: `variation-${index + 1}`,
        kind,
        seed: candidateSeed,
        notes: Object.freeze(capNotes(built).map(note => Object.freeze({
          pitch: note.pitch,
          startTick: note.startTick,
          durationTicks: note.durationTicks
        })))
      });
    }))
  });
}

export function variationSpan(notes) {
  const end = notes.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), 0);
  return Math.max(PPQ, Math.ceil(end / GRID) * GRID);
}
