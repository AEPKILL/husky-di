# ADR-0003: Attach Service Identifier Metadata Out of Band

## Status

Accepted

## Context

`@husky-di/core` already models `ServiceIdentifier<T>` as one of the following
runtime values:

- class constructor
- abstract constructor
- string
- symbol

Users want `createServiceIdentifier()` to carry extra metadata for tooling and
integration scenarios, for example transport hints, tags, or documentation
annotations.

That requirement conflicts with the runtime shape of primitive identifiers:

- `string` and `symbol` cannot safely carry attached object properties as part
  of the public API.
- Replacing identifiers with wrapper objects would change equality semantics and
  break current registration and resolution behavior.

## Decision

Keep `ServiceIdentifier<T>` unchanged.

Extend `createServiceIdentifier()` with an optional `metadata` option and store
that metadata in an internal registry keyed by the created identifier value.

Expose companion `getServiceIdentifierMetadata()` and
`hasServiceIdentifierMetadata()` utilities so external consumers can read the
associated metadata and distinguish between "no metadata association exists"
and "metadata was explicitly associated as undefined".

Metadata is explicitly non-behavioral:

- it does not participate in registration lookup
- it does not affect resolution behavior
- it does not change identifier display names
- it does not alter container equality semantics

## Consequences

- Existing code that relies on `string | symbol | constructor` service
  identifiers continues to work unchanged.
- Metadata for string identifiers is associated by string equality, not factory
  call identity. Reusing the same string identifier value observes the same
  metadata entry.
- Symbol identifiers remain the best choice when callers want unique identifier
  identity plus attached metadata.
- Consumers read metadata through `getServiceIdentifierMetadata()` and test
  association presence through `hasServiceIdentifierMetadata()` rather than a
  `.metadata` property on the identifier itself.
