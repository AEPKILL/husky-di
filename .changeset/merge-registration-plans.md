---
"@husky-di/core": minor
---

Add `mergeRegistrationPlans(...plans)` to compose registration plans in argument
order while preserving duplicate registrations. Each call returns a new frozen
plan and registration array, retaining the original entry and service value
references. Validation and unified cleanup remain part of plan application.
