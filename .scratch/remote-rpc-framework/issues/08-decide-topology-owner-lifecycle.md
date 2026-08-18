# 决定 Topology Owner 启动、资源所有权与可发现状态

Type: grilling
Status: resolved
Blocked by: 01, 07
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

`RpcConnector` 与 `RpcAcceptor` 应如何启动并拥有 Adapter、listener、Physical Connection、retained Logical Session 与 borrowed external resource，同时让 `RpcPeer` 只负责双向 `expose()` / `resolve()`？决定重复或并发 `connect()` / `listen()`、startup failure/retry、replacement handoff、自然与 fatal terminal、subscriber exception 和事件调度；并定义最小 current/sticky state surface 及其与 event/membership mutation 的一致性，使零订阅或晚订阅 caller 仍能发现 Recovery need、当前 membership 与 terminal reason，而不依赖可能错过的 hot/no-replay event。Session-specific transition/reason 由 Session ticket 投影到该 surface；在途调用结算、grace deadline、timeout 与 Protocol 层 shutdown wire choreography 则分别由 call/resource/shutdown tickets 决定。

## Answer

Topology Owner 采用 cold factory、显式 role verb、单一有效 startup operation 和最小故障范围。
Transport Adapter 只负责产生并交接 Physical Connection 或维持 listener；Topology Owner
负责 handoff 后的 Connection、retained Logical Session 与 Protocol runtime。当前状态由同步
snapshot 与 replay-latest state stream 共同表达，发生过程由独立的 hot/no-replay event stream
表达，两者不能互相替代。

### Ownership 与 startup

- `RpcConnector` 不拥有 Connector Adapter。它只在 Adapter 的 `connection$` handoff barrier
  后拥有 Physical Connection；Adapter 仍负责清理未交接的半开或 late Connection。
- `RpcAcceptor` 不取得 Adapter value 或 borrowed external resource 的 disposal authority。它通过
  Framework 提供的 lifetime `AbortSignal` 控制 listener，并拥有 Adapter 已交接的每条 Physical
  Connection。Adapter 释放自身 listener resources，但不得关闭明确借用的 HTTP Server 等外部
  resource。
- 两种 Owner 都拥有各自的 Protocol runtime、retained Logical Sessions、session-scoped state 与
  Connections。订阅、退订和持有引用都不建立或释放 ownership。
- Connector 同时最多有一个 `connect(adapter)`。只有稳定 peer 尚未建立可用 Connection，或其
  Session 明确需要 Recovery 时才能调用；并发调用或健康连接期间的调用在观察、订阅或启动传入
  Adapter 前 reject，因此这个一次性 Adapter 仍可由 caller 处置。
- Acceptor 同时最多有一个 starting 或 ready listener。并发或 ready 期间的 `listen(adapter)` 同样
  在接触 Adapter 前 reject。startup failure、listener 正常终止或 listener failure 后，可用 fresh
  Adapter 再次 `listen()`；已交接 peers 和 Connections 各自继续、Recovery 或终止，不因 listener
  terminal 自动关闭。
- Adapter-level `connect(signal)` 只在一条 Physical Connection 完成交接后 fulfill；Owner-level
  `RpcConnector.connect(adapter)` 必须继续等待 Protocol 将该 Connection 成功绑定为 fresh 或
  resumed Logical Session。Transport startup、Handshake、profile 或 Session admission 失败都会
  reject Owner operation，并直接关闭未采用的 Connection；caller 随后可以用 fresh Adapter 重试。
- Adapter-level与 Owner-level `listen()` 都只等待 listener ready，不等待已接受 Connections 的
  Protocol admission。ready 前已完成 handoff 的 Connections 已独立归 Acceptor；listener startup
  后续失败不能撤销 handoff，也不能让这些 Connections 自动失败。

### Failure scope、terminal 与 close

- Connection terminal 只影响其绑定或正在绑定的 Session；listener terminal 只停止未来
  acceptance；Acceptor 中的 Session fault 只终止对应 peer。只有 shared owner runtime/startup
  fault 才终止整个 Acceptor。Connector 只有一个 Session，所以 fatal Session fault 可以终止其
  topology。
