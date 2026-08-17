# 审计 Wayfinder 完成状态并交接 specification

Type: task
Status: open
Blocked by: 15
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

执行 map 定义的 completion predicate。若检查发现未解决或互相矛盾的产品/架构决策，本票失败并创建或重开对应 child；通过后交付只含 authoritative pointers 与 unresolved-check 结果的 `/to-spec` handoff。
