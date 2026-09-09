# Remote Lab

A runnable browser ↔ Node workbench for `@husky-di/remote` over
`@husky-di/remote-websocket`. Business scenarios sit above a docked DevTools
workspace. It uses native browser UI, Vite, and Node HTTP.

From the repository root (Node.js 23.6+):

```bash
pnpm install
pnpm --filter @husky-di/core --filter @husky-di/remote --filter @husky-di/remote-websocket build
pnpm --filter @husky-di/example-remote-lab start
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
- **关闭与资源 → Graceful shutdown** stops reconnection first, then drains the Connector. Reload
  to create a new Session. Initial connection failure is visible and requires a
  reload; the example never starts an independent retry loop.

The browser entrypoint imports the browser-safe WebSocket root. Node imports
`@husky-di/remote-websocket/node`. Shared descriptors explicitly allowlist methods.
The server validates names and delay bounds, and all untrusted text is rendered
with `textContent`. There are no React, Hono, query-cache, or UI-library dependencies.
The example binds only to loopback; it does not implement production authentication.

The scenario navigation covers unary and reverse calls, cancellation and
application timeouts, physical connection loss and Recovery, multiple Peers,
global and Peer-local exposure cleanup, valid and invalid values, safe error
codes, graceful/forced termination, and the Adapter/Protocol extension boundaries.
Open another tab to create a second real Peer for targeted calls and fanout.
The browser deliberately uses a 5-second recovery grace, a 3-second binding
attempt timeout, and a limit of 8 pending invocations. Its Recovery controls
close a real WebSocket after observing the report handler's entry, and can block
replacement attempts to exercise expiry. The capacity drill starts 12 greetings
and reports each actual fulfillment or `unavailable` outcome. These are example
settings, not changes to Remote's defaults.

The dock offers:

- **Network**: select real example calls, filter them, and inspect arguments,
  results, outcomes, and measured boundary timing. Invalid values can fail before
  any RPC event; the example caller record still shows the attempted invocation.
- **Flow**: compare caller and handler records sharing an explicit application
  trace label. Local `observationId` values are only for pairing one side's public
  events. Transport byte counts describe a Connection, not an individual call;
  local admission does not prove remote receipt. Protocol routing sketches are
  labelled as illustrations, never claimed as measured internal stages.
- **Sources**: pause a report at an actual cooperative application checkpoint,
  cancel its caller, and resume the handler. RPC cancellation, Recovery, and
  shutdown continue while paused. This is not a V8/CDP debugger. Cancellation
  does not roll back effects, and late handler completion cannot change the
  caller's selected terminal outcome.
- **Services**: inspect actual Peers, toggle the global shipping exposure or one
  Peer-local exposure, and exercise the duplicate-name conflict.
- **Console**: inspect separately labelled APP, RPC, and TRANSPORT observations.

`/api/snapshot` remains payload-free. The separate `/api/lab` endpoint deliberately
publishes sample application records and pause state for this local development
workbench. Use sample inputs: these records may contain the arguments and results
you enter. It never exposes raw wire frames, Session credentials, or raw errors.
Each recorder keeps the latest 100 completed calls and 200 log entries, plus live
calls independently. Payload previews are bounded to 4096 characters (depth 8,
64 properties per object); getters and serialization hooks are not executed.
The payload visibility checkbox controls presentation, not collection. Clearing
history preserves live calls. Process restart clears all in-memory records.

The Adapter page gives the real package test commands and extension points.
It does not claim to execute the framework's conformance runners in the browser.

Stop the dev command before running tests: the process-level shutdown check
briefly reserves ports 3000 and 5173. It sends SIGTERM during a real proxied RPC
and verifies that the reply arrives before a clean process exit.

```bash
pnpm --filter @husky-di/example-remote-lab test
pnpm --filter @husky-di/example-remote-lab typecheck
pnpm --filter @husky-di/example-remote-lab build:web
pnpm --filter @husky-di/example-remote-lab test:browser
```

For the browser checks, install Chromium once with
`pnpm --filter @husky-di/example-remote-lab exec playwright install chromium`.
The test runner starts and stops its own development server; stop a manually
started Lab first. Browser evidence covers real DevTools interactions, fault
injection, and light/dark layouts at desktop and mobile widths.

See the [normative specification](docs/SPECIFICATION.md) and
[executable specification coverage](tests/specification.test.ts).
