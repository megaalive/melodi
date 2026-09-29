import { findPercussionKit } from "../instruments/percussion.js?v=20260930.19";

const DEFAULT_CHANNEL_STATE = Object.freeze({ mute: false, solo: false });

export function percussionChannelId(trackId, pieceId) {
  return `percussion:${trackId}:${pieceId}`;
}

function readChannelState(state) {
  return {
    mute: state?.mute === true,
    solo: state?.solo === true
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

export const DEFAULT_INSTRUMENT_CHANNEL_STATE = DEFAULT_CHANNEL_STATE;
