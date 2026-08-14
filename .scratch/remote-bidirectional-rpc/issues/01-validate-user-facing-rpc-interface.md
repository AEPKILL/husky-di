# 验证面向用户的 RPC 接口

Type: prototype
Status: claimed
Blocked by:
Parent: [协议无关的双向 RPC](../map.md)

## 问题

从使用者要完成的任务出发，暂定一套准确的 factory、interface、type、enum、命名、
所有权规则和使用顺序，使主动/被动 topology、双向调用、单 peer/多 peer 和 adapter
装配自然且不易误用。先写 usage，再用 compile-only prototype 验证；不从内部
transport、registry 或 session 实现反推 interface。

当前 prototype 只保留 peer-owned exposure/resolution、独立 Connector/Acceptor owner
和 Observable complete-message Connection。精确线上 framing、ACK、协议级流控、
reconnect 与 `pendingCalls` 仍由后续问题决定。

## 验收标准

- 工作树只保留一套暂定 interface 与对应 usage；已完成比较的旧候选不再作为可编译版本保留。
- 默认的一元调用路径保持直接：使用者只需要获取类型安全的 proxy 并调用方法；transport、ACK、codec 与重连策略不进入这条路径。
- Adapter interface 必须由具体 WebSocket adapter 展开主动建连、被动接受、完整消息 I/O、failure、local admission、buffer limits 与 ownership，不能留下 `unknown` 或 type hole。raw-byte adapter 仍被后续 framing contract 阻塞。
- 暴露接口必须按作用域放置，不能按连接方向机械复制：单个 Logical Session 的 `expose()` / `resolve()` 位于 `RpcPeer`；`RpcConnector` 只管理主动连接并公开稳定 `peer`，不转发等价接口；`RpcAcceptor` 可以提供覆盖当前及未来 peers 的集合级 `expose()` / `resolveAll()`，但必须明确成员变化、cleanup 与 ownership 语义。
- 连接或重连不要求重新注册、重新获取 peer 或重新获取既有 proxy；多 peer 结果必须能与对应 peer 明确关联。
- TypeScript 只暴露 `methods` 逐方法 map 明确选择的远程方法，并准确表达 method kind、Promise 化、取消和批量结果。普通 unary method value 可以写成 `true`、`{ type: "unary" }` 或 `{ type: "unary", cancelable: false }`；前两种都在 factory 边界归一化为最后一种。只有本地 handler 具有一个必填尾随 `AbortSignal` 时才允许且必须显式写 `cancelable: true`；显式 `cancelable: undefined` 非法。factory 产出的 runtime descriptor 始终包含 boolean `cancelable`。运行时所需信息不能假设可从 TypeScript 类型读取。
- 配置错误同步抛出；连接不存在、调用中断、远端错误、未知方法与对象已 disposed 等调用期错误通过 Promise reject；批量调用的单 peer 错误保留在该 peer 的结果中。
- 生命周期按 owner 区分：`Cleanup` 移除 exposure/订阅；Connector、Acceptor 和 listener 以 `dispose()` 释放长期资源；一次性 `IConnection` 只公开幂等 `close()`，异常中止留在 adapter implementation 内部。
- 每个 public member 都记录它服务的具体场景，并通过删除测试；没有具体场景的 options、wrapper、别名或未来扩展点不得进入草案。
- 所有保留的 TypeScript 文件必须在 strict、`exactOptionalPropertyTypes` 与 Biome 检查下通过。

## 暂定结论（2026-08-14）

当前暂定：

- 唯一保留的 caller shape 是独立 `createRpcConnector({ adapter })` / `createRpcAcceptor({ adapter })` owner；不再创建公共 RPC root。
- 单 peer exposure/resolution 位于稳定 `RpcPeer`。Acceptor 只额外公开能够原子隐藏当前及未来成员变化的集合级 operation。
- Remote method contract 使用逐方法 descriptor map；普通 unary 可以省略 `cancelable` 并默认取 false，可取消 handler 必须显式写 true。
- `IConnection` 只保留 `messages: Observable<Uint8Array>`、`send(message)` 与 `close()`。取消唯一订阅、overflow 和 transport failure 由 adapter 在内部中止连接。
- 当前只验证 interface 和 concrete WebSocket assembly；第一期不考虑 Container、ACK、retry、streaming 或生产实现。
- 因为该 shape 仍是“暂定”，本票保持 `claimed`，不更新地图的正式决策或生产 specification。

