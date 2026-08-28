# Husky DI Context

This document records the domain language, design boundaries, and repository conventions for `husky-di`. Engineering skills should read this document before doing diagnosis, TDD, architecture analysis, or issue breakdown.

This repository currently uses a single-context domain documentation layout: the repository-level domain context is maintained centrally in the root `CONTEXT.md`. To build a quick understanding of the project semantics and boundaries, read this document first instead of assuming an older distributed documentation layout still exists.

## Project positioning

`husky-di` is a modern TypeScript dependency injection framework. Its core goal is to provide a type-safe, deterministic, testable, and introspectable dependency management system.

This project uses a monorepo structure. The main workspaces that currently exist and are actively maintained are:

- `@husky-di/core`: The core DI container, registration, resolution, lifecycle, middleware, reference, and disposal capabilities.
- `@husky-di/decorator`: Constructor injection support built on TypeScript experimental decorators and `reflect-metadata`.
- `@husky-di/module`: A modular DI system inspired by ESM `import` / `export` semantics.
- `@husky-di/website`: A documentation workspace located at the top-level `website/` directory.

## Core design principles

- Dependencies are provided externally rather than created by business objects themselves. This is the repository's basic interpretation of DI and IoC.
- Constructor injection is the primary model. Property injection and method injection are not part of the core model; when needed, use factories or explicit `resolve` composition.
- Runtime behavior must be predictable. Registration, resolution, lifecycle, module import/export behavior, and error conditions should all have explicit rules.
- Type safety comes first. Public APIs should let TypeScript infer accurate resolution results, including combinations of `optional`, `multiple`, `ref`, and `dynamic`.
- Container behavior should be introspectable. Resolution chains, circular dependencies, service identifier names, and error messages should all help users locate problems.
- Keep clear boundaries between packages. `decorator` and `module` depend on `core`, but `core` does not depend on packages built on top of it.

## Domain vocabulary

### DI and containers

- **Dependency Injection / DI**: Objects receive dependencies from the outside instead of creating them on their own.
- **IoC**: Inversion of Control. DI is the IoC mechanism adopted by this project.
- **Container**: A dependency injection container. It registers services, resolves services, manages lifecycles, participates in its loaded core module instance's middleware pipeline, and disposes resources.
- **Root Container**: The root container exposed through the `rootContainer` constant. `createContainer()` attaches to it when `parent` is not passed explicitly; the `resolve` helper uses the current resolution context or the root container to perform resolution.
- **Parent Container / Child Container**: The parent-child container relationship. Resolution checks the current container first and then falls back to the parent; registrations in a child do not affect the parent.

### Registration and resolution

- **ServiceIdentifier**: A service identifier. It can be a class constructor, abstract constructor, string, or symbol. Prefer `createServiceIdentifier<T>()` to create typed identifiers.
- **Registration**: A binding between a service identifier and a provider strategy.
- **Registration Plan**: A reusable collection of registration entries. It is assembled with `createRegistrationPlan()` and applied to a container with `container.applyRegistrationPlan()`.
- **Provider**: A service creation strategy. The current model supports `useClass`, `useFactory`, `useValue`, and `useAlias`, and requires exactly one strategy per registration.
- **Resolution**: The process of obtaining a service instance from the container using a `ServiceIdentifier`.
- **ResolveOptions**: Resolution options including `optional`, `defaultValue`, `multiple`, `recursive`, `ref`, and `dynamic`.
- **ResolveContext**: The shared context for a single resolution chain, used for the resolution lifecycle and internal resolution state.
- **ResolveRecord**: A tree structure that records the resolution path for error reporting and circular dependency detection.
- **ResolveException**: The core exception type for resolution failures, circular dependencies, invalid options, and similar scenarios.

### Lifecycle

