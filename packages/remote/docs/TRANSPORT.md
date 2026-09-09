# Implementing an RPC Transport Adapter

Import `IRpcConnection`, `IRpcConnectorAdapter`, and `IRpcAcceptorAdapter` from
`@husky-di/remote/transport`. The Adapter seam carries complete encoded Protocol
messages; it does not interpret calls, ACKs, recovery, or Session bearer
credentials.

## Connection contract

- `message$` is hot, multicast, ordered, and has no replay.
- every emitted `Uint8Array` is one complete immutable Protocol message;
- `send()` allows one unsettled call per Connection and fulfills at irreversible
  local admission, not remote delivery;
- `close()` is idempotent and returns the same terminal cleanup task; and
- Transport failure errors preserve their original trusted local Error identity.

The v1 compatibility floor is a 1 MiB message. An implementation may use a
smaller native frame size only when it reassembles complete messages within
documented finite queue and allocation limits.

## Role adapters

A Connector Adapter emits exactly one Connection for one `connect()` attempt. An
Acceptor Adapter emits accepted Connections from a listener until completion,
failure, or abort. In both roles the Framework subscribes before startup. The
notification-return barrier transfers ownership; callbacks must not invoke
Framework-controlled send or close reentrantly.

Listener abort stops future acceptance but never closes Connections already
handed off. Capacity overflow must be gated and bounded rather than accumulating
unbounded closing sockets.

## Verification and deployment

Run both shared Adapter conformance runners from `@husky-di/remote/conformance`
as applicable. Also test the platform-near frame/queue boundaries, allocation
before copy, flooding, backpressure, and native close/error races that a black-box
runner cannot observe.

Document finite frame and queue limits and the secure deployment conditions. The
built-in Protocol assumes the physical channel provides confidentiality,
integrity, anti-replay, and endpoint authentication after the Transport
handshake. An Adapter must not hand off a Connection whose `FreshRequest` or
`ResumeRequest` could be sent as TLS 0-RTT or other replayable early data.

The authoritative seam is in [SPECIFICATION.md](SPECIFICATION.md).
