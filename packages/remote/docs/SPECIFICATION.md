# Husky DI Remote RPC Specification

**Version:** 1.0.0  
**Status:** Normative proposal
**Profile:** `husky-di-rpc/1`

## 1. Scope

This specification defines the v1 contract of `@husky-di/remote`: a bidirectional unary RPC Framework,
its caller-facing TypeScript API, its replaceable Protocol and Transport Adapter seams, and the built-in
recoverable JSON Protocol profile. It also defines the evidence required to claim conformance.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, and **MAY** are interpreted as described in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). A normative statement appears only in a paragraph carrying
a stable requirement identifier such as `RPC-CALL-004`. TypeScript shown in this document is normative for
observable shape; helper types used only to express inference may remain unexported.

v1 supports bidirectional unary calls. Notifications, streaming, automatic Container integration, business
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
- **Binding Epoch**: a responder-assigned, monotonically increasing generation that identifies one current
  Physical Connection Binding. It is a fencing generation, not a time-based lease.
- **Physical Connection Binding**: the exclusive association that makes one Physical Connection the current
  carrier of a Logical Session under an exact Binding Epoch.
- **Binding Linearization**: the atomic selection of a Physical Connection Binding as current, advancing the
  Binding Epoch and fencing the former binding. It establishes current authority even when Binding Activation
  happens later.
- **Binding Activation**: the later transition that permits a linearized current binding to carry active RPC
  records and resume Session work. Only the exact current binding can activate.
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
- **Recovery**: rebinding a retained Logical Session to a replacement Physical Connection after the requester
  presents that Session Incarnation's bearer credential.
- **Local Admission**: successful return from `IRpcConnection.send()`; it is not proof of remote receipt.
- **Direct Close**: `IRpcConnection.close()`; it is distinct from the Protocol's graceful Session-close record.
- **Definite Non-Execution**: evidence that the remote handler did not and cannot execute for that invocation.
- **Outcome Unknown**: the handler may have executed, but no authoritative terminal outcome remains provable.

**RPC-BASE-001 — Scope of guarantees.** Session-scoped at-most-once handler dispatch **MUST** be promised only
while the same retained Session Incarnation, call ledger, sequence continuity, and single current binding are
provable. Loss of that evidence **MUST NOT** be described as exactly-once or transparently retried under a new
Call Identity.

**RPC-BASE-002 — Observable ownership.** Subscribing or unsubscribing from a public Observable **MUST NOT**
create, start, stop, or own a Transport, Session, listener, or handler. Resources **MUST** be owned by the
role-specific lifecycle methods in this specification.

**RPC-BASE-003 — Deep boundaries.** The public Protocol seam **MUST** be semantic and role-specific. Default
Codec, Handshake, resume-credential, ACK, sequence, replay, call-ledger, and scheduler modules **MUST NOT**
become public extension points merely because the built-in Protocol contains them.

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

**RPC-PKG-002 — Single identity.** A symbol re-exported from the root and a specialist subpath **MUST** resolve
to the same declaration and runtime value. The package **MUST NOT** create parallel nominal identities.

**RPC-PKG-003 — Private default.** Omitting `options.protocol` **MUST** select the package's built-in Protocol.
The root and implementor entries **MAY** expose the same `createRpcProtocol()` runtime identity so an independent
provider package can delegate to the same immutable implementation. The package **MUST NOT** export a
`defaultRpcProtocol` value, concrete
Protocol implementation class, or public default Codec, Handshake, resume-credential, ledger, or scheduler type.

**RPC-PKG-004 — Private validation grammar.** Every package-owned materialized record, tuple, and tagged-union
grammar **MUST** have one package-private Zod schema as its sole executable data-shape source; the package
**MUST NOT** maintain a second hand-written field grammar. Each private type that mirrors such a schema **MUST**
derive from Zod's `output` type (`z.output<typeof schema>` or its imported alias). A type-only facade or readonly
or semantic-brand wrapper **MAY** layer on that output but **MUST NOT** redeclare its record fields. Focused
package-private native type guards **MAY** be shared for primitive built-in-brand, safe-integer, and plain-record
predicates that own no record, tuple, or tagged-union field grammar. Schema failures **MUST** project to the error
or fault specified for the owning seam; `ZodError` and schema diagnostics **MUST NOT** cross the Codec seam or
enter a public error or cause. The package **MUST NOT** publish a built-in Protocol schema, validator,
decoded-record type, data corpus, or any `./wire/*` subpath. Raw-byte parsing, safe Application Value
normalization, and retained state/security/resource decisions **MUST** remain with their owning modules and
**MUST NOT** be replaced by
ordinary Zod parsing. `RpcApplicationValue`, Protocol SPI types, and caller-facing domain types that do not
mirror the built-in decoded tree **MUST** remain owned by their defining interfaces. These validation-ownership
requirements do not constrain an independent custom Protocol's grammar.

**RPC-PKG-005 — Manifest.** The published manifest **MUST** declare `type: "module"`, public access,
`engines.node: ">=23.6"`, source maps, and `sideEffects: false`. Runtime dependencies **MUST** be limited to
`@husky-di/core`, `rxjs`, and `zod`; the packed manifest **MUST NOT** contain `workspace:*`, a test framework,
`ws`, or a Node-only polyfill.

**RPC-PKG-006 — Artifact.** The packed tarball **MUST** contain only declared build output, the architecture
source and rendered diagram, declared package documentation, README, CHANGELOG, LICENSE, and package metadata.
Every public subpath **MUST** resolve from the installed tarball without workspace source or examples.

**RPC-PKG-007 — Root inventory.** The root **MUST** export runtime values
`createRemoteServiceDescriptor`, `createRpcConnector`, `createRpcAcceptor`, `createRpcConnectorReconnection`,
`createRpcProtocol`, `RpcException`, `RpcAcceptorListenerStopReasonEnum`, `RpcCallDirectionEnum`,
`RpcCallStatusEnum`, `RpcCloseOutcomeEnum`, `RpcCloseReasonEnum`,
`RpcConnectorReconnectionAttemptFailureStageEnum`, `RpcConnectorReconnectionEventTypeEnum`,
`RpcConnectorReconnectionStopReasonEnum`, `RpcEventTypeEnum`, `RpcExceptionCodeEnum`, and `RpcStateStatusEnum`;
caller types
`RemoteServiceDescriptor`, `IRpcPeer`, `IRpcConnector`, `IRpcAcceptor`, `RpcPeerState`,
`RpcConnectorState`, `RpcAcceptorListenerState`, `RpcAcceptorState`, `RpcCloseReasonEnum`,
`RpcCallDirectionEnum`, `RpcEvent`, `RpcExceptionCodeEnum`, `RpcConnectorOptions`, `RpcAcceptorOptions`,
`RpcConnectorConnectOptions`, `RpcConnectorRuntimePolicyOptions`, `RpcAcceptorRuntimePolicyOptions`,
`IRpcConnectorReconnection`, `CreateRpcConnectorReconnectionOptions`, `RpcConnectorAdapterFactory`,
`RpcConnectorReconnectionPolicyOptions`, `RpcConnectorReconnectionState`, and `RpcConnectorReconnectionEvent`;
Transport types `IRpcConnection`, `IRpcConnectorAdapter`, and `IRpcAcceptorAdapter`; and shared SPI types `IRpcProtocol`,
`IRpcProtocolRuntimePolicy`, `IRpcApplicationRecord`, `RpcApplicationValue`, `RpcCallFailure`,
`RpcProtocolFaultReason`, and `RpcSessionCloseReason`.

**RPC-PKG-008 — Protocol inventory.** `/protocol` **MUST** export runtime values `createRpcProtocol`,
`RpcCallTerminalTypeEnum`, `RpcCloseReasonEnum`, `RpcExceptionCodeEnum`, `RpcIncomingCallKindEnum`, and
`RpcProtocolSessionTransitionTypeEnum` plus the complete issue-17 SPI vocabulary:
`IRpcConnection`, `RpcApplicationValue`, `IRpcApplicationRecord`, `IRpcApplicationSnapshot`,
`IRpcApplicationArgumentsSnapshot`, `RpcCallFailure`, `RpcUnknownCallFailure`, `RpcIncomingFailure`,
`RpcCallOutcome`, `RpcHandlerOutcome`, `RpcIncomingTerminal`, `IRpcProtocolRuntimePolicy`,
`IRpcRetainedBytesReservation`, `IRpcProtocolHost`, all outgoing invocation
request/sink/reservation/invocation/session types, all incoming request/call/handler/reservation types,
`RpcCloseReasonEnum`, `RpcProtocolFaultReason`, `RpcSessionCloseReason`,
`RpcProtocolSessionTransitionCloseReason`, `RpcProtocolSessionTransition`, all Session/role host and runtime
interfaces, and `IRpcProtocol`.

**RPC-PKG-009 — No helper exports.** Descriptor conditional/mapped helpers, concrete facade and implementation
mapped types, a generic Topology Owner base, and implementation classes **MUST NOT** be exported. `/transport`
**MUST** export exactly the three structural Transport types. `/conformance` **MUST** export
`RpcConformanceStatusEnum`, the three named runners, plus exactly `RpcConformanceFailure`,
`RpcConformanceCaseResult`, `RpcConformanceReport`,
`RpcConformanceOptions`, `IRpcProtocolConformanceFixture`, `IRpcAdapterConformanceRemote`,
`IRpcConnectorAdapterConformanceFixture`, and `IRpcAcceptorAdapterConformanceFixture`.

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

**RPC-VALUE-001 — Data domain.** Caller arguments, successful results, and safe error details **MUST** normalize
to a detached JSON data tree containing only `null`, booleans, strings, finite IEEE-754 binary64 numbers, dense
arrays, and plain records. A sender **MUST** reject `undefined`, `bigint`, symbols, functions, accessors, symbol
keys, array holes, cycles, `Date`, `Map`, `Set`, class instances, typed arrays, `NaN`, infinities, and `-0` with an
asynchronous `TypeError` before Pending Invocation or wire identity is created.

**RPC-VALUE-002 — Safe inspection.** Normalization **MUST** inspect only own enumerable string-named data
properties of records whose prototype is `Object.prototype` or `null`. It **MUST NOT** call a getter, coercion,
or `toJSON`. It **MUST** inspect arrays and records through own-key and property-descriptor meta-operations,
reject every own accessor and symbol key, ignore non-enumerable data properties, and reject array holes or
non-index array properties. A Proxy is outside the Application Value contract: its meta-operation traps may be
invoked and have side effects, but every trap result **MUST** still be revalidated and a trap throw **MUST**
surface as `TypeError`. The retained snapshot **MUST** be detached and immutable.

**RPC-VALUE-003 — Common profile.** A custom Protocol **MUST NOT** enlarge or reinterpret this caller-visible
value domain. TypeScript types **MUST NOT** claim that an arbitrary domain interface statically proves runtime
wire validity.

**RPC-VALUE-004 — Fixed limits.** Normalized values and decoded input **MUST** satisfy the applicable profile
limits below; bytes mean UTF-8 bytes and root depth is one. The complete wire-tree allowance includes only the
fixed Protocol wrapper above one maximum Application Value and **MUST NOT** enlarge the Application Value
allowance:

| Dimension | Hard limit |
| --- | ---: |
| Complete Transport message | `1,048,576 B` |
| One arguments/result/error-details compact-JSON budget weight | `1,000,000 B` |
| Complete decoded wire-tree depth | `67` |
| One Application Value depth | `64` |
| One decoded string | `524,288 B` |
| One Protocol identifier or object member name | `256 B` |
| Members in one object | `1,024` |
| Elements in one array | `8,192` |
| JSON nodes in one complete decoded record | `65,546` |
| JSON nodes in one Application Value | `65,536` |

Every primitive, array, and record counts as one node; member names do not. Root depth is one. A shared but
acyclic object reference **MAY** appear more than once and **MUST** be expanded into an independent detached
subtree at each occurrence; an ancestor cycle **MUST** be rejected. Application strings and member names
**MUST NOT** contain an unpaired UTF-16 surrogate.

**RPC-VALUE-005 — Deterministic weight.** Compact-JSON budget weight **MUST** use UTF-8 length with no
whitespace, ECMAScript JSON number serialization, and the minimum required JSON string escaping. It is not a
globally shortest alternate number grammar: for example `1e20` has the same 21-byte decimal spelling as
`JSON.stringify(1e20)`, and `1e21` retains the `1e+21` spelling. Member order
**MUST NOT** change the weight. A sender **MUST** validate value shape and weight before retaining caller-owned
data, allocating a Call Identity, or committing a handler terminal.

**RPC-VALUE-006 — Semantic equality.** Normalized equality **MUST** compare null/boolean/string and binary64
number value, preserve array order, and compare records by decoded member-name set plus recursive values while
ignoring member order, escape spelling, insertion order, prototype, and object identity. It **MUST NOT** compare
encoded bytes.

## 5. Remote Service Descriptor

The runtime factory is:

