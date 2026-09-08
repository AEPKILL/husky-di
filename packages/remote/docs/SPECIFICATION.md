# Remote Contract Specification

**Status:** Normative for the migrated contracts, descriptor factory, and Owner
Session lifecycle runtime in the current rebuild.

This document covers the descriptor types and their runtime validation schemas
in `src/modules/peer/types/remote-service-descriptor.type.ts`, and shared wire
identifier validation in
`src/modules/protocol/schemas/rpc-wire-identifier.schema.ts`, plus the Connector
and Acceptor interfaces in `src/modules/owner/interfaces/` and their supporting
Peer, Transport, state, and event contracts. It also defines the Connector's
composition responsibilities, Session lifecycle attachment, and Peer state-view
dependencies through the Owner, Protocol, and Peer module entry points. The
package root exposes the descriptor factory and its type contract. The Owner
module implements Session lifecycle ownership and atomic Owner/Peer state
publication through package-private assembly factories. The complete Connector,
Peer invocation engine, and Protocol runtime are not implemented in this stage.
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

The descriptor's type-only brand MUST keep both its service type and its method
definitions invariant. A descriptor MUST NOT become assignable to a descriptor
with a wider or narrower service/allowlist merely because its callable facade
appears compatible. This brand provides type-level identity; it does not prove
at runtime that a descriptor was created by the factory.

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

## RPC-DESC-007: Descriptor factory

`createRemoteServiceDescriptor(serviceIdentifier, options)` MUST synchronously
create a frozen null-prototype descriptor exposing readonly `serviceIdentifier`,
`wireName`, and `methods` metadata. Its `serviceIdentifier` MUST retain the
supplied `ServiceIdentifier<T>` by identity. Readonly applies to that property;
the factory MUST NOT freeze a caller-owned class or function identifier.

The factory MUST validate options using the descriptor schemas and expose their
detached readonly snapshot as its `wireName` and `methods`. The method map MUST
preserve the statically selected method keys and definitions, with readonly
properties including nested cancellation definitions. At runtime the method map
MUST have a null prototype and both it and cancellation definitions MUST be
frozen, as described in RPC-DESC-004. Later mutation of caller-owned options MUST
NOT change the descriptor metadata. Invalid options MUST synchronously throw
`TypeError` without returning a descriptor.

The public factory MUST preserve service and method-definition inference,
require the non-empty validated allowlist, and return the invariant
`RemoteServiceDescriptor<T, Definitions>` contract.

## RPC-OWNER-001: Topology Owner interfaces

`IRpcConnector` MUST expose readonly `state`, `state$`, `event$`, and one `peer`.
`connect()` MUST require an options object with a Connector Adapter and an
optional `AbortSignal`. It, `shutdown()`, and `close()` MUST return `Promise<void>`.
The named `RpcConnectorConnectOptions` type MUST remain colocated with
`IRpcConnector`, with readonly `adapter` and optional readonly `signal` fields.
The Owner module entry point MUST re-export both contracts.

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

## Connector lifecycle contract stage

RPC-CONNECTOR-001 through RPC-CONNECTOR-005 define dependency signatures and the
responsibilities of their implementations. Their original tests verify type
structure through the module entry points; type evidence alone does not establish
runtime behavior. RPC-CONNECTOR-006 through RPC-CONNECTOR-010 specify the
implemented Owner Session lifecycle and state-publication subset, with matching
runtime and surface tests.

Connection establishment, attempt cancellation, Protocol binding, actual Session
Recovery, Protocol drain, physical cleanup, and public termination promises still
require their later implementation evidence. This rebuild adds no complete
Connector factory, Peer invocation engine, Protocol runtime, wire grammar,
automatic reconnection, or package-root lifecycle exports.

## RPC-CONNECTOR-001: Connector composition and termination phases

The public `IRpcConnector` MUST retain `connect()`, `shutdown()`, and `close()`
as specified by RPC-OWNER-001. Its implementation MUST compose connection
establishment, Session lifecycle, and owned-resource cleanup responsibilities.
These responsibilities do not require an aggregate Protocol Connector interface
or a fixed grouping of internal operations. The Protocol module MUST NOT export
such an aggregate in this stage.

