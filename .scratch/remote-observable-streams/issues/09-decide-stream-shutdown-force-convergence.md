# 决定流订阅在 graceful shutdown 与 force close 下的收敛

Type: grilling
Status: resolved
Blocked by: 05, 07, 08
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

把 active remote subscriptions 纳入既有 G/F 生命周期：G 后拒绝哪些新 method/property subscribe，pre-G 有限或无限流如何继续 complete/unsubscribe 并阻止 drain，现有绝对 shutdown deadline 如何触发 force；扩展完整 drain predicate，并固定 recovering/binding-loss/remote Close、source synchronous teardown/reentrant emission、queued/replay items、observer terminal notification、source unsubscribe 与 late callback fencing 的顺序。force 必须有限地释放 Framework/Protocol/RxJS ownership，且不虚构 remote application effects 已回滚。

## Answer

本决议把Application Stream原样纳入[决定 Topology Owner 强制关闭与优雅停机](../../remote-rpc-framework/issues/18-decide-owner-shutdown-convergence.md)已经固定的唯一`active -> draining -> closing -> closed` termination Module、共享termination task以及G/F两个线性化点；不建立stream专属shutdown状态机。G只冻结新的application-work roots，既有stream按正常Protocol语义继续；F才批量提交Session terminal、切断authority并有限释放本地Framework/Protocol/RxJS ownership。

### G 的两侧 Admission cutoff

- Remote Observable的创建和保留、stream property读取、stream method调用仍继承[原型化流成员 Descriptor 与单 Peer facade Interface](04-prototype-stream-descriptor-peer-facade.md)的state-neutral契约，不读取Owner/Peer状态，也不执行远程工作。G之后调用这些操作仍可得到原facade/Observable；每次真正`subscribe()`才独立preflight。
- Subscriber Side以Local Stream Subscription Admission与G原子排序。G先赢时，新method/property subscription在读取或normalize arguments之前通过Observable error channel得到`RpcException(unavailable)`，且不取得Application Work Slot、Active Stream Slot、Receive Slot、Stream Identity或wire state。Local Admission先赢时，identity-free Pending Stream Subscription属于G冻结的有限root；只要其Session在G时eligible且connected，它可以在grace期间继续等待send/ordinary evidence并取得Outgoing Stream Admission。Observable在G前创建不提供任何grandfather权利。
- Source Side以Remote Stream Admission与G原子排序。Remote Stream Route Capture只冻结exposure entry，不是application-work admission：capture先赢但Remote Admission尚未提交时，若G先赢，Framework/Protocol必须释放captured route和全部ordinary provisional reservations，把既有protected terminal claim转换为`unavailable` Remote Stream Resource Rejection，并保证method/getter/`subscribe()`均不执行；Remote Admission先赢则Source Start Job进入drain。不存在保留capture等待shutdown后再决定的第三态。
- G之后到达draining current binding的fresh expected stream start仍完成fixed/security/current-binding/sequence/Stream-Ordinal validation，随后在route lookup前走protected `unavailable` rejection并取得普通receipt；malformed、gap、identity reuse或protected disposition failure保持其既有最小fault scope。持续post-G start受既有finite reserve、ledger、ordinal和absolute deadline约束，不能重新开放source admission或无限增长。

### Graceful阶段继续完整stream progress

- G冻结的是有限的pre-cutoff Pending/admitted stream roots，不是每条stream未来的item prefix。普通Owner graceful drain中，既有stream继续Source Start Job、source emission、Stream Item Admission、Observer Delivery、credit replenishment、cancel、terminal、ACK、replay和evidence retirement；G本身不是Stream Terminal，不制造cancel、complete、prefix freeze或Source Teardown。
- G前Remote Stream Admission已经提交但尚未dispatch的Source Start Job仍按既有Application Work scheduler和permits执行；G先于job dispatch不构成取消理由。Job或Source Subscription只有正常terminal/cancel，或随后F/Session terminal，才能阻止或结束。
- Finite source可通过normal complete/error或caller unsubscribe有界收敛。Infinite或silent source若没有terminal且caller不unsubscribe，会诚实阻止该Session drain，直到既有owner-wide grace deadline触发F；Framework不为方便shutdown而虚构source completion或caller cancellation。
- Grace期间caller unsubscribe仍立即关闭local observation；cancel receipt本身不证明Source-Side cancel admission、Stream Terminal或Source Teardown，因此不能单独使drain完成。旧grant可能产生的item仍须suppressed disposition/receipt，Receive Slot也必须保持到terminal或Session convergence证明future item不可能。
- 普通G不会停止既有stream的item/credit ordinary progress；但已经`draining(counter-exhaustion)`的Session不因Owner G重新取得ordinary call/start/item/credit materialization。它继续既有counter-drain规则：Source Start Job可运行，terminal/cancel使用预留protected tail，下一份无法取得ordinary future-record obligation的valid emission选择既定`overflow`，unmaterialized credit due只等待或随convergence撤销。

