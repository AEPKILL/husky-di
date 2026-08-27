# 决定 Logical Session identity、incarnation、fencing 与 Recovery

Type: grilling
Status: resolved
Blocked by: 03, 05, 06, 08
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

双方如何创建、识别并恢复一个跨 Physical Connection 保持稳定 `RpcPeer` 的 Logical Session？决定 Session identity 与 incarnation、fresh/resume/accept/reject transitions、binding epoch/lease/fencing、并发 replacement、旧连接脱离、retained/recovering/terminal transition vocabulary 与 invariants、进程重启边界、exposure/proxy 延续，以及这些状态如何投影到 Topology Owner 的 current/sticky surface。本票只规定 resume proof 必须证明的 Session continuity 与 freshness，不设计 token、key、canonicalization 或具体防冒用机制；它们归 security ticket。Owner shutdown 触发这些 transitions 的时机与顺序归 shutdown ticket。

## Answer

一个 responder 创建的 opaque `sessionId` 在当前 owner retained/provisional set内唯一标识一个
**Session Incarnation**：同一个
retained Logical Session、稳定 `RpcPeer`、双向 sequence/replay state、call ledger 与
connection-fencing state 的一次连续生命周期。v1 不另设可跨 incarnation 延续的 durable
Session identity，也不让 initiator 提议 identity。进程重启若没有保留上述完整状态，就结束旧
incarnation。v1 不永久保存已释放 identity tombstone；跨历史 non-reuse是 256-bit随机 identity的
probabilistic property，而不是机械 uniqueness。即使未来随机碰撞，独立 Session secret仍使旧 proof
不能取得新 incarnation authority。

Connector factory 返回的稳定 `RpcPeer` 在首次连接前只是本地 caller anchor。fresh responder
接受连接时原子创建 retained Session handle、`sessionId` 与第一个 binding，随后 initiator 把
已有 anchor 关联到该 identity。Acceptor 则只在 fresh accept 的创建线性化点产生稳定 peer 并
加入 membership。

### Binding authority、epoch 与 fencing

- responder 是一个 Session Incarnation 的唯一 binding authority。每次接受 fresh 或 resume
  都分配严格递增的 `bindingEpoch`；fresh binding 从 `1` 开始。Epoch 是 safe integer、never-wrap；
  分配最后一个 epoch 后 current binding 仍有效，但 Session 进入 exhaustion drain 且不再允许下一次
  Recovery。Epoch 本身不是 wall-clock lease，v1 不增加时间租约或时钟协议。
- 每个 incarnation 恰好有至多一个 current binding。验证完 resume continuity、freshness 与
  cursor 后，responder 在单一线性化点推进 epoch、安装新 endpoint 并 fence 旧 endpoint，然后
  发送 `accept`。旧 Physical Connection endpoint 的 late message、Transport callback、Connection
  terminal 或 send completion 都不得再改变 retained Session/Call State；旧 endpoint 随后 Direct
  Close。已经在 Logical Session 中 admission/dispatch 的 call 与 handler 不属于旧 endpoint，
  其 terminalization 仍按 retained Call State 正常竞争唯一 terminal slot。
- 一个合法 resume 可以抢占本地仍看似健康的 binding，从而避免半断开永久阻塞 Recovery。
  replacement 不要求先观察旧 Connection terminal。
- responder 串行化并发 resume。每个通过验证的新 attempt 都可获得下一 epoch，因此后一次
  成功线性化的合法 attempt 可以 fence 先前 attempt。被替换的 Connection 终止，但 Session
  仍可继续恢复；本地 Connector 禁止并发 `connect()` 不能代替 Protocol 对竞态或异常 peer 的
  处理。
- Resume initiator 为每次 attempt 分配 strictly increasing、never-reuse 的 `resumeAttempt`；responder
  在 binding linearization 时要求它高于 `highestAcceptedResumeAttempt` 并原子推进 high-watermark。
  Gap 合法，counter 不 wrap。Accept 丢失后 initiator 用更高 attempt继续，不把自己可能未知的 prior
  `bindingEpoch` 放进下一 request。
- `Number.MAX_SAFE_INTEGER` 可以作为最后一个 `resumeAttempt`。若该 final attempt没有建立本地已验证
  active binding而失败/timeout，或其成功 binding随后再丢失，本地已无合法下一 attempt，Session立即
  以 `counter-exhaustion` terminal；不得 wrap、复用或随机重置。尚未 Outgoing Admission的 invocation
  变 `unavailable`，已 admission且无 authoritative terminal的 call变 `outcome-unknown`。Remote side
  仅按自己的 current binding/Recovery retention收敛，initiator不发送越界 attempt。
- responder 在 `accept` 被本地 Transport admission 后进入 sequenced phase；initiator 仍按既有
  wire 决议，在收到并验证 `accept` 后进入。若新 binding 的 accept 无法完成，本次 Connection
  终止，retained Session 进入或保持 recovering，可由后续 attempt 接管。
