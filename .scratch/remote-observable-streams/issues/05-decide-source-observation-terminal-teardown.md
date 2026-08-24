# 决定远端 source observation、终止、取消与 teardown

Type: grilling
Status: resolved
Blocked by: 02, 04
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

为 streaming method 与 Observable property 建立完整 source/terminal/teardown matrix：方法何时执行并验证返回 Observable，属性何时读取/快照，exposure cleanup 是否影响已 admission 订阅；一个远程 subscribe 如何对应恰好一次本地 source subscribe/teardown并保留 application 的 hot/cold/replay 语义；同步 next/complete/error、handler/getter/subscribe/teardown throw、invalid source、unknown route、资源拒绝、observer unsubscribe、可选 AbortSignal、Session terminal 与 late callback 如何竞争。明确 pre/post Admission 的 execution guarantee、first-terminal-wins、重复 unsubscribe、远端 source error 到安全 RpcException(handler-failed) 的映射，以及任何 raw application Error 均不跨线。

## Answer

### Remote Stream Admission 与 Source Start Job

- 一个valid expected stream start必须先完成固定/security/sequence validation并预留有限的Source
  Start Job ordinary capacity。普通容量不足时，Receiver使用Session已保护的disposition capacity原子
  提交`Remote Stream Resource Rejection(unavailable)`；它不是Remote Stream Admission，不捕获
  application route，也绝不执行method、读取getter或调用`subscribe()`。若连protected disposition
  本身都无法retained，则是Session-scoped resource fault，不能伪造`unavailable`。
- 容量已取得后才 exact-match Wire Service Name、member 与 interaction kind。未知 service 提交
  `unknown-service`；未知 member，或同名 member 在双方被声明为不同的 unary/stream-method/
  stream-property kind，统一提交 `unknown-member`。这些都是 Remote Stream Semantic Rejection，
  不泄漏远端实际 kind、不运行 application code，也不 fault Session。Malformed record、保留名
  `then` 与非法 Protocol transition 仍是 Protocol fault。
- Capacity reservation 后的 exact route match 在 Framework incoming reservation 内原子完成 Remote
  Stream Route Capture，冻结当时安装的 immutable exposure entry；它仍不是 Remote Stream Admission，
  不允许application acquisition。Protocol随后在一个无`await`的线性化点使用该captured entry，
  commit此前预留的job capacity和该stream的最小protected terminal/control capacity，提交retained
  stream state并发布恰好一个Source Start Job。Protocol收包栈不直接调用application method/getter/
  `subscribe()`；具体permit、轮转与公平性继续由资源调度票决定，不新增caller-facing或Protocol
  Implementor Interface。
- Exposure cleanup/re-expose与Remote Stream Route Capture在同一registry seam原子排序。Route Capture
  捕获该瞬间安装的entry；当时没有entry才走安全semantic rejection，已经捕获则即使Protocol尚未commit
  Remote Stream Admission也固定使用旧entry。Cleanup同步、幂等且non-throwing，只移除future lookup，
  不是service disposal，也不取消captured/admitted/active stream；cleanup后、later Route Capture前完成
  的同名re-expose可被该later capture正常看见。
- Remote Stream Admission 表示 application execution 已成为可能，而非 method/getter 已经执行。
  一旦越过该点，Subscriber Side 不得再对整次 operation 声称 Definite Non-Execution，即使一个较早
  terminal 随后在 job 启动前阻止了实际 source acquisition。

### Source acquisition 与 exactly-once subscribe

- Stream data property 完全继承《原型化流成员 Descriptor 与单 Peer facade Interface》：source
  reference 在 exposure installation 时以 package RxJS `isObservable()` guard 验证并捕获。Stream
  getter 捕获 getter/receiver，stream method 捕获 function/receiver；每个 admitted Source Start Job
  至多调用对应 getter/method 一次，并以相同 guard 验证其直接返回值。
- Source Start Job 开始前若 cancel、Session terminal 或 force 已选择 terminal，Framework 删除 job，
  不 acquisition、不 subscribe。Application callback 一旦开始便不可抢占；若 callback 内重入的
  terminal 先赢，callback 仍返回/抛回 Framework，但结果或 throw 被消费，Framework 不再验证结果或
  调用 `subscribe()`。
