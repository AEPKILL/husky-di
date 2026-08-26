# Implementing an RPC Protocol

Import the complete implementor surface from `@husky-di/remote/protocol`. A
Protocol creates separate Connector and Acceptor runtimes and retains its own
Session state. Framework-owned host ports provide normalized Application Value
snapshots, outgoing and incoming call transactions, lifecycle projection, and
fault scoping. `reserveRetainedBytes()` atomically charges the Topology Owner's
aggregate retained-byte budget, returning `undefined` when it is full or a
frozen idempotent release token on success; custom Protocols must hold one for
every retained representation covered by `maxRetainedBytesTotal`.

The seam is deliberately semantic. A custom Protocol owns its encoding,
handshake, continuity proof, ordering, replay, ACK, and wire scheduler; none of
the built-in `husky-di-rpc/1` internals are public extension points.

An independent provider package that wants the built-in semantics without
copying its state machines can delegate to `createRpcProtocol()`, exported with
the same identity from `@husky-di/remote` and `@husky-di/remote/protocol`. The
returned Protocol is frozen and reusable; each role factory still creates an
isolated runtime.

## Required lifecycle

Each role runtime implements:

- `bind()` or `accept()` to synchronously observe a handed-off Connection and
  complete the binding attempt asynchronously;
- `shutdown()` to complete its graceful Session egress shells;
- `close()` for synchronous force fencing and terminal sink settlement; and
- cached `cleanup()` for Protocol-owned asynchronous cleanup only.

During Adapter handoff, subscribe to the hot `message$` immediately, but defer
active send/close/state effects until the handoff callback returns. The Framework
owns Connection and listener cleanup.

## Call transactions

Outgoing calls use reserve → commit → start. Incoming calls reserve Framework
capacity before Protocol admission, then commit either a known handler or a safe
unknown-service/method disposition. Commit and finish ports are synchronous,
total for contract-valid input, and must not re-enter user code.

Only snapshots returned by the host normalization methods may cross the SPI.
Forged snapshots, impossible terminal outcomes, double winners, or unexpected
throws are Protocol faults at the narrowest known owner or Session scope.
Release each retained-byte reservation on its unique ACK, call terminal,
cancellation, failed admission, Endpoint close, or Session terminal winner.

## Verification

Run `runRpcProtocolConformance()` from `@husky-di/remote/conformance` against a
fresh fixture for every case. Conformance is necessary but not sufficient for a
custom Protocol: also exercise its encoding, security, resource boundaries, and
platform-specific behavior in package-local runtime tests.

The authoritative member contracts and ordering rules are in
[SPECIFICATION.md](SPECIFICATION.md).