### 完整 drain predicate

每个Session只有在一个无`await`观察点同时满足既有unary、wire和下列stream条件时才是drained；`activeStreamCount == 0`、source已teardown或terminal已投影均不能单独替代完整证明：

```text
pendingInvocationCount == 0
pendingStreamSubscriptionCount == 0
unretiredCallEntryCount == 0
unretiredSubscriberStreamEntryCount == 0
unretiredSourceStreamEntryCount == 0
queuedHandlerCount == 0
runningHandlerCount == 0
queuedSourceStartJobCount == 0
runningSourceStartJobCount == 0
activeSourceSubscriptionCount == 0
pendingSubscribeOrTeardownLatchCount == 0
streamMutationOrEffectInProgressCount == 0
streamTerminalEffectShellCount == 0
streamReceiveSlotOrOutstandingGrantCount == 0
streamCreditDueCount == 0
ordinaryAdmittedFutureRecordCount == 0
replayEntryCount == 0
terminalOrCancelQueueCount == 0
ackDirty == false
sendSlot == idle
ingressDispositionInProgress == false
ingressBacklogCount == 0
replayBarrier == complete
```

- 这些名称表达normative ownership categories，不要求Implementation维护一组平行的stream-only counters。深Protocol Module可以用共享Application Work、job、future-record、replay和effect总计数实现，但必须以内部ownership invariant证明总计数为零蕴含上述每一项，不能遗漏side-local entry、due horizon、old grant backing或self-contained evidence。
- `replayEntryCount`和future/control条件覆盖仍需receipt/cursor的start/item/credit/cancel/terminal evidence。Terminal ACK只退休该sending direction覆盖的evidence，不证明反方向cancel/credit/start已经退休；cancel ACK也不证明cancel赢得terminal或teardown完成。
- “所有stream evidence退休”只指在Session graceful Close前可以且必须退休的per-stream representations和obligations。[决定 Stream Item 的确认、去重、重放与 Recovery](07-decide-stream-delivery-replay-recovery.md)已经固定的Session-level message/Stream-Ordinal high-watermarks保留到Session terminal，不要求在Close前归零；drain获胜并提交local Session terminal后才释放它们。
- 已经terminal的Subscriber/Source slots分别在Observer projection返回或suppression提交、以及one-shot teardown attempt返回或抛出后退休；self-contained replay随后仍由通用evidence条件阻止过早Close。Non-owning Observation Stream的subscriber count与due activity probe/Pong不进入predicate，也不存在额外receiver async delivery queue。

满足完整predicate后才复用既有一次、unsequenced、no-reply Session-close shell；本票不改变Close grammar、Local Admission边界或Owner grace/cleanup并行规则。

### F 的Session-wide force batch与outcome matrix

Explicit `close()`、owner grace deadline、draining binding loss、authoritative Remote Close或其他既有Session-terminal原因都复用相同stream convergence primitive；公开peer reason仍由既有Owner/Session winner决定。F在一个无`await`的Session-wide batch中先完成所有state mutation，不在遍历stream之间调用application或Adapter effect：

1. 发布单调internal force generation，关闭全部new-work、ordinary scheduling和Recovery gates；跨所有streams选择或保留terminal，fence Endpoint、source sink及后续Observer item/credit mutation，并把Protocol evidence从send/replay scheduler authority脱钩。
2. Unlink尚未启动的Source Start Jobs，撤销尚未sequenced的credit due，丢弃尚未调用`send()`的start/item/credit/cancel/terminal/ACK/replay intent；为每个仍需本地effect的stream析出一个finite one-shot shell，只保留安全outcome、Observer或teardown handle以及释放其slot所需的最小ownership。
3. Batch完成后逐Connection调用Direct Close但不等待其Promise；随后立即释放Session terminal已经覆盖的Protocol retained evidence和ledgers。已经Transport Local Admission的bytes不可撤销，Direct Close后仍可能被platform发送或丢弃；它们的late send settlement、Endpoint input和Connection terminal都被force generation fenced，不能再改变Session或stream state。
4. 最后在所有streams已经fenced的前提下，于mutation gate外运行Observer effect shells与one-shot Source Teardown shells。不同streams以及Subscriber/Source effects之间不承诺全局先后；每个Observer保持non-overlap与item-before-terminal，每个source只teardown一次。

