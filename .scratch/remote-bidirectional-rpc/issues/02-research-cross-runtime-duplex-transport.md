# 研究跨运行时全双工 transport 的最小契约

Type: research
Status: claimed
Blocked by:
Parent: [协议无关的双向 RPC](../map.md)

## 问题

根据具有代表性的浏览器与 Node.js 全双工原语的一手规范和第一方文档，RPC 能够安全要求的最小 adapter contract 是什么，才能同时容纳面向 message 和面向 byte stream 的协议？记录 message boundary、byte representation、ordering、backpressure、close/error signal、主动建连和被动接受方面的事实，并明确哪些责任必须留在 protocol adapter 中。
