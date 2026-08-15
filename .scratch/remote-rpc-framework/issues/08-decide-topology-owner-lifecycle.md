# 决定 Topology Owner、资源所有权与 Observable 生命周期

Type: grilling
Status: open
Blocked by: 01, 07
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

`RpcConnector` 与 `RpcAcceptor` 应如何拥有启动、Adapter、Physical Connection、Logical Session 和终止状态，同时让 `RpcPeer` 只负责双向 `expose()` / `resolve()`？决定重复或重叠的 `connect()` / `listen()`、失败重试、dispose、外部资源借用、多个 Observable 订阅者、零订阅者、complete/error、subscriber exception 与事件调度的精确行为，并消除现有 prototype 的单订阅/ref-count 假设。
