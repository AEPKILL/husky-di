# 决定流订阅的资源核算、调度与公平性

Type: grilling
Status: resolved
Blocked by: 05, 06, 07
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在既有 retained-byte ledgers、per-Session/Owner policy、single send slot 与 handler scheduler 上，决定 pre-Admission incoming capacity reservation、Remote Stream Route Capture、Admission创建的Source Start Job、active subscription、source-side ready item、replay item、receiver delivery queue、control/terminal reserve与Recovery backlog的确定性核算、上限和释放点；决定ordinary overload、protected disposition failure与counter exhaustion的最小故障范围。同步决定stream open/item/credit/terminal/cancel与unary call/ACK/probe的调度优先级、per-stream FIFO、多hot stream公平性、replay barrier、ticket 05已固定同步mutation/callback seam所需的容量与gate外effects调度，以及长寿命source subscription是否占用现有handler permit。优先复用现有policy fields，只有独立调节价值被证明时才增加公开knob。

## Comments

### 2026-08-23 — Grilling round 1

- Unary invocation与Application Stream共享同一个direction-local Application Work Slot上限；不新增
  stream专属per-Session或Owner public policy knob。Pending到admitted/retired之间转移同一slot，
  长寿命stream会诚实压缩同方向新unary/stream admission。
- Source Start Job复用现有per-Session FIFO、Owner round-robin handler scheduler；permit只覆盖
  method/getter acquisition与exactly-once `subscribe()`同步调用，返回或抛出后立即释放。活跃Source
  Subscription不持有handler permit，也不建立第二套start scheduler或公开knob。

### 2026-08-23 — Grilling round 2

- 将既有`maxPendingInvocationsPerSession`原地改名为`maxApplicationWorkPerSession`，默认仍为
  `256`且不提供旧名alias；同一上限在每个发起方向独立应用，并由unary invocation与Application
  Stream共同竞争。
- 每个Logical Stream Subscription的initial receive window恰好是一个可容纳最大合法Stream Item的
  Stream Receive Slot。Observer `next()`同步返回后才补回同一个credit；没有隐藏burst cushion、
  per-subscribe window或新public policy knob，因此同步source在补credit往返前发出第二项会明确
  `overflow`。
- Recovery Replay Barrier始终先清空。其后sequenced work分为convergence/control lane（unary或stream
  terminal与cancel）和ordinary/progress lane（unary call、stream start/item与每stream合并后的最新
  credit horizon）；两lane同时ready时交替，单lane ready时不空转。同一stream的item-before-terminal
  dependency优先于lane优先级；同一lane内多个ready stream按每轮一个dependency-ready record轮转，
  从而保证bounded non-starvation而非平均带宽。ACK/Ping/Pong继续复用既有coalescing、piggyback与
  probe/sequenced alternation。

### 2026-08-23 — Grilling round 3

- 新增一个非stream专属、由unary invocation与Application Stream共享的Owner aggregate policy字段
  `maxApplicationWorkTotal`。它与`maxApplicationWorkPerSession`一样在本地发起和远端发起两个方向
  分别应用，Acceptor默认`1024`，Connector从`maxApplicationWorkPerSession`派生；total必须至少覆盖
  一个完整Session。Local Admission或incoming pre-route reservation必须同时取得适用的Session与
  Owner work slot，避免大量idle Source Subscription绕过handler permit与retained-byte限制。
- Stream retained state采用单一ownership、阶段间原子转移的charge模型，不建立stream专属byte subcap：
  Subscriber在Local Stream Subscription Admission原子取得work slot、Pending start charge和一个
  `1,000,256 B` Stream Receive Slot；该slot只计入Session/Owner aggregate ledgers并在active lifetime
  内复用，不在Observer Delivery后release/re-reserve。Pending start charge原子替换为start replay
  charge。Source Side在route lookup前取得incoming work slot、`args.weight + 256 B`（property为
  `256 B`）Source Start Job charge与protected terminal claim；Route Capture至Remote Stream Admission
  不留释放缝，job settle后释放args、captured route与临时source引用，只保留`256 B` active metadata
  与work slot直到source-side retirement。
