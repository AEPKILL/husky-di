# 决定 Topology Owner 强制关闭与优雅停机

Type: grilling
Status: resolved
Blocked by: 06, 08, 09, 10, 11, 13, 14
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Fixed constraints

Owner 同时提供 `close()` 与 `shutdown()`。`close()` 是立即 force primitive，不发送 Protocol
notification；`shutdown()` 是 finite graceful drain，成功排空的每个 current Logical Session至多发送
一次单向 Session-close。Session-close属于 Protocol而非 Transport Adapter；sender只等它完成 Local
Admission，不等 remote receipt、Message Receipt ACK或专用 close-ack，随后 Direct Close。通知可能在
Direct Close中丢失；remote此时只能按既有 Recovery deadline收敛。Grace deadline到期或显式
`close()` 都升级到同一个 force path，任何 handler、send、ACK、peer或 Adapter都不能令 Owner task
永久 pending。

## Question

`close()` 与 `shutdown()` 应怎样共享 ownership、state与唯一 cleanup barrier，同时让前者立即强制
收敛、后者有限地排空 cutoff前已 admission的 work？决定 graceful admission cutoff、drain criterion、
post-cutoff inbound call、handler、Recovery与 ACK/replay行为；决定 force transition对 Pending/
Logical Calls应用[决定 unary 调用、取消、错误与终止竞态](11-decide-unary-call-errors-cancellation.md)
既有 outcomes的时机。还必须决定 Session-close grammar/authority、两个绝对 deadline、重复/交叉调用、
双方同时停机、cleanup failure与late callback，以及首份规范发布前如何纳入 `husky-di-rpc/1`。

## Answer

采用一个共享的 monotonic termination state machine，而不是两套 cleanup：

```text
active -> draining -> closing -> closed
   \-----------------> closing
```

`shutdown()` 同步进入 `draining`；`close()` 从 `active` 直接进入 `closing(forced)`，或把正在
draining的 Owner不可逆升级。成功排空则进入 `closing(graceful)`；Grace interval到期也执行与显式
`close()` 完全相同的 force transition。`closingMode` 是 Framework内部的
`graceful | forced` winner，不另增公开控制面。所有 invocation缓存并返回同一个 termination task；
没有 mode downgrade、第二次 wire close、第二批 terminal或第二套 ownership。

VS Code fixed revision的 `sendDisconnect()` 同样 at-most-once、one-way、无 ACK，随后 dispose/end
socket；本设计采用其 best-effort边界，但增加明确的 drain criterion、RPC outcomes与 bounded force
fallback。证据见[`vscode-rpc-ipc-precedents.md`](../research/vscode-rpc-ipc-precedents.md)。

### Public surface 与可观察 state

`RpcConnector` 与 `RpcAcceptor` 都提供：

```ts
shutdown(): Promise<void>;
close(): Promise<void>;
```

公开 Owner lifecycle扩为 `active | draining | closing | closed`：`shutdown()` 进入 `draining`，force
进入 `closing`；升级时先更新同步 getter再通知 `state$`。Graceful期间相关 peer投影也新增
`draining` state：它仍处理 cutoff前 calls，但新的 local invocation已不可 admission。Acceptor
membership保留 draining peers，并在各 Session完成 graceful close或被 force时逐个移除；稳定 peer在
移除后仍保存 final closed snapshot。`close()` 直接 force时不经过 peer draining snapshot。

第一次 termination开始（无论由 public call还是既有 fatal path触发）创建 task；
repeated/concurrent `shutdown()` / `close()`、closed后再调用、shutdown中 close、close后 shutdown都
返回同一 Promise object。`close()` 是单调 winner：一旦进入 `closing(forced)`，任何调用都不能恢复
graceful；已经进入 `closing(graceful)` 后再调用任一方法也只返回既有 task，不重启 deadline、不重发
Close。Termination Promise fulfill只表示 Framework/Adapter
cleanup成功，不保证最终确实 graceful；grace timeout本身不是 cleanup error，实际 cleanup
reject/timeout才使 task reject。

### `shutdown()`：Graceful Admission Cutoff

第一次 `shutdown()` 在一个无 `await`、不可重入点 `G` 原子执行：

1. Owner提交 `draining`，启动 owner-wide absolute grace deadline
   `G + shutdownDeadlineMs`；
2. 在接触 Adapter前禁止新的 `connect()`、`listen()`、`expose()`、single/group proxy invocation和
   fresh/resume binding，abort listener与尚未 active的 bootstrap attempts；
