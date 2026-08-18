# Wayfinder 地图：协议可替换的双向 RPC 框架

Label: wayfinder:map
Status: open

## Destination

清除 `@husky-di/remote` v1 在规范编写前仍需作出的全部产品与架构决策，并让每项决定及其依据在可达的 child ticket 中保持唯一权威。地图完成后，`/to-spec` 应能在不发明新行为、边界或权衡的前提下产出 normative specification、requirement-to-verification matrix 与 implementation route，随后由 `/to-tickets` 切分实施工作。

## Notes

- 权威领域词汇以根目录的 [`CONTEXT.md`](../../CONTEXT.md) 为准。
- 每个决策会话都应使用 `grilling`、`domain-modeling`、`codebase-design` 和 `ponytail`；prototype ticket 还应使用 `prototype`，research ticket 应使用 `research`。
- 公开 Interface 与 Module seam 必须遵从 SOLID；同时以 deep-module 与 `ponytail` 约束避免为了形式上的 SOLID 暴露没有真实变体的浅抽象。
- [`user-facing-rpc-interface`](../../packages/remote/examples/user-facing-rpc-interface/README.md) 是历史 throwaway design input，不是生产 Interface。
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

- [验证生产级 RPC 使用者 Interface](issues/01-validate-production-rpc-interface.md)：caller
  surface 采用 cold Connector/Acceptor owner、稳定 peer、显式 `connect(adapter)` /
  `listen(adapter)`、异步 `close()`、统一 `event$`、session/owner-scoped exposure、稳定
  `resolveAll()` group 以及默认/自定义 Protocol 注入；三个公开 Observable 均可多订阅，
  resource ownership 由角色契约而非订阅数量决定。精确 Protocol、Descriptor、Transport、
  lifecycle、Recovery 和 call-state seam 仍由对应后续票决定。Prototype context：
  `codex/prototype-rpc-interface@20a9e83`。
- [决定 Remote Service Descriptor 的 identity 与类型映射](issues/04-decide-remote-service-descriptor.md)：
  单一 opaque Descriptor 原样保留 local `ServiceIdentifier`、以显式 `wireName` 建立独立 wire
  identity，并用非空 unary allowlist 精确推导 selected-handler exposure、Promise proxy 与
  cancelable call；metadata、Descriptor reference 和全局 registry 均不参与行为，generic 与
  overload 明确不受支持。Prototype context：
  `codex/prototype-remote-service-descriptor@fe94e02`。
- [调研默认 RPC Protocol 候选](issues/02-research-default-rpc-protocol-candidates.md)：没有开放
  Protocol 可直接复用；RSocket 最接近但仍需实质性的 call-state profile，AMQP 只提供过重的
  recoverable-delivery substrate，因此在没有通用 interoperability 目标的当前范围内，默认采用
  专用 unary-recovery wire contract。
- [调研可恢复 RPC 的交付保证](issues/03-research-resumable-rpc-delivery-guarantees.md)：只有同一
  retained Session 被接受恢复、transport 与 call ledger 连续且单一 owner 成立时，才能承诺
  原 call identity 的 Session-scoped at-most-once handler dispatch 与 terminal replay；证据
  丢失必须暴露 outcome unknown，且 terminal ACK 不能单独释放全部去重证据。
- [决定公开 Protocol Module seam](issues/05-decide-public-protocol-module-seam.md)：Framework
  保持 caller semantics，以 structural、role-specific Protocol factory 创建隔离的 owner/session
  runtime；所有 Implementation 遵守固定 v1 profile、内部协商不得降级、故障按最小范围隔离，
  并以共享 semantic conformance suite 证明可替换。默认 Protocol 的 Codec、Handshake、
  Connection、Session、Call State 与 Host Bridge 是清晰但 private 的责任区。
- [决定默认 Protocol 的 wire grammar、Codec 与版本协商](issues/06-decide-default-protocol-wire-contract.md)：
  默认采用 exact-match `husky-di-rpc/1` strict UTF-8 JSON profile，以显式 fresh/resume bootstrap、
  per-direction sequence 和统一累计 Message Receipt ACK 承载 `call`/`cancel`/`result`/`error`；
  已知 record 可安全忽略未知尾字段，unknown kind/required semantic change 则 fault 或升级 profile，
  并以 prose、JSON Schema、raw-byte vectors 与 stateful transcripts 共同定义跨语言 contract。
- [决定 Physical Connection Adapter 契约](issues/07-decide-physical-connection-adapter-contract.md)：
  Connector/Acceptor 统一采用先订阅 `connection$` 再启动的一次性交接，三-member Connection 提供
  完整有序 message、串行 Local Admission send 与 Direct Connection Close；Adapter 在最早入口
  强制 finite limits，并以共享黑盒 conformance 证明 message/stream、ownership、terminal、
  backpressure 与 failure isolation，不公开平台类型、`IDisposable`、capacity surface 或 error Code。
- [决定 Topology Owner 启动、资源所有权与可发现状态](issues/08-decide-topology-owner-lifecycle.md)：
  Owner 采用单飞且可重试的 role-specific startup、handoff 后 ownership、最小故障范围和幂等
  cleanup barrier；Owner、Peer 与 membership 以 replay-latest immutable snapshot pairs 暴露当前
  状态，owner-level hot/no-replay `event$` 记录可关联过程，且所有 mutation 先原子提交状态再按批
  通知，subscriber failure 不影响 RPC。

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
