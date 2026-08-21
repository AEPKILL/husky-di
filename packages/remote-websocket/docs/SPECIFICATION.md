# `@husky-di/remote-websocket` Specification

Status: Stable  
Version: 1.0.0  
Date: 2026-08-19

## 1. Scope and terminology

This document is the normative contract for the WebSocket Transport Adapters used at the
`@husky-di/remote` Physical Connection seam. It does not define or inspect RPC Protocol messages.

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. “Transferred Connection” means a
Connection after the synchronous return of its `connection$` notification. “Local Admission” has the meaning
defined by `@husky-di/remote`: the Adapter no longer borrows the caller's bytes and the complete message has
entered a bounded native send path; it does not imply delivery.

## 2. Public entry points and policy

```typescript
interface IWebSocketTransportLimitOptions {
  readonly maxMessageBytes?: number;
  readonly maxQueuedMessages?: number;
  readonly maxQueuedBytes?: number;
}

interface IWebSocketConnectorAdapterOptions
  extends IWebSocketTransportLimitOptions {
  readonly url: string | URL;
  readonly protocols?: string | readonly string[];
  readonly webSocket?: typeof WebSocket;
}

interface INodeWebSocketConnectorAdapterOptions
  extends IWebSocketTransportLimitOptions {
  readonly url: string | URL;
  readonly protocols?: string | readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly followRedirects?: boolean;
  readonly handshakeTimeoutMs?: number;
  readonly rejectUnauthorized?: boolean;
}

interface INodeWebSocketAcceptorAdapterOptions
  extends IWebSocketTransportLimitOptions {
  readonly port?: number;
  readonly server?: HttpServer | HttpsServer;
  readonly host?: string;
  readonly backlog?: number;
  readonly path?: string;
  readonly perMessageDeflate?: boolean;
  readonly maxConnections?: number;
}

function createWebSocketConnectorAdapter(
  options: IWebSocketConnectorAdapterOptions,
): IRpcConnectorAdapter;

function createNodeWebSocketConnectorAdapter(
  options: INodeWebSocketConnectorAdapterOptions,
): IRpcConnectorAdapter;

function createNodeWebSocketAcceptorAdapter(
  options: INodeWebSocketAcceptorAdapterOptions,
): IRpcAcceptorAdapter;
```

**WS-API-001 — Entry points.** The browser-safe package root **MUST** export
`createWebSocketConnectorAdapter(options)`. It **MUST NOT** load Node-only modules. The `./node` entry point
**MUST** export only `createNodeWebSocketConnectorAdapter(options)` and
`createNodeWebSocketAcceptorAdapter(options)` as runtime values. Every factory **MUST** return the corresponding
structural `IRpcConnectorAdapter` or `IRpcAcceptorAdapter` without opening a socket or listener. A Node Acceptor
**MUST** receive exactly one of `port` or `server`.

**WS-API-002 — Cold single use.** An Adapter **MUST** perform native startup only from its first `connect()` or
`listen()` call. A later call on the same Adapter **MUST** reject. Construction and subscription alone **MUST
NOT** create native resources.

**WS-API-003 — Reconnection composition.** Repeated calls to either WebSocket Connector Adapter factory
**MUST** return distinct cold single-use Adapters suitable for an application-supplied
`RpcConnectorAdapterFactory`. The package **MUST NOT** duplicate `RpcConnectorReconnection`, retry policy,
timers, or supervisor state. Applications **MAY** compose the WebSocket factory directly with
`createRpcConnectorReconnection()`; every initial or replacement attempt then **MUST** obtain a newly created
Adapter.

**WS-LIMIT-001 — Finite policy.** Factory limit values **MUST** be safe positive integers. `maxMessageBytes`
**MUST** be at least `1,048,576`; `maxQueuedMessages` **MUST** be at least one; and `maxQueuedBytes` **MUST** be
at least `maxMessageBytes`. Defaults are respectively `1,048,576`, `16`, and
`max(4,194,304, maxMessageBytes)`. An Acceptor `maxConnections` **MUST** be a positive safe integer and defaults
to `64`. A supplied `port` **MUST** be a safe integer in `0..65535`, `backlog` **MUST** be a non-negative safe
integer, `handshakeTimeoutMs` **MUST** be a positive safe integer, and every `headers` value **MUST** be a string.
Invalid options **MUST** throw synchronously from the factory.

