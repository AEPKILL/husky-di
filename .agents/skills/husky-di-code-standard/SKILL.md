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
   specification or ADR governing the task. Read `CONTEXT.md` when domain
   concepts change. Identify each target's role, owner, public/private surface,
   and behavior impact.
2. **Classify.** Confirm the topology, role, and suffix of every added or moved
   file before implementation.
3. **Implement and propagate.** Match the local code shape and update every
   dependent reference in the same pass.
4. **Verify.** Run structural checks first, then every applicable affected-package
   check.

Completion requires every changed file to be accounted for, stale-reference
searches to be clean, and every applicable check to pass or have its failure
reported with evidence.

## Placement

Preserve local topology. Library internals normally use the role-first map below;
established feature/tooling trees such as `conformance`, plugins, nested test
resources, benchmarks, and frontend trees remain feature-first. For paths the
checker covers, its [config](../../../scripts/src/config/code-standard.config.ts)
and validators are the mechanical source of truth for suffixes and naming.

| Role | Meaning |
| --- | --- |
| `interfaces` | Structural or behavioral contracts; contract interfaces use `I...` |
| `types` | Runtime-free standalone data composition and type-level models |
| `impls` | Concrete behavior or state; replaceable implementations use `XxxImpl` |
| `factories` | Creation and assembly; creator functions use `createXxx` |
| `utils` | Mostly stateless helpers with verb-led names |
| `constants` / `consts` | Shared constants; exported names use `SCREAMING_SNAKE_CASE` |
| `enums` | Concepts intentionally modeled as named closed sets; names end in `Enum` |
| `exceptions` | Custom `XxxException` classes |
| `decorators` / `middlewares` | Their corresponding runtime roles |
| `shared` | Deliberately shared references, instances, or state; follow local filename shape |
| `typings` | Declaration shims |

In a role-first area, mirror a domain subdirectory across roles only for a
cohesive subsystem. Role remains authoritative: standalone types do not move to
`impls/<domain>/` merely to sit beside an implementation. Owner-specific
construction types follow Assembly Boundaries.

- Keep ordinary tests under their package's `tests/`; follow accepted package
  precedent for specialized files such as `tests/performance/*.bench.ts`.
- Name test subdirectories for a domain or behavior, and retain qualifiers such
  as `Default` only when they distinguish real alternatives.
- Reuse established semantic categories and patterns.

## Naming And Modeling

- Construction naming is contextual. Preserve established caller-facing option
  names; use `CreateXxxOptions` for owned internal construction bags according to
  Assembly Boundaries.
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
  constant forwarding. Keep concrete implementations and internal assembly
  seams private unless an entrypoint declares a public extension surface; protect
  important private surfaces with negative type tests.

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

Within a class, follow the nearest stable ordering. Otherwise use public API,
state, constructor, public methods, then internal helpers.

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
  including intentional prose matches.
- For a public API change or public-type move, update or preserve every entrypoint
  that currently exposes the affected contract and run its consumer/type-surface
  coverage.

## Validation

After a structural edit, run the structural checker early:

```bash
pnpm --filter @husky-di/scripts check:code-standard
```

Before completion, run the root `pnpm check:code-standard`, then the affected
workspace's available `test`, `typecheck`, and—when declarations or package
surfaces changed—`build` scripts. Run task-specific scripts such as `bench` when
applicable. Finish with `git diff --check` and confirm that no unexpected
generated artifacts entered the change.
