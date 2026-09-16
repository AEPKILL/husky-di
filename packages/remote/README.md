# @husky-di/remote

Typed, bidirectional unary and RxJS Observable RPC over application-supplied Transport Adapters.
A Connector owns one stable Peer; an Acceptor serves multiple Peers. Logical
Sessions preserve Peers, exposures, facades, and eligible calls across physical
Connection replacement.

## Call a remote service

Install `@husky-di/remote`, `@husky-di/core`, and `rxjs`. Supply Adapter instances
for your transport, then expose and resolve the same wire contract on both sides.
Local service identifiers may differ; `wireName` and selected member names identify the remote route.

```ts
import { createServiceIdentifier } from "@husky-di/core";
import {
  createRemoteServiceDescriptor,
  createRpcAcceptor,
  createRpcConnector,
  type IRpcAcceptorAdapter,
  type IRpcConnectorAdapter,
} from "@husky-di/remote";

type Greeter = { greet(name: string): string };
const IGreeter = createServiceIdentifier<Greeter>("Greeter");
const greeter = createRemoteServiceDescriptor(IGreeter, {
  wireName: "greeter",
  members: { greet: { kind: "function" } },
});

export async function example(
  acceptorAdapter: IRpcAcceptorAdapter,
  connectorAdapter: IRpcConnectorAdapter,
): Promise<void> {
  const server = createRpcAcceptor();
  const client = createRpcConnector();
  server.expose(greeter, { greet: (name) => `Hello, ${name}` });
  const remote = client.peer.resolve(greeter);

  try {
    await server.listen(acceptorAdapter);
    await client.connect({ adapter: connectorAdapter });
    console.log(await remote.greet("Ada"));
  } finally {
    await Promise.all([client.shutdown(), server.shutdown()]);
  }
}
```

Factories and `resolve()` are cold. Creating or observing an Owner starts no
Transport I/O. Only explicitly allowlisted members are remotely callable. Unary
members return Promises; Observable members return cold RxJS Observables, and
`then` is reserved.

Call `client.peer.expose()` for calls in the opposite direction and resolve from
an accepted Peer in `server.peers`. Acceptor exposures apply atomically to current
and future Peers. Peer-local and Acceptor exposures share one effective namespace;
exposing the same wire name in both throws `TypeError`.
The idempotent cleanup returned by `expose()` removes the route for future calls
without interrupting an admitted handler. For multiple peers, snapshot
`server.peers` and compose independent calls with `Promise.allSettled()`.

## Cancellation and values

A cancelable function member selects `{ kind: "function", cancelable: true }` and has exactly one required
trailing `AbortSignal` in its implementation signature. The facade replaces that
slot with a required `AbortSignal | undefined`; explicitly pass `undefined` when
no cancellation is needed. Aborting rejects with `RpcException(canceled)` and
cooperatively signals an admitted handler. It does not promise rollback.

Arguments and results support detached JSON data: null, booleans, strings, finite
numbers other than negative zero, dense arrays, and plain data records. Void
results are supported. Unsupported shapes, accessors, cycles, and nested
`undefined` fail validation; serialization hooks never run. Non-enumerable data
properties on records are ignored. Messages are limited to 1 MiB, with additional
finite value, depth, count, and retained-memory bounds in the specification.

## Intercept calls and subscriptions

Pass `interceptor` to either Owner factory. It receives one context for each
outgoing unary call or stream subscription and each incoming execution. Both
`next()` and the interceptor return an RxJS Observable:

```ts
import { defer, tap } from "rxjs";
import {
  createRpcConnector,
  RpcCallDirectionEnum,
  type RpcInterceptor,
} from "@husky-di/remote";

const interceptor: RpcInterceptor = (context, next) => defer(() => {
  if (context.direction === RpcCallDirectionEnum.outgoing) {
    context.metadata = { traceId: crypto.randomUUID() };
  }
  return next().pipe(tap({ complete: () => console.log("finished") }));
});
const client = createRpcConnector({ interceptor });
```

Use RxJS operators for asynchronous preparation, item transformation, and error
handling. `next()` is single-use. Return your own Observable to short-circuit
without creating remote work. Interception runs once per opening, never per item
or during replay. Unary results adapt zero emissions to `undefined`, one emission
to the result, and a second emission to safe `handler-failed`.

Outgoing interceptor errors remain local. Incoming interceptor, source, or
operator failures become safe `handler-failed` errors for only that call or
stream. Unsubscribing tears down preparation; if continuation has not admitted
work, no stream record is sent. An admitted subscription requests remote cancel
and ends silently.

