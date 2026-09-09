# Remote WebSocket example

A runnable browser ↔ Node demo of `@husky-di/remote` over
`@husky-di/remote-websocket`. It uses native browser UI, Vite, and Node HTTP.

From the repository root (Node.js 23.6+):

```bash
pnpm install
pnpm --filter @husky-di/core --filter @husky-di/remote --filter @husky-di/remote-websocket build
pnpm --filter @husky-di/example-remote-websocket start
```

Open [the example](http://127.0.0.1:5173). The single start command owns both
servers. Ctrl+C gracefully drains RPC while its proxy is still available, then stops
Vite and releases both ports. The combined command uses [Vite middleware mode](https://vite.dev/config/server-options.html#server-middlewaremode)
on an application-owned HTTP server so Vite does not take over process signals.
For separate terminals use `start:server` and `start:web`; `start:web` alone does
not start Node. The browser build is `build:web` and still needs the `/rpc` and
`/api` reverse proxies when served elsewhere.

- Send a greeting with a delay, then send another while it is pending, or click
  **Send 3 together**. Replies show measured round-trip times.
- After the browser connects, it invokes an explicit `ready()` handshake. Node
  calls that browser's exposed service, which displays the message and returns
  its page title over the same WebSocket. This avoids relying on lifecycle event
  timing to start a reverse call before the connection is ready.
- Both observatories show pending calls and the latest 24 events. The Node panel
  fetches payload-free diagnostics from `/api/snapshot` every 500 ms.
- To observe Recovery, keep Node alive, interrupt the browser's WebSocket using
  network tools, and restore it within the retry window. The stable Peer and its
  retained calls survive a replacement Connection. Some DevTools offline toggles
  do not close already-open WebSockets; in that case use network throttling tools
  that actually interrupt the socket. Restarting Node loses the Session.
- **Close session** stops reconnection first, then drains the Connector. Reload
  to create a new Session. Initial connection failure is visible and requires a
  reload; the example never starts an independent retry loop.

The browser entrypoint imports the browser-safe WebSocket root. Node imports
`@husky-di/remote-websocket/node`. Shared descriptors explicitly allowlist methods.
The server validates names and delay bounds, and all untrusted text is rendered
with `textContent`. There are no React, Hono, query-cache, or UI-library dependencies.
The example binds only to loopback; it does not implement production authentication.

Stop the dev command before running tests: the process-level shutdown check
briefly reserves ports 3000 and 5173. It sends SIGTERM during a real proxied RPC
and verifies that the reply arrives before a clean process exit.

```bash
pnpm --filter @husky-di/example-remote-websocket test
pnpm --filter @husky-di/example-remote-websocket typecheck
pnpm --filter @husky-di/example-remote-websocket build:web
```

See the [normative specification](docs/SPECIFICATION.md) and
[executable specification coverage](tests/specification.test.ts).
