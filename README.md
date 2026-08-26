# `next build` waits for telemetry submission before it returns

`next build` awaits `telemetry.flush()`, which awaits the outstanding HTTP POSTs
to `https://telemetry.nextjs.org/api/v1/record`. Those requests cannot affect the
build output — `.next` is identical whether they succeed, fail, or are never
sent — but the build does not finish until they settle.

The dev server does not do this. `Telemetry` already exposes `flushDetached`,
which writes pending events to disk and spawns a detached child process to
submit them "without blocking the main process from exiting". Only dev uses it.

| Call site | Behaviour |
|---|---|
| `packages/next/src/cli/next-dev.ts` | `telemetry.flushDetached('dev', dir)` |
| `packages/next/src/server/lib/start-server.ts` | `telemetry.flushDetached('dev', dir)` |
| `packages/next/src/build/index.ts` | `await telemetry.flush()` |

`flushDetached` is typed `(mode: 'dev', dir: string) => void` and
`detached-flush.ts` rejects any mode other than `'dev'`.

## Result

Difference in total `next build` wall time between telemetry enabled and
`NEXT_TELEMETRY_DISABLED=1`, measured on GitHub-hosted runners, 6 runs per arm,
first sample of each arm discarded
([workflow run](https://github.com/refirst11/nextjs-turbopack-feature-usage-repro/actions/runs/32959980062)):

| Node | `16.3.3` | `16.4.0-canary.8` |
|---|---:|---:|
| 22 | `0.316 s` | `0.181 s` |
| 23 | `0.433 s` | `0.371 s` |
| 24 | `1.085 s` | `1.102 s` |
| 25 | `1.004 s` | `1.017 s` |
| 26 | `1.090 s` | `1.020 s` |

The cost is present on every version tested and grows sharply from Node 24
onward. This reproduction measures that difference; it does not diagnose the
Node-version split.

There are two places where the build waits, not one. In a local run with
`next/dist` instrumented (`16.3.3`, Node 25), `telemetry-flush` accounts for
`0.493 s` while the `run-turbopack` span is `0.775 s` longer than in the
disabled arm — even though `turbopackBuild()` itself returns at the same point
in both arms. The build work is done; the parent is waiting for the worker,
whose stderr shows telemetry POST attempts across that window. So moving
`build/index.ts` to the detached path may not be sufficient on its own.

Collecting the events is not the cost. A third arm (`NEXT_TELEMETRY_DEBUG=1`)
still collects everything but never reaches the network, and lands within
`0.08–0.23 s` of the disabled arm in every job — a bound that also contains the
debug path's artificial `setTimeout(100)` per submitted batch.

## Reproduce

```bash
pnpm install
npx next telemetry status   # must report "Enabled"
pnpm benchmark              # RUNS=12 pnpm benchmark for more samples
```

Three arms build the same source tree with the same Next.js package and the same
native binary; only the environment differs. The harness rotates the arm order
every run, removes `.next` before every build, discards the first sample of each
arm, and invokes the Next.js CLI directly so package-manager startup is outside
the measured interval.

`.github/workflows/benchmark.yml` runs the same measurement across the matrix
above.

## Scope

This is about `next build` blocking on telemetry submission. It is not an
argument against collecting telemetry, and not a request to change what is
collected or sent.

Generated with `pnpm create next-app -e reproduction-template`. `app/page.tsx`
and `app/layout.tsx` are unmodified; `next.config.ts` disables
`turbopackFileSystemCacheForBuild` and `turbopackMemoryEviction` so every arm
builds from a cold graph.
