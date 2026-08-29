# Wayfinder 地图：为 Remote RPC 引入可恢复 Observable 流

Label: wayfinder:map
Status: resolved

## Destination

清除 @husky-di/remote 为远程方法返回的 RxJS Observable 与可直接观察的远程 Observable 属性提供生产级支持前仍需作出的全部产品与架构决策。地图完成后，规范编写者应能原子改写现有 husky-di-rpc/1、caller-facing/Protocol Interface、wire assets 与验证契约，并移除 resolveAll()，而无需再发明行为、边界或权衡。

## Notes

- 权威领域词汇以根目录的 [CONTEXT.md](../../CONTEXT.md) 为准；领域词汇在相应 decision ticket 解决时同步更新。
- 每个决策会话都应使用 grilling、domain-modeling、codebase-design 和 ponytail；prototype ticket 还应使用 prototype，research ticket 应使用 research。
- [协议可替换的双向 RPC 框架](../remote-rpc-framework/map.md) 是现有 unary、Recovery、资源、安全与关闭保证的决策来源；其“streaming 不在 v1 范围内”和保留 resolveAll() 的边界曾由本地图有意重新打开，其中 Group/resolveAll() 路线已由 [界定 v1 草案原地改写与 resolveAll() 移除边界](issues/03-define-v1-rewrite-and-resolve-all-removal.md)关闭为删除。
- 本地图只完成规划与规范路线，不实施生产代码。后续代码变更必须使用 husky-di-code-standard，并在同一变更中更新 normative specification 与 matching specification.test.ts coverage。
- RxJS Observable 是唯一新增的 application-stream Interface。不支持 Observable 参数、AsyncIterable、ReadableStream、Promise-wrapped 或嵌套 Observable，也不提供 Subject 专属远程写入能力。
- 流成员只有两种：返回直接 Observable 的方法，以及 Descriptor 显式 allowlist 的只读 Observable 属性，例如 remote.message$。
- 返回 Observable 的远程方法是 cold 的：调用方法只创建本地 Observable；每次 subscribe 独立启动一次远程方法执行与 source subscription。
- 每次本地 subscribe 拥有一个独立远程订阅；unsubscribe 必须传播远端 teardown。Framework 不隐式 share、cache 或 replay，source 的 hot/cold/replay 行为由 application 决定。
- Framework 必须提供逐项有序、无静默丢弃、有限内存的隐藏式流控；不增加 caller-facing request(n) Interface。容量无法维持时必须以明确终止收敛。
- 同一 Logical Session 成功 Recovery 后，远程 source subscription 与订阅身份保持不变；未确认的 item/terminal 可重放，但本地 observer 不得看到重复或乱序。
- 远程 source error 不传输 raw Error、message、stack 或 cause；caller 只看到安全的 RpcException(handler-failed)，可预期的领域失败仍作为 Application Value 建模。
- 活跃远程订阅属于 graceful drain；shutdown() 等待其 complete/unsubscribe 直到现有绝对 deadline，随后走 force teardown。
- 每个远程订阅只产生 payload-free 的 started/finished 生命周期 observation；公共 telemetry 不逐项发事件。
- 保持 profile identifier husky-di-rpc/1，把当前 unary profile 视为未发布草案并原地整体替换；不兼容当前草案 wire，不新增 v2 或桥接层。
- 从公开 Interface 移除 resolveAll() 与 Remote Service Group 路线；多 peer 调用和 Observable 组合由 peers/peers$、peer.resolve()、Array.prototype.map() 与 RxJS 完成。
- 所有当前相关表面都必须闭合：Descriptor、exposure、single-peer facade、errors、events、Recovery、resources、shutdown、custom Protocol SPI、Transport seam、conformance、wire corpus、browser/package evidence 与文档。

## Decisions so far

