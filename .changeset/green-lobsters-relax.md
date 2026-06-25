---
"@husky-di/core": patch
---

Clarify the `Cleanup` contract in `@husky-di/core` documentation. The public interface docs and core specification now explicitly require cleanup functions to be idempotent: only the first call performs cleanup, and later calls are ignored without throwing.
