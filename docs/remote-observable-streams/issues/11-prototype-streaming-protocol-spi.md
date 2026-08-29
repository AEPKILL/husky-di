# 验证 Streaming Protocol Implementor Interface 与 Transport seam

Type: prototype
Status: resolved
Blocked by: 04, 05, 06, 07, 08, 09
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

用可编译 throwaway TypeScript prototype、一个最小 custom Protocol Adapter 和正反 contract probes，验证 Framework 与 IRpcProtocol 之间承载远程 output stream 所需的最小 semantic ports：subscription admission、item normalization/admission、credit、terminal、unsubscribe/cancel、Recovery、同步 mutation ordering、retained ownership 与 shutdown。Interface 必须足够深，不泄漏 RxJS implementation types、默认 JSON grammar、sequence/ACK、private scheduler或为 method/property 复制两套浅 seams。同步验证 complete-message Transport Adapter seam 是否无需改变，以及 stream load/backpressure conformance 应由 Protocol 还是 Transport 证明。

## Comments

### 2026-08-23 — Candidate prototype evidence

候选结论是“可行，且无需改变Transport seam”。最小stream扩展沿用既有
`reserve -> commit -> start/cancel`，method/property只用一个discriminated request；新增的phase-scoped
semantic ports只有Subscriber `reserveItem/reserveTerminal`、Source `reserveEmission/finish`与Framework
持有的incoming source `finish(outcome, onReleased)`。其中`reserveEmission()`必须在Framework接触raw source value前先消费唯一的
W=1 emission position；Subscriber `reserveItem/reserveTerminal`先冻结projection，Protocol随后提交
disposition/receipt，最后才由projection `commit()`执行Observer effect并以`rearm | closed`回报slot状态；
incoming source `finish(outcome, onReleased)`立即fence source，并只在真实one-shot teardown attempt返回或
抛出后调用`onReleased`退休Source ownership。同步terminal可能发生在`subscribe()`返回前，所以terminal
commit或incoming source `finish()`返回都不能替代这张finish-scoped payload-free receipt。

Recovery继续保留Session与上述capabilities；shutdown继续复用runtime `shutdown()/close()/cleanup()`及
`session.forceClose()`，不增加stream专属Recovery/shutdown端口。Transport仍精确为
`message$ / send(Uint8Array) / close()`，不知道stream、credit或sequence/ACK。除既有Transport Observation
Stream的`Observable`类型外，没有application-stream RxJS类型、默认JSON grammar、wire identity或private
scheduler穿过候选SPI。

Throwaway assets：

- [候选接口、最小custom Protocol与runtime/type probes](../prototypes/streaming-protocol-spi.throwaway/streaming-protocol-spi.prototype.ts)
- [候选verdict、conformance归属与运行说明](../prototypes/streaming-protocol-spi.throwaway/README.md)
- [独立严格TypeScript配置](../prototypes/streaming-protocol-spi.throwaway/tsconfig.json)

已验证：

- `pnpm exec tsc -p .../tsconfig.json`通过，包含method/property正向probe及wire/credit/Transport/RxJS泄漏的
  `@ts-expect-error`反向probe；
- `node .../streaming-protocol-spi.prototype.ts`通过，输出`status=passed`、Transport surface三成员、
  `maxUnsettledSends=1`、Recovery保留Session，并覆盖state-before-effect、W=1同步burst overflow、
  item-before-terminal、retained replay、同步terminal-before-subscribe-return、teardown throw后`onReleased`、
  graceful cutoff与force收敛；
- scoped Biome、repository code-standard checker与scoped `git diff --check`通过。

候选conformance归属：complete-message边界/顺序/稳定bytes、one-unsettled Local Admission、有限native queue、
1 MiB floor与Direct Close属于Transport；W=1 credit/over-credit、overflow、item-terminal ordering、公平性、
retained/replay、Recovery及G/F shutdown属于Protocol。用极小有限queue的stream-unaware Connection做
cross-seam load fixture属于Protocol/runtime probe，不应把stream语义加入Adapter runner。

待只读对手质询的争议：

- 后续wire票必须证明含`1,000,000 B`最大合法value的完整stream record仍落在`1,048,576 B`兼容下限内；
  若失败，先调整Protocol encoding/value budget或其私有fragmentation，而不是直接扩Transport seam。
- 多条W=1 stream仍可能填满有限Transport native queue；当前保证是有界Connection failure后进入Recovery，
  不是任意合法aggregate load永不触及Transport容量。
- 对手审查已确认`finish(outcome, onReleased)`是最小且足够深的teardown-settled receipt；无需独立
  completion object或额外release端口，但仍不能只依赖terminal commit或`finish()`返回。
- 最终conformance case IDs与runner fixture改动留给后续verification票；本票暂不把prototype结果提升为
  normative Answer。

