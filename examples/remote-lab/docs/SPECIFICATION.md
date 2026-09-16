# Remote Lab developer platform specification

This is the normative user-visible contract for the developer platform. It
implements the accepted platform direction and
[execution isolation decision](../../../docs/adr/0002-remote-lab-execution-isolation.md).
The specification evidence entrypoint is `../tests/specification.test.ts`;
platform behavior tests live in `../tests/platform/`, and UI acceptance in
`../tests/browser/platform.test.ts`. A test name is not evidence that it passed.

## Project and reusable cases

**EXAMPLE-LAB-PLATFORM-CASE-001 — One saved TypeScript definition.** The normal
workbench MUST open a local project, discover `*.case.ts` files without executing
them, and permit creation and editing of cases and related project files. A case
MUST export `labCase` with a title, optional positive `timeoutMs`, and
`run(context)`. The same module MUST execute in debug, automatic test and CLI
modes. Arbitrary Vitest/Playwright registration entrypoints are not Lab cases.
Built-in cases MUST retain their source scenario identities and material checks;
connection establishment and prefilled results cannot replace assertions.

The context provides explicit asynchronous `step(name, operation)`,
`assert(condition, message, actual?, expected?)`, `own(cleanup)`, `signal`,
`parameters`, `log`, and a managed `environment`. Tests MUST explicitly await
steps; returning with unfinished steps MUST NOT produce a passed result. `environment.node(module, parameters?)` and `.browser(...)` load saved
node modules exporting `labNode(context)`, with named exported operations
available through the returned node's `call`. Node contexts own cleanup and
provide Remote Owner and Transport observation. Service implementations remain
developer code using the existing public Remote descriptors, adapters and APIs.
No platform control may redefine Remote semantics.

## Editor, conflicts and source versions

**EXAMPLE-LAB-PLATFORM-EDIT-001 — Persistent multi-file editing.** Each file MUST
have a stable Monaco model during its open project session. Switching or closing
a tab MUST retain the model, draft, undo history and cursor/selection/view state.
Project diagnostics, completions and definition navigation MUST use all current
source buffers, project configuration, available dependency declarations and the
Lab SDK. With no explicit ambient type controls, Node declarations MUST be
available from the project or platform; explicit project `types` and `typeRoots`
(including empty arrays) MUST be respected. Language errors, runtime errors and assertion failures MUST be distinct.
Dependency navigation MUST be read-only and limited to resolved language targets.

Edits MUST automatically save to the local project using the last observed file
revision. Failed saves MUST retain the draft and offer retry. A changed or
removed disk file MUST produce an explicit conflict containing the draft and
current disk content, including a missing-file state. Resolving a conflict MUST
require choosing the disk version or explicitly saving against its current
revision. The editor MUST NOT silently replace either side. Run MUST flush
pending saves and reject unresolved conflicts or save errors. Saved revisions
MUST be checked again when accepting a run. Editing and diagnostics MUST NOT
implicitly start execution.

**EXAMPLE-LAB-PLATFORM-SNAPSHOT-001 — Fixed project source.** Run admission MUST
capture all saved project source, including imported helpers, configuration and
binary resources. Loading, compilation and execution MUST use this snapshot.
A file changing while capture is in progress MUST reject admission rather than
produce a mixed or partial snapshot. Source symlinks and statically identifiable local imports escaping the
project source boundary MUST be rejected; installed dependencies remain external.
The supplied SDK MUST only be accepted as an erased type-only import/reexport
when it resolves outside the project; it cannot provide an executable escape.
This source-version boundary is not an arbitrary filesystem sandbox: explicit
Node filesystem access and dynamically chosen external dependencies remain
external effects.
Project snapshots exclude `.git`, `node_modules` and `.remote-lab` and are limited
to 16 MiB by default. Exceeding this limit MUST reject admission explicitly.

History MUST retain the actual entry, source contents/revisions, parameters,
environment and resolved dependency version metadata. History navigation MUST
show the original source read-only. A rerun MUST take a new snapshot of the
current saved project and create a new execution; it MUST NOT execute archived
source or silently select a different entry when the current entry is unavailable.
External dependency trees and external world state are not archived.

## Execution ownership and isolation

