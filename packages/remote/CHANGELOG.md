# Changelog

## 1.0.0

- Add the stable caller API for Connector and Acceptor RPC topologies.
- Use the breaking `connector.connect({ adapter, signal? })` options record for extensible, cancellable Connector attempts.
- Add the opt-in `createRpcConnectorReconnection()` supervisor with configurable finite retries, fresh Adapter creation, orchestration state, and payload-free failure telemetry.
- Add the semantic third-party Protocol SPI and Transport Adapter seams.
- Shape Protocol call admission around its real ordering boundaries: atomic
  outgoing `prepareInvocation()` with `start()` as the identity gate, and a
  synchronous scoped incoming reservation whose commit capability cannot escape.
  Pre-start cancellation finishes exactly once as `canceled`, while synchronous
  preparation outcomes remain gated behind validated `call-started` publication.
- Add the resumable, resource-bounded `husky-di-rpc/1` Protocol and its built-in
  `createRpcProtocolConnector` and `createRpcProtocolAcceptor` role factories.
- Establish Session continuity with one independent stable 256-bit opaque
  `resumeToken` bearer credential per retained Session Incarnation. The token is
  issued only in the protected fresh accept, repeated only in resume requests,
  never rotated within that incarnation, and depends on confidential,
  integrity-protected, endpoint-authenticated Transport deployment.
- Keep `resumeToken` out of logs, telemetry, public state, and errors, and release
  the retained JavaScript string reference when its Session terminates without
  claiming in-place JavaScript heap or physical-memory erasure.
- Add framework-neutral Protocol and Adapter conformance runners.
- Export enums for the stable caller, Protocol, and conformance vocabularies.
- Publish the normative specification and requirement matrix.
- Enforce Session and Owner aggregate retained-byte budgets across protected
  reserves, Protocol replay, handler arguments, and Endpoint ingress.
- Release completed incoming request arguments and call handles, duplicate
  outgoing request snapshots, canceled Pending entries, and canceled queued
  handler jobs immediately; validate platform timer and wrapped Application
  Value boundaries.
- Clarify that Session continuity is not initiator authentication and document
  the required deployment admission boundary.
