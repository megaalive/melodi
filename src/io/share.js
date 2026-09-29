import { PPQ, createId, createSong, MelodiError } from "../core/model.js?v=20260929.13";

export const SHARE_FORMAT = "melodi-share";
export const SHARE_VERSION = 4;
const SUPPORTED_SHARE_VERSIONS = new Set([1, 2, 3, 4]);
export const SHARE_HASH_KEY = "m";
export const MAX_SHARE_COMPRESSED_BYTES = 64 * 1024;
export const MAX_SHARE_DECODED_BYTES = 512 * 1024;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function fail(code) {
  throw new MelodiError(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bytesToBase64Url(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const block = (a << 16) | (b << 8) | c;
    output += BASE64[(block >> 18) & 63];
    output += BASE64[(block >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64[(block >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64[block & 63] : "=";
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value)) fail("malformed-share");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const lookup = new Map([...BASE64].map((character, index) => [character, index]));
  const bytes = [];
  for (let index = 0; index < padded.length; index += 4) {
    const chars = padded.slice(index, index + 4);
    const values = [...chars].map((character) => character === "=" ? 0 : lookup.get(character));
    if (values.some((entry) => entry === undefined)) fail("malformed-share");
    const block = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    bytes.push((block >> 16) & 255);
    if (chars[2] !== "=") bytes.push((block >> 8) & 255);
    if (chars[3] !== "=") bytes.push(block & 255);
  }
  return new Uint8Array(bytes);
}

async function readStream(readable, limit) {
  const reader = readable.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    total += chunk.byteLength;
    if (total > limit) fail("share-too-large");
    chunks.push(chunk);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function transformBytes(bytes, StreamCtor, format, limit) {
  const transform = new StreamCtor(format);
  const result = readStream(transform.readable, limit);
  const writer = transform.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return result;
}

function noteFlags(note) {
  return (note.source === "generated" ? 1 : 0)
    | (note.anchor ? 2 : 0)
    | (note.locked ? 4 : 0);
}

function encodeNote(note) {
  const tuple = [note.pitch, note.startTick, note.durationTicks, noteFlags(note)];
  const bend = Array.isArray(note.pitchBend)
    ? note.pitchBend.map((point) => [point.position, point.semitones])
    : null;
  const expression = Object.hasOwn(note, "volume") || Object.hasOwn(note, "pan")
    ? [note.volume ?? 1, note.pan ?? 0]
    : null;
  const vibrato = note.vibrato
    ? [note.vibrato.rateHz, note.vibrato.depthSemitones, note.vibrato.delayPosition]
    : null;
  if (bend || expression || vibrato) tuple.push(bend);
  if (expression || vibrato) tuple.push(expression);
  if (vibrato) tuple.push(vibrato);
  return tuple;
}

function encodePercussionHit(hit) {
  const tuple = [hit.pieceId, hit.startTick, hit.velocity, hit.articulation];
  if (Object.hasOwn(hit, "durationTicks") || Object.hasOwn(hit, "pan") || Object.hasOwn(hit, "tuning")) {
    tuple.push(hit.durationTicks ?? null, hit.pan ?? null, hit.tuning ?? null);
  }
  return tuple;
}

function decodePercussionHit(tuple, idFactory) {
  if (!Array.isArray(tuple) || tuple.length < 4 || tuple.length > 7) fail("malformed-share");
  const [pieceId, startTick, velocity, articulation, durationTicks, pan, tuning] = tuple;
  const hit = { id: idFactory(), pieceId, startTick, velocity, articulation };
  if (durationTicks !== undefined && durationTicks !== null) hit.durationTicks = durationTicks;
  if (pan !== undefined && pan !== null) hit.pan = pan;
  if (tuning !== undefined && tuning !== null) hit.tuning = tuning;
  return hit;
}

function decodeNote(tuple, idFactory, version = SHARE_VERSION) {
  const maximumLength = version >= 3 ? 7 : version >= 2 ? 6 : 5;
  if (!Array.isArray(tuple) || tuple.length < 4 || tuple.length > maximumLength) fail("malformed-share");
  const [pitch, startTick, durationTicks, flags, bend, expression, vibrato] = tuple;
  if (!Number.isSafeInteger(flags) || flags < 0 || flags > 7) fail("malformed-share");
  const note = {
    id: idFactory(),
    pitch,
    startTick,
    durationTicks,
    source: flags & 1 ? "generated" : "user",
    anchor: Boolean(flags & 2),
    locked: Boolean(flags & 4)
  };
  if (bend !== undefined && bend !== null) {
    if (!Array.isArray(bend)) fail("malformed-share");
    note.pitchBend = bend.map((point) => {
      if (!Array.isArray(point) || point.length !== 2) fail("malformed-share");
      return { position: point[0], semitones: point[1] };
    });
  }
  if (expression !== undefined && expression !== null) {
    if (version < 2 || !Array.isArray(expression) || expression.length !== 2) fail("malformed-share");
    const [volume, pan] = expression;
    if (volume !== 1) note.volume = volume;
    if (pan !== 0) note.pan = pan;
  }
  if (vibrato !== undefined && vibrato !== null) {
    if (version < 3 || !Array.isArray(vibrato) || vibrato.length !== 3) fail("malformed-share");
    note.vibrato = { rateHz: vibrato[0], depthSemitones: vibrato[1], delayPosition: vibrato[2] };
  }
  return note;
}

export function toPortableProject(song) {
  const canonical = createSong(song);
  const noteIndexes = new Map(canonical.notes.map((note, index) => [note.id, index]));
  const phraseIndexes = new Map(canonical.phrases.map((phrase, index) => [phrase.id, index]));

  return {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    project: {
      title: canonical.title,
      transport: [canonical.timing.ppq, canonical.timing.tempo,
        canonical.timing.timeSignature.numerator, canonical.timing.timeSignature.denominator],
      tonality: [canonical.key, canonical.scale.name, canonical.scale.intervals],
      arrangement: {
        phrases: canonical.phrases.map((phrase) => phrase.noteIds.map((id) => noteIndexes.get(id))),
        sections: canonical.sections.map((section) => [
          section.name,
          section.phraseIds.map((id) => phraseIndexes.get(id))
        ])
      },
      tracks: [
        {
          id: "melody",
          kind: "notes",
          role: "lead",
          events: canonical.notes.map(encodeNote),
          lyrics: [
            canonical.lyrics.rawText,
            canonical.lyrics.syllables.map((syllable) => [
              syllable.text,
              syllable.noteIds.map((id) => noteIndexes.get(id))
            ])
          ]
        },
        {
          id: "harmony",
          kind: "chords",
          role: "harmony",
          events: canonical.chords.map((chord) => [
            chord.rootPitchClass,
            chord.quality,
            chord.startTick,
            chord.durationTicks
          ])
        },
        ...canonical.tracks
          .filter((track) => track.kind === "percussion")
          .map((track, index) => ({
            id: `percussion-${index + 1}`,
            kind: "percussion",
            role: track.role,
            kit: track.kitId,
            events: track.events.map(encodePercussionHit)
          }))
      ]
    }
  };
}

export function fromPortableProject(envelope, idFactory = createId) {
  if (!isRecord(envelope) || envelope.format !== SHARE_FORMAT || !SUPPORTED_SHARE_VERSIONS.has(envelope.version)
    || !isRecord(envelope.project)) fail("unsupported-share");

  const project = envelope.project;
  if (typeof project.title !== "string" || !Array.isArray(project.transport)
    || project.transport.length !== 4 || !Array.isArray(project.tonality)
    || project.tonality.length !== 3 || !isRecord(project.arrangement)
    || !Array.isArray(project.tracks)) fail("malformed-share");

  const [ppq, tempo, numerator, denominator] = project.transport;
  if (ppq !== PPQ) fail("unsupported-share");
  const [key, scaleName, intervals] = project.tonality;

  // Format share sudah track-oriented sejak v1. V4 mulai membawa percussion
  // tracks; kind masa depan tetap diabaikan sampai canonical model memahaminya.
  const melodyTrack = project.tracks.find((track) => isRecord(track)
    && track.kind === "notes" && track.role === "lead");
  if (!melodyTrack || !Array.isArray(melodyTrack.events)) fail("malformed-share");
  const harmonyTrack = project.tracks.find((track) => isRecord(track) && track.kind === "chords");

  const notes = melodyTrack.events.map((event) => decodeNote(event, idFactory, envelope.version));
  const phraseRows = project.arrangement.phrases;
  const sectionRows = project.arrangement.sections;
  if (!Array.isArray(phraseRows) || !Array.isArray(sectionRows)) fail("malformed-share");

  const phrases = phraseRows.map((indexes) => {
    if (!Array.isArray(indexes) || indexes.some((index) => !Number.isSafeInteger(index)
      || index < 0 || index >= notes.length)) fail("malformed-share");
    return { id: idFactory(), noteIds: indexes.map((index) => notes[index].id) };
  });

  const sections = sectionRows.map((row) => {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || !Array.isArray(row[1])
      || row[1].some((index) => !Number.isSafeInteger(index) || index < 0 || index >= phrases.length)) {
      fail("malformed-share");
    }
    return { id: idFactory(), name: row[0], phraseIds: row[1].map((index) => phrases[index].id) };
  });

  const lyricData = melodyTrack.lyrics ?? ["", []];
  if (!Array.isArray(lyricData) || lyricData.length !== 2 || typeof lyricData[0] !== "string"
    || !Array.isArray(lyricData[1])) fail("malformed-share");
  const syllables = lyricData[1].map((row) => {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || !Array.isArray(row[1])
      || row[1].some((index) => !Number.isSafeInteger(index) || index < 0 || index >= notes.length)) {
      fail("malformed-share");
    }
    return { id: idFactory(), text: row[0], noteIds: row[1].map((index) => notes[index].id) };
  });

  const chordRows = harmonyTrack?.events ?? [];
  if (!Array.isArray(chordRows)) fail("malformed-share");
  const chords = chordRows.map((row) => {
    if (!Array.isArray(row) || row.length !== 4) fail("malformed-share");
    return {
      id: idFactory(),
      rootPitchClass: row[0],
      quality: row[1],
      startTick: row[2],
      durationTicks: row[3]
    };
  });

  const tracks = envelope.version >= 4
    ? project.tracks
        .filter((track) => isRecord(track) && track.kind === "percussion")
        .map((track) => {
          if (typeof track.role !== "string" || typeof track.kit !== "string" || !Array.isArray(track.events)) {
            fail("malformed-share");
          }
          return {
            id: idFactory(),
            kind: "percussion",
            role: track.role,
            kitId: track.kit,
            events: track.events.map((event) => decodePercussionHit(event, idFactory))
          };
        })
    : [];

  return createSong({
    id: idFactory(),
    title: project.title,
    timing: { ppq, tempo, timeSignature: { numerator, denominator } },
    key,
    scale: { name: scaleName, intervals },
    sections,
    phrases,
    notes,
    lyrics: { rawText: lyricData[0], syllables },
    chords,
    tracks
  });
}

export async function encodeSharePayload(song, {
  CompressionStreamCtor = globalThis.CompressionStream,
  compressAboveBytes = 4096
} = {}) {
  const json = JSON.stringify(toPortableProject(song));
  const raw = new TextEncoder().encode(json);
  if (raw.byteLength > MAX_SHARE_DECODED_BYTES) fail("share-too-large");

  // Project kecil lebih andal dibawa sebagai Base64URL biasa. Gzip baru dipakai
  // ketika benar-benar menghemat URL; ini juga menghindari ketergantungan pada
  // DecompressionStream untuk share sederhana.
  if (raw.byteLength > compressAboveBytes && typeof CompressionStreamCtor === "function") {
    try {
      const compressed = await transformBytes(raw, CompressionStreamCtor, "gzip", MAX_SHARE_COMPRESSED_BYTES);
      return `${SHARE_VERSION}.g.${bytesToBase64Url(compressed)}`;
    } catch (error) {
      if (error instanceof MelodiError) throw error;
      // Browser lama tetap bisa membagikan link tanpa library kompresi tambahan.
    }
  }

  if (raw.byteLength > MAX_SHARE_COMPRESSED_BYTES) fail("share-too-large");
  return `${SHARE_VERSION}.j.${bytesToBase64Url(raw)}`;
}

export async function decodeSharePayload(payload, {
  DecompressionStreamCtor = globalThis.DecompressionStream,
  idFactory = createId
} = {}) {
  if (typeof payload !== "string") fail("malformed-share");
  const [versionText, encoding, encoded, ...rest] = payload.split(".");
  const payloadVersion = Number(versionText);
  if (rest.length > 0 || !SUPPORTED_SHARE_VERSIONS.has(payloadVersion) || !encoded) fail("unsupported-share");

  const bytes = base64UrlToBytes(encoded);
  if (bytes.byteLength > MAX_SHARE_COMPRESSED_BYTES) fail("share-too-large");

  let raw;
  if (encoding === "j") {
    raw = bytes;
  } else if (encoding === "g") {
    if (typeof DecompressionStreamCtor !== "function") fail("share-compression-unavailable");
    try {
      raw = await transformBytes(bytes, DecompressionStreamCtor, "gzip", MAX_SHARE_DECODED_BYTES);
    } catch (error) {
      if (error instanceof MelodiError) throw error;
      fail("malformed-share");
    }
  } else {
    fail("unsupported-share");
  }

  if (raw.byteLength > MAX_SHARE_DECODED_BYTES) fail("share-too-large");
  let envelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    fail("malformed-share");
  }
  if (envelope?.version !== payloadVersion) fail("unsupported-share");
  return fromPortableProject(envelope, idFactory);
}

export async function createShareUrl(song, href = globalThis.location?.href ?? "https://example.invalid/", options = {}) {
  const url = new URL(href);
  const payload = await encodeSharePayload(song, options);
  url.searchParams.set(SHARE_HASH_KEY, payload);
  url.searchParams.delete("utm_source");
  url.searchParams.delete("utm_medium");
  url.searchParams.delete("utm_campaign");
  url.hash = "";
  return url.toString();
}

export async function decodeShareHash(hash, options = {}) {
  if (typeof hash !== "string" || hash.length === 0 || hash === "#") return null;
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const payload = params.get(SHARE_HASH_KEY);
  if (!payload) return null;
  return decodeSharePayload(payload, options);
}

export async function decodeShareLocation(locationLike = globalThis.location, options = {}) {
  const search = typeof locationLike?.search === "string" ? locationLike.search : "";
  const searchParams = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const queryPayload = searchParams.get(SHARE_HASH_KEY);
  if (queryPayload) return decodeSharePayload(queryPayload, options);

  return decodeShareHash(typeof locationLike?.hash === "string" ? locationLike.hash : "", options);
}
