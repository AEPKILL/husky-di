# 决定 Stream Item 的确认、去重、重放与 Recovery

Type: grilling
Status: open
Blocked by: 01, 02, 05, 06
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

决定一个远程订阅中 item 与 terminal 的 identity、顺序、Message Receipt ACK disposition、duplicate suppression、replay 与 GC 契约，使同一 Logical Session Recovery 后保留原订阅和 source subscription，未确认 item/terminal 可重放，而本地 observer 恰好按原顺序看到至多一次通知。覆盖 lost item/ACK、item-terminal/cancel race、Recovery barrier 期间的新 emission、retained evidence 释放、Session retention 丢失、counter exhaustion、late/stale binding effects 与 observer callback throw；明确该保证不等于 async consumer 已处理、application effect committed 或跨进程 exactly-once。