- 每个Stream Item以实际Normalized Application Value weight加`256 B` entry charge从Item Admission
  保留到其message seq被ACK、accepted resume cursor或Session terminal覆盖；ready、retained unsent与
  sequenced replay沿用同一reservation。Subscriber item snapshot由Receive Slot支撑并在Observer
  `next()`返回或suppressed disposition commit后释放对象引用；Admission后unsubscribe不得在既有grant
  收敛前释放slot。Recovery Barrier只引用已收费entries，不复制payload或建立第二backlog；现有`/4`
  Pending/incoming、`/2` replay byte subcaps与`4 * maxApplicationWorkPerSession` ordinary replay-entry
  cap继续复用。
- `maxApplicationWorkPerSession`成为只能向下调的`1..256` closed policy，默认`256`。因此现有
  `512 KiB` protected reserve、每direction最多`256` terminal与`256` cancel，以及最后
  `512 = 2 * 256`个sequence values原样复用；stream start/item/credit必须取得ordinary replay与
  future-sequence obligation，不能借用protected convergence capacity。Ordinary pre-Admission不足
  仍为`unavailable`，Source Item ordinary/sequence不足为`overflow`并在global headroom根因时同时启动
  Session counter drain，protected disposition失败仍只fault受影响Session。
- Lane内将既有unary FIFO作为一个virtual participant，与每个ready stream identity round-robin；每个
  participant每轮最多发送一个dependency-ready record。Unary FIFO、per-stream FIFO与
  item-before-terminal保持不变；未分配seq的latest credit可被later cancel撤销，已sequenced credit仍按
  原identity replay。Replay Barrier只阻止新seq分配，Ping/Pong继续既有bounded alternation；barrier
  清空后fair turn从convergence/control lane开始。

### 2026-08-23 — Resolution audit

- `4 * N`的精确ordinary invariant是已sequenced replay count与Stream Item Admission时已取得但尚未
  sequenced的future-record count之和不超过该上限；对应bytes之和也不超过Session replay `/2` subcap。
  Protected terminal与cancel分别拥有最多`256`个intent/replay entries，因此不计入`4 * N`。
- Observer返回时先re-arm既有Receive Slot并提交本地cumulative horizon与due bit；只有把该due horizon
  物化为immutable credit message时才取得ordinary record/byte/future-sequence reservation。Capacity
  暂满时每stream仍只有一个coalesced due horizon，Source尚不能消费；later cancel或terminal可在它取得
  seq前撤销它，已经sequenced的credit则必须保留原identity直到receipt。
- Pending Stream Subscription在Outgoing Stream Admission前不占protected cancel claim。Outgoing
  Admission必须与start identity/replay一起取得至多一个cancel obligation；Source Side则在incoming
  pre-route reservation取得terminal obligation。Obligation或其self-contained replay按各自evidence
  retirement释放，不由相反方向side-local slots的更早退休替代。
- Global message sequence的protected区间固定为`[MAX_SAFE_INTEGER - 511, MAX_SAFE_INTEGER]`。
  Ordinary Admission必须把已取得但未sequenced的ordinary obligations一并计入，在侵入该区间前开始
  Session counter drain。Drain期间fresh remote rejection只有在分配其protected terminal后仍足够覆盖
  全部既有未sequenced terminal/cancel obligations时才可retained；否则Session立即以
  `counter-exhaustion`终结，不ACK、不Recovery，也绝不wrap或借用ordinary capacity。
- RxJS允许直接传入的raw `Subscriber`同步抛出callback异常，因此package-private safe Observer
  projection是兑现既有host-reporting语义的必要内部措施。Item/terminal disposition、receipt与
  observation latch先在mutation gate内提交，Observer effect随后在gate外同步、non-overlapping执行；
  throw不得逃回Protocol ingress、回滚state或改写terminal，且不建立delivery queue或第二套scheduler。

### 2026-08-23 — Coordinated closure

以下协调结论是本票的最终权威结论；它取代Grilling round 1中“不新增stream专属policy”、Grilling
round 3中stream只取得/保留Work Slot，以及Resolution audit中只提Work Slot退休的表述，其余不冲突
结论继续有效。

