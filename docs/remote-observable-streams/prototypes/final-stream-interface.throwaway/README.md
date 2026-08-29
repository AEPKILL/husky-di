# Final stream Interface throwaway prototype

This directory is candidate evidence for Ticket 13. It is a compileable,
executable model of the **proposed** final caller/exposure contract. It is not a
production implementation, package export, normative specification, migration
shim, or claim that the current `@husky-di/remote` package has passed final
acceptance.

The prototype intentionally uses one small logical-stream state machine and
real RxJS `Observable`, `Subject`, `Subscriber`, `Subscription`, `merge`, and
`map`. It does not copy a state machine for every trace and does not implement
production framing, cryptography, scheduling, or transport.

## Proposed Interface summary

- A nonempty opaque Descriptor has one exact `members` namespace. A selected
  member is exactly `{ kind: "unary" }`, `{ kind: "unary", cancelable: true }`,
  `{ kind: "stream-method" }`, or `{ kind: "stream-property" }`. Descriptor
  assignment is invariant in both service `T` and exact selected `Members`.
- A stream method returns a direct `Observable<Item>`. A stream property is
  required, `readonly`, `$`-suffixed, and directly Observable. Observable,
  `AbortSignal`, `PromiseLike`, `AsyncIterable`, and `ReadableStream`
  capabilities do not cross stream args/items; Promise-wrapped, nested,
  interop-only, `any`, and `never` stream shapes are rejected.
- Unary result qualification checks both the raw return and its awaited value.
  An `Observable<Item> & PromiseLike<Item>` is therefore stream-only, while an
  ordinary `Promise<ApplicationValue>` remains a valid unary result.
- Application-owned `Subject<Item>` is a valid local source, but the remote
  facade narrows it to `Observable<Item>` and exposes no `next/error/complete`.
- One `IRpcPeer` owns `expose()` and `resolve()`. `resolve()` constructs a
  frozen null-prototype, exact selected-member facade. It has no callable
  `then`; destructured methods preserve the captured implementation receiver;
  method/property identities are stable within one facade; each stream-method
  call creates a fresh cold Remote Observable.
- `resolveAll`, Remote Service Group, and `RpcPeerResult` have no proposed
  replacement helper. Applications compose a frozen `peers` snapshot with
  `Array.prototype.map()` and explicit Promise/RxJS operators.
- `subscribe()` is the resource root. State check precedes argument inspection;
  each accepted subscription gets independent normalization, observation,
  Stream Identity, capacity, source acquisition/subscription, terminal, and
  release. Calls, reads, assimilation, and retained objects perform no stream
  work.
- Source delivery uses `W=1`, two-phase reserve/disposition/effect projection,
  exact retained evidence, a contiguous disposition frontier, replay
  suppression, and `finish(outcome, onReleased)`. Recovery keeps facade,
  Observable, Stream Identity, observation ids, source subscription, and
  terminal state continuous. Each Recovery continuation owns a generation
  token and rechecks it after every replay/application effect and before
  connected, `peer-recovered`, or Pending admission; G/F permanently
  invalidate the losing continuation. Until the identity-free Pending set is
  handed off, G classifies recovered publication as Recovery and immediately
  forces, so a public callback cannot strand a third state.
- State publications carry a generation gate that suppresses an older
  synchronous broadcast after reentrant authority supersedes it. G captures
  the shared Session generation and rechecks it after every state, event, and
  captured-stream application callback; F therefore prevents the older G from
  publishing another peer state. Lifecycle events retain the existing
  non-reentrant FIFO and carry the same continuation predicate, checked both
  before dispatch and before each subscriber effect; committed telemetry and
  terminal events remain permanently authoritative.
- Stream telemetry is payload-free and side-local: one qualifying
  `stream-started`/`stream-finished` pair per side, outgoing
  `deliveredItemCount`, incoming `admittedItemCount`, and only the optional
  incoming `sourceTeardownFailed: true` incident bit. Serialized FIFO preserves
  item effect -> finished -> peer-closed -> topology-closed -> `event$`
  completion.
- Graceful cutoff `G` rejects new roots and captured pre-Remote-Admission work.
  Connected-at-G Sessions drain existing admitted work; recovering-at-G
  Sessions permanently close the Recovery gate and force. Force `F` selects
  winners and fences the whole Session before any lifecycle, Observer, or
  teardown effect,
  projects `unavailable` for identity-free work, `outcome-unknown` for admitted
  Subscribers without authority, and `terminated` for unwon Sources. The first
  `shutdown()` or `close()` creates one cached termination task; all cross-mode
  calls return that exact object and F/graceful convergence settles it once.