只读对手质询已完成；最终决议与复验证据见下方Answer。

## Answer

现有deep `IRpcProtocol` seam足以承载远程output stream，complete-message Transport Adapter与role runtime
lifecycle seam均无需改变。最终候选沿用outgoing
`reserveStream(request) -> reservation.commit(sink) -> stream.start()/cancel()`；stream method/property只在
同一个discriminated request及Framework source acquisition内分叉，后续reservation、projection、terminal、
Recovery与shutdown生命周期完全共用。

Subscriber Side采用两阶段projection：Framework通过`reserveItem(snapshot)`或
`reserveTerminal(outcome)`冻结一次projection；Protocol随后先提交deliver/suppress disposition、receipt、
ordering与terminal state，最后才调用projection `commit()`执行或suppressed Observer effect。Item
projection只回传`rearm | closed`这一slot语义；不公开credit count、window、horizon、ordinal、ACK、cursor或
scheduler。`next()`内同步unsubscribe会关闭local observation并提交至多一个cancel intent，但不会补credit、
选择全局Stream Terminal或声称remote source已经停止。

Source Side的Framework-to-Protocol port只有`reserveEmission()`与`finish()`：前者在Framework接触raw value
前取得一个W=1 emission position，随后只提交opaque Normalized Application Snapshot；后者只提交安全source
terminal，不携带raw Observable、value或Error。Protocol-to-Framework incoming source control使用
`finish(outcome, onReleased)`：`finish`立即fence source，Framework在真实one-shot teardown attempt返回或
抛出后恰好调用一次payload-free `onReleased`，Protocol届时才退休active Source ownership并允许drain。
同步terminal可能先于`subscribe()`返回，因此terminal commit或`finish()`同步返回均不足；独立completion
object或额外release端口又不增加语义能力，故finish-scoped callback是最小且足够深的receipt。

Recovery保留原Session、Stream、projection authority与Source Subscription，只重放Protocol retained
evidence；不增加`recoverStream`、`replayItem`或source callback重新注册。Graceful/force继续复用runtime
`shutdown()/close()/cleanup()`与`session.forceClose()`。Local observation、Source Subscription、Stream
Terminal、Receive Slot及start/item/credit/cancel/terminal replay evidence分别按自身authority退休，不合并成
一个`dispose`时刻。

Transport仍精确为`message$ / send(Uint8Array) / close()`。完整消息边界、顺序、稳定bytes、single pending
send、Local Admission、有限native queue与Direct Close属于Transport conformance；W=1 credit、over-credit、
overflow、item-terminal ordering、retention/replay、fairness、Recovery与G/F drain属于Protocol conformance。
受限且stream-unaware的Connection可作为Protocol/runtime cross-seam fixture，但Adapter runner不获得stream
identity、credit或capacity接口。

最终throwaway assets：

- [接口、custom Protocol与正反probes](../prototypes/streaming-protocol-spi.throwaway/streaming-protocol-spi.prototype.ts)
- [verdict、运行说明与conformance归属](../prototypes/streaming-protocol-spi.throwaway/README.md)
- [严格TypeScript配置](../prototypes/streaming-protocol-spi.throwaway/tsconfig.json)

最终复验全部通过：

- `pnpm exec tsc -p .scratch/remote-observable-streams/prototypes/streaming-protocol-spi.throwaway/tsconfig.json`；
- `node .scratch/remote-observable-streams/prototypes/streaming-protocol-spi.throwaway/streaming-protocol-spi.prototype.ts`，
  输出`status=passed`、`maxUnsettledSends=1`、`sourceSubscriptions=2`、`sourceTeardowns=2`、
  `recoveryPreservedSession=true`与`inboundOverCreditRejected=true`；
- `pnpm exec biome check .scratch/remote-observable-streams/prototypes/streaming-protocol-spi.throwaway`；
- `pnpm --filter @husky-di/scripts check:code-standard`；
- scoped `git diff --check`。

类型负向证据拒绝raw Observable/value/Error、stream AbortSignal、property args、错误方向terminal、公开
sequence/ACK/credit horizon、Transport capacity/pause及stream-aware send；运行证据覆盖无subscribe无工作、
pre-Outgoing definite non-execution、pre-route resource rejection、retained unknown-member rejection、共用
method/property seam、W=1 boundary 1 overflow、`next()`内unsubscribe不补credit、同步source terminal/late
callback/teardown throw的一次性收敛、Recovery不重订阅或重复Observer、blocked send、inbound over-credit、
Active Stream子上限、protected terminal headroom及G/F convergence。

对手同意将最大1 MiB record的精确wire证明、持续aggregate load/backpressure、完整counter-tail corpus及
broken custom Protocol conformance留给后续wire与verification tickets；这些不再构成本票接口未决。
