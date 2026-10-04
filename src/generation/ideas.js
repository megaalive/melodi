/**
 * I2: kembangkan satu take jadi variasi deterministik atau lanjutan frasa.
 * Tidak ada LLM dan tidak ada jaringan: seed yang sama dengan input yang sama
 * selalu menghasilkan hasil yang sama, jadi agent dan pengguna melihat
 * kandidat yang identik.
 *
 * Dua arah pengembangan:
 * - variation: empat transformasi melodik yang semuanya memakai seed dan
 *   berlaku juga untuk take legato tanpa jeda.
 * - continue: frasa asli dipakai sebagai anchor A, anchor B ditempatkan satu
 *   atau dua birama kemudian pada nada Tonik atau Dominan, lalu generator gap
 *   yang sudah ada mengisi celah di antara keduanya. Lagu asli tidak pernah
 *   disentuh: generator berjalan pada lagu sementara yang dibangun di memori.
 *
 * Aturan yang dijaga:
 * - Nada pertama dan nada terakhir take tidak pernah berubah pada variasi, jadi
 *   ide asli selalu audible di setiap variasi.
 * - Setiap kandidat wajib berbeda dari take asli dan dari kandidat lain. Kalau
 *   sebuah jenis menghasilkan duplikat, seed berikutnya dicoba maksimal delapan
 *   kali; kalau tetap sama, kandidat itu tidak pernah ditampilkan.
 * - Nada anchor atau locked milik lagu tidak pernah ikut tersentuh.
 * - Semua nada tetap di dalam key dan scale lagu dan tidak saling menindih.
 */
import { MelodiError, PPQ, createSong } from "../core/model.js";
import { generateGap } from "./generator.js";
import { createRandom, stableHash, validateSeed } from "./random.js";
import { nearestScalePitch, nextScalePitch, scalePitches, tonicPitchClass } from "./primitives.js";

export const DEVELOP_KINDS = Object.freeze(["variation", "continue"]);
export const VARIATION_KINDS = Object.freeze(["ornament", "inversion", "sequence", "rhythm"]);
export const VARIATION_MIN = 2;
export const VARIATION_MAX = 4;
export const CONTINUATION_BARS = Object.freeze([1, 2]);
export const CONTINUATION_TARGETS = Object.freeze(["tonic", "dominant"]);
export const CONTINUATION_COUNT = 6;
export const CONTINUATION_MIN = 4;
export const CONTINUATION_MAX = 8;
export const RESEED_ATTEMPTS = 8;
const GRID = 120;
const MIN_PITCH = 36;
const MAX_PITCH = 96;
const MAX_NOTES_PER_VARIATION = 64;
const GOLDEN = 0x9e3779b1;
const MIX = 0x85ebca6b;

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

function clampCount(count, min, max, fallback = max) {
  if (count === undefined) return fallback;
  if (!Number.isSafeInteger(count)) fail("ideas-invalid-count");
  return Math.max(min, Math.min(max, count));
}

function pick(note) {
  return { pitch: note.pitch, startTick: note.startTick, durationTicks: note.durationTicks };
}

function freezeNotes(notes) {
  return Object.freeze(notes.map((note) => Object.freeze(pick(note))));
}

function capNotes(notes) {
  return notes.length <= MAX_NOTES_PER_VARIATION ? notes : notes.slice(0, MAX_NOTES_PER_VARIATION);
}

/**
 * Nada selalu dipesan ulang supaya tidak saling menindih. Empat transformasi
 * di bawah hanya mengubah pitch, memecah durasi, atau memperpendek durasi di
 * dalam rentang nada yang sudah ada, jadi penjaga ini hanya menutup celah pada
 * take yang masukannya sendiri tumpang tindih.
 */
function linearize(notes) {
  const sorted = [...notes].sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch);
  let end = 0;
  return sorted.map((note) => {
    const startTick = Math.max(note.startTick, end);
    const durationTicks = Math.max(1, note.durationTicks - (startTick - note.startTick));
    end = startTick + durationTicks;
    return { pitch: note.pitch, startTick, durationTicks };
  });
}

/** Hash isi nada; dipakai membandingkan kandidat satu sama lain. */
export function notesHash(notes) {
  return stableHash(notes.map((note) => `${note.pitch}:${note.startTick}:${note.durationTicks}`).join("|"));
}

