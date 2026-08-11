# 决定服务 expose 与 Container 集成

Type: prototype
Status: open
Blocked by: 01, 04
Parent: [协议无关的双向 RPC](../map.md)

## 问题

本地服务 expose 和远程 proxy registration 应当在什么 seam 与 `@husky-di/core` 相接？决定已 expose 的 `RemoteServiceIdentifier` 如何定位或 resolve 本地 implementation、是否每次 call 都重新 resolve、Acceptor 级 exposure 如何作用于当前和未来的 peer、proxy 如何注册进 Container，以及由哪个 cleanup 或 disposal owner 移除 registration；这些操作都不能与连接建立耦合。
