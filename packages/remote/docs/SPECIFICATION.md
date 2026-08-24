# Husky DI Remote RPC Specification

**Version:** 1.0.0  
**Status:** Normative
**Profile:** `husky-di-rpc/1`

## 1. Scope

This specification defines the v1 contract of `@husky-di/remote`: a bidirectional mixed unary and Observable
stream RPC Framework,
its caller-facing TypeScript API, its replaceable Protocol and Transport Adapter seams, and the built-in
recoverable JSON Protocol profile. It also defines the evidence required to claim conformance.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, and **MAY** are interpreted as described in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). A normative statement appears only in a paragraph carrying
a stable requirement identifier such as `RPC-CALL-004`. TypeScript shown in this document is normative for
observable shape; helper types used only to express inference may remain unexported.

v1 supports bidirectional unary calls, stream methods, and readonly stream properties. Notifications, input
streaming, automatic Container integration, business
authentication/authorization/rate limiting, middleware that rewrites calls, cross-process persistent Session
Recovery, and exactly-once external side effects are outside this specification.

## 2. Terms and invariants

- **Framework**: the caller-facing owner, peer, registry, value-normalization, handler-scheduling, event, and
  cleanup implementation supplied by `@husky-di/remote`.
- **Protocol**: the replaceable semantic engine behind `IRpcProtocol`. The built-in Protocol implements
  `husky-di-rpc/1`.
- **Transport Adapter**: a component that creates finite Physical Connections and owns framing and native
  queue limits.
- **Physical Connection**: one finite, ordered, full-duplex message channel.
- **Topology Owner**: an `IRpcConnector` or `IRpcAcceptor`.
- **Logical Session**: retained Protocol state that can outlive a Physical Connection and backs one stable
  `IRpcPeer`.
- **Session Incarnation**: one retained lifetime of a Logical Session. It ends when retained state terminates
  or is lost.
- **Pending Invocation**: a locally queued invocation that has no Call Identity and has not reached Outgoing
  Admission.
- **Logical Call**: an invocation that has crossed Outgoing Admission and owns a stable Session-scoped identity.
- **Remote Request Admission**: the atomic receiver transition that durably creates an in-progress call and
  permits handler dispatch.
- **Remote Resource Rejection**: a durable `unavailable` terminal that guarantees no handler dispatch.
- **Message Receipt ACK**: a cumulative acknowledgement that a sequenced message has a durable idempotent
  disposition; it is not proof that a handler or external side effect completed.
- **Recovery**: rebinding a retained Logical Session to a replacement Physical Connection after continuity is
  authenticated.
- **Local Admission**: successful return from `IRpcConnection.send()`; it is not proof of remote receipt.
- **Direct Close**: `IRpcConnection.close()`; it is distinct from the Protocol's graceful Session-close record.
- **Definite Non-Execution**: evidence that the remote handler did not and cannot execute for that invocation.
- **Outcome Unknown**: the handler may have executed, but no authoritative terminal outcome remains provable.

**RPC-BASE-001 — Scope of guarantees.** Session-scoped at-most-once handler dispatch **MUST** be promised only
while the same retained Session Incarnation, call ledger, sequence continuity, and single current binding are
provable. Loss of that evidence **MUST NOT** be described as exactly-once or transparently retried under a new
Call Identity.
<!-- /RPC-BASE-001 -->

**RPC-BASE-003 — Deep boundaries.** The public Protocol seam **MUST** be semantic and role-specific. Default
Codec, Handshake, proof, ACK, sequence, replay, call-ledger, and scheduler modules **MUST NOT** become public
extension points merely because the built-in Protocol contains them.
<!-- /RPC-BASE-003 -->

## 3. Package contract

The first stable release is `@husky-di/remote@1.0.0`.

**RPC-PKG-001 — Code entry points.** The package **MUST** publish these typed entry points with matching ESM
`import`, CJS `require`, and `.d.ts` conditions:

| Entry point | Contract |
| --- | --- |
| `@husky-di/remote` | Caller API, built-in Protocol factory, and caller-required structural Protocol/Transport types |
| `@husky-di/remote/protocol` | Built-in Protocol factory and complete third-party Protocol implementor SPI |
| `@husky-di/remote/transport` | Physical Connection and role-specific Adapter seams |
| `@husky-di/remote/conformance` | Framework-neutral Protocol and Adapter conformance runners |
<!-- /RPC-PKG-001 -->

**RPC-PKG-002 — Single identity.** A symbol re-exported from the root and a specialist subpath **MUST** resolve
to the same declaration and runtime value. The package **MUST NOT** create parallel nominal identities.
<!-- /RPC-PKG-002 -->

**RPC-PKG-003 — Private default.** Omitting `options.protocol` **MUST** select the package's built-in Protocol.
The root and implementor entries **MAY** expose the same `createRpcProtocol()` runtime identity so an independent
provider package can delegate to the same immutable implementation. The package **MUST NOT** export a
`defaultRpcProtocol` value, concrete
Protocol implementation class, or public default Codec, Handshake, proof, ledger, or scheduler type.
<!-- /RPC-PKG-003 -->

**RPC-PKG-004 — Wire assets.** The package **MUST** publish readable `husky-di-rpc/1` schema, raw vectors,
stateful transcripts, and security vectors through the closed exports
`./wire/husky-di-rpc-1/schema`, `./vectors`, `./transcripts`, and `./security-vectors`. It **MUST NOT** use a
wildcard that can expose future private files.
<!-- /RPC-PKG-004 -->

**RPC-PKG-005 — Manifest.** The published manifest **MUST** declare `type: "module"`, public access,
`engines.node: ">=23.6"`, source maps, and `sideEffects: false`. Runtime dependencies **MUST** be limited to
`@husky-di/core`, `rxjs`, and `zod`; the packed manifest **MUST NOT** contain `workspace:*`, a test framework,
`ws`, or a Node-only polyfill.
<!-- /RPC-PKG-005 -->

**RPC-PKG-006 — Artifact.** The packed tarball **MUST** contain only declared build output, normative wire
assets, the architecture source and rendered diagram, declared package documentation, README, CHANGELOG,
LICENSE, and package metadata. Every public subpath
**MUST** resolve from the installed tarball without workspace source or examples.
<!-- /RPC-PKG-006 -->

**RPC-PKG-010 — Exact root manifest.** The installed root runtime namespace **MUST** contain exactly the eighteen
values listed by RPC-PKG-007. Its declaration entry **MUST** additionally contain exactly these thirty type-only
symbols: `CreateRpcConnectorReconnectionOptions`, `IRemoteServiceDescriptor`, `IRpcAcceptor`,
`IRpcAcceptorAdapter`, `IRpcApplicationRecord`, `IRpcConnection`, `IRpcConnector`, `IRpcConnectorAdapter`,
`IRpcConnectorReconnection`, `IRpcPeer`, `IRpcProtocol`, `IRpcProtocolRuntimePolicy`,
`RpcAcceptorListenerState`, `RpcAcceptorOptions`, `RpcAcceptorRuntimePolicyOptions`, `RpcAcceptorState`,
`RpcApplicationValue`, `RpcCallFailure`, `RpcConnectorAdapterFactory`, `RpcConnectorConnectOptions`,
`RpcConnectorOptions`, `RpcConnectorReconnectionEvent`, `RpcConnectorReconnectionPolicyOptions`,
`RpcConnectorReconnectionState`, `RpcConnectorRuntimePolicyOptions`, `RpcConnectorState`, `RpcEvent`,
`RpcPeerState`, `RpcProtocolFaultReason`, and `RpcSessionCloseReason`.
<!-- /RPC-PKG-010 -->

**RPC-PKG-011 — Exact Protocol manifest.** The installed `/protocol` runtime namespace **MUST** contain exactly
the six values listed by RPC-PKG-008. Its declaration entry **MUST** contain exactly these fifty-one type-only
symbols: `IRpcApplicationArgumentsSnapshot`, `IRpcApplicationRecord`, `IRpcApplicationSnapshot`,
`IRpcConnection`, `IRpcProtocol`, `IRpcProtocolAcceptorHost`, `IRpcProtocolAcceptorRuntime`,
`IRpcProtocolConnectorHost`, `IRpcProtocolConnectorRuntime`, `IRpcProtocolHost`, `IRpcProtocolIncomingCall`,
`IRpcProtocolIncomingCallRequest`, `IRpcProtocolIncomingCallReservation`,
`IRpcProtocolIncomingHandlerCall`, `IRpcProtocolIncomingSourceReservation`, `IRpcProtocolIncomingStream`,
`IRpcProtocolIncomingUnknownStreamReservation`, `IRpcProtocolInvocation`, `IRpcProtocolInvocationRequest`,
`IRpcProtocolInvocationReservation`, `IRpcProtocolInvocationSink`, `IRpcProtocolProjection`,
`IRpcProtocolRoleRuntime`, `IRpcProtocolRuntimePolicy`, `IRpcProtocolSession`, `IRpcProtocolSessionHost`,
`IRpcProtocolSourceEmissionReservation`, `IRpcProtocolSourceSink`, `IRpcProtocolStream`,
`IRpcProtocolStreamReservation`, `IRpcProtocolSubscriberSink`, `IRpcRetainedBytesReservation`,
`RpcApplicationValue`, `RpcCallFailure`, `RpcCallOutcome`, `RpcHandlerOutcome`, `RpcIncomingFailure`,
`RpcIncomingStreamTerminal`, `RpcIncomingTerminal`, `RpcProtocolFaultReason`,
`RpcProtocolIncomingCallReservation`, `RpcProtocolIncomingStreamReservation`, `RpcProtocolSessionTransition`,
`RpcProtocolSessionTransitionCloseReason`, `RpcProtocolStreamRequest`, `RpcSessionCloseReason`,
`RpcSourceTerminal`, `RpcStreamFailure`, `RpcStreamItemEffect`, `RpcStreamOutcome`, and
`RpcUnknownCallFailure`.
<!-- /RPC-PKG-011 -->

**RPC-PKG-012 — Exact Transport manifest.** The installed `/transport` namespace **MUST** have zero runtime
exports and exactly the three type-only exports `IRpcAcceptorAdapter`, `IRpcConnectorAdapter`, and
`IRpcConnection`.
<!-- /RPC-PKG-012 -->

**RPC-PKG-013 — Exact JSON subpaths.** The installed package **MUST** expose exactly the four JSON subpaths
declared by RPC-PKG-004. Each **MUST** resolve, parse, and match the corresponding nonpublic corpus-manifest
SHA-256; no fifth corpus or manifest subpath may resolve.
<!-- /RPC-PKG-013 -->

**RPC-PKG-014 — Exact Conformance manifest.** The installed `/conformance` runtime namespace **MUST** have
exactly four exports: `RpcConformanceStatusEnum`, `runRpcAcceptorAdapterConformance`,
`runRpcConnectorAdapterConformance`, and `runRpcProtocolConformance`. Its declaration entry **MUST** have
exactly the eight type-only exports listed by RPC-PKG-009.
<!-- /RPC-PKG-014 -->

**RPC-PKG-015 — Helper-export exclusion.** This requirement owns only the absence of private descriptor helpers,
mapped facade helpers, implementation classes, private built-in Protocol/Codec values, and private deep paths.
The four positive module inventories are owned exclusively by RPC-PKG-010 through RPC-PKG-014.
<!-- /RPC-PKG-015 -->

## 4. Common application value model

```typescript
export type RpcApplicationValue =
  | null
  | boolean
  | string
  | number
  | readonly RpcApplicationValue[]
  | IRpcApplicationRecord;

export interface IRpcApplicationRecord {
  readonly [key: string]: RpcApplicationValue;
}
```

**RPC-VALUE-007 — Common Application Value domain.** Unary arguments and successful results, stream method
arguments, and stream items **MUST** normalize to the same detached JSON data tree containing only `null`,
booleans, strings, finite IEEE-754 binary64 numbers, dense
arrays, and plain records. A sender **MUST** reject `undefined`, `bigint`, symbols, functions, accessors, symbol
keys, array holes, cycles, `Date`, `Map`, `Set`, class instances, typed arrays, `NaN`, infinities, and `-0` with an
asynchronous `TypeError` before Pending work or wire identity is created. The public Application Value domain
**MUST NOT** expose wire record, sequence, credit, receipt, or transport details.
<!-- /RPC-VALUE-007 -->

**RPC-VALUE-002 — Safe inspection.** Normalization **MUST** inspect only own enumerable string-named data
properties of records whose prototype is `Object.prototype` or `null`. It **MUST NOT** call a getter, coercion,
or `toJSON`. It **MUST** inspect arrays and records through own-key and property-descriptor meta-operations,
reject every own accessor and symbol key, ignore non-enumerable data properties, and reject array holes or
non-index array properties. A Proxy is outside the Application Value contract: its meta-operation traps may be
invoked and have side effects, but every trap result **MUST** still be revalidated and a trap throw **MUST**
surface as `TypeError`. The retained snapshot **MUST** be detached and immutable.
<!-- /RPC-VALUE-002 -->

**RPC-VALUE-003 — Common profile.** A custom Protocol **MUST NOT** enlarge or reinterpret this caller-visible
value domain. TypeScript types **MUST NOT** claim that an arbitrary domain interface statically proves runtime
wire validity.
<!-- /RPC-VALUE-003 -->

**RPC-VALUE-008 — Common value hard limits.** Every normalized unary argument/result and stream argument/item
**MUST** satisfy the same limits below; bytes mean UTF-8 bytes and root depth is one. No public call or stream
root and no custom Protocol **MAY** enlarge this Application Value allowance:

| Dimension | Hard limit |
| --- | ---: |
| One arguments/result/item compact-JSON budget weight | `1,000,000 B` |
| One Application Value depth | `64` |
| One decoded string | `524,288 B` |
| One object member name | `256 B` |
| Members in one object | `1,024` |
| Elements in one array | `8,192` |
| JSON nodes in one Application Value | `65,536` |

Every primitive, array, and record counts as one node; member names do not. Root depth is one. A shared but
acyclic object reference **MAY** appear more than once and **MUST** be expanded into an independent detached
subtree at each occurrence; an ancestor cycle **MUST** be rejected. Application strings and member names
**MUST NOT** contain an unpaired UTF-16 surrogate.
<!-- /RPC-VALUE-008 -->

**RPC-VALUE-005 — Deterministic weight.** Compact-JSON budget weight **MUST** use UTF-8 length with no
whitespace, the ECMAScript JSON number serialization adopted by RFC 8785 JCS, and the minimum required JSON
string escaping. It is not a globally shortest alternate number grammar: for example `1e20` has the same
21-byte decimal spelling as `JSON.stringify(1e20)`, and `1e21` retains the JCS `1e+21` spelling. Member order
**MUST NOT** change the weight. A sender **MUST** validate value shape and weight before retaining caller-owned
data, allocating a Call Identity, or committing a handler terminal.
<!-- /RPC-VALUE-005 -->

**RPC-VALUE-006 — Semantic equality.** Normalized equality **MUST** compare null/boolean/string and binary64
number value, preserve array order, and compare records by decoded member-name set plus recursive values while
ignoring member order, escape spelling, insertion order, prototype, and object identity. It **MUST NOT** compare
encoded bytes.
<!-- /RPC-VALUE-006 -->

## 5. Remote Service Descriptor

The public factory has this shape; the emitted conditional types enforce the member-specific constraints below:

```typescript
type RpcMemberDefinition =
  | { readonly kind: "unary" }
  | { readonly kind: "unary"; readonly cancelable: true }
  | { readonly kind: "stream-method" }
  | { readonly kind: "stream-property" };

type RpcMemberDefinitions<T> = Partial<{
  readonly [K in Exclude<Extract<keyof T, string>, "then">]: RpcMemberDefinition;
}>;

export function createRemoteServiceDescriptor<
  T,
  const Definitions extends RpcMemberDefinitions<T>,
>(
  serviceIdentifier: ServiceIdentifier<T>,
  options: {
    readonly wireName: string;
    readonly members: Definitions &
      ValidateMemberDefinitions<T, Definitions> &
      NonEmptyMemberDefinitions<Definitions>;
  },
): IRemoteServiceDescriptor<T, Definitions>;
```

`Definitions` is inferred as a non-empty exact allowlist whose keys select unary methods, stream methods, or
readonly `$` stream properties of `T`. A Descriptor may combine all three interaction kinds.

**RPC-DESC-001 — Identity.** A Descriptor **MUST** be opaque and invariant in both service and definition type
parameters. It **MUST** retain the original `ServiceIdentifier` only for local exposure lookup and a separate,
explicit, non-empty `wireName` only for wire identity. ServiceIdentifier metadata, a global registry, package
module identity, and Descriptor object identity **MUST NOT** participate in wire routing.
<!-- /RPC-DESC-001 -->

The legacy `RPC-DESC-002` `methods` allowlist is retired by the immutable evidence ledger. It is not an active
normative requirement.

**RPC-DESC-005 — Cleanup.** Exposure cleanup **MUST** be synchronous, idempotent, and non-throwing. Removing an
exposure **MUST NOT** alter an already admitted call, which uses its captured route.
<!-- /RPC-DESC-005 -->

**RPC-DESC-006 — Mixed member allowlist.** `members` **MUST** be a non-empty, explicit, exact allowlist. Each
selected member definition **MUST** be exactly one of `{ kind: "unary" }`,
`{ kind: "unary", cancelable: true }`, `{ kind: "stream-method" }`, or
`{ kind: "stream-property" }`. One Descriptor **MAY** mix all four interactions. The legacy `methods` option,
boolean shorthand, extra fields, symbols, accessors, empty names, and `then` **MUST** be rejected rather than
treated as aliases or compatibility syntax. The outer options record **MUST** itself contain exactly the own,
enumerable data properties `wireName` and `members`; validation **MUST NOT** invoke an accessor on that record.
<!-- /RPC-DESC-006 -->

**RPC-DESC-007 — Direct stream method result.** A member selected as `stream-method` **MUST** have a raw local
return type of `Observable<Item>`, and its remote facade member **MUST** return `Observable<Item>` directly.
The Framework **MUST NOT** accept a non-Observable or `Promise<Observable<Item>>` signature and **MUST NOT**
wrap a valid stream in a Promise. Calling the facade method creates only a cold observation value; subscription
owns the work.
<!-- /RPC-DESC-007 -->

**RPC-DESC-008 — Exposure capture and stream-property admission.** Exposure **MUST** capture each selected unary
or stream-method data function together with the implementation object used as its receiver. Replacing the
function after exposure **MUST NOT** change the installed route. A stream-property Observable data value
**MUST** likewise be captured at exposure. A selected readonly getter **MUST** instead be captured with its
receiver and invoked exactly once for each incoming Admission, so separate subscriptions **MAY** obtain distinct
Observable sources. Replacing the getter after exposure **MUST NOT** change that rule.
<!-- /RPC-DESC-008 -->

**RPC-DESC-009 — Exact namespace and route linearization.** Wire service and member names **MUST** be non-empty
strings compared by exact Unicode code-point sequence without normalization or case folding. `then` **MUST**
remain reserved at the type, runtime, and wire layers. `expose()` **MUST** validate the complete
Descriptor/implementation pair before atomically installing one route set; an invalid member or duplicate wire
name **MUST** synchronously throw `TypeError` without partial installation. One Acceptor Session's effective
namespace is the union of its peer-local registry and the Acceptor owner registry, and one wire name **MUST NOT**
occur in both. Owner exposure **MUST** prevalidate every current peer registry, peer exposure **MUST** prevalidate
the owner registry, and new peers **MUST** read the owner registry directly. Admission **MUST** capture one whole
route before cleanup can remove it. After cleanup, a later re-exposure of the same wire name **MAY** install a
new route, but the earlier Admission **MUST** continue on its old route and no Admission may combine old and new
route state.
<!-- /RPC-DESC-009 -->

**RPC-DESC-010 — Stream property shape.** A member selected as `stream-property` **MUST** be a required,
readonly, string-named property whose name ends in `$` and whose value is directly `Observable<Item>`.
Optional, mutable, non-`$`, non-Observable, method, and accessor definition shapes **MUST** be rejected. The
remote facade **MUST** expose the Observable as an enumerable data property and return the same Observable
identity for every read within that facade.
<!-- /RPC-DESC-010 -->

**RPC-DESC-011 — Stream argument capability boundary.** A `stream-method` parameter list **MUST NOT** contain
an `Observable`, `AbortSignal`, `PromiseLike`, `AsyncIterable`, or `ReadableStream` capability, including through
a union. Stream cancellation authority belongs only to Observable unsubscription; an AbortSignal parameter is
therefore invalid rather than a second cancellation channel.
<!-- /RPC-DESC-011 -->

**RPC-DESC-012 — Result and item capability boundary.** Unary results and stream items **MUST NOT** be `any`,
`never`, Promise-like values, nested Observables, AsyncIterables, or ReadableStreams. A unary Promise remains a
valid settlement mechanism only when its awaited result is an Application Value. A stream method or property
remains valid only when its direct Observable item type crosses the Application Value boundary rather than
carrying another asynchronous capability.
<!-- /RPC-DESC-012 -->

**RPC-DESC-013 — Read-only remote Observable.** A local stream source **MAY** use an `Observable` subtype such as
RxJS `Subject<T>`, but the resolved remote facade **MUST** narrow both stream methods and stream properties to
`Observable<T>`. Subscriber-side declarations **MUST NOT** expose source mutation methods such as `next()`,
`error()`, or `complete()`.
<!-- /RPC-DESC-013 -->

## 6. Caller-facing API

### 6.1 Errors, peers, and owners

```typescript
export enum RpcExceptionCodeEnum {
  canceled = "canceled",
  unavailable = "unavailable",
  outcomeUnknown = "outcome-unknown",
  handlerFailed = "handler-failed",
  unknownService = "unknown-service",
  unknownMember = "unknown-member",
  protocol = "protocol",
}

export type RpcCallFailure = Exclude<
  RpcExceptionCodeEnum,
  RpcExceptionCodeEnum.protocol
>;

export enum RpcCallStatusEnum {
  fulfilled = "fulfilled",
  rejected = "rejected",
  terminated = "terminated",
}

export class RpcException extends CodedException<RpcExceptionCodeEnum> {
  constructor(code: RpcExceptionCodeEnum, cause?: unknown);
  readonly cause?: unknown;
}

export interface IRpcPeer {
  readonly state: RpcPeerState;
  readonly state$: Observable<RpcPeerState>;
  expose<T, Definitions extends RpcMemberDefinitions<T>>(
    descriptor: IRemoteServiceDescriptor<T, Definitions>,
    implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
  ): Cleanup;
  resolve<T, Definitions extends RpcMemberDefinitions<T>>(
    descriptor: IRemoteServiceDescriptor<T, Definitions>,
  ): RemoteService<T, Definitions>;
}

export interface IRpcConnector {
  readonly state: RpcConnectorState;
  readonly state$: Observable<RpcConnectorState>;
  readonly event$: Observable<RpcEvent>;
  readonly peer: IRpcPeer;
  connect(options: RpcConnectorConnectOptions): Promise<void>;
  shutdown(): Promise<void>;
  close(): Promise<void>;
}

export interface IRpcAcceptor {
  readonly state: RpcAcceptorState;
  readonly state$: Observable<RpcAcceptorState>;
  readonly peers: readonly IRpcPeer[];
  readonly peers$: Observable<readonly IRpcPeer[]>;
  readonly event$: Observable<RpcEvent>;
  expose<T, Definitions extends RpcMemberDefinitions<T>>(
    descriptor: IRemoteServiceDescriptor<T, Definitions>,
    implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
  ): Cleanup;
  listen(adapter: IRpcAcceptorAdapter): Promise<void>;
  shutdown(): Promise<void>;
  close(): Promise<void>;
}

export type RpcAcceptorRuntimePolicyOptions = {
  readonly [K in keyof IRpcProtocolRuntimePolicy]?: IRpcProtocolRuntimePolicy[K];
};

export type RpcConnectorRuntimePolicyOptions = Pick<
  RpcAcceptorRuntimePolicyOptions,
  | "maxApplicationWorkPerSession"
  | "maxActiveStreamsPerSession"
  | "maxRetainedBytesPerSession"
  | "maxHandlersPerSession"
  | "ackDelayMs"
  | "activityProbeIntervalMs"
  | "silenceTimeoutMs"
  | "sendProgressTimeoutMs"
  | "bindingAttemptTimeoutMs"
  | "recoveryGraceMs"
  | "shutdownDeadlineMs"
>;

export type RpcConnectorOptions = {
  readonly protocol?: IRpcProtocol;
  readonly runtimePolicy?: RpcConnectorRuntimePolicyOptions;
};

export type RpcConnectorConnectOptions = {
  readonly adapter: IRpcConnectorAdapter;
  readonly signal?: AbortSignal;
};

export type RpcAcceptorOptions = {
  readonly protocol?: IRpcProtocol;
  readonly runtimePolicy?: RpcAcceptorRuntimePolicyOptions;
};

export function createRpcConnector(options?: RpcConnectorOptions): IRpcConnector;
export function createRpcAcceptor(options?: RpcAcceptorOptions): IRpcAcceptor;
```

**RPC-API-001 — Factories.** Owner factories **MUST** synchronously snapshot and validate a closed options and
policy schema. Invalid values, unknown keys, non-positive/non-finite/non-safe-integer limits, or invalid
cross-field combinations **MUST** throw `TypeError` before an Owner exists. A custom Protocol construction throw
or invalid runtime **MUST** synchronously throw Framework `RpcException` with code `protocol` and may preserve only
the trusted local cause.
<!-- /RPC-API-001 -->

**RPC-API-002 — Stable peer.** A Connector **MUST** expose one stable `peer` before its first connection. An
Acceptor **MUST** create one stable peer per admitted fresh Session and keep that object through Recovery.
Resuming **MUST NOT** create a second peer or reset Session-scoped exposures and resolved facades.
<!-- /RPC-API-002 -->

**RPC-API-003 — State streams.** `state$` and `peers$` **MUST** be multicast, replay-latest Observables. Their
synchronous getter and most recently emitted value **MUST** be the same frozen object until the next committed
mutation. A final snapshot **MUST** be emitted before completion; these streams **MUST NOT** error.
<!-- /RPC-API-003 -->

**RPC-API-004 — Event stream.** `event$` **MUST** be hot, multicast, and non-replaying. It **MUST** emit the one
terminal topology event before completing and **MUST NOT** error. Subscriber failure **MUST NOT** roll back
Framework state or alter the current operation, although host-level RxJS error reporting may terminate the host
process.
<!-- /RPC-API-004 -->

**RPC-API-005 — Mutation batch.** Framework mutations **MUST** commit all related call sinks, peer/owner state,
membership, and durable observation data atomically before flushing notifications. Within the batch it **MUST**
emit call terminal observations before peer terminal observations, peer terminal observations before topology
terminal observation, and settle public Promises last.
<!-- /RPC-API-005 -->

**RPC-API-006 — Exposure gate.** `expose()` **MUST** synchronously throw `RpcException(unavailable)` when its peer is
draining/closed or its Owner is draining/closing/closed. A peer in `unbound`, `connecting`, `connected`, or
`recovering` **MAY** accept Session-scoped exposure. Owner-scoped Acceptor exposure applies to future and current
peers.
<!-- /RPC-API-006 -->

