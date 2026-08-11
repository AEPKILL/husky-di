# 决定 ordering、concurrency 与资源边界

Type: grilling
Status: open
Blocked by: 09, 10, 11, 12
Parent: [协议无关的双向 RPC](../map.md)

## 问题

在不承诺 global FIFO 的前提下，哪些 ordering 与 concurrency guarantee 能避免意外行为或双向 deadlock？决定 reentrant reverse call、execution concurrency、duplicate arrival race、request/cancel/result ordering、batch fan-out pressure、backpressure、overload rejection、最大 pending 与 in-flight work、replay 与 terminal result retention，以及 retention window 与 session recovery 的关系。
