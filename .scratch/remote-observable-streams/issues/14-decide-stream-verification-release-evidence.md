# 决定流支持的规范验证、wire corpus 与发布证据

Type: grilling
Status: resolved
Blocked by: 03, 10, 11, 12, 13
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

确定本次 normative specification 改写需要的稳定 requirement/case IDs、requirement-to-evidence matrix 与 release gate。覆盖 Descriptor/facade/exposure type/runtime fixtures、source lifecycle、同步 burst、credit exhaustion、item/terminal duplicate与错序、Recovery replay、资源边界、公平性、shutdown、custom Protocol conformance、Adapter load seam、browser、packed ESM/CJS/types consumers，以及 husky-di-rpc/1 schema/raw vectors/stateful transcripts/security vectors 的整体替换。同步界定 README/PROTOCOL/TRANSPORT/architecture/CHANGELOG/examples 和 resolveAll removal migration evidence，确保不重编号或复用既有 requirement identity，也不把 implementation file layout 当作规范决定。

## Comments

### 2026-08-23 candidate verification/release contract for opponent review

本轮只提交候选决策，本票继续保持 `claimed`。对手明确 `PASS` 前不写
`Answer`、不改 `resolved`、不推进 map。

Ticket 11/13 的 throwaway P01–P12、R1–R4、B1–B4 只是设计输入与 production 负基线；
它们的 relative-source compile、esbuild bundle 或 prototype runtime PASS 不能填充以下任何
production evidence。

#### 决策边界

- 本票决定可观察合同、稳定身份、证据类型、验收输入/输出、失败归属和发布门禁；
  不决定 production 类、文件、目录、私有 scheduler 或 fixture 的内部布局。
- 规范测试只能从 public caller、Protocol、Transport Adapter 或 published wire/package seam
  观测；不能通过私有 class name、队列长度、microtask 次数或 source path 取得 PASS。
- 实现可以重排任何私有布局，只要下列 stable case selector 在同一 public seam 上仍保持
  同一输入、可观察结果和 failure owner。

#### 1. 不可复用的 requirement/case identity

**Requirement registry.** 继续使用 `RPC-<FAMILY>-NNN`，其中三位数字是永久的不透明
身份，不表示排序或优先级。每个 family 只从已发布最大值之后追加，允许空洞；
禁止重编号、回收、跨 family 搬迁或把旧 ID 变成 alias。只有原子命题、规范强度、
输入域和可观察结果都没变时才可保留旧 ID；更换名词、扩大/缩小适用域或
改变 failure scope 都必须 retire 旧 ID 并新建 ID。

逻辑 registry 必须同时保存 active 和 retired 行：

```text
active:  id, exact normative proposition, status=active, evidence selectors
retired: id, last exact proposition, status=retired, reason, zero-or-more replacement IDs
```

对 active ID 做全局唯一、格式、映射与证据解析审计；对 retired ID 做唯一、不再 active、
不再出现于 case `covers` 的审计。不得再把 active 总数硬编码为当前的 `201`。

本次候选明确 retire 以下已有 ID；它们的 replacement 由下节新 ID 承接：

| Retired IDs | 实质变更 |
| --- | --- |
| `RPC-BASE-002` | public Observable 不再全部 non-owning；Remote Observable 的 subscription 是 owning work root |
| `RPC-PKG-007..008` | root 与 `/protocol` exact runtime/type inventory 改变 |
| `RPC-DESC-002..004` | `methods`-only/function-snapshot 合同改为 mixed `members` 及 data/getter/method 分类 capture |
| `RPC-STATE-001` | 旧命题绑定 Group eligibility；六状态命题以新 ID 重述 |
| `RPC-CALL-001`, `RPC-CALL-003`, `RPC-CALL-007`, `RPC-CALL-009` | facade/signal/error 命题捆绑 `resolveAll`/Group 或 `unknown-method` |
| `RPC-GROUP-001..003` | Group 整体删除，无 replacement facade |
| `RPC-EVENT-001..003` | 旧 call-only pair/metadata/outcome 与 `unknown-method` vocabulary 被 closed call+stream union 取代 |
| `RPC-SPI-007` | incoming terminal union 使用旧 `unknown-method` 且不含 stream |
| `RPC-WIRE-011..012`, `RPC-VALID-007` | method-only fields、旧 error union 与 name/failure 分类改变 |
| `RPC-RESOURCE-001..003`, `RPC-RESOURCE-005` | Application Work/stream subset/Receive Slot/protected pool 使旧表和公式不再完整 |
| `RPC-POLICY-001..003` | `maxPendingInvocationsPerSession` 及旧 14-field policy 被闭合新 policy 取代 |
| `RPC-SCHEDULE-002` | 旧 two-FIFO order 被 barrier + macro lanes + unary/per-stream participants 取代 |
| `RPC-SHUTDOWN-001`, `RPC-SHUTDOWN-005`, `RPC-CLOSE-001` | G/F 与 drain predicate 必须包含 stream lifetime/evidence |
| `RPC-EVIDENCE-002..003` | 证据类型扩展，且不再把某个 repository file path 写成 normative requirement |
| `RPC-CORPUS-002`, `RPC-RELEASE-001` | unary transcript/type fixture 集合整体换代，Group fixture 退役 |

除上表外的现有 ID 默认仅在其现有原子命题原样保留时 carried forward；不允许
借“stream 也差不多”扩大旧 ID。实现修订若发现另一旧句子含被删 vocabulary，必须回到
本票追加 retirement adjudication，不得由规范作者自行猜测。

**Case registry.** Production case ID 使用与文件、行号、执行顺序无关的 lower-case dotted semantic
identity：`<evidence-class>.<domain>.<semantic-slug>`。禁止使用 `P01`、`R1`、`B1`、测试序号、
fixture path 或 requirement ID 拼接作为 case identity。旧 case 同样只能 carried-forward 或 tombstone，
不得 rename-and-reuse。每个 case 记录 `id, class, covers[], public seam, input, expected result,
failure owner, status`。

JSON 证据 selector 不得继续使用“递归找第一个同名 `id`”。Raw/vector 的 case ID 必须在整个
corpus 唯一；transcript 使用全局唯一 scenario case ID，step selector 为
`<scenario-case-id>#<step-id>`，其中 step ID 在该 scenario 内唯一。同一 selector 解析到 0 或 2+
个对象都是 release failure。

#### 2. 新的原子 requirement registry

以下 ID 在后续 normative rewrite 中必须按行成为独立命题；分号只是本票的紧凑说明，
不授权合并 ID。

| IDs | 每个 ID 固定的原子命题 |
| --- | --- |
| `RPC-DESC-006..009` | `006` 只允许非空 exact `members` 及四种 kind；`007` 固定 direct Observable、stream-property `$`/readonly、参数/项 capability negatives 与双向 invariance；`008` 固定 data method receiver capture、data Observable expose-time guard/capture、getter-only per-Admission read；`009` 固定 exact service/member namespace、`then` 保留、Route Capture 与 cleanup/re-expose 线性化 |
| `RPC-STATE-004` | 六状态 peer 转移与 sticky `closed`，不含任何 Group eligibility |
| `RPC-CALL-010..011` | `010` 固定 single-peer frozen/null-prototype/exact/non-thenable facade、captured receiver 与 stable member identities；`011` 固定 resolve/call/property-read/Observable-retain 在 recovering/draining/closed 时 state-neutral，work 只能由 subscribe/invoke root 开始 |
| `RPC-API-007..008` | `007` 删除 `resolveAll`/Remote Service Group/`RpcPeerResult` 及所有 public/internal Group semantics，无 alias/shim/replacement facade；`008` 只承诺 frozen `peers`、replay-latest `peers$`、stable peer 与独立 child work，`map`/Promise/RxJS 组合的 eligibility/order/concurrency/cancel/error/wait policy 属 application |
| `RPC-STREAM-001..003` | `001` 每次 subscribe 是独立 cold work root，无隐式 share/cache/replay；`002` 固定 Subscriber→state→snapshot→finite Pending→Local→Outgoing 顺序、per-sub snapshot 和 DNE cutoff；`003` 分开 caller observation、Logical Stream、Source Subscription、terminal、teardown、retirement lifetime 与 owning/non-owning Observable 分类 |
| `RPC-STREAM-004..006` | `004` 固定 fixed/security/sequence 后、route lookup 前的 incoming ordinary+protected reservation 及 semantic/resource rejection；`005` 固定 Source Job、method/getter acquisition、exactly-once synchronous `subscribe()`、零-subscription path 与 no retry；`006` 固定 package-private run-to-completion state-before-effect gate，Observer/Transport/application effects 在 commit 后且 serial non-overlap |
| `RPC-STREAM-007..009` | `007` 固定 first-terminal-wins、ordered items/boundary、safe source failure projection 和 Observer throw 不回滚；`008` 只让 explicit unsubscribe 产生 cancel authority，pre-Outgoing 撤回无 cancel，late/duplicate cancel 仅 convergence；`009` terminal commit 立即 fence、one-shot teardown、`onReleased` 后 Source retirement，Protocol evidence 不保留 application object/closure |
| `RPC-STREAM-010..011` | `010` Recovery 保持 facade/Observable/identity/observations/source/ordinals/credit/terminal，永久 retention loss 按 authoritative terminal 或 `outcome-unknown` 收敛且不重订；`011` 显式组合的 child 互相独立，outer unsubscribe 与 teardown(A)→B emission 不得复活或继承旧 Group atomicity |
| `RPC-FLOW-001..003` | `001` credit 是 item-count admission，不是 demand/readiness/receipt/processing/durability，public/Protocol/Transport 不新增 request/window/pause/capacity getter；`002` initial window 固定 `W=1`，start 携 cumulative horizon，Source 只在 durable positive grant 后 subscribe；`003` `next()` safe return 且 observation 仍 open 才 re-arm，equal horizon no-op、higher advance、lower/out-of-range fault |
| `RPC-FLOW-004..006` | `004` 无 credit 或合法 item 普通 capacity 不足选 `overflow`，causing emission 不成 Item；`005` invalid normalization 选 `handler-failed`、pre-admission shortage 选 `unavailable`、peer over-credit 选 Session Protocol fault；`006` 更早 item 保序且 terminal/control 使用 protected convergence capacity，protected failure 是 Session resource fault |
| `RPC-LEDGER-006..008` | `006` Stream Identity=`Session Incarnation + originating Direction + Stream Ordinal`，ordinal 只在 Outgoing Admission 分配、每方向连续且不复用；`007` Item Ordinal 从 1 连续，terminal boundary 等于 contiguous frontier，value equality 不 dedupe；`008` stream/item/credit/terminal 的 retained evidence、payload/backing 与 side-local retirement 分开，普通压力不驱逐 continuity evidence |
| `RPC-ACK-008..010` | `008` 仍只有 per-direction cumulative Message Receipt ACK，不新增 subtype/finish handshake；`009` start/item/credit/cancel/terminal receipt 各自只证明 durable disposition，ACK 可在 effect 前 dirty/piggyback；`010` duplicate 先处理 reverse ACK，exact replay 不重做 admission/effect/teardown，各 direction 按 ACK/cursor/Session terminal 独立 GC |
| `RPC-RECOVERY-007..009` | `007` replacement binding 每 sending direction 冻结 finite barrier，新 work 不扩 barrier，barrier credit 可使 post-barrier item ready；`008` Recovery 不复制 backlog/payload、不重订 source，Connection fence 先于 Codec/activity/ACK/state；`009` 每次 Recovery continuation 携 generation authority，在 replay/application callback 后与 recovered/Pending publication 前复检 |
| `RPC-SEC-010..011` | `010` stream records 使用原 cumulative cursor/barrier 与 Protected Transport + Binding Epoch，不虚构 per-record HMAC；`011` lost stream ACK、old-binding fence、wrong proof 不破坏 retained stream、Recovery terminal 不重订均有 stateful security evidence |
| `RPC-VALID-008..009` | `008` fresh expected stream 按 fixed/security/current binding/schema/seq/ordinal→ordinary reservation→route 的顺序分类 poison/resource/semantic failure；`009` post-G fresh start 仍先走上述验证，仅 valid expected start 可 protected `unavailable`，malicious invalid record 仍 fault |
| `RPC-POLICY-005..007` | `005` 删除 `maxPendingInvocationsPerSession`，唯一 replacement `maxApplicationWorkPerSession=N`、default 256、range 1..256、无 alias；`006` `maxApplicationWorkTotal=T`：Acceptor default 1024 且 `T>=N`，Connector 派生 `T=N`；`007` `S=maxActiveStreamsPerSession` default `min(16,N)`，`ST=maxActiveStreamsTotal`，`S<=N` 且 `S<=ST<=T`，Connector `ST=S`，Acceptor default `min(T,max(S,64))`，不添加其他 stream knob |
| `RPC-RESOURCE-007..009` | `007` 固定 Pending/Application Work `N,B/4`、unretired `N`、stream subset `S/ST`、start jobs `N,B/4`、ordinary evidence `4N,B/2`、terminal payload `N,B/4`、Receive Slot `1,000,256 B`、active metadata `256 B`、reserve `512 KiB`；`008` ordinary/protected/aggregate reservation 在阶段间原子转移、共享 value 不重复计费，terminal/cancel pools 每 direction 各 256；`009` Local Admission 原子取得 Session+Owner work/stream slots、args charge 和 Receive Slot，失败无 identity/wire/remote execution |
| `RPC-RESOURCE-010..012` | `010` identity-free Pending 只在 idle send slot+ordinary start evidence+seq+cancel obligation 全部可得时 Outgoing Admit；`011` Subscriber slots 保留至 terminal projection/suppression，Receive Slot 循环支撑 grant/item/effect/re-arm，local unsubscribe/credit/cancel ACK 不提前释放；`012` incoming start 在 route lookup 前原子预留 work/stream/job/args/active/protected terminal，ordinary shortage 安全拒绝 |
| `RPC-RESOURCE-013..015` | `013` Source Job 复用 handler permits/FIFO+Owner RR，permit 只覆盖 acquisition 和同步 subscribe，active source 不占 permit；`014` Item Admission 先 consume credit、normalize、取 actual bytes/count/future-seq，W=1 不保留第二 raw value；`015` Recovery 不建第二 backlog，Subscriber/Source/replay evidence 按各自 convergence 释放 |
| `RPC-SCHEDULE-007..009` | `007` bootstrap 独占、Recovery barrier first，之后 control/progress macro lanes 从 control 开始有界交替；`008` unary FIFO 是一个 virtual participant，与每 ready stream round-robin，per-stream item-before-terminal dependency 优先；`009` ACK/Ping/Pong 继续 coalesce/bounded alternate，Source Start Job 使用现有 Session FIFO/Owner RR，blocked head 不阻塞无关 identity |
| `RPC-COUNTER-005..006` | `005` 固定 `MAX/L/H/F/PT/PC` protected-tail 公式、ordinary/protected allocation guards、never-wrap/no reuse；`006` Stream/Item Ordinal 和 Credit Horizon 到 max 的确切行为：Stream/global headroom drain Session，Item/Credit 不主动 terminal，下一次 zero-credit emission 才 overflow |
| `RPC-SHUTDOWN-011..014` | `011` G 与 Local Admission 原子排序，facade/Observable 创建仍 state-neutral，post-G subscribe 无 work；`012` Route Capture-before-G 但 Remote Admission-after-G 释放预留并 protected reject，post-G 验证顺序见 `VALID-009`；`013` graceful 继续已 admit item/credit/cancel/terminal/replay，G 不伪造 cancel/complete，infinite/silent source 可阻止 drain 到 deadline；`014` drain predicate 必须同时观测 Pending/unretired unary+stream/jobs/handlers/replay/terminal-cancel/ACK/send/ingress/barrier/Source teardown 全部收敛 |
| `RPC-CLOSE-004..007` | `004` F 是 Session-wide batch：先全量 fence/选 winner，再 unlink/drop unsent，再 Direct Close 不等待，最后 gate 外 effects，且无 Protocol egress；`005` Pending=`unavailable`、admitted/no authority=`outcome-unknown`、existing winner 保持、Source no winner=`terminated`；`006` next→close、subscribe-inside-force、teardown(A)→B.next 均必须保持唯一 winner/order；`007` recovering-at-G、draining binding loss、authoritative Remote Close/simultaneous shutdown 的 exact local/Session/sibling scope |
| `RPC-CLEANUP-005`, `RPC-LIFE-003` | `CLEANUP-005` teardown/Observer failure 不 reject termination task，absolute grace+cleanup deadlines 不重启，不承诺抢占阻塞 JS callback；`LIFE-003` Recovery/G/F/state/event publication 都携 generation authority，已提交 terminal/telemetry/F tail 永久 authoritative，且所有 close/shutdown 仍严格复用 `RPC-LIFE-001` 的同一 Promise |
| `RPC-EVENT-008..010` | `008` 按 seam 区分 owning Remote Observable 与 non-owning observation/Transport streams；`009` 每 side qualifying stream attempt 恰好一 started/finished pair，outgoing/incoming cutoffs 不同，semantic rejection 有 safe Source pair、resource rejection 无 Source pair；`010` closed event union 固定 caller/source direction、canonical service/member omission 和 exact outcome/code matrix |
| `RPC-EVENT-011..014` | `011` count 按 committed item/disposition，overflow-causing emission 不计，duration 止于 terminal commit 但 Source finished 等 teardown attempt；`012` payload/raw Error/wire identity/ordinal/proof/attacker spelling 不进 event，duration/count saturate；`013` serialized non-reentrant FIFO：item effect→stream-finished→peer-closed→topology-closed→event$ complete，Recovery 不新建 pair；`014` per-subscriber state publication 和 revocable lifecycle event 复检 generation，closed 后不回写 stale state/event |
| `RPC-SPI-013..017` | `013` method/property 共用 discriminated stream request + reserve/commit/start/cancel seam；`014` Subscriber `reserveItem/reserveTerminal` 先 disposition/receipt/state 后 effect，只回 `rearm|closed`；`015` Source `reserveEmission()` 在 Framework 触碰 raw value 前取 W=1 position；`016` `finish(outcome,onReleased)` 立即 fence，真实 teardown attempt 后恰一次 release；`017` Recovery 保留 capability/source，G/F 撤销 authority，不暴露 raw Observable/value/Error、credit/seq/ACK/replay/Transport capacity |
| `RPC-TRANSPORT-013` | `IRpcConnection` 仍恰好 `message$` / `send(Uint8Array)` / `close()`，complete-message、stable bytes、单 unsettled send、finite native queue、1 MiB、Direct Close 责任不变，无 stream-aware method |
| `RPC-CONFORMANCE-004..005` | `004` Protocol runner 增加 stream credit/overflow/order/retention/fairness/Recovery/G/F 及 broken-Protocol diagnostics；`005` Adapter runner 保持 stream-unaware，另用有界 complete-message Connection 做 Protocol/runtime aggregate load，Adapter failure 映射 binding failure/Recovery 而非 Stream Overflow |
| `RPC-WIRE-016..018` | `016` 在原 `husky-di-rpc/1` 进行唯一 pre-1.0 整体替换，无 fingerprint/bridge/dual profile/legacy codec，final 后只能加安全可忽略 optional fields；`017` final SemanticMessage union 分开 unary call、stream method start、stream property start/item/credit/cancel/terminal；`018` `method`→`member`、`unknown-method`→`unknown-member`、property 禁 args，direction-local stream/item identity 与 unary identity 不混用 |
| `RPC-WIRE-019..021` | `019` W=1 credit exact transition table；`020` start/source/terminal/error/boundary closed matrix，删除 raw details 并只留安全 fixed failures；`021` current-binding ingress 顺序、duplicate/equivocation/gap/regression/over-credit/illegal transition 的 exact fault scope |
| `RPC-WIRE-022..024` | `022` retired identity 的 late credit/cancel 可 no-op，late item/terminal/reused start 必须 fault；`023` 固定 method envelope `1,003,259 B`、item envelope `1,000,174 B`、exact 1 MiB valid/+1 invalid、max nodes `65,546`；`024` G protected rejection、F no-egress 与 ordered unsequenced Close 的完整 wire state |
| `RPC-CORPUS-005..008` | `005` schema/raw/transcripts/security 四个原 export path 同一最终 revision 原子替换，无 legacy package asset/alias/runner/archive；`006` schema+raw 覆盖 final grammar、lexical/fixed/max/limit±1；`007` stateful transcripts 每步同时断言双方 state/binding/callback/resources/counters/credit/evidence/next legal records；`008` KAT 独立重算 provenance 与 stream cursor/Recovery/security transcripts，不为了产生 diff 改变仍正确的 cryptographic bytes |
| `RPC-EVIDENCE-004..007` | `004` active+retired requirement/case immutable ledger；`005` 每 active requirement 恰一 matrix row、至少一可解析 stable case，JSON selector 全局唯一；`006` 证据类型覆盖 specification/type/runtime/Protocol/Transport/schema/raw/transcript/security/browser/package/doc/reproducibility，所有 `N/A` 有理由；`007` 无 skip/todo/only/flaky allowance，negative baseline 和 failure owner 必须显式，throwaway 不能成 production acceptance |
| `RPC-PKG-010..013` | `010` root exact runtime/type inventory；`011` `/protocol` exact runtime/type inventory；`012` `/transport` 与 `/conformance` exact runtime/type inventories 及 shared symbol identity；`013` 四个 wire JSON subpath 只解析 final four-tuple，private deep import 与 legacy path 失败 |
| `RPC-RELEASE-006..008` | `006` 只接受 version/changelog 生效后从 clean workspace build 的 actual `.tgz`，被验收的同一字节 artifact 才可 publish；`007` isolated install 后 Node ESM 与 Node CJS 直接 load/run，无 bundle/source/paths/workspace symlink；`008` installed declarations 在 NodeNext `.mts`/`.cts`、strict、`skipLibCheck:false`、`types:[]` 各自正反 compile |
| `RPC-RELEASE-009..012` | `009` installed tarball 的 DOM-only consumer 无 ambient Node types，bundle 后在 Chromium/Firefox/WebKit 运行 stream/Recovery/crypto；`010` runtime 用 module namespace own-key exact set，type 用 TypeScript compiler 解析 emitted declarations+正反 imports，不得用 `Object.keys`/Bundler 冒充；`011` 同 commit/toolchain/lockfile 两个独立 clean worktree 产生相同 canonical tar tree，无 stale `dist`/cache；`012` release workflow 必须在 `changeset version` 之后重新 install/build/test/pack/consumer/browser，再 publish 已验收 tgz |
| `RPC-MIGRATION-001..003` | `001` 旧稿 Session 不迁移，drain/terminate、同时升级、fresh reconnect，最终 conformers 仍跨 package build fresh/resume；`002` Group 删除不提供 replacement semantics；`003` `peers.map`/Promise/RxJS 示例必须显式显示独立 child ownership，不宣称 common normalization/atomic reserve/wait-all/Group fairness |
| `RPC-DOC-001..006` | `001` README 描述 mixed members/cold stream/errors/migration；`002` PROTOCOL 完整描述 W=1、replay/resources/G/F/security/corpus；`003` TRANSPORT 记录不变三成员 seam、finite limits、load failure ownership；`004` architecture source 与 rendered diagram 语义一致且无 method-only/Group 节点；`005` CHANGELOG+Changeset 记录 `0.0.0→1.0.0`、profile rewrite 和 breaking migration；`006` examples 使用 `members`、single-peer/explicit composition，无 `resolveAll`/Group/`unknownMethod`/old policy token |

#### 3. Production case catalog

以下是最低 production catalog；实现者可添加新 case，不得删除、改名或用更粗的 happy-path
case 取代。旧 Protocol/Adapter case 若命题不变就原 ID carried forward；
`protocol.incoming.semantic-unknown-method` 必须 tombstone，用下表 `unknown-member`
case 替换。

| Class | Stable case IDs 与必须观察的边界 |
| --- | --- |
| Type | `type.descriptor.mixed-members`；`type.stream.capability-boundaries`；`type.facade.subject-narrowing`；`type.facade.non-thenable-exact-members`；`type.public.legacy-absence`；`type.policy.closed-options`；`type.event.closed-stream-union`；`type.protocol.final-stream-seam`；`type.transport.exact-seam`；`type.package.root-positive-negative`；`type.package.protocol-positive-negative`；`type.package.nodenext-mts`；`type.package.nodenext-cts`；`type.browser.dom-only` |
| Runtime descriptor/facade | `runtime.descriptor.mixed-members`；`runtime.descriptor.invalid-exact-shapes`；`runtime.exposure.capture-cleanup-reexpose`；`runtime.exposure.getter-method-safe-failure`；`runtime.facade.cold-identities`；`runtime.facade.state-neutral`；`runtime.composition.independent-children` |
| Runtime lifecycle | `runtime.stream.preflight-admissions`；`runtime.stream.argument-mutation-per-subscription`；`runtime.stream.capacity-before-route`；`runtime.stream.source-exactly-once`；`runtime.stream.callback-wins-before-return`；`runtime.stream.reentrancy-order`；`runtime.stream.cancel-teardown`；`runtime.stream.observer-throw-no-redelivery`；`runtime.stream.recovery-loss`；`runtime.flow.w1-overflow`；`runtime.flow.invalid-vs-capacity-failure` |
| Runtime resources/shutdown | `runtime.resource.policy-boundaries`；`runtime.resource.receive-slot-lifetime`；`runtime.resource.protected-tail`；`runtime.schedule.stream-unary-fairness`；`runtime.schedule.recovery-barrier`；`runtime.shutdown.g-cutoffs`；`runtime.shutdown.g-valid-vs-poison`；`runtime.shutdown.f-batch`；`runtime.shutdown.reentrant-effects`；`runtime.shutdown.unique-task`；`runtime.publication.generations` |
| Runtime telemetry | `runtime.event.side-local-pairs`；`runtime.event.semantic-vs-resource-rejection`；`runtime.event.count-duration-cutoffs`；`runtime.event.payload-safety`；`runtime.event.fifo-recovery-force` |
| Protocol conformance | `protocol.stream.outgoing-reserve-start-cancel`；`protocol.stream.incoming-resource-before-route`；`protocol.stream.incoming-semantic-unknown-member`；`protocol.stream.projection-disposition-rearm`；`protocol.stream.source-reserve-before-raw`；`protocol.stream.source-w1-overflow`；`protocol.stream.terminal-teardown-release`；`protocol.stream.recovery-no-resubscribe`；`protocol.stream.resource-counter-fault`；`protocol.stream.fairness-progress`；`protocol.stream.shutdown-g-f`；`protocol.stream.broken-seam-diagnostics`；`protocol.stream.aggregate-bounded-load` |
| Transport/Adapter | 既有 Connector/Acceptor Adapter stable cases 全部 carried forward；新增仅与 bytes/Connection 有关的 `transport.connection.complete-message-load`、`transport.connection.one-mib-boundary`、`transport.connection.bounded-send-failure`、`transport.connection.direct-close-after-failure`。Adapter runner 不可观察 stream ID/credit/terminal。 |

`protocol.stream.aggregate-bounded-load` 的 deterministic fixture 固定为 4 个 active W=1 streams + 1 个 unary
participant，每 stream 完成 8 轮 item/credit，间插 ACK/control/replay，Connection 仍只允许一个
unsettled `send()`。一个变体在固定的下一次 send 拒绝：可观察结果必须是 binding fence/Recovery，
保留证据在 replacement binding exact replay 后继续，不得把 Adapter failure 投影为 `overflow`。
这个负载 case 证明 cross-seam ownership，不承诺任意无界多流负载永不触及 native queue。

| Class | Stable case IDs 与必须观察的边界 |
| --- | --- |
| Wire state machine | `wire.rpc1.final-semantic-union`；`wire.rpc1.stream-start-kinds`；`wire.rpc1.directional-identities`；`wire.rpc1.w1-transition-table`；`wire.rpc1.terminal-error-matrix`；`wire.rpc1.ingress-validation-order`；`wire.rpc1.duplicate-equivocation`；`wire.rpc1.retired-identity`；`wire.rpc1.counter-protected-tail`；`wire.rpc1.max-envelopes`；`wire.rpc1.shutdown-g-f-close` |
| Schema | `schema.rpc1.final-semantic-union`；`schema.rpc1.closed-errors-and-limits`；`schema.rpc1.open-compatible-tails` |
| Raw | `raw.rpc1.final-valid-invalid`；`raw.rpc1.lexical-utf8-duplicates-trailing`；`raw.rpc1.method-property-shapes`；`raw.rpc1.directional-identity-boundaries`；`raw.rpc1.w1-over-credit`；`raw.rpc1.terminal-error-boundaries`；`raw.rpc1.one-mib-and-envelope-limits`；`raw.rpc1.post-g-valid-vs-poison` |
| Required stateful transcripts | `transcript.rpc1.method-property-mismatch`；`transcript.rpc1.w1-burst-overcredit`；`transcript.rpc1.next-unsubscribe`；`transcript.rpc1.lost-item-vs-ack`；`transcript.rpc1.replay-equivocation-gc`；`transcript.rpc1.recovery-bidirectional-barrier`；`transcript.rpc1.cancel-complete-race`；`transcript.rpc1.terminal-late-credit`；`transcript.rpc1.retired-controls`；`transcript.rpc1.opposite-direction-same-id`；`transcript.rpc1.protected-tail`；`transcript.rpc1.max-envelope`；`transcript.rpc1.shutdown-g-f-close` |
| Additional transcripts | `transcript.rpc1.resource-before-route`；`transcript.rpc1.item-terminal-order`；`transcript.rpc1.observer-throw-no-credit`；`transcript.rpc1.stream-unary-fairness`；`transcript.rpc1.counter-maxima`；`transcript.rpc1.retention-loss`；`transcript.rpc1.telemetry-side-pairs`；`transcript.rpc1.adapter-failure-recovery` |
| Security | `security.rpc1.kat-independent-provenance`；`security.rpc1.stream-cursor-lost-ack`；`security.rpc1.old-binding-fence`；`security.rpc1.wrong-proof-retains-stream`；`security.rpc1.recovery-terminal-no-resubscribe`；`security.rpc1.post-g-validation-order`；`security.rpc1.protected-transport-no-record-mac`；`security.rpc1.payload-error-redaction` |
| Browser | `browser.remote.dom-only-installed`；`browser.remote.mixed-facade-non-thenable`；`browser.remote.stream-three-engines`；`browser.remote.reentrancy-recovery`；`browser.remote.webcrypto-stream-resume` |
| Package | `package.remote.actual-tarball-files`；`package.remote.node-esm-direct`；`package.remote.node-cjs-direct`；`package.remote.nodenext-mts`；`package.remote.nodenext-cts`；`package.remote.exact-runtime-inventory`；`package.remote.exact-type-inventory`；`package.remote.shared-symbol-identities`；`package.remote.wire-four-tuple`；`package.remote.no-private-or-legacy-paths`；`package.remote.reproducible-canonical-tree`；`package.remote.publish-tested-bytes` |
| Documentation | `doc.remote.readme`；`doc.remote.protocol`；`doc.remote.transport`；`doc.remote.architecture-source-render`；`doc.remote.changelog-changeset`；`doc.remote.examples-migration`；`doc.remote.no-legacy-vocabulary` |
| Installed/cross-build | `runtime.package.installed-stream-smoke`；`runtime.package.exported-corpus-execution`；`protocol.package.installed-conformance`；`transport.package.installed-conformance`；`wire.package.exported-corpus-execution`；`schema.package.final-schema`；`raw.package.final-vectors`；`transcript.rpc1.cross-build-fresh-resume`；`transcript.rpc1.old-session-cutover`；`security.rpc1.cross-build-kat`；`browser.remote.example-installed` |
| Migration | `type.migration.final-examples`；`runtime.migration.explicit-composition`；`protocol.migration.cross-build-fresh-resume`；`transport.migration.unchanged-adapter` |
| Evidence audit | `runtime.evidence.requirement-case-ledger`；`runtime.evidence.selector-uniqueness`；`protocol.evidence.case-result-registry`；`transport.evidence.case-result-registry`；`wire.evidence.selector-registry`；`schema.evidence.selector-registry`；`raw.evidence.selector-registry`；`transcript.evidence.composite-selector-uniqueness`；`security.evidence.selector-registry`；`browser.evidence.case-result-registry` |

每个 transcript step 必须同时断言两端的 Session/binding phase、`expected/receivedThrough/highestSent`、
Stream/Item Ordinal、Credit Horizon、callback count/order、Application Work/Active Stream/Receive Slot/ordinary/protected
reservations、retained replay/equivocation evidence、terminal/teardown/retirement 以及下一步允许/禁止的 record。
只断言 caller 结果而不断言这些状态，不算 stateful transcript evidence。

#### 4. Requirement-to-evidence matrix

最终 machine-readable matrix 必须把下表的 range 展开为**每 active requirement 恰好一行**。
本票按共享证据集分组只为便于审阅，不允许 production matrix 保留 range row。
每行 `Spec` 都必须有唯一 logical selector `specification:<requirement-id>`，例如
`specification:RPC-STREAM-004`。这是 requirement locator，不是伪造的 semantic case ID；测试名称必须
同时含 requirement ID 和矩阵中至少一个真实 semantic case ID。
当前 repository integration 中这些 logical `specification:*` selectors 必须由既有 `specification.test.ts`
normative entry 执行；这是本次 release evidence locator，不是要求未来 conformer 复制该文件路径。

表中的 case 省略了列名中已写出的 class prefix；例如 Type 列的
`descriptor.mixed-members` 解析为 `type.descriptor.mixed-members`。`N/A-local` 表示该命题刻意
不进 wire/Transport；`N/A-interface` 表示纯 Interface/type 负约束；`N/A-meta` 表示证据/发布
自身的审计命题；`N/A-security` 表示不提出 cryptographic claim；`N/A-browser` 表示
精确 Node/package-only 命题。除这些固定理由外不允许空单元格。
为节省表宽，Requirement IDs 列仅省略共同的 `RPC-` 前缀；展开到 production matrix 时必须
恢复完整 ID。

