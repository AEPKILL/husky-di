# 可恢复 RPC 的交付保证：一手资料核验

核验日期：2026-08-17

## 研究问题

透明 Logical Session Recovery 在 request 可能已经执行、response 却丢失时，能够诚实提供什么
保证？尤其需要区分：

- Physical Connection 或 frame 的交付；
- request 是否已被 Protocol 接纳；
- handler 是否已经 dispatch；
- handler 是否已经完成；
- terminal outcome 是否已被可靠记录、发送或被 caller 收到；
- application 的外部副作用是否只发生一次。

本报告只使用正式协议、原始论文和一方实现文档。历史 research branch 不作为证据。

## 结论

`@husky-di/remote` v1 可以诚实承诺的上限是：

> 在同一 retained Logical Session incarnation 内，恢复被明确接受、旧 Physical Connection
> 被排除、call ledger 与所需 replay state 连续时，以原 call identity 延续 Logical Call，保证
> handler 至多 dispatch 一次，并重放已经记录的同一个 terminal outcome。

它不是无条件的 exactly-once RPC，也不等于 application 外部副作用 exactly once。若 request
可能已经被接纳，但 Session、in-progress entry、terminal outcome 或必要的 dedupe evidence 已经
丢失，caller-visible 结果必须是 `outcome unknown`；Protocol 不得把它伪装成“确定未执行”或用新
call identity 自动重试非幂等操作。

NFSv4.1 展示了更强的 EOS，但它依赖受限的 request space、持久 reply cache，以及 request
execution 与 cache placement 的原子性；这些条件不能被普通 RPC framework 无条件假定。

## 关键术语

- **Physical attempt**：一次在某条 Physical Connection 上发送或重发 request 的尝试。
- **Logical Call**：以稳定 call identity 标识、可跨多个 Physical attempt 延续的一次调用。
- **Session incarnation**：一段共享 identity、call ledger、replay boundary 和 connection-fencing
  状态的 Logical Session 生命周期；重启后若这些状态没有延续，就是新的 incarnation。
- **Request admission**：Responder 已把 call identity 与 request 语义绑定到权威 call ledger，
  从此重复 request 不得再次 dispatch handler。
- **Terminal outcome**：一次 Logical Call 唯一且不可变的 success result 或 terminal error。
- **Dedupe evidence**：足以识别旧 request 的完整 ledger entry、轻量 tombstone、sequence
  high-watermark 或等价证据。
- **Outcome unknown**：caller 无法证明 request 未执行，也无法取得可信的既有 terminal
  outcome；它描述知识边界，不是普通的 transient retry error。

## 一手资料及其直接结论

### 1. 经典 RPC：失败返回天然可能是“执行零次或一次，但 caller 不知道”

Birrell 与 Nelson 的原始 RPC 论文把成功与失败语义分开：成功返回时，server procedure 被调用
一次；若 runtime 报告通信或 crash 异常，procedure 可能执行过一次，也可能完全没有执行，caller
无法区分。论文还明确说明，只要 server runtime 继续响应 probe，系统不会因为 handler deadlock
或 loop 自动给出时间上界。因此安全性的 at-most-once 不同时提供 liveness。

论文的 duplicate suppression 使用由 caller machine、process/activity 与单调 sequence 组成的
call identifier；callee 保存各 activity 最后执行的 sequence，重传的旧 call 可作为 duplicate
丢弃。server 可以在旧 packet 不再可能到达后回收 idle state，但 machine restart 必须有新的
conversation/incarnation identifier，否则新调用可能被误认成旧 duplicate，或旧重传可能进入新
incarnation。

