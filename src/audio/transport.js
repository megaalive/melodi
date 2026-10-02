import { MelodiError, PPQ } from "../core/model.js?v=20261002.58";

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

export function findCurrentNoteId(song, tick) {
  const active = song.notes
    .filter((note) => note.startTick <= tick && tick < note.startTick + note.durationTicks)
    .sort((left, right) => right.startTick - left.startTick || compareText(left.id, right.id));
  return active[0]?.id ?? null;
}

function getSectionNotes(song, section) {
  const phraseIds = new Set(section.phraseIds);
  const noteIds = new Set(song.phrases.filter((phrase) => phraseIds.has(phrase.id)).flatMap((phrase) => phrase.noteIds));
  return song.notes.filter((note) => noteIds.has(note.id));
}

export function findCurrentSectionId(song, tick, currentNoteId = findCurrentNoteId(song, tick)) {
  const byId = new Map(song.notes.map((note) => [note.id, note]));
  if (currentNoteId !== null) {
    for (const section of song.sections) {
      if (getSectionNotes(song, section).some((note) => note.id === currentNoteId)) return section.id;
    }
    return null;
  }

  for (const section of song.sections) {
    const notes = getSectionNotes(song, section);
    if (notes.length === 0) continue;
    const firstTick = Math.min(...notes.map((note) => note.startTick));
    const lastTick = Math.max(...notes.map((note) => note.startTick + note.durationTicks));
    if (firstTick <= tick && tick < lastTick && notes.some((note) => byId.has(note.id))) return section.id;
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

  function add(track, hit, cycle, absoluteStart) {
    const key = JSON.stringify(["percussion", cycle, track.id, hit.id]);
    if (scheduledKeys.has(key) || absoluteStart < rawNow - 1e-9 || absoluteStart > rawEnd) return;
    const startTime = Math.max(audioNow, anchorAudioTime + (absoluteStart - anchorTick) * secondsPerTick);
    candidates.push({ key, track, hit, cycle, startTime });
  }

  const tracks = (song.tracks ?? []).filter((track) => track.kind === "percussion");
  if (!loop.enabled) {
    const rangeStart = loop?.startTick ?? 0;
    const rangeEnd = loop?.endTick ?? Number.POSITIVE_INFINITY;
    for (const track of tracks) {
      for (const hit of track.events) {
        if (hit.startTick < rangeStart || hit.startTick >= rangeEnd) continue;
        add(track, hit, 0, hit.startTick);
      }
    }
  } else {
    const length = loop.endTick - loop.startTick;
    const currentCycle = Math.max(0, Math.floor((rawNow - loop.startTick) / length));

    if (anchorTick < loop.startTick && rawNow < loop.startTick) {
      for (const track of tracks) {
        for (const hit of track.events) {
          if (hit.startTick < anchorTick || hit.startTick >= loop.startTick) continue;
          add(track, hit, 0, hit.startTick);
        }
      }
    }

    for (const track of tracks) {
      for (const hit of track.events) {
        if (hit.startTick < loop.startTick || hit.startTick >= loop.endTick) continue;
        const lastCycle = Math.max(currentCycle, Math.floor((rawEnd - loop.startTick) / length) + 1);
        for (let cycle = currentCycle; cycle <= lastCycle; cycle += 1) {
          add(track, hit, cycle, hit.startTick + cycle * length);
        }
      }
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

  function add(note, cycle, absoluteStart, absoluteEnd, noteAbsoluteStart = note.startTick) {
    const key = eventKey(cycle, note.id);
    if (scheduledKeys.has(key) || absoluteEnd <= rawNow || absoluteStart > rawEnd) return;
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

  if (!loop.enabled) {
    const rangeStart = loop?.startTick ?? 0;
    const rangeEnd = loop?.endTick ?? Number.POSITIVE_INFINITY;
    for (const note of song.notes) {
      const noteEnd = note.startTick + note.durationTicks;
      if (note.startTick >= rangeEnd || noteEnd <= rangeStart) continue;
      add(note, 0, Math.max(note.startTick, rangeStart), Math.min(noteEnd, rangeEnd));
    }
  } else {
    const length = loop.endTick - loop.startTick;
    const currentCycle = Math.max(0, Math.floor((rawNow - loop.startTick) / length));

    // Notes before the loop range may finish on the first pass, but never repeat.
    if (anchorTick < loop.startTick && rawNow < loop.endTick) {
      for (const note of song.notes) {
        if (note.startTick < loop.startTick) {
          add(note, 0, note.startTick, Math.min(note.startTick + note.durationTicks, loop.endTick), note.startTick);
        }
      }
    }

    for (const note of song.notes) {
      const noteEnd = note.startTick + note.durationTicks;
      if (note.startTick >= loop.endTick || noteEnd <= loop.startTick) continue;
      const firstCycle = note.startTick < loop.startTick && anchorTick < loop.startTick && currentCycle === 0
        ? currentCycle + 1
        : currentCycle;
      const lastCycle = Math.max(firstCycle, Math.floor((rawEnd - loop.startTick) / length) + 1);
      for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
        const start = Math.max(note.startTick, loop.startTick) + cycle * length;
        const end = Math.min(noteEnd, loop.endTick) + cycle * length;
        add(note, cycle, start, end, note.startTick + cycle * length);
      }
    }
  }

  return candidates.sort((left, right) => left.startTime - right.startTime
    || left.note.startTick - right.note.startTick
    || compareText(left.note.id, right.note.id));
}
