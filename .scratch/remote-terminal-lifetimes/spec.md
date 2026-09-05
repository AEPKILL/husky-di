# Remote terminal lifetimes

Type: task
Status: claimed

The user authorized implementation of all three work packages by invoking
`implement` with this specification on 2026-09-05. That instruction closes Q15
and supersedes the design interview's historical approval conditions below.
The normative Remote specification remains authoritative. Implementation and
acceptance validation are in progress on `feature-remote`, starting at
`bfeb0f9bd8cb137dd5b7c1dbe8785fe7b59c0268`.

## Authority and evidence

- The user selected all handoff optimizations and requested adversarial-grill.
  That authorizes the complete design interview and its working records, not an
  automatic implementation approval. Technical choices below use the existing
  public semantics and delegated engineering judgment.
- Original read-only baseline:
  `/private/tmp/remote-adversarial-grill-20260905-baseline`, HEAD
  `221dd911f423529715b186f6c0a32e804659338d`; `BASELINE.json` includes tracked and
  non-ignored untracked hashes and the original clean worktree state.
- Read the baseline `remote-architecture-handoff-20260905-202930.md` and
  `architecture-review-20260905-171545.html`. Their architecture scan was reused.
- The Session probe demonstrated a private Session shutdown waiter remaining
  pending after an admitted call and valid remote Close, including after a later
  forceClose. It did not demonstrate a public Owner shutdown hang.
- The conformance probe recorded 12 partial acquisitions with zero Connector
  close/cleanup calls while all 15 cases reported. It did not measure memory
  leakage. Its old bundle must be rebuilt from current source for future evidence.
- Owner duplication is source-backed; no Owner defect was demonstrated.
- Coordinator reran the six original scoped runtime files at 20:33:39 on
  2026-09-05: 6 files / 93 tests passed, 793 ms. This is an unchanged-source scoped
  baseline, not full package validation or evidence that either probe is fixed.
- The historical `.scratch/remote-architecture-optimization` is resolved work.
  Its permissions, earlier candidate numbering, and implementation are not reopened.

## 01: Complete Logical Session terminal lifetime

One private operation within the existing Session implementation owns the complete
terminal lifetime. It claims the first winner and revokes binding/work authority
before reentrant work, releases retained semantic state, fences and invokes Direct
Close, performs only the winning trigger's authorized transition, notifies
onTerminal once, and settles an already-created semantic shutdown waiter.
Existing caller-specific completion tails disappear. A new class is unnecessary.

Shared source evidence: _enterRecovery currently removes _binding and queues the
old endpoint's Direct Close before its counter/draining terminal branch. The
selected correction checks counter/draining termination first, while the binding
is still installed, and invokes complete termination synchronously. Only ordinary
Recovery then detaches the binding and defers Direct Close. The terminal helper
therefore receives the still-current endpoint through its owning Session; no new
detached-endpoint input or fallback microtask is needed on this branch. This is a
source-backed design correction, not new runtime-probe evidence.

The complete operation takes only the following file-local tagged data:

```ts
type SessionTerminalCause =
  | { readonly kind: "framework-force" }
  | { readonly kind: "session-closed";
      readonly reason: RpcCloseReasonEnum.remoteTerminated |
        RpcCloseReasonEnum.recoveryExpired | RpcCloseReasonEnum.continuityFailure |
        RpcCloseReasonEnum.counterExhaustion | RpcCloseReasonEnum.forcedClose;
      readonly cause?: Error };
```

The operation constructs the closed transition itself for session-closed. It
accepts no arbitrary publication callback and cannot express protocol/resource
fault publication. _fault still calls host.fault; the Framework synchronously
reenters forceClose and owns fault publication. Framework-force also represents
the existing no-projection graceful-shell local completion; the name describes
projection authority, not a new peer reason.

| Trigger | Projection authority | Waiter/Direct Close |
| --- | --- | --- |
| Framework forceClose, including synchronous fault reentry | Framework retains peer/Owner projection; Session emits no additional closed transition | Session completes locally and resolves its existing waiter after Direct Close invocation |
| Valid current protected remote Close | Session closed(remote-terminated), once | Completes immediately without a Close reply, ACK, Recovery, or physical-cleanup wait |
| Recovery expiry | Session closed(recovery-expired), once | Completes the same lifetime; missing waiter is harmless |
| Continuity failure / counter exhaustion / drain binding loss | Preserve the current reason/cause and transition authority | Complete once; no healthy sibling authority |
| Graceful Close send fulfillment/rejection | Preserve existing force-style no-projection completion, or counter-exhaustion projection when applicable | Sending the Close does not itself resolve the waiter; settlement invokes Direct Close and completes |
| Duplicate trigger, stale old binding Close, late send/timer/handler settlement | No new authority; preserve selected reason and outcome | No repeated release, notification, send, or new task |

