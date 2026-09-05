# Remote architecture optimization

Type: grilling
Status: resolved

This is the working design and verification record for implementing the existing
unary architecture improvements identified in the 2026-09-05 review. It is not a
replacement for `packages/remote/docs/SPECIFICATION.md`.

## Authority and baseline

- The user requested all applicable architecture optimizations and an
  adversarial grill, then explicitly limited implementation to the existing
  architecture without introducing stream support. Routine private,
  behavior-preserving implementation choices are authorized.
- The baseline is HEAD `d935fcb94407e16bd141a4c766074b365f79e4dc`, captured under
  `/private/tmp/remote-architecture-20260905-baseline`. Its report and handoff are
  retained there. The unrelated skill deletion/addition is outside this effort.
- The accepted admission decision in
  `docs/adr/0001-asymmetric-rpc-call-seam.md` and the current Remote normative
  specification remain authoritative. This effort changes neither the public
  call interface nor the Default Protocol profile.
- Exactly two reusable agents perform the interview: Proposer owns the design
  and these records; Challenger independently probes and verifies it. The
  coordinator routes evidence and owns the six-exchange budget. The user's
  implementation instruction and explicit scope resolution authorize proceeding
  after the private design has passed its checks; no new public/product decision
  is being delegated to the agents.

## Design tree and current frontier

| Question | Prerequisites | Recommendation / answer | Basis and state |
| --- | --- | --- | --- |
| Q1 Scope | None | Improve existing unary implementation; preserve public behavior, profile and admission. | Settled by user. |
| Q2 Framework call lifecycle | Q1 | One private module owns outgoing invocation and incoming reservation lifecycles behind two distinct operations. | Implementation checked in exchange 2; no blocking objection. |
| Q2a Assembly and ownership | Q2 | Peer owns identity, state and exposures; factory assembles one call-lifecycle collaborator through a dependency-neutral creator contract. | Settled in exchange 1; Framework implementation complete. |
| Q2b Reentrancy and cleanup | Q2 | Preserve synchronous finish gates, scoped commit, abort observation and true handler settlement. | Preserved by extraction; targeted specification checks pass. |
| Q3 Incoming-call/replay retirement | Q1 | Own incoming terminal selection, replay reservations, ACK retirement and replay barriers together. | Implementation checked in exchange 2; no blocking objection. |
| Q3a Terminal custody | Q3 | Bind each selected terminal to its replay reservation before queueing; the sender does not infer its owner from message kind. | Settled in exchange 1; cohesive completion capability chosen. |
| Q3b Recovery transaction | Q3 | Retire the peer cursor and construct the remaining replay barrier synchronously inside existing binding installation. | Integrated; Session validates cursor bounds and authority. |
| Q3c Resource accounting | Q3 | Move quota accounting with reservations; preserve release timing and guards around reentrant terminal callbacks. | Integrated behavior and nine retention tests pass; custody split described below. |
| Q4 Stream candidate | Q1 | No stream producer seam, iterator protocol, buffering, backpressure or stream quota policy. Preserve unary Handler Settlement. | Settled by user and current normative scope. |
| Q5 Evidence and records | Q2, Q3, Q4 | Keep specification evidence, add behavioral retirement regressions, protect private surfaces, and run affected-package checks. | Validation and final exchange 3 review complete; frontier empty. |

The first independent passes are complete. Exchange 1 addressed the whole ready
frontier, including synchronous control getters, start-event abort, escaped
commit, ACK-before-handler-settlement, admission cancellation, recovery fencing,
reentrant resource release and canceled handler permit lifetime. Exchange 1 found
no blocking design objection. Its advisories were implemented as a cohesive
completion capability, explicit custody of uncommitted replay reservations and
preserved failed-admission guards. All mapped design branches and applicable
validation are resolved. Challenger verified the final evidence and records in
exchange 3; the frontier is empty, with no unsupported assumption or unresolved
prerequisite, blocking objection or advisory objection.

## Framework call lifecycle

