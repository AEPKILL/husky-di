# Implementing an RPC Protocol

Import the complete implementor surface from `@husky-di/remote/protocol`. A
Protocol creates separate Connector and Acceptor role runtimes and owns its
Session state, encoding, handshake, ordering, replay, receipt ACK, security, and
wire scheduler. The Framework owns caller facades, mixed-member exposure routes,
application normalization, public observations, Owner policy, and physical
resource cleanup.

The seam is semantic. None of the private `husky-di-rpc/1` codec, Session,
Endpoint, ledger, or scheduler classes are extension points. A provider that
wants exactly the built-in behavior can delegate to the frozen reusable
`createRpcProtocol()` value exported with the same identity from the root and
`/protocol` entries.

## Role Runtime Lifecycle

Each role runtime implements:

- `bind()` or `accept()` to synchronously observe a handed-off Connection and
  asynchronously settle the binding attempt;
- `shutdown()` to begin graceful Session egress;
- synchronous `close()` to force-fence semantic authority; and
- one cached `cleanup()` task for Protocol-owned asynchronous cleanup.

Subscribe to the hot Connection `message$` during handoff, but defer active
send, close, state, and application effects until the handoff callback returns.
The Framework owns the Connection and listener cleanup tasks. A late callback
from an obsolete binding must be rejected by generation authority before it can
publish state or start work.

## Mixed Member Transactions

Unary calls retain the reserve → commit → start transaction. Incoming requests
reserve Framework capacity before route lookup, then commit either a captured
handler or a safe unknown-service/unknown-member disposition. Commit and finish
ports are synchronous, total for contract-valid input, and must not re-enter
application code.

Stream methods and stream properties use the discriminated
`RpcProtocolStreamRequest` seam. The Protocol:

1. reserves one identity-free caller subscription;
2. commits Outgoing Stream Admission only when identity, evidence, and the
   current binding's idle send slot are all available;
3. reserves incoming capacity before route lookup;
4. commits a Source Start Job without invoking a method/getter inline;
5. uses `IRpcProtocolSourceSink.reserveEmission()` before inspecting a raw
   source value; and
6. uses `IRpcProtocolSubscriberSink.reserveItem()` or `reserveTerminal()` to
   durably select disposition before Observer effects.

The Framework never exposes raw Observables, raw application values, raw Errors,
wire sequence, ACK, replay, or Transport capacity through the SPI. Only
Framework-created normalized snapshots and reservations may cross it.

## Fixed W=1 Flow Control

The final profile has fixed `W=1`: each active Subscriber grants admission for
one item at a time. Credit is an item-count admission authority, not downstream
demand, readiness, processing completion, receipt, durability, or a public
pause/resume API.

A Stream Start carries its cumulative credit horizon. The Source may subscribe
only after the positive grant is durably committed. A valid emission consumes
that one credit before normalization, retained-byte sizing, item ordinal
allocation, or send. After a safe downstream `next()` returns and the
observation is still open, the same Receive Slot is re-armed by advancing the
cumulative horizon.

An equal horizon is an idempotent no-op. A higher legal horizon advances credit.
A lower, out-of-range, or peer over-credit horizon is a Session Protocol fault.
A source emission with zero credit selects `overflow`; the causing value is not
an Item and is never normalized or counted.

## Ordering, Receipt ACK, And Replay

Each sending direction uses one ordinary sequence and one cumulative receipt ACK
cursor. Stream start, item, credit, cancel, terminal, unary, and Session records
reuse that same disposition/receipt mechanism; there is no per-record finish
handshake.

An ACK proves durable disposition, not application effect, source teardown, or
opposite-direction retirement. Exact replay processes a reverse ACK but does not
repeat admission, Observer effects, source acquisition, or teardown. Duplicate
bytes that disagree for one sequence are equivocation and fault the Session.

Recovery freezes a finite replay barrier for each sending direction. The barrier
drains before new sequence allocation, and new work cannot extend it. A replayed
credit may make a post-barrier item ready, but it does not permit the item to
overtake the barrier. Evidence is garbage-collected independently per direction
only after the applicable cumulative receipt ACK or terminal Session
convergence.

## Ordinary And Protected Resources

The Framework's complete frozen policy is available through the host. A custom
Protocol must enforce its Session subcaps and hold
`reserveRetainedBytes()` tokens for every representation covered by the Owner
aggregate. The relevant categories are:

- ordinary capacity for Pending/application work, active streams, Source Start
  Jobs, arguments, items, replay entries, and ingress;
- protected convergence capacity for bounded terminal and cancel obligations;
- one in-place `1,000,256 B` Receive Slot per admitted Subscriber stream; and
- the Session and Owner aggregate retained-byte ledgers.

Ordinary pressure may reject new work but must not evict continuity evidence or
consume protected convergence capacity. A protected reservation failure is a
Session resource fault. Shared normalized values are charged once, and every
successful reservation has one idempotent release path.

