# WebSocket Transport Adapter Specification

Version: 1.0.0  
Status: Normative for the migrated implementation  
Date: 2026-09-09

The terms Physical Connection, Local Admission, and Transport Adapter follow
[`@husky-di/remote`](../../remote/docs/SPECIFICATION.md). This package transports
complete opaque Protocol messages. Requirement paragraphs containing **MUST**,
**MUST NOT**, and **SHOULD** define observable behavior.

## Public surface and configuration

**WS-API-001 — Entry points.** The browser-safe root **MUST** export
`createWebSocketConnectorAdapter` and its `IWebSocketConnectorAdapterOptions` and
`IWebSocketTransportLimitOptions` types. `./node` **MUST** export
`createNodeWebSocketConnectorAdapter`, `createNodeWebSocketAcceptorAdapter`, and
their `INodeWebSocketConnectorAdapterOptions`,
`INodeWebSocketAcceptorAdapterOptions`, and shared limit types. These factories
**MUST** return the structural Adapter interfaces from
`@husky-di/remote/transport`. Implementation classes, native capabilities, and
internal assembly factories **MUST NOT** be public. Importing the root **MUST NOT**
load `ws`, Node built-ins, or Node polyfills.

**WS-API-002 — Cold single use.** Factory calls and observable subscriptions
**MUST NOT** create sockets or listeners. Only the first `connect(signal)` or
`listen(signal)` **MUST** start native work; every later call **MUST** reject.
Connection sources **MUST** be hot, multicast, ordered, and have no value replay.
Every observer of one notification **MUST** receive the same Connection identity.

**WS-API-003 — Composition and snapshots.** Every Connector factory invocation
**MUST** return a fresh single-use Adapter suitable for
`createRpcConnectorReconnection`. Retry timers and Session Recovery **MUST** remain
owned by the Remote package. Factories **MUST** snapshot URL, subprotocol arrays,
headers, and scalar options; caller mutation after construction **MUST NOT** alter
startup. Injected native constructors and borrowed servers **MUST** retain identity.

The browser options are `url: string | URL`, optional
`protocols: string | readonly string[]`, and optional
`webSocket: typeof WebSocket`, plus the shared limits below. Node Connector options
replace `webSocket` with optional string-record `headers`, boolean
`followRedirects`, integer `handshakeTimeoutMs`, and boolean `rejectUnauthorized`.
Redirect following defaults to false and TLS certificate verification to true.
Node Acceptor options are exactly one of `port` or HTTP(S) `server`, optional
`host`, `backlog`, absolute `path`, boolean `perMessageDeflate`, `maxConnections`,
and the shared limits.

**WS-LIMIT-001 — Validated finite limits.** Factories **MUST** synchronously reject
invalid options. All configured limits **MUST** be safe integers. Defaults and
inclusive lower bounds are:

| Option | Default | Minimum |
| --- | --- | --- |
| `maxMessageBytes` | 1,048,576 | 1,048,576 |
| `maxQueuedMessages` | 16 | 1 |
| `maxQueuedBytes` | max(4,194,304, maxMessageBytes) | maxMessageBytes |
| Acceptor `maxConnections` | 64 | 1 |

Node `maxMessageBytes` and `handshakeTimeoutMs` **MUST NOT** exceed 2,147,483,647,
preventing native signed-integer or timer overflow. `port` **MUST** be in
0..65535, `backlog` in 0..2,147,483,647, and `handshakeTimeoutMs` at least 1.
URLs **MUST** use `ws:` or `wss:` without credentials or fragments; subprotocols
**MUST** be unique valid WebSocket tokens. Headers **MUST** contain only string
values. Explicit flags **MUST** be booleans, and a supplied path **MUST** start
with `/`.

## Startup and ownership

**WS-CONNECT-001 — Handoff barrier.** A Connector **MUST** create one socket,
configure `binaryType = "arraybuffer"`, and wait for its open event. It **MUST**
install Connection listeners before notifying `connection$`, gate inbound
notifications until every synchronous Connection observer returns, emit exactly
one Connection, complete its source, and fulfill startup. Framework-controlled
send and close obey the Remote notification-return barrier and **MUST NOT** be
invoked reentrantly from that notification. Messages captured during handoff
**MUST** remain bounded and ordered.

**WS-CONNECT-002 — Startup terminal.** Abort before handoff **MUST** gate startup,
complete an empty source, reject with `AbortError`, and dispose any partial socket.
Native construction/open failure **MUST** error the source and reject startup with
the same trusted local `Error`. Cleanup **MUST** consume late native error events
until the native close event. Abort after handoff **MUST NOT** close the transferred
Connection.

**WS-CONNECT-003 — Browser offline signal.** Where browser network status exists,
startup while `navigator.onLine` is false **MUST** reject without constructing a
socket. An offline event before handoff **MUST** fail startup; after handoff it
**MUST** fail the Connection and release its socket. The package **MUST** remove
network listeners when their lifetime ends and **MUST NOT** reconnect on an online
event. Platforms without that browser surface use native WebSocket events.

**WS-ACCEPT-001 — Listener lifetime.** The Node Acceptor **MUST** attach native
handlers before reporting readiness and fulfill `listen()` when listening.
Accepted Connections **MUST** use the same handoff barrier as Connectors. Listener
abort **MUST** synchronously prevent further acceptance and complete the source;
pre-ready abort **MUST** reject startup with `AbortError`. Listener errors **MUST**
error the source and reject unsettled startup with the same local `Error`.
Listener terminal **MUST NOT** close already transferred Connections or a borrowed
HTTP(S) server. A borrowed server already listening **MUST** be recognized.