**RPC-API-007 — No group facade.** The installed public API **MUST NOT** expose `resolveAll`,
`RemoteServiceGroup`, or `RpcPeerResult`, whether directly or through an alias, compatibility shim, or replacement
group facade. Multi-peer work **MUST** be composed explicitly from `peers`, `peers$`, each peer's `resolve()`, and
application-selected JavaScript, Promise, or RxJS operators.
<!-- /RPC-API-007 -->

**RPC-API-008 — Explicit peer composition.** `IRpcAcceptor.peers` **MUST** be a frozen current snapshot,
`peers$` **MUST** replay the latest such snapshot, and each admitted Session **MUST** retain one stable peer object
through Recovery. Work started through different peers **MUST** remain independent child work. These primitives
**MUST NOT** imply a Framework-defined multi-peer eligibility, ordering, concurrency, cancellation, error, or
wait policy.
<!-- /RPC-API-008 -->

### 6.2 State unions

```typescript
export enum RpcStateStatusEnum {
  unbound = "unbound",
  connecting = "connecting",
  connected = "connected",
  draining = "draining",
  recovering = "recovering",
  closed = "closed",
  active = "active",
  closing = "closing",
  idle = "idle",
  starting = "starting",
  listening = "listening",
  monitoring = "monitoring",
  reconnecting = "reconnecting",
  waiting = "waiting",
  stopped = "stopped",
}

export enum RpcCloseOutcomeEnum {
  normal = "normal",
  failed = "failed",
}

export enum RpcAcceptorListenerStopReasonEnum {
  completed = "completed",
  resourcePressure = "resource-pressure",
}

export type RpcPeerState =
  | { readonly status: RpcStateStatusEnum.unbound }
  | { readonly status: RpcStateStatusEnum.connecting }
  | { readonly status: RpcStateStatusEnum.connected }
  | { readonly status: RpcStateStatusEnum.draining; readonly reason: RpcCloseReasonEnum.gracefulShutdown | RpcCloseReasonEnum.counterExhaustion }
  | { readonly status: RpcStateStatusEnum.recovering }
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.normal; readonly reason:
      RpcCloseReasonEnum.gracefulShutdown | RpcCloseReasonEnum.forcedClose | RpcCloseReasonEnum.shutdownDeadline | RpcCloseReasonEnum.remoteTerminated }
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.failed; readonly reason:
      RpcCloseReasonEnum.recoveryExpired | RpcCloseReasonEnum.counterExhaustion; readonly error: RpcException & { readonly code: RpcExceptionCodeEnum.unavailable } }
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.failed; readonly reason:
      RpcCloseReasonEnum.continuityFailure | RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault;
      readonly error: RpcException & { readonly code: RpcExceptionCodeEnum.protocol } };

type RpcNormalSessionCloseReason =
  | RpcCloseReasonEnum.gracefulShutdown
  | RpcCloseReasonEnum.forcedClose
  | RpcCloseReasonEnum.shutdownDeadline
  | RpcCloseReasonEnum.remoteTerminated;

type RpcUnavailableSessionFailureReason =
  | RpcCloseReasonEnum.recoveryExpired
  | RpcCloseReasonEnum.counterExhaustion;

type RpcProtocolSessionFailureReason =
  | RpcCloseReasonEnum.continuityFailure
  | RpcCloseReasonEnum.protocolFault
  | RpcCloseReasonEnum.resourceFault;

type RpcConnectorClosedState =
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.normal;
      readonly reason: RpcNormalSessionCloseReason }
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.failed;
      readonly reason: RpcUnavailableSessionFailureReason;
      readonly error: RpcException & { readonly code: RpcExceptionCodeEnum.unavailable } }
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.failed;
      readonly reason: RpcProtocolSessionFailureReason;
      readonly error: RpcException & { readonly code: RpcExceptionCodeEnum.protocol } }
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.failed;
      readonly reason: RpcCloseReasonEnum.cleanupFailed; readonly error: Error };

export type RpcConnectorState =
  | { readonly status: RpcStateStatusEnum.active }
  | { readonly status: RpcStateStatusEnum.draining }
  | { readonly status: RpcStateStatusEnum.closing }
  | RpcConnectorClosedState;

export type RpcAcceptorListenerState =
  | { readonly status: RpcStateStatusEnum.idle }
  | { readonly status: RpcStateStatusEnum.starting }
  | { readonly status: RpcStateStatusEnum.listening }
  | { readonly status: RpcStateStatusEnum.stopped; readonly outcome: RpcCloseOutcomeEnum.normal;
      readonly reason: RpcAcceptorListenerStopReasonEnum.completed | RpcAcceptorListenerStopReasonEnum.resourcePressure }
  | { readonly status: RpcStateStatusEnum.stopped; readonly outcome: RpcCloseOutcomeEnum.failed; readonly error: Error };

type RpcAcceptorClosedState =
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.normal;
      readonly reason: RpcCloseReasonEnum.gracefulShutdown | RpcCloseReasonEnum.forcedClose | RpcCloseReasonEnum.shutdownDeadline }
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.failed;
      readonly reason: RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault;
      readonly error: RpcException & { readonly code: RpcExceptionCodeEnum.protocol } }
  | { readonly status: RpcStateStatusEnum.closed; readonly outcome: RpcCloseOutcomeEnum.failed;
      readonly reason: RpcCloseReasonEnum.cleanupFailed; readonly error: Error };

export type RpcAcceptorState =
  | { readonly status: RpcStateStatusEnum.active; readonly listener: RpcAcceptorListenerState }
  | { readonly status: RpcStateStatusEnum.draining }
  | { readonly status: RpcStateStatusEnum.closing }
  | RpcAcceptorClosedState;
```

**RPC-STATE-004 — Six-state peer.** A peer **MUST** follow
`unbound -> connecting -> connected <-> recovering -> draining? -> closed` subject to the transitions below.
Fresh bootstrap failure **MUST** permit `connecting -> unbound` without replacing the stable Connector peer;
`closed` **MUST** be sticky and terminal. A counter-draining Acceptor peer **MUST** remain in `peers` while active
but **MUST NOT** admit new application work. This state machine defines no Remote Service Group eligibility.
<!-- /RPC-STATE-004 -->

**RPC-STATE-002 — Error identity.** `recovery-expired` and `counter-exhaustion` **MUST** use
`RpcException(unavailable)`; `continuity-failure`, `protocol-fault`, and `resource-fault` **MUST** use
`RpcException(protocol)`. Connector topology state **MUST** reuse its unique peer's Error object. Acceptor peer
failure **MUST NOT** fail healthy siblings or the Owner.
<!-- /RPC-STATE-002 -->

**RPC-STATE-003 — Cleanup precedence.** Owner cleanup rejection or timeout **MUST** set only the Owner's final
reason to `cleanup-failed` with the same trusted Error or admission-ordered `AggregateError`. It **MUST NOT**
rewrite already terminal peer reasons.
<!-- /RPC-STATE-003 -->

### 6.3 Facades, calls, and cancellation

**RPC-CALL-010 — Single-peer facade shape.** `resolve()` **MUST** synchronously return a frozen,
null-prototype facade whose exact enumerable data members are the Descriptor selection. Every closure **MUST**
capture its peer and member rather than depend on facade `this`; member identities on one facade **MUST** remain
stable. The facade **MUST** expose `then === undefined`, and `await`, async return, and `Promise.resolve` **MUST
NOT** start RPC work.
<!-- /RPC-CALL-010 -->

**RPC-CALL-011 — State-neutral facade operations.** Resolving a facade, calling a stream method to obtain its
cold Observable, reading a stream property, and retaining any of those values **MUST NOT** start work or mutate
peer state. Those operations **MUST NOT** throw a state error merely because the peer is `recovering`, `draining`,
or `closed`; subscription and unary invocation have their own Admission contracts.
<!-- /RPC-CALL-011 -->

**RPC-CALL-002 — Remote cancellation slot.** A cancelable remote method **MUST** have a required final
`AbortSignal | undefined` argument. The caller **MUST** pass `undefined` to request no cancellation. Runtime
preflight **MUST** reject zero actual arguments before `pop`, treat the final actual `undefined` as control, and
otherwise validate a platform AbortSignal with captured platform intrinsics rather than `instanceof` or duck
typing. v1 **MUST NOT** reflectively validate business arity.
<!-- /RPC-CALL-002 -->

**RPC-CALL-012 — Signal race.** Runtime **MUST** read the initial aborted state with a captured platform getter,
then perform state/value/capacity preflight and commit Pending work, install one listener with captured
`EventTarget.prototype.addEventListener`, and re-read the getter to close the check-to-register race. It **MUST**
remove with the captured intrinsic and **MUST NOT** call shadowable instance methods.
<!-- /RPC-CALL-012 -->

**RPC-CALL-004 — Preflight order.** Invocation preflight **MUST** be: control shape, initially aborted, owner/peer
availability, Application Value snapshot, then capacity. Failure before capacity **MUST** create no Pending
Invocation, wire identity, child, or call event. Invalid signal/value **MUST** reject `TypeError`; initially
aborted **MUST** reject `RpcException(canceled)`; unavailable state/capacity **MUST** reject
`RpcException(unavailable)`.
<!-- /RPC-CALL-004 -->

**RPC-CALL-005 — Pending and admission.** A valid invocation **MUST** first become a retractable Pending
Invocation without `callId` or `seq`. Outgoing Admission **MUST** atomically allocate identity, retain the
semantic replay entry, and call `send()` for the first time in one non-awaiting step. Cancellation before that
point **MUST** prove non-execution and immediately unlink its Pending entry and payload storage; cancellation
afterward **MUST** be cooperative and **MUST NOT** rewrite a terminal winner.
<!-- /RPC-CALL-005 -->

**RPC-CALL-006 — Terminal winner.** Caller cancel, handler settlement, Protocol terminal, Session loss, and
Owner force **MUST** compete through one first-terminal-wins slot. Late messages **MAY** complete ACK/GC work but
**MUST NOT** change the public Promise or matching call-finished observation.
<!-- /RPC-CALL-006 -->

**RPC-CALL-013 — Execution-knowledge guarantees.** `unavailable` **MUST** mean Definite Non-Execution.
`outcome-unknown`
**MUST** be used only for an outgoing call that crossed Admission and then lost authoritative outcome evidence.
`canceled` **MUST NOT** imply rollback. After caller cancellation wins, a matching late Protocol terminal
**MUST** retire its retained evidence without faulting the Session.
<!-- /RPC-CALL-013 -->

**RPC-CALL-014 — Scoped semantic failures and diagnostic redaction.** Unknown service, unknown member, and handler
failure **MUST** remain call-scoped and **MUST NOT** fault an otherwise healthy Session or peer. The corresponding
public `RpcException` **MUST** expose only its fixed safe code and local generic detail. Remote messages, details,
stack, cause, service/member spellings, and thrown objects **MUST NOT** enter the caller-visible exception.
<!-- /RPC-CALL-014 -->

**RPC-CALL-008 — Handler scheduling.** Remote Request Admission **MUST** durably capture the exposure and queue a
handler job without dispatching inline. The Framework **MUST** acquire both Session and Owner permits before
calling the captured handler. Cancellation/force that wins while queued **MUST** prevent dispatch; a running
handler that ignores cancellation **MUST** continue occupying its finite permit until its real settlement, with
late result consumed but unable to change the selected terminal.
<!-- /RPC-CALL-008 -->

**RPC-CALL-015 — Public error object and code set.** `RpcException` **MUST** extend
`CodedException<RpcExceptionCodeEnum>` and
**MUST** expose a constructor accepting a code and optional cause. The package **MUST NOT** export its internal
construction factory. `code` **MUST** be its only stable branch field; inherited `detail` **MUST NOT** contain
remote data, and message text **MUST NOT** be normative. A trusted local Adapter/Protocol Error **MAY** be
retained as standard `cause`. Call events **MUST** copy only the safe code, never the Error object. The exact
public code set **MUST** be `canceled`, `unavailable`, `outcome-unknown`, `handler-failed`, `unknown-service`,
`unknown-member`, `overflow`, and `protocol`.
<!-- /RPC-CALL-015 -->

**RPC-STREAM-001 — Independent cold roots.** Every subscription to a remote service Observable **MUST** create
one independent Caller Stream Subscription root. The Framework **MUST NOT** implicitly share, cache, or replay
application items or one subscription's terminal state into another subscription, including when both subscribe
to the same retained Observable object. Creating or retaining that Observable **MUST NOT** reserve Protocol work;
each subscription **MUST** obtain its own outgoing stream reservation.
<!-- /RPC-STREAM-001 -->

**RPC-STREAM-002 — Subscriber admission order.** Each subscription **MUST** establish its local Subscriber, then
check Owner/peer/Session state, snapshot that subscription's ordinary arguments, reserve finite identity-free
Pending capacity, commit Local Stream Subscription Admission, and only then attempt Outgoing Stream Admission.
State rejection **MUST** precede argument inspection. Separate subscriptions to one Observable **MUST** take
separate snapshots. Unsubscription before Outgoing Admission **MUST** retract the Pending root, create no Stream
Identity or cancel record, and prove Definite Non-Execution.
<!-- /RPC-STREAM-002 -->

**RPC-STREAM-003 — Distinct stream lifetimes.** Caller observation, Logical Stream authority, Source
Subscription, terminal selection, Source Teardown, Source retirement, and Protocol evidence retirement **MUST**
remain distinct lifetimes. Ending an earlier lifetime **MUST NOT** claim that a later one has ended. Remote
service Observable subscriptions are owning work roots; state, membership, event, Connection, and message
Observables remain non-owning registrations.
<!-- /RPC-STREAM-003 -->

**RPC-STREAM-004 — Incoming reservation before route lookup.** After fixed-envelope, security, and sequence
validation, an incoming Stream Start **MUST** reserve its ordinary and protected convergence capacity before any
service or member route lookup. Reservation failure **MUST** produce a resource rejection without route
commitment; a successful reservation followed by a missing route **MUST** produce the corresponding semantic
rejection without changing it into a resource result.
<!-- /RPC-STREAM-004 -->

**RPC-STREAM-005 — Source Start Job.** Remote Stream Admission **MUST** enqueue one finite Source Start Job on
the existing Owner/per-Session permit scheduler; the Protocol receive stack **MUST NOT** execute a method, read a
getter, or subscribe to a source inline. A terminal that wins while the job is queued **MUST** remove it with zero
application acquisition and zero Source Subscription. A started job **MUST** acquire its captured source at most
once, invoke `subscribe()` at most once without retry, and release its scheduler permit after the synchronous
acquisition/subscribe phase rather than retaining the permit for the stream lifetime. `isObservable()` alone
**MUST NOT** qualify the returned subscription handle: if `subscribe()` returns before a terminal winner without
a structural `closed` boolean and callable `unsubscribe`, Framework **MUST** select `handler-failed`, release the
Source root exactly once, and **MUST NOT** leave the stream pending. A synchronous terminal winner remains
authoritative over a later invalid return.
<!-- /RPC-STREAM-005 -->

**RPC-STREAM-006 — Serialized observer effects.** Each Logical Stream **MUST** commit disposition and terminal
fencing before executing public Observer effects. Downstream `next`, `complete`, and `error` callbacks for that
stream **MUST** be serial and non-overlapping with maximum callback depth one. A terminal committed reentrantly
from an item callback **MUST** remain authoritative but defer its Observer effect until that callback returns;
terminal state **MUST** fence every later item or terminal effect.
<!-- /RPC-STREAM-006 -->

**RPC-STREAM-007 — Ordered first-terminal winner.** Items and the terminal boundary **MUST** be observed in their
committed order and all terminal candidates **MUST** compete through one first-winner slot. Source acquisition,
subscription, emission normalization, or source error failure **MUST** project only the fixed safe stream failure
codes. An application Observer callback throw **MUST NOT** roll back a committed item disposition, change the
terminal winner, or fault the Session. A Source completion or failure selected in the current synchronous
application callback frame **MUST** fence later callbacks immediately but defer Source teardown, release, and
`stream-finished` publication until that frame returns.
<!-- /RPC-STREAM-007 -->

**RPC-STREAM-008 — Unsubscription authority.** Explicit unsubscription **MUST** be the only caller-facing stream
cancel authority. Before Outgoing Admission it **MUST** retract the identity-free Pending root without a cancel
record and prove Definite Non-Execution. After Admission it **MUST** close only the local observation and issue
one cooperative cancel intent. Late or duplicate cancellation **MUST** perform convergence work only.
<!-- /RPC-STREAM-008 -->

**RPC-STREAM-009 — Immediate terminal fence.** The first committed stream terminal **MUST** immediately fence all
later item, terminal, source, and Observer effects for that Logical Stream. Terminal authority **MUST NOT** wait
for Observer notification, Source Teardown, a receipt, or evidence retirement.
<!-- /RPC-STREAM-009 -->

**RPC-STREAM-010 — Recovery continuity.** Recovery **MUST** preserve existing facade and Observable objects,
Logical Stream identity, side-local observations, Source Subscription, ordinals, credit, and any selected
terminal. It **MUST NOT** reacquire or resubscribe the application source. Permanent loss of retained authority
**MUST** converge through an authoritative terminal when known and otherwise `outcome-unknown`.
<!-- /RPC-STREAM-010 -->

**RPC-STREAM-011 — Independent explicit composition.** Application-composed child subscriptions **MUST** remain
independent. Unsubscribing an outer composition or emitting from child B during child A teardown **MUST NOT**
revive A, transfer its identity, or create former Remote Service Group atomicity.
<!-- /RPC-STREAM-011 -->

**RPC-STREAM-012 — One-shot Source Teardown.** Framework-triggered Source Teardown **MUST** be attempted at most
once for a Source Subscription, including under reentrant, duplicate, Recovery, and force convergence paths.
<!-- /RPC-STREAM-012 -->

**RPC-STREAM-013 — Truthful release receipt.** `onReleased` **MUST** run only after the real one-shot Source
Teardown attempt has returned or thrown. A selected terminal or sent terminal record alone **MUST NOT** fabricate
this release receipt.
<!-- /RPC-STREAM-013 -->

**RPC-STREAM-014 — Source retirement after release.** Source ownership **MUST** remain part of drain and force
accounting until `onReleased` is committed. Only then may the Framework retire the Source Subscription lifetime;
Protocol receipt or replay evidence may still remain independently.
<!-- /RPC-STREAM-014 -->

**RPC-STREAM-015 — Application-reference retirement.** After synchronous Source acquisition and `subscribe()`
settle, retained Framework and Protocol stream evidence **MUST NOT** retain normalized arguments, the captured
route, its implementation receiver, or the temporary Observable. An active Source lifetime **MAY** retain only
the Source Subscription handle and bounded Framework metadata needed for terminal, teardown, and Recovery.
<!-- /RPC-STREAM-015 -->

### 6.4 Events and telemetry

**RPC-EVENT-008 — Observable ownership by seam.** Each subscription to a remote service Observable **MUST**
create and own one independent Application Stream root from Local Stream Subscription Admission until terminal
projection or unsubscribe convergence; merely creating its facade or cold Observable **MUST** remain
state-neutral. Subscriptions to Framework observation streams (`state$`, `peers$`, and `event$`) and Transport
observation streams (`connection$` and `message$`) **MUST NOT** create, start, stop, or own a Transport,
Session, listener, handler, or remote Application Stream.
<!-- /RPC-EVENT-008 -->

**RPC-EVENT-009 — Side-local stream pair.** Every qualifying side-local Application Stream observation **MUST**
emit exactly one payload-free `stream-started` and one matching `stream-finished` with one local-only
`observationId`. Outgoing qualification occurs at Local Stream Subscription Admission before identity or wire
effects; known incoming qualification occurs at Remote Stream Admission before Source Start Job dispatch.
Pre-admission local/resource rejection **MUST NOT** create the corresponding side-local pair. A committed
terminal winner **MUST** publish outgoing finished before its Observer terminal effect; successful Recovery
**MUST NOT** replace the pair or observation identity.
<!-- /RPC-EVENT-009 -->

**RPC-EVENT-010 — Closed stream vocabulary.** Call and stream observations **MUST** share the neutral
`RpcEventDirectionEnum { incoming, outgoing }`; the call-only `RpcCallDirectionEnum` name **MUST NOT** remain
public. `RpcEventTypeEnum` **MUST** include `stream-started` and `stream-finished`, and
`RpcStreamStatusEnum` **MUST** be exactly `completed | canceled | failed | terminated`. The exported `RpcEvent`
union **MUST** preserve direction-specific stream outcome, code, count, canonical metadata, and optional
Source-only teardown-failure correlations when narrowed.
<!-- /RPC-EVENT-010 -->

**RPC-EVENT-011 — Outgoing delivered count.** An outgoing `stream-finished.deliveredItemCount` **MUST** count
exactly the item dispositions committed for deliver-once Observer effect before the authoritative terminal
boundary. Suppressed, overflow-causing, unadmitted, or post-terminal items **MUST NOT** increment it. A committed
item whose Observer callback reentrantly selects the terminal **MUST** be counted before the finished snapshot
is published, and the count **MUST** saturate at `Number.MAX_SAFE_INTEGER`.
<!-- /RPC-EVENT-011 -->

**RPC-EVENT-012 — Safe bounded observations.** Stream events **MUST NOT** contain an application payload, raw
Error, wire identity, item ordinal, proof, attacker-supplied spelling, or other Protocol evidence. Their public
metadata **MUST** come only from locally canonical Descriptor state. Every duration and item count **MUST** be a
non-negative safe integer, saturating at `Number.MAX_SAFE_INTEGER`; a non-finite clock observation **MUST**
produce zero rather than escape the closed event vocabulary.
<!-- /RPC-EVENT-012 -->

**RPC-EVENT-013 — Serialized event delivery.** Each Owner **MUST** deliver committed `RpcEvent` snapshots through
one bounded, serialized, non-reentrant FIFO outside its mutation gate. A subscriber callback that reenters the
Owner **MAY** enqueue later events, but those events **MUST NOT** interrupt the current multicast broadcast: every
subscriber still registered for the current event **MUST** receive it before any subscriber receives the queued
event. Framework event callback depth **MUST** remain at most one, and queued delivery **MUST** preserve commit
order through `topology-closed` and `event$` completion.
<!-- /RPC-EVENT-013 -->

**RPC-EVENT-014 — Publication generation authority.** State and membership snapshots **MUST** commit before a
related revocable lifecycle event is published. After each subscriber-visible publication seam, the Owner
**MUST** recheck that the same Session, peer state, owner phase, and publication generation still authorize that
event. Reentrant Recovery, shutdown, force, or cleanup **MUST** revoke stale `peer-opened`, `peer-recovering`,
`peer-recovered`, `peer-draining`, and owner phase events; no state or lifecycle event **MUST** be written after a
newer terminal generation has committed.
<!-- /RPC-EVENT-014 -->

**RPC-EVENT-015 — Incoming admitted count.** A known incoming stream's `admittedItemCount` **MUST** count exactly
the Item Admissions whose Protocol disposition committed before its authoritative terminal boundary. The count
**MUST** saturate at `Number.MAX_SAFE_INTEGER`. If an Item Admission commit reenters terminal selection, finished
event publication and Source release **MUST** wait until that commit's disposition is known so the terminal count
cannot observe an earlier value.
<!-- /RPC-EVENT-015 -->

**RPC-EVENT-016 — Overflow emission is not an item.** Source emission capacity **MUST** be reserved before the
Framework normalizes or otherwise inspects the raw emitted value. If ordinary item backing is unavailable, the
Protocol **MUST** select `overflow` without admitting or retaining that emission. The causing emission **MUST NOT**
increment either direction's item count, and the incoming `stream-finished` event **MUST** report only items whose
Item Admission committed before the terminal boundary.
<!-- /RPC-EVENT-016 -->

**RPC-EVENT-017 — Duration cutoff.** Stream `durationMs` **MUST** be the floored, non-negative safe-integer
difference between side-local started commit and the first authoritative local finish/outcome commit. Event FIFO
delay, event callbacks, Observer terminal effects, Source teardown, and release callbacks **MUST NOT** extend that
duration. Values above `Number.MAX_SAFE_INTEGER` **MUST** saturate at that bound.
<!-- /RPC-EVENT-017 -->

**RPC-EVENT-018 — Source finish waits for teardown.** A known incoming `stream-finished` **MUST NOT** publish
until the one-shot local Source teardown attempt has returned or thrown, including a synchronous terminal selected
before `subscribe()` returns its Subscription. `onReleased` **MUST** run exactly once after that attempt and before
the event publishes. A teardown throw **MUST** set only the optional literal `sourceTeardownFailed: true`; it
**MUST NOT** change the committed stream outcome, extend `durationMs`, publish an Error, or create another event.
A `subscribe()` failure or Subscription-handle inspection failure before any teardown attempt **MUST NOT** set
`sourceTeardownFailed` or replace a terminal already selected synchronously.
<!-- /RPC-EVENT-018 -->

**RPC-EVENT-022 — Canonical call member metadata.** Outgoing and known incoming call events **MUST** use the
Descriptor-wide `service` and `member` field names with locally canonical values; the legacy event field name
`method` **MUST NOT** appear. An incoming unknown-service pair **MUST** omit both fields. An incoming
unknown-member or member-kind mismatch pair **MUST** retain only the exactly matched canonical local `service`
and **MUST NOT** echo the attacker-supplied member spelling or disclose the actual member kind.
<!-- /RPC-EVENT-022 -->

The following declaration is the closed event union. Its non-exported helper types express correlations that
must remain visible when TypeScript narrows an exported `RpcEvent`:

