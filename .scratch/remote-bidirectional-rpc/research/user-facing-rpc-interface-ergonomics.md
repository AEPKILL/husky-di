# 面向使用者的 RPC interface：暂定结论与依据

日期：2026-08-14
状态：暂定，等待后续行为规范与生产实现验证

## 结论

当前只保留一套 interface，完整声明见
[`rpc-interface.ts`](../user-facing-rpc-interface/rpc-interface.ts)：

- `createRpcConnector({ adapter })` 创建主动 topology owner，并立即公开稳定
  `connector.peer`。
- 单 Logical Session 的 `expose()` / `resolve()` 位于 `RpcPeer`。
- `createRpcAcceptor({ adapter })` 创建被动 topology owner；集合级 `expose()`、
  `resolveAll()`、`peers` 与 `onPeer()` 隐藏动态成员变化。
- Remote Service Identifier 使用逐方法 descriptor map，同时携带调用类型与
  cancellation metadata；未选择的方法不会出现在 proxy 上。
- adapter 交付一次性的 `IConnection`。它只公开
  `messages: Observable<Uint8Array>`、`send(message)` 与 `close()`。
- Connector、Acceptor 和 listener 是长期 owner，继续使用 `dispose()`；Connection
  没有第二个 abortive lifecycle member。异常终止留在 adapter implementation 内部。

这仍是 throwaway prototype，不是已接受的 package interface。使用者说“暂定”意味着
可以围绕这一套声明继续锁定行为，但还不能写入生产 specification。

## 使用者任务

### 主动端

1. 创建 adapter 与 Connector。
2. 在首次连接前通过稳定 `connector.peer` 暴露本地 callback，并取得远程 proxy。
3. `await connector.connect()` 后直接调用 proxy。
4. 最外层 owner 在 finally 中 `dispose()`。

具体代码见
[`websocket-express/connector.usage.ts`](../user-facing-rpc-interface/websocket-express/connector.usage.ts)。

### 被动端

1. 创建 adapter 与 Acceptor。
2. 在 listen 前安装集合级 exposure、`onPeer()` 订阅与批量 proxy。
3. `await acceptor.listen()` 后按 peer 定向调用，或通过 `resolveAll()` 扇出。
4. 释放 Acceptor 后，再由应用释放 adapter 借用的 HTTP server。

具体代码见
[`websocket-express/acceptor.usage.ts`](../user-facing-rpc-interface/websocket-express/acceptor.usage.ts)。

## 为什么成员放在这里

### Peer 拥有单会话能力

`RpcConnector` 只表达主动 topology，避免把 `peer.expose()` / `peer.resolve()` 再浅层
转发一次。稳定 peer 让 exposure、proxy 与 Logical Session 身份跨越首次连接前和
短暂 Physical Connection 替换，不要求重新注册或重新取得 proxy。

### Acceptor 拥有集合级能力

`acceptor.expose()` 不是 `peers.forEach(peer.expose)` 的别名。它必须原子处理当前与
未来 peer，在通知 `onPeer()` 和 dispatch 入站调用前安装 exposure，并让 Cleanup
隐藏成员变化。`resolveAll()` 同样在每次调用时截取 peer 快照，并把每项结果与准确
peer handle 关联。

### Connection 只有一个关闭入口

Connection 不会重开或复用。正常调用方只需要幂等 `close()`：调用当下进入 closing、
拒绝后续 send，并异步完成 transport close。buffer overflow、transport error 或唯一
subscription 被取消时，adapter 已知道连接无法继续，因此由 implementation 内部中止，
不要求 RPC 在 `close()` 与 `dispose()` 之间再做一次选择。

若未来真实场景证明调用方必须强制中止一个卡住的 graceful close，应新增语义明确的
`abort(cause)`，而不是恢复含义模糊的 Connection `dispose()`。

### Observable 的限制是 interface 的一部分

`messages` 是 hot、单订阅、有序的完整 encoded message 源。它用 complete 表示正常
远端关闭，用 error 表示传输失败。每次 next 都移交内容稳定的 buffer；adapter 此后
不得修改或复用。

RxJS Observable 不会等待 async `next()`，因此它不是入站 backpressure 协议。WebSocket
等不可暂停的 push source 必须给 adapter 自己持有的 queue 设置 message-count 与
byte-count 双限；RPC implementation 的异步工作队列也必须独立有界。

## 外部依据

- Connect 把调用语义放在独立 `Transport` interface，并提供浏览器与内存实现，证明
  caller 不必依赖 HTTP 实现细节：
  [transport](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/transport.ts#L24-L56)、
  [in-memory transport](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/router-transport.ts#L20-L53)。
- Comlink 的最小 Endpoint 只暴露 message send 与 listener，平台差异留在 adapter：
  [endpoint](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/protocol.ts#L7-L33)。
- vscode-jsonrpc 让 connection 借用 reader/writer，而业务调用不依赖具体 stream：
  [connection factory](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/connection.ts#L608-L615)。
- Cap'n Proto 区分稳定 capability reference 与承载它的 transport connection：
  [RPC](https://capnproto.org/rpc.html)、
  [EZ RPC](https://capnproto.org/cxxrpc.html#initializing-rpc)。
- WebSocket 服务端可以通过 `noServer` / `handleUpgrade` 借用外部 HTTP server；浏览器
  只能用 `bufferedAmount` 观察粗粒度出站排队：
  [`ws` external server](https://github.com/websockets/ws/blob/master/README.md#multiple-servers-sharing-a-single-https-server)、
  [WHATWG bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount)。
- 取消使用 Web Platform `AbortSignal`；批量调用的结果形态遵循
  [`Promise.allSettled`](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.allsettled)
  的逐项 fulfilled/rejected 模型。

## 已移除的探索

早期用于比较的公共 RPC root、contract wrapper、顶层函数集合、直接 async task、
立即返回 handle、raw-byte pull、Web Streams 与 callback 版本均已从工作树删除。
它们的讨论历史仍保留在
[`01-validate-user-facing-rpc-interface.md`](../issues/01-validate-user-facing-rpc-interface.md)
的 Comments 中，但不再作为可编译候选或推荐用法出现。

## 后续仍需锁定

- Observable 的 single-subscription、unsubscribe、close、remote close 与 failure 竞态。
- graceful close 的内部 timeout 与强制终止策略。
- raw-byte transport 的 framing format、最大 message/frame 大小与 buffer limits。
- reconnect、ACK、delivery、retry 与 pending call state。
- exposure Cleanup、owner dispose 与正在 dispatch 的调用之间的准确竞态。
