# ADR-0001: Model Bulk Container Registration as RegistrationPlan

## Status

Accepted

## Context

`@husky-di/core` already models a single registration as a `Registration`: one
`ServiceIdentifier` bound to one provider strategy. Users sometimes need to
package a group of related registrations and apply them to a container in one
step, especially for feature setup, tests, adapters, and module-like local
composition.

The registration plan API needs to preserve existing registration semantics:

- Multiple registrations for the same `ServiceIdentifier` are allowed.
- Non-multiple resolution uses latest registration wins.
- Each successful `register()` call returns a cleanup function that removes
  exactly that registration entry.
- `unregisterAll()` removes all registrations for an identifier and is therefore
  too broad for plan cleanup.

## Decision

Use the domain term `RegistrationPlan` for a reusable group of registration
entries.

Expose the public API as:

```typescript
const plan = createRegistrationPlan((register) => {
  register(ILogger, { useClass: ConsoleLogger });
  register(IConfig, { useValue: config });
});

const cleanup = container.applyRegistrationPlan(plan);
```

`createRegistrationPlan()` records registration entries without needing a
container. `container.applyRegistrationPlan()` applies those entries to a specific
container by delegating to the existing `register()` method for each entry.

The plan cleanup returned by `applyRegistrationPlan()` removes only the registration
entries created by that plan. It must not call `unregisterAll()` by identifier,
because that would remove unrelated sibling registrations.

If a plan application fails after some entries were already registered, the
container rolls those entries back before rethrowing the original error.

## Consequences

- The API uses `applyRegistrationPlan()` because the plan is declared before it
  is applied to a specific container.
- The API uses `RegistrationPlan` because it reads as a reusable registration
  recipe rather than a one-off bulk operation.
- Plan application remains a thin composition over current core behavior.
  It does not introduce a second registry path or a separate lifecycle model.
- Plan cleanup can be used safely alongside other registrations for the same
  `ServiceIdentifier`.