```typescript
export enum RpcEventDirectionEnum {
  incoming = "incoming",
  outgoing = "outgoing",
}

export enum RpcEventTypeEnum {
  callStarted = "call-started",
  callFinished = "call-finished",
  streamStarted = "stream-started",
  streamFinished = "stream-finished",
  peerOpened = "peer-opened",
  peerRecovering = "peer-recovering",
  peerRecovered = "peer-recovered",
  peerDraining = "peer-draining",
  peerClosed = "peer-closed",
  ownerDraining = "owner-draining",
  ownerClosing = "owner-closing",
  topologyClosed = "topology-closed",
}

export enum RpcStreamStatusEnum {
  completed = "completed",
  canceled = "canceled",
  failed = "failed",
  terminated = "terminated",
}

type RpcCallObservationBase = {
  readonly observationId: string;
  readonly peer: IRpcPeer;
};

type RpcOutgoingCallContext = {
  readonly direction: RpcEventDirectionEnum.outgoing;
  readonly service: string;
  readonly member: string;
};

type RpcKnownIncomingCallContext = {
  readonly direction: RpcEventDirectionEnum.incoming;
  readonly service: string;
  readonly member: string;
};

type RpcUnknownServiceCallContext = {
  readonly direction: RpcEventDirectionEnum.incoming;
  readonly service?: never;
  readonly member?: never;
};

type RpcUnknownMemberCallContext = {
  readonly direction: RpcEventDirectionEnum.incoming;
  readonly service: string;
  readonly member?: never;
};

type RpcCallStartedEvent = RpcCallObservationBase &
  (RpcOutgoingCallContext | RpcKnownIncomingCallContext |
   RpcUnknownServiceCallContext | RpcUnknownMemberCallContext) & {
    readonly type: RpcEventTypeEnum.callStarted;
  };

type RpcCallFinishedBase = RpcCallObservationBase & {
  readonly type: RpcEventTypeEnum.callFinished;
  readonly durationMs: number;
};

type RpcCallFinishedEvent = RpcCallFinishedBase & (
  | (RpcOutgoingCallContext & { readonly outcome: RpcCallStatusEnum.fulfilled })
  | (RpcOutgoingCallContext & {
      readonly outcome: RpcCallStatusEnum.rejected;
      readonly code: RpcCallFailure;
    })
  | (RpcKnownIncomingCallContext & { readonly outcome: RpcCallStatusEnum.fulfilled })
  | (RpcKnownIncomingCallContext & {
      readonly outcome: RpcCallStatusEnum.rejected;
      readonly code: RpcExceptionCodeEnum.canceled | RpcExceptionCodeEnum.handlerFailed;
    })
  | (RpcKnownIncomingCallContext & { readonly outcome: RpcCallStatusEnum.terminated })
  | (RpcUnknownServiceCallContext & {
      readonly outcome: RpcCallStatusEnum.rejected;
      readonly code: RpcExceptionCodeEnum.unknownService;
    })
  | (RpcUnknownMemberCallContext & {
      readonly outcome: RpcCallStatusEnum.rejected;
      readonly code: RpcExceptionCodeEnum.unknownMember;
    })
);

type RpcStreamObservationBase = {
  readonly observationId: string;
  readonly peer: IRpcPeer;
};

type RpcOutgoingStreamContext = {
  readonly direction: RpcEventDirectionEnum.outgoing;
  readonly service: string;
  readonly member: string;
};

type RpcKnownIncomingStreamContext = {
  readonly direction: RpcEventDirectionEnum.incoming;
  readonly service: string;
  readonly member: string;
};

type RpcUnknownServiceStreamContext = {
  readonly direction: RpcEventDirectionEnum.incoming;
  readonly service?: never;
  readonly member?: never;
};

type RpcUnknownMemberStreamContext = {
  readonly direction: RpcEventDirectionEnum.incoming;
  readonly service: string;
  readonly member?: never;
};

type RpcStreamStartedEvent = RpcStreamObservationBase &
  (RpcOutgoingStreamContext | RpcKnownIncomingStreamContext |
   RpcUnknownServiceStreamContext | RpcUnknownMemberStreamContext) & {
    readonly type: RpcEventTypeEnum.streamStarted;
  };

type RpcStreamFinishedBase = RpcStreamObservationBase & {
  readonly type: RpcEventTypeEnum.streamFinished;
  readonly durationMs: number;
};

type RpcStreamFinishedEvent = RpcStreamFinishedBase & (
  | (RpcOutgoingStreamContext & {
      readonly outcome: RpcStreamStatusEnum.completed | RpcStreamStatusEnum.canceled;
      readonly deliveredItemCount: number;
    })
  | (RpcOutgoingStreamContext & {
      readonly outcome: RpcStreamStatusEnum.failed;
      readonly code: RpcStreamFailure;
      readonly deliveredItemCount: number;
    })
  | (RpcKnownIncomingStreamContext & {
      readonly outcome:
        | RpcStreamStatusEnum.completed
        | RpcStreamStatusEnum.canceled
        | RpcStreamStatusEnum.terminated;
      readonly admittedItemCount: number;
      readonly sourceTeardownFailed?: true;
    })
  | (RpcKnownIncomingStreamContext & {
      readonly outcome: RpcStreamStatusEnum.failed;
      readonly code: RpcExceptionCodeEnum.handlerFailed | RpcExceptionCodeEnum.overflow;
      readonly admittedItemCount: number;
      readonly sourceTeardownFailed?: true;
    })
  | (RpcUnknownServiceStreamContext & {
      readonly outcome: RpcStreamStatusEnum.failed;
      readonly code: RpcExceptionCodeEnum.unknownService;
      readonly admittedItemCount: 0;
    })
  | (RpcUnknownMemberStreamContext & {
      readonly outcome: RpcStreamStatusEnum.failed;
      readonly code: RpcExceptionCodeEnum.unknownMember;
      readonly admittedItemCount: 0;
    })
);

type RpcPeerLifecycleEvent =
  | { readonly type: RpcEventTypeEnum.peerOpened | RpcEventTypeEnum.peerRecovering | RpcEventTypeEnum.peerRecovered;
      readonly peer: IRpcPeer }
  | { readonly type: RpcEventTypeEnum.peerDraining; readonly peer: IRpcPeer;
      readonly reason: RpcCloseReasonEnum.gracefulShutdown | RpcCloseReasonEnum.counterExhaustion }
  | { readonly type: RpcEventTypeEnum.peerClosed; readonly peer: IRpcPeer;
      readonly outcome: RpcCloseOutcomeEnum.normal; readonly reason: RpcNormalSessionCloseReason }
  | { readonly type: RpcEventTypeEnum.peerClosed; readonly peer: IRpcPeer;
      readonly outcome: RpcCloseOutcomeEnum.failed;
      readonly reason: RpcUnavailableSessionFailureReason | RpcProtocolSessionFailureReason };

type RpcTopologyLifecycleEvent =
  | { readonly type: RpcEventTypeEnum.ownerDraining }
  | { readonly type: RpcEventTypeEnum.ownerClosing }
  | { readonly type: RpcEventTypeEnum.topologyClosed; readonly outcome: RpcCloseOutcomeEnum.normal;
      readonly reason: RpcNormalSessionCloseReason }
  | { readonly type: RpcEventTypeEnum.topologyClosed; readonly outcome: RpcCloseOutcomeEnum.failed;
      readonly reason: RpcUnavailableSessionFailureReason |
        RpcProtocolSessionFailureReason | RpcCloseReasonEnum.cleanupFailed };

export type RpcEvent =
  | RpcTopologyLifecycleEvent
  | RpcPeerLifecycleEvent
  | RpcCallStartedEvent
  | RpcCallFinishedEvent
  | RpcStreamStartedEvent
  | RpcStreamFinishedEvent;
```

**RPC-EVENT-021 — Local call pairing.** An outgoing `call-started` **MUST** be staged when a validated invocation
becomes Pending. A known incoming start **MUST** follow Remote Request Admission and precede handler dispatch.
A durable unknown-service/member semantic rejection **MUST** stage an adjacent started/finished pair. Every
started observation **MUST** have exactly one matching finished observation on that side. Preflight failure,
initial abort, and Remote Resource Rejection **MUST NOT** create a pair.
<!-- /RPC-EVENT-021 -->

**RPC-EVENT-023 — Closed call outcome correlation.** A finished outgoing call **MUST** be `fulfilled` or `rejected` with any
`RpcCallFailure`. A known incoming call **MUST** be `fulfilled`, `rejected` only with `canceled | handler-failed`,
or `terminated`. Unknown-service and unknown-member events **MUST** be rejected only with their exact respective
code. `terminated` **MUST** be incoming-only and carry no code, Error, or Session reason.
<!-- /RPC-EVENT-023 -->

**RPC-EVENT-005 — No hidden recorder.** The Framework **MUST NOT** provide a default transcript ring, telemetry
history, redaction callback, exporter, trace propagation, or console sink. Applications **MAY** record payloads
at caller/handler boundaries they own.
<!-- /RPC-EVENT-005 -->

**RPC-EVENT-006 — Role reachability.** The shared `RpcEvent` type **MAY** contain variants used by either Owner,
but an Acceptor **MUST NOT** emit topology terminal reasons that belong only to its individual peers
(`remote-terminated`, Recovery, continuity, or counter exhaustion). A Connector **MAY** project its unique peer's
terminal as topology terminal. Listener terminal **MUST NOT** imply topology terminal while the Acceptor remains
active.
<!-- /RPC-EVENT-006 -->

**RPC-EVENT-007 — Observation identity.** `observationId` **MUST** be an opaque local correlation string stable
only for its started/finished pair. It **MUST NOT** be parseable by contract, sent on wire, reused as Call
Identity, or treated as authority.
<!-- /RPC-EVENT-007 -->

### 6.5 Startup operations

**RPC-START-001 — Promise-only startup errors.** `connect()` and `listen()` **MUST** report every preflight or
startup failure by Promise rejection and **MUST NOT** throw synchronously. State/single-flight/overflow gates
**MUST** run before reading `adapter.connection$`. Invalid state **MUST** reject `RpcException(unavailable)`; a
structurally invalid Adapter after the gate **MUST** reject `TypeError` without starting it.
<!-- /RPC-START-001 -->

**RPC-START-002 — Connector eligibility.** Connector startup **MUST** be single-flight and accepted only while
the Owner is active, the stable peer is `unbound` or `recovering`, and no attempt exists. Connected, connecting,
draining, closed, or concurrent invocation **MUST** reject before touching the Adapter. The operation **MUST**
fulfill only after Adapter handoff and Protocol fresh/resume binding both succeed.
<!-- /RPC-START-002 -->

**RPC-START-003 — Acceptor eligibility.** Acceptor startup **MUST** be single-flight and accepted only while the
Owner is active, listener state is `idle` or `stopped`, and no overflow close remains pending. Fulfillment
**MUST** mean listener ready, not lifetime completion or Session admission. After gate and structural shape
validation succeed, acceptance **MUST** replace `idle` or the retained `stopped` snapshot with `starting` before
subscribing and starting the Adapter. Adapter readiness **MUST** commit `listening` before the public `listen()`
Promise fulfills. While the Owner remains active, normal source completion **MUST** commit
`stopped(normal, completed)`, an Owner-requested capacity stop **MUST** commit
`stopped(normal, resource-pressure)`, and source/startup error **MUST** commit `stopped(failed)` with the same
trusted Adapter `Error`. A `stopped` snapshot **MUST** persist until a later accepted `listen()` replaces it or
Owner termination removes the active listener projection. Listener terminal **MUST NOT** close existing peers
or the Acceptor.
<!-- /RPC-START-003 -->

**RPC-START-004 — Startup mapping.** Owner termination that interrupts an accepted startup **MUST** reject
`AbortError`. Ordinary Adapter, timeout, profile, or admission failure **MUST** reject
`RpcException(unavailable)` with an optional trusted local cause. Protocol invariant failure **MUST** reject
`RpcException(protocol)` and apply the specified fault scope. Structural Adapter rejection before acceptance
**MUST** leave the prior listener snapshot unchanged. Resource pressure before ready **MUST** reject `listen()`
with `AbortError` after recording `stopped(normal, resource-pressure)`; after ready it **MUST NOT** retroactively
change the fulfilled startup Promise. A source error before ready **MUST** reject with `RpcException(unavailable)`
whose cause is the same Error retained by `stopped(failed)`; after ready it **MUST** only update listener state.
If a source completes normally before readiness while the Owner remains active and neither Owner abort nor
resource pressure has won, Framework **MUST** record `stopped(normal, completed)` and reject the unsettled
`listen()` Promise with `RpcException(unavailable)` without a cause; it **MUST NOT** fulfill a readiness operation
that never reached ready.
<!-- /RPC-START-004 -->

**RPC-START-005 — Connector attempt cancellation.** `connect()` **MUST** accept a closed
`{ adapter, signal? }` options record. Its eligibility gate **MUST** run before reading that record. After the
gate, a non-platform signal **MUST** reject `TypeError`; an already-aborted signal **MUST** reject `AbortError`
without inspecting or starting the Adapter. A later abort **MUST** fence and cancel only the unsettled attempt,
abort the Framework-owned signal passed to Adapter and Protocol, Direct Close any handed-off Connection, return
a fresh peer to `unbound`, and leave a recovering peer `recovering`. Binding success, abort, ordinary failure,
and Owner/Session terminal **MUST** select one winner. Abort after binding success **MUST** have no effect, and
the public `AbortError` **MUST NOT** expose `signal.reason`.
<!-- /RPC-START-005 -->

## 7. Physical Connection and Adapter seam

```typescript
export interface IRpcConnection {
  readonly message$: Observable<Uint8Array>;
  send(message: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface IRpcConnectorAdapter {
  readonly connection$: Observable<IRpcConnection>;
  connect(signal: AbortSignal): Promise<void>;
}

export interface IRpcAcceptorAdapter {
  readonly connection$: Observable<IRpcConnection>;
  listen(signal: AbortSignal): Promise<void>;
}
```

**RPC-TRANSPORT-001 — Message channel.** `message$` and both `connection$` sources **MUST** be hot, multicast,
and non-replaying for next values, while terminal state **MUST** remain observable to a late subscriber. One
`message$` value **MUST** be one complete ordered Transport message. A byte-stream Adapter **MUST** perform its
own bounded framing; the Protocol Codec **MUST NOT** infer stream boundaries.
<!-- /RPC-TRANSPORT-001 -->

**RPC-TRANSPORT-002 — Stable bytes.** All observers of one notification **MUST** receive the same Connection or
`Uint8Array` identity. After emitting inbound bytes an Adapter **MUST NOT** modify, reuse, or detach the backing
storage. Observers **MUST** treat it as read-only.
<!-- /RPC-TRANSPORT-002 -->

**RPC-TRANSPORT-003 — Terminal.** Normal terminal **MUST** complete `message$`; Transport, framing, or admission
failure **MUST** error it with one final `Error`. No value may follow terminal. When applicable, the same Error
object **MUST** reject the affected send/close operation. The core seam **MUST NOT** define a Transport error-code
taxonomy.
<!-- /RPC-TRANSPORT-003 -->

**RPC-TRANSPORT-004 — Single owner.** Handoff **MUST** assign each Connection to exactly one Topology Owner.
Other observers **MUST NOT** call `send()` or `close()`. Subscription count **MUST NOT** affect ownership.
<!-- /RPC-TRANSPORT-004 -->

**RPC-TRANSPORT-005 — Ordered Local Admission.** An Owner **MUST** have at most one unsettled `send()` per
Connection. The Adapter **MAY** borrow the argument until settlement and **MUST NOT** borrow it afterward.
Fulfillment **MUST** mean only Local Admission into a stable bounded path; it **MUST NOT** imply flush, delivery,
receipt ACK, decode, or handler completion.
<!-- /RPC-TRANSPORT-005 -->

**RPC-TRANSPORT-006 — Backpressure and hard failure.** Temporary outbound pressure **MUST** leave the current
send pending without drop, overwrite, or reordering. Exceeding a finite message/queue limit or Transport failure
**MUST** reject the send and terminal the Connection. A normally empty path **MUST** accept every complete
message of at most `1,048,576` bytes.
<!-- /RPC-TRANSPORT-006 -->

**RPC-TRANSPORT-007 — Direct Close.** `close()` **MUST** synchronously prevent new sends and reject any unsettled
send, then start direct platform termination. It **MUST** be idempotent and settle only after local terminal,
`message$` terminal, and Adapter-owned cleanup. It **MUST NOT** wait for RPC calls, ACKs, remote confirmation, or
business work, and **MUST NOT** revoke a fulfilled send.
<!-- /RPC-TRANSPORT-007 -->

**RPC-TRANSPORT-008 — Connector handoff.** A Connector Adapter **MUST** be cold and single-use. Framework **MUST**
subscribe to `connection$` before calling `connect(signal)`. Success **MUST** emit exactly one Connection; return
from all synchronous `next` observers is the handoff barrier, after which the Connection may emit its first
message. The source then **MUST** complete before `connect()` fulfills. Pre-handoff abort **MUST** clean half-open
resources, complete with no value, and reject `AbortError`; other startup failure **MUST** error/reject with the
same Error. Handoff **MUST NOT** be revoked by later connection loss or signal abort.
<!-- /RPC-TRANSPORT-008 -->

**RPC-TRANSPORT-009 — Acceptor handoff.** An Acceptor Adapter **MUST** be cold and single-use. Framework **MUST**
subscribe before `listen(signal)`. It **MAY** emit accepted Connections before ready fulfillment; each
notification return is that Connection's handoff barrier. Abort before ready **MUST** reject `AbortError` and
complete the source; abort after ready **MUST** complete it normally. Abort inside a notification **MUST**
synchronously gate future emissions. Source terminal **MUST NOT** close transferred Connections or borrowed
external resources.
<!-- /RPC-TRANSPORT-009 -->

**RPC-TRANSPORT-010 — Earliest finite admission.** An Adapter **MUST** enforce finite per-message,
queued-message, and queued-byte limits at its earliest controllable raw-input point and **MUST NOT** expose an
unbounded mode. It **MUST NOT** copy, allocate from an untrusted length, or emit before the relevant check.
Platforms that already materialize a native message **MUST** avoid a second unbounded copy and terminate on
overflow. One Acceptor Connection failure **MUST NOT** stop the listener or siblings.
<!-- /RPC-TRANSPORT-010 -->

**RPC-TRANSPORT-011 — Overflow handoff.** An Acceptor **MUST** reserve one non-borrowable overflow-close slot in
addition to its ordinary Connection cap. The next emission at capacity **MUST** occupy only that slot and abort
future acceptance in the notification; Direct Close **MUST** occur in the first continuation after the ownership
barrier. No restart is allowed until that close settles. Before-ready overflow **MUST** reject listener startup
with `AbortError`; after-ready overflow **MUST** stop the listener normally with `resource-pressure`.
<!-- /RPC-TRANSPORT-011 -->

**RPC-TRANSPORT-012 — Security claim.** Structural Adapter conformance **MUST NOT** be presented as proof of
network security. An Adapter claiming secure Default-Protocol Recovery **MUST** document and test a deployment
mode that supplies confidentiality, ordered integrity/anti-replay, and authentication of the expected responder
endpoint. No `isSecure`, certificate, channel-binding, credential, or capacity getter is added to the core seam.
<!-- /RPC-TRANSPORT-012 -->

**RPC-TRANSPORT-013 — Stream-unaware Connection boundary.** `IRpcConnection` **MUST** remain exactly the
`message$`, `send(Uint8Array)`, and `close()` capabilities above. It **MUST** carry complete stable messages,
permit at most one unsettled send from its Owner, enforce a finite native queue and the `1,048,576 B` floor, and
retain Direct Close responsibility. It **MUST NOT** expose stream identity, credit, terminal, replay, capacity,
framing, or other Protocol-aware methods.
<!-- /RPC-TRANSPORT-013 -->

## 8. Protocol implementor seam

### 8.1 Construction, values, and policy

```typescript
declare const rpcApplicationSnapshotBrand: unique symbol;

export interface IRpcApplicationSnapshot<
  T extends RpcApplicationValue = RpcApplicationValue,
> {
  readonly value: T;
  readonly weight: number;
  readonly [rpcApplicationSnapshotBrand]: never;
}

export interface IRpcApplicationArgumentsSnapshot
  extends IRpcApplicationSnapshot<readonly RpcApplicationValue[]> {}

export type RpcUnknownCallFailure = Extract<
  RpcCallFailure,
  | RpcExceptionCodeEnum.unknownService
  | RpcExceptionCodeEnum.unknownMember
>;

export type RpcIncomingFailure = Extract<
  RpcCallFailure,
  | RpcExceptionCodeEnum.canceled
  | RpcExceptionCodeEnum.handlerFailed
  | RpcUnknownCallFailure
>;

export enum RpcCallTerminalTypeEnum {
  notStarted = "not-started",
  returnedVoid = "returned-void",
  returned = "returned",
  failed = "failed",
  sessionTerminated = "session-terminated",
}

export type RpcCallOutcome =
  | { readonly type: RpcCallTerminalTypeEnum.returnedVoid }
  | { readonly type: RpcCallTerminalTypeEnum.returned; readonly value: IRpcApplicationSnapshot }
  | { readonly type: RpcCallTerminalTypeEnum.failed; readonly code: RpcCallFailure };

export type RpcHandlerOutcome =
  | { readonly type: RpcCallTerminalTypeEnum.notStarted }
  | { readonly type: RpcCallTerminalTypeEnum.returnedVoid }
  | { readonly type: RpcCallTerminalTypeEnum.returned; readonly value: IRpcApplicationSnapshot }
  | { readonly type: RpcCallTerminalTypeEnum.failed;
      readonly code: RpcExceptionCodeEnum.handlerFailed };

export type RpcIncomingTerminal =
  | { readonly type: RpcCallTerminalTypeEnum.returnedVoid }
  | { readonly type: RpcCallTerminalTypeEnum.returned; readonly value: IRpcApplicationSnapshot }
  | { readonly type: RpcCallTerminalTypeEnum.failed; readonly code: RpcIncomingFailure }
  | { readonly type: RpcCallTerminalTypeEnum.sessionTerminated };

export interface IRpcProtocol {
  createConnector(host: IRpcProtocolConnectorHost): IRpcProtocolConnectorRuntime;
  createAcceptor(host: IRpcProtocolAcceptorHost): IRpcProtocolAcceptorRuntime;
}

export interface IRpcProtocolRuntimePolicy {
  readonly maxSessions: number;
  readonly maxHandshakes: number;
  readonly maxApplicationWorkPerSession: number;
  readonly maxApplicationWorkTotal: number;
  readonly maxActiveStreamsPerSession: number;
  readonly maxActiveStreamsTotal: number;
  readonly maxRetainedBytesPerSession: number;
  readonly maxRetainedBytesTotal: number;
  readonly maxHandlersPerSession: number;
  readonly maxHandlersTotal: number;
  readonly ackDelayMs: number;
  readonly activityProbeIntervalMs: number;
  readonly silenceTimeoutMs: number;
  readonly sendProgressTimeoutMs: number;
  readonly bindingAttemptTimeoutMs: number;
  readonly recoveryGraceMs: number;
  readonly shutdownDeadlineMs: number;
}

export enum RpcCloseReasonEnum {
  gracefulShutdown = "graceful-shutdown",
  forcedClose = "forced-close",
  shutdownDeadline = "shutdown-deadline",
  remoteTerminated = "remote-terminated",
  recoveryExpired = "recovery-expired",
  continuityFailure = "continuity-failure",
  counterExhaustion = "counter-exhaustion",
  protocolFault = "protocol-fault",
  resourceFault = "resource-fault",
  cleanupFailed = "cleanup-failed",
}

export type RpcProtocolFaultReason = Extract<
  RpcCloseReasonEnum,
  | RpcCloseReasonEnum.protocolFault
  | RpcCloseReasonEnum.resourceFault
>;

export interface IRpcRetainedBytesReservation {
  release(): void;
}

export interface IRpcProtocolHost {
  readonly policy: IRpcProtocolRuntimePolicy;
  reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
  normalizeApplicationValue(value: unknown): IRpcApplicationSnapshot;
  normalizeApplicationArguments(value: unknown): IRpcApplicationArgumentsSnapshot;
  applicationValuesEqual(
    left: IRpcApplicationSnapshot,
    right: IRpcApplicationSnapshot,
  ): boolean;
  fault(reason: RpcProtocolFaultReason, error: Error): void;
}
```

**RPC-SPI-001 — Structural factory.** `IRpcProtocol` **MUST** be an immutable reusable structural value. Every
`create*` call **MUST** synchronously return a fresh owner-scoped runtime. Construction **MUST** only read frozen
policy and retain host ports; it **MUST NOT** mutate/fault/attach/admit, perform I/O, or queue asynchronous work.
<!-- /RPC-SPI-001 -->

**RPC-SPI-002 — Normalized values.** Framework **MUST** give the Protocol opaque detached immutable application
snapshots with deterministic weight and semantic-equality/normalization ports. Only Framework **MUST** create
their brand. Protocol **MUST NOT** retain the original caller value or make Codec-specific values public.
<!-- /RPC-SPI-002 -->

**RPC-SPI-003 — Port atomicity.** Framework-owned host, incoming-reservation/call, and outgoing-sink ports
**MUST** be synchronous, total, and non-throwing for contract-valid calls except the specified normalization
`TypeError`. They **MUST** stage durable state without directly reentering user code. Duplicate, late, or invalid
Protocol calls and unexpected Protocol-owned member throws/rejections **MUST** fault the smallest known scope and
**MUST NOT** roll back already durable state. `reserveRetainedBytes()` **MUST** atomically charge the Owner
ledger or return `undefined`; its successful frozen reservation **MUST** release exactly once and make repeated
`release()` calls no-ops.
<!-- /RPC-SPI-003 -->

### 8.2 Outgoing and incoming calls

```typescript
export interface IRpcProtocolInvocationRequest {
  readonly service: string;
  readonly member: string;
  readonly args: IRpcApplicationArgumentsSnapshot;
}

export interface IRpcProtocolSession {
  reserveInvocation(request: IRpcProtocolInvocationRequest):
    IRpcProtocolInvocationReservation | undefined;
  forceClose(): void;
}

export interface IRpcProtocolInvocationReservation {
  commit(sink: IRpcProtocolInvocationSink): IRpcProtocolInvocation;
  release(): void;
}

export interface IRpcProtocolInvocation {
  start(): void;
  cancel(): void;
}

export interface IRpcProtocolInvocationSink {
  finish(outcome: RpcCallOutcome): void;
}

export interface IRpcProtocolIncomingCallRequest {
  readonly service: string;
  readonly member: string;
  readonly args: IRpcApplicationArgumentsSnapshot;
}

export interface IRpcProtocolIncomingCall {
  finish(outcome: RpcIncomingTerminal): void;
}

export interface IRpcProtocolIncomingHandlerCall
  extends IRpcProtocolIncomingCall {
  readonly handlerOutcome: Promise<RpcHandlerOutcome>;
}

export interface IRpcProtocolIncomingCallReservation<
  TCall extends IRpcProtocolIncomingCall = IRpcProtocolIncomingCall,
> {
  commit(): TCall;
  release(): void;
}

export enum RpcIncomingCallKindEnum {
  handler = "handler",
  unknown = "unknown",
}

export type RpcProtocolIncomingCallReservation =
  | {
      readonly kind: RpcIncomingCallKindEnum.handler;
      readonly reservation: IRpcProtocolIncomingCallReservation<
        IRpcProtocolIncomingHandlerCall
      >;
    }
  | {
      readonly kind: RpcIncomingCallKindEnum.unknown;
      readonly code: RpcUnknownCallFailure;
      readonly reservation: IRpcProtocolIncomingCallReservation<
        IRpcProtocolIncomingCall
      >;
    };
```

**RPC-SPI-004 — Outgoing reservation.** `reserveInvocation()` **MUST** reserve ordinary Protocol/Session
capacity without assigning call/sequence identity. `undefined` **MUST** preserve Definite Non-Execution.
Reservation `commit()` and `release()` **MUST** be single-winner. Commit **MUST** create observable Pending work
but **MUST NOT** send, notify, or settle; `start()` alone makes it eligible for Protocol Admission.
<!-- /RPC-SPI-004 -->

**RPC-SPI-005 — Synchronous outcome.** Protocol **MUST** finish every affected Framework-owned sink
synchronously before requesting or causing Session closed projection. An outcome Promise owned by Protocol
**MUST NOT** replace this sink, because Promise reactions cannot preserve terminal event ordering.
<!-- /RPC-SPI-005 -->

**RPC-SPI-006 — Incoming reservation.** After fixed/security/sequence validation and its own ledger/replay/
protected-terminal reservation, Protocol **MUST** call `reserveIncomingCall()` before exposure lookup. An
`undefined` result **MUST** cause a protected Remote Resource Rejection, receipt advancement, no args retention,
and no incoming event. A handler or unknown tagged reservation **MUST** be committed only after Protocol durably
records Remote Request Admission or Remote Semantic Rejection; pre-disposition failure **MUST** release it.
<!-- /RPC-SPI-006 -->

### 8.3 Sessions, role runtimes, and faults

