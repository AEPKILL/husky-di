---
name: husky-di-code-standard
description: Apply husky-di repository conventions when adding, editing, moving, renaming, exporting, or testing code; governs semantic placement, file suffixes, symbol names, imports, headers, API boundaries, and verification
---

# husky-di Code Standard

Prefer established `husky-di` patterns over generic defaults. Treat placement,
naming, exports, tests, and requirement evidence as one change.

## Workflow

1. Read the nearest neighboring files and the closest equivalent implementation.
   Use `packages/core` as the naming reference when the local package has no
   precedent.
2. Classify every changed file by role and, when useful, by domain. Confirm that
   its directory and suffix agree before editing implementation details.
3. Match local symbol names, imports, exports, headers, and file shape.
4. Propagate moves and renames through source imports, tests, package entrypoints,
   documentation evidence pointers, and build references. Search for stale names
   and paths before validation.
5. Run the repository code-standard checker immediately after structural changes;
   then run formatting, type checks, and the affected package tests.

Completion requires every changed file to be accounted for, no stale reference to
a moved path, and all applicable checks to pass.

## Placement

Organize source by file role first:

| Directory | Responsibility | Required suffix or shape |
| --- | --- | --- |
| `interfaces` | Structural and behavioral contracts | `*.interface.ts`; interface names start with `I` |
| `types` | Options, aliases, unions, mapped and conditional types | `*.type.ts` |
| `impls` | Concrete behavior and stateful implementations | `*.impl.ts` |
| `factories` | Creation and dependency assembly | `*.factory.ts`; exported functions use `createXxx` |
| `utils` | Mostly stateless helpers | `*.util.ts` |
| `constants` or existing `consts` | Shared constants | `*.const.ts` |
| `enums` | Repository concepts already modeled as enums | `*.enum.ts` |
| `exceptions` | Custom error classes | `*.exception.ts` |
| `decorators` | Decorator functions | `*.decorator.ts` |
| `middlewares` | Middleware implementations | `*.middleware.ts` |
| `shared` | Intentionally shared references, instances, or state | Match the contained role |
| `typings` | Declaration shims | `*.d.ts` |
| `plugins` | Package-local plugins and adapters | `*.plugin.ts` |

Use a domain subdirectory when a cohesive subsystem spans several roles. Mirror
the domain name across the applicable role directories:

```text
src/
├── constants/protocol/
├── impls/protocol/
├── interfaces/protocol/
└── types/protocol/
```

The role directory remains authoritative: an `impls/**` directory contains only
`*.impl.ts`; move constants, interfaces, and types to their matching role
directories even when they belong to the same domain.

Additional placement rules:

- Reuse an existing semantic directory before creating a sibling alternative.
- Keep package tests under that package's `tests/` and shared helpers near their
  consumers, usually as `test.utils.ts`.
- Keep repository scripts under `scripts/` unless a package already owns a local
  scripts directory.
- Keep configuration at the nearest root that already owns the tool.
- Use `shared` only for deliberately shared state or instances.
- Ask before introducing a new directory meaning, suffix, export pattern, or
  abstraction style that has no repository precedent.

## Naming And Modeling

- Classes use `PascalCase`; concrete replaceable implementations use `XxxImpl`.
- Interfaces use the `I` prefix, such as `IRpcCodec`.
- Construction parameter bags use `CreateXxxOptions`, not an `I...Assembly`
  interface. Model them as `type` unless they are behavioral contracts.
- Type aliases use `PascalCase` without an interface prefix.
- Enums use `PascalCaseEnum`.
- Factories use `createXxx`; utilities use clear verb-led names such as `getXxx`,
  `setXxx`, or `resetXxx`.
- Exported constants in `*.const.ts` use `SCREAMING_SNAKE_CASE`.
- Private fields use a leading underscore.
- Generic parameters stay short and conventional unless a longer name improves
  clarity.
- Prefer repository vocabulary over generic placeholders.
- Omit qualifiers such as `Default` when only one canonical implementation exists;
  retain a qualifier only when it distinguishes real alternatives.