3. `G` 时 connected的 Session进入 draining snapshot；已经处于 Protocol
   `draining(counter-exhaustion)`且仍有 current binding的 Session也纳入 Owner grace barrier，但不重复
   transition/event或改写其 drain reason。两者 cutoff前已经创建的有限 Pending Invocation继续普通
   scheduler，并可在 draining期间取得 Outgoing Admission；cutoff后的新 invocation固定
   `unavailable`且不读取 args；
4. cutoff前已经 Outgoing Admission的 calls继续等待正常 authoritative terminal，已有 replay、cancel、
   terminal、ACK与current send继续正常调度；
5. cutoff前已经 Remote Request Admission的 queued/running handlers继续按既有 permits执行，graceful
   阶段不 abort；每个 job已 capture exposure function/object，因此 owner registry可以在 `G` 后释放；
6. 已 recovering的 Session不能在 listener关闭后完成 bounded drain，立即对该 Session执行局部
   force并固定 peer terminal reason为 `forced-close`；其 Pending Invocation使用 `unavailable`、
   已 Admission且无 terminal的 call使用 `outcome-unknown`。其他健康 Acceptor siblings继续各自
   drain，Owner仍可整体完成 graceful shutdown。

Cutoff后从 current binding到达的新合法 expected-`seq` call仍完成 lexical/schema/security、sequence与
Call Ordinal validation，但在读取 exposure/dispatch前走 issue 13的 protected Remote Resource
Rejection：原子 `absent -> terminal(unavailable)`、推进 receipt并给 remote Definite Non-Execution；
不产生 incoming `call-started`。Malformed、reserved `then`、gap等仍按原 fault scope处理。持续新 calls
只能消耗 finite reserve/ledger并拖到 non-sliding deadline，不能重开 admission或无限增长。

Group invocation在 `G` 前已经完成 common reservation并创建的 children中，所属 Session在 `G`时
connected或已经 counter-draining并进入 Owner grace barrier的 Pending/Logical Call继续；recovering
child按上述 force outcome收敛。Outer Promise等待全部 child caller-side terminal并返回稳定数组；
`G` 先于 common preflight则 outer `unavailable`且创建零 child。

### Graceful drain criterion

每个 active Session独立检查现有 state；无需第二套 cutoff-call ledger。只有以下条件在同一无-await
观察点全部成立才算 drained：

```text
pendingInvocationCount == 0
unretiredCallEntryCount == 0
queuedHandlerCount == 0
runningHandlerCount == 0
replayEntryCount == 0
terminalOrCancelQueueCount == 0
ackDirty == false
sendSlot == idle
ingressDispositionInProgress == false
ingressBacklogCount == 0
replayBarrier == complete
```

这意味着 outgoing calls已有 authoritative terminal，incoming handlers真实 settle，terminal/replay
已被 peer receipt ACK退休，新 binding的 replay barrier已完成，收到的最后 terminal所产生的累计 ACK
也已完成 Local Admission，且没有 callback重入留下的待 disposition input。Probe/Pong due flag不阻止
drain；quiescent transition与 inbound disposition竞争同一 slot，drained先赢后 endpoint只允许 final
Close，late input fenced。Peer withholding ACK、永不 settle handler、stuck send或持续新 calls都只能
等到 grace deadline后被 force。

Graceful drain继续启动 `G` 前已 admitted的 queued handlers；这与 force不同。普通 handler永远没有
Framework execution timeout，grace deadline是 Owner停止等待并升级 force的边界，不伪装成 handler
timeout。

### Wire：unsequenced active Session-close

Default wire顶层 active union增加：

```text
Close = { kind: "close" }
```

Close只允许在完成 accept的 exact current binding。它 connection-local、unsequenced，不带 `seq`、
`ackThrough`、Session/call identity、proof、code、reason或另一个 payload；sender没有其他 known fields，
普通 tagged-record unknown-tail policy仍适用。它不进入 replay/Call State/Message Receipt ACK，不触发
reply或 close-ack，也不产生 public wire event；authority来自 protected current Connection、active
phase与endpoint fencing。

