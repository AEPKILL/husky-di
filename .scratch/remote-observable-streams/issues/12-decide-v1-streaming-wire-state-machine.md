# 决定 husky-di-rpc/1 流式 wire grammar 与状态机

Type: grilling
Status: open
Blocked by: 03, 05, 06, 07, 08, 09
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在 profile 名称不变且不兼容当前 unary 草案的前提下，原子定义 husky-di-rpc/1 对 streaming method/property subscribe、item、credit、complete/error、unsubscribe/cancel 的 JSON grammar 与 retained state machine。决定 subscription/item/counter identities，现有 seq/Message Receipt ACK 与 Call Ordinal 的复用或扩展，unary records 是否保留为独立退化路径，合法 transition、duplicate/id reuse、Recovery replay、GC、counter exhaustion、validation/fault scope、terminal reserve与最大 envelope。同步确定 schema/raw vectors/transcripts/security transcript 需要怎样整体替换；不得引入新 profile、fragmentation或默认 Protocol 之外的 caller semantics。
