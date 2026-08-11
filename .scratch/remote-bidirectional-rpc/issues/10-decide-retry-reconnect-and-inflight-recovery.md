# 决定 retry、reconnect 与 in-flight 恢复

Type: grilling
Status: open
Blocked by: 04, 09
Parent: [协议无关的双向 RPC](../map.md)

## 问题

如何严格区分 delivery retransmission、新的 business retry 和 Physical Connection 重建？决定哪一层获取新的 Physical Connection、哪一层持有 Logical Session ledger、何时使用相同 call ID 重传、method metadata 是否可以声明 idempotence、retry budget 与 backoff，以及 disconnect、reconnect、timeout、session expiry 和显式 shutdown 时每个 in-flight 阶段的行为。
