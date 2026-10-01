import { findPercussionKit } from "../instruments/percussion.js?v=20261001.37";

const DEFAULT_CHANNEL_STATE = Object.freeze({ mute: false, solo: false, volume: 1 });

export function percussionChannelId(trackId, pieceId) {
  return `percussion:${trackId}:${pieceId}`;
}

function readMonitoringState(state) {
  return {
    mute: state?.mute === true,
    solo: state?.solo === true
  };
}

export function createInstrumentMix(song, previous = null) {
  const previousChannels = previous?.channels ?? {};
  const channels = { melody: { ...readMonitoringState(previousChannels.melody), volume: song?.mix?.melody ?? 1 } };
  for (const channel of ["harmony", "bass"]) channels[channel] = { ...readMonitoringState(previousChannels[channel]), volume: song?.sketch?.[channel]?.volume ?? 1 };
  for (const track of song?.tracks ?? []) {
    if (track.kind !== "percussion") continue;
    const kit = findPercussionKit(track.kitId);
    for (const piece of kit?.pieces ?? []) {
      const channelId = percussionChannelId(track.id, piece.id);
      channels[channelId] = { ...readMonitoringState(previousChannels[channelId]), volume: song?.mix?.percussion?.[track.id]?.[piece.id] ?? 1 };
    }
  }
  return { channels };
}

export function isInstrumentAudible(mix, channelId) {
  const channels = mix?.channels ?? {};
  const channel = readMonitoringState(channels[channelId]);
  const anySolo = Object.values(channels).some((state) => state?.solo === true);
  return !channel.mute && (!anySolo || channel.solo);
}

export function instrumentChannelIds(song) {
  return Object.keys(createInstrumentMix(song).channels);
}

export function volumeGain(volume = 1) {
  const level = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
  return level * level;
}

export function instrumentGain(mix, channelId) {
  if (!isInstrumentAudible(mix, channelId)) return 0;
  const volume = mix?.channels?.[channelId]?.volume ?? 1;
  return volumeGain(volume);
}

export const DEFAULT_INSTRUMENT_CHANNEL_STATE = DEFAULT_CHANNEL_STATE;