## Proposed exact export fixtures

These arrays are fixture contracts for the later implementation. They are not
observations of current production.

Proposed root runtime exports, sorted:

```text
RpcAcceptorListenerStopReasonEnum
RpcCallStatusEnum
RpcCloseOutcomeEnum
RpcCloseReasonEnum
RpcConnectorReconnectionAttemptFailureStageEnum
RpcConnectorReconnectionEventTypeEnum
RpcConnectorReconnectionStopReasonEnum
RpcEventDirectionEnum
RpcEventTypeEnum
RpcException
RpcExceptionCodeEnum
RpcStateStatusEnum
RpcStreamStatusEnum
createRemoteServiceDescriptor
createRpcAcceptor
createRpcConnector
createRpcConnectorReconnection
createRpcProtocol
```

Proposed root type exports, sorted:

```text
CreateRpcConnectorReconnectionOptions
IRemoteServiceDescriptor
IRpcAcceptor
IRpcAcceptorAdapter
IRpcApplicationRecord
IRpcConnection
IRpcConnector
IRpcConnectorAdapter
IRpcConnectorReconnection
IRpcPeer
IRpcProtocol
IRpcProtocolRuntimePolicy
RpcAcceptorListenerState
RpcAcceptorOptions
RpcAcceptorRuntimePolicyOptions
RpcAcceptorState
RpcApplicationValue
RpcCallFailure
RpcConnectorAdapterFactory
RpcConnectorConnectOptions
RpcConnectorOptions
RpcConnectorReconnectionEvent
RpcConnectorReconnectionPolicyOptions
RpcConnectorReconnectionState
RpcConnectorRuntimePolicyOptions
RpcConnectorState
RpcEvent
RpcPeerState
RpcProtocolFaultReason
RpcSessionCloseReason
```

The proposed `/protocol` runtime inventory remains the six existing names in
`PROPOSED_PROTOCOL_RUNTIME_EXPORTS`; its added stream type inventory is exactly
`PROPOSED_PROTOCOL_STREAM_TYPE_ADDITIONS`. The proposed `/transport` runtime
inventory is empty, and `IRpcConnection` remains exactly `message$`, `send`, and
`close`—no stream capacity or pause seam.

## P01–P12 evidence matrix