- 两个并行只读审计一致指出：只共享Application Work会让长寿命stream占满全部unary admission，
  只设独立stream pool又会把Session最坏状态扩成unary与stream上限之和。最终采用“共享硬上限加stream
  子上限”：每条Pending或admitted stream同时取得Application Work Slot与Active Stream Slot；后者
  不是可与前者相加的独立pool。
- Application Stream从Local Stream Subscription Admission或incoming pre-route provisional reservation
  起同时占用两种slot；pre-Admission failure/retraction原子释放两者。Admission后Subscriber在
  authoritative terminal/rejection已投影或suppressed后释放两者，Source在terminal winner的one-shot
  teardown attempt返回或抛出后释放两者；self-contained evidence按自己的receipt生命周期继续保留。
- 记`S = maxActiveStreamsPerSession`、`ST = maxActiveStreamsTotal`，始终要求`S <= N`、
  `S <= ST <= T`。`S`默认`min(16, N)`；Connector派生`ST = S`，Acceptor默认
  `ST = min(T, max(S, 64))`。它只防止stream耗尽全部共享work，不为stream对unary预留容量。
- v1 initial receive window固定为`1`且不公开window knob。把常量提高到`4`只能把同步overflow边界
  后移到第五项，却会把每stream backing扩大四倍；若真实RTT/吞吐基准证明`W = 1`不足，应重新打开
  window及其资源证明，而不是私下动态扩窗。
- Counter审计把protected-tail不变量修正为`F <= max(0, L - H)`与
  `PT + PC <= MAX - H - F`；这允许ordinary obligations清零后合法进入protected tail，同时继续禁止
  wrap、identity reuse或control work封死已承诺ordinary work。

## Answer

v1把unary invocation与Application Stream统一为同一套Application Work、retained-byte、ordinary
evidence、protected convergence和scheduler模型。Streaming的长期状态全部留在RPC Protocol Module
内部；caller只看到既有Observable生命周期和安全failure，Protocol/Transport seam不新增queue、
capacity getter、pause/resume或scheduler Interface。

### 共享Application Work policy

记`N = maxApplicationWorkPerSession`。既有`maxPendingInvocationsPerSession`原地改名为该字段，不保留
alias；默认`256`，只接受`1..256`，其中`256`是v1 profile hard ceiling。每个originating direction
独立拥有`N`个Application Work Slots，Pending与admitted unary/stream在阶段间转移同一个slot而不重新
取得；一个长寿命stream因此会诚实压缩同方向可接纳的新unary或stream work。

新增Owner aggregate count字段`maxApplicationWorkTotal`，同样由unary与stream共享并在
local-origin和remote-origin两个方向独立核算。Acceptor默认`1024`且可配置为positive safe integer，
但必须至少为`N`；Connector不开放第二个override，直接派生为`N`。Local Application Admission与
incoming pre-route reservation必须无await地同时取得Session和Owner slot；任一普通上限不足只拒绝
当前work，不等待、不驱逐既有work，也不影响健康sibling Session。

另外以`S = maxActiveStreamsPerSession`与`ST = maxActiveStreamsTotal`限制Application Work中的stream
子集；一个Pending或admitted stream同时占一个Application Work Slot和一个Active Stream Slot，unary
只占前者，因此两类上限绝不相加。`S`与`ST`均为positive safe integer，必须满足`S <= N`及
`S <= ST <= T`，其中`T = maxApplicationWorkTotal`。`S`默认`min(16, N)`；Connector不开放total
override并派生`ST = S`，Acceptor的`ST`默认`min(T, max(S, 64))`。该子上限为默认配置保留unary
admission余量，但不反向为stream保留容量；两类work在admission后仍共享同一scheduler与byte ledgers。

### 固定Session资源公式

既有Session/Owner aggregate byte ledgers、`32 MiB`/`64 MiB` defaults、`256 B` minimum entry charge、
`64`条ingress count、handler permits和各timing fields保持不变。以
`B = maxRetainedBytesPerSession`表示Session byte cap，相关内部subcaps统一改写为：