- `close()` 有唯一线性化点：同步提交 Owner `closing` state，禁止并在接触 Adapter 前拒绝新的
  `connect()` / `listen()`，并 abort 未完成的 Adapter startup。尚未成功的 Owner operation reject
  `AbortError`；handoff 已完成的 Connection 属于 Owner teardown；违反契约的 late Connection 仍由
  Adapter 关闭。
- `close()` 是幂等 cleanup barrier，等待所有 owned resources 在本地收敛。先前的运行故障不令
  `close()` reject；资源成功释放即 fulfill。只有 cleanup 本身失败才 reject，重复调用观察同一
  cleanup outcome。grace、in-flight call settlement、deadline 与 Protocol shutdown choreography
  仍由 call/resource/shutdown tickets 决定。
- Owner 的 final state 和唯一 terminal event 区分 normal/failed topology outcome。State streams
  发出 final snapshot 后 complete；`event$` 发出唯一 topology terminal event 后 complete 且永不
  error。Replay-latest state streams 的 late subscriber 仍收到 final snapshot 后再观察 complete。

### Current state surfaces

每个 snapshot 都是 immutable value。一次已提交 mutation 产生一个 fresh snapshot；在下一次
mutation 前，同步 getter 保持相同 object identity，对应 stream 发出的也是同一 object。所有
state streams 都是只读、multicast、replay latest，并在每次变化时发出完整 snapshot；零订阅不
影响资源，晚订阅立即得到当前值。

- `RpcConnector` 提供 `state` / `state$`，只表达 Owner 的 `active | closing | closed` lifecycle；
  final `closed` snapshot 保存 topology outcome/reason。
- `RpcAcceptor` 提供 `state` / `state$`。它同样表达 Owner lifecycle；active snapshot 还包含
  listener 的 `idle | starting | listening | stopped` state。`stopped` 保存 listener normal/failed
  outcome 和 Error，直到下一次 `listen()` 开始或 Owner 关闭。
- `RpcAcceptor` 提供 `peers` / `peers$` plain peer snapshots。`peers$` replay current 完整数组，
  membership mutation 与同步 getter 在通知前原子提交。
- 每个稳定 `RpcPeer` 提供自己的 `state` / `state$`，使 caller 即使在 peer 从 Acceptor membership
  移除后仍能读取 final Session reason。Connector 的 unbound、connecting、connected、recovering
  等状态只属于其稳定 peer，不在 Owner state 重复。精确 Session variants、transition 和 reason
  由 Logical Session ticket 决定。

因此早期“`RpcPeer` 只有 `expose()` / `resolve()`”与“Topology Owner 只有 `close()` / `event$`”的
prototype 最小形态被本票有意深化：新增的 state pairs 不是另一套 ownership control，而是
hot/no-replay events 无法回答 current/sticky state 后证明必要的 observation surface。

### Event、diagnostics 与一致性

- Owner-level `event$` 是 hot、multicast、no-replay 的结构化发生过程，覆盖 lifecycle、Session、
  call 与 fault observations，并提供 local correlation identity；peer 已知时事件携带稳定 peer。
  它服务业务日志、Tracing、Metrics 与异常因果分析，但不是当前状态的权威来源。
- `event$` 只公开跨 Protocol 稳定的 normalized semantics。Handshake、frame kind、sequence、ACK、
  replay proof 或 raw bytes 等 wire diagnostics 由具体 Protocol 以 opt-in facility 提供，并通过
  correlation identity 与 Framework events 关联；通用 Interface 不固化某个 Protocol 的 message
  shape，也不默认记录敏感 payload。
- 一次 transition 先原子提交全部相关同步 snapshots，再同步发出 changed state/membership streams，
  最后发出对应 `event$` notifications；operation Promise 只能在该 notification batch 后 settle。
  Subscriber 内发起的 Owner mutation 排在当前 batch 之后，因此 reentrancy 不会打乱因果顺序。
- Subscriber throw 不能改变已提交 state、终止 RPC、阻止其他 subscribers 或改变 operation
  outcome；它只进入 RxJS 的 subscriber error reporting。Framework 不吞掉或转换它为 topology
  fault。
- 同一 public incident 只规范化一次 Error。Operation rejection、sticky state reason 与 event
  复用同一 Error object identity，Adapter/Protocol 的原始 Error 保存在 `cause`；精确 public
  `RpcError` taxonomy 由后续 error ticket 确定。
