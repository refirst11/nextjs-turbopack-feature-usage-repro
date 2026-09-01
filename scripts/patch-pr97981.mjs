// Ports the changes in https://github.com/vercel/next.js/pull/97981 (head 1103cb2)
// onto the compiled `dist` of the installed Next.js, so the PR can be measured
// without building the branch.
//
// Every replacement asserts exactly one match, and each patched file is
// re-parsed afterwards, so a partial or silently-failed port cannot be mistaken
// for "the change made no difference".
//
// Not ported: the two `await telemetry.flush()` calls on `build/index.ts` error
// paths, which do not run during a successful build.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const distRoot = resolve(dirname(require.resolve("next/package.json")), "dist");

const edits = new Map();
const patch = (relative, from, to) => {
  const file = resolve(distRoot, relative);
  const source = edits.get(file) ?? readFileSync(file, "utf8");
  const hits = source.split(from).length - 1;
  if (hits !== 1) {
    console.error(`\n${relative}: expected 1 match, found ${hits}, for:\n${from}\n`);
    process.exit(1);
  }
  edits.set(file, source.replace(from, to));
};

// --- telemetry/storage.js: real AbortController wiring, queue.clear, unique file
patch(
  "telemetry/storage.js",
  "this.record = (_events, deferred)=>{\n            const prom = (deferred ?",
  "this.record = (_events, deferred)=>{\n            const controller = new _ponyfill.AbortController();\n            const prom = (deferred ?",
);
patch(
  "telemetry/storage.js",
  ": this.submitRecord(_events)).then((value)=>({",
  ": this.submitRecord(_events, controller.signal)).then((value)=>({",
);
patch(
  "telemetry/storage.js",
  "prom._controller = prom._controller;",
  "prom._controller = controller;",
);
patch(
  "telemetry/storage.js",
  "                // if we fail to abort ignore this event\n                }\n            });\n            if (allEvents.length === 0) {",
  "                // if we fail to abort ignore this event\n                }\n            });\n            this.queue.clear();\n            if (allEvents.length === 0) {",
);
patch(
  "telemetry/storage.js",
  "const eventsFile = `_events_${process.pid}.json`;",
  "const eventsFile = `_events_${process.pid}_${(0, _crypto.randomBytes)(6).toString('hex')}.json`;",
);
patch(
  "telemetry/storage.js",
  "this.submitRecord = async (_events)=>{",
  "this.submitRecord = async (_events, signal)=>{",
);
patch(
  "telemetry/storage.js",
  "            const postController = new _ponyfill.AbortController();\n            const res = (0, _posttelemetrypayload.postNextTelemetryPayload)({",
  "            const res = (0, _posttelemetrypayload.postNextTelemetryPayload)({",
);
patch(
  "telemetry/storage.js",
  "            }, postController.signal);\n            res._controller = postController;\n            return res;",
  "            }, signal);\n            return res;",
);

// --- telemetry/detached-flush.js: accept the build phase
patch(
  "telemetry/detached-flush.js",
  "if (!dir || mode !== 'dev') {",
  "if (!dir || (mode !== 'dev' && mode !== 'build')) {",
);
patch(
  "telemetry/detached-flush.js",
  "const config = await (0, _config.default)(_constants.PHASE_DEVELOPMENT_SERVER, dir);",
  "const config = await (0, _config.default)(mode === 'build' ? _constants.PHASE_PRODUCTION_BUILD : _constants.PHASE_DEVELOPMENT_SERVER, dir);",
);

// --- build/index.js: stop awaiting the flush on the exit path
patch(
  "build/index.js",
  "await nextBuildSpan.traceChild('telemetry-flush').traceAsyncFn(()=>telemetry.flush());",
  "nextBuildSpan.traceChild('telemetry-flush').traceFn(()=>telemetry.flushDetached('build', dir));",
);
patch(
  "build/index.js",
  "// Flush telemetry before finishing (waits for async operations like setTimeout in debug mode)\n        const telemetry = _shared.traceGlobals.get('telemetry');\n        if (telemetry) {\n            await telemetry.flush();\n        }",
  "// Flush telemetry before finishing (waits for async operations like setTimeout in debug mode)\n        const telemetry = _shared.traceGlobals.get('telemetry');\n        if (telemetry) {\n            telemetry.flushDetached('build', dir);\n        }",
);

// --- build workers: absolute distDir, and stop awaiting the flush
patch(
  "build/turbopack-build/impl.js",
  "        distDir: _buildcontext.NextBuildContext.config.distDir\n    });",
  "        distDir: _path.default.join(_buildcontext.NextBuildContext.dir, _buildcontext.NextBuildContext.config.distDir)\n    });",
);
patch(
  "build/turbopack-build/impl.js",
  "        await telemetry.flush();",
  "        telemetry.flushDetached('build', _buildcontext.NextBuildContext.dir);",
);
patch(
  "build/webpack-build/impl.js",
  "        distDir: workerData.buildContext.config.distDir\n    });",
  "        distDir: require('path').join(workerData.buildContext.dir, workerData.buildContext.config.distDir)\n    });",
);
patch(
  "build/webpack-build/impl.js",
  "    await telemetry.flush();",
  "    telemetry.flushDetached('build', _buildcontext.NextBuildContext.dir);",
);

for (const [file, source] of edits) {
  writeFileSync(file, source);
  execFileSync(process.execPath, ["--check", file]);
  console.log(`patched ${file.slice(distRoot.length + 1)}`);
}
console.log(`\n${edits.size} files ported from PR #97981.`);
