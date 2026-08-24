# Changelog

## 1.0.0

### Major Changes

- 9d1821f: Publish the first stable transport-independent RPC package by moving
  `@husky-di/remote` from `0.0.0` to `1.0.0`. The final pre-1.0
  `husky-di-rpc/1` bytes are a one-time in-place profile rewrite: drain every
  draft Session, upgrade both endpoints together, and establish a fresh Session
  on a fresh physical Connection.

  Add exact mixed `members` Descriptors with unary calls, cold per-subscription
  Observable stream methods, and readonly Observable properties. Add fixed W=1
  credit, authenticated Recovery, bounded resources, safe `unknown-member` and
  other payload-free errors, the immutable Protocol/Transport/conformance seams,
  and the normative wire corpus and release evidence.

  Remove the method-only `methods` Descriptor option, `resolveAll`,
  `RemoteServiceGroup`, `RpcPeerResult`, `unknownMethod`, and
  `maxPendingInvocationsPerSession`. Use `members`, one single-peer facade per
  Peer, explicit native Promise/RxJS composition, `unknown-member`, and
  `maxApplicationWorkPerSession`; there are no replacement Group atomicity,
  ordering, fairness, cancellation, or error-policy semantics.

  Change the Connector startup API from `connect(adapter)` to the extensible
  `connect({ adapter, signal? })` options record. The optional signal cancels only
  an unsettled connection attempt.

  Add the opt-in `createRpcConnectorReconnection()` supervisor with a fresh
  Adapter Factory, finite configurable retry delays and attempt timeout,
  replay-latest orchestration state, payload-free attempt telemetry, and explicit
  asynchronous stop ownership.

- Add the stable caller API for Connector and Acceptor RPC topologies.
- Use the breaking `connector.connect({ adapter, signal? })` options record for extensible, cancellable Connector attempts.
- Add the opt-in `createRpcConnectorReconnection()` supervisor with configurable finite retries, fresh Adapter creation, orchestration state, and payload-free failure telemetry.
- Add the semantic third-party Protocol SPI and Transport Adapter seams.
- Add the authenticated, resumable, resource-bounded `husky-di-rpc/1` Protocol and its immutable `createRpcProtocol()` provider factory.
- Add framework-neutral Protocol and Adapter conformance runners.
- Export enums for the stable caller, Protocol, and conformance vocabularies.
- Publish normative specification, requirement matrix, and wire corpus.
- Enforce Session and Owner aggregate retained-byte budgets across protected
  reserves, Protocol replay, handler arguments, and Endpoint ingress.
- Release completed incoming request arguments and call handles, duplicate
  outgoing request snapshots, canceled Pending entries, and canceled queued
  handler jobs immediately; validate platform timer and wrapped Application
  Value boundaries.
- Clarify that Session continuity is not initiator authentication and document
  the required deployment admission boundary.
