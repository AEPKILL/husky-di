---
"@husky-di/core": minor
---

`createServiceIdentifier<T>()` now returns `ServiceIdentifier<T>`. Replace imports
and annotations of `CreatedServiceIdentifier<T>` with `ServiceIdentifier<T>`.
The factory still returns the original string or symbol at runtime.

`ServiceIdentifierInstance` now infers across the full identifier type, preserving
the service type for typed identifier unions and concrete or abstract constructors.
Untyped string and symbol identifiers still resolve to `unknown` at compile time.