The Owner owns Adapter startup and supplies the resulting Connection for Protocol
binding. The Owner MUST wait for both Adapter handoff and fresh or resumed Binding
Activation before fulfilling `connect()`; a Connection alone does not establish
an RPC relationship. A replacement Physical Connection MUST continue the retained
Logical Session.

Graceful shutdown MUST synchronously gate new work, then permit semantic Session
drain or local termination and invocation of Direct Close. Forced termination
MUST synchronously revoke protocol activity and binding authority and invoke
Direct Close without sending a Protocol Session-close message. Semantic
termination MUST NOT await physical cleanup.

Protocol-owned resource cleanup MUST remain distinct from Connection cleanup and
running handlers. The Owner MUST track these resources and compose their cleanup
into the final asynchronous public `shutdown()` / `close()` result. Repeated
termination requests MUST NOT repeat terminal effects or cleanup. Owner cleanup
failure MUST retain the distinct `cleanupFailed` closed-state case from
RPC-OWNER-003.

## RPC-CONNECTOR-002: Session lifecycle and Protocol hosts

The Protocol module MUST expose `IRpcProtocolSessionLifecycle` with synchronous
`forceClose(): void`. This capability terminates its exact Session; it MUST NOT
grant invocation or incoming-call admission capabilities.
`IRpcProtocolSessionLifecycleHost` MUST expose synchronous
`transition(transition: RpcProtocolSessionTransition): void` and
`fault(reason: RpcProtocolFaultReason, error: Error): void` methods.

`RpcProtocolSessionTransition` MUST use `RpcProtocolSessionTransitionTypeEnum`
to distinguish `draining`, `recovering`, `recovered`, and `closed`. A Protocol
draining transition MUST carry only `counterExhaustion` as its reason; graceful
Owner draining is initiated through RPC-CONNECTOR-003. Recovering and closed
transitions MAY carry an optional `Error` cause. Recovered transitions MUST
declare no reason or cause. Closed transition reasons MUST exclude
`cleanupFailed`, `shutdownDeadline`, `protocolFault`, and `resourceFault`;
the remaining Session close reasons are represented by
`RpcProtocolSessionTransitionCloseReason`. Protocol and resource faults MUST use
the typed `fault()` channel instead of a closed transition.

`IRpcProtocolConnectorLifecycleHost` MUST expose synchronous
`attachSession(session: IRpcProtocolSessionLifecycle)` returning an
`IRpcProtocolSessionLifecycleHost` or `undefined`, plus the same `fault()`
signature. `undefined` MUST reject the attachment. A returned Session host MUST
retain the exact attached Session's scope; its late callbacks MUST NOT affect a
discarded attachment or another Session. A fault on a provisional Session host
MUST fail that attachment's connection attempt. A fault on an active Session host
applies to that Session, while a Connector host fault applies to the owning
Connector independently of a particular attachment.

A Session fault MUST synchronously call the exact Session's `forceClose()` before
publishing its terminal state. A Connector-wide fault MUST make the owning
Connector synchronously terminate its protocol activity and revoke binding
authority before publishing the Owner terminal state. The Protocol MUST NOT
duplicate either fault with a second closed transition.

## RPC-CONNECTOR-003: Owner attachment and termination responsibilities

The Owner module MUST expose `IRpcConnectorSessionLifecycle` with readonly
`peer: IRpcPeer` and `attached: boolean`, plus synchronous `attach()`,
`beginGracefulShutdown()`, `beginClosing()`, and `protocolFault()` methods.
`attach(session: IRpcProtocolSessionLifecycle)` MUST return an
`IRpcConnectorSessionLifecycleAttachment` or `undefined`. `protocolFault()` MUST
accept `RpcProtocolFaultReason` and `Error`. `beginClosing()` MUST accept
`reason: RpcOwnerCloseReason` and `forced: boolean`; `RpcOwnerCloseReason` MUST
contain only `gracefulShutdown`, `forcedClose`, and `shutdownDeadline`.

An attachment MUST expose readonly `host: IRpcProtocolSessionLifecycleHost` and
`active: boolean`, synchronous `activate(canActivate: () => boolean): boolean`,
and synchronous `discard(): void`. Attaching retains a provisional Session;
`attached` MUST NOT imply that the attachment is active. The Owner MUST activate
it only after both Adapter startup and Protocol binding succeed, rechecking the
current attempt and `canActivate()` at the synchronous activation commit.
`activate()` returning `true` records a committed activation; it does not promise
that reentrant observers have left the attachment active afterward. `discard()`
MUST be idempotent and revoke only its own still-provisional attachment, releasing
its retained Session and invoking that Session's `forceClose()`. It MUST NOT revoke
an already active or later attachment.