Use `interface` for behavioral or structural contracts, `type` for data
composition and type-level modeling, and `class` for concrete behavior or state.

## Assembly Boundaries

When a component is intentionally replaceable at construction time:

- put its contract in `interfaces/<domain>/`;
- put construction inputs in `types/<domain>/` as `CreateXxxOptions`;
- put the concrete class in `impls/<domain>/` as `XxxImpl`;
- assemble dependencies in a `*.factory.ts` file;
- use `readonly` references and snapshot or freeze assembly options when runtime
  replacement is unsupported;
- avoid adding setters or exposing internal seams through a package entrypoint.

Introduce this structure only for a real assembly, testing, or implementation
boundary—not for speculative flexibility.

## Imports And Exports

- Use `import type` for type-only imports.
- Use the package's `@/` alias inside package source.
- Use package imports such as `@husky-di/core` across packages.
- In tests and tools, follow the nearest stable import style.
- Prefer named exports and keep exported declarations near the top of the file.
- Keep `index.ts` focused on exports; route public APIs through the package
  entrypoint.
- Keep implementation classes and assembly seams private unless the public API
  explicitly requires them.
- When an internal boundary must stay private, preserve or add compile-time
  negative surface tests.

## File Shape

Files that support comments carry the repository header:

```ts
/**
 * @overview Describe the file's actual responsibility.
 * @author AEPKILL
 * @created YYYY-MM-DD HH:mm:ss
 */
```

Keep the local timestamp format. Use the predictable order: header, imports,
exported declarations, then file-local support. Within classes, follow the nearest
stable class ordering; otherwise prefer public API, state, constructor, public
methods, and internal helpers.

## Implementation Style

- Prefer direct, explicit code over speculative abstraction.
- Use explicit types and immutability where they clarify ownership.
- Keep factories, implementations, constants, types, and helpers in their own
  roles.
- Comment intent, constraints, and edge cases—not obvious operations.
- Keep source comments and errors in the package's established language, normally
  English.
- State what failed and include the relevant object or context in errors.
- Keep every `biome-ignore` narrow and explain the repository-specific reason.

For frontend code, prefer existing Tailwind utilities and theme tokens. Add CSS
only for shared global styling or a case existing utilities cannot express.

## Tests, Specs, And Moves

- Use behavioral `describe` and `it` names; use Arrange/Act/Assert only when it
  improves readability.
- Update tests in the same package as the behavior.
- When public behavior is introduced or expanded, update the normative
  specification and matching `specification.test.ts` coverage in the same change.
- When a test file moves without a behavior change, update requirement evidence
  paths such as `docs/REQUIREMENTS.md`.
- When public API changes, update package entrypoints and consumer/type-surface
  tests.
- After a rename, search the affected package for the old symbol, directory, and
  filename forms; intentional prose uses must be reviewed rather than blindly
  replaced.

## Validation

Run structural checks before broad tests so placement errors fail early:

```bash
pnpm --filter @husky-di/scripts check:code-standard
pnpm exec biome check <changed-paths>
```

Then run the affected package's typecheck, build when declarations or package
surfaces changed, and its complete test script. Finish with `git diff --check` and
confirm generated artifacts were not added.

## Final Check

- Every file sits in the correct role and optional domain directory.
- Every filename suffix agrees with its role directory.
- Symbols and construction options follow local naming.
- Imports, entrypoints, and private/public boundaries are correct.
- Headers describe current responsibilities.
- Tests, specs, and requirement evidence match the change.
- Searches find no stale moved names or paths.
- Code-standard, formatting, type, and behavior checks pass.

## Local References

- `packages/core/src/interfaces/container.interface.ts`
- `packages/core/src/factories/container.factory.ts`
- `packages/core/src/impls/container.impl.ts`
- `packages/core/src/types/resolve-helper-options.type.ts`
- `packages/core/src/enums/lifecycle.enum.ts`
- `packages/core/src/exceptions/resolve.exception.ts`
- `packages/core/src/utils/container.util.ts`
- `packages/decorator/src/middlewares/decorator.middleware.ts`
