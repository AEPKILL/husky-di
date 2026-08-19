# VS Code RPC / IPC 可借鉴边界

## Scope

- Primary source: local checkout `/Users/aepkill/repos/vscode`.
- Fixed revision: `f489b728ba96a9a31351e25658adf0e2b6325f3a`.
- Examined systems: generic Channel IPC, extension-host `RPCProtocol`, remote
  `PersistentProtocol`, remote reconnection, shutdown, and event error delivery.
- All findings below are implementation facts unless explicitly marked as an inference.

## Findings

### Proxy objects must not expose `then`

`ProxyChannel.toService()` returns `undefined` for property `then`, with an explicit comment
that otherwise `await` would assimilate the proxy and never settle. Its test covers direct
property access, async return, and `await` of the service proxy.

- [`ipc.ts:1235`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1235)
- [`ipc.test.ts:531`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:531)

The extension-host proxy avoids the same hazard by only synthesizing methods whose names begin
with `$`; all other names, including `then`, fall through to an object with a null prototype.

- [`rpcProtocol.ts:249`](/Users/aepkill/repos/vscode/src/vs/workbench/services/extensions/common/rpcProtocol.ts:249)

**Adopt:** reserve `then` across descriptor typing, runtime validation, wire method grammar, and
both single-peer and group proxies. Test `Promise.resolve(proxy)`, async return, and `await proxy`.

### Validate and serialize before committing request identity

The extension-host RPC implementation rejects a pre-canceled request and serializes arguments
before incrementing its request id and installing the pending reply. Generic Channel IPC catches
synchronous serialization/send failure and removes its just-installed response handler.

- [`rpcProtocol.ts:461`](/Users/aepkill/repos/vscode/src/vs/workbench/services/extensions/common/rpcProtocol.ts:461)
- [`ipc.ts:580`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:580)

Disposal rejects all outstanding extension-host replies and removes them from the pending map.

- [`rpcProtocol.ts:162`](/Users/aepkill/repos/vscode/src/vs/workbench/services/extensions/common/rpcProtocol.ts:162)

**Adopt:** all fallible value, encoding, and resource checks must finish before Outgoing Call
Admission. The Adapter hard limit must share a guaranteed envelope with the Protocol, otherwise a
locally valid record can become an unreplayable poison entry after identity commit.

**Do not copy:** VS Code does not retain our Session-scoped call ledger or promise our
at-most-once dispatch semantics, so its request-id lifecycle is evidence for ordering, not a full
delivery state machine.

### Recovery is a transport-level cumulative-ACK protocol

`PersistentProtocol` stores outgoing unacknowledged messages, assigns direction-local increasing
message ids, piggybacks cumulative ACKs, suppresses old ids, asks for replay on a gap, and replays
all retained unacknowledged records when a replacement socket is accepted.

- [`ipc.net.ts:952`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:952)
- [`ipc.net.ts:974`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:974)
- [`ipc.net.ts:995`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:995)
- [`ipc.net.ts:1077`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:1077)

During socket replacement it first detaches and disposes the old socket machinery, installs the
new socket, then sends its current ACK and the retained queue. New messages may be queued while
reconnecting and are not considered written for timeout purposes.

- [`ipc.net.ts:952`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:952)
- [`ipc.net.test.ts:335`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/node/ipc.net.test.ts:335)

**Adopt:** replacement must fence old connection callbacks; replay identity and semantic payload
remain stable; current reverse-direction ACK belongs to the per-attempt envelope rather than to
the immutable semantic replay payload.

**Do not copy:** this queue is not visibly bounded and the protocol has no terminal call ledger,
resource admission profile, Session proof, or application-level outcome-unknown boundary. The
Husky protocol must supply those separately.

### Detect half-open connections with activity, not only failed sends

VS Code sends keepalive records every five seconds and regards twenty seconds without incoming
data as a timeout. Separately, an unacknowledged message times out only if both the message age and
time since any incoming data exceed twenty seconds; high event-loop load suppresses the verdict.

- [`ipc.net.ts:289`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:289)
- [`ipc.net.ts:1123`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:1123)
- [`ipc.net.ts:1180`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:1180)
- [`ipc.net.test.ts:531`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/node/ipc.net.test.ts:531)

Both socket close and socket timeout start one reconnect loop. The loop emits loss/wait/running/
gain events, retries transient connection failures, and stops at a configurable grace deadline.

- [`remoteAgentConnection.ts:580`](/Users/aepkill/repos/vscode/src/vs/platform/remote/common/remoteAgentConnection.ts:580)
- [`remoteAgentConnection.ts:628`](/Users/aepkill/repos/vscode/src/vs/platform/remote/common/remoteAgentConnection.ts:628)

