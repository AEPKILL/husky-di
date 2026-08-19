# 决定顺序、并发、缓冲与恢复资源上限

Type: grilling
Status: resolved
Blocked by: 07, 09, 10, 11, 12
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

RPC framework 应如何调度 message、handler、ACK、cancel、terminal、Session-close 与 group work，
并提供哪些 ordering、fairness、control-plane progress、concurrency 与 backpressure guarantees？建立
Default Protocol 最大 encoded message 与所有 conforming Adapter 必须接纳的最小 outbound message
之间的跨 seam 不变量，使 Outgoing Call Admission 前可排除 poison replay。决定 Transport、decoded
record、pending invocation、并发 handler、send/replay queue、Session retention、terminal payload、
dedupe evidence、proof state 与 observation snapshot 的 finite limits、默认值、配置位置和作用域；
同时覆盖 owner-wide concurrent Connections/handshakes/fresh Sessions/peers/resume attempts 与 aggregate
retained bytes，而不只限制单条 Connection。决定 activity probe/silence timeout、send progress、
Recovery grace、retention/eviction、shutdown deadline、sequence/ordinal/epoch exhaustion、overload与慢
handler 到既有 unary outcomes 的映射。Framework event 应复用已有 budgeted normalized snapshot，
notification 后不额外保留 payload；subscriber 自行保留不计入 Framework budget。group work 只调度
[验证稳定 Remote Service Group](12-validate-stable-remote-service-group.md)定义的语义。

## Answer

v1 采用一组分层的 finite budget，加一个只存在于 Framework/Protocol Implementation 内部的
scheduler。公开 Interface 不暴露 queue、lane、permit、priority、pause/resume 或 scheduler
plugin；调用者只配置少量 owner-wide policy，所有 Protocol 与 Adapter 则必须满足一个固定的
`1 MiB` message compatibility invariant。资源不足必须在仍有 Definite Non-Execution evidence
时变成 `unavailable`，已经 admission 的 replay、terminal 或去重 evidence 绝不为腾空间而逐出。

### 跨 Protocol/Adapter 的固定 compatibility profile

所有 conforming v1 Protocol 的一次 `IRpcConnection.send()` 都不得超过 `1,048,576` bytes；所有
conforming Transport Adapter 在正常、空的本地发送路径上都必须接纳任意不超过该大小的完整
message，不能因自己的 single-message hard limit 更小而 reject。Adapter 可以支持更大的 raw
message，但 Protocol 不得依赖；改变这个公共上限属于新的 semantic profile，而不是 owner option
或 handshake negotiation。

`husky-di-rpc/1` 进一步固定以下输入边界。Bytes 均指 well-formed UTF-8 bytes，而不是 JavaScript
`.length`；root depth 计为 `1`：

| Dimension | v1 hard limit |
| --- | ---: |
| 完整 encoded Transport message | `1,048,576 B` |
| 一份 args/result Application Value 的 compact JSON budget weight | `1,000,000 B` |
| JSON depth | `64` |
| 单个 decoded string | `524,288 B` |
| object member name、profile/Session/call/service/method 等 Protocol identifier | `256 B` |
| 单个 object 的 members | `1,024` |
| 单个 array 的 elements | `8,192` |
| 单 record 的 JSON nodes | `65,536` |
| 每 originating direction 尚未退休的 Logical Calls | `256` |

Compact JSON budget weight 使用无空白、最短 round-trip number、最少必要 string escape 的 UTF-8
长度递归计算；record member order 不改变其总 weight。它是确定性的防护权重，不声称等于 V8 heap
或 Codec 临时 allocation。发送端必须在 caller-owned value 被保留、Call Identity 被分配或
handler terminal 被提交前完成这些检查；超出固定 Application Value shape/weight 是异步
`TypeError`，而不是动态 capacity failure。Receiver 则在普通 object materialization 前同时完成
UTF-8、duplicate member、depth/member/element/node/byte checks；不可信 length 不能先驱动完整
allocation。

