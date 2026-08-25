# 决定公开 Protocol Module seam

Type: grilling
Status: resolved
Blocked by: 01, 02
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

`@husky-di/remote` 应在何处放置一个真实而深的 Protocol seam，使 Topology Owner 与 `RpcPeer` 只依赖稳定的语义 Interface，调用者可以选择内置默认 Protocol 或自定义 Implementation，而 Handshake、Session、ACK、Codec、call state 等内部层不会膨胀公开 Interface？决定 Protocol 的创建、注入、每 Session 状态、能力协商、错误隔离和 conformance responsibilities。

## Answer

采用一个完整、结构化且可替换的 `IRpcProtocol` 作为唯一公开 Protocol seam。Framework
继续拥有 caller-facing Topology Owner、稳定 `RpcPeer`、Remote Service Descriptor、
exposure、proxy、Remote Service Group 与 observation semantics；Protocol 只负责把统一的
v1 RPC 语义落实到 Physical Connection，包括 wire、Handshake、Logical Session、Recovery
和 call state。Protocol 通过 framework-owned semantic host ports 与这些公开对象协作，既不
实现另一套公开 `RpcPeer`，也不退化为仅替换 Codec 的浅 seam。

该边界遵从 SOLID，但不把 SOLID 机械地解释成公开每个内部名词：新增完整 Protocol
Implementation 不需要修改 Framework；所有 Implementation 必须可替换且保持同一行为契约；
Connector、Acceptor、Peer、Host 与 Connection 使用角色明确的窄 contract；Framework 与
Protocol 都只依赖语义 port，而不依赖 WebSocket、Node 类型或默认 wire message。

### 创建、注入与状态作用域

- `IRpcProtocol` 是 structural implementor Interface，不使用 private brand、注册表或
  `defineRpcProtocolV1()` builder。其逻辑形态是同步、无 I/O 的
  `createConnector(host)` / `createAcceptor(host)`，分别返回角色专属 runtime；精确 TypeScript
  members 由后续 prototype 在相关行为决策完成后验证。
- Protocol 只在 `createRpcConnector({ protocol? })` 或
  `createRpcAcceptor({ protocol? })` 创建 cold Topology Owner 时注入，创建后不可替换，也不按
  peer 临时选择。省略该 option 使用包内唯一默认 Protocol；不公开
  `defaultRpcProtocol` 常量，因为显式传入默认值没有增加能力。
- 一个 Protocol value 只保存 immutable configuration，并可安全、并发地复用于多个
  Topology Owners。每次 `createConnector` / `createAcceptor` 必须产生全新的、互相隔离的
  owner runtime；Protocol-specific options 由自定义 Protocol 自己的 factory closure 捕获，
  不给 core 添加通用配置袋。
- Mutable state 严格按生命周期归属：每 Topology Owner 一个 runtime、每 Physical Connection
  一份短期 connection state、每 Logical Session 一份跨连接保留的 session handle/state、每
  Session 一份 call ledger。Call 或 Session state 不能放入共享 Protocol value；Connection
  replacement 不能重建 retained Session handle，Recovery 必须重新绑定同一个 handle。

### 固定语义与能力协商

所有 conforming Protocol 都必须满足同一套 caller-observable v1 semantic profile，包括双向
unary、稳定 `RpcPeer`、透明 Session Recovery、Session-scoped duplicate suppression 与
terminal replay 的既定保证。Wire version/capability negotiation 完全属于 Protocol：它只能
接受兼容连接、选择不改变公开语义的 wire 优化，或明确拒绝，不能静默降级 Recovery、去重、
terminal replay 或其他 `RpcPeer` 保证。Framework 不公开 capability bag；真正不同的 caller
semantics 必须成为新的 semantic profile/version，而不是 feature flag。

### 内部 Module 责任区

默认 Protocol 必须清晰定义并测试以下 private responsibility regions。它们是维护者的
Module boundaries，不是强制一类一文件，也不是供 caller 自由混搭的公共插件；第三方
Protocol 只需满足完整 `IRpcProtocol` contract，可以采用不同内部结构。

