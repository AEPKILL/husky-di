# Remote WebSocket Example Specification

This document defines the user-visible behavior of the local browser/Node demo.
The corresponding executable evidence is `../tests/specification.test.ts`.

## RPC behavior

**EXAMPLE-WS-RPC-001 — Two directions over a real transport.** The browser MUST
expose `example.browser-display.v1.showMessage` before connecting. After
connecting, the browser MUST invoke `example.greeting.v1.ready` once.
Node MUST call `showMessage` on that same Peer during this explicit ready
handshake and return the browser’s page title to its caller. The browser MUST display the message as text
and reply with its page title. Node MUST expose `example.greeting.v1.greet` and
return `Hello, <trimmed name>!` after the requested delay. Names MUST contain
1–80 characters and MUST NOT consist entirely of whitespace. Delays MUST be
integers from 0 to 10000 milliseconds; invalid inputs MUST reject as handler
failures. The browser MUST allow overlapping greetings, offer a three-call
burst, and display measured round-trip times. No server-imposed call sequencing
or application retry may replace Remote's call semantics.

## State and recovery

**EXAMPLE-WS-STATE-001 — Authoritative transport state.** The primary transport
badge MUST derive from Peer state. `unbound`, `connecting`, `connected`,
`recovering`, `draining`, and `closed` MUST read `Not connected`, `Connecting`,
`Live transport`, `Transport disconnected`, `Disconnecting`, and `Connection
closed`, respectively. Recovering and closed MUST use the danger color. The
supervisor state MUST be shown separately; waiting for another attempt MUST NOT
be presented as a live transport.

**EXAMPLE-WS-RECOVERY-001 — One retained supervisor.** One page lifetime MUST own
one Connector and one built-in Connector Reconnection supervisor. Each attempt
MUST receive a fresh WebSocket Connector Adapter. The page MUST start the
supervisor once, surface initial failure, and leave subsequent retries to it.
After initial success, the policy MUST allow one immediate replacement attempt
and delays of 500, 1000, 2000, and 5000 milliseconds, with 3000 milliseconds per
attempt. The page MUST NOT create independent retry timers or online listeners.
Shutdown MUST stop the supervisor before shutting down its Connector.

## Observations

**EXAMPLE-WS-OBSERVE-001 — Pending and recent observations.** Browser and Node
MUST show current pending calls, cumulative event counts, and the latest 24
payload-free event summaries. Pending calls MUST correlate start and finish by
observation ID independently of the bounded recent list: aging a start event out
MUST NOT remove an unfinished call. HTTP diagnostics MUST expose Node's Owner,
listener, and Peer states plus this same snapshot, without arguments, results,
raw errors, or credentials. Browser HTTP polling MUST NOT overlap and MUST stop
during cleanup. RPC observations MUST come from public Owner `event$` streams.

## Run and cleanup

**EXAMPLE-WS-LIFETIME-001 — Local ownership and graceful cleanup.** `pnpm --filter
@husky-di/example-remote-websocket start` MUST start Node and Vite in one process.
Node MUST bind to `127.0.0.1:3000`; Vite MUST bind to `127.0.0.1:5173` with strict
port checking and proxy `/rpc`, `/api`, and `/health` to Node. A standalone Node
start command MUST also exist. Partial startup failure and SIGINT/SIGTERM MUST
close owned resources. The combined start command MUST keep Vite’s WebSocket
proxy alive until RPC shutdown finishes. Vite MUST run in middleware mode under
an application-owned HTTP listener so its standalone signal handler cannot
terminate the process before RPC drain. SIGTERM during an admitted greeting MUST
allow its reply to arrive and MUST finish with exit code 0. Server shutdown MUST drain admitted RPC handlers before
closing the HTTP listener. Repeated shutdown calls MUST share their cleanup
Promise. Explicit browser close MUST stop supervision and drain the Connector;
page disposal MUST request the same cleanup and remove observations and polling.
Browser unload cleanup is best effort because the platform can terminate a page
before asynchronous work completes.

This unauthenticated, loopback-only example is a development tool. Process
restart loses retained Sessions. Production admission and transport security
remain application responsibilities described in the Remote documentation.
