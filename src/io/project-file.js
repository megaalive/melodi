import { serializeProject as serializeCanonicalProject } from "../core/serialization.js?v=20261001.37";

function projectFileName(title) {
  const base = String(title || "melodi")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "melodi";
  return `${base}.melodi.json`;
}

export function saveProjectFile(song, {
  serializeProject = serializeCanonicalProject,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  BlobCtor = globalThis.Blob,
  schedule = globalThis.setTimeout
} = {}) {
  const payload = serializeProject(song);
  const blob = new BlobCtor([payload], { type: "application/json;charset=utf-8" });
  const objectUrl = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = objectUrl;
  anchor.download = projectFileName(song.title);
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  schedule(() => urlApi.revokeObjectURL(objectUrl), 0);
  return anchor.download;
}