```typescript
export type RpcSessionCloseReason = Exclude<
  RpcCloseReasonEnum,
  RpcCloseReasonEnum.cleanupFailed
>;

export type RpcProtocolSessionTransitionCloseReason = Exclude<
  RpcSessionCloseReason,
  RpcProtocolFaultReason | RpcCloseReasonEnum.shutdownDeadline
>;

export enum RpcProtocolSessionTransitionTypeEnum {
  draining = "draining",
  recovering = "recovering",
  recovered = "recovered",
  closed = "closed",
}

export type RpcProtocolSessionTransition =
  | { readonly type: RpcProtocolSessionTransitionTypeEnum.draining;
      readonly reason: RpcCloseReasonEnum.counterExhaustion }
  | { readonly type: RpcProtocolSessionTransitionTypeEnum.recovering; readonly cause?: Error }
  | { readonly type: RpcProtocolSessionTransitionTypeEnum.recovered }
  | { readonly type: RpcProtocolSessionTransitionTypeEnum.closed;
      readonly reason: RpcProtocolSessionTransitionCloseReason;
      readonly cause?: Error };

export interface IRpcProtocolSessionHost {
  reserveIncomingCall(
    request: IRpcProtocolIncomingCallRequest,
  ): RpcProtocolIncomingCallReservation | undefined;
  transition(transition: RpcProtocolSessionTransition): void;
  fault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface IRpcProtocolConnectorHost extends IRpcProtocolHost {
  attachSession(
    session: IRpcProtocolSession,
  ): IRpcProtocolSessionHost | undefined;
}

export interface IRpcProtocolAcceptorHost extends IRpcProtocolHost {
  admitSession(
    session: IRpcProtocolSession,
  ): IRpcProtocolSessionHost | undefined;
}

export interface IRpcProtocolRoleRuntime {
  shutdown(): Promise<void>;
  close(): void;
  cleanup(): Promise<void>;
}

export interface IRpcProtocolConnectorRuntime extends IRpcProtocolRoleRuntime {
  bind(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
}

export interface IRpcProtocolAcceptorRuntime extends IRpcProtocolRoleRuntime {
  accept(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
}
```

**RPC-SPI-008 — Synchronous subscription.** Framework **MUST** call `bind()`/`accept()` inside the Adapter
`connection$.next` stack. Runtime **MUST** synchronously subscribe to hot `message$`, but before the handoff
barrier it **MUST NOT** send, close, install a binding, or project state and **MAY** retain only bounded
provisional ingress. Fulfillment **MUST** mean fresh/resume binding installed; later connection loss **MUST NOT**
retroactively reject it.
<!-- /RPC-SPI-008 -->

**RPC-SPI-009 — Session attachment.** Fresh Connector Session **MUST** attach to the stable peer anchor; fresh
Acceptor Session **MUST** atomically admit a new stable peer. Resume **MUST** reuse the retained Session host.
Framework **MAY** reject attachment/admission for capacity before any public peer is created.
<!-- /RPC-SPI-009 -->

**RPC-SPI-010 — Transition ownership.** Protocol Session host **MAY** project recovering, recovered, closed, and
single-Session `draining(counter-exhaustion)`. Framework alone **MUST** bulk-project Owner graceful drain and
`shutdown-deadline`; Protocol **MUST NOT** duplicate those transitions. Authenticated active Close and signed
session-terminated reject **MUST** normalize to `remote-terminated`.
<!-- /RPC-SPI-010 -->

**RPC-SPI-011 — Fault scope.** Session Protocol/resource fault **MUST** synchronously reenter a Framework fault
transaction that calls `session.forceClose()` before projecting peer terminal. A shared owner fault **MUST**
call `runtime.close()` before projecting Owner/siblings. Protocol **MUST NOT** also request a second closed
transition for the same fault.
<!-- /RPC-SPI-011 -->

**RPC-SPI-012 — Three termination phases.** Runtime `shutdown()` **MUST** synchronously gate new work and fulfill
only when every semantic Session shell has gracefully completed or locally terminalled and Direct Close has
been invoked; it **MUST NOT** await physical cleanup. Runtime `close()` **MUST** synchronously force gates, finish
sinks, fence endpoints, and invoke Direct Close before returning, without sending Protocol Close. `cleanup()`
**MUST** be a cached Protocol-owned final task and **MUST NOT** include Connection/listener cleanup, running
handlers, or WebCrypto late sinks, which Framework tracks separately.
<!-- /RPC-SPI-012 -->

**RPC-SPI-013 — Outgoing stream reservation.** `IRpcProtocolSession.reserveStream(request)` **MUST** accept
exactly a normalized stream-method request with arguments or a stream-property request without arguments. A
successful reservation **MUST** have one winner: `commit(subscriberSink)` returns the minimal stream control
capability `{ start(), cancel() }`, while `release()` abandons the reservation. The Framework **MUST** commit
before start, start exactly once for a live subscription, and use `cancel()` only for that subscription's
explicit unsubscription authority. Throws from `reserveStream`, reservation `commit`, stream `start`, or stream
`cancel` are Protocol faults; an Observer failure produced by such a throw **MUST NOT** be the raw thrown value or
be reclassified as unavailability, outcome ambiguity, or application failure. Side-local terminal telemetry may
still use the closed execution-knowledge stream-failure vocabulary selected at that boundary.
<!-- /RPC-SPI-013 -->

**RPC-SPI-014 — Subscriber projection disposition.** `IRpcProtocolSubscriberSink.reserveItem(snapshot)` and
`reserveTerminal(outcome)` **MUST** reserve a projection without invoking an Observer. Only that projection's
`commit()` may perform the effect. Item commit **MUST** return `rearm` only when the same Logical Stream remains
open for another credit and `closed` otherwise. Terminal commit **MUST** fence later item/terminal effects before
invoking the terminal Observer callback.
<!-- /RPC-SPI-014 -->

**RPC-SPI-015 — Source emission reservation.** Before the Framework inspects or normalizes a raw source value,
it **MUST** call `IRpcProtocolSourceSink.reserveEmission()`. An unavailable reservation fences that emission.
A successful reservation **MUST** have exactly one disposition: `commit(normalizedSnapshot)` or `fail()`.
Framework **MUST NOT** retain a second raw application object after the normalized snapshot is committed. A raw
application normalization failure **MUST** use `fail()` and then the safe `handler-failed` terminal only when
that Protocol disposition returns normally; throws from `reserveEmission`, emission `commit`, or emission `fail`
are Protocol faults and **MUST NOT** be projected as application `handler-failed`.
<!-- /RPC-SPI-015 -->

**RPC-SPI-016 — Synchronous Source finish fence.** Calling
`IRpcProtocolIncomingStream.finish(outcome, onReleased)` **MUST** synchronously commit or preserve the terminal
winner and fence every later source callback before returning. It **MUST** initiate the one-shot local Source
teardown without waiting for terminal send, ACK, Observer effect, or Session convergence.
<!-- /RPC-SPI-016 -->

**RPC-SPI-017 — Minimal generation-scoped stream capabilities.** The stream SPI **MUST** expose only normalized
requests/snapshots, reservation/commit/release, `{ start(), cancel() }`, projection disposition,
`reserveEmission()`, and terminal/`onReleased` capabilities. It **MUST NOT** expose a raw Observable, raw value,
Error, credit, sequence, ACK/replay state, or Transport capacity. Recovery **MUST** retain the same committed
capabilities and Source Subscription; `G` **MUST** reject only new admission while admitted progress remains
eligible, and `F` **MUST** revoke every future item/source effect through the existing capabilities.
<!-- /RPC-SPI-017 -->

**RPC-SPI-018 — Release after real teardown.** The `onReleased` callback passed to incoming stream `finish()`
**MUST NOT** run until the actual one-shot Source teardown attempt has returned or thrown. A terminal commit,
terminal send, receipt, or replay retirement **MUST NOT** fabricate that receipt.
<!-- /RPC-SPI-018 -->

**RPC-SPI-019 — Exactly-once release receipt.** After the Source teardown attempt returns or throws, Framework
**MUST** invoke the exact `onReleased` callback once. Duplicate or late `finish()` calls, reentrant force,
Recovery, and competing terminal candidates **MUST NOT** invoke it again or invoke a replacement callback.
<!-- /RPC-SPI-019 -->

**RPC-SPI-020 — Release controls Source retirement.** Protocol Source ownership **MUST** remain active after a
terminal winner and retained terminal disposition until Framework invokes the exact `onReleased` receipt passed
to `IRpcProtocolIncomingStream.finish(outcome, onReleased)`. Terminal selection, terminal send, or Message
Receipt ACK **MUST NOT** retire that ownership or satisfy graceful drain. The receipt **MUST** retire it exactly
once and immediately re-evaluate Session drain without requiring another external event.
<!-- /RPC-SPI-020 -->

**RPC-SPI-021 — Incoming unary commit effect.** Protocol **MUST** reserve and durably record an incoming unary
handler or unknown-call disposition while processing the semantic message, but reservation `commit()` **MUST**
be a post-disposition effect invoked only after Message Receipt has advanced and its ACK is durable. Reentrant
commit code **MUST** observe the advanced receipt and **MUST NOT** undo or duplicate that receipt disposition.
<!-- /RPC-SPI-021 -->

**RPC-SPI-022 — Closed incoming unary terminal union.** A committed incoming handler handle **MUST** accept only
returned value/void, `canceled`, `handler-failed`, or private `session-terminated`; a committed unknown handle
**MUST** accept only its reserved exact `unknown-service` or `unknown-member` failure or private
`session-terminated`. `unavailable`, `outcome-unknown`, `overflow`, `protocol`, a mismatched unknown code, and
impossible handler outcomes **MUST** fault the Session and **MUST NOT** escape through a created incoming handle.
<!-- /RPC-SPI-022 -->

## 9. Built-in Protocol profile

### 9.1 Profile and Codec

**RPC-WIRE-001 — Atomic profile.** The built-in identifier **MUST** be the exact string `husky-di-rpc/1`.
This profile **MUST** atomically fix Codec, grammar, security algorithms, Recovery, deduplication, receipt ACK,
and terminal replay. It **MUST NOT** expose Codec negotiation, a capability bag, feature flags that weaken those
guarantees, or an extension registry. A Session **MUST** freeze its selected profile; resume **MUST NOT**
renegotiate it.
<!-- /RPC-WIRE-001 -->

**RPC-WIRE-002 — JSON message.** Each Transport message **MUST** contain exactly one RFC 8259 UTF-8 JSON text
whose root is an object. The Protocol **MUST NOT** add a stream header such as `Content-Length`; framing belongs
to the Adapter.
<!-- /RPC-WIRE-002 -->

**RPC-WIRE-003 — Lexical validation.** Before ordinary object materialization, the Codec **MUST** reject a
leading BOM, malformed UTF-8, an unpaired surrogate, a second JSON value, non-whitespace trailing data, duplicate
object members at any depth after escape decoding, or any fixed limit in `RPC-VALUE-008`. Legal whitespace,
member order, and equivalent escape spelling **MUST NOT** alter semantics. Strings and names **MUST NOT** undergo
Unicode normalization or case folding.
<!-- /RPC-WIRE-003 -->

**RPC-WIRE-004 — Number domain.** Application numbers **MUST** be finite binary64 values other than `-0`; their
decimal representation **MUST** round-trip to the same value. Protocol integers **MUST** be JSON safe integers
within the field-specific range. Absence of an optional member **MUST NOT** be equated with `null`.
<!-- /RPC-WIRE-004 -->

**RPC-WIRE-025 — Tagged open tails and nested closed errors.** A recognized top-level record and a nested tagged
`SemanticMessage` **MUST** accept additional members after validating them as bounded JSON data, then ignore,
release, and not round-trip them. The untagged `error` object in both unary and stream error records **MUST** be
closed to exactly `code` and `message`; `details`, stack, cause, and every other member are schema faults.
Objects inside `args` and `value` treat every member as application data. Duplicate names always invalidate the
record.
<!-- /RPC-WIRE-025 -->

**RPC-WIRE-016 — One pre-1.0 profile replacement.** Before the first stable release, the existing
`husky-di-rpc/1` assets and implementation **MUST** be replaced atomically by this final unary-plus-stream
profile. The package **MUST NOT** publish a legacy Codec, bridge, fingerprint, alias, dual-profile path, or
sibling archive for the discarded candidate grammar.
<!-- /RPC-WIRE-016 -->

**RPC-WIRE-026 — Final profile evolution.** After the final `husky-di-rpc/1` is published, that profile
**MAY** add only optional tagged fields that every old endpoint can validate as bounded data and safely ignore.
A new kind, required transition, changed known-field meaning, algorithm change, or weakened guarantee **MUST**
use a new profile; the pre-1.0 replacement permission in RPC-WIRE-016 **MUST NOT** be reused.
<!-- /RPC-WIRE-026 -->

### 9.2 Record grammar

The decoded grammar is:

```text
ProfileId   = non-empty UTF-8 string of at most 256 bytes
Sequence    = integer 1..9007199254740991
AckCursor   = integer 0..9007199254740991
Base64Url32 = canonical unpadded base64url encoding of exactly 32 bytes

FreshRequest = {
  kind: "fresh",
  profiles: [ProfileId, ...],
  initiatorNonce: Base64Url32
}

FreshAccept = {
  kind: "accept",
  profile: ProfileId,
  sessionId: Base64Url32,
  bindingEpoch: 1,
  responderNonce: Base64Url32,
  sessionSecret: Base64Url32,
  proof: Base64Url32
}

ResumeRequest = {
  kind: "resume",
  profile: ProfileId,
  sessionId: Base64Url32,
  receivedThrough: AckCursor,
  resumeAttempt: Sequence,
  initiatorNonce: Base64Url32,
  proof: Base64Url32
}

ResumeAccept = {
  kind: "accept",
  profile: ProfileId,
  sessionId: Base64Url32,
  bindingEpoch: Sequence,
  receivedThrough: AckCursor,
  responderNonce: Base64Url32,
  proof: Base64Url32
}

FreshReject = {
  kind: "reject",
  code: "unsupported-profile" | "admission-rejected",
  message?: string
}

GenericResumeReject = {
  kind: "reject",
  code: "resume-rejected",
  responderNonce: Base64Url32,
  proof: Base64Url32
}

AuthenticatedResumeReject = {
  kind: "reject",
  code: "continuity-failure" | "session-terminated",
  responderNonce: Base64Url32,
  proof: Base64Url32
}

SequencedEnvelope = {
  kind: "message",
  seq: Sequence,
  ackThrough?: AckCursor,
  message: SemanticMessage
}

AckOnly = { kind: "ack", ackThrough: AckCursor }
Ping    = { kind: "ping" }
Pong    = { kind: "pong" }
Close   = { kind: "close" }
```

**RPC-WIRE-007 — Profile offer.** Fresh `profiles` **MUST** be non-empty, contain no duplicates, and preserve
initiator preference order. Responder **MUST** select the first exact supported value and echo it. No common
profile **MUST** produce `unsupported-profile` without revealing a supported list or silently downgrading. An
empty ProfileId **MUST** be a schema violation, not an unsupported profile.
<!-- /RPC-WIRE-007 -->

**RPC-WIRE-008 — Security carriers.** Each `sessionId`, `sessionSecret`, nonce, and proof **MUST** use
`Base64Url32`. Decoder **MUST** reject padding, non-URL alphabet, wrong length, or any alternate spelling for the
same bytes. A `sessionId` **MUST NOT** grant authority without the corresponding proof key.
<!-- /RPC-WIRE-008 -->

**RPC-WIRE-009 — Phases.** The first initiator record on a new Connection **MUST** be `fresh` or `resume`; the
responder outcome **MUST** be `accept` or `reject`. Bootstrap records **MUST NOT** have sequence or ACK semantics.
Responder enters active phase after Local Admission of `accept`; initiator enters only after validating it.
Active phase **MUST** accept only `message`, `ack`, `ping`, `pong`, or `close`. Wrong phase or unknown kind
**MUST** fault at the scope in Section 11.2.
<!-- /RPC-WIRE-009 -->

**RPC-WIRE-010 — Reject shape.** Only a fresh `unsupported-profile` or `admission-rejected` **MAY** carry the
optional bounded `message`. Generic and authenticated resume rejects **MUST** use exactly their four known
fields and **MUST NOT** carry `message`, although the normal top-level unknown-tail rule still applies to input.
<!-- /RPC-WIRE-010 -->

The complete v1 sequenced semantic union is:

```text
Call = {
  kind: "call",
  callId: CanonicalCallOrdinal,
  service: NonEmptyIdentifier,
  member: NonEmptyIdentifier,
  args: ApplicationValue[]
}

Cancel = { kind: "cancel", callId: CanonicalCallOrdinal }

Result = {
  kind: "result",
  callId: CanonicalCallOrdinal,
  value?: ApplicationValue
}

Error = {
  kind: "error",
  callId: CanonicalCallOrdinal,
  error: {
    code: "canceled" | "unavailable" | "handler-failed" |
          "unknown-service" | "unknown-member",
    message: string
  }
}

StreamMethodStart = {
  kind: "stream-method",
  streamId: CanonicalStreamOrdinal,
  service: NonEmptyIdentifier,
  member: NonEmptyIdentifier,
  args: ApplicationValue[],
  creditThrough: 1
}

StreamPropertyStart = {
  kind: "stream-property",
  streamId: CanonicalStreamOrdinal,
  service: NonEmptyIdentifier,
  member: NonEmptyIdentifier,
  creditThrough: 1
}

StreamItem = {
  kind: "stream-item",
  streamId: CanonicalStreamOrdinal,
  itemOrdinal: Sequence,
  value: ApplicationValue
}

StreamCredit = {
  kind: "stream-credit",
  streamId: CanonicalStreamOrdinal,
  creditThrough: Sequence
}

StreamCancel = { kind: "stream-cancel", streamId: CanonicalStreamOrdinal }

StreamComplete = {
  kind: "stream-complete",
  streamId: CanonicalStreamOrdinal,
  itemThrough: AckCursor
}

StreamError = {
  kind: "stream-error",
  streamId: CanonicalStreamOrdinal,
  itemThrough: AckCursor,
  error: {
    code: "canceled" | "unavailable" | "handler-failed" |
          "unknown-service" | "unknown-member" | "overflow",
    message: string
  }
}

SemanticMessage =
  Call | Cancel | Result | Error |
  StreamMethodStart | StreamPropertyStart | StreamItem |
  StreamCredit | StreamCancel | StreamComplete | StreamError
```

`CanonicalCallOrdinal` and `CanonicalStreamOrdinal` are the unsigned decimal spelling of direction-local
integers in `1..9007199254740991`, with no leading zero.

**RPC-WIRE-017 — Final semantic union.** The sequenced semantic union **MUST** contain exactly the four unary
variants plus separate stream-method start, stream-property start, item, cumulative credit, cancel, complete,
and error variants shown above. Stream activity **MUST NOT** be encoded as a unary call or as an untagged
extension of a unary result.
<!-- /RPC-WIRE-017 -->

**RPC-WIRE-018 — Member vocabulary and directional identities.** Unary calls and both stream starts **MUST**
use `member`; wire `method` and `unknown-method` **MUST NOT** be accepted. Service and member **MUST** be
non-empty identifiers of at most 256 UTF-8 bytes and compare exactly; exact member `then` is a profile fault.
A stream-method start **MUST** carry `args`, while a stream-property start **MUST NOT** carry `args`. Call and
Stream Ordinals use the same canonical decimal carrier but independent direction-local counters and namespaces;
Item identity is `(Session Incarnation, subscription direction, streamId, itemOrdinal)`. No wire direction field
is added. Unary calls remain independent Promise work and **MUST NOT** acquire stream identity, credit, receive
slots, or terminal boundaries. Missing `result.value` means `void`; present `null` remains a value.
<!-- /RPC-WIRE-018 -->

**RPC-WIRE-020 — Closed terminal and error matrix.** `stream-complete` **MUST** encode only `completed` and
`stream-error.error.code` **MUST** be exactly `canceled | unavailable | handler-failed | unknown-service |
unknown-member | overflow`. Unary `error.error.code` **MUST** remain exactly `canceled | unavailable |
handler-failed | unknown-service | unknown-member`. The side-local outcomes `terminated` and
`outcome-unknown`, every unknown code, raw Error field, and alternate terminal spelling **MUST** be rejected by
the Codec and **MUST NOT** cross the wire.
<!-- /RPC-WIRE-020 -->

**RPC-WIRE-019 — W=1 transition table.** Every admitted stream **MUST** begin with cumulative
`creditThrough = 1`, Item Ordinal one, and exactly one backed outstanding grant. A Source **MUST** consume that
grant before admitting the matching item and **MUST NOT** admit another item until a Subscriber commits the
prior disposition, returns from `next()` while still open, re-arms the same Receive Slot, and advances the
horizon by exactly one. Equal credit is an idempotent no-op; regressed credit, a horizon gap, over-credit, a
second item at one horizon, and item ordinal gaps/regressions **MUST** fault the current Session. Terminal or
unsubscribe **MUST** prevent any further credit minting.
<!-- /RPC-WIRE-019 -->

**RPC-WIRE-021 — Current-binding ingress and fault scope.** Ingress **MUST** fence stale bindings before Codec
work, then apply fixed/security/schema checks, reverse ACK, sequence continuity, duplicate fingerprint,
directional identity, and semantic transition checks in that order. An exact retained duplicate **MUST** be
suppressed after applying its reverse ACK; retained equivocation, sequence gap/regression, ordinal gap/reuse,
over-credit, or an illegal stream transition **MUST** fault only the current Session before application effect.
No failed phase **MAY** advance a receipt or execute a later phase's rejection/effect.
<!-- /RPC-WIRE-021 -->

**RPC-WIRE-022 — Retired stream identity controls.** Once a stream identity is retired, late credit and cancel
for that identity **MAY** be durably suppressed as idempotent no-ops. A late item, late terminal, or a new start
that reuses the retired direction-local Stream Ordinal **MUST** fault the current Session; retirement **MUST NOT**
make those records indistinguishable from an unseen identity.
<!-- /RPC-WIRE-022 -->

**RPC-WIRE-024 — G/F/Close wire state.** After `G` but before `F`, a valid expected current-binding stream start
**MUST** retain a protected `unavailable` rejection only after normal validation, while malformed or poisoned
records keep their earlier fault phase. `F` **MUST** fence ingress and discard every uninvoked start/item/credit/
cancel/terminal/ACK/replay/Close intent without Protocol egress. A graceful unsequenced Close already ordered
on the exact current binding **MUST** remain one-way, receive no reply, and authoritatively converge that Session.
<!-- /RPC-WIRE-024 -->

**RPC-WIRE-023 — Exact envelopes and bounded nodes.** Every required wrapper, semantic node, identity, cursor,
and Application Value node **MUST** remain inside the fixed v1 envelope, depth, count, and byte limits. The
complete Transport message limit is `1,048,576 B`, complete decoded wire-tree depth is `67`, one Protocol
identifier is at most `256 B`, and one complete decoded record contains at most `65,546` JSON nodes. These
wrapper allowances **MUST NOT** enlarge any `RPC-VALUE-008` limit. The
unsequenced Close shell **MUST** reject every known bootstrap, sequence, unary, and stream field—including
`streamId`, `itemOrdinal`, `creditThrough`, and `itemThrough`—while retaining only the tagged-open unknown-tail
rule. A forbidden known field **MUST NOT** become acceptable merely because its value is `null`.
<!-- /RPC-WIRE-023 -->

**RPC-FLOW-001 — Credit is item admission.** Stream credit **MUST** mean only permission to admit that many
additional ordered Source Items. It **MUST NOT** claim application demand, readiness, processing, receipt, or
durability. The public Framework, Protocol SPI, and Transport Adapter seams **MUST NOT** add request, window,
pause, or capacity-query controls.
<!-- /RPC-FLOW-001 -->

**RPC-FLOW-002 — Fixed initial credit.** Every stream start **MUST** explicitly carry `creditThrough: 1`; zero,
another value, omission, and negotiation are profile faults. The Source side **MUST NOT** acquire a method,
property, or Source Subscription until it has durably accepted that positive grant and the start disposition.
The initial grant admits at most Item Ordinal one.
<!-- /RPC-FLOW-002 -->

**RPC-FLOW-003 — Observer-backed replenishment.** Subscriber-side item delivery **MUST** be strictly serial and
non-overlapping. Only after `Observer.next()` returns synchronously while both the Logical Stream and local
observation remain open may the Subscriber side re-arm the same W=1 receive slot, advance its cumulative credit
horizon by exactly one, and retain a matching credit update. Reentrant unsubscribe or terminal closure **MUST
NOT** mint another credit. Return from `next()` proves neither asynchronous application work nor durability.
For an active Source, a fresh credit below its accepted horizon is a Protocol fault, an equal horizon is an
idempotent no-op, and a higher horizon is valid only when it equals `admittedItemCount + 1`; any other higher
horizon is over-credit and a Protocol fault.
<!-- /RPC-FLOW-003 -->

**RPC-FLOW-004 — Overflow admission.** A valid Source emission that cannot reserve either one previously
accepted item credit or its ordinary retained item capacity **MUST** select `overflow` at that emission's gate
position without waiting, dropping, coalescing, or adding a buffer. The causing emission **MUST NOT** acquire an
Item Ordinal or become a Stream Item. An overflow winner **MUST** fence later Source callbacks, start one Source
teardown after the current synchronous application callback frame returns, follow every earlier admitted item
with one retained `stream-error` at their contiguous boundary, and
project exactly one safe `RpcException(overflow)` to an open Observer. Caller-visible overflow **MUST NOT** carry
the raw value, cause, diagnostics, or remote failure text. Its terminal disposition uses protected capacity; an
inability to retain that protected disposition is a Session resource fault, not another overflow.
<!-- /RPC-FLOW-004 -->

**RPC-FLOW-005 — Fixed flow-failure classification.** Invalid Source emission normalization **MUST** select
`handler-failed`; ordinary shortage before Remote Stream Admission **MUST** select `unavailable`; and a peer
credit horizon beyond the one legal cumulative advance **MUST** fault that Session as Protocol poison. These
classes **MUST NOT** be interchanged based on route outcome or application text.
<!-- /RPC-FLOW-005 -->

**RPC-FLOW-006 — Ordered protected convergence.** A terminal or control selected after earlier admitted Items
**MUST** follow those Items in sequence order and use protected convergence capacity. Ordinary pressure **MUST
NOT** evict or reorder the earlier Items. Failure to retain a required protected convergence disposition **MUST**
be a Session resource fault.
<!-- /RPC-FLOW-006 -->

**RPC-WIRE-013 — Cancel.** Cancel **MUST** express cooperative intent only. It **MUST NOT** be treated as a
terminal, rollback, or proof that dispatch did not occur. Result/error and cancel races **MUST** use the retained
first-terminal-wins state.
<!-- /RPC-WIRE-013 -->

**RPC-WIRE-014 — Activity controls.** Ping/Pong **MUST** be active-phase, connection-local, unsequenced,
unacknowledged, unreplayed, absent from call state and public events. A Ping **MUST** schedule one coalesced Pong;
a Pong **MUST NOT** trigger a reply.
<!-- /RPC-WIRE-014 -->

**RPC-WIRE-015 — Graceful Close.** Close **MUST** be active-phase, connection-local, unsequenced,
unacknowledged, unreplayed, and contain no known seq/ACK/proof/reason/identity field. A receiver **MUST**
authoritatively terminal the exact current Session, reply with nothing, and map the public reason to
`remote-terminated`. Forced public `close()` **MUST NOT** send this record.
<!-- /RPC-WIRE-015 -->

### 9.3 Sequence, receipt ACK, and replay

