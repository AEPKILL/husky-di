# Remote Contract Specification

**Status:** Normative for the migrated contracts in the current rebuild.

This document covers the descriptor types and their runtime validation schemas
in `src/modules/peer/types/remote-service-descriptor.type.ts`, and shared wire
identifier validation in
`src/modules/protocol/schemas/rpc-wire-identifier.schema.ts`, plus the Connector
and Acceptor interfaces in `src/modules/owner/interfaces/` and their supporting
Peer, Transport, state, and event contracts. The package root is
currently empty; these contracts do not imply a published factory or RPC runtime.
`MUST` and `MUST NOT` denote requirements. Matching evidence lives in
`tests/specification.test.ts`, whose type assertions run through both the package
TypeScript check and the Vitest type-checking suite.

Source modules live under `src/modules/`, organized by module, then role:
`owner`, `peer`, `transport`, and `protocol`, each with its own role directories.
Reusable cross-module helpers, enums, and exceptions live in `src/shared/`. Modules may depend
on shared helpers; shared helpers do not depend on modules. Package entrypoint
files stay at the source root.

Each module MUST define `src/modules/<module>/index.ts` as its sole external
entry point. Imports and re-exports from outside that module, including tests,
MUST use that entry point and MUST NOT reference its internal files. Files
within the same module may import each other directly. Module entry points
MUST use explicit named re-exports and expose only contracts needed outside the
module; implementation helpers remain internal. The specification tests consume
the module entry points to verify their exported type and runtime surfaces.

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

## RPC-OWNER-001: Topology Owner interfaces

`IRpcConnector` MUST expose readonly `state`, `state$`, `event$`, and one `peer`.
`connect()` MUST require an options object with a Connector Adapter and an
optional `AbortSignal`. It, `shutdown()`, and `close()` MUST return `Promise<void>`.

`IRpcAcceptor` MUST expose readonly `state`, `state$`, `event$`, `peers`, and
`peers$`; both peer collections MUST be readonly arrays. `listen()` MUST accept
an Acceptor Adapter. It, `shutdown()`, and `close()` MUST return `Promise<void>`.
The Connector MUST leave service exposure and resolution on its Peer.

## RPC-OWNER-002: Descriptor-driven service access

Acceptor and Peer `expose()` MUST infer the service and method definitions from
the descriptor alone, require the corresponding implementation through
`NoInfer`, and return core `Cleanup`. Peer `resolve()` MUST return the
descriptor's `RemoteService` facade, including its asynchronous results and
cancelable signal projection. Implementation arguments MUST NOT widen the
descriptor's selected service contract.

## RPC-OWNER-003: State and failure discrimination

Owner lifecycle states MUST distinguish `active`, `draining`, `closing`, and
`closed`. Only an active Acceptor state MUST contain listener state. A stopped
listener MUST distinguish a normal stop reason from a failed stop's `Error`.

Closed states MUST preserve the reason/outcome/error relationships: normal
Session closes carry no error; recovery expiration and counter exhaustion use
`unavailable`; continuity, protocol, and resource failures use `protocol`;
Owner cleanup failure uses `Error`. Peer states MUST retain connection and
recovery phases separately from Owner lifecycle phases. `RpcException` MUST
retain its code and cause while using the safe message `<code>: RPC failed.`
provided by core `CodedException`.

## RPC-OWNER-004: Typed event stream

Owner events MUST retain the discriminated lifecycle and call event union.
Call events MUST carry a Peer and observation identity. Unknown-service incoming
events MUST omit service and method metadata; unknown-method events MUST omit
method metadata. A known incoming rejected call MUST use `canceled` or
`handlerFailed`. An outgoing rejected call MUST use a `RpcCallFailure` code,
which excludes `protocol`. Declared event fields MUST NOT include application
payloads or raw errors.

## RPC-OWNER-005: Transport dependencies

Both Adapter roles MUST expose a readonly `Observable<IRpcConnection>`.
Connector Adapters MUST accept an `AbortSignal` in `connect()`; Acceptor
Adapters MUST accept it in `listen()`. Both methods MUST return `Promise<void>`.
A Connection MUST expose readonly `Observable<Uint8Array>` messages and
asynchronous `send(Uint8Array)` and `close()` methods. These migrated signatures
do not implement connection establishment, local admission, cancellation,
recovery, or shutdown; runtime guarantees require later implementation evidence.