| Gate | Candidate evidence | Result boundary |
| --- | --- | --- |
| P01 Descriptor/type | `MixedService` positive and exact negative probes in `final-stream-interface.type-probes.ts`; `probeDescriptorRuntime()` rejects outer/inner accessors, non-enumerable and symbol fields, extra fields, and `cancelable:false` without executing getters | Proposed prototype proven |
| P02 direct Observable only | `InvalidCapabilities` probes cover Observable args, stream `AbortSignal` positions, Promise/nested Observable, PromiseLike item, AsyncIterable/ReadableStream return/arg/item, interop-only, `any`, and `never` | Proposed prototype proven |
| P03 Subject narrowing | `applicationOwned$` accepts local `Subject<Message>` while three consumed negative probes reject remote `next/error/complete` | Proposed prototype proven |
| P04 facade/thenable | `probeFacadeAndColdness()` and `probeRuntimeSourceQualification()` cover exact facade shape, receiver/identity, assimilation at zero work, Application Value `then` data, cast Promise/thenable rejection, and a true `Observable & PromiseLike` source subscribed directly with `then` calls fixed at zero | Proposed prototype proven |
| P05 lazy/cold | `probeFacadeAndColdness()` and `probeAdmissionCancellation()` cover captured data source, deferred getter/method, per-subscribe normalization/identity/resources, recovering identity-free cancellation, and admitted teardown | Proposed prototype proven |
| P06 sync/reentrancy | `LogicalStream` uses a fixed two-slot synchronous deferred-effect runner; `probeSynchronousRxjsAndReentrancy()` uses three fresh parameterized same-source cases to prove independent overflow/completed/handler-failed winners, plus explicit unsubscribe-in-next, synchronous terminal/returned teardown, and teardown-close-then-throw. True Observer callback tails assert no terminal/finished/retirement effect and retained resources before return; post-stack assertions prove depth one, exact ordering, release, and explicit-unsubscribe-only cancel authority | Proposed prototype proven |
| P07 Recovery | `probeRecoveryContinuity()` covers method plus getter property, lost-ACK exact replay suppression, terminal during Recovery, one-shot source teardown, identity/observation/source continuity, terminal replay suppression, and altered-evidence fault trace. `probeRecoveryContinuationAuthority()` proves replay -> Observer next -> shutdown invalidates the old generation before a second replay, connected, `peer-recovered`, or Pending admission. `probeRecoveredPublicationPendingHandoff()` closes the recovered-publication/Pending handoff window | Proposed prototype proven |
| P08 telemetry | `probeTelemetryAndFifo()` plus Recovery/cancel/overflow probes cover pair cutoffs/counts, unknown-member adjacent safe pair, resource rejection without Source pair, payload safety, ordering, and started-callback close FIFO through `event$` completion. `SerializedEventBus` authority-gates only revocable lifecycle publications; committed telemetry/terminal events remain authoritative | Proposed prototype proven |
| P09 G/F/Close | `probeShutdownCutoffs()` covers post-G state-before-args, connected drain, recovering-G force with identity-free Pending plus admitted/captured/queued streams, permanent Recovery-gate closure, G-window and post-F callback fencing, Session-wide winner/fence ordering, teardown(A) -> B.next, next -> close depth/order, and terminal-before-close. `probeUniqueTerminationTask()` proves strict task identity and settlement for close -> close, close -> shutdown, and shutdown -> close. The B4 state$/event probes prove G settles during recovered publication instead of waiting on identity-free Pending; `probeNestedTerminationPublicationAuthority()` proves nested connected -> G -> draining -> F cannot publish a stale state after closed | Proposed prototype proven |
| P10 custom Protocol | Exact SPI types plus `probeProtocolProjectionAndRelease()` cover two-phase projection, sync finish-before-return, one-shot `finish(outcome,onReleased)`, and negative request/Transport/recovery/credit/seq/ACK keys | Proposed prototype proven |
| P11 exports/consumers | Exact proposed arrays and consumed old-name probes; NodeNext compiles only relative source fixtures, esbuild runs only bundled local runtime fixtures, and the DOM bundle runs in three browsers | **No installed-package export map, emitted-declaration, package-resolution, or production acceptance claim** |
| P12 composition | `probePeerComposition()` uses a frozen `peers` snapshot, `map`, RxJS `merge/map`, explicit `{ peer, value }` association, and independent children; child A teardown synchronously emits through child B while repeated outer unsubscribe proves no outer post-unsubscribe value, duplicate cancel/terminal, or resurrection | Proposed prototype proven; no Group atomicity promised |

## R1–R4 revised-candidate evidence

| Revision | Implementation seam | Executable/type evidence |
| --- | --- | --- |
| R1 callback/close | `FrameworkIncomingStream.finish()` and its teardown/onReleased latch; `PrototypeSession.forceClose()`; `LogicalStream.selectSourceTerminal()`, `stageSubscriberTerminal()`, `deferEffect()`, `flushDeferredEffects()`, and convergence release | `probeSynchronousRxjsAndReentrancy()` and the next-close block in `probeShutdownCutoffs()` assert terminal evidence before teardown, teardown before onReleased/Source retirement/finished, callback depth one, explicit-unsubscribe-only cancel authority, teardown-close-throw incident safety, zero resources, and finished -> peer-closed -> topology-closed -> completion |
| R2 recovering G | `PrototypeSession.shutdown()` snapshots connected vs recovering, permanently closes its Recovery gate, asymmetrically fences deferred Remote Admission/Source Job callbacks and generation-scoped bootstrap/send settlements, and moves F Source winner selection into `LogicalStream.prepareForce()` | `probeShutdownCutoffs()` includes one connected drain and one recovering Session containing active, captured, queued, and identity-free Pending roots; owner-draining/owner-closing and post-F attacks cannot bootstrap, settle send progress, recover, admit, subscribe, replay, rearm, emit `peer-recovered`, or alter a winner |
| R3 raw/awaited types | `IsUnsupportedUnaryResult` is applied to both raw `ReturnType` and `Awaited<ReturnType>` | `UnaryAndHybridService` proves ordinary Promise unary plus hybrid stream; its hybrid-as-unary directive is the real 55th negative. The file contains exactly 55 actual expected-error directives and strict compile consumes all 55. `probeRuntimeSourceQualification()` subscribes the same hybrid shape once with `then === 0` calls |
| R4 peers composition | No Group helper or shared child state was added | `probePeerComposition()` records child A teardown -> child B emission -> child B teardown, then proves the closed outer observer sees no new value/terminal, both independent children cancel and teardown exactly once, and late source callbacks cannot revive either stream |

## B1–B3 second-revised-candidate evidence

