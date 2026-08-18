# 决定 unary 调用、取消、错误与终止竞态

Type: grilling
Status: resolved
Blocked by: 04, 06, 10
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

本地 TypeScript method 应如何映射为远端 unary Promise 调用，并在正常返回、同步抛错、Promise 拒绝、caller `AbortSignal`、remote cancel、Session Recovery、owner shutdown 与 Protocol failure 同时发生时产生唯一确定的 terminal outcome？基于[决定 Call value model、identity、重放与去重](10-decide-call-delivery-state-machine.md)选定的 application value model，决定 call observation contract、handler `this`、取消注入、`RpcError` code/details、未知 service/method、definite-not-executed 与 outcome-unknown 边界、race precedence 和 late message 处理。本票唯一定义 terminal outcomes、shutdown cause 与 race precedence；[决定 Topology Owner 单向 shutdown 通知与本地收敛](18-decide-owner-shutdown-convergence.md)只决定何时、向哪些 calls 应用这些既有语义。

## Answer

远端 unary method 继续只返回 `Promise<Awaited<Result>>`；Framework 在 caller 与 responder
两侧分别维护一个唯一 terminal slot，并以 first-linearized-terminal-wins 统一正常结果、远端
failure、取消、Session terminal、owner shutdown 与 Protocol failure。公开 call error 按 caller
能否安全重试分类，而不泄漏内部 Connection、replay 或 handler 状态。

### Pending Invocation 与 Outgoing Call Admission

- 通过本地 signal shape、Application Value 与容量前置检查后，proxy invocation 创建 detached
  request snapshot、local-only `observationId` 与 **Pending Invocation**。它可以在 connected
  Session 的 send backpressure 或 retained recovering Session 中排队，但尚无 `callId`、Call
  Ordinal、message `seq` 或 replay payload，因此还不是 Logical Call。
- 一个尚未 aborted 的 caller `AbortSignal` 在 Pending Invocation 创建时注册 once listener；所有
  terminal path 都必须移除 listener。已经 aborted 的 signal 在创建 Pending Invocation 前异步
  reject `canceled`，不 snapshot application args、不占容量，也不产生 call observation。
- 当前 Physical Connection 有可用的串行 send slot 时，Framework 对队首 Pending Invocation
  再检查 cancellation、Session 与资源状态，然后在一个不可重入、无 `await`、不发 public
  notification 的临界步骤内分配 direction-local Call Ordinal/`callId` 与下一 message `seq`、创建
  immutable encoded replay entry，并调用 `IRpcConnection.send()`。这是 **Outgoing Call
  Admission**，也是 Pending Invocation 成为 Logical Call 的线性化点。
- 首次 send 前的 encoding/resource failure 不得留下已提交的 sequence gap；具体 capacity
  outcome 由资源票决定。调用 `send()` 后即使 Promise 尚未 settle 或最终 reject，Framework 也
  无法证明 bytes 未进入 Transport，因此 Call Identity 与原 call replay entry 不可撤回。
- Recovery 必须先以原 identity 重放 committed entries，再为尚存 Pending Invocations 分配新的
  identity。只有首次 Outgoing Call Admission 分配 `seq`；重放永远复用原 `seq`。取消、result
  与 error semantic intent 同样只在首次轮到 send 时分配自己的 message `seq`。
- 以上是 semantic states，不规定 Implementation 必须使用几个物理容器；一个 deque 可以同时
  保存 removable draft entries 与 immutable committed replay entries。v1 不增加 wire tombstone、
  `abandon` message 或 pre-call `cancel`，也不让发送前取消消耗 wire identity。

### Handler invocation 与正常结果

- Remote Request Admission 后，Framework 从当前 exposure 原子捕获 implementation 与 selected
  method，并以该 implementation object 作为 `this` 调用 handler。普通 unary handler 不接收
  hidden parameter；cancelable handler 获得一个 call-private `AbortController.signal` 作为精确
  required trailing argument。
- Handler 同步 return、thenable 与 Promise fulfillment 都按 `Awaited<Result>` 进入同一 result
  path。`undefined` 产生无 `value` member 的 result；其他 result 必须先成为 detached immutable
  Normalized Application Value，terminal state 才能提交。
- 同步 throw、Promise rejection、thenable assimilation failure 或无法规范化的 handler result
  都是 call-scoped `handler-failed`。Framework 必须消费 terminal 后迟到的 Promise settlement，
  不产生 unhandled rejection，也不允许它覆盖既有 terminal。

### RpcError 与 call error codes

公开 `RpcError` 由 Framework 创建、继承 `Error`，只提供 readonly `code` 与标准 `cause`：

```text
RpcErrorCode
  = canceled
  | unavailable
  | outcome-unknown
  | handler-failed
  | unknown-service
  | unknown-method
  | protocol
```

- `canceled`：本地 caller 已停止等待，或 responder 已明确接纳 remote cancel；它不证明 handler
  未 dispatch、未产生 application effect 或已回滚。
- `unavailable`：Framework 有 Definite Non-Execution evidence，例如 invocation 尚未完成 Outgoing
  Call Admission、peer 还没有 Session Incarnation，或已 terminal 的 proxy 收到新 invocation。
  Caller 可以在 application policy 下创建一个新 Logical Call，而不会重复这次远端执行。
- `outcome-unknown`：Logical Call 已完成 Outgoing Call Admission，但 Session Incarnation 在没有
  authoritative call terminal 时永久终止。缺少 request ACK 不能降级为 `unavailable`，因为 request
  与 ACK 可能分别到达和丢失；Framework 绝不自动以新 identity retry。
