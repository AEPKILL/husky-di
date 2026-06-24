---
"@husky-di/core": minor
---

Add registration plans for applying reusable groups of container registrations.

`@husky-di/core` now exports `createRegistrationPlan()` and `RegistrationPlan` types, and `IContainer` now supports `applyRegistrationPlan()`. A registration plan records entries in declaration order, applies them through the existing `register()` path, returns a cleanup function for only the registrations created by that plan, and rolls back already-applied entries if a later entry fails.