```typescript
type AnyMethod = (...args: any[]) => unknown;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;

type ContainsAbortSignal<T> = IsAny<T> extends true
  ? false
  : [Extract<T, AbortSignal>] extends [never] ? false : true;

type ParametersContainAbortSignal<F extends AnyMethod> =
  ContainsAbortSignal<Parameters<F>[number]>;

type HasAnyParameter<F extends AnyMethod> = IsAny<Parameters<F>[number]>;

type HasUnsupportedUnaryResult<F extends AnyMethod> =
  IsAny<Awaited<ReturnType<F>>> extends true
    ? true
    : Extract<Awaited<ReturnType<F>>, Observable<unknown> | AsyncIterable<unknown>>
        extends never ? false : true;

type HasNoParameters<F extends AnyMethod> = Parameters<F> extends []
  ? true
  : IsNever<Parameters<F>[number]> extends true ? true : false;

type HasValidCancellationSlot<F extends AnyMethod> =
  Parameters<F> extends [...infer Head, infer Last]
    ? number extends Parameters<F>["length"]
      ? false
      : IsAny<Last> extends true
        ? false
        : [Last] extends [AbortSignal]
          ? [AbortSignal] extends [Last]
            ? ContainsAbortSignal<Head[number]> extends false ? true : false
            : false
          : false
    : false;

type RemoteMethodKey<T> = {
  [K in keyof T]-?: K extends string
    ? K extends "then"
      ? never
      : T[K] extends AnyMethod ? K : never
    : never;
}[keyof T];

type RpcUnaryMethodDefinition<F extends AnyMethod = AnyMethod> =
  HasAnyParameter<F> extends true
    ? never
    : HasUnsupportedUnaryResult<F> extends true
      ? never
      : HasNoParameters<F> extends true
        ? true
        : ParametersContainAbortSignal<F> extends false
          ? true
          : HasValidCancellationSlot<F> extends true
            ? { readonly cancelable: true }
            : never;

type RpcMethodDefinitions<T> = Partial<{
  readonly [K in RemoteMethodKey<T>]: RpcUnaryMethodDefinition<Extract<T[K], AnyMethod>>;
}>;

type ValidateMethodDefinition<F extends AnyMethod, Definition> =
  Definition extends RpcUnaryMethodDefinition<F>
    ? Definition extends true
      ? Definition
      : Definition extends { readonly cancelable: true }
        ? Exclude<keyof Definition, "cancelable"> extends never
          ? HasValidCancellationSlot<F> extends true ? Definition : never
          : never
        : never
    : never;

type ValidateMethodDefinitions<T, Definitions extends object> = {
  readonly [K in keyof Definitions]: K extends RemoteMethodKey<T>
    ? ValidateMethodDefinition<Extract<T[K], AnyMethod>, Definitions[K]>
    : never;
};

type RequiredKey<T> = {
  [K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? K : never;
}[keyof T];

type SelectedMethodKey<Definitions> = Extract<RequiredKey<Definitions>, string>;

type NonEmptyMethodDefinitions<Definitions extends object> =
  [SelectedMethodKey<Definitions>] extends [never] ? never : unknown;

type IsCancelableMethod<Definition> = Definition extends {
  readonly cancelable: true;
} ? true : false;

type RemoteMethod<F, Definition> = F extends (...args: infer Args) => infer Result
  ? IsCancelableMethod<Definition> extends true
    ? Args extends [...infer Params, AbortSignal]
      ? (...args: [...Params, signal: AbortSignal | undefined]) => Promise<Awaited<Result>>
      : never
    : (...args: Args) => Promise<Awaited<Result>>
  : never;

type RemoteService<T, Definitions extends RpcMethodDefinitions<T>> = {
  readonly [K in Extract<SelectedMethodKey<Definitions>, RemoteMethodKey<T>>]:
    RemoteMethod<Extract<T[K], AnyMethod>, Definitions[K]>;
} & { readonly then?: never };

type RemoteServiceImplementation<
  T,
  Definitions extends RpcMethodDefinitions<T>,
> = {
  [K in Extract<SelectedMethodKey<Definitions>, RemoteMethodKey<T>>]-?:
    Extract<T[K], AnyMethod>;
};

declare const remoteServiceDescriptorBrand: unique symbol;

export type RemoteServiceDescriptor<
  T,
  Definitions extends RpcMethodDefinitions<T>,
> = {
  readonly [remoteServiceDescriptorBrand]: (
    service: T,
    definitions: Definitions,
  ) => readonly [T, Definitions];
};

export function createRemoteServiceDescriptor<
  T,
  const Definitions extends RpcMethodDefinitions<T>,
>(
  serviceIdentifier: ServiceIdentifier<T>,
  options: {
    readonly wireName: string;
    readonly methods: Definitions &
      ValidateMethodDefinitions<T, Definitions> &
      NonEmptyMethodDefinitions<Definitions>;
  },
): RemoteServiceDescriptor<T, Definitions>;
```

`Definitions` is inferred as a non-empty allowlist whose keys select methods of `T`. Each value is `true` for an
ordinary unary method or `{ readonly cancelable: true }` for a method whose local signature has exactly one
required trailing `AbortSignal` and no other signal parameter.

**RPC-DESC-001 — Identity.** A Descriptor **MUST** be opaque and invariant in both service and definition type
parameters. It **MUST** retain the original `ServiceIdentifier` only for local exposure lookup and a separate,
explicit, non-empty `wireName` only for wire identity. ServiceIdentifier metadata, a global registry, package
module identity, and Descriptor object identity **MUST NOT** participate in wire routing.

**RPC-DESC-002 — Allowlist.** `methods` **MUST** be a non-empty explicit allowlist of string-named functions.
Properties, `any` parameters/results, Observable/AsyncIterable results, invalid cancellation placement, and
method name `then` **MUST** be rejected by the type surface and validated again at runtime where applicable.
Generic and overloaded call signatures **MUST** be documented as unsupported without claiming reliable static
rejection or relationship preservation. Ordinary non-cancelable optional/rest parameters **MAY** map normally;
a cancelable signature **MUST** have a fixed prefix and exact required trailing `AbortSignal`.

**RPC-DESC-003 — Exact names.** Wire service and method names **MUST** be non-empty strings compared by exact
Unicode code-point sequence without normalization or case folding. `then` **MUST** remain reserved at the type,
runtime, and wire layers.

**RPC-DESC-004 — Atomic exposure.** `expose()` **MUST** validate the entire Descriptor/implementation pair and
all selected members before atomically installing it. It **MUST** snapshot the selected function references and
implementation object; later property replacement **MUST NOT** change installed behavior. Duplicate wire name or
invalid selected member **MUST** synchronously throw `TypeError` without partial installation. One Acceptor
Session's effective namespace is the union of that peer's local registry and the Acceptor owner registry, and a
wire name **MUST NOT** occur in both. `IRpcAcceptor.expose()` **MUST** prevalidate the owner registry and every
current peer-local registry before its one owner-registry commit; `peer.expose()` **MUST** prevalidate both
registries. New peers read the owner registry directly rather than receiving copied entries.

**RPC-DESC-005 — Cleanup.** Exposure cleanup **MUST** be synchronous, idempotent, and non-throwing. Removing an
exposure **MUST NOT** alter an already admitted call, which uses its captured route.

## 6. Caller-facing API

### 6.1 Errors, peers, and owners

```typescript
export enum RpcExceptionCodeEnum {
  canceled = "canceled",
  unavailable = "unavailable",
  outcomeUnknown = "outcome-unknown",
  handlerFailed = "handler-failed",
  unknownService = "unknown-service",
  unknownMethod = "unknown-method",
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
  expose<T, Definitions extends RpcMethodDefinitions<T>>(
    descriptor: RemoteServiceDescriptor<T, Definitions>,
    implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
  ): Cleanup;
  resolve<T, Definitions extends RpcMethodDefinitions<T>>(
    descriptor: RemoteServiceDescriptor<T, Definitions>,
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
  expose<T, Definitions extends RpcMethodDefinitions<T>>(
    descriptor: RemoteServiceDescriptor<T, Definitions>,
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
  | "maxPendingInvocationsPerSession"
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

**RPC-API-002 — Stable peer.** A Connector **MUST** expose one stable `peer` before its first connection. An
Acceptor **MUST** create one stable peer per admitted fresh Session and keep that object through Recovery.
Resuming **MUST NOT** create a second peer or reset Session-scoped exposures and resolved facades.

**RPC-API-003 — State streams.** `state$` and `peers$` **MUST** be multicast, replay-latest Observables. Their
synchronous getter and most recently emitted value **MUST** be the same frozen object until the next committed
mutation. A final snapshot **MUST** be emitted before completion; these streams **MUST NOT** error.

**RPC-API-004 — Event stream.** `event$` **MUST** be hot, multicast, and non-replaying. It **MUST** emit the one
terminal topology event before completing and **MUST NOT** error. Subscriber failure **MUST NOT** roll back
Framework state or alter the current operation, although host-level RxJS error reporting may terminate the host
process.

**RPC-API-005 — Mutation batch.** Framework mutations **MUST** commit all related call sinks, peer/owner state,
membership, and durable observation data atomically before flushing notifications. Within the batch it **MUST**
emit call terminal observations before peer terminal observations, peer terminal observations before topology
terminal observation, and settle public Promises last.

**RPC-API-006 — Exposure gate.** `expose()` **MUST** synchronously throw `RpcException(unavailable)` when its peer is
draining/closed or its Owner is draining/closing/closed. A peer in `unbound`, `connecting`, `connected`, or
`recovering` **MAY** accept Session-scoped exposure. Owner-scoped Acceptor exposure applies to future and current
peers.

**RPC-API-007 — Explicit peer composition.** The public Acceptor API **MUST NOT** provide a Framework-owned
aggregate remote-service facade. Applications **MUST** compose multi-peer work explicitly from `peers`, `peers$`,
each peer's `resolve()`, and application-selected JavaScript, Promise, or RxJS operators. These primitives
**MUST NOT** imply a Framework-defined eligibility, ordering, concurrency, cancellation, error, or wait policy.

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

**RPC-STATE-001 — Six-state peer.** A peer **MUST** follow
`unbound -> connecting -> connected <-> recovering -> draining? -> closed` subject to the transitions below.
Fresh bootstrap failure **MUST** permit `connecting -> unbound` without replacing the stable Connector peer;
`closed` **MUST** be sticky and terminal. A counter-draining Acceptor peer **MUST** remain in `peers` while active
but **MUST NOT** admit a new outgoing call.

**RPC-STATE-002 — Error identity.** `recovery-expired` and `counter-exhaustion` **MUST** use
`RpcException(unavailable)`; `continuity-failure`, `protocol-fault`, and `resource-fault` **MUST** use
`RpcException(protocol)`. Connector topology state **MUST** reuse its unique peer's Error object. Acceptor peer
failure **MUST NOT** fail healthy siblings or the Owner.

**RPC-STATE-003 — Cleanup precedence.** Owner cleanup rejection or timeout **MUST** set only the Owner's final
reason to `cleanup-failed` with the same trusted Error or admission-ordered `AggregateError`. It **MUST NOT**
rewrite already terminal peer reasons.

### 6.3 Facades, calls, and cancellation

**RPC-CALL-001 — Facade shape.** `resolve()` **MUST** synchronously return a frozen,
null-prototype facade containing only selected method closures. A closure **MUST NOT** depend on facade `this`.
The facade **MUST** expose `then === undefined`, and `await`, async return, and `Promise.resolve` **MUST NOT**
start an RPC. Repeated resolution need not return the same object, but every returned facade **MUST** remain
usable across Recovery and **MUST** still be obtainable after close; invocation then rejects `unavailable`.

**RPC-CALL-002 — Remote cancellation slot.** A cancelable remote method **MUST** have a required final
`AbortSignal | undefined` argument. The caller **MUST** pass `undefined` to request no cancellation. Runtime
preflight **MUST** reject zero actual arguments before `pop`, treat the final actual `undefined` as control, and
otherwise validate a platform AbortSignal with captured platform intrinsics rather than `instanceof` or duck
typing. v1 **MUST NOT** reflectively validate business arity.

**RPC-CALL-003 — Signal race.** Runtime **MUST** read the initial aborted state with a captured platform getter,
then perform state/value/capacity preflight and commit Pending work, install one listener with captured
`EventTarget.prototype.addEventListener`, and re-read the getter to close the check-to-register race. It **MUST**
remove with the captured intrinsic and **MUST NOT** call shadowable instance methods.

**RPC-CALL-004 — Preflight order.** Invocation preflight **MUST** be: control shape, initially aborted, owner/peer
availability, Application Value snapshot, then capacity. Failure before capacity **MUST** create no Pending
Invocation, wire identity, child, or call event. Invalid signal/value **MUST** reject `TypeError`; initially
aborted **MUST** reject `RpcException(canceled)`; unavailable state/capacity **MUST** reject
`RpcException(unavailable)`.

**RPC-CALL-005 — Pending and admission.** A valid invocation **MUST** first become a retractable Pending
Invocation without `callId` or `seq`. Outgoing Admission **MUST** atomically allocate identity, retain the
semantic replay entry, and call `send()` for the first time in one non-awaiting step. Cancellation before that
point **MUST** prove non-execution and immediately unlink its Pending entry and payload storage; cancellation
afterward **MUST** be cooperative and **MUST NOT** rewrite a terminal winner.

**RPC-CALL-006 — Terminal winner.** Caller cancel, handler settlement, Protocol terminal, Session loss, and
Owner force **MUST** compete through one first-terminal-wins slot. Late messages **MAY** complete ACK/GC work but
**MUST NOT** change the public Promise or matching call-finished observation.

**RPC-CALL-007 — Error guarantees.** `unavailable` **MUST** mean Definite Non-Execution. `outcome-unknown`
**MUST** be used only for an outgoing call that crossed Admission and then lost authoritative outcome evidence.
`canceled` **MUST NOT** imply rollback. Unknown service/method and handler failure **MUST** remain call-scoped.
Remote messages, details, stack, cause, and thrown objects **MUST NOT** enter public `RpcException`.

**RPC-CALL-008 — Handler scheduling.** Remote Request Admission **MUST** durably capture the exposure and queue a
handler job without dispatching inline. The Framework **MUST** acquire both Session and Owner permits before
calling the captured handler. Cancellation/force that wins while queued **MUST** prevent dispatch; a running
handler that ignores cancellation **MUST** continue occupying its finite permit until its real settlement, with
late result consumed but unable to change the selected terminal.

**RPC-CALL-009 — Public error object.** `RpcException` **MUST** extend `CodedException<RpcExceptionCodeEnum>` and
**MUST** expose a constructor accepting a code and optional cause. The package **MUST NOT** export its internal
construction factory. `code` **MUST** be its only stable branch field; inherited `detail` **MUST NOT** contain
remote data, and message text **MUST NOT** be normative. A trusted local Adapter/Protocol Error **MAY** be
retained as standard `cause`. Call events **MUST** copy only the safe code, never the Error object.

### 6.4 Events and telemetry

The following declaration is the closed event union. Its non-exported helper types express correlations that
must remain visible when TypeScript narrows an exported `RpcEvent`:

```typescript
export enum RpcCallDirectionEnum {
  incoming = "incoming",
  outgoing = "outgoing",
}

