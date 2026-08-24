# 决定 husky-di-rpc/1 流式 wire grammar 与状态机

Type: grilling
Status: resolved
Blocked by: 03, 05, 06, 07, 08, 09
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在 profile 名称不变且不兼容当前 unary 草案的前提下，原子定义 husky-di-rpc/1 对 streaming method/property subscribe、item、credit、complete/error、unsubscribe/cancel 的 JSON grammar 与 retained state machine。决定 subscription/item/counter identities，现有 seq/Message Receipt ACK 与 Call Ordinal 的复用或扩展，unary records 是否保留为独立退化路径，`unknown-member` semantic rejection与member-kind mismatch的安全wire表达，以及合法 transition、duplicate/id reuse、Recovery replay、GC、counter exhaustion、validation/fault scope、terminal reserve与最大 envelope。同步确定 schema/raw vectors/transcripts/security transcript 需要怎样整体替换；不得引入新 profile、fragmentation或默认 Protocol 之外的 caller semantics。

## Comments

### 2026-08-23 — 候选与只读对手审计轨迹（非 Answer）

以下保留受攻击前的候选作为审计轨迹；争议均由下方唯一权威`Answer`闭合。候选保持bootstrap、proof、顶层
`message` envelope、单一累计Message Receipt ACK、Ping/Pong与Close grammar不变，只原子替换最终
`SemanticMessage` union及其retained transitions。

#### 1. 候选grammar与identity

```text
Sequence               = integer 1..9007199254740991
AckCursor               = integer 0..9007199254740991
CanonicalCallOrdinal    = canonical unsigned decimal string 1..MAX
CanonicalStreamOrdinal  = canonical unsigned decimal string 1..MAX
ItemOrdinal             = Sequence
CreditHorizon           = Sequence
TerminalBoundary        = AckCursor

SequencedEnvelope = {
  kind: "message",
  seq: Sequence,
  ackThrough?: AckCursor,
  message: SemanticMessage
}

UnaryCall = {
  kind: "call", callId: CanonicalCallOrdinal,
  service: NonEmptyIdentifier, member: NonEmptyIdentifier,
  args: ApplicationValue[]
}
UnaryCancel = { kind: "cancel", callId: CanonicalCallOrdinal }
UnaryResult = { kind: "result", callId: CanonicalCallOrdinal, value?: ApplicationValue }
UnaryError = {
  kind: "error", callId: CanonicalCallOrdinal,
  error: {
    code: "canceled" | "unavailable" | "handler-failed" |
          "unknown-service" | "unknown-member",
    message: string
  }
}

StreamMethodStart = {
  kind: "stream-method", streamId: CanonicalStreamOrdinal,
  service: NonEmptyIdentifier, member: NonEmptyIdentifier,
  args: ApplicationValue[], creditThrough: 1
}
StreamPropertyStart = {
  kind: "stream-property", streamId: CanonicalStreamOrdinal,
  service: NonEmptyIdentifier, member: NonEmptyIdentifier,
  creditThrough: 1
}
StreamItem = {
  kind: "stream-item", streamId: CanonicalStreamOrdinal,
  itemOrdinal: ItemOrdinal, value: ApplicationValue
}
StreamCredit = {
  kind: "stream-credit", streamId: CanonicalStreamOrdinal,
  creditThrough: CreditHorizon
}
StreamCancel = { kind: "stream-cancel", streamId: CanonicalStreamOrdinal }
StreamComplete = {
  kind: "stream-complete", streamId: CanonicalStreamOrdinal,
  itemThrough: TerminalBoundary
}
StreamError = {
  kind: "stream-error", streamId: CanonicalStreamOrdinal,
  itemThrough: TerminalBoundary,
  error: {
    code: "canceled" | "unavailable" | "handler-failed" |
          "unknown-service" | "unknown-member" | "overflow",
    message: string
  }
}

SemanticMessage =
  UnaryCall | UnaryCancel | UnaryResult | UnaryError |
  StreamMethodStart | StreamPropertyStart | StreamItem |
  StreamCredit | StreamCancel | StreamComplete | StreamError
```

`stream-method`/`stream-property`既是start record的discriminant，也复用Descriptor的canonical kind；不再
同时携带冗余`memberKind`。Method必须有`args`；property不得有`args`。两者都显式携带固定W=1的初始
`creditThrough: 1`，不能改为隐含常量、零值或协商值。`member`原地取代unary草案的`method`，
`unknown-member`原地取代`unknown-method`。Exact `then`对unary和两类stream start都仍是profile fault。

每个direction继续只有一个global `seq`/`ackThrough` pair；stream不增加ACK subtype、per-item ACK、finish
handshake或ACK-of-ACK。Call Ordinal仍只服务unary；stream新增独立direction-local连续Stream Ordinal。
两者复用相同canonical decimal carrier规则，但不共享counter/namespace。Item identity严格为
`(Session Incarnation, Subscription Direction, streamId, itemOrdinal)`；credit horizon与terminal boundary
是counter/evidence，不是新identity。

Unary保持独立退化路径，绝不编码为“一个item的stream”：它继续使用call/cancel/result/error、Promise
terminal和Call Ordinal，不取得Active Stream Slot、Receive Slot、credit或terminal boundary。两条路径只
共享envelope、seq/ACK、Application Value、Session/Recovery、ordinary/protected evidence与scheduler。

Recognized top-level record与nested tagged SemanticMessage继续先验证bounded unknown tail再忽略；nested
untagged `error`仍closed。最终决议删除Default Protocol不发送、caller也不暴露的`error.details`；
Property上的`args`作为已知冲突字段由schema明确禁止，而不是当unknown tail忽略。

#### 2. 两个direction与retained counters

一条stream的Subscription Direction `D`发送start、credit、cancel；反方向`R`发送item、complete/error。
`streamId`在`D`中分配，在两方向记录中复用；record direction与本地retained entry共同消歧，不增加role、
peer或direction wire field。一个Session direction至少保留：

- global `highestSentSeq / receivedThrough / peerReceivedThrough`与immutable replay pairs；
- unary `highestAllocated/highestDispositioned Call Ordinal`；
- stream `highestAllocated/highestDispositioned Stream Ordinal`；
- Subscriber entry的next expected/dispositioned Item Ordinal、local Credit Horizon、Receive Slot、observation
  latch与terminal disposition；