**RPC-ACK-001 — Directional sequence.** Each sending direction **MUST** allocate continuous `seq` values from
one, independent of Call Ordinals. Sequence **MUST NOT** wrap or reset during a Session Incarnation.
<!-- /RPC-ACK-001 -->

**RPC-ACK-002 — Receipt meaning.** `ackThrough: N` **MUST** mean that every message `seq <= N` has completed
lexical/schema/resource/continuity validation and has a durable idempotent disposition with enough retained
evidence to suppress replay. It **MUST NOT** mean handler start/completion or external side-effect commit.
<!-- /RPC-ACK-002 -->

**RPC-ACK-003 — AckOnly and piggyback.** A sequenced envelope **MAY** piggyback the newest reverse receipt.
AckOnly **MUST** have no `seq` and **MUST NOT** be acknowledged. The first dirty receipt **MUST** start one
non-sliding `ackDelayMs`; absent a piggyback opportunity it **MUST** mark one latest AckOnly ready. Actual send
**MUST** wait for an idle send slot and remain bounded by send-progress timeout.
<!-- /RPC-ACK-003 -->

**RPC-ACK-004 — Replay representation.** Sender **MUST** retain immutable `(seq, SemanticMessage)`, not encoded
envelope bytes. Initial send and replay **MUST** reuse both values while allowing a newer piggyback ACK. Envelope
fallibility and maximum width **MUST** be validated before Admission so replay cannot become poison after ACK
digits grow.
<!-- /RPC-ACK-004 -->

**RPC-ACK-005 — Duplicate.** A valid `seq <= receivedThrough` **MUST** process a valid new `ackThrough` but
**MUST** suppress the semantic body before Call State and handler dispatch and **MAY** resend the current receipt.
Changing the body for an old seq violates the Protocol and **MUST** fault while comparison evidence remains;
after receipt/ledger evidence is legitimately GC'd, receiver **MUST NOT** retain a permanent payload fingerprint
only to detect a body that can no longer affect state.
<!-- /RPC-ACK-005 -->

**RPC-ACK-006 — Gaps and ACK bounds.** A current-binding `seq > expected` or ACK above this direction's highest
sent sequence **MUST** terminal the Session as a Protocol/continuity fault without ACK or Recovery. Stale/equal
ACK and `ackThrough: 0` **MUST** be valid no-ops.
<!-- /RPC-ACK-006 -->

**RPC-ACK-007 — Replay barrier.** A replacement binding **MUST** freeze a finite replay set and transmit every
retained entry above the authenticated peer cursor in original sequence order before allocating a new seq.
New work **MAY** queue during the barrier but **MUST NOT** extend it.
<!-- /RPC-ACK-007 -->

**RPC-ACK-008 — One cumulative receipt.** The Protocol **MUST** use only one per-direction cumulative Message
Receipt ACK. Start, item, credit, cancel, and terminal messages **MUST NOT** introduce ACK subtypes, an ACK of an
ACK, or a stream-finish handshake.
<!-- /RPC-ACK-008 -->

**RPC-ACK-009 — Start disposition receipt.** Receipt of a valid stream start **MUST** prove only that its start
disposition and required retained evidence are durable. The receipt **MUST** become available before Source
acquisition or a semantic-rejection effect, but it **MUST NOT** claim Source subscription or execution.
<!-- /RPC-ACK-009 -->

**RPC-ACK-010 — Duplicate disposition and directional collection.** A duplicate message **MUST** first apply
its valid reverse cumulative ACK and then suppress an exact retained semantic replay without repeating
admission, Framework effects, or teardown. While comparison evidence for that direction remains, a different
semantic body at the same sequence **MUST** fault the Session. ACK, receipt cursor, and Session-terminal
collection **MUST** remain independent in each sending direction.
<!-- /RPC-ACK-010 -->

**RPC-ACK-011 — Item disposition receipt.** Receipt of a valid Stream Item **MUST** prove only its durable ordered
item disposition. It **MUST** become available before the Subscriber effect but **MUST NOT** claim that
`Observer.next()` returned, application processing completed, or another credit was granted.
<!-- /RPC-ACK-011 -->

**RPC-ACK-012 — Credit disposition receipt.** Receipt of a valid stream credit **MUST** prove only that its
absolute cumulative horizon was durably accepted. It **MUST NOT** release the outstanding Receive Slot, prove an
Item was delivered, or create a separate acknowledgement class.
<!-- /RPC-ACK-012 -->

**RPC-ACK-013 — Cancel disposition receipt.** Receipt of a valid call or stream cancel **MUST** prove only that
its cancel intent has a durable first-winner disposition. The resulting protected terminal and Framework finish
effect **MUST** occur after that receipt is available for piggyback; receipt **MUST NOT** imply teardown
settlement or retirement of the reverse-direction evidence.
<!-- /RPC-ACK-013 -->

**RPC-ACK-014 — Direction-local terminal receipt.** Receipt covering a stream terminal **MUST** retire only
replay evidence in that terminal's sending direction through the acknowledged sequence. It **MUST NOT** act as a
reverse-direction receipt or a finish handshake; self-contained reverse evidence **MAY** remain after the active
stream root retires.
<!-- /RPC-ACK-014 -->

**RPC-ACK-015 — Receipt before effect.** Once a semantic disposition is durably committed, Protocol **MUST**
advance the cumulative Message Receipt and make its ACK dirty before invoking the corresponding Framework or
application effect. The effect may therefore cause an outgoing record to piggyback that receipt; it **MUST NOT**
observe the previous receipt frontier or roll the committed disposition back.
<!-- /RPC-ACK-015 -->

### 9.4 Logical Call ledger

**RPC-LEDGER-001 — Identity.** A Logical Call identity **MUST** be `(Session Incarnation, originating direction,
callId)`. The built-in Protocol **MUST** allocate direction-local continuous Call Ordinals from one and encode
them canonically. Pending Invocation **MUST NOT** own either Call Ordinal or message seq.
<!-- /RPC-LEDGER-001 -->

**RPC-LEDGER-002 — Request replay.** Uncertain receipt **MUST** replay the original seq, callId, and semantic
message. A fresh seq containing an already used Call Ordinal **MUST** be an identity-reuse Protocol fault even if
the body is equal. Recovery **MUST NOT** manufacture a new identity for an existing invocation.
<!-- /RPC-LEDGER-002 -->

**RPC-LEDGER-003 — Incoming order.** For an expected fresh call, receiver **MUST** decide in this order: fixed
validation; seq/ordinal; ordinary handler-work capacity without route lookup; then exact route. Capacity failure
with protected reserve **MUST** atomically record terminal `unavailable` and advance receipt without retaining
the validated args, handler, or event. Capacity success plus known route **MUST** record in-progress Remote
Request Admission; unknown route **MUST** record the corresponding non-dispatch semantic terminal and safe
event pair.
<!-- /RPC-LEDGER-003 -->

**RPC-LEDGER-004 — Handler terminal.** Each admitted handler **MUST** have a reserved minimum terminal slot.
Framework **MUST** normalize a successful result before committing it. Invalid result, over-limit envelope, or
ordinary terminal-payload exhaustion **MUST** commit the fixed safe `handler-failed` terminal. The terminal
entry **MUST** become immutable before its unique result/error message is scheduled.
<!-- /RPC-LEDGER-004 -->

**RPC-LEDGER-005 — GC.** Unacknowledged terminal **MUST** be retained and replayed with its original message
identity. Terminal ACK **MAY** release payload and per-call entry only after the direction's
`highestAdmittedCallOrdinal` remains sufficient to reject old identity reuse. Receipt and ordinal high-watermarks
**MUST** survive until Session terminal. Once a terminal wins, the incoming ledger **MUST** immediately release
the Framework call handle, handler closure, and request arguments; only the terminal/replay identity and bounded
dedupe metadata may remain until ACK. Once an outgoing Call is admitted and its immutable replay entry owns the
request payload, the outgoing call ledger **MUST** release its originating request snapshot; ACK release of that
replay entry **MUST NOT** leave request arguments retained while the call awaits a terminal. Ordinary pressure
**MUST NOT** evict replay, call, terminal, or dedupe evidence required by this paragraph.
<!-- /RPC-LEDGER-005 -->

**RPC-LEDGER-006 — Direction-local Stream Identity.** A Logical Stream identity **MUST** be `(Session
Incarnation, originating direction, Stream Ordinal)`. Outgoing Admission alone **MUST** allocate a direction-local
continuous Stream Ordinal from one. Pending work **MUST NOT** consume an ordinal, and an admitted or retired
ordinal **MUST NOT** be reused.
<!-- /RPC-LEDGER-006 -->

**RPC-LEDGER-007 — Item frontier.** Each direction's Item Ordinal **MUST** begin at one and advance continuously
for admitted Items. Equal normalized values **MUST** remain distinct Items. A stream terminal's `itemThrough`
boundary **MUST** equal the contiguous admitted Item frontier and **MUST NOT** skip or deduplicate it.
<!-- /RPC-LEDGER-007 -->

**RPC-LEDGER-008 — Independent stream evidence lifetimes.** Stream, item, credit, and terminal retained evidence;
their payload backing; active Framework roots; and each direction's retirement **MUST** remain independent.
Ordinary pressure **MUST NOT** evict continuity evidence, and releasing application ownership **MUST NOT** claim
that replay or reverse-direction evidence has retired.
<!-- /RPC-LEDGER-008 -->

## 10. Session establishment and Recovery

### 10.1 Incarnation and fresh establishment

**RPC-SESSION-001 — Incarnation.** Responder **MUST** create the `sessionId` for one in-memory retained Session
Incarnation containing stable peer, profile, proof key, both sequence/replay directions, call ledger, binding
epoch, and resume-attempt high-watermark. A process restart or retained-state loss **MUST** end the incarnation;
v1 **MUST NOT** persist or silently reconstruct it.
<!-- /RPC-SESSION-001 -->

**RPC-SESSION-002 — Session ID generation.** For each fresh attempt responder **MUST** test at most eight
independent 32-byte CSPRNG candidates against the Owner's retained and provisional ID set in a non-awaiting step.
A selected candidate **MUST** be provisionally reserved before asynchronous proof work. Eight collisions
**MUST** be a shared crypto invariant fault, not a duplicate Session. Released historical IDs need no tombstone;
historical uniqueness is probabilistic and authority remains the independent secret.
<!-- /RPC-SESSION-002 -->

**RPC-SESSION-003 — Fresh install.** Before Session-ID generation, secret/nonces, or proof work, responder
**MUST** reserve Session capacity and protected control state in one non-awaiting step that counts retained
Sessions plus all provisional fresh reservations. When that capacity is full, the reservation **MUST** first
claim the eligible Recovery with the earliest active absolute deadline under `RPC-RESOURCE-006`, or fail without
evicting a connected or replacement-bound Session. It **MUST** generate independent `sessionSecret` and nonces,
and install the Session only if Owner, endpoint, provisional identity, profile, and reservations remain current
after proof preparation. Initiator **MUST** derive a non-extractable proof key and verify the fresh transcript
before attaching the Session to its stable peer.
<!-- /RPC-SESSION-003 -->

**RPC-SESSION-004 — Fresh failure.** Unsupported profile or bounded post-classification Session capacity
**MUST** be attempt-scoped. A fresh accept that was installed by responder but lost **MUST** leave responder's
Session retained/recovering; an initiator that never verified accept **MUST** remain unbound. Neither side
**MUST** claim continuity with an unverified local Session.
<!-- /RPC-SESSION-004 -->

### 10.2 Binding, attempts, and cursors

**RPC-SESSION-005 — Binding epoch.** Every accepted binding **MUST** receive a strictly increasing safe-integer
epoch. The exact current endpoint and epoch **MUST** be the only active authority. Installing a newer valid
binding **MUST** atomically fence the old endpoint before it can affect state. An initiator **MUST** require an
epoch greater than its last verified value, not exactly plus one, because an accept may have been lost.
<!-- /RPC-SESSION-005 -->

**RPC-SESSION-006 — Resume attempt.** Initiator `resumeAttempt` **MUST** start at one, strictly increase, allow
gaps, never be reused or wrapped, and be consumed before proof preparation. Failure, timeout, or lost request/
accept **MUST NOT** roll it back. Responder **MUST** retain `highestAcceptedResumeAttempt` and accept only a
higher proof-valid attempt at binding linearization.
<!-- /RPC-SESSION-006 -->

**RPC-SESSION-007 — Last valid resume wins.** Concurrent proof-valid resumes **MAY** linearize successively; the
last installed endpoint **MUST** be current and all prior endpoints **MUST** be fenced. A valid replacement
**MAY** supersede a binding the other side still believes healthy. Lost accept **MUST** remain recoverable by a
higher attempt using the same proof key.
<!-- /RPC-SESSION-007 -->

**RPC-SESSION-008 — Cursor meaning.** Resume request `receivedThrough` **MUST** describe initiator receipt of
responder messages; accept `receivedThrough` **MUST** describe responder receipt of initiator messages. For each
direction, the authenticated allowed interval **MUST** be `[peerReceivedThrough, highestSentSeq]`. A value in
that interval **MAY** advance knowledge after a lost ACK; a lower or higher value **MUST** produce authenticated
`continuity-failure`, never a silent maximum.
<!-- /RPC-SESSION-008 -->

**RPC-SESSION-009 — Resume linearization.** After asynchronous proof work and without another await, responder
**MUST** atomically recheck Owner/Session non-terminal state, exact attempt endpoint, profile/session, Recovery
deadline, attempt high-watermark, both current cursor bounds, next epoch, and binding/Connection reservations.
Only then may it advance attempt, epoch, fencing, and binding. Any changed fact **MUST** cause reclassification or
discard of the stale candidate.
<!-- /RPC-SESSION-009 -->

**RPC-SESSION-010 — Initiator verification.** Before installing an accept or terminaling from an authenticated
reject, initiator **MUST** recheck exact attempt endpoint, transcript, current state/deadline, last verified epoch,
and higher-attempt winner. Timeout, cutoff, fencing, or later winner **MUST** make late verification a no-op.
<!-- /RPC-SESSION-010 -->

### 10.3 Recovery lifecycle

**RPC-RECOVERY-001 — Entering Recovery.** Unexpected current-Connection terminal, valid silence timeout, or
send-progress timeout **MUST** atomically fence the binding, project `recovering`, preserve Pending/call/replay/
exposure state, and then invoke Direct Close. It **MUST NOT** wait for close before fencing or automatically dial
a new Adapter. The separate opt-in Connector Reconnection supervisor in 10.4 **MAY** observe that projection and
request replacement attempts without changing Protocol Recovery authority.
<!-- /RPC-RECOVERY-001 -->

**RPC-RECOVERY-002 — Attempt timeout.** Fresh/resume attempt **MUST** use the configured absolute non-sliding
`bindingAttemptTimeoutMs`. Fresh timeout **MUST** return the peer to `unbound`; resume timeout **MUST** leave it
`recovering`. Failed attempts **MUST NOT** extend Session retention.
<!-- /RPC-RECOVERY-002 -->

**RPC-RECOVERY-003 — Retention.** Recovery retention **MUST** start at actual binding loss/fence and use one
absolute non-sliding `recoveryGraceMs`. Successful resume **MUST** cancel it; attack input, failed attempts, and
attempt activity **MUST NOT** reset it. Deadline, accept, and Acceptor fresh-capacity reclamation **MUST** compete
for one winner. Expiry or reclamation **MUST** terminal Pending work as `unavailable` and admitted work without
authoritative terminal as `outcome-unknown`; reclamation **MUST** project `forced-close`, not
`recovery-expired`. Reclamation order **MUST** follow the active absolute Recovery deadline under
`RPC-RESOURCE-006`, not Session creation time. The initiator of a reclaimed responder Session remains recovering
until a later successful resume or its own deadline because fresh pressure carries no remote Session authority.
<!-- /RPC-RECOVERY-003 -->

**RPC-RECOVERY-004 — Stable state.** Recovery **MUST** preserve the peer object, resolved facades, exposures,
Call Identities, replay entries, handler-dispatch evidence, and membership position. Connection replacement
alone **MUST NOT** settle a call or emit a second `peer-opened`.
<!-- /RPC-RECOVERY-004 -->

**RPC-RECOVERY-005 — Stale endpoint.** A callback, record, terminal, send completion, or close completion from a
fenced endpoint **MUST** be rejected by the endpoint/epoch gate before Codec or activity accounting and **MUST**
have no Session authority. The endpoint **MAY** be Direct Closed.
<!-- /RPC-RECOVERY-005 -->

**RPC-RECOVERY-006 — No restart authority.** Unknown/expired Session, lost proof key, abrupt remote restart,
wrong profile, bad proof, stale attempt, or resume-specific capacity **MUST** receive only generic
`resume-rejected` after bounded classification. It **MUST NOT** terminate the retained Session or claim the
remote process restarted. Initiator **MUST** remain recovering until another successful attempt or its existing
deadline.
<!-- /RPC-RECOVERY-006 -->

**RPC-RECOVERY-007 — Finite replacement barrier.** Each replacement binding **MUST** freeze one finite replay
barrier independently for each sending direction. Work admitted while the barrier is running **MUST NOT** extend
that barrier or allocate ahead of it. A replayed credit may make a post-barrier Item ready, but the Item **MUST**
remain ordered after the frozen replay prefix.
<!-- /RPC-RECOVERY-007 -->

**RPC-RECOVERY-008 — Retained-state continuation.** Recovery **MUST NOT** copy a second backlog or payload,
reacquire an application route, or resubscribe a Source. The old Connection fence **MUST** reject stale input and
callbacks before Codec entry, activity, ACK, or Framework state effects.
<!-- /RPC-RECOVERY-008 -->

**RPC-RECOVERY-009 — Generation-authoritative continuation.** Every asynchronous Recovery continuation **MUST**
capture its binding/Session generation and recheck it after each replay or application callback and immediately
before publishing `recovered` state, admitting retained Pending work, or emitting a recovered lifecycle event.
A reentrant close, force, newer binding, or terminal generation **MUST** revoke the stale continuation.
<!-- /RPC-RECOVERY-009 -->

### 10.4 Optional Connector Reconnection

```typescript
export enum RpcConnectorReconnectionAttemptFailureStageEnum {
  adapterFactory = "adapter-factory",
  connectorAttempt = "connector-attempt",
  attemptTimeout = "attempt-timeout",
}

export enum RpcConnectorReconnectionEventTypeEnum {
  attemptFailed = "attempt-failed",
}

export enum RpcConnectorReconnectionStopReasonEnum {
  requested = "requested",
  initialConnectionFailed = "initial-connection-failed",
  retriesExhausted = "retries-exhausted",
  connectorTerminated = "connector-terminated",
}

export type RpcConnectorAdapterFactory = () => IRpcConnectorAdapter;

export type RpcConnectorReconnectionPolicyOptions = {
  readonly retryDelaysMs?: readonly number[];
  readonly attemptTimeoutMs?: number;
};

export type CreateRpcConnectorReconnectionOptions = {
  readonly connector: IRpcConnector;
  readonly adapterFactory: RpcConnectorAdapterFactory;
  readonly policy?: RpcConnectorReconnectionPolicyOptions;
};

export type RpcConnectorReconnectionState =
  | { readonly status: RpcStateStatusEnum.idle }
  | { readonly status: RpcStateStatusEnum.connecting }
  | { readonly status: RpcStateStatusEnum.monitoring }
  | { readonly status: RpcStateStatusEnum.reconnecting; readonly attempt: number }
  | { readonly status: RpcStateStatusEnum.waiting; readonly nextAttempt: number; readonly delayMs: number }
  | { readonly status: RpcStateStatusEnum.stopped; readonly reason: RpcConnectorReconnectionStopReasonEnum };

export type RpcConnectorReconnectionEvent = {
  readonly type: RpcConnectorReconnectionEventTypeEnum.attemptFailed;
  readonly attempt: number;
  readonly stage: RpcConnectorReconnectionAttemptFailureStageEnum;
  readonly nextDelayMs?: number;
};

export interface IRpcConnectorReconnection {
  readonly connector: IRpcConnector;
  readonly state: RpcConnectorReconnectionState;
  readonly state$: Observable<RpcConnectorReconnectionState>;
  readonly event$: Observable<RpcConnectorReconnectionEvent>;
  connect(): Promise<void>;
  stop(): Promise<void>;
}

export function createRpcConnectorReconnection(
  options: CreateRpcConnectorReconnectionOptions,
): IRpcConnectorReconnection;
```

**RPC-RECONNECT-001 — Construction and initial attempt.** `createRpcConnectorReconnection()` **MUST** create a
cold, opt-in, single-use supervisor from a closed `{ connector, adapterFactory, policy? }` record and expose the
exact supplied Connector as `readonly connector`. Its synchronous, argument-free Adapter Factory **MUST** be
called only when an attempt begins and **MUST** return a fresh cold single-use Adapter. `connect()` **MUST** be
accepted once, call the Factory once, and settle when the initial Connector attempt settles; it **MUST NOT**
retry initial failure. Factory throw **MUST** remain the initial rejection. Initial failure **MUST** stop with
`initial-connection-failed`; initial success **MUST** enter `monitoring` and leave later Recovery supervision in
the background.
<!-- /RPC-RECONNECT-001 -->

**RPC-RECONNECT-002 — Orchestration state.** The supervisor **MUST** expose a synchronous frozen `state` and a
multicast replay-latest `state$` over only `idle`, `connecting`, `monitoring`, `waiting { nextAttempt, delayMs }`,
`reconnecting { attempt }`, and terminal `stopped { reason }`. These states describe orchestration, not the
authoritative Peer state. `state$` **MUST** never error and **MUST** complete after its terminal state. After an
initial success, the first `recovering` projection **MUST** synchronously publish `reconnecting { attempt: 1 }`
and defer Factory invocation until a microtask, so Peer Recovery is observable first. Successful replacement
**MUST** return to `monitoring`; a later Recovery episode **MUST** restart numbering at one.
<!-- /RPC-RECONNECT-002 -->

**RPC-RECONNECT-003 — Finite policy.** Policy construction **MUST** snapshot at most 64 non-negative
safe-integer `retryDelaysMs` values and one positive safe-integer `attemptTimeoutMs`. The default delays **MUST**
be `[1000, 2000, 5000, 10000, 20000, 30000, 60000, 60000, 60000]` and the default timeout **MUST** be 30000 ms.
Each Recovery episode **MUST** make one immediate replacement attempt; delay item N **MUST** authorize attempt
N+2 exactly that many milliseconds after attempt N+1 settles. The timeout **MUST** cover only each replacement
Adapter startup, handoff, and Protocol binding, cancel through the Connector signal, and **MUST NOT** move the
Protocol Recovery deadline. Exhaustion **MUST** stop with `retries-exhausted` while the Peer remains governed by
its authoritative Recovery outcome.
<!-- /RPC-RECONNECT-003 -->

**RPC-RECONNECT-004 — Attempt authority and stop.** While active, the supervisor **MUST** be the sole caller of
its Connector's `connect()`; manual takeover **MUST** first await `stop()`. `stop()` **MUST** be terminal and
idempotent, return the same Promise, synchronously cancel a scheduled or unsettled attempt, and fulfill only
after that attempt releases Connector authority. It **MUST NOT** call Connector `shutdown()` or `close()`.
Connector termination **MUST** cancel supervision and stop with `connector-terminated`; explicit stop **MUST**
use `requested`. Cancellation and Connector terminal **MUST NOT** be treated as attempt failure.
<!-- /RPC-RECONNECT-004 -->

**RPC-RECONNECT-005 — Failure telemetry.** The supervisor **MUST** expose hot multicast non-replaying `event$`
that never errors and completes on stop. It **MUST** emit only background `attempt-failed` records containing
the one-based episode attempt, one of `adapter-factory | connector-attempt | attempt-timeout`, and
`nextDelayMs` exactly when another attempt is scheduled. The resulting `waiting` or `stopped` state **MUST** be
committed before the event. The event **MUST NOT** contain Error, Adapter/Protocol internals, endpoint data,
payload, Session identity, credentials, or other caller-controlled values.
<!-- /RPC-RECONNECT-005 -->

## 11. Recovery security and validation

### 11.1 Deployment prerequisite and cryptographic transcript

**RPC-SEC-001 — Conditional security.** Secure `husky-di-rpc/1` Recovery **MUST** run each fresh/replacement
Connection over a Transport deployment providing confidentiality, ordered integrity/anti-replay, and expected
responder endpoint authentication. The Framework **MUST NOT** infer this from an Adapter boolean. Plaintext or
unauthenticated deployment **MAY** exercise functional grammar but **MUST NOT** claim secure Recovery or ACK
authority. The Session proof establishes continuity, not a user, tenant, or initiating-application identity;
ordinary server-authenticated TLS likewise authenticates only the responder. A deployment accepting untrusted
inbound Connections **MUST** authenticate and admit the initiator before Acceptor handoff and enforce
per-principal connection, Session, request-rate, and handler-duration limits outside this Protocol.
<!-- /RPC-SEC-001 -->

**RPC-SEC-002 — Algorithms.** The profile **MUST** use a CSPRNG, SHA-256, HKDF-SHA-256, HMAC-SHA-256, and RFC
8785 JCS without negotiation. Changing any algorithm **MUST** require a new profile. Verification **MUST** use
Web Crypto `subtle.verify` or an equivalent platform primitive rather than a handwritten early-exit byte compare;
conformance **MUST NOT** claim constant-time network behavior.

Define:

```text
D(label)       = UTF8("husky-di-rpc/1\0" + label + "\0")
H(record)      = SHA-256(JCS(record with exact top-level `proof` omitted))
sessionContext = SHA-256(JCS({ profile, sessionId }))
proofKey       = HKDF-SHA-256(
                   IKM = sessionSecret,
                   salt = sessionContext,
                   info = D("proof-key"),
                   length = 32)
```

The following byte concatenations are exact:

```text
freshAcceptProof = HMAC-SHA-256(
  proofKey,
  D("fresh-accept") || SHA-256(JCS(freshRequest)) || H(freshAccept))

resumeRequestProof = HMAC-SHA-256(
  proofKey,
  D("resume-request") || H(resumeRequest))

resumeAcceptProof = HMAC-SHA-256(
  proofKey,
  D("resume-accept") || H(resumeRequest) || H(resumeAccept))

authenticatedRejectProof = HMAC-SHA-256(
  proofKey,
  D("resume-reject") || H(resumeRequest) || H(authenticatedReject))
```
<!-- /RPC-SEC-002 -->

**RPC-SEC-003 — Canonical proof input.** JCS proof input **MUST** contain every bounded top-level unknown member
and **MUST** remove only the exact top-level `proof` member from the record being signed. Nested members named
`proof` **MUST** remain. NUL-terminated domain labels and fixed 32-byte hashes **MUST** be concatenated exactly as
shown.
<!-- /RPC-SEC-003 -->

**RPC-SEC-004 — Fresh secret.** Responder **MUST** generate an independent secret for every Session and send it
only in the one protected fresh accept. Fresh proof **MUST** confirm transcript/key possession but **MUST NOT** be
presented as a substitute for Transport endpoint authentication.
<!-- /RPC-SEC-004 -->

**RPC-SEC-005 — Generic reject.** After obtaining a bounded handshake slot, unknown/expired Session, wrong
profile, invalid proof, stale attempt, and resume-specific capacity **MUST** use the same code, known field set,
carrier lengths, dummy-key HMAC-shaped work, and no authoritative state effect. Generic dummy proof **MUST NOT**
grant Session authority. Strict timing equivalence is not a conformance promise.
<!-- /RPC-SEC-005 -->

