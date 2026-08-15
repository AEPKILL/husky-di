# 调研可恢复 RPC 的交付保证

Type: research
Status: claimed
Blocked by:
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

根据正式协议规范、分布式系统论文或第一方实现文档，透明 Session Recovery 在请求可能已执行而响应丢失时能够诚实提供哪些保证？调查 call identity、ACK 层级、重放、terminal-result ledger、去重、Session 保留、恢复拒绝、进程重启和非幂等副作用的关系，明确 v1 可以承诺的上限以及必须暴露给调用者的失败边界。历史 research branch 只能作为线索，结论必须回到一手来源。