**Adopt:** the default Protocol needs activity probes and a finite silence timeout so an idle
black-hole connection can become recoverable. A retained Session also needs a finite recovery
deadline. Exact VS Code durations are product tuning inputs, not protocol truths.

### Reconnection replaces an apparently live socket

The client passes its existing `PersistentProtocol` into a new authenticated connection attempt,
then calls `beginAcceptReconnection()` before the handshake and `endAcceptReconnection()` only
after the server accepts it. The server locates retained state by reconnection token and lets the
existing connection object replace its socket.

- [`remoteAgentConnection.ts:225`](/Users/aepkill/repos/vscode/src/vs/platform/remote/common/remoteAgentConnection.ts:225)
- [`remoteAgentConnection.ts:320`](/Users/aepkill/repos/vscode/src/vs/platform/remote/common/remoteAgentConnection.ts:320)
- [`remoteExtensionHostAgentServer.ts:419`](/Users/aepkill/repos/vscode/src/vs/server/node/remoteExtensionHostAgentServer.ts:419)
- [`remoteExtensionManagement.ts:120`](/Users/aepkill/repos/vscode/src/vs/server/node/remoteExtensionManagement.ts:120)

**Adopt:** a legitimate resume may replace a binding that still looks connected. The public
Connector must therefore either allow a recovery attempt after Protocol health failure or own an
internal reconnect factory; a state machine triggered only by Adapter terminal is incomplete.

### Reconnection token is not the whole authentication story

Before connection-type selection, the VS Code remote handshake sends an authentication value and
per-attempt signed challenge/response. Only then does the server use the reconnection token to
select retained connection state. Unknown and duplicate tokens are rejected.

- [`remoteAgentConnection.ts:252`](/Users/aepkill/repos/vscode/src/vs/platform/remote/common/remoteAgentConnection.ts:252)
- [`remoteAgentConnection.ts:273`](/Users/aepkill/repos/vscode/src/vs/platform/remote/common/remoteAgentConnection.ts:273)
- [`remoteExtensionHostAgentServer.ts:419`](/Users/aepkill/repos/vscode/src/vs/server/node/remoteExtensionHostAgentServer.ts:419)

**Inference:** the opaque token is safe only inside that larger authenticated handshake and trust
model. It is not evidence that a public session id alone is resume authority.

**Adopt:** Husky's resume proof must bind role, profile, session id, exact cursors, binding epoch,
and fresh handshake transcript. Active-session ACK integrity must have the same authenticated
channel protection because forged ACKs can release replay and terminal evidence.

### Shutdown notification is best-effort and one-way

`sendDisconnect()` writes and flushes one control record at most once; cleanup then disposes the
protocol and ends the socket. It does not wait for a peer ACK.

- [`ipc.net.ts:921`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.net.ts:921)
- [`remoteExtensionManagement.ts:103`](/Users/aepkill/repos/vscode/src/vs/server/node/remoteExtensionManagement.ts:103)

**Adopt:** one-way Session-close may improve prompt remote cleanup, but local convergence must not
depend on its admission. A finite shutdown deadline must be allowed to skip or abandon that send
and directly close the connection, which also breaks an indefinitely pending ordinary send.

### Listener isolation does not guarantee process survival

VS Code's emitter catches a listener exception and routes it to an error handler, so delivery can
continue to other listeners. Its default unexpected-error handler later throws on a timer.

- [`event.ts:1379`](/Users/aepkill/repos/vscode/src/vs/base/common/event.ts:1379)
- [`errors.ts:19`](/Users/aepkill/repos/vscode/src/vs/base/common/errors.ts:19)

RxJS has an analogous host-reporting boundary. **Adopt:** specify that listener failure cannot
roll back committed RPC state, interrupt the current framework notification batch, or rewrite an
operation outcome. Do not promise that the host process survives an unhandled subscriber error,
and do not mutate global RxJS error configuration.

## Resulting design constraints

1. Reserve `then` at type, runtime, and wire layers.
2. Finish every fallible preflight before call/sequence identity commit.
3. Retain immutable `seq + semantic message`; encode the current ACK in a fresh send envelope.
4. Define a cross-seam maximum message invariant before invoking an Adapter.
5. Detect silent half-open connections and permit authenticated replacement of a live-looking
   binding.
6. Reject a resume cursor that conflicts with already-proven retained receipt; accepting a lower
   cursor without a verifiable effective cursor cannot establish continuity.
7. Authenticate both recovery proofs and active-session ACKs.
8. Make shutdown notification best-effort under a finite local convergence deadline.
9. Limit subscriber guarantees to framework state and batch isolation, not host-process survival.

