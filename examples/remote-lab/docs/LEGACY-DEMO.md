# Remote Lab Specification

This document defines the user-visible behavior of the local browser/Node demo.
The corresponding executable evidence is `../tests/specification.test.ts`.
Browser interaction evidence is under `../tests/browser/`, run with
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
MUST show current pending calls, event counts since the most recent Clear, and the latest 24
payload-free event summaries. Pending calls MUST correlate start and finish by
observation ID independently of the bounded recent list: aging a start event out
MUST NOT remove an unfinished call. HTTP diagnostics at `/api/snapshot` MUST expose Node's Owner,
listener, and Peer states plus this same snapshot, without arguments, results,
raw errors, or credentials. Browser HTTP polling MUST NOT overlap and MUST stop
during cleanup. RPC observations MUST come from public Owner `event$` streams.
Pending observations MUST include the local start observation time and known
Lab Peer label. Snapshot time MUST be measured at the observing endpoint.

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
connect and carry an explicit trace ID in Call Metadata for caller/handler correlation.

**EXAMPLE-LAB-RESOURCE-001 — Actual configured resource admission.** The browser
Lab Connector MUST configure `maxPendingInvocationsPerSession: 8` at creation.
Its capacity drill MUST invoke 12 greetings concurrently and display the
actual independent outcomes from `Promise.allSettled`, including Remote's
`unavailable` rejection when local pending admission is exhausted. No synthetic
rejection or application queue MAY replace Remote admission. Completing calls
MUST release capacity so later calls can succeed on the same Peer. Executable
boundary evidence MAY use a smaller policy of two pending invocations and a
three-call burst to prove the same configured behavior.

**EXAMPLE-LAB-STREAM-001 — Explicit Observable stream lifecycle experiment.** The
workbench MUST provide a dedicated Observable Stream scenario with controls for
opening independent method subscriptions and static Observable subscriptions,
emitting `next`, completing or erroring the source, unsubscribing the latest
subscription, disconnecting/recovering, and resetting the experiment. Each
method subscription MUST receive its own source execution. Static subscriptions
MUST share one source connection while at least one subscription is open and
MUST tear it down after the last subscription ends. Unsubscribe MUST be shown as
`stream-cancel` and remain silent (no synthetic `complete` or `error`).

The scenario MUST display every subscription's identity, kind, values, terminal
outcome, and retained event count, plus a bounded event log. Disconnect MUST
retain at most four events; recovery MUST replay retained values in order and
release the retained budget. Exceeding that budget MUST terminate the affected
subscription with `error(unavailable)`. Every stream lifecycle event MUST also
appear in the Network Messages view as a clearly labelled `STREAM` Lab-owned
record, retained to the latest 200 entries. These records are explicit
instrumentation and MUST NOT imply that the current Remote package has executed
a stream route.

**EXAMPLE-LAB-RECORD-001 — Explicit bounded application instrumentation.**
`/api/lab` MUST publish example-owned state and sample payload recordings
separately from payload-free `/api/snapshot`. It MUST include Peers, exposure
flags, paused reports, and the Node recorder snapshot. Browser and Node
recorders MUST retain the latest 100 completed calls plus all pending calls
independently, and the latest 200 APP/RPC/TRANSPORT log entries. Clear MUST
remove completed history while preserving pending calls. Application payload
previews MUST be limited to 4096 characters, depth 8, and 64 members per collection; getters
and `toJSON` MUST NOT be invoked. Error records MUST use only safe error
names/codes, never raw errors, stacks, causes, or credentials. Call and handler
wrappers MUST explicitly propagate a shared trace ID through Remote Call Metadata;
business arguments MUST remain free of this correlation field. Owner `observationId`
MUST remain labeled local and MUST NOT become a distributed trace ID. Global
Acceptor handlers MUST use an Acceptor label rather than inventing a caller
Peer identity. Flow MUST distinguish observed application phases from
connection-level byte observations; byte counts MUST NOT claim remote receipt
or per-call Protocol internals.

