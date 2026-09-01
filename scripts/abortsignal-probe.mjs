// Probes whether this Node version's global `fetch` accepts the ponyfilled
// `AbortSignal` that `next/dist/telemetry/storage` passes to every telemetry
// submission.
//
// Nothing is ever sent to telemetry.nextjs.org:
//   - the brand check runs against a throwaway local HTTP server;
//   - the end-to-end timing of Next's own `postNextTelemetryPayload` only runs
//     on versions where the brand check already failed, and there the request
//     is rejected by `RequestInit` validation before any network I/O happens.
// On versions that accept the signal, that timing step is skipped precisely
// because it would put a real payload on the wire.

import http from "node:http";
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);

const { AbortController: PonyfillAbortController } = require(
  "next/dist/compiled/@edge-runtime/ponyfill",
);
const { postNextTelemetryPayload } = require(
  "next/dist/telemetry/post-telemetry-payload",
);
const nextVersion = require("next/package.json").version;

const server = http.createServer((_req, res) => {
  res.writeHead(200);
  res.end("ok");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const isPonyfillNative =
  PonyfillAbortController === globalThis.AbortController;

let accepted;
let rejection = null;
try {
  await fetch(url, {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
    signal: new PonyfillAbortController().signal,
  });
  accepted = true;
} catch (error) {
  accepted = false;
  rejection = `${error.constructor.name}: ${error.message}`;
}

// Only safe to call Next's real submitter when we already know the signal is
// refused before any bytes leave the process.
let submitMs = null;
if (!accepted) {
  const startedAt = performance.now();
  await postNextTelemetryPayload(
    { context: {}, meta: {}, events: [] },
    new PonyfillAbortController().signal,
  );
  submitMs = Number((performance.now() - startedAt).toFixed(1));
}

server.close();

const result = {
  node: process.version,
  next: nextVersion,
  ponyfillIsNative: isPonyfillNative,
  fetchAcceptsPonyfillSignal: accepted,
  rejection,
  postNextTelemetryPayloadMs: submitMs,
};

console.log(JSON.stringify(result, null, 2));

const verdict = accepted
  ? "accepted — telemetry can be delivered"
  : `REFUSED — every telemetry submission fails; Next's own postNextTelemetryPayload took ${submitMs} ms to give up`;

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `| \`${process.version}\` | ${accepted ? "accepted" : "**refused**"} | ${
      submitMs === null ? "n/a (skipped)" : `${submitMs} ms`
    } | ${rejection ?? ""} |\n`,
  );
}

console.log(`\nnode ${process.version}: ${verdict}`);