Default Protocol 对新 semantic intent 必须在 Outgoing Admission 前，用同一 deterministic encoder、
最大合法 `seq`/`callId` 宽度以及存在时的最大宽度 `ackThrough` 验证最坏 envelope 不超过 `1 MiB`。
通过后才提交 immutable semantic pair，因而后续 ACK 位数增长或 Recovery re-encode 不会制造
poison replay。Custom Protocol 可以采用别的 Codec/fragmentation internals，但每次 public
Connection send 仍受 `1 MiB` 限制，并必须完整承载所有符合共同 v1 Application Value limits 的
调用。

Transport 的 native payload、inbound/outbound queued-message 与 queued-byte cap 继续属于具体
Adapter factory 的 typed configuration：必须 finite、不得提供 unbounded mode，并在 package
acceptance artifacts 中记录默认值和边界测试。Core seam 不虚构一个对所有 WebSocket 与 stream
都有意义的公共 queue 数值或 capacity getter。唯一跨 Adapter 的固定数值是上述 `1 MiB` 能力；
配置小于它的 Adapter 不 conform。Node stream 能暂停时应 backpressure；浏览器 message API 若在
callback 前已 materialize 整条消息，只能避免第二次无界 copy 并立即关闭 oversized Connection。

### 默认 Session 与 Owner budgets

每个 retained Session 的默认 Protocol/Framework budget 如下；所有 byte category 最终仍受
`32 MiB` 总 cap，不能通过分别命中子 cap 把总量相加突破：

| Session resource | Default |
| --- | ---: |
| Connection ingress backlog | `64 records / 8 MiB` |
| Pending Invocations | `256 entries / 8 MiB` |
| unretired call entries | `256 / originating direction` |
| incoming handler work-set | `256 jobs / 8 MiB args` |
| running handlers | `16` |
| immutable replay queue | `1,024 records / 16 MiB` |
| retained terminal application payloads | `256 records / 8 MiB`，且属于 replay cap |
| all retained Session state | `32 MiB` |
| protected control/terminal reserve | 上述 `32 MiB` 中专留 `512 KiB` |
| retained proof/key/nonce state | `64 KiB`，且属于 protected reserve |

每个 pending、ledger、handler-job 与 replay entry 除 payload weight 外至少再计 `256 B` 固定权重，
防止大量 tiny values 绕过 byte budget。共享 payload 在一个 entry 内不重复计费；Remote Service
Group 的每个 child 仍按一个独立 call entry 和完整 value weight reservation 计费，即使
Implementation 复用同一 immutable JavaScript snapshot。这让一次 group normalization 不变成绕过
owner aggregate budget 的通道。

Protected reserve 在 Session 创建时即从 owner aggregate budget 扣除，只能保存累计 ACK、
Ping/Pong、cancel、固定安全 error、Session-close、retained proof state 以及最多 `256` 个 call 的
最小 terminal disposition。Protected budget charge 具有固定上界：每个 terminal disposition 连同
safe-error replay/entry metadata 最多 `768 B`，每个 cancel replay/entry 最多 `384 B`，coalesced
ACK、Ping、Pong 与 Session-close 各最多 `512 B`，proof/key/nonce state 总计最多 `65,536 B`。
因此最坏 `256 * 768 + 256 * 384 + 4 * 512 + 65,536 = 362,496 B < 512 KiB`，剩余空间保存固定
counter/scheduler metadata。Custom Protocol 必须在相同 semantic charges 内表示这些 control facts，
不能以更肥的 private encoding 吃掉 ordinary state。每个进入 handler work-set 的 call 必须同时预留
一个固定 terminal slot；application result payload 另走普通 terminal/replay budget。普通 work
不得借用 reserve。

一个 Acceptor 的默认 owner-wide profile 是：

| Owner resource | Default |
| --- | ---: |
| retained Sessions / peers | `64` |
| simultaneous bootstrap handshakes | `16` shared fresh/resume slots |
| owned current/handshaking/fenced-closing Connections | `97`：`96` ordinary + `1` Acceptor overflow-close |
| running handlers | `64` |
| aggregate retained state（包含所有 protected reserves） | `64 MiB` |

