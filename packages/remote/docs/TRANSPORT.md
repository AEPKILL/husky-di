# Implementing an RPC Transport Adapter

Import `IRpcConnection`, `IRpcConnectorAdapter`, and
`IRpcAcceptorAdapter` from `@husky-di/remote/transport`. The Adapter seam
carries complete encoded Protocol messages. It does not interpret unary calls,
streams, credit, ACK, replay, Recovery proofs, or Session state.

## Exact Connection Contract

`IRpcConnection` has exactly three members:

```typescript
interface IRpcConnection {
  readonly message$: Observable<Uint8Array>;
  send(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
```

There is no stream-aware request, window, pause, resume, capacity, or terminal
member on this interface.

- `message$` is hot, multicast, ordered, and non-replaying.
- Each emission is one complete immutable Protocol message.
- The Adapter must not reuse or mutate emitted bytes after notification.
- `send()` permits at most one unsettled call per Connection and fulfills only
  at irreversible local admission, not remote delivery.
- The Adapter must preserve the bytes passed to `send()` until that task
  settles.
- `close()` synchronously fences later sends, is idempotent, and returns the
  same terminal cleanup task.
- Trusted local Transport failure preserves its original Error identity.

The v1 compatibility floor is one complete 1 MiB message. An implementation may
use smaller native frames only when it reassembles the complete message within
documented finite frame and queue limits. It must bound every pre-copy
allocation, queued native frame, queued complete message, and unsettled native
send; the RPC Framework does not provide a Transport queue for the Adapter.

## Role Adapters And Handoff

A Connector Adapter emits exactly one Connection for one `connect()` attempt.
An Acceptor Adapter emits accepted Connections from a listener until completion,
failure, or abort. In both roles the Framework subscribes to `connection$`
before startup.

Notification return is the ownership barrier. During the callback the Adapter
must not invoke Framework-controlled send or close reentrantly. The Framework
may synchronously attach `message$`; active Protocol effects begin only after
handoff returns.

Listener abort stops future acceptance but never closes Connections already
handed off. Acceptor capacity overflow must be gated and bounded rather than
accumulating unbounded accepted or closing sockets. A Connection admitted in the
one overflow slot is Direct Closed and never becomes a Peer.

## Aggregate Load And Failure Ownership

The shared Adapter conformance runner remains stream-unaware. Protocol/runtime
aggregate-load evidence drives mixed unary and W=1 stream bytes through an
ordinary complete-message Connection while asserting one unsettled send and
finite queues.

If the native Transport cannot admit a frame/message/send under that documented
bound, the Adapter rejects or terminates the Connection. The Framework classifies
that as binding failure and enters Recovery; it is not application Stream
Overflow. `overflow` is reserved for a valid application source emission made
without durable Protocol item credit.

After native send failure, the Adapter must keep the failed Connection fenced.
The Protocol performs Direct Close without waiting for or reusing the failed
send slot. Late native settlement may finish local cleanup but cannot revive the
binding.

## Verification

Run the applicable shared runners from
`@husky-di/remote/conformance`:

- `runRpcConnectorAdapterConformance()`
- `runRpcAcceptorAdapterConformance()`

Also test platform-near frame and queue boundaries, allocation-before-copy,
flooding, backpressure, one-unsettled-send enforcement, handoff reentrancy,
message ordering, listener capacity, and native close/error races that a
black-box runner cannot observe.

An independent Adapter package must import only public root, `/transport`, and
`/conformance` entry points; depend on a compatible
`@husky-di/remote` major; document its finite native limits; and publish its
own admission, framing, fuzz, and platform security evidence.

## Deployment Security

The built-in Protocol assumes that the physical channel provides
confidentiality, ordered integrity, anti-replay, and authentication of the
intended endpoint. Before handing an untrusted inbound Connection to an
Acceptor, the deployment must authenticate/admit the initiator and enforce
finite per-principal connection, Session, request-rate, handler-duration, frame,
and queue limits.

The authoritative Transport seam and lifecycle ordering are in
[SPECIFICATION.md](SPECIFICATION.md).
