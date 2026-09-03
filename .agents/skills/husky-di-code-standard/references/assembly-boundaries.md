# Assembly Boundaries

Treat every dependency, construction, testing, or implementation boundary as a
seam. Derive the smallest dependency-neutral contract from actual consumers
before writing the concrete behavior. Consumer code depends on that contract;
only dependency assembly and implementation-local code may name the concrete
implementation.

## Placement And Ownership

- Place each repository-owned artifact by role: a behavioral contract in
  `interfaces/<domain>/`, a concrete class in `impls/<domain>/` as `XxxImpl`, and
  dependency assembly in a `*.factory.ts` module. A third-party extension seam
  need not have a repository-owned implementation.
- Give a new implementation-specific constructor or factory input bag one
  semantic owner: the constructor or `createXxx` function whose call contract it
  describes, not a module that merely forwards it.
- Name that internal input bag `CreateXxxOptions` and prefer co-location with its
  owning `*.impl.ts` or `*.factory.ts`. Preserve an established cohesive/shared
  type module and established caller-facing public option names; use
  `types/<domain>/` for genuinely ownerless shared inputs.
- Export an input bag only as far as its consumers require: from an exported
  owner when co-located, or from its established cohesive type module. Keep
  helper-only inputs file-local.

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

Code that injects or consumes creation behavior depends on `XxxFactory`; only
dependency assembly that selects the concrete implementation may import
`CreateXxxOptions` from the implementation module.

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