- Source entry的accepted Credit Horizon、admitted Item Ordinal、Source Start/Subscription状态、唯一terminal
  winner/boundary与teardown gate。

Stream/Call high-watermarks与global cursors保持到Session terminal；已退休stream不保留per-stream tombstone。

#### 3. Message layer先于stream layer

Active current-binding record依次通过endpoint/epoch、raw/UTF-8/JSON/duplicate/limit、tagged schema、phase与
authority、`ackThrough` bounds、global sequence，最后才进入stream transition。`seq == receivedThrough+1`
才是fresh semantic body；`seq > expected`是Session Protocol fault。合法`seq <= receivedThrough`先处理可
推进的反向ACK，再在stream/call state前抑制body并可重发当前receipt。

Replay必须保留原`seq`和semantic body，只允许envelope携带更新的`ackThrough`。Comparison evidence仍在时，
same-seq body equivocation fault Session；evidence合法GC后不永久保存payload fingerprint。任何fresh seq
上的stream/item identity复用都不能冒充replay。

Receipt只在semantic disposition与其replay-suppression evidence已经retained后推进；item/terminal先提交
disposition、receivedThrough与ACK-dirty，再在gate外调用Observer。ACK从不证明Observer callback返回、
Source Teardown、application processing或完整双向retirement。

#### 4. Subscriber与Source retained transitions

Subscriber Side：

```text
none
  -> Pending(identity-free)
  -> Outgoing(streamId + start seq/replay + protected cancel obligation)
  -> Active(open | locally-unsubscribed)
  -> TerminalDisposition(project-once | suppressed, exact itemThrough)
  -> side-local retired
```

- pre-Outgoing unsubscribe只做`Pending -> retracted`，无identity、wire cancel或Stream Terminal，并保留
  Definite Non-Execution。
- post-Outgoing第一次explicit unsubscribe同步关闭local observation，并把既有cancel obligation转成至多
  一个`stream-cancel` intent；它不选择global terminal。Terminal/preflight cleanup不得反向制造cancel。
- fresh item要求existing outgoing stream、尚无terminal、`itemOrdinal == dispositionFrontier + 1`且不超过
  已授horizon，并有原Receive Slot。Commit为deliver-once或suppressed；Observer `next()`同步返回且两个
  observation latch仍开放后，原位re-arm W=1 slot、把local horizon推进一并coalesce一个due credit。
  Reentrant unsubscribe不补credit。
- complete/error要求`itemThrough == contiguous disposition frontier`。Ahead、behind、second/conflicting
  terminal或retired-stream fresh terminal都fault，不等待缺项、不跳项、不改写outcome。Commit后才执行
  Observer complete/safe error；closed observer只suppressed。

Source Side start处理：

```text
absent(expected next Stream Ordinal)
  -> provisional ordinary work/stream/job/args/active reservations + protected terminal claim
  -> route lookup
     -> protected rejection(unavailable | unknown-service | unknown-member, boundary 0)
     -> Route Capture -> Remote Stream Admission -> one Source Start Job
  -> source-active
  -> one Terminal(outcome, admittedItemCount boundary)
  -> source fenced -> one teardown attempt -> active ownership retired
```

- fresh start必须是下一incoming Stream Ordinal。普通capacity先于route；不足且reserve完整时retained
  `stream-error(unavailable, itemThrough:0)`，不capture/execute。随后exact route：unknown service使用
  `unknown-service`；unknown member或任意unary/stream-method/stream-property kind mismatch统一
  `unknown-member`，不回显actual kind、不运行application。G在Capture后、Remote Admission前先赢也转成
  protected `unavailable`。Admission/rejection都推进incoming Stream Ordinal high-watermark与start receipt。
- Source只有durably接受initial horizon 1后才可Source Subscription Admission。每次合法emission必须先消费
  credit并取得ordinary byte/count/future-seq obligation，再成为下一Item Ordinal。无credit或ordinary
  item capacity时，causing emission不是item，而在该gate位置竞争`overflow` terminal。
- active source上的fresh credit：低于accepted horizon fault；相等为幂等no-op；更高值只有在不制造超过
  W=1 outstanding grant（精确guard为`creditThrough == admittedItemCount + 1`）时才推进。Terminal已赢但
  entry尚未retire时，equal/higher credit都是absorbing no-op：只提交receipt，绝不推进horizon、mint容量、
  恢复source或改写terminal；rollback仍fault。
- active source上的fresh cancel若terminal slot空则Source-Side cancel admission竞争并可选择`canceled`，
  boundary为当前admitted count，随后fence/teardown并发送`stream-error(canceled)`；已有winner则no-op receipt。
- entry已退休后，syntactically valid credit/cancel对`streamId <= incoming high-watermark`为no-op receipt，
  因为禁止per-stream tombstone后已无horizon/winner可比；future identity则fault。Fresh item、terminal或start
  永远不能用retired no-op规则复活identity。

`stream-complete`编码`completed`；`stream-error`只编码可跨线的
`canceled | unavailable | handler-failed | unknown-service | unknown-member | overflow`。`terminated`与
`outcome-unknown`是side-local Session evidence projection，永不上wire。Remote raw Error/value/message/
stack/cause不进入error payload；`message`必须是Framework固定safe文字。

#### 5. Scheduling、Recovery与GC

Start/item/credit与unary call/success value属于ordinary evidence；stream complete/error、safe unary error/
rejection与cancel属于已预留protected convergence evidence。Recovery binding先逐direction清空安装时冻结的
finite original-seq barrier；期间新item/terminal可保留semantic ordinal和既有reservation但不取seq，也不
扩展barrier。Barrier后先满足per-stream item-before-terminal dependency，再按08号票的control/progress
alternation与unary virtual participant/per-stream round-robin分配seq。

GC分direction、无finish handshake：

- 每个start/item/credit/cancel/terminal immutable replay pair保留至Message Receipt ACK、accepted
  authenticated resume cursor或Session terminal覆盖其seq。
- Item ACK释放Source端Normalized payload/replay charge，但不伪造Observer processing；terminal保留的
  boundary继续给出admitted prefix。
- Credit ACK不释放其Receive Slot backing；只有grant被item消费并重新arm，或terminal/Session convergence
  证明future item不可能时释放。
