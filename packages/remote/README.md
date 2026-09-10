# @husky-di/remote

Typed, bidirectional unary RPC over application-supplied Transport Adapters.
A Connector owns one stable Peer; an Acceptor serves multiple Peers. Logical
Sessions preserve Peers, exposures, facades, and eligible calls across physical
Connection replacement.

## Call a remote service

Install `@husky-di/remote`, `@husky-di/core`, and `rxjs`. Supply Adapter instances
for your transport, then expose and resolve the same wire contract on both sides.
Local service identifiers may differ; `wireName` and selected method names
identify the remote route.

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
  methods: { greet: true },
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
Transport I/O. Only explicitly allowlisted methods are remotely callable; their
facade results are always Promises, and `then` is reserved.

Call `client.peer.expose()` for calls in the opposite direction and resolve from
an accepted Peer in `server.peers`. Acceptor exposures apply atomically to current
and future Peers. Peer-local and Acceptor exposures share one effective namespace;
exposing the same wire name in both throws `TypeError`.
The idempotent cleanup returned by `expose()` removes the route for future calls
without interrupting an admitted handler. For multiple peers, snapshot
`server.peers` and compose independent calls with `Promise.allSettled()`.

## Cancellation and values

A cancelable method selects `{ cancelable: true }` and has exactly one required
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

## Recovery and optional reconnection

The built-in `husky-di-rpc/1` Protocol retains Session state after physical
Connection loss. A replacement `client.connect({ adapter })` resumes that same
Session within its recovery window. Sequence acknowledgments, replay, and the
retained call ledger preserve at-most-once handler dispatch within that Session.
Recovery does not create a new identity for an uncertain call.

For finite automatic replacement attempts, use a fresh Adapter Factory:

```ts
import {
  createRpcConnectorReconnection,
  type IRpcConnector,
  type RpcConnectorAdapterFactory,
} from "@husky-di/remote";

export function supervise(
  connector: IRpcConnector,
  adapterFactory: RpcConnectorAdapterFactory,
) {
  return createRpcConnectorReconnection({
    connector,
    adapterFactory,
    policy: {
      retryDelaysMs: [1_000, 2_000, 5_000, 10_000],
      attemptTimeoutMs: 30_000,
    },
  });
}
```

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
with lifecycle and call observations that exclude application payloads, raw
errors, and credentials.

## Limits, errors, and termination

In a source checkout, the built-in Protocol's size, length, count, resource,
and policy definitions are collected in
`src/modules/protocol/constants/rpc-limits.const.ts`, with units and derived
capacity formulas alongside the constants.

Owner factories accept role-specific `runtimePolicy` and an optional
`protocolFactory`:

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
| `unavailable` | The invocation definitely did not execute remotely. |
| `outcome-unknown` | An admitted call may have executed, but its outcome is no longer provable. |
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
include a WebSocket Adapter, streaming RPC, notifications, service discovery, or
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
[Protocol guide](docs/PROTOCOL.md), [Transport guide](docs/TRANSPORT.md), and
[scope decision](../../docs/adr/0003-complete-recoverable-rpc.md).
