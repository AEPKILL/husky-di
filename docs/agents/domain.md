# Domain Context

This repository uses a single-context domain documentation layout.

## Authoritative entry point

- The authoritative source for the repository-level domain context is the root `CONTEXT.md`.
- `docs/agents/domain.md` exists to provide a stable entry point for people and agents, not to duplicate and maintain a separate copy of the context.

## Usage conventions

- Before doing diagnosis, design, TDD, architecture analysis, issue breakdown, or documentation work, read the root `CONTEXT.md` first.
- If `domain.md` and `CONTEXT.md` ever disagree, `CONTEXT.md` takes precedence.
- If you add a long-lived architectural decision, prefer documenting it in `docs/adr/` and update `CONTEXT.md` when needed.

## Related documents

- `../../CONTEXT.md`
- `../adr/`