- Cancel ACK不证明cancel赢、terminal或teardown；Subscriber slots等authoritative terminal/Session
  convergence与projection/suppression。
- Source terminal一赢就fence/teardown，不等ACK；teardown settle后active slots/Source handle退休，
  self-contained terminal replay继续等receipt。Subscriber terminal disposition/effect后同样可退休active
  entry，反方向self-contained start/credit/cancel replay各等自己的receipt。
- Incoming/outgoing Stream Ordinal high-watermarks最后随Session terminal释放，故无需per-stream tombstone。

Successful Recovery保留原Stream Identity、ordinals、credit、disposition、Source Job/Subscription与winner；
绝不重新method/getter/subscribe。Source在Recovery中按已接受remaining credit继续有界emit；新terminal可
立即赢、teardown并作为retained unsent等待。Session retention永久丢失时，Subscriber已有authoritative
terminal则保持；否则active Observer保留已见prefix后`outcome-unknown`，已unsubscribe无notification。

#### 6. Counter tail与fault scope

Stream Ordinal、Item Ordinal、Credit Horizon与global seq全部safe-integer、never-wrap/reset。Stream Ordinal或
global seq耗尽使affected Session counter-drain；Item/Credit到MAX后不再re-arm，source可消费已授最后credit，
下一次zero-credit emission才overflow，不新增stream counter code。

沿用08号票精确不变量，令`MAX=9007199254740991`、`L=MAX-512`、`H=highestAllocatedSeq`、`F`为尚未
sequenced ordinary future obligations、`PT/PC`为仍需seq的protected terminal/cancel obligations：

```text
0 <= F <= max(0, L - H)
0 <= PT <= 256
0 <= PC <= 256
PT + PC <= MAX - H - F
```

Ordinary reservation不能侵入`[MAX-511, MAX]`；protected allocation不能越过尚由F承诺的ordinary位置。
Start/item/credit必须先取得ordinary obligation；每条admitted stream在可能需要前已取得一个terminal与一个
cancel obligation。无法为valid emission取得ordinary obligation时，该stream overflow并同时启动global
counter drain；既有items先走完，terminal再使用tail。Drain中fresh remote rejection只有在不会封死全部
既有PT/PC/F时才receipt，否则Session立即`counter-exhaustion` terminal，不ACK该fresh work、不Recovery。

Fault最小化：

| Input/boundary | Outcome |
| --- | --- |
| local preflight ordinary/slot/byte不足 | current subscription `unavailable`，无identity/execution |
| fresh incoming start ordinary不足，protected intact | stream `unavailable` rejection，receipt，无source execution |
| unknown service | `unknown-service` rejection |
| unknown member或任何member-kind mismatch | `unknown-member` rejection，不泄漏actual kind |
| invalid source/value | stream `handler-failed` |
| valid emission无credit/ordinary capacity/future seq | stream `overflow` |
| legal granted item却无Receive Slot，或protected invariant失效 | affected Session `resource-fault` |
| malformed/schema/phase/unknown kind/then/seq gap/future ACK/identity reuse/item gap/over-credit/credit rollback/terminal boundary或winner conflict/illegal direction | affected Session Protocol fault，无ACK、无Recovery |
| stale fenced endpoint | Codec/activity/state之前no-op，Direct Close可选 |
| shared Owner ledger/scheduler invariant corruption | 只有真正shared时才扩大到Owner |

#### 7. 最大record证明

采用两个start kinds而非`stream-start + memberKind`删除了冗余字段，并保持现有fixed wire-node limit：
最大args子树含数组根共`65,536` nodes，加envelope/message/start wrapper共`10` nodes，恰为
`65,546` nodes，无需修改既有limit。

按compact JSON、最大16-digit seq/ack/streamId、service/member各为256 UTF-8 bytes且选择最坏的256个
U+0000（JSON各转义为6 bytes）、args weight恰为`1,000,000 B`计算：

```text
max StreamMethodStart envelope = 1,003,259 B
1 MiB Transport floor          = 1,048,576 B
headroom                        =    45,317 B
max StreamItem envelope         = 1,000,174 B
```

因此无需fragmentation、Transport改造或缩小Application Value。Sender仍须在identity/admission前以最大
digits和optional ACK做真实encode/preflight；unknown tails只在完整message hard limit内接受，不能消费上述
sender guarantee。Raw corpus必须留下这个精确max-value/max-node证明，而不只用`ping + whitespace`测1 MiB。

#### 8. 必须整体替换的wire assets

- `schema.json`：保持bootstrap/control defs，原子替换semantic union；`method -> member`、
  `unknown-method -> unknown-member`，增加Stream Ordinal/item/horizon/boundary defs和七个stream branches，
  property明确禁args，nested error closed，Close forbidden-known-members同步扩展。保留2020-12、open tagged
  tails及现有depth/node/byte limits。
- `raw-vectors.json`：旧lexical/bootstrap vectors重新baseline；替换全部unary method/error vectors；新增两类
  start、item、credit、cancel、complete与每个safe stream error的valid vectors，以及zero/non-1 initial
  credit、missing/misplaced args、then、ordinal 0/leading-zero/MAX+1、unsafe item/horizon/boundary、非法error
  code/field、unknown semantic kind、max method/item envelope、65,546 nodes和各limit+1 invalid vectors。
- `transcripts.json`：不能局部追加；所有active state assertion改成final grammar与stream-aware retained
  categories。至少覆盖独立unary退化、method/property、resource/semantic/kind rejection、W=1 item-credit、
  overflow、unsubscribe/cancel race、terminal boundary、duplicate/equivocation/id reuse、lost item/ACK、
  authenticated cursor裁剪、Recovery barrier中新item/terminal、late retired controls、G/F、Close、counter
  tail。每step断言双方state/binding、source subscribe/teardown count、Observer prefix/terminal、ordinals/
  horizons、retained evidence与next permitted records。
- `known-answer-vectors.json`：作为同名profile corpus整体重新baseline，但不虚构active-record HMAC。Fresh/
  resume/accept/reject proof grammar与算法未变，所以independent recomputation应产生相同bytes；文件应明确
  active stream records只依赖Protected Transport + Binding Epoch fencing，不进入Session proof transcript。
  Fenced/stale active stream攻击放stateful security transcript/raw corpus，不改变HKDF/HMAC公式。

