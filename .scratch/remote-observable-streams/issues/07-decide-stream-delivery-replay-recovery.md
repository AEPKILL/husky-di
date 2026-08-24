# 决定 Stream Item 的确认、去重、重放与 Recovery

Type: grilling
Status: resolved
Blocked by: 01, 02, 05, 06
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

决定一个远程订阅中 item 与 terminal 的 identity、顺序、Message Receipt ACK disposition、duplicate suppression、replay 与 GC 契约，使同一 Logical Session Recovery 后保留原订阅和 source subscription，未确认 item/terminal 可重放，而本地 observer 恰好按原顺序看到至多一次通知。覆盖 lost item/ACK、item-terminal/cancel race、Recovery barrier 期间的新 emission、retained evidence 释放、Session retention 丢失、counter exhaustion、late/stale binding effects，以及 observer callback throw 对 delivery evidence 与 ordering 的影响；继承 05 已固定的 RxJS host-reporting 和“不改写 Stream Terminal”语义，不重新决策。明确该保证不等于 async consumer 已处理、application effect committed 或跨进程 exactly-once。

## Answer

### 两层 ordinal 与独立的 Protocol message identity

- Default Protocol 为两个 Subscription Direction 分别维护从 1 开始、连续、safe-integer、
  never-wrap 的 Stream Ordinal，并把它作为 opaque streamId carrier。Subscriber Side 只在
  Outgoing Stream Admission 分配 identity；identity-free Pending Stream Subscription 不预占 ordinal。
  Source Side 对 fresh expected start 只在 Remote Stream Admission、Remote Stream Resource
  Rejection 或 Remote Stream Semantic Rejection 已成为 retained disposition 后推进对应 incoming
  high-watermark。Rejection 因而消耗已经 disposition 的 ordinal，但仍不允许 source acquisition。
- Logical Stream Subscription identity 保持
  (Session Incarnation, Subscription Direction, Stream Ordinal)。两端分别把
  highest-allocated/highest-dispositioned Stream Ordinal 保留到 Session terminal；retired stream
  不需要永久 tombstone，fresh start 也不能复用旧 identity。
- 每个 Stream Item 在 Stream Item Admission 取得该 Stream Identity 内从 1 连续递增的 Stream Item
  Ordinal。它直接等于该 source 已 admitted 的 item count，不建立随机 item id 或第二个独立 counter。
  Item identity 是 (Stream Identity, Stream Item Ordinal)；两个 Normalized Application Value 即使
  结构相等，只要 ordinal 不同就是两个 item，必须分别 disposition。
- Stream Terminal 是 Stream Identity 下的唯一 retained terminal slot，不占 item ordinal、Stream
  Admission Credit 或普通 item capacity。它携带 Stream Terminal Boundary，即 terminal
  linearize 时最后一个 admitted Stream Item Ordinal；没有 item 时为 0。Boundary 钉住 terminal
  之前必须存在的完整 admitted prefix。
- Direction-local Protocol message seq 仍是 wire receipt/replay identity，与 Stream Ordinal、
  Stream Item Ordinal 和 Stream Credit Horizon 分离。Item/terminal 可以先成为 retained unsent
  semantic intent，直到 current binding 的 send slot 与 Recovery barrier 允许时才取得 seq。
  精确 JSON carrier 与 record family 由
  [决定 husky-di-rpc/1 流式 wire grammar 与状态机](12-decide-v1-streaming-wire-state-machine.md)
  编码；custom Protocol 必须提供等价的 non-reuse、order、receipt 与 replay evidence，而不必复制
  Default Protocol 的 private counters。

### Subscriber disposition 先于 Observer effect

- Fresh item 只有在 current Binding Epoch、global expected seq、existing Stream Identity、exact
  next Item Ordinal、Source Side 已获授的 Stream Credit Horizon 和预留 receive slot 全部验证成功后
  才能 disposition。超过已 durable accepted horizon、跳号、回退、terminal 后 item 或非法 state
  transition 都不能到达 Observer。
