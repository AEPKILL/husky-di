# @husky-di/remote

`@husky-di/remote` adds typed, transport-independent unary RPC and remote
Observable streams to Husky DI. Define one mixed service contract, expose it on
one peer, and resolve a type-safe facade on the other. The package owns logical
Sessions, Recovery, bounded work, stream flow control, and termination; a
separate Transport Adapter owns each physical connection.

## Is This The Right Package?

Use this package when you need:

- TypeScript-first unary calls and cold RxJS streams selected by an exact member allowlist
- the same connection to carry work in both directions
- a stable logical Peer that can survive replacement of its physical connection
- one Connector talking to one Peer, or one Acceptor serving many independent Peers
- bounded application work, active streams, retained data, Recovery, and shutdown
- a replaceable wire Protocol or Transport Adapter

Arguments, unary results, and stream items must fit the
[RPC application value model](docs/SPECIFICATION.md#4-common-application-value-model).
The package does not provide service discovery or a WebSocket implementation by
itself. Use
[`@husky-di/remote-websocket`](../remote-websocket/README.md) for browser and
Node WebSocket Adapters.

## Installation

Install the RPC package, its peer dependencies, and a Transport Adapter. For a
WebSocket deployment:

```bash
pnpm add @husky-di/core @husky-di/remote @husky-di/remote-websocket rxjs ws
```

Browser-only applications do not need `ws`. Node Connector and Acceptor
Adapters import from `@husky-di/remote-websocket/node` and require it.
`@husky-di/remote` requires Node.js 23.6 or newer when used in Node.

## Quick Start

The shared contract below mixes a unary method, a stream method, and a readonly
stream property.

### 1. Define The Shared Service

```typescript
// calculator.contract.ts
import { createServiceIdentifier } from "@husky-di/core";
import { createRemoteServiceDescriptor } from "@husky-di/remote";
import type { Observable } from "rxjs";

export interface Calculator {
  add(left: number, right: number): number;
  count(limit: number): Observable<number>;
  readonly totals$: Observable<number>;
}

const ICalculator = createServiceIdentifier<Calculator>("ICalculator");

export const remoteCalculator = createRemoteServiceDescriptor(ICalculator, {
  wireName: "example.calculator.v1",
  members: {
    add: { kind: "unary" },
    count: { kind: "stream-method" },
    totals$: { kind: "stream-property" },
  },
});
```

`wireName` is the service identity sent over the connection. Both peers must
use the same exact name and compatible `members`. The local
`ServiceIdentifier` is used only for local exposure lookup.

A unary return such as `number` becomes `Promise<number>` on the remote
facade. A stream method returns `Observable<Item>` directly, and a stream
property remains an `Observable<Item>` data property.

### 2. Expose It From A Node Acceptor

```typescript
// server.ts
import { createRpcAcceptor } from "@husky-di/remote";
import { createNodeWebSocketAcceptorAdapter } from "@husky-di/remote-websocket/node";
import { Observable } from "rxjs";

import { remoteCalculator } from "./calculator.contract";

const acceptor = createRpcAcceptor();

const stopExposing = acceptor.expose(remoteCalculator, {
  add(left, right) {
    return left + right;
  },
  count(limit) {
    return new Observable<number>((subscriber) => {
      let value = 0;
      const timer = setInterval(() => {
        subscriber.next(value);
        value += 1;
        if (value === limit) {
          clearInterval(timer);
          subscriber.complete();
        }
      }, 100);
      return () => clearInterval(timer);
    });
  },
  totals$: new Observable<number>((subscriber) => {
    subscriber.next(42);
    subscriber.complete();
  }),
});

await acceptor.listen(
  createNodeWebSocketAcceptorAdapter({
    port: 8080,
  }),
);

await new Promise<void>((resolve) => process.once("SIGINT", resolve));
stopExposing();
await acceptor.shutdown();
```

`acceptor.expose()` applies atomically to current and future peers. Its cleanup
removes the exposure for future admission without interrupting already admitted
unary calls or stream sources.

### 3. Resolve It From A Connector

```typescript
// client.ts
import {
  createRpcConnector,
  createRpcConnectorReconnection,
} from "@husky-di/remote";
import { createNodeWebSocketConnectorAdapter } from "@husky-di/remote-websocket/node";

import { remoteCalculator } from "./calculator.contract";

const connector = createRpcConnector();
const reconnection = createRpcConnectorReconnection({
  connector,
  adapterFactory: () =>
    createNodeWebSocketConnectorAdapter({
      url: "ws://127.0.0.1:8080",
    }),
});
const calculator = connector.peer.resolve(remoteCalculator);

try {
  await reconnection.connect();
  console.log(await calculator.add(20, 22)); // 42

  await new Promise<void>((resolve, reject) => {
    calculator.count(3).subscribe({
      next: (value) => console.log(value),
      error: reject,
      complete: resolve,
    });
  });
} finally {
  await reconnection.stop();
  await connector.shutdown();
}
```

The local `ws:` URL keeps the quick start small. Production deployments need
an authenticated, encrypted Transport such as correctly validated `wss:`; see
[Security](#security).

## Descriptors And Cold Streams

Each selected member definition is exactly one of:

- `{ kind: "unary" }`
- `{ kind: "unary", cancelable: true }`
- `{ kind: "stream-method" }`
- `{ kind: "stream-property" }`

A Descriptor may mix all four interactions. Stream properties are required,
readonly, Observable-valued properties whose names end in `$`. Stream methods
return an Observable directly and cannot accept `AbortSignal`, Observable, or
another asynchronous capability as an argument.

Calling a stream method, reading a stream property, or retaining either remote
Observable is state-neutral. Remote service streams are cold Observables: each
subscription creates an independent owning root with its own argument snapshot,
wire identity, credit, terminal, and source subscription. The Framework never
shares or replays application items across subscriptions.

Explicit unsubscription is the caller-facing stream cancellation authority. If
it wins before outgoing admission, no remote execution is possible. After
admission, unsubscription closes only that local observation and sends one
cooperative cancellation intent; source teardown and protocol evidence converge
separately.

The built-in profile uses fixed `W=1` item credit. Credit is admission for one
item, not a general demand signal or an unbounded buffer. A source that emits
again without durable credit terminates that stream with `overflow`. Prefer
sources that pace emissions rather than synchronous bursts.

## Unary Cancellation

A cancelable unary implementation has exactly one required trailing
`AbortSignal`; its remote facade accepts `AbortSignal | undefined`:

```typescript
interface Reports {
  generate(reportId: string, signal: AbortSignal): Promise<string>;
}

const remoteReports = createRemoteServiceDescriptor(IReports, {
  wireName: "example.reports.v1",
  members: {
    generate: { kind: "unary", cancelable: true },
  },
});

const controller = new AbortController();
const task = reports.generate("weekly", controller.signal);
controller.abort();
await task;

// Pass undefined explicitly when no cancellation is requested.
await reports.generate("monthly", undefined);
```

Cancellation is cooperative after admission and does not promise rollback of
remote side effects.

## Bidirectional Work And Explicit Multi-Peer Composition

Every Peer can expose and resolve services. The Acceptor's `peers` getter is a
frozen snapshot. Compose one single-peer facade per snapshot member:

```typescript
const peers = acceptor.peers;
const deliveries = await Promise.allSettled(
  peers.map((peer) =>
    peer
      .resolve(remoteClientEvents)
      .changed("maintenance-scheduled")
      .then((value) => ({ peer, value })),
  ),
);
```

For remote Observable children, ordinary RxJS composition makes cancellation
and concurrency visible:

```typescript
import { from, map, mergeMap } from "rxjs";

const peers = acceptor.peers;
const samples$ = from(peers).pipe(
  mergeMap(
	(peer) =>
	        .resolve(remoteMetrics)
        .samples()
        .pipe(map((value) => ({ peer, value }))),
    4,
  ),
);

const subscription = samples$.subscribe({
  next: ({ peer, value }) => console.log(peer, value),
  error: (error) => console.error(error),
});

// RxJS unsubscribes every active child stream.
subscription.unsubscribe();
```

Each child is independent. The application owns concurrency, peer/result
association, error policy, fail-fast versus wait-all behavior, and cancellation.
There is no shared atomic admission, ordering, or fairness guarantee across
children.

## Recovery, State, And Events

The built-in Protocol can preserve one final-profile logical Session across a
replacement physical connection while its finite Recovery window remains open.
Recovery retains the stable Peer, resolved facades and Observable objects,
exposures, eligible unary calls, active stream identities, source subscriptions,
credit, and terminal authority. It does not resubscribe application sources.

Use `createRpcConnectorReconnection()` when the application wants finite
automatic replacement attempts from a fresh Adapter factory. Stop that
supervisor before starting a direct `connector.connect({ adapter, signal })`
attempt.

Current snapshots and observation streams are separate:

- `peer.state` and `peer.state$` describe one logical Peer.
- `connector.state` and `connector.state$` describe the Connector owner.
- `acceptor.state`, `acceptor.state$`, `acceptor.peers`, and
  `acceptor.peers$` describe the Acceptor topology.
- `event$` reports lifecycle plus unary and stream telemetry.

State and membership Observables replay the latest value. `event$` is hot and
non-replaying. These public observation streams are non-owning registrations;
subscribing to them never starts or owns network/application work.

## Errors

Framework call and stream failures use `RpcException`. Invalid local inputs
use `TypeError`. Branch on `RpcException.code`, not message text:

| Code | Meaning |
| --- | --- |
| `unavailable` | Work definitely did not execute remotely. |
| `outcome-unknown` | Admitted work lost authoritative outcome evidence and may have executed. |
| `canceled` | Cancellation won; remote rollback is not implied. |
| `handler-failed` | The remote handler, source acquisition, item normalization, or source failed safely. |
| `unknown-service` | No exposure exists for the exact wire service. |
| `unknown-member` | The service exists, but the exact member route does not. |
| `overflow` | A source emitted without its single durable credit. |
| `protocol` | Continuity, validation, resource, or Protocol safety failed. |

Remote exception messages, stacks, causes, service/member spellings, arguments,
items, and thrown values are never copied into public remote diagnostics.

## Shutdown And Close

`shutdown()` performs Graceful Cutoff: it stops new local admission, lets
already admitted unary and stream work converge within the absolute deadline,
attempts graceful Session close, and then cleans up. An infinite or silent source
can keep the owner draining until that deadline.

`close()` performs Force Cutoff immediately. It chooses all Session-wide
terminal winners, fences application and wire effects, closes physical
connections, and then settles asynchronous cleanup. Both methods are idempotent
and return the same cached termination task for that owner.

## Pre-1.0 Migration

The final `husky-di-rpc/1` profile is a one-time replacement of every draft
profile. Any pre-final draft Session must be drained or terminated before
deployment. Both endpoints must upgrade together, then establish a fresh Session
on a fresh physical Connection. Same-version and cross-package-build final
conformers must still prove fresh establishment and authenticated resume; that
evidence is no compatibility bridge for old bytes.

The method-only `methods` option was replaced by mixed `members`. The
`unknown-method` code became `unknown-member`, and
`maxPendingInvocationsPerSession` became
`maxApplicationWorkPerSession` without aliases.

The Remote Service Group API (`resolveAll`, `RemoteServiceGroup`, and
`RpcPeerResult`) was removed. No replacement semantics are provided. Explicit
composition provides no common normalization, atomic reservation, cancellation,
fail-fast, wait-all, ordering, or fairness policy. Applications must choose
those semantics for each independently owned child, as shown above.

## Public Entry Points

| Entry point | Use |
| --- | --- |
| `@husky-di/remote` | Caller API and caller-required structural types. |
| `@husky-di/remote/protocol` | SPI for third-party semantic Protocol implementations. |
| `@husky-di/remote/transport` | Physical Connection and Adapter contracts. |
| `@husky-di/remote/conformance` | Protocol and Adapter conformance runners. |
| `@husky-di/remote/wire/husky-di-rpc-1/schema` | Final closed wire schema. |
| `@husky-di/remote/wire/husky-di-rpc-1/vectors` | Raw wire vectors. |
| `@husky-di/remote/wire/husky-di-rpc-1/transcripts` | Stateful protocol transcripts. |
| `@husky-di/remote/wire/husky-di-rpc-1/security-vectors` | Cryptographic known-answer vectors. |

## Security

The built-in Protocol authenticates fresh and Recovery transcripts, but active
Session authority comes from the protected physical binding. The Transport must
provide confidentiality, ordered integrity, anti-replay, and intended-endpoint
authentication.

The Protocol does not authenticate the initiating application or authorize
service members. Before Acceptor handoff, deployments must authenticate and
admit the initiator at the Transport or gateway boundary and enforce finite
per-principal connection, Session, request-rate, handler-duration, frame, and
queue limits. Do not deploy over an untrusted plaintext channel.

## Related Documentation

- [Protocol implementor guide](docs/PROTOCOL.md)
- [Transport Adapter guide](docs/TRANSPORT.md)
- [Normative specification](docs/SPECIFICATION.md)
- [Requirement-to-evidence index](docs/REQUIREMENTS.md)
- [Architecture source](docs/ARCHITECTURE.drawio) and
  [rendered diagram](docs/ARCHITECTURE.png)
- [`@husky-di/remote-websocket`](../remote-websocket/README.md)
- [Changelog](CHANGELOG.md)

## Local Development

```bash
pnpm --filter @husky-di/remote typecheck
pnpm --filter @husky-di/remote test
pnpm --filter @husky-di/remote build
```

## License

MIT