#### 9. 对手攻击清单（已闭合）

只读对手已逐项攻击以下选择并最终`PASS`；列表保留为决策审计，不表示仍有未决项。

1. 选择两个start semantic kinds；显式kind、删除冗余field且保持65,546 node limit。
2. 保留`stream-complete`/`stream-error`两个互斥branch；不引入optional笛卡尔积的unified terminal。
3. W=1 higher credit采用`creditThrough == admittedItemCount + 1`精确guard；其余higher value为over-credit。
4. Terminal尚保留时rollback fault、equal/higher absorbing no-op；彻底retired后valid past credit/cancel只凭
   high-watermark no-op，从而不要求永久tombstone。
5. `canceled`保留为`stream-error`的closed code，不增加独立terminal kind。
6. Default wire对sender和receiver都删除`error.details`；只保留Framework生成的safe `message`。
7. Security KAT整体replacement/rebaseline并独立重算；算法输入不变的bytes可相同，同时新增stateful
   negative transcripts且不发明active-record HMAC。
8. 选择`itemThrough`承载Stream Terminal Boundary，不增加更长的别名字段。

#### 10. 可直接变成stateful transcript的adversarial traces

**T1 — W=1同步burst：** A发送seq1 `stream-method(streamId=1, creditThrough=1)`；B durable admit并只
subscribe一次。同步item1取得credit并成为B seq1；紧接item2无credit，在自己的gate位置选择overflow，
不是item，B terminal seq2必须在item seq1后。A先commit item disposition/receipt再调用`next(1)`；若callback
返回仍open可发creditThrough2，B已terminal则该credit no-op；最后A恰见`1, overflow`，B teardown一次。

**T2 — `next()`内unsubscribe：** A disposition item1后Observer在`next`内unsubscribe；当前item恰好一次、
不补credit，A至多保留一个stream-cancel。Cancel先到B则canceled赢、late complete no-op；complete先赢则
cancel no-op。两种分支A都无Observer terminal，receipt/evidence各自收敛且teardown一次。

**T3 — safe kind mismatch：** A发送合法`stream-property`到B已知service、同名却声明为
`stream-method`的member。B推进start receipt与Stream Ordinal，返回
`stream-error(unknown-member,itemThrough=0)`；method/getter/subscribe count均0，error/event不含actual kind
或attacker member spelling。相同record若携带`args`则在schema阶段Session fault且不ACK。

**T4 — lost item vs lost ACK：** B保留seq7/item ordinal3。若item丢失，A resume cursor=6，replacement
barrier只重放原seq7/body，A只投影一次ordinal3；若A已disposition但AckOnly丢失，authenticated resume
cursor=7直接裁剪B replay，绝不再次Observer Delivery。两支均保持原Stream Identity与source subscribe count1。

**T5 — duplicate/equivocation/reuse：** Exact old seq7 replay先处理合法piggyback ACK再抑制body；comparison
evidence仍在时同seq改value使Session fault。Stream1 terminal ACK且entry退休后，fresh seq携带start
streamId1或item/terminal streamId1均identity-reuse/illegal-transition fault；late fresh credit/cancel id1仅
no-op receipt。下一合法start必须streamId2。

**T6 — horizon与boundary poison：** Active source已admit item1、accepted horizon2但尚未emit item2；fresh
credit1 rollback fault，fresh credit2 no-op，fresh credit3会制造两个outstanding grants故over-credit fault。
Subscriber frontier1收到terminal itemThrough2或0均立即Protocol fault，不等待或跳项；相同terminal原seq
replay只在message layer抑制。

**T7 — Recovery中source terminal：** Binding loss时source仍按已接受credit admit下一item并随后complete；
terminal立刻赢并teardown一次，两者保留为barrier后的unsequenced intents。Replacement先重放冻结old seq，
再按item-before-terminal取得新seq；A恢复后投影完整prefix+complete，method/getter/subscribe均不重跑。

**T8 — counter tail：** 当`H + F == L`时，先发送已承诺ordinary item使`F -> 0, H -> L`；下一valid
emission无法reserve ordinary future seq，触发stream overflow和Session counter drain。既有item先收敛，
overflow terminal使用`L+1`后的protected tail。任何fresh start rejection若会侵占既有PT/PC headroom则不ACK
并直接Session counter-exhaustion；绝不wrap、复用identity或借回tail。

**T9 — force reentrancy：** A已commit item disposition，Observer `next()`内调用`close()`。F先Session-wide
fence全部streams、drop尚未send intents并析出one-shot shells；当前item仍只执行一次，返回后不补credit，
开放Observer得到`outcome-unknown`（已有authoritative terminal则保持原winner），然后peer close。任一
teardown(A)重入B.next时B已fenced，不产生item/terminal；每个source teardown最多一次。

#### 11. Deletion test

- 删除global seq：streamId/itemOrdinal无法给跨stream/unary消息提供累计receipt、exact replay与gap检测；失败。
- 删除streamId或复用Call Ordinal：并发同route subscriptions不可区分，并违反07号票独立Stream Ordinal；失败。
- 删除itemOrdinal：global seq被其他streams/directions穿插，无法表达per-streamprefix与dedupe；失败。
- 删除creditThrough改delta/implicit：duplicate可mint credit，Recovery无法恢复已接受horizon；失败。
- 删除itemThrough：terminal无法证明此前item prefix完整，只能跳项或无限等待；失败。
- 删除method/property discriminator：无法在不执行/泄漏actual route kind时表达kind mismatch；失败。把它放
  `kind`里比新增`memberKind`少一个field/node。
- 删除stream-cancel：post-Admission unsubscribe无法请求remote teardown；失败。
- 删除独立unary family并退化成one-item stream：改变Promise、Call Ordinal、slot/credit/cancel semantics；失败。
- 增加per-item ACK、finish handshake、direction field、random item id、public window或fragmentation后再删除，
  现有seq/ACK/ordinal/boundary证据仍完整；因此全部YAGNI。

只读对手的Q1–Q12与A/B/C质询及最终`PASS`已经收到；经攻击后的约束固化在下方`## Answer`。

## Answer

### Q1、B：原地替换SemanticMessage grammar