**EXAMPLE-LAB-PLATFORM-ENVIRONMENT-001 — Actual Node and Chromium.** The platform
MUST own real Node subprocesses and a real Chromium browser, support Browser–Node,
Node–Node and multiple Peer topologies, and collect actual execution/Transport
observations. Transport records MUST retain exact observed payload bytes, sent or
received direction, and local send admission/failure without implying delivery.
Connection, Peer and Owner identities MUST remain stable within their node scope
across adapter replacement; lifecycle records MUST be detached from mutable state.
A Node WebSocket implementation labelled Browser is insufficient.
The workbench and control service MUST execute independently from all user module
loading and case/node execution. Browser execution MUST support actual DOM APIs.
CLI tests MUST use the same managed environments as the workbench.

**EXAMPLE-LAB-PLATFORM-OWNERSHIP-001 — Project-held shared run.** One project
service MUST own at most one active run. Starting, running, paused and retained
failure states occupy that slot. Concurrent and repeated starts MUST return the
same run without queueing another. Multiple pages MUST observe/control that run.
Automatic tests MUST continue without pages; opening a page MUST reconnect to
the current run without starting it again.

Pages heartbeat every 2 seconds; the default page lease is 6 seconds. After the
last lease expires or page disconnects, debug execution MUST be retained for
30 seconds by default, then stopped and persisted. Reconnection during that
window MUST keep the same run. These limits MUST be visible to users and can be
shortened by test assembly. The service MUST reclaim only its own run resources.

**EXAMPLE-LAB-PLATFORM-ISOLATION-001 — Bounded Stop with evidence.** Stop MUST
immediately enter `stopping`, signal cooperative cancellation and prevent new
case scheduling. After a default 1500 ms grace, unresponsive execution MUST be
terminated through its owned process group. Chromium MUST be closable by the
control service even when user code cannot receive messages. Browser startup is
bounded by 15 seconds; shutdown and forced cleanup must retain their actual
outcome. Independent projects and external resources MUST NOT be killed.

Termination MUST distinguish pending, normal, forced, unexpected exit and unknown; cleanup MUST
distinguish pending, complete, failed and unknown. A process kill confirms owned
process termination, not application rollback or cleanup of arbitrary external
effects. Unknown termination/cleanup MUST NOT be presented as success. Previously
received evidence MUST survive forced termination. Editing, control requests and
history reads MUST remain responsive while a case loops forever.

## Debugging and trustworthy results

**EXAMPLE-LAB-PLATFORM-DEBUG-001 — Step boundaries and real clocks.** Debug mode
MUST pause before the first explicit step. Next executes one step and pauses at
the next boundary; Continue releases boundary pauses; Pause requests a future
boundary, without promising arbitrary statement interruption. Source positions,
step state, assertions and records MUST share the run/step context.

Manual paused time MUST be excluded from the case execution budget. Time spent
running remains chargeable, including a hung import or handler. Terminal events
MUST recheck the budget so a sub-poll-interval timeout cannot pass. RPC, background
handlers, streams and real recovery deadlines MUST continue during a pause.
Automatic failure MUST clean up; debug failure MUST retain surviving environments
for observation until Stop, rerun or the disconnected-page retention deadline.
A responsive debug timeout MUST fail and retain surviving nodes; if execution
cannot acknowledge the timeout within the Stop grace, the service MUST apply
bounded forced termination.
A failed step MUST NOT be resumed as if the thrown statement could continue.
Canceled RPC callers MUST retain their terminal outcome even if handlers finish.

**EXAMPLE-LAB-PLATFORM-RESULT-001 — Execution is not verification.** A case MUST
be passed only after actual assertions execute successfully. Reaching the end,
logging or connecting without assertions MUST yield `unverified` (UI:
"Execution complete, unverified"). A run MUST pass only if every selected case passes, required
evidence is available, termination is normal and cleanup is complete. Failed,
unverified, interrupted, not-run and cleanup/infrastructure faults MUST NOT make
a batch successful. Ordinary assertion failures MAY continue to later cases after
successful cleanup. Infrastructure, association and cleanup faults MUST stop
further scheduling. Result, step outcome, termination and cleanup MUST remain
separate fields; failure must not erase already completed case evidence.

**EXAMPLE-LAB-PLATFORM-CLI-001 — Shared CI semantics.** `pnpm lab` in the Lab
workspace MUST accept `--project`, repeatable `--case`, JSON `--parameters`,
`--json` and `--output`. Without explicit cases it selects the saved project cases.
`--url` connects to the running workbench's project service. Standalone execution
MUST require no workbench page. Exit status is 0 only for a passed complete run,
1 for an unsuccessful run and 2 for command/admission failure. CLI and UI MUST
use the same case format, execution environment, assertion and cleanup policy.

