import { createSong, createDefaultSketch, MelodiError } from "./model.js?v=20261003.96";

export const SCHEMA_VERSION = 5;
const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2, 3, 4, 5]);

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
  return createSong(project.schemaVersion < 5 ? { ...song, sketch: createDefaultSketch() } : song);
}