等待Direct Close settle之后才释放Protocol evidence会让force受第三方Adapter Promise阻塞，因而明确拒绝；同样拒绝在全Session fence完成前逐stream执行teardown，因为teardown(A)可以重入B.next。`force generation`和effect shell只是private Implementation组织，不新增Protocol、Transport或caller Interface。

每个stream按本地持有的authority收敛：

| Local state at Session force | Local result |
| --- | --- |
| Identity-free Pending Stream Subscription | Active Observer得到`RpcException(unavailable)`；Definite Non-Execution，释放全部pending reservations |
| Subscriber已Outgoing Admission，尚未disposition authoritative terminal | Active Observer保留已经看到的item prefix，随后得到`RpcException(outcome-unknown)` |
| Subscriber已commit authoritative terminal disposition | 保持原`completed`、`handler-failed`、`overflow`或其他既有winner及boundary，不被force改写 |
| Caller已unsubscribe或Observer已closed | 无Observer Terminal Notification；提交suppression并释放side-local ownership |
| Source Side已有Stream Terminal winner | 保持winner；即使terminal尚未传到Subscriber，也不改写为`terminated`，并沿原one-shot teardown path收敛 |
| Source Side尚无winner | Session force选择内部`terminated`，fence source并执行一次Source Teardown |

Source Side知道complete/error已经获胜不等于Subscriber Side取得了authoritative evidence；若terminal未在Subscriber disposition前随Session evidence丢失，Subscriber仍必须得到`outcome-unknown`。本票不增加shutdown专属RpcException code或把remote application effects描述为已回滚。

### Semantic disposition、Observer与teardown重入

- Force的queued/replay cutoff以Subscriber semantic disposition commit为界。已经commit deliver-once的本地item effect不能回滚或静默丢弃；它必须至多执行一次，并排在对应terminal effect之前。Source Side retained、但Subscriber尚未disposition的item，以及F前仍在ordered ingress backlog中未取得disposition的records，可以在Session terminal释放而不制造新的Observer item；caller只保留已经看到的prefix。
- 若`Observer.next()`内reentrant调用`shutdown()`，当前item已经disposition且继续一次交付；G只冻结new roots，callback返回且Framework observation latch与`subscriber.closed`仍开放时可以re-arm Receive Slot并补credit。该effect frame与随后credit仍阻止premature drain。
- 若同一`next()`内reentrant调用`close()`，F先提交force并保留当前已commit item shell；当前`next()`返回前不得重入Observer terminal callback，返回后也不补credit。Terminal shell在调用前重新检查Framework observation latch和`subscriber.closed`：期间unsubscribe则suppression，否则投影原authoritative terminal或`outcome-unknown`。
- F不能笼统删除全部Observer authority：它必须fence未来item/credit/new terminal candidates，同时把已经commit的deliver-once item和开放Observer唯一的terminal capability转移到one-shot effect shell。除此以外任何late/replayed input都没有effect authority。
- 若F在application source的同步`subscribe()`调用内重入，[决定远端 source observation、终止、取消与 teardown](05-decide-source-observation-terminal-teardown.md)建立的sink、terminal latch与returned-teardown latch立即被force fenced。随后同步`next/error/complete`均是no-op；`subscribe()`返回的Subscription或teardown登记后立即且仅执行一次。Late return、throw或invalid source不再取得state authority。
- Terminal或force均先commit winner并fence source，再在gate外调用Source Teardown。Teardown(A)重入任意B.next时，Session-wide force generation已经fence B；该callback不得normalize、取得credit/bytes、产生item或second terminal。Teardown throw只形成payload-free local Source Teardown Incident。

### Recovery、binding loss与Remote Close

- G时已经recovering的Session立即沿上述matrix局部force，不接受新的Recovery；identity-free Pending为`unavailable`，admitted Subscriber无authoritative terminal为`outcome-unknown`，local Source Subscription选择或保留winner并teardown。Replacement binding install先于G才进入connected cutoff snapshot；G先赢则late bootstrap/crypto/send completion无state authority。
- Draining current binding loss只force受影响Session且不启动Recovery；健康Acceptor siblings继续并行drain，共享原owner-wide deadline。一个Session的infinite stream或binding failure不能使healthy sibling提前force。
- Exact protected current binding上的Remote Close是authoritative Session termination，不是Source Terminal或source complete。Ordered Connection上的earlier terminal record必须先完成semantic disposition，随后Close保留该authoritative winner；若Close先于某record的semantic disposition获胜，该record被fenced。Subscriber当时仍无authoritative stream terminal时得到`outcome-unknown`，Source Side按existing-winner-or-`terminated`规则teardown。Remote Close不回复ACK、terminal、Pong或Close，也不启动Recovery；stale binding Close为no-op。
- 双方同时shutdown不会因对方也draining而推断stream已完成。双方各自等待natural terminal/unsubscribe和全部evidence；否则各自absolute deadline进入F。合法Session-close仍at-most-once、one-way且不要求reply。