尚未决定：

- Exposure Cleanup、owner dispose 与正在 dispatch 的调用之间的精确竞态。
- Observable single-subscription、unsubscribe、close、remote close 与 failure 的竞态。
- raw-byte framing 格式、大小与 buffer limits，以及 graceful close 的内部 timeout。
- runtime descriptor validation、reconnect、ACK、retry 与 pending call state。

## Comments

### 2026-08-12：成熟方案研究与三案原型

- [面向使用者的 RPC interface 人体工学研究](../research/user-facing-rpc-interface-ergonomics.md)：以 Connect、Comlink、vscode-jsonrpc、Cap'n Proto、WHATWG `AbortSignal` 和 ECMAScript `Promise.allSettled` 的一方资料核对 runtime contract、proxy、exposure、stable handle、cancellation、batch、error、ownership 与 adapter seam。
- 当时的 `public-interface.ts`、`root-centered/`、`contract-centered/`、`functional-seams/` 与 `in-memory/` 探索文件曾用同一场景比较三种结构；这些源文件已在收敛后删除，历史内容可从 git 查看。类型负例后来收敛到[唯一版本的校验文件](../user-facing-rpc-interface/type-validation.usage.ts)。
- 该轮曾推荐以 root-centered 草案进入 HITL 评审：`createRemoteServiceIdentifier()` 以逐方法 descriptor map 固化 runtime contract，`createRpc()` 统一 exposure 和 session ownership；`Connector` / `Acceptor` 只保留主动 / 被动 topology。
- 本票当时保持 `claimed`。尚待使用者裁决 RPC root 的 naming / aggregate ownership、cancellation 参数、`Acceptor.onPeer()` 和 adapter transport model；裁决前不把原型视为已接受 interface，也不更新地图的 Decisions so far。

### 2026-08-12：移除 Container type hole，展开 adapter-author interface

- 根据使用者反馈，三案都能直接接收 implementation，第一期不再出现 `IContainer` 或 Container-specific resolver；contract-centered 案保留一个通用 binding wrapper，专门用于检验它是否值得存在。
- 该轮原型曾公开 `IRpcConnectorAdapter.connect()`、`IRpcAcceptorAdapter.listen()`、`IConnection.frames/send/end/dispose()` 与 listener lifetime，并提供可读实现的 `createMemoryRpcAdapterPair()`；生产 adapter 与测试 adapter 经过同一个 seam。候选还明确了 startup-only adapter signal、单消费者稳定 frame buffer、push source 有界缓存/溢出失败，以及 graceful `end()` 与 abortive `dispose()` 的区别。
- 同一原型另外列出 raw-byte AsyncIterable、Web Streams、message callbacks 三种 adapter 结构，显式比较 framing、inbound demand、graceful end 和错误观察成本。该轮 framed-pull 结构只是下一轮 HITL 的推荐候选，不是已接受结论。

### 2026-08-12：逐方法 descriptor 与原型拆分

- 根据使用者反馈，平行的 `methods[]` / `cancelableMethods[]` 已合并为逐方法 descriptor map。caller 输入可以使用单项 `true` shorthand 或 object descriptor；factory 边界会把两者都归一化为完整的 `{ type: "unary", cancelable: boolean }` runtime value。
- TypeScript 负例验证非函数 key、顶层 `methods: true`、错误 cancellation slot、未知 method kind 与未知 option 都会失败；runtime factory 仍须为 JavaScript / `any` 做同样的 shape validation，且不能假称能反射 TypeScript method key。
- 该轮原型曾在同一目录按职责拆分：`public-interface.ts`、共享 `fixtures.ts`、三种结构各自的 `*.usage.ts`、独立内存装配、独立类型探针，以及 WebSocket adapter / Express 装配，避免公共声明、adapter implementation、场景和类型探针混在一个文件。

### 2026-08-13：独立 usage 与 WebSocket / Express 装配

