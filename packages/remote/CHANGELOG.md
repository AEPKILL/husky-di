# Changelog

## 1.0.0

- Add the stable caller API for Connector and Acceptor RPC topologies.
- Use the breaking `connector.connect({ adapter, signal? })` options record for extensible, cancellable Connector attempts.
- Add the opt-in `createRpcConnectorReconnection()` supervisor with configurable finite retries, fresh Adapter creation, orchestration state, and payload-free failure telemetry.
- Add the semantic third-party Protocol SPI and Transport Adapter seams.
- Add the authenticated, resumable, resource-bounded `husky-di-rpc/1` Protocol and its immutable `createRpcProtocol()` provider factory.
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
