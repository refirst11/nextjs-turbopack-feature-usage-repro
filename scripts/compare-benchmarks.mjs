// Prints the telemetry cost of several benchmark runs side by side.
// Usage: node scripts/compare-benchmarks.mjs "label=file.json" ...

import { readFileSync } from "node:fs";

const inputs = process.argv.slice(2).map((arg) => {
  const split = arg.indexOf("=");
  return { label: arg.slice(0, split), run: JSON.parse(readFileSync(arg.slice(split + 1), "utf8")) };
});

if (inputs.length < 2) {
  console.error('Usage: compare-benchmarks.mjs "label=file.json" "label=file.json" ...');
  process.exit(1);
}

const cost = ({ result }) =>
  result["telemetry-enabled"].mean - result["telemetry-disabled"].mean;

const baseline = cost(inputs[0].run);

const lines = [
  "| build | `next build` enabled | disabled | telemetry cost | removed |",
  "| --- | --- | --- | --- | --- |",
  ...inputs.map(({ label, run }, index) => {
    const c = cost(run);
    const removed =
      index === 0
        ? "—"
        : `${(baseline - c).toFixed(3)} s (${(((baseline - c) / baseline) * 100).toFixed(0)}%)`;
    return (
      `| ${label} | ${run.result["telemetry-enabled"].mean.toFixed(3)} s | ` +
      `${run.result["telemetry-disabled"].mean.toFixed(3)} s | **${c.toFixed(3)} s** | ${removed} |`
    );
  }),
];

const header = `node ${inputs[0].run.node} / next ${inputs[0].run.next} / ${inputs[0].run.runs} runs per arm`;
console.log(`${header}\n`);
console.log(lines.join("\n"));

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## ${header}\n\n${lines.join("\n")}\n\n`,
  );
}
