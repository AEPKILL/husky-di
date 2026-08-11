# 决定 ACK 含义与 delivery guarantee

Type: grilling
Status: open
Blocked by: 03, 08
Parent: [协议无关的双向 RPC](../map.md)

## 问题

每一种 ACK 准确确认了什么事实，由此产生什么可观察的 execution guarantee？决定 request acceptance、terminal result retention、result receipt、cancellation acknowledgment、NACK 行为、使用相同 call identity 的 retransmission、duplicate suppression、terminal result replay、response 丢失时的行为，以及 at-most-once dispatch 与业务结果未知之间的边界。
