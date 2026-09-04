# Implementing an RPC Protocol

Import the complete implementor surface from `@husky-di/remote/protocol`. A
Protocol provider supplies separate `RpcProtocolConnectorFactory` and
`RpcProtocolAcceptorFactory` functions. Each factory receives its role-specific
Framework host and synchronously creates a fresh owner-scoped
`IRpcProtocolConnector` or `IRpcProtocolAcceptor`. The role retains its own
Session state. Framework-owned host ports provide normalized Application Value
snapshots, outgoing and incoming call transactions, lifecycle projection, and
fault scoping. `reserveRetainedBytes()` atomically charges the Topology Owner's
aggregate retained-byte budget, returning `undefined` when it is full or a
frozen idempotent release token on success; custom Protocols must hold one for
every retained representation covered by `maxRetainedBytesTotal`.

The seam is deliberately semantic. A custom Protocol owns its encoding,
handshake, continuity credential, ordering, replay, ACK, and wire scheduler;
none of the built-in `husky-di-rpc/1` internals are public extension points. The
built-in profile uses one stable opaque bearer `resumeToken` per retained Session
Incarnation and therefore depends on a confidential, integrity-protected,
endpoint-authenticated Transport such as correctly validated TLS/WSS.

An independent provider package that wants the built-in semantics without
copying its state machines can re-export `createRpcProtocolConnector` and
`createRpcProtocolAcceptor`. Both are exported with the same identities from
`@husky-di/remote` and `@husky-di/remote/protocol`; each invocation creates an
isolated role.

Pass only the matching factory to each Owner:

```typescript
const connector = createRpcConnector({
  protocolFactory: createMyProtocolConnector,
});

const acceptor = createRpcAcceptor({
  protocolFactory: createMyProtocolAcceptor,
});
```

## Required lifecycle

Each Protocol role implements:

- `bind()` or `accept()` to synchronously observe a handed-off Connection and
  complete the binding attempt asynchronously only after its exact Physical
  Connection Binding is active;
- `shutdown()` to complete its graceful Session egress shells;
- `close()` for synchronous force fencing and terminal sink settlement; and
- cached `cleanup()` for Protocol-owned asynchronous cleanup only.

During Adapter handoff, subscribe to the hot `message$` immediately, but defer
active send/close/state effects until the handoff callback returns. The Framework
owns Connection and listener cleanup.

## Call admission

Outgoing calls use `prepareInvocation(request, finish)` → `start()`. Successful
preparation creates only Pending Invocation capacity; it assigns no Call Identity,
enters no call/replay ledger, and sends nothing. A synchronous preparation-time
`finish` cannot become caller-visible until the Framework has validated the
returned control and published `call-started`. `undefined` is permanent Definite
Non-Execution and must never be paired with an immediate or late `finish`.
Pre-start `cancel()` synchronously finishes exactly once as `failed` / `canceled`,
restores Pending capacity without assigning identity or sending, and makes a later
`start()` inert. A duplicate or invalid `finish` during `call-started` publication
suppresses `start()`; Session fault cleanup preserves the first valid terminal or
terminalizes the otherwise-open published call without recursive faulting.

Incoming calls use the asymmetric scoped form
`reserveIncomingCall(request, consume)`. `false` means capacity was unavailable
and `consume` was not called. On `true`, the Framework calls `consume` once and
synchronously with a flattened handler or unknown-call reservation. Record the
durable Protocol disposition first, call `commit()` exactly once, and return
exactly `undefined`. Do not make the callback asynchronous or retain its commit
capability. The committed call handle may be retained for its later synchronous
`finish()` and, for handlers, `handlerOutcome`.

Commit and finish ports are synchronous, total for contract-valid input, and
must not re-enter user code. A scope failure before commit releases the offered
capacity; a failure after commit terminalizes the private call before the bound
Session is faulted, so queued application work cannot become orphaned.

Only snapshots returned by the host normalization methods may cross the SPI.
Forged snapshots, impossible terminal outcomes, double winners, or unexpected
throws are Protocol faults at the narrowest known owner or Session scope.
Release each retained-byte reservation on its unique ACK, call terminal,
cancellation, failed admission, Endpoint close, or Session terminal winner.

## Verification

Run `runRpcProtocolConformance()` from `@husky-di/remote/conformance` with a
candidate fixture. Its `protocol` and `counterExhaustionProtocol` values each
pair compatible role factories:

```typescript
{
  connector: createMyProtocolConnector,
  acceptor: createMyProtocolAcceptor,
}
```

The pair is conformance-only test tooling; a production Owner accepts only its
matching role factory. Each factory must create a fresh role when the runner
invokes it for a case.
Conformance is necessary but not sufficient for a custom Protocol: also exercise
its encoding, security, resource boundaries, and platform-specific behavior in
package-local runtime tests.

The authoritative member contracts and ordering rules are in
[SPECIFICATION.md](SPECIFICATION.md).
