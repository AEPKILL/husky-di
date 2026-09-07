# Remote Service Descriptor Specification

**Status:** Normative for the descriptor module in the current rebuild.

This document covers the descriptor types and their runtime validation schemas
in `src/types/remote-service-descriptor.type.ts`, and shared wire identifier
validation in `src/schemas/protocol/rpc-wire-identifier.schema.ts`. The package
root is currently empty; these contracts do not imply a published factory or RPC
runtime.
`MUST` and `MUST NOT` denote requirements. Matching evidence lives in
`tests/specification.test.ts`, whose type assertions run through both the package
TypeScript check and the Vitest type-checking suite.

## RPC-DESC-001: Explicit method allowlist

Descriptor options MUST require a non-empty method allowlist with at least one
statically required string key. Optional callable properties, non-callable
properties, numeric keys, and symbol keys MUST NOT be selectable. The string
`then` is reserved and MUST NOT be selectable. Unknown entries MUST be rejected
by option validation, including entries on an already typed object.

A type widened to the wholly optional `RpcMethodDefinitions<T>` does not prove
that any method is selected and MUST NOT satisfy the non-empty options contract.
The remote facade MUST expose only statically selected methods and MUST reserve
`then` through its readonly optional `never` property.

## RPC-DESC-002: Cancellation parameter slots

A cancelable method MUST use exactly `{ cancelable: true }` as its definition.
Its parameter tuple MUST have fixed length and end in a required slot mutually
assignable with `AbortSignal`. No preceding slot may contain an `AbortSignal`
constituent. An `unknown` parameter in a different slot MUST NOT hide a signal
or change the method's classification.

Misplaced or duplicate signals, optional or nullable signal slots, unions with
other types, stricter signal subtypes, and variadic cancellation signatures
MUST be rejected. Detection MUST preserve explicitly declared signal slots
around `unknown` and rest parameters. It cannot recover constituents already
erased by TypeScript within one slot, such as `unknown | AbortSignal`.

The facade MUST replace the final `AbortSignal` slot with the required slot
`signal: AbortSignal | undefined`. The implementation MUST retain the original
method signature, including its required `AbortSignal`.

## RPC-DESC-003: Unary signatures

Eligible ordinary methods without a declared signal slot MUST use `true` as
their definition. Zero-parameter methods, optional ordinary parameters, and
ordinary rest parameters MUST retain this behavior, including an empty `[]`
rest tuple. Parameters typed as `any` MUST be rejected.

An awaited result typed as `any`, or containing an `Observable` or
`AsyncIterable` constituent, MUST be rejected. Facade return types MUST be
`Promise<Awaited<Result>>`. These static checks do not prove application-value
serializability; in particular, `unknown` does not reveal a value's runtime shape.

## RPC-DESC-004: Definition metadata and snapshots

Definition values MUST be `true` or exactly `{ cancelable: true }`. Type-level
option validation MUST reject extra cancellation metadata even on an already
typed object. Runtime schema validation MUST reject an empty method map,
reserved method names, false definitions, and extra enumerable string metadata.

Schema output MUST be a detached readonly snapshot containing the wire name and
method definitions. The options object, method map, and cancellation definitions
MUST be frozen; the method map MUST have a null prototype. Mutating the original
input after parsing MUST NOT change the snapshot.

## RPC-DESC-005: Descriptor type identity

The opaque descriptor brand MUST keep both its service type and its method
definitions invariant. A descriptor MUST NOT become assignable to a descriptor
with a wider or narrower service/allowlist merely because its callable facade
appears compatible.

## RPC-DESC-006: Inference boundary

Ordinary non-generic, single call signatures are the supported basis for remote
contracts. The current projection follows TypeScript inference: generic
parameter/result correlations are not preserved, and overloaded methods use
only their last signature for both validation and facade projection. For
example, `<T>(value: T) => T` projects to
`(value: unknown) => Promise<unknown>`.

Acceptance of a generic or overloaded method MUST NOT be interpreted as
validation of every generic instantiation or overload. Applications needing
those local APIs should provide an ordinary remote-facing signature. This
change does not introduce automatic rejection or full preservation of generic
and overloaded methods; regression tests record the existing inference boundary.