`IRpcPeerCallLifecycle` has two operations: `invoke(service, method, cancelable,
actualArguments)` and `reserveIncomingCall(request, consume)`. It owns preflight,
outgoing preparation/publication/cancellation, incoming count and byte capacity,
scoped commit, handler invocation and assimilation, terminal validation, payload
cleanup and payload-free call observations. These remain two deliberately
asymmetric admission paths.

`RpcPeerImpl` retains stable Peer identity, state, exposure ownership and facade
creation. The collaborator receives only the live state/session/exposure
capabilities it needs plus the existing scheduler, retained-byte reservation,
observation and fault dependencies. It does not receive phase setters, terminal
selection callbacks or a reference to the concrete Peer implementation. Creation
is bound once by the Peer factory through an interface-first creator contract;
the concrete lifecycle implementation and construction alias remain private.

Placement is `interfaces/peer/rpc-peer-call-lifecycle.interface.ts`,
`impls/peer/rpc-peer-call-lifecycle.impl.ts`, and Peer factory assembly. Existing
`RpcPeerFactory` construction precedent remains intact.

Moving individual private methods to utilities would distribute phase knowledge
without improving the interface. Splitting directions into interchangeable
adapters would duplicate assembly and shared observation/validation policy. A
symmetric reserve/commit state machine would contradict ADR-0001. The selected
module instead owns complete call behavior behind two operations: deleting it
would return the same phase, terminal and cleanup rules to Peer and its callers.

## Incoming-call and replay retention

The private Session retention module owns incoming identities, their unfinished
Framework handles, selected terminal ownership, replay reservation custody,
replay resource counters and the recovery replay barrier. Session continues to
own Physical Connection authority, safe-integer counters, outgoing Pending
Invocation admission, outgoing public-terminal coordination, scheduling lanes,
Codec envelopes and sends.

The implemented `IRpcSessionCallRetention` interface exposes behavioral incoming
retention/attachment, terminal selection, replay reservation/commit, ACK
retirement, recovery replay preparation and release operations using opaque
owned handles. It exposes no mutable entry maps; count/activity/replay summaries
support Session admission, scheduling and shutdown decisions.
The chosen incoming operation is `selectCompletion(outcome)`: one first-winner
transition owns result reservation and the protected fallback, detaches the
Framework handle and returns a frozen completion containing replay custody and
idempotent `publish()`. It returns `undefined` for a stale/already-selected call;
an existing completion whose `replay` is `undefined` instead means even protected
terminal capacity was exhausted. Session then faults that resource failure.
Terminal ownership is attached to replay custody before the reservation enters
the send queue. Committing its message sequence updates that exact owner without
consulting `message.kind` and the current incoming map. A failed ordinary result
reservation permits the existing protected `handler-failed` fallback; it never
produces a second selected terminal. The caller does not coordinate separate
claim/reserve/finish phases.

An incoming placeholder is retained before Framework commit and holds its
existing close terminal: the fixed unknown-service/method failure for semantic
rejection, or Session termination for a handler. If Framework commit returns
after reentrant Session termination, `attach(call)` immediately supplies that
terminal instead of retaining the returned call. `rejectIncoming(callId)` records
capacity rejection without Framework work or publication: `unavailable` is a
wire disposition here, not a Framework incoming-call terminal. Rejection at the
Session's own full incoming limit still uses the existing protected error path
without adding another incoming placeholder.

Exchange 2 confirmed that the private close-terminal input should admit only
those actual Session-termination and unknown-service/method alternatives. The
coordinator applied this type refinement and documented that `attach` is called
exactly once before `selectCompletion`. It introduces no new runtime
behavior or public extension capability.

Receipt ACK retires acknowledged replay payloads and incoming identities only
after the selected incoming terminal has actually been sequenced. ACK of a call
request does not complete a live handler. Locally canceling an admitted outgoing
call settles its public result while its logical identity continues awaiting the
peer terminal. Outgoing call retirement and request-replay retirement therefore
remain independent.

