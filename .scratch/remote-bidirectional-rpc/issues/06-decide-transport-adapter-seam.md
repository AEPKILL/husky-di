# 决定 transport adapter seam

Type: prototype
Status: open
Blocked by: 02
Parent: [协议无关的双向 RPC](../map.md)

## 问题

由哪些准确的 Connector、Acceptor、Physical Connection 和全双工 channel interface 组成 protocol adapter seam？决定该 seam 交换 structured message 还是 byte、framing 与 codec 的所有权位于哪里、adapter 保证哪些 ordering 与 delivery 事实、close 和 error 如何暴露，以及 in-memory adapter 如何在不暴露协议专属类型的前提下验证该 seam。