| Resource | Bound |
| --- | ---: |
| Pending Application Work | `N entries / floor(B / 4)` |
| Unretired Application Work | `N / originating direction` |
| Unretired Application Streams | `S per Session / ST per Owner / originating direction`, inside Application Work |
| Incoming application-start work-set | `N jobs / floor(B / 4)` arguments |
| Ordinary outbound evidence | `4 * N entries / floor(B / 2)` |
| Retained terminal Application Value payloads | `N entries / floor(B / 4)`, inside ordinary evidence |
| Stream Receive Slot | exactly `1,000,256 B` each, aggregate ledgers only |
| Active stream-side minimum metadata | at least `256 B` per retained side entry |
| Protected convergence/security reserve | fixed `512 KiB`, inside Session/Owner aggregate caps |

一个Stream Receive Slot由`1,000,000 B` maximum v1 Application Value weight加`256 B` bookkeeping组成。
它跨Pending、active credit、delivery与Recovery长期存在，既不是Pending args、incoming source args，也不
进入另一套stream byte subcap；它只取得Session和Owner aggregate ledgers。这样现有`4 MiB`最小Session
policy仍可在空Session同时容纳一份maximum start args、一个maximum receive slot和完整protected
reserve，而无需抬高minimum或增加ratio knob。实际可接纳stream数由`S`、`ST`、共享Application Work
余量和两个aggregate byte ledgers共同取最小值。

Ordinary evidence的精确count invariant是：

```text
ordinarySequencedReplayCount + ordinaryAdmittedFutureRecordCount <= 4 * N
```

两部分的byte charge之和也不得超过`floor(B / 2)`。Future-record部分至少覆盖Stream Item Admission后
尚未分配seq的item以及已commit的其他ordinary unsent result；Pending call/start在取得idle send slot、
ordinary evidence和seq前保持identity-free，不占future-record count。每份reservation在Pending、
retained-unsent和immutable replay之间原子替换或转移，共享Normalized Application Value不重复计费。

Protected terminal与cancel是ordinary cap之外的两个pool：每个sending direction各最多`256`个terminal
intent/replay和`256`个cancel intent/replay。Stream start/item/credit、unary call和成功Application Value
result属于ordinary evidence；stream terminal、safe failure/rejection和cancel使用protected evidence，
ordinary unary result无法retained时也复用已保护的safe `handler-failed` fallback。固定byte证明仍为：

```text
256 * 768 B terminal
+ 256 * 384 B cancel
+ 4 * 512 B ACK/Ping/Pong/Close
+ 65,536 B proof/key/nonce state
= 362,496 B < 512 KiB
```

普通work永不借用该reserve；较低的configured `N`也不缩小固定reserve或protected sequence window。

### Subscriber Side acquisition与release

Local Stream Subscription Admission在一个无await步骤中取得local-origin Session/Owner Application
Work Slot与Active Stream Slot、`args.weight + 256 B` Pending start charge和一个`1,000,256 B`
Receive Slot。任一取得失败都通过该Observable投影`RpcException(unavailable)`，不创建Stream
Identity、wire work或remote execution。Outgoing Stream Admission前的unsubscribe原子撤回Pending并
释放全部四类reservation。

Pending只有在current binding的idle send slot、ordinary start evidence、可用ordinary seq和一个
protected cancel obligation同时可得时，才分配Stream Identity、把args reservation转为immutable start
replay并首次调用`send()`。暂时缺少send/replay capacity时保持已收费、identity-free且有限的Pending；
Session drain或terminal先赢时以`unavailable`收敛，并原子释放两种slot与全部byte reservations。
Outgoing Admission后第一次explicit unsubscribe才把cancel obligation转成一个retained cancel intent；
pre-Admission retraction从不占用或发送cancel。

Subscriber Side的Application Work Slot与Active Stream Slot保持到remote rejection、authoritative
terminal或Session terminal已提交，且对应Observer terminal projection已返回或suppression已commit；
随后两种slot一起退休。Local unsubscribe或cancel receipt本身不足以释放它们。Self-contained
start/credit/cancel replay不阻塞slot退休，并继续保留自己的entry/bytes直到Message Receipt ACK、
accepted authenticated cursor或Session terminal覆盖。