**EXAMPLE-LAB-CLEAR-001 — Clear all recorded history.** The dock control MUST read
`Clear all records`. A successful action MUST clear completed calls, APP/RPC/TRANSPORT/STREAM
logs, recent diagnostic events, and event counters in this Browser and the shared
Node recorder, including Node history for other Peers. It MUST reset the selected
record while preserving pending application and RPC calls, paused handlers,
Peers, exposure state, Session and Connection association, and server identity.
Pending work MUST remain observable and MAY produce new records when it advances
or settles. Other browsers retain their own local history.
`DELETE /api/lab/records` MUST clear Node recording and diagnostic history and
return `{ lab, diagnostics }` containing their post-clear snapshots. The response
MUST use `Cache-Control: no-store`. Browser history MUST clear only after a
successful response; failure MUST be shown honestly without claiming completion.
Repeated clicks during an active clear MUST share that operation. Poll responses
started before or during clear MUST NOT repopulate cleared rows or counters.
A clear response superseded by connection shutdown MUST NOT overwrite final
observations. Clearing records after shutdown MUST remain available.

## Run and cleanup

**EXAMPLE-WS-LIFETIME-001 — Local ownership and graceful cleanup.** `pnpm --filter
@husky-di/example-remote-lab start` MUST start Node and Vite in one process.
Node MUST bind to `127.0.0.1:3000`; Vite MUST bind to `127.0.0.1:5173` with strict
port checking and proxy `/rpc`, `/api`, and `/health` to Node. A standalone Node
start command MUST also exist. Test-owned environments MAY request dynamically
allocated loopback ports; the proxy target and browser base URL MUST identify
that test's own Node and web listeners. Partial startup failure and SIGINT/SIGTERM MUST
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
header MUST use Lucide's `flask-conical` icon as the decorative Lab logo, retaining the
visible `remote lab` brand text. The page MUST provide the ten capability
categories: bidirectional calls, cancellation,
Recovery, multiple Peers, exposure, values, errors, termination/resources, and
Adapter/conformance, plus Observable Stream. Scenario controls MUST invoke real
RPC or explicit example instrumentation. Stream lifecycle events MUST be visible
in Network as clearly labelled `STREAM` instrumentation records. The business
area MUST sit above a dock containing Network,
Flow, Sources, Services, Console, Acceptor / Connector, and E2E panels. Network MUST open its Messages view
by default and retain a Calls view for application calls and lifecycle observations.
Calls MUST support selection and name, side, and outcome filters; details MUST
show actual example arguments,
results, terminal outcome, and measured boundary timestamps. The payload toggle
MUST hide or show previews without claiming to disable collection. Clearing all
history MUST preserve live calls. Flow MUST correlate example caller/handler
records only by their explicitly propagated application trace label. It MUST NOT
equate local RPC observation IDs across endpoints, infer remote execution from
Transport admission, or label an illustrative Protocol path as a measured stage.
Console MUST label APP, RPC, TRANSPORT, and STREAM sources and retain both endpoints'
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
Clicking anywhere in a Network Calls request row, including its metadata, outcome,
time, waterfall, and cell padding, MUST select that request and open Payload
details. The request-name button MUST retain Enter/Space keyboard selection and
expose its selected state; the selected row MUST be visually distinguished.
Valid JSON argument and result previews MUST display with line breaks and
two-space indentation; bounded non-JSON previews MUST remain readable without
fabricating JSON values.
Application call records in Network Calls and Flow MUST show Browser/Node provenance
without incoming/outgoing direction labels. Removing these display labels MUST NOT merge the endpoints'
records or change the recorded outcomes and measured phases.
Network Calls rows MUST identify their topology owner with a labeled icon and distinct
colors in both light and dark themes: Browser records belong to the Connector,
and Node records belong to the Acceptor. These labels MUST follow the endpoint,
including reverse callbacks, rather than the call's sending or receiving role.

**EXAMPLE-LAB-NETWORK-001 — Current Connector and Acceptor counterpart only.**
Network MUST scope its list and selected details to this page's Connector and
its corresponding Acceptor Peer before applying name, side, or outcome filters.
Peer labels MUST be scoped to the observed server instance so a Node restart
cannot associate this page with a different Session reusing the same Peer label.
The initial connected page MUST obtain its Peer label through `identify()` and
the stable server instance ID through `identifyServer()` on that same established
Lab RPC relationship. Instance association MUST remain independent of retained
handshake history; clearing or aging out rows MUST NOT lose it, and a `resume`
request or rejection alone MUST NOT establish it.
It MUST exclude other browser Peers and previous page Sessions. Browser records
belong to the current page; Node calls and lifecycle events MUST belong to its
example Peer ID. A globally exposed handler labeled `acceptor` MUST appear only
when its trace ID, service, and method match this page's recorded outgoing call.
Node Transport messages and handshake frames MUST match the current Connector's observed Session ID,
including earlier `fresh` frames and later `reject` frames on the same physical
Connection. Records without proven Node Session association MUST be omitted.
This display association MUST NOT alter the captured raw message or handshake JSON.
The Browser recorder MUST retain its observed Session ID independently of bounded
history and Clear. Node frames MUST retain their per-Connection Session association
when other frames age out. Recovery MUST retain both original and replacement
Connection records for this Session. Clearing all history MUST remove both
endpoints' recorded rows without expanding Network to unrelated Acceptor history
or losing association for new records on the retained Session.

