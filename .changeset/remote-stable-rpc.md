---
"@husky-di/remote": major
---

Publish the first stable transport-independent RPC package with the caller API,
Protocol and Transport seams, built-in authenticated recovery Protocol,
immutable Protocol provider factory, conformance runners, normative
specification, public string enums, and wire corpus.

Expose atomic outgoing `prepareInvocation()` and a synchronous scoped incoming
reservation callback. This keeps `start()` as the outgoing identity/send gate,
requires the Protocol to durably record incoming disposition before commit, and
removes the redundant public sink and reserve/commit/release phase types.
Pre-start cancellation synchronously finishes exactly once as `canceled`; a
synchronous preparation outcome becomes caller-visible only after the returned
control is validated and `call-started` is published.

Change the Connector startup API from `connect(adapter)` to the extensible
`connect({ adapter, signal? })` options record. The optional signal cancels only
an unsettled connection attempt.

Add the opt-in `createRpcConnectorReconnection()` supervisor with a fresh
Adapter Factory, finite configurable retry delays and attempt timeout,
replay-latest orchestration state, payload-free attempt telemetry, and explicit
asynchronous stop ownership.
