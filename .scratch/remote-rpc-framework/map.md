# Wayfinder 地图：协议可替换的双向 RPC 框架

Label: wayfinder:map
Status: resolved

## Destination

清除 `@husky-di/remote` v1 在规范编写前仍需作出的全部产品与架构决策，并让每项决定及其依据在可达的 child ticket 中保持唯一权威。地图完成后，`/to-spec` 应能在不发明新行为、边界或权衡的前提下产出 normative specification、requirement-to-verification matrix 与 implementation route，随后由 `/to-tickets` 切分实施工作。

## Notes

- 权威领域词汇以根目录的 [`CONTEXT.md`](../../CONTEXT.md) 为准。
- 每个决策会话都应使用 `grilling`、`domain-modeling`、`codebase-design` 和 `ponytail`；prototype ticket 还应使用 `prototype`，research ticket 应使用 `research`。
- 公开 Interface 与 Module seam 必须遵从 SOLID；同时以 deep-module 与 `ponytail` 约束避免为了形式上的 SOLID 暴露没有真实变体的浅抽象。
- `codex/prototype-rpc-interface@20a9e83` 是历史 throwaway design input，不是生产 Interface。
- 本地图只完成规划与规范路线，不实施生产代码。后续代码变更必须使用 `husky-di-code-standard`，并让 normative specification 与 `specification.test.ts` 在同一变更中更新。
- v1 只支持双向 unary 调用；本地同步结果在远端变为 Promise，不支持 notification 或 streaming。
- `RpcPeer` 是稳定的远端对等方；`RpcConnector` 与 `RpcAcceptor` 是 Topology Owner。Logical Session 可跨瞬时 Physical Connection 断线恢复，且对调用者保持透明，但远端进程重启可以终止 Session。
- RxJS 是公开依赖。公开事件流是 hot、multicast、无 replay 的只读 Observable；state 与 membership streams 则 multicast、replay latest，并发出完整 immutable snapshot。所有订阅只用于观察，不拥有资源，也不以 ref-count 控制底层生命周期。
- 对外提供一个深的 Protocol seam；Handshake、Session、ACK、Codec 等可在 Implementation 内部分层。包内提供恰好一个默认 Protocol，并公开精确、可由其他语言实现的 wire specification；v1 只交付 TypeScript Implementation。
- `@husky-di/remote` 只定义 Transport Adapter seam。WebSocket 等正式 Adapter 放入独立包，例如 `@husky-di/remote-websocket`；当前地图不实施这些包。
- `resolveAll()` 返回稳定的 Remote Service Group；每次方法调用重新截取一个 `RpcPeer` 快照，并保持结果与稳定 `RpcPeer` 的关联。
- 复用 `@husky-di/core` 的基础类型，但 v1 不自动接入 Container。业务认证、授权和限流留给 application/Transport Adapter；Transport framing validation 与 admission limits 属于 Adapter，decoded wire input validation、Protocol state resource limits 和 Session Recovery 安全属于 RPC Protocol。
- 正式运行时目标是 Node.js 与浏览器互通；公开 Interface 不泄漏 Node 或 WebSocket 类型。Deno、Bun 和 Worker 保持设计兼容，但不进入 v1 验证矩阵。
- v1 只提供只读生命周期与调用事件用于日志、Tracing 和 Metrics，不提供可改写调用流程的 middleware/interceptor。
- 地图只在 `Not yet specified` 为空、除最终审计票外没有 open/claimed child、每个 resolved child 恰好索引一次、所有依赖与 primary source 可达且无矛盾，并且最终一致性审计确认 `/to-spec` 不需补做产品或架构决策后完成。

## Decisions so far

