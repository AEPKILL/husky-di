# @husky-di/remote-websocket

Binary WebSocket Transport Adapters for `@husky-di/remote`. The package root works
in browsers; Node clients and listeners use `@husky-di/remote-websocket/node`.
Requires Node >=23.6 for Node use.

```ts
import { createRpcConnector } from '@husky-di/remote';
import { createWebSocketConnectorAdapter } from '@husky-di/remote-websocket';

const connector = createRpcConnector();
await connector.connect({
  adapter: createWebSocketConnectorAdapter({ url: 'wss://example.com/rpc' }),
});
// Expose/resolve service descriptors through connector.peer.
await connector.close();
```

```ts
import { createRpcAcceptor } from '@husky-di/remote';
import { createNodeWebSocketAcceptorAdapter } from '@husky-di/remote-websocket/node';

const acceptor = createRpcAcceptor();
await acceptor.listen(
  createNodeWebSocketAcceptorAdapter({ port: 9000, host: '127.0.0.1', path: '/rpc' }),
);
await acceptor.close();
```

A Node client uses `createNodeWebSocketConnectorAdapter({ url })` from `./node`.
To borrow an HTTP(S) server, replace `port` with `server`. The Adapter never closes
a borrowed server. Factories are cold and each Adapter starts once. Compose a fresh
factory per attempt with Remote's `createRpcConnectorReconnection` for recovery.

Messages default to a 1 MiB maximum. Each direction has a 16-message / 4 MiB queue
budget, configurable with `maxMessageBytes`, `maxQueuedMessages`, and
`maxQueuedBytes`. An accepted listener defaults to 64 Connections and rejects
excess upgrades while keeping healthy Connections available. Node `ws.maxPayload`
enforces the complete-message limit before adapter copying, including fragmented
or decompressed messages. Compression defaults off. Browser APIs cannot reject
payloads before browser allocation; enforce earlier limits at the server/proxy.
Outbound limits account for application bytes; native framing can add up to
14 bytes per queued message (`14 * maxQueuedMessages`) beyond that budget.
Sends settle at local admission into a bounded native
queue, with an owned byte snapshot, and do not prove delivery or execution.

Production recovery requires authenticated `wss:` with certificate validation,
anti-replay protection, and RPC handshake data excluded from TLS 0-RTT. Authenticate
initiators and check allowed origins before RPC admission, such as at an
authenticated reverse proxy; apply per-principal quotas and request limits there.
An HTTP server option or server-authenticated TLS does not itself authenticate an
initiating application. Plain `ws:` examples are for local development.

See the [normative specification](docs/SPECIFICATION.md) for options and lifecycle
contracts and the workspace [`remote-websocket` example](../../examples/remote-websocket/README.md)
for a runnable browser/server demonstration. Development checks:

```sh
pnpm --filter @husky-di/remote-websocket test
pnpm check:code-standard
```
