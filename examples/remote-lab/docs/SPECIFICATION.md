# Remote Lab Specification

This document defines the user-visible behavior of the local browser/Node demo.
The corresponding executable evidence is `../tests/specification.test.ts`.
Browser interaction evidence is `../tests/browser/workbench.test.ts`, run with
`pnpm --filter @husky-di/example-remote-lab test:browser`.

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
MUST NOT remove an unfinished call. HTTP diagnostics at `/api/snapshot` MUST expose Node's Owner,
listener, and Peer states plus this same snapshot, without arguments, results,
raw errors, or credentials. Browser HTTP polling MUST NOT overlap and MUST stop
during cleanup. RPC observations MUST come from public Owner `event$` streams.

## Lab business scenarios and recording

**EXAMPLE-LAB-RPC-001 — Sample business calls.** The Lab MUST provide real
WebSocket calls for a shipping quote, a value echo, an intentional handler
failure, and a delayed report. The quote MUST accept nonblank origin and
destination strings up to 80 characters and finite kilograms greater than zero
and no greater than 100. Its illustrative price MUST be `12 + 4 × kg` CNY,
rounded to cents; a 2 kg shipment MUST cost 20 CNY. Invalid business inputs MUST
reject as handler failures. These prices are local demonstration data.

**EXAMPLE-LAB-VALUE-001 — Observable value and error boundaries.** Echo MUST
round-trip values in the Remote Application Value domain. Invalid values MUST
be rejected by Remote's actual preflight before entering a Node handler.
The Lab MUST distinguish local `TypeError`, remote `handler-failed`,
`unknown-method`, and `unknown-service`, and subsequent valid calls MUST remain
usable. Examples MUST NOT invoke getters to format invalid arguments.

**EXAMPLE-LAB-DEBUG-001 — Cooperative pause and terminal outcomes.** Reports
MUST use a cancelable Remote method with the caller's required final
`AbortSignal | undefined` slot. A report MUST increment a per-Peer handler-entry
count and optionally pause at an application-owned Promise. `/api/lab` MUST
show each paused report's explicit trace ID, Peer ID, and current aborted
signal state. Canceling the caller MUST settle it as `canceled` while the pause
remains available for manual resume. Resuming this paused handler MUST allow
its real computation to settle, recording its observed aborted signal, without
rewriting the caller's terminal outcome or emitting a second caller terminal.
This sample deliberately keeps the paused handler alive after cancellation;
it is an application pause, not V8/CDP debugging. Duplicate concurrently paused
trace IDs MUST reject. Control actions act as a local administrative console
and MAY resume another connected Peer's named report. Report delays MUST be
integers from 0 to 10000 ms. Closing a Peer or shutting down Node MUST release
its held pause points.
When a pause request fails with definite non-execution, the UI MUST release its
pause intent and allow the next report. A canceled request whose handler state
is not yet observed MUST retain a manual resume action; a false resume result
MUST release that unresolved intent without claiming a handler executed.

**EXAMPLE-LAB-EXPOSURE-001 — Actual scoped exposure cleanup.** The shipping
descriptor MUST be exposed on the Acceptor and the inspection descriptor on
each Peer. The control descriptor MUST remain callable during demonstrations.
Global revoke MUST use the Acceptor exposure cleanup and make shipping calls
from all Peers reject `unknown-service`. Per-Peer revoke MUST use that Peer’s
exposure cleanup, leaving sibling Peers callable. Re-exposure MUST restore
calls through retained facades. The conflict action MUST exercise Remote's
actual same-wire-name rejection between Acceptor and Peer-local exposures,
report the caught `TypeError`, and preserve the prior exposure state.

**EXAMPLE-LAB-PEERS-001 — Application-owned selection and fanout.** The Lab MUST
list connected Peers by stable example-assigned IDs. A targeted callback MUST
invoke only the selected Peer's browser handler. Fanout MUST concurrently call
every currently connected Peer using `Promise.allSettled` and return each
Peer's ID, outcome, and result or safe error code. One failure MUST NOT erase
other successful results. Selection and concurrency are explicit application
policy. Browser callbacks MUST expose `example.lab-browser.v1.receive` before
connect and carry an explicit trace ID for caller/handler correlation.

**EXAMPLE-LAB-RESOURCE-001 — Actual configured resource admission.** The browser
Lab Connector MUST configure `maxPendingInvocationsPerSession: 8` at creation.
Its capacity drill MUST invoke 12 greetings concurrently and display the
actual independent outcomes from `Promise.allSettled`, including Remote's
`unavailable` rejection when local pending admission is exhausted. No synthetic
rejection or application queue MAY replace Remote admission. Completing calls
MUST release capacity so later calls can succeed on the same Peer. Executable
boundary evidence MAY use a smaller policy of two pending invocations and a
three-call burst to prove the same configured behavior.