普通 `96` 是默认的 `maxSessions + 2 * maxHandshakes`，Acceptor另永久预留一个不可借用的 emergency
overflow-close slot，总 hard cap为 `97`。尚未 settle 的 Direct Close endpoint仍占原 ordinary/overflow
slot；ordinary slots已满后的下一次 `connection$` emission占 overflow slot，Owner必须在 notification
返回前同步 abort listener/gate，但只能在 barrier返回、ownership生效后的首个 continuation Direct
Close该 Connection。Adapter的同步 abort gate禁止后续 handoff；ready前 listen以 `AbortError` reject，
ready后 source normal complete，listener都投影 intentional normal stopped。Overflow close settle且
ordinary capacity恢复后才可用新 Adapter重启。
Connector没有 push listener或 overflow slot，Session上限固定为 `1`。Owned-Connection cap 或全部
bootstrap handshake slots 在
first-record parse 前已满时，Owner 不能分配 bounded `1 MiB` work set、分类 fresh/resume 或生成
Protocol reject，因此只 Direct Close该 attempt。已取得 handshake slot并完成 bounded classification
后，fresh Session/aggregate cap不足才发送 `admission-rejected`；resume-specific binding/Session
capacity不足才发送同形 `resume-rejected`。Fresh Session admission 必须先原子预留 control reserve；
任何 admission failure 都不驱逐 existing connected/recovering Session。v1 没有 LRU、idle 或
pressure-based Session eviction；成功 Session只因明确 terminal、owner shutdown 或下述 Recovery
deadline 回收。

Owner factory 在 cold construction 时 snapshot 一份 immutable runtime policy。最终 TypeScript
shape 由 issue 17/19 验证，但语义 knobs 只包含：

```text
maxSessions                         = 64  // Connector 固定为 1
maxHandshakes                       = 16
maxPendingInvocationsPerSession     = 256
maxRetainedBytesPerSession          = 32 MiB
maxRetainedBytesTotal               = 64 MiB
maxHandlersPerSession               = 16
maxHandlersTotal                    = 64
ackDelayMs                          = 50
activityProbeIntervalMs             = 30_000
silenceTimeoutMs                    = 120_000
sendProgressTimeoutMs               = 30_000
bindingAttemptTimeoutMs             = 30_000
recoveryGraceMs                     = 300_000
shutdownDeadlineMs                  = 5_000  // grace phase与cleanup phase各自的 absolute interval
```

不公开每个 internal sub-cap、reserve ratio 或 connection formula 的第二套 knobs。Count caps 由
固定 `256` calls 派生：replay entries 是 `4 * 256`，ingress backlog 是 `64`；byte 子 cap 分别是
`maxRetainedBytesPerSession / 4`（ingress、Pending、incoming args、terminal payload）与
`maxRetainedBytesPerSession / 2`（replay），且总 cap 始终先于子 cap；所有 byte division 向下取整。
因此构造时还必须要求 `maxRetainedBytesPerSession >= 4,194,304`，保证每个 `/4` 子cap至少能接纳
固定 `1 MiB` compatibility floor；不能只用“一个最大message + protected reserve”的较弱下界。
Acceptor ordinary owned Connection cap 是 `maxSessions + 2 * maxHandshakes`，另加固定一个不可借用的
overflow-close slot。Handshake slots由 fresh/resume共享；v1不声称在 indistinguishable first record
之前为 resume提供抗 fresh-flood隔离，deployment仍需 Adapter/application rate limit。Policy 没有
runtime setter、per-peer override、`Infinity` 或 handshake
negotiation。Construction 必须同步拒绝非 positive finite safe integer 和不一致组合；至少要求
`silenceTimeoutMs >= 3 * activityProbeIntervalMs`、`ackDelayMs <= activityProbeIntervalMs`、
`bindingAttemptTimeoutMs <= recoveryGraceMs`、`maxHandshakes >= 1`、owner handler cap
不小于 per-Session cap、每 Session byte cap 足以保存一个最大 message 与 protected reserve，并且
`maxRetainedBytesTotal >= (maxSessions - 1) * 512 KiB + maxRetainedBytesPerSession`，从而至少允许一个
Session 用满其 cap、其余 Session 保有 control reserve。所有 derived multiplication/addition 先做
safe-integer overflow check；Connector 的 effective handshake/session count 都是 `1`。Custom
Protocol runtime 接受 Framework 已 normalized 的同一 policy，但不向 caller 暴露
Protocol-private bag。

