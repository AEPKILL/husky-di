# `@husky-di/remote` architecture review handoff

Date: 2026-08-25
Status: design accepted; implementation not started

## Start here

- [Visual architecture review](architecture-review-20260825-185328.html) is the
  discovery report that ranked five deepening candidates.
- [Accepted Zod wire-validation design](../../../../../.scratch/remote-zod-wire-validation/spec.md)
  is the authority for the selected approach.
- [Implementation ticket](../../../../../.scratch/remote-zod-wire-validation/issues/01-adopt-zod-owned-wire-validation.md)
  is fully specified and marked `ready-for-agent`.
- [Remote RPC Wayfinder](../../../../../.scratch/remote-rpc-framework/map.md)
  contains the in-place current decisions for the wider package.

The visual report predates the detailed Zod discussion. Use it for architecture
discovery and evidence locations; use the accepted spec and ticket for the
implementation contract.

## Workspace state

- No production implementation has started and no commit was created.
- The working tree contains the accepted spec/ticket, direct edits to the
  existing Wayfinder decisions, and this review archive. Preserve those changes.
- The obsolete JSON Schema publication decision was rewritten in place at the
  user's request; there is no separate amendment or supersession record.
- No `CONTEXT.md` or ADR update is needed for the accepted design: it introduces
  no new domain vocabulary and remains a pre-release, reversible implementation
  decision.
- Root repository instructions still apply; see [`AGENTS.md`](../../../../../AGENTS.md).

## Verification completed

- The archived HTML is byte-for-byte identical to the temporary source. SHA-256:
  `9d36f0ee745b97e67614952be34eda0a0ffea98852e6a4ed0daaa4be6678d563`.
- Sensitive-path and credential-pattern checks found no content requiring
  redaction in the report.
- `git diff --check` passes.
- Tests were not run because this session changed planning and documentation
  artifacts only.

## Next session

Review the accepted spec, then implement the linked ticket as one coherent
change. The ticket already records the migration route, scope guard, normative
spec/test synchronization requirement, and acceptance checks; do not duplicate
or reinterpret them here. Refresh the provided codegraph before implementation
if the source tree has moved.

## Suggested skills

- [`husky-di-code-standard`](../../../../../.agents/skills/husky-di-code-standard/SKILL.md)
  — mandatory for every production code change in this repository.
- [`tdd`](../../../../../.agents/skills/tdd/SKILL.md) — add the ticket's
  characterization coverage before migrating validation.
- [`codebase-design`](../../../../../.agents/skills/codebase-design/SKILL.md) —
  preserve the owning-Module seam and dependency direction.
- [`ponytail`](../../../../../.agents/skills/ponytail/SKILL.md) — avoid rebuilding
  the deleted catch-all schema catalog under a new abstraction.
- [`code-review`](../../../../../.agents/skills/code-review/SKILL.md) — review the
  completed change against both repository standards and the accepted spec.

## Rendering note

The archived HTML is intentionally unchanged. It loads Tailwind CSS and Mermaid
from public CDNs, so full styling and diagrams require network access. Its text
content remains readable from source without those dependencies.