Session达到 drain criterion时先原子停止 ingress、提交本地 `closed(graceful-shutdown)` peer/membership
snapshot并析出只含 current Connection、fixed Close bytes、deadline/token的 egress shell；随后立即、
至多一次调用 `send(closeBytes)`，invocation即消耗机会。Local Admission fulfill后立即调用 Direct
Close；reject/Connection terminal则同样调用 Direct Close且不重试。Close send attempt必须在剩余
grace interval内 settle，否则在 `F` 被 force。一个 shell只在 send fulfill/reject/Connection terminal
且 Direct Close已经调用后完成；Direct Close Promise本身属于下一 cleanup barrier。各 Session不必等
其他 peers，所有 peers共享同一 deadline并行 drain。Cutoff snapshot中的每个 Session都已完成
graceful shell，或已经 authoritative/force terminal且调用 Direct Close（集合原本为空也满足）时，
Owner原子 `draining -> closing(graceful)`并只在此刻启动 cleanup deadline；一个 Session的 force不会
提前终止仍在 drain的 healthy sibling。若 `F` 先赢则直接进入 `closing(forced)`。两条 Owner路径
二选一，cleanup clock只启动一次，semantic scheduler此后不存在。

即使此刻 replay已空，Close也不做 sequenced SemanticMessage：否则 receiver“不回复”与 receipt ACK、
sender“不 replay”与未 ACK retained message矛盾，并为 counter exhaustion制造特殊 `seq`。Transport
single-send ordering已足以保证 Close位于此前完成 Local Admission的 records之后；Close不消耗
issue 13的 sequence window。

Exact current endpoint收到合法 Close后原子 terminal该 Session、禁止 Recovery、按 force outcome表
settle remaining local work、fence endpoint、更新 peer/membership、释放 retained evidence并 Direct
Close；不发送 ACK、Pong、call terminal或 Close reply。Acceptor只影响该 peer，listener与 siblings不
自动终止；Connector的唯一 Session按 topology terminal投影收敛。Wrong-phase/malformed Close沿 issue
14 fault matrix处理，stale endpoint Close是 no-op。

### `close()` 与 force transition

第一次直接 `close()`，或 draining期间 explicit close/grace deadline，在一个无-await点 `F`：

1. 提交 `closing(forced)`，关闭所有 remaining admission/scheduler gate，停止 grace timer，并只在尚未
   启动时启动唯一 cleanup deadline；
2. Pending Invocation（若有）→ `unavailable`；
3. 已 Outgoing Admission且无 terminal的 call → `outcome-unknown`；已有 terminal winner不改判；
4. 尚未 Remote Request Admission的 inbound intent不 admission/receipt；queued handler删除且永不启动；
5. running cancelable handler abort本地 signal，non-cancelable handler可继续，但所有 late settlement不再
   影响 RPC；
6. 丢弃尚未调用 send的 replay/terminal/cancel/ACK/probe/Close intents，fence endpoints并立即 Direct
   Close所有 current/handshaking/fenced Connections；`close()` 自身绝不发送 Protocol Close；
7. recovering Session、bootstrap、late handoff全部 terminal/Direct Close，不启动 Recovery。
8. Connector即使仍为 `unbound | connecting`、尚无 Session，也 abort attempt并把 stable peer anchor
   直接投影为 `closed(forced-close)`；它不经过 draining，随后仍按统一事件/stream顺序完成。

Pending→Outgoing Admission、Remote Request Admission、remote terminal、handler terminal与 `F`竞争各自
既有原子 state slot。Force先赢不会回滚已 admission identity，只选择 issue 11既有 execution-guarantee
outcome。双方同时 graceful shutdown可各发一次 Close且都不回复；local force与remote Close谁先取得
Session terminal slot谁决定 sticky reason，late candidate均 fenced。

Protocol counter drain intent本身不是 terminal。它先开始后若 Owner `shutdown()`，继续同一 drain且
保持 peer draining reason；若其 shell先成功则 terminal reason为 `counter-exhaustion`。显式 `close()`、
Owner grace deadline与该 Session自己的 counter-drain deadline分别提出 `forced-close`、
`shutdown-deadline`、`counter-exhaustion` terminal candidate，仍由 first-linearized-terminal-wins决定，
不会在 terminal后改写 reason。

每个 cutoff时 running handler只留下一个最小 fulfillment/rejection sink：不 normalize value、不分配
`seq`、不发 wire/event、不访问已释放 Session state。Sink数量不超过既有 owner handler permits，负责
消费 rejection；handler/application execution不属于 cleanup barrier。Execution permit语义上仍持有到
真实 settlement，但 terminal scheduler不复用它，不能把 force声称为抢占 JavaScript。

### Recovery 与 binding races

Graceful shutdown不接受 Recovery：`G` 时已经 recovering的 Session立即以 `forced-close`局部 force；
drain中 current binding丢失也以 `forced-close`只 force该 Session，健康 siblings继续 drain。Fresh/resume accept尚未完成 responder Local
Admission或 initiator verification时不是 active binding，只 abort/Direct Close；binding install先于
`G` 才纳入 drain snapshot，`G`/`F` 先赢则 late crypto/accept/send completion无状态效果。

