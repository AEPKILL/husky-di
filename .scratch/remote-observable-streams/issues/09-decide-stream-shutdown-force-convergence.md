# 决定流订阅在 graceful shutdown 与 force close 下的收敛

Type: grilling
Status: open
Blocked by: 05, 07, 08
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

把 active remote subscriptions 纳入既有 G/F 生命周期：G 后拒绝哪些新 method/property subscribe，pre-G 有限或无限流如何继续 complete/unsubscribe 并阻止 drain，现有绝对 shutdown deadline 如何触发 force；扩展完整 drain predicate，并固定 recovering/binding-loss/remote Close、source synchronous teardown/reentrant emission、queued/replay items、observer terminal notification、source unsubscribe 与 late callback fencing 的顺序。force 必须有限地释放 Framework/Protocol/RxJS ownership，且不虚构 remote application effects 已回滚。
