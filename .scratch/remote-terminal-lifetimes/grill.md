# Remote terminal lifetimes: adversarial grill

Type: grilling
Status: resolved

This is the historical design interview record. On 2026-09-05 the user invoked
`implement` with spec.md, resolving Q15 and authorizing all three work packages.
The approval-pending statements below describe the completed interview stage;
implementation status and acceptance evidence are maintained in spec.md.

During the interview, Proposer was the sole author; Challenger
is read-only; Coordinator routes evidence and counts the finite 8-exchange
budget. An exchange consists of question, answer, and Challenger check. The
initial independent passes consume no exchange. Implementation is not authorized
by this record. Final shared-understanding confirmation remains open.

## Authority and process

Both roles independently read the same original baseline before seeing the other
role's material. Both passes finished before the first write. Before creating
these files, Proposer inspected current git status (clean) and verified that
.scratch/remote-terminal-lifetimes did not exist. No external file was overwritten.
All root decisions below use the user's all-candidate selection and delegated
engineering judgment within current public semantics; they are not user approval
of implementation. The controlling skills are adversarial-grill, grilling,
codebase-design, domain-modeling, and husky-di-code-standard with assembly guidance.

## Tree, prerequisites, and state

The answer text and evidence for each question follow below or in the named spec
section. Status distinguishes verified facts, authorized design decisions,
provisional assumptions and open user input. A design choice can be authorized
engineering judgment while its Challenger check is still pending.

| ID | Prerequisites | Answer / recommendation | State and source |
| --- | --- | --- | --- |
| Q1 Scope | None | All three candidates; design and working records only, prior effort resolved | authorized decision: user selection + Coordinator brief; verified skill confirmation requirement |
| Q2 Session winner | Q1 | One complete terminal operation within existing Session | authorized design decision; exchange 1 checked, no blocking objection; verified missing waiters at rpc-session.impl.ts:1158-1224 |
| Q3 Session publication | Q2 | Narrow tagged input; SPI-003 trusted ports; finally-protected terminal tail; terminal branches before Recovery detach | authorized design decision; exchange 2 checked, no blocking objection; verified SPI-003/010/011/012 and source |
| Q4 Session races | Q2,Q3 | Exact binding entry/commit checks, first winner, preserved resume-plan revalidation and sibling barrier independence | authorized design decision; exchange 3 checked, no blocking objection; race table in spec section 01; RPC-SHUTDOWN-005-009/CLOSE-001/002 |
| Q5 Session evidence | Q3,Q4 | Direct reproducer, public Protocol semantic/physical separation, two-Session public Acceptor barrier; actual specification/matrix selectors | authorized design decision; exchange 4 checked, no objection; final evidence matrix in spec section 01; tests planned, not executed |
| Q6 Conformance custody | Q1 | All 15 cases; immediately register every returned identity and legal release capability | authorized design decision; exchange 1 checked, no blocking objection; source paths in spec section 02 |
| Q7 Conformance disposal | Q6 | Absolute deadlines and generation fencing; every explicit close/cleanup reads the original property afresh; captured capability is fallback only | authorized design decision; exchange 5 checked the correction and resolved O1 |
| Q8 Error/report/spec | Q6,Q7 | Operation/task-owned dedup; raw-read failure versus started-call versus eligible fallback keep separate provenance | exchange 3 rules retained; exchange 5 checked O1-dependent clarification; examples in spec section 02 |
| Q9 Conformance evidence | Q7,Q8 | Scoped explicit observations preserve fresh method reads; changing-getter counterexample joins exported-runner matrix | authorized design decision; exchange 5 checked the correction and resolved O1; tests planned, not executed |
| Q10 Owner depth | Q1 | Evaluate concrete lifetime module against deletion and caller-responsibility tests | authorized design decision; exchange 1 checked (criteria only, not extraction); duplication verified, no defect demonstrated |
| Q11 Owner interface | Q10 | Fixed facade/lifecycle/creator contract; accepted apply phase entry; constructor-bound closures and activation-last assembly | authorized design decision; exchange 2 checked, no blocking objection; spec section 03 records exact placement and dependencies |
| Q12 Owner races | Q10,Q11 | Winning apply changes phase; generation/remaining-time checks; different abort orders; one Custody deadline/Publisher finalization | authorized design decision; exchange 3 checked, no blocking objection; timing table in spec section 03; RPC-LIFE/CLEANUP |
| Q13 Owner outcome/evidence | Q11,Q12 | Select reviewed extraction for unconfirmed proposal; deletion proof and public acceptance fixed; return to depth gate if implementation cannot remove duplicated rules | authorized design decision; exchange 4 checked, no objection; spec section 03 and WP3; implementation remains unauthorized |
| Q14 Records/spec/validation | Q1 | needs-info proposal; no source/spec changes now; same-change public behavior gate; scoped baseline distinct from acceptance | authorized decision + verified AGENTS/SPECIFICATION/ADR requirements; exchange 1 checked, no blocking objection |
| Q15 User confirmation | Q2-Q14 technical closure + consistent records | Present reviewable plan for shared-understanding confirmation | open: user authority required by grilling final paragraph; no waiver provided |

