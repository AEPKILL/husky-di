---
name: adversarial-grill
description: Complete a design grill through adversarial questioning between two agents, with glossary and ADR records by default.
disable-model-invocation: true
---

# Adversarial Grill

Use [grill-with-docs](../grill-with-docs/SKILL.md) as the default workflow, with
two subagents questioning, answering, and refining a design until the grill is
complete. Read its underlying [grilling](../grilling/SKILL.md) for the design
tree, frontier, and question format, and
[domain-modeling](../domain-modeling/SKILL.md) and its linked formats to record
the design as it settles. Include those records by default; honor explicit
requests for discussion only or limits on document writes. The roles below
adapt the interview while retaining the selected workflow's documentation and
completion requirements. This workflow produces the design and scoped records;
it does not authorize implementing the design.

## Roles

- **Proposer** — own the design tree, answer the interview, research facts,
  revise the design, and act as the sole author of requested documents.
- **Challenger** — remain read-only; ask questions, test answers with concrete
  counterexamples, and check dependencies, assumptions, and document consistency.
- **Coordinator** — frame the brief, route exchanges and necessary user
  decisions, track evidence and the budget, and judge completion. Evaluate the
  two roles' evidence rather than authoring a competing design.

## 1. Frame and start

Give both roles a self-contained brief with the design topic, scope, default and
user-requested records, completion criteria, applicable instructions, and the
user's existing decisions and delegated authority. Include the same original
source baseline, capturing relevant tracked and untracked document changes. Set one finite total
exchange budget before delegation, using any user limit; the Coordinator may
choose a reasonable budget without asking for routine permission.

The agents conduct the substantive interview. Reuse existing facts, preferences,
decisions, and delegated judgment without reconfirming them. Agent agreement
cannot establish an unknown product preference. Relay only material decisions
that need the user's authority, with recommendations and why they matter.
Record which participation and final-confirmation requirements from `grilling`
remain applicable under the user's actual instructions. Honor existing waivers
and delegations; delegation of interviewing alone does not waive a separate
confirmation requirement.

Spawn exactly two reusable subagents with separate briefs and no hidden parent
context or model override unless requested by the user. Independently ask the
Proposer for an initial design tree and supported or provisional answers, and
the Challenger for questions and failure scenarios from the original brief.
Keep the candidate hidden until both initial passes finish. Run these passes
concurrently with isolated snapshots; with a shared mutable workspace, finish
the Challenger's baseline pass before the Proposer writes. Reuse these identities
for fact lookup and retries. If either cannot continue, preserve the work and
report the adversarial interview as incomplete.

## 2. Question, answer, and check

The Proposer keeps each question's id, prerequisites, answer or recommendation,
and evidence or decision authority. Distinguish verified facts, authorized
decisions, provisional assumptions, and open questions. Keep an assumption's
consequences and the evidence or decision needed to settle it visible.

For each exchange, work the whole ready frontier using `grilling`'s question
format. The Challenger asks and probes; the Proposer answers from evidence or
delegated judgment and supplies recommendations for undecided choices. The
Challenger checks those answers and any revisions. One such question/response/
check cycle spends one exchange, including cycles that find no defect. Further
questions or corrections begin another counted exchange.

Recompute the frontier as answers settle. Questions depending on unsettled
answers belong to a later exchange. The two roles look up discoverable facts;
a pending lookup blocks only its dependents. Continue independent questions
while necessary user input or evidence is pending, and retain unanswered
questions across waits.

Keep ordinary design questions separate from objections. An objection needs
the affected question or criterion, a concrete failure case or evidence, and
what would resolve it. Track whether it prevents completion or is advisory.
The Proposer revises or answers it with evidence; the Challenger rechecks. The
Coordinator keeps unresolved objections and resolution evidence in a short
record. Resolve objections by evidence; agreement alone does not settle an
unsupported answer.

Preserve the original baseline. Share each new user answer, discovered fact, or
instruction with both roles, recording its source and affected conclusions.
Reopen dependent answers and documents when their basis changes; refresh the
affected review before relying on it. Preserve the question tree, pending input,
objections, and spent budget through updates, retries, and continuations.

## 3. Record settled design during the interview

In the default `grill-with-docs` workflow, the Proposer updates records as their
contents become resolved, within the user's document scope and following
`domain-modeling`'s timing and formats. Capture resolved terms immediately in the
appropriate `CONTEXT.md`; keep it glossary-only.
Create files lazily and offer or write an ADR only when all three criteria hold:
hard to reverse, surprising without context, and a real trade-off. Keep
unresolved proposals in permitted working material rather than authoritative
definitions or accepted decisions. Reuse the user's existing document authority.

Before a document write or integration, compare its current content with the
version used for the proposal and preserve outside edits. Return semantic
conflicts to the Proposer and share any changed basis with both roles. The
Coordinator may mechanically apply the Proposer's patch only after the Proposer
stops writing. The Challenger verifies the resulting records against settled
answers; writing records does not settle unanswered questions.

## 4. Finish or expose the remaining work

After each exchange, the Coordinator checks completion against the requested
scope and `grilling`: all mapped branches accounted for, no open frontier or
unresolved prerequisite, no assumption affecting the result left unsettled,
and no unresolved objection that prevents completion. Required documents and
checks must be current, and any user confirmation still required by their
instructions must be present. Tree coverage is working evidence, not a formal
guarantee that every possible design question was discovered.

Stop successfully when those conditions hold, including on the final allowed
exchange. If the budget is exhausted and they do not hold, stop incomplete.
An exchange with no new evidence, settled decision, or verified correction is
stalled; report the gap instead of repeating it. With budget remaining, when
only a known required input is missing, pause as awaiting that input and state
what is needed.
New branches, answers, retries, and waits do not reset the budget. A later user
request can authorize another bounded session with the unfinished state retained.

Deliver the resulting design and document paths with the meaningful evidence,
any remaining questions or objections, and the spent budget. Distinguish
completion, budget exhaustion, stalled work, and required user input; do not
present agreement between the agents as user approval.