- Subscriber Side 在一个无 await 的原子步骤中为该 item提交 Stream Item Disposition：
  observation仍开放时为 deliver-once，已经 unsubscribe/closed 时为 suppressed；同时推进该 stream
  的 contiguous disposition frontier与global receivedThrough，并把唯一累计Message Receipt ACK
  标为dirty。该commit是replay suppression的线性化点。
- deliver-once commit 后Framework立即在mutation gate外调用一次Observer next；suppressed则不调用。
  两者之间不建立异步delivery queue、公开scheduler或跨turn pending-delivery lifetime。Process crash
  不在Recovery保证内；同一进程内的reentrant effect只能发生在one-shot disposition已commit之后。
- Observer callback throw继续完全遵守
  [决定远端 source observation、终止、取消与 teardown](05-decide-source-observation-terminal-teardown.md)
  已固定的RxJS host reporting：item disposition、receivedThrough、Stream Terminal和先前ordering均不
  回滚，item也不因replay再次调用callback。Framework只在next调用同步返回且observation仍开放后
  re-arm receive slot并推进Stream Credit Horizon；callback内reentrant unsubscribe不补credit。
- Terminal使用同一state-before-effect discipline：只有它的boundary等于Subscriber已连续
  disposition的最后Item Ordinal时，才commit project-once或suppressed terminal disposition；
  随后在gate外至多调用一次Observer complete/error。Boundary超前、落后或与已有winner矛盾是
  Protocol fault，不能以等待、跳过item或改写outcome修补。
- 对仍开放的Observer，这给出items 1..N的有序、non-overlapping、at-most-once callback prefix，
  随后至多一个terminal notification。Caller已unsubscribe时，合法在途items和terminal仍完成
  Protocol disposition/ACK与capacity convergence，但全部suppressed、不补credit，也不重新打开
  observation。

### 只有一种累计 Message Receipt ACK

- 整个Protocol只有一种per-direction cumulative Message Receipt ACK。ackThrough N统一表示该方向
  所有seq不大于N的消息已完成validation，并取得Session-retained、幂等且足以抑制replay的
  disposition。它可以piggyback或由AckOnly承载，但没有start/item/credit/cancel/terminal subtype，
  也没有ACK-of-ACK。
- Sender从自己保留的(seq, SemanticMessage)知道cursor覆盖了何种消息；message kind只决定被
  disposition的语义，不改变ACK本身：
  - start receipt证明Remote Stream Admission或安全rejection已retained，不证明method/getter/
    subscribe已经执行；
  - item receipt证明deliver-once或suppressed disposition已commit，不证明Observer callback返回；
  - credit receipt证明Source Side已接受absolute horizon，不证明credit已消费；
  - cancel receipt证明cancel intent已disposition，不证明cancel赢得Stream Terminal或Source
    Teardown完成；
  - cursor覆盖terminal seq证明唯一outcome、boundary和更早的同方向item均已disposition，不证明
    反方向start/credit/cancel evidence已经退休。
- ACK不表示async consumer完成、application effect committed、durability across process restart、
  Source Teardown成功、整条stream双向retirement或application-level exactly-once。Framework不新增
  processing ACK、per-item ACK、stream-finish/terminal-received message或caller-facing ready surface。
- ACK可以在state-before-effect commit时变dirty；这允许Observer内reentrant outgoing work携带最新
  receipt，却不会让ACK变成callback-return evidence。Slow synchronousObserver仍占用当前JavaScript
  execution；其返回只控制credit replenishment，不重定义Protocol receipt。

### Duplicate、replay 与 credit monotonicity

- 合法Stream Evidence Replay必须保留原seq与完全相同的semantic body。Receiver对
  seq不大于receivedThrough的合法record先处理其中可推进的反方向ackThrough，再在stream state与
  Observer之前抑制body，并可重发当前累计receipt。它不重复Stream Item Admission、不再次debit
  credit/bytes、不再次Observer Delivery、不再次terminal或teardown。
- Lost item在successful Recovery后只以原seq/ordinal/value replay；lost ACK导致相同message重放并
  再次获得receipt，而不是新item。Authenticated resume cursor可以在既有
  peerReceivedThrough与highestSentSeq之间证明“已接收但ACK丢失”并裁剪replay；低于已GC lower bound
  或高于highest sent仍是continuity failure。
