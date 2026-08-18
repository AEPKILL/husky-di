# 决定 Logical Session identity、incarnation、fencing 与 Recovery

Type: grilling
Status: resolved
Blocked by: 03, 05, 06, 08
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

双方如何创建、识别并恢复一个跨 Physical Connection 保持稳定 `RpcPeer` 的 Logical Session？决定 Session identity 与 incarnation、fresh/resume/accept/reject transitions、binding epoch/lease/fencing、并发 replacement、旧连接脱离、retained/recovering/terminal transition vocabulary 与 invariants、进程重启边界、exposure/proxy 延续，以及这些状态如何投影到 Topology Owner 的 current/sticky surface。本票只规定 resume proof 必须证明的 Session continuity 与 freshness，不设计 token、key、canonicalization 或具体防冒用机制；它们归 security ticket。Owner shutdown 触发这些 transitions 的时机与顺序归 shutdown ticket。

## Answer

一个 responder 创建的 opaque `sessionId` 唯一标识一个 **Session Incarnation**：同一个
retained Logical Session、稳定 `RpcPeer`、双向 sequence/replay state、call ledger 与
connection-fencing state 的一次连续生命周期。v1 不另设可跨 incarnation 延续的 durable
Session identity，也不让 initiator 提议 identity。进程重启若没有保留上述完整状态，就结束旧
incarnation；旧 `sessionId` 不能被重新采用或静默创建成 fresh Session。

Connector factory 返回的稳定 `RpcPeer` 在首次连接前只是本地 caller anchor。fresh responder
接受连接时原子创建 retained Session handle、`sessionId` 与第一个 binding，随后 initiator 把
已有 anchor 关联到该 identity。Acceptor 则只在 fresh accept 的创建线性化点产生稳定 peer 并
加入 membership。

### Binding authority、epoch 与 fencing

- responder 是一个 Session Incarnation 的唯一 binding authority。每次接受 fresh 或 resume
  都分配严格递增的 `bindingEpoch`；fresh binding 从 `1` 开始。Epoch 耗尽的资源边界由资源票
  决定，epoch 本身不是 wall-clock lease，v1 不增加时间租约或时钟协议。
- 每个 incarnation 恰好有至多一个 current binding。验证完 resume continuity、freshness 与
  cursor 后，responder 在单一线性化点推进 epoch、安装新 endpoint 并 fence 旧 endpoint，然后
  发送 `accept`。旧 endpoint 的 late message、callback、terminal 或 send completion 都不得再
  改变 retained Session/Call State；旧 Physical Connection 随后 Direct Close。
- 一个合法 resume 可以抢占本地仍看似健康的 binding，从而避免半断开永久阻塞 Recovery。
  replacement 不要求先观察旧 Connection terminal。
- responder 串行化并发 resume。每个通过验证的新 attempt 都可获得下一 epoch，因此后一次
  成功线性化的合法 attempt 可以 fence 先前 attempt。被替换的 Connection 终止，但 Session
  仍可继续恢复；本地 Connector 禁止并发 `connect()` 不能代替 Protocol 对竞态或异常 peer 的
  处理。
- responder 在 `accept` 被本地 Transport admission 后进入 sequenced phase；initiator 仍按既有
  wire 决议，在收到并验证 `accept` 后进入。若新 binding 的 accept 无法完成，本次 Connection
  终止，retained Session 进入或保持 recovering，可由后续 attempt 接管。

### Fresh、resume 与 continuity cursors

默认 profile 的 bootstrap fields 收敛为以下最小模型；它们是精确 schema 的语义输入，不是
开放 property bag：

```text
fresh request
  = { kind: "fresh", profiles }

fresh accept
  = { kind: "accept", profile, sessionId, bindingEpoch: 1 }

resume request
  = { kind: "resume", profile, sessionId, receivedThrough, ...resumeProof }

resume accept
  = { kind: "accept", profile, sessionId, bindingEpoch, receivedThrough,
      ...acceptProof }
```

`receivedThrough` 是 `0..9007199254740991` 的累计 cursor：resume initiator 声明自己已连续接纳
responder 方向的哪些 `seq`，resume responder 在 accept 中声明自己已连续接纳 initiator 方向的
哪些 `seq`。`0` 表示尚未接纳任何 sequenced message。声明超过发送方最高已发送 `seq` 是
`continuity-failure`；低于已经保留的更高 receipt 只按 stale/no-op 处理，有效边界取 retained
事实与新声明的最大值。accept 后双方只需重放高于有效边界的 retained semantic messages，仍用
原 `seq` 与原 semantic message；duplicate suppression 沿用 retained Session state。

Bootstrap 不交换 retained range、byte position、完整 call ledger 或旧 `bindingEpoch`，也不新增
replay-request message。Profile 仍在 fresh Session 创建时冻结，resume 必须 exact-match。

### Resume proof 的语义契约

本票只固定 proof 必须证明的事实，不固定 token、key ownership、nonce、canonicalization、认证
绑定或密码学机制：

- initiator proof 必须绑定 initiator role、exact profile、`sessionId`、其
  `receivedThrough`，以及当前 Physical Connection handshake attempt 的 freshness；
- responder accept proof 必须绑定 responder role、同一次 handshake、相同
  profile/sessionId、新 `bindingEpoch` 与 responder 的 `receivedThrough`；