The terminal entry gates first and detaches the binding. Preserve the existing
order: clear timers/activity, terminate outgoing/incoming calls, release replay
and retained-byte evidence, clear recovery authority, then fence and Direct Close.
Projection, onTerminal and waiter settlement follow. An outgoing finish that
synchronously reenters forceClose observes a claimed winner. A remote Close that
wins while the local graceful send is pending completes the waiter after Direct
Close; a later rejection of that send is consumed without another completion.

RPC-SPI-003 makes contract-valid Framework outgoing finish, incoming finish and
host transition/fault ports synchronous, total and non-throwing (normalization is
irrelevant here). Built-in onTerminal only releases its frozen reservation and
removes the matching Session from the Connector slot or Acceptor map
(rpc-protocol-connector.impl.ts:294; rpc-protocol-acceptor.impl.ts:366).
These are trusted ports, not arbitrary application callbacks. The helper still
uses finally-protected tail phases: Direct Close is attempted even if internal
semantic teardown throws, projection is followed by onTerminal even if projection
throws, and the existing resolver is detached before its guaranteed final call.
Preserve the existing best-effort catch around endpoint.fenceAndClose. Do not
convert a violating private collaborator into a new public error policy or claim
all its internal entries remain well-formed after it violates the contract.
Do not broaden a private Session
post-closed Promise identity expectation into RPC-LIFE-001: that clause concerns
the public Owner cached task. Do not resolve a graceful waiter merely because
send was invoked while its endpoint still has active authority.

Keep Session binding, Endpoint, Codec, incoming/outgoing call lifetime, retention,
Activity Probe, reconnection, and owner publication modules intact. ADR-0001's
asymmetric outgoing preparation and scoped incoming reservation remain unchanged.

The race decisions are fixed as follows. Binding identity represents its installed
epoch; do not weaken exact-object/active/closed checks to just sessionId or a
reason flag. Remote Close rechecks the exact active binding immediately before
complete termination, in addition to ingress entry validation. Resume install and
termination plans retain one-shot consumption and current-facts/attempt/deadline
revalidation at commit, rather than relying on a prior review result.

| Sequence | Required winner and action |
| --- | --- |
| current remote Close -> outgoing finish reenters forceClose | complete already claimed closed and detached binding; reentry is inert; remote-terminated remains the sole Session projection |
| old-binding Close after new binding installation | ingress and terminal-commit checks reject old authority; old endpoint may be closed without touching the new binding/session/waiter |
| shutdown -> pending Close send -> current remote Close -> late send rejection | remote terminal completes and Direct Closes; old send has no completion/publication authority; one notification and waiter completion |
| draining or counter-draining binding loss | evaluate terminal branch before detachment; complete while original endpoint is owned; force/counter reason is preserved, no Recovery |
| ordinary binding loss | preserve detach plus deferred old-endpoint close and finite Recovery retention |
| recovery expiry wins before reviewed resume plan commits | closed/current-facts check rejects stale install/termination; a reviewed plan cannot revive expired authority |
| valid recovery activation wins before expiry | original timer is canceled and exact binding/epoch fencing makes old effects inert; mere review is insufficient; initiator installation before activation does not imply recovery is complete |
| accepted Framework fault -> synchronous forceClose -> reentry | force performs internal completion only; the accepted Framework fault transaction remains the sole source of its reason/publication |

Direct Close invocation occurs synchronously before any existing waiter reaction;
its returned physical-cleanup Promise may remain pending. For Acceptor aggregation,
only this Session's semantic barrier share finishes. A healthy cutoff sibling
keeps the role's shutdown Promise pending until it independently terminates or
completes its shell (or the Owner deadline acts).

Acceptance plan: extend the existing direct Session harness for invocation ->
shutdown -> current remote Close, assert call terminal, Direct Close invocation,
one transition/onTerminal, and waiter settlement using controlled gates rather
than elapsed sleeps. Include force reentry, duplicate/stale Close, pending shell
then remote Close then late send rejection, and timer/handler late settlement.
Retain Protocol Connector/Acceptor aggregation and healthy-sibling drain coverage.
The final evidence plan distinguishes three levels:

