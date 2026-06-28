---
"@husky-di/core": patch
---

Enhance the `resolve()` helper so `resolve(IContainer)` returns the scoped active container without requiring an explicit container registration. This also adds specification coverage for the new helper behavior and refreshes the `@husky-di/core` README examples around `resolve()`-based dependency access.
