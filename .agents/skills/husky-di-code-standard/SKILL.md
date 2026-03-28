---
name: husky-di-code-standard
description: Use when modifying code in the husky-di repository and the change must follow the repository's established naming, placement, structure, header comment, and testing conventions
---

# husky-di Code Standard

## Overview

This skill defines the repository-local code standard for `husky-di`.

Use it alongside other applicable workflow skills. This skill governs repository style and structure, not feature planning, debugging, or test process by itself.

**Core principle:** Prefer existing `husky-di` patterns over generic AI defaults.

## When to Use

Use this skill for any code modification in this repository, including:

- adding files
- editing files
- refactoring
- moving files
- changing exports
- changing naming
- adding or changing tests
- adding or changing supported scripts and config files

Do not apply it to:

- generated artifacts
- lock files
- vendored output
- files that cannot meaningfully carry these rules

## Workflow

1. Read neighboring files and the nearest equivalent implementation before writing.
2. Match the existing directory semantics and file suffix patterns.
3. Match symbol naming, imports, exports, and file shape.
4. Update public exports and tests when the change affects them.
5. Ask before introducing a new repository pattern.

## Quick Reference

| Area | Rule |
| --- | --- |
| Placement | Reuse existing semantic directories before inventing a new one |
| File naming | Prefer existing suffixes such as `*.interface.ts`, `*.type.ts`, `*.enum.ts`, `*.factory.ts`, `*.utils.ts`, `*.const.ts`, `*.decorator.ts`, `*.middleware.ts`, `*.exception.ts` |
| Symbol naming | Classes `PascalCase`, interfaces `I...`, enums `PascalCaseEnum`, factories `createXxx`, private fields `_name` |
| Imports | Use `import type` for type-only imports; use `@/` inside package source; use package imports across packages |
| Exports | Prefer named exports; update `src/index.ts` for public API changes |
| Headers | Files that support comments should carry a header with `@overview`, `@author`, and `@created` |
| Style | Prefer direct, explicit, readable code over speculative abstraction |
| Exceptions | Keep `biome-ignore` narrow and always explain why |

## Placement Rules

Match the existing package structure.

- `interfaces`: structural contracts and public-facing interfaces
- `types`: aliases, unions, mapped types, conditional types, and type helpers
- `impls`: concrete implementations
- `utils`: mostly stateless helper functions
- `factories`: creation-oriented functions that assemble and return values or objects
- `constants`: shared constants
- `enums`: named closed sets already modeled as enums in this repository
- `exceptions`: custom error classes
- `decorators`: decorator functions
- `middlewares`: middleware implementations
- `shared`: intentionally shared refs, instances, and shared state
- `typings`: declaration files and typing shims
- `plugins`: package-local plugins and integration adapters
- `tests`: package-local tests and test helpers

If a package already has a directory with clear semantics, reuse it instead of creating a sibling alternative.

Additional placement rules:

- keep package tests under that package's `tests/`
- keep shared test helpers near the tests they support, such as `tests/test.utils.ts`
- keep repository-level scripts under `scripts/` unless a skill or package already owns a more local `scripts/` directory
- keep config files at the nearest package or repository root that already owns the tool configuration
- `shared` is not a dumping ground; only place intentionally shared state or shared instances there

## File Naming

Prefer the repository's existing suffixes and shapes.

- interfaces: `*.interface.ts`
- types: `*.type.ts`
- enums: `*.enum.ts`
- factories: `*.factory.ts`
- utilities: `*.utils.ts`
- constants: `*.const.ts`
- decorators: `*.decorator.ts`
- middlewares: `*.middleware.ts`
- exceptions: `*.exception.ts`
- plugins: `*.plugin.ts`
- tests: `*.test.ts`
- shared test helpers: `test.utils.ts`
- tool configs: preserve tool-native names such as `vitest.config.ts`, `rslib.config.ts`, and `lint-staged.config.js`
- declaration shims: `*.d.ts`
- implementation classes in `impls`: `PascalCase.ts`
- package entrypoints: `src/index.ts`

Do not invent new suffixes when an existing suffix already fits.

## Symbol Naming