Receive Slot以一个reservation循环：armed initial grant -> credited item occupancy -> Observer effect
occupancy -> armed replenishment。合法item到达前的Endpoint ingress仍走既有bounded ingress charge；
semantic disposition后Normalized snapshot由已预留Receive Slot支撑。`next()`安全投影返回且observation
仍开放时原位re-arm，并推进local cumulative Stream Credit Horizon；不得release/re-acquire制造容量缝。
Snapshot对象引用在`next()`返回或suppressed disposition commit后释放。

Caller已unsubscribe或terminal已关闭observation时不re-arm。若旧grant仍可能产生合法在途item，Receive
Slot必须保留到该grant被item消费并suppressed，或authoritative terminal/Session convergence证明future
item不可能；credit receipt、cancel receipt或local unsubscribe本身都不能提前释放backing。

Observer返回时会先commit新的local horizon，但每stream只在active entry保留一个latest horizon和due
bit。只有把它物化成immutable credit message时才取得ordinary evidence/byte/future-seq reservation；
ordinary cap暂满时它保持coalesced并等待，Source在durable接受前不能消费。Later cancel或terminal可以
撤销尚未sequenced的due horizon；已经sequenced的credit必须以原seq replay到receipt。

### Source Side pre-reservation、job与item

Fresh expected stream start完成fixed/security/current-binding/ACK/sequence/Stream-Ordinal validation后，
在route lookup前尝试原子取得remote-origin Session/Owner Application Work Slot与Active Stream Slot、
`args.weight + 256 B` Source Start Job charge（property为`256 B` active charge）、active-entry minimum和
一个protected terminal obligation。普通job/work/stream-subset/byte capacity不足而protected claim完整时，
立即提交Remote Stream Resource Rejection `unavailable`，不捕获route、不执行application code。
原子preflight任一ordinary reservation失败时回滚此前已取得的全部provisional reservation，不留下部分
work、stream、job、args或active-entry charge。

Capacity成功后才exact-match route并完成Remote Stream Route Capture。Unknown service/member/kind mismatch
把protected claim转为safe semantic rejection，并释放provisional Application Work Slot、Active Stream
Slot、job/args charge与active-entry charge；match成功则Remote Stream Admission把reservations原地commit
为恰好一个Source Start Job。Capture到Admission之间没有可重入的release/reacquire缝。

Source Start Job复用既有per-Session FIFO、Owner ready-Session round-robin和Session/Owner handler permits。
Permit只从job真正dispatch开始，覆盖method/getter acquisition以及exactly-once `subscribe()`同步调用；
同步source notifications自然发生在这次permit lifetime内。正常返回后释放permit、job args、captured
route与临时source reference；stream仍active时只保留`256 B` active metadata、Application Work Slot、
Active Stream Slot、Source Subscription handle和terminal obligation。Method/getter/`subscribe()`抛出
则提交protected `handler-failed` terminal并进入同一teardown/retirement路径。Active Source
Subscription、Recovery、replay、Observer effect与Source Teardown均不继续持有或重新取得handler
permit；queued job若先输给terminal则立即unlink、释放job-only state，并按terminal路径退休两种slot。

W=1使每stream source mutation gate最多保留一个已credit-backed item command和一个protected terminal
latch。`next()`只有在消费credit、成功normalize、取得actual value weight加`256 B` charge、Session/Owner
ordinary bytes、`4 * N` count position与future-seq obligation后才完成Stream Item Admission。Ready、
retained-unsent、sequenced replay与Recovery沿用同一reservation；item ACK、accepted cursor或覆盖它的
terminal receipt才释放payload/replay。第二个同步或重入`next()`没有credit，不先保存第二个value，而在
自己的gate position提出`overflow`。

Terminal winner立即fence source callbacks并在mutation gate外尝试one-shot teardown，不等待send或ACK。
Teardown返回或抛出后释放Source Subscription handle、minimal active entry、Application Work Slot与
Active Stream Slot；terminal obligation/replay作为self-contained evidence独立保留到ACK、accepted
cursor或Session terminal。Resource/semantic rejection从未commit active work/stream slots；其protected
self-contained rejection evidence独立等待receipt。

