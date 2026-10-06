/**
 * I2: kembangkan satu take jadi variasi deterministik atau lanjutan frasa.
 * Tidak ada LLM dan tidak ada jaringan: seed yang sama dengan input yang sama
 * selalu menghasilkan hasil yang sama, jadi agent dan pengguna melihat
 * kandidat yang identik.
 *
 * Dua arah pengembangan:
 * - variation: sembilan transformasi melodik yang semuanya memakai seed dan
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
export const VARIATION_KINDS = Object.freeze(["ornament", "inversion", "sequence", "rhythm", "skeleton", "arpeggio", "reverse", "augment", "octave"]);
export const INTENSITIES = Object.freeze(["gentle", "medium", "bold"]);
export const DEFAULT_INTENSITY = "medium";
// Kategori dipakai memilih kartu: Nada = inversion, sequence, reverse,
// arpeggio; Ritme = rhythm, augment; Kepadatan = ornament, skeleton;
// Register = octave.
export const VARIATION_CATEGORIES = Object.freeze({
  inversion: "pitch",
  sequence: "pitch",
  reverse: "pitch",
  arpeggio: "pitch",
  rhythm: "rhythm",
  augment: "rhythm",
  ornament: "density",
  skeleton: "density",
  octave: "register"
});
export const VARIATION_MIN = 2;
export const VARIATION_MAX = 4;
// Tampilan default empat kartu + Asli; "Lebih banyak" sampai sembilan.
export const VARIATION_ALL_MAX = 9;
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
const MIN_DISTINCT_PER_BAR = Object.freeze({ 1: 4, 2: 4 });
const DURATION_RATIO_MIN = 0.5;
const DURATION_RATIO_MAX = 2;
const JOIN_LEAP_MAX = 5;

function medianTicks(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
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
 * Nada selalu dipesan ulang supaya tidak saling menindih. Transformasi
 * di bawah hanya mengubah pitch, memecah durasi, memangkas nada, atau
 * memperpanjang durasi di dalam rentang nada yang sudah ada, jadi penjaga
 * ini hanya menutup celah pada take yang masukannya sendiri tumpang tindih.
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

function normalizeIntensity(intensity) {
  if (intensity === undefined) return DEFAULT_INTENSITY;
  if (!INTENSITIES.includes(intensity)) fail("ideas-invalid-intensity");
  return intensity;
}

/** Hiasan: nada panjang dipecah jadi nada asli dan neighbor di paruh kedua. */
function ornament(notes, context, random, intensity = DEFAULT_INTENSITY) {
  const direction = random() < 0.5 ? 1 : -1;
  const result = [];
  for (const [index, note] of notes.entries()) {
    const opening = index === 0 || index === notes.length - 1;
    const head = opening ? 0 : Math.floor(note.durationTicks / 2);
    // Berani memvariasikan arah neighbor per nada; Sedang memakai satu arah
    // untuk seluruh take seperti sebelumnya.
    const toward = intensity === "bold" && !opening && random() < 0.5 ? -direction : direction;
    const neighbor = opening ? null : nextScalePitch(note.pitch, toward, context, MIN_PITCH, MAX_PITCH);
    if (head < GRID || note.durationTicks - head < GRID || neighbor === null || neighbor === note.pitch) {
      result.push(note);
      continue;
    }
    // Halus hanya menghias sebagian nada yang memenuhi syarat.
    if (intensity === "gentle" && random() >= 0.35) {
      result.push(note);
      continue;
    }
    result.push({ pitch: note.pitch, startTick: note.startTick, durationTicks: head });
    result.push({ pitch: neighbor, startTick: note.startTick + head, durationTicks: note.durationTicks - head });
  }
  return result;
}

/** Inversi kontur: interval dicerminkan di sekitar nada pertama, lalu dipaskan ke skala. */
function inversion(notes, context, random, intensity = DEFAULT_INTENSITY) {
  const preferUp = random() < 0.5;
  const legacyRegister = random() < 0.5 ? 0 : 12;
  // Berani boleh memperlebar register; Sedang tetap seperti sebelumnya.
  const register = intensity === "bold" && random() < 0.3 ? -12 : legacyRegister;
  const first = notes[0].pitch;
  return notes.map((note, index) => {
    if (index === 0 || index === notes.length - 1) return note;
    // Halus hanya membalik sebagian nada tengah.
    if (intensity === "gentle" && random() >= 0.3) return note;
    return { ...note, pitch: fit(context, 2 * first - note.pitch + register, note.pitch, preferUp) };
  });
}

/** Sekuens: motif digeser sejumlah anak tangga skala mengikuti arah kontur take. */
function sequenceShift(notes, context, random, intensity = DEFAULT_INTENSITY) {
  const contour = notes[notes.length - 1].pitch - notes[0].pitch;
  const direction = contour === 0 ? (random() < 0.5 ? 1 : -1) : Math.sign(contour);
  // Halus = geser satu tangga; Sedang = satu sampai tiga seperti sebelumnya;
  // Berani = dua sampai empat.
  const steps = intensity === "gentle"
    ? direction
    : intensity === "bold"
      ? (2 + Math.floor(random() * 3)) * direction
      : (1 + Math.floor(random() * 3)) * direction;
  return notes.map((note, index) => {
    if (index === 0 || index === notes.length - 1) return note;
    return { ...note, pitch: shiftScalePitch(note.pitch, steps, context, note.pitch) };
  });
}