- 根据使用者反馈，该轮曾把每种结构、内存装配、类型校验、WebSocket / Express 的[浏览器 Connector](../user-facing-rpc-interface/websocket-express/connector.usage.ts)、[Express Acceptor](../user-facing-rpc-interface/websocket-express/acceptor.usage.ts)和[平台兼容层](../user-facing-rpc-interface/websocket-express/platform.ts)拆成独立文件；公共业务 fixture 保留在同目录，不从一种 usage 导入另一种 usage。应用文件只展示 adapter 选择、RPC 装配与调用；Express、Node HTTP 和 `ws` 的结构类型与桥接集中在平台文件。
- [WebSocket adapter 原型](../user-facing-rpc-interface/websocket-adapters.ts)没有隐藏 Connector / Acceptor seam：浏览器 connector 展开 startup abort、`bufferedAmount` admission 与无 `terminate()` 的限制；Node acceptor 展开 `ws` 的 `noServer` / `handleUpgrade`、完整 frame copy、双限 bounded queue、close/error 映射和 listener ownership。
- Express 只作为普通 HTTP request listener，与 RPC 共用一个外部 `http.Server`；adapter 只订阅 `/rpc` upgrade，dispose 会移除订阅并关闭自己的 `WebSocketServer` router，但不会关闭借用的 HTTP server 或已转交给 RPC topology 的连接。Express middleware 不会自动处理 Upgrade；认证/session 不属于本原型，若未来需要，adapter 必须提供可排序、可拒绝的 upgrade 接缝，不能假设另挂一个 EventEmitter listener 就足够。
- 仓库没有 Express / `ws` 的直接依赖，因此 throwaway prototype 以两者真实使用成员的泛型最小结构类型和 constructor injection 保持可编译，没有把传递依赖当成可用公共依赖；`express()` 与 `createServer(app)` 的两步装配仍在 usage 中可见，而具体 application 类型由调用方流入，所以原型自身不依赖 `@types/node`。平台兼容文件展开了 `ws` 的 EventEmitter overload、具体 Node HTTP/stream types 与最小 adapter port 之间的薄适配。该 adapter 是验证 framed-pull seam 现实成本的原型，不表示地图已经决定内置 WebSocket production adapter。

### 2026-08-14：按 Connector / Acceptor topology 拆分 usage

- 该轮所有候选曾按类别进入独立目录；每个目录的 `connector.usage.ts` 与 `acceptor.usage.ts` 分别只创建一种 topology。独立入口各自管理自身 owner；需要验证共享 services / exposure 的旧场景则由同目录 `scenario.ts` 显式创建公共 owner 并注入两侧，不通过模块级可变状态暗中耦合。
- 每个 caller 候选的 `remote-services.ts` 当时只保存两端共用的不可变 descriptor。较新的三案 `refined-root/`、`direct-tasks/` 和 `eager-connection/` 另有本目录专属的 `rpc-interface.ts`；较早三案继续共用顶层 `public-interface.ts`。
- 当时的 `in-memory/` 场景把 Connector 与 Acceptor 用例分开编排；该目录和其他比较候选后来一并删除。WebSocket / Express 的共享 descriptor、Connector、Acceptor 与 platform 拆分继续保留。
- Transport 成本探针当时位于 `transport-seams/`，固定拆成 `rpc-interface.ts`、`physical-io.usage.ts`、`connector.usage.ts`、`acceptor.usage.ts` 与 `scenario.ts`；Physical I/O、主动/被动生命周期和固定场景不再混在单个大文件中。

### 2026-08-14：省略 `cancelable` 默认取 `false`

- 根据使用者反馈，普通 unary method 的 caller 输入接受 `true | { type: "unary", cancelable?: false }`。`{ type: "unary" }` 与显式 `cancelable: false` 等价，`true` shorthand 继续保留。
- `cancelable` 的省略只适用于不接收取消控制参数的普通 handler。具有一个必填尾随 `AbortSignal` 的 handler 仍必须显式写 `{ type: "unary", cancelable: true }`；显式 `cancelable: undefined` 或其他非 boolean 值必须被静态校验和 runtime validation 拒绝。
- factory 必须区分 caller input 与 normalized output：输入可以省略 `cancelable`，但产出的 runtime descriptor 始终是冻结的 `{ type: "unary", cancelable: boolean }`，不得保留 shorthand 或缺失字段。

