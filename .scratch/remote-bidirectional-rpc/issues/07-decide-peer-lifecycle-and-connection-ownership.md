# 决定 peer lifecycle 与连接所有权

Type: prototype
Status: open
Blocked by: 01, 06
Parent: [协议无关的双向 RPC](../map.md)

## 问题

Connector、Acceptor、RpcPeer、Physical Connection 与 Logical Session 的完整 state model 是什么？决定连接前创建、`connect()` 与 `listen()` 的所有权、accepted peer 创建、Acceptor peer snapshot、断线调用拒绝、瞬时 reconnecting state、close 与 dispose 的区别、幂等 cleanup、event observation，以及 peer 建立后这些行为如何保持对称。
