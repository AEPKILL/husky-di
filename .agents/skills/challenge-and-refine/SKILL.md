---
name: challenge-and-refine
description: Complete a task through an adversarial proposer-challenger loop.
disable-model-invocation: true
---

# Challenge and Refine

Complete the user's task through a dialectic between two isolated subagents. The
current agent is the **Coordinator**; the subagents are the **Proposer** and the
**Challenger**. Reuse the same two subagents throughout the run so each role
retains its own context.

The user's instructions and authorization remain the boundary for every role.
A finding can change how the task is completed, but it does not authorize new
scope or external side effects.

## Roles

- **Coordinator** — frame the shared brief, route artifacts between roles,
  maintain the finding ledger, decide whether the convergence gate is met, and
  deliver the final result. Stay outside the contest: evaluate evidence instead
  of inventing a second proposal or weakening a finding by compromise.
- **Proposer** — own the candidate solution and its verification. For a mutation
  task, make the authorized changes and report the exact artifacts changed,
  validation run, assumptions, and remaining risks.
- **Challenger** — remain read-only. Seek concrete counterexamples, requirement
  gaps, unsafe assumptions, regressions, instruction conflicts, and missing
  verification. Challenge the candidate rather than defending a competing
  design.

Use a single-writer rule: only the Proposer authors semantic changes. If the
environment isolates its changes, the Coordinator may mechanically apply the
Proposer's patch only after the Proposer stops writing. Return content conflicts
to the Proposer; the Coordinator does not resolve them by inventing changes. The
Challenger never edits.

## Process

### 1. Frame one shared brief

Before delegation, state:

- the objective and requested deliverable;
- in-scope and out-of-scope work;
- acceptance criteria and required evidence;
- applicable user, repository, specification, and skill instructions;
- relevant source paths or raw inputs;
- authorization and verification constraints.

Resolve discoverable facts before asking the user. Ask only when a missing
decision would materially change the result. Freeze one task baseline before
delegation. For mutation tasks, it includes every relevant tracked and untracked
change, not an assumed clean `HEAD`; for other tasks, it is the immutable source
input. Give both roles that same baseline so neither mistakes the user's work
for the candidate. Before integration, compare the live destination with the
baseline and preserve any overlapping changes made outside the loop.

### 2. Start the two roles independently

Spawn exactly two subagents with separate, self-contained briefs. Do not rely on
hidden parent context, and do not override their model unless the user asked for
one.

Ask the Proposer to produce and, when authorized, implement the first complete
candidate. Ask the Challenger to inspect the original task and baseline and
build an independent attack checklist. Keep the candidate hidden from the
Challenger until both initial passes finish; this prevents anchoring. Run these
passes concurrently only when each role has an isolated filesystem snapshot. If
they can see one mutable workspace, finish the Challenger's baseline pass before
the Proposer receives write access.

One reasonable retry means resuming or reissuing work to the same subagent
identity. Do not spawn a replacement role. If either identity cannot continue,
preserve safe completed work and tell the user that the adversarial validation
is incomplete. The Coordinator does not impersonate the missing role.

### 3. Run an evidence round

Give the candidate, changed artifacts or diff, validation evidence, and stated
assumptions to the Challenger. Require each finding to contain:

- a stable id and impact: `blocking`, `material`, or `advisory`;
- the violated criterion or invariant;
- evidence or a reproducible failure scenario;
- the proof or change that would resolve it.

The Challenger reports no finding when it has no evidence-backed concern;
contrarian phrasing alone is not a finding.

`blocking` means the candidate cannot safely or correctly satisfy the task;
`material` means a likely gap would meaningfully change the result; `advisory`
means an optional improvement that does not prevent completion.

Send the findings to the Proposer. Require a revised candidate plus one
disposition for every finding:

- `accepted` — identify the change and its verification;
- `rejected` — give evidence that the reported failure does not apply;
- `deferred` — explain why it is outside scope and what user-visible risk
  remains.

Return the revision and dispositions to the Challenger. The Challenger retests
the affected criteria, checks for regressions, and marks each finding `resolved`
or `open` with evidence. The Coordinator then records `resolved`, `open`, or
`disputed` by applying the competing evidence to the stated acceptance criterion
or invariant. When the evidence does not decide the question, keep it
`disputed`; neither role's status is authoritative by itself. Keep this ledger
in the Coordinator's context:

```text
ID | impact | finding | proposer disposition | challenger status | coordinator decision | evidence
```

### 4. Converge, bounded

An evidence round is the challenge, revision, and recheck sequence. Run at most
three rounds and stop early only when all of these are true:

- every acceptance criterion has evidence;
- every `blocking` or `material` finding has a Coordinator decision of
  `resolved`;
- every required validation passes;
- the result remains inside the user's authorization and scope.

An evidence-backed rejection can resolve a finding; assertion or majority vote
cannot. Material progress means new acceptance evidence, a newly resolved
finding, or a verified candidate change. Stop as stalled when a full round makes
none. After the third round, stop unconditionally; if any convergence condition
remains false, report the result as incomplete and surface the exact gap or
disagreement instead of declaring success.

## Deliver the result

The Coordinator inspects the final artifacts and validation evidence before
reporting completion. Give the user the completed outcome, the meaningful
validation performed, and any unresolved disagreement or residual risk. Summarize
important findings and dispositions; include the full debate only when the user
asks for it.