| Requirement IDs | Spec | Type | Runtime | Protocol | Transport | Wire SM | Schema | Raw | Transcript | Security | Browser | Package | Doc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DESC-006..009`; `STATE-004`; `CALL-010..011`; `API-007..008`; `STREAM-001..003,011` | per-ID | `descriptor.mixed-members`; `stream.capability-boundaries`; `facade.subject-narrowing`; `public.legacy-absence` | `descriptor.mixed-members`; `exposure.capture-cleanup-reexpose`; `facade.cold-identities`; `composition.independent-children` | `stream.outgoing-reserve-start-cancel`; `stream.incoming-semantic-unknown-member` | `N/A-interface` | `rpc1.stream-start-kinds` | `rpc1.final-semantic-union` | `rpc1.method-property-shapes` | `rpc1.method-property-mismatch` | `rpc1.payload-error-redaction` | `remote.mixed-facade-non-thenable`; `remote.stream-three-engines` | `remote.exact-type-inventory`; `remote.no-private-or-legacy-paths` | `remote.readme`; `remote.examples-migration` |
| `STREAM-004..009`; `FLOW-001..006` | per-ID | `stream.capability-boundaries`; `protocol.final-stream-seam`; `transport.exact-seam` | `stream.preflight-admissions`; `stream.source-exactly-once`; `stream.reentrancy-order`; `stream.cancel-teardown`; `flow.w1-overflow` | `stream.incoming-resource-before-route`; `stream.projection-disposition-rearm`; `stream.source-reserve-before-raw`; `stream.source-w1-overflow`; `stream.terminal-teardown-release` | `N/A-local` | `rpc1.w1-transition-table`; `rpc1.terminal-error-matrix`; `rpc1.ingress-validation-order` | `rpc1.closed-errors-and-limits` | `rpc1.w1-over-credit`; `rpc1.terminal-error-boundaries` | `rpc1.w1-burst-overcredit`; `rpc1.next-unsubscribe`; `rpc1.cancel-complete-race`; `rpc1.item-terminal-order` | `rpc1.payload-error-redaction`; `rpc1.protected-transport-no-record-mac` | `remote.stream-three-engines`; `remote.reentrancy-recovery` | `remote.actual-tarball-files`; `remote.shared-symbol-identities` | `remote.protocol`; `remote.readme` |
| `STREAM-010`; `LEDGER-006..008`; `ACK-008..010`; `RECOVERY-007..009`; `SEC-010..011`; `VALID-008..009` | per-ID | `protocol.final-stream-seam` | `stream.recovery-loss`; `schedule.recovery-barrier`; `shutdown.g-valid-vs-poison`; `publication.generations` | `stream.projection-disposition-rearm`; `stream.recovery-no-resubscribe`; `stream.resource-counter-fault` | `N/A-local` | `rpc1.directional-identities`; `rpc1.duplicate-equivocation`; `rpc1.retired-identity`; `rpc1.shutdown-g-f-close` | `rpc1.final-semantic-union`; `rpc1.closed-errors-and-limits` | `rpc1.directional-identity-boundaries`; `rpc1.post-g-valid-vs-poison` | `rpc1.lost-item-vs-ack`; `rpc1.replay-equivocation-gc`; `rpc1.recovery-bidirectional-barrier`; `rpc1.retired-controls`; `rpc1.opposite-direction-same-id`; `rpc1.retention-loss` | `rpc1.stream-cursor-lost-ack`; `rpc1.old-binding-fence`; `rpc1.wrong-proof-retains-stream`; `rpc1.post-g-validation-order` | `remote.reentrancy-recovery`; `remote.webcrypto-stream-resume` | `remote.wire-four-tuple`; `remote.actual-tarball-files` | `remote.protocol`; `remote.architecture-source-render` |
| `POLICY-005..007`; `RESOURCE-007..015`; `SCHEDULE-007..009`; `COUNTER-005..006` | per-ID | `policy.closed-options`; `protocol.final-stream-seam` | `resource.policy-boundaries`; `resource.receive-slot-lifetime`; `resource.protected-tail`; `schedule.stream-unary-fairness`; `schedule.recovery-barrier` | `stream.resource-counter-fault`; `stream.fairness-progress`; `stream.aggregate-bounded-load` | `connection.complete-message-load`; `connection.bounded-send-failure` | `rpc1.counter-protected-tail`; `rpc1.max-envelopes` | `rpc1.closed-errors-and-limits` | `rpc1.one-mib-and-envelope-limits` | `rpc1.resource-before-route`; `rpc1.stream-unary-fairness`; `rpc1.counter-maxima`; `rpc1.protected-tail` | `N/A-security` | `remote.reentrancy-recovery` | `remote.exact-type-inventory`; `remote.actual-tarball-files` | `remote.protocol`; `remote.transport`; `remote.architecture-source-render` |
| `SHUTDOWN-011..014`; `CLOSE-004..007`; `CLEANUP-005`; `LIFE-003` | per-ID | `event.closed-stream-union`; `policy.closed-options` | `shutdown.g-cutoffs`; `shutdown.g-valid-vs-poison`; `shutdown.f-batch`; `shutdown.reentrant-effects`; `shutdown.unique-task`; `publication.generations` | `stream.shutdown-g-f`; `stream.terminal-teardown-release` | `connection.direct-close-after-failure` | `rpc1.shutdown-g-f-close`; `rpc1.ingress-validation-order` | `rpc1.final-semantic-union` | `rpc1.post-g-valid-vs-poison` | `rpc1.shutdown-g-f-close`; `rpc1.cancel-complete-race`; `rpc1.adapter-failure-recovery` | `rpc1.post-g-validation-order`; `rpc1.old-binding-fence` | `remote.reentrancy-recovery`; `remote.stream-three-engines` | `remote.exact-runtime-inventory`; `remote.actual-tarball-files` | `remote.protocol`; `remote.architecture-source-render`; `remote.readme` |
| `EVENT-008..014` | per-ID | `event.closed-stream-union` | `event.side-local-pairs`; `event.semantic-vs-resource-rejection`; `event.count-duration-cutoffs`; `event.payload-safety`; `event.fifo-recovery-force`; `publication.generations` | `stream.incoming-semantic-unknown-member`; `stream.terminal-teardown-release` | `N/A-local` | `N/A-local` | `N/A-local` | `N/A-local` | `rpc1.telemetry-side-pairs`; `rpc1.shutdown-g-f-close` | `rpc1.payload-error-redaction` | `remote.stream-three-engines`; `remote.reentrancy-recovery` | `remote.exact-runtime-inventory`; `remote.exact-type-inventory` | `remote.readme`; `remote.protocol` |
| `SPI-013..017`; `TRANSPORT-013`; `CONFORMANCE-004..005` | per-ID | `protocol.final-stream-seam`; `transport.exact-seam` | `stream.source-exactly-once`; `stream.reentrancy-order`; `stream.cancel-teardown` | 第 3 节 Protocol conformance 行列出的全部 case IDs | 既有 Adapter stable cases + 第 3 节 Transport/Adapter 行的四个新 case IDs | `rpc1.max-envelopes`; `rpc1.w1-transition-table` | `N/A-interface` | `rpc1.one-mib-and-envelope-limits` | `rpc1.adapter-failure-recovery`; `rpc1.recovery-bidirectional-barrier` | `rpc1.protected-transport-no-record-mac` | `N/A-browser` | `remote.shared-symbol-identities`; `remote.exact-type-inventory`; `remote.actual-tarball-files` | `remote.protocol`; `remote.transport` |
| `WIRE-016..024`; `CORPUS-005..008` | per-ID | `N/A-interface` | `package.exported-corpus-execution` | `stream.recovery-no-resubscribe`; `stream.shutdown-g-f`; adjudicated carried-forward unary cases | `connection.one-mib-boundary` | 第 3 节 Wire state machine 行的全部 case IDs | 第 3 节 Schema 行的全部 case IDs | 第 3 节 Raw 行的全部 case IDs | 第 3 节 Required/Additional transcripts 两行的全部 case IDs | 第 3 节 Security 行的全部 case IDs | `remote.webcrypto-stream-resume` | `remote.wire-four-tuple`; `remote.no-private-or-legacy-paths` | `remote.protocol`; `remote.architecture-source-render` |
| `EVIDENCE-004..007` | per-ID | `N/A-meta` | `evidence.requirement-case-ledger`; `evidence.selector-uniqueness` | `evidence.case-result-registry` | `evidence.case-result-registry` | `evidence.selector-registry` | `evidence.selector-registry` | `evidence.selector-registry` | `evidence.composite-selector-uniqueness` | `evidence.selector-registry` | `evidence.case-result-registry` | `remote.actual-tarball-files`; `remote.publish-tested-bytes` | `remote.changelog-changeset` |
| `PKG-010..013`; `RELEASE-006..012` | per-ID | `package.root-positive-negative`; `package.protocol-positive-negative`; `package.nodenext-mts`; `package.nodenext-cts`; `browser.dom-only` | `package.installed-stream-smoke` | `package.installed-conformance` | `package.installed-conformance` | `package.exported-corpus-execution` | `package.final-schema` | `package.final-vectors` | `rpc1.cross-build-fresh-resume` | `rpc1.cross-build-kat` | 第 3 节列出的全部 `browser.remote.*` cases | 第 3 节列出的全部 `package.remote.*` cases | `remote.readme`; `remote.protocol`; `remote.transport`; `remote.changelog-changeset` |
| `MIGRATION-001..003`; `DOC-001..006` | per-ID | `migration.final-examples`; `public.legacy-absence` | `migration.explicit-composition` | `migration.cross-build-fresh-resume` | `migration.unchanged-adapter` | `rpc1.final-semantic-union` | `package.final-schema` | `package.final-vectors` | `rpc1.cross-build-fresh-resume`; `rpc1.old-session-cutover` | `rpc1.cross-build-kat` | `remote.example-installed` | `remote.no-private-or-legacy-paths`; `remote.actual-tarball-files` | 第 3 节列出的全部 `doc.remote.*` cases |

所有 carried-forward 旧 active requirement 保留自己的旧 matrix row 和 stable case；若本次为它增加
evidence，只可向该行追加 selector，不能改变旧 case identity。发布时 active 行必须全部
`verified`，retired 行必须全部 `retired`；`planned`/`missing`/`skipped`/unresolved selector 任一存在即 BLOCK。

#### 5. Actual tarball exact export inventory

以下集合是 final installed package 的**无序 exact set**：缺一个或多一个都失败。Runtime
在 ESM namespace 上用 `Reflect.ownKeys()`/`Object.getOwnPropertyNames()` 检查所有 string-named
exports，只允许标准 `Symbol.toStringTag` 这一 namespace symbol；CJS 用 own-property names 和逐名
`require` access 独立检查，除下表 value names 外只允许非枚举、非 writable/configurable、
value 恰为 `true` 的标准 `__esModule` interop marker，且它不是 public named export。Type inventory
必须用 TypeScript compiler API 对 isolated install 中 emitted
`.d.ts` module symbol table 取值，再用正/反 named imports 交叉验证；`Object.keys()` 无法证明
type-only absence，esbuild/Bundler 也无法证明 NodeNext resolution 或 declaration correctness。
下文“type-only”指有 type meaning 但无 value meaning 的额外 symbols；每个 subpath 的全部 exported
names 必须恰好是 runtime set 与 type-only set 的并集，runtime enum/class 同时具有 type meaning
不会把它重复计入 type-only set。

Root runtime values（exactly 18）：

```text
RpcAcceptorListenerStopReasonEnum
RpcCallStatusEnum
RpcCloseOutcomeEnum
RpcCloseReasonEnum
RpcConnectorReconnectionAttemptFailureStageEnum
RpcConnectorReconnectionEventTypeEnum
RpcConnectorReconnectionStopReasonEnum
RpcEventDirectionEnum
RpcEventTypeEnum
RpcException
RpcExceptionCodeEnum
RpcStateStatusEnum
RpcStreamStatusEnum
createRemoteServiceDescriptor
createRpcAcceptor
createRpcConnector
createRpcConnectorReconnection
createRpcProtocol
```

Root type-only exports（exactly 30）：

```text
CreateRpcConnectorReconnectionOptions
IRemoteServiceDescriptor
IRpcAcceptor
IRpcAcceptorAdapter
IRpcApplicationRecord
IRpcConnection
IRpcConnector
IRpcConnectorAdapter
IRpcConnectorReconnection
IRpcPeer
IRpcProtocol
IRpcProtocolRuntimePolicy
RpcAcceptorListenerState
RpcAcceptorOptions
RpcAcceptorRuntimePolicyOptions
RpcAcceptorState
RpcApplicationValue
RpcCallFailure
RpcConnectorAdapterFactory
RpcConnectorConnectOptions
RpcConnectorOptions
RpcConnectorReconnectionEvent
RpcConnectorReconnectionPolicyOptions
RpcConnectorReconnectionState
RpcConnectorRuntimePolicyOptions
RpcConnectorState
RpcEvent
RpcPeerState
RpcProtocolFaultReason
RpcSessionCloseReason
```

`/protocol` runtime values（exactly 6）：

```text
RpcCallTerminalTypeEnum
RpcCloseReasonEnum
RpcExceptionCodeEnum
RpcIncomingCallKindEnum
RpcProtocolSessionTransitionTypeEnum
createRpcProtocol
```

`/protocol` type-only exports（exactly 51）：

```text
IRpcApplicationArgumentsSnapshot
IRpcApplicationRecord
IRpcApplicationSnapshot
IRpcConnection
IRpcProtocol
IRpcProtocolAcceptorHost
IRpcProtocolAcceptorRuntime
IRpcProtocolConnectorHost
IRpcProtocolConnectorRuntime
IRpcProtocolHost
IRpcProtocolIncomingCall
IRpcProtocolIncomingCallRequest
IRpcProtocolIncomingCallReservation
IRpcProtocolIncomingHandlerCall
IRpcProtocolIncomingSourceReservation
IRpcProtocolIncomingStream
IRpcProtocolIncomingUnknownStreamReservation
IRpcProtocolInvocation
IRpcProtocolInvocationRequest
IRpcProtocolInvocationReservation
IRpcProtocolInvocationSink
IRpcProtocolProjection
IRpcProtocolRoleRuntime
IRpcProtocolRuntimePolicy
IRpcProtocolSession
IRpcProtocolSessionHost
IRpcProtocolSourceEmissionReservation
IRpcProtocolSourceSink
IRpcProtocolStream
IRpcProtocolStreamReservation
IRpcProtocolSubscriberSink
IRpcRetainedBytesReservation
RpcApplicationValue
RpcCallFailure
RpcCallOutcome
RpcHandlerOutcome
RpcIncomingFailure
RpcIncomingStreamTerminal
RpcIncomingTerminal
RpcProtocolFaultReason
RpcProtocolIncomingCallReservation
RpcProtocolIncomingStreamReservation
RpcProtocolSessionTransition
RpcProtocolSessionTransitionCloseReason
RpcProtocolStreamRequest
RpcSessionCloseReason
RpcSourceTerminal
RpcStreamFailure
RpcStreamItemEffect
RpcStreamOutcome
RpcUnknownCallFailure
```

`/transport` runtime set 必须为空；type-only set 恰好为：

```text
IRpcAcceptorAdapter
IRpcConnectorAdapter
IRpcConnection
```

`/conformance` runtime values（exactly 4）：

```text
RpcConformanceStatusEnum
runRpcAcceptorAdapterConformance
runRpcConnectorAdapterConformance
runRpcProtocolConformance
```

`/conformance` type-only exports（exactly 8）：

```text
IRpcAcceptorAdapterConformanceFixture
IRpcAdapterConformanceRemote
IRpcConnectorAdapterConformanceFixture
IRpcProtocolConformanceFixture
RpcConformanceCaseResult
RpcConformanceFailure
RpcConformanceOptions
RpcConformanceReport
```

Root 与 specialist subpath 重叠的 value/type 必须是同一 declaration/value identity。四个 JSON export path
`./wire/husky-di-rpc-1/schema`、`vectors`、`transcripts`、`security-vectors` 必须全部可从
isolated install 解析，共同形成一个记录在 release evidence 中的 SHA-256 four-tuple；不新增
manifest/legacy public subpath。Runtime negatives 与 type negatives 至少覆盖：
`RpcCallDirectionEnum`、`RpcPeerResult`、`RemoteServiceGroup`、`resolveAll`、`unknownMethod`、
`maxPendingInvocationsPerSession`、私有 deep import 和所有 legacy wire path。

#### 6. `husky-di-rpc/1` corpus 整体替换与旧 unary 退役

当前 production 负基线是 commit `5b2d512815b93570c881d93f35dbb570bac855b1` 上的以下内容：

```text
schema      52f48d554697006e96c14a4fecc466dae0718772ef4b5134e48f4565247cf940
raw         8b8fda4a9b3903b6711ca954e175680d63b3f788b4ad11a646aa2f30545954ab
transcript  3942fc376acffca57f6ba0a8a22df2cbdf6347ef5cdf043d270c8932a83e4f98
security    9a044e1ea94258bba959a3e72e1375e78d6c78e5a6389a1a6ff2506e7f4a4027
```

它们是 RED baseline，不是 final expected digest。Final release 保持四个既有 public export path 和精确
profile string `husky-di-rpc/1`，但在同一 release candidate 中产生一个新 final four-tuple。只有 Git
history 保存旧稿；tarball 中不能有 old/new sibling、backup、alias schema、compat decoder/runner、
legacy corpus directory 或新 public revision selector。不得在旧 transcripts/raw 末尾只追加 stream cases
后宣称整体替换；final files 必须只含 final grammar/vocabulary/state machine 和下述已判定
carried-forward cases。

旧 requirement/case 逐项退役规则：

1. proposition、input bytes/state 与 expected result/failure scope **全部不变**时，原 ID 可
   `carried-forward`，但必须在 final decoder/runner 上重跑，不是复制旧 PASS 记录。
2. 任一输入、字段名、状态、输出或 scope 改变时，旧 case tombstone，新 case 分配
   新 semantic ID；禁止“改 expected 但保留 ID”。
3. 旧 raw record 不做“全部必须 invalid”的负基线。Final profile 仍有 unary degeneracy，某些
   exact old bytes 可能仍合法；Tickets 03/12 也不保证 old/new mixed fresh、resume、unary-only
   或 clean reject。验收的是 final state machine 和无 legacy implementation，不是伪造 blanket reject。
4. JCS/HKDF/HMAC 数学输入未变的 KAT bytes 可以相同；必须由与 production codec 独立的
   provenance 重算。不得为了产生 diff 修改正确 cryptographic truth，也不得用
   production implementation 自证自己。
5. schema/raw/transcript/security 的 selector registry 必须引用 tarball 中该 final four-tuple；
   四文件中任意一个来自另一 revision 即 BLOCK。

Final security vectors 必须同时证明 stream seq 进入原 cumulative cursor/barrier、lost stream ACK、
old-binding fence、wrong proof 不破坏 retained stream、Recovery terminal 不重订，以及 active records
的安全边界来自 Protected Transport + Binding Epoch 而非新 per-record HMAC。Post-G 的 wrong proof、
malformed schema、gap 和 illegal ordinal 必须在 `unavailable` 之前被原有安全/状态校验捕获。

#### 7. Documentation 与 migration evidence

- README 必须从“bidirectional unary/method allowlist”改为 mixed `members`，展示 stream method 与
  readonly `$` property、cold per-subscription ownership、W=1/overflow、safe failures、unsubscribe/Recovery/G/F，
  并给出 single-peer 与 explicit `peers.map`/RxJS 组合示例。
- PROTOCOL 必须是 implementor-facing 的 final built-in state machine：identity、credit、item/terminal
  disposition、ACK/replay/GC、resources/fairness、Recovery、G/F/Close、security 与 four-file corpus。
- TRANSPORT 必须明说三成员 Connection seam 不变，1 MiB 是 complete-message boundary，native
  queue/send failure 属 binding/Recovery，不是 stream credit 或 overflow；不新增 stream-aware Adapter 指南。
- Architecture 的 editable source 与 rendered image 必须由同一 final model 生成并经语义审查；
  source 和 image 任一仍显示 method-only allowlist、Group 或旧 two-lane model 即失败。
- CHANGELOG 与 Changeset 必须明记 pre-1.0 `husky-di-rpc/1` one-time replacement、`0.0.0→1.0.0`、
  Group/`resolveAll` 删除、`unknown-member`、policy rename、old-session cutover 和 fresh reconnect。
- Examples 必须 typecheck 且运行；remote-websocket 必须用 final `members` 和 single-peer/explicit
  composition，不得使用 relative Ticket13 fixture。`resolveAll`、Group、`unknownMethod`、
  `maxPendingInvocationsPerSession` 可仅在标注为 **removed** 的 migration/CHANGELOG 文字中出现，
  不得出现在 positive API prose、code block、diagram node 或 executable example。

Migration evidence 不得虚构 Group replacement：示例必须显式说明每个 child 各自 normalize、admit、
cancel、terminal 和 release；application 选择 concurrency、error association、fail-fast/wait-all 和 cancellation
propagation。不能声称 common normalization、atomic all-child reserve、common Abort listener、Framework
eligibility、frozen `RpcPeerResult[]` 或 Group fairness。Old draft Session 不就地迁移：先 drain/terminate，
双端升级，fresh reconnect；final 同-version/cross-package-build conformers 仍必须有 fresh+resume evidence。

#### 8. Failure ownership

| Failure owner | 必须定位的 failure；不得转嫁的类型 |
| --- | --- |
| Framework/caller surface | Descriptor/facade/exposure guard、subscribe preflight、Observer safe projection、telemetry/publication；不得要求 Protocol 理解 RxJS Subscriber 或 application source |
| Protocol (built-in 与 custom seam) | identity/credit/order/disposition/retained evidence/fairness/Recovery/G/F 及 bounded cross-seam load；peer over-credit/ordinal gap 是 Session Protocol fault，不是 Adapter fault/overflow |
| Built-in Protocol corpus/security | final schema/raw/transcripts/KAT、lexical/schema/security/current-binding validation、exact replay/equivocation/cursor；不能用 custom Protocol 的自由度逃避 built-in vectors |
| Transport Adapter | complete stable `Uint8Array` messages、subscribe-before-start、single unsettled send、finite native frame/queue、1 MiB、Direct Close/Error identity；它不看 stream ID/credit/overflow，bounded send failure 导致 binding failure/Recovery |
| Package/release | exports map、ESM/CJS、emitted declarations、actual tgz、DOM/browser、wire four-tuple、docs/examples/Changeset 和 publish artifact identity |
| Application | producer hot/cold/share behavior、business payload/diagnostics、`peers.map`/Promise/RxJS 组合策略、不合作 producer/handler 的真实终止；Framework 仅承诺 fence/有界引用释放 |

任何 case 失败时必须报告一个上表 owner 和该 stable case ID；不得只报“integration failed”。

#### 9. Release gate 与 production 负基线

当前 production 必须被记录为 RED，不能被 Ticket13 prototype 遮蔽：

- package version 仍是 `0.0.0`；root 仍有 `RpcCallDirectionEnum` 和 type `RpcPeerResult`，
  caller/acceptor 仍有 `resolveAll`/internal Group；
- 仍有 `unknownMethod`、`maxPendingInvocationsPerSession`、method-only Descriptor/spec/docs/examples；
- specification/matrix 仍是上述 SHA baseline，requirement audit 硬编码 `201`，不有 tombstone ledger，
  transcript selector 对重复 step ID 只取第一个；
- wire schema/raw/transcripts/KAT 仍是旧 four-tuple，无 final stream state/security cases；
- 当前 packed consumer 的 runtime inventory 使用 `Object.keys()`，declaration/DOM consumer 使用
  Bundler resolution，没有 installed-tarball NodeNext `.mts`/`.cts` + `skipLibCheck:false` exact type audit；
- 当前 browser test bundle workspace source 而非 isolated installed tgz；
- 当前 release workflow 在 `changeset version` **之前** test/build，version commit 后直接
  `changeset publish`，没有对 final-version artifact 重建、重测、pack 或证明 publish 的是已验收 tgz。

上述每一项都必须先由对应 stable production case 稳定重现 RED，然后由 production 改动转 GREEN。
禁止把 baseline 改成 skip/todo/only、条件早退、snapshot update、retry-only PASS 或从 matrix 删行。

发布只在以下门禁全部成立时允许：

1. **Identity/spec gate**：新规范的每个 active ID 恰一 matrix row，retired IDs/cases 均在
   tombstone ledger，所有 selector 唯一可解析，无 planned/missing/skipped；normative test 只观察
   public seams，不锁定 implementation layout。
2. **Clean/version gate**：release candidate 已完成 Changeset version/changelog，`@husky-di/remote`
   为 `1.0.0`，git workspace clean，commit、Node/pnpm version 与 lockfile digest 已记录。不接受
   未提交 version diff 或依赖当前 workspace `dist`。
3. **Repository gate**：frozen install、code-standard tests/check、full build/test、spec/type/runtime、
   built-in/custom Protocol conformance、unchanged Adapter conformance、wire four-file execution、remote-websocket
   package 和 example type/runtime 全部通过，无 skip/only/retry 逃生。
4. **Artifact gate**：从 versioned clean candidate build 后 `pnpm pack` 产生实际 tgz，isolated
   consumers 不含 workspace link/source/paths alias；Node ESM、Node CJS 直接运行，NodeNext `.mts`/`.cts`
   均 strict + `skipLibCheck:false` + `types:[]`，root/四个 specialist paths/四个 JSON paths 全解析，
   exact runtime/type inventory 和 negative imports 全通过。
5. **Browser gate**：DOM-only consumer 从该 installed tgz 开始，TypeScript phase 无 ambient Node types；
   bundler 只用于产生 browser runtime asset，不替代 declaration/NodeNext 证据；Chromium/Firefox/WebKit
   都运行 mixed facade、stream/reentrancy/Recovery/WebCrypto cases。
6. **Reproducibility gate**：同一 versioned commit、Node/pnpm、frozen lockfile 在两个独立 clean
   worktree 中，先证明无 `dist`，强制重建再 pack；两 tgz 解包后的 path/type/mode/bytes
   canonical manifest 必须完全一致。压缩 metadata 若不确定不冒充产品差异，但最终被
   consumer/browser 验收和 publish 的必须是同一个 tgz byte stream/SHA-256。
7. **Content/migration gate**：final corpus four-tuple、README/PROTOCOL/TRANSPORT、architecture source+render、
   CHANGELOG/Changeset、examples/migration 全部通过上述 stable doc/package cases，只有 migration prose
   可以以 removed 语境提到旧 vocabulary。
8. **Publish gate**：release job 在 version step 之后重跑 3–7，直接 publish 门禁中已验收的 tgz；
   任何会从 package directory 重新 pack 未验收 bytes 的 publish command 都不合格。

`RPC-PKG-005` 作为 carried-forward 命题仍按当前 normative text 审计 manifest，包括
`@husky-di/core`/`rxjs`/`zod`。本票不会悄然删除 `zod`；若上游认为 runtime dependency
只应有 core+rxjs，必须单独 adjudicate 并 retire/replace `RPC-PKG-005`，不能由 release fixture
自行决定。

#### 10. 可执行验收命令草案

以下命令都从 repository root 执行。它们是 release orchestration contract，不是 normative
source layout；内部 fixture 可自由移动，但 package script 必须保持这些输入、stable case output 和
exit status。本票只记录草案，没有执行 version/publish 或修改 production。

当前 RED baseline 复现（只读，不是 release PASS）：

```bash
set -euo pipefail
git rev-parse HEAD
node -p "require('./packages/remote/package.json').version"
git grep -nE 'RpcCallDirectionEnum|RpcPeerResult|resolveAll|RemoteServiceGroup|unknownMethod|maxPendingInvocationsPerSession' -- packages/remote packages/remote-websocket examples/remote-websocket || true
git grep -nE 'methods:|method allowlist|bidirectional unary' -- packages/remote/README.md packages/remote/docs examples/remote-websocket || true
shasum -a 256 \
  packages/remote/docs/SPECIFICATION.md \
  packages/remote/docs/REQUIREMENTS.md \
  packages/remote/wire/husky-di-rpc-1/schema.json \
  packages/remote/wire/husky-di-rpc-1/raw-vectors.json \
  packages/remote/wire/husky-di-rpc-1/transcripts.json \
  packages/remote/wire/husky-di-rpc-1/known-answer-vectors.json
git grep -nE 'Object\.keys|moduleResolution.*Bundler|../../src/index' -- packages/remote/tests packages/remote/playwright.config.ts || true
sed -n '70,104p' .github/workflows/release.yml
```

实现候选的 repository gate（最终必须全为 0 exit）：

```bash
set -euo pipefail
test -z "$(git status --porcelain=v1 --untracked-files=all)"
pnpm install --frozen-lockfile
pnpm test:code-standard
pnpm check:code-standard
pnpm build
pnpm test
pnpm --filter @husky-di/remote-websocket test
pnpm --filter @husky-di/example-remote-websocket typecheck
pnpm --filter @husky-di/example-remote-websocket test
git diff --check
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

Versioned release-candidate artifact gate。`pnpm changeset:version` 必须在这段之前完成并作为
clean release-candidate commit；当前 workflow 必须调整为 version commit 后再运行这段。

```bash
set -euo pipefail
test -z "$(git status --porcelain=v1 --untracked-files=all)"
test "$(node -p "require('./packages/remote/package.json').version")" = "1.0.0"
pnpm install --frozen-lockfile
pnpm test:code-standard
pnpm check:code-standard
pnpm exec turbo run build --filter='./packages/*' --force
pnpm test

RC_PACK_DIR="$(mktemp -d /tmp/husky-di-remote-release-pack.XXXXXX)"
pnpm --dir packages/remote pack --pack-destination "$RC_PACK_DIR"
shopt -s nullglob
RC_TGZS=("$RC_PACK_DIR"/*.tgz)
test "${#RC_TGZS[@]}" -eq 1
RC_TGZ="${RC_TGZS[0]}"
shasum -a 256 "$RC_TGZ"
pnpm --filter @husky-di/remote test:release -- "$RC_TGZ"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

`test:release -- <absolute-tgz>` 是单一 artifact acceptance entry：它必须在隔离临时项目安装参数中的
tgz，运行 Node ESM/CJS direct load、NodeNext `.mts`/`.cts`、compiler-API exact type manifest、module
own-key runtime manifest、全 public/negative subpaths、packaged corpus、DOM-only compile/bundle 和三 browser engines。
它不得内部重新 pack 或回退到 workspace source。

两个 clean worktree reproducibility gate（适合 ephemeral CI；本地执行后由操作者对这两个明确
worktree 做安全清理）：

```bash
set -euo pipefail
test -z "$(git status --porcelain=v1 --untracked-files=all)"
RC_COMMIT="$(git rev-parse HEAD)"
RC_ROOT="$(mktemp -d /tmp/husky-di-remote-repro.XXXXXX)"
RC_A="$RC_ROOT/a"
RC_B="$RC_ROOT/b"
git worktree add --detach "$RC_A" "$RC_COMMIT"
git worktree add --detach "$RC_B" "$RC_COMMIT"

for RC_TREE in "$RC_A" "$RC_B"; do
  test ! -e "$RC_TREE/packages/remote/dist"
  pnpm --dir "$RC_TREE" install --frozen-lockfile
  pnpm --dir "$RC_TREE" exec turbo run build --filter='./packages/*' --force
  test -z "$(git -C "$RC_TREE" status --porcelain=v1 --untracked-files=all)"
done