- [验证生产级 RPC 使用者 Interface](issues/01-validate-production-rpc-interface.md)：历史 caller
  prototype建立 cold Connector/Acceptor owner、稳定 peer、显式 `connect(adapter)` /
  `listen(adapter)`、统一 `event$`、session/owner-scoped exposure、稳定 `resolveAll()` group以及
  默认/自定义 Protocol注入；公开 Observable均可多订阅，resource ownership由角色契约而非订阅数量
  决定。其早期单一 close、无 current state与 payload event结论已被 08/11/14/18取代；精确最终
  Interface由 issue 19重新验证。Prototype context：
  `codex/prototype-rpc-interface@20a9e83`。
- [决定 Remote Service Descriptor 的 identity 与类型映射](issues/04-decide-remote-service-descriptor.md)：
  单一 opaque Descriptor 原样保留 local `ServiceIdentifier`、以显式 `wireName` 建立独立 wire
  identity，并用非空 unary allowlist 精确推导 selected-handler exposure、Promise proxy 与
  cancelable call；`then` 在 type/runtime/wire 层保留以保证 proxy 非 thenable，exposure 时
  snapshot selected function references；metadata、Descriptor reference 和全局 registry 均不
  参与行为，generic 与 overload 明确不受支持。Prototype context：
  `codex/prototype-remote-service-descriptor@fe94e02`。
- [调研默认 RPC Protocol 候选](issues/02-research-default-rpc-protocol-candidates.md)：没有开放
  Protocol 可直接复用；RSocket 最接近但仍需实质性的 call-state profile，AMQP 只提供过重的
  recoverable-delivery substrate，因此在没有通用 interoperability 目标的当前范围内，默认采用
  专用 unary-recovery wire contract。
- [调研可恢复 RPC 的交付保证](issues/03-research-resumable-rpc-delivery-guarantees.md)：只有同一
  retained Session 被接受恢复、transport 与 call ledger 连续且单一 owner 成立时，才能承诺
  原 call identity 的 Session-scoped at-most-once handler dispatch 与 terminal replay；证据
  丢失必须暴露 outcome unknown，且 terminal ACK 不能单独释放全部去重证据。Fresh message 对
  已用 call identity 的任何复用都拒绝；已由 receive cursor 抑制的旧 transport identity 不为
  比较无状态影响的 body 而永久保留 fingerprint。
- [决定公开 Protocol Module seam](issues/05-decide-public-protocol-module-seam.md)：Framework
  保持 caller semantics，以 structural、role-specific Protocol factory 创建隔离的 owner/session
  runtime；所有 Implementation 遵守固定 v1 profile、内部协商不得降级、故障按最小范围隔离，
  并以共享 semantic conformance suite 证明可替换。默认 Protocol 的 Codec、Handshake、
  Connection、Session、Call State 与 Host Bridge 是清晰但 private 的责任区。
- [决定默认 Protocol 的 wire grammar、Codec 与版本协商](issues/06-decide-default-protocol-wire-contract.md)：
  默认采用 exact-match `husky-di-rpc/1` strict UTF-8 JSON profile，以显式 fresh/resume bootstrap、
  per-direction sequence 和统一累计 Message Receipt ACK 承载 `call`/`cancel`/`result`/`error`；
  已知 record 可安全忽略未知尾字段，unknown kind/required semantic change 则 fault 或升级 profile；
  replay 保留 immutable `(seq, SemanticMessage)` 并为每次发送生成可携带最新 ACK 的 envelope；
  AckOnly 允许 cursor `0`，connection-local Ping/Pong 负责 idle activity probe；fresh/resume 使用固定
  JCS/HKDF/HMAC security carriers，而 active records 继承 protected Transport integrity；优雅停机
  使用 unsequenced、no-ACK/no-reply顶层 Close，强制关闭不发送；最终以 prose、JSON Schema、raw-byte
  vectors 与 stateful transcripts共同定义跨语言 contract。
