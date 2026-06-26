---
"@husky-di/core": minor
"@husky-di/decorator": minor
---

Add origin-aware container scope support to nested resolution helpers and decorator metadata.

`@husky-di/core` now exports `ResolveContainerScopeEnum` and `ResolveHelperOptions`, and the package-level `resolve()` helper accepts a `scope` option. This lets nested resolution continue from either the current container or the origin container of the active resolve chain.

`@husky-di/decorator` now supports the same `scope` option in injection metadata, including `@inject()` and `@tagged()`, so decorator-based constructor injection can resolve dependencies from the origin container when needed.
