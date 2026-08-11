# 验证面向用户的 RPC 接口

Type: prototype
Status: open
Blocked by:
Parent: [协议无关的双向 RPC](../map.md)

## 问题

从使用者要完成的任务出发，哪些准确的公开 factory、interface、type、enum、命名、所有权规则和使用顺序，能让已经确认的常见工作流自然、可发现且不易误用？先写使用示例，再构建 throwaway prototype；不能从内部 transport、registry 或 session 实现反推 public API。

原型需要覆盖：断线时获取 proxy、连接前 expose、`Connector` 建连、`Acceptor` 监听、双向调用、单 peer resolve、只读 peer snapshot、`resolveAll()` 批量调用、部分成功、取消、cleanup 和 dispose。原型必须展示 interface invariant 与错误发生时机，但不决定 wire protocol。

## 验收标准

- 至少给出三种明显不同的 API 草案，并用相同使用场景比较；不能只调整命名后把同一设计算作不同方案。
- 首选方案的常用 runtime 入口原则上不超过 `createRemoteServiceIdentifier`、`createConnector` 和 `createAcceptor`；任何额外 factory 都必须由独立使用场景证明必要性。
- 默认的一元调用路径保持直接：使用者只需要获取类型安全的 proxy 并调用方法；transport、ACK、codec 与重连策略不进入这条路径。
- `Connector` 与 `Acceptor` 的建连方式符合主动/被动心智模型；连接建立后，双方调用与暴露远程服务的接口保持对称。不能再公开 `accept()`、`serve()`、`start()` 等同义入口。
- `Connector.peer`、预先获取的 proxy 和预先注册的 exposure 在连接前后保持同一 identity；连接或重连不要求使用者重新注册或重新获取。
- `Acceptor.peers` 保持普通只读数组；单 peer 操作由 `RpcPeer` 承担，批量服务调用由 `Acceptor.resolveAll()` 承担，不向数组挂载领域方法。
- TypeScript 自动补全只能看到 `RemoteServiceIdentifier` 明确选择的方法，并准确反映 Promise 化、`AbortSignal` 和批量结果类型。
- 配置错误同步抛出；连接不存在、调用中断、远端错误、未知方法与对象已 disposed 等调用期错误通过 Promise reject；批量调用的单 peer 错误保留在该 peer 的结果中。
- 生命周期只保留与仓库现有约定一致的幂等 `Cleanup` 和 `dispose()`；`close()`、`stop()`、`disconnect()` 等同义入口必须有不可替代的语义才可公开。
- 每个 public member 都记录它服务的具体场景，并通过删除测试；没有具体场景的 options、wrapper、别名或未来扩展点不得进入草案。
- 最终选择必须说明它让使用者少理解了什么，以及被有意留在模块内部的复杂度。