| Test surface | Proposed test/evidence and what it proves |
| --- | --- |
| Private direct Session harness in tests/protocol/rpc-session.test.ts | Controlled admitted-call -> shutdown -> valid Close reproducer proves the exact originally observed waiter, release/notification counts, and stale/reentrant winner behavior |
| Public Protocol role in tests/specification.test.ts, importing only public protocol/transport/root seams | `RPC-SPI-012 RPC-SHUTDOWN-009 completes semantic shutdown after remote Close before physical cleanup` holds the Connection cleanup Promise pending while proving Direct Close was invoked and role shutdown fulfilled |
| Two-Session Acceptor integration through public seams in tests/specification.test.ts | `RPC-SHUTDOWN-008 RPC-SHUTDOWN-009 keeps a healthy cutoff Session in the Acceptor grace barrier after remote Close` proves one Session's terminal only releases its own share |

These are proposed test titles, not claims that tests already exist. Implement
them before inserting their exact actual titles and paths into REQUIREMENTS.md.
Keep existing protocol.test.ts coverage around 515/587/628, recovery/authority,
fairness and Activity Probe tests, and the default 64-Session parallel convergence
resource test. Never use the old 25 ms observation or 93-test baseline as a passing
fix assertion. A future standalone probe must be rebuilt from the implementation.

## 02: Conformance resource lifetime

Every one of the existing 15 Protocol cases enters a private resource lifetime
before its first factory call. This includes both construction-freshness cases,
the standalone cached-cleanup case, and counter-exhaustion candidate cases, not
only cases using openProtocolPair.

Immediately record every returned role identity before subsequent validation or
acquisition. Independently capture each safely callable close/cleanup capability
with its receiver; one missing/throwing property must not prevent another valid
capability from being considered. Do not invoke unvalidated members. A second
factory returning the first identity still fails the freshness assertion; disposal
is deduplicated by identity. Resources never returned by a throwing constructor
are outside runner custody.

The final consumer interface is a one-shot lifetime run operation plus a scoped
behavioral view. Role construction overloads retain their role-specific types:

```ts
interface IRpcProtocolCaseLifetime {
  run(candidate: RpcProtocolConformanceCandidate,
      work: (scope: IRpcProtocolCaseScope) => void | Promise<void>): Promise<void>;
}
interface IRpcProtocolCaseScope {
  createRole(kind: "connector", host: IRpcProtocolConnectorHost): IRpcProtocolConnector;
  createRole(kind: "acceptor", host: IRpcProtocolAcceptorHost): IRpcProtocolAcceptor;
  openPair(): Promise<ProtocolPair>;
  close(role: IRpcProtocolConnector | IRpcProtocolAcceptor): void;
  cleanup(role: IRpcProtocolConnector | IRpcProtocolAcceptor): Promise<void>;
  waitFor(predicate: () => boolean, operation: string): Promise<void>;
  waitForTask<T>(task: Promise<T>, operation: string): Promise<T>;
}
```

createRole/openPair own immediate identity/capability registration and all handoff
setup. Explicit close/cleanup observations perform a fresh property read on the
original role every time, validate the newly read value as callable, and invoke it
with the original receiver. cleanup returns that invocation's original raw task
while privately recording its identity. Acquisition-captured capabilities are
reserved for disposal fallback; they never replace explicit property reads.
waitForTask preserves operation provenance without replacing the raw value used in
the cached-identity comparison. Scope methods reject work after its generation
seals; only the lifetime's internal disposal may perform the fallback actions.
Case bodies contain semantic assertions, pure host-probe setup, and necessary raw
phase observations through these operations. They never call own/register, abort,
finally disposal, timers or error aggregation themselves. Deleting the lifetime
would return acquisition rollback, deadline, task and error coordination to every
case; this is more than a finally wrapper.

Placement preserves the established feature-first conformance tree:
src/conformance/interfaces/rpc-protocol-case-lifetime.interface.ts for behavioral
contracts and the dependency-neutral creator; corresponding impls/ and factories/
files for the implementation and assembly. Shared non-construction data needed
across these files belongs in conformance/types/; creator-owned input aliases stay
with their owner. The exported conformance runner creates a lifetime per case;
no private collaborator, scope, pair/probe type, implementation or creator enters
any public entrypoint. Apply the code-standard checker before retaining added paths.