- Framework 以一个 package-private source adapter 封装 source interaction：在接触 source 前建立
  Framework-owned sink、同步 notification gate、terminal latch、returned-teardown latch 与 one-shot
  teardown gate，然后对取得的 source 恰好调用一次 `subscribe()`。这次调用开始即为 Source
  Subscription Admission；同步 notification 或 throw 不会造成 retry。
- 若 terminal 在 `subscribe()` invocation 内获胜，Framework 立即关闭 sink；`subscribe()` 随后返回的
  teardown 被登记后立即执行一次。若 `subscribe()` 在尚无 terminal 时抛错或无法形成合格的 Source
  Subscription，则选择安全 `handler-failed`；若一个同步 source terminal 已先赢，迟到的 throw/
  invalid return 只形成本地 incident，不改写 terminal。
- Framework 只承诺自己的 sink 被 fencing、对合规 RxJS source 至多一次 subscribe 与一次 application
  teardown，以及对异常 source 的一次 teardown 尝试。`isObservable()` 不是 compliance proof；若一个
  伪造 source 忽略 closed Subscriber 或 unsubscribe，Framework 不声称能停止其 application-owned
  producer。Framework 不用 `from()`、constructor identity、Observable interop 或公开 Adapter 扩大
  Interface。
- 每个 admitted Logical Stream Subscription 使用独立 Source Start Job、source adapter 与 teardown gate；
  Source Subscription 至多形成一个，且 rejection、acquisition failure 或 invalid return 路径可以为零。
  Framework 不 share、cache 或 replay source；Observable 自身的 hot/cold/sharing/replay 语义始终由
  application 决定。Application Stream 不增加 `AbortSignal`，caller-facing cancellation 只有 RxJS
  `unsubscribe()`。

### 同步 notification、item 与 terminal ordering

- 每条 stream 使用一个最小、同步、无 `await` 的 mutation gate，以 `dispatching`、受容量约束的 staged
  commands 与 terminal latch 串行化同步或重入的 `next/error/complete`。Gate 内只提交 Framework/
  Protocol state；Transport send、public Observer 与其他 application callback 都在 state commit 后执行。
  不建立通用 actor 或第二套 scheduler，精确 staging capacity 与 overflow 交给流控/资源票。
- `next()` 首先只产生 Source Emission。只有 value 已成为 detached immutable Normalized Application
  Value、取得 finite capacity并完成 Stream Item Admission后，才存在 Stream Item。Invalid value 不产生
  item，并选择安全 `handler-failed`。
- 已admitted items保持source order。在retained Session仍连续的正常source/cancel terminal path上，
  terminal的retained ordering必须排在此前items之后，不能越过、静默drop或coalesce它们；terminal后的
  `next/error/complete`以及stale/replayed source callback均被fenced，不产生item、第二terminal或
  Protocol fault。Session terminal、force或authoritative evidence永久丢失不承诺交付未确认items；
  其丢弃、GC与`outcome-unknown`顺序分别由delivery/replay和shutdown tickets精确定义。
- Admitted source-side terminal 使用单一 retained first-linearized-winner slot，不设静态优先级：source
  complete、source/application failure、Source-Side cancel admission、Session terminal 与 force 谁先进入
  gate谁赢。其 closed outcome vocabulary 是 `completed | handler-failed | canceled | terminated`；
  capacity exhaustion 的精确 `overflow` terminal/code由流控票决定。Remote rejection dispositions以
  `unavailable | unknown-service | unknown-member` 在 source work开始前终止 Subscriber Side。
- Method/getter throw、invalid Observable、`subscribe()` throw、source `error()` 与 invalid Stream Item
  全部属于 application-source `handler-failed`。Raw thrown value、Error identity、message、stack、cause
  或任意 diagnostics 都不跨线、不进入公共 event/log/cause；可预期的领域失败继续作为 Application
  Value建模。
- Source 已同步 `complete/error` 后 `subscribe()` 又抛，或另一 terminal candidate迟到时，先
  linearized terminal保持不变。Observer callback自身 throw完全遵守 RxJS host reporting：Framework
  state不回滚、Stream Terminal不改变，也不自动产生 remote cancel。

### Unsubscribe、cancel 与 Recovery

- Caller `unsubscribe()` 立即、同步且幂等地关闭本地 observation，不调用 Observer `complete()` 或
  `error()`。Outgoing Stream Admission 前，它只撤回 identity-free Pending Stream Subscription，释放
  本地容量并保留 Definite Non-Execution；不创建 Stream Terminal、Stream Identity或 wire cancel。
