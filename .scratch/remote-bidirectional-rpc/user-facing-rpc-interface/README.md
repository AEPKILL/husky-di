# 面向用户的 RPC 接口原型

这些文件是**用完即弃、仅用于编译验证的设计探针**。它们用同一组真实工作流比较
不同的公开接口形态；其中任何一个都不是已接受的包接口或生产实现。

## 按读者阅读

调用 adapter factory、填写配置并把 adapter 交给 RPC，属于应用装配；实现
adapter factory、转换平台事件并处理背压与连接生命周期，才属于平台兼容代码。

- 应用开发者：先读 `fixtures.ts`，再选择一个候选目录，分别查看
  `connector.usage.ts` 与 `acceptor.usage.ts`；具体装配可参考
  `in-memory/scenario.ts` 和 `websocket-express/`。
- Adapter 作者：先读 `transport-seams/rpc-interface.ts`，再分别查看该目录中的
  Connector、Acceptor 与 Physical I/O 用例；WebSocket 实现位于
  `websocket-adapters.ts`，Express、`ws` 与 Node 类型的薄适配位于
  `websocket-express/platform.ts`。
- 接口评审者：结合 `public-interface.ts`、`type-validation.usage.ts`，以及现代
  三案各自的 `rpc-interface.ts` 阅读。

## 目录约定

每类 usage 位于独立目录。一个候选目录中的文件职责固定如下：

- `connector.usage.ts` 只展示主动 topology，不创建 Acceptor。
- `acceptor.usage.ts` 只展示被动 topology，不创建 Connector。
- `remote-services.ts` 只保存两种 topology 共用的不可变远端服务 descriptor，
  不持有 RPC、adapter、exposure 或 topology 的生命周期。

`refined-root/`、`direct-tasks/` 与 `eager-connection/` 是现代三案；每个目录还
包含独立的 `rpc-interface.ts`，让候选声明与用户代码同处一类目录。
`root-centered/`、`contract-centered/` 与 `functional-seams/` 是较早一轮的
比较集，共用顶层 `public-interface.ts`。后两者的 `scenario.ts` 只编排两侧
高层 usage，用来保留“两个 topology 显式借用同一公共 owner”的原始对比场景。

`in-memory/connector.usage.ts` 与 `in-memory/acceptor.usage.ts` 分别拥有各自
topology；`in-memory/scenario.ts` 只负责创建 adapter pair 并编排两端，不把两种
RPC 用法重新混入同一文件。`websocket-express/` 同样将共享 descriptor、浏览器
Connector、Express Acceptor 和 `platform.ts` 分开。

`transport-seams/` 不声明业务 descriptor。其文件固定为
`rpc-interface.ts`、`physical-io.usage.ts`、`connector.usage.ts`、
`acceptor.usage.ts` 与 `scenario.ts`：接口、三种 I/O 成本、两种 topology
生命周期和固定对比场景彼此分离。

## 场景矩阵

每个面向调用方的候选方案都应让下列成本清晰可见：

| 场景 | 原型必须展示的内容 |
| --- | --- |
| 契约编写 | 稳定的线上名称、明确的方法白名单和取消元数据 |
| 主动端装配 | 本地回调暴露与一个具体的 Connector Adapter |
| 首次连接前 | 稳定的 peer 和 proxy 是否已经可以存在 |
| 启动失败 | 重试会保留还是替换 owner、peer 和 proxy |
| 取消 | 调用方参数及 handler 所见 `AbortSignal` 的准确契约 |
| 短暂断线 | 替换 Physical Connection 后既有 proxy 是否仍可使用 |
| 被动端装配 | 一个具体的 Acceptor Adapter 和可观察的监听就绪状态 |
| 新 Logical Session | 如何在没有订阅竞态的情况下观察首个 peer |
| 单个 peer | 与一个稳定 `RpcPeer` 关联的直接调用 |
| 全部 peer | 快照时点、并发扇出以及带 peer 标识的局部失败 |
| 局部清理 | 如何结束一个 exposure 或 topology 而不结束其同级资源 |
| 聚合清理 | `rpc.dispose()` 拥有什么、仅借用什么 |

面向 Adapter 的候选方案还需展示 message transport、raw-byte transport
和内存映射；接收失败、出站本地准入、framing 所有权、启动/后续失败以及
幂等释放都不能停留在未写明的约定中。

调用方文件有意接收共享的 Connector/Acceptor Adapter port，而不重复
transport 构造。阅读每个调用方候选时，应同时查看
`transport-seams/rpc-interface.ts`、`physical-io.usage.ts` 及相应 topology
用例：前者检验应用侧人体工学，后者让 WebSocket、TCP 和内存实现成本可见。
这些是用法与契约探针，不是运行时验证。当前目录中已有
`websocket-adapters.ts`，以及 `public-interface.ts` 中的
`createMemoryRpcAdapterPair()`，它们提供了具体的完整帧原型。

## 候选方案

- `refined-root/`：显式的 Connector 与 Acceptor owner；
  创建对象和等待 `connect()` / `listen()` 就绪相互分离。
- `direct-tasks/`：`await rpc.connect()` 与
  `await rpc.listen()` 直接返回可用 handle。
- `eager-connection/`：`rpc.connect()` / `rpc.listen()`
  同步返回 handle，并由其中的 Promise 暴露就绪状态。
- `transport-seams/`：固定主动/被动 topology，以同一个 ping/pong 工作流比较
  三种 Physical Connection I/O 接口。目录中的 adapter factory 都明确只是
  未实现的成本草图；这些文件验证接口用法与书面契约，不验证其实现。

## 调用方形态覆盖表

| 压力点 | 精炼 root | 直接 task | 立即返回的 handle |
| --- | --- | --- | --- |
| 首次连接前的 proxy | 可以 | 形态上不可能 | 可以 |
| 首次失败后重试 | 保留同一 connector、peer 和 proxy | 重新执行整个 task；失败时没有 handle | 释放并重建 connector 和 proxy |
| 后续断线恢复 | 调用方执行 `connector.connect()` | 需要隐藏的自动策略 | 需要隐藏的自动策略 |
| 无竞态地接收首个 peer | 在 `listen()` 前订阅 | 将回调传给 `listen()` | 将回调传给 `listen()` |
| 监听就绪 | `await acceptor.listen()` | `await rpc.listen()` 返回 listener | `await acceptor.ready` |
| 监听后续失败 | 形态上被隐藏 | `listener.closed` reject | `acceptor.closed` reject |
| 定向一个/全部 peer | `peer.resolve()` / `resolveAll()` | `peer.proxy()` / `listener.all()` | `peer.resolve()` / `resolveAll()` |
| 局部/聚合清理 | 均有展示 | 均有展示 | 均有展示 |

直接 task 候选中的 `proxy()` / `all()` 命名是有意保留的：这样命名本身仍是
一个可见的设计维度，而不会被悄悄视为与领域术语 `resolve()` /
`resolveAll()` 等价。

已有的 `root-centered/`、`contract-centered/` 和 `functional-seams/` 目录属于
较早一轮的比较集。在后续评审明确否决并删除某种形态之前，继续保留它们。

## 验证

在仓库根目录使用 `@husky-di/remote` 安装的 TypeScript 可执行文件，对每个
文件执行严格的单文件检查：

```sh
pnpm --filter @husky-di/remote exec tsc \
  --ignoreConfig \
  --noEmit \
  --strict \
  --skipLibCheck \
  --target ES2022 \
  --module ESNext \
  --moduleResolution bundler \
  --lib ES2023,DOM \
  /absolute/path/to/candidate.ts
```