- 正常获得 runtime 调度时连续一个 configured `silenceTimeoutMs`（默认 `120 s`）没有 valid
  current-binding activity，或一个 send 连续 configured `sendProgressTimeoutMs`（默认 `30 s`）不
  settle，都视为 binding loss。Framework 必须先原子 fence endpoint、提交
  `connected -> recovering`，再 Direct Close；不能等待 Adapter terminal 后才更新 Session。

### Fresh、resume 与 continuity cursors

默认 profile 的 bootstrap fields 收敛为以下最小模型；它们是精确 schema 的语义输入，不是
开放 property bag：

```text
fresh request
  = { kind: "fresh", profiles, initiatorNonce }

fresh accept
  = { kind: "accept", profile, sessionId, bindingEpoch: 1,
      responderNonce, sessionSecret, proof }

resume request
  = { kind: "resume", profile, sessionId, receivedThrough,
      resumeAttempt, initiatorNonce, proof }

resume accept
  = { kind: "accept", profile, sessionId, bindingEpoch, receivedThrough,
      responderNonce, proof }
```

`receivedThrough` 是 `0..9007199254740991` 的累计 cursor：resume initiator 声明自己已连续接纳
responder 方向的哪些 `seq`，resume responder 在 accept 中声明自己已连续接纳 initiator 方向的
哪些 `seq`。`0` 表示尚未接纳任何 sequenced message。声明超过发送方最高已发送 `seq` 是
`continuity-failure`；声明低于发送方已通过此前 authenticated ACK 保留的
`peerReceivedThrough` 同样是 `continuity-failure`，因为发送方已经 GC 的区间无法再证明或重放。
位于 `[peerReceivedThrough, highestSentSeq]` 内的较高声明可覆盖“接收成功但 ACK 丢失”，接受后
以该声明作为精确 replay boundary。Initiator 对 accept 中的反方向 cursor 执行同样验证，任何
一侧都不得悄悄取 retained fact 与新声明的最大值。accept 后双方重放高于已验证边界的 retained
semantic messages，仍用原 `seq` 与原 semantic message；duplicate suppression 沿用 retained
Session state。

Bootstrap 不交换 retained range、byte position、完整 call ledger 或旧 `bindingEpoch`，也不新增
replay-request message。Profile 仍在 fresh Session 创建时冻结，resume 必须 exact-match。

### Resume proof 的语义契约

Security ticket 已将 proof 具体化为 protected fresh accept 中一次下发的 32-byte Session secret、
domain-separated HKDF/HMAC proof、双方 32-byte nonce 与 RFC 8785 canonical transcript。其状态语义
仍是：

- initiator proof 必须绑定 initiator role、exact profile、`sessionId`、其
  `receivedThrough`、strictly increasing `resumeAttempt`、initiator nonce 与当前 Physical
  Connection handshake attempt；
- responder accept proof 必须绑定 responder role、同一次 handshake、相同
  profile/sessionId、新 `bindingEpoch` 与 responder 的 `receivedThrough`；双方只在对端的 cursor
  通过上述 retained lower-bound / highest-sent upper-bound 验证后进入 active phase；
- proof 必须阻止跨 Session、跨角色与跨 handshake attempt 的 replay/relay；单独持有
  `sessionId` 不构成 resume authority；
- proof 不需要签入完整 ledger、replay buffer、retained range 或旧 epoch。

Initiator 对新 accept epoch 只要求严格高于自己最后验证的 epoch，而非恰好 `+1`，因为中间 accept
可能丢失。Bad/unmatched accept proof 只失败本次 attempt。Fresh accept 即使 proof valid，但其
epoch/profile/transcript 自相矛盾时仍只失败尚未安装 Session 的 fresh attempt；只有 resume accept
proof valid 后，其 cursor/epoch/transcript 与 retained facts矛盾，才证明既有 Session continuity
不可成立并使该 Session terminal。

### Reject scope 与 Session terminal

`reject.code` 的状态影响是 profile contract，不能由自由组合的 `retryable` boolean 或错误文字
决定。v1 的最小封闭语义是：

| Code | Scope | State effect |
| --- | --- | --- |
| `unsupported-profile` | fresh attempt | Fresh negotiation无共同 profile；关闭 Connection并回到 unbound。Resume 不重新协商，任何 profile mismatch统一使用 generic `resume-rejected`。 |
| `admission-rejected` | attempt | fresh admission 失败；不创建 Session。 |
| `resume-rejected` | attempt | 关闭本次 Connection 并保持 recovering；可统一覆盖 unknown Session、错误 endpoint、无效 proof 或 stale attempt，避免形成 identity oracle。 |
| `session-terminated` | Session | 只有经过验证的原 authority 才能声明；本地进入 terminal。 |
| `continuity-failure` | Session | retained sequence/ledger continuity 已确定无法成立；本地进入 terminal。 |