Initial ready frontier was Q2, Q6, Q10, Q14; exchange 1 checked these root answers.
Exchange 2 checked Q3, Q7, Q11; exchange 3 checked Q4, Q8, Q12. Exchange 4 presented
the last technical frontier Q5/Q9/Q13 plus document consistency. Q5/Q13 passed;
O1 reopened Q7/Q9 and dependent Q8 provenance. Exchange 5 checked the scoped
correction and resolved O1. Q1-Q14 are technically settled, the technical frontier
is empty, and no blocking/advisory objection remains. Tests remain planned in this
design-only task. Q15 is the sole remaining required user input.

## Question prompts and supported answers

❓ **Q1** - **Scope and authority**: What does selecting all candidates permit?

➡️ Complete all branches of the three-candidate design interview and write this
reviewable proposal. Preserve current public semantics, the existing deep modules,
and ADR-0001. The user's final confirmation is separate from candidate selection.

❓ **Q2** - **Session terminal owner**: Who must own complete semantic termination?

➡️ The existing Session's first-winner terminal operation owns complete release,
Direct Close, authorized projection, notification and waiter settlement. The
root decision fixes the missing branch-tail responsibility; it does not prescribe
a new class. Source: rpc-session.impl.ts:735-755 and 1158-1224; report candidate 01.

❓ **Q3** - **Projection authority**: Which triggers may project closed?

➡️ The spec section 01 table is the proposed complete mapping. Framework force
and fault reentry must not duplicate Framework publication; Session-authorized
remote/recovery/continuity/counter triggers retain their exact reason/cause.
SPI-003 defines trusted non-throwing ports; finally protects the completion tail.
The planned counter/draining branch will precede ordinary-Recovery binding detachment.

❓ **Q4** - **Session races and idempotency**: What happens when termination reenters?

➡️ Claim and revoke before callbacks; duplicate and stale triggers have no new
authority. Remote Close may win during pending Close send and finish after Direct
Close; the send's late failure is inert. Normal pending shell alone does not
complete early. Private waiter identity is not a public Owner identity change.

❓ **Q5** - **Session acceptance**: What proves liveness and unchanged authority?

➡️ Controlled direct Session tests prove the observed private waiter gap; public
Protocol tests prove semantic completion before physical cleanup; a public
two-Session Acceptor test proves independent barrier shares. Match actual new
specification.test titles in REQUIREMENTS, preserving existing authority/recovery,
fairness/health and 64-Session evidence. The 93-test baseline does not prove a fix.

❓ **Q6** - **Conformance acquisition**: When does runner custody begin?

➡️ Immediately after every role return, before validation or a next acquisition;
include all 15 cases. Repeated identity is disposed once but remains a freshness
failure. Never invoke an unvalidated cleanup member. A constructor that throws
without returning a resource has not transferred custody. Source: conformance
utility lines 69-93, 114, 293, 431 and 745-800.

❓ **Q7** - **Conformance disposal**: Can one broken role prevent later releases?

➡️ No: case abort/authority revocation, independent close attempts, runner-owned
transport termination, independent cleanup starts, then one absolute bounded wait.
Register rejection consumers before another handoff operation can throw. The fixed
policy is one absolute 2s work interval plus one 2s disposal interval, independent
capability access/calls, generation fencing, and original candidate cleanup/close
observations with an attempt ledger. Explicit observations re-read original role
properties every time; captured capabilities serve fallback only. A read failure
does not mark an unstarted method attempted. Overall work deadline has the spec gate.

❓ **Q8** - **Error/report semantics**: Can cleanup replace the actual failure?

➡️ Deduplicate by operation/task, never Error identity; primary first, then
resource/phase/invocation order. A shared task is waited/recorded once. Work seals
on outcome selection, cleanup records remain admitted through disposal, and final
reports freeze after disposal. Public disposal and overall work-deadline guarantees
require normative SPECIFICATION and specification.test updates together.

❓ **Q9** - **Conformance acceptance**: Which failures need executable evidence?

