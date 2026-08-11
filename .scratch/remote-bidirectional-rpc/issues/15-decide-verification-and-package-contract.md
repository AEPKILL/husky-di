# 决定验证方式与发布包契约

Type: grilling
Status: open
Blocked by: 01, 04, 05, 07, 11, 12, 14
Parent: [协议无关的双向 RPC](../map.md)

## 问题

为了让选定的 RPC contract 持久可靠，需要哪些 normative requirement、runtime specification test、正向与负向 type check、生成声明检查、ESM/CJS consumer test、public export、package dependency、versioning、文档更新和 changeset 规则？定义实施变更必须在同一个 change set 中满足的 acceptance gate。