/** Nada terdekat di dalam skala; jarak seri memilih bawah atau atas dari seed. */
function fit(context, pitch, fallback, preferUp = false) {
  const pitches = scalePitches(context, MIN_PITCH, MAX_PITCH);
  if (pitches.length === 0) return fallback;
  const target = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
  const sorted = [...pitches].sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right);
  const best = sorted[0];
  const second = sorted[1];
  if (second !== undefined && Math.abs(second - target) === Math.abs(best - target)) {
    return preferUp ? Math.max(best, second) : Math.min(best, second);
  }
  return best;
}

/** Jalankan nada naik atau turun sejumlah anak tangga skala. */
function shiftScalePitch(pitch, steps, context, fallback) {
  let current = pitch;
  for (let step = 0; step < Math.abs(steps); step += 1) {
    const next = nextScalePitch(current, Math.sign(steps), context, MIN_PITCH, MAX_PITCH);
    if (next === null) return fallback;
    current = next;
  }
  return current;
}

/** Hiasan: nada panjang dipecah jadi nada asli dan neighbor di paruh kedua. */
function ornament(notes, context, random) {
  const direction = random() < 0.5 ? 1 : -1;
  const result = [];
  for (const [index, note] of notes.entries()) {
    const opening = index === 0 || index === notes.length - 1;
    const head = opening ? 0 : Math.floor(note.durationTicks / 2);
    const neighbor = opening ? null : nextScalePitch(note.pitch, direction, context, MIN_PITCH, MAX_PITCH);
    if (head < GRID || note.durationTicks - head < GRID || neighbor === null || neighbor === note.pitch) {
      result.push(note);
      continue;
    }
    result.push({ pitch: note.pitch, startTick: note.startTick, durationTicks: head });
    result.push({ pitch: neighbor, startTick: note.startTick + head, durationTicks: note.durationTicks - head });
  }
  return result;
}

/** Inversi kontur: interval dicerminkan di sekitar nada pertama, lalu dipaskan ke skala. */
function inversion(notes, context, random) {
  const preferUp = random() < 0.5;
  const register = random() < 0.5 ? 0 : 12;
  const first = notes[0].pitch;
  return notes.map((note, index) => {
    if (index === 0 || index === notes.length - 1) return note;
    return { ...note, pitch: fit(context, 2 * first - note.pitch + register, note.pitch, preferUp) };
  });
}

/** Sekuens: motif digeser sejumlah anak tangga skala mengikuti arah kontur take. */
function sequenceShift(notes, context, random) {
  const contour = notes[notes.length - 1].pitch - notes[0].pitch;
  const direction = contour === 0 ? (random() < 0.5 ? 1 : -1) : Math.sign(contour);
  const steps = (1 + Math.floor(random() * 3)) * direction;
  return notes.map((note, index) => {
    if (index === 0 || index === notes.length - 1) return note;
    return { ...note, pitch: shiftScalePitch(note.pitch, steps, context, note.pitch) };
  });
}

/** Ritme: sinkopasi dengan aksen yang digeser setengah grid dan dipadatkan satu grid. */
function syncopate(notes, context, random) {
  const direction = random() < 0.5 ? 1 : -1;
  const targets = notes
    .map((note, index) => index)
    .filter((index) => index > 0 && index < notes.length - 1 && notes[index].durationTicks >= GRID * 2);
  if (targets.length === 0) return notes;
  const chosen = new Set();
  const wanted = Math.max(1, Math.ceil(targets.length / 2));
  for (let guard = 0; chosen.size < wanted && guard < 32; guard += 1) {
    chosen.add(targets[Math.floor(random() * targets.length)]);
  }
  return notes.map((note, index) => {
    if (!chosen.has(index)) return note;
    const pitch = nextScalePitch(note.pitch, direction, context, MIN_PITCH, MAX_PITCH) ?? note.pitch;
    return {
      pitch,
      startTick: note.startTick + Math.round(GRID / 2),
      durationTicks: note.durationTicks - GRID
    };
  });
}

const TRANSFORMS = Object.freeze({ ornament, inversion, sequence: sequenceShift, rhythm: syncopate });

function candidateSeed(base, kindIndex, attempt) {
  return (base + Math.imul(kindIndex + 1, GOLDEN) + Math.imul(attempt + 1, MIX)) >>> 0;
}

/**
 * Bangun satu kandidat variasi dan pastikan isinya benar-benar baru. Seed
 * berikutnya dicoba sampai delapan kali; kalau masih sama, kandidat ini
 * dibuang supaya duplikat tidak pernah masuk daftar.
 */