/** Ritme: sinkopasi dengan aksen yang digeser setengah grid dan dipadatkan satu grid. */
function syncopate(notes, context, random, intensity = DEFAULT_INTENSITY) {
  const direction = random() < 0.5 ? 1 : -1;
  const targets = notes
    .map((note, index) => index)
    .filter((index) => index > 0 && index < notes.length - 1 && notes[index].durationTicks >= GRID * 2);
  if (targets.length === 0) return notes;
  const chosen = new Set();
  // Halus ~30%, Sedang setengah seperti sebelumnya, Berani ~70%.
  const ratio = intensity === "gentle" ? 0.3 : intensity === "bold" ? 0.7 : 0.5;
  const wanted = Math.max(1, Math.ceil(targets.length * ratio));
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

/**
 * Inti: hanya nada struktural (ketukan kuat, puncak, lembah) yang dipertahankan
 * dan durasinya diperpanjang sampai nada struktural berikutnya. Nada pembuka
 * dan penutup tetap; take di bawah tiga nada dilewati.
 */
function skeleton(notes, context, random, intensity = DEFAULT_INTENSITY) {
  if (notes.length < 3) return notes;
  const keep = new Set([0, notes.length - 1]);
  for (let index = 1; index < notes.length - 1; index += 1) {
    const strong = notes[index].startTick % PPQ === 0;
    const previous = notes[index - 1].pitch;
    const current = notes[index].pitch;
    const next = notes[index + 1].pitch;
    const peak = (current > previous && current >= next) || (current < previous && current <= next);
    if (strong || peak) keep.add(index);
  }
  // Halus menyimpan ~70%, Sedang ~50%, Berani sesedikit mungkin (min 2 nada).
  // Jaminan jenis selalu menang: take >= 4 nada berkurang >= 30%.
  const keepRatio = intensity === "gentle" ? 0.7 : intensity === "bold" ? 0.25 : 0.5;
  let wanted = Math.max(2, Math.round(notes.length * keepRatio));
  if (notes.length >= 4) wanted = Math.max(2, Math.min(wanted, Math.floor(notes.length * 0.7)));
  wanted = Math.min(wanted, notes.length);
  const ranked = notes
    .map((note, index) => ({ index, keep: keep.has(index) }))
    .sort((left, right) => Number(right.keep) - Number(left.keep) || left.index - right.index);
  const picked = new Set([0, notes.length - 1]);
  for (const entry of ranked) {
    if (picked.size >= wanted) break;
    if (entry.index === 0 || entry.index === notes.length - 1) continue;
    picked.add(entry.index);
  }
  const ordered = [...picked].sort((left, right) => left - right);
  return ordered.map((index, slot) => {
    const note = notes[index];
    const next = ordered[slot + 1] === undefined ? null : notes[ordered[slot + 1]];
    const durationTicks = next === null
      ? note.durationTicks
      : Math.max(note.durationTicks, next.startTick - note.startTick);
    return { pitch: note.pitch, startTick: note.startTick, durationTicks };
  });
}

/** Triad kunci sebagai chord tone cadangan bila tidak ada akor lagu. */
function keyTriadTones(context) {
  const tonic = tonicPitchClass(context.key);
  const degrees = [0, 2, 4].map((degree) => {
    const pitches = scalePitches(context, MIN_PITCH, MAX_PITCH)
      .filter((pitch) => ((pitch - tonic) % 12 + 12) % 12 === ((tonic + [0, 4, 7][degree]) % 12 + 12) % 12);
    return pitches;
  });
  return [...new Set(degrees.flat())].sort((left, right) => left - right);
}

/**
 * Lompat: nada tengah diganti chord tone bernada loncat. Nada pembuka dan
 * penutup tetap; take di bawah tiga nada dilewati.
 */
function arpeggio(notes, context, random, intensity = DEFAULT_INTENSITY, songChords = []) {
  if (notes.length < 3) return notes;
  const tones = keyTriadTones(context);
  const pool = tones.length > 0
    ? tones
    : scalePitches(context, MIN_PITCH, MAX_PITCH);
  if (pool.length === 0) return notes;
  const replaceRatio = intensity === "gentle" ? 0.3 : intensity === "bold" ? 0.8 : 0.5;
  const maxLeap = intensity === "gentle" ? 5 : 12;
  const result = notes.map((note) => ({ ...note }));
  let previous = notes[0].pitch;
  for (let index = 1; index < notes.length - 1; index += 1) {
    const replace = random() < replaceRatio || index === notes.length - 2;
    if (!replace) {
      previous = result[index].pitch;
      continue;
    }
    const leaping = pool
      .map((pitch) => ({ pitch, leap: Math.abs(pitch - previous) }))
      .filter((entry) => entry.leap >= 3 && entry.leap <= maxLeap)
      .sort((left, right) => left.leap - right.leap);
    const chosen = leaping.length > 0
      ? leaping[Math.floor(random() * leaping.length)].pitch
      : fit(context, previous, notes[index].pitch, random() < 0.5);
    result[index] = { ...notes[index], pitch: chosen };
    previous = chosen;
  }
  // Jaminan jenis: loncatan >= 3 semitone pada >= 40% transisi.
  const leaps = [];
  for (let index = 1; index < result.length; index += 1) {
    leaps.push(Math.abs(result[index].pitch - result[index - 1].pitch));
  }
  const ratio = leaps.filter((leap) => leap >= 3).length / Math.max(1, leaps.length);
  if (ratio < 0.4) {
    for (let index = 1; index < result.length - 1; index += 1) {
      if (Math.abs(result[index].pitch - result[index - 1].pitch) < 3) {
        const bumped = fit(context, result[index - 1].pitch + (random() < 0.5 ? 4 : -4), result[index].pitch);
        result[index] = { ...result[index], pitch: bumped };
      }
      const current = [];
      for (let step = 1; step < result.length; step += 1) current.push(Math.abs(result[step].pitch - result[step - 1].pitch));
      if (current.filter((leap) => leap >= 3).length / current.length >= 0.4) break;
    }
  }
  void songChords;
  return result;
}

/**
 * Balik: urutan pitch dibalik, ritme asli tetap. Halus hanya membalik nada
 * tengah (pembuka dan penutup tetap); Sedang dan Berani membalik seluruh
 * urutan sehingga pembuka dan penutup bertukar.
 */
function pitchReverse(notes, context, random, intensity = DEFAULT_INTENSITY) {
  void context;
  void random;
  const pitches = notes.map((note) => note.pitch);
  const flipped = intensity === "gentle"
    ? [pitches[0], ...pitches.slice(1, -1).reverse(), pitches[pitches.length - 1]]
    : [...pitches].reverse();
  return notes.map((note, index) => ({ ...note, pitch: flipped[index] ?? note.pitch }));
}

function meterBarTicks(timeSignature) {
  const meter = timeSignature ?? { numerator: 4, denominator: 4 };
  const raw = PPQ * 4 * (meter.numerator / meter.denominator);
  return Math.max(GRID, Math.round(raw / GRID) * GRID);
}

function crossesBar(note, bar) {
  if (bar <= 0) return false;
  return Math.floor(note.startTick / bar) !== Math.floor((note.startTick + note.durationTicks - 1) / bar);
}

/**
 * Perlebar (augmentasi ritme): onset dan durasi dikalikan faktor relatif
 * terhadap onset pertama, dibulatkan ke GRID; pitch tidak berubah. Halus
 * 1,5x; Sedang 2x; Berani progresif 1x ke 2x. Total <= 4 birama; bila 2x
 * melampaui, turun ke 1,5x; bila 1,5x pun melampaui, jenis ini dilewati.
 */
function augment(notes, context, random, intensity = DEFAULT_INTENSITY, chords, timeSignature) {
  void context;
  void random;
  void chords;
  // Variasi butuh min. 3 nada; take pendek menampilkan pesan khusus.
  if (notes.length < 3) return notes;
  const bar = meterBarTicks(timeSignature);
  const maxSpan = 4 * bar;
  const takeSpan = notes[notes.length - 1].startTick + notes[notes.length - 1].durationTicks - notes[0].startTick;
  // Aturan batas birama mengikuti variasi lain: take yang lebih pendek dari
  // satu birama dan tidak melintas tidak boleh menghasilkan nada yang
  // melintas. Take sepanjang satu birama atau lebih diatur oleh batas total
  // 4 birama, karena setiap peregangan >= 1,5x pasti melewati garis birama
  // berikutnya (DEVIASI terukur).
  const strictBars = takeSpan < bar && !notes.some((note) => crossesBar(note, bar));
  const base = notes[0].startTick;
  const factorsFor = (mode) => {
    if (mode === "gentle") return notes.map(() => 1.5);
    if (mode === "bold") {
      return notes.map((note, index) => (notes.length <= 1 ? 1 : 1 + index / (notes.length - 1)));
    }
    return notes.map(() => 2);
  };
  // Berani progresif memuncak di 2x; cadangannya seragam 1,5x.
  const attempts = intensity === "bold" ? ["bold", "gentle"] : [intensity, "gentle"];
  for (const mode of attempts) {
    const factors = factorsFor(mode);
    const scaled = notes.map((note, index) => ({
      pitch: note.pitch,
      startTick: base + Math.round(((note.startTick - base) * factors[index]) / GRID) * GRID,
      durationTicks: Math.max(1, Math.round((note.durationTicks * factors[index]) / GRID) * GRID)
    }));
    const end = scaled.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), base);
    if (end - base > maxSpan) continue;
    if (strictBars && scaled.some((note) => crossesBar(note, bar))) continue;
    // Faktor seragam harus benar-benar memanjangkan; progresif boleh sama
    // pada take satu nada (nanti dibuang sebagai duplikat bila sama persis).
    return scaled;
  }
  return notes;
}

