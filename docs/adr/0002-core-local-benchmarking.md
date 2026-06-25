# ADR-0002: Use Vitest Benchmark Mode for Local Core Resolve Comparisons

## Status

Accepted

## Context

`@husky-di/core` needs a repeatable way to compare resolve performance across
common scenarios such as direct lookups, transient creation, singleton hits,
parent-child lookup, middleware overhead, and dependency graph depth.

The first version of this capability is intentionally local-only:

- It is for developer-side comparisons during core changes.
- It does not need CI gating yet.
- It does not need persisted JSON or markdown result artifacts.
- It should avoid introducing a second benchmark stack when the repository
  already uses Vitest.

The desired comparison unit is a fixed batch of `1,000,000` resolve operations
per sample so developers can reason about "how long one million resolves takes"
without translating from per-operation microbenchmarks.

## Decision

Use Vitest benchmark mode for local core performance comparisons.

The benchmark workflow is:

```bash
pnpm --filter @husky-di/core bench
```

Benchmark source files live under:

```text
packages/core/tests/performance/*.bench.ts
```

Each benchmark sample runs a fixed batch of `1,000,000` resolve operations and
relies on Vitest's console reporter for comparison output. No benchmark result
files are written by default.

The initial benchmark coverage focuses on:

- provider and topology scenarios
- middleware overhead scenarios
- dependency depth scenarios

## Consequences

- `@husky-di/core` stays on the existing Vitest toolchain instead of adding a
  separate benchmark runner.
- Benchmark output is ephemeral console output, which keeps the workflow simple
  but does not preserve historical comparisons automatically.
- The benchmark suite is intentionally excluded from the normal `vitest run`
  path and is only executed through `vitest bench`.
- Vitest benchmark support is marked experimental by Vitest, so future Vitest
  upgrades may require small adjustments to benchmark files or options.
