# PROTOTYPE — 生产级 RPC 使用者 Interface

这是一个用于回答 Wayfinder 票“验证生产级 RPC 使用者 Interface”和“决定 Remote Service
Descriptor 的 identity 与类型映射”的 throwaway prototype，不是 `@husky-di/remote` 的生产
导出，也不包含运行时实现。

本目录仅作为历史设计证据；当前 contract 请参阅 Wayfinder tickets 与后续 normative specification。

## 要回答的问题

在不暴露 Handshake、Session、ACK、Codec、call ledger 等 Implementation 细节的前提下，
最小的 caller Interface 能否完整表达双向 unary、稳定 `IRpcPeer`、Topology Owner、透明
Session Recovery、hot multicast Observable、Protocol 注入、独立 Transport Adapter 包和
稳定 Remote Service Group？每个 public member 是否都能由一个具体工作流证明？

在这个 Interface 内，单一 opaque Remote Service Descriptor 能否原样复用本地
`ServiceIdentifier<T>`、以显式 `wireName` 建立独立 wire identity、精确选择可远程调用的
methods，并让 `expose()` 只要求选中 handlers、让 `resolve()` / `resolveAll()` 推导对应的
异步远端方法？

```bash
pnpm --filter @husky-di/core build
pnpm --filter @husky-di/remote typecheck
```

## 原型验证时的假设

- `createRpcConnector({ protocol? })` 与 `createRpcAcceptor({ protocol? })` 创建尚未启动 I/O
  的 Topology Owner；省略 `protocol` 使用包内唯一默认 Protocol。
- Connector Adapter 只创建一次 Physical Connection。调用者决定何时及用哪个 Adapter
  调用 `connect(adapter)`；Connector 只接管兑现的 Connection，并让 Protocol 尝试把它
  恢复到原 Logical Session。Acceptor 通过 `listen(adapter)` 接管持续监听 Adapter。
- `IRpcPeer` 只负责 session-scoped `expose()` / `resolve()`；Connector 暴露一个从创建起
  稳定的 peer，Acceptor 负责集合级 `expose()` / `resolveAll()`。
- `expose()` 返回 core `Cleanup`。实际 inbound invocation 才查询当前 exposure，因此移除
  registration 不替换稳定 proxy，也不改变已经 dispatch 的调用，只影响后续 invocation。
- `peers` 提供当前快照；单一 `event$` 提供 peer lifecycle 与 call observation，其中 call
  observation 携带参数、成功结果或失败。所有公开 Observable 都是 hot、multicast、无
  replay，订阅只观察且不拥有资源。
- `close()` 只表示 caller 发起的关闭命令何时完成。Topology terminal、peer lifecycle 与 call
  observation 都通过一个 `event$` 表达，不再提供把事件伪装成状态的 `closed` Promise。
  `event$` 用最后一个 `topology-closed` event 区分正常关闭与失败，随后 complete，永不 error。
- v1 只有 unary，所以 method allowlist 只用 `true` 或 `{ cancelable: true }`，不重复写
  `type: "unary"`。
- Descriptor 由单一 `createRemoteServiceDescriptor()` 创建并保持 opaque；它在内部保留原始
  `ServiceIdentifier`、显式 `wireName` 和 immutable allowlist，但不把它们变成 caller 可依赖
  的 properties。Descriptor object reference 本身不具有 service identity 语义。
- `ServiceIdentifier` 只保留 core 的本地 equality，`wireName` 是唯一远端 service identity；
  metadata 不参与创建、路由或判重。Factory 不做全局注册，重复只在同一 Logical Session
  的 active exposure namespace 内原子失败。
- `expose()` 只要求 allowlist 中选中的 handlers；完整业务 implementation 仍可结构赋值。
  空 allowlist、`any` 参数/结果、Observable/AsyncIterable 结果和不精确的取消参数被拒绝。
- v1 的本地 method key 同时是 wire method name，不提供 alias。精确类型保证只覆盖单一、
  非泛型 call signature；generic 与 overloaded methods 不属于受支持的远端契约形状。

## Guided walkthroughs

### 1. 定义双方共享的 Remote Service Descriptor

见 [`websocket-express/remote-services.ts`](./websocket-express/remote-services.ts)。Descriptor
显式复用 `@husky-di/core` 的 `ServiceIdentifier<T>`，要求稳定 `wireName`，并只允许选中
method。同步 handler 在 remote proxy 上变为 `Promise`；cancelable handler 的尾随
`AbortSignal` 在 caller 侧变为可选。完整 service 可以直接用于 exposure，但只实现 allowlist
中 handlers 的最小对象也有效。

[`type-validation.usage.ts`](./type-validation.usage.ts) 同时证明 properties、Observable
或 AsyncIterable result、`any` 参数/结果、空 allowlist、未知 method option、缺失 wire name、
错误 cancellation slot、streaming 与 notification shape 都会在编译期失败；它也证明
Descriptor 不能被当作公开数据结构读取。

### 2. 浏览器 Connector

见 [`websocket-express/connector.usage.ts`](./websocket-express/connector.usage.ts)。调用者先
创建稳定 peer、暴露反向调用、取得稳定 proxy、订阅 observation，最后才 `connect()` I/O。
观察到 `peer-recovering` 后，调用者选择新的 Adapter 再次 `connect()`；随后继续使用原
proxy，并等待断线前发起的 pending call，证明 Physical Connection replacement 不改变
peer、proxy、exposure 或 call continuity。

### 3. Node HTTP Acceptor