## History and workbench

**EXAMPLE-LAB-PLATFORM-HISTORY-001 — Bounded local persistence.** History MUST
survive project-service restart and allow explicit deletion. Defaults are 30 runs
and 64 MiB per project. Active evidence MUST be persisted during execution, not
only after a successful finish. Records recovered without confirmed termination
MUST become interrupted with unknown termination/cleanup, never passed or live.
History is evidence and MUST NOT recreate running resources.

Record collection defaults to 3000 events and 8 MiB per run. Transport/log
truncation MUST be marked visibly; loss of required assertion or execution
evidence MUST make the run an error and stop execution. A single oversize event
MUST be bounded at the execution boundary. History eviction MUST remove oldest
eligible finished records without modifying retained verdicts. An oversize source
or essential report that cannot be retained MUST fail explicitly. Deletion of an
active run MUST be rejected until its resources are stopped.

**EXAMPLE-LAB-PLATFORM-WORKBENCH-001 — One observation context.** The primary
workbench MUST center multi-file source editing within an activity rail, a left
sidebar, an optional right run inspector, an optional bottom observation panel
and a persistent run status bar. The activity rail MUST offer Explorer, Testing
and History with accessible names and selected state. Explorer is initially
selected and contains project opening/switching, project files and file creation;
Testing contains reusable cases and JSON run parameters; History contains the
active run and persisted runs. Switching activities MUST preserve the mounted
editor, current source and selected run. The compact source toolbar MUST retain
the selected case and test/debug actions.
In the compact layout, the case selector MUST occupy its own toolbar row so run
buttons do not squeeze the selected target into an unreadable control.

Opening a current `.case.ts` file from Explorer, an editor tab, Testing or the
case selector MUST make that file the target of both test and debug actions.
Opening a supporting file MUST preserve the selected case. The selected file
MUST be visibly highlighted. Historical source navigation MUST NOT replace the
current run target. Test All MUST continue to select all current project cases;
Rerun MUST use the observed run's original case selection with current saved code.

The run inspector contains execution steps, assertions and pause/next/continue/
stop/rerun controls. The observation panel contains real data flow, logs and Owner
observations. Both panels MUST initially be closed and have keyboard-operable
toggles exposing actual visible state. On desktop, a new active run, a change of
observed run, or a transition into paused, retained, failed or error MUST reveal
both panels.
Routine polling and additional records for the same run/state MUST NOT reopen
panels manually hidden by the user. Focusing the editor MUST close both panels
without changing execution. The status bar MUST continue to identify the observed
run and its execution state/result while panels are hidden. If a different run
becomes active while history remains selected, the workbench MUST reveal the
inspection controls and provide an explicit action to observe the active run
without replacing the selected historical snapshot implicitly.

Selection of a run or step MUST filter related evidence and navigate to its
original source; selection MUST NOT implicitly run code. Selecting persisted
history MUST reveal both desktop panels and a clearly marked read-only source
snapshot.
Returning to current source MUST restore editable project source; rerunning MUST
continue to use current saved code. Controls and resizable separators MUST
support keyboard use, accessible names, independent scrolling and narrow screens
without document overflow. At widths up to 760 pixels, accessible pane navigation
MUST preserve mounted editor models, undo history and the shared observation
context. In this compact layout, new active runs and paused/retained/failure
transitions MUST select the execution pane; historical source navigation MUST
show the snapshot with the other panes accessible through navigation. A panel
toggle MUST open its pane with one activation after returning to source, and its
expanded state MUST reflect the visible pane. Untrusted source, logs and results
MUST render as text.