无法证明 rejection 属于 Session scope 时一律按 attempt-scoped 处理。只有本地 retained state
已经终止/丢失，或收到经过验证的 authoritative terminal 事实，才能结束 incarnation。典型
terminal 原因包括 configured Recovery retention（默认 `5 min`）到期、Session-scoped Protocol fault、counter
exhaustion drain、owner shutdown，以及 protected current binding上已验证的 remote Session-close；
abrupt remote restart会丢失 key且只能 generic reject，因此本地只能等待 Recovery deadline，不能把
restart本身“证明”为 terminal。错误路由、临时 admission failure 或未验证的 unknown Session 不足以
结束本地 retained Session。v1 不做 LRU/idle/silent eviction；唯一的 pressure reclamation 是
Acceptor fresh admission 在 Session 容量满时，先原子预留当前 fresh slot，再以 `forced-close` 结束
active absolute Recovery deadline 最早、尚未安装 replacement binding、且 deadline 尚未获胜的
responder-side recovering Session；同 deadline 按 retained Session order 选取。Connected Session
与已经线性化 replacement binding 的 Session 均受保护；没有可回收 Session 时仍拒绝 fresh work。
该回收不携带 remote Session authority，initiator 继续 recovering 到自己的成功 resume 或原 deadline。

`continuity-failure` 与 `session-terminated` 只有在 exact resume request 已先通过 proof、且 reject
自身的 proof 也验证成功时才有 Session authority。Unknown/expired Session、wrong profile、bad proof、
stale attempt 与 capacity failure 都使用相同 `resume-rejected` shape；unsigned/dummy rejection 永远
不能让 initiator终止 retained Session。Responder 已释放 Session key 后只 generic reject，不永久
保存 secret tombstone。

若 terminal 时 request 可能已经被 admission 而 call evidence 丢失，caller-visible outcome
必须遵守既有 `outcome unknown` 边界；精确 call settlement 与 error taxonomy 由 call/error 票
决定。

### Retained state 与 public projection

`RpcPeer.state/state$` 只公开 caller 需要的六种 immutable snapshot variants：

- `unbound`：仅 Connector 初始状态，尚无 Session Incarnation；
- `connecting`：Connector 正在进行首次 fresh binding；
- `connected`：存在 current binding；
- `draining`：current binding只收敛既有 work并拒绝新 work，不再允许 Recovery；snapshot的 safe reason
  区分 local Owner `graceful-shutdown` 与单一 Protocol Session的 `counter-exhaustion` drain；
- `recovering`：Session retained，但当前没有可用 binding；正在进行 resume attempt 不新增公开
  子状态；
- `closed`：stable peer anchor及其已有 Session（若存在）永久 terminal，并保留 sticky outcome/reason。

首次连接或 bootstrap 在 configured `bindingAttemptTimeoutMs`（默认 `30 s`）absolute deadline 内
失败执行 `connecting -> unbound`；当前
Connection terminal、silence 或 send-progress timeout 执行
`connected -> recovering`；resume success 执行 `recovering -> connected`；attempt-scoped
reject 保持 recovering；确定不可恢复时进入 closed。Acceptor peer 从 connected 开始，在
recovering或draining期间继续留在 `peers/peers$`，只在 Session terminal 的线性化点从 membership 移除；
被移除的 peer 仍保存 final state。Connector 的 `peer` property 在 unbound、recovery 与 terminal
期间始终保持相同 object identity。

当 responder 在仍为 connected 时接受 replacement，它原子执行 connected-to-connected binding
replacement，不制造虚假的 recovering snapshot，也不把 `bindingEpoch` 暴露到 public state。
每次成功 resume 都发出 normalized `peer-recovered` event；该事件表示既有 Session 已成功绑定
replacement Connection，不要求本地先观察到断线。真正失去 current binding 时发出
`peer-recovering`，local graceful cutoff发 `peer-draining`，fresh 创建与 terminal 分别发出
`peer-opened` 与 `peer-closed`。所有 snapshot、membership、event 与 operation settlement继续遵守
Topology Owner票已经决定的原子提交及通知顺序。

