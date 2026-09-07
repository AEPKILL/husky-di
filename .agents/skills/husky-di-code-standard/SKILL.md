---
name: husky-di-code-standard
description: "husky-di code changes: apply repository-specific placement, naming, file-shape, API-boundary, test-evidence, and validation rules."
---

# husky-di Code Standard

Normative specifications and accepted ADRs outrank implementation precedent; the
checker governs mechanical rules in its scope. Where those sources are silent,
prefer the nearest stable local pattern over generic TypeScript conventions and
use `packages/core` only as a shared-naming fallback.

## Workflow

1. **Inspect.** Read the nearest neighbors, closest equivalent, and any normative
   specification or ADR governing the task. Follow the context-reading triggers
   in [domain guidance](../../../docs/agents/domain.md#before-exploring).
   Identify each target's role, owner, public/private surface, and behavior impact.
2. **Classify.** Confirm the topology, role, and suffix of every added or moved
   file before implementation.
3. **Implement and propagate.** Match the local code shape and update every
   dependent reference in the same pass.
4. **Verify.** Select checks by change impact using [Validation](#validation).

Apply these rules to the task's changes and their necessary propagation. Expand
cleanup to existing code only when directly required by the task; touching a file
does not require bringing its unrelated contents into compliance.

Completion requires every file changed for the task to be accounted for, obsolete
references to be resolved, and validation outcomes to meet the criteria below.

## Placement

Preserve each package's established topology. Library internals may be role-first
or module-first; both use the role map below. Established feature/tooling trees
such as `conformance`, plugins, nested test resources, benchmarks, and frontend
trees retain their local organization. For paths the checker covers, its
[config](../../../scripts/src/config/code-standard.config.ts) and validators are
the mechanical source of truth for suffixes and naming.

For module-first library internals, as in `packages/remote`, use
`src/modules/<module>/<role>/`, for example `modules/peer/types/` and
`modules/protocol/schemas/`. Use `modules` for the aggregation directory: these
are responsibility-based internal modules, including protocol, transport, and
runtime implementations. Keep package entrypoint files at `src/`.

Place cross-module helpers in the sibling `src/shared/<role>/`, for example
`shared/types/` or `shared/utils/`. Modules may depend on shared helpers; shared
helpers must remain independent of modules. Keep contracts owned by a specific
module with that module even when another module consumes them. Apply this
layout within module-first packages; preserve role-first packages unless their
migration is requested.

| Role | Meaning |
| --- | --- |
| `interfaces` | Structural or behavioral contracts; contract interfaces use `I...` |
| `types` | Type contracts and type-level models; schemas follow contract ownership |
| `schemas` | Independent Zod validation schemas in `.schema.ts` files; may colocate derived types |
| `impls` | Concrete behavior or state; replaceable implementations use `XxxImpl` |
| `factories` | Creation and assembly; creator functions use `createXxx` |
| `utils` | Mostly stateless helpers with verb-led names |
| `constants` / `consts` | Shared constants; exported names use `SCREAMING_SNAKE_CASE` |
| `enums` | Concepts intentionally modeled as named closed sets; names end in `Enum` |
| `exceptions` | Custom `XxxException` classes |
| `decorators` / `middlewares` | Their corresponding runtime roles |
| `shared` | Shared helpers, references, instances, or state; module-first packages group them by role |
| `typings` | Declaration shims |

In a role-first area, mirror a domain subdirectory across roles only for a
cohesive subsystem. Role remains authoritative: standalone types do not move to
`impls/<domain>/` merely to sit beside an implementation. Owner-specific
construction types follow Assembly Boundaries.

- Keep ordinary tests under their package's `tests/`; follow accepted package
  precedent for specialized files such as `tests/performance/*.bench.ts`.
- Name test subdirectories for a domain or behavior, and retain qualifiers such
  as `Default` only when they distinguish real alternatives.

## Naming And Modeling

- Omit `Default` when only one canonical implementation exists. Retain it when
  it distinguishes a real alternative or is established domain vocabulary.
- Preserve the local private-field convention (`_name` or `#name`) rather than
  imposing one repository-wide.

### Assembly Boundaries

The repository's design preference is to program to behavioral abstractions,
including package-private collaborators and seams with only one current
implementation. Adapter or caller count alone is not evidence that a seam is
hypothetical. When a contract is too broad, shallow, or mirrors its
implementation, first narrow or repartition it around actual consumer
capabilities; remove it only when no behavior, state, lifetime, or effect crosses
that consumer boundary.

When introducing or changing a dependency, implementation, injected creation
callback, factory/constructor input bag, or assembly seam, read and apply
[references/assembly-boundaries.md](references/assembly-boundaries.md) for
contract derivation, concrete-type visibility, placement, ownership, and
lifetime rules.

### Exceptions

Use `CodedException<TCode>` when callers branch on a stable code, following the
package's enum or literal-union precedent. Put reusable creation policy or
literal-code narrowing in `createXxxException`; the factory does not justify a
private constructor. When the exception is public, expose its code contract too;
keep internal creation policy private.

## Imports And API Boundaries

- Use `import type` for type-only imports and inline `type` specifiers in mixed
  imports. Prefer `@/` for cross-directory package-source imports; same-directory,
  test, and tool imports follow local precedent.
- Across packages, import only the root or a subpath declared in
  `package.json#exports`. Use named exports in normal source; preserve
  tool-required defaults in config and generated files.
- A source export enables internal reuse; only a declared entrypoint creates
  caller exposure. Keep entrypoints export-only except for imports and stable
  constant forwarding. Apply [Assembly Boundaries](#assembly-boundaries) when
  changing the visibility of implementations or assembly seams.

## File Shape

Every TypeScript file in the code-standard checker's scope starts with a block
comment containing `@overview`, `@author`, and `@created`. Preserve a valid
existing header and its creation timestamp; update the overview when the file's
responsibility changes. A minimal new-file header is:

```ts
/**
 * @overview Describe the file's actual responsibility.
 * @author AEPKILL
 * @created YYYY-MM-DD HH:mm:ss
 */
```

Place schemas by contract ownership: colocate validation of a type-owned contract
in `.type.ts`; give an independent validation responsibility a `.schema.ts` file
in its owning `schemas/` role. When adding, changing, or moving either file kind,
or changing schema ownership, read and apply
[references/schema-contracts.md](references/schema-contracts.md).

After the header, place directive prologues and imports, then keep these
top-level blocks in order:

1. exported types and type-only re-exports;
2. exported runtime declarations and value re-exports;
3. file-local types;
4. file-local runtime declarations and executable statements.

Keep overloads, merges, declaration/implementation pairs, and their documentation
together; a merge with a runtime value belongs to a runtime block. Preserve
dependency and side-effect order, using an early named export binding when a
runtime declaration must stay later. Change generated source at its template or
generator; preserve externally fixed output and its explicit exclusion.

Within a class, follow the nearest stable ordering. Otherwise use public fields
and accessors, internal state fields, constructor, public methods, then internal
helpers. Preserve field initialization dependencies.

## Implementation Style

- When a complex compound condition obscures a domain decision, extract a
  semantically named local boolean in the branch's polarity and comment its
  intent when the name is insufficient. Preserve left-to-right short-circuit
  order; use one snapshot in the boolean and guarded code when narrowing an
  optional or mutable value.
- Keep each `biome-ignore` at the narrowest scope and include a specific reason
  after `:`. Keep source comments and errors in the package's established
  language, normally English.

## Tests, Specs, And Moves

- Update affected-package behavioral tests and apply the public-behavior
  specification gate in the root `AGENTS.md`.
- A move or rename includes source imports, tests, entrypoints, build references,
  and requirement-evidence paths. Use `rg` to review old symbol and path forms,
  updating obsolete references and accounting for intentional matches such as
  historical prose.
- For a public API change or public-type move, update or preserve every entrypoint
  that currently exposes the affected contract and run its consumer/type-surface
  coverage.

## Validation

For documentation-only changes, check affected links and document structure,
plus any applicable document or skill validator. For code changes, including
moves, run the root `pnpm check:code-standard` and the affected workspaces' tests
and available `typecheck` scripts. When declarations or package surfaces change,
also run their available `build` scripts and consumer/type-surface coverage.

Inspect each affected workspace's `package.json` to select the test scripts that
cover the changed behavior, including specialized `test:*` entries. For checker
changes, run `pnpm --filter @husky-di/scripts test:code-standard`: running the
checker validates repository source, while its tests validate the checker itself.
Run task-specific scripts such as `bench` when applicable.

After a structural code edit, run the structural checker early:

```bash
pnpm --filter @husky-di/scripts check:code-standard
```

Fix failures introduced by the task before declaring completion. For confirmed
pre-existing failures or environment blockers, report the command, evidence for
that attribution, impact, and remaining validation gaps. Investigate failures of
uncertain origin; if attribution remains blocked, explicitly report the work as
incomplete rather than treating the failure log as completion evidence.

Finish every change with `git diff --check` and confirm that no unexpected
generated artifacts entered the task's diff.