RC_A_PACK="$RC_ROOT/pack-a"
RC_B_PACK="$RC_ROOT/pack-b"
mkdir "$RC_A_PACK" "$RC_B_PACK"
pnpm --dir "$RC_A/packages/remote" pack --pack-destination "$RC_A_PACK"
pnpm --dir "$RC_B/packages/remote" pack --pack-destination "$RC_B_PACK"
shopt -s nullglob
RC_A_TGZS=("$RC_A_PACK"/*.tgz)
RC_B_TGZS=("$RC_B_PACK"/*.tgz)
test "${#RC_A_TGZS[@]}" -eq 1
test "${#RC_B_TGZS[@]}" -eq 1
pnpm --filter @husky-di/remote test:reproducible-pack -- "${RC_A_TGZS[0]}" "${RC_B_TGZS[0]}"
pnpm --filter @husky-di/remote test:release -- "${RC_A_TGZS[0]}"
```

`test:reproducible-pack -- <tgz-a> <tgz-b>` 必须比较解包后的 sorted path、entry type、mode 与
SHA-256 bytes，并单独报告两 archive digest。只有 `${RC_A_TGZS[0]}` 通过上述
`test:release` 后，获得出版授权的 release job 才可使用它的绝对路径执行：

```bash
npm publish "${RC_A_TGZS[0]}" --access public
```

不得在这之后运行会重 pack package directory 的 `changeset publish` 来取代该 artifact。Tag/release
metadata 可在 publish 后生成，但不得改变 npm 上的 tarball bytes。

#### 11. Implementation handoff

后续规范/TDD 实现者不需要发明合同，只按以下 outcome order 工作；这个顺序
不规定文件布局。

1. 先把 active/retired requirement+case ledger、selector uniqueness 和上述 delta matrix 做成 RED audit，
   再改 normative specification；每个新/更改 user-visible 命题与对应 specification case 必须在
   同一 change 中，符合 AGENTS 要求。
2. 先使 Type/actual-package negative cases 稳定 RED，再实现 mixed Descriptor、single-peer facade、
   Group removal、exact public types/values 与 policy rename；不允许从 Ticket13 source fixture 导入实现。
3. 按 lifecycle→W=1/reentrancy→resources/fairness→Recovery→G/F→telemetry 的 stable runtime/Protocol
   cases 逐步 RED/GREEN；broken custom Protocol 必须被具体 case ID 定位，Adapter runner 始终 stream-unaware。
4. 在一个不可分割的 corpus change 中替换 schema/raw/transcripts/security，生成 final four-tuple、
   case retirement manifest 和独立 KAT provenance；不允许某一时点混用 old schema/new transcript。
5. 最后才把 actual-tarball consumers、three-engine browser、clean-worktree reproducibility、docs/examples/
   architecture/Changeset 与 post-version workflow 转 GREEN。只有上述 release gate 整体通过才能声称
   production acceptance，不得用原型或部分 package test 代替。

实现 PR 的失败报告必须包含 stable case ID、covered requirement IDs、failure owner、实际/期望
public observation 和 actual tgz/four-tuple digest（若适用），不需要也不应暴露私有 object layout。

#### 12. 请对手必须回答的问题

1. 上述 retirement set 是否真正穷尽所有改义旧 ID？请专门攻击仍 carried-forward 但文字含
   call-only 范围的 `RPC-DESC-005`、`RPC-API-005`、`RPC-RECOVERY-004`、
   `RPC-SHUTDOWN-002..004,009`、`RPC-CLEANUP-004`、`RPC-CORPUS-003..004`、
   `RPC-RELEASE-002..005`；如果其原子命题因 stream 变假，必须指出应 retire 还是只追加新 ID。
2. 新 requirement 中哪一行仍捆绑了两个可以独立失败的 normative claims，需要在锁 ID
   前再拆分？请不要只回答“too broad”，要给出确切分割线。
3. Root 18/30、`/protocol` 6/51、`/transport` 0/3、`/conformance` 4/8 是否真的是
   Ticket13 后 final complete manifests？特别请攻击 `/protocol` 51 项中的遗漏、重复、未应 public
   的 type 和 root/specialist identity mismatch。
4. 不向四个 JSON 文档新增 public revision field，而用 release evidence 的 SHA-256 four-tuple 绑定
   同一 revision，是否足以防止 mixed corpus？若不足，请给出不新增 legacy/public subpath
   的最小替代。
5. Reproducibility 门禁要求两次 canonical tar tree 相同，但只要求“验收与 publish 的
   同一 tgz bytes”；是否应进一步要求两个 tgz byte-for-byte 相同，还是这会把不相关
   compression metadata 错写成产品合同？
6. `4 streams + 1 unary + 8 rounds + fixed send rejection` 是否足以锁定 Adapter load seam、fairness
   和 failure ownership，还缺哪个有界 adversarial schedule？不得通过让 Adapter 理解 stream 来补洞。
7. 前置 `.scratch/remote-rpc-framework/issues/15-decide-verification-package-contract.md` 文字中曾声称
   runtime deps 只有 core+rxjs，但当前 normative `RPC-PKG-005`
   与 manifest/tests 明确包含 `zod`。对手是否同意本票 carried-forward 当前 normative claim，
   并把 dependency 变更留给单独 adjudication？
8. Post-G security ordering、Source finished 等 teardown 但 duration 止于 terminal commit、overflow-causing
   emission 不计数、terminal ACK 不等于 bidirectional retirement 和 credit ACK 不释放 Receive Slot，
   是否都有独立 case，而非被一个综合 transcript 隐式掩盖？

我最希望对手攻击的两个薄弱点是：**retirement adjudication 是否穷尽**，以及
**`/protocol` 51 项 type-only inventory 是否完整且真的应当 public**。紧随其后的是
four-tuple 不内嵌 revision field 的 mixed-corpus 证明强度。请对手对 1–8 逐项给出
`PASS` 或具体 `BLOCK`；在有任何 BLOCK 或未回答项时，本票保持 `claimed`。

### 2026-08-23 superseding revised candidate after FORMAL BLOCK (B01–B09)

本 Comment **整体取代**上一条 candidate 的裁决文本；上一条保留为审计历史，不再是实现输入。
本票继续保持 `claimed`。对手正式 `PASS` 前不写 `Answer`、不改 `resolved`、不改 map，也不把
Ticket 11/13 throwaway prototype 当作 production evidence。本轮只决定验证与发布证据，没有修改
production、specification、tests、wire assets、docs 或其他 ticket。

上一条已经获对手 `PASS` 的四份 module manifest 原样并入本候选，数量和成员均不得重开：root
runtime/type-only `18/30`、`/protocol` `6/51`、`/transport` `0/3`、`/conformance`
`4/8`。DOM-only/三浏览器、全量 docs/migration、`zod` carried-forward 以及“Ticket 13 不得填充
production evidence”也保持不变。下文只补齐 FORMAL BLOCK 指出的闭包。

#### B01 — 201 个旧 Requirement ID 的穷尽 ledger

Requirement ID 继续使用不可重编号、不可复用的 `RPC-<FAMILY>-NNN`。本次基线恰有 201 个旧 ID；
裁决为 `154 preserve + 47 retire = 201`，两个集合交集为空。`preserve` 只保留旧命题原有输入域，
stream 扩展由新 ID 承担；`retire` 永远不得再次 active 或出现在 Case `covers` 中。上一条 candidate
新分配但尚未发布的 ID 不是 legacy ID；本 Comment 对它们的重拆不需要伪造 tombstone。

**Preserve（154，逐项显式）：**

```text
RPC-BASE-001, RPC-BASE-003,
RPC-PKG-001, RPC-PKG-002, RPC-PKG-003, RPC-PKG-004, RPC-PKG-005, RPC-PKG-006, RPC-PKG-009,
RPC-VALUE-002, RPC-VALUE-003, RPC-VALUE-005, RPC-VALUE-006,
RPC-DESC-001, RPC-DESC-005,
RPC-API-001, RPC-API-002, RPC-API-003, RPC-API-004, RPC-API-005, RPC-API-006,
RPC-STATE-002, RPC-STATE-003,
RPC-CALL-002, RPC-CALL-004, RPC-CALL-005, RPC-CALL-006, RPC-CALL-008,
RPC-EVENT-005, RPC-EVENT-006, RPC-EVENT-007,
RPC-START-001, RPC-START-002, RPC-START-003, RPC-START-004, RPC-START-005,
RPC-TRANSPORT-001, RPC-TRANSPORT-002, RPC-TRANSPORT-003, RPC-TRANSPORT-004,
RPC-TRANSPORT-005, RPC-TRANSPORT-006, RPC-TRANSPORT-007, RPC-TRANSPORT-008,
RPC-TRANSPORT-009, RPC-TRANSPORT-010, RPC-TRANSPORT-011, RPC-TRANSPORT-012,
RPC-SPI-001, RPC-SPI-002, RPC-SPI-003, RPC-SPI-004, RPC-SPI-005, RPC-SPI-006,
RPC-SPI-008, RPC-SPI-009, RPC-SPI-010, RPC-SPI-011, RPC-SPI-012,
RPC-WIRE-001, RPC-WIRE-002, RPC-WIRE-003, RPC-WIRE-004, RPC-WIRE-007, RPC-WIRE-008,
RPC-WIRE-009, RPC-WIRE-010, RPC-WIRE-013, RPC-WIRE-014, RPC-WIRE-015,
RPC-ACK-001, RPC-ACK-002, RPC-ACK-003, RPC-ACK-004, RPC-ACK-005, RPC-ACK-006, RPC-ACK-007,
RPC-LEDGER-001, RPC-LEDGER-002, RPC-LEDGER-003, RPC-LEDGER-004, RPC-LEDGER-005,
RPC-SESSION-001, RPC-SESSION-002, RPC-SESSION-003, RPC-SESSION-004, RPC-SESSION-005,
RPC-SESSION-006, RPC-SESSION-007, RPC-SESSION-008, RPC-SESSION-009, RPC-SESSION-010,
RPC-RECOVERY-001, RPC-RECOVERY-002, RPC-RECOVERY-003, RPC-RECOVERY-004,
RPC-RECOVERY-005, RPC-RECOVERY-006,
RPC-RECONNECT-001, RPC-RECONNECT-002, RPC-RECONNECT-003, RPC-RECONNECT-004, RPC-RECONNECT-005,
RPC-SEC-001, RPC-SEC-002, RPC-SEC-003, RPC-SEC-004, RPC-SEC-005, RPC-SEC-006, RPC-SEC-007,
RPC-VALID-001, RPC-VALID-002, RPC-VALID-003, RPC-VALID-004, RPC-VALID-005, RPC-VALID-006,
RPC-SEC-008, RPC-SEC-009,
RPC-RESOURCE-004, RPC-RESOURCE-006,
RPC-POLICY-004,
RPC-SCHEDULE-001, RPC-SCHEDULE-003, RPC-SCHEDULE-004, RPC-SCHEDULE-005, RPC-SCHEDULE-006,
RPC-TIME-001, RPC-TIME-002, RPC-TIME-003,
RPC-COUNTER-001, RPC-COUNTER-003, RPC-COUNTER-004,
RPC-LIFE-001, RPC-LIFE-002,
RPC-SHUTDOWN-002, RPC-SHUTDOWN-003, RPC-SHUTDOWN-006, RPC-SHUTDOWN-007,
RPC-SHUTDOWN-008, RPC-SHUTDOWN-010,
RPC-CLOSE-002, RPC-CLOSE-003,
RPC-CLEANUP-001, RPC-CLEANUP-002, RPC-CLEANUP-003, RPC-CLEANUP-004,
RPC-EVIDENCE-001, RPC-CONFORMANCE-001, RPC-CORPUS-001, RPC-CORPUS-003,
RPC-RELEASE-002, RPC-RELEASE-003, RPC-RELEASE-004, RPC-RELEASE-005
```

`RPC-EVIDENCE-001` 明确保留，并且只拥有“每个 active Requirement 恰一 matrix row，且至少一条
evidence edge”这一命题；新 `RPC-EVIDENCE-005` 不再重复它。

**Retire/replace（47，逐项终局裁决）：**

| Retired ID | Replacement ID(s) | 不可继续 preserve 的原因 |
| --- | --- | --- |
| `RPC-BASE-002` | `RPC-STREAM-001`, `RPC-STREAM-003`, `RPC-EVENT-008` | Remote Observable subscribe 成为 owning work root；Observation Stream 仍 non-owning |
| `RPC-PKG-007` | `RPC-PKG-010` | root exact inventory 改变 |
| `RPC-PKG-008` | `RPC-PKG-011` | `/protocol` exact inventory 改变 |
| `RPC-VALUE-001` | `RPC-VALUE-007` | 删除 error details root，并把 stream args/items 纳入共同 value domain |
| `RPC-VALUE-004` | `RPC-VALUE-008`, `RPC-WIRE-023` | Application Value roots、wrapper/node/envelope 上限域改变 |
| `RPC-DESC-002` | `RPC-DESC-006`, `RPC-DESC-007`, `RPC-DESC-010`, `RPC-DESC-011`, `RPC-DESC-012`, `RPC-DESC-013` | methods-only allowlist 被 mixed members 与独立 capability truth conditions 取代 |
| `RPC-DESC-003` | `RPC-DESC-009` | method namespace 改为 member namespace；`then` 仍保留但输入域改变 |
| `RPC-DESC-004` | `RPC-DESC-008`, `RPC-DESC-009` | function-only snapshot 改为 data/getter/method capture 与 stream Route Capture |
| `RPC-STATE-001` | `RPC-STATE-004` | 删除 Group eligibility tail；六状态本体以新 ID 重述 |
| `RPC-CALL-001` | `RPC-CALL-010`, `RPC-CALL-011`, `RPC-API-007` | `resolveAll`/Group facade 删除，single-peer facade/state-neutral observable 重述 |
| `RPC-CALL-003` | `RPC-CALL-012` | unary signal race 保留，但 Group external-listener tail 删除 |
| `RPC-CALL-007` | `RPC-CALL-013`, `RPC-CALL-014`, `RPC-STREAM-010` | unknown-method 改名，且 stream evidence-loss/error domain 独立加入 |
| `RPC-CALL-009` | `RPC-CALL-015` | public RpcException 保留，Group child identity tail 删除，code set 改变 |
| `RPC-GROUP-001` | none | Group snapshot semantics 完整删除，无 replacement facade |
| `RPC-GROUP-002` | none | Group atomic fan-out 完整删除 |
| `RPC-GROUP-003` | none | Group wait-all/RpcPeerResult 完整删除 |
| `RPC-EVENT-001` | `RPC-EVENT-021`, `RPC-EVENT-009` | call-only pair 改为 call 与 stream 各自原子 pair |
| `RPC-EVENT-002` | `RPC-EVENT-022`, `RPC-EVENT-010` | method/unknown-method metadata 改为 member/unknown-member，增加 stream metadata |
| `RPC-EVENT-003` | `RPC-EVENT-023`, `RPC-EVENT-010` | call-only outcome union 改为 closed call+stream union |
| `RPC-EVENT-004` | `RPC-EVENT-012` | payload/redaction domain 增加 stream identity/ordinal/proof，删除 details |
| `RPC-SPI-007` | `RPC-SPI-021`, `RPC-SPI-022` | unknown-method terminal union 改名，并将 commit 与 closed terminal union 拆开 |
| `RPC-WIRE-005` | `RPC-WIRE-025` | `error.details` 删除使 nested-tail closed 规则改变 |
| `RPC-WIRE-006` | `RPC-WIRE-016`, `RPC-WIRE-026` | 一次性 pre-1.0 同 `/1` replacement 与 final `/1` 演进规则必须拆开 |
| `RPC-WIRE-011` | `RPC-WIRE-018`, `RPC-WIRE-023` | `method` 改 `member`，并增加两个 stream start shape |
| `RPC-WIRE-012` | `RPC-WIRE-020` | error code union 增加 stream/unknown-member/overflow 且删除 details |
| `RPC-VALID-007` | `RPC-VALID-010` | unknown-method 分类改为统一 unknown-member 并扩展 method/property mismatch |
| `RPC-RESOURCE-001` | `RPC-RESOURCE-007` | Session budget 表增加 Application Work/stream/Receive Slot/future records |
| `RPC-RESOURCE-002` | `RPC-RESOURCE-008` | protected pool 与阶段转移公式扩大 |
| `RPC-RESOURCE-003` | `RPC-RESOURCE-007`, `RPC-POLICY-006`, `RPC-POLICY-007` | Owner budget 增加共享 work 与 stream subset |
| `RPC-RESOURCE-005` | `RPC-RESOURCE-007`, `RPC-RESOURCE-008` | entry charge 域增加 active stream、Receive Slot 与 stream evidence |
| `RPC-POLICY-001` | `RPC-POLICY-005`, `RPC-POLICY-006`, `RPC-POLICY-007`, `RPC-POLICY-008` | 14-field policy 与旧字段名不再 closed |
| `RPC-POLICY-002` | `RPC-RESOURCE-007`, `RPC-RESOURCE-008` | derived subcaps 加入 stream/future/protected pools |
| `RPC-POLICY-003` | `RPC-POLICY-009` | cross-field validation 加入 N/T/S/ST 与新 closed inventory |
| `RPC-SCHEDULE-002` | `RPC-SCHEDULE-007`, `RPC-SCHEDULE-008` | two-FIFO 改为 frozen barrier、macro lanes、unary/stream participants |
| `RPC-COUNTER-002` | `RPC-COUNTER-005` | 512 tail 从 call-only 扩成 stream terminal/cancel/future obligations |
| `RPC-SHUTDOWN-001` | `RPC-SHUTDOWN-011`, `RPC-SHUTDOWN-012`, `RPC-SHUTDOWN-015` | G roots/capture/admission 域增加 stream，且需独立 cutoffs |
| `RPC-SHUTDOWN-004` | `RPC-SHUTDOWN-016` | draining binding loss 增加 stream winner/teardown/evidence 收敛 |
| `RPC-SHUTDOWN-005` | `RPC-SHUTDOWN-014` | complete drain predicate 增加全部 stream roots/effects/evidence |
| `RPC-SHUTDOWN-009` | `RPC-SHUTDOWN-017` | Remote Close 增加 stream terminal authority、teardown 与双向 evidence |
| `RPC-CLOSE-001` | `RPC-CLOSE-004`, `RPC-CLOSE-005`, `RPC-CLOSE-006` | F 从 call-only 扩为 Session-wide stream fence/effect shells |
| `RPC-EVIDENCE-002` | `RPC-EVIDENCE-006`, `RPC-EVIDENCE-011` | evidence classes 扩大，且完成状态要求独立 |
| `RPC-EVIDENCE-003` | `RPC-EVIDENCE-012` | 固定 repository file path 不能是 normative requirement；保留 public-seam 可观察约束 |
| `RPC-CONFORMANCE-002` | `RPC-CONFORMANCE-004` | Protocol runner 增加 stream/broken Protocol；旧 unknown-method case 退役 |
| `RPC-CONFORMANCE-003` | `RPC-CONFORMANCE-005` | Adapter seam 保持不变，但旧 requirement 强制前缀格式与新 case registry 冲突 |
| `RPC-CORPUS-002` | `RPC-CORPUS-007` | stateful transcripts 整体替换并增加 stream/action/resource assertions |
| `RPC-CORPUS-004` | `RPC-CORPUS-009` | limit/fairness/shutdown corpus 域扩大到 stream resources/counters |
| `RPC-RELEASE-001` | `RPC-DESC-007`, `RPC-DESC-010..013`, `RPC-RELEASE-009`, `RPC-RELEASE-016`, `RPC-RELEASE-017` | old type fixtures 含 Group 且未覆盖 direct Observable、NodeNext `.mts/.cts` 与 DOM stream |

#### B01 — 旧 Case/selector ledger

Legacy Case 的边界固定如下：runner `caseId`、raw vector `id`、transcript scenario `id`、其
`scenario#step` selector 与 KAT `id` 是需裁决的稳定身份；Schema 的文档 `$id`/`$defs` 不是 Case ID。
当前 Vitest 标题、`@ts-expect-error` 行和旧 `RT::path::title` 是 evidence locator，不是可复用的 Case ID；
它们在 final graph 中统一由显式 `caseId` metadata 取代，不能据其文件名继续发明身份。

**Protocol runner（15）：**以下 14 个 exact ID `preserve`，必须在 final custom 与 built-in Protocol
上重新执行，而不是复制旧 PASS：

```text
protocol.construction.immutable
protocol.construction.connector-fresh-non-reentrant
protocol.construction.acceptor-fresh-non-reentrant
protocol.handoff.subscribe-before-install
protocol.values.normalized-snapshots
protocol.outgoing.reserve-commit-start-sink
protocol.incoming.resource-disposition
protocol.incoming.semantic-unknown-service
protocol.incoming.handler-dispositions-permit
protocol.fault.active-session-scope
protocol.counter.first-call-drains
protocol.termination.shutdown-phase
protocol.termination.close-phase
protocol.termination.cleanup-cached
```

`protocol.incoming.semantic-unknown-method` 永久 tombstone，唯一 replacement 为
`protocol.incoming.semantic-unknown-member`；另增的 stream case 是
`protocol.stream.incoming-semantic-unknown-member`，不得拿它冒充旧 unary case 的 replacement。

**Adapter runner（24）：**Transport seam 与 truth condition 未变，因此逐项 grandfather exact ID；
每项在 registry 标 `legacyFormat: true`。新 Case 才使用纯 dotted ID，禁止静默 strip 前缀或 rename。

| Exact grandfathered Connector Case ID | Status |
| --- | --- |
| `RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.handoff.subscribe-before-start` | preserve |
| `RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.source.multicast-terminal-single-use` | preserve |
| `RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 connector.message.identity-order-hot-terminal` | preserve |
| `RPC-TRANSPORT-001 RPC-TRANSPORT-003 connector.message.error-identity-terminal` | preserve |
| `RPC-TRANSPORT-005 RPC-TRANSPORT-006 connector.send.local-admission-backpressure` | preserve |
| `RPC-TRANSPORT-006 connector.send.one-mebibyte-compatibility` | preserve |
| `RPC-TRANSPORT-003 RPC-TRANSPORT-007 connector.close.direct-idempotent-race` | preserve |
| `RPC-TRANSPORT-008 connector.start.abort-before-handoff` | preserve |
| `RPC-TRANSPORT-003 RPC-TRANSPORT-008 connector.start.failure-error-identity` | preserve |
| `RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.start.abort-after-handoff-no-revocation` | preserve |

| Exact grandfathered Acceptor Case ID | Status |
| --- | --- |
| `RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.handoff.subscribe-before-start-early-accept` | preserve |
| `RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.source.multicast-order-hot-terminal` | preserve |
| `RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 acceptor.message.identity-order-hot-terminal` | preserve |
| `RPC-TRANSPORT-001 RPC-TRANSPORT-003 acceptor.message.error-identity-terminal` | preserve |
| `RPC-TRANSPORT-005 RPC-TRANSPORT-006 acceptor.send.local-admission-backpressure` | preserve |
| `RPC-TRANSPORT-006 acceptor.send.one-mebibyte-compatibility` | preserve |
| `RPC-TRANSPORT-003 RPC-TRANSPORT-007 acceptor.close.direct-idempotent-race` | preserve |
| `RPC-TRANSPORT-009 acceptor.start.abort-before-ready` | preserve |
| `RPC-TRANSPORT-009 acceptor.start.abort-after-ready` | preserve |
| `RPC-TRANSPORT-009 acceptor.start.complete-before-ready` | preserve |
| `RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.start.failure-error-identity` | preserve |
| `RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.listener.failure-after-ready-no-revocation` | preserve |
| `RPC-TRANSPORT-010 acceptor.connection.failure-isolation` | preserve |
| `RPC-TRANSPORT-007 RPC-TRANSPORT-009 RPC-TRANSPORT-011 acceptor.overflow.abort-inside-handoff` | preserve |

这项 grandfather 是 `RPC-CONFORMANCE-003` retirement 的终局 adjudication：旧 Adapter Case 本身不改；
replacement `RPC-CONFORMANCE-005` 规定 grandfather exception、fresh fixture、`message$/send/close`
和 Adapter load/failure ownership。实现者不得在 implementation 时重新选择 rename/tombstone。

**Raw vectors（52）：**下列 44 个 exact `id + bytes + validity + phase/scope` 均 preserve 并由 final
installed-tgz runner 重跑：

```text
valid-fresh-request, valid-fresh-accept, valid-resume-request, valid-resume-accept,
valid-fresh-reject, valid-generic-resume-reject-with-unknown-tail,
valid-cancel, valid-result-with-void, valid-result-with-null,
valid-ack-zero, valid-ping, valid-pong, valid-close,
valid-legal-whitespace-order-and-escape, valid-depth-limit, valid-string-byte-limit,
valid-member-name-byte-limit, valid-transport-message-byte-limit,
invalid-malformed-utf8, invalid-leading-bom, invalid-duplicate-key-after-escape,
invalid-second-json-value, invalid-non-whitespace-trailing-data, invalid-root-array,
invalid-unpaired-surrogate, invalid-negative-zero, invalid-non-finite-number,
invalid-unsafe-protocol-integer, invalid-empty-profile-offer, invalid-duplicate-profile-offer,
invalid-base64-padding, invalid-base64-non-url-alphabet, invalid-base64-wrong-length,
invalid-fresh-binding-epoch, invalid-resume-reject-message,
invalid-leading-zero-call-ordinal, invalid-outcome-unknown-wire-error,
invalid-error-object-unknown-field, invalid-close-sequence, invalid-active-kind,
invalid-depth-limit-plus-one, invalid-string-byte-limit-plus-one,
invalid-member-name-byte-limit-plus-one, invalid-transport-message-byte-limit-plus-one
```

八个包含旧 `method`/`details` bytes 的 raw ID 永久 tombstone：

| Legacy raw ID | Final replacement selector(s) |
| --- | --- |
| `valid-call-with-unknown-tails` | `raw:rpc1:valid-unary-call-with-unknown-tails` |
| `valid-safe-error` | `raw:rpc1:valid-safe-error-without-details`, `raw:rpc1:invalid-error-details-field` |
| `valid-number-domain` | `raw:rpc1:valid-unary-number-domain` |
| `valid-application-args-depth-limit` | `raw:rpc1:valid-unary-application-args-depth-limit` |
| `valid-array-element-limit` | `raw:rpc1:valid-unary-array-element-limit` |
| `invalid-reserved-then-method` | `raw:rpc1:invalid-reserved-then-member` |
| `invalid-application-args-depth-limit-plus-one` | `raw:rpc1:invalid-unary-application-args-depth-limit-plus-one` |
| `invalid-array-element-limit-plus-one` | `raw:rpc1:invalid-unary-array-element-limit-plus-one` |

**Transcripts（14 scenarios / 42 steps）：**final transcript assertion model 增加 stream、resources、effects、
ACK 与 teardown，故 14 个旧 scenario 全部 tombstone；replacement 不复用旧 ID：

| Legacy scenario | Final scenario |
| --- | --- |
| `fresh-establishment` | `unary-fresh-establishment` |
| `lost-fresh-accept` | `unary-lost-fresh-accept` |
| `normal-resume-and-replay-barrier` | `unary-normal-resume-and-replay-barrier` |
| `lost-resume-accept-higher-attempt` | `unary-lost-resume-accept-higher-attempt` |
| `lost-ack-and-ack-bounds` | `unary-lost-ack-and-ack-bounds` |
| `sequence-gap` | `unary-sequence-gap` |
| `regressed-sequence-conflicting-body` | `unary-regressed-sequence-conflicting-body` |
| `authenticated-cursor-boundaries` | `session-authenticated-cursor-boundaries` |
| `generic-resume-rejects` | `session-generic-resume-rejects` |
| `authenticated-continuity-reject` | `session-authenticated-continuity-reject` |
| `stale-connection-epoch-gate` | `session-stale-connection-epoch-gate` |
| `activity-ping-pong` | `session-activity-ping-pong` |
| `graceful-close` | `session-graceful-close` |
| `counter-exhaustion-drain` | `session-counter-exhaustion-protected-tail` |

每个旧 step selector 也逐项 tombstone；replacement 使用新 scenario 加同一 semantic step slug：

```text
fresh-establishment#fresh-request-admitted -> unary-fresh-establishment#fresh-request-admitted
fresh-establishment#fresh-accept-verified -> unary-fresh-establishment#fresh-accept-verified
lost-fresh-accept#fresh-request-admitted -> unary-lost-fresh-accept#fresh-request-admitted
lost-fresh-accept#accept-installed-then-dropped -> unary-lost-fresh-accept#accept-installed-then-dropped
lost-fresh-accept#connection-loss-diverges-safely -> unary-lost-fresh-accept#connection-loss-diverges-safely
normal-resume-and-replay-barrier#binding-lost-with-call-retained -> unary-normal-resume-and-replay-barrier#binding-lost-with-call-retained
normal-resume-and-replay-barrier#resume-request-authenticated -> unary-normal-resume-and-replay-barrier#resume-request-authenticated
normal-resume-and-replay-barrier#resume-accept-starts-finite-barrier -> unary-normal-resume-and-replay-barrier#resume-accept-starts-finite-barrier
normal-resume-and-replay-barrier#barrier-replay-dispatched-once -> unary-normal-resume-and-replay-barrier#barrier-replay-dispatched-once
lost-resume-accept-higher-attempt#attempt-one-accept-lost -> unary-lost-resume-accept-higher-attempt#attempt-one-accept-lost
lost-resume-accept-higher-attempt#higher-attempt-fences-lost-winner -> unary-lost-resume-accept-higher-attempt#higher-attempt-fences-lost-winner
lost-resume-accept-higher-attempt#higher-accept-converges -> unary-lost-resume-accept-higher-attempt#higher-accept-converges
lost-ack-and-ack-bounds#call-receipt-is-durable -> unary-lost-ack-and-ack-bounds#call-receipt-is-durable
lost-ack-and-ack-bounds#receipt-ack-is-lost -> unary-lost-ack-and-ack-bounds#receipt-ack-is-lost
lost-ack-and-ack-bounds#duplicate-suppresses-body -> unary-lost-ack-and-ack-bounds#duplicate-suppresses-body
lost-ack-and-ack-bounds#stale-zero-ack-is-noop -> unary-lost-ack-and-ack-bounds#stale-zero-ack-is-noop
lost-ack-and-ack-bounds#receipt-ack-retires-replay -> unary-lost-ack-and-ack-bounds#receipt-ack-retires-replay
lost-ack-and-ack-bounds#equal-ack-is-noop -> unary-lost-ack-and-ack-bounds#equal-ack-is-noop
lost-ack-and-ack-bounds#future-ack-poisons-current-session -> unary-lost-ack-and-ack-bounds#future-ack-poisons-current-session
sequence-gap#first-sequence-retained -> unary-sequence-gap#first-sequence-retained
sequence-gap#sequence-three-before-two-faults -> unary-sequence-gap#sequence-three-before-two-faults
regressed-sequence-conflicting-body#sequence-one-fingerprint-retained -> unary-regressed-sequence-conflicting-body#sequence-one-fingerprint-retained
regressed-sequence-conflicting-body#regressed-sequence-with-new-body-faults -> unary-regressed-sequence-conflicting-body#regressed-sequence-with-new-body-faults
authenticated-cursor-boundaries#lower-bound-request-accepted -> session-authenticated-cursor-boundaries#lower-bound-request-accepted
authenticated-cursor-boundaries#lower-bound-accept-converges -> session-authenticated-cursor-boundaries#lower-bound-accept-converges
authenticated-cursor-boundaries#second-binding-lost -> session-authenticated-cursor-boundaries#second-binding-lost
authenticated-cursor-boundaries#upper-bound-request-needs-no-replay -> session-authenticated-cursor-boundaries#upper-bound-request-needs-no-replay
generic-resume-rejects#wrong-proof-is-generic -> session-generic-resume-rejects#wrong-proof-is-generic
generic-resume-rejects#wrong-profile-is-generic -> session-generic-resume-rejects#wrong-profile-is-generic
generic-resume-rejects#wrong-session-is-generic -> session-generic-resume-rejects#wrong-session-is-generic
authenticated-continuity-reject#proof-valid-cursor-outside-lower-bound -> session-authenticated-continuity-reject#proof-valid-cursor-outside-lower-bound
authenticated-continuity-reject#signed-reject-terminates-both-sides -> session-authenticated-continuity-reject#signed-reject-terminates-both-sides
stale-connection-epoch-gate#old-endpoint-record-is-rejected-before-codec -> session-stale-connection-epoch-gate#old-endpoint-record-is-rejected-before-codec
stale-connection-epoch-gate#old-endpoint-terminal-is-noop -> session-stale-connection-epoch-gate#old-endpoint-terminal-is-noop
activity-ping-pong#idle-initiator-sends-one-ping -> session-activity-ping-pong#idle-initiator-sends-one-ping
activity-ping-pong#valid-ping-coalesces-one-pong -> session-activity-ping-pong#valid-ping-coalesces-one-pong
activity-ping-pong#pong-does-not-reply -> session-activity-ping-pong#pong-does-not-reply
graceful-close#close-authoritatively-terminates-receiver -> session-graceful-close#close-authoritatively-terminates-receiver
graceful-close#connection-close-completes-sender -> session-graceful-close#connection-close-completes-sender
counter-exhaustion-drain#ordinary-admission-enters-reserved-window -> session-counter-exhaustion-protected-tail#ordinary-admission-enters-reserved-window
counter-exhaustion-drain#existing-cancel-uses-reserve -> session-counter-exhaustion-protected-tail#existing-cancel-uses-reserve
counter-exhaustion-drain#finite-drain-sends-unsequenced-close -> session-counter-exhaustion-protected-tail#finite-drain-sends-unsequenced-close
```

**KAT（5）：**`rfc8785-section-3.2.2`、`rfc8785-section-3.2.3-utf16-property-order`、
`rfc5869-appendix-a.1`、`rfc4231-section-4.2-test-case-1`、`husky-di-rpc-1-proof-transcript`
全部 preserve；它们必须由独立实现和固定一手来源重算。若某个输入实际改变，则该 ID 在实现 PR 中
只能导致本 gate 失败，不能被静默改 expected；本票已判定 final crypto 算法/这些输入不变。

#### B02 — 原子 Requirement 与稳定 Case 拆分

每个 active Requirement 自动拥有一条不可复用的 canonical specification Case：
`specification.rpc-<family-lower>-<nnn>`，其 `covers` 恰为该一个 Requirement。这一机械规则消除了
下游为 154 个 preserved Requirement 发明 Case 名的自由。行为 Case 另用 dotted semantic ID，可覆盖
多个 Requirement；旧 Adapter grandfather 例外已在上节穷尽。

上一候选被点名的九个捆绑 ID 现按独立 truth condition 重定义如下；表中每一行是独立 matrix row，
且至少有一个独立行为 Case：

| Active Requirement | 单一 truth condition | Canonical behavioral Case |
| --- | --- | --- |
| `RPC-DESC-007` | stream method 的 raw return type 必须是 direct `Observable<Item>` | `type.descriptor.stream-method-direct-observable` |
| `RPC-DESC-010` | stream property 必须 required、readonly、`$` suffix 且 direct Observable | `type.descriptor.stream-property-shape` |
| `RPC-DESC-011` | stream 参数任何位置不得含 Observable/AbortSignal/PromiseLike/AsyncIterable/ReadableStream capability | `type.descriptor.stream-parameter-capabilities` |
| `RPC-DESC-012` | stream item/result 不得含 Promise-like、nested Observable、AsyncIterable、ReadableStream、`any`、`never` | `type.descriptor.stream-item-capabilities` |
| `RPC-DESC-013` | application `Subject<T>` source 在 remote facade 只暴露 `Observable<T>` | `type.facade.subject-observable-narrowing` |
| `RPC-STREAM-009` | Stream Terminal commit 立即 fence future source callbacks | `runtime.stream.terminal-fence-at-commit` |
| `RPC-STREAM-012` | Source Teardown 最多尝试一次 | `runtime.stream.teardown-one-shot` |
| `RPC-STREAM-013` | `onReleased` 只能在真实 teardown attempt 返回或抛出后调用 | `runtime.stream.onreleased-after-teardown` |
| `RPC-STREAM-014` | Source active ownership 只能在 `onReleased` 后退休 | `runtime.stream.source-retirement-after-release` |
| `RPC-STREAM-015` | retained Protocol evidence 不得保留 application object/receiver/source/teardown closure | `runtime.stream.evidence-no-application-references` |
| `RPC-ACK-009` | start receipt 只证明 admission 或 safe rejection disposition retained | `protocol.receipt.start-disposition-only` |
| `RPC-ACK-011` | item receipt 只证明 deliver-once/suppressed disposition retained | `protocol.receipt.item-disposition-only` |
| `RPC-ACK-012` | credit receipt 只证明 absolute horizon accepted | `protocol.receipt.credit-accepted-only` |
| `RPC-ACK-013` | cancel receipt 只证明 cancel intent disposition | `protocol.receipt.cancel-disposition-only` |
| `RPC-ACK-014` | terminal receipt 只覆盖该 sending direction 的 terminal及更低 seq evidence | `protocol.receipt.terminal-direction-only` |
| `RPC-ACK-015` | ACK 可在 disposition commit 后、application effect 前变 dirty/piggyback | `protocol.receipt.dirty-before-effect` |
| `RPC-EVENT-011` | outgoing count 只计 committed deliver-once disposition | `runtime.event.outgoing-delivered-count` |
| `RPC-EVENT-015` | incoming count 只计 terminal boundary/admitted items | `runtime.event.incoming-admitted-count` |
| `RPC-EVENT-016` | overflow-causing emission 从未成为 item，两个 count 均不计 | `runtime.event.overflow-emission-not-counted` |
| `RPC-EVENT-017` | duration 截止 local terminal/finish outcome commit | `runtime.event.duration-terminal-cutoff` |
| `RPC-EVENT-018` | Source `stream-finished` 等待 teardown attempt，但不延长 duration | `runtime.event.source-finished-after-teardown` |
| `RPC-SPI-016` | `finish(outcome,onReleased)` 同步 fence source | `protocol.spi.finish-fences-immediately` |
| `RPC-SPI-018` | SPI `onReleased` 不得早于真实 teardown attempt settlement | `protocol.spi.release-after-real-teardown` |
| `RPC-SPI-019` | SPI `onReleased` 在 return/throw/duplicate terminal 下恰好一次 | `protocol.spi.release-exactly-once` |
| `RPC-SPI-020` | Protocol 只有收到 `onReleased` 才能退休 Source ownership并允许 drain | `protocol.spi.release-controls-retirement` |
| `RPC-RESOURCE-011` | Subscriber Application Work/Active Stream slots 等 terminal projection/suppression commit 后退休 | `runtime.resource.subscriber-slot-retirement` |
| `RPC-RESOURCE-016` | 一个 Receive Slot 在 armed→item→effect→re-arm 间原位循环 | `runtime.resource.receive-slot-cycle` |
| `RPC-RESOURCE-017` | 已授且尚可能到达的 item 始终有同一有限 Receive Slot backing | `runtime.resource.outstanding-grant-backed` |
| `RPC-RESOURCE-018` | local unsubscribe 不释放 outstanding-grant backing | `runtime.resource.unsubscribe-keeps-receive-slot` |
| `RPC-RESOURCE-019` | credit ACK 不释放 Receive Slot | `runtime.resource.credit-ack-keeps-receive-slot` |
| `RPC-RESOURCE-020` | cancel ACK 不释放 Receive Slot | `runtime.resource.cancel-ack-keeps-receive-slot` |
| `RPC-PKG-012` | `/transport` exact runtime/type manifest 恰为 `0/3` | `package.module.transport-exact-manifest` |
| `RPC-PKG-014` | `/conformance` exact runtime/type manifest 恰为 `4/8` | `package.module.conformance-exact-manifest` |
| `RPC-PKG-002` | root/specialist shared declarations与runtime values同一 identity；此命题不再被 `PKG-012` 重复 | `package.module.shared-symbol-identities` |
| `RPC-RELEASE-010` | installed ESM namespaces 的 exact runtime manifests | `package.inventory.esm-runtime-exact` |
| `RPC-RELEASE-013` | installed CJS own-property exact runtime manifests | `package.inventory.cjs-runtime-exact` |
| `RPC-RELEASE-014` | TypeScript compiler API 从 emitted declarations 得出 exact type/value symbol manifests | `package.inventory.declaration-symbols-exact` |
| `RPC-RELEASE-015` | root + 3 specialist code subpaths 的全部正向 static import/require conditions 可解析 | `package.conditions.all-code-subpaths-positive` |
| `RPC-RELEASE-016` | strict NodeNext `.mts` 独立 consumer，`skipLibCheck:false` | `package.consumer.nodenext-mts` |
| `RPC-RELEASE-017` | strict NodeNext `.cts` 对每个 code subpath 使用 static require-condition probe，`skipLibCheck:false` | `package.consumer.nodenext-cts-static-require` |
| `RPC-EVIDENCE-005` | raw/scenario#step/KAT/schema selector 解析恰一对象且全局唯一 | `evidence.selector.exact-unique` |
| `RPC-EVIDENCE-008` | 每个 canonical/normative Case 的 `covers` 非空且只含 active ID | `evidence.graph.normative-case-nonempty` |
| `RPC-EVIDENCE-009` | `case.covers` 与 matrix requirement→case edge 互为精确逆集 | `evidence.graph.case-matrix-inverse` |
| `RPC-EVIDENCE-010` | 每个 Case 明确为 `canonical` 或 `support-only`，后者必须支持至少一个 canonical Case | `evidence.graph.case-classification` |
| `RPC-EVIDENCE-011` | active/case/edge/result 全为 verified；零 orphan/partial/planned/missing/skipped | `evidence.graph.zero-incomplete` |

`RPC-RELEASE-010` 不再重复 `RPC-PKG-009` 的“哪些 subpath 存在”，也不重复 `RPC-PKG-002` 的
shared identity；它只证明 installed ESM runtime exact inventory。`RPC-EVIDENCE-005` 不再声称 matrix
row 数或 evidence presence；那仍只属于 retained `RPC-EVIDENCE-001`。

为补齐 retire table 中仍有效的 unary/public 子命题，新增原子 ID：`RPC-VALUE-007`（unary args/results +
stream args/items 共同 Application Value domain、无 wire details）、`RPC-VALUE-008`（共同 value hard
limits）、`RPC-CALL-012`（unary AbortSignal check-register-recheck）、`RPC-CALL-013`（unary DNE/
outcome-unknown/canceled guarantees）、`RPC-CALL-014`（unary unknown-member/handler-failed scope与remote
diagnostic redaction）、`RPC-CALL-015`（closed `RpcException` object/code/cause contract）、
`RPC-EVENT-021..023`（call pair/metadata/outcome 三个独立 truth conditions）、`RPC-SPI-021`（incoming
handler/unknown commit effect）、`RPC-SPI-022`（closed incoming unary terminal union）、`RPC-WIRE-025`
（tagged open tails + nested closed error）、`RPC-WIRE-026`（final `/1` 发布后的 evolution rule）、
`RPC-VALID-010`（unknown service/member/kind/handler exact classification）、`RPC-POLICY-008`（closed policy
inventory）、`RPC-POLICY-009`（完整 cross-field validation）、`RPC-SHUTDOWN-015`（non-stream G roots）、
`RPC-SHUTDOWN-016`（draining binding loss stream convergence）、`RPC-SHUTDOWN-017`（Remote Close stream
convergence）、`RPC-CORPUS-009`（全部 fixed/configurable unary+stream boundary triplets）。每个也自动
获得其 `specification.rpc-*` canonical Case。

#### B03 — 双向闭合 evidence graph 与 matrix

最终 machine-readable evidence 只有四类节点：active Requirement `R`、canonical Case `C`、support-only
Case `S`、exact Evidence selector `E`。唯一权威边为 `R<->C`、`C<->E`、`S->C`；任何 asset 内自报的
`covers` 只是待校验副本，不能创造边。

```text
requirements.active.ids == matrix.requirementId (一一对应)
forall r in R: count(matrix row for r) == 1
forall r in R: matrix[r].cases is nonempty
forall c in C: c.covers is nonempty and subset(R)
forall c in C: c.covers == { r | c.id in matrix[r].cases }
forall e in E: e.cases == { c | e.id in c.evidence }
forall c in C: c.evidence == { e | c.id in e.cases }
forall s in S: s.covers == [] and s.supports is nonempty and subset(C)
retired Requirement/Case IDs appear only in tombstones
```

Case registry 必填 `id, classification, covers, publicSeam, input, expected, failureOwner, evidence,
status`；Evidence registry 必填 `selector, class, cases, artifactDigest, runnerDigest, status`。Release receipt
记录 `activeRequirementCount, retiredRequirementCount, canonicalCaseCount, supportOnlyCaseCount,
requirementCaseEdgeCount, caseEvidenceEdgeCount`，并对上述正反集合各跑一次独立重算。任一 edge 只存在
一侧、任何 Case/selector orphan、任何 `partial|planned|missing|skipped|todo|only|flaky` 即 BLOCK。

Exact selector grammar 固定为：

```text
specification:<RPC-ID>
type:<case-id>
runtime:<case-id>
protocol:<case-id>
transport:<exact grandfathered-or-dotted-case-id>
schema:rpc1:<RFC6901 JSON Pointer>
raw:rpc1:<globally-unique-vector-id>
transcript:rpc1:<globally-unique-scenario-id>#<scenario-local-step-id>
security:rpc1:<globally-unique-kat-id>
browser:<case-id>@chromium|firefox|webkit
package:<case-id>@<tgz-sha256>
doc:<case-id>@<commit>
```

禁止递归寻找第一个同名 `id`。Scenario ID 全局唯一，step ID 在 scenario 内唯一；最终 composite
`scenario#step` 全局唯一。Schema selector 必须是 exact RFC 6901 pointer。Raw/KAT selector 必须解析
恰一个 object。`verified` 只能引用当前 production tree 直接执行的 public-seam evidence，或同一个
installed tested tgz SHA；Ticket13、相对源码 fixture、Bundler-only、throwaway、review-only scan 都不能
把 edge 标绿。

154 个 preserved Requirement 的 matrix row 直接继承当前旧命题和现有 evidence input，但统一增加机械
Case `specification.rpc-*`；新/retired replacement 使用本 Comment 的行为 Case。生产 matrix 必须展开为
逐 Requirement 单行，不得保存 range row。本 Comment 的 range 只用于说明；下面这些 FORMAL 关键 edge
必须是直接边，不能靠综合 transcript 间接推导：

| Requirement | Direct Case | Required evidence classes |
| --- | --- | --- |
| `RPC-EVENT-016` | `runtime.event.overflow-emission-not-counted` | runtime + transcript exact step |
| `RPC-EVENT-017` | `runtime.event.duration-terminal-cutoff` | real-RxJS runtime trace |
| `RPC-EVENT-018` | `runtime.event.source-finished-after-teardown` | real-RxJS runtime + Protocol release trace |
| `RPC-ACK-014` | `protocol.receipt.terminal-direction-only` | Protocol + transcript exact step |
| `RPC-RESOURCE-019` | `runtime.resource.credit-ack-keeps-receive-slot` | runtime + Protocol + transcript exact step |
| `RPC-VALID-009`, `RPC-SEC-011` | four independent post-G validation Cases in B08 | raw/transcript/security direct selectors |
| `RPC-CONFORMANCE-004` | each broken-Protocol mutant Case in B07 | installed Protocol runner report |
| `RPC-CONFORMANCE-005`, `RPC-TRANSPORT-013` | deterministic load + fixed Adapter rejection Cases | Protocol runner + unchanged Adapter runner |

#### B04 — 删除与 closed inventory 的独立证明

四个 PASS-locked module manifests 保持上一 Comment 的 exact members；对应 Case 分别固定为
`package.module.root-exact-manifest`、`package.module.protocol-exact-manifest`、
`package.module.transport-exact-manifest`、`package.module.conformance-exact-manifest`。在它们之外还必须
有以下不可合并 Case：

| Stable Case | 独立失败条件 |
| --- | --- |
| `type.public.acceptor-resolveall-member-absent` | 对 actual installed declaration 编译 `acceptor.resolveAll`，必须得到“member不存在”的目标诊断 |
| `runtime.public.acceptor-resolveall-member-absent` | actual installed acceptor 上 `"resolveAll" in acceptor === false`，且 prototype chain 也无该键 |
| `runtime.enum.rpc-exception-code-exact-members` | enum own keys/values 恰为 `canceled, unavailable, outcomeUnknown, handlerFailed, unknownService, unknownMember, overflow, protocol` |
| `type.policy.acceptor-closed-inventory` | Acceptor policy keys恰为下面 17 项，extra/old key诊断 |
| `type.policy.connector-closed-inventory` | Connector option keys恰为下面 11 项，total/Owner-only/old key诊断 |
| `runtime.policy.closed-inventory` | frozen runtime policy恰为17项，old/extra input同步拒绝且不构造 Protocol |

Acceptor/runtime closed 17 keys：`maxSessions, maxHandshakes, maxApplicationWorkPerSession,
maxApplicationWorkTotal, maxActiveStreamsPerSession, maxActiveStreamsTotal, maxRetainedBytesPerSession,
maxRetainedBytesTotal, maxHandlersPerSession, maxHandlersTotal, ackDelayMs, activityProbeIntervalMs,
silenceTimeoutMs, sendProgressTimeoutMs, bindingAttemptTimeoutMs, recoveryGraceMs, shutdownDeadlineMs`。
Connector caller options只含其中 `maxApplicationWorkPerSession, maxActiveStreamsPerSession,
maxRetainedBytesPerSession, maxHandlersPerSession` 与七个 timing keys；其余由 Framework 派生。

每个 legacy 名独立负例，不允许用一个 `legacy-absence` happy path 吞并：

| Legacy name | Required independent stable Cases |
| --- | --- |
| `RpcCallDirectionEnum` | `package.negative.esm.rpc-call-direction-enum`, `package.negative.cjs.rpc-call-direction-enum`, `type.negative.rpc-call-direction-enum` |
| `RpcPeerResult` | `package.negative.esm.rpc-peer-result`, `package.negative.cjs.rpc-peer-result`, `type.negative.rpc-peer-result` |
| `RemoteServiceGroup` | `package.negative.esm.remote-service-group`, `package.negative.cjs.remote-service-group`, `type.negative.remote-service-group`, `package.negative.deep-remote-service-group` |
| `resolveAll` | `type.public.acceptor-resolveall-member-absent`, `runtime.public.acceptor-resolveall-member-absent` |
| `unknownMethod` | `type.negative.rpc-exception-code-unknown-method`, `runtime.negative.rpc-exception-code-unknown-method` |
| `maxPendingInvocationsPerSession` | `type.negative.policy-max-pending-invocations`, `runtime.negative.policy-max-pending-invocations` |

每个 type negative 必须由 TypeScript compiler API 断言目标 module/member diagnostic；每个 ESM/CJS
negative 必须从 isolated tgz 直接 import/require 并只因目标 name 缺失而失败。`Object.keys()`、Bundler、
源码 `grep` 或删除某个 implementation 文件均不能证明这些 Case。

#### B05 — actual package/tarball gate、hermetic receipt 与 release gate

**Artifact authority.** Canonical production artifact 由 versioned clean candidate 上的一次
`pnpm --dir packages/remote pack` 产生。选择 pnpm 是因为 source manifest 有 `workspace:*`，pnpm pack
负责把它正规化为可发布依赖；`npm pack` 不被允许悄悄成为另一个 production packer。pnpm/npm parity
终局裁决为：同一 built tree 必须运行 `npm pack --dry-run --json`，它的 normalized file list 与
pnpm tgz 的 exact tar allowlist 完全相同；npm 必须能在 isolated project 安装该 tgz，并且 packed
manifest 无 `workspace:*`；最终只能执行 `npm publish <已验收的绝对 tgz 路径>`。任何 npm dry-run 与
pnpm tar tree 差异、或 publish 前从 package directory 再 pack，均 BLOCK。这里明确采用 parity 路线，
不再把“是否需要 literal npm pack”留给实现者。

**Exact tar-entry allowlist.** Release-candidate commit 必须含一个 nonpublic、逐 path、无 glob 的
`tar-allowlist` evidence asset；它列出 `path, entryType, mode`，并为 regular file 记录 expected
content source。它至少且只能包含：

```text
package/package.json
package/LICENSE
package/README.md
package/CHANGELOG.md
package/docs/SPECIFICATION.md
package/docs/REQUIREMENTS.md
package/docs/PROTOCOL.md
package/docs/TRANSPORT.md
package/docs/ARCHITECTURE.drawio
package/docs/ARCHITECTURE.png
package/wire/husky-di-rpc-1/schema.json
package/wire/husky-di-rpc-1/raw-vectors.json
package/wire/husky-di-rpc-1/transcripts.json
package/wire/husky-di-rpc-1/known-answer-vectors.json
<每个 final dist entry 的逐项 literal path；不得用 dist/**>
```

最后一组 literal `dist` paths 是 implementation/release manifest，不是规范决定：Ticket14 不规定
production file layout；实现 PR 在其 layout 已确定后必须一次性提交精确列表，review 后 release job
只能比较，不能 auto-update/snapshot-accept。每个 code export condition、`.d.ts` 引用和 source map
引用必须落在 allowlist；allowlist 中不得有不可达 build output。Tar 中任何额外 source、test、example、
`.scratch`、legacy corpus、backup、private public subpath 或未列 entry 都失败。这样同时满足 exact
artifact gate 与 implementation-neutrality。

**Public resolution wording 固定为 `root + 3 specialist code subpaths + 4 JSON subpaths`：**root、
`/protocol`、`/transport`、`/conformance`；以及 schema、vectors、transcripts、security-vectors。
不得再写成“root + four specialists”。四个 JSON 只读取 final assets，不新增 public manifest/revision
subpath。

| Consumer | 必须从同一 installed tgz 做的独立证明 |
| --- | --- |
| `native.mjs` | Node 原生 ESM，静态 import root + 3 specialist；运行 mixed facade/stream smoke 与 ESM exact runtime inventory |
| `native.cjs` | Node 原生 CJS，逐 subpath `require()`；运行同一 smoke 与独立 CJS own-property inventory |
| `consumer.mts` | `module/moduleResolution: NodeNext`, strict, `skipLibCheck:false`, `types:[]`；四个 code subpath 的正/负 named imports |
| `consumer.cts` | 同一 strict 配置；对四个 code subpath 分别写 static `import x = require("...")` require-condition probe，不允许 dynamic `require` 掩盖 declaration resolution |
| declaration auditor | TypeScript compiler API 从 installed emitted `.d.ts` module symbols 得到四 manifest；与 `.mts/.cts` 正负 imports 交叉校验 |
| JSON consumer | 四个 JSON subpath 分别 resolve/read/parse，hash 与 corpus lock/four-tuple 相同 |
| DOM consumer | `lib: [ES2023, DOM, DOM.Iterable]`, `types:[]`, `skipLibCheck:false`；先编译 installed declarations，再只为 browser runtime bundle |
| Browser runtime | Chromium/Firefox/WebKit 三者都从 DOM consumer bundle 运行 mixed facade、real RxJS reentrancy、Recovery 与 WebCrypto vectors |

最低 release lane 锁为 Node `23.6.x`；另外的较新 Node lane只能增加信心，不能替代 `23.6.x`。
Receipt 必须记录 actual patch，package engine 仍是 `>=23.6`。TypeScript/Playwright/三 browser binaries
使用 lockfile-pinned exact version/revision；禁网步骤由已安装 lock/cache 驱动，任何现场下载或 floating
browser channel 都不是 hermetic PASS。

**Machine-readable receipt.** Final `release-receipt` 是 workflow evidence，不进入 public package。它的
canonical JSON 至少绑定：

```text
schemaVersion
git.commit, git.tree, git.clean
lockfile.sha256
platform.os, platform.release, platform.arch
shell.path, shell.version
node.version, node.minimumLane
npm.version, pnpm.version, typescript.version, playwright.version
browsers.chromium.revision, browsers.firefox.revision, browsers.webkit.revision
requirements.activeCount, requirements.retiredCount, requirements.ledgerSha256
cases.canonicalCount, cases.supportOnlyCount, cases.retiredCount, cases.ledgerSha256
edges.requirementCaseCount, edges.caseEvidenceCount, edges.graphSha256
results.passed, results.failed, results.partial, results.planned,
results.missing, results.skipped, results.todo, results.only, results.flaky
corpus.internalRevision, corpus.lockSha256,
corpus.schemaSha256, corpus.rawSha256, corpus.transcriptSha256, corpus.securitySha256
tar.allowlistSha256, tar.canonicalTreeSha256, tar.entries[]
artifact.testedTgzPath, artifact.testedTgzSha256
artifact.publishedRegistryUrl, artifact.publishedTgzSha256
commands[] = { id, argv, cwdLogical, exitCode, stdoutSha256, stderrSha256 }
```

所有 zero 字段必须实际为 0；`testedTgzSha256 == publishedTgzSha256` 是 final receipt 的硬断言。
Publish 前先产生含 tested SHA 的 provisional receipt；publish 后从 registry 下载实际 tarball，补入
published SHA 并再次校验相等后才生成 final receipt/tag/release metadata。Receipt 自身 canonical bytes
与 digest 作为 CI artifact 固定，不靠 mutable console log。

**Clean reproducibility.** 两个 detached clean worktree 均从同一 commit/lock/toolchain 开始，并在
install 前同时证明 Git tree 与 filesystem 都没有 `packages/remote/dist`。两边强制 build，再分别 pack；
比较解包后 sorted `path, type, mode, file sha256` 的 canonical tar tree。两 tree 必须相同；两个 gzip tgz
bytes/SHA **不要求**相同，因为 gzip metadata 不是产品合同。只有 worktree A 的一个具体 tgz 可进入
consumer/browser gate；通过后该 exact SHA 才可 publish。B tree 仅证明 canonical tree reproducibility。

新增 release Requirement 的原子归属为：`RPC-RELEASE-018`（每个 legacy type negative）、
`RPC-RELEASE-019`（exact tar allowlist）、`RPC-RELEASE-020`（hermetic receipt fields/counts）、
`RPC-RELEASE-021`（Node 23.6.x minimum lane）、`RPC-RELEASE-022`（pnpm/npm parity）、
`RPC-RELEASE-023`（tested/published same tgz SHA）、`RPC-RELEASE-024`（zero skip/incomplete release result）。

**Release gate（全部 AND，任何一项失败由对应 owner 报 stable Case ID）：**

1. Identity/graph：201 legacy ledger、全部 new IDs、Case tombstones、matrix/inverse/selector audit 全闭合。
2. Version/clean：Changeset version 与 CHANGELOG 已进入 clean RC commit，remote 恰为 `1.0.0`，fresh
   checkout 无 dist，Node 23.6.x minimum lane 与 frozen lock 生效。
3. Repository：code standard、full build/test、normative specification/type/runtime、built-in/custom
   Protocol、grandfathered Adapter、remote-websocket/example 全通过且 zero skip/only/todo/flaky。
4. Corpus：nonpublic lock、independent metaschema/raw/KAT、same-tgz built-in Protocol transcripts、exact
   four-tuple 与 coverage graph 全通过。
5. Artifact：pnpm pack + npm parity、exact tar allowlist、root + 3 specialist + 4 JSON、native ESM/CJS、
   NodeNext `.mts/.cts`、exact manifests与每名独立 negatives 全通过。
6. Browser：DOM-only compile 先过，随后 Chromium/Firefox/WebKit 对同一 tgz runtime 全通过。
7. Repro/docs：两 worktree canonical tree相同；README/PROTOCOL/TRANSPORT/architecture source+render/
   CHANGELOG/Changeset/examples/migration/stale scan全通过。
8. Publish：只 publish 已验收 A tgz；registry 下载 SHA 等于 tested SHA，final receipt 全字段闭合。

#### B06 — nonpublic corpus lock 与 installed-tgz executable corpus

Corpus lock 采用无自引用的两层结构：

- 一个**预提交、nonpublic、不得 pack/export**的 corpus manifest，固定 `internalRevision`、四个 source
  asset SHA-256、全部 raw IDs与exact expectations、scenario#step selectors、KAT IDs/provenance、canonical
  Case edges；其 canonical digest 为 `manifestSha256`。
- CI 在 clean checkout、任何 test/build/pack 之前生成 binding envelope，记录 `gitCommit`, `gitTree`,
  `manifestSha256`, four hashes 和 toolchain；其 canonical digest 为 `lockSha256`。Envelope 在 tree 外，
  因此可以绑定包含 manifest 的 commit/tree 而不产生 self-hash。

四个 asset 必须共同匹配 manifest，installed tgz 的 runner 再从四个 public JSON subpath读取并逐 byte/hash
比较；source tuple、manifest tuple、installed tuple 任一不等即 mixed-corpus BLOCK。无需、也禁止在四个
public JSON 中增加 revision field。

Schema gate 使用与 production Codec/validator 独立的 Draft 2020-12 validator，并先把 schema 对 pinned
official Draft 2020-12 metaschema 验证；metaschema URL、bytes SHA 与 validator version进入 lock/receipt。
随后 exact schema positive/negative instance set运行。Production schema/Codec通过这些 independent
expected facts，不能把生产 validator 的“接受自己 schema”作为唯一证明。

Raw manifest 对每个 vector 固定：

```text
id, validity(valid|invalid), exactBytesSha256,
phase(utf8|json|schema|security|binding|sequence|semantic),
failureScope(none|record|binding|session|owner),
ackEffect(not-applicable|unchanged|advance-to:<n>),
applicationEffects(routeCapture, methodCalls, getterReads, sourceSubscriptions,
                   observerNext, observerTerminal, sourceTeardown),
expectedRecordKindOrFault
```

Positive 与 negative ID 集合必须与 manifest exact 相等，无 extras；limit-1/limit/limit+1、exact 1 MiB/+1、
65,546 nodes、method/property/terminal/error branches与 post-G validation各有独立 selector。Invalid vector
不仅“throws”：必须命中指定 phase/scope，ACK 不错误推进，effects 全为指定值。

Transcript runner 从**同一 installed tgz**的 public `createRpcProtocol()` 建立 real production Protocol，
用受控 `IRpcConnection.message$/send/close` 注入 raw bytes并记录实际 outbound bytes、host calls、public
state/event、application callbacks、real RxJS subscribe/teardown；这样通过 public seam 驱动 production
Codec，而不 deep-import private Codec。每个 `scenario#step` 将 actual trace 与 independent expected model
比较：两端 phase/binding、seq/ACK/cursor、stream/item/horizon/boundary、effects、resources的可观察
admission/release token、下一合法/非法 action都必须相等。不能只把 transcript JSON 自己读出来再断言
它等于自己。

KAT generator 必须独立于 production cryptography，记录一手 RFC selector、reference implementation
digest、input/output hashes；五个 preserved KAT 与新增 stream cursor/Recovery security actions全部重算。
仍正确的 bytes可相同。Corpus 内 `covers` 字段不具有 authority：runner只验证它等于 evidence graph 的
逆向投影；删掉或篡改 corpus `covers` 不得让 requirement 获得 PASS。

`RPC-CORPUS-005` 只拥有“四 asset 同 revision整体替换/无 legacy sibling”，`RPC-CORPUS-006` 只拥有
schema/raw exact grammar与limits，`RPC-CORPUS-007` 只拥有 stateful action/effect transcripts，
`RPC-CORPUS-008` 只拥有 independent KAT provenance/security actions，`RPC-CORPUS-009` 只拥有全部
fixed/configurable runtime resource triplets；相互不再重叠。

#### B07 — Adapter load seam 的逐-send deterministic trace 与 mutants

Canonical load Case `protocol.stream.aggregate-bounded-load` 在 bootstrap结束后的一个 sending direction
使用四个 W=1 streams `A/B/C/D` 与一个 unary `U`。在 `t0`，`A1/B1/C1/D1` 与 `U-result` 同时
dependency-ready；control 与 progress 同时 ready，因此第一个 post-barrier turn必须是 control。
另有 `D-terminal` retained 但被同 stream 的 `D1` dependency block；它不能阻塞其他 identity。
ACK 固定只到 `q4`，第七次 `send()` invocation 固定由 Adapter reject。

| Send attempt | Exact selected work | Required observation |
| ---: | --- | --- |
| `S01` | control `U-result(q1)` | control-first；调用后直到 Promise settle 不得出现 `S02` |
| `S02` | progress `A1(q2)` | unary virtual participant 后进入 stream RR |
| `S03` | unrelated ready control `X-terminal(q3)` | blocked `D-terminal` 未阻塞其他 control identity |
| `S04` | progress `B1(q4)` | Promise 人为保持 unsettled；其间新 work仍受既有 slots/ledgers限制且没有第二个 send |
| `S05` | progress `C1(q5)` | ACK仍只覆盖 q4，q5保留 replay pair |
| `S06` | progress `D1(q6)` | settlement后 `D-terminal` dependency才 ready |
| `S07` | control `D-terminal(q7)` | 固定第七次 invocation reject；binding fence/Recovery，不得投影 overflow |
| `S08` | replacement exact replay `C1(q5)` | 原 seq/body；frozen barrier first |
| `S09` | replacement exact replay `D1(q6)` | 原 seq/body；Observer不得重复 |
| `S10` | replacement exact replay `D-terminal(q7)` | 原 winner/boundary；不重订 source |
| `S11` | first post-barrier new work | 只能在 q5..q7 barrier清空后分配 q8 |
| `S12` | next RR/probe/ACK-eligible work | 继续满足 lane alternation与单 unsettled send |

每一步记录 `ready set -> chosen case/identity -> send argv SHA -> settlement -> retained set -> next ready set`；
四 streams + unary 每个都必须在固定有限轮数内取得一次 turn。`S04` pending期间允许 bounded retained
work继续形成，但每 Connection 仍只有一个 unsettled send，且 W=1 不保留同 stream 第二 raw value。

Broken-Protocol mutant manifest 必须把 mutant 与**预期失败 Case ID**一一绑定；全部 5/5 kill，不能只看
overall runner reject：

| Mutant | Expected failed Case ID | Failure owner |
| --- | --- | --- |
| receiver接受 over-credit item | `protocol.stream.over-credit-session-fault` | Protocol/Session |
| terminal越过同 stream更早 item | `protocol.stream.item-before-terminal` | Protocol |
| Recovery重新 method/getter/subscribe | `protocol.stream.recovery-no-resubscribe` | Protocol/Framework seam |
| terminal ACK 提前释放 reverse evidence/stream root | `protocol.receipt.terminal-direction-only` | Protocol evidence retirement |
| Adapter send rejection投影 `overflow` | `protocol.stream.adapter-rejection-is-binding-failure` | Protocol binding/Recovery；不是 Adapter stream semantics |

Adapter runner仍只看 `message$ / send(Uint8Array) / close()`，并继续执行上节 24 个 grandfathered IDs；
上述 schedule、stream identity、credit、Recovery replay 和 broken Protocol diagnostics 全归 Protocol
runner。Adapter 只负责完整稳定 bytes、single pending send、finite queue/1 MiB/Direct Close/Error identity。

#### B08 — 独立 real-RxJS/action traces 与 direct edges

下列每一行都是独立 canonical Case、独立 selector、独立 matrix edge；不得合并成一个最终-state
happy path。Runtime cases 从同一 installed tgz与其 dependency安装 real RxJS，并只记录 public facade/
Observable、Protocol/Transport seam、public event/state 和 application callback；不得读取 private field。

| Stable Case / exact selector | Action trace | Required ordered observation | Direct Requirement edge |
| --- | --- | --- | --- |
| `runtime.stream.release-order` | sync source terminal；teardown return与throw各跑一次 | `terminal commit < teardown attempt < onReleased < Source retirement < source stream-finished`，各一步恰一次 | `STREAM-009,012,013,014`; `SPI-016,018,019,020`; `EVENT-018` |
| `runtime.event.overflow-emission-not-counted` | W=1 item1后立即second `next` | item1 count=1；causing emission无Item identity/disposition且count不变；terminal=overflow | `FLOW-004`; `EVENT-016` |
| `runtime.event.duration-terminal-cutoff` | clock在terminal commit后、teardown返回前推进 | duration固定在terminal commit时值 | `EVENT-017` |
| `runtime.event.source-finished-after-teardown` | terminal commit后暂停teardown，再释放 | terminal/wire可progress；finished尚无；teardown settle后唯一finished，duration不增加 | `EVENT-018`; `STREAM-013,014` |
| `protocol.receipt.terminal-direction-only` | ACK覆盖Source→Subscriber terminal seq，反向start/credit/cancel尚未ACK | 只退休被覆盖方向；reverse replay/root仍在，drain=false | `ACK-014`; `LEDGER-008` |
| `runtime.resource.credit-ack-keeps-receive-slot` | grant/credit被ACK但合法item仍可到达 | Receive Slot backing仍占用；只在item consume+rearm或terminal/Session convergence释放 | `ACK-012`; `RESOURCE-017,019` |
| `security.rpc1.post-g-wrong-proof-before-unavailable` / `security:rpc1:post-g-wrong-proof#reject` | G后wrong proof fresh start | security phase先拒；无ACK、route、source或`unavailable` disposition | `SEC-011`; `VALID-009` |
| `raw.rpc1.post-g-malformed-before-unavailable` / `raw:rpc1:post-g-malformed-start` | G后malformed schema bytes | schema phase Session fault；无ACK/effects | `WIRE-024`; `VALID-009` |
| `transcript.rpc1.post-g-sequence-gap-before-unavailable` / `transcript:rpc1:post-g-validation#sequence-gap` | G后fresh seq gap | sequence phase fault；不走protected unavailable | `WIRE-021,024`; `VALID-009` |
| `transcript.rpc1.post-g-illegal-stream-ordinal-before-unavailable` / `transcript:rpc1:post-g-validation#illegal-stream-ordinal` | G后reused/gap Stream Ordinal | ordinal phase fault；不route、不source、不ACK | `LEDGER-006`; `WIRE-021,022,024`; `VALID-009` |

Action trace recorder只记录由公开 transaction token/runner hook表达的 `reserved/committed/released`，不读取
generation token、private reservation object、queue length 或 private counter。Transcript 中的 expected
counter/phase来自独立 model对输入/输出的推导，不是读取 production private state。

#### B09 — implementation neutrality 与 public observable truth

- `RPC-API-007` 只规定**可观察 public absence**：installed root没有 `RpcPeerResult`/
  `RemoteServiceGroup` named type/value，`IRpcAcceptor` declaration没有 `resolveAll` member，actual acceptor
  上 `"resolveAll" in acceptor === false`，且无 deprecated alias/shim/replacement Group facade。它不禁止
  Framework 内部为其他 public features 使用 batching、reservation、fan-out 或类似算法，也不要求删除
  名含 group 的任意 private helper。
- `RPC-STREAM-006` 只规定可观察的 state-before-effect、serial non-overlap 与 terminal fencing：real RxJS
  reentrant source/Observer trace 中 callback depth最大1、disposition/receipt可先于effect观察、terminal后
  无新item/credit/effect。它不规定 package-private gate、class、queue、effect runner或event-loop布局。
- Canonical evidence 禁止读取 private generation token、reservation、ledger/counter/queue字段；Recovery/G/F
  authority只通过 public state/event顺序、send/callback是否发生、Promise identity/settlement和资源 release
  token证明。源码关键词/私有 symbol scan一律 `support-only`、`covers=[]`，只能支持一个 canonical Case，
  不能让 Requirement变绿。
- Tar `dist` literal allowlist是 release implementation evidence，不是规范 file-layout决定；throwaway
  prototype只能是 `support-only` negative baseline，永不成为 production acceptance。

#### Docs、migration、failure ownership 与 implementation handoff

Docs/migration Case 保持上一候选并收紧为全树 stale scan：`doc.remote.readme`、`doc.remote.protocol`、
`doc.remote.transport`、`doc.remote.architecture-source-render`、`doc.remote.changelog-changeset`、
`doc.remote.examples-migration`、`doc.remote.no-legacy-vocabulary`。Scan覆盖 remote、remote-websocket、
examples、published tar docs与可执行 code blocks；仅 CHANGELOG/migration prose的明确 `removed` context可出现
`resolveAll|RemoteServiceGroup|RpcPeerResult|unknownMethod|maxPendingInvocationsPerSession|methods:`。
README示范mixed members/cold per-subscription；PROTOCOL闭合credit/replay/resources/G/F/security/corpus；
TRANSPORT只描述不变三成员 seam与Adapter failure ownership；architecture editable source与render必须语义一致；
examples实际 typecheck/run并用 `peers.map`/Promise/RxJS显式组合。Migration明确 old Session drain/terminate、
双端同时升级、fresh reconnect；不声称 Group common normalization/atomic reserve/wait-all/fairness。

Failure report 必填 `stableCaseId, coveredRequirementIds, owner, expectedPublicObservation,
actualPublicObservation, evidenceSelector, commit, testedTgzSha256, corpusLockSha256`。Owner固定为：Framework
（Descriptor/facade/exposure/RxJS/public telemetry）、Protocol（credit/order/replay/resources/fairness/G/F）、
built-in corpus/security、Transport Adapter（bytes/Connection）、package/release、application。Over-credit/
ordinal gap归Protocol Session；Adapter reject归binding/Recovery；producer不合作归application；不得只报
“integration failed”。

Implementation handoff 仍是 TDD outcome 顺序而非 file layout：

1. 先落 immutable requirement/case/selector ledger与evidence graph audit RED；同一 change改 normative spec
   与 matching `specification.test.ts`，每 active ID一行/一机械 specification Case。
2. 再落 actual-tgz type/runtime negatives RED，随后 mixed Descriptor、single-peer facade、Group public absence、
   exact inventories与policy rename转GREEN；Ticket13 source不得导入production。
3. 按 lifecycle/reentrancy→credit/ACK/replay→resources/fairness→Recovery→G/F→telemetry→custom Protocol load/
   mutants逐Case RED/GREEN；Adapter 24 Case原样回归。
4. 四 corpus assets、nonpublic manifest/lock、runner与four-tuple在一个不可分割 change中整体替换；无 old/new
   mixed revision。
5. 最后落 exact tar allowlist、同一tgz consumers/browser、repro receipt、docs/examples/workflow；只有完整
   release gate可称 production acceptance。

#### 可执行验收命令草案

这些命令是 orchestration contract；`evidence:*`/`test:release` scripts 是 implementation handoff 的
稳定 CLI seam，可改变内部文件布局但不得改变输入、receipt或 Case result。当前票**不执行** version/pack/
publish。

```bash
set -euo pipefail
ARTIFACT_DIR="${RUNNER_TEMP:-/tmp}"

test -z "$(git status --porcelain=v1 --untracked-files=all)"
RC_COMMIT="$(git rev-parse HEAD)"
RC_TREE="$(git rev-parse HEAD^{tree})"
test "$(node -p "require('./packages/remote/package.json').version")" = "1.0.0"
case "$(node -p 'process.versions.node')" in 23.6.*) ;; *) exit 23 ;; esac
test -z "$(git ls-tree -r --name-only "$RC_COMMIT" -- packages/remote/dist)"
test ! -e packages/remote/dist

pnpm install --frozen-lockfile --offline
pnpm --filter @husky-di/remote evidence:ledger -- --status verified
pnpm --filter @husky-di/remote evidence:graph -- --inverse --zero-incomplete
pnpm --filter @husky-di/remote evidence:corpus-lock -- \
  --commit "$RC_COMMIT" --tree "$RC_TREE" --output "$ARTIFACT_DIR/corpus-lock.json"
pnpm test:code-standard
pnpm check:code-standard
pnpm build
pnpm test
pnpm --filter @husky-di/remote-websocket test
pnpm --filter @husky-di/example-remote-websocket typecheck
pnpm --filter @husky-di/example-remote-websocket test

PACK_DIR="$(mktemp -d "$ARTIFACT_DIR/husky-remote-pack.XXXXXX")"
npm pack ./packages/remote --dry-run --json > "$PACK_DIR/npm-dry-run.json"
pnpm --dir packages/remote pack --pack-destination "$PACK_DIR"
find "$PACK_DIR" -maxdepth 1 -type f -name '*.tgz' -print > "$PACK_DIR/tgzs.txt"
test "$(wc -l < "$PACK_DIR/tgzs.txt" | tr -d ' ')" = "1"
RC_TGZ="$(sed -n '1p' "$PACK_DIR/tgzs.txt")"
RC_TGZ_SHA="$(shasum -a 256 "$RC_TGZ" | awk '{print $1}')"

pnpm --filter @husky-di/remote evidence:pack-parity -- \
  --tgz "$RC_TGZ" \
  --npm-dry-run "$PACK_DIR/npm-dry-run.json" \
  --allowlist packages/remote/tests/release/tar-allowlist.json
pnpm --filter @husky-di/remote test:release -- \
  --tgz "$RC_TGZ" \
  --corpus-lock "$ARTIFACT_DIR/corpus-lock.json" \
  --node-minimum-lane 23.6.x \
  --receipt "$ARTIFACT_DIR/release-receipt.provisional.json"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

`test:release` 必须实际创建并执行 `native.mjs`、`native.cjs`、`consumer.mts`、`consumer.cts`、DOM-only
consumer、compiler-API auditor、four-JSON runner、Protocol/Adapter conformance与三 browser engines；内部
不得重新 pack、访问 workspace source/paths alias、使用 Bundler做Node/type证明或读取Ticket13 fixture。

两个 worktree reproducibility gate：

```bash
set -euo pipefail
ARTIFACT_DIR="${RUNNER_TEMP:-/tmp}"

RC_COMMIT="$(git rev-parse HEAD)"
REPRO_ROOT="$(mktemp -d "$ARTIFACT_DIR/husky-remote-repro.XXXXXX")"
git worktree add --detach "$REPRO_ROOT/a" "$RC_COMMIT"
git worktree add --detach "$REPRO_ROOT/b" "$RC_COMMIT"

for TREE in "$REPRO_ROOT/a" "$REPRO_ROOT/b"; do
  test ! -e "$TREE/packages/remote/dist"
  test -z "$(git -C "$TREE" ls-tree -r --name-only HEAD -- packages/remote/dist)"
  pnpm --dir "$TREE" install --frozen-lockfile --offline
  pnpm --dir "$TREE" exec turbo run build --filter='./packages/*' --force
  mkdir "$TREE/.release-pack"
  pnpm --dir "$TREE/packages/remote" pack --pack-destination "$TREE/.release-pack"
  test -z "$(git -C "$TREE" status --porcelain=v1 --untracked-files=no)"
done

A_TGZ="$(find "$REPRO_ROOT/a/.release-pack" -maxdepth 1 -type f -name '*.tgz' -print)"
B_TGZ="$(find "$REPRO_ROOT/b/.release-pack" -maxdepth 1 -type f -name '*.tgz' -print)"
pnpm --filter @husky-di/remote test:reproducible-pack -- \
  --left "$A_TGZ" --right "$B_TGZ" --compare canonical-tree
pnpm --filter @husky-di/remote test:release -- \
  --tgz "$A_TGZ" --corpus-lock "$ARTIFACT_DIR/corpus-lock.json" \
  --receipt "$ARTIFACT_DIR/release-receipt.provisional.json"
```

获得发布授权后只允许：

```bash
set -euo pipefail
ARTIFACT_DIR="${RUNNER_TEMP:-/tmp}"
npm publish "$A_TGZ" --access public
PUBLISHED_DIR="$(mktemp -d "$ARTIFACT_DIR/husky-remote-published.XXXXXX")"
npm pack @husky-di/remote@1.0.0 --pack-destination "$PUBLISHED_DIR"
PUBLISHED_TGZ="$(find "$PUBLISHED_DIR" -maxdepth 1 -type f -name '*.tgz' -print)"
test "$(shasum -a 256 "$A_TGZ" | awk '{print $1}')" = \
     "$(shasum -a 256 "$PUBLISHED_TGZ" | awk '{print $1}')"
pnpm --filter @husky-di/remote evidence:finalize-receipt -- \
  --provisional "$ARTIFACT_DIR/release-receipt.provisional.json" \
  --published-tgz "$PUBLISHED_TGZ" \
  --output "$ARTIFACT_DIR/release-receipt.json"
```

不得在 `npm publish "$A_TGZ"` 前后调用会从 package directory重pack的 `changeset publish`。Changeset
只负责 version/changelog；tag/release metadata只能在 final receipt完成后生成。

#### 待对手正式复审的问题

请对手逐项给出 `PASS` 或带 stable Case/Requirement 的 `BLOCK`：

1. `201 = 154 preserve + 47 retire` 是否存在重复/遗漏，尤其 VALUE、WIRE details/evolution、
   COUNTER、CORPUS limits、SHUTDOWN与CONFORMANCE replacement？
2. 15 Protocol、24 Adapter、52 raw、14 scenario/42 step、5 KAT 的 legacy ledger 是否穷尽；24 Adapter
   `legacyFormat:true` grandfather 是否比无意义 rename更正确？
3. B02 的九组拆分是否仍有任一独立可失败 truth condition被捆绑，或与 `PKG-002/009`、
   `EVIDENCE-001` 重复？
4. Evidence graph的双向集合等式、canonical/support-only与exact selector grammar是否已经排除
   orphan/partial/self-certified covers？
5. 独立 resolveAll type/runtime、ESM/CJS/type legacy negatives、exact enum与closed policy inventory是否
   足以击穿 Bundler/Object.keys 假 PASS？
6. pnpm canonical pack + npm dry-run/install/publish parity、exact literal tar allowlist、Node 23.6.x、
   root + 3 specialist + 4 JSON、same tested/published SHA 与两-worktree canonical-tree规则是否闭合？
7. 两层 nonpublic corpus lock、independent metaschema/KAT和same-tgz public Protocol/Codec action runner是否
   真正避免mixed revision与self-proof？
8. S01–S12 schedule和五个 mutant是否锁定 control-first、RR、blocked identity、single unsettled send、
   fixed rejection、barrier-first replay与Adapter ownership？
9. B08十个独立 traces/direct edges与B09 public-only观测是否既完整又未规定private gate/token/layout？

我最希望对手攻击的薄弱点是：**24 个旧 Adapter Case 的 grandfather exception 与新纯 dotted Case规则
能否共存而不产生两套身份解释**。第二薄弱点是 exact tar allowlist 必须在实现 layout确定后提交，虽然
release gate已禁止自动更新；请对手判断这是否在“implementation-neutral”与“exact artifact”之间留下了
可利用的缝。任何一项未获明确 PASS，本票继续保持 `claimed`。

#### 结论

本 superseding candidate 已把 B01–B09 合并成一个可交给规范/TDD实现者的验证与发布证据合同；它是
待审候选，不是已通过的决策。正式对手逐项明确 `PASS` 前，禁止写 `Answer`、切换 `resolved`、修改
map 或把 prototype/corpus 自证提升为 production acceptance。当前结论仅为
`READY_FOR_REREVIEW`。

#### 票面自检

- Requirement ledger 机械闭包为 `201 = 154 preserve + 47 retire`，交集为零，union 与旧规范的
  201 个 ID 完全相等。
- Legacy selector ledger 机械计数为 Protocol `14 preserve + 1 tombstone`、Adapter `24 grandfather`、
  raw `44 preserve + 8 tombstone`、transcript `14 scenario / 42 step tombstone+replacement`、KAT
  `5 preserve`。
- B02–B09 均位于本 Comment 内；命令仅是 implementation handoff 的可执行草案，本票没有执行
  build、pack、publish 或 production acceptance。
- Markdown fence 配对、相对链接解析和 `git diff --check` 通过；票头仍为 `Status: claimed`，全文没有
  `## Answer`。本轮写入范围只有本 Ticket；工作区原有的 map/production/docs/其他 ticket dirty diff
  未被触碰或据为本轮结果，也没有提交。

### 2026-08-23 third superseding candidate after CHAIR BLOCK (authoritative repairs 1–11)

本 Comment **整体取代前两条 candidate/revised candidate**，是唯一待主席复审的候选。它只落实主席
AUTHORITATIVE REPAIR LIST 1–11；主席驳回的 DOM-all-subpaths、额外 dependency-closure blockers、额外
release mutants、旧 `methods:` 新 Case 身份及任何 implementation layout 要求均不重开。票面继续是
`Status: claimed`；主席 `CHAIR PASS` 前不写 `Answer`、不改 `resolved`/map，不修改或执行 production、
specification、tests、docs、wire assets、pack/publish，也不提交。

#### R1 — legacy Requirement/Case identity

Legacy baseline 被内容寻址为：

```text
SPECIFICATION.md sha256 = ff5259c2d7db766076db6c36ad047351879359e7190be0f44aa50b038b95ee14
REQUIREMENTS.md    sha256 = 30ebe8f28af3e12a81eb8da432691c1d99eadb3611ab441d19b9bb11eca988cf
legacy commit              = 5b2d512815b93570c881d93f35dbb570bac855b1
legacy tree                = 9b09536eedfaf1f0b05f6cfbcac4cae7d4b6e651
```

对 preserved Requirement，本段原采用的“从 exact `**RPC-... —` marker 到下一 Requirement
marker”边界定义已被更晚的
[scoped proposition-boundary erratum](#2026-08-24-scoped-proposition-boundary-erratum-after-implementation-discovery)
明确取代；本段只保留其余 ledger 与完整性约束。特别是 `RPC-EVIDENCE-001` 完整保持：每个 normative Requirement ID
恰有一个 matrix row且至少一个 reproducible evidence reference；ID 发布后不得重编号或复用；每个
matrix reference 必须解析到既存 test case、vector、transcript、instrumented probe、review artifact 或
installed-package consumer。`RPC-EVIDENCE-004` 只拥有 legacy preserve/retire/verdict ledger，不夺走
`RPC-EVIDENCE-001` 的任一子句。

Legacy Requirement 终局计数改为 `153 preserve + 48 retire = 201`，交集为空。Preserve set 逐项为：

```text
RPC-BASE-001, RPC-BASE-003,
RPC-PKG-001, RPC-PKG-002, RPC-PKG-003, RPC-PKG-004, RPC-PKG-005, RPC-PKG-006,
RPC-VALUE-002, RPC-VALUE-003, RPC-VALUE-005, RPC-VALUE-006,
RPC-DESC-001, RPC-DESC-005,
RPC-API-001, RPC-API-002, RPC-API-003, RPC-API-004, RPC-API-005, RPC-API-006,
RPC-STATE-002, RPC-STATE-003,
RPC-CALL-002, RPC-CALL-004, RPC-CALL-005, RPC-CALL-006, RPC-CALL-008,
RPC-EVENT-005, RPC-EVENT-006, RPC-EVENT-007,
RPC-START-001, RPC-START-002, RPC-START-003, RPC-START-004, RPC-START-005,
RPC-TRANSPORT-001, RPC-TRANSPORT-002, RPC-TRANSPORT-003, RPC-TRANSPORT-004,
RPC-TRANSPORT-005, RPC-TRANSPORT-006, RPC-TRANSPORT-007, RPC-TRANSPORT-008,
RPC-TRANSPORT-009, RPC-TRANSPORT-010, RPC-TRANSPORT-011, RPC-TRANSPORT-012,
RPC-SPI-001, RPC-SPI-002, RPC-SPI-003, RPC-SPI-004, RPC-SPI-005, RPC-SPI-006,
RPC-SPI-008, RPC-SPI-009, RPC-SPI-010, RPC-SPI-011, RPC-SPI-012,
RPC-WIRE-001, RPC-WIRE-002, RPC-WIRE-003, RPC-WIRE-004, RPC-WIRE-007, RPC-WIRE-008,
RPC-WIRE-009, RPC-WIRE-010, RPC-WIRE-013, RPC-WIRE-014, RPC-WIRE-015,
RPC-ACK-001, RPC-ACK-002, RPC-ACK-003, RPC-ACK-004, RPC-ACK-005, RPC-ACK-006, RPC-ACK-007,
RPC-LEDGER-001, RPC-LEDGER-002, RPC-LEDGER-003, RPC-LEDGER-004, RPC-LEDGER-005,
RPC-SESSION-001, RPC-SESSION-002, RPC-SESSION-003, RPC-SESSION-004, RPC-SESSION-005,
RPC-SESSION-006, RPC-SESSION-007, RPC-SESSION-008, RPC-SESSION-009, RPC-SESSION-010,
RPC-RECOVERY-001, RPC-RECOVERY-002, RPC-RECOVERY-003, RPC-RECOVERY-004,
RPC-RECOVERY-005, RPC-RECOVERY-006,
RPC-RECONNECT-001, RPC-RECONNECT-002, RPC-RECONNECT-003, RPC-RECONNECT-004, RPC-RECONNECT-005,
RPC-SEC-001, RPC-SEC-002, RPC-SEC-003, RPC-SEC-004, RPC-SEC-005, RPC-SEC-006, RPC-SEC-007,
RPC-VALID-001, RPC-VALID-002, RPC-VALID-003, RPC-VALID-004, RPC-VALID-005, RPC-VALID-006,
RPC-SEC-008, RPC-SEC-009,
RPC-RESOURCE-004, RPC-RESOURCE-006,
RPC-POLICY-004,
RPC-SCHEDULE-001, RPC-SCHEDULE-003, RPC-SCHEDULE-004, RPC-SCHEDULE-005, RPC-SCHEDULE-006,
RPC-TIME-001, RPC-TIME-002, RPC-TIME-003,
RPC-COUNTER-001, RPC-COUNTER-003, RPC-COUNTER-004,
RPC-LIFE-001, RPC-LIFE-002,
RPC-SHUTDOWN-002, RPC-SHUTDOWN-003, RPC-SHUTDOWN-006, RPC-SHUTDOWN-007,
RPC-SHUTDOWN-008, RPC-SHUTDOWN-010,
RPC-CLOSE-002, RPC-CLOSE-003,
RPC-CLEANUP-001, RPC-CLEANUP-002, RPC-CLEANUP-003, RPC-CLEANUP-004,
RPC-EVIDENCE-001, RPC-CONFORMANCE-001, RPC-CORPUS-001, RPC-CORPUS-003,
RPC-RELEASE-002, RPC-RELEASE-003, RPC-RELEASE-004, RPC-RELEASE-005
```

Retire ledger 逐项为；retired ID 永不再次 active，replacement 不继承旧 ID：

```text
RPC-BASE-002 -> RPC-STREAM-001, RPC-STREAM-003, RPC-EVENT-008
RPC-PKG-007 -> RPC-PKG-010
RPC-PKG-008 -> RPC-PKG-011
RPC-PKG-009 -> RPC-PKG-012, RPC-PKG-014, RPC-PKG-015
RPC-VALUE-001 -> RPC-VALUE-007
RPC-VALUE-004 -> RPC-VALUE-008, RPC-WIRE-023
RPC-DESC-002 -> RPC-DESC-006, RPC-DESC-007, RPC-DESC-010, RPC-DESC-011, RPC-DESC-012, RPC-DESC-013
RPC-DESC-003 -> RPC-DESC-009
RPC-DESC-004 -> RPC-DESC-008, RPC-DESC-009
RPC-STATE-001 -> RPC-STATE-004
RPC-CALL-001 -> RPC-CALL-010, RPC-CALL-011, RPC-API-007
RPC-CALL-003 -> RPC-CALL-012
RPC-CALL-007 -> RPC-CALL-013, RPC-CALL-014, RPC-STREAM-010
RPC-CALL-009 -> RPC-CALL-015
RPC-GROUP-001 -> none
RPC-GROUP-002 -> none
RPC-GROUP-003 -> none
RPC-EVENT-001 -> RPC-EVENT-021, RPC-EVENT-009
RPC-EVENT-002 -> RPC-EVENT-022, RPC-EVENT-010
RPC-EVENT-003 -> RPC-EVENT-023, RPC-EVENT-010
RPC-EVENT-004 -> RPC-EVENT-012
RPC-SPI-007 -> RPC-SPI-021, RPC-SPI-022
RPC-WIRE-005 -> RPC-WIRE-025
RPC-WIRE-006 -> RPC-WIRE-016, RPC-WIRE-026
RPC-WIRE-011 -> RPC-WIRE-018, RPC-WIRE-023
RPC-WIRE-012 -> RPC-WIRE-020
RPC-VALID-007 -> RPC-VALID-010
RPC-RESOURCE-001 -> RPC-RESOURCE-007
RPC-RESOURCE-002 -> RPC-RESOURCE-008
RPC-RESOURCE-003 -> RPC-RESOURCE-007, RPC-POLICY-006, RPC-POLICY-007
RPC-RESOURCE-005 -> RPC-RESOURCE-007, RPC-RESOURCE-008
RPC-POLICY-001 -> RPC-POLICY-005, RPC-POLICY-006, RPC-POLICY-007, RPC-POLICY-008
RPC-POLICY-002 -> RPC-RESOURCE-007, RPC-RESOURCE-008
RPC-POLICY-003 -> RPC-POLICY-009
RPC-SCHEDULE-002 -> RPC-SCHEDULE-007, RPC-SCHEDULE-008
RPC-COUNTER-002 -> RPC-COUNTER-005
RPC-SHUTDOWN-001 -> RPC-SHUTDOWN-011, RPC-SHUTDOWN-012, RPC-SHUTDOWN-015
RPC-SHUTDOWN-004 -> RPC-SHUTDOWN-016
RPC-SHUTDOWN-005 -> RPC-SHUTDOWN-014
RPC-SHUTDOWN-009 -> RPC-SHUTDOWN-017
RPC-CLOSE-001 -> RPC-CLOSE-004, RPC-CLOSE-005, RPC-CLOSE-006
RPC-EVIDENCE-002 -> RPC-EVIDENCE-006, RPC-EVIDENCE-011
RPC-EVIDENCE-003 -> RPC-EVIDENCE-012
RPC-CONFORMANCE-002 -> RPC-CONFORMANCE-004
RPC-CONFORMANCE-003 -> RPC-CONFORMANCE-005
RPC-CORPUS-002 -> RPC-CORPUS-007
RPC-CORPUS-004 -> RPC-CORPUS-009
RPC-RELEASE-001 -> RPC-DESC-007, RPC-DESC-010, RPC-DESC-011, RPC-DESC-012, RPC-DESC-013,
                   RPC-RELEASE-009, RPC-RELEASE-016, RPC-RELEASE-017
```

Legacy Case verdict ledger 同样封闭。Protocol exact preserve IDs 为：

```text
protocol.construction.immutable
protocol.construction.connector-fresh-non-reentrant
protocol.construction.acceptor-fresh-non-reentrant
protocol.handoff.subscribe-before-install
protocol.values.normalized-snapshots
protocol.outgoing.reserve-commit-start-sink
protocol.incoming.resource-disposition
protocol.incoming.semantic-unknown-service
protocol.incoming.handler-dispositions-permit
protocol.fault.active-session-scope
protocol.counter.first-call-drains
protocol.termination.shutdown-phase
protocol.termination.close-phase
protocol.termination.cleanup-cached
```

`protocol.incoming.semantic-unknown-method -> protocol.incoming.semantic-unknown-member` 是唯一tombstone/
replacement。24 个 Adapter IDs逐项 `legacyFormat:true` grandfather，exact identities 为：

```text
RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.handoff.subscribe-before-start
RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.source.multicast-terminal-single-use
RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 connector.message.identity-order-hot-terminal
RPC-TRANSPORT-001 RPC-TRANSPORT-003 connector.message.error-identity-terminal
RPC-TRANSPORT-005 RPC-TRANSPORT-006 connector.send.local-admission-backpressure
RPC-TRANSPORT-006 connector.send.one-mebibyte-compatibility
RPC-TRANSPORT-003 RPC-TRANSPORT-007 connector.close.direct-idempotent-race
RPC-TRANSPORT-008 connector.start.abort-before-handoff
RPC-TRANSPORT-003 RPC-TRANSPORT-008 connector.start.failure-error-identity
RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.start.abort-after-handoff-no-revocation
RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.handoff.subscribe-before-start-early-accept
RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.source.multicast-order-hot-terminal
RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 acceptor.message.identity-order-hot-terminal
RPC-TRANSPORT-001 RPC-TRANSPORT-003 acceptor.message.error-identity-terminal
RPC-TRANSPORT-005 RPC-TRANSPORT-006 acceptor.send.local-admission-backpressure
RPC-TRANSPORT-006 acceptor.send.one-mebibyte-compatibility
RPC-TRANSPORT-003 RPC-TRANSPORT-007 acceptor.close.direct-idempotent-race
RPC-TRANSPORT-009 acceptor.start.abort-before-ready
RPC-TRANSPORT-009 acceptor.start.abort-after-ready
RPC-TRANSPORT-009 acceptor.start.complete-before-ready
RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.start.failure-error-identity
RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.listener.failure-after-ready-no-revocation
RPC-TRANSPORT-010 acceptor.connection.failure-isolation
RPC-TRANSPORT-007 RPC-TRANSPORT-009 RPC-TRANSPORT-011 acceptor.overflow.abort-inside-handoff
```

Raw legacy corpus hash为
`8b8fda4a9b3903b6711ca954e175680d63b3f788b4ad11a646aa2f30545954ab`。以下 44 个 ID 只 preserve
`exact bytes + validity + expected record kind/rejection`，绝不把 phase/scope/ACK/effects 填回旧 verdict：

```text
valid-fresh-request, valid-fresh-accept, valid-resume-request, valid-resume-accept,
valid-fresh-reject, valid-generic-resume-reject-with-unknown-tail,
valid-cancel, valid-result-with-void, valid-result-with-null,
valid-ack-zero, valid-ping, valid-pong, valid-close,
valid-legal-whitespace-order-and-escape, valid-depth-limit, valid-string-byte-limit,
valid-member-name-byte-limit, valid-transport-message-byte-limit,
invalid-malformed-utf8, invalid-leading-bom, invalid-duplicate-key-after-escape,
invalid-second-json-value, invalid-non-whitespace-trailing-data, invalid-root-array,
invalid-unpaired-surrogate, invalid-negative-zero, invalid-non-finite-number,
invalid-unsafe-protocol-integer, invalid-empty-profile-offer, invalid-duplicate-profile-offer,
invalid-base64-padding, invalid-base64-non-url-alphabet, invalid-base64-wrong-length,
invalid-fresh-binding-epoch, invalid-resume-reject-message,
invalid-leading-zero-call-ordinal, invalid-outcome-unknown-wire-error,
invalid-error-object-unknown-field, invalid-close-sequence, invalid-active-kind,
invalid-depth-limit-plus-one, invalid-string-byte-limit-plus-one,
invalid-member-name-byte-limit-plus-one, invalid-transport-message-byte-limit-plus-one
```

八个 old raw IDs tombstone，replacement 依次为：
`valid-call-with-unknown-tails -> valid-unary-call-with-unknown-tails`；
`valid-safe-error -> valid-safe-error-without-details + invalid-error-details-field`；
`valid-number-domain -> valid-unary-number-domain`；
`valid-application-args-depth-limit -> valid-unary-application-args-depth-limit`；
`valid-array-element-limit -> valid-unary-array-element-limit`；
`invalid-reserved-then-method -> invalid-reserved-then-member`；
`invalid-application-args-depth-limit-plus-one -> invalid-unary-application-args-depth-limit-plus-one`；
`invalid-array-element-limit-plus-one -> invalid-unary-array-element-limit-plus-one`。新 action-specific phase/scope/
ACK/effects 只能属于新 raw Case identity。Canonical audit Case 为
`evidence.ledger.legacy-raw-verdict-identity`，selector
`runtime:evidence.ledger.legacy-raw-verdict-identity`，covers
`RPC-EVIDENCE-001, RPC-EVIDENCE-004`。

14 个 legacy transcript scenario 全 tombstone；replacement 是给原 scenario 分别加前缀
`unary-`（前七个）或 `session-`（后七个），其中最后一个精确改名为
`session-counter-exhaustion-protected-tail`。其 42 个旧 step selector 逐项使用相同 semantic step slug
映射到 replacement scenario；输入全集由旧 transcript hash
`3942fc376acffca57f6ba0a8a22df2cbdf6347ef5cdf043d270c8932a83e4f98` 锁定，映射函数对 42 个 selector
必须恰好一一对应、零剩余。五个 KAT IDs
`rfc8785-section-3.2.2`, `rfc8785-section-3.2.3-utf16-property-order`,
`rfc5869-appendix-a.1`, `rfc4231-section-4.2-test-case-1`,
`husky-di-rpc-1-proof-transcript` preserve 原 input/verdict；schema `$id/$defs` 与测试标题不是 Case ID。

#### R2 — complete active proposition registry

Active set `A` 是上面的 153 个 preserved ID 与下列 190 个 new/replacement ID 的不相交 union，故
`|A| = 343`。下表中每个分号分隔的编号子句只属于对应 exact ID；没有 range-owned composite truth。

| Family | Exact active propositions |
| --- | --- |
| `VALUE-007..008` | `007` unary args/results与stream args/items共用无wire-details的Application Value domain；`008`共同value hard limits |
| `DESC-006..013` | `006` nonempty exact mixed `members`/四kind及`methods` negative；`007` stream method raw return是direct `Observable<Item>`；`008` data/method receiver与data-Observable expose-time capture、getter per-Admission read；`009` exact service/member namespace、`then`保留、Route Capture及cleanup/re-expose线性化；`010` stream property required/readonly/`$`/direct Observable；`011` stream参数不得含 Observable/AbortSignal/PromiseLike/AsyncIterable/ReadableStream capability；`012` item/result不得含Promise-like/nested Observable/AsyncIterable/ReadableStream/`any`/`never`；`013` application Subject只暴露Observable |
| `STATE-004` | 六状态 peer transition与sticky closed，不含Group eligibility |
| `CALL-010..015` | `010` frozen/null-prototype/exact/non-thenable single-peer facade、captured receiver与stable member identity；`011` resolve/call/property-read/Observable-retain在recovering/draining/closed时state-neutral；`012` unary AbortSignal check-register-recheck；`013` unary DNE/outcome-unknown/canceled guarantees；`014` unary unknown-member/handler-failed scope与diagnostic redaction；`015` closed `RpcException` object/code/cause及enum exact contract |
| `API-007..008` | `007` installed public `resolveAll`/RemoteServiceGroup/RpcPeerResult absence，无alias/shim/replacement facade；`008`只承诺frozen peers、replay-latest peers$、stable peer与independent child work |
| `STREAM-001..015` | `001`每subscribe独立cold root；`002` Subscriber→state→snapshot→Pending→Local→Outgoing顺序与DNE cutoff；`003` caller observation/Logical Stream/Source Subscription/terminal/teardown/retirement分离；`004` fixed/security/sequence后route前incoming reservation；`005` Source Job/acquisition/exactly-once sync subscribe/zero-subscription/no retry；`006`仅规定public trace可见的state-before-effect、同一Logical Stream downstream Observer callback depth≤1、serial non-overlap和terminal fencing；`007` first-terminal-wins/order/safe failure/Observer throw不回滚；`008` explicit unsubscribe的cancel authority；`009` terminal commit立即fence；`010` Recovery保留identity/source且永久retention loss不重订；`011` explicit child composition独立；`012` teardown至多一次；`013` onReleased在真实teardown settle后；`014` Source ownership在onReleased后退休；`015` retained evidence不保留application object/closure |
| `FLOW-001..006` | `001` credit仅item-count admission；`002` W=1与durable positive grant后subscribe；`003` re-arm/equal/higher/lower horizon规则；`004` no-credit或ordinary shortage选择overflow且causing emission非Item；`005` normalization/unavailable/over-credit fault分类；`006` earlier item order及protected convergence capacity |
| `LEDGER-006..008` | `006` direction-local Stream Identity与continuous nonreuse ordinal；`007` Item Ordinal/terminal boundary；`008` retained evidence、payload/backing及side-local retirement分离 |
| `ACK-008..015` | `008`仅per-direction cumulative Message Receipt ACK；`009` start disposition receipt；`010` duplicate先处理reverse ACK及directional GC；`011` item disposition receipt；`012` credit仅证明absolute horizon accepted；`013` cancel intent disposition；`014` terminal receipt只覆盖sending direction及更低seq，reverse self-contained evidence可在active root退休后存在；`015` ACK可在effect前dirty/piggyback |
| `RECOVERY-007..009` | `007` finite frozen replacement barrier；`008`不复制backlog/payload、不重订且Connection fence优先；`009` continuation generation authority复检 |
| `SEC-010..011` | `010`原cursor/barrier/Protected Transport/Binding Epoch且无per-record HMAC；`011` lost ACK/old binding/bootstrap-or-resume wrong proof/Recovery terminal security evidence |
| `VALID-008..010` | `008` fresh expected stream fixed→security→binding→schema→sequence→ordinal→reservation→route分类；`009` post-G仍先验证，仅valid expected start走protected unavailable；`010` unknown service/member/kind/handler exact classification |
| `POLICY-005..009` | `005` N replacement及default/range/no alias；`006` T及Connector/Acceptor derivation；`007` S/ST derivation；`008` closed policy inventory；`009`完整cross-field validation |
| `RESOURCE-007..020` | `007`完整work/stream/evidence/slot/reserve budget表；`008`ordinary/protected/aggregate原子转移；`009`Local Admission原子slots/args/Receive Slot；`010`identity-free Pending Outgoing条件；`011`Subscriber slots到terminal projection/suppression commit；`012`incoming pre-route reservation；`013`Source Job复用permits/RR；`014`Item Admission consume/normalize/bytes/seq且不保留第二raw；`015`Recovery不建第二backlog；`016`同一Receive Slot在armed→item→effect→re-arm原位循环；`017`outstanding grant持续由同一slot backing；`018`unsubscribe不提前释放；`019`credit ACK不释放且re-arm不release/reacquire；`020`cancel ACK不释放 |
| `SCHEDULE-007..009` | `007`bootstrap/barrier/control-progress bounded alternation；`008`unary virtual participant与每ready stream持续RR；`009`ACK/probe coalesce及blocked identity isolation |
| `COUNTER-005..006` | `005`MAX/L/H/F/PT/PC protected-tail与never-wrap；`006`Stream/Item/Credit maxima exact behavior |
| `SHUTDOWN-011..017` | `011`G与Local Admission ordering；`012`Route Capture-before-G/Remote Admission-after-G及valid protected rejection；`013`graceful已admit progress；`014`完整drain predicate；`015`non-stream G roots；`016`draining binding-loss stream convergence；`017`Remote Close stream convergence |
| `CLOSE-004..007`, `CLEANUP-005`, `LIFE-003` | `CLOSE-004` F batch fence/winner/unlink/Direct Close/effects；`005`F outcome matrix；`006`reentrant exact order；`007`recovery/G/Remote Close scopes；`CLEANUP-005` teardown/Observer failure与absolute deadlines；`LIFE-003` generation authority、authoritative terminal/telemetry/F tail及same Promise |
| `EVENT-008..018` | `008`owning Remote Observable vs non-owning observations；`009`side-local pair/cutoffs；`010`closed stream event metadata/outcome union；`011`outgoing committed disposition count；`012`payload/redaction/saturation；`013`serialized non-reentrant FIFO；`014`publication generation recheck；`015`incoming terminal-boundary/admitted count；`016`overflow-causing emission不计；`017`duration止于terminal/finish outcome commit；`018`仅规定source-finished等待teardown settle，不拥有duration命题 |
| `EVENT-021..023` | `021`call pair；`022`call canonical member metadata；`023`call closed outcome union |
| `SPI-013..022` | `013`stream request/reserve/commit/start/cancel seam；`014`reserveItem/reserveTerminal disposition-before-effect；`015`reserveEmission在raw前；`016`finish同步fence；`017`capability最小化与Recovery/G/F；`018`onReleased在teardown settle后；`019`onReleased exactly once；`020`release控制Source retirement/drain；`021`incoming handler/unknown commit effect；`022`closed incoming unary terminal union |
| `TRANSPORT-013`, `CONFORMANCE-004..005` | `TRANSPORT-013`三成员stream-unaware seam不变；`CONFORMANCE-004` Protocol stream/broken diagnostics；`005` grandfather Adapter加bounded Connection load及binding-failure ownership |
| `WIRE-016..026` | `016`pre-1.0同profile一次性replacement；`017`final semantic union；`018`member vocabulary与directional identities；`019`W=1 table；`020`closed terminal/error matrix；`021`ingress/fault scope；`022`retired identity late controls；`023`exact envelopes/nodes；`024`G/F/Close wire state；`025`tagged open tails+nested closed error；`026`final `/1` evolution rule |
| `CORPUS-005..012` | `005`four assets atomic replacement/no legacy sibling；`006`schema/raw final grammar与limits；`007`stateful action/effect transcripts；`008`independent KAT provenance/security actions；`009`all resource boundary triplets；`010`complete offline metaschema closure；`011`每raw经A production Codec/Protocol；`012`每KAT/security action经independent oracle与A production seam cross-check |
| `EVIDENCE-004..015` | `004`legacy requirement/case verdict ledger；`005`exact selector uniqueness；`006`evidence classes/N-A reasons；`007`negative baseline/failure owner/no throwaway acceptance；`008`canonical covers nonempty active IDs；`009`case/matrix inverse；`010`canonical/support-only classification；`011`zero incomplete；`012`canonical proof只读public seam；`013`active proposition registry complete；`014`all node references resolve once且分类互斥；`015`cases/covers/evidence/supports arrays duplicate-free |
| `PKG-010..015` | `010`root exact 18/30；`011`protocol exact 6/51；`012`transport exact 0/3；`013`four JSON subpaths；`014`conformance exact 4/8；`015`只拥有no-helper-exports，不拥有四manifest |
| `RELEASE-006..025` | `006`clean actual tgz；`007`Node ESM/CJS；`008`installed declarations strict；`009`DOM-only+three-browser既定范围；`010`ESM exact runtime；`011`two-worktree canonical tree；`012`version后完整workflow；`013`CJS exact runtime；`014`Compiler API declarations；`015`root+3 code positive conditions；`016`NodeNext mts；`017`NodeNext cts static require；`018`每legacy name独立negative；`019`A exact allowlist；`020`receipt fields；`021`exact Node v23.6.0 lane；`022`A pnpm/npm parity；`023`authoritative/tested/published A SHA equality；`024`zero incomplete；`025`JCS registry/metaschema/oracle provenance binding |
| `MIGRATION-001..004` | `001`old Session cutover；`002`无replacement Group semantics；`003`explicit peers.map/Promise/RxJS evidence；`004`删除仅服务旧 Group route的artifact/route但允许服务其他功能的generic batching/fan-out/reservation/group helper |
| `DOC-001..006` | README、PROTOCOL、TRANSPORT、architecture source+render、CHANGELOG/Changeset、examples各自独立命题 |

`RPC-EVIDENCE-013` 的 canonical Case 为 `evidence.registry.active-proposition-complete`，selector
`runtime:evidence.registry.active-proposition-complete`。它逐 ID 比较 `A` 与 registry key set、解析每个
proposition bytes，且显式把 `methods` negative放入 `RPC-DESC-006` input；不另立主席已驳回的 Case。

#### R3 — closed graph, complete matrix and Case metadata

节点域只有 `R` active Requirement、`C` canonical Case、`S` support-only Case、`E` exact Evidence。

```text
keys(activeRegistry) = R = keys(matrix)
|R| = |matrix| = 343
forall r in R: exactly one matrix[r] and matrix[r].cases != [] and matrix[r].cases subset C
forall c in C: c.covers != [] and c.covers subset R
forall c in C: c.covers = {r | c.id in matrix[r].cases}
forall e in E: e.cases = {c | e.id in c.evidence}
forall c in C: c.evidence = {e | c.id in e.cases}
forall s in S: s.covers = [] and s.supports != [] and s.supports subset C
every referenced id resolves exactly once to one mutually-exclusive node class
every cases/covers/evidence/supports array is duplicate-free
retired IDs occur only in tombstones
```

每个 active `R=RPC-FAMILY-NNN` 机械实例化两条 Case，因而实现者没有命名自由：

```text
spec(R).id = specification.rpc-family-nnn
verify(R).id = <profile-prefix>.requirement.rpc-family-nnn
matrix[R].cases = duplicateFree([spec(R), verify(R)] + direct[R])
```

两类 Case 的完整 metadata 模板为：`classification=canonical`；`covers=[R]`；`publicSeam`由下表 profile
固定；`input=activeRegistry[R]中命题的最小正例及逐独立条件单坐标反例`；`expected=命题全文`；
`failureOwner=profile.owner`；`status=verified` 仅当全部 exact evidence为同一 production tree或同一 A tgz
PASS。`spec(R).evidence=[specification:R]`；`verify(R).evidence`按 profile 生成。Preserved profile `L`
额外逐条读取上述 hash-locked `REQUIREMENTS.md` row；其中第 n 个 evidence reference 实例化
`legacy.<kind-lower>.family-nnn.<n两位>` Case，保留原 input/verdict，禁止让旧 locator orphan。
Evidence selector按原kind确定为 `RT/RP/IR -> runtime:<case-id>`、`TY -> type:<case-id>`、
`PC -> protocol:<case-id>`、`AC -> transport:<case-id>`、`PK -> package:<case-id>@<A-tgz-sha256>`、
`BR -> browser:<case-id>@<engine>`、`RW -> raw:rpc1:<case-id>`、`TX -> transcript:rpc1:<case-id>#verified`、
`KA -> security:rpc1:<case-id>`；原`path::title`完整保存在Evidence `assetLocator`，不再作为node identity。

| Profile | prefix / public seam / owner | Exact evidence generated for `verify(R)` |
| --- | --- | --- |
| `L` | `runtime.legacy` / baseline public seam / baseline owner | baseline row中全部 reference按文档顺序实例化；不得只保留目录或标题字符串 |
| `I` | `type` / installed declarations与public facade / Framework | `type:<verify-id>`, `runtime:<verify-id>`, `package:<verify-id>@<A-tgz-sha256>` |
| `R` | `runtime` / public facade+real RxJS+Protocol/Transport seam / Framework | `runtime:<verify-id>`, `protocol:<verify-id>`, `transcript:rpc1:requirement-<rpc-id-lower>#verified` |
| `P` | `protocol` / installed public Protocol seam / Protocol | `protocol:<verify-id>`, `runtime:<verify-id>`, `transcript:rpc1:requirement-<rpc-id-lower>#verified` |
| `T` | `transport` / three-member Adapter seam / Transport Adapter | `transport:<verify-id>`, `package:<verify-id>@<A-tgz-sha256>` |
| `W` | `raw` / installed A Codec+Protocol seam / built-in Protocol/corpus | `raw:rpc1:requirement-<rpc-id-lower>`, `protocol:<verify-id>`, `transcript:rpc1:requirement-<rpc-id-lower>#verified` |
| `C` | `runtime` / four corpus assets+independent oracle+A Protocol / built-in corpus | `schema:rpc1:`, `raw:rpc1:requirement-<rpc-id-lower>`, `transcript:rpc1:requirement-<rpc-id-lower>#verified`, `security:rpc1:requirement-<rpc-id-lower>`, `package:<verify-id>@<A-tgz-sha256>` |
| `E` | `runtime` / evidence registries / release evidence | `runtime:<verify-id>` |
| `K` | `package` / installed A tgz / package-release | `type:<verify-id>`, `runtime:<verify-id>`, `package:<verify-id>@<A-tgz-sha256>` |
| `D` | `doc` / committed and packed docs/examples / docs-migration | `doc:<verify-id>@<commit>`, `package:<verify-id>@<A-tgz-sha256>` |

完整 matrix profile assignment 是：153 个 preserve IDs逐项为 `L`；new IDs 按以下显式、无 range 宏的
family sets分配，且每个 listed ID形成独立 row：

```text
I = {RPC-VALUE-007,RPC-VALUE-008,RPC-DESC-006,RPC-DESC-007,RPC-DESC-008,RPC-DESC-009,
RPC-DESC-010,RPC-DESC-011,RPC-DESC-012,RPC-DESC-013,RPC-STATE-004,RPC-CALL-010,
RPC-CALL-011,RPC-CALL-012,RPC-CALL-013,RPC-CALL-014,RPC-CALL-015,RPC-API-007,RPC-API-008,
RPC-POLICY-005,RPC-POLICY-006,RPC-POLICY-007,RPC-POLICY-008,RPC-POLICY-009}
R = {RPC-STREAM-001,RPC-STREAM-002,RPC-STREAM-003,RPC-STREAM-004,RPC-STREAM-005,
RPC-STREAM-006,RPC-STREAM-007,RPC-STREAM-008,RPC-STREAM-009,RPC-STREAM-010,
RPC-STREAM-011,RPC-STREAM-012,RPC-STREAM-013,RPC-STREAM-014,RPC-STREAM-015,
RPC-FLOW-001,RPC-FLOW-002,RPC-FLOW-003,RPC-FLOW-004,RPC-FLOW-005,RPC-FLOW-006,
RPC-RESOURCE-007,RPC-RESOURCE-008,RPC-RESOURCE-009,RPC-RESOURCE-010,RPC-RESOURCE-011,
RPC-RESOURCE-012,RPC-RESOURCE-013,RPC-RESOURCE-014,RPC-RESOURCE-015,RPC-RESOURCE-016,
RPC-RESOURCE-017,RPC-RESOURCE-018,RPC-RESOURCE-019,RPC-RESOURCE-020,
RPC-SHUTDOWN-011,RPC-SHUTDOWN-012,RPC-SHUTDOWN-013,RPC-SHUTDOWN-014,RPC-SHUTDOWN-015,
RPC-SHUTDOWN-016,RPC-SHUTDOWN-017,RPC-CLOSE-004,RPC-CLOSE-005,RPC-CLOSE-006,RPC-CLOSE-007,
RPC-CLEANUP-005,RPC-LIFE-003,RPC-EVENT-008,RPC-EVENT-009,RPC-EVENT-010,RPC-EVENT-011,
RPC-EVENT-012,RPC-EVENT-013,RPC-EVENT-014,RPC-EVENT-015,RPC-EVENT-016,RPC-EVENT-017,
RPC-EVENT-018,RPC-EVENT-021,RPC-EVENT-022,RPC-EVENT-023}
P = {RPC-LEDGER-006,RPC-LEDGER-007,RPC-LEDGER-008,RPC-ACK-008,RPC-ACK-009,
RPC-ACK-010,RPC-ACK-011,RPC-ACK-012,RPC-ACK-013,RPC-ACK-014,RPC-ACK-015,
RPC-RECOVERY-007,RPC-RECOVERY-008,RPC-RECOVERY-009,RPC-SCHEDULE-007,RPC-SCHEDULE-008,
RPC-SCHEDULE-009,RPC-COUNTER-005,RPC-COUNTER-006,RPC-SPI-013,RPC-SPI-014,RPC-SPI-015,
RPC-SPI-016,RPC-SPI-017,RPC-SPI-018,RPC-SPI-019,RPC-SPI-020,RPC-SPI-021,RPC-SPI-022,
RPC-CONFORMANCE-004,RPC-CONFORMANCE-005}
T = {RPC-TRANSPORT-013}
W = {RPC-SEC-010,RPC-SEC-011,RPC-VALID-008,RPC-VALID-009,RPC-VALID-010,
RPC-WIRE-016,RPC-WIRE-017,RPC-WIRE-018,RPC-WIRE-019,RPC-WIRE-020,RPC-WIRE-021,
RPC-WIRE-022,RPC-WIRE-023,RPC-WIRE-024,RPC-WIRE-025,RPC-WIRE-026}
C = {RPC-CORPUS-005,RPC-CORPUS-006,RPC-CORPUS-007,RPC-CORPUS-008,RPC-CORPUS-009,
RPC-CORPUS-010,RPC-CORPUS-011,RPC-CORPUS-012}
E = {RPC-EVIDENCE-004,RPC-EVIDENCE-005,RPC-EVIDENCE-006,RPC-EVIDENCE-007,
RPC-EVIDENCE-008,RPC-EVIDENCE-009,RPC-EVIDENCE-010,RPC-EVIDENCE-011,RPC-EVIDENCE-012,
RPC-EVIDENCE-013,RPC-EVIDENCE-014,RPC-EVIDENCE-015}
K = {RPC-PKG-010,RPC-PKG-011,RPC-PKG-012,RPC-PKG-013,RPC-PKG-014,RPC-PKG-015,
RPC-RELEASE-006,RPC-RELEASE-007,RPC-RELEASE-008,RPC-RELEASE-009,RPC-RELEASE-010,
RPC-RELEASE-011,RPC-RELEASE-012,RPC-RELEASE-013,RPC-RELEASE-014,RPC-RELEASE-015,
RPC-RELEASE-016,RPC-RELEASE-017,RPC-RELEASE-018,RPC-RELEASE-019,RPC-RELEASE-020,
RPC-RELEASE-021,RPC-RELEASE-022,RPC-RELEASE-023,RPC-RELEASE-024,RPC-RELEASE-025,
RPC-MIGRATION-001,RPC-MIGRATION-002,RPC-MIGRATION-003,RPC-MIGRATION-004}
D = {RPC-DOC-001,RPC-DOC-002,RPC-DOC-003,RPC-DOC-004,RPC-DOC-005,RPC-DOC-006}
```

`direct[R]` 是下面 Case metadata 表的 `covers` 逆投影；未列出的 row仍拥有上述两条机械 Case，不是
missing。所有行、Case、selector、edge在 receipt中必须展开为 arrays，不得保留 profile/range shorthand。

| Canonical Case | covers | exact selector | Independent expected truth |
| --- | --- | --- | --- |
| `evidence.registry.active-proposition-complete` | `RPC-EVIDENCE-013` | `runtime:evidence.registry.active-proposition-complete` | registry keys/propositions恰为343 active IDs |
| `evidence.graph.all-node-references-resolve` | `RPC-EVIDENCE-014` | `runtime:evidence.graph.all-node-references-resolve` | 每个reference恰解析一次且node class互斥 |
| `evidence.graph.edge-arrays-duplicate-free` | `RPC-EVIDENCE-015` | `runtime:evidence.graph.edge-arrays-duplicate-free` | 四类edge arrays均无duplicate |
| `evidence.graph.case-matrix-inverse` | `RPC-EVIDENCE-009` | `runtime:evidence.graph.case-matrix-inverse` | requirement↔case与case↔evidence均双向等集 |
| `package.module.no-helper-exports` | `RPC-PKG-015` | `package:package.module.no-helper-exports@<A-tgz-sha256>` | no-helper仅此owner；manifest分别属于PKG-010/011/012/014 |
| `runtime.event.duration-terminal-cutoff` | `RPC-EVENT-017` | `runtime:runtime.event.duration-terminal-cutoff` | duration止于terminal commit |
| `runtime.event.source-finished-after-teardown` | `RPC-EVENT-018` | `runtime:runtime.event.source-finished-after-teardown` | finished等待teardown settle，不拥有duration命题 |
| `type.enum.rpc-exception-code-exact-members` | `RPC-CALL-015` | `type:type.enum.rpc-exception-code-exact-members` | declaration member names/string values exact |

Case registry必填 `id,classification,covers,publicSeam,input,expected,failureOwner,evidence,status`；Evidence
registry必填 `selector,class,cases,artifactDigest,runnerDigest,status`。`verified` 只接受当前 production tree
或同一 installed A tgz；任何 unknown/orphan/partial/planned/missing/skipped/todo/only/flaky、重复edge或
corpus自报covers都BLOCK。
后文所有direct Case未重复写出的metadata固定为：`classification=canonical`，`covers/selector/input/expected`
取所在表，`publicSeam=selector所指installed/public seam`，`failureOwner`按type/runtime=Framework、protocol/
raw/transcript/security=built-in Protocol/corpus、transport=Adapter、package=package-release、doc=docs-migration，
`status`服从同一zero-incomplete规则。

#### R4 — declaration-side enum exactness

`RpcExceptionCodeEnum` 的 runtime 与 declaration 是两个独立 truth condition：

```text
canceled="canceled"
unavailable="unavailable"
outcomeUnknown="outcome-unknown"
handlerFailed="handler-failed"
unknownService="unknown-service"
unknownMember="unknown-member"
overflow="overflow"
protocol="protocol"
```

`runtime.enum.rpc-exception-code-exact-members` 用 installed A 的 namespace own names/values证明runtime
exact set；`type.enum.rpc-exception-code-exact-members` 用 TypeScript Compiler API 从 installed emitted
`.d.ts` 读取 enum declaration，分别比较 member name set、string initializer set和逐项mapping，任何额外
`legacyFoo` 或错误value均失败。后者 selector 固定为
`type:type.enum.rpc-exception-code-exact-members`，两者都 direct-cover `RPC-CALL-015`。
`type.descriptor.mixed-members` 与 `runtime.descriptor.invalid-exact-shapes` 的 input显式含 legacy
`methods:` negative；不新增主席驳回的重复 Case。

#### R5 — final worktree-A tgz is the sole artifact authority

唯一 authority 是 clean detached worktree A 从最终 versioned commit 的同一 built tree 产生的一份
`A_TGZ`。RC tarball不再存在。Worktree B只证明 canonical tar tree reproducibility，永不进入 acceptance、
receipt或publish。

在 A 的同一 built tree 上依次运行 `npm pack --dry-run --json --ignore-scripts` 与一次
`pnpm pack --ignore-scripts`；npm normalized file list、A tgz canonical tree和已review的 literal allowlist
三者 exact相等。Allowlist逐 path记录`path,type,mode,contentSha256`，零glob/零placeholder；其 final commit
必须逐项列出package metadata/docs、四个JSON assets和实际dist entries。Ticket14不指定dist布局，但release
commit未把最终布局展开成literal entries即失败。Packed manifest不得含`workspace:*`，A必须由npm在isolated
consumer安装成功。

所有 Node minimum-lane Case 必须在 exact `process.version === "v23.6.0"` 运行；较新lane不能替代。
Node ESM、CJS、NodeNext `.mts`、NodeNext `.cts` static require-condition、Compiler API inventories、DOM-only
compile、Chromium/Firefox/WebKit、four-JSON、Protocol/Adapter/corpus都只读取同一个 installed `A_TGZ`。
Receipt的 `artifact.authoritativeTgzSha256`, `artifact.testedTgzSha256`,
`artifact.publishedTgzSha256` 必须最终都等于 `sha256(A_TGZ)`；publish后从registry重新下载并逐byte SHA
相等，才能finalize receipt/tag/release metadata。

| Requirement | Canonical Case | Exact selector / expected |
| --- | --- | --- |
| `RPC-RELEASE-019` | `package.artifact.final-tgz-exact-allowlist` | `package:package.artifact.final-tgz-exact-allowlist@<A-tgz-sha256>`；A tree==literal allowlist |
| `RPC-RELEASE-022` | `package.artifact.final-tgz-pnpm-npm-parity` | `package:package.artifact.final-tgz-pnpm-npm-parity@<A-tgz-sha256>`；npm dry-run==A tree |
| `RPC-RELEASE-021` | `package.consumer.node-minimum-v23-6-0` | `package:package.consumer.node-minimum-v23-6-0@<A-tgz-sha256>`；exact v23.6.0 |
| `RPC-RELEASE-020` | `package.release.receipt-fields-complete` | `package:package.release.receipt-fields-complete@<A-tgz-sha256>`；全部字段存在且digest闭合 |
| `RPC-RELEASE-023` | `package.release.tested-published-sha-equal` | `package:package.release.tested-published-sha-equal@<A-tgz-sha256>`；三个SHA全等 |
| `RPC-RELEASE-024` | `package.release.zero-incomplete` | `package:package.release.zero-incomplete@<A-tgz-sha256>`；failed/partial/planned/missing/skipped/todo/only/flaky全0 |

Final fixed allowlist至少逐项包含下列non-dist entries，且release commit把每个actual dist entry追加为
literal path（无`dist/**`或自动accept）：

```text
package/package.json
package/LICENSE
package/README.md
package/CHANGELOG.md
package/docs/SPECIFICATION.md
package/docs/REQUIREMENTS.md
package/docs/PROTOCOL.md
package/docs/TRANSPORT.md
package/docs/ARCHITECTURE.drawio
package/docs/ARCHITECTURE.png
package/wire/husky-di-rpc-1/schema.json
package/wire/husky-di-rpc-1/raw-vectors.json
package/wire/husky-di-rpc-1/transcripts.json
package/wire/husky-di-rpc-1/known-answer-vectors.json
```

四份 PASS-locked module manifest自封闭重载如下。Root runtime exact 18：

```text
RpcAcceptorListenerStopReasonEnum, RpcCallStatusEnum, RpcCloseOutcomeEnum, RpcCloseReasonEnum,
RpcConnectorReconnectionAttemptFailureStageEnum, RpcConnectorReconnectionEventTypeEnum,
RpcConnectorReconnectionStopReasonEnum, RpcEventDirectionEnum, RpcEventTypeEnum, RpcException,
RpcExceptionCodeEnum, RpcStateStatusEnum, RpcStreamStatusEnum, createRemoteServiceDescriptor,
createRpcAcceptor, createRpcConnector, createRpcConnectorReconnection, createRpcProtocol
```

Root type-only exact 30：

```text
CreateRpcConnectorReconnectionOptions, IRemoteServiceDescriptor, IRpcAcceptor, IRpcAcceptorAdapter,
IRpcApplicationRecord, IRpcConnection, IRpcConnector, IRpcConnectorAdapter, IRpcConnectorReconnection,
IRpcPeer, IRpcProtocol, IRpcProtocolRuntimePolicy, RpcAcceptorListenerState, RpcAcceptorOptions,
RpcAcceptorRuntimePolicyOptions, RpcAcceptorState, RpcApplicationValue, RpcCallFailure,
RpcConnectorAdapterFactory, RpcConnectorConnectOptions, RpcConnectorOptions,
RpcConnectorReconnectionEvent, RpcConnectorReconnectionPolicyOptions, RpcConnectorReconnectionState,
RpcConnectorRuntimePolicyOptions, RpcConnectorState, RpcEvent, RpcPeerState, RpcProtocolFaultReason,
RpcSessionCloseReason
```

`/protocol` runtime exact 6：

```text
RpcCallTerminalTypeEnum, RpcCloseReasonEnum, RpcExceptionCodeEnum, RpcIncomingCallKindEnum,
RpcProtocolSessionTransitionTypeEnum, createRpcProtocol
```

`/protocol` type-only exact 51：

```text
IRpcApplicationArgumentsSnapshot, IRpcApplicationRecord, IRpcApplicationSnapshot, IRpcConnection,
IRpcProtocol, IRpcProtocolAcceptorHost, IRpcProtocolAcceptorRuntime, IRpcProtocolConnectorHost,
IRpcProtocolConnectorRuntime, IRpcProtocolHost, IRpcProtocolIncomingCall,
IRpcProtocolIncomingCallRequest, IRpcProtocolIncomingCallReservation, IRpcProtocolIncomingHandlerCall,
IRpcProtocolIncomingSourceReservation, IRpcProtocolIncomingStream,
IRpcProtocolIncomingUnknownStreamReservation, IRpcProtocolInvocation, IRpcProtocolInvocationRequest,
IRpcProtocolInvocationReservation, IRpcProtocolInvocationSink, IRpcProtocolProjection,
IRpcProtocolRoleRuntime, IRpcProtocolRuntimePolicy, IRpcProtocolSession, IRpcProtocolSessionHost,
IRpcProtocolSourceEmissionReservation, IRpcProtocolSourceSink, IRpcProtocolStream,
IRpcProtocolStreamReservation, IRpcProtocolSubscriberSink, IRpcRetainedBytesReservation,
RpcApplicationValue, RpcCallFailure, RpcCallOutcome, RpcHandlerOutcome, RpcIncomingFailure,
RpcIncomingStreamTerminal, RpcIncomingTerminal, RpcProtocolFaultReason,
RpcProtocolIncomingCallReservation, RpcProtocolIncomingStreamReservation, RpcProtocolSessionTransition,
RpcProtocolSessionTransitionCloseReason, RpcProtocolStreamRequest, RpcSessionCloseReason,
RpcSourceTerminal, RpcStreamFailure, RpcStreamItemEffect, RpcStreamOutcome, RpcUnknownCallFailure
```

`/transport` runtime exact 0、type-only exact 3：

```text
IRpcAcceptorAdapter, IRpcConnectorAdapter, IRpcConnection
```

`/conformance` runtime exact 4：

```text
RpcConformanceStatusEnum, runRpcAcceptorAdapterConformance,
runRpcConnectorAdapterConformance, runRpcProtocolConformance
```

`/conformance` type-only exact 8：

```text
IRpcAcceptorAdapterConformanceFixture, IRpcAdapterConformanceRemote,
IRpcConnectorAdapterConformanceFixture, IRpcProtocolConformanceFixture,
RpcConformanceCaseResult, RpcConformanceFailure, RpcConformanceOptions, RpcConformanceReport
```

因此计数仍精确为 root `18/30`、`/protocol` `6/51`、`/transport` `0/3`、`/conformance` `4/8`；
本轮唯一身份修复是
`RPC-PKG-012`只拥有transport、`RPC-PKG-014`只拥有conformance、`RPC-PKG-015`只拥有no-helper-exports。
DOM/三浏览器范围不扩到每个specialist browser runtime。

#### R6 — offline corpus closure, A-production execution and JCS receipt

Nonpublic precommitted corpus manifest 与 tree-external binding envelope仍是两层、无self-hash结构。新增
`metaschemaClosure` 是完整、offline、duplicate-free 的 `canonical URI -> SHA-256` map：包含Draft
2020-12 root metaschema、它递归引用的全部 vocabulary resources和validator artifact bytes/version。解析到
未知URI、URI alias碰撞、digest不符或任何network attempt均失败；只钉root metaschema不算closure。

每个 final raw Case都必须同时：由independent oracle验证exact bytes/verdict；再把同一bytes通过installed
`A_TGZ`公开`createRpcProtocol()`和受控`IRpcConnection.message$/send/close`驱动production Codec/Protocol，
比较actual record/fault、phase、scope、ACK与application effects。每个KAT/security action同样由独立RFC/
reference oracle重算，并通过同一A production Protocol/security action seam交叉验证。旧44 raw Case在这里
仍只比较其原verdict；任何额外action verdict使用新Case identity。

Receipt canonical form固定为 RFC 8785 JCS UTF-8 bytes；hash的是这些bytes，不是pretty JSON或host
object order。除R5字段外必须含：

```text
caseResultRegistrySha256
evidenceRegistrySha256
metaschemaClosureSha256
validatorArtifactSha256
rawOracleSha256, rawProductionRunnerSha256
katOracleSha256, katProductionRunnerSha256
transcriptOracleSha256, transcriptProductionRunnerSha256
jcsImplementationProvenance = {source, version, artifactSha256, independentKatSelector}
```

| Requirement | Canonical Case | Exact selector / expected |
| --- | --- | --- |
| `RPC-CORPUS-010` | `runtime.corpus.metaschema-offline-closure` | `runtime:runtime.corpus.metaschema-offline-closure`；recursive closure完整且禁网 |
| `RPC-CORPUS-011` | `protocol.package.raw-production-codec-execution` | `package:protocol.package.raw-production-codec-execution@<A-tgz-sha256>`；每raw经A production seam |
| `RPC-CORPUS-012` | `security.rpc1.production-kat-cross-check` | `security:rpc1:production-kat-cross-check`；每KAT/action independent+A双执行 |
| `RPC-RELEASE-025` | `package.release.receipt-registry-provenance-binding` | `package:package.release.receipt-registry-provenance-binding@<A-tgz-sha256>`；JCS及registry/metaschema/oracle digests闭合 |

Corpus内的`covers`不创设edge；runner只比较它与权威graph逆投影。Public JSON不增加revision field，不新增
public manifest subpath。

#### R7 — sustained fairness and separate failure variant

`protocol.stream.fairness-progress`（selector
`protocol:protocol.stream.fairness-progress`）只证明无失败的持续公平。Bootstrap和Recovery barrier已清空；
progress participants `U,A,B,C,D` 在`t0`同时ready并在每次被选择后的send settlement、peer cumulative ACK
和（A–D）next absolute credit注入完成后立即re-arm，因此在整个Case中持续同时ready。Initial rotation
固定 `U -> A -> B -> C -> D -> U`。

`X(r,p)` 被精确定义为：fixture在第`r`轮participant `p`选择前注入一个valid peer record
`m(r,p)`，使当前sending direction的cumulative Message Receipt ACK从`a-1`推进至`a`；`X(r,p)`就是唯一
dirty、可coalesce但不可省略的`ack(a)` control record。它不是unary result、stream terminal或虚构participant。
每个send Promise settle前不得出现下一send。每轮exact 10 sends如下，`r=1..8`，故共80次：

```text
S(10r-9)=X(r,U), S(10r-8)=U[r],
S(10r-7)=X(r,A), S(10r-6)=A[r],
S(10r-5)=X(r,B), S(10r-4)=B[r],
S(10r-3)=X(r,C), S(10r-2)=C[r],
S(10r-1)=X(r,D), S(10r)=D[r]
```

八轮逐轮participant projection必须恰为：

```text
R1 U1 A1 B1 C1 D1
R2 U2 A2 B2 C2 D2
R3 U3 A3 B3 C3 D3
R4 U4 A4 B4 C4 D4
R5 U5 A5 B5 C5 D5
R6 U6 A6 B6 C6 D6
R7 U7 A7 B7 C7 D7
R8 U8 A8 B8 C8 D8
```

每个X与progress selection都记录ready set、selected lane/identity、exact argv SHA、settlement、ACK/credit
injection和next ready set；S01证明control/progress同时ready时control-first，80次共同证明持续RR而非只一轮。
它direct-covers `RPC-SCHEDULE-007, RPC-SCHEDULE-008, RPC-CONFORMANCE-005`。

失败独立Case `protocol.stream.aggregate-bounded-load`（selector同prefix）使用A/B/C/D/U和stream X；X是
另一个Source identity，其无前置item的terminal control record `X-terminal(q3)`，D-terminal则被D1依赖阻塞。
Exact trace为：

| Send | Work | Required result |
| ---: | --- | --- |
| S01 | ACK control `ack(q0)` | control-first；settle前无S02 |
| S02 | `U-result(q1)` | progress initial rotation U |
| S03 | `A1(q2)` | RR A |
| S04 | `X-terminal(q3)` | independent control identity，D-terminal仍blocked |
| S05 | `B1(q4)` | ACK只推进到q4 |
| S06 | `C1(q5)` | q5 retained |
| S07 | `D1(q6)` | Adapter固定第七次invocation reject；binding fence/Recovery，非overflow |
| S08 | replacement replay `C1(q5)` | exact seq/body；barrier-first；Observer不重复 |
| S09 | replacement replay `D1(q6)` | exact seq/body；D-terminal随后ready |
| S10 | replacement `D-terminal(q7)` | exact winner/boundary；source不重订 |
| S11 | post-barrier `U-result-2(q8)` | barrier清空后首个new work，延续rotation U |
| S12 | post-barrier `A2(q9)` | next exact RR participant A |

`protocol.stream.adapter-rejection-is-binding-failure`独立断言S07 owner是binding/Recovery。既有五个mutant只保留
主席允许的mapping：over-credit→`protocol.stream.over-credit-session-fault`；terminal越item→
`protocol.stream.item-before-terminal`；Recovery重订→`protocol.stream.recovery-no-resubscribe`；terminal
ACK误退休→`protocol.receipt.terminal-direction-only`；Adapter rejection误投影overflow→
`protocol.stream.adapter-rejection-is-binding-failure`。不复制已有release Cases为额外mutants。

#### R8 — teardown partial order and callback scope

`runtime.stream.release-order`（`runtime:runtime.stream.release-order`）分别执行teardown return与throw，记录
distinct `teardown-enter` 和 `teardown-settle(return|throw)`：

```text
terminal-commit < teardown-enter < teardown-settle
teardown-settle < onReleased < source-ownership-retirement
teardown-settle < source-stream-finished
```

不规定`source-stream-finished`与`onReleased`或retirement之间的顺序。每个节点恰一次；throw只把安全incident
折入唯一finished，不改terminal winner。Case direct-covers
`RPC-STREAM-009,012,013,014`, `RPC-SPI-016,018,019,020`, `RPC-EVENT-018`。
`runtime.event.source-finished-after-teardown`只断言第三条；`runtime.event.duration-terminal-cutoff`独立断言
`RPC-EVENT-017`。`runtime.stream.reentrancy-order`的callback depth≤1仅统计**同一Logical Stream的downstream
Observer callbacks**；不同stream、event subscriber、Transport callback不被偷塞进该scope。

#### R9 — terminal ACK and in-place Receive Slot cycle

`protocol.receipt.terminal-direction-only`（
`protocol:protocol.receipt.terminal-direction-only`）输入为terminal ACK只覆盖Source→Subscriber direction，
reverse start/credit/cancel evidence尚未ACK。Expected是：covered direction可退休；reverse self-contained
start/credit/cancel evidence继续retained且`drain=false`，即使其side-local active root已经合法退休；Case禁止
把“active root必须仍在”当expected。它direct-covers `RPC-ACK-014, RPC-LEDGER-008`。

`runtime.resource.credit-ack-keeps-receive-slot`（
`runtime:runtime.resource.credit-ack-keeps-receive-slot`）记录一个allocation identity：grant、item admission、
effect、re-arm及credit ACK期间始终是同一Receive Slot；re-arm不得release/reacquire，credit/cancel ACK也不释放。
只有authoritative terminal或Session convergence证明future item不可能时才一次release。它direct-covers
`RPC-ACK-012, RPC-RESOURCE-016, RPC-RESOURCE-017, RPC-RESOURCE-019`；unsubscribe与cancel ACK分别由既有
`RPC-RESOURCE-018/020` Case独立覆盖。

#### R10 — complete post-G validation/poison phase matrix

下表每行是独立 canonical Case、独立selector和direct edge；所有Case在G后、F前执行：

| Case / selector | Input phase | Exact expected result | Covers |
| --- | --- | --- | --- |
| `transcript.rpc1.post-g-valid-current-binding-start-unavailable` / `transcript:rpc1:post-g-validation#valid-current-binding-start-unavailable` | valid fixed/security/current-binding/schema/seq/ordinal expected start | retained terminal `unavailable`, boundary/count 0、receipt retained；route lookup/source/method/getter/subscribe effects全0；Session不fault | `RPC-VALID-009, RPC-WIRE-024, RPC-SHUTDOWN-012` |
| `raw.rpc1.post-g-malformed-start` / `raw:rpc1:post-g-malformed-start` | malformed/schema | schema fault；无ACK、route/source或unavailable disposition | `RPC-VALID-009, RPC-WIRE-024` |
| `raw.rpc1.post-g-fixed-envelope-invalid` / `raw:rpc1:post-g-fixed-envelope-invalid` | well-formed JSON但fixed envelope invalid | fixed phase Session fault；无ACK/effects | `RPC-VALID-009, RPC-WIRE-021, RPC-WIRE-024` |
| `transcript.rpc1.post-g-stale-binding` / `transcript:rpc1:post-g-validation#stale-binding` | valid record from stale Binding Epoch | binding fence/no-op按既定stale rule；不route、不source、不生成unavailable | `RPC-VALID-009, RPC-SEC-011, RPC-WIRE-021` |
| `transcript.rpc1.post-g-stream-ordinal-reuse` / `transcript:rpc1:post-g-validation#stream-ordinal-reuse` | current binding reused retired Stream Ordinal | ordinal phase Session fault；无ACK/effects | `RPC-VALID-009, RPC-LEDGER-006, RPC-WIRE-021, RPC-WIRE-022, RPC-WIRE-024` |
| `transcript.rpc1.post-g-stream-ordinal-gap` / `transcript:rpc1:post-g-validation#stream-ordinal-gap` | current binding next Stream Ordinal gap | ordinal phase Session fault；与reuse不同Case | `RPC-VALID-009, RPC-LEDGER-006, RPC-WIRE-021, RPC-WIRE-024` |
| `security.rpc1.post-g-bootstrap-resume-wrong-proof` / `security:rpc1:post-g-bootstrap-resume-wrong-proof` | bootstrap/resume authentication wrong proof，不虚构active stream per-record proof | security/authentication reject先于任何post-G unavailable；existing retained stream不破坏 | `RPC-SEC-011, RPC-VALID-009` |

Sequence gap原有Case继续独立使用
`transcript:rpc1:post-g-validation#sequence-gap`并cover `RPC-WIRE-021, RPC-WIRE-024, RPC-VALID-009`；schema exact pointer、
raw与security selectors各解析唯一节点，不合并ordinal reuse/gap，也不把所有post-G inputs一律Session-fault。

#### R11 — legacy Group engine cleanup without layout prescription

`RPC-API-007` 保持installed public absence命题。新增 `RPC-MIGRATION-004`：最终release必须删除
`RemoteServiceGroup`、`RemoteGroupMethod`及**仅服务旧Group invocation路线**的artifact/dispatch route；不禁止
仍服务single-peer/stream/telemetry的新generic batching、fan-out、reservation算法或泛用`group` helper，不指定
文件、类名、目录或private symbol。

Canonical Case `package.cleanup.legacy-group-engine-absent`，selector
`package:package.cleanup.legacy-group-engine-absent@<A-tgz-sha256>`，covers `RPC-MIGRATION-004`。它从installed
A证明：所有public entry/construct/dispatch路径均不能建立旧Group aggregate invocation；tar/module graph无
只可达于该旧路线的artifact；同时shared machinery若由非Group public path可达不得误报。源码/构建图关键词
扫描只作support-only `runtime.support.legacy-group-route-scan`，`covers=[]`，
`supports=[package.cleanup.legacy-group-engine-absent]`，selector
`runtime:runtime.support.legacy-group-route-scan`，不能单独让Requirement变绿。

#### Authoritative A-artifact command draft

以下只是后续实现的稳定CLI contract，本票不执行：

```bash
set -euo pipefail
ARTIFACT_DIR="${RUNNER_TEMP:-/tmp}"
FINAL_COMMIT="$(git rev-parse HEAD)"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
case "$(node --version)" in v23.6.0) ;; *) exit 23 ;; esac

REPRO_ROOT="$(mktemp -d "$ARTIFACT_DIR/husky-remote-final.XXXXXX")"
git worktree add --detach "$REPRO_ROOT/a" "$FINAL_COMMIT"
git worktree add --detach "$REPRO_ROOT/b" "$FINAL_COMMIT"

for TREE in "$REPRO_ROOT/a" "$REPRO_ROOT/b"; do
  test ! -e "$TREE/packages/remote/dist"
  test -z "$(git -C "$TREE" ls-tree -r --name-only HEAD -- packages/remote/dist)"
  pnpm --dir "$TREE" install --frozen-lockfile --offline
  pnpm --dir "$TREE" exec turbo run build --filter='./packages/*' --force
  mkdir "$TREE/.release-pack"
  pnpm --dir "$TREE/packages/remote" pack --ignore-scripts \
    --pack-destination "$TREE/.release-pack"
done

A_TGZ="$(find "$REPRO_ROOT/a/.release-pack" -maxdepth 1 -type f -name '*.tgz' -print)"
B_TGZ="$(find "$REPRO_ROOT/b/.release-pack" -maxdepth 1 -type f -name '*.tgz' -print)"
test "$(printf '%s\n' "$A_TGZ" | wc -l | tr -d ' ')" = 1
test "$(printf '%s\n' "$B_TGZ" | wc -l | tr -d ' ')" = 1
A_TGZ_SHA256="$(shasum -a 256 "$A_TGZ" | awk '{print $1}')"

npm pack "$REPRO_ROOT/a/packages/remote" --dry-run --json --ignore-scripts \
  > "$ARTIFACT_DIR/npm-a-dry-run.json"
pnpm --dir "$REPRO_ROOT/a" --filter @husky-di/remote evidence:pack-parity -- \
  --authoritative-tgz "$A_TGZ" \
  --npm-dry-run "$ARTIFACT_DIR/npm-a-dry-run.json" \
  --literal-allowlist packages/remote/tests/release/tar-allowlist.json
pnpm --dir "$REPRO_ROOT/a" --filter @husky-di/remote test:reproducible-pack -- \
  --left "$A_TGZ" --right "$B_TGZ" --compare canonical-tree

pnpm --dir "$REPRO_ROOT/a" --filter @husky-di/remote evidence:ledger -- \
  --legacy-preserve 153 --legacy-retire 48 --active 343 --zero-incomplete
pnpm --dir "$REPRO_ROOT/a" --filter @husky-di/remote evidence:graph -- \
  --all-nodes-resolve --duplicate-free --inverse --zero-incomplete
pnpm --dir "$REPRO_ROOT/a" --filter @husky-di/remote evidence:corpus-lock -- \
  --offline-metaschema-closure --output "$ARTIFACT_DIR/corpus-lock.json"
pnpm --dir "$REPRO_ROOT/a" --filter @husky-di/remote test:release -- \
  --authoritative-tgz "$A_TGZ" --authoritative-sha256 "$A_TGZ_SHA256" \
  --node-exact v23.6.0 --corpus-lock "$ARTIFACT_DIR/corpus-lock.json" \
  --receipt "$ARTIFACT_DIR/release-receipt.provisional.jcs.json"
```

获得发布授权后唯一允许：

```bash
set -euo pipefail
npm publish "$A_TGZ" --access public
PUBLISHED_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/husky-remote-published.XXXXXX")"
npm pack @husky-di/remote@1.0.0 --pack-destination "$PUBLISHED_DIR"
PUBLISHED_TGZ="$(find "$PUBLISHED_DIR" -maxdepth 1 -type f -name '*.tgz' -print)"
test "$(shasum -a 256 "$A_TGZ" | awk '{print $1}')" = \
     "$(shasum -a 256 "$PUBLISHED_TGZ" | awk '{print $1}')"
pnpm --filter @husky-di/remote evidence:finalize-receipt -- \
  --canonicalization rfc8785-jcs-utf8 \
  --provisional "${RUNNER_TEMP:-/tmp}/release-receipt.provisional.jcs.json" \
  --authoritative-tgz "$A_TGZ" --published-tgz "$PUBLISHED_TGZ" \
  --output "${RUNNER_TEMP:-/tmp}/release-receipt.jcs.json"
```

不得从package directory重pack后publish；不得让B或另一个RC artifact替换A；不得用gzip bytes相等代替
canonical-tree reproducibility。

#### Chair-rereview boundary and candidate conclusion

主席只需复审R1–R11及机械依赖：`153+48`、343 active registry、legacy raw verdict identity、完整graph/
matrix/metadata、type enum、A authority、offline corpus/JCS、8轮fairness、teardown偏序、ACK/Slot、post-G
phase matrix、Group cleanup。四manifest、DOM/三浏览器、docs/migration、zod、Ticket13 prototype边界不重开；
当前production RED不构成规划失败。

本候选仍只是 `READY_FOR_CHAIR_REREVIEW`：没有 `Answer`，没有resolution/map/production变更，也没有执行
build/pack/publish或提交。

### 2026-08-23 R7 erratum after CHAIR FINAL BLOCK

本 erratum **完全替换第三版的 R7**；第三版 R1–R6、R8–R11、active registry、matrix/metadata、A-artifact
gate与复审边界继续 normative。这里只修 scheduler trace，不改变或新增任何 Requirement、Case、selector：

```text
RPC-SCHEDULE-007
RPC-SCHEDULE-008
RPC-CONFORMANCE-005
protocol.stream.fairness-progress
protocol:protocol.stream.fairness-progress
protocol.stream.aggregate-bounded-load
protocol:protocol.stream.aggregate-bounded-load
protocol.stream.adapter-rejection-is-binding-failure
protocol:protocol.stream.adapter-rejection-is-binding-failure
```

#### ACK scheduling rule

禁止为每轮或每个participant强制独立 AckOnly send。某sending direction的cumulative Message Receipt ACK
变dirty时：

1. 若下一条可发送的participant progress/control envelope存在，ACK **必须优先piggyback**到该envelope；
2. 只有不存在可piggyback envelope且`ackDelayMs` deadline实际到期，才允许一个AckOnly envelope；
3. ACK clean时不得制造AckOnly work来影响lane或participant顺序。

因此下面纯净fairness Case把两方向ACK保持clean，send trace中没有AckOnly。Failure Case若产生dirty ACK，
则把它piggyback到下一条既有progress envelope，不增加send attempt。

#### Pure sustained-fairness variant

`protocol.stream.fairness-progress` 只证明成功路径的持续progress fairness。Bootstrap与Recovery barrier已经
清空，control lane保持empty，ACK保持clean；成功`U-result`明确属于progress。五个participants
`U,A,B,C,D`在每次scheduler selection时全部同时ready。每个selected send Promise settlement后，fixture
完成该participant的合法re-arm，再进入下一次selection；任何时刻每Connection至多一个unsettled send。

Case不锁初始cursor。令第一条实际progress send的participant为`P0`，并从
`[U,A,B,C,D]`捕获唯一cyclic rotation：

```text
P0=U => rotation=[U,A,B,C,D]
P0=A => rotation=[A,B,C,D,U]
P0=B => rotation=[B,C,D,U,A]
P0=C => rotation=[C,D,U,A,B]
P0=D => rotation=[D,U,A,B,C]
```

捕获后令`P0..P4 = rotation`。Exact send/settlement contract为：

```text
for round r in 1..8:
  for offset i in 0..4:
    sendAttempt = 5*(r-1)+i+1
    selectedParticipant = P[i]
    selectedWork = P[i][r]
    invoke S(sendAttempt)
    assert S(sendAttempt+1) is not invoked before S(sendAttempt) settles
    after settlement, re-arm P[i] before the next scheduler selection
```

即40条progress sends构成连续至少8个完整轮；每轮`P0,P1,P2,P3,P4`各恰一次，轮内在五者齐全前不得
重复，轮与轮保持同一rotation。每个selection记录exact ready set `{U,A,B,C,D}`、captured rotation、selected
participant/work、argv SHA、Promise settlement与next ready set。五种offset任一都可PASS；第二轮后改变
rotation、重复participant或遗漏/饥饿任一participant均失败。该Case direct-covers
`RPC-SCHEDULE-008, RPC-CONFORMANCE-005`；它不承担control-first或Adapter rejection。

#### Separate control-first and Adapter-failure variant

`protocol.stream.aggregate-bounded-load` 独立运行。开始时ACK clean；真实control record
`X-terminal(q1)`与五个progress participants `U,A,B,C,D`同时ready。`X`是一个独立Source Stream identity，
其terminal已有winner且没有更早item dependency；它不是AckOnly、unary result或虚构probe。因此：

| Send | Exact selected work | Settlement / next rule |
| ---: | --- | --- |
| `S01` | control `X-terminal(q1)` | 必须control-first；Promise settle前无`S02` |
| `S02` | first progress `P0[1]@q2` | 动态捕获rotation origin `P0`，不预设U/A/B/C/D |
| `S03` | `P1[1]@q3` | settle后re-arm P1 |
| `S04` | `P2[1]@q4` | settle后re-arm P2 |
| `S05` | `P3[1]@q5` | settle后re-arm P3 |
| `S06` | `P4[1]@q6` | 首个完整rotation结束；settle前无peer ACK注入 |
| inbound | peer progress envelope `Y` piggybacks cumulative `ACK(q4)` | q5/q6保持retained；Y使本direction reverse ACK dirty |
| `S07` | `P0[2]@q7`，并piggyback reverse ACK for Y | Adapter固定第七次outgoing invocation reject；不得先发AckOnly；binding fence/Recovery，非overflow |
| `S08` | replacement exact replay `P3[1]@q5` | frozen barrier first；原seq/body；Observer不重复 |
| `S09` | replacement exact replay `P4[1]@q6` | 原seq/body；Observer不重复 |
| `S10` | replacement exact replay `P0[2]@q7` | 原seq/body及piggyback ACK；不重订Source |
| `S11` | post-barrier `P1[2]@q8` | barrier清空后的next rotation participant |
| `S12` | post-barrier `P2[2]@q9` | 保持captured rotation |

除表中inbound injection外，每个`Snn`都是outgoing `send()` invocation；inbound Y不占outgoing ordinal。
每个send Promise settle/reject前不得有下一outgoing send。S07 rejection ordinal固定，但progress rotation origin
不固定；五种rotation offset都使用同一symbolic trace。S01以真实terminal证明
`RPC-SCHEDULE-007`的control-first；成功`U-result`在任何offset中始终只是progress。

`protocol.stream.adapter-rejection-is-binding-failure`继续独立断言S07的failure owner是binding/Recovery，
不是Stream Overflow。既有五个mutant mapping保持不变；本erratum不增加mutant、不增加Case，也不把failure
变体的rejection或terminal混入纯净fairness verdict。

本票继续 `Status: claimed`；主席通过本erratum前不写`Answer`、不改map/resolution。本erratum状态为
`READY_FOR_R7_REREVIEW`。

### 2026-08-23 R7 erratum-2 after chair correction

上一条 R7 erratum **除下列两点外继续 normative**；本 Comment 只替换其 unary progress identity 与
rotation-capture规则。ACK dirty/piggyback/AckOnly规则、separate failure variant、S07固定 rejection、
S08–S10 exact replay及S11–S12 post-barrier规则均不得改变。既有
`RPC-SCHEDULE-007`, `RPC-SCHEDULE-008`, `RPC-CONFORMANCE-005` 与三个 stable Case/selector保持原身份；
不新增ID、Case或selector。

1. 所有progress participant `U`精确定义为 **`U-call`**，即ready unary call work；纯净fairness与failure
   trace中原写作progress `U-result`或“成功`U-result`属于progress”的文字全部由`U-call`替换。若另有成功
   `U-result` ready，它属于convergence/control，不进入progress ready set、progress rotation、八轮计数或
   starvation verdict。
2. 删除固定`[U,A,B,C,D]`的五种cyclic rotation表，也删除“由P0唯一推导P1..P4”的要求。首轮前五次
   progress selections按实际顺序捕获`P0,P1,P2,P3,P4`；必须满足
   `noDuplicates(P0..P4)`且`set(P0..P4) == {U-call,A,B,C,D}`，允许全部`5!` permutations。第2至第8轮
   必须逐项精确重复首轮捕获顺序：每轮依次`P0,P1,P2,P3,P4`，不得换序、重复、遗漏或饥饿。

本票仍为 `Status: claimed`，无`Answer`/resolution/map变更；本erratum-2状态为
`READY_FOR_R7_FINAL`。

### 2026-08-23 R3 preserved legacy evidence fan-out erratum after CHAIR BLOCK

圆桌主席后续 `CHAIR BLOCK` **只**重开第三版 R3 中 preserved profile `L` 对 legacy
`RW`/`TX`/`KA`/`BR` aggregate references 的 Evidence fan-out。此 erratum 取代 R3 中把这四类
reference 各压成一个 synthetic scalar selector 的规则；R3 的 Requirement/Case identity、343-row
matrix、canonical/support-only 分类、双向 inverse、其他 evidence kinds、R1/R2/R4–R11 以及两个 R7
errata 均不改变。

#### 一个 legacy reference/Case，多条 exact Evidence leaves

Hash-locked `REQUIREMENTS.md` 中的每个 legacy reference 仍按文档顺序实例化原 Case：

```text
case.id = legacy.<kind-lower>.<family-lower>-<nnn>.<reference-index-2d>
case.assetLocator = 原 path::title 的完整 aggregate locator
case.input / case.expected / case.covers / case.classification = R3 已固定值
```

Case identity 与 aggregate `assetLocator` 均不得拆分、改名或复制。修复只把
`case.evidence` 改为一个 **non-empty、ordered、duplicate-free** 的 exact Evidence selector array；顺序
分别取 schema pointer 顺序、raw vector array 顺序、transcript scenario/step 顺序、KAT 文档顺序和固定
browser engine 顺序。每个 leaf Evidence node 必须含：

```text
selector, class, cases, input, expected, artifactDigest, runnerDigest, status
```

其中 `input` 是 runner 真正消费的 exact bytes/object/action/engine，`expected` 是 independently asserted
validity、record kind/rejection、state/output或browser result；只保存 asset path、test title、目录、glob、
Case id 回显或 corpus 自报 `covers` 均不是 leaf。一个 selector 被多个 legacy Cases 共用时，全局仍只有
一个 Evidence node，其 `cases` 是所有反向 Case edges 的 ordered duplicate-free array。

双向闭包修正为：

```text
forall legacy case c of kind RW|TX|KA|BR:
  c.evidence.length >= 1
  c.evidence has no duplicate selector
  forall selector x in c.evidence: exactly one Evidence node e exists with e.selector=x
  x in c.evidence iff c.id in evidence[x].cases

forall fan-out Evidence e:
  e.cases.length >= 1
  e.cases has no duplicate Case id
  every e.cases reference resolves to exactly one preserved legacy Case
```

Requirement 与 Case 数量、Case identity、matrix edges和 selector **grammar** 均不变；只按真实 leaf
数量增加 Evidence nodes 与 Case↔Evidence edges。任一空 fan-out、unresolved/multi-resolved selector、
orphan reverse edge、duplicate、placeholder、aggregate-only locator或 incomplete leaf 都使 Case 和 release
BLOCK，绝不能标为 `verified`。

#### RW — 只用真实 schema/raw corpus selectors

任何 RW leaf selector 都不得使用 `legacy.rw.*`、legacy Case id 或 test title 伪造 corpus identity。
现有 preserved RW aggregate references 只有两种，按其原 title exact dispatch：

1. `publishes the complete JSON Schema 2020-12 grammar` 展开为以下既有
   `schema:rpc1:<RFC6901-pointer>` grammar leaves，按列出顺序：

```text
schema:rpc1:/$schema
schema:rpc1:/$id
schema:rpc1:/title
schema:rpc1:/$defs/freshRequest
schema:rpc1:/$defs/freshAccept
schema:rpc1:/$defs/resumeRequest
schema:rpc1:/$defs/resumeAccept
schema:rpc1:/$defs/freshReject
schema:rpc1:/$defs/resumeReject
schema:rpc1:/$defs/messageEnvelope
schema:rpc1:/$defs/ack
schema:rpc1:/$defs/ping
schema:rpc1:/$defs/pong
schema:rpc1:/$defs/close
schema:rpc1:/$defs/call
schema:rpc1:/$defs/cancel
schema:rpc1:/$defs/result
schema:rpc1:/$defs/error
```

   每个 leaf 的 input 是 exact schema digest + pointer；前三个 expected 是 exact scalar，后十五个 expected
   是 pointer 对应定义存在且通过其 independently pinned schema verdict。新 stream schema truth 仍由新
   Requirements/Cases拥有，不能倒灌进 preserved legacy Case。
2. `publishes executable raw byte vectors` 展开为 R1 legacy raw verdict ledger adjudicated 后的真实 final
   raw IDs，selector 只能是 `raw:rpc1:<actual-vector-id>`。集合恰为 R1 的 44 个 byte-identical preserved
   IDs，加以下九个真实 replacement IDs，按 final raw corpus array 的实际顺序排序：

```text
valid-unary-call-with-unknown-tails
valid-safe-error-without-details
invalid-error-details-field
valid-unary-number-domain
valid-unary-application-args-depth-limit
valid-unary-array-element-limit
invalid-reserved-then-member
invalid-unary-application-args-depth-limit-plus-one
invalid-unary-array-element-limit-plus-one
```

   八个 tombstoned old IDs不得成为 Evidence node。每个 raw leaf input 必须保存 exact `source.segments`、
   rendered bytes digest/length与validator phase；expected 必须保存 exact `valid|invalid` verdict，valid 时的
   `expectedKind`，invalid 时的 rejection verdict。New streaming-only vectors由新 Requirements/Cases拥有，
   不扩大 preserved legacy reference 的 input domain。

若出现第三种 preserved RW title，或 registry 不能从上述 aggregate title解析出 non-empty exact leaves，
release 必须 BLOCK，不能 fallback到 `raw:rpc1:<legacy-case-id>`。

#### TX — actual scenario#step，禁止 `#verified`

TX aggregate Case保留原 locator；Evidence按实际 scenario顺序、再按实际 step顺序展开。

**Profile `L` retirement scope（normative）。** Profile `L`只为hash-locked `REQUIREMENTS.md`中
Requirement ID属于153项preserve set的legacy `TX` evidence-reference row实例化active Case。
`RPC-CORPUS-002`已由`RPC-CORPUS-007` retire；其legacy TX reference row **MUST NOT**实例化
active `L` Case，**MUST NOT**产生任何`Case.evidence`或`Evidence.cases` edge。其42-step transcript
ledger只是tombstone→replacement的一一映射universe，**MUST NOT**作为aggregate TX fan-out source。

Selector只允许`transcript:rpc1:<actual-scenario-id>#<actual-step-id>`。`#verified`、`#all`、
scenario-only、Case-id step和 wildcard全部非法。R1的一一映射给出完整42-step
replacement-mapping universe：

```text
unary-fresh-establishment#fresh-request-admitted
unary-fresh-establishment#fresh-accept-verified
unary-lost-fresh-accept#fresh-request-admitted
unary-lost-fresh-accept#accept-installed-then-dropped
unary-lost-fresh-accept#connection-loss-diverges-safely
unary-normal-resume-and-replay-barrier#binding-lost-with-call-retained
unary-normal-resume-and-replay-barrier#resume-request-authenticated
unary-normal-resume-and-replay-barrier#resume-accept-starts-finite-barrier
unary-normal-resume-and-replay-barrier#barrier-replay-dispatched-once
unary-lost-resume-accept-higher-attempt#attempt-one-accept-lost
unary-lost-resume-accept-higher-attempt#higher-attempt-fences-lost-winner
unary-lost-resume-accept-higher-attempt#higher-accept-converges
unary-lost-ack-and-ack-bounds#call-receipt-is-durable
unary-lost-ack-and-ack-bounds#receipt-ack-is-lost
unary-lost-ack-and-ack-bounds#duplicate-suppresses-body
unary-lost-ack-and-ack-bounds#stale-zero-ack-is-noop
unary-lost-ack-and-ack-bounds#receipt-ack-retires-replay
unary-lost-ack-and-ack-bounds#equal-ack-is-noop
unary-lost-ack-and-ack-bounds#future-ack-poisons-current-session
unary-sequence-gap#first-sequence-retained
unary-sequence-gap#sequence-three-before-two-faults
unary-regressed-sequence-conflicting-body#sequence-one-fingerprint-retained
unary-regressed-sequence-conflicting-body#regressed-sequence-with-new-body-faults
session-authenticated-cursor-boundaries#lower-bound-request-accepted
session-authenticated-cursor-boundaries#lower-bound-accept-converges
session-authenticated-cursor-boundaries#second-binding-lost
session-authenticated-cursor-boundaries#upper-bound-request-needs-no-replay
session-generic-resume-rejects#wrong-proof-is-generic
session-generic-resume-rejects#wrong-profile-is-generic
session-generic-resume-rejects#wrong-session-is-generic
session-authenticated-continuity-reject#proof-valid-cursor-outside-lower-bound
session-authenticated-continuity-reject#signed-reject-terminates-both-sides
session-stale-connection-epoch-gate#old-endpoint-record-is-rejected-before-codec
session-stale-connection-epoch-gate#old-endpoint-terminal-is-noop
session-activity-ping-pong#idle-initiator-sends-one-ping
session-activity-ping-pong#valid-ping-coalesces-one-pong
session-activity-ping-pong#pong-does-not-reply
session-graceful-close#close-authoritatively-terminates-receiver
session-graceful-close#connection-close-completes-sender
session-counter-exhaustion-protected-tail#ordinary-admission-enters-reserved-window
session-counter-exhaustion-protected-tail#existing-cancel-uses-reserve
session-counter-exhaustion-protected-tail#finite-drain-sends-unsequenced-close
```

唯一preserved TX fan-out sources是`RPC-VALID-002`的两条hash-locked locator rows：

1. `TX::packages/remote/wire/husky-di-rpc-1/transcripts.json::stale-connection-epoch-gate`只解析到
   `transcript:rpc1:session-stale-connection-epoch-gate#old-endpoint-record-is-rejected-before-codec`和
   `transcript:rpc1:session-stale-connection-epoch-gate#old-endpoint-terminal-is-noop`。
2. `TX::packages/remote/wire/husky-di-rpc-1/transcripts.json::activity-ping-pong`只解析到
   `transcript:rpc1:session-activity-ping-pong#idle-initiator-sends-one-ping`、
   `transcript:rpc1:session-activity-ping-pong#valid-ping-coalesces-one-pong`和
   `transcript:rpc1:session-activity-ping-pong#pong-does-not-reply`。

两条row合计恰好五个现存exact scenario#step leaves；任何第六个leaf、42-step aggregate edge、
`RPC-CORPUS-002` active `L` Case/edge或缺少五者之一都使release BLOCK。每个 leaf input 是
exact pre-state + `action`；expected 是该step的完整 asserted two-side
state/binding/callback/resource/evidence/next-record output，不能用scenario最终状态或字符串
`verified`替代。

#### KA — preserved KAT逐项展开

每个 preserved KA aggregate reference按以下固定顺序产生五条 Evidence leaves：

```text
security:rpc1:rfc8785-section-3.2.2
security:rpc1:rfc8785-section-3.2.3-utf16-property-order
security:rpc1:rfc5869-appendix-a.1
security:rpc1:rfc4231-section-4.2-test-case-1
security:rpc1:husky-di-rpc-1-proof-transcript
```

JCS leaf input/expected分别是exact JSON input与canonical UTF-8；HKDF leaf是exact IKM/salt/info/length与
PRK/OKM；HMAC leaf是exact key/data与tag；profile transcript leaf是exact Session/input records与所有
canonical strings、hashes、derived key和proof outputs。五个 selector均解析到真实 preserved KAT，不能用
`security:rpc1:<legacy-ka-case-id>`或单一aggregate PASS代替。

#### BR — 每个实际 engine一条 leaf

Preserved browser reference Case（当前 exact id为`legacy.br.release-002.01`）保留原 aggregate locator，
Evidence固定按以下顺序展开：

```text
browser:legacy.br.release-002.01@chromium
browser:legacy.br.release-002.01@firefox
browser:legacy.br.release-002.01@webkit
```

每条 leaf input记录exact engine name/version、同一 installed artifact digest与同一browser fixture input；
expected记录该engine独立得到的完整 output/verdict。三条都必须真实执行并分别`verified`；`@<engine>`、
`@all`、默认engine或一个engine代替三engine均为placeholder/incomplete。

#### Fan-out release gate

Canonical graph audit必须从 aggregate locator的independent runner result重算上述 leaves，再比较 registry，
而不是信任Case自报。每个 leaf只有在 exact input/output、artifact/runner digest和双向edge全部闭合后才可
`verified`；Case只有在其全部 ordered leaves均`verified`时才可`verified`。Requirement/Case counts与
selector grammar保持原值，Evidence count和edges按真实fan-out数量展开；receipt必须记录展开后的arrays，
不保留range、wildcard或aggregate shortcut。本erratum的 scoped roundtable review 已完成，
其对 Evidence fan-out/nodes/edges 的改动保持有效。

### 2026-08-24 scoped proposition-boundary erratum after implementation discovery

圆桌主席已对本 scoped erratum 给出 `CHAIR PASS`。它是 implementation handoff authority，
不是 production/specification/evidence 已完成或验收的声明。本erratum **仅**取代 R1 中
“从 marker 到下一 marker”的 proposition-boundary 定义并固定由此发现的迁移边界；
Requirement/Case identity、selector grammar、evidence fan-out 与其他 Answer authority 均不变。

#### 唯一 proposition boundary

解析输入必须是无 BOM、只使用 LF 的 raw UTF-8 bytes；BOM、CR 或非法 UTF-8 均必须
fail closed。最终 normative `SPECIFICATION.md` 中的每个 active Requirement block 必须以
column 0 的 exact opening Requirement marker 开始；opening ID 必须完整匹配
`RPC-[A-Z]+-[0-9]{3}`，opening marker 的 `startByte` 是其第一个 `*` 的 0-based inclusive
raw-byte offset。每个 block 必须以匹配同一 ID、同样位于 column 0 的独占结束行闭合：

```text
<!-- /RPC-<FAMILY>-NNN -->
```

该 close line 的 raw bytes 必须精确为 `<!-- /RPC-ID -->\n`，不得有前导/尾随空白，且每个
ID 的 close 全局唯一。设 `closeOffset` 为 matching close 的第一个 `<` 的 raw-byte
offset；close 前必须恰有一个结构 LF 且不得有 blank line，即
`byte[closeOffset - 1] = 0x0a` 且 `byte[closeOffset - 2] != 0x0a`。固定
`endByteExclusive = closeOffset - 1`，且 proposition payload 必须是
`specBytes.subarray(startByte, endByteExclusive)`。结构 LF 与 close delimiter 都不属于 payload。

提取与比对不得使用 `trim()`，不得 decode→re-encode，不得做换行、Unicode、空白、
Markdown 或任何其他 normalization。以下任一情况都必须 fail closed：在 matching close
前出现下一个 opening；orphan、mismatched、duplicate、nested 或 crossed close/block；缺失
close；或在任何位置发现 retired opening marker 或 retired close delimiter。

153 个 preserved baseline slices 的 content-addressed 唯一边界清单是
`.scratch/remote-observable-streams/support/legacy-preserved-requirement-boundaries.json`（物理 SHA-256
`3b11a2432026fc4dc0833c1425041a4caf1900dea1a0afc7bfe7f3247f550b66`）。该路径是 inline code，
不是 Markdown link。Manifest 只是 support artifact，不含 Wayfinder metadata，不是 issue、map
decision、normative proposition 或 production evidence。其 offsets 全部相对于本票锁定的 baseline
`SPECIFICATION.md` raw UTF-8 bytes。

#### Preserved 迁移分类

153 个 preserved Requirement 的唯一迁移分解固定为
`123 exact + 29 boundary-only + 1 replacement-reference = 153`。

- `123 exact`：按上述 delimiter 提取后的 proposition payload 与 hash-locked baseline 的
  Requirement 文字逐 byte 一致。
- `29 boundary-only`：只排除旧“到下一 marker”规则误吞的标题、说明或相邻声明；
  Requirement 本身不得改动任何单词、byte 或语义。完整列表为：

```text
RPC-BASE-003, RPC-VALUE-006, RPC-DESC-005, RPC-API-006, RPC-STATE-003,
RPC-EVENT-007, RPC-START-005, RPC-TRANSPORT-012, RPC-SPI-003, RPC-SPI-012,
RPC-WIRE-010, RPC-WIRE-015, RPC-ACK-007, RPC-LEDGER-005, RPC-SESSION-004,
RPC-SESSION-010, RPC-RECOVERY-006, RPC-RECONNECT-005, RPC-SEC-007, RPC-SEC-009,
RPC-RESOURCE-004, RPC-POLICY-004, RPC-SCHEDULE-006, RPC-TIME-003, RPC-COUNTER-004,
RPC-LIFE-002, RPC-SHUTDOWN-010, RPC-CLEANUP-004, RPC-RELEASE-005
```

- 唯一 `replacement-reference` 是 `RPC-WIRE-003` payload 内的
  `RPC-VALUE-004 → RPC-VALUE-008`；该一处替换且仅该一处替换由 R1 retire ledger 的
  `RPC-VALUE-004 -> RPC-VALUE-008, RPC-WIRE-023` authority 授权。除该 reference 外，
  `RPC-WIRE-003` 保持 baseline bytes 与语义。

以下三个既有附件是各自 Requirement payload 的一部分，matching close delimiter 必须位于
附件之后，不得把它们切到 block 外：

- `RPC-PKG-001` entry-point table；
- `RPC-SEC-002` Define 及 HKDF/HMAC formulas；
- `RPC-VALID-001` nine-step pipeline。

`RPC-CALL-006` 必须撤销实现过程中偷渡的新增扩义，回到 hash-locked baseline
proposition。如果仍需要该新行为，必须以新 Requirement ID 和显式 block 另行定义，
不得借旧 ID 扩域。

#### Retired 与 new Requirement 边界

实现必须从 normative SPEC 和所有 active ledgers 删除以下 21 个 retired markers，或把仍需要的
内容迁入其已有 replacement Requirement。不得使用 close delimiter 把 retired marker 或其内容“隐藏”
在 active block 内或 block 外：

```text
RPC-PKG-007, RPC-PKG-008, RPC-PKG-009, RPC-EVENT-002, RPC-EVENT-004,
RPC-WIRE-012, RPC-VALID-007, RPC-RESOURCE-001, RPC-RESOURCE-002, RPC-RESOURCE-003,
RPC-RESOURCE-005, RPC-POLICY-001, RPC-POLICY-002, RPC-POLICY-003, RPC-SCHEDULE-002,
RPC-COUNTER-002, RPC-CLOSE-001, RPC-EVIDENCE-002, RPC-EVIDENCE-003,
RPC-CONFORMANCE-002, RPC-RELEASE-001
```

190 个 new Requirement proposition 必须从最终 `SPECIFICATION.md` 中 190 个具有显式 matching
close delimiter 的 blocks 生成。R2 compact summaries 只是实现索引，不是 proposition payload，
不得用来生成 registry。

最终机械不变量为：`343 active = 153 preserved + 190 new`；`48 retired`；active/retired
交集为空；SPEC active markers 恰为 343，retired markers 恰为 0；registry 与 active blocks
必须达到 `343/343` byte-exact，mismatch 为 0。本erratum 不增删或改写 Requirement/Case
fan-out、Case identity、selector grammar、Evidence nodes/edges 或 R3 ordered exact leaves。

#### Content-addressed implementation-discovery RED snapshot

本票在 production writer 确认 `WORKTREE WRITE FREEZE ACK` 后读取了以下冻结输入。完整的
physical SHA-256 与 baseline authority 为：

```text
baseline commit = 5b2d512815b93570c881d93f35dbb570bac855b1
baseline tree = 9b09536eedfaf1f0b05f6cfbcac4cae7d4b6e651
baseline SPECIFICATION.md SHA-256 = ff5259c2d7db766076db6c36ad047351879359e7190be0f44aa50b038b95ee14
baseline REQUIREMENTS.md SHA-256 = 30ebe8f28af3e12a81eb8da432691c1d99eadb3611ab441d19b9bb11eca988cf
support manifest SHA-256 = 3b11a2432026fc4dc0833c1425041a4caf1900dea1a0afc7bfe7f3247f550b66

packages/remote/docs/SPECIFICATION.md = 90f14b7bcc2ec6a008bb26dda1fe8de60577bc1ed6a26132498483e2d36c0cf2
packages/remote/docs/REQUIREMENTS.md = 8f46361a0d7782b29f9e0e6886cd2be1c13afb53d60778d31882413647b8435e
packages/remote/tests/evidence/specification-requirements.test-util.mjs = 6a4d09e7fc23c71ca618b93e2a7ed1b99a8ae3dac2a5ca0f31c881d8fd60265c
packages/remote/tests/evidence/registry-generator.test-util.mjs = ed428c014ab3bc5d9cb6c06913f7de6b4f0718ab5a6c41701f9732dcd81d1b13
packages/remote/tests/evidence/registry-scaffold.test.ts = c6a21450546ce94496aadc86c1c011bcbb83155877c993de4af269875f7797ba
packages/remote/evidence/requirements.json = bea691077cf9bcfcc7e6eda92848948dafd8d623074c1c78039979d1cc3f68dd
packages/remote/evidence/cases.json = b326dd9fb835442aece50e351b0f4ccec85dde16f6a2a85a6db99b05d9ff7288
packages/remote/evidence/matrix.json = fe0981cd78e68231eafb4e299ccf321e2dd7b8e531ceb38774bd0370d21dce7e
packages/remote/evidence/evidence.json = a4f5f42816274ff775a9b9ce753a9a5bc2d134fc70cd0f9efc3df844dec01999
```

该 snapshot 的机械状态是：`364 opens = 153 preserved + 190 new + 21 retired`；
`0 closes`；`364 REQUIREMENTS rows`；Requirements registry 为 `343 active / 48 retired`；
343 个 active Requirement 的 specification Cases 为 `343/343 verified`，但它们只因 opening-marker
existence 而被误标 verified。这是 content-addressed **RED witness**，不是长期期望、PASS、
implementation completion 或 production acceptance。

#### Fail-closed parser/generator gate

Generator 在写出任何 byte 之前，必须先在内存中完成全局 raw-byte parse、opening/close
grammar、active/retired/preserved/new sets、manifest slice digests、registry proposition digests 与双向
Requirement/Case/selector/evidence 闭包。任一检查失败必须 nonzero exit，且以下四个文件必须与
运行前逐 byte 一致：`requirements.json`、`cases.json`、`matrix.json`、`evidence.json`。

独立 RED 必须至少覆盖：

- opening 存在但 close 缺失；
- mismatched、duplicate 或 nested close（及 orphan/crossed block）；
- 任一 preserved payload 的单 byte drift；
- `RPC-PKG-001` entry-point table、`RPC-SEC-002` Define + HKDF/HMAC formulas、
  `RPC-VALID-001` nine-step pipeline 中的任一附件被移出 matching block；
- 任一 retired opening marker 或 close delimiter 留存；
- opening marker 存在，但 manifest/registry proposition 与 block raw bytes 不匹配。

当前 parser 中的 `source.slice(...).trim()` 与 generator 中的 marker-existence→`verified`
是这些 RED 的明确 targets，它们不得自证 specification Case 已 verified。只有在上述失败路径、
四 JSON byte-identity 与 343/48 终局不变量都由独立测试闭合后，既有 implementation/
production gates 才可继续。

本 scoped planning-authority review 现为 `SCOPED_REVIEW_COMPLETED`；该完成态不替代上述
implementation/production gates。

`CHAIR ROUND2 FINAL PASS` closes scoped planning-authority erratum; R3 changes evidence fan-out; boundary erratum does not; planning remains resolved; implementation/production pending.

## Answer

圆桌主席曾对权威候选快照
`4b793b8365227347a3da47c22c8daf0e0150840091f280b214c191432693e479` 给出
`CHAIR FINAL PASS`；后续 scoped `CHAIR BLOCK`仅推翻 preserved legacy evidence fan-out，旧TOTAL PASS
不再覆盖该点。当前规划合同由以下内容按后写覆盖前写的顺序共同组成：

1. [自封闭第三版候选](#2026-08-23-third-superseding-candidate-after-chair-block-authoritative-repairs-111)：
   固定 `153 preserve + 48 retire` legacy ledger、343项active proposition registry、双向闭合
   requirement/case/evidence graph、production/same-A-tgz证据、完整wire corpus替换、package/browser/docs/
   migration gate及implementation-neutral handoff。
2. [R7 erratum](#2026-08-23-r7-erratum-after-chair-final-block)：固定ACK优先piggyback、纯净持续fairness与
   独立control-first/Adapter failure-replay变体。
3. [R7 erratum-2](#2026-08-23-r7-erratum-2-after-chair-correction)：最终把progress unary participant定为
   `U-call`，并以首轮任意五元素permutation作为后续八轮的稳定rotation。
4. [R3 preserved legacy evidence fan-out erratum](#2026-08-23-r3-preserved-legacy-evidence-fan-out-erratum-after-chair-block)：
   保持legacy reference/Case identity与aggregate locator，把RW/TX/KA/BR证据展开为ordered exact leaves，
   以双向exact-once graph gate禁止synthetic selector、orphan、duplicate、placeholder或incomplete PASS，
   并明确改变 Evidence fan-out、Evidence nodes 与 Case↔Evidence edges。
5. [Scoped proposition-boundary erratum](#2026-08-24-scoped-proposition-boundary-erratum-after-implementation-discovery)：
   以 matching ID 独占 close delimiter 取代 marker→next-marker 提取，固定
   `123 exact + 29 boundary-only + 1 replacement-reference`、21个必须从 normative/active
   surfaces 消失的 retired markers、190个 new explicit blocks 与 343/48 终局机械不变量。

上述 `4b793b…` SHA 只是写入本Answer和切换Status之前、前三项规划内容的历史
pre-resolution snapshot；第四、第五项是其后的 scoped authority，必然改变本文件SHA。
第四项 R3 改变 Evidence fan-out/nodes/edges；第五项 boundary erratum 不改变 fan-out。
两者都不改变 Requirement/Case 数量或 selector grammar。本决议只完成规范、TDD、corpus与release evidence的implementation handoff，
**不表示production、SPECIFICATION/REQUIREMENTS、specification tests、wire assets、package/docs或发布流程
已经实现或验收**。后续实现必须按合同原子更新normative specification及matching
`specification.test.ts`，并以同一最终A tgz通过全部release gate；本地图的最终handoff审计由下一frontier
[审计 Observable 流 Wayfinder 并交接规范](15-audit-wayfinder-specification-handoff.md)负责。

### 2026-08-24 scoped R6 public reachability and support-probe-locator erratum

本 scoped erratum 是本票物理顺序上**最晚的 implementation handoff authority**。它只替换第三版
R6 中“每个 KAT/security action 都经同一 A production seam 双执行”的不可满足量词，以及 R11
把 support-only probe locator 简写成 Evidence `selector` 的歧义。既有 Requirement ID、Case ID、
selector grammar、五条 preserved KA leaves、Case/Evidence fan-out、四节点模型、public export manifest、
三成员 `IRpcConnection`、R7 与 proposition-boundary authority 均不改变。本记录不修改或验收
production、normative specification、tests、registry、corpus、package 或 release artifact。

#### A — fixed KAT truth 与 public-A reachable production truth 分离

五个 preserved KAT identity 与 exact input/output 继续是：

```text
rfc8785-section-3.2.2
rfc8785-section-3.2.3-utf16-property-order
rfc5869-appendix-a.1
rfc4231-section-4.2-test-case-1
husky-di-rpc-1-proof-transcript
```

同一 installed A 的 `known-answer-vectors.json` 必须逐 ID 读取这五个对象；pinned independent
RFC/reference oracle 必须对每项 exact input 重新计算 exact output，并输出以该 KAT ID 为 key 的
`inputSha256`、`outputSha256`、oracle artifact digest 与 status。R3 KA ordered leaves及其 input/expected
保持不变；复制 asset expected、调用 production 两次或只比较自报 digest 均不是 independent recomputation。

Public production A 仍只能从 installed `A_TGZ` 的 `createRpcProtocol()` 与受控三成员
`IRpcConnection.message$/send/close` 驱动。不得新增 public crypto API、test hook、dependency injection、
private/deep import、全局 crypto monkeypatch 或额外 package export 来注入 arbitrary KAT input。固定 RFC
HKDF `rfc5869-appendix-a.1` 与固定 RFC HMAC `rfc4231-section-4.2-test-case-1` 的 generic input domain
在该 public Protocol seam 不可达；其 exact KAT truth 只由上述 installed-asset + independent-oracle gate
拥有。`husky-di-rpc-1-proof-transcript` 的固定 secret/record input 同样不得靠 hidden injection 冒充
public execution。

Production cross-check 改为下面三个互不替代的具名结果集合：

1. 两个 JCS identity 各有一个
   `production.embedded-jcs.<kat-id>` result。Runner 必须经 public A 执行一个 profile-shaped action，
   让该 ID 所代表的 exact JSON/string 或 UTF-16 property-order coordinate 真实进入 authenticated
   canonical transcript，并由独立 oracle 从完整受控 input 重算预期 proof/effect。只有当 outbound
   proof、accept/reject 或其他 public Protocol effect 能把该 coordinate 与实际 production execution
   精确归因，且单坐标 mutation 会使比较失败时，结果才可 `passed`；回显 corpus、只跑 oracle、检查
   helper 名称或笼统声称“production uses JCS”不得计数。
2. Profile-shaped fresh/resume proof results 必须逐项命名，至少为
   `production.profile-proof.fresh-accept`、`production.profile-proof.resume-request`、
   `production.profile-proof.resume-accept` 与 `production.profile-proof.resume-reject`。每项都从 public A
   实际 outbound/accepted record 捕获本次可达的 Session/input，独立重算 canonical strings、hashes、
   derived proof key 与 HMAC proof，再比较 public effect。它们验证 production 对**可达 profile input**
   的 HKDF/HMAC/JCS 行为，不把 generic RFC HKDF/HMAC fixed vectors改称publicly executed KAT。
3. 七个 stateful security action 必须按现有 identity 分别输出 result：
   `stream-cursor-lost-ack`、`old-binding-fence`、`wrong-proof-retains-stream`、
   `recovery-terminal-no-resubscribe`、`post-g-validation-order`、
   `protected-transport-no-record-mac`、`payload-error-redaction`。每项必须经同一 installed public A
   transaction真实执行，并与 independent expected action/effect 比较；一个 boolean array、总数或
   综合 happy-path PASS 不能替代逐 ID result。

Machine report 必须分别保存 `independentKatResults`、`embeddedJcsProductionResults`、
`profileProofProductionResults` 与 `securityActionProductionResults`。每个 member 都含稳定 result ID、
实际 input/output或action/effect digests、runner/oracle digests 与 status。不得输出或接受
`productionKatCrossChecks: 5`；fixed-vector public reachability 不能由 KAT 数量、manifest identity 或
上述 profile-shaped results推导。任一具名 production result 若不能证明其 public-A transaction与独立
expected truth的 exact 对应，就必须 fail closed，不能降格成 aggregate count。

因此 `RPC-CORPUS-012`、canonical Case `security.rpc1.production-kat-cross-check` 与 selector
`security:rpc1:production-kat-cross-check` 的 identity 均保留，但 expected truth 由“每KAT/action
independent+A双执行”替换为：五 KAT 逐 ID installed+independent exact recomputation；两个具名
embedded-JCS public-A cross-check；四个具名 profile-shaped fresh/resume proof cross-check；七个具名
public-A security action cross-check；generic RFC HKDF/HMAC fixed input明确不可从public domain注入。

#### B — S-owned support probe locator，不产生 S↔E edge

R11 的 `runtime:runtime.support.legacy-group-route-scan` 现在精确命名为
`supportProbeLocator`，不是 Evidence `selector`。它属于 support-only Case
`runtime.support.legacy-group-route-scan` 自身的 content-addressed probe/result metadata：

```text
S = {
  id: "runtime.support.legacy-group-route-scan",
  classification: "support-only",
  covers: [],
  supports: ["package.cleanup.legacy-group-engine-absent"],
  evidence: [],
  supportProbeLocator: "runtime:runtime.support.legacy-group-route-scan",
  supportProbeResult: {
    inputSha256, expectedSha256, artifactDigest, runnerDigest, status
  }
}
```

`supportProbeLocator` 必须全局唯一且不得与任何 E selector 碰撞；它是执行地址，不是 node reference，
不实例化 E，不进入 `S.evidence`、`C.evidence` 或 `E.cases`。Probe PASS/FAIL只决定 S 自身 result/status，
不得传播为 canonical Case `package.cleanup.legacy-group-engine-absent` 或 `RPC-MIGRATION-004` 的 PASS/FAIL；
该 C/R 仍只由 installed-A canonical Evidence决定。Final zero-incomplete gate仍可因一个未完成或失败的 S
整体 BLOCK，但这不创造 S→E、E→S 或 S→R edge，也不让 source/layout scan单独把Requirement变绿。

四节点与唯一边因此保持：`R<->C`、`C<->E`、`S->C`。R3 的 Case↔Evidence inverse仍只量化 C 与 E；
R11 的 `covers=[]`、`supports=[package.cleanup.legacy-group-engine-absent]` 和 implementation-neutral source/
build-graph scan语义均不变。

#### Answer authority ordering 与 implementation handoff

本票 Answer 原列出的第一至第五项保持为历史与既有 authority；本 erratum 是其后的第六项，只在上述
R6量词和R11 locator表示范围内后写覆盖前写。后续实现必须在同一个原子change中更新 normative
`RPC-CORPUS-012` prose、matching `specification.test.ts`、machine Case/support-probe schema、installed-A
runner named results及其receipt digests；不得通过改名、重建KA fan-out、新增Case/selector或扩大public API
规避。本票继续`resolved`，planning handoff继续闭合，但 production/release acceptance在这些gates真实
转绿前仍未完成。

### 2026-08-24 scoped raw/transcript public-observability erratum

圆桌主席已对本 scoped erratum 给出 `CHAIR PASS`。本节是本票物理顺序上最晚的
implementation-handoff authority；它只后写覆盖第三版 R6 中“public A 比较每个 raw vector 的 actual
validation phase”，以及 `RPC-CORPUS-007`/transcript runner 要求 public A 直接观察 internal named
state 的不可满足量词。它不改变任何产品或 wire 行为，不增删、重命名或重排任何 Requirement ID、Case
ID、Evidence selector、fan-out、edge、export 或 public Interface；R3、R7、proposition-boundary、KAT 与
support-probe-locator errata 均保持原 authority。本票继续 `resolved`；本记录不是 implementation、
production、corpus 或 release acceptance。

#### Raw：82 项 independent truth 与 82 项 public projection 分离

同一 installed final A 的 `raw-vectors.json` 必须恰有以下 82 个 ordered、duplicate-free IDs，零 extra、
零 missing：

```text
valid-fresh-request
valid-fresh-accept
valid-resume-request
valid-resume-accept
valid-fresh-reject
valid-generic-resume-reject-with-unknown-tail
valid-unary-call-with-unknown-tails
valid-cancel
valid-result-with-void
valid-result-with-null
valid-safe-error-without-details
invalid-error-details-field
valid-ack-zero
valid-ping
valid-pong
valid-close
valid-legal-whitespace-order-and-escape
valid-unary-number-domain
valid-depth-limit
valid-unary-application-args-depth-limit
valid-string-byte-limit
valid-member-name-byte-limit
valid-unary-array-element-limit
valid-transport-message-byte-limit
invalid-malformed-utf8
invalid-leading-bom
invalid-duplicate-key-after-escape
invalid-second-json-value
invalid-non-whitespace-trailing-data
invalid-root-array
invalid-unpaired-surrogate
invalid-negative-zero
invalid-non-finite-number
invalid-unsafe-protocol-integer
invalid-empty-profile-offer
invalid-duplicate-profile-offer
invalid-base64-padding
invalid-base64-non-url-alphabet
invalid-base64-wrong-length
invalid-fresh-binding-epoch
invalid-resume-reject-message
invalid-reserved-then-member
invalid-leading-zero-call-ordinal
invalid-outcome-unknown-wire-error
invalid-error-object-unknown-field
invalid-close-sequence
invalid-active-kind
invalid-depth-limit-plus-one
invalid-unary-application-args-depth-limit-plus-one
invalid-string-byte-limit-plus-one
invalid-member-name-byte-limit-plus-one
invalid-unary-array-element-limit-plus-one
invalid-transport-message-byte-limit-plus-one
valid-stream-method
valid-stream-property
valid-stream-item
valid-stream-credit
valid-stream-cancel
valid-stream-complete
valid-stream-error-canceled
valid-stream-error-unavailable
valid-stream-error-handler-failed
valid-stream-error-unknown-service
valid-stream-error-unknown-member
valid-stream-error-overflow
invalid-stream-method-credit-zero
invalid-stream-method-credit-two
invalid-stream-property-with-args
invalid-stream-start-method-field
invalid-stream-then-member
invalid-stream-id-zero
invalid-stream-id-leading-zero
invalid-stream-id-max-plus-one
invalid-stream-item-ordinal-zero
invalid-stream-credit-through-zero
invalid-stream-terminal-boundary-unsafe
invalid-stream-error-code
invalid-stream-error-details-field
valid-max-stream-method-envelope
valid-max-stream-item-envelope
valid-max-node-limit
invalid-max-node-limit-plus-one
```

`independentRawResults` 必须恰有上述 82 个逐 ID result。每项从 installed asset 的 `source.segments`
渲染 exact bytes，并记录 exact bytes SHA-256/length、independently recomputed `valid|invalid`、valid 时的
exact record kind或 invalid 时的 exact rejection、pinned reference model 的 first-failing phase、normative
scope、ACK consequence，以及没有 later application effect。重算必须使用 pinned、与 production
implementation 独立的 duplicate-aware raw UTF-8/JSON、Draft 2020-12 schema 与 security oracle；不得复制
asset `expected`/`assert`/`covers`，不得用 ID regex 生成 expected，也不得从 production fault、close reason、
Error 名称或 public observation反推 independent truth。特别固定：
`invalid-duplicate-profile-offer` 的 first-failing phase 是 `schema`，不是 `json`。

每个 independent raw row 的稳定字段至少且精确表达
`id, exactBytesSha256, exactByteLength, validity, kindOrRejection,
referenceFirstFailingPhase, normativeScope, ackEffect, noLaterEffect, oracleDigest, status`；其中
`noLaterEffect` 必须由action-prefix model重算，不能从production没有日志或测试超时推定。

first-failing phase `utf8|json|schema|security|binding|sequence|semantic` 只属于 independent reference
classification。Public A 不得、也不需要暴露 actual phase。`rawPublicProjectionResults` 必须恰有同样 82 个
逐 ID result：runner 只能经 installed A 的 public `createRpcProtocol()` 与三成员
`IRpcConnection.message$/send/close` 在为该 vector 构造的 reachable context 中注入 exact bytes，并记录
稳定 public projection。允许参与 verdict 的 public facts仅为 fault owner/reason、public transition、
bind/accept、close、captured outbound bytes、从这些 outbound bytes 独立解码的 ACK、route/source/observer/
caller counts，以及后续合法工作的 liveness；不得记录或比较 production actual phase、Error text或任何
内部状态名。每项 public result 都必须绑定 exact vector bytes digest、reachable-context digest、actual
public projection digest和runner digest，不能用一个 create-only smoke test或 aggregate pass/count替代。

Raw 第 79–81 项 `valid-max-stream-method-envelope`、`valid-max-stream-item-envelope`、
`valid-max-node-limit` 的 exact MAX truth只由 installed asset bytes与独立 oracle拥有。Public A 对这三项只
注入 exact bytes并报告其 reachable-context stable projection；不得把 context-dependent bind、fault、route
或其他 public effect称为该 bytes已被“semantic admit”，也不得要求 arbitrary internal near-MAX state可由
public seam注入。和 KAT erratum 相同，fixed-boundary proof 是 installed asset + independent oracle；public
projection只作可达行为 cross-check，不能取代或扩大 fixed truth。

#### Transcript：68 项 action-prefix model 与 62 项 public-A replay 分离

`independentTranscriptResults` 必须恰有 installed `transcripts.json` 中按 scenario array、再按 step array
顺序展开的 68 个 ordered、duplicate-free `transcript:rpc1:<scenario-id>#<step-id>` action-prefix model
results。每个 result 从 canonical initial state对该 selector 截止的完整 action prefix独立重算，不能复制
step `assert`、corpus `covers`、production trace或 Case expected；它必须记录 action-prefix digest、完整
independent expected digest、oracle digest和status。不能以 scenario 最终态、68 个 create-only runs、一个
全套顺序 replay 或 aggregate `68 passed`代替逐 selector result。

以下六个、且仅以下六个 selector 是 `transcriptOracleOnlySelectors`；该 array 必须逐字、按此顺序等于：

```text
transcript:rpc1:session-counter-exhaustion-protected-tail#ordinary-admission-enters-reserved-window
transcript:rpc1:session-counter-exhaustion-protected-tail#existing-cancel-uses-reserve
transcript:rpc1:session-counter-exhaustion-protected-tail#finite-drain-sends-unsequenced-close
transcript:rpc1:protected-tail#ordinary-work-stops-at-protected-window
transcript:rpc1:protected-tail#terminal-and-cancel-converge-without-wrap
transcript:rpc1:max-envelope#maximum-method-and-item-envelopes-pass
```

它们的 exact counter/protected-tail/MAX setup或 complete asserted internal named state不能通过 public A
合法构造或直接观察，故 exact truth只由 installed asset + independent action-prefix oracle拥有；不得用 test
hook、hidden configuration或 private state injection把它们伪装成 public production execution。
`transcript:rpc1:max-envelope#one-mib-plus-one-and-node-plus-one-fail` 仍是 public reachable，不能因同
scenario 的 MAX-pass step 为 oracle-only而移出 public replay。

`transcriptPublicProjectionResults` 必须恰有其余 62 个 selectors，集合精确等于 68 项 ordered selector
set减去上述六项并保持原相对顺序。每一项都必须从 fresh public A 与 fresh controlled Connection 重放该
step的完整 action prefix；stream/call ordinal、seq、binding、connection或其他身份一律使用该次 public A
实际生成、从 outbound bytes独立解码的 identity，禁止把 transcript symbolic identity强塞给 production。
每个 result绑定 selector、action-prefix digest、captured inbound/outbound bytes digests、independently
decoded ACK、stable public projection digest、runner digest与status。不得以一个 create-only transaction、
同一长期实例串跑68步、只核对 aggregate count或读取 corpus `assert`自证。

旧 transcript `assert` 中的 internal named coordinates全部改为下面的 public branch consequences；它们仍可
作为 independent model vocabulary，但不再要求 public A 直接报告或逐字段相等：

- `retainedEvidence` 只通过 captured outbound bytes、独立 ACK decode、connection loss后的 exact replay或
  suppression，以及对应 caller/observer outcome与后续 liveness证明；ACK绝不能从 receipt/internal state读取。
- `resources` 只通过 bind/admission成功或拒绝、route/source/observer/caller counts、close/terminal、释放后
  fresh follow-up admission与 later liveness证明；不得读取reservation、permit、ledger、queue或token。
- `currentBinding` 只通过 public bind/accept/resume transition、实际 connection上的 outbound bytes、旧
  endpoint record的公开后果、fence与close证明；不得读取 binding object、epoch token或private generation。
- `counters` 只通过 public A实际生成并被独立解码的 seq/ordinal/horizon及其边界后的 public effect证明；
  exact near-MAX counter state和未发出的next value仍只属于oracle，不得新增counter getter。
- `nextPermittedRecords` 必须把每个需要验证的后续 action从同一prefix派生为fresh branch，实际注入并比较
  stable public consequence；不得把一张internal allowlist或一次happy-path final state当作验证。
- endpoint phase/state只通过 public transition、bind/accept、fault owner/reason、close、callback/outbound
  ordering与later liveness证明；lexical/json/schema/security/sequence等 phase只归 independent reference
  classification，不从public transition或Error text反推。

#### Exact report、禁止面与 handoff

最终 machine report 必须使用以下 exact names与cardinality：

```text
independentRawResults: 82
rawPublicProjectionResults: 82
independentTranscriptResults: 68
transcriptPublicProjectionResults: 62
transcriptOracleOnlySelectors: 6 (exact array above)
```

Independent rows、public projection rows与这六个 oracle-only receipt rows只是现有 canonical corpus Cases/
Evidence 的machine detail；不新增 E node或selector，不改变Case↔Evidence inverse、fan-out或四节点模型。
Custom Protocol conformance只能证明custom implementation遵守SPI，不能证明built-in installed A的 raw Codec、
state machine或public projection。

为满足这些 gates，严禁新增 public debug/phase/counter API、test hook、dependency injection、额外 export、
private/deep import、source-tree implementation import、global monkeypatch，或把 Error text纳入 verdict；也不得
读取 private generation/reservation/ledger/counter/queue/binding object。所有 production observations必须来自
同一 installed final A 的既有 public Interface。

后续 implementation handoff 必须在同一个 atomic change 中更新 normative `RPC-CORPUS-007` 与
`RPC-CORPUS-011` proposition、matching `specification.test.ts` coverage、nonpublic corpus manifest、machine
report schema、independent raw/transcript oracle、installed-A public runner和final receipt。任一部分仍保留
old phase/internal-state量词、82/82/68/62/6 cardinality不闭合、六项集合漂移、或public/internal truth互相
代替，均必须 fail closed。

本 scoped authority 不改变15 children、49 blocking edges、resolved statuses、DAG、空 fog、无 frontier与
map拓扑；Ticket 15只追加本节的post-resolution audit pointer，map只更新既有Ticket 14/15 gist links。
