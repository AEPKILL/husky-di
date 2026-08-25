# 决定 Call value model、identity、重放与去重

Type: grilling
Status: resolved
Blocked by: 03, 04, 06, 09
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

所有 conforming v1 Protocol 应共同接受怎样的 caller-visible application value model，custom Protocol 能否改变该模型，透明 Session Recovery 下 message 与 unary call 的 delivery state machine 又是什么？决定 `seq` / `callId` 的作用域、request admission、断线期间的新调用、在途重放、Session-scoped at-most-once dispatch、terminal replay、tombstone/high-watermark 与 evidence GC prerequisites，并定义 validated normalized application values 的确定性 semantic equality，供重复 identity 比较使用。terminal semantics、numeric bounds 与 resume proof 分别由 [决定 unary 调用、取消、错误与终止竞态](11-decide-unary-call-errors-cancellation.md)、[决定顺序、并发、缓冲与恢复资源上限](13-decide-ordering-concurrency-resource-bounds.md)和[决定 trust-boundary validation 与 Session Recovery 安全](14-decide-validation-recovery-security.md)定义。

## Answer

2026-08-19 consistency amendment：Application Value compact weight的number spelling固定采用RFC 8785
JCS所引用的ECMAScript JSON number serialization，不自行寻找全局更短等价JSON number（例如 `1e20`
仍按 `JSON.stringify` 的21-byte decimal spelling，`1e21`保留 `1e+21`）。Application string/member
name拒绝unpaired UTF-16 surrogate；node计数包含每个primitive/array/record但不包含member name，root
depth为1。共享但acyclic引用在每次出现处独立snapshot，ancestor cycle拒绝。Record/array只通过
own-key/property-descriptor meta operations读取：拒绝own accessor与symbol key，忽略non-enumerable data，
拒绝array hole与non-index property；不调用普通property get/getter/toJSON/coercion。Proxy不属于Application
Value contract且其meta traps可能有side effect，但trap结果仍重验，trap throw统一为 `TypeError`。

所有 conforming v1 Protocol 共享同一个 caller-visible Application Value、Logical Call 与
Session-scoped delivery contract。Custom Protocol 可以替换 wire grammar、Codec 和内部
evidence representation，但不能扩展业务值域、降低 Request Replay、at-most-once handler
dispatch、terminal replay 或 Call Identity non-reuse 保证。

### Application Value 与 normalization

- Application Value 固定为 `null | boolean | string | finite binary64 number | dense array |
  plain data record`。Default Protocol 的 JSON sender/receiver 约束继续由
  [决定默认 Protocol 的 wire grammar、Codec 与版本协商](06-decide-default-protocol-wire-contract.md)
  定义；注入 Custom Protocol 不允许 `Date`、class instance、`bigint`、binary 或其他额外
  caller-visible 类型直接穿过公开 Interface。v1 还共同遵守 resource ticket 的 depth、string、
  member、element、node 与 `1,000,000 B` deterministic Application Value weight limits；Custom
  Protocol 不能借更紧或更松的 Codec 改变 caller-visible accepted value set。
- 本地 Call Admission 必须在保留 caller-owned reference、分配 delivery state 或执行
  application handler 前验证值域，并创建 detached、immutable 的 Normalized Application
  Value snapshot。Handler terminal value 同样必须在写入 terminal ledger 前完成验证与
  snapshot；后续 caller mutation、getter、`toJSON` 或 Codec choice 不能改变 retained request
  或 outcome。
- Normalized Application Value 使用递归 structural equality：`null`、boolean 与 string 按值
  精确比较，string 不做 Unicode normalization 或 case folding；number 比较同一 finite
  binary64 value，且 `-0` 已在值域入口拒绝；array 比较长度、顺序与逐项值；record 比较
  member-name set 与逐 member value，忽略 member order、JSON escape spelling 与 object
  prototype。它不使用 encoded bytes、caller object identity 或 object insertion order。
- 这是 conformance 与任何仍需执行的 retained replay evidence comparison 唯一可用的 semantic
  equality。Default Protocol 的旧 `seq` 在 message layer、semantic dispatch 之前被抑制；body
  已无状态影响后，不为事后检测 sender 违约而永久保留 snapshot 或 fingerprint。以 fresh `seq`
  再次呈现已用 Call Ordinal 则无论 body 是否相同都必须 fault，不能作为 retry。

### Logical Call identity 与可接纳状态

- 一个 Logical Call 的 identity 是 `(Session Incarnation, originating direction, callId)`。
  `callId` 由 Protocol Implementation 创建，在该方向的整个 incarnation 内永不复用，不进入
  caller Interface，也不是 application idempotency key。
