# ADR-0004: Externalize RpcConnector Reconnection

## Status

Accepted

## Context

The RPC Protocol already retains a Logical Session across Physical Connection
loss. Applications currently observe `peer-recovering`, create another
single-use Connector Adapter, and ask the Connector to make one replacement
connection attempt.

Putting retry count, delay scheduling, attempt telemetry, policy opt-out, and
retry lifecycle directly into `RpcConnector` mixes application connection
orchestration with ownership of the one-to-one RPC topology. It also makes a
single-attempt `connect()` method compete with an implicit background lifecycle.

## Decision

Keep `RpcConnector` responsible for exactly one caller-requested connection
attempt at a time. Change its method to accept an extensible options record:

```typescript
type RpcConnectorConnectOptions = {
	readonly adapter: IRpcConnectorAdapter;
	readonly signal?: AbortSignal;
};

connector.connect({ adapter, signal });
```

The optional `AbortSignal` is a general connection-attempt cancellation seam,
not a reconnection policy. It lets an external owner bound Adapter startup and
Protocol binding without teaching the Connector about retry schedules. An
already-aborted signal prevents the attempt from touching the Adapter. A later
abort cancels only the unsettled attempt. It has no effect after the binding has
succeeded and never closes the Connector or an established Physical Connection.

Provide RPC Connector Reconnection as an opt-in external supervisor created by
`createRpcConnectorReconnection()`. Its public contract is
`IRpcConnectorReconnection`. The factory receives an `IRpcConnector`, a
Connector Adapter Factory, and an optional Connector Reconnection Policy. The
supervisor exposes both its own lifecycle state and the supplied Connector:

```typescript
const reconnection = createRpcConnectorReconnection({
	connector,
	adapterFactory,
	policy: {
		retryDelaysMs,
		attemptTimeoutMs,
	},
});
```

`IRpcConnectorReconnection.connect()` owns the initial connection attempt. An
initial failure rejects that task and does not retry. After the first binding
succeeds, the supervisor observes Session Recovery and schedules replacement
attempts through the Connector. The supervisor is single-use: `connect()` is
accepted exactly once, and its Promise covers only the initial connection. An
initial failure terminates the supervisor; after initial success, recovery work
continues in the background.

The supervisor exposes the exact supplied Connector as
`readonly connector: IRpcConnector`. While the supervisor is active, it owns the
Connector's connection-attempt authority. A caller that wants to make a direct
attempt must first stop the supervisor. `stop()` is asynchronous, idempotent,
and terminal, and repeated calls return the same Promise. It cancels any
scheduled or unsettled attempt through the same `AbortSignal` seam and waits for
that attempt to release its authority, but it does not call
`connector.shutdown()` or `connector.close()`.

The initial policy uses an exact finite `retryDelaysMs` sequence plus an
end-to-end `attemptTimeoutMs`. Recovery starts one immediate replacement attempt;
each delay authorizes one later retry after the preceding attempt settles. The
sequence may contain zero, contains at most 64 non-negative safe integers, and
restarts from attempt one for each Recovery episode. The default is:

```typescript
[1_000, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 60_000, 60_000]
```

The attempt timeout defaults to 30 seconds. It applies only to replacement
attempts, covers Adapter startup, Connection handoff, and Protocol binding, and
never extends the Protocol's absolute Recovery Retention. The initial attempt
is governed by the caller awaiting `connect()`. Exhausting the delay sequence
stops connection attempts but leaves the Logical Session recovering until an
authoritative Session outcome wins.

Reconnection state and payload-free attempt telemetry belong to the external
supervisor, not `IRpcConnector.event$`. Its replay-latest state
surface describes only orchestration and does not duplicate the supervised
Peer's authoritative connection or Session state:

```typescript
type RpcConnectorReconnectionState =
	| { readonly status: RpcStateStatusEnum.idle }
	| { readonly status: RpcStateStatusEnum.connecting }
	| { readonly status: RpcStateStatusEnum.monitoring }
	| {
			readonly status: RpcStateStatusEnum.reconnecting;
			readonly attempt: number;
	  }
	| {
			readonly status: RpcStateStatusEnum.waiting;
			readonly nextAttempt: number;
			readonly delayMs: number;
	  }
	| {
			readonly status: RpcStateStatusEnum.stopped;
			readonly reason: RpcConnectorReconnectionStopReasonEnum;
	  };
```

`state` is the synchronous snapshot. `state$` is multicast, replays the latest
state to a late subscriber, never errors, and completes after publishing the
terminal `stopped` state. Callers inspect `connector.peer.state` or subscribe to
`connector.peer.state$` for the Logical Session state. The Protocol continues
to own authenticated resume, Connection Fencing, ACK reconciliation, Request
Replay, and the authoritative Session terminal outcome.

`event$` is hot, multicast, and non-replaying. It emits only payload-free
`attempt-failed` records for background attempts, with the one-based attempt,
the `adapter-factory | connector-attempt | attempt-timeout` failure stage, and
`nextDelayMs` only when another retry is scheduled. It completes when the
supervisor stops. Terminal reasons are `requested`,
`initial-connection-failed`, `retries-exhausted`, and `connector-terminated`.

## Consequences

- Applications that need only explicit one-shot connections keep using
  `RpcConnector` directly.
- Applications opt into reconnection by creating one supervisor; retry policy is
  visible rather than an implicit Connector default.
- The same supervisor works with WebSocket and third-party Connector Adapters
  because every attempt obtains a fresh Adapter from the application Factory.
- `RpcConnector` gains only an extensible connect-options record and generic
  cancellation, while retry state, timers, policy, and telemetry remain local to
  the external module.
- The supervisor and direct callers cannot safely compete for the same
  Connector's single connection-attempt authority; manual takeover first stops
  the supervisor.
- Stopping reconnection and terminating the RPC topology are explicit,
  independent operations.
