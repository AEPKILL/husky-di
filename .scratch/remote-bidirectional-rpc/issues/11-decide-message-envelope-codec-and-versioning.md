# 决定 message envelope、codec 与版本规则

Type: prototype
Status: open
Blocked by: 06, 08, 09
Parent: [协议无关的双向 RPC](../map.md)

## 问题

哪些准确的 protocol message、字符串 enum、field、codec contract 和版本规则，可以在选定的 transport seam 上表达双向 unary call？决定 service 与 method addressing、argument 与 result、call correlation、ACK、error、cancellation、reconnect/resume control、malformed 与 unknown message、compatibility negotiation，以及未来扩展 streaming 所需的最小 operation/message 结构。