Outgoing `context.metadata` accepts plain Application Value records. The
Framework snapshots it when `next()` runs, charges it against retained-memory
limits, and preserves it during replay. Incoming metadata is detached and deeply
frozen. Empty metadata adds no wire field. Metadata never enters `event$`.
Older v1 endpoints may ignore it, so successful calls do not prove metadata was
processed or authorization was enforced. The Framework creates no trace
identifiers or ambient context itself.

## Recovery and optional reconnection

The built-in v1/v2 Protocol retains Session state after physical
Connection loss. A replacement `client.connect({ adapter })` resumes that same
Session within its recovery window. Sequence acknowledgments, replay, and the
retained call and stream ledgers preserve at-most-once dispatch within that Session.
Open sources continue during disconnection within finite retained budgets. Recovery
replays queued items in order without another open or source subscription. A new
Session never automatically resubscribes an old stream.

For finite automatic replacement attempts, create a Connector with reconnection
supervision and a fresh Adapter Factory:

```ts
import {
  createRpcReconnectionConnector,
  type RpcConnectorAdapterFactory,
} from "@husky-di/remote";

export function supervise(
  adapterFactory: RpcConnectorAdapterFactory,
) {
  return createRpcReconnectionConnector({
    adapterFactory,
    policy: {
      retryDelaysMs: [1_000, 2_000, 5_000, 10_000],
      attemptTimeoutMs: 30_000,
    },
  });
}
```

The factory creates a cold Connector, exposed as `reconnection.connector` for
service exposure, resolution, and shutdown. Pass `protocolFactory`, `runtimePolicy`,
and `interceptor` directly in the same options object when needed.
Call `await reconnection.connect()` once for the initial attempt. Initial failure
is returned without retry. After initial success, each Recovery episode gets
one immediate replacement attempt followed by the configured finite delays.
Call `await reconnection.stop()` before manual Connector takeover or Owner
shutdown. Stopping supervision does not close the Connector. Recovery has an
absolute deadline; retries cannot extend it.

Peer `state/state$` remains the authoritative Session state. Reconnection
`state/state$` describes attempt orchestration; its `event$` reports safe
background failure stages. Owner and Peer state streams and Acceptor `peers$`
replay their latest frozen snapshots. Owner `event$` is hot and non-replaying,
with lifecycle, unary call, and stream opening/terminal observations that exclude
application payloads, raw errors, and credentials. There is no per-item stream event.

## Limits, errors, and termination

In a source checkout, the built-in Protocol's size, length, count, resource,
and policy definitions are collected in
`src/modules/protocol/constants/rpc-limits.const.ts`, with units and derived
capacity formulas alongside the constants.

Owner factories accept role-specific `runtimePolicy`, an optional
`protocolFactory`, and `interceptor`:

```ts
const client = createRpcConnector({
  runtimePolicy: {
    maxPendingInvocationsPerSession: 256,
    maxHandlersPerSession: 16,
    bindingAttemptTimeoutMs: 30_000,
    recoveryGraceMs: 300_000,
    shutdownDeadlineMs: 5_000,
  },
});
```

These values match the defaults. Policy also bounds retained bytes, handshakes,
Sessions, total handlers, acknowledgment delay, activity probes, silence, and
send progress. Acceptor handlers are scheduled fairly across Sessions. Healthy
handler execution has no framework-imposed timeout; use a cancelable contract
for application deadlines. See the specification for every default and the
required cross-field constraints.

Framework call failures use `RpcException`; invalid local inputs use `TypeError`.
Branch on `RpcExceptionCodeEnum` values:

| Code | Meaning |
| --- | --- |
| `unavailable` | Unary/opening admission failed; an active stream can also exhaust its bounded resources. |
| `outcome-unknown` | Admitted work lost authoritative terminal evidence; previous effects or stream items remain. |
| `canceled` | Cancellation won the public result; side effects may remain. |
| `handler-failed` | The handler failed; its message and thrown value remain private. |
| `unknown-service` / `unknown-method` | The remote route is absent. |
| `protocol` | A Protocol, continuity, or resource invariant failed. |

`shutdown()` stops new work and drains retained work within one grace interval,
then cleans up resources within one further interval. `close()` forces semantic
cutoff immediately and uses only the cleanup interval. Both methods always
return the same cached termination Promise. Cleanup failures reject that task;
unknown call outcomes remain separate call failures.

## Extension points and deployment