### State-before-effect与RxJS callback seam

每stream使用package-private、同步、run-to-completion的mutation gate和effect runner。Item/terminal
disposition、per-stream ordering、`receivedThrough`、ACK dirty和Framework observation latch必须先提交；
Transport send、public Observer、method/getter/`subscribe()`与teardown等effects随后在gate外执行。Effect
不跨event-loop turn，不建立receiver delivery queue、actor或第二套scheduler；reentrant mutation只能
stage已有item/protected reservation支撑的bounded command，当前Observer callback返回后迭代flush，
Observer callbacks始终serial且non-overlapping。

Framework必须使用package-private safe Observer projection，不能直接信任RxJS传入的`Subscriber`。
Downstream `next/error/complete`或finalizer同步throw按RxJS host-level unhandled-error语义报告，绝不逃回
Protocol ingress、调用Observer `error()`、制造cancel、选择或改写Stream Terminal、回滚disposition或
触发重复delivery。Framework terminal latch是authority，不能只依赖callback执行期间尚未`closed`的
RxJS Subscriber；`next()` safe projection返回后还要同时检查Framework observation latch与
`subscriber.closed`，reentrant unsubscribe时不补credit。

### Outbound与application-start公平性

Bootstrap继续独占bootstrap phase；replacement binding先严格清空每sending direction的finite frozen
Recovery Replay Barrier，新work可retained但不得扩展barrier或取得新seq。Barrier清空后建立两个
sequenced macro lanes：

- convergence/control：unary/stream terminal、resource/semantic rejection与cancel；
- ordinary/progress：unary call、stream start/item以及已经物化的latest credit horizon。

两lane同时ready时交替，barrier后的first turn为control；只有一lane ready时不空转。Per-stream
item-before-terminal dependency优先于lane priority，因此terminal不能越过本stream更早items，却可以
越过无关hot stream的ordinary items。

每个lane内，既有unary FIFO作为一个virtual participant，与每个ready stream identity round-robin；
participant每轮最多发送一个dependency-ready record。Unary保持FIFO，stream保持per-stream FIFO；
blocked head不会阻塞无关ready identity。这保证bounded non-starvation而非相等带宽，也不引入每种
record一条lane的priority matrix。未sequenced credit horizon可coalesce或被later convergence撤销；
sequenced evidence永不改写或静默驱逐。

每binding仍至多一个unsettled `send()`。ACK只保存latest cumulative cursor和一个due flag，优先
piggyback并在需要时发送AckOnly；Ping/Pong继续coalesce并与sequenced work bounded-alternate。Source
Start Job则沿既有per-Session FIFO、ready Sessions round-robin取得handler permits；active subscription
不参与该scheduler。

### Recovery、retirement与无额外backlog

Recovery不建立第二份queue、payload copy或budget。Frozen barrier只引用已收费replay entries；barrier
期间的新item占ordinary future-record position，新terminal/cancel占既有protected obligation，新credit
只更新per-stream due horizon，Pending start保持identity-free。Retained-unsent到sequenced replay均转移
原reservation，因此Recovery state始终受Application Work Slots、Active Stream Slots、`4 * N`、
`B / 2`、Receive Slots和aggregate ledgers共同限制。

Stream evidence没有双方同步的统一release时刻：Subscriber在terminal/rejection projection返回或
suppression commit后退休side-local entry与两种slot，并按上述outstanding-grant条件释放Receive Slot；
Source在one-shot teardown attempt返回或抛出后退休active entry与两种slot。每条
start/item/credit/cancel/terminal replay仍按自己的direction receipt独立释放。Session level sequence与
Stream-Ordinal high-watermarks保持到Session terminal，普通压力不得静默evict evidence。

### Overload、fault与counter exhaustion

