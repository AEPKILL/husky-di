# Streaming Protocol SPI throwaway prototype

> THROWAWAY DESIGN EVIDENCE — not production code, a package export, or a
> normative specification.

## Question

Can the existing deep `IRpcProtocol` seam carry remote output streams without
exposing application-stream RxJS types, the default JSON grammar, sequence/ACK,
private scheduling, or duplicate method/property ports—and without changing the
complete-message Transport Adapter seam?

## Candidate verdict

Yes. Extend the existing unary `reserve -> commit -> start/cancel` pattern with
one discriminated stream request and three phase-scoped semantic capabilities:

- a Subscriber sink whose `reserveItem` / `reserveTerminal` freezes a projection
  before Protocol disposition and whose projection `commit()` performs the
  synchronous Observer effect afterward;
- a Source sink that reserves one emission position before Framework retains or
  normalizes the raw source value; and
- an incoming Source control whose `finish(outcome, onReleased)` fences the source
  immediately and invokes `onReleased` only after the actual one-shot Source
  Teardown attempt returns or throws.

Method and property requests share every lifecycle port. Recovery retains those
Session-scoped capabilities. Existing `shutdown()`, synchronous `close()`,
`cleanup()`, and `session.forceClose()` remain sufficient; no stream-specific
shutdown surface is needed.

`IRpcConnection` stays exactly `message$`, `send(Uint8Array)`, and `close()`.
Stream credit, overflow, ordering, retained evidence, Recovery, fairness, and
shutdown belong to Protocol conformance. Complete-message boundaries, stable
bytes, one unsettled Local Admission, finite native queues, the 1 MiB floor, and
Direct Close remain Transport conformance. A bounded complete-message Connection
is still valuable as a cross-seam Protocol load fixture, but it must remain
stream-unaware.

The only RxJS type in the candidate is the already-decided Transport Observation
Stream `IRpcConnection.message$`. No new application-stream `Observable`,
`Observer`, `Subscriber`, `Subscription`, or scheduler type crosses the Protocol
stream ports.

## Probes

The single TypeScript artifact compiles and runs probes for:

- method/property use of one stream seam and forbidden wire/credit/Transport
  surface;
- commit-before-start and state-before-Transport-effect ordering;
- projection-reservation-before-disposition, receipt-before-Observer-effect, and
  credit-after-effect ordering;
- W=1 synchronous burst overflow with item-before-terminal ordering;
- Source terminal before `subscribe()` return, teardown throw, and later
  finish-scoped `onReleased` ownership retirement;
- one unsettled blocked Transport send, immutable borrowed bytes, retained
  Protocol evidence, binding loss, and replacement replay without source
  resubscription;
- Transport failure entering Recovery rather than Stream Overflow; and
- graceful cutoff waiting for an active source, followed by Session-wide force
  fencing and cached cleanup.

## Run

From the repository root:

```sh
pnpm exec tsc -p .scratch/remote-observable-streams/prototypes/streaming-protocol-spi.throwaway/tsconfig.json
node .scratch/remote-observable-streams/prototypes/streaming-protocol-spi.throwaway/streaming-protocol-spi.prototype.ts
pnpm exec biome check .scratch/remote-observable-streams/prototypes/streaming-protocol-spi.throwaway
```

## Adjudication and deferred conformance

- `finish(outcome, onReleased)` is the selected minimal teardown-settled receipt.
  A separate completion object or extra release port adds no leverage;
  plain terminal commit or `finish()` return remains insufficient when a
  synchronous terminal precedes `subscribe()` return.

- The later wire ticket must prove that every maximum legal stream record fits
  the existing 1 MiB complete-message compatibility floor; failure changes the
  Protocol encoding/value budget, not automatically the Transport seam.
- Multiple W=1 streams can still fill a finite native Transport queue. The current
  guarantee is bounded Connection failure and Recovery, not that every legal
  aggregate stream load can avoid Transport failure.
- Final conformance case IDs and runner fixture changes belong to the later
  verification ticket. This prototype only assigns semantic ownership: stream
  load probes are Protocol/runtime evidence; Adapter runners stay byte-oriented.
