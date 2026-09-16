# Remote Lab

A local developer workbench for TypeScript cases that exercise Remote library
behavior and application services. One saved case runs in the editor debugger,
automatic tests and CI, with actual Node processes and Chromium execution.

From the repository root:

```sh
pnpm install
pnpm build
pnpm --filter @husky-di/example-remote-lab exec playwright install chromium
pnpm --filter @husky-di/example-remote-lab start
```

Open the printed workbench address (normally `http://127.0.0.1:5173`). The left
tree initially opens `examples/remote-lab/cases`; enter a local project directory
to open your own files. `LAB_RPC_PORT` and `LAB_WEB_PORT` override listener ports,
including `0` for dynamically assigned ports.

Use the activity rail to switch between Explorer (projects and files), Testing
(cases and JSON parameters), and History (runs and source snapshots). The run
inspector and observation panel open when execution needs attention; the header
buttons also toggle them. Return to editing with the code icon while keeping the
observed run visible in the status bar. Narrow screens use pane navigation.
The Material theme uses locally bundled [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)
file and folder icons. It follows the system by default; choose light or dark in
the header to keep that preference across reloads. Monaco changes with the shell
without losing edits or undo history. Resize cursors appear only on available
panel dividers.

Opening a `.case.ts` file in Explorer or an editor tab selects it for both Run
Test and Debug. Opening a helper file keeps the last selected case. Test All runs
all project cases; Rerun repeats the observed run's case selection using current
saved code.

Create a `.case.ts` file. Its named `labCase` export is the reusable definition:

```ts
import type { ILabCase } from "@husky-di/example-remote-lab/sdk";

export const labCase: ILabCase = {
  title: "Saved service behavior",
  async run(context) {
    const server = await context.step("Start service", () =>
      context.environment.node("services/server.ts"),
    );
    const client = await context.step("Start real Chromium", () =>
      context.environment.browser("services/client.ts", { server: server.result }),
    );
    await context.step("Verify reply", async () => {
      const reply = await client.call("greet", "Ada");
      context.assert(reply === "Hello, Ada!", "greeting", reply, "Hello, Ada!");
    });
  },
};
```

The service files in this example are your project modules, not generated
services. Each exports `labNode(context)`, returns serializable startup data and
may export named operations that `node.call()` invokes. Use `context.own()` for
cleanup, `context.observe(owner)` for actual public Remote Owner observations,
and `context.transport(adapter)` around Remote adapters for actual sent/received
bytes. The built-in `cases/services/` modules show complete runnable examples.
Type-only SDK imports erase at runtime; projects using an IDE can reference this
workspace package's `./sdk` type export.

Debug pauses before the first explicit step. Next advances one step; Continue
releases boundary pauses; Pause requests the next boundary. RPC, streams and
recovery time continue during inspection. A failed debug step retains live
resources for inspection and requires Stop or a new run; it cannot resume from
the throw. Without any executed assertions a case reads "Execution complete,
unverified" and
never counts as a passed test.

Edits automatically save to the selected directory. IDE conflicts preserve the
draft and disk versions and require explicit resolution. Run waits for successful
saves. Each run takes a complete saved source snapshot, so later edits affect only
the next run. Selecting history opens its original source read-only. Rerun uses
current saved code and fresh environments. The race-safe save publishes only if
the observed disk revision still matches. If the control service crashes during
that atomic file exchange, `.remote-lab-save-*.previous` and a temporary draft can
remain beside the source for manual recovery; the platform does not silently
overwrite a concurrently recreated IDE file.

Run CI without opening the workbench:

```sh
pnpm --filter @husky-di/example-remote-lab lab --project ./cases --json
pnpm --filter @husky-di/example-remote-lab lab --project /path/to/project \
  --case feature.case.ts --parameters '{"input":42}' --output report.json
```

Repeat `--case` to select a batch; omitting it runs all project cases. Use
`--url http://127.0.0.1:5173` to connect to an existing workbench service. A project
is owned by one service; an independently started second service is rejected.
CLI exit status is 0 for a passed batch, 1 for an unsuccessful run, and 2 for
command/admission errors. JSON reports include the source snapshot, parameters,
versions, steps, assertions and bounded execution evidence.

Default limits are visible in the UI: 30 histories / 64 MiB per project, 16 MiB
per source snapshot, 3000 events / 8 MiB per run, 6-second page leases, a 30-second
unobserved debug retention window and a 1500 ms cooperative Stop grace. Automatic
runs continue with all pages closed. Stop can kill the owned execution process
group and independently close Chromium; result, termination and cleanup evidence
are shown separately. Killing local processes does not roll back external effects.

History is saved under each project's `.remote-lab/history`; add `.remote-lab/`
to your project's `.gitignore`. History retains source and dependency versions,
not installed dependency trees or external-world state. Reading a historical run
never recreates its live connections. Interrupted service state is recovered with
unknown cleanup, not success.

Developer validation:

```sh
pnpm check:code-standard
pnpm --filter @husky-di/example-remote-lab test
pnpm --filter @husky-di/example-remote-lab test:browser
pnpm --filter @husky-di/example-remote-lab typecheck
pnpm --filter @husky-di/example-remote-lab build:web
```

The main [specification](docs/SPECIFICATION.md) describes the platform contract.
The previous fixed demonstration view is available at `/legacy` for regression;
it is separate from developer cases, and its old Playwright tests remain platform
development tests rather than managed cases.