const REGISTER_LO = 48;
const REGISTER_HI = 84;

function inRegister(pitch) {
  return pitch >= REGISTER_LO && pitch <= REGISTER_HI;
}

/**
 * Oktaf: pitch class semua nada tetap, hanya oktafnya yang berubah. Halus =
 * seluruh take +-12; Sedang = setengah akhir take +-12 dengan lompatan
 * sambungan terkecil; Berani = puncak +12 dan dasar -12.
 */
function octaveShift(notes, context, random, intensity = DEFAULT_INTENSITY) {
  // Variasi butuh min. 3 nada; take pendek menampilkan pesan khusus.
  if (notes.length < 3) return notes;
  const shift = (pitch, semitones) => {
    const moved = pitch + semitones;
    if (moved < MIN_PITCH || moved > MAX_PITCH) return null;
    return fit(context, moved, pitch, semitones > 0);
  };
  // Di luar [48, 84] hanya boleh bila take aslinya sudah di luar.
  const registerOk = (built) => built.every((note, index) => inRegister(note.pitch) || !inRegister(notes[index].pitch));
  if (intensity === "gentle") {
    const first = random() < 0.5 ? 12 : -12;
    for (const semitones of [first, -first]) {
      const built = [];
      for (const note of notes) {
        const moved = shift(note.pitch, semitones);
        if (moved === null || ((moved - note.pitch) % 12 + 12) % 12 !== 0) { built.length = 0; break; }
        built.push({ ...note, pitch: moved });
      }
      if (built.length === notes.length && registerOk(built)) return built;
    }
    return notes;
  }
  if (intensity === "bold") {
    if (notes.length < 2) return notes;
    const pitches = notes.map((note) => note.pitch);
    const peak = Math.max(...pitches);
    const valley = Math.min(...pitches);
    if (peak === valley) return notes;
    const peakIndex = pitches.indexOf(peak);
    let valleyIndex = pitches.lastIndexOf(valley);
    if (valleyIndex === peakIndex) valleyIndex = pitches.indexOf(valley, peakIndex + 1);
    if (valleyIndex < 0 || valleyIndex === peakIndex) return notes;
    const up = shift(peak, 12);
    const down = shift(valley, -12);
    if (up === null || down === null) return notes;
    const built = notes.map((note, index) => ({
      ...note,
      pitch: index === peakIndex ? up : index === valleyIndex ? down : note.pitch
    }));
    if (!registerOk(built)) return notes;
    return built;
  }
  // Sedang: setengah akhir take digeser dengan arah lompatan terkecil.
  const half = Math.max(1, Math.ceil(notes.length / 2));
  const junction = notes[half].pitch - notes[half - 1].pitch;
  const upLeap = Math.abs(junction + 12);
  const downLeap = Math.abs(junction - 12);
  const candidates = upLeap < downLeap
    ? [12, -12]
    : downLeap < upLeap
      ? [-12, 12]
      : random() < 0.5 ? [12, -12] : [-12, 12];
  for (const semitones of candidates) {
    const built = notes.map((note, index) => {
      if (index < half) return { ...note };
      const moved = shift(note.pitch, semitones);
      return moved === null ? null : { ...note, pitch: moved };
    });
    if (built.some((note) => note === null)) continue;
    if (!registerOk(built)) continue;
    return built;
  }
  return notes;
}

