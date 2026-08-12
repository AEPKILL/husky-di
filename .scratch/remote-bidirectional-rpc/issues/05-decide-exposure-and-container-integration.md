# 决定服务 exposure seam

Type: prototype
Status: open
Blocked by: 01, 04
Parent: [协议无关的双向 RPC](../map.md)

## 问题

不考虑 Container 集成时，本地服务 exposure 应当由哪个准确的公开 owner 与 method 表达？决定直接借用 implementation 是否足够，若不足则哪个真实场景要求 factory/provider；还需决定 implementation 如何与 `RemoteServiceIdentifier` 绑定、一次 exposure 作用于哪些当前和未来 peer、重复 wire name如何处理、cleanup 与 aggregate disposal 如何撤销 exposure，以及多个 Connector/Acceptor 是否共享同一 exposure 集。这些操作都不能与连接建立耦合，也不能复制到主动/被动 topology 上。