| Entry point | Contract |
| --- | --- |
| `@husky-di/remote` | Owners, descriptors, reconnection, observations, and caller-required types. |
| `@husky-di/remote/protocol` | Role-specific Protocol factories and semantic implementor SPI. |
| `@husky-di/remote/transport` | Connection and Adapter contracts. |
| `@husky-di/remote/conformance` | Framework-neutral Protocol and Adapter verification runners. |

The default Protocol is selected when `protocolFactory` is omitted. Custom
Protocols use the same application-value and caller contracts. A Transport
Adapter supplies the ordered byte channel and framing. This package does not
include a WebSocket Adapter, notifications, service discovery, or
automatic Container integration.

For browser and Node WebSocket transport, use the separate
[`@husky-di/remote-websocket` package](../remote-websocket/README.md). The
[runnable example](../../examples/remote-lab/README.md) demonstrates
bidirectional calls and composes its Adapters with the built-in reconnection
supervisor.

Recovery uses an independent, stable 256-bit bearer `resumeToken`. Use a
confidential, integrity-protected, anti-replay channel that authenticates the
intended endpoint; complete its handshake before RPC handoff and never send
bootstrap messages as replayable early data. The built-in Protocol
does not authenticate the initiating application. Authenticate and admit inbound
initiators before Acceptor handoff, authorize services, and enforce per-principal connection,
Session, request-rate, and handler-duration limits at the application or gateway
boundary. A resume token grants Session continuity, not user identity. Keep it out of logs and payload traces.
Retained-state loss or process restart ends the Session; recovery is in-memory.

ESM, CommonJS, TypeScript NodeNext/Bundler, and browser consumers are supported.
Node usage requires Node.js 23.6 or newer.

See the [specification](docs/SPECIFICATION.md),
[requirement matrix](docs/REQUIREMENTS.md),
[Protocol guide](docs/PROTOCOL.md), and [Transport guide](docs/TRANSPORT.md).

## Observable members

Select an RxJS Observable method or a static Observable property explicitly:

```ts
import { createServiceIdentifier } from "@husky-di/core";
import { Observable, of, Subject } from "rxjs";
import { createRemoteServiceDescriptor } from "@husky-di/remote";

type Feed = { watch(topic: string): Observable<number>; updates$: Observable<number> };
const IFeed = createServiceIdentifier<Feed>("Feed");
const feed = createRemoteServiceDescriptor(IFeed, {
  wireName: "feed",
  members: {
    watch: { kind: "observable-function" },
    updates$: { kind: "observable" },
  },
});
const updates = new Subject<number>();
server.expose(feed, { watch: (_topic) => of(1, 2, 3), updates$: updates });
const remote = client.peer.resolve(feed);
const methodSubscription = remote.watch("all").subscribe({
  next: console.log,
  complete: () => console.log("completed"),
  error: (error) => console.error(error.code),
});
const staticSubscription = remote.updates$.subscribe(console.log);
methodSubscription.unsubscribe();
staticSubscription.unsubscribe(); // requests stream-cancel and ends silently
```

Each method subscription invokes the remote handler independently. Static
Observable instances are captured once at exposure and connected lazily. Within
one Peer, subscriptions to that same captured instance share one source connection;
the last ending subscription tears it down. Different Peers have separate source
connections. Static facade properties are readonly and return a stable Observable
object. Each subscription still owns its own identity, interception, and terminal.

Only direct RxJS Observables are accepted. `AsyncIterable`, Promise-wrapped
Observables, accessors, and non-Observable results are rejected. Stream methods
have no AbortSignal parameter; unsubscribe owns cancellation. Source completion
calls `complete`; source errors become safe `RpcException(handler-failed)`.
Recovery expiry or Session termination errors admitted streams with
`outcome-unknown`, without synthesizing completion or resubscription.

Fresh negotiation prefers `husky-di-rpc/2`, which carries unary and stream
records, and offers `husky-di-rpc/1` for unary-only peers. Unary calls keep working
on v1; a stream subscription errors with `unavailable` before sending an unknown
record. The selected profile is fixed for that Session, including Recovery.

## Migrate to specification 2.0.0

Replace `methods` with `members` and give every selected member an explicit
`kind`. Replace `callInterceptor` with `interceptor` and `RpcCallInterceptor` with
`RpcInterceptor`; return an Observable and compose `next()` with RxJS operators.
The old keys and type names are rejected, including when combined with new keys.
The package remains `0.0.0`; the specification version is independent of npm
release versioning.