The selected lifetime operation owns setup, assertion execution, and disposal.
Each started handoff gets a rejection consumer immediately, before any later
synchronous operation can throw. Handoff flags reset in finally. Disposal revokes
the case's host/transport authority, aborts its shared handoff signal, independently
attempts all acquired close capabilities, directly terminates runner-owned tracked
transport, and independently starts every cleanup capability. All cleanup waits
share one absolute disposal deadline, preserving progress when a role rejects or
never settles. Late handoff/handler/send settlement is consumed without authority
to install a Session or affect later cases. A synchronous third-party method that
never returns cannot be preempted by JavaScript timers.

The lifetime is active before the first factory. All acquisition and semantic
assertion work shares one absolute, non-sliding 2,000 ms work deadline, using the
existing private conformance timeout duration. Local within/waitFor operations
must consume the remaining work interval rather than start a new interval. Work
success, failure or timeout seals the work generation and starts one fresh
absolute 2,000 ms disposal interval. Neither interval is per role or per await;
there is no new public option. JavaScript synchronous non-returning code remains
outside what an asynchronous timeout can preempt.

Every factory or host/session admission goes through a generation check. A late
case continuation cannot invoke another factory, install a Session, alter its
frozen outcome, or reach the reporter. Late Promise results/rejections are consumed.
The lifetime owns a failure ledger, with operation/resource identity and phase
recorded before any throw propagates to case control. Final combination order is
defined by Q8; asynchronous settlement never writes directly to reports.

Immediately after recording a returned object identity, read close and cleanup
independently in separate try/catch blocks and snapshot callable members with
their original receiver. Capture each property access error without preventing
the other capability's validation. Remaining role-shape validation is a separate
work operation. Nonobjects transfer no callable cleanup authority. Each raw method
invocation independently captures synchronous throw; every returned asynchronous
result gets rejection consumption immediately, including before the next handoff
or cleanup call. Host/transport generations are revoked before abort callbacks.
The construction freshness/non-reentry verdict is frozen after its existing
microtask observation and before teardown so teardown cannot rewrite the verdict.

The cached-cleanup case executes the original candidate.cleanup twice, including
two fresh property reads as ordinary role.cleanup() calls would. Register each
raw result without replacing it and compare the original Promise identities.
Each actual invocation marks that method attempted immediately before entering
its function body; property read/callability validation alone does not. Disposal
does not make a redundant third call; it consumes/waits distinct already-returned
tasks. If no method invocation occurred, disposal invokes the safely captured
capability once. The lifetime caches only its own disposal task, not candidate
cleanup. The same ledger distinguishes raw close access from invocation, and
close assertions precede fallback transport termination. A throwing method body
is attempted and is not retried. A throwing/noncallable raw property read before
any invocation still permits one captured fallback call. An earlier raw invocation
followed by a later getter failure prevents an extra retry; consume its tasks.
If no safe capability exists, report access/validation failure without guessing.
Every resource gets unattempted fallback actions independently; total raw cleanup
calls are not universally one.

Preserve case IDs, ordering, semantic assertions, the public conformance exports,
and the reporter contract. Failure ownership is by operation, not by Error
identity. Each synchronous property-read/method/assertion operation gets an
identity; each distinct raw asynchronous task gets one settlement identity owned
by its first registered invocation. A runner-private operation-failure carrier
propagates that identity to the case controller without replacing raw cleanup
return values used in identity assertions. Await helpers propagate the registered
task's identity; catching/awaiting the same failure again adds no cause. A raw
property-read/callability failure belongs to its read operation and creates no
method-invocation record; a throwing method belongs to its started invocation.
Captured fallback, if still eligible, is a separate operation. Propagating the
read/call failure through the case controller selects that existing record as
primary rather than appending a second body failure.

At case finalization, place the primary work/acquisition/assertion failure first.
Sort remaining records by resource acquisition index, phase (capability read,
handoff/work, close, cleanup), and invocation index; runner-owned transport has an
acquisition index too. A cleanup-only failure has no extra synthetic primary.
For each still-pending distinct cleanup task at the one disposal deadline, record
one timeout at its first registered owner operation; already-rejected tasks get
no timeout. Shared task identity has one wait and outcome; two distinct operations
or tasks that fail with the same Error object remain distinct failures. A work
deadline contributes one primary work-timeout record, not one per handoff.