- **LifecycleEnum.transient**: The default lifecycle. Each resolution creates a new instance.
- **LifecycleEnum.singleton**: A container-scoped singleton. The first resolution creates the instance, and later resolutions in the same container reuse it.
- **LifecycleEnum.resolution**: A resolution-chain-scoped singleton. It is reused within the same resolution chain, but not across different chains.
- **Disposable / dispose**: Releasing a container or resource. A disposed container should reject subsequent operations; repeated `dispose()` calls should remain idempotent; disposing a parent container does not automatically dispose child containers.

### References

- **Ref**: A reference wrapper that exposes an instance through `.current`.
- **Static Ref / `ref: true`**: Defers resolution and caches the referenced result. It is useful for breaking some circular dependencies or delaying instantiation.
- **Dynamic Ref / `dynamic: true`**: Re-resolves on every `.current` access. It holds resolution records and context closures, which can lead to memory leaks; do not prefer it unless it is genuinely necessary.

### Middleware

- **Middleware**: A function object registered through the current core module instance's `middleware` export. It can inspect arguments, transform results, perform side effects, or short-circuit resolution by not calling `next()`.
- **Middleware Cleanup**: `middleware.use()` returns the sole idempotent cleanup for the middleware added by that call.
- **Middleware Order**: Middleware runs in LIFO order before the provider executes.
- **onContainerDispose**: An optional disposal hook on middleware. It is called when a container is disposed; exceptions should be swallowed and must not interrupt disposal.

### Decorator package

- **Injectable Class**: A class marked with `@injectable()` that can be instantiated by the decorator middleware.
- **Injection Metadata**: Constructor-parameter injection metadata including `serviceIdentifier`, `container`, `dynamic`, `ref`, and `optional`.
- **`@injectable()`**: A class decorator that merges constructor parameter metadata and marks the class as injectable.
- **`@inject()`**: A parameter decorator that declares the service identifier and resolution options for a constructor parameter.
- **`@tagged()`**: The lower-level parameter metadata decorator. `@inject()` can be treated as its convenience wrapper.
- **`decoratorMiddleware`**: Middleware that reads injection metadata and participates in constructor injection. Register it through `middleware` when using decorator-based injection.
- **Reflection Metadata**: TypeScript compile-time parameter type information read through the Reflect API. This package depends on `reflect-metadata` or a compatible implementation.

The decorator package supports only TypeScript experimental decorators, not ES decorators. The reason is that the current ES decorators specification does not include parameter decorators, so it cannot express the constructor parameter injection model required by this project.

### Module package

- **Module**: A logical unit that encapsulates declarations, imports, and exports.
- **Declaration**: A service declared locally within a module, equivalent to variables or classes defined inside an ESM module.
- **Import**: A service imported from another module.
- **Export**: A service exposed from the current module, either from a local declaration or by forwarding an import.
- **Alias**: Renaming a service identifier on import, similar to `import { foo as bar }`.
- **Import Scope**: The visible set of services a module receives from its imports. `alias` only renames mapped imports; imported exports that are not aliased still enter the import scope under their original service identifiers.
- **Export Guard**: A module's public container facade rejects direct resolution of non-exported declarations before entering the global middleware pipeline.

The module system is inspired by ESM semantics: imports must be explicit, export boundaries must be explicit, and naming conflicts should surface when a module is created instead of turning into ambiguity at runtime.

### Remote RPC