- [决定 Physical Connection Adapter 契约](issues/07-decide-physical-connection-adapter-contract.md)：
  Connector/Acceptor 统一采用先订阅 `connection$` 再启动的一次性交接，三-member Connection 提供
  完整有序 message、串行 Local Admission send 与 Direct Connection Close；Adapter 在最早入口
  强制 finite limits；共享黑盒 conformance 证明 observable message/stream、ownership、terminal、
  backpressure 与 failure isolation，入口 allocation/copy 顺序另由插桩、fuzz 与审查证明；所有
  Adapter 必须与 Protocol 共享 `1 MiB` single-message compatibility，package-specific queue caps
  仍留在 typed Adapter factory。Acceptor在 96 ordinary Connections之外保留一个只用于停止 push
  handoff的 overflow-close slot，并严格在 ownership barrier后 Direct Close；Interface不公开平台类型、
  `IDisposable`、capacity surface或 error Code。
  Functional conformance 与 secure-deployment conformance 分离；结构 seam 不增加虚假的 `isSecure`
  getter，默认 Protocol 的安全恢复要求部署保证 confidentiality、ordered integrity 和 responder
  endpoint authentication。
- [决定 Topology Owner 启动、资源所有权与可发现状态](issues/08-decide-topology-owner-lifecycle.md)：
  Owner 采用单飞且可重试的 role-specific startup、handoff 后 ownership、最小故障范围和幂等
  cleanup barrier；`shutdown()`与`close()`共享 cached termination task，分别进入 finite graceful
  drain与 immediate force。Owner、Peer 与 membership以 replay-latest immutable snapshot pairs暴露当前
  状态，owner-level hot/no-replay、payload-free `event$` 记录可关联过程，且所有 mutation 先原子提交状态再按批
  通知；subscriber failure 不回滚 Framework state 或改写当前 operation，但 host reporting 仍可能
  终止进程。同步 exposure/Cleanup 不进入异步 lifecycle notification queue。
- [决定 Logical Session identity、incarnation、fencing 与 Recovery](issues/09-decide-logical-session-recovery.md)：
  responder-created `sessionId` 标识一个进程内 retained incarnation；单调 `bindingEpoch` 与
  last-valid-resume-wins fencing 安全替换 Connection，双向累计 cursor 和 attempt-bound proof
  恢复 retained sequence；initiator-owned、never-reused `resumeAttempt` 与 Session HMAC proof 允许
  lost accept 后用更高 attempt 恢复，并阻止旧 attempt 重放；低于 authenticated retained receipt 的 cursor 明确 continuity failure，
  不再静默取最大值。Attempt/Session-scoped reject、六态 peer projection 与稳定
  object/exposure lifetime 明确了 retry、terminal 和 caller observation 边界；silence/send timeout
  先 fence 再进入 recovering，单次 attempt 为 30 秒、retained Recovery deadline 为 5 分钟且不做
  pressure eviction；Protocol counter exhaustion可让单一 peer进入 draining而不关闭 Acceptor siblings。
- [决定 Call value model、identity、重放与去重](issues/10-decide-call-delivery-state-machine.md)：
  所有 Protocol 共享 normalized JSON data-tree value model；默认以 direction-local Call Ordinal
  区分 Logical Call、以独立 `seq` 精确重放 message，在原子 Remote Request Admission 后提供
  Session-scoped at-most-once dispatch。Recovering 可继续排队，业务幂等留给 application，
  Message Receipt ACK 配合 `receivedThrough`/call-ordinal high-watermark 回收 replay 与 terminal
  state；容量不足时以 protected reserve 原子写入不 dispatch 的 Remote Resource Rejection，而非
  留下 replay poison；ordinary capacity成功但 route未知则写入不 dispatch的 Remote Semantic
  Rejection并产生不泄漏 raw name的 observation pair；immutable semantic replay pair与每次发送的 envelope分离，旧 `seq` 在
  semantic dispatch 前抑制，无需永久保留 payload fingerprint 或 per-call tombstone。
  Graceful cutoff只让当时 connected Session的既有 Pending/Logical Calls继续；recovering Session或
  force cutoff分别以 `unavailable` / `outcome-unknown`收敛未 admission / 已 admission work。