| Failure example | Case cause |
| --- | --- |
| raw cleanup A synchronously throws E; body propagates it; cleanup B times out | AggregateError([E, timeoutB]); A's operation is not counted again as a separate body failure |
| close getter throws E, cleanup getter/call succeeds | E; cleanup still runs; no duplicate shape-validation error for the same unreadable member |
| acquisition captures cleanup F; explicit cleanup getter later throws E before any call | E is the raw-read primary; disposal calls captured F once; a fallback failure is a distinct operation, not a duplicate primary |
| get cleanup returns a new function with its own cached Promise on each read | two explicit fresh reads produce different raw Promises; identity assertion fails, as it would without the lifetime |
| two independent operations throw the same Error E | AggregateError([E, E]); identical value does not merge independent causes |
| raw cleanup called twice returns the same rejected Promise P | one P rejection; the identity assertion passes; one disposal wait |
| raw cleanup called twice returns distinct P1/P2 | identity assertion is primary; each rejected distinct task contributes its own later cause, each pending task gets its own timeout |
| accept's already-rejected task then bind synchronously throws | bind's propagated operation is primary; the already-installed accept rejection consumer records the independent failure before work seals; no unhandled rejection |
| handoff rejects after work is sealed/aborted | consume only; it cannot mutate the selected work outcome or eventual frozen report |

The work body and terminal handler run through Promise jobs, so immediately
installed consumers of already-rejected work run before the body's final rejection
handler. Selecting the work outcome seals work-record admission; disposal records
remain admitted until disposal settles or expires. Finalization then freezes all
cause selection, creates the single case failure/report, and consumes every late
settlement without adding errors or reporting again. A sole cause is retained
exactly; multiple causes become the inner AggregateError. The outer
RpcConformanceFailure and AggregateError retain stable case order, and reporter
error is the same outer failure object. Cleanup never erases a primary assertion.

Adding these disposal guarantees and the overall non-sliding work deadline changes
observable public runner behavior even without a type change. Implementation must
update RPC-CONFORMANCE-001/002 and
matching specification.test.ts evidence in the same change. This design record
does not make that future normative change now.

Acceptance plan through the exported runner: second factory throw; malformed or
duplicate returned role; rejected acceptance followed by synchronously throwing
bind; handoff timeout; failing semantic assertion; close A throw; cleanup A
synchronous throw/rejection and cleanup B pending; late settlement; reporter and
AggregateError identity/order; next-case continuation. Observe acquired-role
release counts, runner transport termination and bounded completion, not inferred
heap leakage. Existing default and independent minimal custom Protocol candidates
must continue passing all semantic cases.

| Exported-runner fixture scenario | Required observable acceptance |
| --- | --- |
| partial second construction, duplicate/malformed role, independent throwing getters | every returned legal capability is attempted; construction cases and standalone cleanup case are included; freshness still fails and no guessed cleanup member is invoked |
| early accept rejection + bind throw; late handoff or host admission | no unhandled rejection; fixed primary/supplemental failures; disposed work cannot install a Session or acquire later roles |
| close throw, cleanup synchronous throw/rejection, other cleanup pending | independent actions all attempted; distinct task timeout/error counts and deterministic acquisition/phase order |
| same Error from different operations; same or different cleanup Promises | preserve independent errors, deduplicate shared settlement, keep raw Promise identity assertion meaningful |
| cleanup getter returns a new function/new cached Promise per read; raw getter fails before invocation | exported runner fails the changing-identity candidate; read failure still permits captured fallback, while a started raw call prevents an extra retry |
| overall work deadline and disposal deadline, including late settlement | one non-sliding work interval plus one disposal interval; bounded case progress; frozen final failure and exactly one report |
| all healthy cases | default Protocol and independent minimal custom Protocol pass all 15 cases; raw close still proves synchronous Direct Close before fallback; all later possible cases report |

In implementation, matching specification.test.ts coverage uses the already-public
../src/conformance entrypoint and covers both public lifetime guarantees and report
semantics. Source correction: tests/requirements.test.ts:490 already admits that
entrypoint in both the original baseline and current checkout; preserve its exact
public-seam allowlist, do not add private imports or make an unnecessary guard
change. REQUIREMENTS.md must reference the actual new test titles for
RPC-CONFORMANCE-001/002 and preserve existing healthy-candidate evidence.

The runtime case IDs stay exactly the current 15. Update only the stale Protocol
ID list in src/conformance.ts (currently 14 entries with reserve-commit-start-sink)
to match actual runtime order: connector-fresh-non-reentrant,
acceptor-fresh-non-reentrant, handoff.subscribe-before-install,
values.normalized-snapshots, outgoing.prepare-start-finish,
outgoing.cancel-before-start-definite-non-execution, incoming.resource-disposition,
incoming.semantic-unknown-service, incoming.semantic-unknown-method,
incoming.handler-dispositions-permit, fault.active-session-scope,
counter.first-call-drains, termination.shutdown-phase, termination.close-phase,
and termination.cleanup-cached, with their existing protocol. prefixes and
construction. prefixes on the first two. Derive exact strings from the runner;
do not rename published runtime IDs to match the outdated comment.