### 2026-08-14：peer-owned exposure 与独立 topology owner

- 根据使用者反馈，[当前 interface](../user-facing-rpc-interface/rpc-interface.ts)与对应的[浏览器 Connector](../user-facing-rpc-interface/websocket-express/connector.usage.ts)、[Express Acceptor](../user-facing-rpc-interface/websocket-express/acceptor.usage.ts)不再创建公共 RPC root，而是分别通过 `createRpcConnector({ adapter })` 与 `createRpcAcceptor({ adapter })` 创建独立 owner。
- 单个 Logical Session 的 exposure 与 resolution 都位于稳定 `RpcPeer`；Connector 不提供浅层 `expose()` 转发。Acceptor 的集合级 `expose()` 则覆盖所有当前及未来 peers，负责隐藏成员变化与注册竞态，因此不能用一次 `peers.forEach(peer.expose)` 替代。
- Connector 首次连接前即可通过 `connector.peer.expose()` 注册本地回调并取得远程 proxy；Acceptor 在 `listen()` 前即可注册 topology-wide exposure、订阅新 peer、取得批量 proxy 并观察 `closed`。两者 dispose 各自拥有的 exposure、Logical Session 与 Physical Connection，但仍只借用 implementation 和外部 HTTP server。
- 这组文件仍是 compile-only throwaway probe，本票保持 `claimed`；在 caller interface 最终裁决前不更新地图的既有决策。

### 2026-08-14：以 RxJS Observable 传输完整消息

- 根据使用者反馈，该轮完整消息候选曾将 Physical Connection 的接缝收敛为 `IConnection.messages: Observable<Uint8Array>`、`send(message)`、graceful `close()` 与 abortive `dispose()`。RPC 是唯一订阅者；Observable 按 transport 顺序产生内容稳定的完整消息，正常关闭时 complete，传输失败时 error。
- Observable 是 push 模型，不携带 consumer demand，也不承诺入站 backpressure。Adapter 只对订阅前或自身实际持有的缓存负责并设置上限；RPC implementation 若把收到的消息交给异步队列处理，该队列也必须自行有界，不能把无界缓存从 Adapter 转移到 RPC 内部。
- 该轮的 `send(message)` Promise 只表示 Adapter 已消费或复制调用方字节并完成本地 admission/backpressure，不表示远端已收到、解码或确认。`close()` 当时被定义为等待既有发送并执行优雅关闭，`dispose()` 则同步中止 pending I/O；这组双终止入口已被后续评论取代。
- message transport 保留原生消息边界。raw-byte transport 仍须由 Adapter 完成 framing/reassembly；精确格式、最大消息或 frame 大小与 buffering limits 留给后续 transport ticket。本票继续保持 `claimed`，不据此改写地图。

### 2026-08-14：收敛为单一暂定 interface

- 根据使用者反馈，工作树不再保留平行候选。`root-centered/`、`contract-centered/`、`functional-seams/`、`refined-root/`、`direct-tasks/`、`eager-connection/`、`in-memory/` 与 `transport-seams/` 已删除；比较结论只作为本票历史和研究摘要保留。
- 唯一声明收敛到 [`rpc-interface.ts`](../user-facing-rpc-interface/rpc-interface.ts)。WebSocket / Express 目录只保留同一 interface 的具体 Connector、Acceptor、descriptor 与 platform 装配，不再拥有第二份候选声明。
- 上一条评论中的 Connection `dispose()` 决定被本轮取代。一次性 `IConnection` 只公开 `messages`、`send()` 与幂等 `close()`；取消唯一 subscription、overflow 与 transport failure 走 adapter 私有 abort path。长期 Connector、Acceptor 和 listener 的 `dispose()` 保留。
- [`connection.usage.ts`](../user-facing-rpc-interface/connection.usage.ts)保留 Observable 消费与 close-only lifecycle 的 compile probe；类型负例也只验证这一套 interface。
- 该选择仍是暂定结论，因此本票继续保持 `claimed`，不更新地图或生产 specification。
