import { MelodiError, PPQ } from "../core/model.js?v=20261003.96";

export const MIN_TEMPO = 20;
export const MAX_TEMPO = 300;

function fail(code) {
  throw new MelodiError(code);
}

export function validateTempo(tempo) {
  if (typeof tempo !== "number" || !Number.isFinite(tempo) || tempo < MIN_TEMPO || tempo > MAX_TEMPO) {
    fail("invalid-tempo");
  }
  return tempo;
}

export function validateTick(tick) {
  if (!Number.isSafeInteger(tick) || tick < 0) fail("invalid-tick");
  return tick;
}

export function validateLoop(startTick, endTick) {
  if (!Number.isSafeInteger(startTick) || startTick < 0 || !Number.isSafeInteger(endTick) || endTick <= startTick) {
    fail("invalid-loop");
  }
  return { startTick, endTick };
}

export function ticksToSeconds(ticks, tempo) {
  validateTick(ticks);
  if (typeof tempo !== "number" || !Number.isFinite(tempo) || tempo <= 0) fail("invalid-tempo");
  return ticks * 60 / (PPQ * tempo);
}

export function secondsToTickOffset(seconds, tempo) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) fail("invalid-time");
  if (typeof tempo !== "number" || !Number.isFinite(tempo) || tempo <= 0) fail("invalid-tempo");
  const ticks = seconds * PPQ * tempo / 60;
  if (!Number.isFinite(ticks)) fail("invalid-time");
  return ticks;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function wrapLoopTick(tick, loop) {
  if (!loop?.enabled || tick < loop.endTick) return tick;
  const length = loop.endTick - loop.startTick;
  return loop.startTick + positiveModulo(tick - loop.endTick, length);
}

export function tickAtAudioTime(audioTime, anchor, tempo, loop) {
  if (typeof audioTime !== "number" || !Number.isFinite(audioTime)) fail("invalid-time");
  const elapsed = Math.max(0, audioTime - anchor.audioTime);
  const rawTick = anchor.tick + secondsToTickOffset(elapsed, tempo);
  const tick = Math.floor(wrapLoopTick(rawTick, loop));
  if (!Number.isSafeInteger(tick) || tick < 0) fail("invalid-tick");
  return tick;
}

// P3: proyeksi posisi dibaca tiap tick, jadi.indeksnya ikut di-cache per
// song. Semuanya turunan dari song, jadi tidak perlu dihitung ulang selama
// song yang sama masih hidup.
const projectionCache = new WeakMap();

function projectionSignature(song) {
  return [
    (song.notes ?? []).length,
    (song.sections ?? []).length,
    (song.phrases ?? []).length,
    song.lyrics?.syllables?.length ?? 0
  ].join(":");
}

export function songProjection(song) {
  const signature = projectionSignature(song);
  const cached = projectionCache.get(song);
  if (cached && cached.signature === signature) return cached;
  const timeline = songTimeline(song);
  const notesById = new Map(timeline.notes.map(note => [note.id, note]));
  const sections = [];
  for (const section of song.sections ?? []) {
    const phraseIds = new Set(section.phraseIds);
    const noteIds = new Set((song.phrases ?? [])
      .filter(phrase => phraseIds.has(phrase.id))
      .flatMap(phrase => phrase.noteIds));
    let firstTick = Infinity;
    let lastTick = -Infinity;
    for (const id of noteIds) {
      const note = notesById.get(id);
      if (!note) continue;
      if (note.startTick < firstTick) firstTick = note.startTick;
      if (note.startTick + note.durationTicks > lastTick) lastTick = note.startTick + note.durationTicks;
    }
    sections.push({ id: section.id, noteIds, firstTick, lastTick });
  }
  const sectionByNoteId = new Map();
  for (const section of sections) {
    for (const id of section.noteIds) {
      if (!sectionByNoteId.has(id)) sectionByNoteId.set(id, section.id);
    }
  }
  const projection = {
    signature,
    notes: timeline.notes,
    noteStarts: timeline.noteStarts,
    noteById: notesById,
    maxNoteDuration: timeline.maxNoteDuration,
    sectionByNoteId,
    sections
  };
  projectionCache.set(song, projection);
  return projection;
}

export function findCurrentNoteId(song, tick) {
  const projection = songProjection(song);
  const { notes, noteStarts, maxNoteDuration } = projection;
  // Hanya nada yang mulai sebelum tick dan belum selesai yang bisa aktif.
  const end = lowerBound(noteStarts, tick + 1);
  const start = Math.max(0, lowerBound(noteStarts, tick - maxNoteDuration));
  let active = null;
  for (let index = end - 1; index >= start; index -= 1) {
    const note = notes[index];
    if (tick < note.startTick + note.durationTicks) {
      // Sama onset: id paling kecil dulu, sama seperti urutan lama.
      if (!active || note.startTick > active.startTick
        || (note.startTick === active.startTick && compareText(note.id, active.id) < 0)) {
        active = note;
      }
    }
  }
  return active?.id ?? null;
}