**EXAMPLE-LAB-RECORD-001 — Explicit bounded application instrumentation.**
`/api/lab` MUST publish example-owned state and sample payload recordings
separately from payload-free `/api/snapshot`. It MUST include Peers, exposure
flags, paused reports, and the Node recorder snapshot. Browser and Node
recorders MUST retain the latest 100 completed calls plus all pending calls
independently, and the latest 200 APP/RPC/TRANSPORT log entries. Clear MUST
remove completed history while preserving pending calls. Payload previews MUST
be limited to 4096 characters, depth 8, and 64 members per collection; getters
and `toJSON` MUST NOT be invoked. Error records MUST use only safe error
names/codes, never raw errors, stacks, causes, or credentials. Call and handler
wrappers MUST explicitly pass a shared trace ID; Owner `observationId` MUST
remain labeled local and MUST NOT become a distributed trace ID. Global
Acceptor handlers MUST use an Acceptor label rather than inventing a caller
Peer identity. Flow MUST distinguish observed application phases from
connection-level byte observations; byte counts MUST NOT claim remote receipt
or per-call Protocol internals.

## Run and cleanup

**EXAMPLE-WS-LIFETIME-001 — Local ownership and graceful cleanup.** `pnpm --filter
@husky-di/example-remote-lab start` MUST start Node and Vite in one process.
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

## Workbench

**EXAMPLE-LAB-WORKBENCH-001 — Business scenarios and docked DevTools.** The page
MUST provide the nine capability categories: bidirectional calls, cancellation,
Recovery, multiple Peers, exposure, values, errors, termination/resources, and
Adapter/conformance. Scenario controls MUST invoke real RPC or explicit example
instrumentation. The business area MUST sit above a dock containing Network,
Flow, Sources, Services, and Console panels. Network MUST support selection and
name, side, and outcome filters; details MUST show actual example arguments,
results, terminal outcome, and measured boundary timestamps. The payload toggle
MUST hide or show previews without claiming to disable collection. Clearing local
history MUST preserve live calls. Flow MUST correlate example caller/handler
records only by their explicitly propagated application trace label. It MUST NOT
equate local RPC observation IDs across endpoints, infer remote execution from
Transport admission, or label an illustrative Protocol path as a measured stage.
Console MUST label APP, RPC, and TRANSPORT sources and retain both endpoints'
payload-free pending/event summaries. Services MUST use observed Peer state and
example-owned exposure state. All untrusted values MUST render as text. The page
MUST remain usable with keyboard controls, light/dark themes, and widths of 360,
736, and 1024 CSS pixels without document-level horizontal overflow.

**EXAMPLE-LAB-DEVTOOLS-001 — Resizable bottom dock and JSON inspection.** The
DevTools dock MUST remain at the viewport bottom while the business workspace
scrolls independently. Users MUST be able to resize the dock and Console drawer
heights and the Network, Sources, and Flow pane splits with pointer and keyboard
controls. Pane splits MUST resize widths on desktop and heights at widths of
736 CSS pixels or less. Sizes MUST remain bounded by the available viewport,
leaving both sides usable, and retain their proportions across polling updates,
scenario changes, and panel switches during the page lifetime. Panel and request
detail navigation MUST expose accessible tabs; resize controls MUST expose named,
focusable separators and their orientation and current value.
Clicking anywhere in a Network request row, including its metadata, outcome,
time, waterfall, and cell padding, MUST select that request and open Payload
details. The request-name button MUST retain Enter/Space keyboard selection and
expose its selected state; the selected row MUST be visually distinguished.
Valid JSON argument and result previews MUST display with line breaks and
two-space indentation; bounded non-JSON previews MUST remain readable without
fabricating JSON values.
Network and Flow MUST show Browser/Node provenance without incoming/outgoing
direction labels. Removing these display labels MUST NOT merge the endpoints'
records or change the recorded outcomes and measured phases.
Network rows MUST identify their topology owner with a labeled icon and distinct
colors in both light and dark themes: Browser records belong to the Connector,
and Node records belong to the Acceptor. These labels MUST follow the endpoint,
including reverse callbacks, rather than the call's sending or receiving role.

**EXAMPLE-LAB-RECOVERY-001 — Reproducible physical fault injection.** Recovery
controls MUST close the active browser WebSocket, retaining the same Connector,
Peer, and resolved facades. A paused report MUST survive replacement under the
existing supervisor, retaining its handler-entry count without reinvocation.
The browser Lab policy MUST use a 5000 ms recovery
grace and a 3000 ms binding-attempt timeout; the existing supervisor retry policy
is unchanged. A recovery drill MUST start a delayed report, wait for its actual
handler entry, and then disconnect. Successful replacement MUST preserve its
result without a second handler entry. An expiry drill MUST block replacement
Adapters until the absolute grace expires and show the actual terminal code for
the admitted report. Unblocking MUST only allow later supervisor attempts; it
MUST NOT create an application retry loop or reset an expired Session. Closing
or reloading the page MUST stop fault controls with the owned lifecycle.

**EXAMPLE-LAB-TERMINATE-001 — Explicit forced close.** Besides graceful shutdown,
the UI MUST offer forced Connector close after stopping supervision. Both modes
MUST stop HTTP polling, retain final observations, and show actual caller results.
Forced close MUST NOT be represented as guaranteed non-execution or rollback.
The closed page MUST offer reload to create a fresh Session. Adapter and Protocol
extension guidance MUST identify the public package seams and reproducible
conformance commands, without claiming that a browser illustration ran them.