- **Application Value**: The caller-visible value domain shared by every conforming v1 RPC Protocol: `null`, boolean, string, finite binary64 number, dense array, or plain data record, within the common v1 depth, string, member, element, node, and deterministic weight limits. A custom Protocol may change its wire encoding but does not expand or narrow this domain.
- **Normalized Application Value**: A detached, immutable snapshot of an Application Value whose structural meaning ignores JSON spelling and record member order while preserving string, number, array-order, and recursive value distinctions.
- **RPC Protocol**: The replaceable RPC semantics module used by a Topology Owner to carry Logical Sessions and calls over Physical Connections. Every conforming Protocol preserves the same public v1 guarantees while choosing its own wire contract and internal organization.
- **Default RPC Protocol**: The single built-in RPC Protocol selected when no custom Protocol is injected into a Topology Owner.
- **RPC Protocol Profile**: An atomic, exact-match contract that fixes an RPC Protocol's wire grammar, Codec, and mandatory semantic guarantees for one Logical Session. It is selected when the session is created and remains fixed through Session Recovery.
- **Message Receipt ACK**: A cumulative per-direction confirmation that sequenced Protocol messages through a given point have been validated and given a durable retained disposition. Cursor zero means no sequenced message has yet been admitted. An ACK does not by itself mean a handler was eligible, finished, or that call deduplication evidence can be discarded.
- **Activity Probe**: A bounded, connection-local request/response used to confirm an idle current binding. The Default Protocol uses unsequenced Ping/Pong; custom Protocols provide equivalent semantics. It is not replayed or publicly observed, a response never triggers another response, and only fully validated current-binding records count as activity.
- **Remote Request Admission**: The linearization point at which a validated call request becomes retained Logical Session state and handler dispatch becomes possible.
- **Remote Resource Rejection**: The alternate retained disposition for a valid expected call when ordinary handler-work capacity is unavailable. It advances receipt and call-ordinal evidence, commits a protected `unavailable` terminal, and guarantees that the handler is never dispatched; it is not Remote Request Admission.
- **Definite Non-Execution**: An evidence-backed conclusion that a call did not reach Remote Request Admission. It allows a new call without risking duplicate remote execution.
- **Outcome Unknown**: A terminal caller-visible condition in which Remote Request Admission or application effects may have occurred, but the retained evidence needed to recover one authoritative terminal outcome no longer exists. The RPC framework does not automatically retry it as a new call.
- **Pending Invocation**: A validated, locally queued proxy invocation that has not yet been handed to a Transport Adapter as a Protocol call message. Cancellation can remove it locally with Definite Non-Execution; it has no Call Identity and is not yet a Logical Call.
- **Outgoing Call Admission**: The atomic transition that assigns a Pending Invocation its Call Identity and message sequence, commits its immutable `(sequence, semantic message)` replay pair, and invokes the current Physical Connection's `send()` with a preflighted envelope. A replay keeps that pair while an attempt envelope may carry a newer reverse-direction ACK. After this point, local cancellation is cooperative because the framework can no longer prove that the request did not reach its peer.
- **Logical Call**: One bidirectional unary invocation whose pending state can continue across Physical Connection replacement while its Logical Session remains retained.
- **Call Cancellation**: A request to stop waiting for a Logical Call and cooperatively abort its remote handler. It selects a caller-visible terminal outcome but does not prove that the handler was never dispatched or that application effects were rolled back.
- **Call Identity**: The identity of a Logical Call within one Session Incarnation and originating direction. Its opaque `callId` is created by the Protocol, never reused during that incarnation, and is distinct from an application idempotency key.
- **Call Ordinal**: The default RPC Protocol's direction-local, contiguous Logical Call sequence, carried as an opaque `callId` string. It is independent of the per-message delivery sequence and lets retained Session state prove that a Call Identity was not reused.
- **Request Replay**: Retransmission of the original sequenced call message with the same `seq`, `callId`, and semantic content after receipt is uncertain. It continues the existing Logical Call rather than creating a new one.
- **Application Idempotency**: An application-owned guarantee that repeating a business operation does not repeat its external effect. The RPC framework does not create or interpret its keys and does not equate it with Session-scoped at-most-once handler dispatch.
- **RPC Peer / `RpcPeer`**: The remote counterpart participating in a bidirectional RPC relationship. It is the subject of exposure and remote resolution, distinct from the topology owner and the transport connection.
- **RPC Topology Owner**: The owner of an active or passive connection topology and its lifecycle. `RpcConnector` owns an active one-to-one topology; `RpcAcceptor` owns a passive one-to-many topology. Applications compose multi-peer work explicitly from Acceptor membership snapshots and each peer's single-peer facade.
- **Logical Session**: The stable RPC relationship represented by an `RpcPeer`. It can span a sequence of transient Physical Connections while preserving the peer seen by callers.
- **Session Incarnation**: One retained lifetime of a Logical Session, identified for routing by a responder-created opaque `sessionId`. The identifier is never recovery authority by itself. The incarnation ends when its retained state is terminated or lost; a process restart without that state cannot continue it.
- **Protected Transport**: The deployment property required for secure Default-Protocol Recovery: the fresh and replacement Physical Connections provide confidentiality, ordered integrity, anti-replay, and initiator-verified responder endpoint identity. The structural Adapter seam cannot prove this property at runtime.
- **Resume Token**: A private stable bearer secret issued for one Session Incarnation inside a Protected Transport. It grants Recovery authority only for that retained Session and does not represent a business-user identity.
- **Resume Attempt**: The initiator-owned, strictly increasing and never-reused safe integer included in each token-authorized resume request. It can have gaps and lets a higher attempt recover after a lost accept without reusing an older attempt.
- **Binding Epoch**: A responder-assigned, monotonically increasing generation that identifies the one current Physical Connection binding of a Session Incarnation. It is a fencing generation, not a time-based lease.
- **Connection Fencing**: The Session rule that prevents a replaced Physical Connection and its late effects from changing retained Session or call state after a newer Binding Epoch is installed.
- **Physical Connection**: A finite-lived, full-duplex transport channel carrying a Logical Session. It may be replaced without replacing the session's `RpcPeer`.
- **Physical Connection Binding**: The exclusive association that makes one Physical Connection the current carrier of a Logical Session under an exact Binding Epoch. Replacing it advances the epoch and fences the former association. Avoid “Binding Attempt” when referring to the installed association; an attempt is only its unsettled implementation lifecycle.
- **Binding Linearization**: The atomic selection of a Physical Connection Binding as current, advancing the Binding Epoch and fencing the former binding. It establishes current authority even when Binding Activation happens later.
- **Binding Activation**: The later transition that permits a linearized current binding to carry active RPC records and resume Session work. Only the exact current binding can activate.
- **Transport Adapter**: A concrete Adapter at the public Transport seam that turns a platform-specific message or byte-stream transport into ordered Physical Connections and complete byte messages. A Connector Adapter represents one connection attempt; an Acceptor Adapter represents one listener.
- **Connector Adapter Factory**: An application-supplied provider of a fresh, cold, single-use Connector Adapter for each initial or replacement Physical Connection attempt.
- **Local Admission**: Successful completion of `IRpcConnection.send()`, meaning the Adapter no longer borrows the caller's bytes and they have entered a bounded local Transport path. It does not mean the bytes were flushed to the network, received or decoded remotely, or acknowledged by the RPC Protocol; a later direct close does not guarantee whether already-admitted bytes are transmitted or discarded.
- **Transport Admission Limits**: Finite per-message and queued message/byte limits enforced at the earliest controllable Transport Adapter boundary, before untrusted input is copied, allocated from an asserted frame length, or emitted to the RPC Protocol. They bound Transport resource use; validation of decoded Protocol records is a separate layer.
- **Protocol/Adapter Message Compatibility**: Every conforming v1 Protocol uses at most one `1 MiB` Transport message per `send()`, and every conforming Adapter can admit a message of that size when its local path is otherwise empty. Adapter-specific queue budgets remain finite typed factory configuration rather than a public Connection capacity surface.
- **Direct Connection Close**: Immediately beginning local termination of a Physical Connection, rejecting new and not-yet-admitted sends without performing an RPC-level drain or acknowledgment. Platform mechanics may still transmit already-admitted bytes before the local Transport finishes closing.
- **Graceful RPC Shutdown**: The `shutdown()` Topology Owner path: atomically stop new application/bootstrap admission, continue the finite pre-cutoff Pending, call, handler, replay and ACK work belonging to connected Sessions and any already counter-draining Session that still has a current binding, then send at most one unsequenced/no-reply Session-close per drained binding. Recovering Sessions are forced immediately. Its absolute grace interval escalates to Forced RPC Close; it is not a Physical Connection capability.
- **Forced RPC Close**: The `close()` Topology Owner path, or the fallback reached when graceful shutdown expires or loses a binding. It immediately applies Session-terminal call outcomes, aborts cancelable handlers, drops unsent Protocol intent and Direct Closes Connections without sending Session-close.
- **Shutdown Drain Cutoff**: The no-await linearization point of the first `shutdown()` that changes the Owner and its currently connected Peers to draining, rejects later local work, and freezes the finite set of their earlier Pending/Logical Calls and admitted handler work allowed to finish. Peers already recovering at that point take the forced path instead.
- **Session-close**: The Default Protocol's top-level active `{ kind: "close" }` record, sent only after one Session has gracefully drained. It is connection-local, unsequenced, unacknowledged, not replayed and carries no reason or identity; receipt on the exact protected current binding is authoritative Session termination.
- **Session Recovery**: Reattaching a Logical Session to a replacement Physical Connection while preserving its peer identity and retained call state. It ends when the retained session can no longer be resumed.
- **RPC Connector Reconnection / `RpcConnectorReconnection`**: An opt-in, single-use supervisor outside an `RpcConnector` that owns its initial Physical Connection attempt and schedules replacement attempts during Session Recovery. Its orchestration state is distinct from the supervised Peer state, and it exposes the exact supervised Connector through a read-only property; avoid “Connector-Managed Reconnection” and the ambiguous term “automatic recovery.”
- **Connector Reconnection Policy**: The immutable supervisor rules that bound and schedule RPC Connector Reconnection. It is distinct from the Protocol-facing RPC Runtime Policy.
- **Recovery Retention**: The configured maximum interval (five minutes by default) for which a lost or fenced Session binding retains calls, replay, and identity evidence; failed resume attempts do not extend it. When an Acceptor reaches `maxSessions`, fresh admission may end the eligible responder-side retention with the earliest active absolute deadline, with equal deadlines resolved in retained order; connected or replacement-bound Sessions remain protected and the initiator receives no remote termination authority.
- **RPC Runtime Policy**: The immutable, owner-construction snapshot of finite Session/owner byte and concurrency budgets plus ACK, activity, send-progress, binding-attempt, Recovery, and shutdown deadlines. It has finite validated defaults, no runtime setters or per-peer overrides, and is supplied to every conforming Protocol runtime.
- **Retained-Byte Ledgers**: The two-level atomic accounting boundary formed by each Session's aggregate child ledger and its Topology Owner ledger. Protected Session reserves, Session-attributable Endpoint ingress, Pending/replay entries, and incoming handler payloads acquire the applicable ledgers together; a frozen idempotent reservation owns each charge until its ACK, call terminal, cancellation, failed admission, Endpoint close, or Session terminal winner releases it.
- **Payload-Free RPC Telemetry**: The common owner event surface contains peer/correlation identity, direction, service/method metadata, phase, safe outcome code, and bounded timing/counts, but never application payloads, raw errors, wire/session/call identities, proofs, nonces, or secrets. Payload diagnostics remain application-owned instrumentation at caller/handler boundaries.
- **Remote Service Descriptor**: An opaque description of a remotely callable service that relates one local `ServiceIdentifier` to an explicit Wire Service Name and a non-empty unary method allowlist. The property name `then` is reserved so a remote service facade cannot become a JavaScript thenable.
- **Wire Service Name**: The explicit stable identity by which RPC Peers refer to a remote service. It is independent of local `ServiceIdentifier` equality and metadata.
## Behavioral constraints

