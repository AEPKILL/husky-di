# 决定远程 Observable 订阅的领域模型与生命周期

Type: grilling
Status: resolved
Blocked by:
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在 RPC 双方都能发起调用的前提下，为远程方法返回的 Observable、远程 Observable 属性、每次 subscribe、source observation、item、terminal 与 teardown 建立统一领域词汇和 lifetime/ownership 模型；明确它们与现有 Logical Call、Pending Invocation、Framework state$/event$/peers$ observation streams 及 Transport message$/connection$ 的关系。已确定 application stream 的 subscribe/unsubscribe 拥有远程工作，而 lifecycle/telemetry/Transport observation subscriptions 仍不拥有其所观察资源；本票应把该区别写入 CONTEXT.md，并确定各 admission linearization point 与 Framework、Protocol、RxJS source 的 ownership seam，但不决定精确 TypeScript members 或 wire record。

## Answer

### 统一实体与角色

- `Application Stream Member` 统一包含返回直接 RxJS Observable 的远程方法与 Descriptor 显式 allowlist 的只读 Observable 属性。两者只在 Source Side 如何取得 application Observable 时分叉；此后共享一套订阅、item、terminal、Recovery 与 teardown 生命周期。
- `Remote Observable` 是 Subscriber Side 的 cold 本地 facade。创建、访问或持有它不产生远程工作；每次 `subscribe()` 各自创建一个 `Caller Stream Subscription`，并最终对应至多一个独立的 `Logical Stream Subscription` 和 `Source Subscription`。Framework 不隐式 share、cache 或 replay。
- 一条流使用动态的 `Subscriber Side` 与 `Source Side`，不把 Connector/Acceptor 固定成 client/server。`Subscription Direction` 从 Subscriber Side 指向 Source Side，表示 start/cancel intent 的发起方向；item 与 source terminal 通常反向流动。
- `Logical Stream Subscription` 与 unary `Logical Call` 是 Logical Session 下的并列实体，不扩张既有 call 定义，也不增加公开的泛化 operation Interface。其 `Stream Identity` 以 `(Session Incarnation, Subscription Direction, streamId)` 为作用域，在 Outgoing Stream Admission 创建并在该 incarnation 内永不复用；member route、Physical Connection、RxJS object 与 telemetry correlation 均不属于身份。

### Admission 与 item 边界

生命周期依次区分五个 admission：

1. `Local Stream Subscription Admission`：Subscriber Side 完成 preflight 与有限本地容量获取，创建 identity-free、可撤回的 `Pending Stream Subscription`。
2. `Outgoing Stream Admission`：在一个 non-awaiting 原子步骤中分配 Stream Identity、提交 immutable retained start evidence，并首次调用当前 Physical Connection 的 `send()`。无可用 binding 时仍保持 Pending；此前撤回提供 Definite Non-Execution，此后取消只能 cooperative convergence。
3. `Remote Stream Admission`：Source Side 将 ordinary accepted request 提交为 retained Logical Session state，随后才允许 application source acquisition。Resource/semantic rejection 是替代 retained disposition，不是 admission，且不得执行方法、读取属性 source 或调用 `subscribe()`。
4. `Source Subscription Admission`：Source Side 对一次取得的 application Observable 恰好调用一次 `subscribe()`，Framework 从此拥有 Source Subscription 的 teardown 责任。它与 Remote Stream Admission 分离，以容纳 method/property acquisition 在 source subscribe 前失败。
5. `Stream Item Admission`：一次 `Source Emission` 已安全归一化为 detached immutable Application Value snapshot、取得有限容量并成为 Protocol retained work。它由此成为 `Stream Item`；此前的 source value、之后的 wire representation、`Observer Delivery`、ACK 与 evidence retirement 都是不同阶段。

Streaming 不建立第二套 value domain：每个 Stream Item 严格复用现有 Application Value 与 Normalized Application Value 契约。`Observer Delivery` 只表示 Subscriber Side 调用一次 Observer `next()`，不自行证明 ACK 或 GC。

### Ownership 与多重 lifetime