The Owner MUST own connection-attempt admission, Adapter subscriptions, attempt
cancellation, and Physical Connection cleanup. Protocol binding owns Session
continuity and replacement-binding authority. A replacement Connection MUST
continue the retained Session rather than create another attachment or Peer.
Failed or canceled attempts MUST lose activation authority and release their
provisional resources.

Future Connector construction MUST be cold, with an active Owner and an unbound
stable Peer before transport I/O. `connect()` MUST be single-flight and admit
attempts only while the Owner is active and the Peer is unbound or recovering.
Ineligible attempts MUST reject with `unavailable` before inspecting or starting
the Adapter. Startup failures MUST reject the returned Promise rather than throw
synchronously. Attempt cancellation MUST abort the framework-owned signal passed
to the Adapter and Protocol and Direct Close a handed-off Connection. While the
Owner and Session remain eligible, a failed or canceled fresh attempt MUST return
the Peer to unbound; a failed or canceled recovery attempt MUST retain recovering
and MUST NOT extend recovery retention. A settled successful attempt MUST detach
its caller cancellation; late attempt callbacks MUST NOT acquire new authority.

`beginGracefulShutdown()` MUST synchronously establish the Owner's admission
cutoff and Peer lifecycle projection before asynchronous Protocol drain. Bound
connected Sessions and already counter-draining Sessions with a current binding
may drain their earlier work; recovering Sessions take forced termination. The
Owner owns the absolute shutdown deadline and escalates to forced termination
when it expires or a draining Session loses its binding.
`beginClosing()` MUST revoke admission and attachment authority,
preserve an already selected terminal outcome, and use `forced` to distinguish
forced Protocol termination from completion of graceful drain. `protocolFault()`
MUST initiate the typed fault outcome. Reentrant or repeated termination MUST
preserve the selected outcome and MUST NOT revive an attachment.

## RPC-CONNECTOR-004: Stable Peer state view and capability scope

The Peer module MUST expose `IRpcPeerStateView` with readonly
`readState: () => RpcPeerState` and readonly `state$: Observable<RpcPeerState>`.
The Owner supplies this live view; the Peer MUST retain the supplied dependency
references and use `readState()` to observe the current authoritative snapshot.
The state view MUST NOT expose mutation methods. Fixed dependency identity does
not freeze subsequent state transitions or authorize freezing caller-owned
dependency instances.

One Connector MUST retain the same public Peer through initial connection,
provisional failure, and retained-Session recovery. Service exposure and remote
resolution remain on that Peer. Lifecycle attachment and activation MUST NOT
alone grant access to a callable Session. The lifecycle contract stage defines no
complete Session call contract, concrete Peer implementation, Protocol factory,
application-value contract, or runtime policy. RPC-CONNECTOR-010 adds the narrow
Peer creation dependency needed for lifecycle assembly.

Later complete Session and Session-host contracts may compose these lifecycle
capabilities with the asymmetric invocation and incoming-reservation contracts
required by [ADR 0001](../../../docs/adr/0001-asymmetric-rpc-call-seam.md).
This does not permit treating a lifecycle-only value as a callable Session or
narrowing an inherited attachment method's accepted Session type. Assembly MUST
retain the complete capability type when connecting future call behavior.

## RPC-CONNECTOR-005: Module and package surfaces

The Owner, Protocol, and Peer module entry points MUST explicitly re-export the
lifecycle contracts and supporting types they own when consumed across modules.
The Protocol module MUST also export `RpcProtocolSessionTransitionTypeEnum`.
Consumers and specification tests MUST use these module entry points.

The package root MUST NOT export the Connector lifecycle dependency contracts,
Session transition enum or types, `RpcOwnerCloseReason`, or `IRpcPeerStateView`.
Module visibility for internal assembly MUST NOT be treated as a package-level
extension API. This stage MUST preserve the existing package-root descriptor
factory and descriptor type surface. Matching tests MUST include negative
package-surface assertions and MUST NOT present type-level evidence as runtime
lifecycle conformance.