export function findCurrentSectionId(song, tick, currentNoteId = findCurrentNoteId(song, tick)) {
  const projection = songProjection(song);
  if (currentNoteId !== null) return projection.sectionByNoteId.get(currentNoteId) ?? null;
  for (const section of projection.sections) {
    if (section.firstTick === Infinity) continue;
    if (section.firstTick <= tick && tick < section.lastTick) return section.id;
  }
  return null;
}

export function projectPlaybackState(song, tick, status, loop) {
  const currentNoteId = findCurrentNoteId(song, tick);
  const currentSectionId = findCurrentSectionId(song, tick, currentNoteId);
  return {
    status,
    currentTick: tick,
    currentNoteId,
    currentSectionId,
    tempo: song.timing.tempo,
    loop: { enabled: loop.enabled, startTick: loop.startTick, endTick: loop.endTick }
  };
}

function eventKey(cycle, noteId) {
  return JSON.stringify([cycle, noteId]);
}

// P2: indeks jendela per lagu. Song canonical diganti utuh setiap commit, jadi
// cache per objek (WeakMap) otomatis basi bersama song lama. Signature
// pendek tetap dijaga agar engine juga benar kalau pemanggil menambah isi
// song in-place, seperti yang dilakukan test dan importer.
const timelineCache = new WeakMap();

function timelineSignature(song) {
  const notes = song.notes ?? [];
  let events = 0;
  for (const track of song.tracks ?? []) events += track.events?.length ?? 0;
  return `${notes.length}:${notes[notes.length - 1]?.id ?? ""}:${events}:${song.tracks?.length ?? 0}`;
}

function lowerBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function songTimeline(song) {
  const signature = timelineSignature(song);
  const cached = timelineCache.get(song);
  if (cached && cached.signature === signature) return cached;
  const notes = [...(song.notes ?? [])].sort((left, right) => left.startTick - right.startTick || compareText(left.id, right.id));
  const noteStarts = notes.map(note => note.startTick);
  let maxNoteDuration = 0;
  for (const note of notes) maxNoteDuration = Math.max(maxNoteDuration, note.durationTicks);
  const hits = [];
  for (const track of song.tracks ?? []) {
    if (track.kind !== "percussion") continue;
    for (const hit of track.events ?? []) hits.push({ track, hit });
  }
  hits.sort((left, right) => left.hit.startTick - right.hit.startTick || compareText(left.hit.id, right.hit.id));
  const timeline = {
    signature,
    notes,
    noteStarts,
    maxNoteDuration,
    hits,
    hitStarts: hits.map(entry => entry.hit.startTick)
  };
  timelineCache.set(song, timeline);
  return timeline;
}

export function planPercussionEvents(song, {
  audioNow,
  anchorAudioTime,
  anchorTick,
  tempo,
  lookAheadSeconds,
  loop,
  scheduledKeys = new Set()
}) {
  const secondsPerTick = 60 / (PPQ * tempo);
  const rawNow = anchorTick + Math.max(0, audioNow - anchorAudioTime) / secondsPerTick;
  const rawEnd = anchorTick + Math.max(0, audioNow + lookAheadSeconds - anchorAudioTime) / secondsPerTick;
  const candidates = [];
  const timeline = songTimeline(song);
  const hits = timeline.hits;
  const starts = timeline.hitStarts;

  function add(track, hit, cycle, absoluteStart) {
    if (absoluteStart < rawNow - 1e-9 || absoluteStart > rawEnd) return;
    // Kunci dibangun setelah filter jendela: formatnya kontrak dengan test
    // engine, jadi yang diubah hanya kapan biayanya dibayar.
    const key = JSON.stringify(["percussion", cycle, track.id, hit.id]);
    if (scheduledKeys.has(key)) return;
    const startTime = Math.max(audioNow, anchorAudioTime + (absoluteStart - anchorTick) * secondsPerTick);
    candidates.push({ key, track, hit, cycle, startTime });
  }

  function addRange(startIndex, endIndex, cycle, shift) {
    for (let index = startIndex; index < endIndex; index += 1) {
      const { track, hit } = hits[index];
      add(track, hit, cycle, hit.startTick + shift);
    }
  }

  if (!loop.enabled) {
    const rangeStart = loop?.startTick ?? 0;
    const rangeEnd = loop?.endTick ?? Number.POSITIVE_INFINITY;
    const from = Math.max(rangeStart, rawNow - 1e-9);
    const to = Math.min(rangeEnd, rawEnd);
    if (to >= from) addRange(lowerBound(starts, from), lowerBound(starts, to + 1e-9), 0, 0);
  } else {
    const length = loop.endTick - loop.startTick;
    const currentCycle = Math.max(0, Math.floor((rawNow - loop.startTick) / length));

    if (anchorTick < loop.startTick && rawNow < loop.startTick) {
      const from = Math.max(anchorTick, loop.startTick - length);
      const to = Math.min(loop.startTick, rawEnd);
      if (to >= from) addRange(lowerBound(starts, from), lowerBound(starts, to + 1e-9), 0, 0);
    }

    const lastCycle = Math.max(currentCycle, Math.floor((rawEnd - loop.startTick) / length) + 1);
    for (let cycle = currentCycle; cycle <= lastCycle; cycle += 1) {
      const shift = cycle * length;
      const from = Math.max(loop.startTick, rawNow - shift);
      const to = Math.min(loop.endTick, rawEnd - shift);
      if (to < from) continue;
      addRange(lowerBound(starts, from), lowerBound(starts, to + 1e-9), cycle, shift);
    }
  }

  return candidates.sort((left, right) => left.startTime - right.startTime
    || left.hit.startTick - right.hit.startTick
    || compareText(left.hit.id, right.hit.id));
}