Negative type coverage in tests/types/protocol-surface.test-d.ts and
rpc-owner-factory.test-d.ts protects the new private collaborators. Packed-consumer
coverage validates the four existing package exports against freshly built dist;
no new public export is part of this design.

## 03: Conditional Owner termination coordination

The selected design attempt is one private behavioral lifetime module, with
separate consumer views rather than exposing mutable phase fields. The operation
contract is fixed below; Q12 checks its concrete race scenarios:

```ts
interface IRpcOwnerTermination {
  readonly requested: boolean;
  shutdown(): Promise<void>;
  close(): Promise<void>;
}

interface IRpcOwnerTerminationLifecycle<TClosed> {
  ensureTermination(): void;
  enterGrace(): () => void;
  enterClosing(finalState: TClosed): () => void;
}

type RpcOwnerTerminationFactory<TClosed> = (options: Readonly<{
  deadlineMs: number;
  gateNewWork(): void;
  readStatus(): RpcStateStatusEnum;
  transactions: Readonly<{
    beginGracefulShutdown(): void;
    beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void;
  }>;
  protocol: Pick<IRpcProtocolConnector, "shutdown">;
  custody: Pick<IRpcOwnerCustody, "finishCleanup">;
  finalization: Readonly<{
    releaseReferences(): void;
    finish(state: TClosed | RpcOwnerCleanupFailedState, settle: () => void): void;
  }>;
}>) => Readonly<{
  owner: IRpcOwnerTermination;
  lifecycle: IRpcOwnerTerminationLifecycle<TClosed>;
}>;
type CreateRpcOwnerTerminationOptions<TClosed> =
  Parameters<RpcOwnerTerminationFactory<TClosed>>[0];
```

RpcOwnerCleanupFailedState is the existing structurally common closed / failed /
cleanup-failed / Error alternative, derived privately from the Owner state union.
The generic preserves Connector's broader selected terminal versus Acceptor's
narrower terminal without a configurable error-classification callback. The
protocol contract can be spelled as its minimal shutdown behavior rather than
depending on the Connector role name in the final interface file.

ensureTermination stores the task once, then synchronously runs gateNewWork once,
before any transaction request, publisher queue or user callback. Both views derive
requested from that sole task existence. Connector keeps its
#terminationRequested gate and its existing checks; task creation must synchronously
set it, never substitute an asynchronously published state getter. The gate hook
is only the trusted field assignment and has no reentrant calls; no other writer
can update that Connector field, so it cannot drift from the lifetime's request.
Acceptor's existing task-presence admission checks use requested and its gate hook
is a no-op. The task is cached before the hook to preserve identity under any
future trusted hook extension; no task/timer/reset setter exists.

Session Ownership calls enterGrace as the first operation of the accepted G
transaction's apply, after its queue-head decision has established eligibility
and frozen the membership plan but before reentrant topology effects. The module
records the absolute cutoff/deadline at that instant and returns the idempotent
continuation that starts Protocol shutdown after the publication wave. The return
is the existing Publisher continuation capability, not a caller timer callback.
Session Ownership calls enterClosing similarly at the start of each accepted
closing apply, including spontaneous Connector Session terminal and shared Owner
fault paths. It stores the selected final-state snapshot, cancels grace, and
revokes late Protocol/continuation authority. Its returned continuation owns
Custody cleanup, outcome selection, finalization.releaseReferences once, and
Publisher.finish with the module's resolve/reject capability. Publisher invokes
that capability only after its final streams/events complete. Session Ownership
composes any existing fence-release finally around this one continuation; it does
not catch cleanup results or manage the task. These methods are idempotent;
continuations belong to their exact recorded phase and cannot start work after a
later phase wins.

The module receives behavioral dependencies for requesting Session Ownership G/F
transactions, Protocol shutdown, Custody finishCleanup, Publisher finalization,
and the role's final reference release. Dependencies bind at construction and no
concrete Owner leaks through the seam. The public Owner factory selects/injects
the private termination creator after Protocol validation and resource/Publisher
assembly. Within the Owner's existing private assembly, create termination first
with frozen behavioral closures referring to the eventual Session Ownership
field; the termination constructor only stores its dependencies. Then create
Session Ownership with the returned lifecycle view and assign that field. Finally
activate the public Protocol host and return the Owner, as existing construction
does. Neither constructor invokes the closures; current SPI construction guards
prevent external Protocol work before activation. Thus no dependency setter or
uninitialized runtime callback is required. Interface and implementation live by role
under interfaces/owner and impls/owner; factory assembly uses the interface-first
contract with its owner-specific CreateXxxOptions alias derived from factory input.