- Default Protocol 在两个 originating directions 分别维护从 `1` 开始、无 gap、严格递增的
  Call Ordinal，并以 canonical unsigned decimal string 作为 `callId` carrier；其上界归资源票
  决定。Call Ordinal 只标识 Logical Call，message `seq` 仍独立标识每条 `call`、`cancel`、
  `result` 或 `error` semantic message。两者只在首次 Outgoing Call Admission 时分配；尚未交给
  Transport Adapter 的 Pending Invocation 不预占 wire identity。
- `connected` 与 retained `recovering` Session 可以接纳新 invocation。Local preflight 原子完成
  signal/value/capacity validation、request snapshot 和 removable Pending Invocation 创建，但不
  分配 Call Ordinal、outgoing `seq` 或 replay payload。当前 Connection 有串行 send slot 时，
  Outgoing Call Admission 在一个不可重入步骤内再检查 pending state、分配两种 identity、提交
  immutable `(seq, SemanticMessage)` replay entry，并用已经完成最大宽度 ACK 与 `1 MiB` Adapter
  compatibility preflight 的首次 encoded envelope 调用 `IRpcConnection.send()`；此时 invocation
  才成为 Logical Call。每次 replay 可以用最新
  `ackThrough` 重新编码 envelope，但 semantic pair 不变。
- Recovery 后先严格按 `seq` 重放所有高于 peer cursor 的 committed messages，再按既有 pending
  ordering 为新 invocation 分配 identity。首次 send 前的 local cancel 可以删除 Pending
  Invocation 而不制造 sequence/ordinal gap；一旦调用 `send()`，原 identity 与 replay payload
  不可撤回，后续只能按 unary-call ticket 的 cooperative cancel 语义处理。
- Connector 的 `unbound` 或首次 `connecting` 状态没有 Session Incarnation，因此 proxy method
  invocation 异步 reject；v1 不建立 provisional identity、不隐式启动连接，也不把调用绑定到
  一个尚不存在的 future Session。精确 error 属于 unary-call ticket。

### Remote disposition、replay 与 dispatch

- Receiver 只有在完整 lexical/schema/fixed-resource/sequence/call-ordinal validation 成功后，才能
  对 fresh call 做 retained disposition。普通 handler work capacity 可用时，它在一个线性化点推进
  receive state 并执行 `absent -> in-progress`；该点是 Remote Request Admission。
- 普通 handler work capacity 不可用时，Receiver 必须从 Session 创建时预留的 control/terminal
  reserve 原子推进相同 receive/ordinal evidence，并执行
  `absent -> terminal(unavailable)`。该点是 **Remote Resource Rejection**：它不保留 args、不发
  incoming `call-started`、永不 dispatch handler，因而提供 Definite Non-Execution。它不是 Remote
  Request Admission；若连 protected disposition 都无法保存，则发生 Session-scoped resource fault，
  不能让合法 expected-seq call 成为无限 Recovery poison。
- Ordinary capacity已预留后才 exact lookup本地 exposure。未知 Wire Service Name或 method执行
  `absent -> terminal(unknown-service | unknown-method)`，称为 **Remote Semantic Rejection**：它留下
  固定可重放 terminal、永不 dispatch handler，也不是 Remote Request Admission；但作为一个已经完成
  routing的业务 call observation，它按 issue 11产生紧邻的 payload-free started/finished pair，且不
  echo未知 spelling。Provisional handler reservation在该分支立即释放。
- Message Receipt ACK 只能在上述任一 durable disposition 后推进。ACK 证明 request 已进入 retained
  Protocol/Call State，但不单独证明是 handler-eligible、resource-rejected还是 semantic-rejected；
  随后的 authoritative terminal才给 caller精确结论。对于 Remote Request Admission，ACK仍不证明
  handler已开始、已完成或提交了外部副作用。
- Receipt 不确定时，sender 只能重放原 `seq`、原 `callId` 与原 semantic message，不得以新
  `seq` 重新表达同一个 Logical Call。Receiver 对通过基本 record validation 且
  `seq <= receivedThrough` 的 record 只处理合法的新 `ackThrough`，忽略 semantic body，不再
  进入 Call State 或 dispatch handler。
- Sender 仍违反 Protocol contract，如果它为旧 `seq` 更换 semantic body；但 body 已无法改变
  retained state，Receiver 在历史 evidence GC 后不承诺检测这种无状态影响的违约。v1 不为此
  保存 Session-lifetime payload fingerprint window。
- Default Protocol 首次接纳的新 `call` 必须携带下一 Call Ordinal。一个 fresh `seq` 携带已用
  ordinal 是 identity-reuse Protocol violation，不因 service、method 或 args 相同而成为 retry；
  exact Request Replay 已在 message layer 处理。Custom Protocol 必须用自己的 delivery evidence
  提供等价 separation 与 non-reuse guarantee。