export function planNoteEvents(song, {
  audioNow,
  anchorAudioTime,
  anchorTick,
  tempo,
  lookAheadSeconds,
  loop,
  scheduledKeys = new Set()
}) {
  const secondsPerTick = 60 / (PPQ * tempo);
  const rawNow = anchorTick + Math.max(0, audioNow - anchorAudioTime) / secondsPerTick;
  const rawEnd = anchorTick + Math.max(0, audioNow + lookAheadSeconds - anchorAudioTime) / secondsPerTick;
  const candidates = [];
  const timeline = songTimeline(song);
  const notes = timeline.notes;
  const starts = timeline.noteStarts;
  const maxDuration = timeline.maxNoteDuration;

  function add(note, cycle, absoluteStart, absoluteEnd, noteAbsoluteStart = note.startTick) {
    if (absoluteEnd <= rawNow || absoluteStart > rawEnd) return;
    const key = eventKey(cycle, note.id);
    if (scheduledKeys.has(key)) return;
    const onsetTick = Math.max(absoluteStart, rawNow, anchorTick);
    const startTime = Math.max(audioNow, anchorAudioTime + (onsetTick - anchorTick) * secondsPerTick);
    const endTime = anchorAudioTime + (absoluteEnd - anchorTick) * secondsPerTick;
    if (endTime <= startTime) return;
    const progressStart = Math.max(0, Math.min(1, (onsetTick - noteAbsoluteStart) / note.durationTicks));
    const progressEnd = Math.max(progressStart, Math.min(1, (absoluteEnd - noteAbsoluteStart) / note.durationTicks));
    candidates.push({
      key,
      note,
      cycle,
      startTime,
      endTime,
      noteProgressStart: progressStart,
      noteProgressEnd: progressEnd
    });
  }

  function addRange(fromIndex, toIndex, cycle, shift, rangeStart, rangeEnd, skipFirstCycle = false) {
    for (let index = fromIndex; index < toIndex; index += 1) {
      const note = notes[index];
      const noteEnd = note.startTick + note.durationTicks;
      if (note.startTick >= rangeEnd || noteEnd <= rangeStart) continue;
      // Nada yang dimulai sebelum loop tidak ikut berulang di siklus pertama.
      if (skipFirstCycle && note.startTick < rangeStart) continue;
      add(note, cycle,
        Math.max(note.startTick, rangeStart) + shift,
        Math.min(noteEnd, rangeEnd) + shift,
        note.startTick + shift);
    }
  }

  if (!loop.enabled) {
    const rangeStart = loop?.startTick ?? 0;
    const rangeEnd = loop?.endTick ?? Number.POSITIVE_INFINITY;
    // Batas bawah tetap memakai durasi terpanjang, bukan rangeStart: nada yang
    // mulai sebelum range masih berbunyi setelah di-clip ke dalam range.
    const from = rawNow - maxDuration;
    const to = Math.min(rangeEnd, rawEnd);
    if (to >= from) addRange(lowerBound(starts, from), lowerBound(starts, to + 1e-9), 0, 0, rangeStart, rangeEnd);
  } else {
    const length = loop.endTick - loop.startTick;
    const currentCycle = Math.max(0, Math.floor((rawNow - loop.startTick) / length));
    const lastCycle = Math.max(currentCycle, Math.floor((rawEnd - loop.startTick) / length) + 1);

    // Notes before the loop range may finish on the first pass, but never repeat.
    if (anchorTick < loop.startTick && rawNow < loop.endTick) {
      addRange(0, lowerBound(starts, loop.startTick), 0, 0, loop.startTick, loop.endTick);
    }

    for (let cycle = currentCycle; cycle <= lastCycle; cycle += 1) {
      const shift = cycle * length;
      // Batas bawah tidak boleh dijepit ke loop.startTick: nada yang mulai
      // sebelum itu masih berbunyi saat jendela terbuka.
      const from = rawNow - maxDuration - shift;
      const to = Math.min(loop.endTick, rawEnd - shift);
      if (to < from) continue;
      const skipFirstCycle = currentCycle === 0 && anchorTick < loop.startTick;
      addRange(lowerBound(starts, from), lowerBound(starts, to + 1e-9), cycle, shift, loop.startTick, loop.endTick, skipFirstCycle);
    }
  }

  return candidates.sort((left, right) => left.startTime - right.startTime
    || left.note.startTick - right.note.startTick
    || compareText(left.note.id, right.note.id));
}