**EXAMPLE-LAB-MESSAGES-001 — Actual sent and received Transport messages.**
Network MUST open Messages by default, presenting one row for each actual
Transport send admission or rejection and each received message at the selected
endpoint. Direction MUST be labeled `Sent` or `Received` relative to that observing
endpoint, with distinct arrows and colors that remain understandable without
color. A separate direction filter MUST offer all messages, sent messages, and
received messages. Rows MUST show the observed message type, exact byte length,
and local observation time including milliseconds. Messages MUST default to
oldest-first ordering. Activating the Time column header MUST toggle between
oldest-first and newest-first ordering and expose the current direction with
`aria-sort`. Messages observed in the same millisecond MUST retain their recording
order in both directions. Sorting MUST preserve the selected message and its
details. The sort direction MUST survive filtering, snapshot polling, and switches
between Messages and Calls during the page lifetime. The direction filter and
each view's pane proportions MUST also survive switches between Messages and Calls.

Messages MUST show Browser observations by default, including when the side
filter is `all`. Selecting Node MUST show only the corresponding Acceptor's
observations; it MUST NOT combine the two endpoints' observations into duplicate
messages. The Messages toolbar MUST identify the selected Browser/Node endpoint
and Connector/Acceptor owner with its labeled icon. The existing current-Session and server-instance association rules MUST
apply before direction, name, and outcome filters or selected details.
An actual replay on a replacement Connection MUST remain a separate observation.
Multiple subscribers to the same Connection MUST NOT duplicate a recording.

Selecting a message anywhere in its row or with the keyboard MUST open its
captured Payload and offer formatted JSON and the original Raw JSON when captured.
The payload toggle MUST hide these contents without changing collection.
Captured default-Protocol JSON objects with a known record kind MUST preserve
the complete observed payload within the Protocol's 1 MiB message limit,
including handshake and application message fields, without the APP preview's
truncation. Malformed, unsupported, non-JSON, or oversized messages MUST
retain byte counts and direction without fabricating decoded payloads.
Captures MUST detach their metadata and payload before mutable Transport buffers
can change, and remain bounded by the recorder's 200 log entries.

Sent MUST describe the local Transport boundary, never proof of remote receipt;
send rejection MUST retain its failed outcome and propagate the original failure.
Calls MUST remain available as one record per observed application invocation or
handler, including pending work and local preflight failures. Application start,
completion, cancellation, or timeout MUST NOT synthesize sent or received messages.
Payload-free lifecycle events MUST remain in Calls and MUST NOT appear as messages.
Public Owner `event$` and `/api/snapshot` MUST remain payload- and credential-free;
full message capture belongs to the example recorders and local `/api/lab` only.

**EXAMPLE-LAB-HANDSHAKE-001 — Full handshake frames and lifecycle in Network.**
Browser and Node Adapter instrumentation MUST record the actual `fresh`,
`accept`, `resume`, and `reject` handshake frames observed at their Transport
boundaries. Network Calls MUST list each frame as a selectable Handshake row and show
its Browser/Node side, Connector/Acceptor owner, local Connection ID,
sent/received direction, byte count, local observation time, and outcome.
Selecting a frame MUST open Payload with the complete decoded JSON, including
all actual Protocol fields and extension members: `fresh.profiles`; fresh
`accept.profile`, `sessionId`, `bindingEpoch`, and `resumeToken`; `resume.profile`,
`sessionId`, `resumeToken`, `receivedThrough`, and `resumeAttempt`; recovery
`accept.profile`, `sessionId`, `bindingEpoch`, and `receivedThrough`; and
`reject.code`. These handshake payloads MUST retain actual Session credentials
without redaction or the application preview's 4096-character truncation.
Payload MUST offer indented JSON and the original Raw JSON text. Overview MUST
identify the Transport source and frame metadata. The payload
toggle MUST hide or show the decoded JSON without changing collection.
Send observations MUST retain local admission or rejection as their boundary;
they MUST NOT claim remote receipt or measured handshake duration.

