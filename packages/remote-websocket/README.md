# @husky-di/remote-websocket

WebSocket Transport Adapters for `@husky-di/remote`. The browser-safe root
provides a Connector Adapter; the `/node` entry point provides Node `ws`
Connector and Acceptor Adapters.

## Install

```bash
pnpm add @husky-di/remote @husky-di/remote-websocket rxjs ws
```

## Use

```ts
import { createRpcConnector } from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";

const connector = createRpcConnector();
await connector.connect(
  createWebSocketConnectorAdapter({ url: "wss://rpc.example.test" }),
);
```

In browsers, the Connector Adapter samples `navigator.onLine` and listens for
the global `offline` event. Starting while offline fails without creating a
socket; going offline after handoff immediately terminates the physical
Connection so the RPC peer can enter Recovery. A later `online` event does not
reuse the single-use Adapter or reconnect automatically; create a replacement
Adapter according to the application's retry policy.

Node applications can import `createNodeWebSocketConnectorAdapter` and
`createNodeWebSocketAcceptorAdapter` from `@husky-di/remote-websocket/node`.

For a runnable end-to-end RPC call over a real local WebSocket connection, see
the [Remote WebSocket example](../../examples/remote-websocket/README.md).

## Resource limits

Every Adapter has finite message and queue limits. `maxMessageBytes` defaults to
1 MiB, `maxQueuedMessages` to 16, and `maxQueuedBytes` to at least 4 MiB. Node
factories also pass `maxMessageBytes` to native `ws` as `maxPayload`, including
the decompressed size when per-message compression is enabled. Temporary native
send pressure remains pending within these bounds; it is never an unbounded
application queue.

## Secure deployment

`ws:` is plaintext and must not be presented as secure Recovery. A `wss:`
deployment is secure only when the application validates the intended TLS
endpoint and trust policy and provides confidentiality, ordered
integrity/anti-replay, and authentication of the expected responder endpoint.
The structural Transport Adapter contract does not prove network security or
expose an `isSecure` claim.

See the [normative specification](docs/SPECIFICATION.md) for the complete
admission, framing, lifecycle, and security contract.

## License

MIT