➡️ A private one-shot lifetime owns setup/disposal, and scoped createRole/openPair,
raw close/cleanup observations and bounded waits leave cases only their semantic
assertions. The exported-runner matrix covers every resource/error/deadline/report
branch and both healthy candidates. Align the 15-ID entry comment with current
runtime IDs, protect private exports, and propagate actual normative test selectors.
The public conformance import is already allowed; no guard change is needed. The
changing-cleanup-getter fixture must fail original raw Promise identity, and a
raw-read failure must not suppress captured fallback before any method has run.

❓ **Q10** - **Owner extraction value**: What would justify a shared lifetime?

➡️ Both owners must lose duplicated task/timer/settlement state and temporal
rules while Session Ownership, Custody and Publisher retain their present deep
responsibilities. Deleting the new module must reintroduce real complexity.
No defect is implied by duplication and one implementation does not invalidate a seam.

❓ **Q11** - **Owner consumer contract**: Which interface hides the shared lifetime?

➡️ The spec's two consumer views own public termination requests and atomic-phase
entry/continuations. Winning apply begins the phase; closures bind at construction
and public Protocol activation happens last. The proposed removed fields/methods
make depth testable; Q12's race check precedes the final extraction decision.

❓ **Q12** - **Owner timing**: What must survive a generic lifetime module?

➡️ Cache task and apply Connector requested gate synchronously before reentry;
preserve Connector abort-before-commit versus Acceptor commit-before-listener-abort;
absolute grace, Custody's sole cleanup deadline, late-settlement fencing, Publisher
final stream/event/task order. Sources: RPC-LIFE-001/002, RPC-CLEANUP-001-004 and
Session Ownership's corresponding apply transactions.

❓ **Q13** - **Owner decision and acceptance**: What if the interface is forwarding?

➡️ Select the reviewed extraction in the proposal awaiting user confirmation:
both Owners lose task/resolver/timer/Protocol-settlement/final-cleanup coordination,
while existing deep ownership remains intact. Deletion would restore those rules
to both Owners. Preserve the full public identity/mode/reentry/deadline/error/
publication/abort-order matrix. If implementation cannot delete those rules,
return to the depth gate rather than retain a forwarding wrapper.

❓ **Q14** - **Records and validation**: What is implemented or proved now?

➡️ Only these unconfirmed proposal records. No implementation validation is claimed.
The original scoped 6-file/93-test pass is baseline. Future implementation has the
same-change public-behavior spec gate and the repository's full applicable validation.
No new glossary term or qualifying ADR is needed.

❓ **Q15** - **Shared-understanding confirmation**: May implementation proceed?

➡️ This remains open until the user confirms the reviewable settled design. The
technical interview can proceed independently; agreement of agents is not approval.

## Exchange and objection log

### Initial independent passes (not counted)

Proposer mapped Q1-Q15 and gave evidence-backed facts and provisional technical
answers. Challenger independently identified root frontiers for Session winner,
all-case conformance custody, Owner extraction depth, and specification gates.
Both independently found the construction freshness cases also omitted cleanup.

### Exchange 1 of 8: completed

- C-Q1 maps to Q2-Q4: selected complete Session terminal ownership and supplied
  the complete trigger-authority table; retain exception/race details for the
  next ready frontier.
- C-Q2 maps to Q6: selected every-return identity registration and all 15-case
  lifetime ownership, immediate handoff rejection consumption, independent
  releases and runner-owned transport termination.
- C-Q3 maps to Q10-Q12: supplied a concrete interface sketch, proposed removed
  owner fields/methods, retained Connector requested gate and different topology
  transactions. Exact phase integration and final extraction choice remain open.
- C-Q4 maps to Q14: distinguished current baseline from future acceptance and
  required same-change normative/spec-test work for new public disposal behavior.

Coordinator reports Challenger checked and settled Q2/Q6/Q10 criteria/Q14 with no
blocking objection. Q10 did not settle the extraction decision. Advisory corrected:
the actual teardown clears timers before terminating calls, not after replay.

### Exchange 2 of 8: completed

- Q3 fixes tagged publication authority and trusted SPI-003 contracts, protected
  completion tail, and terminal-before-Recovery-detach ordering.
- Q7 fixes first-factory activation, one 2s work interval plus one 2s disposal
  interval, independent capability capture/actions, late authority revocation,
  failure ledger location, and raw cached-cleanup/close observations.
- Q11 fixes creator/dependency contracts, task/gate single writer, accepted apply
  phase entry, Publisher continuation/final settlement authority, and activation-last
  immutable assembly. Q12 will test reentrant ordering and deadlines.

Coordinator reports Challenger checked Q3/Q7/Q11 with no blocking objection.

### Exchange 3 of 8: completed

- Q4 fixes the Session action table: exact-binding recheck at terminal commit,
  first winner before reentry, pending-shell race, terminal-before-detach,
  retained resume-plan commit checks and independent Acceptor barrier shares.