- The same `ServiceIdentifier` can be registered multiple times in the same container.
- By default, resolving a single service uses last-write-wins and returns the most recent registration.
- Using `multiple: true` returns all registrations for that identifier.
- A registration plan composes multiple `register()` calls; on success it returns a combined cleanup, and that cleanup can remove only the registrations created by that plan.
- If applying a registration plan fails midway, already-created registrations must be rolled back so the container does not keep partial state.
- When `optional: true` is set and the service is not found, resolution returns `undefined` or `defaultValue`; when the service is not optional, it throws `ResolveException`.
- `ref` and `dynamic` are mutually exclusive and cannot both be `true`.
- Circular dependencies are detected through `ResolveRecord`. Error messages should include a readable resolution path and suggest `ref` or `dynamic` when appropriate.
- Service lookup follows current-container-first order and falls back to the parent container hierarchy unless `recursive: false` disables that fallback for the current resolution.
- Resolution middleware applies across parent-child relationships for containers created by the same loaded core module instance and runs on every resolution.
- Module declarations, imports, and exports must each be unique.
- The module import graph must not contain circular dependencies.
- When multiple imported modules export the same service name, the conflict must be resolved with aliases.
- A service identifier in the import scope must not conflict with a local declaration; if an imported service conflicts with a local declaration, the imported service must be renamed with an alias.
- A module can export only a local declaration, an explicitly imported export, or a service made available through an alias.

