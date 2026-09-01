// Prints the telemetry cost of two benchmark runs side by side.
// Usage: node scripts/compare-benchmarks.mjs before.json after.json

import { readFileSync } from "node:fs";

const [beforePath, afterPath] = process.argv.slice(2);
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const before = read(beforePath);
const after = read(afterPath);

const cost = (r) => r.result["telemetry-enabled"].mean - r.result["telemetry-disabled"].mean;
const costBefore = cost(before);
const costAfter = cost(after);

const rows = [
  ["stock", before, costBefore],
  ["AbortSignal patched", after, costAfter],
];

const lines = [
  `| build | \`next build\` enabled | disabled | telemetry cost |`,
  `| --- | --- | --- | --- |`,
  ...rows.map(
    ([label, r, c]) =>
      `| ${label} | ${r.result["telemetry-enabled"].mean.toFixed(3)} s | ` +
      `${r.result["telemetry-disabled"].mean.toFixed(3)} s | **${c.toFixed(3)} s** |`,
  ),
];

console.log(`node ${before.node} / next ${before.next} / ${before.runs} runs per arm\n`);
console.log(lines.join("\n"));
console.log(
  `\nThe one-line change removes ${(costBefore - costAfter).toFixed(3)} s ` +
    `(${((1 - costAfter / costBefore) * 100).toFixed(0)}% of the telemetry cost).`,
);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## node ${before.node} / next ${before.next}\n\n${lines.join("\n")}\n\n` +
      `Removed: **${(costBefore - costAfter).toFixed(3)} s** ` +
      `(${((1 - costAfter / costBefore) * 100).toFixed(0)}%)\n\n`,
  );
}
