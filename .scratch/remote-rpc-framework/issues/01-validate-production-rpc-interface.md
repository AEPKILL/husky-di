# 验证生产级 RPC 使用者 Interface

Type: prototype
Status: resolved
Blocked by:
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

现有 `packages/remote/examples/user-facing-rpc-interface` 应如何演化为最小而完整的生产 Interface，才能以使用者工作流证明每个公开 member 的必要性，并准确表达已确认的双向 unary、稳定 `RpcPeer`、Topology Owner、透明 Session Recovery、multicast Observable、Protocol 注入、独立 Transport Adapter 包和稳定 Remote Service Group？产出可编译的 throwaway prototype、常见路径 usage 与负面类型用例；不得把现有示例的声明当成答案。

## Answer

可用两个 cold Topology Owner factory、稳定 `IRpcPeer`、显式 Adapter 动词和一个统一的
observation stream，形成最小而完整的 caller Interface。可编译 throwaway prototype 固化于
`codex/prototype-rpc-interface@20a9e83`；它是后续决策的上下文，不是生产导出。

已由浏览器 Connector、Node Acceptor、Physical Connection consumer 和正反类型用例验证：

- `createRpcConnector({ protocol? })` 与 `createRpcAcceptor({ protocol? })` 默认使用包内唯一
  Protocol，也允许 caller 注入自定义 Protocol handle。Connector 从 factory 返回起公开稳定
  `peer`；Acceptor 公开当前 `peers` snapshot。
- Connector 保留 `connect(adapter)`。每个 Connector Adapter 只产生一次 Physical
  Connection；caller 决定何时以及用哪个 Adapter 重连，Connector 只接管成功兑现的
  Connection，Protocol 负责把它恢复到原 Logical Session。常见路径证明 pending call、peer、
  proxy 和 exposure 跨 replacement 保持稳定。Acceptor 以 `listen(adapter)` 接管持续 listener。
- `IRpcPeer` 保留 session-scoped `expose()` / `resolve()`；Acceptor 保留集合级 `expose()` /
  `resolveAll()`。Exposure 返回 core `Cleanup`；重复 Wire Service Name 原子失败，Cleanup 只影响
  后续 dispatch，已经捕获 implementation 的在途调用继续完成。v1 不提供原子热替换。
- Topology Owner 的通用 lifecycle surface 只有 `close(): Promise<void>` teardown command
  和一个 `event$`。不提供
  `closed` Promise、`closed$`、`peer$`、同步 `dispose()`、状态布尔值或 middleware。
  `event$` 是 hot、multicast、无 replay 的只读 Observable，发出唯一 typed
  `topology-closed` terminal 后 complete，永不 error。Acceptor 以先订阅、再读取 `peers` 并按
  稳定 identity 去重的方式无竞态 bootstrap；membership mutation 先于对应事件。
- Call observation 用本地 `observationId` 关联 started/finished，携带 direction、peer、wire
  service/method、参数以及 fulfilled result 或 `RpcError`。参数排除本地 cancellation signal；
  参数和结果是与业务活值断开的未脱敏 observation snapshot，不能用来改写调用，subscriber
  负责日志脱敏。
- Public Transport 数据面另外有 `IRpcConnection.message$: Observable<Uint8Array>` 和
  Acceptor Adapter 的 `connection$: Observable<IRpcConnection>`。三类 Observable 都允许
  多订阅；订阅数量和引用持有不建立 ownership。把 Adapter 交给 `acceptor.listen(adapter)`
  才使 Acceptor 成为随后 Connections 的 owner，非 owner 调用 `send()` / `close()` 属于契约
  违例。`message$` 与 `connection$` 正常终止时 complete，Transport/listener failure 时 error。
- Remote Service Descriptor 要求显式稳定 `wireName` 和逐方法 allowlist。v1 method definition
  只需 `true` 或 `{ cancelable: true }`；远端 unary 总是返回 Promise，properties、notification、
  streaming、未知 options 和错误 cancellation slot 均在类型层拒绝。
- `resolveAll()` 返回稳定 Remote Service Group；每次调用截取新的 peer snapshot，并让每个
  fulfilled/rejected result 保留对应稳定 peer。

本票只确认 caller-facing member、注入位置、工作流和必要的行为轮廓。Prototype 中 opaque
`IRpcProtocol` 的可实施 SPI 仍由 [决定公开 Protocol Module seam](05-decide-public-protocol-module-seam.md)
决定；descriptor identity/type mapping、Physical Connection Adapter 的精确机制、Topology
Owner lifecycle/error race、Session Recovery、call delivery state 和 Remote Service Group 的
完整契约，分别留给地图中对应的后续票。尤其不能把 private brand、当前 Adapter 声明或具体
event discriminant 当成这些票的既定答案。

验证通过：`pnpm exec biome check packages/remote/examples/user-facing-rpc-interface`、
`pnpm --filter @husky-di/remote test`、`pnpm --filter @husky-di/remote build` 和
`git diff --check`。
