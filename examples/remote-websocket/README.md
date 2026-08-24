# Remote WebSocket Example

This example runs a React Web application with TanStack Query, Tailwind CSS, and
local shadcn/ui components against a Hono-powered Node server over a real
WebSocket connection. Both sides expose a service and call the other side:

- **Web → Node:** the page calls unary greeting members and subscribes to the
  cold `clock$` Observable property.
- **Node → Web:** Node calls the browser display service and prints its reply.

The observatory visualizes the public Connector, Peer, and Acceptor states; a
live topology; current `pendingCalls` derived from call lifecycle events; Node
diagnostic snapshots; and the recent RPC event stream. The playground can add
handler latency, call the separate cancelable `greetCancelable` method, and
launch overlapping calls so the pending ledger remains visible long enough to
inspect. The `members` Descriptor mixes ordinary/cancelable unary routes with
the stream property; every reconnecting UI subscription owns an independent
single-peer stream.

## Structure

- `src/server/` contains the Hono RPC service on port `3000`.
- `src/web/` contains the React application, Tailwind styles, and local
  shadcn/ui components served by Vite on port `5173`.
- `src/consts/`, `src/interfaces/`, and `src/types/` contain the RPC contract
  shared by both runtimes.

Vite proxies `/api` HTTP requests and the `/rpc` WebSocket request to Hono.
The Node diagnostics snapshot uses `GET /api/snapshot`; it is not an RPC call.
Hono does not serve the Web build output.

## Connection recovery

The browser keeps at most one active `RpcConnectorReconnection` and supplies a
factory that returns a fresh WebSocket Adapter for every connection attempt. The
example does not maintain its own retry timers or browser `online` retry loop:
natural Session Recovery remains owned by the current Connector Reconnection
Policy. React cleanup stops the current supervisor before closing the Connector.

Press `Disconnect` to stop the current supervisor and then close only its
physical RPC Connection. The Connector and logical Session remain alive in
`recovering`, and no new Adapter is created while you wait. Press `Recover` when
you are ready; it creates a replacement supervisor with a fresh WebSocket
Adapter and resumes the same Session. The event stream keeps the resulting
`peer-recovering` and `peer-recovered` observations visible. Complete the manual
Recovery within the default five-minute Session recovery window. The ordinary,
cancelable, and burst launch controls remain available while disconnected, so
you can start calls during the interruption; they stay in `pendingCalls` and can
complete after Recovery.

## Run

```bash
pnpm --filter @husky-di/example-remote-websocket start
```

Open `http://127.0.0.1:5173` in a browser. The Hono server listens at
`http://127.0.0.1:3000`, and the page shows both RPC directions while Node
prints the reply from the browser:

```text
Browser replied with page title: Remote WebSocket Example
```

Set a visible handler delay, press `Launch cancellable RPC`, then press
`Abort RPC`. The browser aborts that call's `AbortController`; the Node handler
cooperatively stops its delay, and the result and event stream show `canceled`.
`Launch RPC` and the three-call burst continue to use the ordinary `greet`
method.

Press `Ctrl+C` to close both servers.
