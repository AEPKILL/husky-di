# Remote WebSocket Example

This example runs a React Web application with TanStack Query, Tailwind CSS, and
local shadcn/ui components against a Hono-powered Node server over a real
WebSocket connection. Both sides expose a service and call the other side:

- **Web → Node:** the page calls the Node greeting service.
- **Node → Web:** Node calls the browser display service and prints its reply.

The observatory visualizes the public Connector, Peer, and Acceptor states; a
live topology; current `pendingCalls` derived from call lifecycle events; Node
diagnostic snapshots; and the recent RPC event stream. The playground can add
handler latency and launch overlapping calls so the pending ledger remains
visible long enough to inspect.

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

The browser's `online` listener is only an initial bootstrap trigger. While the
peer is still unbound, a failed initial attempt remains visible and the next
`online` event creates a new `RpcConnectorReconnection` with a fresh WebSocket
Adapter. After the first successful connection, the app retains that supervisor
and lets its retry policy recover later transport loss without waiting for
another `online` event or starting a parallel attempt. React cleanup requests
the supervisor to stop before closing the Connector.

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

Press `Ctrl+C` to close both servers.
