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
import { isScalePitch, nearestScalePitch, nextScalePitch, scalePitches, tonicPitchClass } from "./primitives.js";

export const DEVELOP_KINDS = Object.freeze(["variation", "continue"]);
export const VARIATION_KINDS = Object.freeze(["ornament", "inversion", "sequence", "rhythm"]);
export const VARIATION_MIN = 2;
export const VARIATION_MAX = 4;
export const CONTINUATION_BARS = Object.freeze([1, 2]);
export const CONTINUATION_TARGETS = Object.freeze(["tonic", "dominant"]);
export const CONTINUATION_METHODS = Object.freeze(["sequence", "answer", "echo", "smooth", "leaping"]);
export const GENERATOR_PROFILES = Object.freeze({ smooth: "smooth", leaping: "leaping" });
export const CONTINUATION_COUNT = 6;
export const CONTINUATION_MIN = 4;
export const CONTINUATION_MAX = 8;
export const RESEED_ATTEMPTS = 8;
const GENERATOR_ATTEMPTS = 1;
const GENERATOR_WAVES = 2;
const MOTIF_MAX_NOTES = 4;
const MAX_SAME_RATIO = 0.5;
const FIFTH = 7;
const MIN_DISTINCT_PER_BAR = 2;
const LANDING_STEP_SEMITONES = 2;
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