- [决定 unary 调用、取消、错误与终止竞态](issues/11-decide-unary-call-errors-cancellation.md)：
  validated invocation 先成为无 wire identity 的可撤回 Pending Invocation，只在首次 Adapter
  `send()` 前原子分配 `callId`/`seq` 并成为 Logical Call；发送前取消本地拦截，发送后采用
  cooperative cancel。Promise、handler、Session 与 shutdown races 统一 first-terminal-wins，
  `RpcError` 以 `unavailable`/`outcome-unknown` 等 execution guarantee 分类；preflight 固定为
  signal shape → already-aborted → peer availability → value snapshot → capacity，远端 authoritative
  resource rejection 也以 Definite Non-Execution 映射 `unavailable`；late terminal 仅完成 ACK/GC，
  不改写 caller outcome。优雅 cutoff不是 connected Session既有 call的 terminal，显式 `close()`、
  deadline或 draining binding loss才应用 force outcomes。通用 event不复制 args/result/raw throw或
  Error identity，payload diagnostics留给 application自己拥有的 caller/handler boundary。
- [验证稳定 Remote Service Group 的批量语义](issues/12-validate-stable-remote-service-group.md)：
  `resolveAll()` 保持为 frozen、non-thenable 的稳定 service facade；每次 method invocation 只做一次
  common preflight/normalization 与对 membership的 `connected | recovering` eligible snapshot，再以普通 unary
  child calls 产生 snapshot-order immutable `RpcPeerResult`。Per-peer failure 和 aggregate abort 不
  fail-fast outer Promise，也不增加 batch wire/state/event；Owner draining后调用在 snapshot前即
  `unavailable`。Prototype context：
  `codex/prototype-remote-service-group@124ec9a`。
- [决定顺序、并发、缓冲与恢复资源上限](issues/13-decide-ordering-concurrency-resource-bounds.md)：
  固定 Protocol/Adapter `1 MiB` message compatibility 与 bounded JSON/value profile；默认每 Session
  `32 MiB`、每 owner `64 MiB`、256 calls、16/64 handler permits，以 replay barrier、control/data
  交替、per-Session FIFO 和 owner round-robin 提供有界公平性。累计 ACK 50 ms 合并，Ping/Pong
  承担 30 秒 probe；120 秒 silence/30 秒 send timeout先 fence后 Recovery，5分钟 retention与每个
  grace/cleanup phase各 5 秒（优雅最坏 10 秒）的 deadline保证有限生命周期；ordinary overload使用 protected definite-non-execution
  terminal，既有 evidence 不逐出，所有 counter never-wrap。
- [决定 trust-boundary validation 与 Session Recovery 安全](issues/14-decide-validation-recovery-security.md)：
  默认 v1 以受保护 Transport 提供 confidentiality、ordered integrity 与 responder endpoint identity，
  再用每 Session 独立 secret、固定 JCS/HKDF/HMAC transcript proof、单调 `resumeAttempt` 和 signed
  authoritative reject保护跨 binding continuity；active records 不重复加 Protocol MAC。Validation
  从 endpoint fencing、bounded lexical/schema、proof/phase、retained semantics 到 durable capacity
  disposition 分层；永久 authenticated poison 第一次即 Session fault，普通容量不足则原子返回
  Definite Non-Execution。`sessionId` 不授予 authority，通用 telemetry 无 payload/secret/raw error，
  plaintext Adapter 只满足 functional conformance、不享有 secure Recovery guarantee。
- [决定 Topology Owner 强制关闭与优雅停机](issues/18-decide-owner-shutdown-convergence.md)：Owner以
  单一 `active -> draining -> closing -> closed` termination状态机同时提供 `shutdown()`与`close()`；
  前者只排空 cutoff时 connected Session的既有 Pending/call/handler/replay/ACK work，随后每 Session
  至多发送一次 active、unsequenced、no-reply Close，后者立即应用 force call outcomes并 Direct Close、
  绝不发 Protocol Close。两方法及重复/交叉调用返回同一 Promise；grace与cleanup各有一个 non-sliding
  5秒 owner-wide deadline，broken Adapter/handler/crypto late settlement均以 bounded sink/fencing
  收敛，优雅最坏 10秒、直接强制最坏 5秒。