- Q8 fixes operation/task identities, deterministic aggregation, raw explicit
  cleanup/error examples, immediate early-handoff consumers and late-record freeze.
- Q12 fixes winning-apply phases, phase-bound continuations, absolute-deadline
  checks before Protocol work and in settlement handlers, role abort ordering,
  and sole Custody/Publisher completion responsibilities.

Coordinator reports Challenger checked Q4/Q8/Q12 without a blocking objection.
Additional supporting source: Publisher appends the apply continuation after the
complete publication wave; an F queued by a notification precedes the old grace
continuation, which then loses phase authority.

Before the exchange 3 edit,
Proposer compared current file hashes/content with the prior authored version;
no outside changes were present. Coordinator separately checked all 685 repository
files against BASELINE.json: changed=[], HEAD still 221dd911..., and only this
spec.md/grill.md pair is new output. This is design-stage file-integrity evidence,
separate from the 93-test baseline and from future implementation validation.

### Exchange 4 of 8: completed with blocking O1

- Q5 fixes direct/public-Protocol/public-Acceptor evidence levels and real
  normative selector propagation; no probe or implementation test was run.
- Q9 fixes the consumer interface, all-case failure/healthy acceptance matrix,
  feature-first private placement, same-change public spec/test/matrix gate,
  actual stable-ID comment update and negative public-export protection.
- Q13 selects the extraction proposal by the checked deletion test, specifies
  its public acceptance matrix, orders WP1 -> WP2 -> WP3, and preserves the
  implementation stop condition if duplicate temporal rules cannot be removed.
- Type advisory fixed mechanically: the termination factory is a generic alias
  RpcOwnerTerminationFactory<TClosed>, allowing its construction alias to derive
  Parameters<RpcOwnerTerminationFactory<TClosed>>[0] without losing correlation.
- Shared fact correction affects Q9 only: Challenger's earlier report that the
  public-import allowlist omitted conformance was incorrect. Proposer read both
  baseline and current tests/requirements.test.ts:490; ../src/conformance is
  already present, with no diff. Coordinator independently confirmed both reads
  and shared the correction. Preserve this guard; no source fix is needed.
- Verified package scripts require build before full Remote test; that test chains
  typecheck, type tests, runtime/requirements/packed consumers, then three-engine
  browser validation. These are future acceptance commands, not executed results.

Challenger passed Q5/Q13 and the other record details but raised blocking O1 on
the explicit raw close/cleanup observation contract, reopening Q7/Q9 and its Q8
provenance dependency. Exchange 4 was not an all-pass final review.

### Exchange 5 of 8: completed, O1 resolved

**O1 (resolved; formerly blocking, Q7/Q9; dependent Q8):** If get cleanup() creates a new Promise and
returns a function closed over it on each property access, ordinary
role.cleanup(); role.cleanup() returns different Promises and must fail identity.
The previous interface invoked the acquisition-captured function twice, returning
one Promise and incorrectly passing this nonconforming candidate. The structural
SPI does not exclude accessors. Resolution must preserve each raw property access
while retaining independent disposal fallback.

Coordinator independently executed the JavaScript counterexample with Node:
rawPropertyAccessEachCallHasSameTask=false and cachedMethodCallsHaveSameTask=true.
This verifies language semantics, not an actual runner failure probe or an
implementation fix; no repository file was written for that check.

**Proposer correction:** Each explicit scope.close/cleanup re-reads the original
role property, validates/calls the new function with its original receiver, and
registers its operation/raw task. Captured capabilities are fallback only. The
attempt bit is set immediately before invocation, not during property read.
Read/noncallable failure before any call still permits captured fallback; a
started call (even one that throws), or a prior call before a later getter failure,
prevents a redundant retry. A missing safe capability is never guessed. Q8 keeps
read, started invocation and eligible fallback separate by operation; propagation
reuses the record as primary. The changing-getter and read-before-invocation cases
join the exported-runner matrix. Error-identity and report-freeze rules do not change.

Challenger's final check passed and resolved O1, including its Q8 provenance
dependency. Budget: 5 of 8 exchanges completed. Technical design is settled and
awaiting required user confirmation. Files remain needs-info and only this pair
was edited after comparing prior versions; source/tests/normative specification,
CONTEXT and ADR are unchanged. Proposer has stopped writing.

## Remaining input and final check

- Q1-Q14 are technically settled; O1 is resolved and no blocking/advisory objection
  or material provisional assumption remains. Implementation tests are future
  work after approval, not missing design-stage evidence.
- Q15: final user shared-understanding confirmation remains required and pending.