**RPC-SEC-006 — Authenticated reject.** Only after valid Session proof **MAY** responder emit signed
`continuity-failure` or `session-terminated`. The proof **MUST** bind the exact resume request. Before Session
terminal linearization responder **MUST** recheck attempt, endpoint, state, deadline, transcript, and current
retained facts so an old signed candidate cannot terminate a higher winning attempt.
<!-- /RPC-SEC-006 -->

**RPC-SEC-007 — Active records.** After successful binding, active records **MUST** derive integrity/order/
anti-replay authority from the protected exact current Connection and local epoch fencing. The built-in Protocol
**MUST NOT** add an active `authTag` or public channel identity. Close has the same current-binding authority.
<!-- /RPC-SEC-007 -->

### 11.2 Validation pipeline and fault scope

**RPC-VALID-001 — Pipeline.** Input **MUST** be processed in this order, and failure at one stage **MUST** prevent
all later effects:

1. Adapter native framing/allocation/queue admission;
2. exact endpoint/epoch gate;
3. raw byte, UTF-8, JSON lexical, duplicate, depth/count/size checks;
4. bounded tree, tagged-union, known-field, scalar-carrier, and unknown-tail checks;
5. bootstrap/active phase and Transport-security prerequisite;
6. proof/attempt or active current-binding authority;
7. retained profile/session/cursor/sequence/ACK/Call-Ordinal/terminal semantics;
8. mutable capacity, then route lookup, then durable disposition;
9. receipt/state/activity/event commit and release of transient representations.
<!-- /RPC-VALID-001 -->

**RPC-VALID-002 — Receipt and activity.** A sequenced receipt **MUST** advance only after durable disposition.
Activity **MUST** update after complete validation and legal semantic disposition, including a legal idempotent
no-op such as stale ACK or coalesced Ping/Pong. Raw, malformed, or stale-endpoint input **MUST NOT** count.
<!-- /RPC-VALID-002 -->

**RPC-VALID-003 — Attempt failures.** Adapter raw failure or invalid unbound first record **MUST** remain
Connection/attempt-scoped. The shared generic handshake permit **MUST** be acquired before endpoint
subscription, Codec entry, or fresh/resume classification. Pre-bootstrap Connection/handshake capacity failure
**MUST** Direct Close without subscription, parsing, Session lookup, or wire reject. Bad/unmatched accept proof
**MUST** fail only the attempt; fresh returns unbound and resume remains recovering.
<!-- /RPC-VALID-003 -->

**RPC-VALID-004 — Continuity failures.** A proof-valid resume cursor outside retained bounds or a proof-valid
resume accept contradicting retained cursor/epoch/transcript **MUST** terminal the affected Session as
`continuity-failure`. A contradictory proof-valid fresh accept **MUST** fail the attempt before local Session
installation.
<!-- /RPC-VALID-004 -->

**RPC-VALID-005 — Active poison.** A lexical, schema, phase, fixed-limit, unknown-kind, identity-reuse,
conflicting-terminal, sequence-gap, or ACK-upper-bound violation attributable to the protected current endpoint
after entering the Codec **MUST** terminal that Session as Protocol fault, with no ACK and no Recovery. It
**MUST NOT** merely reconnect and replay the same poison forever.
<!-- /RPC-VALID-005 -->

**RPC-VALID-006 — Ordinary overload.** Valid expected call ordinary-capacity failure with intact reserve
**MUST** produce protected terminal `unavailable`, receipt, and Definite Non-Execution. Protected reserve failure
**MUST** be Session `resource-fault`, not a call error. Shared crypto/runtime invariant corruption **MUST** fault
the Owner; only a truly shared Acceptor failure may affect siblings.
<!-- /RPC-VALID-006 -->

**RPC-VALID-008 — Fresh stream validation order.** A fresh expected Stream Start **MUST** pass fixed-envelope,
security, current-binding, schema, sequence, and Stream-Ordinal validation before ordinary/protected reservation,
and reservation **MUST** precede route classification. Poison, resource rejection, and semantic rejection
**MUST** remain distinct at their first failing phase.
<!-- /RPC-VALID-008 -->

**RPC-VALID-009 — Post-G validation remains authoritative.** After graceful cutoff G and before force F, every
incoming Stream Start **MUST** still pass the complete fixed/security/binding/schema/sequence/ordinal pipeline.
Only a valid expected start **MAY** advance its receipt and ordinal through protected `unavailable`; malformed,
stale-binding, gap, reuse, and wrong-proof input **MUST** retain their earlier fault or rejection scope and **MUST
NOT** be converted into `unavailable`.
<!-- /RPC-VALID-009 -->

**RPC-VALID-010 — Exact stream failure classification.** Unknown service, unknown member or member-kind
mismatch, Source acquisition/subscription/normalization failure, and resource rejection **MUST** map respectively
to `unknown-service`, `unknown-member`, `handler-failed`, and `unavailable`/`overflow` at their defined gates.
Classification and diagnostics **MUST NOT** expose attacker spelling or application failure text.
<!-- /RPC-VALID-010 -->

### 11.3 Secret and asynchronous-job lifetime

**RPC-SEC-008 — Secret lifetime.** Each side **MUST** import root secret into a non-extractable key, best-effort
overwrite temporary byte arrays it controls, retain only required proof key/high-watermark/current handshake
metadata, and release key references at Session terminal. It **MUST NOT** export, persist, rotate, log, or reuse
the Session secret across incarnations. JavaScript heap/physical-memory erasure is not promised.
<!-- /RPC-SEC-008 -->

**RPC-SEC-009 — Crypto candidate.** An asynchronous digest/HMAC result **MUST** be treated only as a candidate.
Timeout, fence, cutoff, higher attempt, or terminal **MUST** remove its state authority. Once started, a crypto job
**MUST** retain its handshake permit and full transient budget until the real Promise settles; late settlement
**MUST** be consumed by a bounded no-authority sink so repeated timeout cannot accumulate unbounded jobs.
Marking an attempt failed or removing it from the active-attempt set **MUST NOT** release that permit or budget
before settlement.
<!-- /RPC-SEC-009 -->

**RPC-SEC-010 — Existing active-channel authority.** Stream records **MUST** use the existing cumulative cursor,
finite replay barrier, protected Transport Connection, and Binding Epoch authority. The profile **MUST NOT** add
per-record HMACs, stream channel keys, public channel identities, or stream-specific proof negotiation.
<!-- /RPC-SEC-010 -->

**RPC-SEC-011 — Stateful stream security evidence.** Conformance evidence **MUST** distinguish a lost stream ACK,
an old-binding callback, a bootstrap or resume wrong proof that leaves retained stream authority intact, and a
Recovery terminal that does not resubscribe the Source. None of these cases **MAY** infer authority from an
unprotected or stale endpoint.
<!-- /RPC-SEC-011 -->

## 12. Resources, scheduling, and time

### 12.1 Default retained budgets

**RPC-RESOURCE-006 — Retained ownership.** A Connection whose Direct Close has not settled **MUST** continue
occupying its ordinary/overflow slot. Fresh admission pressure **MUST NOT** evict an existing connected Session.
When retained Sessions plus provisional fresh reservations reach `maxSessions`, an Acceptor fresh attempt
**MUST** reserve against and synchronously force one recovering Session with no current or linearized replacement
binding whose absolute Recovery deadline has not won, before Session-ID generation or proof work. The reservation
**MUST** precede the victim's public terminal notification so reentrant admission cannot overcommit capacity. If
multiple Sessions are reclaimable, the victim **MUST** have the earliest active absolute Recovery deadline;
equal deadlines **MAY** be resolved in retained Session order. If no reclaimable recovering Session exists, the
fresh attempt **MUST** be rejected.
<!-- /RPC-RESOURCE-006 -->

**RPC-RESOURCE-004 — Bootstrap transient.** Before endpoint subscription or first-record parsing, each admitted
handshake **MUST** acquire one Owner-global generic slot that is shared by fresh and resume without a role
subpool. Each slot **MUST** charge exactly `4 MiB` transient weight: up to `1 MiB` raw Adapter carrier, `1 MiB`
Codec/tree, `1 MiB` JCS/crypto input, and `1 MiB` accept/reject output plus fixed bookkeeping. The reservation
**MUST** stay until any started crypto actually settles. Policy validation **MUST** safely derive
`maxHandshakes * 4 MiB`; default 16 slots therefore have a distinct `64 MiB` transient budget.
Representational reuse **MUST NOT** reduce the admission charge. The first Endpoint record being processed is
covered by this fixed transient reservation; every later record retained or processed by that Endpoint **MUST**
instead hold its Owner retained-ledger charge until processing settles or the Endpoint closes. One representation
**MUST NOT** be charged to both budgets.
<!-- /RPC-RESOURCE-004 -->

**RPC-RESOURCE-007 — Complete stream-aware budget table.** Pending and admitted unary/stream work **MUST** share
the `N` per-Session and `T` per-Owner direction-local Application Work budgets; streams additionally consume the
`S`/`ST` subset. A Pending start or incoming Source Start Job **MUST** charge its normalized arguments plus
`256 B`; the Subscriber Receive Slot **MUST** charge `1,000,256 B`; each retained item **MUST** charge its
normalized value plus `256 B`; and ordinary/protected evidence **MUST** remain within the existing replay and
protected pools. At synchronous Source acquisition/subscribe settlement, the Source Start Job **MUST** release
its argument, captured-route, and temporary-source charge while transferring exactly one work/stream slot and
`256 B` of active metadata to the Source lifetime. The transfer **MUST NOT** expose a release/reacquire gap or
retain argument weight until Source terminal.
<!-- /RPC-RESOURCE-007 -->

**RPC-RESOURCE-008 — Atomic protected claims.** Ordinary work and its protected convergence obligations
**MUST** be reserved atomically and transferred between Pending, active, and replay representations without a
release/reacquire gap. Remote Stream Admission **MUST** reserve its terminal disposition claim before route
lookup; Local Stream Admission **MUST** reserve its cancel claim before identity. Later unrelated work **MUST NOT**
consume either claim. Committing the corresponding terminal or cancel **MUST** transfer the claim to exactly one
replay entry, while pre-admission withdrawal or Session terminal **MUST** release it exactly once.
<!-- /RPC-RESOURCE-008 -->

**RPC-RESOURCE-012 — Incoming stream pre-route reservation.** After validation and before route lookup, an
incoming Stream Start **MUST** atomically reserve its Session/Owner work and stream slots, Source Start Job and
argument charge, active metadata, and protected terminal claim. Ordinary shortage **MUST** safely reject the
start as `unavailable` without acquiring a route or Source; protected shortage **MUST** fault the Session.
<!-- /RPC-RESOURCE-012 -->

**RPC-RESOURCE-013 — Shared Source Job scheduling.** Source Start Jobs **MUST** reuse the existing bounded
Application Work permit scheduler and per-Session FIFO/ready-Session round robin. They **MUST NOT** create a
stream-only executor, retain a permit for the Source lifetime, or bypass unary work fairness.
<!-- /RPC-RESOURCE-013 -->

**RPC-RESOURCE-014 — Source Item Admission.** A Source emission **MUST** first consume its one durable credit and
reserve worst-case ordinary capacity before the Framework inspects the raw value. Successful normalization
**MUST** shrink that reservation in place to the normalized value weight plus `256 B`, then assign the next Item
Ordinal and retain exactly one immutable item snapshot. Failure at any step **MUST** release provisional capacity,
**MUST NOT** retain a second raw value, and **MUST NOT** advance the Item Ordinal.
<!-- /RPC-RESOURCE-014 -->

**RPC-RESOURCE-015 — No Recovery shadow backlog.** Recovery **MUST** retain the existing bounded Pending,
replay, control, item, and terminal structures in place. It **MUST NOT** copy payloads, duplicate queues, reserve a
second per-stream backlog, or reacquire the Source merely to continue on a replacement binding.
<!-- /RPC-RESOURCE-015 -->

**RPC-RESOURCE-016 — Receive Slot cycle.** Every locally admitted Application Stream **MUST** retain exactly one
`1,000,256 B` Receive Slot reservation. That same reservation **MUST** cycle in place through armed credit, item
snapshot occupancy, Observer-effect occupancy, and an open-observation re-arm. Item disposition, Observer
return, credit materialization, credit receipt, and Recovery **MUST NOT** release and reacquire it. The reservation
is released only when side-local stream convergence proves that no outstanding grant can still produce an item.
<!-- /RPC-RESOURCE-016 -->

**RPC-RESOURCE-017 — Outstanding grant backing.** Every accepted outstanding item grant **MUST** remain backed
by that Logical Stream's same Receive Slot until an Item consumes it or authoritative convergence proves no
future Item can use it. Recovery and temporary transport unavailability **MUST NOT** create a second backing.
<!-- /RPC-RESOURCE-017 -->

**RPC-RESOURCE-018 — Unsubscribe does not release the slot.** Explicit unsubscribe from an admitted stream
**MUST** close the local observation and send at most one cancel intent, but **MUST NOT** release the Receive Slot
while the outstanding grant can still produce an item. Terminal or Session convergence remains authoritative.
<!-- /RPC-RESOURCE-018 -->

**RPC-RESOURCE-019 — Credit receipt does not release the slot.** Re-arm **MUST** reuse the existing Receive Slot
without a release/reacquire interval, and receipt of the resulting credit record **MUST NOT** release it. The
slot continues to back the newly outstanding grant.
<!-- /RPC-RESOURCE-019 -->

**RPC-RESOURCE-020 — Cancel receipt does not release the slot.** Receipt of a cancel intent **MUST NOT** release
the Receive Slot or Subscriber work/stream slots. Only the authoritative stream terminal or Session convergence
can prove that a future granted Item is impossible.
<!-- /RPC-RESOURCE-020 -->

**RPC-RESOURCE-009 — Local Application Stream Admission.** Before creating Stream Identity or wire work, a local
subscription **MUST** atomically acquire its direction-local Session and Owner Application Work Slots, Session
and Owner Active Stream Slots, Pending start/argument charge, and Receive Slot. Unary and stream work share
`N/T`; streams additionally consume the subset `S/ST`. Failure of any ordinary reservation **MUST** release every
provisional reservation and project `RpcException(unavailable)` with no identity, wire record, or remote
execution. Retirement **MUST** return both work slots for later unary or stream admission.
<!-- /RPC-RESOURCE-009 -->

**RPC-RESOURCE-010 — Identity-free Pending Stream.** A locally committed Stream reservation **MUST** remain a
finite identity-free Pending entry until the exact current Endpoint has an idle send slot and ordinary start
evidence, the next ordinary sequence, Stream Ordinal, Receive Slot, and protected cancel claim are all available.
Only that atomic Outgoing Admission **MAY** assign the direction-local Stream Identity and release Pending
argument storage. Cancellation or force while Pending **MUST** retract it without a wire identity or cancel.
<!-- /RPC-RESOURCE-010 -->

**RPC-RESOURCE-011 — Subscriber slot retirement.** Side-local Subscriber Application Work and Active Stream
slots **MUST** remain owned until a terminal projection or suppression commits. An explicit unsubscribe of an
identity-free Pending Stream **MUST** synchronously commit local canceled suppression, retire the Protocol entry,
and return both slots without sending cancel. For an admitted Stream, cancel intent or its ACK alone **MUST NOT**
return those slots; authoritative terminal or Session convergence still owns retirement.
<!-- /RPC-RESOURCE-011 -->

### 12.2 Runtime policy

Default policy is:

```text
maxSessions                         = 64
maxHandshakes                       = 16
maxApplicationWorkPerSession        = 256
maxApplicationWorkTotal             = 1,024
maxActiveStreamsPerSession          = 16
maxActiveStreamsTotal               = 64
maxRetainedBytesPerSession          = 33,554,432
maxRetainedBytesTotal               = 67,108,864
maxHandlersPerSession               = 16
maxHandlersTotal                    = 64
ackDelayMs                          = 50
activityProbeIntervalMs             = 30,000
silenceTimeoutMs                    = 120,000
sendProgressTimeoutMs               = 30,000
bindingAttemptTimeoutMs             = 30,000
recoveryGraceMs                     = 300,000
shutdownDeadlineMs                  = 5,000
```

**RPC-POLICY-004 — No public internal capacity.** Framework **MUST NOT** expose internal queue/lane/permit/
priority/pause/resume/scheduler surfaces or a Connection capacity getter. Adapter-specific finite native queue
options belong to the Adapter package.
<!-- /RPC-POLICY-004 -->

**RPC-POLICY-005 — Application Work per Session.** The required policy field
`maxApplicationWorkPerSession` **MUST** replace `maxPendingInvocationsPerSession` without an alias, shim, or
private fallback. It is the shared direction-local bound for Pending and admitted unary calls and Application
Streams, defaults to `256`, and **MUST** be an integer in `1..256`. The complete frozen policy passed to a custom
Protocol **MUST** contain the new field and **MUST NOT** contain the removed name.
<!-- /RPC-POLICY-005 -->

**RPC-POLICY-006 — Owner Application Work.** The required `maxApplicationWorkTotal` field is the aggregate
direction-local Application Work bound shared by unary calls and Application Streams across an Owner. Acceptor
policy defaults to `1024`, may override it with a positive safe integer, and **MUST** keep it at least
`maxApplicationWorkPerSession`. Connector options **MUST NOT** expose the field and the Framework **MUST**
derive it exactly as `maxApplicationWorkPerSession` in the complete frozen policy passed to its Protocol.
<!-- /RPC-POLICY-006 -->

**RPC-POLICY-007 — Active Stream subset.** `maxActiveStreamsPerSession` (`S`) and
`maxActiveStreamsTotal` (`ST`) **MUST** bound the stream subset inside Application Work rather than form an
additive pool. Omitted `S` derives as `min(16, N)`. Connector options may override `S` and **MUST NOT** expose
`ST`; its complete policy derives `ST = S`. Acceptor policy may override both; omitted `ST` derives as
`min(T, max(S, 64))`. Defaults are therefore `S = 16`, Connector `ST = 16`, and Acceptor `ST = 64`.
<!-- /RPC-POLICY-007 -->

**RPC-POLICY-008 — Closed policy inventory.** The complete Protocol policy **MUST** contain exactly
`maxSessions`, `maxHandshakes`, `maxApplicationWorkPerSession`, `maxApplicationWorkTotal`,
`maxActiveStreamsPerSession`, `maxActiveStreamsTotal`, `maxRetainedBytesPerSession`,
`maxRetainedBytesTotal`, `maxHandlersPerSession`, `maxHandlersTotal`, `ackDelayMs`,
`activityProbeIntervalMs`, `silenceTimeoutMs`, `sendProgressTimeoutMs`, `bindingAttemptTimeoutMs`,
`recoveryGraceMs`, and `shutdownDeadlineMs`. Acceptor options **MAY** override all seventeen fields. Connector
options **MAY** override only the three per-Session count/byte fields, `maxHandlersPerSession`, and the seven
timing fields; in particular they **MUST** expose `maxActiveStreamsPerSession` and **MUST NOT** expose any
aggregate field. Unknown and retired policy names **MUST** be rejected at both the type and runtime boundaries.
<!-- /RPC-POLICY-008 -->

**RPC-POLICY-009 — Complete validation.** In addition to the existing positive-safe-integer, timer, handler,
byte-ledger, and safe-derived-arithmetic constraints, policy construction **MUST** enforce `N <= 256`, `N <= T`,
`S <= N`, and `S <= ST <= T` before constructing the selected Protocol role. Equality at every boundary is
valid. Invalid combinations **MUST NOT** be repaired, clamped, deferred, negotiated, or passed to a custom
Protocol.
<!-- /RPC-POLICY-009 -->

### 12.3 Outbound and ingress fairness

**RPC-SCHEDULE-001 — Binding send slot.** Each current Connection **MUST** have at most one unsettled send.
Send-progress timeout **MUST** fence and enter Recovery before Direct Close; a local `Promise.race` **MUST NOT**
allow reuse of the still-running Connection. Late old-epoch settlement **MUST** be a no-op and identity **MUST**
never roll back after `send()` invocation.
<!-- /RPC-SCHEDULE-001 -->

**RPC-SCHEDULE-003 — Probe fairness.** Ping/Pong **MUST** coalesce to one due flag and bounded-alternate with the
sequenced lane: after one probe send, if sequenced work is ready at least one sequenced send **MUST** precede the
next probe. Continuous valid probe input **MUST NOT** starve replay, terminal, cancel, or call work. Direct Close
**MUST NOT** require a send slot.
<!-- /RPC-SCHEDULE-003 -->

**RPC-SCHEDULE-004 — ACK fairness.** Receipt state **MUST** retain only the latest cumulative cursor and one due
flag, never one queue item per receipt. An AckOnly **MAY** use any idle turn that preserves all replay/control/
data/probe bounded-progress guarantees; conformance depends on progress and coalescing, not a private exact lane
implementation.
<!-- /RPC-SCHEDULE-004 -->

**RPC-SCHEDULE-005 — Ingress serialization.** A Connection driver **MUST** complete validation, durable
disposition, state/event staging, and queue publication in Transport emission order. Handler code **MUST NOT**
run inline in the ingress callback. Synchronous reentrant input **MUST** enter the bounded ingress backlog and be
fully charged through processing settlement; overflow **MUST** fault rather than drop, skip, or ACK an
undisposed expected record.
<!-- /RPC-SCHEDULE-005 -->

**RPC-SCHEDULE-006 — Handler fairness.** Handler start order **MUST** be FIFO per Session and round-robin among
ready Sessions while acquiring both Session and Owner permits. Cross-Session or completion order need not be
global. A winning terminal for a queued job **MUST** immediately unlink its scheduler closure and payload, and
that job **MUST NOT** start; a running job **MUST** retain its permit until real settlement. Framework **MUST NOT**
impose a normal handler execution timeout.
<!-- /RPC-SCHEDULE-006 -->

**RPC-SCHEDULE-007 — Recovery and macro-lane order.** Bootstrap **MUST** remain exclusive and a replacement
binding **MUST** drain its finite frozen replay barrier before allocating a new sequence. After the barrier,
convergence/control work (terminal, rejection, and cancel) and ordinary/progress work (unary call, stream start,
item, and credit) **MUST** bounded-alternate with the first contested turn assigned to control. A terminal
**MUST NOT** overtake an earlier item of the same stream, but unrelated ready progress **MUST NOT** block a
dependency-ready control record.
<!-- /RPC-SCHEDULE-007 -->

**RPC-SCHEDULE-008 — Progress participant fairness.** Within the progress lane, the existing unary FIFO
**MUST** act as one virtual participant and every ready stream identity **MUST** act as one participant. The
scheduler **MUST** round-robin those participants, sending at most one dependency-ready record per participant
per round. Unary records remain FIFO, each stream remains FIFO, and a blocked participant **MUST NOT** prevent
another ready identity from making progress. With one sustained unary-call participant and four sustained
stream identities simultaneously ready, the first five actual progress sends **MUST** contain all five
participants exactly once in any order; each of the next seven complete five-send rounds **MUST** repeat that
captured order exactly. The selected participant **MUST** be re-armed after its send settles and before the next
selection, and no next send may begin while the selected send remains unsettled.
<!-- /RPC-SCHEDULE-008 -->

**RPC-SCHEDULE-009 — Coalescing and blocked-identity isolation.** Receipt ACK, Ping, and Pong state **MUST**
remain one cumulative cursor or due bit per kind and **MUST NOT** grow a record queue under repeated input.
Within either sequenced macro lane, a dependency-blocked stream identity **MUST NOT** block an unrelated ready
identity; the scheduler **MAY** bypass only that blocked participant and **MUST** preserve each identity's own
FIFO and item-before-terminal dependencies.
<!-- /RPC-SCHEDULE-009 -->

### 12.4 Activity and scheduler stalls

**RPC-TIME-001 — Activity probe.** After one `activityProbeIntervalMs` without valid inbound activity, each
active endpoint **MUST** schedule a Ping. Complete valid active input **MUST** count as activity; raw/malformed/
stale input **MUST NOT**. A custom Protocol **MUST** provide an equivalent bounded connection-local request/
response mechanism without call/replay identity or recursive reply.
<!-- /RPC-TIME-001 -->

**RPC-TIME-002 — Half-open detection.** After one `silenceTimeoutMs` without valid inbound activity, or one
`sendProgressTimeoutMs` without send settlement, runtime **MUST** fence, project Recovery, and Direct Close in
that order.
<!-- /RPC-TIME-002 -->

**RPC-TIME-003 — Late timer callback.** Health/progress timers **MUST** record expected fire time. If the runtime
was not scheduled for more than the corresponding interval, callback **MUST NOT** immediately condemn the
network using stale elapsed time: health **MUST** receive one new full probe confirmation window, and an already
unsettled send **MUST** receive one new full progress window. An already-running Recovery wall-clock deadline
**MUST NOT** be extended by scheduler stall; a connected stall **MUST NOT** retroactively consume Recovery time
that had not started.
<!-- /RPC-TIME-003 -->

### 12.5 Counter exhaustion

**RPC-COUNTER-001 — Never wrap.** Sequence, Call Ordinal, Binding Epoch, and resumeAttempt **MUST** be safe
integers and **MUST NOT** wrap, reset, or silently move existing calls to a new Session identity.
<!-- /RPC-COUNTER-001 -->

**RPC-COUNTER-003 — Other counters.** Exhausted Call Ordinal **MUST** drain the entire Session rather than leave a
public connected peer with one permanently unavailable originating direction. The last Binding Epoch **MAY**
support its current binding but **MUST** prohibit another Recovery and start drain. The last resumeAttempt
**MAY** establish a binding; if it fails, or that binding is later lost, initiator **MUST** terminal
`counter-exhaustion`, mapping Pending/admitted work to `unavailable`/`outcome-unknown`.
<!-- /RPC-COUNTER-003 -->

**RPC-COUNTER-004 — Per-Session drain.** Counter drain **MUST** stop new local admission, resource-reject new
remote calls from protected reserve, finish existing finite work, and attempt graceful Close using its own
grace/cleanup intervals. In an Acceptor it **MUST NOT** drain healthy siblings or the Owner.
<!-- /RPC-COUNTER-004 -->

**RPC-COUNTER-005 — Future-sequence obligations.** Let `MAX = Number.MAX_SAFE_INTEGER`, `L = MAX - 512`,
`H` be the highest allocated sequence, `F` the unsequenced ordinary obligations, and `PT`/`PC` the unsequenced
protected terminal/cancel obligations. A Session **MUST** continuously satisfy
`F <= max(0, L-H)` and `PT+PC <= MAX-H-F`; every counter **MUST** remain a non-negative safe integer and
**MUST NOT** wrap. Ordinary and protected reservation **MUST** atomically reject the obligation that would
violate either inequality, without consuming another pool or sequence.
<!-- /RPC-COUNTER-005 -->

**RPC-COUNTER-006 — Stream counter maxima.** Stream Ordinal, Item Ordinal, and Credit Horizon counters **MUST**
be positive safe integers and **MUST NOT** wrap or reuse an identity. Allocating the last Stream Ordinal
**MUST** immediately begin Session counter drain while preserving that admitted stream. At the last Item
Ordinal the Subscriber **MUST NOT** re-arm another credit; a later zero-credit Source emission **MUST** select
`overflow` without allocating another Item Ordinal.
<!-- /RPC-COUNTER-006 -->

## 13. Owner lifecycle and termination

The private Owner termination state is monotonic:

```text
active -> draining -> closing(graceful) -> closed
active ------------> closing(forced)   -> closed
```