Local `shutdown()` 对 cutoff时 connected Session执行 `connected -> draining`；drain完成时先原子
`draining -> closed(graceful-shutdown)`并停止 ingress，再由有限 egress shell至多发送一次合法
top-level Close、不等待 ACK，随后调用 Direct Close。Draining期间 binding loss以
`closed(forced-close)`局部 force且不进入 recovering；显式 `close()` 或 grace deadline则分别由
Owner以 `forced-close` / `shutdown-deadline`批量投影。Cutoff时已经 recovering的 Session及其 Pending/
Logical Calls立即按 force outcomes terminal并固定为 `closed(forced-close)`。Connector在 `unbound | connecting` 时 shutdown没有
Session可 drain：abort当前 attempt并把稳定 peer直接投影为 `closed(graceful-shutdown)`；直接
`close()` 则不经过 draining，abort attempt并投影为 `closed(forced-close)`。Acceptor零 peer同样立即
完成 grace phase并进入 bounded cleanup。Protected current endpoint收到合法 remote Close同样是 authoritative
Session terminal并禁止 Recovery；abrupt socket loss/remote restart本身仍只能进入 recovering并等
retained deadline。

Protocol counter exhaustion只对受影响 Session执行
`connected -> draining(counter-exhaustion)`，Acceptor Owner与 healthy siblings保持 active；它复用
同一 drain predicate、unsequenced Close与每阶段 configured deadline。该 peer在 terminal前仍保留于
membership，但新的 outgoing invocation固定 `unavailable`。Owner-level
shutdown的 `G`仍由 Framework一次性批量投影所有当时 connected peers，Protocol runtime不得逐项重复
发该 transition；已经 counter-draining的 peer只加入 Owner grace barrier而不重发 transition或改写
reason。Drain intent不是 terminal，后续 explicit close、Owner deadline与Session counter deadline仍按
first-terminal-wins选择最终 `forced-close | shutdown-deadline | counter-exhaustion` reason。

Recovery grace 与 retained Session TTL 是同一个从 binding loss/fence 起算的 configured
`recoveryGraceMs`（默认 `300,000 ms`）absolute deadline。失败/stale/timeout resume、攻击 bytes
或普通 attempt activity都不重置；成功
resume 取消，下一次 binding loss 重新开始。Deadline、resume accept 与上述 responder-side fresh
capacity reclamation 竞争同一 state transition：deadline 先赢则 late accept 被 fence；binding
linearization 先赢则 Session 不再可回收；reclamation 先赢则以 `forced-close` 终结 retained calls并使
late resume candidate失效；多个候选按 active absolute Recovery deadline 从早到晚回收，同 deadline
按 retained Session order 选取，而不是按 Session 创建时间。Runtime 冻结时只承诺重新获得调度后
收敛，但 wall-clock TTL不延长，因此已经 recovering 的 Session 在冻结超过该期限后可以 terminal；
仍为 connected 的 Session 尚未启动该 TTL，先按 resource ticket 的 scheduler-stall confirmation
window 判断 binding。

### Stable objects 与 exposure lifetime

成功 Recovery 保留同一个 peer、stable proxy、exposure registry、pending calls 与 retained call
state。Session terminal 后：

- peer identity 继续可读，`state$` 发出 final closed snapshot 后 complete；
- 已取得及之后取得的 stable proxy 仍属于该 peer，后续 method invocation 以 Definite
  Non-Execution 的 `unavailable` 异步 reject，并把 sticky final Session reason 保留为本地
  `cause`，绝不自动迁移到一个 fresh Session；
- terminal 后新的 peer-scoped `expose()` 同步拒绝；peer-scoped registry 释放对 borrowed
  implementations 的引用，既有 cleanup 保持幂等；
- in-flight call 的精确 settlement 留给 call-state/error 票。

`RpcAcceptor.expose()` 则只写入一个 owner-scoped registry，不向每个 Session 复制注册。Registry
entry 是 exposure 时已经验证并 snapshot 的 selected function references 与原 implementation
object；每个 incoming call 在 dispatch 时捕获当时的 entry，而不重新读取可变 properties。单个
peer recovery/terminal 不改变 owner exposure。Cleanup 原子移除注册，使所有当前与未来 peers
的后续 dispatch 不再命中，但已经 dispatch 的调用继续使用捕获值。Acceptor 进入 draining或closing 后新的
`expose()` 同步拒绝；owner cleanup 释放 registry 引用，既有 Cleanup 仍幂等。Owner shutdown 与
在途调用的最终收敛顺序由 shutdown/call tickets 决定。

本决议不增加生产 Interface 或代码，不定义 call ledger GC、owner shutdown choreography 或 private
Module 文件切分。现有 security、resource、call、
shutdown 与 Protocol Interface tickets 已覆盖这些后续问题，因此无需新增 child ticket。

## Comments

### 2026-08-21 — Fresh capacity reclamation revision

连续 fresh/refresh 可以让 responder 的 recovering Sessions 占满 `maxSessions` 直到五分钟 deadline，
造成新 Session admission 饥饿。本次把 issue 13 的有限资源策略修订为只回收 deadline 尚未获胜、
且没有 current 或 linearized replacement binding 的 responder-side recovering Session，并保留
connected、已线性化 replacement binding 与 initiator authority 边界；多个候选按 active Recovery
deadline 从早到晚回收，同 deadline 视为同时掉线。