- [审计 Observable 流 Wayfinder 并交接规范](issues/15-audit-wayfinder-specification-handoff.md) — 终审确认15个child、49边DAG、空fog与无open frontier；最新[scoped raw/transcript public-observability审计](issues/15-audit-wayfinder-specification-handoff.md#2026-08-24-post-resolution-scoped-rawtranscript-public-observability-audit)保持resolved拓扑不变，implementation/production acceptance仍须通过既有gates。
- [决定流支持的规范验证、wire corpus 与发布证据](issues/14-decide-stream-verification-release-evidence.md) — 经圆桌主席终审固定requirement/case/evidence/release合同；最新[scoped raw/transcript public-observability erratum](issues/14-decide-stream-verification-release-evidence.md#2026-08-24-scoped-rawtranscript-public-observability-erratum)精确分离82/82 raw与68/62/6 transcript oracle/public authority，不改IDs、fan-out、public API或其余gates。
- [验证最终流式 caller-facing 与 exposure Interface](issues/13-validate-final-stream-interface.md) — 以可编译 throwaway prototype 固定 mixed unary/stream Descriptor、single-Peer caller/exposure、cold per-subscription ownership、安全 errors/telemetry、Recovery/G/F 与三层 publication authority，并以 P01–P12、B1–B4/R1–R4 的 Node/browser fixture 证据闭合拟议合同；production 与 installed-package acceptance 留给后续发布证据决策及 implementation。
- [决定 husky-di-rpc/1 流式 wire grammar 与状态机](issues/12-decide-v1-streaming-wire-state-machine.md) — 原地固定两个start kind、direction-local Stream/Item Ordinal、W=1累计credit、complete/error terminal矩阵、唯一seq/ACK replay与Recovery barrier、protected tail和1 MiB envelope边界，并要求schema/raw/transcript/security corpus整体替换且保持unary独立退化。
- [验证 Streaming Protocol Implementor Interface 与 Transport seam](issues/11-prototype-streaming-protocol-spi.md) — 以非JSON custom Protocol与正反probes确认统一stream request、两阶段Observer projection及`finish(outcome, onReleased)` teardown receipt足以承载W=1、retained ownership、Recovery和G/F语义，同时保持既有complete-message Transport与role runtime seam不变。
- [决定 Application Stream 的公开观测与 telemetry](issues/10-decide-application-stream-observability.md) — 以独立side-local `stream-started`/`stream-finished` pair区分owning Remote Observable与non-owning Observation Stream，固定Admission/cancel first-winner、方向化count/closed safe outcome、Source-only teardown flag与finished-before-close ordering，并保持Recovery单pair且无逐item telemetry。
- [决定流订阅在 graceful shutdown 与 force close 下的收敛](issues/09-decide-stream-shutdown-force-convergence.md) — 固定G只冻结admission roots、既有流及其完整evidence继续drain；F先批量fence Session再按authority投影terminal与one-shot teardown，并复用既有双deadline、Direct Close和first-winner规则有限释放Framework/Protocol/RxJS ownership。
- [决定流订阅的资源核算、调度与公平性](issues/08-decide-stream-resources-scheduling-fairness.md) — 以共享Application Work硬上限加Active Stream子上限同时约束unary与stream，固定单credit receive backing、阶段转移式retained accounting、protected counter tail、Recovery-first双lane与per-stream round-robin，并把ordinary shortage、overflow及Session fault收敛到最小范围。
- [决定 Stream Item 的确认、去重、重放与 Recovery](issues/07-decide-stream-delivery-replay-recovery.md) — 固定 direction-local Stream Ordinal、per-stream Item Ordinal与terminal boundary，先提交deliver-once/suppressed disposition再调用Observer；所有stream消息复用单一累计Message Receipt ACK与原seq replay，Recovery使用session-direction frozen barrier加其后retained unsent FIFO，evidence分方向退休且所有counter永不wrap。
- [决定 RxJS push source 的有界流控契约](issues/06-decide-bounded-push-flow-control.md) — 采用 item-count Stream Admission Credit 与独立 retained-byte ledgers，start携带非零 initial window并在 Observer `next()`同步返回后累计补充；zero-credit/ordinary-capacity emission以 Source-Side `overflow`安全终止，Recovery延续原credit state，且不增加`request(n)`、公开window、Transport capacity或bootstrap fingerprint。
- [决定远端 source observation、终止、取消与 teardown](issues/05-decide-source-observation-terminal-teardown.md) — 固定 pre-Admission Route Capture cutoff、一次 Source Start Job、package-private exactly-once source adapter、同步重入与正常 retained items-before-terminal 规则、Source-Side cancel authority、Recovery continuity、one-shot teardown 和安全 Observer projection；统一 route failure 为 `unknown-member`，source failure 复用 `handler-failed`，teardown failure 仅为本地 incident。
- [原型化流成员 Descriptor 与单 Peer facade Interface](issues/04-prototype-stream-descriptor-peer-facade.md) — 确认一个 `members` namespace 与 `unary`/`stream-method`/`stream-property` 显式 kind；限定 direct Observable、readonly `$` property、unary-only `AbortSignal` 与 local `isObservable()` guard；固定 opaque invariant Descriptor、single-Peer frozen facade identity，以及 state-neutral access/call、cold per-subscription preflight 和 recovering identity-free Pending 行为，并继承既定的 Group/`resolveAll()` 删除边界。
- [决定远程 Observable 订阅的领域模型与生命周期](issues/02-define-remote-observable-domain-lifecycle.md) — 将每次 `subscribe()` 建模为独立、双向且可跨 Recovery 延续的 Logical Stream Subscription，分离 owning Application Stream 与 non-owning Observation Stream，并固定分层 admission、item、terminal、teardown 和 Framework/Protocol/source ownership 词汇。
- [界定 v1 草案原地改写与 resolveAll() 移除边界](issues/03-define-v1-rewrite-and-resolve-all-removal.md) — 将未发布 unary `/1` 一次性原地替换为最终 streaming contract：不升级 Profile、不兼容旧构建、Session、wire 或 source；删除 resolveAll()/Group/RpcPeerResult，显式组合只建立在 peers/peers$、peer.resolve() 与原生 JS/RxJS 上。
- [调研 RxJS 与可恢复推送流的订阅、流控和恢复先例](issues/01-research-rxjs-resumable-push-stream-precedents.md) — 确认 RxJS 只有 push/cancel 而无 demand/ACK；内部 credit 只能约束 bridge/wire，有限无损必须有显式容量终止边界；Reactive Streams、RSocket 与 gRPC 均分离发送许可、retained-byte/frame evidence 和 application processing。

## Not yet specified

## Out of scope

- 本地图内的 production implementation、规范正文改写、specification.test.ts 实施和 implementation ticket 切片。
- Observable 输入参数、client-streaming、duplex streaming 与 remote Observable capability passing。
- 新的 Remote Service Group、Group streaming 或 resolveAll() 替代 facade；移除既有 resolveAll() 本身在范围内。
- AsyncIterable、ReadableStream、Promise-wrapped/nested Observable 与 Subject mutation Interface。
- Framework 隐式 share、cache、application-level replay，或独立 notification primitive。
- husky-di-rpc/2、与当前 unary 草案兼容的桥接层、双 profile 运行模式或滚动混跑保证。
- wire fragmentation、超过既有单项 Application Value/message 上限的 stream item。
- 具体 WebSocket 或其他 Transport Adapter 包的 production 改造。
- 业务认证、授权、限流、payload diagnostics，以及 raw application error 跨线。
- 进程重启后的持久化 Stream Recovery、exactly-once 外部副作用和第二语言 SDK 实现；跨语言 wire contract 仍在范围内。
