# Remote Lab Uses Platform-Defined TypeScript Cases

Status: accepted

Remote Lab uses TypeScript case modules stored in the local project. The same
case is used for step debugging and automatic execution, while the platform owns
observation and lifecycle management for the local test environment. To keep
test steps, RPC data flow, assertions, and resource cleanup inside one
controllable execution, the first version uses a platform-defined case
interface. Existing Vitest or Playwright scenarios can extract shared test bodies
for adaptation, but Remote Lab does not promise to load arbitrary original runner
entrypoints directly. This tradeoff accepts case adaptation work in exchange for
a complete debugging and test workflow.

The case API is determined by implementation. Execution isolation boundaries are
defined in [ADR 0002](0002-remote-lab-execution-isolation.md). This ADR records
the accepted architectural direction; it does not claim that implementation is
complete.
