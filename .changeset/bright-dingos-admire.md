---
"@husky-di/core": minor
---

Add `ResolveOptions.recursive` to let resolutions stay in the current container instead of falling back to parent containers, tighten `ResolveOptions` so `dynamic` and `ref` are mutually exclusive at the type level, and align the related core documentation and specification tests with these resolve-option behaviors.