## 3. Connector startup

**WS-CONNECT-001 — Handoff.** `connect(signal)` **MUST** create one socket, configure binary delivery, and wait
for open. It then **MUST** synchronously emit exactly one Connection while inbound delivery remains gated,
complete `connection$`, release that gate only after every synchronous notification observer has returned, and
fulfill. The owner **MAY** call `send()` during handoff. An inbound message that arrives at the open boundary
**MUST NOT** overtake handoff.

**WS-CONNECT-002 — Startup terminal.** Pre-handoff abort **MUST** synchronously gate handoff, release the
half-open socket, complete `connection$` without a value, and reject with `AbortError`. Constructor, error, or
close failure before handoff **MUST** error `connection$` and reject with the same `Error` object. Abort after
handoff **MUST NOT** revoke or close the Transferred Connection.

**WS-CONNECT-003 — Browser network status.** When the browser exposes global network status, the browser
Connector **MUST** reject without constructing a socket if `navigator.onLine` is false at startup. An `offline`
event before handoff **MUST** fail startup; after handoff it **MUST** immediately error the Transferred
Connection and Direct Close its socket. Network listeners **MUST** be removed when their startup or Connection
lifetime ends. A later `online` event **MUST NOT** reuse the single-use Adapter or automatically dial a
replacement Connection; the application owns replacement-Adapter and retry policy. A platform without the
browser network-status surface **MUST** retain the ordinary WebSocket lifecycle behavior. When an application
uses `RpcConnectorReconnection`, a later `online` event still **MUST NOT** bypass its configured schedule; the
supervisor's next attempt invokes the application Factory and creates the replacement Adapter.

## 4. Acceptor startup and capacity

**WS-ACCEPT-001 — Listener lifecycle.** The Node Acceptor **MUST** attach handlers before listener readiness.
`listen(signal)` **MUST** fulfill when the `ws` server is listening. It **MAY** emit Connections before that
fulfillment. Every accepted Connection **MUST** use the same inbound handoff gate as the Connector. Pre-ready
abort **MUST** complete `connection$`, stop acceptance, and reject `AbortError`; post-ready
abort **MUST** complete the source and stop acceptance without changing the fulfilled Promise. Listener error
**MUST** error the source and, if readiness is unsettled, reject it with the same `Error`. Source terminal
**MUST NOT** close Transferred Connections or a supplied external HTTP(S) server.

**WS-ACCEPT-002 — Isolation and overflow.** Failure of one Connection **MUST NOT** terminate the listener or a
sibling. The Adapter **MUST** track no more than `maxConnections` ordinary Connections plus one overflow slot.
The next socket at capacity **MUST** synchronously gate future acceptance, emit only that overflow Connection,
then Direct Close it in the first microtask after its handoff barrier. Overflow **MUST** stop the source normally;
if readiness is still unsettled, `listen()` **MUST** reject `AbortError`.

## 5. Connection messages and sends

**WS-MESSAGE-001 — Binary ordered messages.** One complete binary WebSocket message **MUST** become one complete
`Uint8Array` notification. Notifications **MUST** preserve native message order and provide the same byte-object
identity to all observers. The Adapter **MUST NOT** mutate or reuse emitted storage. A text message or unsupported
native payload **MUST** error `message$` and terminate that Connection.

**WS-MESSAGE-002 — Earliest inbound limits.** The Adapter **MUST** inspect the complete native message payload length before a
second copy or `Blob.arrayBuffer()`. A message larger than `maxMessageBytes`, or an asynchronous conversion queue
that would exceed `maxQueuedMessages` or `maxQueuedBytes`, **MUST** fail the Connection without converting or
emitting the offending message. Node factories **MUST** also set `ws` `maxPayload` to `maxMessageBytes` so the
library can reject oversized and decompressed payloads before handoff. The Node Connector **MUST** disable
per-message compression. The Node Acceptor **MUST** default it off; when an application enables it, the same
`maxPayload` **MUST** still bound decompressed messages.

