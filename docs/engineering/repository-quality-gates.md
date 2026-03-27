# Repository Quality Gates Design

## Background

The repository currently has a solid baseline:

- `pnpm` monorepo layout
- `Biome` for formatting and linting
- `Vitest` for testing
- `husky` for local git hooks
- GitHub Actions for CI

What is missing is a repository-level, enforceable standards system for code style, naming, file placement, package boundaries, testing expectations, release checks, and documentation consistency.

The goal of this design is to add those standards as executable quality gates, not as AI-only guidance or informal documentation.

## Goals

- Enforce repository standards through existing tooling whenever possible
- Use custom scripts only for checks that existing tools cannot express
- Keep the developer workflow simple with a small set of root commands
- Make local hooks, CI, and release checks use the same validation entrypoints
- Base custom repository checks on real syntax analysis instead of regular expressions
- Derive naming and structure rules from the current codebase patterns instead of inventing an unrelated style guide

## Non-Goals

- Replacing `Biome` or `Vitest` with a heavier toolchain
- Introducing broad new linting dependencies when existing tools are sufficient
- Enforcing subjective documentation writing quality
- Performing large-scale renames or refactors as part of the design itself

## Design Principles

### 1. Existing tools first

The repository should prefer current tooling in this order:

1. `Biome`
2. `Vitest`
3. `husky`
4. GitHub Actions
5. Small TypeScript repository-check scripts only where the tools above are insufficient

This means code-internal standards should be enforced by `Biome` when possible, test execution and coverage should be enforced by `Vitest`, and execution timing should be enforced by hooks and CI. Custom scripts are reserved for repository-level structural rules.

### 2. Syntax-aware custom validation

When custom validation is required, it must be implemented in TypeScript and should use syntax-aware analysis:

- TypeScript compiler API
- parsed import/export declarations
- filesystem-aware package and path resolution

Repository checks must not rely on regular-expression scanning of source code for semantic rules.

### 3. Single source of truth for enforcement

The repository should expose a small set of root commands. Local hooks, CI, and release flows should call those commands instead of duplicating logic in multiple places.

## Proposed Enforcement Model

## Root commands

Add root-level verification commands with clear scope:

- `pnpm verify:format`
- `pnpm verify:lint`
- `pnpm verify:test`
- `pnpm verify:repo`
- `pnpm verify:fast`
- `pnpm verify`

Expected responsibilities:

- `verify:format`: formatting validation using `Biome`
- `verify:lint`: lint validation using `Biome`
- `verify:test`: full repository test run plus coverage thresholds using `Vitest`
- `verify:repo`: repository-level structural validation not covered by existing tools
- `verify:fast`: fast local gate for pre-commit usage
- `verify`: complete gate for CI and release

## Hook and CI integration

### Local hooks

- `pre-commit` should run the fast gate
- `commit-msg` should validate commit message format

### CI

GitHub Actions should call the root verification commands instead of embedding separate validation rules inline.

### Release

Release flows should depend on the same complete verification command used by CI.

## Standards to Enforce

## 1. Code formatting and linting

Use `Biome` as the primary enforcement mechanism for:

- formatting
- import organization
- baseline lint rules
- applicable symbol naming conventions already supported by `Biome`

No additional lint stack should be introduced unless a later gap analysis shows a concrete, high-value rule that `Biome` cannot enforce and that cannot reasonably live in repository-level validation.

## 2. Directory and file placement rules

These are repository-structure rules and are good candidates for custom validation because they are not naturally enforced by `Biome` or `Vitest`.

### Root structure

The repository should treat the following as first-class root areas:

- `packages/`
- `docs/`
- `.github/`
- `.changeset/`
- `.husky/`
- `scripts/`

Production package source code should not be added arbitrarily at the repository root.

### Package structure

Each package under `packages/*` should follow a consistent shape:

- `src/` for production code
- `tests/` for tests
- `docs/` for package-level documentation/specification
- package configuration files at package root

### Source subdirectory semantics

The current repository already implies a stable vocabulary. The first version of repository rules should formalize that vocabulary rather than invent a new one. Existing semantic directories include:

- `impls`
- `interfaces`
- `types`
- `factories`
- `utils`
- `enums`
- `exceptions`
- `decorators`
- `middlewares`
- `constants`
- `shared`
- `typings`

These names express intent clearly. By contrast, vague directory names such as `helpers`, `common`, `misc`, `lib`, `base`, or `manager` should not be introduced without an explicit rule change.

## 3. Naming rules derived from current code

### File naming