Fields removed from both Owners: #terminationTask, #resolveTermination,
#rejectTermination, #graceTimer. Methods removed or delegated: #createTerminationTask,
#continueGracefulShutdown, #clearGraceTimer, #startCleanup,
#finishCleanupSuccess, #finishCleanupFailure; public shutdown/close remain thin
facades. #beginGracefulShutdown/#beginClosing forwarding methods can disappear
if assembly binds the Session Ownership behavior directly. Acceptor retains its
role-specific #clearCleanupReferences behavior; Connector retains
#terminationRequested and attempt cleanup.

Session Ownership retains all atomic gates, fencing, peer outcomes, membership
and intermediate publication. In particular, for G/F, Connector abort -> release ->
commit and Acceptor fence/release -> commit -> listener abort stay different. Source
inspection during implementation confirmed that Acceptor's existing shared
Protocol-fault transaction instead aborts the listener, closes Protocol, releases
Sessions, then commits. Preserve that separate fault ordering, with termination
requested and the closing phase claimed first; RPC-SPI-011 still requires Protocol
Close before fault projection. This extraction does not reorder that transaction. Custody
retains resource identity, one cleanup deadline, and admission-ordered errors.
Publisher retains final state/stream completion -> topology-closed -> event$
completion -> cached-task settlement. The new module does not add a cleanup timer.

The termination task is cached and the admission gate applied before requesting
G or F. Private phases change only at winning transaction apply:
unrequested/requested -> grace -> closing -> finished, with direct requested ->
closing allowed. Merely queued transactions cannot overwrite a phase or selected
final reason. enterGrace/enterClosing return phase-bound idempotent continuations.
The grace timer is created once against the absolute G deadline. Its continuation
and every Protocol settlement handler check phase identity and remaining time;
if already expired they request shutdown-deadline F without starting a fresh
interval. A Protocol error before the deadline requests forced-close; its late
settlement after closing has no authority. All requests are still adjudicated by
Session Ownership's queue-head transaction guard.

| Sequence | Task/phase/reason/deadline behavior |
| --- | --- |
| owner-draining observer calls close | same task; queue F; accepted closing apply cancels grace; older grace continuation is inert |
| Connector abort callback calls close | requested gate already true; same task; queued F wins only while eligible; Connector abort -> release -> commit stays intact |
| Acceptor G/F listener abort callback attempts handoff | committed draining/closing state and requested gate reject it; membership/fencing precede abort |
| Protocol.shutdown synchronously throws | current unexpired grace requests forced-close, without task rejection solely for this error; at/after deadline request shutdown-deadline |
| Protocol.shutdown synchronously calls close and returns/rejects later | reentrant F transaction wins its phase; returned task is consumed immediately; late result cannot alter reason, restart cleanup or recreate grace |
| G deadline reached before continuation, or during long synchronous shutdown | continuation/settlement deadline check requests shutdown-deadline F; no fresh interval or late graceful win ahead of an overdue timer |
| explicit close after closing(graceful) | cached task only; no force/Protocol Close/restarted cleanup |
| cleanup deadline followed by late resource fulfillment | Custody timeout/Error remains authoritative; no final-state rewrite, repeated reference release, or resolution of rejected task |

Only enterClosing cancels/revokes the current grace phase; duplicate losing queued
transactions do not touch timers. Its continuation calls cached Custody cleanup
once. On settlement the module selects the unchanged success final state or the
existing cleanup-failed alternative, releases role references once, and calls
Publisher.finish with a single matching resolve/reject capability. Custody retains
the sole cleanup deadline and trusted Error/admission-order AggregateError; the
module neither retimes resources nor substitutes a new error for a trusted one.

The final design decision is to include this extraction in the proposal awaiting
user confirmation. The checked interface removes both Owners' task/resolvers,
grace timer/deadline, Protocol settlement and cleanup-to-final-publication rules.
Deleting it would reconstruct those same temporal rules in two consumers, while
Session Ownership, Custody and Publisher keep their existing responsibilities.
The phase continuations carry real publication ordering obligations and own the
work behind them; they do not merely forward a caller-assembled sequence.
This meets Q10's depth/deletion criteria. It is a design decision, not an accepted
ADR, implementation approval, or claim that extraction has been implemented.