const TRANSFORMS = Object.freeze({
  ornament,
  inversion,
  sequence: sequenceShift,
  rhythm: syncopate,
  skeleton,
  arpeggio,
  reverse: pitchReverse,
  augment,
  octave: octaveShift
});

/** Peta transformasi untuk pengujian per jenis. */
export const VARIATION_TRANSFORMS = TRANSFORMS;

function candidateSeed(base, kindIndex, attempt) {
  return (base + Math.imul(kindIndex + 1, GOLDEN) + Math.imul(attempt + 1, MIX)) >>> 0;
}

/**
 * Bangun satu kandidat variasi dan pastikan isinya benar-benar baru. Seed
 * berikutnya dicoba sampai delapan kali; kalau masih sama, kandidat ini
 * dibuang supaya duplikat tidak pernah masuk daftar.
 */
function distinctVariation(kind, kindIndex, notes, context, base, seen, takeHash, { intensity, chords, meter } = {}) {
  for (let attempt = 0; attempt < RESEED_ATTEMPTS; attempt += 1) {
    const seed = candidateSeed(base, kindIndex, attempt);
    const built = capNotes(linearize(TRANSFORMS[kind](notes, context, createRandom(seed), intensity, chords, meter)));
    if (built.length === 0) continue;
    const hash = notesHash(built);
    if (hash === takeHash || seen.has(hash)) continue;
    return { kind, seed, notes: built, hash };
  }
  return null;
}