/** Nada terdekat di dalam skala sekaligus di dalam jangkala vokal. */
function fitRange(context, pitch, range, fallback) {
  return fit(context, Math.max(range.minPitch, Math.min(range.maxPitch, pitch)), fallback);
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
 * Motif diambil dari take: pola onset dan durasi dalam satuan GRID plus interval
 * dua sampai empat nada terakhir, atau seluruh take bila tidak lebih dari empat
 * nada. Motif inilah bahan baku semua metode lanjutan.
 */
export function extractMotif(take) {
  const source = take.length <= MOTIF_MAX_NOTES ? take : take.slice(-MOTIF_MAX_NOTES);
  const origin = take[0].startTick;
  const intervals = [];
  for (let index = 1; index < source.length; index += 1) intervals.push(source[index].pitch - source[index - 1].pitch);
  return Object.freeze({
    length: source.length,
    intervals: Object.freeze(intervals.length > 0 ? intervals : [0]),
    onsets: Object.freeze(source.map((note) => Math.round((note.startTick - origin) / GRID))),
    durations: Object.freeze(source.map((note) => Math.max(1, Math.round(note.durationTicks / GRID)))),
    averageDuration: Math.max(1, Math.round(
      source.reduce((total, note) => total + Math.max(1, note.durationTicks / GRID), 0) / source.length
    ))
  });
}

/** Isi celah dengan pola durasi motif yang diulang, tepat sampai ujung birama. */
function packRhythm(gapUnits, pattern) {
  const source = pattern.filter((units) => units >= 1);
  const durations = [];
  let total = 0;
  let index = 0;
  while (total < gapUnits && durations.length < 64) {
    const raw = source.length > 0 ? source[index % source.length] : 2;
    const remaining = gapUnits - total;
    if (remaining <= raw) {
      durations.push(remaining);
      total = gapUnits;
      break;
    }
    durations.push(raw);
    total += raw;
    index += 1;
  }
  while (total < gapUnits) {
    durations.push(1);
    total += 1;
  }
  return durations;
}

/**
 * Pakai ulang onset take apa adanya, lalu isi sisa celah dengan nada tambahan.
 * Slot hasil fungsi ini bisa punya jeda di antaranya; jeda itulah yang membuat
 * gema take bersparse tetap terbaca.
 */
function echoRhythm(motif, gapUnits) {
  const slots = [];
  for (const [index, onset] of motif.onsets.entries()) {
    if (onset >= gapUnits) break;
    const previous = slots[slots.length - 1];
    if (previous && onset < previous.onset + previous.duration) continue;
    const next = motif.onsets[index + 1] ?? gapUnits;
    slots.push({ onset, duration: Math.max(1, Math.min(motif.durations[index], next - onset, gapUnits - onset)) });
  }
  let cursor = slots.length > 0 ? slots[slots.length - 1].onset + slots[slots.length - 1].duration : 0;
  while (cursor < gapUnits && slots.length < 64) {
    const duration = Math.max(1, Math.min(motif.averageDuration, gapUnits - cursor));
    slots.push({ onset: cursor, duration });
    cursor += duration;
  }
  if (slots.length === 0) return [{ onset: 0, duration: gapUnits }];
  const last = slots[slots.length - 1];
  last.duration = Math.max(1, gapUnits - last.onset);
  return slots;
}

// Slot motif dihitung dalam satuan GRID; di sini dikali GRID supaya benar-benar
// jadi tick pada model lagu. Onset dipakai apa adanya supaya jeda take tetap
// hidup, dan durasi dibatasi oleh nada sebelumnya supaya tidak saling menindih.
function buildNotes(slots, pitches, gapStart) {
  const notes = [];
  let cursor = gapStart;
  for (const [index, slot] of slots.entries()) {
    const startTick = Number.isSafeInteger(slot.onset) ? gapStart + slot.onset * GRID : cursor;
    const durationTicks = Math.max(1, slot.duration * GRID);
    const previous = notes[notes.length - 1];
    notes.push({
      pitch: pitches[index],
      startTick: previous ? Math.max(startTick, previous.startTick + previous.durationTicks) : startTick,
      durationTicks
    });
    cursor = notes[notes.length - 1].startTick + durationTicks;
  }
  return notes;
}


function slotsFromDurations(durations) {
  let cursor = 0;
  return durations.map((duration) => {
    const slot = { onset: cursor, duration };
    cursor += duration;
    return slot;
  });
}

/** Langkah satu anak tangga skala menuju target. */
function stepToward(pitch, target, context) {
  if (pitch === target) return pitch;
  const next = nextScalePitch(pitch, target > pitch ? 1 : -1, context, MIN_PITCH, MAX_PITCH);
  return next ?? fit(context, target, pitch);
}

/**
 * Pendaratan wajib: nada terakhir frasa lanjutan harus didekati dengan langkah
 * satu atau dua semitone, atau dengan nada se-oktaf dari anchor B. Nada anchor B
 * sendiri bukan bagian kandidat, jadi yang diatur adalah nada pendaratannya.
 */
function landOnAnchor(pitches, target, context, range) {
  if (pitches.length === 0) return pitches;
  const landed = [...pitches];
  const current = landed[landed.length - 1];
  const interval = Math.abs(target - current);
  if ((interval >= 1 && interval <= LANDING_STEP_SEMITONES) || (interval !== 0 && interval % 12 === 0)) {
    return landed;
  }
  const approach = scalePitches(context, range.minPitch, range.maxPitch)
    .filter((pitch) => pitch !== current
      && Math.abs(pitch - target) >= 1
      && Math.abs(pitch - target) <= LANDING_STEP_SEMITONES);
  if (approach.length === 0) return pitches;
  const previous = landed.length >= 2 ? landed[landed.length - 2] : null;
  const leaps = previous !== null && Math.abs(current - previous) >= FIFTH;
  const towardsTarget = previous === null ? 0 : Math.sign(previous - target);
  // Nada pendaratan dipilih yang paling dekat dengan nada sebelumnya, lalu yang
  // paling dekat dengan anchor B. Setelah lompatan besar, arahnya dibalik supaya
  // perpindahan ke anchor B justru menjadi jawabannya.
  const best = approach
    .map((pitch) => ({
      pitch,
      reverses: Math.sign(pitch - previous) === -towardsTarget,
      fromPrevious: previous === null ? 0 : Math.abs(pitch - previous),
      toTarget: Math.abs(pitch - target)
    }))
    .sort((left, right) => Number(leaps && !left.reverses) - Number(leaps && !right.reverses)
      || left.fromPrevious - right.fromPrevious
      || left.toTarget - right.toTarget)[0];
  if (previous !== null && best.fromPrevious > 4) return pitches;
  landed[landed.length - 1] = best.pitch;
  return landed;
}

/** Register hanya dipakai kalau seluruh frasa masih di dalam jangkala vokal. */
function applyRegister(pitches, register, range) {
  if (register === 0) return pitches;
  const shifted = pitches.map((pitch) => pitch + register);
  return shifted.every((pitch) => pitch >= range.minPitch && pitch <= range.maxPitch) ? shifted : pitches;
}

/**
 * Loncatan besar selalu dibalikkan arah pada nada berikutnya supaya frasa
 * tidak berhenti dengan lompatan tanpa jawaban.
 */
function resolveLeaps(pitches, context, range) {
  const resolved = [...pitches];
  for (let index = 0; index < resolved.length - 2; index += 1) {
    const leap = resolved[index + 1] - resolved[index];
    if (Math.abs(leap) < FIFTH) continue;
    const follow = resolved[index + 2];
    const reversed = Math.sign(follow - resolved[index + 1]) === -Math.sign(leap)
      && Math.abs(follow - resolved[index + 1]) <= 4;
    if (reversed) continue;
    const back = fitRange(context, stepToward(resolved[index + 1], resolved[index], context), range, follow);
    if (back !== resolved[index + 1]) resolved[index + 2] = back;
  }
  return resolved;
}

// Ekor frasa berjalan langkah demi langkah menuju anchor B supaya pendaratan
  // selalu bisa approached tanpa lompatan besar dari nada sebelumnya.
function walkTail(pitches, target, context, range, steps) {
  if (pitches.length < 2 || steps < 1) return pitches;
  const walked = [...pitches];
  for (let slot = walked.length - steps; slot < walked.length; slot += 1) {
    const previous = walked[slot - 1];
    const remaining = walked.length - slot;
    const aim = previous + Math.sign(target - previous)
      * Math.max(1, Math.round(Math.abs(target - previous) / remaining));
    const next = fitRange(context, aim, range, previous);
    walked[slot] = next === previous ? stepToward(previous, target, context) : next;
  }
  return walked;
}

// Nada pembuka frasa selalu satu anak tangga dari anchor A supaya transisi
// masuk bukan pengulangan nada yang sama.
function motifOpening(anchorAPitch, direction, context) {
  const opening = shiftScalePitch(anchorAPitch, direction, context, anchorAPitch);
  return opening === anchorAPitch ? fit(context, anchorAPitch + 2 * direction, anchorAPitch) : opening;
}

/**
 * Irama celah: pola durasi motif diulang dan diperketat supaya tiap birama
 * punya cukup nada berbeda. Seed hanya memilih apakah motif dipakai utuh atau
 * dipotong dua.
 */
function rhythmFor(gapUnits, motif, random) {
  const whole = random() < 0.35;
  const pattern = whole ? motif.durations : motif.durations.map((units) => Math.max(1, Math.floor(units / 2)));
  return packRhythm(gapUnits, pattern);
}

/** Sekuens: motif diulang, digeser satu sampai dua anak tangga skala per putaran. */
function sequencePitches(motif, count, anchorAPitch, target, context, range, random) {
  const steps = 1 + Math.floor(random() * 2);
  const direction = random() < 0.5 ? 1 : -1;
  const register = random() < 0.4 ? 12 * (random() < 0.5 ? 1 : -1) : 0;
  const pitches = [motifOpening(anchorAPitch, direction, context)];
  let current = pitches[0];
  let index = 0;
  for (let slot = 1; slot < count; slot += 1) {
    if (index === motif.intervals.length) {
      index = 0;
      current = shiftScalePitch(current, steps * direction, context, current);
    } else {
      current = fitRange(context, current + motif.intervals[index], range, current);
      index += 1;
    }
    pitches.push(current);
  }
  return applyRegister(pitches, register, range);
}

/** Jawab: kontur motif dicerminkan, lalu langkah demi langkah menuju anchor B. */
function answerPitches(motif, count, anchorAPitch, target, context, range, random) {
  const mirrored = motif.intervals.map((interval) => -interval);
  const shape = random() < 0.5 ? mirrored : mirrored.reverse();
  const direction = random() < 0.5 ? 1 : -1;
  const walkFrom = Math.max(2, count - Math.ceil(count / 3));
  const pitches = [motifOpening(anchorAPitch, direction, context)];
  let current = pitches[0];
  let index = 0;
  for (let slot = 1; slot < count; slot += 1) {
    if (slot >= walkFrom) {
      current = stepToward(current, target, context);
    } else {
      current = fitRange(context, current + shape[index % shape.length], range, current);
      index += 1;
    }
    pitches.push(current);
  }
  return pitches;
}

/** Gema: onset take dipakai ulang, pitch-nya jalan skala dari nada lain. */
function echoPitches(motif, count, anchorAPitch, target, context, range, random) {
  const direction = random() < 0.5 ? 1 : -1;
  const register = random() < 0.5 ? 0 : 12 * (random() < 0.5 ? 1 : -1);
  const openingSteps = 1 + Math.floor(random() * 2);
  const pitches = [];
  let current = shiftScalePitch(anchorAPitch, openingSteps * direction, context, anchorAPitch);
  if (current === anchorAPitch) current = motifOpening(anchorAPitch, direction, context);
  for (let slot = 0; slot < count; slot += 1) {
    if (slot > 0) {
      current = fitRange(context, current + motif.intervals[(slot - 1) % motif.intervals.length] * direction, range, current);
      if (slot % 2 === 0) current = stepToward(current, target, context);
    }
    pitches.push(current);
  }
  return walkTail(applyRegister(pitches, register, range), target, context, range, Math.max(1, Math.ceil(count / 6)));
}

function distinctPitches(pitches) {
  return new Set(pitches).size;
}

/**
 * Saring kandidat: terlalu banyak nada sama, terlalu sedikit nada berbeda per
 * birama, atau tidak mendarat di anchor B berarti kandidat dibuang.
 */
export function acceptableContinuation(notes, { context, gap, anchorAPitch, gapUnits }) {
  if (!Array.isArray(notes) || notes.length < 2) return false;
  const pitches = [anchorAPitch, ...notes.map((note) => note.pitch)];
  let same = 0;
  for (let index = 1; index < pitches.length; index += 1) if (pitches[index] === pitches[index - 1]) same += 1;
  if (same / (pitches.length - 1) > MAX_SAME_RATIO) return false;
  const distinct = new Set(pitches).size;
  const bars = Math.max(1, Math.round(gapUnits / (gapUnits / gap.bars)));
  if (distinct / bars < MIN_DISTINCT_PER_BAR) return false;
  const target = gap.anchorPitch;
  const last = notes[notes.length - 1].pitch;
  const interval = Math.abs(target - last);
  if (!((interval >= 1 && interval <= LANDING_STEP_SEMITONES) || (interval !== 0 && interval % 12 === 0))) return false;
  // Setiap lompatan di dalam frasa harus dibalikkan arah pada nada berikutnya;
  // interval terakhir bukan bagian pemeriksaan karena itu sudah diukur di atas.
  for (let index = 0; index < pitches.length - 2; index += 1) {
    const leap = pitches[index + 1] - pitches[index];
    if (Math.abs(leap) < FIFTH) continue;
    const follow = pitches[index + 2];
    if (Math.sign(follow - pitches[index + 1]) !== -Math.sign(leap) || Math.abs(follow - pitches[index + 1]) > 4) {
      return false;
    }
  }
  const end = gap.endTick;
  if (notes[notes.length - 1].startTick + notes[notes.length - 1].durationTicks !== end) return false;
  return notes.every((note) => isScalePitch(note.pitch, context.key, context.scale)
    && note.startTick >= gap.startTick
    && note.startTick % GRID === 0
    && note.durationTicks >= 1);
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
  const gap = Object.freeze({
    startTick: gapStart,
    endTick: gapEnd,
    bars: barCount,
    target: degree,
    anchorPitch: anchorBPitch
  });
  const gapUnits = (gapEnd - gapStart) / GRID;
  const motif = extractMotif(take);
  const baseNotes = freezeNotes(take);

  // Kandidat dari generator tab Edit hanya dipakai lewat profil smooth dan
  // leaping; profil balanced tetap dipakai sebagai cadangan terakhir supaya
  // generateGap tidak pernah berubah perilakunya.
  const viaProfile = (profile, seed) => {
    const result = generateGap(transient, {
      startTick: gapStart,
      endTick: gapEnd,
      leftAnchorNoteId: anchorA.id,
      rightAnchorNoteId: anchorB.id,
      transientAnchorNoteIds: [anchorA.id, anchorB.id],
      seed,
      candidateCount: CONTINUATION_MIN,
      voiceRange: range,
      styleProfile: GENERATOR_PROFILES[profile] ?? profile
    });
    const best = result.candidates[0];
    return best ? best.notes.map(pick) : null;
  };

  const builders = [
    {
      method: "sequence",
      attempts: RESEED_ATTEMPTS,
      waves: RESEED_ATTEMPTS,
      build: (seed) => {
        const random = createRandom(seed);
        const durations = rhythmFor(gapUnits, motif, random);
        return buildNotes(
          slotsFromDurations(durations),
          landOnAnchor(resolveLeaps(sequencePitches(motif, durations.length, anchorAPitch, anchorBPitch, context, range, random), context, range), anchorBPitch, context, range),
          gapStart
        );
      }
    },
    {
      method: "answer",
      attempts: RESEED_ATTEMPTS,
      waves: RESEED_ATTEMPTS,
      build: (seed) => {
        const random = createRandom(seed);
        const durations = rhythmFor(gapUnits, motif, random);
        return buildNotes(
          slotsFromDurations(durations),
          landOnAnchor(
            resolveLeaps(answerPitches(motif, durations.length, anchorAPitch, anchorBPitch, context, range, random), context, range),
            anchorBPitch,
            context,
            range
          ),
          gapStart
        );
      }
    },
    {
      method: "echo",
      attempts: RESEED_ATTEMPTS,
      waves: RESEED_ATTEMPTS,
      build: (seed) => {
        const slots = echoRhythm(motif, gapUnits);
        return buildNotes(
          slots,
          landOnAnchor(
            resolveLeaps(echoPitches(motif, slots.length, anchorAPitch, anchorBPitch, context, range, createRandom(seed)), context, range),
            anchorBPitch,
            context,
            range
          ),
          gapStart
        );
      }
    },
    { method: "smooth", attempts: GENERATOR_ATTEMPTS, waves: GENERATOR_WAVES, build: (seed) => viaProfile("smooth", seed) },
    { method: "leaping", attempts: GENERATOR_ATTEMPTS, waves: GENERATOR_WAVES, build: (seed) => viaProfile("leaping", seed) }
  ];

  const filter = { context, gap, anchorAPitch, gapUnits };
  const seen = new Set();
  const pool = [];
  const methods = new Set();
  // Gelombang bergilir: tiap metode menyumbang satu kandidat per gelombang,
  // sehingga enam kandidat memakai sedikitnya tiga metode berbeda.
  for (let wave = 0; wave < RESEED_ATTEMPTS && pool.length < requested; wave += 1) {
    for (const [index, builder] of builders.entries()) {
      if (pool.length >= requested || wave >= builder.waves) break;
      // Setiap metode menawarkan beberapa seed; yang dipakai adalah kandidat
      // dengan nada berbeda terbanyak, supaya ambang "nada berbeda per birama"
      // terpenuhi tanpa menambah jumlah kandidat.
      // Setiap metode mencoba beberapa seed; yang dipakai adalah kandidat dengan
      // nada berbeda terbanyak supaya ambang "nada berbeda per birama" tercapai
      // tanpa menambah jumlah kandidat.
      let best = null;
      for (let attempt = 0; attempt < builder.attempts; attempt += 1) {
        const seed = candidateSeed(safeSeed, index, wave * RESEED_ATTEMPTS + attempt);
        let built = null;
        try {
          built = builder.build(seed);
        } catch {
          built = null;
        }
        if (!built || !acceptableContinuation(built, filter)) continue;
        const capped = capNotes(linearize(built));
        const hash = notesHash(capped);
        if (seen.has(hash)) continue;
        const distinct = distinctPitches([anchorAPitch, ...capped.map((note) => note.pitch)]);
        if (!best || distinct > best.distinct) best = { method: builder.method, seed, notes: capped, hash, distinct };
      }
      if (!best) continue;
      seen.add(best.hash);
      methods.add(best.method);
      pool.push({ method: best.method, seed: best.seed, notes: best.notes, hash: best.hash });
    }
  }

  // Cadangan terakhir: profil balanced hanya dipanggil kalau tidak ada satu pun
  // metode motif yang lolos, supaya generateGap tidak menambah biaya normal.
  const picked = pool.slice(0, requested);
  if (picked.length === 0) {
    const balanced = viaProfile("balanced", safeSeed);
    if (balanced && balanced.length > 0) {
      picked.push({ method: "balanced", seed: safeSeed, notes: capNotes(linearize(balanced)), hash: notesHash(balanced) });
      methods.add("balanced");
    }
  }
  const candidates = picked.map((entry, index) => Object.freeze({
    id: `continue-${index + 1}`,
    kind: "continue",
    seed: entry.seed,
    notes: freezeNotes(entry.notes),
    baseNotes,
    meta: Object.freeze({
      bars: barCount,
      target: degree,
      gapStart,
      gapEnd,
      anchorPitch: anchorBPitch,
      method: entry.method,
      motifNotes: motif.length,
      score: entry.score ?? 0
    })
  }));
  return Object.freeze({
    kind: "continue",
    seed: safeSeed,
    total: candidates.length,
    requested,
    methods: [...methods],
    sourceNotes: baseNotes,
    gap,
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