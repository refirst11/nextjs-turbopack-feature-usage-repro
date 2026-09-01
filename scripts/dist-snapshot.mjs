// Saves and restores the Next.js dist files the benchmark patches touch, so
// each arm starts from an unmodified release.
//
// Restoring from a snapshot rather than reinstalling is deliberate: the patches
// write in place, and depending on the package manager's linking mode that file
// may be shared with the global store, where a reinstall would not necessarily
// undo the edit.
//
// Usage: node scripts/dist-snapshot.mjs save|restore

import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

const require = createRequire(import.meta.url);
const distRoot = resolve(dirname(require.resolve("next/package.json")), "dist");
const snapshotDir = resolve(process.cwd(), ".dist-snapshot");

const files = [
  "telemetry/storage.js",
  "telemetry/detached-flush.js",
  "build/index.js",
  "build/turbopack-build/impl.js",
  "build/webpack-build/impl.js",
];

const mode = process.argv[2];
const flat = (relative) => join(snapshotDir, relative.replaceAll("/", "_"));

if (mode === "save") {
  mkdirSync(snapshotDir, { recursive: true });
  for (const relative of files) {
    copyFileSync(join(distRoot, relative), flat(relative));
  }
  console.log(`saved ${files.length} files to ${snapshotDir}`);
} else if (mode === "restore") {
  for (const relative of files) {
    const from = flat(relative);
    if (!existsSync(from)) {
      console.error(`missing snapshot for ${relative}; run "save" first`);
      process.exit(1);
    }
    copyFileSync(from, join(distRoot, relative));
  }
  console.log(`restored ${files.length} files`);
} else {
  console.error("Usage: node scripts/dist-snapshot.mjs save|restore");
  process.exit(1);
}
