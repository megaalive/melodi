import { MelodiError } from "./model.js?v=20261003.83";

export function songBarTicks(song) {
  const { numerator = 4, denominator = 4 } = song.timing?.timeSignature ?? {};
  return (song.timing?.ppq ?? 480) * 4 / denominator * numerator;
}

export function canonicalSongEndTick(song) {
  let end = 0;
  for (const note of song.notes ?? []) end = Math.max(end, note.startTick + note.durationTicks);
  for (const chord of song.chords ?? []) end = Math.max(end, chord.startTick + chord.durationTicks);
  for (const track of song.tracks ?? []) {
    if (track.kind !== "percussion") continue;
    for (const hit of track.events ?? []) end = Math.max(end, hit.startTick + (hit.durationTicks ?? 1));
  }
  return end;
}

export function barRangeAtTick(song, tick = 0) {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new MelodiError("invalid-tick");
  const barTicks = songBarTicks(song);
  const startTick = Math.floor(tick / barTicks) * barTicks;
  const endTick = startTick + barTicks;
  if (!Number.isSafeInteger(endTick)) throw new MelodiError("invalid-tick");
  return { startTick, endTick };
}

export function chordSnapTicks(song, unit = "bar") {
  if (!["bar", "half-bar", "beat"].includes(unit)) throw new MelodiError("invalid-chord-snap");
  const ticks = unit === "beat" ? (song.timing?.ppq ?? 480) * 4 / (song.timing?.timeSignature?.denominator ?? 4)
    : songBarTicks(song) / (unit === "half-bar" ? 2 : 1);
  if (!Number.isSafeInteger(ticks) || ticks <= 0) throw new MelodiError("invalid-chord-snap");
  return ticks;
}