- [验证第三方 Protocol Implementor Interface](issues/17-validate-protocol-implementor-interface.md)：
  `IRpcProtocol`以structural role factory创建owner-scoped runtime，并通过retained Session handle、
  Framework-normalized value snapshots、outgoing reserve/commit/synchronous sink及incoming
  capacity-reserve/durable-disposition/commit ports承接semantic ownership；Connection handoff在
  notification栈同步订阅但barrier后才取得authority，Session/owner fault先同步force再投影。
  `shutdown()` shell barrier、同步 `close()` force与cached `cleanup()`分开支撑两段deadline，且
  Framework唯一跟踪Connection/listener cleanup；default Codec/Handshake/ACK/proof/replay仍为private
  modules。Prototype context：`codex/prototype-protocol-implementor@672ec3f`。
- [验证最终 caller-facing RPC Interface](issues/19-validate-final-caller-interface.md)：最终surface由
  role-specific Connector/Acceptor、stable six-state Peer、opaque Descriptor、frozen non-thenable
  single/group facades、closed state/event/error unions及issues 07/17的structural seams组成；不导出
  generic Owner base或default Protocol constant。Cancelable proxy使用required trailing
  `AbortSignal | undefined`及platform intrinsics封闭runtime slot/race；incoming Session terminal以
  event-only `terminated`闭合observation而不污染caller error taxonomy。`shutdown()`/`close()`所有路径
  返回exact same cached Promise。Prototype context：`codex/prototype-final-rpc-interface@39fdbbd`。
- [决定规范验证与 package contract](issues/15-decide-verification-package-contract.md)：每条normative
  requirement必须以稳定ID映射到runtime/type/raw-wire/transcript/resource/conformance/package/browser
  evidence；默认Protocol另有JCS/HKDF/HMAC known-answer corpus及断线、错序、stale binding和双方状态分歧
  门禁。`@husky-di/remote@1.0.0`发布root、`/protocol`、`/transport`、`/conformance`四个ESM/CJS/types
  entry及normative wire assets；Node >=23.6、三套Playwright engines和真实packed-tarball consumers为
  compatibility gate，独立Adapter包必须运行共享conformance与自身bounded-allocation/security probes。
- [审计 Wayfinder 完成状态并交接 specification](issues/16-determine-specification-handoff.md)：19/19
  children可达且恰好索引一次，dependency graph无环、所有blocker resolved、local sources与固定prototype
  commits存在；signal、六态Peer、event、Recovery、双关闭/deadline和package contracts交叉审计为0
  blocker。`/to-spec`只有规范化表达与requirement/evidence编目工作，不再需要产品或架构裁决。

## Not yet specified

## Out of scope

- 本次 Wayfinder 地图中的生产实现。
- `@husky-di/remote-websocket` 或其他具体 Transport Adapter 包的实现；本地图只定义它们必须满足的 seam 与 conformance contract。
- v1 的 streaming、notification、自动 Container integration、业务 middleware/interceptor。
- 业务认证、授权策略、限流、服务发现和隐式环境路由。
- 任一对等端进程重启后的持久化 Session Recovery，以及跨进程故障的 exactly-once 保证。
- 发布非 TypeScript SDK；默认 Protocol 的 wire specification 仍需允许独立实现。
- 把 Deno、Bun 或 Worker 纳入 v1 的正式兼容性验证矩阵。
- 默认 Protocol 不影响 normative contract 的 private Interface、类/函数切分与文件落点。
- 在本地图内实际编写 `SPECIFICATION.md`、最终 requirement matrix 或 implementation tickets；这些分别属于 `/to-spec` 与 `/to-tickets`。