The current codebase already uses semantic suffixes extensively. That pattern should become an enforced convention.

Recommended file patterns:

- `*.interface.ts`
- `*.type.ts`
- `*.enum.ts`
- `*.factory.ts`
- `*.utils.ts`
- `*.exception.ts`
- `*.decorator.ts`
- `*.middleware.ts`
- `*.const.ts`
- `*.d.ts`

General rule:

- semantic filenames should use `kebab-case`
- implementation-class files in `impls/` may use `PascalCase.ts` when the main export is a class
- `index.ts` should be reserved for deliberate public entrypoints or aggregation points

### Symbol naming

Enforce or preserve the following conventions:

- classes, type aliases, interfaces, and enums use `PascalCase`
- interfaces keep the existing `I` prefix convention
- functions and variables use `camelCase`
- constants use `UPPER_SNAKE_CASE`
- enum names keep the `Enum` suffix
- exception classes keep the `Exception` suffix
- factory functions start with `create`

### Test naming

- test files must use `*.test.ts`
- helper files for tests may exist, but only under `tests/`
- vague filenames such as `test.ts`, `helper.ts`, or `common.ts` should be disallowed where they do not express responsibility

## 4. Package boundary rules

Package-boundary validation is a repository-level concern and should be implemented with syntax-aware TypeScript analysis.

Rules:

- cross-package imports must use package names, not relative traversal
- packages may not import another package's `src/`, `tests/`, or `docs/` internals
- packages should consume other packages through their public entrypoints
- test code may depend on its own package `src/`, but not on other packages' test internals
- dependency direction must match the current architecture

Initial architectural direction derived from the repository:

- `@husky-di/core` is foundational
- `@husky-di/decorator` may depend on `@husky-di/core`
- `@husky-di/module` may depend on `@husky-di/core`
- `@husky-di/core` must not depend on `@husky-di/decorator` or `@husky-di/module`

## 5. Testing and coverage rules

Use `Vitest` as the primary enforcement mechanism.

Rules:

- each package must keep a `tests/` directory
- repository verification should run the full test suite
- coverage thresholds should be enforced by `Vitest`, not by custom scripts

Suggested initial thresholds:

- statements: 80
- branches: 70
- functions: 80
- lines: 80

These thresholds should be applied at package level first to keep adoption practical.

## 6. Commit and release rules

### Commit messages

Commit messages should follow Conventional Commits. If existing tooling in the repository does not already enforce this, a small TypeScript hook script is acceptable because this is a hook-level validation concern not otherwise covered by the current stack.

### Changesets

Release-relevant changes should require a changeset. Existing CI already checks for changesets informally; this should be tightened into a repository rule using current release workflow expectations.

### Release flow

Release commands should depend on the same full verification gate as CI.

## 7. Documentation consistency rules

Documentation checks should stay lightweight and structural.

Rules:

- root `README.md` must exist
- each package must include `README.md`
- each package must include `docs/SPECIFICATION.md`
- package references in root documentation should match actual package directories and names
- newly added packages should include the minimum package skeleton

These checks should verify existence and consistency only. They should not attempt to evaluate prose quality.

## Tooling Allocation

The allocation of responsibility should be:

### `Biome`

- formatting
- import organization
- baseline linting
- supported symbol-level naming rules

### `Vitest`

- test execution
- coverage thresholds

### `husky`

- trigger fast local checks
- trigger commit-message validation

### GitHub Actions

- run the full repository gate in CI

### Custom TypeScript scripts

Only for rules not reasonably enforceable with the current tools:

- directory structure validation
- file naming and semantic suffix validation
- package-boundary validation
- documentation/package consistency validation
- commit-message validation if no existing tool covers it cleanly

## Incremental Adoption

The first implementation should prefer codifying current dominant patterns with minimal churn.

If existing files violate the new rules, the repository may temporarily keep a small, explicit allowlist for known exceptions. That allowlist should be treated as migration debt, not as a permanent escape hatch.

## Open Implementation Questions

- whether `Biome` can cover enough symbol naming rules to avoid any naming-specific custom logic beyond filenames
- whether commit-message validation should remain a tiny TypeScript script or be handled by a lightweight existing dependency already present in the toolchain
- the exact scope of the fast gate so that pre-commit remains responsive

## Recommended Next Step

After this design is approved, the next step should be an implementation plan that:

- maps existing scripts and workflows that will be updated
- identifies which repository checks truly require custom TypeScript code
- keeps custom validation AST-based
- introduces the minimum viable set of gates first
