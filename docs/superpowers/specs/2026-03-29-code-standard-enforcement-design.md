# Code Standard Enforcement Design

## Overview

This document defines the design for enforcing `husky-di-code-standard` as a blocking repository gate.

The goal is to ensure that from this rollout onward, every commit must leave the repository in a state where all files inside the enforcement scope satisfy the repository code standard. This design focuses on mechanical, low-ambiguity enforcement and an explicit migration path for bringing the current codebase up to the new baseline.

## Goals

- Make `husky-di-code-standard` mechanically enforceable for repository code that is suitable for blocking validation.
- Ensure every commit is rejected when the repository-wide enforcement scope is not compliant.
- Reuse existing tooling where it fits, without introducing a second general-purpose lint stack that overlaps with Biome.
- Keep blocking rules objective, low-noise, and easy to explain.
- Require the enforcement implementation itself to follow the same repository standard.

## Non-Goals

- This design does not attempt to block subjective style judgments such as whether a comment is elegant enough or whether an implementation is abstracted "too much".
- This design does not require configuration files to follow the same blocking rules.
- This design does not replace Biome as the repository formatter and general-purpose linter.
- This design does not immediately enable new blocking rules without first normalizing the existing repository baseline.

## Final Tooling Decision

The enforcement stack should use two layers:

1. `Biome` for formatting, import sorting, and general-purpose linting.
2. A repository-local TypeScript AST validator for repository-specific structural rules.

`ast-grep` is intentionally not part of the first version of the enforcement stack.

The reason is that the required blocking rules are mostly repository-semantic rather than simple single-file syntax patterns. The enforcement needs to reason about file paths, directory semantics, file headers, export boundaries, and the relationship between public package APIs and internal source files. Those checks map more naturally to TypeScript AST inspection than to a separate pattern engine.

This keeps the tool boundary clear:

- `Biome` remains the only formatter and general-purpose lint tool.
- The TypeScript validator owns `husky-di`-specific hard rules.

## Enforcement Scope

The blocking gate must validate the following files:

- `packages/**/src/**/*.ts`
- `packages/**/tests/**/*.ts`
- `scripts/**/*.ts`

The following are explicitly out of scope for the blocking gate:

- repository and package configuration files such as `lint-staged.config.js`, `vitest.config.ts`, `rslib.config.ts`, and `rspress.config.ts`
- `.agents/**`
- generated artifacts
- lock files
- pure documentation prose

## Scope Rationale

Configuration files are excluded because the repository already uses normal tool-native patterns there, including default exports and lightweight file structure. Forcing those files into the same blocking rules would create avoidable conflict with how those tools expect configuration to be authored.

Repository scripts are included because the enforcement implementation itself may live in `scripts/**/*.ts`, and those files must satisfy the same repository standard they are responsible for validating elsewhere.

## Blocking Rules For V1

Only objective, mechanically verifiable rules should block commits in version 1.

The first blocking rule set should include:

1. **Directory semantics**
   Files must live in an existing semantic directory that matches their role, such as `interfaces`, `types`, `impls`, `utils`, `factories`, `constants`, `enums`, `exceptions`, `decorators`, `middlewares`, `shared`, and `tests`.

2. **File naming**
   File names must match existing repository naming patterns.
   Examples:
   - `*.interface.ts`
   - `*.type.ts`
   - `*.enum.ts`
   - `*.factory.ts`
   - `*.utils.ts`
   - `*.const.ts`
   - `*.decorator.ts`
   - `*.middleware.ts`
   - `*.exception.ts`
   - `*.test.ts`
   - implementation files under `impls` must use `PascalCase.ts`

3. **File header metadata**
   Any in-scope file that supports comments must include a file header containing:
   - `@overview`
   - `@author`
   - `@created`

4. **Entrypoint shape**
   Package `src/index.ts` files must act as export entrypoints and must not carry implementation-heavy logic.

5. **Public API routing**
   Public exports must flow through the owning package `src/index.ts` rather than exposing implementation files directly by accident.