The project/editor, source/inspector and editor/evidence splits MUST use the
bundled Monaco `SplitView` engine: each axis owns a `split-view-container`,
absolutely positioned `split-view-view` wrappers, stable `split-view` content
roots and overlay sashes. Sashes MUST NOT consume a 5px layout gutter. Pointer
dragging and axis-appropriate arrow keys MUST resize within pane minimum sizes;
Home/End MUST clamp to those limits and double-click MUST restore the default
split. Hiding/revealing panels and switching compact panes MUST preserve the
mounted React contents, editor models and the last manually chosen split ratio.
Container resizing MUST relayout visible panes without gaps or document overflow.
The Atom Material dark workbench MUST reproduce the reference's floating pane
frames: 1px solid `#333d42` borders, 8px outer corners and 4px canvas insets
between independent panes and at the window's left, right and bottom edges.
The activity bar and visible sidebar MUST share one outline with square joining
corners and a transparent sidebar left border; their bottom edges MUST align
with the editor/observation area. The exposed canvas MUST be `#23292d`.
Pane contents MUST clip to their rounded frames, without adding a second status
bar border. These insets belong inside native split views and MUST NOT change
the native sash hit areas or mount/unmount pane contents.
Revealing a pane MUST finish its layout before focusing its controls; asynchronous
editor loading MUST NOT steal focus from an active form field or native select.

Only visible, usable panel separators MUST intercept resize gestures or display
resize cursors. Hidden panels and compact pane navigation MUST NOT leave active
resize targets over the header, controls or editor. Theme selection MUST work
through ordinary pointer and keyboard interaction, including after resizing or
hiding a panel.

The header MUST reproduce the reference VS Code `titlebar-container.has-center`
geometry: 35px high, left/center/right regions with a 2px vertical content offset,
10px center margins, and a 24px high project control sized to 38vw (maximum 600px).
Navigation and layout controls MUST be 22px with 16px locally bundled Codicons,
4px spacing and 4px hover corners. The centered project name MUST reveal Explorer
and focus the local project input; its count MUST reflect the displayed project
files. Previous/next controls MUST navigate adjacent visible open source tabs and
disable at either end. The compact theme control MUST retain the native accessible
system/light/dark selector. The right toolbar MUST retain editor focus, observation
and inspector actions and provide a primary sidebar toggle. Hiding the sidebar
MUST disable its separator and preserve mounted state; Explorer and compact
project navigation MUST reopen it. At widths up to 760px the center MUST flex to
leave every titlebar control visible without horizontal document overflow. Native
window controls and VS Code-specific agent actions are outside this web titlebar.

The shell and Monaco MUST share a Material UI-inspired light/dark palette. The
dark palette MUST follow the Atom Material visual language: blue-grey editor and
panel surfaces, a teal active accent, compact separators and syntax colors for
comments, keywords, strings, numbers and functions. An accessible theme
selector MUST offer system, light and dark; system is the default and follows
live system preference changes. An explicit light/dark
selection MUST override system changes. The choice MUST persist across reloads in
the same browser, including a return to system mode. Changing theme MUST preserve
the mounted editor, current edits and undo history.

Projects, Explorer files and Testing cases MUST use locally bundled
Material Icon Theme icons with consistent file associations: `.case.ts` uses a
test icon, TypeScript source uses its language icon, and projects use folder
icons. File labels and selected state MUST remain available independently of
the decorative icons, which MUST NOT add redundant accessible names. Upstream
icon attribution and license MUST accompany the bundled assets.

Editor tabs MUST reproduce the reference VS Code `monaco-icon-label` layout:
32px outer tabs with 4px vertical insets, a 24px rounded fill inset 2px horizontally,
13px normal-weight labels with 24px line height, and a 16px decorative file icon
followed by 6px spacing. Tab labels MUST use the nested label/name containers,
normal letter spacing, and locally bundled vscode-icons assets matching the
reference (TypeScript test/case, source, React source and a generic fallback).
In dark mode the active fill MUST be `#2c383d`, active text `#dff5f3`, inactive
text 50% `#cccccc`, and hovered inactive text `#a7b6b8`. No teal underline or
generic selected-button background may override this modern tab appearance.
The 24px action slot MUST contain a 20px close control with a 16px Codicon
close-small glyph, shown on active, hovered or keyboard-focused tabs without
changing their width. Activating and closing tabs MUST preserve the existing
document/model behavior; overflowing tabs MUST scroll without wrapping, and
newly activated tabs MUST be revealed. File paths remain available as titles;
tab and close controls retain independent accessible names and keyboard input.

The old fixed demonstration workbench remains available only at `/legacy` for
regression and comparison. Its [legacy contracts](LEGACY-DEMO.md) retain actual
Remote observation and demonstration behavior; their fixed manifest, page-owned
execution, independent panel workflow and process-only history do not govern the
new platform. The normal entry is the developer workbench, and built-in examples
are TypeScript project cases. Remote protocol and public package behavior remain
unchanged.