**WS-ACCEPT-002 — Capacity and isolation.** The native upgrade gate **MUST** reject
new sockets at `maxConnections` before handing them to the Framework. It **MUST NOT**
create an overflow Connection or stop the healthy listener. The slot **MUST** remain
occupied until that Connection's native and observable cleanup completes. Rejected
upgrades **MUST NOT** accumulate an adapter-owned queue. Individual Connection
failure **MUST NOT** affect sibling Connections or the listener.

This deliberately replaces the reference implementation's overflow handoff and
listener shutdown: overload is handled at native admission while healthy Sessions
remain available. Framework-owned capacity rejection still follows the Remote
handoff contract and is tested by its shared Acceptor conformance runner.

## Messages, pressure, and cleanup

**WS-MESSAGE-001 — Binary ordering and ownership.** One complete binary native
message **MUST** become one `Uint8Array` notification. All observers **MUST** receive
the same byte-object identity, and the Adapter **MUST NOT** mutate or reuse emitted
storage. Native ArrayBuffers and views **MUST** be detached from later native
mutation before notification. Binary messages **MUST** preserve order across
asynchronous Blob conversion and native close. Text or unsupported data **MUST**
fail only that Connection. No message **MAY** follow an observable terminal.

**WS-MESSAGE-002 — Bounds before allocation.** Complete native payload length
**MUST** be checked before copying or calling `Blob.arrayBuffer()`. Inbound queued
and converting messages **MUST** count against both queue limits. Overflow
**MUST** fail without converting or copying the offending payload. Node factories
**MUST** set `ws.maxPayload` to the configured complete-message limit, including
fragmented and decompressed messages. Compression **MUST** be disabled by the Node
Connector and default off for the Acceptor. Browser APIs expose complete-message
bounds only after the browser has allocated the native payload; deployments
**MUST** enforce an upstream frame/message limit when earlier rejection is needed.

**WS-SEND-001 — Local Admission.** `send()` **MUST** validate `Uint8Array` and the
message limit, terminating on invalid input. It **MUST** call native send only
while OPEN and within finite queue capacity. Temporary pressure **MUST** leave one
send pending without copying its bytes or invoking native send. On admission the
Adapter **MUST** make an owned bounded byte snapshot, including for Node Buffers,
then fulfill immediately after native `send()` returns successfully. Fulfillment
**MUST NOT** imply remote delivery. Later native failure **MUST NOT** revoke that
fulfilled admission.

The outbound budget counts retained application bytes and messages conservatively
until native `bufferedAmount` returns to zero. Native buffered bytes are also checked
before each admission; WebSocket framing can add at most 14 bytes per queued
message, or `14 * maxQueuedMessages` beyond the configured application-byte bound.
This bound excludes TLS/TCP
and operating-system buffers. No native send-callback backlog is retained.

**WS-SEND-002 — One pending operation.** If a second send arrives while one is
pressure-blocked, both **MUST** reject with the same `Error`, `message$` **MUST**
error with that identity, and the socket **MUST** be released. Close or failure
**MUST** cancel the pressure polling timer and reject the pending operation.

**WS-TERM-001 — Native terminal ordering.** Remote code 1000 or 1001 **MUST**
complete `message$` after already captured complete messages. Other remote close
codes and native errors **MUST** error it. A trusted local native Error **MUST**
retain its identity. Conversion failure after remote close **MUST** still terminate
and release retained work. Local Direct Close **MUST** discard undelivered inbound
work and complete the message source unless native cleanup throws.

**WS-CLOSE-001 — Direct Close.** `close()` **MUST** synchronously gate subsequent
sends, reject the pending send, and request native `terminate()` when available or
browser-compatible `close()` otherwise. Every call **MUST** return the same Promise,
settling after both native and message-source terminal. A native close throw
**MUST** reject cleanup and error the message source with the same Error. Cleanup
**MUST NOT** wait for RPC acknowledgments, handlers, or listener shutdown. All
socket and network listeners **MUST** be detached after native close.

## Deployment and distribution

**WS-SEC-001 — Secure channel boundary.** The package **MUST NOT** infer security
from structural Adapter compatibility or expose an `isSecure` assertion. `ws:` is
plaintext and appropriate only for local development or an independently protected
channel. A production `wss:` endpoint **MUST** validate TLS trust and the expected
responder, prohibit replayable TLS 0-RTT for RPC handshake data, and authenticate
and admit initiators before the RPC handoff, for example at an authenticated TLS
reverse proxy. Server-authenticated TLS alone does not authenticate the initiating
application. Origin allowlists, per-principal quotas, rate limits, and handler
deadlines remain deployment/application responsibilities. Borrowing an HTTP server
alone **MUST NOT** be described as authentication. Disable compression unless its
resource and information-leak tradeoffs have been assessed.

**WS-PKG-001 — Installed consumers.** Typed ESM and CJS root and Node entries
**MUST** resolve from a packed artifact without workspace sources. The package
**MUST** include this specification, README, CHANGELOG, and LICENSE. The manifest
**MUST** retain public access, `type: "module"`, `sideEffects: false`, Node >=23.6,
and source maps. Runtime dependencies **MUST** be limited to a compatible
`@husky-di/remote`, RxJS, and official `ws`; Node typings **MUST NOT** leak into the
browser declaration entry.

**RPC-RELEASE-005 — Independent Adapter evidence.** The implementation **MUST**
import only public Remote entry points and pass both shared Adapter conformance
runners plus platform-boundary, real-socket, and packed-consumer tests. The matching
`tests/specification.test.ts` **MUST** change with public behavior. Focused native
race tests and conformance suites supplement those requirement-labeled tests.
