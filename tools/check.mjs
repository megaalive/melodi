import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && entry.name.endsWith(".js")) targets.push(path);
  }
}

collect(join(root, "src"));
collect(join(root, "tests"));
targets.push(fileURLToPath(import.meta.url));

for (const target of targets) {
  const result = spawnSync(process.execPath, ["--check", target], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  process.stdout.write(`checked ${relative(root, target)}\n`);
}