见 [`websocket-express/acceptor.usage.ts`](./websocket-express/acceptor.usage.ts)。Acceptor
原子地把 implementation 暴露给所有当前及未来 peers；`resolveAll()` 返回稳定 Group，
每次 method invocation 重新截取 peer snapshot，并让每个 fulfilled/rejected result 携带
对应的稳定 peer。

### 4. 独立 Transport Adapter seam

[`websocket-adapters.ts`](./websocket-adapters.ts) 模拟独立
`@husky-di/remote-websocket` 包的 public Interface；Node/WebSocket 类型没有进入 remote
core。[`connection.usage.ts`](./connection.usage.ts) 证明 Protocol 只需要完整 encoded
message stream、local-admission `send()` 和幂等 `close()`。Acceptor Adapter 用 hot、
multicast、无 replay 的 `Observable<IRpcConnection>` 报告接受的 Connection。

订阅数量不建立 Connection ownership：即使只有一个订阅者也能转交引用。把 Adapter 传给
`acceptor.listen(adapter)` 才让 Acceptor 成为随后 Connections 的 owner；其他订阅者只观察，
持有同一个引用并不授予调用 `send()` / `close()` 的 authority。非 owner 调用它们属于契约
违例；这个规则是角色契约，而不是 TypeScript 能提供的 linear ownership 保证。Adapter 在
自己的 `listen()` 被调用前不得 emit；Acceptor 先订阅，再启动 Adapter，并拥有启动完成前后
的全部 emission。每条 Connection 由 source emit 一次，所有订阅者看到相同 object identity。

`message$` 的各订阅者同样看到相同 message value，必须把 bytes 当作只读。Call event 的
`args` 是排除本地 `AbortSignal` 的 detached observation snapshot，成功 `result` 也与业务
活值断开，因此 observer 不能借此改写 RPC。两者都不自动脱敏或记录；日志与 tracing
subscriber 负责脱敏。

本原型中的三个 Observable 及其 terminal 语义是：

| Stream | Type | Terminal |
| --- | --- | --- |
| Topology observation | `Observable<RpcEvent>` | 发出一个 `topology-closed` 后 complete；不 error。 |
| Physical messages | `Observable<Uint8Array>` | 正常 Connection terminal 时 complete；Transport failure 时 error。 |
| Accepted Connections | `Observable<IRpcConnection>` | 正常 listener terminal 时 complete；listener failure 时 error。 |

## Public member 的工作流证明

| Member | 必要工作流 |
| --- | --- |
| `createRemoteServiceDescriptor()` | 把原始本地 service identity、显式跨语言 wire identity 与 method allowlist 封装为一个 opaque runtime descriptor。 |
| 两个 owner factory | Connector 与 Acceptor 的 topology、Adapter role 和返回类型不同；两个命名入口比 discriminated overload 更直接。 |
| factory `protocol?` | 默认路径零配置，同时允许完整替换 wire semantics；精确 Protocol contract 不在本 prototype scope 内。 |
| `connector.connect(adapter)` | 调用者选择每一次 Physical Connection attempt；Connector 只接管兑现的 Connection，Protocol 保持原 Session identity。 |
| `acceptor.listen(adapter)` | passive topology 需要持续拥有并终止 listener，而不是逐 Connection 调用。 |
| `close()` | 只等待 caller 发起的幂等网络 teardown；自然终止和 fatal failure 属于 `event$`。 |
| `connector.peer` | 一对一 topology 中稳定 Logical Session 的 caller anchor。 |
| `peer.expose()` / `peer.resolve()` | 分别表达双向 RPC 的本地 implementation 与远端 proxy，两个动词不能无损合并。 |
| exposure `Cleanup` | 动态调用时查询 registration；Cleanup 可让后续 invocation 停止命中该 implementation，而不销毁 peer/owner。 |
| `acceptor.peers` | hot、无 replay observation 不能回答晚订阅者的当前 membership；只读 snapshot 补足它。 |
| `acceptor.expose()` | 原子覆盖当前及未来 peers，避免 caller 重复注册与 handshake race。 |
| `acceptor.resolveAll()` | 隐藏 fresh snapshot、并发、逐 peer failure 与 peer/result association。 |
| `event$` | 一个只读 stream 覆盖 Topology terminal、peer lifecycle、Recovery 和 call telemetry，避免多个浅 Observable。 |
| Adapter `connection$` / Connection members | 这里只证明 package seam 与工作流必要性；精确 Transport contract 不在本 prototype scope 内。 |

## 主动删除的 Interface

- 通用 `start()`：Connector 与 Acceptor 的依赖、所有权和恢复动作不同，保留领域动词
  `connect(adapter)` / `listen(adapter)`。
- `peer$`：并入 `event$`；当前 membership 由 `peers` snapshot 回答。
- 同步 `dispose()` / `disposed`：网络 teardown 需要可等待结果；状态布尔值会诱导 TOCTOU
  检查，事件终态属于 `event$`，主动 teardown completion 属于 `close()`。
- `RpcBatchResultStatusEnum`：直接使用标准的 `"fulfilled" | "rejected"` discriminant。
- `type: "unary"`：v1 没有第二种 call kind，这个标签没有区分能力。
- 两阶段 wire contract/binding builder、method alias 与公开 Descriptor getters：v1 没有证明
  它们能提供值得额外 Interface 的 caller leverage。
- 内嵌 WebSocket Adapter Implementation：原型只验证 package seam，不实现另一个 package。

Protocol SPI、Transport Adapter、lifecycle event payload 与错误 race 的精确 contract 不在本
prototype scope 内。Descriptor identity 与类型映射仅是原型结论；本文件不是生产实现或 normative specification。