### Outbound scheduler、ACK 与公平性

每个 current Connection 同时至多一个 unsettled `send()`。Scheduler 不能抢占它；send 超过 progress
deadline 时必须 fence 当前 binding 并 Direct Close，而不是只让本地 `Promise.race()` 超时后继续
复用 Connection。旧 epoch 的 late fulfillment/rejection 都是 fenced no-op，已经调用 `send()` 的
identity/replay entry 绝不回滚。

一个 Session 只需保存 replay cursor、一个 terminal/cancel control FIFO、一个 Pending Invocation
FIFO、一个累计 `ackDirtyThrough`、current send 与 control/data fair turn：

1. bootstrap record 独占 bootstrap phase；
2. Default Protocol active phase 收到的 Ping 只建立一个 coalesced Pong，Pong 不再触发回复；probe
   lane 与 sequenced lane 也 bounded-alternate：一个 Ping/Pong send 后，若 sequenced work ready，至少
   放行一条 sequenced send 后才能再发 probe。多个期间内 Ping 只合并为一个 due flag，因此合法
   Ping flood 不能饿死 replay/terminal/call；
3. 新 binding 安装时冻结一个有限 replay barrier，先严格按原 `seq` 重放全部 retained entries；
   barrier 期间可以收集新 work，但不得为它分配新 `seq`，新 work 也不能延长 barrier；
4. barrier 后，terminal 与 cancel 按 intent linearization 共用一个 FIFO，Pending Invocation 按创建
   顺序使用另一个 FIFO；两者同时非空时交替选择，初始 turn 为 control；
5. 新 intent 只有取得 idle send slot 后才执行最坏 envelope/capacity preflight、分配 identity、提交
   replay pair 并在同一个无 `await`、不可重入步骤调用 `send()`；
6. duplicate cancel 只更新 retained call flag，不创建第二个 queue item；
7. ACK cursor 只保留最新累计值。任意 semantic/replay envelope piggyback 最新 ACK；第一次变 dirty
   后启动不可 sliding 的 configured `ackDelayMs`（默认 `50 ms`）deadline。Deadline 只把一个
   coalesced AckOnly 标成 ready；若已有 unsettled send，实际调用 `send()` 等下一个 idle slot，额外
   延迟由 `sendProgressTimeoutMs` 有界。不能为每个 receipt 建队列项。

因此在 replay 集合有限且 send 最终 settle 或被 progress deadline 关闭的前提下，control 与 new
call 的队首最多各被另一 lane 的一次 send 延迟；持续 cancel/terminal 不会饿死普通 call，持续
call 也不会阻止 control-plane progress。Direct Connection Close 永远不需要 send slot。Graceful
`shutdown()` 对 cutoff时 connected并纳入 draining snapshot、或此前已 counter-draining并加入 Owner
grace barrier的 Session继续上述 Pending/replay/control/handler调度，但不接纳新的 local invocation；post-cutoff remote call只进入
protected `unavailable` disposition。一个 Session只有 Pending/call/handler/replay/control全部退休、
replay barrier完成、ACK clean、send idle、无 ingress disposition且 bounded ingress backlog为空时才
drained，随后最高优先发送一次 unsequenced top-level Close；probe due不阻止 drain。所有 peers共享
configured `shutdownDeadlineMs`（默认 `5 s`）grace interval。显式 `close()` 或 grace timeout进入
force，丢弃未调用的 queue intent并直接关闭，不等待 send slot；force cleanup另受同长度 owner-wide
interval约束。精确 choreography由 issue 18定义。