### Deadline、failure与诚实的有限保证

- Application Stream复用唯一owner-wide、absolute、non-sliding grace deadline和随后唯一cleanup deadline；不新增per-stream timer、source timeout或随progress滑动的interval。Grace到期只执行同一F，不生成stream-specific outcome。
- Source Teardown和Observer callback都是同步effect且不进入新的Promise barrier；Framework无法抢占一个永不返回并阻塞整个JavaScript event loop的source、Observer或finalizer。有限保证是event loop重新取得控制后不等待remote receipt、source completion、Observer async processing、application producer停止或外部effect rollback，并在既有deadline内只等待原Framework/Protocol/Adapter-owned cleanup。
- Teardown return/throw后Source slots退休；throw只保留local Source Teardown Incident，不改Stream Terminal、不fault healthy Session/Owner，也不使termination task reject。Observer/finalizer throw走RxJS host reporting，不回滚disposition、不产生cancel或second terminal，也不rejectowner task。
- 只有[决定 Topology Owner 强制关闭与优雅停机](../../remote-rpc-framework/issues/18-decide-owner-shutdown-convergence.md)既有的Framework/Protocol/Adapter cleanup reject或cleanup timeout继续按resource-admission order聚合并reject共享task。Grace timeout、force escalation、`outcome-unknown`、teardown incident与Observer throw本身都不是cleanup failure。

### Required trace closure

| Trace | Required result |
| --- | --- |
| Observable created -> G -> subscribe | 在arguments inspection前`unavailable`；无Pending、identity、wire或source work |
| reserve -> Route Capture -> G -> Remote Admission | G先赢时释放capture/provisional state并protected reject；不得执行application |
| disposition -> `next()` -> `shutdown()` -> return | Item只交付一次；observation仍开放时可补credit，随后继续drain |
| disposition -> `next()` -> `close()` -> return | Item只交付一次且不补credit；当前callback后投影`outcome-unknown`或suppression，不重叠 |
| `subscribe()` -> sync `next()` -> reentrant `close()` -> later `complete()` -> return teardown | Later terminal no-op；returned teardown立即且恰好一次 |
| F -> teardown(A) -> reentrant B.next | B在任何effect前已被Session-wide generation fenced；无item或terminal |
| terminal seq enters ordered ingress -> Close | 先disposition terminal，再处理Close并保持原winner/boundary |
| cancel ACK but no terminal/teardown authority | Root、grant、teardown及remaining evidence继续阻止drain |

### Interface、domain与后续边界

- 继续复用现有`shutdown()`/`close()`/`cleanup()` lifecycle seam、Direct Close、first-terminal-wins、error taxonomy和双deadline。本票不新增G时隐式cancel、per-stream deadline、stream-close ACK、finish handshake、Transport flush/capacity surface、caller-facing option或公开event shape。
- [验证 Streaming Protocol Implementor Interface 与 Transport seam](11-prototype-streaming-protocol-spi.md)继续负责用custom Protocol prototype证明既有deep semantic seam可以承载这些transactions、force batch与drain proof；[决定 husky-di-rpc/1 流式 wire grammar 与状态机](12-decide-v1-streaming-wire-state-machine.md)负责编码records/transitions；[决定 Application Stream 的公开观测与 telemetry](10-decide-application-stream-observability.md)负责公开projection。它们不构成本票未决证据，也不由本票预先决定精确Interface或wire shape。
- `CONTEXT.md`已有Shutdown Drain Cutoff、Graceful RPC Shutdown、Forced RPC Close、Stream Terminal、Observer Terminal Notification、Source Teardown与Stream Evidence Retirement等正交词汇；本resolution没有产生新的领域概念或满足ADR门槛的跨context决定，因此不新增glossary term或ADR。

双会话对抗审查已逐项验证上述cutoff、predicate、outcome、reentrancy、ordered-ingress、deadline与failure矩阵，并以全部required traces通过结束；没有阻塞分歧，不重开既有decision，也不产生新ticket。