Recovery retains these bounded structures in place. It must not copy payloads,
create a shadow backlog, reserve a second Receive Slot, or reacquire an
application source.

## Scheduling And Fairness

Bootstrap is exclusive. A replacement binding drains its finite replay barrier
before ordinary allocation. After that barrier, the control lane (terminal,
semantic rejection, and cancel) and progress lane (unary, stream start, item, and
credit) bounded-alternate, with control taking the first contested turn.

Inside the progress lane, the unary FIFO is one virtual participant and every
ready stream identity is one participant. The scheduler round-robin selects at
most one dependency-ready record per participant per round. Unary records remain
FIFO, each stream remains FIFO, and item-before-terminal dependencies are
preserved. A blocked identity cannot block an unrelated ready participant.

Receipt ACK, Ping, and Pong are coalesced cumulative/due state rather than record
queues. Their turns must preserve replay, control, progress, and probe bounded
progress. Source Start Jobs reuse the existing per-Session FIFO and Owner
round-robin handler permit scheduler; an active source does not retain a handler
permit for its lifetime.

## Recovery And Generation Authority

A Session remains the logical authority while physical bindings change. On
binding loss, fence the old Connection before resetting Codec, activity, ACK, or
state. A successful authenticated resume preserves Pending/admitted calls,
Logical Streams, Subscriber observations, Source Subscriptions, ordinals,
credit, terminals, and retained evidence.

Every continuation captures generation authority. Re-check it after replay,
after any application callback, and before recovered-state or Pending-work
publication. An obsolete attempt may settle its own local task but cannot mutate
the current Session.

Recovery is finite. Expiry or irrecoverable continuity loss maps identity-free
Pending work to definite `unavailable`, while admitted work without
authoritative outcome evidence maps to `outcome-unknown`.

## Graceful Cutoff And Force Cutoff

Graceful Cutoff (`G`) is atomic with local Admission. After `G`, facade and
Observable creation remains state-neutral, but a new unary invocation or
subscription creates no work. Existing admitted items, credits, cancellations,
terminals, replay, ACK, Source teardown, and graceful Close may continue.

An incoming post-`G` Stream Start still passes fixed-envelope, security,
current-binding, schema, sequence, and stream-ordinal validation before capacity
and route classification. Only a valid expected start receives a protected
`unavailable` rejection; malicious input is not relabeled as graceful
rejection.

Force Cutoff (`F`) is a Session-wide batch. First fence all work and choose all
terminal winners, then unlink/drop unsent work, Direct Close the physical
Connection without waiting for a send slot, and only then run gated Observer,
teardown, state, and telemetry effects. No Protocol egress is permitted after
`F`.

`shutdown()` and `close()` at the public Owner layer remain distinct from
Protocol runtime `shutdown()`/`close()` and physical Connection `close()`.

## Security And Validation

The built-in profile binds fresh and resume transcripts to the Protected
Transport and Binding Epoch. Stream records use the ordinary protected channel,
sequence cursor, replay barrier, and receipt ACK; they do not invent a
per-record HMAC.

Validation order is observable and security-sensitive: fixed envelope,
authentication/current binding, schema, sequence, stream/item ordinal,
ordinary reservation, then semantic route. Malformed, stale, gap, replay,
equivocation, illegal transition, and over-credit inputs retain their specified
narrow failure owner. Unknown service/member and safe source failures remain
stream- or call-scoped.

The Protocol authenticates continuity, not the initiating application or
service authorization. A deployment must provide confidentiality, ordered
integrity, anti-replay, intended-endpoint authentication, inbound initiator
admission, and finite per-principal limits before Acceptor handoff.

## Corpus And Conformance

The installed final corpus has four authoritative files:

- `wire/husky-di-rpc-1/schema.json` — closed final grammar;
- `wire/husky-di-rpc-1/raw-vectors.json` — lexical, fixed-envelope, schema,
  exact-boundary, and limit vectors;
- `wire/husky-di-rpc-1/transcripts.json` — stateful two-sided transitions,
  callbacks, resources, counters, Recovery, `G`, and `F`; and
- `wire/husky-di-rpc-1/known-answer-vectors.json` — independently
  recomputable cryptographic proofs.

Run `runRpcProtocolConformance()` from `@husky-di/remote/conformance` against
a fresh fixture for every stable case. The runner covers mixed streams, W=1,
overflow, ordering, retention, fairness, Recovery, graceful/forced cutoff,
bounded aggregate load, and broken-Protocol diagnostics. Conformance is
necessary but not sufficient for a new wire profile: publish that profile's own
schema, raw corpus, stateful transcripts, security vectors, resource probes, and
interoperability evidence.

The normative member, state, and ordering contracts are in
[SPECIFICATION.md](SPECIFICATION.md).