保留`husky-di-rpc/1`的bootstrap、proof、顶层`message` envelope、唯一累计Message Receipt ACK、
Ping/Pong和Close grammar；只原子替换最终`SemanticMessage` union及其retained transitions：

```text
Sequence               = integer 1..9007199254740991
AckCursor               = integer 0..9007199254740991
CanonicalCallOrdinal    = canonical unsigned decimal string 1..MAX
CanonicalStreamOrdinal  = canonical unsigned decimal string 1..MAX
ItemOrdinal             = Sequence
CreditHorizon           = Sequence
TerminalBoundary        = AckCursor

SequencedEnvelope = {
  kind: "message",
  seq: Sequence,
  ackThrough?: AckCursor,
  message: SemanticMessage
}

UnaryCall = {
  kind: "call", callId: CanonicalCallOrdinal,
  service: NonEmptyIdentifier, member: NonEmptyIdentifier,
  args: ApplicationValue[]
}
UnaryCancel = { kind: "cancel", callId: CanonicalCallOrdinal }
UnaryResult = { kind: "result", callId: CanonicalCallOrdinal, value?: ApplicationValue }
UnaryError = {
  kind: "error", callId: CanonicalCallOrdinal,
  error: {
    code: "canceled" | "unavailable" | "handler-failed" |
          "unknown-service" | "unknown-member",
    message: string
  }
}

StreamMethodStart = {
  kind: "stream-method", streamId: CanonicalStreamOrdinal,
  service: NonEmptyIdentifier, member: NonEmptyIdentifier,
  args: ApplicationValue[], creditThrough: 1
}
StreamPropertyStart = {
  kind: "stream-property", streamId: CanonicalStreamOrdinal,
  service: NonEmptyIdentifier, member: NonEmptyIdentifier,
  creditThrough: 1
}
StreamItem = {
  kind: "stream-item", streamId: CanonicalStreamOrdinal,
  itemOrdinal: ItemOrdinal, value: ApplicationValue
}
StreamCredit = {
  kind: "stream-credit", streamId: CanonicalStreamOrdinal,
  creditThrough: CreditHorizon
}
StreamCancel = { kind: "stream-cancel", streamId: CanonicalStreamOrdinal }
StreamComplete = {
  kind: "stream-complete", streamId: CanonicalStreamOrdinal,
  itemThrough: TerminalBoundary
}
StreamError = {
  kind: "stream-error", streamId: CanonicalStreamOrdinal,
  itemThrough: TerminalBoundary,
  error: {
    code: "canceled" | "unavailable" | "handler-failed" |
          "unknown-service" | "unknown-member" | "overflow",
    message: string
  }
}

SemanticMessage =
  UnaryCall | UnaryCancel | UnaryResult | UnaryError |
  StreamMethodStart | StreamPropertyStart | StreamItem |
  StreamCredit | StreamCancel | StreamComplete | StreamError
```

`stream-method`和`stream-property`本身同时表达start与期望member kind；不增加冗余`memberKind`。
Method必须有`args`，property不得有`args`。一个合法start命中缺失member、unary member或另一种stream
member kind时，Source Side提交`unknown-member`、`itemThrough: 0`的retained rejection，不执行method、
getter或`subscribe()`，也不回显actual kind。未知service同理使用`unknown-service`。相反，property携
`args`是已知字段冲突的schema fault；未知SemanticMessage kind、exact member `then`和其他profile
violation都是Session fault，不得ACK或Recovery。两个start kind既能安全表达kind mismatch，也令最大args
子树的`65,536`个节点（含数组根）加envelope/message/start wrapper的`10`个节点恰为`65,546`，不修改现有
node limit。

Recognized top-level record与tagged SemanticMessage继续只忽略通过bounded-tail验证的未知member；
property的`args`不是可忽略tail。两个nested untagged `error`对象均closed。Wire彻底删除`error.details`：
sender不得发送，receiver遇到即schema fault。保留`message`，但它只能是Framework按`(record kind, code)`
生成的固定安全文字；不得包含raw Error、value、stack、cause、attacker控制的service/member拼写或其他
diagnostics。Unary同时整体改为`method -> member`、`unknown-method -> unknown-member`；其
call/cancel/result/error、Call Ordinal和Promise语义除此以外保持独立。

### Q9：identity、direction与unary退化路径

每个Session direction只有一个global `seq`/`ackThrough` pair。`seq`只标识Message Receipt evidence；它既
不是Stream Identity也不是Item Ordinal。Call Ordinal只服务unary；Stream Ordinal是另一条direction-local、
连续、never-reuse counter。两者只复用canonical decimal carrier规则，不共享counter或namespace。

```text
Stream Identity = (Session Incarnation, Subscription Direction, streamId)
Item Identity   = (Session Incarnation, Subscription Direction, streamId, itemOrdinal)
```

Subscription Direction是发送start/credit/cancel的方向；反方向发送item/complete/error。两方向可同时合法
使用字符串`"1"`，实现必须以record kind、传输方向及对应Source/Subscriber retained table选表，禁止建立
Session-global streamId namespace，也不增加wire direction字段。Credit Horizon和Terminal Boundary只是
单stream累计counter/evidence，不是identity。

Unary不是one-item stream：它继续使用Call Ordinal、call/cancel/result/error和Promise terminal，不取得
Active Stream Slot、Receive Slot、credit或Terminal Boundary。Unary与stream只共享envelope、seq/ACK、
Application Value、Session/Recovery、ordinary/protected evidence及scheduler。

### Q3、Q4：Message Receipt、state-before-effect与duplicate

Current-binding active record的固定顺序是：先以endpoint/Binding Epoch fence stale input，再做raw/UTF-8/
JSON/duplicate/limit、tagged schema、phase/authority、`ackThrough` bounds和global sequence，最后才查stream
state。Stale binding在Codec、activity deadline和任何Session mutation之前丢弃；可选Direct Close。

`seq == receivedThrough + 1`才是fresh body；`seq > receivedThrough + 1`是Session Protocol fault。合法
`seq <= receivedThrough`可先处理其有效反向ACK，然后在semantic state machine之前抑制body并重发当前
receipt。Comparison evidence仍在时，只接受原`seq`与原semantic body的exact replay（envelope只可更新
`ackThrough`）；same seq altered body是equivocation Session fault。Evidence合法GC后不保留永久payload
fingerprint：schema合法的旧seq body仍按`receivedThrough`抑制且绝不复活stream；malformed旧body仍先在
schema层fault。Fresh seq复用相同itemOrdinal、streamId或terminal永远不是replay，而是identity/transition
fault。

