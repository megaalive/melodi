import { findPercussionKit } from "../instruments/percussion.js?v=20260930.20";

const DEFAULT_CHANNEL_STATE = Object.freeze({ mute: false, solo: false, volume: 1 });

export function percussionChannelId(trackId, pieceId) {
  return `percussion:${trackId}:${pieceId}`;
}

function readChannelState(state) {
  return {
    mute: state?.mute === true,
    solo: state?.solo === true,
    volume: Number.isFinite(state?.volume) ? Math.max(0, Math.min(1, state.volume)) : 1
  };
}

export function createInstrumentMix(song, previous = null) {
  const previousChannels = previous?.channels ?? {};
  const channels = { melody: readChannelState(previousChannels.melody) };
  for (const track of song?.tracks ?? []) {
    if (track.kind !== "percussion") continue;
    const kit = findPercussionKit(track.kitId);
    for (const piece of kit?.pieces ?? []) {
      const channelId = percussionChannelId(track.id, piece.id);
      channels[channelId] = readChannelState(previousChannels[channelId]);
    }
  }
  return { channels };
}

export function isInstrumentAudible(mix, channelId) {
  const channels = mix?.channels ?? {};
  const channel = readChannelState(channels[channelId]);
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
  return isInstrumentAudible(mix, channelId) ? volumeGain(mix?.channels?.[channelId]?.volume) : 0;
}

export const DEFAULT_INSTRUMENT_CHANNEL_STATE = DEFAULT_CHANNEL_STATE;
