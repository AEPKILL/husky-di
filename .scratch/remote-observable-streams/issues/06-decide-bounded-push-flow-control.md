# 决定 RxJS push source 的有界流控契约

Type: grilling
Status: resolved
Blocked by: 01, 02, 05
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在 caller-facing Interface 只有 subscribe/unsubscribe、RxJS producer 又没有原生 request(n) 的条件下，决定 Framework/Protocol 如何兑现逐项有序、无静默 drop/coalesce、有限内存的外部保证。明确 credit/window 单位、初始额度与补充时点，observer 同步 next 返回能证明什么、不能证明什么，同步/reentrant burst、zero-credit source 继续 push、slow observer、Connection loss/Recovery 积压和 capacity exhaustion 如何有界收敛，并固定 capacity exhaustion 的 caller-visible overflow terminal/code；不得把无法暂停的 application producer 描述成真正 producer backpressure。优先把机制隐藏在深 Protocol Module 内，只有证明 subscribe/unsubscribe 不足时才毕业新的 caller policy/options 问题。

## Answer

### Admission credit，而非 producer backpressure

- 每条 Logical Stream Subscription 使用隐藏在 Framework/Protocol 内的 `Stream Admission Credit`。
  单位固定为 item count：一个 credit 只许可一个 Source Emission 越过 Stream Item Admission；它不许可
  application producer 运行，也不表示 RxJS demand、Transport readiness、remote receipt、Observer
  processing 或 durability。
- 每个可能形成的 Stream Item 仍必须单独取得 Session/Owner Retained-Byte Ledgers 的 ordinary
  reservation。Item credit 约束数量，既有 deterministic Application Value weight 与固定 entry charge
  约束 bytes；任何一方都不得冒充另一方。因此本票不增加 byte-credit、Transport capacity getter 或
  第二个 source-ready queue。
- [决定远端 source observation、终止、取消与 teardown](05-decide-source-observation-terminal-teardown.md)
  要求的同步 mutation gate 只允许使用同一批尚未消费的 credit 来预留 reentrant staged command；
  staging 不是额外 cushion。每个 staged `next` 在 Framework 保留其 source value reference 前先预留
  一个 credit 与对应有限 command slot，随后才串行 normalization、ordinary byte reservation 与
  Stream Item Admission。
- 这是 Framework bridge 与 retained Protocol work 的有界流控，不是对任意 application producer 的
  backpressure。Framework 不阻塞 `next()`、不等待 Promise、不调用未约定的 pause/request，也不声称
  unsubscribe 能停止一个不合规 producer。

### Initial window 与 bootstrap

- Local Stream Subscription preflight 必须在 Local Stream Subscription Admission 前取得一个非零的
  initial receive window。每个授出的 item credit 都由 Subscriber Side 的有限 reservation 支撑，足以
  接纳一个最大合法 v1 Stream Item 及其固定 bookkeeping；无法取得最小一个 credit 时，通过该
  Observable 的 error channel 返回安全 `RpcException(unavailable)`，不创建 Stream Identity、wire work
  或 remote execution。
- Outgoing Stream Admission 提交的 immutable stream-start semantic intent 同时携带初始 cumulative
  credit horizon。Source Side 只有 durable 接受一个正数 initial horizon 后才能进入 Source
  Subscription Admission；零值、回退或超出已验证范围的 grant 是 Protocol contract violation，不能
  启动 source 后再等待第一份 credit。
- Initial window 的具体 count、跨 active streams 的分配、worst-case backing charge 与释放点由
  [决定流订阅的资源核算、调度与公平性](08-decide-stream-resources-scheduling-fairness.md)在现有
  immutable owner policy 和 ledgers 上固定。本票已经固定其语义公式——initial grant 等于本次 Local
  Admission 原子保留的 receive slots——而不新增 per-subscribe option 或公开 window knob。
- Grant 随每次 stream start 显式携带，并在之后以 cumulative horizon 推进；两端不依赖相同的隐含
  local window 数值。因此固定 `/1` profile 不需要新增协商参数、bootstrap 常量或 profile fingerprint。

### Replenishment 与 Observer 能证明的边界

- Subscriber Side 对一个 stream 严格串行、non-overlapping 地执行 Observer Delivery。一次 `next()`
  同步返回且本地 observation 仍开放后，对应 receive slot 才重新成为可授出的一个 credit；Framework
  原子 re-arm 该 reservation，并推进一个 cumulative、单调且永不回退的 Stream Credit Horizon。
- Source Side 只消费自己已经 durable 接受的最高 horizon。Credit update 使用 absolute cumulative
  total，而不是可能因 duplicate/replay 重复 mint 的 delta；同一 horizon 是幂等 no-op，fresh 更低
  horizon 是 Protocol fault。具体
  item identity、control record、piggyback/coalescing、ACK 与 replay choreography 由
  [决定 Stream Item 的确认、去重、重放与 Recovery](07-decide-stream-delivery-replay-recovery.md)承接，
  但不得改变这里的 logical replenishment point。
- Observer `next()` 返回只证明这次同步 callback invocation 已返回、Framework 可以重用其 delivery
  slot。它不证明 async work 完成、application effect committed、durability、Message Receipt ACK、
  remote evidence GC 或 application-level exactly-once。Observer callback throw 继续走 RxJS host
  reporting，既有 state 不回滚、Stream Terminal 不改写。
- Observer 在 `next()` 内 reentrant unsubscribe，或 terminal 已关闭 observation 时，不再产生新
  credit；已经收到的 item 仍可推进后续票定义的 duplicate-suppression disposition。Unsubscribe 也
  不得过早释放仍由既有 outstanding grants 支撑的 Protocol capacity；这些 reservation 随 cancel、
  terminal 与 evidence convergence 有界释放。