| Boundary | Minimum outcome/scope |
| --- | --- |
| Local preflight缺Application Work Slot、Active Stream Slot、Pending bytes/count、Receive Slot或Owner aggregate capacity | 当前subscription得到`RpcException(unavailable)`；无identity或remote execution |
| Identity-free Pending暂缺send slot或ordinary replay capacity | 保持finite Pending；drain/Session terminal先赢时`unavailable` |
| Fresh incoming start缺ordinary work/stream-subset/job/args/active capacity，protected claim完整 | Remote Stream Resource Rejection `unavailable`；不capture、不执行source |
| Unknown service/member/kind mismatch | Protected semantic rejection；不运行application code |
| Valid Source Emission缺credit、ordinary item bytes、`4 * N` position或future seq | 当前stream `overflow`；emission从未成为item |
| Source value非法或无法normalize | 当前stream `handler-failed`，不是`overflow` |
| Peer发送over-credit item、ordinal gap、credit rollback或illegal transition | Affected Session Protocol fault；不得drop、等待或改写成`overflow` |
| 已授credit的合法item无法使用Receive Slot，或protected claim/reserve失效 | Affected Session `resource-fault`；不伪装成stream error |
| Bounded current-endpoint ingress backlog溢出 | 既有Session-scoped ingress fault；不得drop、skip或ACK未disposition record |
| Owner Application Work、Active Stream或ordinary byte capacity满 | 只拒绝当前local/incoming work；不fault Owner或健康Sessions |
| Adapter send pending/reject/timeout | 既有backpressure或binding failure/Recovery；不回滚identity，不映射为`overflow` |
| Session retention永久丢失 | 继承authoritative terminal或`outcome-unknown`；fence source并释放remaining state |
| Teardown throw | 仅payload-free local Source Teardown Incident |

只有真正共享的Owner ledger/scheduler invariant corruption才扩大到Owner；普通capacity shortage、
protected failure与poison input均采用能证明的最小Session/operation scope。

所有message、Stream Ordinal、Item Ordinal与Credit Horizon counters继续never-wrap。令
`MAX = Number.MAX_SAFE_INTEGER`、`L = MAX - 512`、`H = highestAllocated`、`F =`尚未sequenced的
ordinary future obligations、`PT`/`PC =`仍需future seq的protected terminal/cancel obligations。每个
sending direction始终同时满足：

```text
0 <= H <= MAX
0 <= F <= max(0, L - H)
0 <= PT <= 256
0 <= PC <= 256
PT + PC <= MAX - H - F
```

因此protected sequence interval固定为`[L + 1, MAX] = [MAX - 511, MAX]`，ordinary seq最大为`L`。
Ordinary reservation只在`F + 1 <= max(0, L - H)`时成立，否则先开始Session
`draining(counter-exhaustion)`；ordinary allocation要求`F > 0`并执行`H += 1, F -= 1`。Protected
reservation只在`PT + PC + 1 <= MAX - H - F`时成立；protected allocation要求`H < MAX`且
`F == 0 || H + F < L`，随后执行`H += 1, PT|PC -= 1`。这个严格guard既不让control占用ordinary区
最后一个仍被`F`承诺的位置，也允许`F = 0`后剩余protected work合法走完tail。Counter dependency与
per-stream item-before-terminal一样优先于macro-lane turn。Drain后不再物化新call/start/item/credit
ordinary work；Item无法预占即按`overflow`，unmaterialized credit due只等待或随convergence释放。

Drain期间fresh remote rejection只有在新增其terminal obligation后仍满足
`PT + PC + 1 <= MAX - H - F`时才可retained。否则Session立即以`counter-exhaustion` terminal，不ACK该
fresh work、不进入Recovery，也不通过“rejection被ACK后再接下一条”的循环耗尽为既有work保留的tail。
Stream Ordinal耗尽同样drain affected Session；Item Ordinal/Credit Horizon到顶继续按07号票停止re-arm，
并只在下一次zero-credit emission时选择`overflow`。Acceptor sibling Sessions始终不受影响。

本resolution把既有pending字段原地改名，并新增共享的`maxApplicationWorkTotal`以及stream-subset
`maxActiveStreamsPerSession`/`maxActiveStreamsTotal`。除此之外不增加stream window、receive-byte
ratio、replay ratio、protected reserve、scheduler、callback或Transport capacity option。资源票中的
owner aggregate fog由此清除，complete-message Transport seam是否需要最小改变仍由后续
Protocol/Transport prototype验证。