Graceful Close丢失时 remote只观察 Connection loss并进入既有 Recovery，最终由默认 5 分钟 deadline
terminal；sender已经释放 proof key，future resume至多得到 generic rejection。Abrupt remote restart
同样不能由本地“证明”，只能等 Recovery deadline。

### 两段 finite deadline 与 cleanup outcome

同一个 configured `shutdownDeadlineMs`（默认 `5,000 ms`）作为**每阶段**最长 interval：

- `shutdown()` 的 grace phase从 `G` 起最多一个 configured interval（默认 5 秒）；到期自动进入 `F`；
- Cutoff snapshot中的所有 Session都已 graceful shell完成或 terminal且调用 Direct Close，或 `F` 先赢
  时，Owner进入 `closing`并启动唯一一个 owner-wide、absolute、non-sliding configured cleanup deadline；
- 直接 `close()` 只有一个 cleanup interval；graceful worst case为两个 configured intervals（默认分别
  5 秒与 10 秒）；
- 所有 peers/resources共享相同阶段 deadline，不按 peer数串行相乘；progress、subscriber、late handoff与
  event-loop stall都不延长。Callback迟到时第一轮立即检查，不给 health confirmation window。

Direct Close invocation必须同步拒绝新/pending send。Direct Close、listener/startup cleanup在
cleanup deadline前 fulfill/reject时正常记录；Close notification send失败不是 cleanup failure。Deadline
仍 pending的 owned cleanup Promise变成固定安全 local cleanup-timeout Error，Framework fence/detach并
消费 late settlement，提交 bounded local state；broken Adapter仍可能在 seam外泄漏资源，Framework
不伪造能停止任意第三方代码。

一个 cleanup失败不阻止 siblings；单一失败复用同一 trusted local Error，多份按稳定 resource-admission
order放入标准 `AggregateError`。先前 Protocol/call故障、grace timeout或显式 mode escalation本身不让
termination task reject；只有 cleanup reject/timeout会。最终 task因此总在 cleanup deadline前或到期时
settle。

WebCrypto job与 running handler不能 portable cancel；它们按 issue 13继续占 bounded permit/charge到
真实 Promise settle，并由 detached sink消费，但不阻止 Owner termination task。它们的 late result
没有 state authority。

### State、event 与 Promise ordering

每次 `G`、`F`、Session drained/closed与 final Owner close都先原子更新同步 getters，再通知 replay-latest
state/membership streams，最后发 payload-free events；相关 operation/call Promise只在该 batch后 settle。
Graceful cutoff发 `owner-draining`及每个纳入 snapshot的 `peer-draining`，再按既有 observation顺序报告
随后实际完成的 calls；grace phase完成或 `F` 才发 `owner-closing`。Peer只在其 close/force terminal后发
`peer-closed`，保证其 `call-finished` 不会首次出现在 peer-closed之后。Egress/physical close progress
不产生 public wire-level event。

Final cleanup提交 `closed(normal | failed)` snapshot；state streams发 final snapshot后 complete，随后
唯一 topology terminal event与 `event$` complete，最后共享 termination task fulfill/reject。Subscriber
throw仍走 RxJS host reporting，不改写 mode、deadline或 cleanup outcome。

### Acceptance obligations

Issue 15至少验证：force close零 Protocol Close、grace cutoff拒绝新 local work、上述 connected及
既有 counter-draining Session的 pre-cutoff Pending纳入 barrier而 recovering Session立即 force、
cutoff前 outgoing/incoming calls正常完成、post-cutoff Remote Resource Rejection、完整 drain predicate、
withheld ACK/stuck send/never-settling handler到 grace timeout、每 Session一次 unsequenced Close、64 peers
共享 deadline、drain binding loss、recovering/bootstrap races、双方同时 shutdown、Close丢失、explicit
close升级、任意重复/交叉调用共享 task、cleanup timeout/error aggregation、late handler/crypto/send no-op、
无 `seq`/ACK/replay变化，以及 Node/browser Direct Close liveness。

Custom Protocol不必使用 JSON `kind`，但 issue 17的 semantic shutdown port必须提供相同 graceful cutoff、
drain completion、at-most-once/no-reply notification与force fallback。Issue 19固定最终 TypeScript method、
closing mode与peer draining state。

本票不增加 remote drain/goaway ACK、close reason taxonomy、per-peer deadline、handler timeout、第二个
Adapter close method或 graceful Recovery。