export enum RpcEventTypeEnum {
  callStarted = "call-started",
  callFinished = "call-finished",
  peerOpened = "peer-opened",
  peerRecovering = "peer-recovering",
  peerRecovered = "peer-recovered",
  peerDraining = "peer-draining",
  peerClosed = "peer-closed",
  ownerDraining = "owner-draining",
  ownerClosing = "owner-closing",
  topologyClosed = RpcEventTypeEnum.topologyClosed,
}

type RpcCallObservationBase = {
  readonly observationId: string;
  readonly peer: IRpcPeer;
};

type RpcOutgoingCallContext = {
  readonly direction: RpcCallDirectionEnum.outgoing;
  readonly service: string;
  readonly method: string;
};

type RpcKnownIncomingCallContext = {
  readonly direction: RpcCallDirectionEnum.incoming;
  readonly service: string;
  readonly method: string;
};

type RpcUnknownServiceCallContext = {
  readonly direction: RpcCallDirectionEnum.incoming;
  readonly service?: never;
  readonly method?: never;
};

type RpcUnknownMethodCallContext = {
  readonly direction: RpcCallDirectionEnum.incoming;
  readonly service: string;
  readonly method?: never;
};

type RpcCallStartedEvent = RpcCallObservationBase &
  (RpcOutgoingCallContext | RpcKnownIncomingCallContext |
   RpcUnknownServiceCallContext | RpcUnknownMethodCallContext) & {
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
  | (RpcUnknownMethodCallContext & {
      readonly outcome: RpcCallStatusEnum.rejected;
      readonly code: RpcExceptionCodeEnum.unknownMethod;
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
  | RpcCallFinishedEvent;
```

**RPC-EVENT-001 — Local pairing.** An outgoing `call-started` **MUST** be staged when a validated invocation
becomes Pending. A known incoming start **MUST** follow Remote Request Admission and precede handler dispatch.
A durable unknown-service/method semantic rejection **MUST** stage an adjacent started/finished pair. Every
started observation **MUST** have exactly one matching finished observation on that side. Preflight failure,
initial abort, and Remote Resource Rejection **MUST NOT** create a pair.

**RPC-EVENT-002 — Metadata correlation.** Outgoing and known incoming call events **MUST** include locally
canonical service and method. An unknown-service event **MUST** omit both; an unknown-method event **MUST**
include only the exactly matched local service. Attacker-supplied unmatched spelling **MUST NOT** appear in an
event, public error, or Framework log.

**RPC-EVENT-003 — Outcome correlation.** A finished outgoing call **MUST** be `fulfilled` or `rejected` with any
`RpcCallFailure`. A known incoming call **MUST** be `fulfilled`, `rejected` only with `canceled | handler-failed`,
or `terminated`. Unknown-service and unknown-method events **MUST** be rejected only with their exact respective
code. `terminated` **MUST** be incoming-only and carry no code, Error, or Session reason.

**RPC-EVENT-004 — Payload safety.** Events **MUST NOT** contain raw wire, args, result, details, thrown value,
remote message/stack/cause, Session/call identity, sequence/ACK/cursor/epoch, `resumeToken`, unknown fields,
Adapter URL/header/credential, or Error objects. Duration **MUST** be a floored non-negative safe-integer number
of milliseconds; duration/count overflow **MUST** saturate at `Number.MAX_SAFE_INTEGER`.

**RPC-EVENT-005 — No hidden recorder.** The Framework **MUST NOT** provide a default transcript ring, telemetry
history, redaction callback, exporter, trace propagation, or console sink. Applications **MAY** record payloads
at caller/handler boundaries they own.

**RPC-EVENT-006 — Role reachability.** The shared `RpcEvent` type **MAY** contain variants used by either Owner,
but an Acceptor **MUST NOT** emit topology terminal reasons that belong only to its individual peers
(`remote-terminated`, Recovery, continuity, or counter exhaustion). A Connector **MAY** project its unique peer's
terminal as topology terminal. Listener terminal **MUST NOT** imply topology terminal while the Acceptor remains
active.

**RPC-EVENT-007 — Observation identity.** `observationId` **MUST** be an opaque local correlation string stable
only for its started/finished pair. It **MUST NOT** be parseable by contract, sent on wire, reused as Call
Identity, or treated as authority.

### 6.5 Startup operations

**RPC-START-001 — Promise-only startup errors.** `connect()` and `listen()` **MUST** report every preflight or
startup failure by Promise rejection and **MUST NOT** throw synchronously. State/single-flight/overflow gates
**MUST** run before reading `adapter.connection$`. Invalid state **MUST** reject `RpcException(unavailable)`; a
structurally invalid Adapter after the gate **MUST** reject `TypeError` without starting it.

**RPC-START-002 — Connector eligibility.** Connector startup **MUST** be single-flight and accepted only while
the Owner is active, the stable peer is `unbound` or `recovering`, and no attempt exists. Connected, connecting,
draining, closed, or concurrent invocation **MUST** reject before touching the Adapter. The operation **MUST**
fulfill only after Adapter handoff and Protocol fresh/resume Binding Activation both succeed.

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

**RPC-START-005 — Connector attempt cancellation.** `connect()` **MUST** accept a closed
`{ adapter, signal? }` options record. Its eligibility gate **MUST** run before reading that record. After the
gate, a non-platform signal **MUST** reject `TypeError`; an already-aborted signal **MUST** reject `AbortError`
without inspecting or starting the Adapter. A later abort **MUST** fence and cancel only the unsettled attempt,
abort the Framework-owned signal passed to Adapter and Protocol, Direct Close any handed-off Connection, return
a fresh peer to `unbound`, and leave a recovering peer `recovering`. Binding success, abort, ordinary failure,
and Owner/Session terminal **MUST** select one winner. Binding success is Binding Activation; abort after
Activation **MUST** have no effect, and the public `AbortError` **MUST NOT** expose `signal.reason`.

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

**RPC-TRANSPORT-002 — Stable bytes.** All observers of one notification **MUST** receive the same Connection or
`Uint8Array` identity. After emitting inbound bytes an Adapter **MUST NOT** modify, reuse, or detach the backing
storage. Observers **MUST** treat it as read-only.

**RPC-TRANSPORT-003 — Terminal.** Normal terminal **MUST** complete `message$`; Transport, framing, or admission
failure **MUST** error it with one final `Error`. No value may follow terminal. When applicable, the same Error
object **MUST** reject the affected send/close operation. The core seam **MUST NOT** define a Transport error-code
taxonomy.

**RPC-TRANSPORT-004 — Single owner.** Handoff **MUST** assign each Connection to exactly one Topology Owner.
Other observers **MUST NOT** call `send()` or `close()`. Subscription count **MUST NOT** affect ownership.

**RPC-TRANSPORT-005 — Ordered Local Admission.** An Owner **MUST** have at most one unsettled `send()` per
Connection. The Adapter **MAY** borrow the argument until settlement and **MUST NOT** borrow it afterward.
Fulfillment **MUST** mean only Local Admission into a stable bounded path; it **MUST NOT** imply flush, delivery,
receipt ACK, decode, or handler completion.

**RPC-TRANSPORT-006 — Backpressure and hard failure.** Temporary outbound pressure **MUST** leave the current
send pending without drop, overwrite, or reordering. Exceeding a finite message/queue limit or Transport failure
**MUST** reject the send and terminal the Connection. A normally empty path **MUST** accept every complete
message of at most `1,048,576` bytes.

**RPC-TRANSPORT-007 — Direct Close.** `close()` **MUST** synchronously prevent new sends and reject any unsettled
send, then start direct platform termination. It **MUST** be idempotent and settle only after local terminal,
`message$` terminal, and Adapter-owned cleanup. It **MUST NOT** wait for RPC calls, ACKs, remote confirmation, or
business work, and **MUST NOT** revoke a fulfilled send.

**RPC-TRANSPORT-008 — Connector handoff.** A Connector Adapter **MUST** be cold and single-use. Framework **MUST**
subscribe to `connection$` before calling `connect(signal)`. Success **MUST** emit exactly one Connection; return
from all synchronous `next` observers is the handoff barrier, after which the Connection may emit its first
message. The source then **MUST** complete before `connect()` fulfills. Pre-handoff abort **MUST** clean half-open
resources, complete with no value, and reject `AbortError`; other startup failure **MUST** error/reject with the
same Error. Handoff **MUST NOT** be revoked by later connection loss or signal abort.

**RPC-TRANSPORT-009 — Acceptor handoff.** An Acceptor Adapter **MUST** be cold and single-use. Framework **MUST**
subscribe before `listen(signal)`. It **MAY** emit accepted Connections before ready fulfillment; each
notification return is that Connection's handoff barrier. Abort before ready **MUST** reject `AbortError` and
complete the source; abort after ready **MUST** complete it normally. Abort inside a notification **MUST**
synchronously gate future emissions. Source terminal **MUST NOT** close transferred Connections or borrowed
external resources.

**RPC-TRANSPORT-010 — Earliest finite admission.** An Adapter **MUST** enforce finite per-message,
queued-message, and queued-byte limits at its earliest controllable raw-input point and **MUST NOT** expose an
unbounded mode. It **MUST NOT** copy, allocate from an untrusted length, or emit before the relevant check.
Platforms that already materialize a native message **MUST** avoid a second unbounded copy and terminate on
overflow. One Acceptor Connection failure **MUST NOT** stop the listener or siblings.

**RPC-TRANSPORT-011 — Overflow handoff.** An Acceptor **MUST** reserve one non-borrowable overflow-close slot in
addition to its ordinary Connection cap. The next emission at capacity **MUST** occupy only that slot and abort
future acceptance in the notification; Direct Close **MUST** occur in the first continuation after the ownership
barrier. No restart is allowed until that close settles. Before-ready overflow **MUST** reject listener startup
with `AbortError`; after-ready overflow **MUST** stop the listener normally with `resource-pressure`.

**RPC-TRANSPORT-012 — Security claim.** Structural Adapter conformance **MUST NOT** be presented as proof of
network security. An Adapter claiming secure Default-Protocol Recovery **MUST** document and test a deployment
mode that supplies confidentiality, ordered integrity/anti-replay, and authentication of the expected responder
endpoint. No `isSecure`, certificate, channel-binding, credential, or capacity getter is added to the core seam.

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
  | RpcExceptionCodeEnum.unknownMethod
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
  readonly maxPendingInvocationsPerSession: number;
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

**RPC-SPI-002 — Normalized values.** Framework **MUST** give the Protocol opaque detached immutable application
snapshots with deterministic weight and semantic-equality/normalization ports. Only Framework **MUST** create
their brand. Protocol **MUST NOT** retain the original caller value or make Codec-specific values public.

**RPC-SPI-003 — Port atomicity.** Framework-owned host, incoming-reservation/call, and outgoing-sink ports
**MUST** be synchronous, total, and non-throwing for contract-valid calls except the specified normalization
`TypeError`. They **MUST** stage durable state without directly reentering user code. Duplicate, late, or invalid
Protocol calls and unexpected Protocol-owned member throws/rejections **MUST** fault the smallest known scope and
**MUST NOT** roll back already durable state. `reserveRetainedBytes()` **MUST** atomically charge the Owner
ledger or return `undefined`; its successful frozen reservation **MUST** release exactly once and make repeated
`release()` calls no-ops.

### 8.2 Outgoing and incoming calls

```typescript
export interface IRpcProtocolInvocationRequest {
  readonly service: string;
  readonly method: string;
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
  readonly method: string;
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

**RPC-SPI-005 — Synchronous outcome.** Protocol **MUST** finish every affected Framework-owned sink
synchronously before requesting or causing Session closed projection. An outcome Promise owned by Protocol
**MUST NOT** replace this sink, because Promise reactions cannot preserve terminal event ordering.

**RPC-SPI-006 — Incoming reservation.** After fixed/security/sequence validation and its own ledger/replay/
protected-terminal reservation, Protocol **MUST** call `reserveIncomingCall()` before exposure lookup. An
`undefined` result **MUST** cause a protected Remote Resource Rejection, receipt advancement, no args retention,
and no incoming event. A handler or unknown tagged reservation **MUST** be committed only after Protocol durably
records Remote Request Admission or Remote Semantic Rejection; pre-disposition failure **MUST** release it.

**RPC-SPI-007 — Incoming commit.** A handler reservation commit **MUST** capture and publish an eligible queued
job but **MUST NOT** dispatch inline. Unknown commit **MUST** produce its safe started/finished pair without a
handler permit. Incoming terminal **MUST** be limited to returned/void,
`canceled | handler-failed | unknown-service | unknown-method`, or private `session-terminated`; it **MUST NOT**
report `unavailable` or `outcome-unknown` through a created incoming handle.

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
barrier it **MUST NOT** send, close, linearize or activate a binding, or project state and **MAY** retain only
bounded provisional ingress. Fulfillment **MUST** mean fresh/resume Binding Activation; later connection loss
**MUST NOT** retroactively reject it.

**RPC-SPI-009 — Session attachment.** Fresh Connector Session **MUST** attach to the stable peer anchor; fresh
Acceptor Session **MUST** atomically admit a new stable peer. Resume **MUST** reuse the retained Session host.
Framework **MAY** reject attachment/admission for capacity before any public peer is created.

**RPC-SPI-010 — Transition ownership.** Protocol Session host **MAY** project recovering, recovered, closed, and
single-Session `draining(counter-exhaustion)`. Framework alone **MUST** bulk-project Owner graceful drain and
`shutdown-deadline`; Protocol **MUST NOT** duplicate those transitions. A valid active Close and a
token-authorized `session-terminated` reject **MUST** normalize to `remote-terminated`.

**RPC-SPI-011 — Fault scope.** Session Protocol/resource fault **MUST** synchronously reenter a Framework fault
transaction that calls `session.forceClose()` before projecting peer terminal. A shared owner fault **MUST**
call `runtime.close()` before projecting Owner/siblings. Protocol **MUST NOT** also request a second closed
transition for the same fault.

**RPC-SPI-012 — Three termination phases.** Runtime `shutdown()` **MUST** synchronously gate new work and fulfill
only when every semantic Session shell has gracefully completed or locally terminalled and Direct Close has
been invoked; it **MUST NOT** await physical cleanup. Runtime `close()` **MUST** synchronously force gates, finish
sinks, fence endpoints, and invoke Direct Close before returning, without sending Protocol Close. `cleanup()`
**MUST** be a cached Protocol-owned final task and **MUST NOT** include Connection/listener cleanup or running
handlers, which Framework tracks separately.

## 9. Built-in Protocol profile

### 9.1 Profile and Codec

**RPC-WIRE-001 — Atomic profile.** The built-in identifier **MUST** be the exact string `husky-di-rpc/1`.
This profile **MUST** atomically fix Codec, grammar, bearer-credential security, Recovery, deduplication,
receipt ACK, and terminal replay. It **MUST NOT** expose Codec negotiation, a capability bag, feature flags that
weaken those guarantees, or an extension registry. A Session **MUST** freeze its selected profile; resume
**MUST NOT** renegotiate it.

**RPC-WIRE-002 — JSON message.** Each Transport message **MUST** contain exactly one RFC 8259 UTF-8 JSON text
whose root is an object. The Protocol **MUST NOT** add a stream header such as `Content-Length`; framing belongs
to the Adapter.

**RPC-WIRE-003 — Lexical validation.** Before ordinary object materialization, the Codec **MUST** reject a
leading BOM, malformed UTF-8, an unpaired surrogate, a second JSON value, non-whitespace trailing data, duplicate
object members at any depth after escape decoding, or any fixed limit in `RPC-VALUE-004`. Legal whitespace,
member order, and equivalent escape spelling **MUST NOT** alter semantics. Strings and names **MUST NOT** undergo
Unicode normalization or case folding.

**RPC-WIRE-004 — Number domain.** Application numbers **MUST** be finite binary64 values other than `-0`; their
decimal representation **MUST** round-trip to the same value. Protocol integers **MUST** be JSON safe integers
within the field-specific range. Absence of an optional member **MUST NOT** be equated with `null`.

**RPC-WIRE-005 — Unknown tails.** A recognized top-level record and a nested tagged `SemanticMessage` **MUST**
accept additional members after validating them as bounded JSON data, then ignore, release, and not round-trip
them. The nested untagged `error` object **MUST** be closed to its known fields. Objects inside
`args`, `value`, or `details` **MUST** treat every member as application data. Duplicate names always invalidate
the record.

**RPC-WIRE-006 — Evolution.** The same profile **MAY** add only optional fields that an old endpoint can safely
ignore. A new kind, required transition, changed known-field meaning, algorithm change, or weakened guarantee
**MUST** use a new profile.

### 9.2 Record grammar

The decoded grammar is:

```text
ProfileId   = non-empty UTF-8 string of at most 256 bytes
Sequence    = integer 1..9007199254740991
AckCursor   = integer 0..9007199254740991
Base64Url32 = canonical unpadded base64url encoding of exactly 32 bytes

FreshRequest = {
  kind: "fresh",
  profiles: [ProfileId, ...]
}

FreshAccept = {
  kind: "accept",
  profile: ProfileId,
  sessionId: Base64Url32,
  bindingEpoch: 1,
  resumeToken: Base64Url32
}

ResumeRequest = {
  kind: "resume",
  profile: ProfileId,
  sessionId: Base64Url32,
  resumeToken: Base64Url32,
  receivedThrough: AckCursor,
  resumeAttempt: Sequence
}

ResumeAccept = {
  kind: "accept",
  profile: ProfileId,
  sessionId: Base64Url32,
  bindingEpoch: Sequence,
  receivedThrough: AckCursor
}

FreshReject = {
  kind: "reject",
  code: "unsupported-profile" | "admission-rejected",
  message?: string
}

GenericResumeReject = {
  kind: "reject",
  code: "resume-rejected"
}

AuthorizedResumeReject = {
  kind: "reject",
  code: "continuity-failure" | "session-terminated"
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

**RPC-WIRE-008 — Security carriers.** Each `sessionId` and `resumeToken` **MUST** use `Base64Url32`. Decoder
**MUST** reject padding, non-URL alphabet, wrong length, or any alternate spelling for the same bytes. A
`sessionId` **MUST NOT** grant authority without the corresponding `resumeToken`.

**RPC-WIRE-009 — Phases.** The first initiator record on a new Connection **MUST** be `fresh` or `resume`; the
responder outcome **MUST** be `accept` or `reject`. Bootstrap records **MUST NOT** have sequence or ACK semantics.
Responder enters active phase only after Local Admission of `accept` and Binding Activation; initiator enters
only after its bootstrap request reaches Local Admission, it validates the matching `accept`, and its exact
binding activates. Active phase **MUST** accept only `message`, `ack`, `ping`, `pong`, or `close`. Wrong phase or
unknown kind **MUST** fault at the scope in Section 11.2.

**RPC-WIRE-010 — Reject shape.** Only a fresh `unsupported-profile` or `admission-rejected` **MAY** carry the
optional bounded `message`. Generic and token-authorized resume rejects **MUST** use exactly their two known
fields, `kind` and `code`, and **MUST NOT** carry `message`, although the normal top-level unknown-tail rule still
applies to input.

The complete v1 sequenced semantic union is:

```text
Call = {
  kind: "call",
  callId: CanonicalCallOrdinal,
  service: NonEmptyIdentifier,
  method: NonEmptyIdentifier,
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
          "unknown-service" | "unknown-method",
    message: string,
    details?: ApplicationValue
  }
}

SemanticMessage = Call | Cancel | Result | Error
```

`CanonicalCallOrdinal` is the unsigned decimal spelling of a direction-local integer in
`1..9007199254740991`, with no leading zero.

**RPC-WIRE-011 — Call fields.** Service and method **MUST** be non-empty identifiers of at most 256 UTF-8 bytes
and compare exactly. Wire method `then` **MUST** be a profile violation. `args` **MUST** be an array. Missing
`result.value` **MUST** mean `void`; present `null` **MUST** remain a value.

**RPC-WIRE-012 — Error record.** Wire `error.code` **MUST** be one of the five codes shown above.
`outcome-unknown` **MUST NOT** be sent because it is a local evidence-loss mapping, and Protocol failure
**MUST NOT** masquerade as a call error. Message/details **MUST** be safe normalized values and **MUST NOT**
transport JavaScript `name`, stack, cause, raw Error, or thrown object.

**RPC-WIRE-013 — Cancel.** Cancel **MUST** express cooperative intent only. It **MUST NOT** be treated as a
terminal, rollback, or proof that dispatch did not occur. Result/error and cancel races **MUST** use the retained
first-terminal-wins state.

**RPC-WIRE-014 — Activity controls.** Ping/Pong **MUST** be active-phase, connection-local, unsequenced,
unacknowledged, unreplayed, absent from call state and public events. A Ping **MUST** schedule one coalesced Pong;
a Pong **MUST NOT** trigger a reply.

**RPC-WIRE-015 — Graceful Close.** Close **MUST** be active-phase, connection-local, unsequenced,
unacknowledged, unreplayed, and contain no known seq/ACK/token/reason/identity field. A receiver **MUST**
authoritatively terminal the exact current Session, reply with nothing, and map the public reason to
`remote-terminated`. Forced public `close()` **MUST NOT** send this record.

### 9.3 Sequence, receipt ACK, and replay

**RPC-ACK-001 — Directional sequence.** Each sending direction **MUST** allocate continuous `seq` values from
one, independent of Call Ordinals. Sequence **MUST NOT** wrap or reset during a Session Incarnation.

**RPC-ACK-002 — Receipt meaning.** `ackThrough: N` **MUST** mean that every message `seq <= N` has completed
lexical/schema/resource/continuity validation and has a durable idempotent disposition with enough retained
evidence to suppress replay. It **MUST NOT** mean handler start/completion or external side-effect commit.

**RPC-ACK-003 — AckOnly and piggyback.** A sequenced envelope **MAY** piggyback the newest reverse receipt.
AckOnly **MUST** have no `seq` and **MUST NOT** be acknowledged. The first dirty receipt **MUST** start one
non-sliding `ackDelayMs`; absent a piggyback opportunity it **MUST** mark one latest AckOnly ready. Actual send
**MUST** wait for an idle send slot and remain bounded by send-progress timeout.

**RPC-ACK-004 — Replay representation.** Sender **MUST** retain immutable `(seq, SemanticMessage)`, not encoded
envelope bytes. Initial send and replay **MUST** reuse both values while allowing a newer piggyback ACK. Envelope
fallibility and maximum width **MUST** be validated before Admission so replay cannot become poison after ACK
digits grow.

**RPC-ACK-005 — Duplicate.** A valid `seq <= receivedThrough` **MUST** process a valid new `ackThrough` but
**MUST** suppress the semantic body before Call State and handler dispatch and **MAY** resend the current receipt.
Changing the body for an old seq violates the Protocol and **MUST** fault while comparison evidence remains;
after receipt/ledger evidence is legitimately GC'd, receiver **MUST NOT** retain a permanent payload fingerprint
only to detect a body that can no longer affect state.

**RPC-ACK-006 — Gaps and ACK bounds.** A current-binding `seq > expected` or ACK above this direction's highest
sent sequence **MUST** terminal the Session as a Protocol/continuity fault without ACK or Recovery. Stale/equal
ACK and `ackThrough: 0` **MUST** be valid no-ops.

**RPC-ACK-007 — Replay barrier.** A replacement binding **MUST** freeze a finite replay set and transmit every
retained entry above the token-authorized peer cursor in original sequence order before allocating a new seq.
New work **MAY** queue during the barrier but **MUST NOT** extend it.

### 9.4 Logical Call ledger

**RPC-LEDGER-001 — Identity.** A Logical Call identity **MUST** be `(Session Incarnation, originating direction,
callId)`. The built-in Protocol **MUST** allocate direction-local continuous Call Ordinals from one and encode
them canonically. Pending Invocation **MUST NOT** own either Call Ordinal or message seq.

**RPC-LEDGER-002 — Request replay.** Uncertain receipt **MUST** replay the original seq, callId, and semantic
message. A fresh seq containing an already used Call Ordinal **MUST** be an identity-reuse Protocol fault even if
the body is equal. Recovery **MUST NOT** manufacture a new identity for an existing invocation.

**RPC-LEDGER-003 — Incoming order.** For an expected fresh call, receiver **MUST** decide in this order: fixed
validation; seq/ordinal; ordinary handler-work capacity without route lookup; then exact route. Capacity failure
with protected reserve **MUST** atomically record terminal `unavailable` and advance receipt without retaining
the validated args, handler, or event. Capacity success plus known route **MUST** record in-progress Remote
Request Admission; unknown route **MUST** record the corresponding non-dispatch semantic terminal and safe
event pair.

**RPC-LEDGER-004 — Handler terminal.** Each admitted handler **MUST** have a reserved minimum terminal slot.
Framework **MUST** normalize a successful result before committing it. Invalid result, over-limit envelope, or
ordinary terminal-payload exhaustion **MUST** commit the fixed safe `handler-failed` terminal. The terminal
entry **MUST** become immutable before its unique result/error message is scheduled.

**RPC-LEDGER-005 — GC.** Unacknowledged terminal **MUST** be retained and replayed with its original message
identity. Terminal ACK **MAY** release payload and per-call entry only after the direction's
`highestAdmittedCallOrdinal` remains sufficient to reject old identity reuse. Receipt and ordinal high-watermarks
**MUST** survive until Session terminal. Once a terminal wins, the incoming ledger **MUST** immediately release
the Framework call handle, handler closure, and request arguments; only the terminal/replay identity and bounded
dedupe metadata may remain until ACK. Once an outgoing Call is admitted and its immutable replay entry owns the
request payload, the outgoing call ledger **MUST** release its originating request snapshot; ACK release of that
replay entry **MUST NOT** leave request arguments retained while the call awaits a terminal. Ordinary pressure
**MUST NOT** evict replay, call, terminal, or dedupe evidence required by this paragraph.

## 10. Session establishment and Recovery

### 10.1 Incarnation and fresh establishment

**RPC-SESSION-001 — Incarnation.** Responder **MUST** create the `sessionId` and an independent `resumeToken` for
one in-memory retained Session Incarnation containing stable peer, profile, both sequence/replay directions,
call ledger, binding epoch, and resume-attempt high-watermark. The token **MUST** remain stable and **MUST NOT**
rotate within that incarnation. A process restart or retained-state loss **MUST** end the incarnation; v1
**MUST NOT** persist or silently reconstruct it.

**RPC-SESSION-002 — Session ID generation.** For each fresh attempt responder **MUST** test at most eight
independent 32-byte CSPRNG candidates against the Owner's retained and provisional ID set in a non-awaiting step.
A selected candidate **MUST** be provisionally reserved before Session installation. Eight collisions **MUST**
be a shared CSPRNG invariant fault, not a duplicate Session. Released historical IDs need no tombstone;
historical uniqueness is probabilistic and authority remains the independent `resumeToken`.

**RPC-SESSION-003 — Fresh install.** Before Session-ID or `resumeToken` generation, responder **MUST** reserve
Session capacity and protected control state in one non-awaiting step that counts retained Sessions plus all
provisional fresh reservations. When that capacity is full, the reservation **MUST** first claim the eligible
Recovery with the earliest active absolute deadline under `RPC-RESOURCE-006`, or fail without evicting a
connected or replacement-bound Session. It **MUST** generate the Session ID and token from independent 32-byte
CSPRNG outputs and install the Session only if Owner, endpoint, provisional identity, profile, and reservations
remain current. Initiator **MUST** validate the protected fresh accept and retain its token before attaching the
Session to its stable peer.

**RPC-SESSION-004 — Fresh failure.** Unsupported profile or bounded post-classification Session capacity
**MUST** be attempt-scoped. A fresh accept that was installed by responder but lost **MUST** leave responder's
Session retained/recovering; an initiator that never verified accept **MUST** remain unbound. Neither side
**MUST** claim continuity with an unverified local Session.

### 10.2 Binding, attempts, and cursors

**RPC-SESSION-005 — Binding epoch.** Every Physical Connection Binding selected at Binding Linearization
**MUST** receive a strictly increasing safe-integer epoch. The exact current endpoint and epoch **MUST** be the
only binding authority; it becomes active authority only at Binding Activation. Linearizing a newer valid
binding **MUST** atomically fence the old endpoint before it can affect state. An initiator **MUST** require an
epoch greater than its last verified value, not exactly plus one, because an accept may have been lost.

**RPC-SESSION-006 — Resume attempt.** Initiator `resumeAttempt` **MUST** start at one, strictly increase, allow
gaps, never be reused or wrapped, and be consumed before preparing the token-bearing request. Failure, timeout,
or lost request/accept **MUST NOT** roll it back. Responder **MUST** retain `highestAcceptedResumeAttempt` and
accept only a higher token-valid attempt at binding linearization.

**RPC-SESSION-007 — Last valid resume wins.** Concurrent token-valid resumes **MAY** linearize successively; the
last linearized endpoint **MUST** be current and all prior endpoints **MUST** be fenced. A valid replacement
**MAY** supersede a binding the other side still believes healthy. Only the exact current linearized binding
**MAY** activate. Lost accept **MUST** remain recoverable by a higher attempt using the same stable
`resumeToken`.

**RPC-SESSION-008 — Cursor meaning.** Resume request `receivedThrough` **MUST** describe initiator receipt of
responder messages; accept `receivedThrough` **MUST** describe responder receipt of initiator messages. For each
direction, the token-authorized allowed interval **MUST** be `[peerReceivedThrough, highestSentSeq]`. A value in
that interval **MAY** advance knowledge after a lost ACK; a lower or higher value **MUST** produce
`continuity-failure`, never a silent maximum.

**RPC-SESSION-009 — Resume linearization.** After token comparison and without an intervening await, responder
**MUST** atomically recheck Owner/Session non-terminal state, exact attempt endpoint, profile/session, stable
token, Recovery deadline, attempt high-watermark, both current cursor bounds, next epoch, and
binding/Connection reservations. Only then may it advance attempt and epoch, fence the old endpoint, and
linearize the replacement Physical Connection Binding. Any changed fact **MUST** cause reclassification or
discard of the stale candidate.

**RPC-SESSION-010 — Initiator verification.** Before Binding Linearization from an accept or terminaling from a
token-authorized reject, initiator **MUST** recheck the exact attempt endpoint, profile/session, current
state/deadline, last verified epoch, retained cursor bounds, and higher-attempt winner. Timeout, cutoff, fencing,
or later winner **MUST** make a late outcome a no-op.

**RPC-SESSION-011 — Binding activation.** Binding Linearization **MUST** retain the Session and exact Physical
Connection Binding before any asynchronous reply-admission wait, but **MUST NOT** yet permit active records,
replay, or successful `bind()` or `accept()` fulfillment. Responder Binding Activation **MUST** wait for Local
Admission of its `accept`; initiator Binding Activation **MUST** wait for Local Admission of its bootstrap
request and validation of the matching `accept`. Activation **MUST** apply only to the exact current linearized
binding.
Before Linearization, timeout, abort, or Connection terminal **MUST** remain attempt-scoped. After Linearization
but before Activation, any such outcome or active ingress admitted against that binding **MUST** fail the exact
binding without rolling back its Binding Epoch and **MUST NOT** later activate it. After Activation, late
attempt-level timeout, abort, or bootstrap settlement **MUST** have no effect.

### 10.3 Recovery lifecycle

**RPC-RECOVERY-001 — Entering Recovery.** Unexpected current-Connection terminal, valid silence timeout, or
send-progress timeout **MUST** atomically fence the binding, project `recovering`, preserve Pending/call/replay/
exposure state, and then invoke Direct Close. It **MUST NOT** wait for close before fencing or automatically dial
a new Adapter. The separate opt-in Connector Reconnection supervisor in 10.4 **MAY** observe that projection and
request replacement attempts without changing Protocol Recovery authority.

**RPC-RECOVERY-002 — Attempt timeout.** Fresh/resume attempt **MUST** use the configured absolute non-sliding
`bindingAttemptTimeoutMs`. Fresh timeout **MUST** return the peer to `unbound`; resume timeout **MUST** leave it
`recovering`. Failed attempts **MUST NOT** extend Session retention.

**RPC-RECOVERY-003 — Retention.** Recovery retention **MUST** start at actual binding loss/fence and use one
absolute non-sliding `recoveryGraceMs`. Successful resume **MUST** cancel it; attack input, failed attempts, and
attempt activity **MUST NOT** reset it. Deadline, accept, and Acceptor fresh-capacity reclamation **MUST** compete
for one winner. Expiry or reclamation **MUST** terminal Pending work as `unavailable` and admitted work without
authoritative terminal as `outcome-unknown`; reclamation **MUST** project `forced-close`, not
`recovery-expired`. Reclamation order **MUST** follow the active absolute Recovery deadline under
`RPC-RESOURCE-006`, not Session creation time. The initiator of a reclaimed responder Session remains recovering
until a later successful resume or its own deadline because fresh pressure carries no remote Session authority.

**RPC-RECOVERY-004 — Stable state.** Recovery **MUST** preserve the peer object, resolved facades, exposures,
Call Identities, replay entries, handler-dispatch evidence, and membership position. Connection replacement
alone **MUST NOT** settle a call or emit a second `peer-opened`.

**RPC-RECOVERY-005 — Stale endpoint.** A callback, record, terminal, send completion, or close completion from a
fenced endpoint **MUST** be rejected by the endpoint/epoch gate before Codec or activity accounting and **MUST**
have no Session authority. The endpoint **MAY** be Direct Closed.

**RPC-RECOVERY-006 — No restart authority.** Unknown/expired Session, lost token state, abrupt remote restart,
wrong profile, mismatched token, stale attempt, or resume-specific capacity **MUST** receive only generic
`resume-rejected` after bounded classification. It **MUST NOT** terminate the retained Session or claim the
remote process restarted. Initiator **MUST** remain recovering until another successful attempt or its existing
deadline.

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

**RPC-RECONNECT-002 — Orchestration state.** The supervisor **MUST** expose a synchronous frozen `state` and a
multicast replay-latest `state$` over only `idle`, `connecting`, `monitoring`, `waiting { nextAttempt, delayMs }`,
`reconnecting { attempt }`, and terminal `stopped { reason }`. These states describe orchestration, not the
authoritative Peer state. `state$` **MUST** never error and **MUST** complete after its terminal state. After an
initial success, the first `recovering` projection **MUST** synchronously publish `reconnecting { attempt: 1 }`
and defer Factory invocation until a microtask, so Peer Recovery is observable first. Successful replacement
**MUST** return to `monitoring`; a later Recovery episode **MUST** restart numbering at one.

**RPC-RECONNECT-003 — Finite policy.** Policy construction **MUST** snapshot at most 64 non-negative
safe-integer `retryDelaysMs` values and one positive safe-integer `attemptTimeoutMs`. The default delays **MUST**
be `[1000, 2000, 5000, 10000, 20000, 30000, 60000, 60000, 60000]` and the default timeout **MUST** be 30000 ms.
Each Recovery episode **MUST** make one immediate replacement attempt; delay item N **MUST** authorize attempt
N+2 exactly that many milliseconds after attempt N+1 settles. The timeout **MUST** cover only each replacement
Adapter startup, handoff, and Protocol binding, cancel through the Connector signal, and **MUST NOT** move the
Protocol Recovery deadline. Exhaustion **MUST** stop with `retries-exhausted` while the Peer remains governed by
its authoritative Recovery outcome.

**RPC-RECONNECT-004 — Attempt authority and stop.** While active, the supervisor **MUST** be the sole caller of
its Connector's `connect()`; manual takeover **MUST** first await `stop()`. `stop()` **MUST** be terminal and
idempotent, return the same Promise, synchronously cancel a scheduled or unsettled attempt, and fulfill only
after that attempt releases Connector authority. It **MUST NOT** call Connector `shutdown()` or `close()`.
Connector termination **MUST** cancel supervision and stop with `connector-terminated`; explicit stop **MUST**
use `requested`. Cancellation and Connector terminal **MUST NOT** be treated as attempt failure.

**RPC-RECONNECT-005 — Failure telemetry.** The supervisor **MUST** expose hot multicast non-replaying `event$`
that never errors and completes on stop. It **MUST** emit only background `attempt-failed` records containing
the one-based episode attempt, one of `adapter-factory | connector-attempt | attempt-timeout`, and
`nextDelayMs` exactly when another attempt is scheduled. The resulting `waiting` or `stopped` state **MUST** be
committed before the event. The event **MUST NOT** contain Error, Adapter/Protocol internals, endpoint data,
payload, Session identity, credentials, or other caller-controlled values.

## 11. Recovery security and validation

### 11.1 Deployment prerequisite and bearer credential

**RPC-SEC-001 — Conditional security.** Secure `husky-di-rpc/1` Recovery **MUST** run each fresh/replacement
Connection over a Transport deployment providing confidentiality, ordered integrity/anti-replay, and expected
responder endpoint authentication. The protected channel **MUST** be established after the Transport handshake;
a `FreshRequest` or `ResumeRequest` **MUST NOT** be sent as TLS 0-RTT or any other replayable early data. The
Framework **MUST NOT** infer this from an Adapter boolean. Plaintext or unauthenticated deployment **MAY**
exercise functional grammar but **MUST NOT** claim secure Recovery or ACK authority: observing a fresh accept or
resume request reveals the bearer credential. The `resumeToken` establishes continuity, not a user, tenant, or
initiating-application identity; ordinary server-authenticated TLS likewise authenticates only the responder. A
deployment accepting untrusted inbound Connections **MUST** authenticate and admit the initiator before Acceptor
handoff and enforce per-principal connection, Session, request-rate, and handler-duration limits outside this
Protocol.

**RPC-SEC-002 — Entropy.** The profile **MUST** use a platform CSPRNG without negotiation. Every fresh Session
**MUST** receive an independent uniformly random 32-byte `resumeToken`, separately generated from its 32-byte
`sessionId`, and both values **MUST** use their single canonical `Base64Url32` spelling. Token comparison occurs
only after grammar validation and **MUST** compare that exact canonical string. Constant-time JavaScript or
network behavior is not a conformance promise.

**RPC-SEC-003 — Stable bearer.** A `resumeToken` **MUST** grant authority only for its one retained Session
Incarnation. The responder **MUST** send it only in that Session's protected `FreshAccept`; the initiator
**MUST** retain it and carry the exact same value in every `ResumeRequest`. The Protocol **MUST NOT** rotate,
derive, transform, echo in a resume outcome, or reuse the token for another Session Incarnation. A `sessionId`
without the matching token has no resume authority.

**RPC-SEC-004 — Transport root.** A deployment claiming secure Recovery **MUST** wait for the Transport
handshake to establish the protected anti-replay channel before handing off a Connection that can carry
`FreshRequest` or `ResumeRequest`. It **MUST** carry fresh issuance and every later presentation of a
`resumeToken` only inside that channel. The bearer credential **MUST NOT** be presented as a substitute for
Transport confidentiality, integrity/anti-replay, or expected responder endpoint authentication. Anyone who
obtains the token can exercise its authority while the retained Session exists.

**RPC-SEC-005 — Generic reject.** After obtaining a bounded handshake slot, unknown/expired Session, wrong
profile, mismatched token, stale attempt, and resume-specific capacity **MUST** use the same `resume-rejected`
code, known field set, bounded classification path, and no authoritative state effect. The response **MUST NOT**
echo the token, attempt, Session identity, cursor, or any supplied value. Strict timing equivalence is not a
conformance promise.

**RPC-SEC-006 — Token-authorized reject.** Only after exact `resumeToken` match and a currently admissible newer
attempt **MAY** responder reveal `session-terminated`. Only such a token-valid attempt whose `receivedThrough`
contradicts the current allowed interval **MAY** produce `continuity-failure` and terminal the Session. A token
mismatch or stale attempt **MUST** remain a generic reject and **MUST NOT** terminal the Session. Before
continuity-terminal linearization responder **MUST** recheck attempt, endpoint, state, deadline, token, cursor,
and current retained facts so a stale candidate cannot terminate a higher winning attempt. The protected exact
Connection supplies outcome integrity; the reject carries no additional authenticator.

**RPC-SEC-007 — Active records.** After successful binding, active records **MUST** derive integrity/order/
anti-replay authority from the protected exact current Connection and local epoch fencing. The built-in Protocol
**MUST NOT** add an active `authTag` or public channel identity. Close has the same current-binding authority.

### 11.2 Validation pipeline and fault scope

**RPC-VALID-001 — Pipeline.** Input **MUST** be processed in this order, and failure at one stage **MUST** prevent
all later effects:

1. Adapter native framing/allocation/queue admission;
2. exact endpoint/epoch gate;
3. raw byte, UTF-8, JSON lexical, duplicate, depth/count/size checks;
4. bounded tree, tagged-union, known-field, scalar-carrier, and unknown-tail checks;
5. bootstrap/active phase and Transport-security prerequisite;
6. token/attempt or active current-binding authority;
7. retained profile/session/cursor/sequence/ACK/Call-Ordinal/terminal semantics;
8. mutable capacity, then route lookup, then durable disposition;
9. receipt/state/activity/event commit and release of transient representations.

**RPC-VALID-002 — Receipt and activity.** A sequenced receipt **MUST** advance only after durable disposition.
Activity **MUST** update after complete validation and legal semantic disposition, including a legal idempotent
no-op such as stale ACK or coalesced Ping/Pong. Raw, malformed, or stale-endpoint input **MUST NOT** count.

**RPC-VALID-003 — Attempt failures.** Adapter raw failure or invalid unbound first record **MUST** remain
Connection/attempt-scoped. The shared generic handshake permit **MUST** be acquired before endpoint
subscription, Codec entry, or fresh/resume classification. Pre-bootstrap Connection/handshake capacity failure
**MUST** Direct Close without subscription, parsing, Session lookup, or wire reject. A malformed or contradictory
accept **MUST** fail only the attempt; fresh returns unbound and resume remains recovering.

**RPC-VALID-004 — Continuity failures.** A token-valid resume cursor outside retained bounds or a resume accept
on the exact protected attempt that contradicts retained profile/session/cursor/epoch facts **MUST** terminal the
affected Session as `continuity-failure`. A contradictory protected fresh accept **MUST** fail the attempt before
local Session installation.

**RPC-VALID-005 — Active poison.** A lexical, schema, phase, fixed-limit, unknown-kind, identity-reuse,
conflicting-terminal, sequence-gap, or ACK-upper-bound violation attributable to the protected current endpoint
after entering the Codec **MUST** terminal that Session as Protocol fault, with no ACK and no Recovery. It
**MUST NOT** merely reconnect and replay the same poison forever.

**RPC-VALID-006 — Ordinary overload.** Valid expected call ordinary-capacity failure with intact reserve
**MUST** produce protected terminal `unavailable`, receipt, and Definite Non-Execution. Protected reserve failure
**MUST** be Session `resource-fault`, not a call error. Shared CSPRNG/runtime invariant corruption **MUST** fault
the Owner; only a truly shared Acceptor failure may affect siblings.

**RPC-VALID-007 — Name and handler failures.** Unknown service/method and handler throw/invalid result **MUST**
remain call-scoped, except reserved `then`, which **MUST** be a profile violation. Business authorization remains
outside the Session authority model.

### 11.3 Credential and candidate lifetime

**RPC-SEC-008 — Credential lifetime.** Each side **MUST** retain only the `resumeToken` reference and current
handshake metadata required by its live Session Incarnation. The token **MUST NOT** be durably persisted,
rotated, logged, placed in telemetry, public state, or an Error, or reused across incarnations. Session terminal
**MUST** release the retained JavaScript string reference and all candidate references to it. A built-in
Connector binding failure crossing the Protocol boundary **MUST** replace any Adapter or Codec Error that may
contain token-bearing frame bytes with a fixed credential-free Error. JavaScript strings are immutable, so
in-place overwrite and JavaScript heap or physical-memory erasure are not promised.

**RPC-SEC-009 — Authority candidate.** A token match **MUST** create only a candidate. Timeout, fence, cutoff,
higher attempt, changed Session/token facts, or terminal **MUST** remove its state authority. Responder
linearization **MUST** synchronously recheck the candidate as required by `RPC-SESSION-009`; late reply-send or
Connection settlement **MUST NOT** restore stale Session authority. The handshake permit and transient budget
**MUST** remain owned until bootstrap processing transfers the exact binding or the attempt settles.

## 12. Resources, scheduling, and time

### 12.1 Default retained budgets

**RPC-RESOURCE-001 — Session budget.** Default retained limits per Session **MUST** be:

| Resource | Default |
| --- | ---: |
| Connection ingress backlog | `64 records / 8 MiB` |
| Pending Invocations | `256 entries / 8 MiB` |
| Unretired calls | `256 / originating direction` |
| Incoming handler work-set | `256 jobs / 8 MiB args` |
| Running handlers | `16` |
| Immutable replay queue | `1,024 records / 16 MiB` |
| Retained terminal application payload | `256 records / 8 MiB`, inside replay cap |
| All retained Session state | `32 MiB` |
| Protected control/terminal reserve | `512 KiB`, inside Session cap |
| Session ID/token/handshake state | `64 KiB`, inside protected reserve |

Each built-in Session **MUST** initialize one aggregate child ledger with its `512 KiB` protected reserve.
Every Session-attributable ordinary charge **MUST** atomically acquire both that child ledger and the Owner
ledger; failure of either side **MUST** roll back the other without a callback or observable admission. A later
Endpoint record queued before bootstrap classification **MUST** transfer its existing Owner-only charge into the
resolved Session child ledger in one non-awaiting step before active processing.

**RPC-RESOURCE-005 — Entry charge.** Each pending, ledger, handler-job, and replay entry **MUST** charge at least
`256 B` in addition to payload weight. Within one entry shared immutable payload need not be double charged.

**RPC-RESOURCE-002 — Protected reserve.** Protected reserve **MUST** be deducted at Session creation and
**MUST NOT** be borrowed by ordinary work. Maximum charges **MUST** be `768 B` per terminal disposition including
safe replay metadata, `384 B` per cancel, `512 B` each for coalesced ACK/Ping/Pong/Close, and `65,536 B` total
security state. Thus the fixed worst case
`256*768 + 256*384 + 4*512 + 65,536 = 362,496 B` **MUST** remain below `512 KiB`.

**RPC-RESOURCE-003 — Acceptor budget.** Default Acceptor-wide limits **MUST** be:

| Resource | Default |
| --- | ---: |
| Retained Sessions/peers | `64` |
| Shared fresh/resume handshakes | `16` |
| Ordinary owned Connections | `96 = maxSessions + 2*maxHandshakes` |
| Non-borrowable overflow-close slot | `1` |
| Total owned Connections | `97` |
| Running handlers | `64` |
| Aggregate retained state including reserves | `64 MiB` |

One Owner ledger **MUST** atomically charge every protected Session reservation, queued Endpoint ingress after
the transient-covered first record, Pending/replay ordinary entry, and incoming handler payload against
`maxRetainedBytesTotal`. A retained representation shared across a synchronous Pending-to-replay transfer
**MUST NOT** be double charged; replacing that charge **MUST** be one non-awaiting step with no reentrant
callback or observable admission between release and replacement. Capacity failure **MUST** remain attempt- or
call-scoped when the protected reserve is intact. Every ACK, call terminal, cancellation, failed admission,
Endpoint close, and Session terminal **MUST** release its unique charge exactly once.

**RPC-RESOURCE-006 — Retained ownership.** A Connection whose Direct Close has not settled **MUST** continue
occupying its ordinary/overflow slot. Fresh admission pressure **MUST NOT** evict an existing connected Session.
When retained Sessions plus provisional fresh reservations reach `maxSessions`, an Acceptor fresh attempt
**MUST** reserve against and synchronously force one recovering Session with no current or linearized replacement
binding whose absolute Recovery deadline has not won, before Session-ID or token generation. The reservation
**MUST** precede the victim's public terminal notification so reentrant admission cannot overcommit capacity. If
multiple Sessions are reclaimable, the victim **MUST** have the earliest active absolute Recovery deadline;
equal deadlines **MAY** be resolved in retained Session order. If no reclaimable recovering Session exists, the
fresh attempt **MUST** be rejected.

**RPC-RESOURCE-004 — Bootstrap transient.** Before endpoint subscription or first-record parsing, each admitted
handshake **MUST** acquire one Owner-global generic slot that is shared by fresh and resume without a role
subpool. Each slot **MUST** charge exactly `4 MiB` transient weight: up to `1 MiB` raw Adapter carrier, `1 MiB`
Codec/tree, `1 MiB` bounded bootstrap working representation, and `1 MiB` accept/reject output plus fixed
bookkeeping. The reservation **MUST** stay until bootstrap processing transfers the binding or the attempt
settles. Policy validation **MUST** safely derive
`maxHandshakes * 4 MiB`; default 16 slots therefore have a distinct `64 MiB` transient budget.
Representational reuse **MUST NOT** reduce the admission charge. The first Endpoint record being processed is
covered by this fixed transient reservation; every later record retained or processed by that Endpoint **MUST**
instead hold its Owner retained-ledger charge until processing settles or the Endpoint closes. One representation
**MUST NOT** be charged to both budgets.

### 12.2 Runtime policy

Default policy is:

```text
maxSessions                         = 64
maxHandshakes                       = 16
maxPendingInvocationsPerSession     = 256
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

**RPC-POLICY-001 — Role options.** Acceptor caller options **MAY** override all fourteen fields. Connector caller
options **MAY** override only pending/session-bytes/session-handlers and the seven timing fields; Framework
**MUST** derive `maxSessions = maxHandshakes = 1`, `maxRetainedBytesTotal =
maxRetainedBytesPerSession`, and `maxHandlersTotal = maxHandlersPerSession`. The complete frozen required policy
**MUST** be passed to custom Protocol runtime.

**RPC-POLICY-002 — Derived subcaps.** Replay-entry count **MUST** be `4 * maxPendingInvocationsPerSession` and
ingress count **MUST** remain `64`. Ingress, Pending, incoming-args, and terminal-payload byte subcaps **MUST** be
floor(`maxRetainedBytesPerSession / 4`); replay subcap **MUST** be floor(`/ 2`), while total Session/Owner caps
always apply first through the Session aggregate ledger and shared Owner ledger. Ordinary Connection cap
**MUST** be `maxSessions + 2*maxHandshakes` plus the one overflow slot for Acceptor.

**RPC-POLICY-003 — Validation.** Factory **MUST** reject any policy that violates positive finite safe-integer
shape, safe derived arithmetic, `silenceTimeoutMs >= 3*activityProbeIntervalMs`,
`ackDelayMs <= activityProbeIntervalMs`, `bindingAttemptTimeoutMs <= recoveryGraceMs`,
`maxHandshakes >= 1`, Owner handlers at least per-Session handlers, Session bytes sufficient for one maximum
message plus reserve, `maxRetainedBytesPerSession >= 4,194,304` so each `/4` ingress/Pending/args/terminal
subcap can admit the `1 MiB` compatibility floor, or
`maxRetainedBytesTotal >= (maxSessions-1)*512 KiB + maxRetainedBytesPerSession`. Policy **MUST NOT** have a
runtime setter, per-peer override, `Infinity`, private bag, or wire negotiation. Each of the seven timing fields
**MUST NOT** exceed the platform timer delay ceiling of `2,147,483,647 ms`.

**RPC-POLICY-004 — No public internal capacity.** Framework **MUST NOT** expose internal queue/lane/permit/
priority/pause/resume/scheduler surfaces or a Connection capacity getter. Adapter-specific finite native queue
options belong to the Adapter package.

### 12.3 Outbound and ingress fairness

**RPC-SCHEDULE-001 — Binding send slot.** Each current Connection **MUST** have at most one unsettled send.
Send-progress timeout **MUST** fence and enter Recovery before Direct Close; a local `Promise.race` **MUST NOT**
allow reuse of the still-running Connection. Late old-epoch settlement **MUST** be a no-op and identity **MUST**
never roll back after `send()` invocation.

**RPC-SCHEDULE-002 — Outbound order.** Bootstrap **MUST** exclusively occupy bootstrap phase. On a replacement
binding, the finite replay barrier **MUST** precede new sequence allocation. After it, terminal/cancel intents
**MUST** share one FIFO and Pending Invocations another; when both are ready the scheduler **MUST** alternate,
starting with control. A new identity **MUST** be committed only after an idle send slot is obtained.

**RPC-SCHEDULE-003 — Probe fairness.** Ping/Pong **MUST** coalesce to one due flag and bounded-alternate with the
sequenced lane: after one probe send, if sequenced work is ready at least one sequenced send **MUST** precede the
next probe. Continuous valid probe input **MUST NOT** starve replay, terminal, cancel, or call work. Direct Close
**MUST NOT** require a send slot.

**RPC-SCHEDULE-004 — ACK fairness.** Receipt state **MUST** retain only the latest cumulative cursor and one due
flag, never one queue item per receipt. An AckOnly **MAY** use any idle turn that preserves all replay/control/
data/probe bounded-progress guarantees; conformance depends on progress and coalescing, not a private exact lane
implementation.

**RPC-SCHEDULE-005 — Ingress serialization.** A Connection driver **MUST** complete validation, durable
disposition, state/event staging, and queue publication in Transport emission order. Handler code **MUST NOT**
run inline in the ingress callback. Synchronous reentrant input **MUST** enter the bounded ingress backlog and be
fully charged through processing settlement; overflow **MUST** fault rather than drop, skip, or ACK an
undisposed expected record.

**RPC-SCHEDULE-006 — Handler fairness.** Handler start order **MUST** be FIFO per Session and round-robin among
ready Sessions while acquiring both Session and Owner permits. Cross-Session or completion order need not be
global. A winning terminal for a queued job **MUST** immediately unlink its scheduler closure and payload, and
that job **MUST NOT** start; a running job **MUST** retain its permit until real settlement. Framework **MUST NOT**
impose a normal handler execution timeout.

### 12.4 Activity and scheduler stalls

**RPC-TIME-001 — Activity probe.** After one `activityProbeIntervalMs` without valid inbound activity, each
active endpoint **MUST** schedule a Ping. Complete valid active input **MUST** count as activity; raw/malformed/
stale input **MUST NOT**. A custom Protocol **MUST** provide an equivalent bounded connection-local request/
response mechanism without call/replay identity or recursive reply.

**RPC-TIME-002 — Half-open detection.** After one `silenceTimeoutMs` without valid inbound activity, or one
`sendProgressTimeoutMs` without send settlement, runtime **MUST** fence, project Recovery, and Direct Close in
that order.

**RPC-TIME-003 — Late timer callback.** Health/progress timers **MUST** record expected fire time. If the runtime
was not scheduled for more than the corresponding interval, callback **MUST NOT** immediately condemn the
network using stale elapsed time: health **MUST** receive one new full probe confirmation window, and an already
unsettled send **MUST** receive one new full progress window. An already-running Recovery wall-clock deadline
**MUST NOT** be extended by scheduler stall; a connected stall **MUST NOT** retroactively consume Recovery time
that had not started.

### 12.5 Counter exhaustion

**RPC-COUNTER-001 — Never wrap.** Sequence, Call Ordinal, Binding Epoch, and resumeAttempt **MUST** be safe
integers and **MUST NOT** wrap, reset, or silently move existing calls to a new Session identity.

**RPC-COUNTER-002 — Sequence reserve.** Each sending direction **MUST** permanently reserve its last
`512 = 256 peer-call terminals + 256 local-call cancels` sequence values. Ordinary admission that would enter
the window **MUST** first transition the entire Session to `draining(counter-exhaustion)`. The window **MUST** be
used only for existing obligations and **MUST NOT** be borrowed back. Session-close consumes no seq.

**RPC-COUNTER-003 — Other counters.** Exhausted Call Ordinal **MUST** drain the entire Session rather than leave a
public connected peer with one permanently unavailable originating direction. The last Binding Epoch **MAY**
support its current binding but **MUST** prohibit another Recovery and start drain. The last resumeAttempt
**MAY** establish a binding; if it fails, or that binding is later lost, initiator **MUST** terminal
`counter-exhaustion`, mapping Pending/admitted work to `unavailable`/`outcome-unknown`.

**RPC-COUNTER-004 — Per-Session drain.** Counter drain **MUST** stop new local admission, resource-reject new
remote calls from protected reserve, finish existing finite work, and attempt graceful Close using its own
grace/cleanup intervals. In an Acceptor it **MUST NOT** drain healthy siblings or the Owner.

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

**RPC-LIFE-002 — Synchronous mode selection.** `shutdown()` **MUST** synchronously commit `draining` and `G`.
`close()` during active or draining **MUST** synchronously commit `closing(forced)` and `F`. A `close()` after
the Owner already entered `closing(graceful)` **MUST** only return the task; it **MUST NOT** force again, resend
Close, or restart cleanup.

### 13.1 Graceful cutoff and drain

**RPC-SHUTDOWN-001 — G gate.** At `G`, Framework **MUST** atomically reject new connect/listen/expose,
single-peer invocation, fresh/resume binding, and listener acceptance; abort any listener and non-active bootstrap;
and freeze the drain snapshot before emitting `owner-draining`.

**RPC-SHUTDOWN-002 — Snapshot membership.** The grace barrier **MUST** include Sessions connected at `G` and
already counter-draining Sessions with a current binding. Their pre-G Pending work **MUST** remain eligible for
Outgoing Admission, and their admitted calls, replay/control/ACK, queued/running handlers, and current send
**MUST** continue. A Session already recovering at `G` **MUST** be locally forced immediately: Pending becomes
`unavailable`, admitted work without terminal becomes `outcome-unknown`, and peer reason is `forced-close`.

**RPC-SHUTDOWN-003 — Post-G ingress.** A valid expected remote call arriving on a draining current binding
after `G` **MUST** still pass fixed/security/sequence/ordinal validation, then use protected Remote Resource
Rejection before route lookup, advance receipt, and create no incoming event. Malformed input, gap, or reserved
`then` **MUST** retain its normal fault scope.

**RPC-SHUTDOWN-004 — Binding loss during drain.** Loss of a draining binding **MUST** locally force only that
Session with reason `forced-close`, settle work by evidence, and skip Recovery. It **MUST NOT** force healthy
Acceptor siblings.

**RPC-SHUTDOWN-005 — Complete drain predicate.** A Session **MUST** be considered drained only when all of the
following are true in one non-awaiting observation:

```text
pendingInvocationCount == 0
unretiredCallEntryCount == 0
queuedHandlerCount == 0
runningHandlerCount == 0
replayEntryCount == 0
terminalOrCancelQueueCount == 0
ackDirty == false
sendSlot == idle
ingressDispositionInProgress == false
ingressBacklogCount == 0
replayBarrier == complete
```

**RPC-SHUTDOWN-010 — Drain exclusions.** A due activity probe/Pong **MUST NOT** prevent drain. No smaller proxy
such as “no calls” **MAY** replace the complete predicate.

### 13.2 Graceful Session-close

**RPC-SHUTDOWN-006 — Egress shell.** Once drained, Framework/Protocol **MUST** atomically stop Session ingress,
commit local peer `closed(graceful-shutdown)`, and extract a bounded egress shell holding only the exact current
Connection, fixed Close bytes, deadline, and fence token. All other Session evidence **MAY** then be released.

**RPC-SHUTDOWN-007 — One attempt.** An egress shell **MUST** invoke `send({kind:"close"})` at most once; invocation
itself consumes the opportunity. Fulfillment **MUST** trigger Direct Close immediately. Rejection or Connection
terminal **MUST** also trigger Direct Close without retry. Sender **MUST NOT** await remote receipt, ACK, or reply.

**RPC-SHUTDOWN-008 — Parallel grace.** All cutoff Sessions **MUST** drain in parallel against one Owner-wide
non-sliding grace deadline. One Session's local force or shell failure **MUST NOT** prematurely force a healthy
sibling. Grace completes when every cutoff Session either completed its shell or reached authoritative/forced
terminal and Direct Close was invoked; an initially empty snapshot **MUST** complete immediately.

**RPC-SHUTDOWN-009 — Remote Close.** A valid Close on the exact current protected binding **MUST** atomically
terminal the Session `remote-terminated`, settle remaining calls/handlers, fence, update membership, release
evidence, and Direct Close without ACK, terminal message, Pong, Close reply, or Recovery. In Acceptor it
**MUST** affect only that peer. Stale Close **MUST** be a no-op. If the Close itself is lost, receiver **MUST**
treat the resulting connection loss as ordinary Recovery and eventually expire absent a valid bearer resume.

### 13.3 Forced cutoff and cleanup

**RPC-CLOSE-001 — F semantics.** At `F`, Framework **MUST** reject/gate all semantic work, settle every Pending
Invocation as `unavailable`, settle each admitted call lacking authoritative terminal as `outcome-unknown`, keep
an existing terminal winner, remove queued handlers without start, abort a running cancelable handler's local
signal, and consume every running handler's late settlement without normalize/send/event authority.

**RPC-CLOSE-002 — Drop unsent intents.** Force **MUST** discard every replay/terminal/cancel/ACK/probe/Close
intent whose `send()` has not been invoked, fence all current/handshaking/fenced endpoints, and invoke Direct
Close. It **MUST NOT** wait for a send slot, start Recovery, or send Protocol Close. A send already invoked is
only a finite prefix and its late completion **MUST** be fenced.

**RPC-CLOSE-003 — No-Session peer.** Connector `shutdown()` while unbound/connecting **MUST** abort the attempt
and close its stable peer normally as `graceful-shutdown`; public `close()` **MUST** close it normally as
`forced-close`. No Session or Protocol Close is created. An empty Acceptor **MUST** move directly to cleanup.

**RPC-CLEANUP-001 — Two intervals.** `shutdown()` grace **MUST** last at most one configured
`shutdownDeadlineMs`; expiry **MUST** execute `F`. After successful grace or `F`, Owner **MUST** start exactly one
Owner-wide absolute non-sliding cleanup deadline of the same length. Thus graceful total is at most two
configured intervals (default 10 seconds) and direct close at most one (default 5 seconds), independent of peer
count.

**RPC-CLEANUP-002 — Cleanup barrier.** Framework **MUST** wait exactly once, by resource identity, for handed-off
Connection, listener, and accepted startup cleanup plus Protocol-owned `cleanup()`. Running handlers and egress
notification success **MUST NOT** be in the barrier. Deadline **MUST** fence and
detach a broken resource and consume late settlement; Framework cannot promise to stop arbitrary third-party
code outside the seam.

**RPC-CLEANUP-003 — Task outcome.** Grace timeout, explicit mode escalation, Protocol/call fault, Session force,
or Close-notification send failure **MUST NOT** reject the shared task by itself. Only owned cleanup rejection or
cleanup timeout **MUST** reject it. One error **MUST** reuse the trusted local Error; multiple errors **MUST** form
a standard `AggregateError` in stable resource-admission order.

**RPC-CLEANUP-004 — Final ordering.** At `G`, Framework **MUST** emit committed state/membership then
`owner-draining` and applicable `peer-draining`. It **MUST** emit `owner-closing` only after successful grace or
`F`; every related `call-finished` **MUST** precede that peer's `peer-closed`. Final cleanup **MUST** commit Owner
closed state, emit final state streams and complete them, emit the single `topology-closed`, complete `event$`,
and only then fulfill/reject the cached task.

## 14. Conformance and release evidence

### 14.1 Requirement traceability

**RPC-EVIDENCE-001 — Stable mapping.** Every normative requirement ID in this document **MUST** have exactly one
row in the repository requirement matrix and at least one reproducible evidence reference. IDs **MUST NOT** be
renumbered or reused after publication. Matrix references **MUST** resolve to an existing test case,
instrumented probe, review artifact, or installed-package consumer.

**RPC-EVIDENCE-002 — Evidence classes.** The matrix **MUST** classify evidence as runtime (`RT`), TypeScript
(`TY`), resource probe (`RP`), Protocol conformance (`PC`), Adapter conformance (`AC`), packed consumer (`PK`),
browser (`BR`), or instrumentation/fuzz/review (`IR`). Before release no requirement **MAY** remain planned,
missing, or skipped.

**RPC-EVIDENCE-003 — Normative runtime entry.** `packages/remote/tests/specification.test.ts` **MUST** be the
top-level caller-facing normative suite. It **MAY** import split fixtures, but every test name **MUST** include
the corresponding requirement/case ID and observe only public caller, Protocol, or Adapter seams. It
**MUST NOT** assert private class layout, private scheduler turns, or incidental microtask count.

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
**MUST NOT** expose Default-Protocol private module or decoded-record types through its fixture contract.

**RPC-CONFORMANCE-002 — Protocol suite.** Protocol runner **MUST** cover construction non-reentrancy, handoff,
normalized snapshots, outgoing reserve/commit/sink, incoming resource/semantic/handler dispositions, handler
permit ownership, fault scope, counter drain, and shutdown/close/cleanup phases. The package-private default and
an independent minimal custom Protocol **MUST** both pass; the default **MUST** additionally pass its runtime
validation and security suites. `counterExhaustionProtocol` **MUST** be the same candidate under test-only
configuration such that the first otherwise admissible call on a fresh Session reaches counter drain.
`createActiveProtocolFaultMessage()` **MUST** return one candidate-grammar byte message that faults an active
Session; neither hook changes the production SPI or exposes the built-in grammar.

**RPC-CONFORMANCE-003 — Adapter suite.** Both Adapter runners **MUST** cover subscribe-before-start, handoff and
ownership, source/message identity/order/hot terminal behavior, Local Admission/single send/backpressure,
1 MiB compatibility, abort/startup/close races, listener/Connection isolation, and Acceptor overflow. Every
Adapter package **MUST** additionally prove allocation-before-copy, framing/queue boundaries, flooding, and any
security claim with platform-near instrumentation/fuzz/review because a black-box seam cannot observe them.
Every Adapter runner case ID **MUST** begin with every applicable canonical `RPC-TRANSPORT-*` requirement ID,
followed by its stable descriptive role/case name. Structural runner case IDs **MUST NOT** claim
`RPC-TRANSPORT-012`; that security boundary requires separate deployment documentation and platform evidence.
Each fixture `create()` **MUST** return a fresh single-use Adapter. Its driver methods **MUST** deterministically
control only the remote/test side, preserve supplied Error identity, and let `cleanup()` release only
fixture-owned external resources; they **MUST NOT** close or settle candidate-owned resources on its behalf.

### 14.3 Default Protocol validation and abnormal-state matrix

**RPC-CORPUS-001 — Runtime validation coverage.** Node release tests **MUST** directly exercise the built-in
Protocol's raw byte parser, decoded-record Zod grammar, and CSPRNG bearer-token behavior. Browser release tests
**MUST** exercise the built-in round trip plus fresh token issuance and cross-Connection presentation. The
bounded raw parser
**MUST** independently cover strict UTF-8, BOM, duplicate keys, trailing data, number spelling, and allocation
boundaries because those facts do not survive ordinary object materialization. Decoded-record tests **MUST**
cover every Codec-accepted inbound phase entry and tagged branch, required and forbidden fields, scalar domains,
and open or closed tail policy. This evidence **MUST NOT** be published as a schema, vector, transcript, or corpus
artifact.

**RPC-CORPUS-002 — Recovery scenarios.** Release runtime tests **MUST** execute fresh, lost fresh accept, normal
resume, lost resume accept with higher attempt and the same token, replay barrier, lost ACK,
duplicate/gap/regressed seq, stale/equal/future ACK, cursor lower/upper bounds, wrong epoch/stale Connection,
wrong token/profile/session, generic/token-authorized reject, Ping/Pong, Close, and counter exhaustion. Each step
**MUST** assert both endpoint states, current binding, dispatch count, caller outcome, retained evidence, and next
permitted records.

**RPC-CORPUS-003 — State disagreement.** Release tests **MUST** inject at least: responder activated binding with
lost accept; initiator still connected after responder fenced old epoch; durable receipt with lower resume cursor;
simultaneous token-valid replacement while old Connection continues; higher/lower attempt races; Close vs
loss/force; late accept/reject after timeout/cutoff; and responder token-state loss while initiator recovers. Legal
disagreement **MUST** converge through higher attempt/replay; unprovable continuity **MUST** expose the specified
continuity/expiry/outcome-unknown boundary and **MUST NOT** redispatch a Logical Call.

**RPC-CORPUS-004 — Resource boundaries.** Every fixed/configurable limit **MUST** have `limit-1`, `limit`, and
`limit+1` evidence, including protected reserve, last counters, fairness under replay/control/data/Ping flood,
64-peer parallel shutdown, withheld ACK, stuck send/close, never-settling handler, and late bootstrap settlement.

### 14.4 Type, runtime, and package compatibility

**RPC-RELEASE-001 — Type fixtures.** Strict main, Node, and DOM/browser consumers **MUST** include positive
inference and negative `@ts-expect-error` cases for Descriptor, signal slot, facade, state discriminants,
role policy, and custom Protocol/Adapter shape. Node consumer **MUST NOT** require DOM-only Adapter types; browser
root import **MUST NOT** introduce `Buffer`, Node server, or `ws`.

**RPC-RELEASE-002 — Runtime targets.** Release **MUST** pass Node `>=23.6` and lockfile-pinned Playwright Chromium,
Firefox, and WebKit, including CSPRNG token issuance and Recovery cases, cross-realm AbortSignal/intrinsic listener
behavior, facade assimilation, Recovery, and termination. Deno, Bun, and Workers **MAY** run non-blocking smoke
checks only.

**RPC-RELEASE-003 — Packed consumers.** CI **MUST** install the actual `pnpm pack` tarball into isolated Node ESM,
Node CJS, declaration, DOM-only, and browser-bundle consumers and resolve every public code subpath. Source
imports inside the workspace **MUST NOT** count as package evidence. Private deep import **MUST** fail.

**RPC-RELEASE-004 — Release contents.** A stable release **MUST** include this specification, requirement matrix,
normative suite, architecture source and rendered diagram, caller and implementor documentation, CHANGELOG, and
a Changeset that moves `@husky-di/remote` from `0.0.0` to `1.0.0`. Build, code-standard, type, conformance,
Protocol validation/security, packed-consumer, and browser gates **MUST** pass without skips.

**RPC-RELEASE-005 — Independent Adapters.** A package claiming v1 Adapter compatibility **MUST** depend on a
compatible `@husky-di/remote` major, import only public root/transport/conformance paths, run the matching shared
runner and its own platform admission/framing/fuzz/security suite, and document finite native frame/queue limits
and secure deployment conditions. Core **MUST NOT** add Adapter-specific special cases.

## Appendix A. Requirement-to-evidence matrix

The exhaustive one-row-per-ID matrix is [REQUIREMENTS.md](REQUIREMENTS.md). `Status` records the current evidence
audit; publication requires every row to be `verified`. This summary groups the same rows only for navigation.

| Requirement families | Applies to | Minimum evidence | Repository evidence location | Status |
| --- | --- | --- | --- | --- |
| `RPC-BASE`, `RPC-API`, `RPC-STATE`, `RPC-LIFE` | Framework | RT, TY | `tests/specification.test.ts`, `tests/types/` | verified |
| `RPC-PKG`, `RPC-RELEASE` | Distribution | PK, BR, TY | `tests/package/`, `tests/browser/` | verified |
| `RPC-VALUE`, `RPC-DESC`, `RPC-CALL`, `RPC-EVENT` | Framework + all Protocols | RT, TY, PC | `tests/specification.test.ts`, `tests/conformance/` | verified |
| `RPC-START`, `RPC-TRANSPORT` | Framework + Adapters | AC, RT, IR | `tests/conformance/`, Adapter package tests | verified |
| `RPC-SPI` | Custom/default Protocol | PC, TY, RT | `tests/conformance/`, `tests/types/` | verified |
| `RPC-WIRE`, `RPC-ACK`, `RPC-LEDGER` | Default Protocol | RT, RP, BR | `tests/protocol.test.ts`, `tests/protocol/`, `tests/resources/` | verified |
| `RPC-SESSION`, `RPC-RECOVERY`, `RPC-SEC`, `RPC-VALID` | Default Protocol / secure deployment | RT, RP, BR | `tests/protocol.test.ts`, `tests/recovery/`, `tests/browser/` | verified |
| `RPC-RESOURCE`, `RPC-POLICY`, `RPC-SCHEDULE`, `RPC-TIME`, `RPC-COUNTER` | Framework + Protocol | RP, RT, PC | `tests/resources/`, `tests/specification.test.ts` | verified |
| `RPC-SHUTDOWN`, `RPC-CLOSE`, `RPC-CLEANUP` | Framework + Protocol + Adapter | RT, RP | `tests/specification.test.ts`, `tests/recovery/` | verified |
| `RPC-EVIDENCE`, `RPC-CONFORMANCE`, `RPC-CORPUS` | Distribution | matrix lint, PC, AC, RT, RP, BR | `tests/conformance/`, `tests/protocol/`, `tests/resources/`, `tests/browser/` | verified |

## Appendix B. Non-normative implementation boundary

This specification does not prescribe private classes, files, reducers, codecs, queues, or scheduler objects.
The Framework should remain a deep module around the public seams. In particular, the public Owner
`close(): Promise<void>`, Protocol runtime `close(): void`, and Physical Connection `close(): Promise<void>` are
three different operations and must not be implemented as aliases.

Concrete WebSocket factory names, native frame/queue defaults, HTTP-server borrowing, origin/TLS options, and
Node WebSocket dependency choice belong to the separate `@husky-di/remote-websocket` package specification.
That package remains subject to this Adapter seam and conformance contract but is not defined here.

The built-in validation implementation should preserve four ownership seams: bounded raw-byte parsing, decoded
record grammar, Application Value normalization, and retained state/security/resource decisions. The
package-private Record Grammar is the sole executable owner of decoded record shapes. The Codec selects its
`bootstrapRequest`, `freshAccept`, `resumeOutcome`, or `active` phase entry; the active entry owns the tagged
`SemanticMessage` union; downstream modules consume schema-derived records instead of recomposing the grammar.
Readonly or semantic wrappers may refine those private outputs without copying their fields.

Runtime schemas should live beside the module that owns their invariant. A focused package-private primitive
may be shared only when multiple owners enforce the same domain rule; unrelated schemas should not accumulate
in a catch-all catalog, and the implementation should not introduce a Validator interface, class, adapter, or
registry. The Codec should replace Zod diagnostics with its stable seam-level error or fault. Its encoder accepts
only internally constructed records and performs serialization plus complete-message-size enforcement without
rerunning the full inbound validation pipeline.

## Appendix C. Non-normative decision lineage and research rationale

This appendix consolidates the durable context that preceded this specification. Sections 1–14 are the sole
normative authority; the identifiers below are provenance keys, not live issue-tracker entries. Prototype shapes,
implementation routes, status fields, discussion logs, and alternatives superseded by the current specification
have no independent authority. The `Design lineage` column in [REQUIREMENTS.md](REQUIREMENTS.md) uses these keys.

### C.1 Decision lineage

| Lineage | Consolidated subject | Normative home |
| --- | --- | --- |
| 01, 04, 19 | Caller surface, Descriptor identity and mapping, final role-specific API | Sections 5–6 and 13 |
| 02 | Default Protocol candidate evaluation | Sections 2 and 9; rationale in C.2 |
| 03 | Honest resumable-delivery guarantees | `RPC-BASE`, `RPC-ACK`, `RPC-LEDGER`, and Section 10 |
| 05, 17 | Deep public Protocol seam and exact implementor SPI | Sections 8 and 14.2 |
| 06 | Built-in JSON profile, grammar, sequencing, ACK, and evolution | Section 9 and 14.3 |
| 07 | Physical Connection and role-specific Adapter contract | Sections 6.5, 7, and 14.2 |
| 08 | Owner lifecycle, state, observation, and resource ownership | Section 6 and Section 13 |
| 09 | Session incarnation, binding, fencing, and Recovery | Sections 6.2, 10, and 11 |
| 10, 11 | Application values, Logical Call ledger, cancellation, errors, and terminal races | Sections 4, 6.3–6.4, and 9.3–9.4 |
| 13 | Ordering, fairness, concurrency, retained budgets, and deadlines | Sections 4, 10, 12, and 13 |
| 14 | Trust-boundary validation and Recovery security | Sections 11 and 14.3 |
| 15 | Package surface, verification, conformance, and release contract | Sections 3 and 14 and Appendix A |
| 16 | Completion audit and handoff into this specification | This appendix; no independent requirement |
| 18 | Graceful shutdown, forced close, and bounded cleanup convergence | `RPC-WIRE-015` and Section 13 |
| Zod validation | Private executable grammar and removal of published wire data assets | `RPC-PKG-004`–`006`, `RPC-CORPUS-001`, and Appendix B |

Early caller prototypes informed the final API but did not remain authoritative. In particular, the final
surface has six-state peers, separate `shutdown()` and `close()` semantics, payload-free observations, and no
Framework-owned aggregate Acceptor facade. The final Protocol SPI likewise exposes one role-specific deep seam;
its Codec, Handshake, ACK, credential, ledger, and scheduler decomposition remains private.

### C.2 Why the built-in Protocol is purpose-built

No evaluated open protocol directly combined bidirectional unary calls, cooperative cancellation, Logical
Session replacement, call-level duplicate suppression, terminal replay, and the small message-oriented Adapter
seam required here. The closest alternatives each supplied useful precedent but required a new Husky call-state
profile or a substantially larger stack:

| Candidate | Reused insight | Decisive gap for this profile |
| --- | --- | --- |
| [RSocket 1.0](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md) | Bidirectional request-response, resume gates, directional positions, replay, cancellation | Frame continuity does not prove request admission, handler dispatch, or terminal-ledger continuity |
| [AMQP 1.0 and Link Pairing](https://docs.oasis-open.org/amqp/linkpair/v1.0/linkpair-v1.0.html) | Recoverable deliveries, unsettled state, paired request/response links | Request and response remain separate deliveries; the full Connection/Session/Link stack still needs a Husky call ledger |
| [JSON-RPC 2.0](https://www.jsonrpc.org/specification), [LSP 3.17](https://github.com/microsoft/language-server-protocol/tree/8b9fab8f0912b694c795d05c1d5e9d357bee0193), and [DAP](https://github.com/microsoft/debug-adapter-protocol/tree/bf8a5d27e8040044b84b863f90916e08925ee811) | Discriminated call grammar, structured errors, initialization phases, unknown-input policy, cooperative cancel | No retained Session, delivery ACK, replay, duplicate suppression, or terminal retention |
| gRPC, WAMP, Ice, Cap'n Proto, Avro, and Thrift | Mature local RPC, IDL, status, retry, callback, or capability mechanisms | None defines this profile's symmetric in-memory Session incarnation and recoverable in-flight call ledger |

The resulting `husky-di-rpc/1` profile therefore fixes one strict UTF-8 JSON representation rather than exposing
a Codec matrix. The research also evaluated CBOR/CDDL and machine-readable public grammars; v1 instead keeps the
executable Zod grammar private because there is no cross-language interoperability commitment. Framing remains
an Adapter concern, sequence remains distinct from Call Identity, and unknown fields are distinct from unknown
required message kinds.

The layered wire design draws on the fixed
[VS Code revision `b6d86f7d`](https://github.com/microsoft/vscode/tree/b6d86f7dea54686892c2efb61118492e199d4e8c):
`PersistentProtocol` demonstrates cumulative receipt, replay, activity probes, and socket replacement; the
Remote Agent handshake demonstrates a commit gate before retained-state reuse; Extension Host RPC demonstrates
bidirectional request/cancel/result/error behavior and the need to reserve `then`. Husky keeps those layers
separate and adds bounded resource admission, call-level durable disposition, stable fault scopes, and honest
evidence-loss outcomes.

### C.3 Delivery guarantee rationale

Classic RPC already establishes that communication failure can leave a caller unable to distinguish zero from
one executions; see Birrell and Nelson,
[*Implementing Remote Procedure Calls*](https://birrell.org/andrew/papers/ImplementingRPC.pdf). NFSv4.1 shows that
stronger exactly-once-style replay requires Session-scoped identity, bounded reply slots, retained results, and
atomic execution/cache placement; see [RFC 8881 §2.10.6](https://www.rfc-editor.org/rfc/rfc8881.html#section-2.10.6).
RSocket resume positions and TCP ACKs prove lower-layer receipt facts, not application admission or side-effect
commit; see [RSocket Resuming Operation](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#resuming-operation)
and [RFC 9293 §3.4](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.4).

Those distinctions lead directly to `RPC-BASE-001`: the Framework continues one Logical Call only while the
same retained Session Incarnation, ledger, replay range, and binding authority remain provable. A durable
receipt can release replay data only when the retained high-watermarks still reject identity reuse. If evidence
may have been lost after admission, `outcome-unknown` is the honest boundary; a timeout, cancellation, lost
response, or closed socket cannot be reclassified as Definite Non-Execution. Application-level exactly-once
effects require a separate durable transaction or idempotency contract.

### C.4 Security and validation rationale

The protected Transport is the fresh trust root.
[TLS 1.3](https://www.rfc-editor.org/info/rfc8446.html) provides the relevant confidentiality,
integrity/anti-replay, and responder-authentication model, while Adapter deployment owns certificate or PSK
policy. [RFC 4648](https://www.rfc-editor.org/info/rfc4648.html) motivates one canonical unpadded base64url
spelling for the 32-byte Session ID and bearer token. Browser and Node implementations use their shared
[Web Crypto API](https://www.w3.org/TR/WebCryptoAPI/) CSPRNG surface.

Earlier design notes explored an HMAC/HKDF/JCS transcript proof. That construction is superseded: Sections 9.2,
10, and 11 define the current stable `resumeToken` bearer model, exact protected-Connection authority, generic
reject policy, and credential lifetime. The superseded proof fields, signed rejects, JCS preservation rules, and
published security vectors are not part of `husky-di-rpc/1`.

Zod begins only after bounded raw parsing has preserved the lexical facts ordinary object materialization would
lose, including duplicate names, malformed UTF-8, trailing data, number spelling, and allocation boundaries.
Application Value normalization separately inspects untrusted caller objects without invoking getters or
coercion. Session phase, token authority, sequence/ACK continuity, retained evidence, and capacity remain
stateful decisions. This separation is why private Zod schemas can be the single executable decoded-shape
grammar without becoming a general validation framework or a published wire artifact.
