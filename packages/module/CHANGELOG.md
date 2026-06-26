# @husky-di/module

## 1.3.0

### Patch Changes

- Updated dependencies [[`2c53a29`](https://github.com/AEPKILL/husky-di/commit/2c53a29750dda7a9b1d1f07aeca1a677256d3ee4)]:
  - @husky-di/core@1.3.0

## 1.2.2

### Patch Changes

- Updated dependencies [[`2e57b5b`](https://github.com/AEPKILL/husky-di/commit/2e57b5b28ddfa3fd083321a857eaa0e159d20217)]:
  - @husky-di/core@1.2.2

## 1.2.1

### Patch Changes

- Align the public packages to a shared version and keep future releases in lockstep.

- Updated dependencies []:
  - @husky-di/core@1.2.1

## 1.1.1

### Patch Changes

- Updated dependencies [[`e2b2ade`](https://github.com/AEPKILL/husky-di/commit/e2b2adee5a610532948fbfbc6bc47780cebb3e60)]:
  - @husky-di/core@1.2.0

## 1.1.0

### Minor Changes

- [`5cac542`](https://github.com/AEPKILL/husky-di/commit/5cac542b0f27a5c7a3d9b7e8bfaa41db39d6d9df) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Improve the public APIs and diagnostics across the core, decorator, and module packages.

  - `@husky-di/core` now exports structured error codes and exception types, returns cleanup functions from `register()` and `use()`, and improves resolve diagnostics for invalid options, alias resolution, provider execution, and nested failures.
  - `@husky-di/core` also exposes `IContainer` as a service identifier constant and keeps multiple registrations so they can be removed through the cleanup handle returned by `register()`.
  - `@husky-di/decorator` now validates decorator metadata more strictly and exports stable error codes and exception types for duplicate `@injectable()` usage, invalid parameter metadata, and conflicting `dynamic` / `ref` options.
  - `@husky-di/module` now adds structured module error codes and exceptions, validates duplicate declarations/imports/exports and import collisions more clearly, and supports aliased import visibility through the new import scope utilities.

### Patch Changes

- Updated dependencies [[`5cac542`](https://github.com/AEPKILL/husky-di/commit/5cac542b0f27a5c7a3d9b7e8bfaa41db39d6d9df)]:
  - @husky-di/core@1.1.0

## 1.0.1

### Patch Changes

- Bug fixes and minor improvements across core, decorator, and module packages

- Updated dependencies []:
  - @husky-di/core@1.0.1

## 1.0.0

### Major Changes

- V1.0.0

### Patch Changes

- Updated dependencies []:
  - @husky-di/core@1.0.0