- `handler-failed`：远端 handler throw/reject/invalid-result 的安全 call terminal。
- `unknown-service` / `unknown-method`：已验证 request 的明确 call-scoped remote terminal；不
  dispatch handler，也不 fault Logical Session。
- `protocol`：只用于 peer/topology operation、sticky state 与 failure event，表示 Protocol
  incident。该 incident 影响 Pending Invocation 或 Logical Call 时，call Promise 仍分别按
  Definite Non-Execution / Outcome Unknown 映射为 `unavailable` / `outcome-unknown`。

`code` 是唯一稳定、供程序分支的 error member。`message` 是安全的人类说明，不保证可匹配；
v1 不公开 `remote`、`details`、remote `name`/stack/cause 或 application-defined remote error。
Expected domain failure 应作为 typed Application Value result 建模。Default Protocol 的上述 call
error record 不发送 details；handler failure 使用固定安全 message，不发送原始 Error message。

本地 incoming handler failure 的 `RpcError.cause` 保存原始 thrown value，供本地 event 诊断；
对应 remote caller 的 `handler-failed` 没有该 cause。Outgoing Promise rejection 与同侧唯一
`call-finished` event 复用同一个 `RpcError` object；既有 topology/peer operation、sticky state
与 event 的 same-incident Error identity 规则保持不变。

本地 arguments 无法成为 Normalized Application Value 时，proxy 返回 asynchronously rejected
`Promise<TypeError>`，不创建 Pending Invocation 或 call event。Malformed wire args 是 pre-call
Protocol fault。两者都不伪装成 remote call outcome。

### Cancellation 与唯一 terminal winner

- Pending Invocation 的 caller abort 与 Outgoing Call Admission 竞争一个原子 state transition。
  abort 先发生则移除 draft、释放 snapshot/capacity、settle `canceled`，并且不发送 call 或 cancel；
  Outgoing Call Admission 先发生则 call 不可撤回，caller 立即 settle `canceled`，Framework 保留
  control/evidence 并按后续 `seq` 排队 cooperative cancel。
- `IRpcConnection.send()` invocation 是 Framework 能证明的不可撤回边界；send Promise pending、
  Transport buffer 或 socket flush state 都不能恢复 pre-send guarantee。当前 request send 尚未
  settle 时不能并发调用 send，cancel intent 等待串行 slot；Connection failure 后以原 call
  identity replay，再发送 cancel。
- Caller 的 `AbortSignal.reason` 不上 wire。Responder 对 cancelable handler 调用本地
  `AbortController.abort()`；handler 只能依赖 `aborted`、标准 abort event 与本地标准
  `AbortError` reason。caller reason、shutdown reason 与任意 object 都不注入远端 signal。
- Responder 的 cancel admission 与 handler settlement 竞争同一个 terminal slot。Cancel 先获胜
  时先提交 `canceled` terminal、abort signal 并发送唯一 error；handler 的迟到结果被消费和忽略。
  Handler terminal 先获胜时发送原 result/handler failure，迟到 cancel 是 no-op。Duplicate cancel
  也是 no-op，但仍遵守 message receipt rules。
- Caller 侧的 local cancel、remote terminal 与 Session terminal 同样 first-linearized-terminal-wins。
  Terminal 一旦提交，Promise、call observation 与 public state 永不被另一候选覆盖。

### Recovery、shutdown 与 late messages

- Physical Connection replacement 不产生 call terminal。Committed Logical Call 保留并重放；
  尚未 committed 的 Pending Invocation 继续排队且仍可本地取消。
- Owner shutdown 不是 caller cancellation，也不增加 public `shutdown` code。尚未 Outgoing Call
  Admission 的 invocation 使用 `unavailable`；已有 authoritative terminal 的 call 保持原结果；
  shutdown cutoff 到来时已经 Admission 且仍无 terminal 的 call 使用 `outcome-unknown`。Responder
  可以 abort cancelable handler，但不能据此宣称未执行；non-cancelable handler 的迟到 settlement
  也不能覆盖 shutdown terminal。
- Peer/topology sticky state 保存 owner-shutdown、Protocol fault 或其他 Session terminal reason；
  call error 只表达 execution guarantee。后续 shutdown ticket 决定何时停止 admission、grace
  顺序和哪些 calls 到达 cutoff，不得重定义这些 outcomes。
- Caller 已 terminal 后到达的第一个合法 remote terminal 仍完成 sequence validation、receipt ACK
  与 ledger GC，但不改变 Promise，也不发第二个 `call-finished`。同 `seq` replay 按 message-layer
  duplicate 规则处理；同一 call 的 fresh-seq conflicting second remote terminal 是 Protocol
  violation。Responder terminal 后的 handler settlement 永不生成第二条 wire terminal。

### Call observation contract

- Outgoing `call-started` 在 validated invocation 成为 Pending Invocation 后发出；因此排队等待
  send/recovery 的时间可被观察，发送前 cancel 仍有匹配的 `call-finished(canceled)`。Incoming
  `call-started` 在 Remote Request Admission 后、handler dispatch 前发出。
- 每个 `call-started` 在该观察侧恰好有一个 `call-finished`，记录该侧唯一 terminal winner。
  `observationId` 只关联本地事件，不是 wire Call Identity；preflight TypeError 或 already-aborted
  signal 没有 started event。
- Events 使用稳定 peer、direction、Wire Service Name、method 及 detached unredacted args/result
  snapshots；args 排除 caller 与 injected AbortSignal。Subscriber 负责日志脱敏，订阅不能修改
  call flow。

本票不决定 queue/concurrency 数值、Recovery/grace deadline、resource-exhausted policy、decoded
input security、Session-close choreography、Remote Service Group fan-out 或 public Protocol
Implementor Interface；它们分别留给既有 resource、security、shutdown、group 与 SPI tickets。