- classes: `PascalCase`
- interfaces: `I` prefix, such as `IContainer`
- type aliases: `PascalCase`
- enums: `PascalCaseEnum`
- factory functions: `createXxx`
- utility functions: clear verb-led names such as `getXxx`, `setXxx`, `resetXxx`, or `createXxx`
- service identifiers: repository-style interface names such as `IServiceA`
- exported constants: semantic `camelCase` by default; do not jump to screaming snake case unless an external convention requires it
- private fields: leading underscore, such as `_name`
- internal escape hatches: existing `_internalXxx` pattern only when truly internal
- generic parameters: keep them short and conventional unless a longer name materially improves clarity
- local names: prefer repository vocabulary over abstract placeholder names

## Import And Export Rules

- Use `import type` whenever an import is type-only.
- Inside package source, prefer the existing `@/` alias conventions.
- Across packages, prefer package-name imports such as `@husky-di/core`.
- In tests and tooling, follow the nearest existing local pattern before changing import style.
- Prefer named exports.
- Do not add default exports unless a user explicitly asks for them.
- Public package APIs should flow through `src/index.ts`.
- Keep `index.ts` files focused on exports rather than implementation-heavy logic.
- Do not expose internal implementation files as public API by accident.

## File Shape And Headers

For files that safely support comments, include a file header that preserves the repository's metadata style.

Default metadata:

- `@overview`
- `@author`
- `@created`

Rules:

- keep the header aligned with the file's real responsibility
- keep the created timestamp format consistent with the repository's current convention
- short aggregator files may use shorter headers, but should still preserve the metadata style
- files that do not support comments, such as `json`, are naturally excluded

Prefer predictable file shape:

- header comment
- imports
- local types and constants near the code they support
- primary implementation
- local helpers when needed

Prefer predictable class shape:

- public API first
- private state next
- constructor after state
- public methods before internal helpers

Follow the nearest stable local example when a file already has its own internal ordering pattern.

## Implementation Style

- prefer direct and readable implementation over speculative abstraction
- favor explicit types
- use `readonly` and immutability-oriented design where appropriate
- keep helpers, factories, and implementations in their intended roles
- comment for intent, constraints, and edge cases
- do not add AI-style commentary for obvious lines
- keep comments and error messages linguistically consistent within the local file or package
- in package source, default to English unless the local file or package clearly establishes a different language pattern

## Type Modeling

- use `interface` for structural contracts and public-facing shapes
- use `type` for unions, utilities, mapped types, conditional types, and composed aliases
- use `class` for behavior, state, or concrete implementations
- use `enum` when the repository already models the concept as a named closed set
- keep public APIs strongly typed and explicit

## Errors And Exceptions

- say what failed
- include the object or context that failed
- avoid vague wording
- keep error wording aligned with existing repository usage

## biome-ignore

- prefer the narrowest possible ignore scope
- only ignore a rule for a real repository-specific reason
- always explain why the ignore exists
- do not leave placeholder explanations

## Tests And Public API

- treat tests as part of the repository style
- use behavioral `describe` and `it` names
- use `Arrange / Act / Assert` when it improves clarity
- keep test helpers near the package they support
- if behavior changes, update or add tests in the same package
- if public API changes, update `src/index.ts`

## New Patterns

Reuse existing repository patterns by default.

If the current repository patterns do not naturally fit the new problem, or reusing them would damage the existing structure, stop and ask before introducing:

- a new directory meaning
- a new file suffix
- a new export pattern
- a new abstraction style

Do not bend an old pattern into a bad fit just to avoid asking.

## Final Check

Before finishing, confirm:

- I checked neighboring files first
- the file is in the right directory
- the file name matches an existing repository pattern
- symbol names match local conventions
- imports and exports match local conventions
- the file header is present when comments are supported
- I did not add unnecessary abstraction
- tests and public exports were updated when needed

## Common Mistakes

- inventing a new suffix when an existing one already fits
- adding a default export
- putting implementation-heavy logic into `index.ts`
- placing implementation-heavy logic in `utils`
- skipping the file header on a file that supports comments
- writing obvious AI commentary
- using `biome-ignore` without a real reason
- forgetting to update `src/index.ts` after a public API change
- mixing language styles in the same source file without local precedent

## Local Examples

Good local examples to follow:

- `packages/core/src/interfaces/container.interface.ts`
- `packages/core/src/factories/container.factory.ts`
- `packages/core/src/enums/lifecycle.enum.ts`
- `packages/core/src/exceptions/resolve.exception.ts`
- `packages/core/src/impls/Container.ts`
- `packages/core/src/utils/container.utils.ts`
- `packages/decorator/src/middlewares/decorator.middleware.ts`