Network Calls MUST also retain initial establishment (`peer-opened`), recovery (`peer-recovering`
and `peer-recovered`), and closure (`peer-closed`) observations from both public
Owner `event$` streams. Each observation MUST appear as a selectable Handshake
row with its Browser/Node side, Connector/Acceptor owner, example Peer label
known at observation time, local observation timestamp, and outcome. The initial
Browser label MAY be `this-browser` before its assigned ID is known. Recovering MUST show `pending`,
opened and recovered MUST show `fulfilled`, and closed MUST preserve the public
event's `normal` or `failed` outcome and safe close reason. Name, side, and
outcome filters MUST apply to these rows, with a normal closure included among
fulfilled outcomes. Details MUST identify the actual lifecycle event and MUST
NOT substitute lifecycle events for captured frames or invent Protocol fields
or handshake duration. Public Owner `event$` streams and `/api/snapshot` MUST
remain payload- and credential-free; complete wire message and handshake recordings belong
only to the example recorders and local `/api/lab` snapshot. Frame and lifecycle
rows MUST both support name, side, and outcome filters and share the recorder's
bounded 200 log entries. Snapshots MUST detach their metadata without retaining
a raw Peer, state, event object, or mutable byte buffer. Clearing all history
MUST remove both endpoints' handshake rows while preserving live calls and
Session/Connection association.

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

## Owner information and custom services

**EXAMPLE-LAB-OWNER-001 — Complete bounded, attributed observations.** The
read-only Acceptor / Connector panel MUST show the Node Acceptor Owner,
listener, every current Acceptor Peer, and this page's Connector Owner, stable
Peer and reconnection supervisor separately. States MUST retain applicable
outcome, reason and safe error name/code. Reconnection observations MUST retain
attempt, next attempt, delay, failure stage and stop reason when applicable.
Closed Acceptor Peers MUST leave the current member list; their observations
remain only in bounded history. The Connector's closed stable Peer MUST remain
visible with its final state.

Creation settings MUST label explicit Lab inputs, normative defaults and
role-derived values and MUST NOT imply live internal usage. Known services,
methods, cancellation convention, exposure scope and cleanup state MUST come
from Lab metadata, never Descriptor reflection. Actual Adapter Connection and
Session observations MUST show their source and local observation time; unknown
Peer/Connection associations MUST NOT be inferred. Active associations MUST
survive Clear. Raw state errors, credentials and protocol internals MUST NOT
enter `/api/snapshot`.

RPC Pending Calls MUST mean locally observed `callStarted` without matching
`callFinished`, including outgoing Pending Invocation before admission. Each
row MUST show Owner, known Peer, local observation ID, relative direction,
known service/method, local start time, and waiting time as of that endpoint's
snapshot. Rows MUST remain oldest first and independently retained beyond 24
events and Clear. The panel MUST NOT add endpoint counts into a unique
distributed call count or equate pending with a protocol queue or executing
handler count. APP unfinished handlers and pauses MUST be separate, with
explicit trace, actual attribution and observed aborted state. An RPC terminal
MUST NOT erase an unfinished APP handler.

Peer filtering MUST affect only this information panel; Network MUST retain
its current-page Session scope. The current page's counterpart MUST be marked
only using verified server instance and Peer identity. Node observation loss
or stopped polling MUST retain and label the last snapshot and timestamp,
including frozen pending waiting time. Unknown, not applicable, stale, and
current data MUST remain distinguishable; missing counts MUST NOT become zero.
The existing 24-event, 100-completed-call and 200-log limits and independent
pending retention MUST continue to apply.

**EXAMPLE-LAB-CUSTOM-001 — Form definitions and exact names.** Services MUST
retain a read-only directory of built-in and custom Lab service metadata and
an explicit custom-experiment subview using the same state. Saving a definition,
exposing, resolving a facade and calling MUST be distinct actions. Saving MUST
create an independent definition ID, automatically generated local Service
Identifier, exact Wire Service Name, explicit target and nonempty method list;
it MUST NOT perform DI Registration or Service Exposure. Multiple definitions
with the same wire name MAY be saved.