Recovery uses the callback-free, synchronous `resumeReplay(peerReceivedThrough)`
operation to retire acknowledged evidence and capture the remaining sequence
barrier. It intentionally does not validate cursor bounds. Session validates the
cursor against retained high-water marks and binding authority, then updates its
peer high-water mark and calls `resumeReplay` inside the existing non-awaiting
epoch/binding installation transaction. Session fences every late effect by exact
current binding. Ordinary ACK and resume therefore share retirement rules while
retained connection authority stays in Session.

The full existing replay count/byte budgets, protected error/cancel reserves,
terminal payload budgets and idempotent reservation release move with custody.
A replay lease remains caller-owned until `commitReplay` transfers it to retained
replay. Session owns leases in its unsent control queue and releases them on
teardown; retention releases committed replay. A lease held locally during
failed admission remains outside both cleanup collections until its `finally`
guard releases it after reentrant finish/force cleanup has returned. This avoids
prematurely uncharging payloads still held by an admission frame. A retained
terminal identity no longer owns the finished Framework call handle.

Placement is `interfaces/session/rpc-session-call-retention.interface.ts`,
`impls/session/rpc-session-call-retention.impl.ts`, and
`factories/rpc-session-call-retention.factory.ts`; Default Protocol assembly
injects the interface-first creator. Codec, immutable policy and byte-reservation
dependencies bind once. No transport, binding-installation, pump or state-setter
callback enters retention.

Extracting only the ACK scan leaves producer/send/retirement ordering spread
across callers. Moving all Session behavior into a generic call engine would mix
connection authority with call custody. The chosen module earns its interface by
owning terminal-to-sequence association, quota release, ACK retirement and replay
barrier filtering together; deleting it recreates that knowledge at each caller.

## Stream candidate disposition

The review's third candidate was explicitly speculative and only justified once
stream product semantics exist. The user excluded that work. No stream domain
term or accepted stream ADR will be written. Existing unary scheduler permits
remain held until Handler Settlement, even after a cancellation or Session
terminal has selected the call outcome. The Framework must consume late
fulfillment/rejection without changing the selected terminal or observing the
payload.

## Verification and documentation gate

- Baseline targeted checks: six runtime files, 238 tests passed at approximately
  14:42 Asia/Shanghai, as reported by the coordinator.
- Preserve the normative custom-Protocol tests for synchronous finish,
  validation-side effects, duplicate finish, post-commit failure, escaped commit,
  abort races and event ordering.
- Replace direct `_incomingCalls` / `_replayBarrier` assertions only when
  equivalent behavior is covered: capacity recovery after terminal ACK, no
  redispatch after receipt ACK/recovery, removal of acknowledged replay during
  recovery, bounded payload reservations and terminal fallback exactly once.
- Verify running canceled/terminated handlers keep scheduler permits through
  real settlement and queued cancellation prevents dispatch.
- Keep new collaborators out of public entrypoints and verify dependency
  direction, consumer/type surfaces and package builds.
- Run structural checks first, then root code standard, Remote tests, typecheck,
  build, available browser/packed-consumer validation, and `git diff --check`.
- There is no intended public behavior expansion. If implementation discovers a
  necessary visible change, stop that change for scope review; any authorized
  expansion requires the normative specification and matching
  `specification.test.ts` evidence in the same change.

No new domain term was needed, and the design does not meet the
irreversible/surprising/trade-off threshold for a new ADR. Existing normative
behavior remains unchanged. `docs/REQUIREMENTS.md` received only the matching
test-selector update required by the ledger test migration.

## Exchange and objection log

1. Initial candidate revealed after both independent baseline passes. Proposer
   answered Q1–Q6 and Challenger found no blocking objection. Advisories:
   collapse terminal claim/reservation/publication into a cohesive completion;
   release uncommitted replay custody on admission failure; preserve locally held
   failed-admission guards through reentrant shutdown. Proposer selected
   `selectCompletion(outcome)` with retained replay custody and idempotent
   publication. Framework publishes after queue/pump for handler outcomes and
   before queue/pump for cancellation/unknown calls, preserving existing timing.
