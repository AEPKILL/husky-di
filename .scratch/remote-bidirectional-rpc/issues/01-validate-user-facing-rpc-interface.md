# 验证面向用户的 RPC 接口

Type: prototype
Status: claimed
Blocked by:
Parent: [协议无关的双向 RPC](../map.md)

## 问题

从使用者要完成的任务出发，哪些准确的公开 factory、interface、type、enum、命名、所有权规则和使用顺序，能让已经确认的常见工作流自然、可发现且不易误用？先写使用示例，再构建 throwaway prototype；不能从内部 transport、registry 或 session 实现反推 public API。

需要覆盖：连接前配置、主动连接、被动监听、双向调用、单 peer 与多 peer、断线后的 handle、取消、cleanup 和 dispose。Adapter 必须在装配示例中具体出现；还必须展开 adapter author 实际实现的主动建连、被动接受、Physical Connection 双向 I/O、failure、I/O admission/backpressure、ownership 与 dispose，不能使用 `unknown` 或 type hole。精确线上 framing 格式、ACK、协议级流控策略和 `pendingCalls` 仍由后续问题决定。

## 验收标准

- 用相同场景比较至少三种结构明显不同的代码草案；原型只使用代码和注释，不构建交互 UI。
- 默认的一元调用路径保持直接：使用者只需要获取类型安全的 proxy 并调用方法；transport、ACK、codec 与重连策略不进入这条路径。
- Adapter interface 必须能由内存 adapter 完整实现，并足够具体地判断 message/byte transport 的适配成本；RPC caller 无需看到这些 members，但 adapter author 不能依赖未写出的约定。若精确 framing 格式与上限尚未决定，必须明确说明 raw-byte adapter 仍被什么后续 contract 阻塞，不能假装其已可实现。
- Connector/Acceptor 只表达主动/被动连接拓扑；本地服务注册与远程暴露必须形成独立关注点，不能在二者上复制等价 API。精确抽象仍待确认。
- 连接或重连不要求重新注册、重新获取 peer 或重新获取既有 proxy；多 peer 结果必须能与对应 peer 明确关联。
- TypeScript 只暴露 `methods` 逐方法 map 明确选择的远程方法，并准确表达 method kind、Promise 化、取消和批量结果；单个 method value 的 `true` 等价于 `{ type: "unary", cancelable: false }`。运行时所需信息不能假设可从 TypeScript 类型读取。
- 配置错误同步抛出；连接不存在、调用中断、远端错误、未知方法与对象已 disposed 等调用期错误通过 Promise reject；批量调用的单 peer 错误保留在该 peer 的结果中。
- 生命周期只保留与仓库现有约定一致的幂等 `Cleanup` 和 `dispose()`；`close()`、`stop()`、`disconnect()` 等同义入口必须有不可替代的语义才可公开。
- 每个 public member 都记录它服务的具体场景，并通过删除测试；没有具体场景的 options、wrapper、别名或未来扩展点不得进入草案。
- 最终选择必须说明它让使用者少理解了什么，以及被有意留在模块内部的复杂度。

## 讨论检查点（2026-08-12）

已确认：

- 当前只决定 caller 与 adapter author 都必须面对的 interface；精确线上 framing 格式、ACK、协议级流控策略和 call state 留给后续问题，但 adapter 的传输单位、I/O admission/backpressure 与 framing ownership 不能隐藏。
- 后续草案只写代码和注释，不再制作交互式 HTML 原型。
- 本地服务注册/暴露应与 Connector/Acceptor 拆开；二者不应各自复制同一套 API。
- 第一期不考虑 Container 集成；原型必须支持直接传入本地 implementation，是否还需要 resolver/provider shape 只能由独立的真实场景证明。
- Adapter author 也是实际使用者；`RpcConnectorAdapter`、`RpcAcceptorAdapter`、Physical Connection 的建连、监听、双向 I/O、failure、backpressure、ownership 与 dispose 不能以 type hole 隐藏。ACK、重试和 RPC `pendingCalls` 仍不属于 adapter interface。
- Remote method contract 使用逐方法 map；每项将调用 `type` 与 handler `cancelable` metadata 放在一起。`true` 只作为单项 unary/noncancelable shorthand，不支持会隐式暴露全部方法的顶层 `methods: true`；静态类型和 factory runtime 都必须校验配置。

尚未决定：

- Exposure 的准确抽象、命名、共享范围和 ownership，以及除直接 implementation 外是否确有 resolver/provider 场景。
- `RemoteServiceIdentifier`、peer lifecycle 和批量调用的最终 public shape。
- Adapter 交换完整 frame 还是无边界 byte chunk、采用 pull/stream 还是 callback；若选 framed-pull，是否接受当前独立的 graceful `end()` 与 abortive `dispose()` 候选。
- 三案中的最终公开 shape；此前探索的 `RpcServiceRegistry` 方案不视为已接受结论。

## Comments

### 2026-08-12：成熟方案研究与三案原型

