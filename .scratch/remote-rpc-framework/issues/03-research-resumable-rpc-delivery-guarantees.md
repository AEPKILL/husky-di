# 调研可恢复 RPC 的交付保证

Type: research
Status: resolved
Blocked by:
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

根据正式协议规范、分布式系统论文或第一方实现文档，透明 Session Recovery 在请求可能已执行而响应丢失时能够诚实提供哪些保证？调查 call identity、ACK 层级、重放、terminal-result ledger、去重、Session 保留、恢复拒绝、进程重启和非幂等副作用的关系，明确 v1 可以承诺的上限以及必须暴露给调用者的失败边界。历史 research branch 只能作为线索，结论必须回到一手来源。

## Answer

v1 可以诚实承诺的上限是**有条件的、Session-scoped at-most-once handler
dispatch，加上原 call identity 的请求延续与已记录 terminal outcome 的 replay**；它
不是无条件的 exactly-once RPC。

完整的一手资料核验固化于
`research/resumable-rpc-delivery-guarantees-v2@d5b16c1a774deae1b506dda1d25382c835141d7b`
的
`.scratch/remote-rpc-framework/research/resumable-rpc-delivery-guarantees.md`。报告依据经典
RPC 论文、正式协议规范和第一方实现资料重新得出结论，不继承历史 research branch
的结论。

### 保证成立的条件

只有同时满足以下条件，Physical Connection replacement 才能透明延续同一个 Logical
Call：

- 同一 Logical Session incarnation 仍有效，恢复被明确接受，并且并发恢复与旧
  Physical Connection 已被单一权威 owner/fencing 排除；
- call identity 至少在 Session incarnation 内唯一，所有恢复重放沿用原 identity；同一
  identity 与不同 service、method 或 arguments 的冲突复用必须拒绝；
- responder 在 handler 可见 request 前，先原子或串行登记
  `(session incarnation, call identity)`；重复 identity 只能关联既有 in-progress 或
  terminal entry，不能再次 dispatch；
- result 或 terminal error 先写入单一、不可变的 terminal ledger，再发送；响应丢失时
  才能重放同一 outcome；
- transport replay state 与 call-level ledger 分别保持所需连续性。Transport retained
  range/position 只证明 frame history，不证明 handler 或 terminal state；
- pending calls、in-progress entries、terminal state、dedupe evidence 与 replay bytes
  都有明确边界；过期、逐出、资源不足、identity/proof 不匹配或进程重启必须明确拒绝
  Recovery 或终止 Session，不能静默降级保证。

### ACK 与分层回收

ACK 必须按其证明的事实分层。Transport write/receive ACK 不证明 peer protocol 已接受
request，更不证明 handler 已开始、已完成或外部副作用已提交；request-accepted、terminal
recorded、terminal received 和 terminal ACKed 也不是同一个事实。

Terminal ACK 只能支持回收较大的 terminal outcome payload，不能单独证明旧 request 副本
不会再次到达。若 Session 仍接受流量，完整删除该 call identity 的去重证据还必须证明所有
旧 Physical Connection 已被 fencing，且 transport/request replay boundary 已排除旧副本；
否则必须继续保留轻量 tombstone 或 sequence high-watermark。Result 已确认与 identity 已
可安全遗忘是两个不同的 GC 条件。

### 必须暴露的失败边界

- 若能证明 request 从未被 peer application 接受，可以报告“确定未执行”，并以原 identity
  安全发送或重放。
- 若 request 可能已被接受，但 retained call ledger 仍在，恢复后应继续等待原 in-progress
  handler，或重放既有 terminal outcome；断线本身不是调用失败。
- 若 request 可能已被接受，而 in-progress/terminal evidence 已因 Session 失效、逐出或进程
  重启而丢失，唯一诚实结果是 `outcome unknown`：可能执行过，也可能没有执行。它不能被
  伪装成普通可安全 retry error，也不能用新的 call identity 自动重试非幂等操作。
- Recovery 不提供额外 liveness；被 ledger 保留的 handler 仍可能永久 pending。
- Deadline/cancellation 只是停止 caller interest 或向 handler 发出协作取消信号，不证明
  handler 未执行、terminal 尚未提交或外部副作用已经 rollback。

Session 内 handler 至多 dispatch 一次也不等于支付、数据库写入或第三方调用等外部效果
exactly once。更强保证需要 application idempotency key、把业务效果与 dedupe record 放进
同一事务，或让目标系统参与协调；这些都不属于默认 RPC Protocol 可以自行宣称的保证。
