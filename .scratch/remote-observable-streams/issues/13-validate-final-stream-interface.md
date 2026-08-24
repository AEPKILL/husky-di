# 验证最终流式 caller-facing 与 exposure Interface

Type: prototype
Status: resolved
Blocked by: 03, 04, 05, 06, 07, 08, 09, 10, 11, 12
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在全部行为与 Protocol decisions 完成后，产出一份可编译的最终 throwaway prototype，使规范编写者不再需要发明 caller-facing 或 exposure 行为。覆盖 mixed unary/stream Descriptor、streaming method、Observable property、single IRpcPeer expose/resolve、resolveAll/Remote Service Group exports 的移除、每次 subscribe 独立资源、无订阅无工作、teardown、errors、telemetry、Recovery、shutdown、custom Protocol projection、Node/browser consumer 与 root export inventory；包含正反类型 probes、同步 source/reentrancy runtime probes、Promise assimilation、防 thenable、跨 Recovery trace 和 peers.map 组合示例。该 prototype 不是 production implementation。

## Answer

采用 [Final stream Interface throwaway prototype](../prototypes/final-stream-interface.throwaway/README.md)
及其可编译、可执行资产，作为规范与后续实现必须逐项实现的**拟议最终
caller-facing/exposure 合同**。该资产已通过三席 SEALED PASS 与独立主席 CHAIR PASS；
它固定接口和可观察行为，但仍是 throwaway prototype，不是当前 production
implementation、package export 或 normative specification。

### Caller-facing 与 exposure 合同

- 非空 opaque Descriptor 只有一个 exact `members` namespace；成员只允许
  `{ kind: "unary" }`、`{ kind: "unary", cancelable: true }`、
  `{ kind: "stream-method" }` 或 `{ kind: "stream-property" }`。Descriptor 对服务类型
  `T` 与 exact selected `Members` 双向 invariant。Cancelable unary 只有精确尾部
  `AbortSignal` control slot。
- Stream method 必须直接返回 `Observable<Item>`；stream property 必须 required、
  `readonly`、以 `$` 结尾并直接为 Observable。Observable/`AbortSignal`/
  `PromiseLike`/`AsyncIterable`/`ReadableStream` capability 不得出现在 stream 参数或 item；
  Promise-wrapped、nested、interop-only、`any` 与 `never` stream shape 均拒绝。Unary
  qualification 同时检查 raw `ReturnType` 与 `Awaited<ReturnType>`：普通
  `Promise<ApplicationValue>` 仍是 unary，`Observable & PromiseLike` 只能是 stream。
- Application-owned `Subject<Item>` 可以作为本地 source，但 remote facade 必须窄化为
  `Observable<Item>`，不暴露 `next/error/complete`。
- `expose()` 与 `resolve()` 只属于单个 `IRpcPeer`。`resolve()` 产生 frozen、null-prototype、
  exact selected enumerable data-member facade；facade 与 Remote Observable 均不可 thenable，
  destructured method 保留 captured receiver，同一 facade 的 closure/property identity 稳定，
  每次 stream-method call 创建新的 cold Observable。
- `subscribe()` 是唯一 work/resource root。resolve、property read、method call、Promise
  assimilation 与 recovering retained object 都不执行 getter/method/source work；每次被接受的
  subscribe 独立拥有 normalization snapshot、observation、Stream Identity、capacity、source
  acquisition/subscription、terminal、teardown 与 release。Method arguments 只先捕获引用，
  每次 subscribe 再独立 normalize。
- Source bridge 使用 W=1、两阶段 reserve/disposition/effect projection、contiguous
  disposition frontier、exact retained evidence 与 `finish(outcome, onReleased)`。同步
  source/reentrancy 下先提交 terminal winner/boundary/evidence，再执行 Observer、teardown、
  release 与 retirement；只有 explicit unsubscribe 拥有 cancel authority。
- Recovery 保持 facade、Observable、Stream Identity、两侧 observation id、source
  subscription 与 terminal state 连续；lost ACK 只重放 retained evidence，Observer 不得重复
  item/terminal，也不得重跑 getter/method/source subscription/teardown。
- Source/application failure 只投影安全 code；不跨线暴露 raw Error/message/stack/cause。
  Telemetry 是 payload-free、side-local 的 qualifying `stream-started`/`stream-finished` pair，
  不逐 item 发事件；item effect 必须早于 finished，随后才是 peer-closed、topology-closed 与
  `event$` completion。