### Ingress ordering 与 handler permits

Connection Driver 必须按 Transport emission order 串行完成 lexical/schema/resource validation、
sequence/Call State mutation、snapshot/event batch，再把 handler job 或 outbound control intent 放入
bounded queue；handler 永远不 inline 阻塞 record ingress。正常 Observable callback 在返回前完成
一个 record 的 disposition，不建立第二份 decoded-record retention；只有 synchronous reentrancy
进入 bounded ingress backlog，其 bytes/entry weight 计入 Session 与 owner aggregate cap。Bootstrap
admission 为每个 handshake slot固定预留 `4 MiB` transient budget weight，分别覆盖最多 `1 MiB` 的
Adapter/raw carrier、最多 `1 MiB` 的 bounded Codec/tree representation、最多 `1 MiB` 的 JCS/crypto
input，以及最多 `1 MiB` 的 accept/reject output与固定 parser/crypto bookkeeping；表示之间能复用也不
降低这笔 reservation，JCS/output自身仍各自受 `1 MiB` hard cap。默认 16 slots 的 owner transient
handshake budget因此是 `64 MiB`，独立于 retained-state `64 MiB` cap，并由
`4 MiB * maxHandshakes` 以 safe derived arithmetic计算。它是确定性 admission weight，不声称等于
V8 heap；Implementation仍应尽早释放 raw/tree/JCS临时引用。Ingress backlog 超限时不能 drop、skip
或 ACK 未 disposition 的 expected-seq record，而应按 security ticket 的 Session fault 规则关闭。

WebCrypto digest/HMAC没有 portable cancellation。任何已经启动的 crypto job即使 attempt timeout、
endpoint fence或owner cutoff先赢，也继续占原 handshake/crypto permit与完整 `4 MiB` transient charge，
直到底层 Promise真实 settle；late candidate只由 fenced sink消费。最多因此留下
`maxHandshakes` 个 crypto zombies，可降低可用性但不能形成无界 job/input retention，也不能提前复用
permit启动更多 crypto work。

Handler scheduler 保持每 Session FIFO start order，并在有 ready work 的 Sessions 间
round-robin，同时取得 per-Session 与 owner-wide permit。跨 Session 不承诺全局 start/completion
order；同一 Session 的 completion 也可以乱序，结果按各 call 的 terminal linearization 进入 control
FIFO。Queued job 在 dispatch 前被 cancel terminal 赢得时绝不调用 handler。Running handler 即使
caller cancel 或 Force Cutoff 已选择 terminal，也必须等其真实 Promise settle 才释放 execution permit；
否则不合作的 handler 可通过“启动后立即 cancel”制造无界并发。Framework 不抢占任意 JavaScript、
不为普通 handler 设置执行 timeout；永不 settle 的 handler 永久占一个有限 permit，但不阻塞
receipt/cancel/duplicate/fencing ingress。

Remote Service Group 不增加 group queue 或 semaphore。Common preflight 后必须一次性预留 snapshot
中全部 `N` 个 child 的 Pending Invocation count、value weight 与 owner aggregate budget；失败时
outer Promise reject `unavailable` 且创建零 child。成功后每个 child 进入对应 Session 的普通 FIFO；
同一 peer 保持既有 ordering，跨 peers 不承诺实际 send 顺序。

### Activity、half-open 与 Recovery retention

Default Protocol active phase 使用 connection-local `{ kind: "ping" }` / `{ kind: "pong" }`。双方在 configured
`activityProbeIntervalMs`（默认 `30 s`）没有 valid inbound activity 时发送 Ping；收到后必须
coalesce 并调度一个 Pong，Pong 不再回复。两者不
分配 `seq`、不重放、不被 ACK，也不进入 Call State。任意通过完整 phase/schema、当前 binding
fencing 与 issue 14 active-integrity 验证的 inbound record 都算 activity；raw bytes、
malformed/stale-binding input 不算。显式 request/response 使两端即使配置不同 probe interval，也不
会因 AckOnly 不要求回复而把健康 idle binding 误判为 half-open。