- Remote Observable initializer teardown也会因preflight error或Framework投影的complete/error被RxJS
  自动调用；只有caller explicit unsubscribe且尚无local terminal projection时才生成cancel intent。
  正常terminal或preflight failure后的local cleanup只释放Observer state，绝不反向制造cancel。
- Outgoing Stream Admission 后，第一次 unsubscribe 至多提交一个 retained logical cancel intent；它
  本身不选择全局 Stream Terminal。Source Side durable cancel admission与 source/session/force candidates
  竞争 terminal slot：cancel先赢则选择 `canceled`、fence sink并执行 Source Teardown；既有 terminal先赢
  则 cancel是 semantic no-op。
- 重复 unsubscribe、duplicate/replayed/late cancel不得再次 terminal、teardown或发 lifecycle event；
  Protocol仍可完成必要的 receipt ACK、duplicate disposition与Stream Evidence Retirement。Caller已关闭
  observation后，任何最终 terminal都不再投影 Observer notification。
- Physical Connection loss只进入 Session Recovery：Pending保持 identity-free，admitted stream保留原
  Stream Identity、captured route、Source Start Job或既有 Source Subscription。成功 Recovery不重新
  acquisition、subscribe或teardown，只重放尚需的 Protocol evidence。
- Source在retained Session recovering期间仍可emit。`complete/error`立即在Source Side竞争 Stream
  Terminal；若获胜则fence callbacks并执行Source Teardown，不等待replacement binding，对应terminal
  evidence由Protocol保留，待successful Recovery后重放。若已有winner或Session先永久结束，则沿下一项的
  `outcome-unknown`/既有winner规则收敛。
- Authoritative Session terminal或force若先赢，Source Side选择内部 `terminated`、同步 fence source并
  尝试一次 teardown。Subscriber Side尚未 Outgoing Admission的 work使用 `unavailable`；已 Admission但
  永久失去authoritative terminal evidence的active Observer得到`outcome-unknown`，即使此前已收到部分
  items。只有Subscriber Side已经取得并验证authoritative source terminal evidence时才继续按该原结果
  投影；若terminal只存在于随后失联的Source Side且证据无法恢复，caller仍必须得到`outcome-unknown`。
  Caller已经unsubscribe时不再收到上述error。

### Source Teardown、引用释放与 Observer projection

- Terminal先原子提交，随后立即 fence source callbacks并尝试一次 Source Teardown；Framework不等待
  teardown成功才确认或发送 terminal。RxJS complete/error触发的自然 unsubscribe与随后 cancel/force/
  duplicate teardown共享同一个 one-shot gate，application teardown最多执行一次。
- Teardown throw或其他失败只形成 payload-free的本地 Source Teardown Incident。它不能替换既有 Stream
  Terminal、制造第二个 remote error、暴露raw Error、升级健康Session/Owner或使Topology Owner cleanup
  task失败；《决定 Application Stream 的公开观测与 telemetry》负责决定其最小安全event投影。
- Source-start结束后立即释放captured exposure entry、method/getter receiver与临时source reference；
  仅Source Subscription handle保留到teardown。Stream Evidence Retirement可以更晚，但Protocol
  retained evidence只保存identity与安全normalized data，不保留application object或teardown closure。

仍活跃的 caller Observer 使用以下 closed projection；每项至多通知一次，且terminal排在此前delivered
items之后：

| Retained disposition / terminal | Observer projection |
| --- | --- |
| `completed` | `complete()` |
| `handler-failed` | `error(RpcException(handler-failed))` |
| Remote Stream Resource Rejection | `error(RpcException(unavailable))` |
| Remote Stream Semantic Rejection | `error(RpcException(unknown-service \| unknown-member))` |
| Admission后永久丢失authoritative evidence | `error(RpcException(outcome-unknown))` |
| Caller unsubscribe或Observer已经closed | 无terminal notification |

统一member namespace使现有未发布v1草案的`unknown-method`在caller exception、telemetry、Protocol语义与
wire assets中原地替换为`unknown-member`，同时覆盖unary method、stream method与stream property。
除此之外，本票不新增source/teardown/force专属RpcException code；overflow留给流控票，精确event shape
留给观测票。

本票不决定credit/window、overflow阈值、item/terminal ACK与replay、长期subscription资源额度、公平性、
完整G/F drain predicate、public telemetry字段或wire record。它们继续由既有06至12号tickets承接；
本次resolution不产生新ticket。