- [面向使用者的 RPC interface 人体工学研究](../research/user-facing-rpc-interface-ergonomics.md)：以 Connect、Comlink、vscode-jsonrpc、Cap'n Proto、WHATWG `AbortSignal` 和 ECMAScript `Promise.allSettled` 的一方资料核对 runtime contract、proxy、exposure、stable handle、cancellation、batch、error、ownership 与 adapter seam。
- [面向使用者的 RPC interface 公共声明](../user-facing-rpc-interface/public-interface.ts)、[root-centered](../user-facing-rpc-interface/root-centered.usage.ts)、[contract-centered](../user-facing-rpc-interface/contract-centered.usage.ts)、[functional-seams](../user-facing-rpc-interface/functional-seams.usage.ts)、[内存 adapter](../user-facing-rpc-interface/in-memory.usage.ts)与[类型校验](../user-facing-rpc-interface/type-validation.usage.ts)示例：公共 declarations、共享 fixture 与每个 caller usage 独立成文件，用同一场景比较三种结构。
- 当前推荐以 root-centered 草案进入 HITL 评审：`createRemoteServiceIdentifier()` 以逐方法 descriptor map 固化 runtime contract，`createRpc()` 统一 exposure 和 session ownership；`Connector` / `Acceptor` 只保留主动 / 被动 topology。
- 本票保持 `claimed`。尚待使用者裁决 RPC root 的 naming / aggregate ownership、cancellation 参数、`Acceptor.onPeer()` 和 adapter transport model；裁决前不把原型视为已接受 interface，也不更新地图的 Decisions so far。

### 2026-08-12：移除 Container type hole，展开 adapter-author interface

- 根据使用者反馈，三案都能直接接收 implementation，第一期不再出现 `IContainer` 或 Container-specific resolver；contract-centered 案保留一个通用 binding wrapper，专门用于检验它是否值得存在。
- 原型现在公开 `IRpcConnectorAdapter.connect()`、`IRpcAcceptorAdapter.listen()`、`IPhysicalConnection.frames/send/end/dispose()` 与 listener lifetime，并提供可读实现的 `createMemoryRpcAdapterPair()`；生产 adapter 与测试 adapter 经过同一个 seam。候选还明确了 startup-only adapter signal、单消费者稳定 frame buffer、push source 有界缓存/溢出失败，以及 graceful `end()` 与 abortive `dispose()` 的区别。
- 同一原型另外列出 raw-byte AsyncIterable、Web Streams、message callbacks 三种 adapter 结构，显式比较 framing、inbound demand、graceful end 和错误观察成本。当前 framed-pull 结构只是下一轮 HITL 的推荐候选，不是已接受结论。

### 2026-08-12：逐方法 descriptor 与原型拆分

- 根据使用者反馈，平行的 `methods[]` / `cancelableMethods[]` 已合并为逐方法 descriptor map：完整值为 `{ type: "unary", cancelable: boolean }`；只有单项 `true` 是 shorthand，并在 factory 边界归一化为 unary/noncancelable。
- TypeScript 负例验证非函数 key、顶层 `methods: true`、错误 cancellation slot、未知 method kind 与未知 option 都会失败；runtime factory 仍须为 JavaScript / `any` 做同样的 shape validation，且不能假称能反射 TypeScript method key。
- 原型已在同一目录按职责拆分：`public-interface.ts`、共享 `fixtures.ts`、三种结构各自的 `*.usage.ts`、独立内存装配、独立类型探针，以及 WebSocket adapter / Express 装配，避免公共声明、adapter implementation、场景和类型探针混在一个文件。

### 2026-08-13：独立 usage 与 WebSocket / Express 装配

- 根据使用者反馈，每种结构、内存装配、类型校验和 [WebSocket / Express 装配](../user-facing-rpc-interface/websocket-express.usage.ts)现在各有独立文件；公共业务 fixture 保留在同目录，不从一种 usage 导入另一种 usage。
- [WebSocket adapter 原型](../user-facing-rpc-interface/websocket-adapters.ts)没有隐藏 Connector / Acceptor seam：浏览器 connector 展开 startup abort、`bufferedAmount` admission 与无 `terminate()` 的限制；Node acceptor 展开 `ws` 的 `noServer` / `handleUpgrade`、完整 frame copy、双限 bounded queue、close/error 映射和 listener ownership。
- Express 只作为普通 HTTP request listener，与 RPC 共用一个外部 `http.Server`；adapter 只订阅 `/rpc` upgrade，dispose 会移除订阅并关闭自己的 `WebSocketServer` router，但不会关闭借用的 HTTP server 或已转交给 RPC topology 的连接。Express middleware 不会自动处理 Upgrade；认证/session 不属于本原型，若未来需要，adapter 必须提供可排序、可拒绝的 upgrade 接缝，不能假设另挂一个 EventEmitter listener 就足够。
- 仓库没有 Express / `ws` 的直接依赖，因此 throwaway prototype 以两者真实使用成员的泛型最小结构类型和 constructor injection 保持可编译，没有把传递依赖当成可用公共依赖；`express()` 与 `createServer(app)` 的两步装配仍在 usage 中可见，而具体 application 类型由调用方流入，所以原型自身不依赖 `@types/node`。示例同时展开了 `ws` 的 EventEmitter overload、具体 Node HTTP/stream types 与最小 adapter port 之间的薄适配。该 adapter 是验证 framed-pull seam 现实成本的原型，不表示地图已经决定内置 WebSocket production adapter。
