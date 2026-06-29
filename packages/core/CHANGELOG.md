# @husky-di/core

## 1.4.1

### Patch Changes

- [`efc48b7`](https://github.com/AEPKILL/husky-di/commit/efc48b702f3ebf202daaa5b781bce8cebc72756c) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Stabilize source file naming conventions across all packages:

  - **`.impl.ts` suffix for implementations**: `src/impls/*Impl.ts` → `src/impls/*.impl.ts` (e.g. `ContainerImpl.ts` → `container.impl.ts`). Code standard validator now enforces `.impl.ts` via suffix config instead of special-cased PascalCase logic.

  - **`.util.ts` suffix for utilities**: `src/utils/*.utils.ts` → `src/utils/*.util.ts` (e.g. `container.utils.ts` → `container.util.ts`). Validator config updated accordingly. The `test.utils.ts` exception for test directories is preserved.

  - **`husky-di-code-standard` skill**: Updated naming reference table and local examples to reflect both new suffixes.

  - **New `use-husky-di` skill**: Adds a dedicated skill with reference docs for `core`, `module`, `decorator`, and project structure, enabling agents to work effectively with husky-di APIs.

  - **Documentation**: Expanded `SPECIFICATION.md` for `core` and `module` packages.

## 1.4.0

### Minor Changes

- [`6b3e3b3`](https://github.com/AEPKILL/husky-di/commit/6b3e3b37af666642d5c5e981aba7ed0449fc98d5) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Add `ResolveOptions.recursive` to let resolutions stay in the current container instead of falling back to parent containers, tighten `ResolveOptions` so `dynamic` and `ref` are mutually exclusive at the type level, and align the related core documentation and specification tests with these resolve-option behaviors.

## 1.3.2

### Patch Changes

- [`8e2beb8`](https://github.com/AEPKILL/husky-di/commit/8e2beb8f380c623d442024d7a93c63a2501ec5e8) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Preserve the original source directory structure in package build output and publish sourcemaps for generated ESM and CJS files.

## 1.3.1

### Patch Changes

- [`8e7740c`](https://github.com/AEPKILL/husky-di/commit/8e7740c3047d433041bb7894375fef1a0bed8c64) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Enhance the `resolve()` helper so `resolve(IContainer)` returns the scoped active container without requiring an explicit container registration. This also adds specification coverage for the new helper behavior and refreshes the `@husky-di/core` README examples around `resolve()`-based dependency access.

## 1.3.0

### Minor Changes

- [`2c53a29`](https://github.com/AEPKILL/husky-di/commit/2c53a29750dda7a9b1d1f07aeca1a677256d3ee4) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Add origin-aware container scope support to nested resolution helpers and decorator metadata.

  `@husky-di/core` now exports `ResolveContainerScopeEnum` and `ResolveHelperOptions`, and the package-level `resolve()` helper accepts a `scope` option. This lets nested resolution continue from either the current container or the origin container of the active resolve chain.

  `@husky-di/decorator` now supports the same `scope` option in injection metadata, including `@inject()` and `@tagged()`, so decorator-based constructor injection can resolve dependencies from the origin container when needed.

## 1.2.2

### Patch Changes

- [`2e57b5b`](https://github.com/AEPKILL/husky-di/commit/2e57b5b28ddfa3fd083321a857eaa0e159d20217) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Clarify the `Cleanup` contract in `@husky-di/core` documentation. The public interface docs and core specification now explicitly require cleanup functions to be idempotent: only the first call performs cleanup, and later calls are ignored without throwing.

## 1.2.1

### Patch Changes

- Align the public packages to a shared version and keep future releases in lockstep.

## 1.2.0

### Minor Changes

- [`e2b2ade`](https://github.com/AEPKILL/husky-di/commit/e2b2adee5a610532948fbfbc6bc47780cebb3e60) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Add registration plans for applying reusable groups of container registrations.

  `@husky-di/core` now exports `createRegistrationPlan()` and `RegistrationPlan` types, and `IContainer` now supports `applyRegistrationPlan()`. A registration plan records entries in declaration order, applies them through the existing `register()` path, returns a cleanup function for only the registrations created by that plan, and rolls back already-applied entries if a later entry fails.

## 1.1.0

### Minor Changes

- [`5cac542`](https://github.com/AEPKILL/husky-di/commit/5cac542b0f27a5c7a3d9b7e8bfaa41db39d6d9df) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Improve the public APIs and diagnostics across the core, decorator, and module packages.

  - `@husky-di/core` now exports structured error codes and exception types, returns cleanup functions from `register()` and `use()`, and improves resolve diagnostics for invalid options, alias resolution, provider execution, and nested failures.
  - `@husky-di/core` also exposes `IContainer` as a service identifier constant and keeps multiple registrations so they can be removed through the cleanup handle returned by `register()`.
  - `@husky-di/decorator` now validates decorator metadata more strictly and exports stable error codes and exception types for duplicate `@injectable()` usage, invalid parameter metadata, and conflicting `dynamic` / `ref` options.
  - `@husky-di/module` now adds structured module error codes and exceptions, validates duplicate declarations/imports/exports and import collisions more clearly, and supports aliased import visibility through the new import scope utilities.

## 1.0.1

### Patch Changes

- Bug fixes and minor improvements across core, decorator, and module packages

## 1.0.0

### Major Changes

- V1.0.0
