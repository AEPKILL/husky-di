# Assembly Boundaries

Use this reference only for a real construction-time replacement, testing, or
implementation boundary. Derive the smallest behavioral contract from actual
consumers before adding the seam; speculative flexibility is not a boundary.

## Placement And Ownership

- Put the behavioral contract in `interfaces/<domain>/`, the concrete class in
  `impls/<domain>/` as `XxxImpl`, and dependency assembly in a `*.factory.ts`
  module.
- Give every internal constructor or factory input bag one semantic owner: the
  constructor or `createXxx` function whose call contract it describes. A module
  that merely forwards the value is not its owner.
- Name an owned internal input bag `CreateXxxOptions`. Co-locate a
  constructor-owned bag with its `*.impl.ts` and a `createXxx`-owned bag with its
  `*.factory.ts`; put only genuinely ownerless shared inputs in
  `types/<domain>/`. Preserve an established caller-facing public option name
  instead of renaming it mechanically.
- Export the bag from its owner module when that module exports the matching
  class or factory. Keep helper-only inputs file-local.

## Injected Creation

For an internal injected creator coupled to a behavioral seam, follow the
interface-first precedent: define its dependency-neutral `XxxFactory` contract
beside that seam in `interfaces/<domain>/`. Public standalone factory aliases
retain their established `types/<domain>/` surface.

When the internal callback's one required parameter is exactly an implementation
constructor's input, define the record inline on `XxxFactory` and expose the
implementation-facing alias as:

```ts
export type CreateXxxOptions = Parameters<XxxFactory>[0];
```

Code that injects creation behavior depends on `XxxFactory`; direct constructor
callers may import `CreateXxxOptions` from the implementation module.

## Lifetime And Surface

- Bind dependencies during creation. Use `readonly` references and snapshot or
  freeze input when runtime replacement is unsupported.
- Keep constructors public by default. Restrict one only for an invariant
  enforced consistently by both the types and runtime behavior.
- Call an accessible constructor directly from its factory. Use
  `Reflect.construct` only when its runtime semantics are required.
- Keep runtime replacement setters, concrete implementations, and internal
  assembly seams out of package entrypoints unless the requirement makes them
  public. Protect private surfaces with compile-time negative tests when needed.