## Package boundaries

- `packages/core` is the foundational package. When adding new core capabilities, first decide whether they belong to the container, registration, resolution, lifecycle, middleware, reference, or disposal model.
- `packages/decorator` is only responsible for translating TypeScript decorator metadata into core resolution behavior. Do not move general container capabilities into the decorator package.
- `packages/module` is only responsible for module semantics, declaration/import/export validation, aliases, export guards, and module container assembly. Do not let the module package bypass the core registration and resolution model.
- `website/` is the documentation workspace, not a runtime library package published to npm. It is the right place for documentation browsing experience, information architecture, and reader-facing page organization.
- `docs/` currently holds ADRs rather than the source code of a standalone website package. Do not treat it as the implementation of a running documentation site; if you need to add architectural decisions or long-lived design constraints, prefer `docs/adr/`.

## Naming conventions

- Service identifier variables usually use interface-style names such as `IServiceA` and `IDatabaseConfig`.
- Structural interfaces live under `interfaces/` and use an `I` prefix, such as `IContainer` and `IModule`.
- Type aliases live under `types/` and do not use the `I` prefix.
- Enums use `PascalCaseEnum`, such as `LifecycleEnum` and `RegistrationTypeEnum`.
- Factory functions use `createXxx`, such as `createContainer`, `createModule`, and `createServiceIdentifier`.
- Public APIs are exported through each package's `src/index.ts`.

