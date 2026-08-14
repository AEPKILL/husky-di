# 暂定的面向用户 RPC interface

这里现在只保留一套 throwaway prototype source，作为下一轮讨论的参考。它尚未成为
`@husky-di/remote` 的生产 interface，也不接入当前 workspace 的依赖或验证流程；旧候选
源码和讨论材料已经删除。

## 当前形态

- `createRpcConnector({ adapter })` 创建主动 topology owner，并公开一个稳定的
  `connector.peer`。
- 单个 Logical Session 的 `expose()` 与 `resolve()` 都位于 `RpcPeer`；Connector
  不复制这些成员。
- `createRpcAcceptor({ adapter })` 创建被动 topology owner。它公开 `peers`、
  `onPeer()`、`resolveAll()`，并用集合级 `expose()` 原子覆盖所有当前及未来 peer。
- Connector 与 Acceptor 各自拥有其 exposure、Logical Session 和连接；Acceptor 还拥有
  listener。两者只借用本地 implementation、adapter 借用的外部 HTTP server 等外部资源。
- `Cleanup` 只移除一次 exposure 或订阅；`Connector`、`Acceptor` 和 listener 使用
  `dispose()`。一次性的 `IConnection` 不再公开 `dispose()`，只以幂等 `close()`
  结束连接。

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

try {
  await acceptor.listen();
  await clients.changed("maintenance-scheduled");
} finally {
  cleanup();
  acceptor.dispose();
}
```

## Connection seam

```ts
interface IConnection {
  readonly messages: Observable<Uint8Array>;
  send(message: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
```

`messages` 是 hot、单订阅的完整 encoded RPC message 源。正常远端关闭时 complete，
传输故障或 buffer overflow 时 error。取消唯一 subscription 表示放弃连接，adapter
会在内部终止底层传输，不需要另一个公开的 abort/dispose member。

Observable 不提供 consumer backpressure。无法暂停的 push transport 必须限制自己
实际持有的消息数和字节数；RPC implementation 如果把消息转交给异步队列，该队列
也必须独立有界。`send()` 的 Promise 只表示本地复制/消费与 admission，不表示远端
delivery、decode 或 ACK。`close()` 会同步禁止后续 send，并异步完成 graceful close。

## 文件

- `rpc-interface.ts`：唯一的 caller 与 adapter interface 声明。
- `fixtures.ts`：两端共用的业务类型、implementation 与 descriptor options。
- `type-validation.usage.ts`：逐方法 map、取消参数和 proxy shape 的编译期负例。
- `connection.usage.ts`：RPC implementation 如何订阅消息、发送并关闭连接。
- `websocket-adapters.ts`：浏览器 Connector adapter 与 Node/`ws` Acceptor adapter。
- `websocket-express/connector.usage.ts`：浏览器主动端装配。
- `websocket-express/acceptor.usage.ts`：Express 共享 HTTP server 的被动端装配。
- `websocket-express/remote-services.ts`：两端共享的 immutable descriptor。
- `websocket-express/platform.ts`：Express、Node HTTP 与 `ws` 的薄类型适配。