/** Acak urutan jenis berdasar seed supaya kartu default bervariasi per seed. */
function shuffledKindOrder(seed) {
  const order = VARIATION_KINDS.map((kind, index) => index);
  const random = createRandom(seed);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

function categoryOf(kind) {
  return VARIATION_CATEGORIES[kind] ?? "pitch";
}

/**
 * Pilih kartu default: minimal tiga kategori berbeda dan minimal satu Ritme
 * atau Register bila take memungkinkan, lalu isi sampai jumlah yang diminta
 * mengikuti urutan acak seed.
 */
function selectDefault(pool, requested) {
  if (pool.length <= requested) return pool;
  const picked = [];
  const categories = new Set();
  const needsRegister = pool.some((entry) => categoryOf(entry.kind) === "rhythm" || categoryOf(entry.kind) === "register");
  for (const entry of pool) {
    if (picked.length >= requested) break;
    if (requested >= 3 && categories.has(categoryOf(entry.kind))) continue;
    picked.push(entry);
    categories.add(categoryOf(entry.kind));
  }
  if (needsRegister && !picked.some((entry) => categoryOf(entry.kind) === "rhythm" || categoryOf(entry.kind) === "register")) {
    const rhythm = pool.find((entry) => !picked.includes(entry)
      && (categoryOf(entry.kind) === "rhythm" || categoryOf(entry.kind) === "register"));
    if (rhythm) {
      if (picked.length >= requested) picked.pop();
      picked.push(rhythm);
    }
  }
  for (const entry of pool) {
    if (picked.length >= requested) break;
    if (!picked.includes(entry)) picked.push(entry);
  }
  return picked.slice(0, requested);
}

export function seedForNotes(notes) {
  return notesHash(normalizeNotes(notes));
}

export function developVariations({ notes: input, count, seed, key, scale, intensity, chords, timeSignature, scope } = {}) {
  const notes = linearize(normalizeNotes(input));
  const all = scope === "all";
  const requested = all
    ? clampCount(count, VARIATION_MIN, VARIATION_ALL_MAX, VARIATION_ALL_MAX)
    : clampCount(count, VARIATION_MIN, VARIATION_MAX);
  const safeSeed = validateSeed(seed ?? seedForNotes(notes));
  const safeIntensity = normalizeIntensity(intensity);
  const context = Object.freeze({ key, scale });
  if (scalePitches(context, MIN_PITCH, MAX_PITCH).length === 0) fail("ideas-invalid-scale");
  const meter = timeSignature ?? { numerator: 4, denominator: 4 };
  const takeHash = notesHash(notes);
  const seen = new Set([takeHash]);
  const pool = [];
  for (const kindIndex of shuffledKindOrder(safeSeed)) {
    const kind = VARIATION_KINDS[kindIndex];
    const built = distinctVariation(kind, kindIndex, notes, context, safeSeed, seen, takeHash, { intensity: safeIntensity, chords, meter });
    if (!built) continue;
    seen.add(built.hash);
    pool.push(built);
  }
  const chosen = all ? pool.slice(0, requested) : selectDefault(pool, requested);
  const candidates = chosen.map((built, index) => Object.freeze({
    id: `variation-${index + 1}`,
    kind: built.kind,
    seed: built.seed,
    notes: freezeNotes(built.notes),
    baseNotes: Object.freeze([]),
    meta: Object.freeze({ notes: notes.length, intensity: safeIntensity })
  }));
  return Object.freeze({
    kind: "variation",
    seed: safeSeed,
    intensity: safeIntensity,
    scope: all ? "all" : "default",
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
  if (previous !== null && best.fromPrevious > 4) {
    // Nada sebelumnya masih jauh dari nada pendaratan, jadi nota sebelumnya
    // itu digeser satu-dua anak tangga ke arahnya, bukan kandidat dibuang.
    const before = landed.length >= 3 ? landed[landed.length - 3] : null;
    let bridge = landed[landed.length - 2];
    for (let step = 0; step < 2 && Math.abs(best.pitch - bridge) > 4; step += 1) {
      const moved = stepToward(bridge, best.pitch, context);
      if (moved === bridge) break;
      if (before !== null && Math.abs(moved - before) < 1) break;
      bridge = moved;
    }
    if (Math.abs(best.pitch - bridge) > 4) return pitches;
    landed[landed.length - 2] = bridge;
  }
  landed[landed.length - 1] = best.pitch;
  return landed;
}

// Register hanya dipakai kalau seluruh frasa masih di dalam jangkala vokal.
// Nada pertama dikecualikan supaya sambungan dari nada terakhir take tetap langkah.
function applyRegister(pitches, register, range) {
  if (register === 0 || pitches.length < 2) return pitches;
  const shifted = pitches.map((pitch, slot) => (slot === 0 ? pitch : pitch + register));
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

/**
 * Slot terkecil yang boleh dipakai: satu tingkat di bawah nada terpendek take,
 * jadi lanjutan tidak pernah pindah ke grid yang lebih halus dari take.
 */
function minSlotUnits(motif) {
  const shortest = Math.max(1, Math.min(...motif.durations));
  return Math.max(1, Math.ceil(shortest / 2));
}

/**
 * Potong slot supaya jumlah nadanya tidak melewati budget; nada terakhir
 * dipanjangkan supaya celah tetap terisi sampai `gapUnits`.
 */
function capSlots(slots, gapUnits, maxSlots) {
  if (slots.length <= maxSlots) return slots;
  const kept = slots.slice(0, maxSlots);
  const last = kept[kept.length - 1];
  last.duration = Math.max(1, gapUnits - last.onset);
  return kept;
}

/**
 * Irama celah memakai pola onset take selama jumlah nadanya sudah cukup untuk
 * ambang "nada berbeda per birama". Kalau kurang, durasi take diskalakan ke
 * kepadatan yang dibutuhkan lalu diulang sampai celah terisi. Slot terkecil
 * `minSlotUnits` supaya grid tidak pernah lebih halus dari grid take, dan
 * jumlah nada dibatasi `notesBudget` supaya tidak lebih rapat dari take.
 */
function slotsForRhythm(gapUnits, motif, notesBudget, barCount) {
  const floorUnits = minSlotUnits(motif);
  const echoSlots = echoRhythm(motif, gapUnits);
  // Satu nada ekstra per bar karena anchor A ikut dihitung pada birama pertama.
  const needed = Math.max(2, (MIN_DISTINCT_PER_BAR[barCount] ?? MIN_DISTINCT_PER_BAR[1]) * barCount);
  const maxSlots = Math.max(needed, Math.min(Math.round(gapUnits / floorUnits), Math.round(notesBudget * barCount)));
  if (motif.onsets.length < 2 || echoSlots.length >= needed * 2) {
    return capSlots(echoSlots, gapUnits, maxSlots);
  }
  const averageUnits = Math.max(floorUnits, Math.min(motif.averageDuration, Math.ceil(gapUnits / maxSlots)));
  const pattern = motif.durations.map((duration) => Math.max(
    floorUnits,
    Math.min(gapUnits, Math.round((duration / motif.averageDuration) * averageUnits))
  ));
  // Kalau pola diskalakan sudah melewati budget, pakai durasi rata-rata saja.
  const scaled = pattern.reduce((total, duration) => total + duration, 0);
  const fill = scaled > maxSlots ? [averageUnits] : pattern;
  const packed = slotsFromDurations(packRhythm(gapUnits, fill));
  const capped = capSlots(packed, gapUnits, maxSlots);
  return capped.length > echoSlots.length ? capped : echoSlots;
}

// Nada pembuka frasa selalu satu anak tangga dari anchor A supaya transisi
// masuk bukan pengulangan nada yang sama.
function motifOpening(anchorAPitch, direction, context) {
  const opening = shiftScalePitch(anchorAPitch, direction, context, anchorAPitch);
  return opening === anchorAPitch ? fit(context, anchorAPitch + 2 * direction, anchorAPitch) : opening;
}

/** Sekuens: motif diulang, digeser satu sampai dua anak tangga skala per putaran. */
function sequencePitches(motif, count, anchorAPitch, target, context, range, random) {
  const steps = 2 + Math.floor(random() * 4);
  let direction = random() < 0.5 ? 1 : -1;
  const register = random() < 0.4 ? 12 * (random() < 0.5 ? 1 : -1) : 0;
  const pitches = [motifOpening(anchorAPitch, direction, context)];
  let current = pitches[0];
  let index = 0;
  for (let slot = 1; slot < count; slot += 1) {
    if (index === motif.intervals.length) {
      index = 0;
      if (random() < 0.4) direction = -direction;
      current = avoidRepeat(shiftScalePitch(current, steps * direction, context, current), pitches, direction, context, range);
    } else {
      current = avoidRepeat(fitRange(context, current + motif.intervals[index], range, current), pitches, direction, context, range);
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
  // Sepertiga akhir frasa berjalan menuju anchor B. Kalau jangkala vokal jauh di
  // bawah anchor B, berjalan dimulai lebih awal supaya frasa sempat sampai.
  const reach = count - Math.ceil(count / 3);
  const gap = Math.abs(target - anchorAPitch);
  const walkFrom = Math.max(2, gap > 12 ? Math.ceil(count / 3) : reach);
  const pitches = [motifOpening(anchorAPitch, direction, context)];
  let current = pitches[0];
  let index = 0;
  for (let slot = 1; slot < count; slot += 1) {
    if (slot >= walkFrom) {
      // Sisa jarak dibagi dengan sisa slot, jadi frasa benar-benar sampai di anchor
      // B dan bukan hanya satu anak tangga per slot.
      const remaining = count - slot;
      const left = Math.abs(target - current);
      const aim = current + Math.sign(target - current) * Math.max(1, Math.min(left, Math.round(left / remaining)));
      current = fitRange(context, aim, range, current);
      if (current === pitches[pitches.length - 1]) current = stepToward(current, target, context);
    } else {
      current = avoidRepeat(fitRange(context, current + shape[index % shape.length], range, current), pitches, direction, context, range);
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
      current = avoidRepeat(fitRange(context, current + motif.intervals[(slot - 1) % motif.intervals.length] * direction, range, current), pitches, direction, context, range);
    }
    pitches.push(current);
  }
  return walkTail(applyRegister(pitches, register, range), target, context, range, Math.max(1, Math.ceil(count / 6)));
}

function distinctPitches(pitches) {
  return new Set(pitches).size;
}

/**
 * Kalau langkah berikutnya mengulang salah satu dari beberapa nada terakhir,
 * geser satu atau dua anak tangga searah. Tanpa ini, walk yang menabrak batas
 * jangkala vokal menghasilkan nada sama berulang dan ambang "nada berbeda per
 * birama" tidak tercapai.
 */
function avoidRepeat(pitch, history, direction, context, range) {
  const previous = history.at(-1) ?? pitch;
  const recent = history.slice(-4);
  if (!recent.includes(pitch)) return pitch;
  for (const way of [direction, -direction]) {
    let moved = pitch;
    for (let step = 0; step < 2; step += 1) {
      moved = shiftScalePitch(moved, way, context, moved);
      const candidate = fitRange(context, moved, range, previous);
      if (!recent.includes(candidate)) return candidate;
    }
  }
  return fitRange(context, pitch, range, previous);
}

/**
 * Kandidat generator memakai granya sendiri lalu iramanya digeser ke pola onset
 * take, sehingga catatan ritme berlaku padanya juga.
 */
function retimeSlots(notes, startTick, bar) {
  const gapUnits = Math.max(1, Math.round(bar / GRID));
  const relative = notes.map((note) => Math.max(0, Math.round((note.startTick - startTick) / GRID)));
  const slots = [];
  let cursor = 0;
  for (const [index, onset] of relative.entries()) {
    const at = Math.max(onset, cursor);
    const next = relative[index + 1];
    const bound = next === undefined ? gapUnits : Math.max(at + 1, next);
    const duration = Math.max(1, Math.min(bound - at, gapUnits - at));
    slots.push({ onset: at, duration });
    cursor = at + duration;
  }
  while (cursor < gapUnits && slots.length < 64) {
    const duration = Math.max(1, Math.min(1, gapUnits - cursor));
    slots.push({ onset: cursor, duration });
    cursor += duration;
  }
  if (slots.length === 0) return [{ onset: 0, duration: gapUnits }];
  const last = slots[slots.length - 1];
  last.duration = Math.max(1, gapUnits - last.onset);
  return slots;
}

/**
 * Batas jumlah nada per birama untuk kandidat lanjutan, sama dengan ambang
 * di skrip kualitas: 1,5x take + 2.
 */
function notesBudgetFor(takeStats) {
  return Math.max(5, Math.round(takeStats.notesPerBar * 1.5) + 2);
}

/**
 * Saring kandidat: terlalu banyak nada sama, terlalu sedikit nada berbeda per
 * birama, ritme terlalu rapat atau terlalu lambat, sambungan yang meloncat, atau
 * tidak mendarat di anchor B berarti kandidat dibuang.
 */
function acceptableContinuation(notes, {
  context, gap, anchorAPitch, gapUnits, takeStats = null, method = null
}) {
  if (!Array.isArray(notes) || notes.length < 2) return false;
  // Ritme: durasi median harus dekat dengan take dan jumlah nada per birama
  // tidak boleh melampaui 1,5x take + 2. Metode jawab boleh satu nada lebih
  // rapat untuk take pendek.
  if (takeStats !== null) {
    const durationRatio = medianTicks(notes.map((note) => note.durationTicks))
      / Math.max(1, takeStats.medianDuration);
    if (durationRatio < DURATION_RATIO_MIN || durationRatio > DURATION_RATIO_MAX) return false;
    const budget = notesBudgetFor(takeStats) + (method === "answer" && takeStats.notes <= 4 ? 1 : 0);
    if (notes.length / gap.bars > budget) return false;
  }
  if (notes.length > 0 && Math.abs(notes[0].pitch - anchorAPitch) > JOIN_LEAP_MAX) return false;
  const pitches = [anchorAPitch, ...notes.map((note) => note.pitch)];
  let same = 0;
  for (let index = 1; index < pitches.length; index += 1) if (pitches[index] === pitches[index - 1]) same += 1;
  if (same / (pitches.length - 1) > MAX_SAME_RATIO) return false;
  const distinct = new Set(pitches).size;
  const bars = Math.max(1, Math.round(gapUnits / (gapUnits / gap.bars)));
  // Nada berbeda dihitung per birama, sama seperti metrik di skrip kualitas, dan
  // bukan sekali seluruh frasa, supaya frasa dua birama tidak perlu semua
  // pitch-nya berbeda.
  const barTicks = (gap.endTick - gap.startTick) / Math.max(1, bars);
  const perBar = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const from = gap.startTick + bar * barTicks;
    const seen = new Set(notes.filter((note) => note.startTick >= from && note.startTick < from + barTicks).map((note) => note.pitch));
    if (bar === 0) seen.add(anchorAPitch);
    perBar.push(seen.size);
  }
  const distinctPerBar = perBar.reduce((total, value) => total + value, 0) / perBar.length;
  if (distinctPerBar < (MIN_DISTINCT_PER_BAR[gap.bars] ?? MIN_DISTINCT_PER_BAR[1])) return false;
  const target = gap.anchorPitch;
  const last = notes[notes.length - 1].pitch;
  const interval = Math.abs(target - last);
  if (!((interval >= 1 && interval <= LANDING_STEP_SEMITONES) || (interval !== 0 && interval % 12 === 0))) {
    return false;
  }
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
  // generateGap tidak pernah berubah perilakunya. Kandidat dari generator
  // diperbaiki pendaratannya saja supaya kedua profil punya peluang yang sama
  // dengan metode motif.
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
    const built = result.candidates.map((candidate) => candidate.notes.map(pick))
      .map((notes) => retimeNotes(notes, gapStart, anchorAPitch, anchorBPitch, context, range, barTicks(meter)))
      .filter((notes) => notes !== null);
    return built[0] ?? null;
  };

  // Kandidat generator memakai granya sendiri lalu iramanya digeser ke pola onset
  // take, supaya catatan ritme berlaku padanya juga.
  function retimeNotes(notes, startTick, anchorPitch, target, context, voiceRange, bar) {
    if (!Array.isArray(notes) || notes.length === 0) return null;
    const slots = retimeSlots(notes, startTick, bar);
    const pitches = resolveLeaps(
      landOnAnchor(walkTail(notes.map((note) => note.pitch), target, context, voiceRange, 2), target, context, voiceRange),
      context,
      voiceRange
    );
    if (pitches.length !== slots.length) return null;
    if (pitches.some((pitch) => pitch === undefined)) return null;
    const last = pitches[pitches.length - 1];
    if (Math.abs(target - last) > LANDING_STEP_SEMITONES && Math.abs(target - last) % 12 !== 0) return null;
    return buildNotes(slots, pitches.map((pitch) => pitch ?? anchorPitch), startTick);
  }

  const builders = [
    {
      method: "sequence",
      attempts: RESEED_ATTEMPTS,
      waves: RESEED_ATTEMPTS,
      build: (seed) => {
        const random = createRandom(seed);
        const slots = slotsForRhythm(gapUnits, motif, notesBudget, barCount);
        return buildNotes(
          slots,
          landOnAnchor(
            resolveLeaps(sequencePitches(motif, slots.length, anchorAPitch, anchorBPitch, context, range, random), context, range),
            anchorBPitch,
            context,
            range
          ),
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
        const slots = slotsForRhythm(gapUnits, motif, notesBudget, barCount);
        return buildNotes(
          slots,
          landOnAnchor(
            resolveLeaps(answerPitches(motif, slots.length, anchorAPitch, anchorBPitch, context, range, random), context, range),
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
      // Gema memakai pola onset take apa adanya; itu justru cirinya, dan metrik
      // "kandidat memakai ulang pola onset take" ikut terjaga.
      build: (seed) => {
        const slots = slotsForRhythm(gapUnits, motif, notesBudget, barCount);
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

  const takeStats = {
    notes: take.length,
    medianDuration: medianTicks(take.map((note) => note.durationTicks)),
    notesPerBar: take.length / Math.max(1, Math.ceil((takeEnd / bar)))
  };
  // Batas jumlah nada per birama untuk kandidat, dan target kepadatan irama yang
  // sama supaya kandidat selalu punya cukup nada untuk ambang "nada berbeda".
  const notesBudget = notesBudgetFor(takeStats);
  const baseFilter = { context, gap, anchorAPitch, gapUnits, takeStats };
  const seen = new Set();
  const pool = [];
  const methods = new Set();
  // Gelombang bergilir: tiap metode menyumbang satu kandidat per gelombang.
  // Gelombang baru tetap jalan walau jumlah kandidat sudah cukup, selama
  // metode yang lolos masih di bawah tiga, supaya enam kandidat memakai
  // sedikitnya tiga metode berbeda.
  for (let wave = 0; wave < RESEED_ATTEMPTS; wave += 1) {
    if (pool.length >= requested && methods.size >= Math.min(3, builders.length)) break;
    for (const [index, builder] of builders.entries()) {
      if (wave >= builder.waves) break;
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
        if (!built || !acceptableContinuation(built, { ...baseFilter, method: builder.method })) continue;
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
export function ideaDevelop({ kind = "variation", notes, count, seed, bars, target, key, scale, tempo, timeSignature, intensity, chords, scope } = {}) {
  if (!DEVELOP_KINDS.includes(kind)) fail("ideas-invalid-kind");
  return kind === "continue"
    ? developContinuation({ notes, seed, bars, target, count, key, scale, tempo, timeSignature })
    : developVariations({ notes, count, seed, key, scale, intensity, chords, timeSignature, scope });
}

export function variationSpan(notes) {
  const end = notes.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), 0);
  return Math.max(PPQ, Math.ceil(end / GRID) * GRID);
}