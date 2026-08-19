# @husky-di/remote

`@husky-di/remote` adds typed, transport-independent unary RPC to Husky DI.
Define a remote service once, expose an implementation on one peer, and resolve
an asynchronous proxy on the other. The package owns logical RPC sessions,
recovery, bounded work, and graceful shutdown; a separate Transport Adapter owns
the physical connection.

## Is This The Right Package?

Use this package when you need:

- TypeScript-first request/response RPC with an explicit method allowlist
- the same connection to carry calls in both directions
- a stable logical peer that can survive replacement of its physical connection
- one connector talking to one peer, or one acceptor serving many peers
- bounded concurrency, retained data, recovery, and shutdown behavior
- a replaceable wire Protocol or Transport Adapter

This package currently supports unary calls whose arguments and results fit the
[RPC application value model](docs/SPECIFICATION.md#4-common-application-value-model).
It does not provide streaming RPC, notifications, service discovery, or a
WebSocket implementation by itself. Use
[`@husky-di/remote-websocket`](../remote-websocket/README.md) for browser and Node
WebSocket Adapters.

## What You Get

- opaque, type-safe Remote Service Descriptors
- asynchronous proxies inferred from ordinary TypeScript service interfaces
- Connector and Acceptor Topology Owners
- bidirectional calls through every connected peer
- Acceptor fan-out with one result per peer
- cooperative cancellation with `AbortSignal`
- explicit recovery over a replacement physical connection
- replay-latest state and membership Observables
- non-replaying lifecycle and call telemetry
- graceful draining and forced close
- conformance runners for custom Protocols and Transport Adapters

## Installation

Install the RPC package, its peer dependencies, and a Transport Adapter. For a
WebSocket deployment:

```bash
pnpm add @husky-di/core @husky-di/remote @husky-di/remote-websocket rxjs ws
```

Browser-only applications do not need `ws`. Node Connector and Acceptor Adapters
import from `@husky-di/remote-websocket/node` and require it.

`@husky-di/remote` requires Node.js 23.6 or newer when used in Node.

## Quick Start

The example below exposes a calculator from a Node Acceptor and calls it from a
Connector. Put the shared contract in a module that both applications can import.

### 1. Define The Shared Service

```typescript
// calculator.contract.ts
import { createServiceIdentifier } from "@husky-di/core";
import { createRemoteServiceDescriptor } from "@husky-di/remote";

export interface Calculator {
  add(left: number, right: number): number;
}

const ICalculator = createServiceIdentifier<Calculator>("ICalculator");

export const remoteCalculator = createRemoteServiceDescriptor(ICalculator, {
  wireName: "example.calculator.v1",
  methods: {
    add: true,
  },
});
```

`wireName` is the service identity sent over the connection. Both peers must use
the same exact name and compatible method definitions. The local
`ServiceIdentifier` is not used for wire routing.

Only methods selected in `methods` can be exposed or called. A synchronous local
return type such as `number` becomes `Promise<number>` on the remote proxy.

### 2. Expose It From A Node Acceptor

```typescript
// server.ts
import { createRpcAcceptor } from "@husky-di/remote";
import { createNodeWebSocketAcceptorAdapter } from "@husky-di/remote-websocket/node";

import { remoteCalculator } from "./calculator.contract";

const acceptor = createRpcAcceptor();

const stopExposing = acceptor.expose(remoteCalculator, {
  add(left, right) {
    return left + right;
  },
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

`acceptor.expose()` applies atomically to current and future peers. Its returned
cleanup removes the exposure for future calls without interrupting calls that
have already been admitted.

### 3. Resolve And Call It From A Connector

```typescript
// client.ts
import { createRpcConnector } from "@husky-di/remote";
import { createNodeWebSocketConnectorAdapter } from "@husky-di/remote-websocket/node";

import { remoteCalculator } from "./calculator.contract";

const connector = createRpcConnector();
const calculator = connector.peer.resolve(remoteCalculator);

try {
  await connector.connect(
    createNodeWebSocketConnectorAdapter({
      url: "ws://127.0.0.1:8080",
    }),
  );

  console.log(await calculator.add(20, 22)); // 42
} finally {
  await connector.shutdown();
}
```

The Connector's `peer` and previously resolved proxies remain stable throughout
connection recovery. You can expose services and resolve proxies before the first
physical connection exists.

The local `ws:` URL keeps the quick start small. Use an authenticated, encrypted
Transport such as correctly validated `wss:` in production; see
[Security](#security).

## Mental Model

Four concepts make up the public caller API:

| Concept | Responsibility |
| --- | --- |
| Remote Service Descriptor | Combines a local service type, an exact wire identity, and a non-empty method allowlist. |
| Peer | Represents one stable logical RPC session. It exposes local implementations and resolves remote proxies. |
| Topology Owner | Owns peers, lifecycle, resource policy, and physical connection attempts. A Connector owns one peer; an Acceptor owns a changing set. |
| Transport Adapter | Creates or accepts physical connections. It is supplied separately and does not define RPC semantics. |

The built-in `husky-di-rpc/1` Protocol is used when `protocol` is omitted from
`createRpcConnector()` or `createRpcAcceptor()`. Most applications should use the
default. Protocol implementors can use the dedicated SPI described in the
[Protocol guide](docs/PROTOCOL.md).

Factories are cold: creating an owner does not start network I/O. Call
`connector.connect(adapter)` or `acceptor.listen(adapter)` when the application is
ready to transfer ownership of network resources to it.

## Bidirectional Calls And Fan-Out

Every peer can both expose and resolve services. For a reverse call, define a
second shared Descriptor and expose it through the Connector's stable peer:

```typescript
const stopClientEvents = connector.peer.expose(remoteClientEvents, {
  changed(message) {
    console.log(message);
  },
});
```

An Acceptor can resolve that service on one peer:

```typescript
const clientEvents = peer.resolve(remoteClientEvents);
await clientEvents.changed("session-opened");
```

Or it can create a stable group facade and invoke the current eligible peer
snapshot:

```typescript
const allClientEvents = acceptor.resolveAll(remoteClientEvents);
const deliveries = await allClientEvents.changed("maintenance-scheduled");

for (const delivery of deliveries) {
  if (delivery.status === "rejected") {
    console.warn(delivery.peer, delivery.reason.code);
  }
}
```

The group Promise waits for every child and always fulfills with one
`fulfilled` or `rejected` result per selected peer. One peer's failure does not
fail-fast the whole group. If no peer is eligible, the result is an empty array.

## Cancellation

Mark a method as cancelable only when its local implementation has exactly one
required trailing `AbortSignal`:

```typescript
import { createServiceIdentifier } from "@husky-di/core";
import { createRemoteServiceDescriptor } from "@husky-di/remote";

interface Reports {
  generate(reportId: string, signal: AbortSignal): Promise<string>;
}

const IReports = createServiceIdentifier<Reports>("IReports");

const remoteReports = createRemoteServiceDescriptor(IReports, {
  wireName: "example.reports.v1",
  methods: {
    generate: { cancelable: true },
  },
});
```

The remote proxy replaces the implementation's final parameter with
`AbortSignal | undefined`:

```typescript
import { RpcException } from "@husky-di/remote";

const controller = new AbortController();
const pendingReport = reports.generate("weekly", controller.signal);

controller.abort();

try {
  await pendingReport;
} catch (error) {
  if (!(error instanceof RpcException) || error.code !== "canceled") {
    throw error;
  }
}

// Pass undefined explicitly when this call should not be cancelable.
await reports.generate("monthly", undefined);
```

Cancellation is cooperative after a call has been admitted. A `canceled` result
does not promise that remote side effects were rolled back.

## Recovery, State, And Events

The built-in Protocol preserves a logical session across an interrupted physical
connection while its recovery window remains open. The application chooses how
and when to create the replacement Adapter:

```typescript
import { filter, firstValueFrom } from "rxjs";

const recoveryRequested = firstValueFrom(
  connector.event$.pipe(
    filter((event) => event.type === "peer-recovering"),
  ),
);

await recoveryRequested;
await connector.connect(
  createNodeWebSocketConnectorAdapter({
    url: "wss://rpc.example.com",
  }),
);
```

Recovery keeps the Connector's peer, resolved proxies, exposures, and eligible
pending calls. The Adapter itself does not decide retry or backoff policy.

Use the synchronous state getters for current snapshots and Observables for
changes:

- `peer.state` and `peer.state$` describe one logical peer.
- `connector.state` and `connector.state$` describe the Connector owner.
- `acceptor.state` and `acceptor.state$` describe the Acceptor and listener.
- `acceptor.peers` and `acceptor.peers$` expose current membership.
- `event$` reports peer lifecycle, topology lifecycle, and call telemetry.

State and membership streams replay their latest value. `event$` is hot and
non-replaying, so subscribe before the operation whose events matter. Subscribing
to any public Observable only observes resources; it never starts or owns them.

## Errors

Framework-level call failures reject with `RpcException`. Invalid local inputs
reject with `TypeError`. Branch on the stable `RpcException.code`, not its
message:

```typescript
import { RpcException } from "@husky-di/remote";

try {
  await calculator.add(20, 22);
} catch (error) {
  if (error instanceof RpcException && error.code === "unavailable") {
    // This invocation definitely did not execute remotely.
  } else {
    throw error;
  }
}
```

| Code | Meaning |
| --- | --- |
| `unavailable` | The call definitely did not execute remotely. Retry only under your application's policy. |
| `outcome-unknown` | The call may have executed, but its authoritative outcome was lost. Treat retries as possible duplicates. |
| `canceled` | Cancellation won the public result. It does not imply remote rollback. |
| `handler-failed` | The remote handler failed. Remote messages, stacks, and thrown values are not exposed. |
| `unknown-service` / `unknown-method` | The remote peer does not expose the requested wire route. |
| `protocol` | A Protocol invariant, continuity, or resource fault made the operation unsafe. |

Calls only accept RPC application values: `null`, booleans, strings, finite
numbers, arrays, and string-keyed records recursively composed from those values.
Unsupported values reject locally instead of being passed to the Transport.

## Shutdown And Close

Use `shutdown()` for normal application termination. It stops admitting new work,
allows admitted work to drain within the configured deadline, performs graceful
session close, and then cleans up physical resources.

Use `close()` when the application must force the semantic cutoff immediately.
It skips the graceful drain phase and can leave admitted outgoing calls with an
`outcome-unknown` result. Physical cleanup can still take up to its configured
deadline.

Both methods are idempotent and return the owner's cached termination task.

## Public Entry Points

| Entry point | Use |
| --- | --- |
| `@husky-di/remote` | Caller API and caller-required structural types. |
| `@husky-di/remote/protocol` | SPI for third-party semantic Protocol implementations. |
| `@husky-di/remote/transport` | Physical Connection and Adapter contracts. |
| `@husky-di/remote/conformance` | Protocol and Adapter conformance runners. |
| `@husky-di/remote/wire/husky-di-rpc-1/schema` | Closed normative wire schema. |
| `@husky-di/remote/wire/husky-di-rpc-1/vectors` | Raw wire vectors. |
| `@husky-di/remote/wire/husky-di-rpc-1/transcripts` | Normative protocol transcripts. |
| `@husky-di/remote/wire/husky-di-rpc-1/security-vectors` | Cryptographic known-answer vectors. |

Keep implementation seams private unless you are building a Protocol or
Transport Adapter. Applications normally need only the root entry point plus a
Transport package.

## Security

The built-in Protocol authenticates its fresh and recovery transcripts, but its
active-session authority comes from the protected physical binding. The
Transport must provide confidentiality, ordered integrity and anti-replay, and
authentication of the intended endpoint.

Do not deploy over an untrusted plaintext channel. For WebSockets, `ws:` is
plaintext. A `wss:` deployment is suitable only when the application correctly
validates the intended TLS endpoint and trust policy.

Call telemetry deliberately excludes raw arguments, results, remote errors,
credentials, and wire data. Applications that record payloads at their own
caller or handler boundaries remain responsible for redaction and data handling.

## Related Documentation

- [Protocol implementor guide](docs/PROTOCOL.md)
- [Transport Adapter guide](docs/TRANSPORT.md)
- [Normative specification](docs/SPECIFICATION.md)
- [Requirement-to-evidence index](docs/REQUIREMENTS.md)
- [`@husky-di/remote-websocket`](../remote-websocket/README.md)
- [Changelog](CHANGELOG.md)

## Local Development

From the repository root:

```bash
pnpm --filter @husky-di/remote build
pnpm --filter @husky-di/remote typecheck
pnpm --filter @husky-di/remote test
```

The complete test command includes the Playwright browser suite.

## License

MIT