2. Challenger reviewed the integrated Framework and Session implementation and
   records and found no blocking objection. The remaining advisory narrows the
   private close-terminal type to its three actual alternatives and documents
   exactly-once attachment before completion selection. The coordinator
   accepted and implemented this refinement. All implementation validation is
   now complete; the final evidence/record check belongs to exchange 3.
3. **Final check passed.** Proposer supplied the completed validation evidence
   below, including the repaired requirement selector, its targeted rerun and
   standalone browser validation. Challenger verified the narrowed close input,
   attachment contract, requirement selector, all four public entrypoints, exact
   validation wording, document consistency and completion criteria. All mapped
   Q1–Q6 branches are complete with no open prerequisite, unsupported assumption,
   blocking objection or advisory objection.

Budget spent: **3 of 6 exchanges**. The adversarial interview, implementation,
applicable validation and records are complete. No question, objection or
validation failure remains unresolved.

## Implementation evidence

- Framework extraction complete: the new private lifecycle owns both full call
  operations. `RpcPeerImpl` retains identity/state/exposures/facades. Dependencies
  are bound once via the creator defined beside the lifecycle interface.
- Existing owner/resource test helpers now use Peer factory assembly instead of
  recreating its concrete assembly. Requirement schema/guard evidence paths now
  point to the lifecycle implementation that actually owns validation.
- Early structural checker passed. Seven affected runtime files passed all 231
  tests at 14:50 Asia/Shanghai, including specification, architecture, owner
  publisher/session ownership/scheduler, resource requirements and requirement
  evidence. These are current Framework extraction results, not final package
  acceptance.
- New negative type probes protect both private lifecycle and retention
  interfaces, implementations and creators from public exposure. The combined
  probes passed 2 tests with no type errors.
- Session retention is integrated with frozen selected completions, exact-owner
  replay commits, separate resource rejection and callback-free resume replay.
  Its eight-file integration suite passed all 215 tests, and the new retention
  suite passed all nine tests, as reported by the coordinator.
- Final root `pnpm check:code-standard` passed all 385 files. Final Remote rebuild
  passed for ESM, CommonJS and declaration outputs. Standalone typecheck passed
  after the reviewed private close-terminal type refinement. `git diff --check`
  passed at the final Proposer and coordinator audits.
- The baseline full runtime attempt passed 458 tests but had six failures while
  installing temporary packed-consumer fixtures, each after roughly 70 seconds.
  Those installation failures are baseline environment evidence, not attributed
  to this refactor.
- The rebuilt final full-package run with approved network access passed all six
  packed-consumer fixtures and **472 of 473 runtime tests**, plus **17 of 17 type
  tests**. Its single runtime failure was a stale requirement-evidence selector:
  the renamed ledger behavior test still had its old title in
  `docs/REQUIREMENTS.md`. That `pnpm test` invocation did not exit successfully
  and therefore did not start its browser stage.
- The Proposer compared `docs/REQUIREMENTS.md` with its unchanged baseline and
  propagated only the `RPC-LEDGER-005` selector rename. The affected requirement
  suite then passed **3 of 3 tests** at 15:00:26 Asia/Shanghai. Together with the
  preceding full runtime run, all **473 runtime tests** have passing evidence
  after this correction; this is a full run plus an affected-suite rerun, not a
  claim that a single full command exited zero.
- Standalone browser validation passed **3 of 3 tests** across Chromium,
  Firefox and WebKit in 4.8 seconds. The passed full runtime suite was not
  needlessly rerun after the documentation-only selector fix.
- Challenger's exchange 3 review confirmed the final private close-terminal
  refinement, attachment contract, public surface and evidence wording. All
  validation evidence and records are current.
- The coordinator completed the final audit: clean diff formatting, no stale
  references, all 22 task files accounted for, and the unrelated tracked skill
  changes exactly match their captured baseline diff. Outside edits were
  preserved.