**WS-SEND-001 — Local Admission and pressure.** `send()` **MUST** reject non-`Uint8Array` or oversized input and
terminate the Connection. Otherwise it **MUST** call native `send` only while the socket is open and the bounded
native queue has one message/byte slot. Temporary pressure **MUST** keep that send pending without copying,
dropping, overwriting, or reordering. It **MUST** fulfill immediately after native `send` returns successfully.

**WS-SEND-002 — Concurrent send violation.** The remote Transport seam permits only one unsettled `send()`.
If a second `send()` occurs while one is pressure-blocked, both operations **MUST** reject with the same `Error`,
`message$` **MUST** error with that object, and the Connection **MUST** terminate. This prevents a nonconforming
owner from creating ambiguous order.

## 6. Terminal and Direct Close

**WS-TERM-001 — Native terminal mapping.** A locally requested terminal, or remote close code `1000` or `1001`,
**MUST** complete `message$`. A native error or any other remote close code **MUST** error it with one final
`Error`. No message may follow terminal. Listener and sibling Connections remain independent.

**WS-CLOSE-001 — Direct Close.** The first `close()` **MUST** synchronously prevent later sends and reject an
unsettled send, then invoke native `terminate()` when available or WebSocket `close()` otherwise. Repeated calls
**MUST** return the exact same Promise. It **MUST** settle after native terminal and `message$` terminal, and
**MUST NOT** wait for an RPC acknowledgement, remote business work, or listener shutdown.

## 7. Security boundary

**WS-SEC-001 — No structural security claim.** These factories **MUST NOT** infer secure Recovery from the
Adapter shape. `ws:` is plaintext. A `wss:` deployment may satisfy confidentiality, ordered
integrity/anti-replay, and authentication of the expected responder endpoint only when the application
independently validates its TLS endpoint and trust policy. The Adapter exposes no `isSecure` flag or credentials
through the core Transport seam. Ordinary server-authenticated `wss:` authenticates the responder, not the
initiating application. A deployment accepting untrusted inbound sockets **MUST** authenticate and admit the
initiator before handing the resulting Connection to an RPC Acceptor and enforce per-principal connection,
Session, request-rate, and handler-duration limits outside this Adapter.

## 8. Stable package compatibility

**RPC-RELEASE-005 — Independent Adapter release.** The stable package **MUST** depend on the compatible
`@husky-di/remote` major and import only its public root, Transport, and conformance entry points. It **MUST**
run both matching shared Adapter conformance runners in addition to this platform-specific admission, framing,
limit, and security suite. The packed ESM and CJS entry points **MUST**
remain closed to private deep imports and
include this specification, README, CHANGELOG, and LICENSE. Release documentation **MUST** describe the finite
message and queue limits, Node `ws` `maxPayload` enforcement, and the application's secure-deployment duties.

## 9. Traceability

The matching `tests/specification.test.ts` suite **MUST** label every test with one or more requirement IDs and
exercise both controlled platform-boundary sockets and real Node `ws` integration. Public behavior is not
complete unless this specification and its matching tests change together.

| Core requirement | WebSocket clauses and evidence |
| --- | --- |
| `RPC-TRANSPORT-001` | `WS-CONNECT-001`, `WS-ACCEPT-001`, `WS-MESSAGE-001`, shared runners |
| `RPC-TRANSPORT-002` | `WS-MESSAGE-001`, shared runners |
| `RPC-TRANSPORT-003` | `WS-CONNECT-002`, `WS-CONNECT-003`, `WS-MESSAGE-001`, `WS-SEND-001`, `WS-TERM-001`, shared runners |
| `RPC-TRANSPORT-004` | `WS-CONNECT-001`, `WS-ACCEPT-001`, shared runners |
| `RPC-TRANSPORT-005` | `WS-SEND-001`, `WS-SEND-002`, shared runners |
| `RPC-TRANSPORT-006` | `WS-MESSAGE-002`, `WS-SEND-001`, shared runners |
| `RPC-TRANSPORT-007` | `WS-CLOSE-001`, shared runners |
| `RPC-TRANSPORT-010` | `WS-LIMIT-001`, `WS-MESSAGE-002`, `WS-ACCEPT-002`, platform tests |
| `RPC-TRANSPORT-012` | `WS-SEC-001`, packaged deployment documentation, platform security-boundary test |
