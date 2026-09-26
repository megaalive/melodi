import { createSong, MelodiError } from "./model.js";

export const SCHEMA_VERSION = 1;

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
  if (project.schemaVersion !== SCHEMA_VERSION) throw new MelodiError("unsupported-version");
  return createSong(project.song);
}