- 同步慢 Observer 会延迟 replenishment；只启动 async work 后立即返回的 Observer 对 Framework 而言
  已释放同步 occupancy，所以不会形成 async-consumer backpressure。Caller 若需要按业务处理完成度
  控速，必须在 application Observable 组合中建模，RPC Interface 不增加 processing ACK。

### 同步 burst、zero credit 与 overflow ordering

- Source Emission 在其有序 gate position 无法预留一个 Stream Admission Credit 时，不等待、不 drop、
  不 coalesce，也不进入额外 buffer；它在该位置提出 `Stream Overflow` terminal candidate。若 value
  已合法 normalization但 ordinary retained-byte reservation 不足，同样提出 Stream Overflow。非法
  value/normalization failure 仍是较早已固定的 `handler-failed`，不是 overflow。
- Overflow-causing Source Emission 从未越过 Stream Item Admission，因而不是被丢弃的 Stream Item。
  在它之前已预留 credit 的 staged emissions 先按原 source order 完成 admission；其中更早发生的
  invalid value、source terminal、cancel、Session terminal 或 force 仍可先赢 first-linearized terminal
  slot。Overflow 一旦在自己的 gate position 获胜，retained terminal 排在此前 admitted items 后，
  sink 立即 fence，后续 callbacks 成为 no-op，并开始 one-shot Source Teardown。
- 因此任意同步或 reentrant burst 最多形成 initial/outstanding credit 数量的 staged/retained items；
  下一次 emission 明确 overflow。一个不理会 closed Subscriber 的 producer 可以继续消耗自己的资源，
  但 Framework 只保留固定 sink/gate/terminal state，不为它继续分配 item capacity。
- Terminal/control disposition 从 Remote Stream Admission 已预留的 protected capacity 提交，不消费
  item credit。若连该 protected disposition 都无法 retained，则是 Session-scoped resource fault，
  不能伪造 per-stream overflow。

### Connection loss 与 Session Recovery

- Source Side 已 durable 接受的 credit horizon、已消费 count 与剩余 credit 都属于 retained Logical
  Stream Subscription state；Physical Connection loss 不撤销、不重置或重新授予它们。尚未到达 Source
  Side 的较高 cumulative grant 只是 retained outbound intent，在 Source-Side durable admission 前不可
  消费。
- Recovering 期间 source 可以继续 emit，并最多消费 Source Side 当时已知的 remaining credit；没有
  Observer Delivery 就不会产生新的 replenishment。Items 同时受 ordinary retained-byte ledgers 与
  Recovery retention 约束。下一次 zero-credit 或 ordinary-capacity-failing emission 选择 Stream
  Overflow、fence source并 teardown，其 terminal evidence等待 successful Recovery 后重放。
- 若较高 credit intent 尚在途时 Source Side 先 linearize overflow，late/replayed grant 不改写 terminal；
  若 grant 先被 durable 接受，source 可消费新 horizon。Successful Recovery 继续原 horizon、item count、
  source subscription 与 Stream Identity；duplicate grant/replay 不重复 mint credit，item replay 不重复
  debit admission capacity。
- Recovery 后先前 admitted items仍在 overflow/source terminal 之前按序投影。若 Session retention
  永久丢失且 Subscriber Side没有 authoritative terminal evidence，继续使用既有 `outcome-unknown`；
  不能把 continuity loss改写为 overflow。

### Closed exhaustion taxonomy 与 caller projection

- 新增 closed caller-visible `RpcException` code：`overflow`，以及同名内部 Stream Terminal outcome。
  它只表示 Remote Stream Admission 后，一个 valid Source Emission 无法取得 Stream Admission Credit
  或 ordinary retained item capacity。
- Source Side 是 overflow authority；`overflow` 与 `completed | handler-failed | canceled | terminated`
  共享同一个 retained first-linearized-winner slot。Active Observer 先收到所有此前 delivered/admitted
  items，最后恰好一次 `error(RpcException(overflow))`；异常没有 raw cause、message、payload 或远端
  diagnostics。Caller 已 unsubscribe或Observer已closed时不投影 terminal notification。
- Pre-Admission ordinary capacity不足保持 `unavailable` 与 Definite Non-Execution；invalid item保持
  `handler-failed`；authoritative evidence永久丢失保持 `outcome-unknown`；protected disposition失败是
  Session resource fault；peer发送超过durable grant的item、回退credit horizon或非法transition是
  Protocol fault。Transport send pressure/failure仍只进入既有 Local Admission/Recovery 语义。

### Public surface 与后续边界

- `subscribe()`/`unsubscribe()` 保持唯一 caller-facing lifecycle Interface。本票不增加 `request(n)`、
  ready/processing ACK、per-subscribe overflow policy、公开 window option、scheduler/queue surface 或
  Transport capacity getter；credit 与 overflow 由深 RPC Protocol Module 统一提供。
- Flow-control semantics本身不需要新的 owner policy字段。资源票仍可判断 active-stream count或
  aggregate resource capacity是否具有独立 owner-level调节价值，但不得重新暴露每条stream的credit
  算法。
- Complete-message Transport是否无需改变仍由
  [验证 Streaming Protocol Implementor Interface 与 Transport seam](11-prototype-streaming-protocol-spi.md)
  用load conformance证明；本票只证明它不需要capacity getter。Wire record与状态机由
  [决定 husky-di-rpc/1 流式 wire grammar 与状态机](12-decide-v1-streaming-wire-state-machine.md)编码。

本次resolution不产生新ticket；地图中“bootstrap固定参数/profile fingerprint”fog已被显式grant路线
消除，caller policy fog则收窄为资源票可能证明需要的owner-level aggregate capacity option。