Custom Protocol 不使用 Default JSON `kind`；它必须提供等价的 bounded connection-local
request/response activity mechanism，满足不进入 call/replay identity、response 不递归、coalescing、
probe/sequenced bounded alternation 和相同 timeout state effects。

正常获得 runtime 调度且连续一个 configured `silenceTimeoutMs`（默认 `120 s`）没有 valid inbound
activity，或一次 send 连续一个 configured `sendProgressTimeoutMs`（默认 `30 s`）没有 settle 时，
Framework 在一个线性化点先 fence/detach binding、提交 `connected -> recovering` 并发出
既有 observation，然后 Direct Close。不能先等 `close()` 或 Adapter terminal。Logical Calls、
replay 与 Pending Invocations 都保留；Connector 不自动拨号，caller 观察 recovering 后仍提供新的
one-shot Adapter，Acceptor 则等待 listener 交接 resume Connection。

Fresh/resume attempt 使用 configured `bindingAttemptTimeoutMs`（默认 `30 s`）absolute、non-sliding
deadline；fresh timeout 回到 unbound，resume timeout 保持 recovering，且失败 attempt 不延长
Session deadline。Recovery grace 与 retention 合并为从真正 loss/fence current binding 起算的
configured `recoveryGraceMs`（默认 `5 min`）absolute deadline：成功 resume 取消，攻击
bytes、失败 attempt 与局部 activity 不重置。Deadline 和 resume accept 竞争同一 state slot；到期
不做 silent eviction，而是明确 Session terminal。尚未 Outgoing Admission 的 draft 变
`unavailable`，已 admission 且没有 authoritative terminal 的 call 变 `outcome-unknown`，既有
terminal winner 不改判。

JavaScript timer 只承诺 runtime 再次获得调度后收敛。Health/send timer 记录 expected fire time；
若 callback 迟到超过一个对应 interval，视为 local scheduler stall，不能仅凭陈旧 elapsed time
立即误判网络。恢复调度后，health path 先尝试 admission 一个 activity probe并获得新的完整
confirmation window；已有 unsettled send 无法插入 probe，只获得一个新的完整 progress window。
按时执行后仍无 activity/progress 才 fence。只有已经处于 recovering 的 Session 才有 Recovery
retention deadline，且该 wall-clock deadline 不被 scheduler-stall suppression 延长；仍为 connected
时发生的冻结本身不预先消耗一个尚未开始的 Recovery interval。测试使用 private monotonic
clock/scheduler，不公开 platform visibility 或 load-estimator seam。

### Overload、terminal reserve 与 exhaustion mapping

普通 incoming work capacity 不足不能把一个合法 expected-seq call 留成永久 replay poison。Call
record 通过 fixed profile、sequence 与 ordinal validation 后，Receiver 在同一个线性化点二选一：

```text
absent -> in-progress                    Remote Request Admission；允许 dispatch
absent -> terminal(unavailable)          Remote Resource Rejection；保证不 dispatch
```

第二条推进 `receivedThrough` 与 `highestAdmittedCallOrdinal`，从 protected reserve 提交一个可重放的
固定 terminal disposition，但不保留 args、不发 incoming `call-started`、不调用 handler；它不是
Remote Request Admission。Receipt ACK 因 durable disposition 可以推进，随后 authoritative
`unavailable` 给 caller Definite Non-Execution。若一个遵守 `256` outstanding-call limit 的 peer 仍
令 protected reserve 无法保存这个 disposition，Session 已无法安全继续，只能发生 Session-scoped
resource/protocol fault；不能断线后让同一 record无限 Recovery。

具体 mapping 固定为：