function distinctVariation(kind, kindIndex, notes, context, base, seen, takeHash) {
  for (let attempt = 0; attempt < RESEED_ATTEMPTS; attempt += 1) {
    const seed = candidateSeed(base, kindIndex, attempt);
    const built = capNotes(linearize(TRANSFORMS[kind](notes, context, createRandom(seed))));
    if (built.length === 0) continue;
    const hash = notesHash(built);
    if (hash === takeHash || seen.has(hash)) continue;
    return { kind, seed, notes: built, hash };
  }
  return null;
}

export function seedForNotes(notes) {
  return notesHash(normalizeNotes(notes));
}

export function developVariations({ notes: input, count, seed, key, scale } = {}) {
  const notes = linearize(normalizeNotes(input));
  const requested = clampCount(count, VARIATION_MIN, VARIATION_MAX);
  const safeSeed = validateSeed(seed ?? seedForNotes(notes));
  const context = Object.freeze({ key, scale });
  if (scalePitches(context, MIN_PITCH, MAX_PITCH).length === 0) fail("ideas-invalid-scale");
  const takeHash = notesHash(notes);
  const seen = new Set([takeHash]);
  const candidates = [];
  VARIATION_KINDS.forEach((kind, kindIndex) => {
    if (candidates.length >= requested) return;
    const built = distinctVariation(kind, kindIndex, notes, context, safeSeed, seen, takeHash);
    if (!built) return;
    seen.add(built.hash);
    candidates.push(Object.freeze({
      id: `variation-${candidates.length + 1}`,
      kind: built.kind,
      seed: built.seed,
      notes: freezeNotes(built.notes),
      baseNotes: Object.freeze([]),
      meta: Object.freeze({ notes: notes.length })
    }));
  });
  return Object.freeze({
    kind: "variation",
    seed: safeSeed,
    total: candidates.length,
    requested,
    sourceNotes: freezeNotes(notes),
    candidates: Object.freeze(candidates)
  });
}

function barTicks(timeSignature) {
  const { numerator, denominator } = timeSignature;
  const raw = PPQ * 4 * (numerator / denominator);
  return Math.max(GRID, Math.round(raw / GRID) * GRID);
}

function voiceRangeFor(notes) {
  const pitches = notes.map((note) => note.pitch);
  const lowest = Math.min(...pitches);
  const highest = Math.max(...pitches);
  const minPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH - 12, lowest - 7));
  return Object.freeze({
    minPitch,
    maxPitch: Math.min(MAX_PITCH, Math.max(minPitch + 12, highest + 7))
  });
}

/** Nada degrees di atas Tonik, diganti oktaf agar tetap dekat dengan acuan. */
function degreePitch(context, semitones, reference, fallback) {
  const tonic = tonicPitchClass(context.key);
  const wanted = ((tonic + semitones) % 12 + 12) % 12;
  const matching = scalePitches(context, MIN_PITCH, MAX_PITCH)
    .filter((pitch) => ((pitch - tonic) % 12 + 12) % 12 === wanted);
  if (matching.length > 0) {
    return matching.reduce((best, pitch) => (Math.abs(pitch - reference) < Math.abs(best - reference) ? pitch : best), matching[0]);
  }
  return fit(context, reference + semitones, fallback);
}

/**
 * Lanjutkan satu take. Nada terakhir take menjadi anchor A, anchor B berada
 * satu atau dua birama kemudian pada Tonik atau Dominan di kunci lagu, lalu
 * generator gap yang sudah dipakai tab Edit mengisi celanya. Lagu kanonik tidak
 * pernah diubah: yang diumpulkan ke generator adalah lagu sementara.
 */