Fresh item的Subscriber commit必须按以下顺序原子化：

1. 验证existing stream、方向、无terminal、`itemOrdinal == dispositionFrontier + 1`、不超过本地已授
   Credit Horizon，并确认原Receive Slot与normalized snapshot。
2. 先提交deliver-once或suppressed的Stream Item Disposition、frontier、`receivedThrough`、replay
   suppression evidence和`ackDirty`。
3. 退出mutation gate后才调用Observer `next()`。
4. 仅当callback同步返回且local observation与Session latch仍开放时，原位re-arm W=1 slot并coalesce下一
   horizon；callback内unsubscribe/close不补credit。

所以Message Receipt ACK只证明semantic disposition与duplicate suppression已经retained；它不证明
callback返回、application处理、Source Teardown、terminal winner或资源/drain retirement。

### Q2：固定W=1与credit transition

Start必须显式携带且只允许`creditThrough: 1`。令Source entry的`C = acceptedCreditThrough`、
`N = admittedItemThrough`，在无terminal的active state始终保持：

```text
C - N in { 0, 1 }
initially C = 1, N = 0
```

Fresh credit的精确transition为：

| Source state / input | Transition |
| --- | --- |
| active, `creditThrough < C` | credit rollback，Session Protocol fault；不ACK |
| active, `creditThrough == C` | retained no-op receipt |
| active, `creditThrough > C`且`creditThrough == N + 1` | 原子推进`C`并receipt |
| active, 其他higher value | over-credit Session Protocol fault；不ACK |
| terminal已赢但entry未retire，value `< C` | rollback Session Protocol fault；不ACK |
| terminal已赢但entry未retire，value `>= C` | absorbing no-op receipt |

最后一行绝不推进horizon、mint容量、恢复/重订阅source或改写terminal。故initial horizon尚未消费时
`creditThrough: 3`是Session fault；item1已admit后也只有2可推进。Subscriber收到未获授权的item2同样是
Session Protocol fault，不ACK且不调用Observer；不能把它降级成单stream error。

Source Emission只有先消费credit并取得ordinary byte/count/future-seq obligation后才成为下一Item Ordinal。
无credit或无ordinary item capacity的causing emission不产生item，而在Source gate竞争`overflow` terminal。

### A：start、Source与互斥terminal状态机

Source Side对fresh expected Stream Ordinal执行：

```text
absent
  -> provisional ordinary work/stream/job/args reservations
     + protected terminal obligation
  -> exact route
     -> retained rejection(boundary 0)
     -> Route Capture -> Remote Stream Admission -> one Source Start Job
  -> source-active
  -> exactly one Terminal(outcome, admittedItemThrough)
  -> source fenced -> one teardown attempt -> active ownership retired
```

普通capacity检查先于route；有protected convergence时，资源不足或G cutoff提交safe rejection，route未知或
kind mismatch提交semantic rejection。只有exact match才Route Capture/Remote Admission；只有durably接受
initial horizon 1后才可Source Subscription Admission。任一rejection都会retained disposition expected
Stream Ordinal并推进start receipt，但不执行application。无法持有protected terminal obligation时不得ACK
fresh start，而是Session resource/counter fault。

Source entry只有一个first-winner terminal slot。`stream-complete`和`stream-error`互斥，sender-state、code和
boundary的完整矩阵如下；`N`是winner时的`admittedItemThrough`：

| Sender state / cause | Permitted wire | Boundary |
| --- | --- | --- |
| pre-Admission ordinary resource不足或G先赢 | `stream-error(unavailable)` | `0` |
| pre-Admission unknown service | `stream-error(unknown-service)` | `0` |
| pre-Admission unknown member/kind mismatch | `stream-error(unknown-member)` | `0` |
| admitted source completion | `stream-complete`，不得有`error` | exact `N` |
| admitted acquisition/subscribe/source/value failure | `stream-error(handler-failed)` | exact `N` |
| admitted emission无credit/capacity/future seq | `stream-error(overflow)` | exact `N` |
| admitted Source-Side cancel winner | `stream-error(canceled)` | exact `N` |
| terminal已retained | 只能重放原seq与原body | 原boundary |
| F/Session termination | 不发送stream terminal | n/a |

Subscriber必须验证existing stream、合法方向、尚无fresh terminal，并要求`itemThrough`精确等于contiguous
disposition frontier。Rejection codes只允许boundary 0；complete没有error；stream-error必须有closed
code/message。Ahead、behind、第二个或冲突terminal立即Session fault，不等待缺项、不跳项、不改winner。
Receiver无法证明remote隐藏的route phase，因此sender按上表约束自身，receiver按可观察的record/code/
boundary及本地state约束输入；这与既有unary sender-conformance边界一致。

选择separate complete/error branches优于`stream-terminal { outcome, error? }`，因为schema直接排除
complete-with-error、error-without-error和code/outcome optional笛卡尔积。也不增加`stream-reject`：
pre-Admission rejection仍占同一Stream Identity、Terminal Boundary、receipt/replay/GC及Subscriber
projection；单独record family只会复制状态机。`canceled`、`unavailable`等继续是closed error code，
`terminated`与`outcome-unknown`只属side-local Session projection，永不上wire。

### Q6：unsubscribe/cancel的五层authority

必须分别保留以下五个事实，任意一项都不能推导下一项：

```text
cancel receipt
!= Source-Side cancel winner
!= retained terminal evidence
!= teardown receipt
!= resource/drain retirement
```

Subscriber `Pending`在Outgoing Admission前unsubscribe只做identity-free retraction：无streamId、wire cancel、
remote execution或terminal。Outgoing Admission原子分配identity、保留start replay并持有protected cancel
obligation；之后第一次unsubscribe同步关闭local observation，并最多materialize一个`stream-cancel` intent。
它不制造Observer terminal，也不具有remote winner authority。