During implementation, stop and return to this depth decision if duplicated
temporal state remains in both Owners or the new contract requires callers to
reconstruct it. Revise the seam or record no extraction rather than retain a
forwarding wrapper. Do not measure depth by line count or implementation count.
No demonstrated Owner defect or new public behavior is claimed.

Acceptance plan: preserve public cached Promise identity across all mode/reentrant
and post-closed calls; G/F gating; no force after closing(graceful); unbound startup
and listener abort ordering; grace deadline/late Protocol settlement; one cleanup
deadline; trusted Error identity and admission-order aggregation; final publication
order; peer-local faults and healthy sibling drain. Existing public Owner tests
survive; internal tests cannot replace them with implementation-field assertions.

The final Owner acceptance matrix retains public tests for repeated/concurrent/
cross-mode/post-closed exact Promise identity, observer/abort/Protocol reentry,
G/F gates and no force after closing(graceful), absolute grace and sole cleanup
deadlines, late settlement, trusted Error identity and admission-order aggregation,
final streams -> topology/event completion -> promise ordering, peer-local fault
and healthy-sibling isolation. Tests must directly distinguish Connector
abort-before-commit from Acceptor commit-before-listener-abort and verify that
task-request gating precedes published state. Keep existing owner publisher,
Session Ownership, Connector termination and Acceptor cleanup tests.

## Work packages and dependencies

Q15 is closed by the user's implementation instruction. The three independent
implementations proceed in parallel, with integration and acceptance in
WP1 -> WP2 -> WP3 order.

| Package | Scope and completion evidence | Dependency |
| --- | --- | --- |
| WP1 Session completion | Complete private terminal lifetime and terminal-before-Recovery-detach correction; direct/Protocol/Acceptor evidence; matching specification tests and REQUIREMENTS selectors | Q15; current normative semantics |
| WP2 Conformance lifetime | All-case custody/work/disposal/error ownership, feature-first private seam, raw phase observations; same-change SPECIFICATION/specification.test/REQUIREMENTS guarantees; actual 15-ID comment and private-export coverage | Q15; technically independent of WP1, recommended after it so the healthy built-in Protocol fixture uses the repaired semantic completion |
| WP3 Owner termination | Integrate the reviewed private lifetime, delete both owners' duplicated state/rules, preserve role-specific transactions and public acceptance; return to depth gate if deletion fails | Q15; design independent, integrate after WP1 and WP2 so completion and failure-test infrastructure are stable |

No implementation issue files are needed to make these three work packages
reviewable. Actual code and acceptance evidence must be verified against this
specification before marking the work resolved.

## Specification, documentation, and validation gates

- Candidate 01 repairs existing RPC-SPI-012 and RPC-SHUTDOWN-008/009 guarantees;
  retain and strengthen matching specification evidence. If implementation finds
  a required new public behavior, reopen its scope and normative gate.
- Candidate 02 adds explicit public conformance disposal and overall work-deadline behavior: normative
  specification and matching specification.test.ts updates are mandatory together.
- Candidate 03 is private behavior-preserving restructuring or a documented
  no-extraction decision. A discovered public change reopens its gate.
- No new domain term is needed. Do not change CONTEXT.md for general lifetime
  implementation vocabulary. These reversible private choices do not meet all
  three ADR criteria; the accepted ADR-0001 remains authoritative.
- Preserve/update REQUIREMENTS.md with actual existing test titles and paths;
  tests/requirements.test.ts validates precise evidence rows and normative test
  public imports. Planned titles in this proposal are not passing evidence.
- After future implementation, use scripts verified in the current package files:
  `pnpm --filter @husky-di/scripts check:code-standard` early, then
  `pnpm check:code-standard`, `pnpm --filter @husky-di/remote build`, and
  `pnpm --filter @husky-di/remote test`. Remote test already runs typecheck,
  test:types, the full Vitest runtime (requirements/packed consumers included),
  and test:browser. Build first because packed-consumer coverage reads current
  dist. test:browser uses Playwright Chromium/Firefox/WebKit; do not claim it ran
  if an earlier chained stage failed. Run affected focused tests during work and
  use existing standalone scripts only for a justified partial rerun.
- Finish with stale-reference searches and git diff --check, account for all
  changed files and generated artifacts, and record actual command outcomes and
  scope. Never label the present 93-test baseline as implementation acceptance.

The historical technical frontier and objections are tracked in grill.md. Its
design-stage confirmation condition was satisfied by the user's implementation
instruction; implementation results will be recorded here after validation.
