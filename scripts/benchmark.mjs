import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const nextVersion = require("next/package.json").version;
const nextBin = require.resolve("next/dist/bin/next");

const arms = [
  { name: "telemetry-enabled", env: {} },
  { name: "telemetry-disabled", env: { NEXT_TELEMETRY_DISABLED: "1" } },
  { name: "telemetry-debug", env: { NEXT_TELEMETRY_DEBUG: "1" } },
];

const runs = Number.parseInt(process.env.RUNS ?? "8", 10);

if (!Number.isInteger(runs) || runs < 2) {
  throw new Error("RUNS must be an integer >= 2");
}

const samples = Object.fromEntries(arms.map((arm) => [arm.name, []]));

for (let run = 0; run < runs; run += 1) {
  const offset = run % arms.length;
  const order = [...arms.slice(offset), ...arms.slice(0, offset)];

  for (const arm of order) {
    rmSync(resolve(root, ".next"), { recursive: true, force: true });

    const started = performance.now();
    execFileSync(process.execPath, [nextBin, "build"], {
      cwd: root,
      stdio: "ignore",
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "",
        NEXT_TELEMETRY_DEBUG: "",
        ...arm.env,
      },
    });
    const seconds = (performance.now() - started) / 1000;

    samples[arm.name].push(seconds);
    console.log(
      `[${arm.name}] run ${run + 1}/${runs}: ${seconds.toFixed(3)} s`,
    );
  }
}

const summarize = (values) => {
  const measured = values.slice(1);
  const sorted = [...measured].sort((a, b) => a - b);
  const mean =
    measured.reduce((sum, value) => sum + value, 0) / measured.length;
  return {
    samples: values,
    discardedFirstSample: values[0],
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted.at(-1),
  };
};

const result = Object.fromEntries(
  Object.entries(samples).map(([name, values]) => [name, summarize(values)]),
);

console.table(
  Object.fromEntries(
    Object.entries(result).map(([name, value]) => [
      name,
      {
        "mean (s)": value.mean.toFixed(3),
        "median (s)": value.median.toFixed(3),
        "min (s)": value.min.toFixed(3),
        "max (s)": value.max.toFixed(3),
      },
    ]),
  ),
);

const enabled = result["telemetry-enabled"].mean;
const disabled = result["telemetry-disabled"].mean;
const debug = result["telemetry-debug"].mean;

const summary = {
  runs,
  node: process.version,
  next: nextVersion,
  platform: `${process.platform}-${process.arch}`,
  totalTelemetryCost: enabled - disabled,
  submissionCostLowerBound: enabled - debug,
  collectionCostUpperBound: debug - disabled,
  result,
};

console.log(
  `\nTelemetry adds ${summary.totalTelemetryCost.toFixed(3)} s to the build ` +
    `(${((summary.totalTelemetryCost / disabled) * 100).toFixed(1)}% of the disabled arm).\n` +
    `Read that difference; the split below is bounded, not exact, because the\n` +
    `debug arm pays an artificial 100 ms per submitted batch:\n` +
    `  submission >= ${summary.submissionCostLowerBound.toFixed(3)} s (enabled minus debug)\n` +
    `  collection <= ${summary.collectionCostUpperBound.toFixed(3)} s (debug minus disabled)`,
);

writeFileSync(
  resolve(root, "benchmark-results.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log("Results written to benchmark-results.json");