Source收到fresh cancel时，若terminal slot为空，则Source-Side cancel admission可令`canceled`以当前N获胜，
随后fence、one-shot teardown并保留`stream-error(canceled)`；若其他terminal先赢，cancel只做no-op receipt。
反之cancel先赢后，late source complete/error也不能改写winner。Cancel的Message Receipt ACK只允许释放其
replay evidence，不证明cancel赢、terminal已送达、teardown结束或stream/drain资源可退休；SPI的
`finish(outcome, onReleased)` teardown receipt仍是local callback，不是wire handshake。

### Q5：Recovery barrier、replay与GC

每个sending direction独立冻结replacement安装瞬间的finite original-seq barrier。必须先按原seq重放该集合；
Recovery中产生的新item/terminal保留semantic ordinal、reservation和unsequenced intent，不分配seq、不扩展
barrier、不重新执行method/getter/subscribe。Barrier清空后先满足同stream item-before-terminal，再进入08号
票的control/progress alternation、unary virtual participant及per-stream round-robin。

跨方向credit不能绕过barrier：一个方向重放的old credit可以令Source获得发送资格，但由此产生的新item仍在
反方向barrier后保持unsequenced；任何new credit自身也必须等其发送方向barrier清空。Successful Recovery
保留Stream Identity、ordinals、horizons、item dispositions、Source Job/Subscription和terminal winner。

GC仍按direction且无finish handshake：

- start/item/credit/cancel/terminal的immutable replay pair保留到Message Receipt ACK、accepted
  authenticated resume cursor或Session terminal覆盖其seq；
- item ACK可释放Source端normalized payload/replay charge，但不证明Observer processing；
- credit ACK不释放Receive Slot backing；只有grant被item消费后原位re-arm，或terminal/Session convergence
  证明future item不可能时才释放；
- terminal winner立即fence/teardown，不等待ACK；self-contained terminal replay可在active ownership退休后
  独立保留；
- cancel ACK只释放cancel replay；Subscriber其他ownership等authoritative terminal或Session convergence；
- direction-local Stream Ordinal high-watermarks与global cursors保留到Session terminal，所以不需要per-stream
  tombstone。

### Q8：retired identity与late control

Fresh start只允许`streamId == incomingHighWatermark + 1`。复用`<= high-watermark`或跳到future id都是
Session fault。Entry完全retired后：

| Fresh valid record | `streamId <= high-watermark` | future `streamId` |
| --- | --- | --- |
| `stream-credit` / `stream-cancel` | retained no-op receipt | Session fault |
| `stream-item` / `stream-complete` / `stream-error` | Session fault | Session fault |
| `stream-method` / `stream-property` start | identity-reuse Session fault | gap Session fault |

因此fresh `stream-error`对retired identity永远不是late-control no-op；只有其原seq/body的message-layer replay可
被抑制。Past retired credit/cancel因per-stream state已释放，只凭high-watermark吸收，不能再比较horizon或
winner；这条规则不复活identity、source、capacity或terminal。

### Q7：semantic rejection、validation与fault scope

| Input / boundary | Exact outcome |
| --- | --- |
| local outgoing preflight capacity不足 | current subscription local `unavailable`；无identity/wire/application execution |
| valid expected incoming start ordinary不足、protected intact | retained `stream-error(unavailable, 0)`；Session健康 |
| valid unknown service | retained `stream-error(unknown-service, 0)`；Session健康 |
| valid unknown member或member-kind mismatch | retained `stream-error(unknown-member, 0)`；Session健康且不执行application |
| admitted invalid source/value/source failure | retained `stream-error(handler-failed, N)` |
| valid Source Emission无credit/ordinary capacity/future seq | retained `stream-error(overflow, N)` |
| legal granted item却无Receive Slot或protected invariant失效 | affected Session resource fault；不ACK |
| unknown semantic kind、property-with-args、`then`、wrong direction、seq/ACK gap、identity reuse、item gap、over-credit/rollback、terminal boundary/winner conflict | affected Session Protocol fault；不ACK、不Recovery |
| stale fenced binding | 在Codec/activity/state前no-op；可选Direct Close |
| shared Owner ledger/scheduler invariant corruption | 仅真正shared corruption才扩大到Owner |

Semantic/resource rejection是合法Stream Terminal disposition，不是Protocol fault。Profile/schema/authority/
transition violation则不能以单stream error把攻击者输入变成可信semantic state。

### Q10：protected counter tail与counter exhaustion

原样复用08号票。令：

```text
MAX = 9007199254740991
L   = MAX - 512
H   = highestAllocatedSeq
F   = retained but unsequenced ordinary future obligations
PT  = protected terminal obligations still needing seq
PC  = protected cancel obligations still needing seq

0 <= F <= max(0, L - H)
0 <= PT <= 256
0 <= PC <= 256
PT + PC <= MAX - H - F
```

Start/item/credit是ordinary；complete/error/rejection/cancel使用protected convergence。Ordinary seq最多分配到
`L`：若item obligation先占到`L`，其terminal/cancel仍由tail表达。每条Subscriber stream在Outgoing
Admission前持有`PC`，每个incoming start在route/admission前持有`PT`；任何fresh work在可能需要收敛前必须
先有对应reserve。无法保住protected convergence时不得ACK fresh start或继续ordinary admission，而以
Session resource/counter-exhaustion收敛；不得wrap、reset、复用identity或向protected tail借ordinary容量。

Stream Ordinal、Item Ordinal、Credit Horizon与global seq都是safe-integer、never-wrap。Item/Credit到MAX后
不再re-arm；Source仍可消费已授最后一项，下一次zero-credit emission才以`overflow`收敛。Stream/global
counter drain不引入新的stream wire code。

### Q11：最大envelope与sender preflight

按compact JSON、最大16-digit seq/ack/streamId、service/member各256 UTF-8 bytes且取最坏的256个U+0000
（每个JSON转义为6 bytes）、Application Value weight恰为`1,000,000 B`：

```text
max stream-method envelope = 1,003,259 B
max stream-item envelope   = 1,000,174 B
Transport floor            = 1,048,576 B (exactly valid)
floor + 1                  = 1,048,577 B (invalid)
```

Outgoing Admission必须在分配identity或执行application前，以actual semantic body/seq以及未来最大16-digit
`ackThrough`连同optional field punctuation进行encode/preflight；不能只验证当前无ACK的较短envelope。
Raw corpus同时证明最大Application Value、`65,546` node start、上述两个stream envelope、exact 1 MiB valid和
+1 invalid。不得引入fragmentation、Transport capacity getter、Profile升级或缩小Application Value。

