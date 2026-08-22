# Remote WebSocket Example Specification

This document is the normative specification for the user-visible behavior of
the Remote WebSocket example.

## Connection state presentation

**EXAMPLE-WS-STATE-001 — Transport badge.** The observatory's primary transport
badge **MUST** derive its label and visual severity from the browser peer state.
It **MUST** present `connected` as `Live transport`, `connecting` as
`Connecting`, `recovering` as `Transport disconnected`, `closed` as
`Connection closed`, `unbound` as `Not connected`, and `draining` as
`Disconnecting`. Recovering and closed states **MUST** use the danger severity
and **MUST NOT** be presented as an in-progress connection attempt.

## Connection recovery

**EXAMPLE-WS-RECOVERY-001 — Sequential reconnection supervisors.** The browser
application **MUST** keep at most one active `RpcConnectorReconnection` and
supply an Adapter factory that returns a fresh single-use WebSocket Connector
Adapter for every attempt. Initial failure **MUST** remain observable and
**MUST NOT** be retried by application-owned timers or browser `online`
listeners. A natural Recovery **MUST** remain delegated to the current
supervisor's Connector Reconnection Policy. A manual interruption **MUST** stop
that supervisor before closing its Connection; a later manual Recovery **MUST**
create its replacement. Cleanup **MUST** stop the current supervisor before
closing the Connector.

**EXAMPLE-WS-RECOVERY-002 — Manually controlled transport interruption.** The
browser application **MUST** present separate `Disconnect` and `Recover`
controls. `Disconnect` **MUST** be enabled only while the Peer is connected and
no transport operation is pending. `Recover` **MUST** be enabled only while the
Peer is recovering from that manual interruption and no transport operation is
pending; it **MUST NOT** compete with a supervisor handling a natural Recovery.
Activating `Disconnect` **MUST** stop the current supervisor before directly
closing only its current physical RPC Connection and **MUST NOT** close the
Connector. No replacement supervisor or Adapter **MUST** be created until
`Recover` is activated. Activating `Recover` **MUST** create a new supervisor
with a fresh Adapter, and the same logical Peer **MUST** return from
`recovering` to `connected`. The event stream **MUST** retain the corresponding
`peer-recovering` and `peer-recovered` observations. The ordinary, cancelable,
and burst call launch controls **MUST** remain available while the Peer is
either `connected` or `recovering`, subject only to an unsettled cancelable
greeting. Calls launched during the manual interruption **MUST** remain pending
and be able to complete after Recovery.

## Call cancellation

**EXAMPLE-WS-CANCEL-001 — Cooperative greeting cancellation.** The greeting
contract **MUST** retain the ordinary `greet` method and declare a separate
`greetCancelable` method with one exact required trailing `AbortSignal`. Its
Remote Service Descriptor **MUST** mark only `greetCancelable` as cancelable.
Launching the cancelable method **MUST** create a fresh `AbortController`, pass
its signal in the cancellation slot, and enable `Abort RPC` only while that call
is unsettled. Activating `Abort RPC` **MUST** abort that controller. The ordinary
launch and burst calls **MUST** continue to invoke `greet`. The Node
`greetCancelable` handler **MUST** use its received signal to cooperatively
cancel the configured delay, and the browser result and event stream **MUST**
expose the `canceled` code.