- Graceful cutoff G 先拒绝新 root/captured pre-Admission work。Connected-at-G 只 drain
  已有 admitted stream；recovering-at-G 永久关闭 Recovery gate 并进入 F。F 先跨 Session
  fence/选 winner，再执行 lifecycle/Observer/teardown effect；identity-free work 得
  `unavailable`，无 terminal authority 的 admitted Subscriber 得 `outcome-unknown`，未决 Source
  得 `terminated`。首次 `shutdown()`/`close()` 建立唯一缓存 termination task，所有 cross-mode
  调用返回同一对象并由 graceful/F convergence 一次 settle。
- 拟议最终表面删除 `resolveAll()`、Remote Service Group、`RpcPeerResult` 与旧 direction/
  error/policy vocabulary，不提供替代 Group facade。应用从 frozen `peers` snapshot 调用
  `Array.prototype.map()` 与显式 Promise/RxJS operators；并发、错误、取消、关联及 wait policy
  属于 application，每个 child 仍是独立 Logical Stream。
- 拟议 root、`/protocol` 与 `/transport` exact runtime/type inventories 固定在
  [`PROPOSED_*_EXPORTS`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts)
  fixture；custom Protocol 只接收统一 stream request、两阶段 projection 与 one-shot
  `finish(outcome,onReleased)`，不暴露 raw Observable/value/Error、credit/seq/ACK、recovery/
  replay control 或 Transport capacity/pause seam。

### 三层 publication authority

1. **Recovery continuation authority**：每次 `enterRecovery()`/`recover()` 捕获 generation；
   新 continuation、G 或 F 永久使旧 token 失效。每个 retained replay/application effect
   返回后，以及 connected、`peer-recovered`、Pending Admission 前都复检。
2. **Session transition authority**：G 捕获 Session continuation generation，并在每个 peer
   state、`ownerDraining`、`peerDraining` 与 captured-stream application callback 返回后复检；
   F 增加 generation 后，旧 G 立即停止。Identity-free Pending 尚未完成 recovered handoff 时，
   G 仍按 recovering snapshot 进入 F，不能留下已 settle task 但悬置 Pending 的第三态。
3. **Observer publication authority**：`SideRuntime.state$` 用单调 publication generation
   逐 subscriber 过滤被同步重入取代的旧 state；`SerializedEventBus` 让可撤销 Recovery/G
   lifecycle event 携带同一 authority predicate，并在出队与逐 subscriber effect 前复检。
   已提交 telemetry、terminal 与 F/closed tail 保持 permanently authoritative FIFO，任何
   `closed` winner 后都不得再观察到 stale connected/recovering/draining 或 recovered event。

### R1–R4 与 B1–B4 证据

| Gate | 固定的结论 | 可执行证据 |
| --- | --- | --- |
| R1 callback/close | 固定容量同步 deferred-effect runner；terminal evidence 早于 teardown，teardown 早于 `onReleased`/retirement/finished；explicit unsubscribe 才可 cancel | [`probeSynchronousRxjsAndReentrancy()`、`probeShutdownCutoffs()`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts) |
| R2 recovering G | G 区分 connected drain 与 recovering force，永久 fence late bootstrap/send/Admission/Source Job/Recovery authority；F 先批量 fence/选 winner | [`probeShutdownCutoffs()`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts) |
| R3 raw/awaited types | raw 与 awaited unary result 同时 qualification；普通 Promise unary 合法，hybrid stream 合法但 hybrid unary 非法；55/55 negative directives 被消费 | [`final-stream-interface.type-probes.ts`](../prototypes/final-stream-interface.throwaway/final-stream-interface.type-probes.ts)、[`probeRuntimeSourceQualification()`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts) |
| R4 composition | `peers.map` 组合维持 child 独立；outer unsubscribe 传播且 teardown(A) 重入 B emission 不产生 outer late value、重复 cancel/terminal 或复活 | [`probePeerComposition()`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts) |
| B1 Recovery continuation | replay -> Observer effect -> shutdown 后旧 continuation 不得继续 replay、connected、`peer-recovered` 或 Pending Admission | [`probeRecoveryContinuationAuthority()`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts) |
| B2 termination task | close -> close、close -> shutdown、shutdown -> close 严格共享同一 Promise，最终都 settle 且一次 convergence | [`probeUniqueTerminationTask()`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts) |
| B3 R1 closure | same-source second-next、complete、error 分别独立证明 overflow/completed/handler-failed；callback 尾部仍无提前 terminal/finished/retirement/release | [`probeSynchronousRxjsAndReentrancy()`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts) |
| B4 recovered handoff/publication | connected 或 `peerRecovered` callback 中的 G 对 Pending 只有 admitted-and-drained 或 unavailable/forced 两种终局；nested connected -> G -> draining -> F 不得在 closed 后回写 state/event | [`probeRecoveredPublicationPendingHandoff()`、`probeNestedTerminationPublicationAuthority()`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts) |