Targets MUST include Node Acceptor global, one Node Peer and this page's
Browser Peer. Each method MUST support fixed JSON return, echo of the entire
business-argument array, or throwing, with an integer delay from 0 through
10000 ms and a cancellation switch. Names MUST obey Remote's exact rules,
without trimming, case folding or Unicode normalization. Empty names, duplicate
methods, `then`, invalid delay and invalid JSON MUST reject without changing
the prior definition. Legal names such as `__proto__` MUST be treated as data.
Business arguments MUST be a JSON array, with the cancellation signal supplied
separately. Syntax validation MUST NOT replace actual Remote Application Value
preflight or resource admission.

**EXAMPLE-LAB-CUSTOM-002 — Real scoped exposure and shared management.** Expose
MUST invoke the selected Acceptor or Peer and track its real cleanup. Effective
namespace conflicts MUST leave existing exposures intact; built-ins MUST NOT
be overwritten. Exposed definitions MUST be revoked before editing, rebinding
or deleting. Re-exposure MUST create a new implementation. Revocation MUST NOT
interrupt admitted work or change its captured implementation. A failed edit
or expose MUST preserve pre-operation state, without silently restoring an
earlier explicit revocation. Every page MAY manage Node definitions; Browser
definitions belong to their page. Revision checks MUST reject stale concurrent
edits and offer a read-only refresh. Reset MUST require an explicit scope and
remove only its custom definitions/exposures, retaining built-ins and history.
Changing between the Node and Browser memory owners MUST be an explicit
save-copy action that creates a new definition and retains the original;
same-owner target changes edit the existing revoked definition. The UI MUST
identify this distinction before saving and MUST NOT silently delete a source.

**EXAMPLE-LAB-CUSTOM-003 — Retained facades, calls and explicit correlation.**
Resolve MUST construct a real local Remote Facade even when the service is not
exposed, without claiming remote availability. Browser-to-Node calls MUST use
this page's stable Peer. Node-to-Browser calls MUST select a concrete Acceptor
Peer, including another page's advertised Lab metadata. A facade MUST retain
its original server instance, Peer, method set and cancellation convention;
changing definitions or selection MUST NOT retarget it. Old facades MUST
exercise real unknown-service, unknown-method, recovery, re-exposure and
closed-Peer outcomes. Each click MUST create an independent invocation with
overlap and per-call cancellation; no application retry or custom fanout is
part of this panel.

Each invocation MUST transmit a generated lifecycle-distinct trace and business
arguments as explicit application data. Echo MUST return only the business
array. Caller and handler APP records MUST use that trace, preserve their own
real outcomes, and use `acceptor` for global handlers without invented Peer
attribution. The actual wire envelope MUST remain visible in Raw messages.
Local syntax errors MUST say no RPC was invoked; actual facade preflight MAY
produce an APP caller record but MUST NOT fabricate RPC pending, transmission
or handler entry. Results MUST show target, method, safe error code or bounded
value preview, elapsed time and an explicit record link. Caller failure during
result normalization MUST NOT rewrite an already fulfilled handler record.

Current-page records MUST navigate to Network only on explicit action. Calls
to another page MUST open Node caller details inside Services and identify the
missing Browser handler evidence and its owning page. Return to experiment,
directory/experiment switching and top-level panel switching MUST preserve
drafts, parameters, selected definitions/facades and retained results. Background
completion MUST NOT switch panels. Clear or lifecycle eviction MUST NOT let
old results reappear. Payload visibility MUST continue to control presentation
only, including Services result previews.

**EXAMPLE-LAB-CUSTOM-004 — Memory lifetime and unconfirmed operations.**
Recovery on the same Session MUST preserve definitions, exposures, implementations
and facades without retrying calls. A closed Peer MUST invalidate its local
exposures and target while retaining definitions on the still-live owner for
manual rebinding; one closed Peer MUST NOT remove global exposure. Page disposal
MUST discard its Browser definitions/facades. Node restart MUST discard Node
definitions, facades, results and retained Sessions; old page data MUST NOT be
treated as confirmed state of a new server instance or automatically reinstalled.

Management, resolve, RPC outcome and observation failures MUST remain distinct.
A lost management response MUST produce "Result pending verification" and retain last observation,
not infer that the operation or RPC failed. Refresh MUST query evidence without
replaying a mutation or call. Missing evidence MUST stay unconfirmed regardless
of elapsed time. Cancellation MUST NOT claim rollback or handler settlement.
Application previews and errors MUST retain the existing bounded, safe recording
contract; custom data MUST NOT widen public RPC events or `/api/snapshot`.

