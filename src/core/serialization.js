import { createSong, MelodiError } from "./model.js?v=20260930.24";

export const SCHEMA_VERSION = 4;
const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2, 3, 4]);

export function serializeProject(song) {
  const canonicalSong = createSong(song);
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, song: canonicalSong });
}

export function deserializeProject(input) {
  let project;
  try {
    project = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    throw new MelodiError("malformed-project");
  }
  if (project === null || typeof project !== "object" || Array.isArray(project) || Object.keys(project).sort().join(",") !== "schemaVersion,song") {
    throw new MelodiError("malformed-project");
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.has(project.schemaVersion)) throw new MelodiError("unsupported-version");
  if (project.schemaVersion >= 4 && Array.isArray(project.song?.chords)
    && project.song.chords.some((chord) => typeof chord?.locked !== "boolean")) {
    throw new MelodiError("invalid-chord");
  }
  // Format lama belum mengenal lock chord; keputusan lama tetap dapat diedit.
  const song = project.schemaVersion < 4 && Array.isArray(project.song?.chords)
    ? { ...project.song, chords: project.song.chords.map((chord) => ({ ...chord, locked: false })) }
    : project.song;
  return createSong(song);
}