`G` denotes graceful cutoff; `F` denotes the single forced cutoff used by explicit `close()` or grace timeout.

**RPC-LIFE-001 — Cached task.** The first public `shutdown()` or `close()` **MUST** create one termination
Promise. Every repeated, concurrent, cross-mode, and post-closed call **MUST** return that exact Promise object.
The task and either deadline **MUST NOT** be replaced or restarted.
<!-- /RPC-LIFE-001 -->

**RPC-LIFE-002 — Synchronous mode selection.** `shutdown()` **MUST** synchronously commit `draining` and `G`.
`close()` during active or draining **MUST** synchronously commit `closing(forced)` and `F`. A `close()` after
the Owner already entered `closing(graceful)` **MUST** only return the task; it **MUST NOT** force again, resend
Close, or restart cleanup.
<!-- /RPC-LIFE-002 -->

**RPC-LIFE-003 — Generation authority and unique termination.** Recovery, `G`, `F`, state mutation, and event
publication **MUST** carry the current generation authority so a reentrant later generation permanently fences
stale state and events. A committed call/stream terminal, telemetry record, or finite post-`F` effect tail
**MUST** remain authoritative and execute at most once. These cutoffs **MUST** still reuse the exact single
termination Promise required by RPC-LIFE-001 across every `shutdown()` and `close()` call.
<!-- /RPC-LIFE-003 -->

### 13.1 Graceful cutoff and drain

**RPC-SHUTDOWN-015 — Non-stream G roots.** At `G`, Framework **MUST** atomically reject new connect, listen,
expose, unary application work, fresh/resume binding, and listener acceptance; abort every listener and
non-active bootstrap; preserve the finite pre-`G` Pending/admitted unary, handler, replay/control/ACK, and send
roots eligible for drain; and freeze the cutoff snapshot before emitting `owner-draining`.
<!-- /RPC-SHUTDOWN-015 -->

**RPC-SHUTDOWN-011 — Local Stream Admission cutoff.** `G` and each Local Stream Subscription Admission
**MUST** be atomically ordered. If `G` wins, subscription **MUST** fail through the Observable error channel as
`unavailable` before argument inspection or any work/stream/Receive-Slot reservation, identity, wire state, or
remote execution. A facade or cold Observable created before `G` **MUST NOT** grant admission; if Local
Admission wins first, its finite identity-free Pending Stream root **MAY** continue through graceful drain.
<!-- /RPC-SHUTDOWN-011 -->

**RPC-SHUTDOWN-002 — Snapshot membership.** The grace barrier **MUST** include Sessions connected at `G` and
already counter-draining Sessions with a current binding. Their pre-G Pending work **MUST** remain eligible for
Outgoing Admission, and their admitted calls, replay/control/ACK, queued/running handlers, and current send
**MUST** continue. A Session already recovering at `G` **MUST** be locally forced immediately: Pending becomes
`unavailable`, admitted work without terminal becomes `outcome-unknown`, and peer reason is `forced-close`.
<!-- /RPC-SHUTDOWN-002 -->

**RPC-SHUTDOWN-003 — Post-G ingress.** A valid expected remote call arriving on a draining current binding
after `G` **MUST** still pass fixed/security/sequence/ordinal validation, then use protected Remote Resource
Rejection before route lookup, advance receipt, and create no incoming event. Malformed input, gap, or reserved
`then` **MUST** retain its normal fault scope.
<!-- /RPC-SHUTDOWN-003 -->

**RPC-SHUTDOWN-012 — Remote Stream Admission cutoff.** A captured stream route **MUST NOT** by itself cross
`G`: if `G` wins before Remote Stream Admission, Framework/Protocol **MUST** release the capture and ordinary
provisional reservations, retain the protected terminal claim, and reject as `unavailable` without invoking a
method, getter, or `subscribe()`. A fresh expected stream start received after `G` **MUST** first complete fixed,
security, current-binding, sequence, and Stream-Ordinal validation, then commit that protected rejection before
route lookup; malformed, gap, reuse, or disposition failure **MUST** keep its normal fault scope.
<!-- /RPC-SHUTDOWN-012 -->

**RPC-SHUTDOWN-013 — Graceful admitted progress.** `G` **MUST** freeze the finite set of pre-cutoff roots, not
an admitted stream's future item prefix. Existing streams **MUST** remain eligible for Source Start, source
emission, item admission and Observer delivery, credit re-arm, cancel, terminal, ACK, replay, and evidence
retirement. `G` **MUST NOT** fabricate cancellation, completion, or Source teardown; an infinite or silent
Source with no terminal or caller unsubscribe **MAY** therefore prevent drain until the absolute grace deadline
executes `F`.
<!-- /RPC-SHUTDOWN-013 -->

**RPC-SHUTDOWN-016 — Draining binding-loss stream convergence.** Loss of a draining current binding **MUST**
locally force only that Session with reason `forced-close` and **MUST NOT** start Recovery. Its identity-free
Pending Streams **MUST** fail as `unavailable`; admitted Subscribers without an authoritative terminal **MUST**
fail as `outcome-unknown`; local Sources **MUST** preserve an existing winner or select `terminated`, fence
callbacks, and teardown once; and all local stream slots/evidence **MUST** converge. Healthy Acceptor siblings
**MUST** continue draining against the original Owner-wide deadline.
<!-- /RPC-SHUTDOWN-016 -->

**RPC-SHUTDOWN-014 — Complete drain predicate.** A Session **MUST** be considered drained only when one
non-awaiting observation proves all unary and stream roots, work, effects, and evidence have converged:

```text
pendingInvocationCount == 0
pendingStreamSubscriptionCount == 0
unretiredCallEntryCount == 0
unretiredSubscriberStreamEntryCount == 0
unretiredSourceStreamEntryCount == 0
queuedHandlerCount == 0
runningHandlerCount == 0
queuedSourceStartJobCount == 0
runningSourceStartJobCount == 0
activeSourceSubscriptionCount == 0
pendingSubscribeOrTeardownLatchCount == 0
streamMutationOrEffectInProgressCount == 0
streamTerminalEffectShellCount == 0
streamReceiveSlotOrOutstandingGrantCount == 0
streamCreditDueCount == 0
ordinaryAdmittedFutureRecordCount == 0
replayEntryCount == 0
terminalOrCancelQueueCount == 0
ackDirty == false
sendSlot == idle
ingressDispositionInProgress == false
ingressBacklogCount == 0
replayBarrier == complete
```

An implementation **MAY** prove these categories through shared counters and ownership invariants rather than
parallel stream-only counters. Every terminal, replay ACK, queue unlink, Observer suppression, teardown
settlement, and Source `onReleased` callback that can clear the final blocker **MUST** re-evaluate drain
immediately; no later timer, probe, or unrelated ingress event may be required to send the graceful Close shell.
<!-- /RPC-SHUTDOWN-014 -->

**RPC-SHUTDOWN-010 — Drain exclusions.** A due activity probe/Pong **MUST NOT** prevent drain. No smaller proxy
such as “no calls” **MAY** replace the complete predicate.
<!-- /RPC-SHUTDOWN-010 -->

### 13.2 Graceful Session-close

**RPC-SHUTDOWN-006 — Egress shell.** Once drained, Framework/Protocol **MUST** atomically stop Session ingress,
commit local peer `closed(graceful-shutdown)`, and extract a bounded egress shell holding only the exact current
Connection, fixed Close bytes, deadline, and fence token. All other Session evidence **MAY** then be released.
<!-- /RPC-SHUTDOWN-006 -->

**RPC-SHUTDOWN-007 — One attempt.** An egress shell **MUST** invoke `send({kind:"close"})` at most once; invocation
itself consumes the opportunity. Fulfillment **MUST** trigger Direct Close immediately. Rejection or Connection
terminal **MUST** also trigger Direct Close without retry. Sender **MUST NOT** await remote receipt, ACK, or reply.
<!-- /RPC-SHUTDOWN-007 -->

**RPC-SHUTDOWN-008 — Parallel grace.** All cutoff Sessions **MUST** drain in parallel against one Owner-wide
non-sliding grace deadline. One Session's local force or shell failure **MUST NOT** prematurely force a healthy
sibling. Grace completes when every cutoff Session either completed its shell or reached authoritative/forced
terminal and Direct Close was invoked; an initially empty snapshot **MUST** complete immediately.
<!-- /RPC-SHUTDOWN-008 -->

**RPC-SHUTDOWN-017 — Remote Close stream convergence.** A valid Close on the exact current protected binding
**MUST** atomically terminal the Session `remote-terminated`, settle calls/handlers, and converge both stream
directions. A Subscriber with an already authoritative terminal **MUST** preserve it; otherwise it **MUST**
finish as `outcome-unknown`. A local Source **MUST** preserve an existing winner or select `terminated`, fence
callbacks, teardown once, and release its stream slots/evidence. Framework/Protocol **MUST** then update
membership and Direct Close without ACK, stream terminal, Pong, Close reply, or Recovery. An Acceptor sibling
**MUST NOT** be affected, and a stale-binding Close **MUST** be a no-op.
<!-- /RPC-SHUTDOWN-017 -->

### 13.3 Forced cutoff and cleanup

**RPC-CLOSE-002 — Drop unsent intents.** Force **MUST** discard every replay/terminal/cancel/ACK/probe/Close
intent whose `send()` has not been invoked, fence all current/handshaking/fenced endpoints, and invoke Direct
Close. It **MUST NOT** wait for a send slot, start Recovery, or send Protocol Close. A send already invoked is
only a finite prefix and its late completion **MUST** be fenced.
<!-- /RPC-CLOSE-002 -->

**RPC-CLOSE-003 — No-Session peer.** Connector `shutdown()` while unbound/connecting **MUST** abort the attempt
and close its stable peer normally as `graceful-shutdown`; public `close()` **MUST** close it normally as
`forced-close`. No Session or Protocol Close is created. An empty Acceptor **MUST** move directly to cleanup.
<!-- /RPC-CLOSE-003 -->

**RPC-CLOSE-004 — Forced Session batch.** `F` **MUST** close one Session as a non-awaiting two-phase batch. It
**MUST** first gate new work, fence every stream and select or preserve every call/stream terminal winner, then
unlink Pending work and discard all unsent replay/control/ACK/probe/Close evidence. It **MUST** fence the exact
Endpoint and invoke Direct Close before executing any deferred Observer terminal, handler-abort, Source
teardown, release, event, or Promise-settlement effect. No phase of this batch **MAY** emit Protocol egress.
<!-- /RPC-CLOSE-004 -->

**RPC-CLOSE-005 — Forced stream outcome matrix.** At `F`, an identity-free Pending Stream **MUST** finish as
`failed(unavailable)`, an admitted Subscriber stream with no authoritative remote terminal **MUST** finish as
`failed(outcome-unknown)`, and an existing winner **MUST** remain unchanged. An active Source with no winner
**MUST** select local `terminated`; none of these forced outcomes **MAY** create Protocol egress.
<!-- /RPC-CLOSE-005 -->

**RPC-CLOSE-006 — Reentrant stream cutoff order.** Force selected from an item callback, Source subscription,
or Source teardown **MUST** preserve the already committed first terminal winner and the global effect order.
In particular, a Source teardown that reenters Owner `close()` **MUST** finish teardown and release, publish its
single `stream-finished`, and only then publish that peer's `peer-closed`, `owner-closing`, and final topology
events. Later Source callbacks, terminal attempts, and sibling emissions **MUST NOT** replace or revive work.
<!-- /RPC-CLOSE-006 -->

**RPC-CLOSE-007 — Session-force scope.** A Session already recovering at `G`, a draining current-binding loss,
and an authoritative Remote Close **MUST** each reuse the same stream convergence primitive and exact local
outcome matrix. The first two **MUST** use `forced-close`; Remote Close **MUST** use `remote-terminated`.
Each cutoff **MUST** affect only its Session, **MUST NOT** force healthy Acceptor siblings, and **MUST** fence a
late replacement or stale binding. Simultaneous peer shutdown **MUST NOT** be treated as proof of stream
completion.
<!-- /RPC-CLOSE-007 -->

**RPC-CLEANUP-001 — Two intervals.** `shutdown()` grace **MUST** last at most one configured
`shutdownDeadlineMs`; expiry **MUST** execute `F`. After successful grace or `F`, Owner **MUST** start exactly one
Owner-wide absolute non-sliding cleanup deadline of the same length. Thus graceful total is at most two
configured intervals (default 10 seconds) and direct close at most one (default 5 seconds), independent of peer
count.
<!-- /RPC-CLEANUP-001 -->

**RPC-CLEANUP-002 — Cleanup barrier.** Framework **MUST** wait exactly once, by resource identity, for handed-off
Connection, listener, and accepted startup cleanup plus Protocol-owned `cleanup()`. Running handlers, actual
WebCrypto execution, and egress notification success **MUST NOT** be in the barrier. Deadline **MUST** fence and
detach a broken resource and consume late settlement; Framework cannot promise to stop arbitrary third-party
code outside the seam.
<!-- /RPC-CLEANUP-002 -->

**RPC-CLEANUP-003 — Task outcome.** Grace timeout, explicit mode escalation, Protocol/call fault, Session force,
or Close-notification send failure **MUST NOT** reject the shared task by itself. Only owned cleanup rejection or
cleanup timeout **MUST** reject it. One error **MUST** reuse the trusted local Error; multiple errors **MUST** form
a standard `AggregateError` in stable resource-admission order.
<!-- /RPC-CLEANUP-003 -->

**RPC-CLEANUP-004 — Final ordering.** At `G`, Framework **MUST** emit committed state/membership then
`owner-draining` and applicable `peer-draining`. It **MUST** emit `owner-closing` only after successful grace or
`F`; every related `call-finished` **MUST** precede that peer's `peer-closed`. Final cleanup **MUST** commit Owner
closed state, emit final state streams and complete them, emit the single `topology-closed`, complete `event$`,
and only then fulfill/reject the cached task.
<!-- /RPC-CLEANUP-004 -->

**RPC-CLEANUP-005 — Stream effects and absolute deadlines.** A Source teardown return or throw and an Observer
or finalizer return or throw **MUST NOT** restart, extend, or enter either Owner-wide absolute deadline and
**MUST NOT** reject the termination task. Teardown failure **MUST** remain a payload-free local incident;
Observer failure **MUST** use RxJS host reporting without rolling back disposition, creating a second terminal,
or poisoning cleanup. Framework **MUST NOT** claim it can preempt a synchronous application callback that
blocks the JavaScript event loop.
<!-- /RPC-CLEANUP-005 -->

## 14. Conformance and release evidence

### 14.1 Requirement traceability

**RPC-EVIDENCE-001 — Stable mapping.** Every normative requirement ID in this document **MUST** have exactly one
row in the repository requirement matrix and at least one reproducible evidence reference. IDs **MUST NOT** be
renumbered or reused after publication. Matrix references **MUST** resolve to an existing test case, vector,
transcript, instrumented probe, review artifact, or installed-package consumer.
<!-- /RPC-EVIDENCE-001 -->

**RPC-EVIDENCE-004 — Immutable legacy ledger.** The machine-readable registry **MUST** preserve the 153 active
legacy Requirement propositions, retire exactly 48 disjoint legacy Requirement IDs with explicit replacement
edges, retain the 44 adjudicated raw verdict identities and five KAT identities, and tombstone every renamed raw
or transcript Case with explicit replacement identities. A retired identity **MUST NOT** re-enter the active
Requirement or canonical Case classes.
<!-- /RPC-EVIDENCE-004 -->

**RPC-EVIDENCE-005 — Exact selector uniqueness.** Every Evidence selector **MUST** be globally unique and
resolve exactly one committed specification, test/probe, schema node, raw vector, transcript scenario/step,
security vector/action, browser result, installed-package consumer, documentation check, or reproducibility
result. A directory, range, aggregate label, placeholder digest, or selector that resolves zero or multiple
objects **MUST NOT** count.
<!-- /RPC-EVIDENCE-005 -->

**RPC-EVIDENCE-006 — Closed evidence classes.** Evidence **MUST** classify specification, type, runtime,
Protocol, Transport, schema, raw, transcript, security, browser, package, documentation, and reproducibility
results. Every recorded not-applicable class **MUST** carry a concrete reason; an empty or unexplained `N/A`
**MUST NOT** pass.
<!-- /RPC-EVIDENCE-006 -->

**RPC-EVIDENCE-007 — Production acceptance metadata.** Every canonical Case **MUST** identify its public seam,
input, independently expected truth, failure owner, positive or negative baseline, exact evidence selectors, and
status. Negative evidence **MUST** name the expected failure owner. A throwaway prototype, private implementation
path, skipped/flaky allowance, or self-reported corpus `covers` field **MUST NOT** become production acceptance.
<!-- /RPC-EVIDENCE-007 -->

**RPC-EVIDENCE-008 — Canonical Case coverage.** Every canonical Case **MUST** cover a non-empty duplicate-free
set of active Requirement IDs. A canonical Case **MUST NOT** cover a retired, unknown, range-owned, or shorthand
Requirement identity.
<!-- /RPC-EVIDENCE-008 -->

**RPC-EVIDENCE-009 — Bidirectional graph inverse.** The authoritative Requirement-to-Case matrix and every
canonical Case `covers` array **MUST** be exact inverse sets. Every canonical Case-to-Evidence array and every
Evidence-to-Case array **MUST** likewise be exact inverse sets; neither side may invent or omit an edge.
<!-- /RPC-EVIDENCE-009 -->

**RPC-EVIDENCE-010 — Mutually exclusive Case classes.** Every Case identity **MUST** resolve exactly once as
canonical, support-only, or retired. A support-only Case **MUST** cover no Requirement and **MUST** support at
least one canonical Case. Support-only source/layout scans and throwaway probes **MUST NOT** turn a Requirement
green by themselves.
<!-- /RPC-EVIDENCE-010 -->

**RPC-EVIDENCE-011 — Zero incomplete graph.** Final acceptance **MUST** contain only verified active
Requirements, canonical/support Cases, edges, selectors, and results, with zero orphan, partial, planned,
missing, skipped, todo, only, or flaky entry. The validator **MUST** report each unfinished node rather than
coercing it to verified.
<!-- /RPC-EVIDENCE-011 -->

**RPC-EVIDENCE-012 — Public-seam observation.** Canonical proof **MUST** observe the current production tree or
the same installed authoritative tarball through public caller, Protocol, Transport, package, browser, document,
or published corpus seams. Importing a private Codec/implementation deep path, reading a throwaway prototype,
or testing a second package build **MUST NOT** satisfy a canonical Case.
<!-- /RPC-EVIDENCE-012 -->

**RPC-EVIDENCE-013 — Complete active proposition registry.** The immutable authority set **MUST** contain
exactly 343 distinct active IDs and their complete propositions, including the `methods` negative in
`RPC-DESC-006`, and remain disjoint from exactly 48 retired Requirement IDs. Range shorthand and a regex count of
current specification markers **MUST NOT** replace the authoritative key comparison. Each proposition **MUST**
be the unnormalized raw UTF-8 bytes from its column-zero opening marker through the byte before the single
structural LF that immediately precedes its unique matching `<!-- /RPC-ID -->` close line. BOM, CR, invalid UTF-8,
missing, mismatched, duplicate, nested, crossed, orphan, or retired markers and closes **MUST** fail closed.
<!-- /RPC-EVIDENCE-013 -->

**RPC-EVIDENCE-014 — Exact node resolution.** Every Requirement, Case, Evidence, replacement, `covers`,
`supports`, and matrix reference **MUST** resolve exactly once to one mutually exclusive node class. Unknown,
orphaned, multiply classified, or cross-class duplicate identities **MUST** block acceptance.
<!-- /RPC-EVIDENCE-014 -->

**RPC-EVIDENCE-015 — Duplicate-free edges.** Every matrix `cases`, canonical/support Case `covers`/`supports`,
Case `evidence`, Evidence `cases`, and retirement `replacements` array **MUST** be duplicate-free. Set equality
**MUST NOT** hide duplicate serialized edges.
<!-- /RPC-EVIDENCE-015 -->

### 14.2 Conformance runners

`@husky-di/remote/conformance` exports three framework-neutral asynchronous runners:

```typescript
export enum RpcConformanceStatusEnum {
  passed = "passed",
  failed = "failed",
}

export type RpcConformanceFailure = Error & {
  readonly caseId: string;
};

export type RpcConformanceCaseResult =
  | { readonly caseId: string; readonly status: RpcConformanceStatusEnum.passed }
  | { readonly caseId: string; readonly status: RpcConformanceStatusEnum.failed;
      readonly error: RpcConformanceFailure };

export type RpcConformanceReport = (result: RpcConformanceCaseResult) => void;

export type RpcConformanceOptions = {
  readonly report?: RpcConformanceReport;
};

export interface IRpcProtocolConformanceFixture {
  readonly protocol: IRpcProtocol;
  readonly counterExhaustionProtocol: IRpcProtocol;
  createActiveProtocolFaultMessage(): Uint8Array;
}

export interface IRpcAdapterConformanceRemote {
  sendToAdapter(message: Uint8Array): Promise<void>;
  receiveFromAdapter(): Promise<Uint8Array>;
  setAdapterSendBlocked(blocked: boolean): Promise<void>;
  closeFromRemote(): Promise<void>;
  failFromRemote(error: Error): Promise<void>;
  isAdapterClosed(): boolean;
  waitForAdapterClose(): Promise<void>;
}

export interface IRpcConnectorAdapterConformanceFixture {
  create(): Promise<{
    readonly adapter: IRpcConnectorAdapter;
    handoff(firstMessage?: Uint8Array): Promise<IRpcAdapterConformanceRemote>;
    failStartup(error: Error): Promise<void>;
    cleanup(): Promise<void>;
  }>;
}

export interface IRpcAcceptorAdapterConformanceFixture {
  create(): Promise<{
    readonly adapter: IRpcAcceptorAdapter;
    accept(firstMessage?: Uint8Array): Promise<IRpcAdapterConformanceRemote>;
    markReady(): Promise<void>;
    completeListener(): Promise<void>;
    failListener(error: Error): Promise<void>;
    cleanup(): Promise<void>;
  }>;
}

export function runRpcProtocolConformance(
  fixture: IRpcProtocolConformanceFixture,
  options?: RpcConformanceOptions,
): Promise<void>;

export function runRpcConnectorAdapterConformance(
  fixture: IRpcConnectorAdapterConformanceFixture,
  options?: RpcConformanceOptions,
): Promise<void>;

export function runRpcAcceptorAdapterConformance(
  fixture: IRpcAcceptorAdapterConformanceFixture,
  options?: RpcConformanceOptions,
): Promise<void>;
```

Their fixture/options types are structural test tooling; they do not extend the production Owner lifecycle.

**RPC-CONFORMANCE-001 — Runner result.** Each runner **MUST** be independent of Vitest/Jest, fulfill `void` on
success, and reject an `AggregateError` whose `errors` are `RpcConformanceFailure` objects in stable case order
on failure. It **MUST** run all cases that remain possible after a case failure and call a contract-valid
non-throwing reporter once after each attempted case with the same failure object used by `AggregateError`.
Case IDs **MUST** be documented by the conformance entry point, remain stable after publication, and use plain
`string` rather than a closed exported literal union so additive cases do not break fixture types. It
**MUST NOT** expose Default-Protocol private wire/module types through its fixture contract.
<!-- /RPC-CONFORMANCE-001 -->

**RPC-CONFORMANCE-004 — Stream Protocol and broken-seam diagnostics.** The Protocol runner **MUST** execute
stable stream cases for outgoing reserve/commit/start/cancel, incoming pre-route admission and semantic
rejection, projection disposition/re-arm, Source reserve-before-raw and W=1 overflow, terminal teardown and
release, Recovery without resubscription, resource-fault counters, fairness progress, graceful/forced shutdown,
bounded aggregate load, and deliberately broken Protocol diagnostics. Each failed case **MUST** identify its
own stable case ID without depending on the built-in wire representation. The stable stream IDs **MUST** be
`protocol.stream.outgoing-lifecycle`, `protocol.stream.incoming-resource-before-route`,
`protocol.stream.incoming-semantic-unknown-member`, `protocol.stream.projection-rearm`,
`protocol.stream.source-reserve-before-raw`, `protocol.stream.source-w1-overflow`,
`protocol.stream.item-before-terminal`, `protocol.stream.over-credit-session-fault`,
`protocol.stream.terminal-teardown-release`, `protocol.stream.recovery-no-resubscribe`,
`protocol.stream.fairness-progress`, `protocol.stream.shutdown-graceful-force`,
`protocol.stream.aggregate-bounded-load`, `protocol.receipt.terminal-direction-only`, and
`protocol.stream.adapter-rejection-is-binding-failure`.
<!-- /RPC-CONFORMANCE-004 -->

**RPC-CONFORMANCE-005 — Grandfathered Adapter suite and bounded load.** Both Adapter runners **MUST** retain
their exact 24 pre-stream stable case IDs and remain unaware of stream records. They **MUST** cover
subscribe-before-start, handoff/ownership, complete stable message identity/order/hot terminal behavior, one
unsettled send with backpressure, the 1 MiB floor, abort/startup/close races, listener/Connection isolation, and
Acceptor overflow using a fresh single-use fixture per case. Every Adapter runner case ID **MUST** begin with
every applicable canonical `RPC-TRANSPORT-*` requirement ID, followed by its stable descriptive role/case name;
structural runner case IDs **MUST NOT** claim `RPC-TRANSPORT-012`. Fixture drivers **MUST** control only the
remote/test side, preserve supplied Error identity, and release only fixture-owned external resources; they
**MUST NOT** close or settle candidate-owned resources on its behalf. Deterministic aggregate Protocol load **MUST** run
over this bounded three-capability Connection: an Adapter send rejection is a binding failure that enters
Recovery and **MUST NOT** become Stream Overflow. The Protocol runner **MUST** kill all five fixed broken-Protocol
mutants through real candidate transactions, with the exact one-to-one failure mapping: over-credit acceptance
to `protocol.stream.over-credit-session-fault`, terminal-before-item ordering to
`protocol.stream.item-before-terminal`, Recovery Source reacquisition to
`protocol.stream.recovery-no-resubscribe` after binding loss, a replacement Connection, and `recovered` while
the preexisting Source root remains retained; one-direction terminal-ACK over-retirement to
`protocol.receipt.terminal-direction-only`, and Adapter rejection projected as overflow to
`protocol.stream.adapter-rejection-is-binding-failure`. A mutant case that merely throws without exercising its
Protocol candidate **MUST NOT** count as a kill. The terminal-ACK mutant transaction **MUST** inject the ACK while
reverse start, credit, cancel, and root evidence remain independently unacknowledged.
<!-- /RPC-CONFORMANCE-005 -->

### 14.3 Default corpus and abnormal-state matrix

**RPC-CORPUS-001 — Published corpus.** `husky-di-rpc/1` **MUST** publish JSON Schema 2020-12, valid/invalid raw
bytes, JCS/HKDF/HMAC known-answer vectors, and stateful transcripts. Schema **MUST NOT** substitute for raw UTF-8,
BOM, duplicate-key, trailing-data, number, limit, base64, or allocation-boundary cases.
<!-- /RPC-CORPUS-001 -->

