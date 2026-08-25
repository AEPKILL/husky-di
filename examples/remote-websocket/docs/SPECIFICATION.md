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

**EXAMPLE-WS-RECOVERY-001 — Shared reconnection supervisor.** The browser
application **MUST** create exactly one `RpcConnectorReconnection` for its
mounted lifetime, start it once, and supply an Adapter factory that returns a
fresh single-use WebSocket Connector Adapter for every attempt. Initial failure
**MUST** remain observable and **MUST NOT** be retried by application-owned
timers, browser `online` listeners, or replacement supervisors. After initial
success, the application **MUST** delegate all Recovery attempts to the retained
supervisor's Connector Reconnection Policy. Cleanup **MUST** stop the supervisor
before closing the Connector.
