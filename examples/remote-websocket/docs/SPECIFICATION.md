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

**EXAMPLE-WS-RECOVERY-001 — Online reconnect.** The browser application
**MUST** register one global `online` listener before its initial connection
attempt. Initial startup and every later `online` event **MUST** create a fresh
single-use WebSocket Connector Adapter only while the peer is `unbound` or
`recovering`. At most one connection attempt **MAY** be active. A failed attempt
**MUST** remain observable and a later `online` event **MAY** try again. Cleanup
**MUST** remove the listener and prevent later attempts.