6. **No default exports in scope**
   In-scope source files and test files must not use `export default`.

7. **Type-only imports**
   Type-only imports must use `import type`.

8. **`biome-ignore` discipline**
   `biome-ignore` usage must include an explicit reason, and broad ignores without repository-specific justification must fail validation.

## Rules That Stay Non-Blocking

The following remain repository guidance, but should not block commits in version 1:

- whether an `@overview` description is especially elegant
- whether a code comment should have been shorter or longer
- whether an implementation could be considered "too abstract"
- whether behavioral test wording could be improved stylistically
- whether a file should be split further when there is no clear existing repository threshold

## Command Model

The repository should expose one blocking command:

- `pnpm check:code-standard`

This command should run repository-wide validation for the entire enforcement scope, not only changed files.

The intended execution model is:

1. Run Biome in read-only validation mode on the enforcement scope.
2. Run the TypeScript AST validator on the enforcement scope.
3. Exit non-zero if either stage reports failures.

The validator should produce diagnostics in a stable textual format:

`[rule-id] <path>:<line>:<column> <message>`

This format is easy to read locally and in CI, and is stable enough for future tooling integration.

## Commit Gate Model

The repository should reject commits when the repository-wide enforcement scope is not compliant.

The intended gate behavior is:

1. `pre-commit` may run convenience auto-fix steps such as `biome check --write`.
2. The final blocking step in `pre-commit` must be the repository-wide `pnpm check:code-standard`.
3. CI must also run `pnpm check:code-standard`.

The same blocking command should be used locally and in CI so there is only one source of truth for enforcement behavior.

## Migration Strategy

The rollout must happen in phases so that the gate does not immediately lock the repository in a permanently failing state.

### Phase 1: Build the validator without enabling the gate

- Implement the TypeScript validator and the `pnpm check:code-standard` command.
- Keep it in report mode while the current repository baseline is assessed.

### Phase 2: Scan and normalize the current baseline

- Run the validator against the full enforcement scope.
- Collect all current failures.
- Fix the existing repository until the enforcement scope is clean.

### Phase 3: Enable blocking enforcement

- Once the enforcement scope is clean, wire `pnpm check:code-standard` into `pre-commit`.
- Run the same command in CI.

### Phase 4: Add new blocking rules carefully

Any future blocking rule must follow the same process:

1. implement the rule
2. run it against the full repository scope
3. normalize existing failures
4. only then enable it as a blocking rule

## First Baseline Normalization Batch

The first normalization batch should focus on stable, low-ambiguity violations that are already visible in the current repository.

Known initial targets include:

- `packages/module/src/impls/module.ts`
  This file does not match the established `impls` naming convention of `PascalCase.ts`.

- test files missing standard header metadata, including:
  - `packages/module/tests/index.test.ts`
  - `packages/core/tests/error-message.test.ts`
  - `packages/core/tests/specification.test.ts`
  - `packages/core/tests/simple.test.ts`
  - `packages/core/tests/edge.test.ts`
  - `packages/core/tests/ref.test.ts`
  - `packages/core/tests/test.utils.ts`
  - `packages/core/tests/cross-container.test.ts`

- `packages/core/src/interfaces/container.interface.ts`
  This file has a header block but does not currently express `@overview` explicitly, so its header format must be normalized to match the enforcement rule.

## Implementation Notes For The Validator

The validator should parse source files with the TypeScript compiler API, directly or through a thin helper such as `ts-morph`.

The validator should prefer:

- AST inspection over string matching
- path-aware rule checks over regex heuristics
- explicit rule IDs and clear diagnostics
- deterministic traversal and output ordering

The validator should not rely on regex-only matching for source-structure validation.

## Success Criteria

This design is successful when:

- the repository has one blocking command for code-standard enforcement
- all files inside the enforcement scope can be brought to a clean baseline
- commits are rejected whenever the repository-wide enforcement scope violates the hard rules
- the enforcement implementation itself follows the same repository code standard
- configuration files remain outside the blocking scope
- Biome remains the only formatter and general-purpose linter in the toolchain