| Block | Minimal state-machine change | Executable evidence |
| --- | --- | --- |
| B1 Recovery continuation authority | `PrototypeSession.recover()` captures a per-continuation generation; `enterRecovery()`, G, F, and a newer continuation invalidate older generations. `LogicalStream.replayRetainedEvidence()` checks authority before and after each application effect while retaining its live evidence queue, so an authoritative callback-added terminal is still replayable but an F-added terminal is not | `probeRecoveryContinuationAuthority()` runs active retained item -> replay -> Observer next -> `shutdown()` with an identity-free Pending sibling. It asserts one replay body, zero barrier commit/`peer-recovered`/Pending admission, closed peers, one event$ completion per side, zero resources/stream sets, and no late bootstrap/send/recover/source authority. Fresh subcases lock two-body item/authoritative callback-added overflow replay and `enterRecovery()` state-effect -> shutdown invalidation |
| B2 unique cross-mode termination task | `PrototypeSession.getOrCreateTerminationTask()` is reached by `shutdown()`, public `close()`, and internal `forceClose()` before finalization; both graceful and F convergence resolve it. `PrototypeAcceptor.close()` returns it directly without an `async` identity wrapper | `probeUniqueTerminationTask()` independently proves `close() === close()`, `close() === shutdown()`, and draining `shutdown() === close()`, then awaits settlement and asserts one telemetry pair per side, one event$ completion per side, one teardown, zero resources/state, stable post-close identity, and no late revival |
| B3 R1 evidence closure | No second state machine was added. Three fresh cases drive same-source second-next, complete, or error from the true Observer `next` body; unsubscribe-in-next and next-close use the same runner | Callback-tail assertions prove Subscriber terminal/outgoing finished/Source retirement/incoming finished are all zero while local/Source resources remain held. Post-stack assertions prove overflow/completed/handler-failed winners, exact callback/release order, depth one, and `wireCancels`/`cancel.intent` equal one only for explicit unsubscribe and zero otherwise |

## B4 third-revised-candidate evidence

| Block | Minimal state-machine change | Executable evidence |
| --- | --- | --- |
| B4 recovered-publication/Pending handoff | `PrototypeSession.shutdown()` snapshots `pendingStreams.size > 0` as part of `recoveringAtGracefulCutoff`. Since only `beginStream()` during Recovery inserts into that set, this covers exactly the synchronous recovered-publication/handoff window. G therefore selects the existing Recovery -> F branch until every identity-free Pending has either been admitted or forced; ordinary connected drain remains unchanged | `probeRecoveredPublicationPendingHandoff()` uses two fresh Sessions. One invokes `shutdown()` from the left `state$` connected callback; the other invokes it from the first left `peerRecovered` event callback. Both use a bounded pre-await settlement assertion and prove closed peers, admitted `outcome-unknown`, Pending `unavailable`, zero stream/resource sets, one event$ completion per side, exact unique telemetry pairs, and no late replay/admission/source/event revival. The event case also proves a later observer receives neither the superseded `peerRecovered` nor queued G draining publications after F wins |

## Nested G/F publication-authority addendum

| Block | Minimal state-machine change | Executable evidence |
| --- | --- | --- |
| Reentrant state/event publication | `SideRuntime.state$` filters synchronous publications by monotonically increasing state generation, while `PrototypeSession.shutdown()` captures the existing Session continuation generation and rechecks it after every state/event/captured-stream callback. `SerializedEventBus` attaches that continuation predicate to revocable lifecycle publications without adding another queue or changing committed telemetry. No second Session state machine was added | `probeNestedTerminationPublicationAuthority()` uses one fresh Session with an admitted active stream and identity-free Pending. Its connected callback enters G and its left draining callback reenters F. The early left trace is exactly recovering -> connected -> draining -> closed, the closing observer is recovering -> draining -> closed, the later left and right traces are exactly recovering -> closed, both getters remain closed, and no recovered/draining event survives F. The shared task settles, all resources/sets reach zero, telemetry and completion remain unique, and late callbacks cannot revive state, events, admission, Source work, or terminals |

## Verification from repository root

All generated bundles go to `/tmp`; no build output or dependency is written to
the repository.