**RPC-CORPUS-003 — State disagreement.** Release tests **MUST** inject at least: responder installed binding with
lost accept; initiator still connected after responder fenced old epoch; durable receipt with lower resume cursor;
simultaneous replacement while old Connection continues; out-of-order higher/lower crypto completion; Close vs
loss/force; late accept/reject after timeout/cutoff; and responder key loss while initiator recovers. Legal
disagreement **MUST** converge through higher attempt/replay; unprovable continuity **MUST** expose the specified
continuity/expiry/outcome-unknown boundary and **MUST NOT** redispatch a Logical Call.
<!-- /RPC-CORPUS-003 -->

**RPC-CORPUS-005 — Atomic final corpus replacement.** The final `husky-di-rpc/1` corpus **MUST** publish exactly
`schema.json`, `raw-vectors.json`, `transcripts.json`, and `known-answer-vectors.json` at their existing package
subpaths with one identical final internal revision. The package **MUST NOT** retain a legacy sibling, alias,
archive, alternate runner, or second profile asset for the replaced pre-1.0 grammar.
<!-- /RPC-CORPUS-005 -->

**RPC-CORPUS-006 — Final schema and raw grammar.** The published Schema and raw corpus **MUST** cover the final
eleven-member Semantic Message union, both start shapes, every stream item/control/terminal and safe stream
error code, closed nested errors, tagged open tails, directional identity/ordinal/horizon/boundary limits, and
all lexical/fixed/application/complete-message limits with independent valid and invalid vectors. The raw corpus
**MUST** retain the 44 adjudicated legacy byte verdicts, use only the nine adjudicated replacement identities,
and contain no tombstoned raw ID. It **MUST** include exact `1,003,259 B` method and `1,000,174 B` item envelopes,
the `65,546`-node envelope, exact 1 MiB, and independent limit-plus-one rejections.
<!-- /RPC-CORPUS-006 -->

**RPC-CORPUS-007 — Stateful action/effect transcripts.** The final transcript corpus **MUST** replace all 14
legacy scenario identities with their adjudicated `unary-*` or `session-*` identities, preserve the 42 semantic
step slugs one-to-one, and include the 13 required stream adversarial scenarios. An independent action-prefix
oracle output `independentTranscriptResults` **MUST** contain exactly 68 ordered rows, recomputing each expected
effect without copying corpus assertions or production traces. Installed public A output
`transcriptPublicProjectionResults` **MUST** contain exactly 62 ordered rows, each from a fresh Protocol and
Connection replay of the selector's complete
reachable action prefix using only public transitions, captured bytes, independently decoded ACKs, callback and
liveness effects. Each public row **MUST** bind distinct ordered `outbound` send captures and `inbound` records
only when the peer ingress is actually invoked; a direction label **MUST NOT** substitute for that flow ledger.
Its final verdict **MUST** conjoin the stable projection, captured identity and ACK derivation, exact replay,
complete ordered fresh-branch projections, both ordered race operations including the late loser, and the required
inbound/outbound coverage. Every public row **MUST** also bind a content-addressed canonical evidence tuple,
independently recomputed component digests, the causal wire trace and source-capture relationships, and
complete causal action coverage. Recovery rows **MUST** bind decoded resume coordinates and cursor relations plus public
operation receipts. Authenticated continuity-reject rows **MUST** bind the changed prerequisite ACK as hostile
ingress, the unmodified resume/reject bytes, the pending reject send, its single release, both continuity
terminals, the physical close, and the target Call's one `failed/outcome-unknown` finish. The public MAX row **MUST** run each of its two exact vectors through a
distinct fresh installed Protocol/Connection child and observe exactly one real Protocol delivery per child. Graceful shutdown
rows **MUST** bind the two-action Close-ingress/transport-close facts and their physical close receipt. Property
poisoning rows **MUST** bind both the source-derived patch and the zero-effect/protocol-fault transaction. Race
rows **MUST** bind one invocation and one delegate-boundary receipt for both operations; skipping the late loser
**MUST** fail evidence even when the winning projection is unchanged. Deleting either required flow, deleting,
duplicating, or reordering a branch, changing any single branch terminal, breaking a source relationship, or
changing a reported component digest without changing the canonical tuple **MUST** fail the row even when its
parent projection is unchanged. The remaining six exact `transcriptOracleOnlySelectors` are the protected-tail/MAX coordinates
fixed by the corpus authority; they **MUST NOT** be injected through a hook, private state, or new public API.
Internal binding, counter, queue, resource, retained-evidence, validation-phase, or next-record vocabulary belongs
only to the independent model and **MUST NOT** be presented as a public production observation.
<!-- /RPC-CORPUS-007 -->

**RPC-CORPUS-008 — Independent KAT provenance and security actions.** The five adjudicated JCS, HKDF, HMAC, and
profile-proof KAT identities and inputs **MUST** be independently recomputed and retain source/reference,
generator artifact, input, and output digests. The same asset **MUST** include stateful stream cursor/lost-ACK,
old-binding fence, wrong-proof retention, Recovery terminal/no-resubscription, post-G validation,
Protected-Transport, and payload/error-redaction actions with exact expected effects. Active stream records
**MUST NOT** invent a per-record MAC. Byte-identical cryptographic truth **MUST NOT** be changed merely to create
a corpus diff.
<!-- /RPC-CORPUS-008 -->

**RPC-CORPUS-009 — Unary and stream resource boundaries.** Every fixed or configurable unary and stream runtime
resource limit **MUST** have `limit-1`, `limit`, and `limit+1` evidence, including application-work and active-
stream subsets, Source Start Jobs and retained Source Items, Subscriber Receive Slots, replay and protected-tail
claims, final sequence/Call/Stream/Item counters, scheduler fairness under replay/control/data/Ping flood, 64-peer
parallel shutdown, withheld ACK, stuck send/close, never-settling handler, and late cryptography. Each boundary
case **MUST** identify the rejecting owner and prove that all admitted capacity is released at its specified
lifetime boundary.
<!-- /RPC-CORPUS-009 -->

**RPC-CORPUS-010 — Complete offline metaschema closure.** A precommitted nonpublic corpus manifest **MUST** bind
the final internal revision and SHA-256 of all four public corpus assets. Its duplicate-free `metaschemaClosure`
**MUST** map canonical URIs to the exact bytes of the Draft 2020-12 root metaschema, every recursively referenced
vocabulary resource, and the independently versioned validator artifact. Schema validation **MUST** run with
only those pinned resources. An unknown URI, canonical URI alias collision, digest mismatch, or any attempted
network load **MUST** fail the gate. The manifest **MUST NOT** be packed or exported as a fifth public asset.
<!-- /RPC-CORPUS-010 -->

**RPC-CORPUS-011 — Installed production raw execution.** An independent duplicate-aware UTF-8/JSON, pinned
Draft 2020-12 schema, and security oracle output `independentRawResults` **MUST** contain exactly 82 ordered rows
from the installed raw-vector segments, binding exact bytes, validity, kind or rejection, reference first-failing phase,
scope, ACK consequence, no-later-effect proof, and oracle digest without copying asset expectations or using ID
patterns. Each no-later-effect proof **MUST** reduce an explicit action prefix through the target fault fence and
an exact same-endpoint legal suffix, and **MUST** derive its verdict from zero suffix application, outbound,
fault, and transition deltas rather than from the vector's validity label.
`invalid-duplicate-profile-offer` **MUST** fail first at `schema`, not `json`. Installed public A
output `rawPublicProjectionResults` **MUST** contain exactly 82 ordered rows produced by injecting those exact
bytes through public `createRpcProtocol()` and a controlled three-member `IRpcConnection` in a reachable context. Each public
invalid row **MUST** bind the actual fault owner, reason, and closed current endpoint; the exact same-endpoint
suffix input and its zero application, outbound, fault, and transition deltas; and a
separate fresh-Protocol liveness result. Outgoing Call and Stream contexts **MUST** bind the
target identity and sequence decoded from real production frames after the required target-sequence-minus-one prefix, and the stable reachable-context
digest **MUST** equal the independent oracle's expected digest. Each public row **MUST** bind the bytes, context,
stable public projection, and runner digests, and **MUST NOT expose or infer an internal validation phase**,
private state, or Error text. The three exact MAX truths remain owned by the
installed asset and independent oracle; their public projections prove only the reachable public consequences.
The private-import audit **MUST** fail closed for static, side-effect, re-export, literal dynamic, template dynamic,
computed dynamic, and relative `src` specifiers. Private Codec imports, source-tree execution, aggregate counts,
and reading the manifest as its own oracle do not count.
<!-- /RPC-CORPUS-011 -->

**RPC-CORPUS-012 — Independent and installed security cross-check.** The same installed candidate used for raw
execution **MUST** read all five preserved KATs by exact ID and use the pinned independent RFC/Node oracle to
recompute each exact output from the installed input. The runner **MUST** emit a per-ID
`independentKatResults` ledger with input/output, oracle, and runner digests. Public production checks **MUST**
use only installed `createRpcProtocol()` and controlled three-member `IRpcConnection` instances, and **MUST**
separately emit two attributable `embeddedJcsProductionResults`, the four named fresh/resume
`profileProofProductionResults`, and all seven named `securityActionProductionResults`. Each production result
**MUST** bind its public transaction's exact input/output or action/effect digests to an independent expected
truth. Generic RFC HKDF/HMAC fixed inputs and the fixed profile transcript are not reachable through that public
Protocol domain and **MUST NOT** be injected through a new API, test hook, private import, monkeypatch, or extra
export. Aggregate counts, including `productionKatCrossChecks: 5`, and agreement between two invocations of the
same production implementation are not evidence.
<!-- /RPC-CORPUS-012 -->

### 14.4 Type, runtime, and package compatibility

**RPC-RELEASE-002 — Runtime targets.** Release **MUST** pass Node `>=23.6` and lockfile-pinned Playwright Chromium,
Firefox, and WebKit, including WebCrypto vectors, cross-realm AbortSignal/intrinsic listener behavior, facade
assimilation, Recovery, and termination. Deno, Bun, and Workers **MAY** run non-blocking smoke checks only.
<!-- /RPC-RELEASE-002 -->

**RPC-RELEASE-003 — Packed consumers.** CI **MUST** install the actual `pnpm pack` tarball into isolated Node ESM,
Node CJS, declaration, DOM-only, and browser-bundle consumers and resolve every public code/wire subpath. Source
imports inside the workspace **MUST NOT** count as package evidence. Private deep import **MUST** fail.
<!-- /RPC-RELEASE-003 -->

**RPC-RELEASE-004 — Release contents.** A stable release **MUST** include this specification, requirement matrix,
normative suite, architecture source and rendered diagram, caller and implementor documentation, wire corpus,
CHANGELOG, and a Changeset that moves
`@husky-di/remote` from `0.0.0` to `1.0.0`. Build, code-standard, type, conformance, corpus, packed-consumer, and
browser gates **MUST** pass without skips.
<!-- /RPC-RELEASE-004 -->

**RPC-RELEASE-005 — Independent Adapters.** A package claiming v1 Adapter compatibility **MUST** depend on a
compatible `@husky-di/remote` major, import only public root/transport/conformance paths, run the matching shared
runner and its own platform admission/framing/fuzz/security suite, and document finite native frame/queue limits
and secure deployment conditions. Core **MUST NOT** add Adapter-specific special cases.
<!-- /RPC-RELEASE-005 -->

**RPC-RELEASE-006 — Clean actual tarball authority.** Release acceptance **MUST** begin only after version and
CHANGELOG changes are effective in a clean workspace with no stale `dist`. A clean build **MUST** produce one
actual `.tgz`; every installed gate and the publish command **MUST** consume those same bytes. A directory,
workspace link, source path alias, rebuilt tarball, or independently repacked candidate **MUST NOT** substitute.
<!-- /RPC-RELEASE-006 -->

**RPC-RELEASE-007 — Native Node consumers.** One installed candidate tarball **MUST** pass independent native
Node ESM and CJS consumers. Each consumer **MUST** load the root and all three specialist code subpaths, read all
four JSON subpaths, execute a mixed unary/real-RxJS stream facade smoke, and reject a private deep import.
<!-- /RPC-RELEASE-007 -->

**RPC-RELEASE-008 — Strict installed declarations.** Installed declarations **MUST** compile in isolated strict
consumers with `skipLibCheck: false` and without workspace source resolution. Positive imports and targeted
negative diagnostics **MUST** cover root, Protocol, Transport, Conformance, descriptor, stream, and policy APIs.
<!-- /RPC-RELEASE-008 -->

**RPC-RELEASE-009 — Installed DOM and browser runtime.** The same installed candidate tarball **MUST** compile a
DOM-only consumer with no ambient Node types, bundle only installed package resolution, and run the designated
stream, Recovery, WebCrypto, cross-realm cancellation, and termination cases in the lockfile-pinned Chromium,
Firefox, and WebKit engines. Workspace links, source imports, path aliases, or a different package build do not
count.
<!-- /RPC-RELEASE-009 -->

**RPC-RELEASE-010 — Exact ESM runtime inventory.** Native ESM namespace own keys for the root and all three
specialist code subpaths **MUST** equal the four RPC-PKG-010 through RPC-PKG-014 runtime manifests exactly.
Inventory **MUST** use `Reflect.ownKeys`: the only additional key is the non-enumerable
`Symbol.toStringTag` descriptor required by a native ESM namespace, and any other non-enumerable or symbol key
**MUST** fail.
<!-- /RPC-RELEASE-010 -->

**RPC-RELEASE-011 — Independent canonical-tree reproducibility.** Two detached clean worktrees at the same final
commit, toolchain, and lockfile **MUST** independently install, build, and pack with no prior `dist` or cache. The
resulting canonical tar trees—path, type, mode, and content SHA-256 with packaging timestamps ignored—**MUST** be
identical. Worktree B proves only reproducibility and **MUST NOT** become artifact or publish authority.
<!-- /RPC-RELEASE-011 -->

**RPC-RELEASE-012 — Post-version release workflow.** The release workflow **MUST** run `changeset version` before
the final frozen install/build/test/pack cycle. It **MUST** then rerun code, type, conformance, corpus, isolated
consumer, NodeNext, DOM, and all-three-browser gates against the one candidate digest before designating those
bytes final and publishing that exact `.tgz`. A pre-version build or package-directory publish is insufficient.
<!-- /RPC-RELEASE-012 -->

**RPC-RELEASE-013 — Exact CJS runtime inventory.** Native CJS own properties for the root and all three
specialist code subpaths **MUST** independently equal the four RPC-PKG-010 through RPC-PKG-014 runtime manifests.
Inventory **MUST** use `Reflect.ownKeys`: the only additional key is the non-enumerable, immutable
`__esModule: true` descriptor, and any other non-enumerable or symbol key **MUST** fail.
<!-- /RPC-RELEASE-013 -->

**RPC-RELEASE-014 — Declaration-symbol audit.** The TypeScript compiler API **MUST** resolve the installed
emitted declarations and derive each module's exact value/type-only symbol manifest. Source grep, bundler
resolution, or hand-counted imports **MUST NOT** substitute for this audit.
<!-- /RPC-RELEASE-014 -->

**RPC-RELEASE-015 — All code conditions positive.** The root, `/protocol`, `/transport`, and `/conformance`
**MUST** each resolve through installed positive ESM `import`, CJS `require`, and declaration conditions.
<!-- /RPC-RELEASE-015 -->

**RPC-RELEASE-016 — Strict NodeNext MTS.** An isolated `.mts` consumer using `module` and `moduleResolution`
`NodeNext`, `strict: true`, `types: []`, and `skipLibCheck: false` **MUST** compile positive named imports from
all four code subpaths and targeted negative named imports.
<!-- /RPC-RELEASE-016 -->

**RPC-RELEASE-017 — Strict NodeNext CTS.** An isolated `.cts` consumer under the same strict settings **MUST**
use static `import x = require("...")` probes for all four code subpaths so declaration resolution cannot be
hidden by an untyped dynamic `require`. The same require-condition lane **MUST** independently reject every
applicable retired root export, type, member, enum vocabulary, and runtime-policy field with a diagnostic that
identifies the intended missing name.
<!-- /RPC-RELEASE-017 -->

**RPC-RELEASE-018 — Independent legacy negatives.** `RpcCallDirectionEnum`, `RpcPeerResult`,
`RemoteServiceGroup`, `resolveAll`, `unknownMethod`, and `maxPendingInvocationsPerSession` **MUST** each have its
own applicable installed ESM, CJS/runtime, and TypeScript compiler-API negative. Every negative **MUST** identify
the intended missing name or member; one aggregate namespace-key check does not prove them.
<!-- /RPC-RELEASE-018 -->

**RPC-RELEASE-019 — Literal final tar allowlist.** The final candidate canonical tar tree **MUST** exactly equal
a reviewed, committed literal allowlist of every path, entry type, mode, and content SHA-256. The allowlist
**MUST** enumerate package metadata, documentation, all four corpus JSON files, and every actual `dist` entry;
globs, directory wildcards, placeholders, auto-accepting newly discovered entries, and retired output paths such
as `dist/enums/rpc-call-direction.enum.*` are forbidden.
<!-- /RPC-RELEASE-019 -->

**RPC-RELEASE-020 — Complete canonical receipt.** After registry download, the release **MUST** emit an RFC 8785
JCS UTF-8 receipt containing the package/version/final commit/toolchain/lockfile identity, registry provenance,
authoritative/tested/published artifact digests, Case and Evidence registry digests, metaschema/validator
digests, raw/KAT/transcript oracle and production-runner digests, independent JCS provenance, and exact result
counters. It **MUST** also expand every active Requirement, active Case, Evidence selector,
Requirement→Case edge, and Case→Evidence edge into content-bound arrays; profile/range shorthand and digest-only
summaries are insufficient. Every required field **MUST** be present and content-bound.
<!-- /RPC-RELEASE-020 -->

**RPC-RELEASE-021 — Exact minimum Node lane.** At least one installed candidate lane **MUST** execute with exact
`process.version === "v23.6.0"`. A later Node 23 patch, Node 24, an engines declaration, compile target, mocked
version, or non-executed matrix label **MUST NOT** replace that runtime gate.
<!-- /RPC-RELEASE-021 -->

**RPC-RELEASE-022 — pnpm/npm package parity.** On the same final built worktree A, one `pnpm pack
--ignore-scripts` canonical tree, the normalized `npm pack --dry-run --json --ignore-scripts` file list, and the
literal allowlist **MUST** name exactly the same entries. The accepted pnpm tarball **MUST NOT** be rebuilt after
this comparison. Because the pinned pnpm exposes script suppression as npm configuration rather than a `pack`
option, `npm_config_ignore_scripts=true pnpm pack` is the required equivalent invocation.
<!-- /RPC-RELEASE-022 -->

**RPC-RELEASE-023 — Authoritative, tested, and workflow-input byte equality.** The receipt's authoritative,
tested, and `publishedTgzSha256` fields **MUST** all equal the accepted final tarball digest. In this local closure,
the published field binds only the exact workflow publish-input path to A; the receipt **MUST** record
`published: false`, **MUST NOT** claim registry publication or download, and no external publish may be executed.
<!-- /RPC-RELEASE-023 -->

**RPC-RELEASE-024 — Final zero-incomplete gate.** Local release acceptance **MUST** contain zero failed, partial,
planned, missing, skipped, todo, only, or flaky Requirement, Case, Evidence, corpus, consumer, browser, and
release results. A nonzero counter **MUST** prevent the final local receipt. Finalization **MUST** close the exact
A-dependent planned graph boundary through an explicit overlay whose Requirement, Case, and Evidence IDs are
bound to passed fixed release-command evidence; it **MUST NOT** manufacture completion by assigning zero to
counters or by implying an unexecuted publication. Result counters **MUST** be recomputed from the expanded graph
after applying and validating that overlay.
<!-- /RPC-RELEASE-024 -->

**RPC-RELEASE-025 — Receipt provenance binding.** The JCS receipt **MUST** recompute and bind the committed Case
and Evidence registries, complete offline metaschema closure, validator artifact, raw/KAT/transcript independent
oracles and installed production runners, and the JCS implementation provenance. Package, version, authoritative
A digest, tested digest, and workflow publish-input digest **MUST** identify the same local bytes while explicitly
recording that publication did not occur. The command log **MUST** contain each fixed command ID exactly once in
the required order, with exit zero and the command-specific argv shape; each final Evidence overlay entry
**MUST** cite its exact required command IDs.
<!-- /RPC-RELEASE-025 -->

### 14.5 Documentation and migration

**RPC-DOC-001 — Caller guide.** The installed README **MUST** describe mixed `members`, direct cold RxJS
Observables, one owning root per subscription, unsubscription cancellation, stream failure codes, Recovery,
graceful/forced termination, and the pre-1.0 migration. Its executable examples **MUST** use the final public API.
<!-- /RPC-DOC-001 -->

**RPC-DOC-002 — Protocol implementor reference.** `docs/PROTOCOL.md` **MUST** document the final mixed-member
SPI and built-in state-machine contract, including fixed `W=1` credit, cumulative receipt ACK and replay,
ordinary/protected resources, macro/participant fairness, Recovery generations, Graceful Cutoff `G`, Force
Cutoff `F`, security assumptions, the four-file corpus, and conformance ownership.
<!-- /RPC-DOC-002 -->

**RPC-DOC-003 — Transport implementor reference.** `docs/TRANSPORT.md` **MUST** preserve the stream-unaware
three-member `IRpcConnection` seam (`message$`, `send(Uint8Array)`, and `close()`), state finite native frame and
queue limits plus the 1 MiB floor, and assign aggregate-load transport failure to binding failure/Recovery rather
than application Stream Overflow.
<!-- /RPC-DOC-003 -->

**RPC-DOC-004 — Architecture source and render.** The editable architecture source and installed rendered
image **MUST** carry the same diagram payload. They **MUST** show mixed unary/stream members, independent
subscription ownership, stable Peer/Session Recovery, wire flow/resource/fairness state, and the unchanged
Transport seam, without a method-only or Group aggregation node.
<!-- /RPC-DOC-004 -->

**RPC-DOC-005 — Release history.** The CHANGELOG and stable Changeset **MUST** record the `0.0.0` to `1.0.0`
transition, the one-time pre-1.0 `husky-di-rpc/1` profile rewrite, mixed Observable streams, removed Group API,
renamed member/error/policy vocabulary, and the breaking fresh-reconnect cutover. While the source package is
still `0.0.0`, that stable entry **MUST** live in the Changeset and the CHANGELOG **MUST NOT** predeclare a
`1.0.0` heading; `changeset version` **MUST** produce exactly one such heading before the final build.
<!-- /RPC-DOC-005 -->

**RPC-DOC-006 — Runnable examples.** Repository examples **MUST** use `members` and the final interaction kinds.
Multi-peer examples **MUST** compose single-peer facades explicitly and **MUST NOT** use retired Group APIs,
`unknownMethod`, or `maxPendingInvocationsPerSession`. Their documented commands **MUST** typecheck and run.
<!-- /RPC-DOC-006 -->

**RPC-MIGRATION-001 — No in-place draft Session migration.** A Session created by any pre-final draft profile
**MUST** be drained or terminated before deployment. Both endpoints **MUST** upgrade together and establish a
fresh Session on a fresh Connection. Same-version and final cross-package-build conformers still **MUST** prove
ordinary fresh establishment and authenticated resume; that conformance evidence is not a bridge for old bytes.
<!-- /RPC-MIGRATION-001 -->

**RPC-MIGRATION-002 — Group removal has no replacement semantics.** Removal of `resolveAll`,
`RemoteServiceGroup`, and `RpcPeerResult` **MUST NOT** be described as a renamed aggregate operation. Applications
compose single-peer facades themselves, and no common normalization, atomic reservation, cancellation,
fail-fast, wait-all, ordering, or fairness semantics are supplied.
<!-- /RPC-MIGRATION-002 -->

**RPC-MIGRATION-003 — Explicit independent composition.** Promise and RxJS multi-peer examples **MUST** start
from a frozen `acceptor.peers` snapshot and map each peer to an independent child operation. The application
**MUST** visibly own concurrency, peer/result association, error policy, fail-fast or wait-all behavior, and
cancellation; no example may imply Group-wide atomicity or fairness.
<!-- /RPC-MIGRATION-003 -->

**RPC-MIGRATION-004 — Legacy Group engine absent.** The final installed artifact and dispatch graph **MUST NOT**
contain `RemoteServiceGroup`, `RemoteGroupMethod`, or an artifact/route reachable only from the removed Group
invocation path. Generic batching, fan-out, reservation, or `group` helpers that remain reachable from
single-peer, stream, telemetry, or another live path **MUST NOT** be rejected solely by keyword.
<!-- /RPC-MIGRATION-004 -->

## Appendix A. Requirement-to-evidence matrix

The exhaustive one-row-per-ID matrix is [REQUIREMENTS.md](REQUIREMENTS.md). Every active row is verified by the
content-bound release receipt and immutable Case/Evidence registries. This summary groups the same rows only for
navigation.

| Requirement families | Applies to | Minimum evidence | Repository location | Status |
| --- | --- | --- | --- | --- |
| `RPC-BASE`, `RPC-API`, `RPC-STATE`, `RPC-LIFE` | Framework | RT, TY | `tests/specification.test.ts`, `tests/types/` | verified |
| `RPC-PKG`, `RPC-RELEASE` | Distribution | PK, BR, TY | `tests/package/`, `tests/browser/` | verified |
| `RPC-VALUE`, `RPC-DESC`, `RPC-CALL`, `RPC-EVENT` | Framework + all Protocols | RT, TY, PC | `tests/specification.test.ts`, `tests/conformance/` | verified |
| `RPC-START`, `RPC-TRANSPORT` | Framework + Adapters | AC, RT, IR | `tests/conformance/`, Adapter package tests | verified |
| `RPC-SPI` | Custom/default Protocol | PC, TY, RT | `tests/conformance/`, `tests/types/` | verified |
| `RPC-WIRE`, `RPC-ACK`, `RPC-LEDGER` | Default Protocol | RW, TX, RT | `wire/husky-di-rpc-1/`, `tests/wire/` | verified |
| `RPC-SESSION`, `RPC-RECOVERY`, `RPC-SEC`, `RPC-VALID` | Default Protocol / secure deployment | TX, KA, RW, BR | `wire/husky-di-rpc-1/`, `tests/browser/` | verified |
| `RPC-RESOURCE`, `RPC-POLICY`, `RPC-SCHEDULE`, `RPC-TIME`, `RPC-COUNTER` | Framework + Protocol | RP, RT, PC | `tests/resources/`, `tests/specification.test.ts` | verified |
| `RPC-SHUTDOWN`, `RPC-CLOSE`, `RPC-CLEANUP` | Framework + Protocol + Adapter | RT, TX, RP | `tests/specification.test.ts`, `tests/recovery/` | verified |
| `RPC-EVIDENCE`, `RPC-CONFORMANCE`, `RPC-CORPUS` | Distribution | matrix lint, PC, AC, RW, TX, KA | `tests/conformance/`, `wire/husky-di-rpc-1/` | verified |

## Appendix B. Non-normative implementation boundary

This specification does not prescribe private classes, files, reducers, codecs, queues, or scheduler objects.
The Framework should remain a deep module around the public seams. In particular, the public Owner
`close(): Promise<void>`, Protocol runtime `close(): void`, and Physical Connection `close(): Promise<void>` are
three different operations and must not be implemented as aliases.

Concrete WebSocket factory names, native frame/queue defaults, HTTP-server borrowing, origin/TLS options, and
Node WebSocket dependency choice belong to the separate `@husky-di/remote-websocket` package specification.
That package remains subject to this Adapter seam and conformance contract but is not defined here.