| Internal Module | State scope | Responsibility |
| --- | --- | --- |
| Protocol composition root / Topology Runtime | 每 Topology Owner | 组装角色 runtime、Session directory、host ports 与故障作用域；只在此处知道 concrete internal Modules。 |
| Codec | 无状态、可复用 | 在 `Uint8Array` 与 normalized wire message 之间转换并做语法/结构校验；不解释 Session、ACK 或 handler semantics。 |
| Connection Driver | 每 Physical Connection | 独占连接收发、保持顺序、调用 Codec、管理 connection-local terminal；Handshake 后只通过窄 endpoint 交给 Session。 |
| Handshake / Negotiation | 每次绑定前的 Connection | 判断 wire/profile 兼容性以及新建还是恢复 Session；不拥有 Session、call ledger 或 Transport。 |
| Session Runtime | 每 Logical Session | 保持 session handle、连接 lease/epoch、replacement、fencing、Recovery 与跨连接 replay boundary；断线本身不终止 calls。 |
| Call State | 每 Logical Session | 管理 inbound/outbound call identity、request admission、至多一次 dispatch、cancel、terminal outcome、dedupe、replay 与 retention evidence。 |
| Semantic Host Bridge | 每 owner/session 的 framework port | 在已验证的 Protocol call intent/outcome 与 Framework exposure/dispatch/proxy semantics 之间转换，不泄漏默认 wire types。 |

依赖方向保持单向：composition root 组装 role runtime；Connection Driver 只依赖 Codec 与 typed
ingress port；Handshake 只依赖 Session-admission port；Session Runtime 拥有 Call State，并通过
connection endpoint 而不是具体 Transport 使用当前连接；Call State 产生 typed effects，不能
反向操作 Session internals；最外层 bridge 才认识 framework host ports。不开通用 event bus、
Module registry 或逐层 factory，内部 Interface 只有在存在真实组合或测试价值时才建立。

不存在笼统的 “ACK Module”。`IRpcConnection.send()` fulfillment 只证明本地 admission；
Protocol frame/replay ACK 归 Session 的跨连接 replay boundary；request-accepted 与 terminal
ACK 归 Call State。Terminal ACK 只能支持回收较大的 terminal payload，不能单独删除 dedupe
evidence；后者还需要 Session 提供 fencing 与 replay-boundary 已排除旧 request 副本的证明。

### Outcome、故障隔离与 conformance

- 预期的业务失败、remote rejection 与 cancellation 通过显式 semantic outcome channel 穿过
  Protocol seam；application handler 的 throw/rejection 是 call outcome，不是 Protocol fault。
  Public proxy 再把 rejected outcome 映射为 `RpcError` Promise rejection。
- Protocol Implementation 的意外同步 throw、Promise rejection、非法 callback 顺序或 late
  callback 由 Framework 在 seam 捕获并转成 protocol fault。隔离范围取最小已知受影响范围：
  未绑定问题限于 Connection；Session state fault 终止该 Session；一个 Acceptor Session 不得
  终止其他 peers；只有 shared owner runtime/startup fault 才终止整个 topology。Connector 只有
  一个 Session，因此 fatal Session fault 可以终止其 topology。
- Structural typing 只证明形状，不能证明 LSP。Framework 必须定义 normative semantic
  contract，并提供通过同一 Protocol Interface、成对运行 Connector/Acceptor 与 in-memory
  Connection 的黑盒 conformance harness。默认与第三方 Protocol 都必须通过同一 semantic
  suite；默认 Protocol 还必须通过自己的raw-byte、security与stateful transcript corpora。
  Harness 的导出位置、版本策略与精确矩阵由后续 package-contract 决策确定。

本票只锁定 public/private seam、职责、状态作用域、依赖方向、协商上限、故障隔离原则与
conformance ownership。Envelope、Codec 格式、Session identity/resume proof、ACK message 与
GC 状态机、具体 error/cancellation race、资源上限、安全证明、精确 SPI members 和文件落点
仍由对应后续 tickets 决定。
