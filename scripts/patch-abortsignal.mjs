// Swaps the ponyfilled AbortController in the installed Next.js build for the
// native global, which is the one-line change discussed in
// https://github.com/vercel/next.js/pull/97981
//
// This patches the compiled `dist` of a released Next.js. It is not a build of
// the PR branch, and it touches nothing but the import.
//
// Exits non-zero if the expected line is missing, so a silent no-op can never
// be mistaken for "the fix made no difference".

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const target = resolve(
  dirname(require.resolve("next/package.json")),
  "dist/telemetry/storage.js",
);

const before = 'const _ponyfill = require("next/dist/compiled/@edge-runtime/ponyfill");';
const after =
  "const _ponyfill = { AbortController: globalThis.AbortController }; // patched: native global";

const source = readFileSync(target, "utf8");
const hits = source.split(before).length - 1;

if (hits !== 1) {
  console.error(
    `Expected exactly one occurrence of the ponyfill require in ${target}, found ${hits}.`,
  );
  process.exit(1);
}

writeFileSync(target, source.replace(before, after));
console.log(`patched ${target}`);
