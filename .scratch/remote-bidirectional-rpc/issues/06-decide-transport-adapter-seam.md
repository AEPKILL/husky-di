# 决定 transport adapter seam

Type: prototype
Status: open
Blocked by: 01, 02
Parent: [协议无关的双向 RPC](../map.md)

## 问题

以“验证面向用户的 RPC 接口”暂定的 Connector Adapter、Acceptor Adapter 与 `IConnection` shape，以及跨运行时 transport 研究为输入，锁定完整 behavioral contract：`messages: Observable<Uint8Array>` 的 ordering、单订阅、completion 与 failure，unsubscribe、owner teardown、transport failure 和 overflow 的内部中止行为，framing/codec ownership，`send(message)` 的 local admission / delivery 事实，以及唯一公开终止入口 `close()` 的幂等性、pending send、remote close、failure 与 timeout 竞态。Observable 不提供 consumer backpressure；Adapter 只限制自身持有的缓存，RPC implementation 的异步处理队列必须自行有界。message transport 保留边界，raw-byte framing 的格式、大小与 buffer limits 仍须在本票中锁定，并由 in-memory conformance tests 验证。不得重新加入 Connection `dispose()` 或把 adapter-author interface 换成 type hole。

## Comments

### 2026-08-14：上游收敛为 close-only Connection

- 上游 prototype 已从多候选收敛到唯一的 `messages/send/close` interface。异常 abort 是 adapter implementation 的内部责任，不是第二个 Connection lifecycle member。
- 本票仍为 `open` 且被 01、02 阻塞；上游当前只称“暂定”，因此这里不提前 claim 或锁定生产行为。