- proof 必须阻止跨 Session、跨角色与跨 handshake attempt 的 replay/relay；单独持有
  `sessionId` 不构成 resume authority；
- proof 不需要签入完整 ledger、replay buffer、retained range 或旧 epoch。

具体 proof schema 与防信息枚举策略由 security ticket 决定，但不能弱化上述 continuity 与
freshness facts。

### Reject scope 与 Session terminal

`reject.code` 的状态影响是 profile contract，不能由自由组合的 `retryable` boolean 或错误文字
决定。v1 的最小封闭语义是：

| Code | Scope | State effect |
| --- | --- | --- |
| `unsupported-profile` | attempt | 关闭本次 Connection；fresh 回到 unbound，resume 保持 recovering。 |
| `admission-rejected` | attempt | fresh admission 失败；不创建 Session。 |
| `resume-rejected` | attempt | 关闭本次 Connection 并保持 recovering；可统一覆盖 unknown Session、错误 endpoint、无效 proof 或 stale attempt，避免形成 identity oracle。 |
| `session-terminated` | Session | 只有经过验证的原 authority 才能声明；本地进入 terminal。 |
| `continuity-failure` | Session | retained sequence/ledger continuity 已确定无法成立；本地进入 terminal。 |

无法证明 rejection 属于 Session scope 时一律按 attempt-scoped 处理。只有本地 retained state
已经终止/丢失，或收到经过验证的 authoritative terminal 事实，才能结束 incarnation。典型
terminal 原因包括 retention 到期或逐出、Session-scoped Protocol fault、owner shutdown，以及
被证明的远端进程重启；错误路由、临时 admission failure 或未验证的 unknown Session 不足以
结束本地 retained Session。数字期限、容量与 eviction policy 由资源票决定。

若 terminal 时 request 可能已经被 admission 而 call evidence 丢失，caller-visible outcome
必须遵守既有 `outcome unknown` 边界；精确 call settlement 与 error taxonomy 由 call/error 票
决定。

### Retained state 与 public projection

`RpcPeer.state/state$` 只公开 caller 需要的五种 immutable snapshot variants：

- `unbound`：仅 Connector 初始状态，尚无 Session Incarnation；
- `connecting`：Connector 正在进行首次 fresh binding；
- `connected`：存在 current binding；
- `recovering`：Session retained，但当前没有可用 binding；正在进行 resume attempt 不新增公开
  子状态；
- `closed`：Session 永久 terminal，并保留 sticky outcome/reason。

首次连接失败执行 `connecting -> unbound`；当前 Connection terminal 执行
`connected -> recovering`；resume success 执行 `recovering -> connected`；attempt-scoped
reject 保持 recovering；确定不可恢复时进入 closed。Acceptor peer 从 connected 开始，在
recovering 期间继续留在 `peers/peers$`，只在 Session terminal 的线性化点从 membership 移除；
被移除的 peer 仍保存 final state。Connector 的 `peer` property 在 unbound、recovery 与 terminal
期间始终保持相同 object identity。

当 responder 在仍为 connected 时接受 replacement，它原子执行 connected-to-connected binding
replacement，不制造虚假的 recovering snapshot，也不把 `bindingEpoch` 暴露到 public state。
每次成功 resume 都发出 normalized `peer-recovered` event；该事件表示既有 Session 已成功绑定
replacement Connection，不要求本地先观察到断线。真正失去 current binding 时发出
`peer-recovering`，fresh 创建与 terminal 分别发出 `peer-opened` 与 `peer-closed`。所有 snapshot、
membership、event 与 operation settlement 继续遵守 Topology Owner 票已经决定的原子提交及通知
顺序。

### Stable objects 与 exposure lifetime

成功 Recovery 保留同一个 peer、stable proxy、exposure registry、pending calls 与 retained call
state。Session terminal 后：

- peer identity 继续可读，`state$` 发出 final closed snapshot 后 complete；
- 已取得及之后取得的 stable proxy 仍属于该 peer，后续 method invocation 异步 reject 并复用
  sticky final Session reason，绝不自动迁移到一个 fresh Session；
- terminal 后新的 peer-scoped `expose()` 同步拒绝；peer-scoped registry 释放对 borrowed
  implementations 的引用，既有 cleanup 保持幂等；
- in-flight call 的精确 settlement 留给 call-state/error 票。

`RpcAcceptor.expose()` 则只写入一个 owner-scoped registry，不向每个 Session 复制注册。每个
incoming call 在 dispatch 时查询并捕获当时的 implementation；单个 peer recovery/terminal 不
改变 owner exposure。Cleanup 原子移除注册，使所有当前与未来 peers 的后续 dispatch 不再命中，
但已经 dispatch 的调用继续使用捕获值。Acceptor 进入 closing 后新的 `expose()` 同步拒绝；owner
cleanup 释放 registry 引用，既有 Cleanup 仍幂等。Owner shutdown 与在途调用的最终收敛顺序由
shutdown/call tickets 决定。

本决议不增加生产 Interface 或代码，不定义 security proof 实现、retention 数字、call ledger
GC、owner shutdown choreography 或 private Module 文件切分。现有 security、resource、call、
shutdown 与 Protocol Interface tickets 已覆盖这些后续问题，因此无需新增 child ticket。
