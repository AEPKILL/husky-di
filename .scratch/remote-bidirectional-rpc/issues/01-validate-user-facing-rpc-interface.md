# 验证面向用户的 RPC 接口

Type: prototype
Status: claimed
Blocked by:
Parent: [协议无关的双向 RPC](../map.md)

## 问题

从使用者要完成的任务出发，哪些准确的公开 factory、interface、type、enum、命名、所有权规则和使用顺序，能让已经确认的常见工作流自然、可发现且不易误用？先写使用示例，再构建 throwaway prototype；不能从内部 transport、registry 或 session 实现反推 public API。

需要覆盖：连接前配置、主动连接、被动监听、双向调用、单 peer 与多 peer、断线后的 handle、取消、cleanup 和 dispose。Adapter 必须在装配示例中具体出现，但本票不决定 Connection、ACK、背压或 `pendingCalls` 的内部契约。

## 验收标准

- 用相同场景比较至少三种结构明显不同的代码草案；原型只使用代码和注释，不构建交互 UI。
- 默认的一元调用路径保持直接：使用者只需要获取类型安全的 proxy 并调用方法；transport、ACK、codec 与重连策略不进入这条路径。
- Connector/Acceptor 只表达主动/被动连接拓扑；本地服务注册与远程暴露必须形成独立关注点，不能在二者上复制等价 API。精确抽象仍待确认。
- 连接或重连不要求重新注册、重新获取 peer 或重新获取既有 proxy；多 peer 结果必须能与对应 peer 明确关联。
- TypeScript 只暴露明确选择的远程方法，并准确表达 Promise 化、取消和批量结果；运行时所需信息不能假设可从 TypeScript 类型读取。
- 配置错误同步抛出；连接不存在、调用中断、远端错误、未知方法与对象已 disposed 等调用期错误通过 Promise reject；批量调用的单 peer 错误保留在该 peer 的结果中。
- 生命周期只保留与仓库现有约定一致的幂等 `Cleanup` 和 `dispose()`；`close()`、`stop()`、`disconnect()` 等同义入口必须有不可替代的语义才可公开。
- 每个 public member 都记录它服务的具体场景，并通过删除测试；没有具体场景的 options、wrapper、别名或未来扩展点不得进入草案。
- 最终选择必须说明它让使用者少理解了什么，以及被有意留在模块内部的复杂度。

## 讨论检查点（2026-08-12）

已确认：

- 当前只讨论 user-facing RPC interface；transport、ACK、背压和 call state 留给后续问题。
- 后续草案只写代码和注释，不再制作交互式 HTML 原型。
- 本地服务注册/暴露应与 Connector/Acceptor 拆开；二者不应各自复制同一套 API。

尚未决定：

- 注册与暴露统一后的准确抽象、命名、共享范围和 ownership。
- `RemoteServiceIdentifier`、peer lifecycle、批量调用和 Container 集成的最终 public shape。
- 下一份最小代码草案；今天探索的 `RpcServiceRegistry` 方案不视为已接受结论。