```sh
packages/remote/node_modules/.bin/tsc -p .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/tsconfig.json --pretty false
packages/remote/node_modules/.bin/tsc -p .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/tsconfig.nodenext.json --pretty false
packages/remote/node_modules/.bin/tsc -p .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/tsconfig.browser.json --pretty false
packages/remote/node_modules/.bin/esbuild .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/node-consumer.mts --bundle --platform=node --format=esm --target=node24 --outfile=/tmp/husky-ticket13-node-esm.mjs
node /tmp/husky-ticket13-node-esm.mjs
packages/remote/node_modules/.bin/esbuild .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/node-consumer.cts --bundle --platform=node --format=cjs --target=node24 --outfile=/tmp/husky-ticket13-node-cjs.cjs
node /tmp/husky-ticket13-node-cjs.cjs
node .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/run-browser-probe.mjs
pnpm exec biome check .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway
pnpm --filter @husky-di/scripts test:code-standard
pnpm --filter @husky-di/scripts check:code-standard
```

Recorded candidate results on 2026-08-23:

- strict bundler-resolution noEmit: 0 diagnostics; all `@ts-expect-error`
  directives consumed;
- relative-source proposed-fixture NodeNext `.mts` and `.cts`,
  `skipLibCheck:false`: 0 diagnostics; this proves only those relative source
  fixtures, not installed-package exports, declarations, or resolution;
- DOM-only compile with an explicit empty ambient `types` list: 0 diagnostics;
- esbuild-bundled local prototype Node ESM and CJS: both passed every runtime
  assertion; this proves bundled runtime behavior only;
- proposed-fixture DOM-only bundle: Chromium, Firefox, and WebKit all passed;
- targeted Biome check: passed with no diagnostics; repository code-standard
  checker and its 33-test suite: passed.

## Current production negative baseline and handoff

Read-only inspection of the current working tree still finds
`RpcCallDirectionEnum`, root type `RpcPeerResult`, `IRpcAcceptor.resolveAll`,
`unknownMethod`, and `maxPendingInvocationsPerSession` in production. The
production package has not been changed or packed by this ticket, and packed
production NodeNext `.mts/.cts`, Node ESM/CJS, or browser acceptance has not run.
The prototype's successful consumers must not be reported as those production
results. The NodeNext commands resolve `./final-stream-interface.prototype.ts`;
the esbuild commands bundle that same local source. Neither observes an
installed package export map, emitted declarations, or package resolution.
`Object.keys()` can test runtime exports but cannot prove deletion of type-only
exports. The real tarball/install matrix belongs to Ticket 14 and the later
implementation acceptance; Ticket 13 must not pack production.

Implementation handoff remains:

1. atomically implement the proposed caller/exposure, Protocol, telemetry,
   policy, shutdown, and wire behavior in production;
2. update the normative specification and matching `specification.test.ts` in
   the same production change;
3. delete the old Group/direction/error/policy surface from runtime and emitted
   declarations, with no deprecated alias;
4. under Ticket 14 / implementation acceptance, pack the actual package and
   install the tarball into isolated Node ESM/CJS, NodeNext `.mts/.cts`
   (`skipLibCheck:false`), and DOM-only browser fixtures;
5. compare actual runtime **and emitted type** inventories against the proposed
   exact fixtures before claiming P11 production acceptance.

## Residual disputes and attack traces

- This file validates the final caller-facing contract and seam ordering, not a
  production scheduler, framing codec, cryptographic proof, or transport. The
  later implementation must reuse Tickets 05–12 rather than copy this fake.
- Source `stream-finished` is emitted after the one-shot teardown attempt and
  `onReleased` latch so the optional incident bit is authoritative. Terminal
  authority/evidence is committed earlier; this does not delay wire progress.
- R2 uses minimal generation-scoped bootstrap/send settlement hooks solely to
  prove their state authority is fenced at G/F; it does not implement a
  Transport, cryptographic bootstrap, or send Promise. Actual adapter and wire
  settlement behavior remains Ticket 14 implementation acceptance.
- The altered-replay probe records `recovery.equivocation-fault` and forces a
  protocol-fault close. Exact replay suppresses by disposition frontier; it
  never reacquires or resubscribes the application source.
- Safe attack probes include outer/inner Descriptor getter traps, symbol and
  non-enumerable fields, Promise/thenable cast escapes, unknown-member spelling,
  W=1 overflow, three independent same-source next ->
  second-next/complete/error winners, synchronous teardown -> close -> throw,
  started-callback close, Observer next -> close, retained replay -> Observer
  next -> shutdown, recovered connected-state -> shutdown, `peer-recovered` ->
  shutdown, connected -> G -> left draining -> F with later-observer stale
  state/event suppression, all three close/shutdown task permutations, recovering G late
  callbacks, and child teardown(A) -> reentrant child B.next.
- The unary path is present to validate the mixed facade, exact cancellation
  slot, captured receiver, safe failure, and ordinary `then` data. It is not a
  second prototype of the already-existing full unary Pending/Recovery state
  machine.