### Q12：G、F与ordered Close

G只冻结新的admission roots。G后的current-binding fresh start仍完整经过fixed/security/schema/seq/ordinal
验证；若本应合法，则在protected capacity可用时提交`stream-error(unavailable, 0)`，不得route capture或执行
application。若Route Capture先于并发G、但Remote Stream Admission尚未commit，G仍以相同protected
`unavailable`获胜，captured route不得执行。既有admitted streams仍按09号票完整drain。

F先以一个Session-wide batch fence全部stream/call/binding，再unlink/drop unsent intents、析出one-shot local
Observer/teardown shells并Direct Close。F期间无任何egress：不发送stream terminal、顶层Close、
`terminated`、`finish` handshake或其他收敛record，也不进入Recovery。已有authoritative terminal在F前已
commit则保持该winner；F先赢时Subscriber保留已见prefix并以side-local `outcome-unknown`收敛，Source无wire
winner而以internal `terminated`收敛。

Protected current binding上的Close按ingress mutation order线性化：terminal先commit则Close不能改写；Close/F
先fence则late terminal不能取得authority。Top-level Close仍只在graceful drain完全结束后发送，且
unsequenced、unacknowledged、non-replay。

### C：wire corpus与security KAT整体替换

四个`husky-di-rpc/1` assets都必须作为最终同名Profile的一套原子artifact重新建立，不能在旧unary corpus上
局部追加：

- `schema.json`保留bootstrap/control defs，整体替换SemanticMessage union；新增两个start及item/credit/
  cancel/complete/error branches和ordinal/horizon/boundary defs，改`member`/`unknown-member`，删除
  `details`，property禁`args`，同步Close forbidden-known-members，并保持2020-12、open tagged tails与现有
  depth/node/byte limits。
- `raw-vectors.json`整体rebaseline lexical/bootstrap及unary vectors，并加入每个stream branch/code、两个
  start kind与kind mismatch、property-with-args、unknown kind/`then`、direction/ordinal/horizon/boundary/
  retired identity、max method/item、65,546 nodes、exact 1 MiB及每个limit+1正反vector。
- `transcripts.json`整体替换active state assertions，覆盖独立unary、method/property、retained rejection、
  W=1、state-before-effect、overflow、cancel race、terminal matrix、duplicate/equivocation/GC、lost item/ACK、
  Recovery barrier与跨方向credit、retired controls、same-id opposite directions、protected tail、G/F/Close；每步
  断言binding、双方state、source acquire/subscribe/teardown count、Observer prefix/terminal、counter、credit和
  retained evidence。
- `known-answer-vectors.json`即使Profile字符串不变也要整体rebaseline provenance并独立重算。JCS canonical
  strings、Session context hash、HKDF/proof key、fresh/resume/accept/reject hashes/proofs及引用RFC vectors在
  算法与输入不变时可以byte-identical；不得为了制造diff改变cryptographic truth。必须新增/替换stateful
  security transcript，证明stream seq进入原累计cursor/barrier、lost stream ACK、old-binding fencing、wrong
  proof不会破坏retained streams、Recovery terminal不重订阅，以及active records只依赖Protected Transport与
  Binding Epoch fencing、不虚构per-record HMAC。

### Required adversarial transcripts与deletion test

最终corpus至少执行以下可判定trace；每条都必须同时断言wire、retained state、application callback count与
resource release，而不只检查最终Observer值：

| Trace | Required result |
| --- | --- |
| method/property mismatch vs property-with-args | 前者`unknown-member(0)`且零执行；后者Session fault且不ACK |
| W=1 burst与`creditThrough: 3` | item1先commit；item2 zero-credit为overflow；恶意higher credit为Session fault |
| `next()`内unsubscribe | item恰好一次、不补credit、至多一个cancel、无local terminal notification |
| lost item vs lost ACK | 原seq/body重放或cursor裁剪；Observer prefix不重复；subscribe count保持1 |
| exact replay/equivocation/fresh ordinal reuse/GC后old seq | 分别suppress、Session fault、Session fault、suppress且不复活 |
| Recovery中new item+terminal与reverse credit | 两方向原barrier优先，新work不扩barrier，item-before-terminal且不重订阅 |
| cancel/complete race | Source gate first-winner，terminal不改写，teardown一次；cancel ACK仅GC replay |
| terminal-won late higher credit | receipt-only absorbing no-op，horizon/capacity/source/winner全不变 |
| retired controls与fresh stream-error | past credit/cancel no-op；future control、reused start/item/terminal全fault |
| simultaneous opposite-direction streamId `"1"` | 两张direction-local table独立推进，无碰撞 |
| `H + F == L` | item obligation落L，terminal/cancel走tail；新ordinary不借tail、不wrap |
| exact/max envelope | 1,003,259与1,000,174通过；1 MiB通过；byte/node limit + 1拒绝 |
| G/F/ordered Close | G合法拒绝；F无egress且先fence；先commit terminal保持，F先赢则local unknown |

Deletion test确认最小集合：删除global seq会失去跨unary/stream累计receipt与exact replay；删除streamId、
itemOrdinal、cumulative credit horizon或terminal boundary会分别失去subscription identity、per-stream prefix、
duplicate-safe flow control或exact terminal prefix；删除两个start discriminant无法安全表达kind mismatch；删除
stream-cancel无法传播post-Admission unsubscribe；把unary折成stream会改变Promise/Call Ordinal/slot/credit
语义。反之，`memberKind`、Session-global stream namespace、Call Ordinal复用、per-item/delta ACK、统一tagged
terminal、单独reject/canceled record、wire `details`、finish handshake、public window、fragmentation和
Transport capacity getter全部可删除而不损失上述保证，故不引入。

只读对手最终`PASS`，没有可导致`BLOCK`的剩余未决点。本票没有产生新的领域概念；`CONTEXT.md`已有
Stream Identity/Ordinal、Item Ordinal、Credit Horizon、Terminal Boundary、Message Receipt ACK、Recovery
Replay Barrier及protected convergence等权威词汇，wire record literal不重复登记为领域术语。
