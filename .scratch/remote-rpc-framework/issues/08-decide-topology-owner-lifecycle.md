# 决定 Topology Owner、资源所有权与 Observable 生命周期

Type: grilling
Status: open
Blocked by: 01, 07
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

`RpcConnector` 与 `RpcAcceptor` 应如何拥有启动、Adapter、Physical Connection、Logical Session 和终止状态，同时让 `RpcPeer` 只负责双向 `expose()` / `resolve()`？在 Physical Connection 只提供 Direct Connection Close、Graceful RPC Shutdown 明确属于更高层的前提下，决定 Topology Owner 的 `close()` 是直接终止还是编排停止新调用、在途状态与超时的 graceful shutdown，是否需要第二个 lifecycle command，以及重复或重叠的 `connect()` / `listen()`、失败重试、dispose、外部资源借用、多个 Observable 订阅者、零订阅者、complete/error、subscriber exception 与事件调度的精确行为，并消除现有 prototype 的单订阅/ref-count 假设。