- Caller Stream Subscription 是创建/取消远程工作的 caller-facing lifecycle root；unsubscribe 立即结束本地 observation，但不声称 remote work 已同步停止。
- Subscriber-side Framework 拥有 local preflight、Pending state、Observer sink 与 delivery projection；Protocol 拥有 Stream Identity、retained start/item/cancel/terminal evidence、Recovery continuity 与 retirement。
- Source-side Framework 拥有一次 source acquisition、Source Subscription 与一次 Source Teardown；application 始终拥有 Observable source 自身的 hot/cold/share/replay 语义和 producer 内部资源。
- Transport 只承载完整消息；对 `connection$`/`message$` 的订阅不取得 Application Stream 或 Physical Connection ownership，既有 handoff barrier 仍是 Connection ownership 的唯一来源。

“订阅结束”不得表示一个时刻：Pending lifetime 在撤回或 Outgoing Admission 结束；caller observation lifetime 在 unsubscribe 或 Observer Terminal Notification 结束；Logical Stream semantic lifetime 由唯一 Stream Terminal 收敛；Source Subscription lifetime 由 Source Teardown 结束；Protocol evidence lifetime 最后才由 Stream Evidence Retirement 结束。Caller 已 unsubscribe 后，Framework 与 Protocol 继续拥有有界的 cancel、remote teardown 与 evidence convergence 工作。

### Terminal、Recovery 与 execution guarantee

- `Source Terminal` 仅指 application Observable 的 complete/error；`Stream Terminal` 是由 source terminal、caller cancellation、Session termination 或 force 竞争出的唯一 authoritative semantic outcome。双方对该 outcome 的本地 projection 不必同时落定。
- Observer complete/safe error、caller unsubscribe、Source Teardown 与 Stream Evidence Retirement 彼此独立。Unsubscribe 不伪造 complete；terminal winner 之后的 late item/terminal、teardown failure 或 replay 不能创建第二个 outcome 或第二次 observer terminal。
- Pending Stream Subscription 在 retained Session Recovery 中保持 identity-free；已 Outgoing Admission 的订阅保留原 Stream Identity；已 Remote Admission 的 source acquisition 不得因换线重复；已建立的 Source Subscription 不重新执行方法、读取属性或 subscribe；已选但未确认的 terminal 只保留/重放 evidence。
- `Definite Non-Execution` 泛化为 operation-specific remote admission guarantee：unary 未到 Remote Request Admission 时 handler 不可能 dispatch，stream 未到 Remote Stream Admission 时 method/property/source acquisition 不可能执行。越过对应 remote admission 后不得再作该保证。

公开 `state$`、`event$`、`peers$` 与 Transport `message$`、`connection$` 统一归为非 owning 的 `Observation Stream`：零个、一个或多个 subscriber 都不创建、启动、停止或拥有被观察资源。它们与 owning `Remote Observable`/Application Stream 的区别已同步写入权威 [`CONTEXT.md`](../../../CONTEXT.md)。

### 后续决策边界

本票不决定 TypeScript member、wire record、credit/window、具体 outcome code 或 drain ordering。现有后续票分别唯一承接这些精度：[原型化流成员 Descriptor 与单 Peer facade Interface](04-prototype-stream-descriptor-peer-facade.md)、[决定远端 source observation、终止、取消与 teardown](05-decide-source-observation-terminal-teardown.md)、[决定 RxJS push source 的有界流控契约](06-decide-bounded-push-flow-control.md)、[决定 Stream Item 的确认、去重、重放与 Recovery](07-decide-stream-delivery-replay-recovery.md)、[决定流订阅的资源核算、调度与公平性](08-decide-stream-resources-scheduling-fairness.md)、[决定流订阅在 graceful shutdown 与 force close 下的收敛](09-decide-stream-shutdown-force-convergence.md)、[决定 Application Stream 的公开观测与 telemetry](10-decide-application-stream-observability.md)、[验证 Streaming Protocol Implementor Interface 与 Transport seam](11-prototype-streaming-protocol-spi.md) 与 [决定 husky-di-rpc/1 流式 wire grammar 与状态机](12-decide-v1-streaming-wire-state-machine.md)。本次 resolution 未产生新 ticket，也未使现有 fog 变得可精确毕业。
