---
"@husky-di/remote": major
---

Publish the first stable transport-independent RPC package with the caller API,
Protocol and Transport seams, built-in authenticated recovery Protocol,
immutable Protocol provider factory, conformance runners, normative
specification, public string enums, and wire corpus.

Change the Connector startup API from `connect(adapter)` to the extensible
`connect({ adapter, signal? })` options record. The optional signal cancels only
an unsettled connection attempt.

Add the opt-in `createRpcConnectorReconnection()` supervisor with a fresh
Adapter Factory, finite configurable retry delays and attempt timeout,
replay-latest orchestration state, payload-free attempt telemetry, and explicit
asynchronous stop ownership.
