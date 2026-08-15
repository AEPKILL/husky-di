# 决定顺序、并发、缓冲与恢复资源上限

Type: grilling
Status: open
Blocked by: 07, 09, 10, 11, 12
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

RPC framework 应对消息发送、接收 dispatch、同一/不同 service method、cancel/terminal 和批量调用提供哪些 ordering 与 concurrency guarantees？决定消息/字节缓冲、pending calls、并发 handlers、断线队列、Session 保留期、terminal outcome payload、轻量 dedupe tombstone/high-watermark 与 replay state 各自的边界、默认上限和配置位置，以及达到上限、慢 subscriber、慢 handler 或 Recovery 超时后的确定失败行为。