## Owner Session lifecycle runtime stage

The requirements below cover the Owner's implementation of the existing
lifecycle entry points. Tests inject a lifecycle-only Protocol Session, an Owner
effects collaborator, and a Peer creator, and observe attachment authority and
Owner/Peer snapshots through module entry points. These tests establish the
lifecycle subset; they are not end-to-end RPC, call, transport, or cleanup
conformance evidence. A lifecycle-only test Session MUST NOT be cast to a future
complete Session capability.

## RPC-CONNECTOR-006: Stable Peer and guarded Session activation

`createRpcConnectorSessionLifecycle()` MUST invoke its injected `RpcPeerFactory`
once with the supplied state's exact `peerStateView` and retain the returned Peer
by identity. Construction MUST NOT initiate transport I/O. The same Peer MUST
survive provisional attachment failure, activation, and recovery state changes.

`attach()` MUST retain at most one Session while the Owner is active and lifecycle
termination has not begun. Attachment MUST initially be provisional and MUST NOT
publish a connected Peer state. It MUST return `undefined` when another Session
is retained or attachment authority has been revoked.

`activate(canActivate)` MUST commit only for the current provisional attachment,
with an active Owner and a connecting Peer. It MUST invoke `canActivate()` only
while eligible and recheck lifecycle eligibility after that callback returns.
The callback returning false, or reentrant discard or termination during the
callback, MUST prevent activation. A committed activation MUST mark the exact
attachment active and commit connected before returning true. If a state
observer terminates the Session during that publication, true MUST still record
that activation committed; it MUST NOT restore the terminated attachment.
Repeated activation MUST return false.

`discard()` MUST revoke the exact provisional attachment before calling its
Session's `forceClose()`, so reentrant Session callbacks cannot retain authority.
Repeated discard, discard after activation, and discard through a stale attachment
MUST be inert. Discard MUST release that Session without replacing the Peer or
revoking a later attachment. Connection-attempt state restoration remains an
Owner responsibility.

## RPC-CONNECTOR-007: Scoped faults and first terminal selection

A Session host MUST affect only its exact retained attachment. After discard or
termination, its transitions and faults MUST be inert even when another Session
has been attached. A provisional host fault MUST revoke its attachment, call the
exact Session's `forceClose()`, and fail that attachment's owning attempt through
`failAttachment()`. It MUST NOT close the Connector or replace the stable Peer.
A provisional closed or recovering transition MUST likewise fail that attachment
with `unavailable`; provisional draining and recovered transitions MUST NOT
activate the Session or publish active/recovery Peer state.

An active host fault or Connector-wide `protocolFault()` MUST select the typed
protocol or resource failure and revoke attachment authority synchronously.
The exact retained Session MUST be forced closed and the Owner's `beginClosing()`
effect MUST run before the lifecycle publishes its terminal snapshot. The Owner
effect remains required when no Session is retained, so Connector-wide faults can
revoke activity beyond an attachment.

Semantic termination MUST publish a closed Peer with the selected Session outcome
and an Owner in closing. The lifecycle MUST leave the final Owner closed snapshot
and asynchronous termination result to Owner cleanup. Normal Session reasons
MUST produce normal closed states without errors; `recoveryExpired` and
`counterExhaustion` MUST produce failed states with `unavailable`;
`continuityFailure`, `protocolFault`, and `resourceFault` MUST produce failed
states with `protocol`. Failure exceptions MUST retain a supplied cause.

The first selected terminal outcome MUST win. Selection and authority revocation
MUST precede external terminal effects, so reentrant transitions, faults, or
termination requests cannot overwrite the outcome, publish a second terminal, or
force the Session twice. A throwing `forceClose()` or Owner closing effect MUST
NOT prevent terminal state publication; the terminal operation MUST still throw
for outer error and cleanup handling.

## RPC-CONNECTOR-008: Recovery and graceful lifecycle projection

An active Session's recovering transition MUST publish a recovering Peer while
retaining the same attachment, host, and Peer. A recovered transition from that
state MUST restore the connected projection, or the draining projection with
`counterExhaustion` if the Session was already counter-draining before recovery.
It MUST NOT create another attachment or Peer. These transitions observe
Protocol-owned recovery; they MUST NOT start transport attempts, reset recovery
retention, or establish a replacement binding.