| Boundary | Outcome |
| --- | --- |
| caller value 超 fixed shape/weight | async `TypeError`；无 Pending Invocation |
| 单 call Pending/count/ordinary byte reservation 不足 | `RpcError(unavailable)`；Definite Non-Execution、无 identity/event |
| Group common reservation 不足 | outer `unavailable`；零 child |
| incoming ordinary handler-work budget 不足、reserve 可用 | remote terminal `unavailable`；不 dispatch |
| handler result invalid、超 fixed envelope 或 ordinary terminal budget | 预留的固定 `handler-failed` terminal |
| Adapter framing/queue/oversize terminal（包括 active binding） | Generic Connection failure；Adapter seam 无可信分类，按既有 Recovery 处理 |
| bootstrap malformed/oversized Protocol input | Connection/attempt fault；尚无 Session 时不得扩大 scope |
| protected current endpoint input 已进入 Codec后违反 fixed profile、fresh sequence gap 或 reserve 本身失效 | Session-scoped Protocol/resource fault；不伪装成 call error |
| pre-bootstrap owned-Connection/handshake slot不足 | 不 parse、不生成 Protocol record，Direct Close attempt；不影响 siblings |
| 已取得 handshake slot后的 fresh Session/aggregate cap不足 | attempt-scoped `admission-rejected`；不影响 siblings |
| 已取得 handshake slot后的 resume-specific binding/Session capacity不足 | 同形 `resume-rejected`；原 Session 保持 recovering 到既有 deadline |
| Adapter temporary pressure | 当前 send pending；形成 backpressure |
| send 已调用后 reject/timeout | binding failure/Recovery；不能恢复 pre-send guarantee |
| 慢或永不 settle handler | 占一个有限 permit；没有 Framework execution timeout |

`seq`、Call Ordinal 与 Binding Epoch 都保持 safe-integer、never-wrap。每个发送方向把最后
`512 = 256 peer-call terminals + 256 local-call cancels` 个 sequence values 固定为
exhaustion control window；application call 或其他 ordinary admission 若会侵入该 window，必须在
分配前进入 drain。Window 内只允许消费已有/同时在途 peer calls 的 terminal、已有 local calls 的
至多一个 cancel，不能重新借给 ordinary work；Session-close是 issue 18 的 unsequenced active control，
不消耗 `seq`。因每 originating direction 最多 256
unretired calls，公式覆盖最坏 obligation。不得等到分配失败才发现已有 call 无法 terminalize。
进入 drain 后停止新的 local application admission，remote新 call只做 protected rejection，以 issue 18
相同的 finite graceful criterion收敛已 admission work并尝试 unsequenced Session-close；该 Session
自己的 grace与cleanup phase各使用 configured `shutdownDeadlineMs`，deadline后 force且 broken close
cleanup可 fence/detach，但 Acceptor Owner与 siblings保持 active。Public peer投影
`draining(counter-exhaustion)`。Call
Ordinal 无下一值时整个 Session进入 `draining(counter-exhaustion)`；drain自然停止两个方向的新local
application admission，而不是让public peer继续显示connected但单向永久不可用。最后一个 Binding Epoch
可以维持当前 binding，但不能再 Recovery。最后一个 `resumeAttempt` 可以尝试并建立 binding；若它未成功，或该
binding后来丢失而无下一值，initiator立即以 counter-exhaustion terminal Session，Pending/Logical Call
分别映射 `unavailable`/`outcome-unknown`。任何 counter 都不 wrap、不随机重置，也不通过新 Session
identity静默继续旧 calls。

Framework event 是 payload-free，只借用已经计入 owner state 的 immutable peer/metadata snapshot
完成当前 notification batch；args/result/details 与 raw errors根本不进入 event，也不建立 redaction
copy。Subscriber 或 handler 在自己拥有的边界主动保存 application value属于 application-owned
memory，不计入 Framework budget；Framework 能承诺的是自身不做第二份无界 retention，而不是限制
任意用户代码的 heap。

本票不增加 production code、不实现 Transport Adapter，也不决定 issue 14 的 proof/authentication
机制、issue 18 的精确 shutdown record choreography 或 issue 17/19 的最终 TypeScript property
placement。