- 因此只要同一 retained Session 的 sequence、Call State 与 fencing evidence 连续，handler 对
  一个 Logical Call 至多 dispatch 一次。若 incarnation 或所需 evidence 丢失，不能静默创建
  replacement call；caller-visible settlement 遵守既有 `outcome unknown` 边界。

### Terminal ledger 与 evidence GC

- Sender 为每条 sequenced semantic message 保留 immutable `(seq, SemanticMessage)` replay
  payload，直到 peer 的
  Message Receipt ACK 覆盖该 `seq`。ACK 后立即从 replay queue 删除 payload：`call` 只剩本地
  pending-call control state，`cancel` 不再保留 replay payload，`result`/`error` 允许进入
  terminal Call State 回收。Transport Local Admission 不能替代 receipt evidence。
- Responder 在 handler 取得 detached arguments 后可从 ledger 释放 request snapshot，但必须
  保留 cancellation 与 terminalization 所需的最小 active entry。Handler outcome 必须先原子
  替换为 immutable terminal entry，再创建和发送唯一 `result` 或 `error` message；唯一 terminal
  winner 与 cancel/error races 由 unary-call ticket 决定。
- 每个 Remote Request Admission 在 dispatch 前已保留一个最小 terminal slot。Handler result 若
  无法 normalize、超固定 `1 MiB` envelope 或 ordinary terminal budget，使用该 slot 提交固定安全
  `handler-failed`，不能先提交巨大 result 再发现 replay 无处保存。
- Terminal message 未 ACK 时，Responder 必须保留同一 outcome 并在 Recovery 后以原 message
  identity 重放。Terminal ACK 后可以删除整个 per-call entry；无需 tombstone，因为
  `highestAdmittedCallOrdinal` 证明旧 identity 不能作为新 call 再次 admission。Call completion
  可以乱序：仍存在的 entry 表示 active 或 awaiting-terminal-receipt，已接纳 ordinal 范围内缺席
  的 entry 表示已经 retired。
- 每个方向的 `receivedThrough` 与 `highestAdmittedCallOrdinal` 保留到 Session terminal；它们是
  常数级历史 evidence。Session terminal 且 pending calls 按后续 terminal rules settlement 后，
  replay queue、per-call entries 与 high-watermarks 都可以释放。
- 未 ACK 的 request、cancel 或 terminal payload 不得为了满足容量限制而静默逐出。具体 message、
  call、byte、duration 与 ordinal/sequence exhaustion 上限由 resource ticket 固定；新的 local work
  在 admission 前以 `unavailable` 拒绝，existing evidence 只有在明确 Session terminal 后释放。

### Application idempotency 与后续边界

Session-scoped at-most-once handler dispatch 不等于 application side effect exactly once。Framework
不创建、解释、缓存或跨 calls/sessions 查询 idempotency key；application 可以把业务 key 作为普通
Application Value 参数并在 handler/外部系统中实现幂等。每次到达 Outgoing Call Admission 的
proxy method invocation 都是新的 Logical Call；发送前取消的 Pending Invocation 从未成为
Logical Call。Session terminal 或 `outcome unknown` 后 Framework 绝不以新 Call Identity自动重试。

Graceful `shutdown()` 不建立第二套 Call State：对 cutoff时 connected并纳入 draining snapshot的
Session，以及已经 counter-draining且加入 Owner grace barrier的 Session，cutoff前 Pending/Logical
Calls继续现有 admission、terminal与evidence-GC transitions；
post-cutoff expected call只走 protected Remote Resource Rejection；cutoff时 recovering Session则立即
force，Pending为 `unavailable`、已 admission且无 terminal的 call为 `outcome-unknown`。
只有所有 call entries/replay/ACK退休后 Session才 drained。显式 `close()` 或 shutdown force cutoff才
terminal剩余 Session并释放 evidence；未调用 send的 intent可以丢弃，已经 Outgoing Admission的 call
identity绝不回滚，caller按 issue 11得到 `outcome-unknown`。

本票不定义 terminal error taxonomy、cancel/result/error race precedence、proof/security mechanism
或 violation fault scope；它们分别留给
[决定 unary 调用、取消、错误与终止竞态](11-decide-unary-call-errors-cancellation.md)、
[决定顺序、并发、缓冲与恢复资源上限](13-decide-ordering-concurrency-resource-bounds.md)与
[决定 trust-boundary validation 与 Session Recovery 安全](14-decide-validation-recovery-security.md)。
本决议不增加 production Interface、公开 idempotency/retry seam 或 private Module 文件切分。
