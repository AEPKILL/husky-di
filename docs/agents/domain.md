# Domain Context

This repository uses a single-context domain documentation layout.

## Authoritative sources

- `CONTEXT.md` is the authoritative repository-level domain context.
- `docs/adr/` contains long-lived architectural decisions.
- This file defines how agents consume those sources.

## Before exploring

Before diagnosis, design, TDD, architecture analysis, issue breakdown, or documentation work:

1. Read the root `CONTEXT.md`.
2. Read ADRs relevant to the affected area.

If a source does not exist, proceed without proposing it preemptively.

## Vocabulary

Use domain terms as defined in `CONTEXT.md`. Avoid synonyms that its terminology guidance rejects.

If a required concept is missing, reconsider whether it belongs to the project or record the gap for `domain-modeling`.

## ADR conflicts

Surface any conflict with an existing ADR explicitly instead of silently overriding it.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   ├── agents/
│   └── adr/
└── packages/
```

## Related documents

- `../../CONTEXT.md`
- `../adr/`