- Fresh seq携带已用或跳号Stream Ordinal/Item Ordinal、item-after-terminal、错误boundary、同一
  identity的不同normalized value/outcome，或其他非法transition，都是Session Protocol fault。
  Value equality从不参与dedupe。只在comparison evidence仍合法保留时检查same-seq body
  equivocation；evidence退休后不为检测无状态影响的旧body改写而永久保存payload fingerprint。
- Credit update也是普通sequenced semantic message。Exact message replay由seq层抑制；fresh seq携带
  horizon等于Source Side当前accepted horizon是幂等no-op，更高值原子推进，更低值是Protocol fault。
  这取代“相同与回退都no-op”的模糊说法，同时保持absolute cumulative grant不会重复mint credit。
- Per-stream entry已退休后，fresh start复用不高于Stream Ordinal high-watermark的identity仍是
  identity-reuse fault；迟到的credit/cancel可以根据“ordinal已过去且entry不存在”作为retired-stream
  semantic no-op disposition并取得普通receipt。Fresh item/terminal不能用该规则复活已退休stream。

### Recovery barrier 与跨方向竞态

- Replacement binding对每个sending direction冻结一个有限Recovery Replay Barrier：只包含安装
  binding时已经分配seq、仍高于authenticated peer cursor的retained messages，并严格按原seq重放。
  Barrier期间admitted的新item、terminal或control intent可以有semantic identity和有限reservation，
  但保持unsequenced、排在barrier后，且不得扩展frozen set。
- Source在recovering或barrier期间仍可按
  [决定 RxJS push source 的有界流控契约](06-decide-bounded-push-flow-control.md)
  消费当时已知remaining credit。新emission按Item Ordinal进入bounded retained unsent order；新
  terminal固定其boundary并排在所有此前admitted items后。Barrier清空后才为这些intent分配新seq，
  且per-stream dependency优先于任何跨stream control/data lane priority；精确round-robin与fairness
  由[决定流订阅的资源核算、调度与公平性](08-decide-stream-resources-scheduling-fairness.md)固定。
- 一个replayed credit若先在Source Side durable disposition，可以放大accepted horizon并允许新的
  Item Admission；这些新items仍是barrier后的unsent intents，不反向加入frozen replay set。Terminal
  已先赢时，late credit/cancel不改写winner。
- Connection Fencing在Codec、activity、ACK或stream state之前拒绝旧Binding Epoch的Endpoint
  record、Transport callback、send settlement和Connection terminal effect。若item disposition先于
  fence linearize，它属于retained Session并由新cursor/ACK继续；若fence先赢，旧effect无authority，
  sender保留的原message随后replay。Application Source callback属于retained stream而非旧binding；
  它在Recovery期间仍可沿本票与05/06号票的有界规则继续emit。
- Source-Side cancel admission继续与source terminal、overflow、Session terminal和force按既有
  first-linearized-winner竞争；Message Receipt ACK永不参与winner。Caller在next内unsubscribe时，
  当前item已deliver-once，observation立即closed且不补credit；cancel可携带item receipt，之后合法
  items/terminal只suppressed并照常完成Protocol convergence。

### 分阶段 evidence release，而非 finish handshake

- 每条outbound start/item/credit/cancel/terminal的immutable replay pair及其byte reservation保留到
  peer Message Receipt ACK、accepted authenticated resume cursor或Session terminal覆盖该seq。
  Transport Local Admission、Observer callback、Source Teardown或相反方向的receipt都不能提前替代。
- Source Side的Normalized Item payload在item seq被覆盖后释放；per-stream admitted count、credit
  consumption和terminal competition state继续保留到terminal convergence。Subscriber Side的临时
  item snapshot在immediate next effect返回或suppressed effect commit后释放，contiguous disposition
  frontier保留到terminal disposition。
- Stream Terminal一旦赢就立即fence source并开始one-shot Source Teardown，不等待任何ACK。Source
  保留immutable outcome、boundary、terminal replay与最小stream entry，直到累计ACK覆盖terminal seq；
  该cursor也覆盖更低seq的所有此前item。随后Source可删除per-stream entry和payload，而Session-level
  incoming Stream Ordinal high-watermark继续拒绝identity reuse。