## Terminology guidance

- Prefer "service identifier" for `ServiceIdentifier`; avoid mixing in "token", "key", or "name" unless you are explaining an external concept.
- Prefer "resolve" when describing `resolve` behavior; do not replace the core term with wording like "get a dependency".
- Prefer "register" when describing `register` behavior; do not use "bind" as the primary term.
- Prefer "module declaration / import / export / alias" when describing module package semantics to keep the ESM analogy consistent.
- Keep `ref` and `dynamic` distinct: `ref` is a deferred reference, while `dynamic` re-resolves on every access.

## Current documentation status

- The root `CONTEXT.md` is the repository-level domain context entry point for the current single-context layout.
- `docs/agents/domain.md` is a stable pointer to `CONTEXT.md` for agent compatibility and quick discovery of the single-context layout.
- `packages/core/docs/SPECIFICATION.md` is the primary source for the core behavioral contract, with status `Stable`.
- `packages/decorator/docs/SPECIFICATION.md` is the primary source for the decorator behavioral contract, with status `Final`.
- `packages/module/docs/SPECIFICATION.md` is the primary source for the module behavioral contract, with status `Proposal`.
- `docs/adr/0001-registration-plan.md` already exists with status `Accepted`; when working on `RegistrationPlan` design motivation, naming, or rollback semantics, consult both that ADR and the core specification.