export function developContinuation({ notes: input, seed, bars, target, count, key, scale, tempo, timeSignature } = {}) {
  const take = linearize(normalizeNotes(input));
  const requested = clampCount(count, CONTINUATION_MIN, CONTINUATION_MAX, CONTINUATION_COUNT);
  const safeSeed = validateSeed(seed ?? seedForNotes(take));
  const context = Object.freeze({ key, scale });
  if (scalePitches(context, MIN_PITCH, MAX_PITCH).length === 0) fail("ideas-invalid-scale");
  const meter = timeSignature ?? { numerator: 4, denominator: 4 };
  const bar = barTicks(meter);
  const random = createRandom(safeSeed);
  const barCount = CONTINUATION_BARS.includes(bars)
    ? bars
    : CONTINUATION_BARS[random() < 0.5 ? 0 : 1];
  const degree = CONTINUATION_TARGETS.includes(target)
    ? target
    : CONTINUATION_TARGETS[random() < 0.5 ? 0 : 1];
  const range = voiceRangeFor(take);
  const closing = take[take.length - 1];
  const takeEnd = closing.startTick + closing.durationTicks;
  const gapStart = Math.max(GRID, Math.ceil(takeEnd / GRID) * GRID);
  const gapEnd = gapStart + barCount * bar;
  const anchorAPitch = closing.pitch;
  const anchorBPitch = nearestScalePitch(
    Math.max(range.minPitch, Math.min(range.maxPitch, degreePitch(context, degree === "dominant" ? 7 : 0, anchorAPitch, anchorAPitch))),
    context,
    range.minPitch,
    range.maxPitch
  );
  // Nada terakhir take menjadi anchor A dengan ekor diperpanjang sampai celah
  // dimulai, jadi transisi ke frasa lanjutan tetap menyambung.
  const anchorA = {
    id: "idea-continue-anchor-a",
    pitch: anchorAPitch,
    startTick: closing.startTick,
    durationTicks: gapStart - closing.startTick,
    source: "user",
    anchor: false,
    locked: false
  };
  const anchorB = {
    id: "idea-continue-anchor-b",
    pitch: anchorBPitch,
    startTick: gapEnd,
    durationTicks: GRID,
    source: "user",
    anchor: false,
    locked: false
  };
  const earlier = take.slice(0, -1).map((note, index) => ({
    id: `idea-continue-take-${index + 1}`,
    pitch: note.pitch,
    startTick: note.startTick,
    durationTicks: note.durationTicks,
    source: "user",
    anchor: false,
    locked: false
  }));
  const noteIds = [...earlier.map((note) => note.id), anchorA.id, anchorB.id];
  const transient = createSong({
    id: `idea-continue-${safeSeed.toString(36)}`,
    title: "Ide",
    timing: { ppq: PPQ, tempo: Number.isFinite(tempo) && tempo > 0 ? tempo : 120, timeSignature: meter },
    key,
    scale,
    sections: [{ id: "idea-continue-section", name: "Ide", phraseIds: ["idea-continue-phrase"] }],
    phrases: [{ id: "idea-continue-phrase", noteIds }],
    notes: [...earlier, anchorA, anchorB],
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
  const generated = generateGap(transient, {
    startTick: gapStart,
    endTick: gapEnd,
    leftAnchorNoteId: anchorA.id,
    rightAnchorNoteId: anchorB.id,
    transientAnchorNoteIds: [anchorA.id, anchorB.id],
    seed: safeSeed,
    candidateCount: requested,
    voiceRange: range,
    styleProfile: "balanced"
  });
  const baseNotes = freezeNotes(take);
  const candidates = generated.candidates.map((candidate, index) => Object.freeze({
    id: `continue-${index + 1}`,
    kind: "continue",
    seed: safeSeed,
    notes: freezeNotes(candidate.notes),
    baseNotes,
    meta: Object.freeze({
      bars: barCount,
      target: degree,
      gapStart,
      gapEnd,
      anchorPitch: anchorBPitch,
      move: candidate.sourceMoves?.[0] ?? null,
      score: candidate.score ?? 0
    })
  }));
  return Object.freeze({
    kind: "continue",
    seed: safeSeed,
    total: candidates.length,
    requested,
    sourceNotes: baseNotes,
    gap: Object.freeze({ startTick: gapStart, endTick: gapEnd, bars: barCount, target: degree, anchorPitch: anchorBPitch }),
    candidates: Object.freeze(candidates)
  });
}

/** Satu command layer untuk kedua arah pengembangan ide. */
export function ideaDevelop({ kind = "variation", notes, count, seed, bars, target, key, scale, tempo, timeSignature } = {}) {
  if (!DEVELOP_KINDS.includes(kind)) fail("ideas-invalid-kind");
  return kind === "continue"
    ? developContinuation({ notes, seed, bars, target, count, key, scale, tempo, timeSignature })
    : developVariations({ notes, count, seed, key, scale });
}

export function variationSpan(notes) {
  const end = notes.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), 0);
  return Math.max(PPQ, Math.ceil(end / GRID) * GRID);
}