- Subscriber在terminal project-once/suppressed effect commit后可以删除delivery/terminal entry；
  尚未覆盖的outbound start/credit/cancel replay pair是self-contained retained messages，仍各自等待
  同一种ACK/cursor。Source退休后收到这些late controls时使用high-watermark no-op disposition；
  duplicate旧seq仍在message layer抑制。
- Stream Evidence Retirement因此没有双方同步的单一时刻。Terminal receipt不是完整双向retirement；
  两个direction的replay entries分别收敛，constant sequence/Stream Ordinal high-watermarks最后随
  Session terminal释放。无需stream-finish handshake、ACK subtype或per-stream tombstone。
- Grant receipt不释放其支撑的receive reservation：尚未消费的outstanding grant继续占有backing，
  直到item消费并re-arm、cancel/terminal convergence或Session terminal。Ordinary pressure不得静默
  evict仍为Recovery、replay、at-most-once projection或terminal convergence所需的evidence。

### Counter exhaustion、Session loss 与caller保证

- Stream Ordinal、Stream Item Ordinal、Stream Credit Horizon与global message seq都是safe-integer、
  never-wrap、never-reset counters。Stream Ordinal或global seq接近耗尽时，受影响Session进入既有
  draining(counter-exhaustion)，停止所有新的local application admission并使fresh remote work只进入
  protected rejection；这包含拒绝新stream/start work，但不影响Acceptor的healthy sibling Sessions。
- 每个已admitted、尚未分配seq的item必须在Stream Item Admission时取得ordinary future-sequence
  obligation；每个active stream另有不可借用的terminal/control obligation。Resource accounting必须在
  ordinary allocation侵入protected convergence range之前开始counter drain。Exact headroom、
  active-stream cap与ledger charge由资源票固定，完整drain/force predicate由
  [决定流订阅在 graceful shutdown 与 force close 下的收敛](09-decide-stream-shutdown-force-convergence.md)
  固定。
- Source Emission若无法取得ordinary future item-sequence obligation，等同无法取得ordinary retained
  item capacity，沿已决定的Stream Overflow在自己的gate positionterminal；protected terminal
  obligation保证它仍可表达收敛。若根因是Session global counter headroom，Session同时开始
  counter-exhaustion drain；任何counter都不得通过wrap或identity reuse“恢复”容量。
- Per-stream Item Ordinal/Credit Horizon达到最大值后，Subscriber不再grant更高horizon；Source可以
  消费此前已经accepted的remaining credit直到最大ordinal。Counter到顶本身不主动伪造terminal：
  source若随后complete/error，原candidate仍可赢；下一次zero-credit emission才按既有规则选择
  overflow。v1不新增counter-exhausted stream code。
- Successful Session Recovery继续原Stream Identity、Source Subscription、ordinals、credit、
  disposition frontier、terminal与replay evidence，绝不创建replacement subscription或application
  retry。若Session retention永久丢失：
  - Subscriber已验证authoritative terminal与boundary时，仍按该原outcome完成已commit projection；
  - 尚无authoritative terminal的active Observer保留已经看到的item prefix，随后恰好一次
    RpcException(outcome-unknown)；
  - 已unsubscribe/closed Observer不再收到terminal notification；
  - 两端释放remaining stream/replay/capacity evidence，Source Side按Session terminal/force规则
    fence并尝试一次teardown。
- 这里的ordered at-most-once只保证Framework对Observer callback的invocation与同一retained Session
  内的Protocol evidence。它不证明async consumer完成、application effect committed、external
  exactly-once、process-restart persistence或跨新Session自动恢复；application仍需自行建模业务
  idempotency和processing completion。

本次resolution不增加caller-facing Interface、Protocol Implementor Interface或Transport capacity
surface，也不产生新ticket。资源/sequence obligation公式继续由资源票承接，active-stream force
收敛由shutdown票承接，complete-message seam由
[验证 Streaming Protocol Implementor Interface 与 Transport seam](11-prototype-streaming-protocol-spi.md)
验证，精确record/Codec/state machine由wire票编码；地图现有fog不变。
