# Wayfinder 地图：协议可替换的双向 RPC 框架

Label: wayfinder:map
Status: open

## Destination

为 `@husky-di/remote` 产出一份决策完备、可直接实施的规范与实施路线：它定义协议可替换的双向 unary RPC 框架、一个内置默认 Protocol、精确的公开 TypeScript Interface、wire contract、行为保证和验证契约，使实施阶段不再需要补做产品或架构决策。

## Notes

- 权威领域词汇以根目录的 [`CONTEXT.md`](../../CONTEXT.md) 为准。
- 每个决策会话都应使用 `grilling`、`domain-modeling`、`codebase-design` 和 `ponytail`；prototype ticket 还应使用 `prototype`，research ticket 应使用 `research`。
- 公开 Interface 与 Module seam 必须遵从 SOLID；同时以 deep-module 与 `ponytail` 约束避免为了形式上的 SOLID 暴露没有真实变体的浅抽象。
- 当前 [`user-facing-rpc-interface`](../../packages/remote/examples/user-facing-rpc-interface/README.md) 是高保真设计输入，不是已接受的生产 Interface；已删除的旧 Wayfinder 地图和历史研究也不是现行决议。
- 本地图只完成规划与规范路线，不实施生产代码。后续代码变更必须使用 `husky-di-code-standard`，并让 normative specification 与 `specification.test.ts` 在同一变更中更新。
- v1 只支持双向 unary 调用；本地同步结果在远端变为 Promise，不支持 notification 或 streaming。
- `RpcPeer` 是稳定的远端对等方；`RpcConnector` 与 `RpcAcceptor` 是 Topology Owner。Logical Session 可跨瞬时 Physical Connection 断线恢复，且对调用者保持透明，但远端进程重启可以终止 Session。
- 瞬时断线期间的新调用与在途调用保持 pending；恢复后以原 call identity 继续。保留中的 Session 必须支持去重与 terminal result replay，不能宣称跨进程故障的 exactly-once。
- RxJS 是公开依赖。公开事件流是 hot、multicast、无 replay 的只读 Observable；订阅只用于观察，不拥有资源，也不以 ref-count 控制底层生命周期。
- 对外提供一个深的 Protocol seam；Handshake、Session、ACK、Codec 等可在 Implementation 内部分层。包内提供恰好一个默认 Protocol，并公开精确、可由其他语言实现的 wire specification；v1 只交付 TypeScript Implementation。
- `@husky-di/remote` 只定义 Transport Adapter seam。WebSocket 等正式 Adapter 放入独立包，例如 `@husky-di/remote-websocket`；当前地图不实施这些包。
- `resolveAll()` 返回稳定的 Remote Service Group；每次方法调用重新截取当前 Logical Peer 快照，并保持结果与稳定 `RpcPeer` 的关联。
- 复用 `@husky-di/core` 的基础类型，但 v1 不自动接入 Container。业务认证、授权和限流留给 application/Transport Adapter；畸形输入防御、资源上限和 Session Recovery 安全属于 RPC Protocol。
- 正式运行时目标是 Node.js 与浏览器互通；公开 Interface 不泄漏 Node 或 WebSocket 类型。Deno、Bun 和 Worker 保持设计兼容，但不进入 v1 验证矩阵。
- v1 只提供只读生命周期与调用事件用于日志、Tracing 和 Metrics，不提供可改写调用流程的 middleware/interceptor。

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
  专用 unary-recovery wire contract。Research context：
  `research/default-rpc-protocol-candidates@0fbeb14e0882f14f2eba4613f075d6eb0ae4e102`。
- [调研可恢复 RPC 的交付保证](issues/03-research-resumable-rpc-delivery-guarantees.md)：只有同一
  retained Session 被接受恢复、transport 与 call ledger 连续且单一 owner 成立时，才能承诺
  原 call identity 的 Session-scoped at-most-once handler dispatch 与 terminal replay；证据
  丢失必须暴露 outcome unknown，且 terminal ACK 不能单独释放全部去重证据。Research
  context：
  `research/resumable-rpc-delivery-guarantees-v2@d5b16c1a774deae1b506dda1d25382c835141d7b`。
- [决定公开 Protocol Module seam](issues/05-decide-public-protocol-module-seam.md)：Framework
  保持 caller semantics，以 structural、role-specific Protocol factory 创建隔离的 owner/session
  runtime；所有 Implementation 遵守固定 v1 profile、内部协商不得降级、故障按最小范围隔离，
  并以共享 semantic conformance suite 证明可替换。默认 Protocol 的 Codec、Handshake、
  Connection、Session、Call State 与 Host Bridge 是清晰但 private 的责任区。

## Not yet specified

- 默认 Protocol 各责任区的精确 private Interface、类/函数切分与文件落点；只有 wire、Session、call-state、resource 与 security 行为决策完成后才会清晰。
- 最终规范的 requirement 编号、章节结构、ADR 候选和实施 ticket 切片；它们会随公开 Interface 与 wire contract 收敛。

## Out of scope

- 本次 Wayfinder 地图中的生产实现。
- `@husky-di/remote-websocket` 或其他具体 Transport Adapter 包的实现；本地图只定义它们必须满足的 seam 与 conformance contract。
- v1 的 streaming、notification、自动 Container integration、业务 middleware/interceptor。
- 业务认证、授权策略、限流、服务发现和隐式环境路由。
- 任一对等端进程重启后的持久化 Session Recovery，以及跨进程故障的 exactly-once 保证。
- 发布非 TypeScript SDK；默认 Protocol 的 wire specification 仍需允许独立实现。
- 把 Deno、Bun 或 Worker 纳入 v1 的正式兼容性验证矩阵。