### P01–P12 evidence locations

完整逐项判定与边界记录在
[`README.md` 的 P01–P12 matrix](../prototypes/final-stream-interface.throwaway/README.md#p01p12-evidence-matrix)。

| Gate | Evidence location |
| --- | --- |
| P01 Descriptor/type | [`final-stream-interface.type-probes.ts`](../prototypes/final-stream-interface.throwaway/final-stream-interface.type-probes.ts):45–273；runtime prototype:3336 `probeDescriptorRuntime()` |
| P02 direct Observable only | type probes:279–453 `InvalidCapabilities`，显式覆盖 `ReadableStream`/AsyncIterable/PromiseLike/nested/args/items/`never` |
| P03 Subject narrowing | type probes:45–50、108、133–138 `applicationOwned$` 与 remote `next/error/complete` negatives |
| P04 facade/thenable | runtime prototype:3483 `probeFacadeAndColdness()`、:3738 `probeRuntimeSourceQualification()` |
| P05 lazy/cold | runtime prototype:3483 `probeFacadeAndColdness()`、:3833 `probeAdmissionCancellation()` |
| P06 sync/reentrancy | runtime prototype:3949 `probeSynchronousRxjsAndReentrancy()`，使用真实 RxJS |
| P07 Recovery | runtime prototype:4768 `probeRecoveryContinuity()`、:4992 `probeRecoveryContinuationAuthority()`、:5367 `probeRecoveredPublicationPendingHandoff()`、:5775 `probeNestedTerminationPublicationAuthority()` |
| P08 telemetry/FIFO | runtime prototype:6228 `probeTelemetryAndFifo()` 及 Recovery/cancel/overflow/close probes |
| P09 G/F/Close | runtime prototype:5367、:5775、:6547 `probeShutdownCutoffs()`、:7418 `probeUniqueTerminationTask()` |
| P10 custom Protocol | type probes:461–536 的 SPI negatives；runtime prototype:7651 `probeProtocolProjectionAndRelease()` |
| P11 exports/consumers | runtime prototype:877–973 exact inventories、:7774 `probeProposedExportInventory()`；type probes:538–588；[`node-consumer.mts`](../prototypes/final-stream-interface.throwaway/node-consumer.mts)、[`node-consumer.cts`](../prototypes/final-stream-interface.throwaway/node-consumer.cts)、[`browser-consumer.ts`](../prototypes/final-stream-interface.throwaway/browser-consumer.ts) |
| P12 composition | runtime prototype:7855 `probePeerComposition()` |

除显式链接的 type/consumer 文件外，上表 runtime symbols 均位于
[`final-stream-interface.prototype.ts`](../prototypes/final-stream-interface.throwaway/final-stream-interface.prototype.ts)，
入口为 `runFinalStreamInterfacePrototype()`。

### 验证命令与结果

从仓库根目录运行；bundle 只写入 `/tmp`：

```sh
packages/remote/node_modules/.bin/tsc -p .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/tsconfig.json --pretty false
packages/remote/node_modules/.bin/tsc -p .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/tsconfig.nodenext.json --pretty false
packages/remote/node_modules/.bin/tsc -p .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/tsconfig.browser.json --pretty false
packages/remote/node_modules/.bin/esbuild .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/node-consumer.mts --bundle --platform=node --format=esm --target=node24 --outfile=/tmp/husky-ticket13-node-esm.mjs
node /tmp/husky-ticket13-node-esm.mjs
packages/remote/node_modules/.bin/esbuild .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/node-consumer.cts --bundle --platform=node --format=cjs --target=node24 --outfile=/tmp/husky-ticket13-node-cjs.cjs
node /tmp/husky-ticket13-node-cjs.cjs
node .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway/run-browser-probe.mjs
pnpm exec biome check .scratch/remote-observable-streams/prototypes/final-stream-interface.throwaway
pnpm --filter @husky-di/scripts test:code-standard
pnpm --filter @husky-di/scripts check:code-standard
```

最终记录：strict bundler、relative-source NodeNext `.mts/.cts`
(`skipLibCheck:false`) 与 DOM-only compile 均为 0 diagnostics，55/55
`@ts-expect-error` 均被真实消费；bundled Node ESM/CJS 的全部 P01–P12 runtime assertions
通过；Chromium、Firefox、WebKit DOM fixture 均通过；Biome 9 files 无诊断；repository
code-standard checker 与 33/33 tests 通过。

### Production negative baseline 与交接

以上 PASS 只固定 proposed relative-source/bundled fixture。当前 production 仍保留
`RpcCallDirectionEnum` 与 root type `RpcPeerResult`
（[`packages/remote/src/index.ts`](../../../packages/remote/src/index.ts)），内部
`RemoteServiceGroup` support type（不是 package-root named export）与
`IRpcAcceptor.resolveAll()` runtime method
（[`rpc-caller.interface.ts`](../../../packages/remote/src/interfaces/rpc-caller.interface.ts)、
[`rpc-acceptor.impl.ts`](../../../packages/remote/src/impls/rpc-acceptor.impl.ts)），以及
`unknownMethod`、`maxPendingInvocationsPerSession` 等旧 vocabulary。当前 production
SPECIFICATION、specification tests 与 packed-consumer fixtures 也仍验证旧表面；本票没有
修改、pack 或宣称它们已闭合。

NodeNext 成功只证明相对源码 fixture，esbuild 成功只证明 bundled throwaway runtime；二者
均不证明 installed package exports、emitted declarations、package resolution 或 production
consumer acceptance。真实 normative specification/`specification.test.ts` 改写、旧 surface
删除、actual package tarball 安装，以及 isolated Node ESM/CJS、NodeNext `.mts/.cts`
(`skipLibCheck:false`) 与 DOM-only browser consumer matrix，归
[决定流支持的规范验证、wire corpus 与发布证据](14-decide-stream-verification-release-evidence.md)
和后续 implementation acceptance；其完成后再由
[审计 Observable 流 Wayfinder 并交接规范](15-audit-wayfinder-specification-handoff.md)
审计最终规范交接。

## Comments

### 2026-08-23 candidate for opponent re-review

已把只读对手 PRELIMINARY P01–P12 全部纳入候选，并保持本票
`claimed`；在对手明确 PASS 前不写 `Answer`、不改 `resolved`、不推进 map。

候选资产全部位于
`prototypes/final-stream-interface.throwaway/`：

- `final-stream-interface.prototype.ts`：单一最小 Logical Stream fake，含
  mixed facade、real RxJS sync/reentrancy、Recovery、telemetry FIFO、G/F、
  两阶段 Protocol projection/release 与 `peers.map` composition assertions；
- `final-stream-interface.type-probes.ts`：strict 正反类型 probes，所有
  `@ts-expect-error` 均由实际诊断消费；
- `node-consumer.mts` / `node-consumer.cts`、`browser-consumer.ts`、
  `run-browser-probe.mjs`：只验证拟议 fixture，不冒充 production package
  acceptance；
- `README.md`：接口摘要、拟议 runtime/type exact inventory、P01–P12 evidence
  matrix、复现命令、attack traces、残余争议与 production handoff。

当前候选结果：strict noEmit 0 diagnostics；拟议 fixture NodeNext `.mts/.cts`
在 `skipLibCheck:false` 下 0 diagnostics；bundled Node ESM/CJS 均通过；DOM-only
bundle 在 Chromium/Firefox/WebKit 均通过。P11 仍明确标为“proposed fixture
contract + current production negative baseline”，不是 production PASS。

只读 production baseline 仍可找到 `RpcCallDirectionEnum`、root type
`RpcPeerResult`、`IRpcAcceptor.resolveAll`、`unknownMethod` 与
`maxPendingInvocationsPerSession`；本票没有修改或 pack production，也没有声称
production NodeNext 已通过。`Object.keys()` 只用于拟议 runtime fixture，不能证明
type-only export 已删除。

请对手按 README 的 P01–P12 matrix 与独立命令攻击复审，重点复核 NodeNext、同步
source/Observer reentrancy、Recovery exact replay/terminal、telemetry FIFO、
`finish(outcome,onReleased)` release latch，以及 proposed-vs-production 边界。

### 2026-08-23 revised candidate for formal re-review (R1–R4)

按 CHAIR BLOCK 仅修订获准的 throwaway candidate，并继续保持本票 `claimed`；没有
写 `Answer`、没有改 map/04–12/CONTEXT/production，也没有 pack production。

- R1：`LogicalStream` 现在使用固定两槽、同步 FIFO deferred-effect runner；Source
  terminal winner/boundary/evidence 与 Subscriber disposition 先提交，terminal evidence
  严格早于 teardown，item callback 期间只排队 terminal/outgoing/retirement effect；
  `closed` 不再解释为 cancel，只有 Observable 的显式 teardown 拥有 cancel authority。
  `FrameworkIncomingStream` 分离记录 teardown-attempt 与 `onReleased`，force/graceful Close
  等待 callback、one-shot teardown/release latch、两侧 resource 与 logical stream 全部收敛。
  `probeSynchronousRxjsAndReentrancy()` 与 `probeShutdownCutoffs()` 新增同源
  second-next/complete/error、unsubscribe-in-next、next-close、teardown-close-then-throw，
  并断言 callback depth 1、唯一 winner/evidence/release、只有显式 unsubscribe 的
  `wireCancels === 1`、其余 close/terminal cases 为 0、incident bit 安全，以及
  `source.terminal-evidence < source.teardown-attempt < source.on-released <`
  `source.retirement < telemetry.incoming.finished` 和
  `stream-finished < peer-closed < topology-closed < event$ complete`。
- R2：G 先快照 connected/recovering 并永久关闭 Recovery gate；connected 继续正常
  drain，recovering 立即复用既有 `graceful-shutdown` reason 进入 F。F 在任何
  `ownerClosing`/Observer/teardown effect 前跨全 Session fence 并选择 unwon Source
  terminal。综合攻击在同一 recovering Session 放入 active admitted、captured、queued
  Source Job 与 identity-free Pending；`ownerDraining`、`ownerClosing` 和 post-F 的 late
  bootstrap/send settlement、admission/job/recover/source callbacks 均不能新增 binding
  progress、Admission、identity、wire、acquire、subscribe、replay、credit 或
  `peer-recovered`。三个 admitted Subscriber 各得一次
  `outcome-unknown`，Pending 得一次 `unavailable`，两个 admitted Source 各保留
  `terminated` winner/evidence，真实 active source teardown 一次且所有资源归零。
- R3：`HasUnsupportedUnaryResult` 同时检查 raw `ReturnType` 与
  `Awaited<ReturnType>`。普通 `Promise<ApplicationValue>` unary 与
  `Observable & PromiseLike` stream 是正例；hybrid-as-unary 是真正第 55 条负例。
  type-probes 现有且仅有 55 条实际 directive，strict 编译 0 diagnostics、55/55 全消费。
  runtime hybrid 使用同一交叉类型，直接 subscribe 一次且 `then` 调用固定为 0。
- R4：`probePeerComposition()` 让 child A teardown 同步触发 child B emission，再重复
  outer unsubscribe 并发送 late values/terminals。外层没有 post-unsubscribe value、
  complete 或 error；两 child 各 cancel/teardown/terminal 一次、资源归零且不可复活。
  两个 Logical Stream/Session 仍独立，不承诺或重建 Group normalization、atomicity、
  wait-all。

复验结果：strict bundler、relative-source NodeNext `.mts/.cts`
(`skipLibCheck:false`) 与 DOM-only compile 均 0 diagnostics；55/55 directives；本地
prototype 的 esbuild-bundled Node ESM/CJS runtime assertions 全通过；Chromium、Firefox、
WebKit 均通过；targeted Biome 无诊断；repository code-standard checker 与 33 tests 全通过；
受限 diff/whitespace 检查通过。

P11 边界不变且进一步收紧：NodeNext 只证明相对源码 fixture，esbuild 只证明 bundled
runtime；两者均不证明 installed package exports、emitted declarations 或 package
resolution。真实 tarball/install matrix 归 Ticket 14 / implementation acceptance；当前
production negative baseline 仍未闭合。请三席仅对本次 R1–R4 revised candidate 做正式
PASS/BLOCK 复审。

### 2026-08-23 second revised candidate for formal re-review (B1–B3)

按第二轮 FORMAL BLOCK 仅修订获准的 throwaway candidate，并继续保持本票
`claimed`；没有写 `Answer`、没有改 map/Status/Question/04–12/CONTEXT/production、
consumer 或 tsconfig，也没有提交或 pack production。

- B1：每次 `recover()` 现在捕获独立 Recovery-continuation generation；新
  continuation、G 与 F 都立即使旧 token 永久失效。每个 retained replay/application
  effect 返回后，以及 connected、`peer-recovered`、Pending Admission 前均复检 token
  与 G/F gate。evidence 保持活队列以允许有 authority 的 callback-added terminal，
  但 replay -> Observer next -> `shutdown()` 会在第一项后停止，F 追加的 terminal 不会
  成为第二个 replay body。新 probe 同时放入 admitted active 与 identity-free Pending，
  断言两侧保持 closed、`event$` 各完成一次、无 `peer-recovered`/Pending Admission、
  resource/stream set 归零，late bootstrap/send/recover/source callback 无 authority。
- B2：首次 `shutdown()`、public `close()` 或 internal `forceClose()` 在 finalization 前
  共同建立一个缓存 termination task；graceful/F convergence 都 resolve 该对象。
  `PrototypeAcceptor.close()` 不再使用会改 Promise identity 的 `async` wrapper。新 probe
  分别断言 close -> close、close -> shutdown、draining shutdown -> close 严格返回同一
  Promise 且 settlement；每侧唯一 telemetry pair 与一次 `event$` completion、一次
  Source teardown、零 resource/state、post-close 调用 identity 稳定且不能复活。
- B3：同源 second-next、complete、error 已拆成三个 fresh parameterized case，分别
  证明 overflow、completed、handler-failed winner。三例及 unsubscribe-in-next、
  next-close 都在真实 Observer callback 尾部断言 Subscriber terminal/outgoing finished/
  Source retirement/incoming finished 尚为零且两侧 resource 仍持有；回栈后断言精确
  callback/release ordering、depth 1、全部 tail assertions 实际执行。只有 explicit
  unsubscribe 的 `wireCancels`/`cancel.intent` 为 1，其余 terminal/close case 为 0。

R1/R2/R3/R4 全量回归仍通过：strict bundler、relative-source NodeNext `.mts/.cts`
(`skipLibCheck:false`) 与 DOM-only compile 均 0 diagnostics；bundled Node ESM/CJS 全部
runtime assertions 通过；Chromium/Firefox/WebKit DOM fixture 通过；targeted Biome 无
诊断；repository code-standard checker 与 33 tests 通过；受限 diff/whitespace 检查仅含
本轮获准目标。P11 仍只是 relative-source/bundled fixture 证据，不是 installed package、
declaration、resolution 或 production acceptance。请原三席仅对 B1–B3 second revised
candidate 正式复审；在 PASS 前仍不落 `Answer`/`resolved`/map。

### 2026-08-23 third revised candidate for formal re-review (B4)

按第三轮 Recovery/Close FINAL BLOCK 仅修订获准的 throwaway candidate，并继续保持
本票 `claimed`；没有写 `Answer`、没有改 Status/map/production/consumer/tsconfig/
Tickets 04–12，也没有提交或 pack production。

B4 的最小根修复位于共享 G cutoff：`pendingStreams` 只会由 Recovery 中的
`beginStream()` 写入，因此 `#recovering === false && pendingStreams.size > 0` 精确表示
同步 recovered-publication/Pending-handoff 窗口。`shutdown()` 现在把该窗口并入
`recoveringAtGracefulCutoff`，复用既有 Recovery -> F 分支；在所有 identity-free Pending
完成 Admission 或被 force 前，public connected/`peer-recovered` callback 中的 G 都不会
误走 connected drain，也不会留下第三态。普通 connected drain 行为未改变。

`probeRecoveredPublicationPendingHandoff()` 使用两个 fresh Session 独立攻击：

1. left `state$` 的 connected callback 同步调用 `shutdown()`；
2. left `peerRecovered` event callback 同步调用 `shutdown()`。

两例都包含一个 admitted active stream 和一个 identity-free Pending，并断言同一
termination task settlement、双侧 closed、active Subscriber 一次 `outcome-unknown`、
Pending 一次 `unavailable` 且不获 identity/Source authority、active/pending/captured/queued
set 与 local/Source resources 全归零、两侧 `event$` 各完成一次、两侧 qualifying
telemetry observation 都是唯一 exact started/finished pair。旧 Recovery continuation 只
记录一次 invalidation；late recover/bootstrap/send/admission/job/source/root 攻击不能新增
identity、Admission、subscription、replay、telemetry 或 application effect。

B1/B2/B3 与 R1–R4 全量回归仍通过：strict bundler、relative-source NodeNext
`.mts/.cts` (`skipLibCheck:false`) 与 DOM-only compile 均 0 diagnostics；bundled Node
ESM/CJS runtime assertions、Chromium/Firefox/WebKit DOM fixture、targeted Biome、
repository code-standard checker 与 33 tests 全通过；restricted diff/whitespace 仅含本轮
获准的三个目标。P11 仍只是 relative-source/bundled fixture 证据，不是 installed
package、declaration、resolution 或 production acceptance。请原三席仅对 B4 third
revised candidate 正式复审；在 PASS 前仍不落 `Answer`/`resolved`/map。

### 2026-08-23 third revised candidate addendum for limited re-review (nested G/F publication authority)

按补充线性化 RATIFIED BLOCK 仅修订 throwaway candidate，继续保持本票 `claimed`；
没有写 `Answer`、没有改 Status/map/production/consumer/tsconfig/Tickets 04–12，也没有
提交或 pack production。上一轮 formatting-only 要求仍保留为 intent comment、语义 predicate
与 predicate branch。

最小行为修复复用既有 generation 与 `SerializedEventBus`，没有复制 Session 状态机：

- `SideRuntime.state$` 为每次 state publication 分配单调 generation；同步重入的较新
  transition 获权后，每个后续 subscriber 在 projection 前都会丢弃旧 publication。
- G 捕获既有 Session continuation generation，并在每次 peer state、`ownerDraining`、
  `peerDraining` 以及 captured-stream application callback 返回后复检。F 增加 generation
  后，旧 G 立即 return，绝不能继续写另一侧 state 或进入 Recovery force branch。
- revocable Recovery/G lifecycle event 在既有非重入 FIFO 中携带同一 authority predicate，
  queue dispatch 前和每个 subscriber effect 前各复检；因此第一个 `peerRecovered` observer
  触发 G/F 后，后注册 observer 收不到 stale `peerRecovered` 或排队中的 G draining events。
  已提交的 telemetry、terminal 与 close events 使用恒真 authority，P08 FIFO 不变。

`probeNestedTerminationPublicationAuthority()` 使用一个 fresh Session，包含 admitted active
stream 与 identity-free Pending：left connected callback 调 `shutdown()`，随后 left draining
callback 重入 `close()`。精确 trace 为 early left
`recovering -> connected -> draining -> closed`、closing observer
`recovering -> draining -> closed`、later left/right 均为 `recovering -> closed`；双侧 getter
最终 `closed`，且任何 trace 都没有 closed 后的 draining/recovering/connected。断言还覆盖同一
termination task identity/settlement、active `outcome-unknown`、Pending `unavailable` 且保持
identity-free、唯一 teardown/telemetry pair/event completion、四个 stream set 与两类 resource
归零、旧 G/Recovery continuation 各失效一次、无 stale recovered/draining event，以及 late
recover/bootstrap/send/admission/job/source/root 攻击不能复活 state/event/identity/work/terminal。
B4 的 event-trigger fresh Session 同时锁住后序 observer 不接收已失效 lifecycle event。

全量回归通过：strict bundler、relative-source NodeNext `.mts/.cts`
(`skipLibCheck:false`) 与 DOM-only compile 均 0 diagnostics；bundled Node ESM/CJS runtime
assertions、Chromium/Firefox/WebKit DOM fixture、targeted Biome、repository code-standard
checker 与 33 tests 全通过。restricted diff/whitespace 仍仅限获准 prototype/README/本 Comment。
P11 仍只是 relative-source/bundled fixture 证据，不是 installed package、declaration、
resolution 或 production acceptance。请三席只对本 addendum 限定复核；PASS 前不落
`Answer`/`resolved`/map。
