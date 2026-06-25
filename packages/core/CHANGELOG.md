# @husky-di/core

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