A Protocol draining transition MUST project a Peer draining for
`counterExhaustion` while leaving an active Owner active. Counter-drain intent
MUST survive recovery and MUST NOT restore connected/new-call eligibility.
Recovered transitions outside recovering, repeated recovering transitions, and
repeated draining transitions MUST be inert.

Graceful shutdown of an active bound Session MUST synchronously project the Owner
as draining and the Peer as draining for `gracefulShutdown`. If the Peer is already
draining for `counterExhaustion`, that Peer reason MUST be preserved at the Owner
drain cutoff. The projection MUST commit before any synchronous state observer
can admit a new attachment or activate a provisional one.

Graceful shutdown of an unbound, connecting, or provisional Session MUST select
`gracefulShutdown` immediately and revoke provisional activation authority; any
retained provisional Session MUST be forced closed. A Session already recovering
at the cutoff, or losing its binding while the Owner is draining, MUST instead
take forced termination with `forcedClose`. Repeated graceful requests MUST NOT
repeat terminal effects or revive Session authority.

`beginClosing(reason, forced)` MUST select the supplied Owner reason when no
terminal outcome has already won. With `forced: true`, it MUST force the retained
Session before terminal publication; with `forced: false`, completed graceful
drain MUST NOT force an already drained Session. Actual Protocol drain, shutdown
deadline scheduling, Direct Connection Close, and cleanup completion remain Owner
and Protocol assembly responsibilities outside this lifecycle implementation.

## RPC-CONNECTOR-009: Atomic lifecycle snapshots and ordered observation

`createRpcConnectorLifecycleState()` MUST start with an active Owner and an
unbound Peer. Its `peerStateView`, that view's `readState` function, and both
state-stream references MUST remain stable. The Peer view MUST expose only the
readonly state-reading and observation capabilities of RPC-CONNECTOR-004.

`commit(ownerState, peerState)` MUST copy and shallow-freeze both state snapshots
and replace the authoritative pair before notifying either stream. Mutating a
caller's input state object afterward MUST NOT change the stored snapshot.
Referenced errors MUST retain their identity; the state store MUST NOT freeze
caller-owned Error objects. A new subscriber MUST synchronously receive its
current state snapshot.

Reentrant commits MUST update live state reads synchronously and serialize
notification delivery in commit order. Existing observers MUST NOT receive an
older queued state after a newer state. A subscriber added during publication
MUST begin with the current authoritative snapshot and MUST NOT subsequently
receive older queued snapshots. Observers of either stream can read both live
states from one committed pair; reentrancy may advance that pair beyond the
notification currently being delivered.

## RPC-CONNECTOR-010: Private lifecycle assembly dependencies

The Owner module MUST export `createRpcConnectorSessionLifecycle`,
`RpcConnectorSessionLifecycleFactory`, `IRpcConnectorSessionLifecycleOwner`,
`createRpcConnectorLifecycleState`, and `IRpcConnectorLifecycleState` for internal
assembly and conformance tests. The Peer module MUST export `RpcPeerFactory`,
which accepts an `IRpcPeerStateView` and returns an `IRpcPeer`. Assembly supplies
any additional Peer dependencies through the creation closure. These contracts
MUST NOT introduce a Protocol Connector aggregate or make lifecycle attachment a
call capability.

The Session lifecycle factory MUST accept the behavioral state, Peer-creation,
and Owner-effects dependencies. `IRpcConnectorSessionLifecycleOwner` MUST expose
`failAttachment(attachment, error)` for exact provisional-attempt failure and
`beginClosing(sessionClosedState, forced)` for synchronous Owner effects. This
collaborator's `beginClosing()` MUST NOT publish lifecycle terminal snapshots;
`failAttachment()` MAY restore the still-eligible owning attempt's state. The lifecycle owns force-close
of its exact retained Session; the Owner owns attempt and Connector-wide Protocol
revocation, Direct Close, and later asynchronous cleanup completion.

The package root MUST NOT export these factories, dependencies, their concrete
implementations, or `RpcPeerFactory`. The package-root descriptor factory and
descriptor type surface MUST remain unchanged. Runtime module exports and
negative package-surface type assertions MUST cover this boundary.
