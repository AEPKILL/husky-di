# 暂定的面向用户 RPC interface

这是 `@husky-di/remote` 子包内的一套自包含设计示例，作为下一轮实现讨论的参考。它尚未
成为该包的生产 interface，也不会从 `src/index.ts` 导出；remote 包的类型检查会验证这里
的接口、adapter 和用法。

```bash
pnpm --filter @husky-di/remote typecheck
```

## 当前形态

- `createRpcConnector({ adapter })` 创建主动 topology owner，并公开一个稳定的
  `connector.peer`。
- 单个 Logical Session 的 `expose()` 与 `resolve()` 都位于 `RpcPeer`；Connector
  不复制这些成员。
- `createRpcAcceptor({ adapter })` 创建被动 topology owner。它公开 `peers`、
  `peer$`、`resolveAll()`，并用集合级 `expose()` 原子覆盖所有当前及未来 peer。
- Connector 与 Acceptor 各自拥有其 exposure、Logical Session 和连接；Acceptor 还接管
  adapter 的监听生命周期。两者只借用本地 implementation、adapter 借用的外部
  HTTP server 等外部资源。
- `Cleanup` 只移除一次 exposure；Observable 订阅由 `Subscription.unsubscribe()` 取消。
  `Connector` 与 `Acceptor` 使用 `dispose()`；Acceptor 会一并 dispose 它接管的 adapter。
  一次性的 `IConnection` 不再公开 `dispose()`，只以幂等 `close()` 结束连接。
- 本地 exposed handler 仍可以同步返回或返回 Promise。远程 unary 与批量 proxy 返回
  Promise；持续的 transport 消息、物理连接与 peer 事件保持 RxJS Observable。
  Observable handler 会引入 0/多项 emission 的 streaming 语义，当前 unary descriptor
  会在类型层拒绝它。

浏览器主动端的核心用法：

```ts
const connector = createRpcConnector({ adapter });
const cleanup = connector.peer.expose(remoteClientEvents, clientEvents);
const session = connector.peer.resolve(remoteSession);

try {
  await connector.connect();
  await session.ping();
} finally {
  cleanup();
  connector.dispose();
}
```

Express 被动端的核心用法：

```ts
const acceptor = createRpcAcceptor({ adapter });
const cleanup = acceptor.expose(remoteSession, sessionService);
const clients = acceptor.resolveAll(remoteClientEvents);
acceptor.peer$.subscribe({
  next(peer) {
    void peer
      .resolve(remoteClientEvents)
      .changed("session-opened")
      .catch(reportFailure);
  },
  error: reportFailure,
});

try {
  await acceptor.listen();
  await clients.changed("maintenance-scheduled");
} finally {
  cleanup();
  acceptor.dispose();
}
```

每次调用单 peer remote proxy 方法都会立即发起一次 RPC，并返回单一结果的 Promise；
调用失败时 Promise 拒绝。标记为 `cancelable: true` 的方法在 caller 侧接受可选的
尾随 `AbortSignal`；signal 取消协议调用、中止 runtime 注入给本地 handler 的 signal，
并以 `RpcErrorCodeEnum.canceled` 拒绝 Promise。

`resolveAll()` 返回稳定的批量 proxy；每次调用其远程方法时截取 peer 快照，并在 Promise
中返回完整结果数组。单 peer 失败仍以 `RpcPeerResult.rejected` 留在数组中；caller signal
取消整个 batch 并拒绝顶层 Promise，而不是返回一组 canceled results。`peer$` 是不重放
历史的新 Logical Session hot 事件流；`peers` 继续提供当前只读快照。
`acceptor.listen()` 的 Promise 只表达启动就绪或失败；就绪后的 lifecycle 由 `peer$`
表达，正常 dispose 时 complete，后续故障时 error。

`message$`、`connection$` 与 `peer$` 是随时间到达的持续事件源，因此使用
Observable。只有一个完成结果的 remote proxy、topology 启动与 transport I/O 使用
Promise，调用方可以自然地使用 `async` / `await`。

直接持有 Observable 的属性和变量使用“单次 emission 名称 + `$`”，例如 `message$`、
`connection$` 与 `peer$`。`ping()`、`changed()` 是返回 Promise 的协议方法，因此保持
原方法名。

## Transport seams

```ts
interface IConnection {
  readonly message$: Observable<Uint8Array>;
  send(message: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface IRpcAcceptorAdapter extends IDisposable {
  readonly connection$: Observable<IConnection>;
  listen(signal: AbortSignal): Promise<void>;
}
```

`message$` 是 hot、单订阅的完整 encoded RPC message 源。正常远端关闭时 complete，
传输故障或 buffer overflow 时 error。取消唯一 subscription 表示放弃连接，adapter
会在内部终止底层传输，不需要另一个公开的 abort/dispose member。

Observable 不提供 consumer backpressure。无法暂停的 push transport 必须限制自己
实际持有的消息数和字节数；RPC implementation 如果把消息转交给异步队列，该队列
也必须独立有界。`send()` 的 Promise 只表示本地复制/消费与 admission，不表示远端
delivery、decode 或 ACK；RPC implementation 必须串行等待每次发送。

`close()` 是幂等的 eager command：调用本身同步禁止后续 send，Promise 等待同一个
graceful-close 结果；已有 `message$` 订阅会先收到对应 terminal。Connector adapter 的
`connect(signal)` 也返回 Promise，signal 只取消 connection 所有权移交前的建连阶段。

Acceptor 必须先建立对 adapter `connection$` 的唯一订阅，再调用 `listen(signal)`，因此
不会丢失启动与就绪之间的连接。这个 hot 流不重放历史，`listen(signal)` 兑现前不
emit；每个 next 只向这一 consumer 移交一次物理 connection 所有权。Adapter 正常
`dispose()` 时 `connection$` complete，启动或后续监听故障时 error。这取代了原先
公开的 listener 对象和 `listener.closed`。

WebSocket Acceptor adapter 只借用应用的 HTTP server。`dispose()` 会移除 Upgrade 监听，
但不会关闭这个 server，也不会关闭已经移交给 Acceptor 的 physical connections。Owner 级
`connect()` / `listen()` 不额外暴露 signal，由 owner 的 `dispose()` 结束其生命周期。

## 文件

- `rpc-interface.ts`：唯一的 caller 与 adapter interface 声明。
- `fixtures.ts`：两端共用的业务类型、implementation 与 descriptor options。
- `type-validation.usage.ts`：逐方法 map、Promise proxy、取消参数和 batch shape 的
  编译期正反例。
- `connection.usage.ts`：RPC implementation 如何订阅消息、发送并关闭连接。
- `websocket-adapters.ts`：浏览器 Connector adapter 与 Node/`ws` Acceptor adapter。
- `websocket-express/connector.usage.ts`：浏览器主动端装配。
- `websocket-express/acceptor.usage.ts`：Express 共享 HTTP server 的被动端装配。
- `websocket-express/remote-services.ts`：两端共享的 immutable descriptor。
- `websocket-express/platform.ts`：Express、Node HTTP 与 `ws` 的薄类型适配。
