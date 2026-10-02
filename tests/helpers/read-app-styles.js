import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readStylesheet(path, visited) {
  const fullPath = resolve(path);
  if (visited.has(fullPath)) return "";
  visited.add(fullPath);
  const source = readFileSync(fullPath, "utf8");
  return source.replace(/@import\s*(?:url\()?['\"]([^'\"]+)['\"]\)?[^;]*;/g, (rule, importedPath) => {
    if (!importedPath.startsWith(".")) return rule;
    const localPath = importedPath.split(/[?#]/, 1)[0];
    return readStylesheet(resolve(dirname(fullPath), localPath), visited);
  });
}

export function readAppStyles() {
  return readStylesheet(resolve("styles/app.css"), new Set());
}