Seven dock tabs MUST wrap at narrow widths. Definition editing and facade/call
controls MUST be side by side when space permits and stack on narrow screens,
with results below. Existing dock bounds, keyboard tabs, focusable named
separators, independent business scrolling, themes and 360/736/1024 px usability
MUST remain intact. Navigation to a record MUST offer an explicit return without
discarding experiment context or stealing focus on background updates.

## Managed E2E runs

**EXAMPLE-LAB-E2E-001 — Explicit observable package scenarios.** E2E MUST run
only after an explicit click. Its fixed manifest MUST replay representative,
real RPC behavior from `packages/remote` and `packages/remote-websocket`, with
stable package and source-test identities. It MUST cover bidirectional dispatch,
cancelable invocation, Recovery, browser and Node WebSocket adapters, multi-Peer
isolation/directed dispatch and graceful termination. The WebSocket conformance
source MUST be represented by the stable
`connector.source.multicast-terminal-single-use` case and retain its multicast
identity, hot terminal, single-use, and handed-off ownership assertions. Type,
declaration, package, architecture and other
checks that produce no RPC/Transport flow MUST remain in package commands rather
than appear as skipped E2E cases. Lab's own Playwright tests validate this
feature and MUST NOT be launched by it.

Each case MUST create test-owned Peer/Connection resources against the main Lab
endpoint and MUST NOT reuse or mutate the observing page's manual Connector or
custom experiment state. Cases MUST run serially without retries and release
their owned resources before the next starts. Their detached Browser and Node
recordings MUST retain actual APP, RPC, Protocol and Transport observations and
MUST carry the run id, case id, package and source identity. Lab adaptation MUST
retain the source scenario's material assertion rather than claim that merely
opening a connection ran the source test.

**EXAMPLE-LAB-E2E-002 — Main Node ownership and bounded stopping.** All pages
of one main Node MUST share at most one active run. Concurrent/repeated start
requests MUST return the same run without creating a queue. Switching panels,
closing or refreshing a page MUST NOT stop it; reopened pages MUST observe its
current state. Any page MAY stop the run. Accepted stop MUST immediately show
stopping, prevent new case scheduling, abort the active case and close its
test-owned Connector/Peer resources. Stopped MUST be reported only after the
case settles and cleanup completes; cleanup failure MUST remain a run error.
Completed case outcomes and detached recordings MUST survive
stop races, the interrupted case MUST differ from unexecuted later cases, and
prior failures MUST remain visible. Main Node shutdown MUST reclaim its runner
resources. Restart MUST NOT recover old runs. Clear of Lab records MUST neither
stop E2E nor delete its evidence. Manual rerun MUST start the entire suite in
fresh test-owned connections.

**EXAMPLE-LAB-E2E-003 — Honest reports and retained data flow.** The panel MUST
show overall progress, current case, actual reported steps, per-case status and
duration, assertion errors and bounded logs. It MUST distinguish failure,
timeout, interruption and not-run. Every required case passing, producing
associated recordings and cleaning up successfully MUST be necessary for a
passed run. Observation failure MUST show the last observation without inferring
a terminal result; a changed owner id MUST identify old evidence as unavailable.

Selecting a case MUST expose its retained Network, Flow, Console and Owner views
inside E2E. These views MUST use the case's detached recordings, MUST NOT rerun
the case and MUST NOT alter the manual Network panel's current selection state.
The manual Network panel MUST contain every recorded call and message belonging
to the current page Peer, including Browser and Node application/RPC calls,
Transport messages, STREAM instrumentation entries, and handshake lifecycle records. Managed E2E calls and
Transport entries MUST also appear there, marked by their `e2e:` trace or
managed-E2E provenance, even when the test-owned Peer is detached from the
manual Session. Selecting a case MUST NOT replace the manual Network panel's
current Peer or selection.
Logs and result labels MUST NOT substitute for real Transport entries and call
records. The main Node MUST retain the active run plus its most recent finished
run; a new finish replaces the previous retained run. There is no archive across
Node restarts and no screenshot or Playwright-trace contract for these Node-owned
package scenarios.

Owner and custom behavioral evidence is loaded by `specification.test.ts` from
`tests/lab/owner-information.test.ts` and `tests/lab/custom-services.test.ts`.
HTTP runner ownership and cleanup evidence is in `tests/lab/e2e-runs.test.ts`.
Browser evidence under `tests/browser/` MUST prove that the normal E2E button
runs the package scenarios and exposes their retained data views; it remains an
acceptance test and is not a member of the managed E2E manifest.