来源：[A. Birrell、B. Nelson, *Implementing Remote Procedure Calls*, §3.1–3.3,
ACM TOCS 2(1), 1984](https://birrell.org/andrew/papers/ImplementingRPC.pdf)
（[DOI](https://doi.org/10.1145/2080.357392)）。

这直接支持三个边界：

1. response 丢失或连接故障不能单独证明 handler 未执行；
2. call identity 与 retained duplicate state 是 at-most-once 的必要条件；
3. retained handler 可以无限 pending，Recovery 本身不创造 liveness。

### 2. NFSv4.1：EOS 需要 Session-scoped identity、bounded reply cache 与原子持久化

[RFC 8881 §2.10.6](https://www.rfc-editor.org/rfc/rfc8881.html#section-2.10.6) 为
NFSv4.1 Session 定义 EOS。它没有只依赖 ONC RPC XID，而以
`{session ID, slot ID, sequence ID}` 标识 request。每个 slot 同时保存 sequence high-watermark
与对应 cached reply；相同 sequence 是 retry，完成后返回原 cached reply，正在执行时可返回
`NFS4ERR_DELAY`；跳号或旧号被拒绝。slot 数量限制了最大并发 request，也让完整 reply cache
具有可计算的上界。

- [§2.10.6.1 Slot Identifiers and Reply Cache](https://www.rfc-editor.org/rfc/rfc8881.html#section-2.10.6.1)
  说明 slot/sequence 如何区分新 request、retry 和 misordered request，以及为什么 bounded slot
  table 使 reply retention 可行。
- [§2.10.6.1.3.1 False Retry](https://www.rfc-editor.org/rfc/rfc8881.html#section-2.10.6.1.3.1)
  把“相同 identity、不同 operation/arguments/principal”视为 false retry，而不是一个新的合法
  request。这验证了 call identity 必须同时绑定稳定的 request semantics。
- [§2.10.6.2 Retry and Replay of Reply](https://www.rfc-editor.org/rfc/rfc8881.html#section-2.10.6.2)
  允许连接断开后在同一 Session 的新连接上重发同一个 request；若原 request 仍在执行，不能
  并行重做它，必须让原执行完成并进入 reply cache。
- [§2.10.6.5 Persistence](https://www.rfc-editor.org/rfc/rfc8881.html#section-2.10.6.5)
  要求 persistent Session 至少保存 session ID、slot table、sequence ID 与 cached reply。
  request execution 与 result placement 必须原子；重启后的合法结果只能是原 cached reply，或
  明确报告 client/session state 已丢失。只持久化 reply table 而没有其余 Session state时，新
  request 必须以 `NFS4ERR_DEADSESSION` 拒绝。

RFC 还明确指出，若没有 stable reply cache 和相应 restart/persistence 条件，完整 EOS 不成立。
对于任意 application handler，若业务副作用与 terminal ledger 不在同一事务或同一幂等系统中，
Protocol 无法把 NFS 的紧耦合原子性推广到业务数据库、支付系统或第三方 API。

### 3. RSocket Resume：frame continuity 不等于 application execution continuity

RSocket 的正式 Protocol 定义把 resume 描述为可选且 optimistic 的能力。它只适用于两端在连接
丢失期间都保留状态的情况；server 可以因 token 无法识别、required position 不在 retained
range 或其他原因返回 `REJECTED_RESUME`。成功 resume 通过两端的 implied frame positions 确定
从哪里重传 retained frames。

更关键的是，该规范明确不对已交付 frame 对应的 application state、atomicity 或 transactionality
作出假设。Keepalive/position 信息可以用于裁剪 retransmit buffer，但它只证明 frame history 的
位置，不证明 handler admission、handler completion 或 terminal ledger durability。

来源：[RSocket Protocol, Resuming Operation，固定 commit
`0f6e555`](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#resuming-operation)。

这说明 Transport/Protocol frame replay state 与 call-level ledger 必须分层：恢复了 frame range，
不代表已经恢复了 at-most-once handler dispatch 或 terminal replay 的证据。

### 4. Transport ACK 只证明 Transport 层事实

[RFC 9293 §3.4](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.4) 将 TCP ACK 定义为累计
确认某个 sequence 前的 octets 已被接收，并用它从 retransmission queue 移除 segment。它没有
表达上层 message 已通过语义校验、request 已被 Protocol 接纳、handler 已运行，或外部事务已经
提交。

结合 RSocket 对 position 的明示限制，可以得到：Physical Connection `send()` 成功、TCP ACK、
frame receive position 或 replay ACK 都不能代替 request-admitted/terminal-recorded 证据。

### 5. 只有“确定未进入 application”才能透明地安全重试

gRPC 的一方 retry 文档区分了不同 failure stage。没有显式 retry policy 时，transparent retry
只发生在实现能够确定 RPC 没有被 server 处理的低层竞态：request 从未离开 client 时可以重试；
request 到达 server library、但尚未被 application logic 看见时只能进行受限透明重试。一旦收到
response headers，该 RPC 对 retry engine 已 committed，不再透明重试。

来源：[gRPC Retry — How retry works / Transparent Retry](https://grpc.io/docs/guides/retry/#transparent-retry)。

RSocket 也在 error vocabulary 中区分：`REJECTED` 保证 responder 没有处理 request；
`CANCELED` 则明确允许已经开始处理并产生 side effects。

来源：[RSocket Protocol — Error Codes](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#error-codes)。

因此，“确定未执行”必须来自明确的 admission evidence，而不能从“没收到 response”“socket
closed”或“cancel 已发送”推断。

### 6. 非幂等 request 的自动 retry 必须知道原 request 未应用，或有 application 幂等性

[RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2) 规定：client 不应自动
重试非幂等 request，除非它知道 request semantics 实际幂等，或能检测原 request 从未被应用。
连接在 response 读取前关闭并不能证明原 request 没有成功。

Stripe 的一方 idempotency contract 展示了 application-level dedupe 的典型条件：client 提供唯一
key；server 保存第一次执行的 status/body；同 key 重试返回相同结果；同 key 不同参数报错；key
至少保留 24 小时，裁剪后复用会成为新 request。它还区分 validation/concurrent-conflict 等尚未
开始 endpoint execution 的情况，此时没有保存 outcome，允许重试。

来源：[Stripe API — Idempotent requests](https://docs.stripe.com/api/idempotent_requests)。

这验证了两点：identity 必须绑定 request semantics；任何 dedupe 保证都有清楚的 scope 与 retention
期限。超过期限后若无法证明旧执行不存在，RPC framework 必须暴露保证终止，而不是静默生成一次
“安全重试”。

### 7. Deadline 与 cancellation 不会回滚已经发生的工作

gRPC 明确指出 client/server 对同一 RPC 可以得出不同的本地 terminal 判断，例如 server 已成功
发送 response，而 client 因 deadline 认为失败；取消以前产生的改变不会回滚。

来源：[gRPC Core concepts — RPC termination and cancelling an RPC](https://grpc.io/docs/what-is-grpc/core-concepts/#rpc-termination)。

因此 deadline、caller `AbortSignal`、remote cancel 或 owner close 只能表达停止等待或协作终止
意图。除非 responder 返回“未 admission”的明确证据，否则它们不能证明 handler 未运行，也不能
证明外部副作用已撤销。

## 从证据推导出的最小安全模型

以下不是对上述协议的逐字照搬，而是维持相同安全性质所需的推导。

### 1. Identity 必须有 incarnation scope 并绑定 request semantics

每个 call identity 至少在一个 Session incarnation 内唯一：

```text
(session-incarnation, caller-direction, call-id)
```

所有 Physical attempt 和 Recovery replay 必须沿用原 identity。Responder admission 时还必须绑定
经验证、规范化后的 service、method、arguments 及其他影响执行的字段，或绑定它们的稳定 semantic
fingerprint：

- 相同 identity、相同 semantics：关联既有 in-progress entry，或重放既有 terminal outcome；
- 相同 identity、不同 semantics：Protocol violation / identity conflict，绝不能 dispatch；
- 新 incarnation：不得继承旧 incarnation 的 identity 意义，除非其完整状态被明确持久恢复。

仅有随机 call ID 不足以解决旧连接、重启或错误复用；Session incarnation、binding epoch/lease 与
旧 Physical Connection fencing 必须共同保证只有一个权威 call ledger 能执行 admission。

### 2. Admission 必须先于 handler dispatch

为保证 at-most-once handler dispatch，Responder 必须在 application handler 可见 request 之前，
原子或串行地建立权威 entry：

```text
absent -> in-progress(request fingerprint) -> terminal(immutable outcome)
```

重复 request 命中 `in-progress` 时不得再次 dispatch；它只能继续等待原 handler。命中 `terminal`
时只能返回同一个 outcome。多个 Physical Connections 若可同时进入不同 ledger，就无法提供此保证，
所以 successful replacement 必须先建立单一 owner/fencing，再允许 call traffic。

### 3. Terminal outcome 必须先记录，再发送

若 responder 在发送 response 后才记录 outcome，response 丢失与 crash 之间会留下“副作用已经发生，
但没有可重放 outcome”的窗口。要提供 terminal replay，success result 与 terminal error 都必须作为
单一、不可变的 ledger value，在对外发送前完成记录；若承诺跨进程 Recovery，还必须与 handler
effect 处于足以恢复的一致原子边界。

若完整 terminal payload 因资源政策不再保留，Protocol 可以保留轻量 dedupe evidence、防止 handler
重做，但这时已经不能承诺重放原 outcome；必须明确终止/拒绝 Recovery 或返回可区分的 evidence-lost
结果。

### 4. ACK 按其证明的事实分层

| 层级 | 能证明 | 不能证明 |
| --- | --- | --- |
| Transport write / byte or frame ACK | peer Transport 接收了 bytes/frame，或 replay cursor 可推进 | Protocol admission、handler start/completion、外部 effect、terminal durability |
| Request-admitted evidence | call identity 已进入权威 ledger，重复 request 不会再次 dispatch | handler 已完成、effect 已提交、caller 已收到 outcome |
| Terminal-recorded evidence | 唯一 terminal outcome 已写入 ledger | caller 已收到；旧 request 已不可能再次到达 |
| Terminal-received / terminal ACK | caller 已收到 outcome，可作为释放大 payload 的条件之一 | 单独证明 dedupe identity 可以遗忘 |

Terminal ACK 后是否能完整删除 dedupe evidence，还取决于 Session fencing、所有旧 Physical
Connections 已失效，以及 transport/request replay boundary 已排除旧 request 副本。NFS slot
sequence 能安全回收，是因为“收到下一 sequence”与 Session/slot high-watermark 共同提供了更强
证明，而不是因为一个孤立的 response ACK 自动消除了所有旧副本。

因此可以分层 GC：

1. terminal receipt 后先释放较大的 outcome payload；
2. 继续保留轻量 tombstone 或 sequence high-watermark；
3. 只有 replay/fencing proof 完整后才遗忘 identity。

### 5. Recovery 必须显式 accept 或 reject

只有同时满足以下条件才能接受 Recovery：

- Session incarnation 仍存在且 proof/identity 匹配；
- 新 Physical Connection 已成为唯一有效 binding，旧 binding 已被 fencing；
- inbound/outbound call ledger、in-progress ownership 与 terminal outcomes 仍连续；
- 所需 transport replay positions/frames 仍在 retained range；
- profile、descriptor 与影响执行的语义没有变化；
- 所需资源仍在已声明的 retention/limit 内。

任一条件不成立时必须 reject Recovery 或终止 Session。不能在 wire 上宣称 resume 成功，却在内部
把它当 fresh Session、清空 ledger 或重新 dispatch pending handlers。

## Caller-visible 失败边界

| 已知证据 | 诚实的 caller-visible 结果 | 自动 retry 规则 |
| --- | --- | --- |
| 能证明 request 从未被 peer application admission | `definitely-not-executed` 或等价结果 | 可以安全重发；优先沿用原 identity |
| request 已 admission，原 entry 为 `in-progress`，Session/ledger retained | 调用继续 pending；Recovery 后等待原 handler | 不得创建第二个 Logical Call |
| 原 entry 为 `terminal` 且 outcome retained | 重放同一个 success/error | 不得重新执行 handler |
| request 可能 admission，但 Recovery 被拒、Session 过期、entry 被逐出或进程重启丢失 evidence | `outcome-unknown` | 非幂等调用不得自动用新 identity 重试 |
| deadline/cancel 到达，但没有“未 admission”证据 | 本地停止等待或 cooperative-cancel outcome；副作用状态仍可能未知 | 不得推断 rollback 或未执行 |
| application 提供稳定 idempotency key，目标系统仍保留对应 evidence | 可以按 application contract 重试 | 保证范围由 application key 的 scope/retention 决定 |

`outcome unknown` 必须与普通 availability、timeout 或 retryable transport error 区分。调用者可能选择
人工对账、查询业务状态、用 application idempotency key 重试或接受风险，但 Framework 不能替调用者
假定非幂等 effect 没有发生。

## 资源、过期与进程重启

所有相关状态都必须有有限且可配置的边界：

- pending outbound calls；
- inbound in-progress entries；
- terminal outcome payloads；
- dedupe tombstones/high-watermarks；
- replay bytes/frames；
- Session retention time；
- 并发 handler 与 slot/call 数。

到达上限时应在 handler admission 前拒绝新工作，或明确终止不能继续保证的 Session。已经 admission
的 call 若其 evidence 被强制丢失，后续只能进入 `outcome unknown`，不能悄悄降低为 at-least-once。

v1 既然不承诺跨进程持久 Session Recovery，peer process restart 必须建立新 incarnation，并使旧
Session Recovery 明确失败。对于 restart 前可能 admission 的未确认 call：

- 若 application 能从自己的 durable idempotency/transaction record 取得结果，可由 application
  contract 恢复；
- 否则 Framework 只能报告 `outcome unknown`。

## 明确不作出的保证

v1 不应宣称：

- 无条件 exactly-once RPC；
- 任意 crash/restart 后仍可透明恢复；
- Transport ACK 或 resume cursor 等于 request admission/handler completion；
- at-most-once handler dispatch 等于外部 side effect exactly once；
- deadline/cancel 会 rollback 已完成的工作；
- retained Session 一定最终完成；
- terminal ACK 一到即可删除所有 dedupe evidence；
- evidence 丢失后可安全地用新 call identity 自动重试非幂等调用。

若未来要提供跨进程或 external-effect exactly once，至少需要 durable Session/call ledger，并将业务
effect 与 dedupe/terminal record 放入同一事务，或让目标系统以稳定 application idempotency key
参与协议。那是 application/存储协调语义，不是默认 RPC Protocol 仅靠消息重传能够生成的保证。
