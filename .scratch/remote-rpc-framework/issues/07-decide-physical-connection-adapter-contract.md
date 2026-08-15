# 决定 Physical Connection Adapter 契约

Type: grilling
Status: open
Blocked by: 01, 05
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

Transport Adapter 必须向 RPC framework 提供怎样的最小 Physical Connection Interface，才能覆盖浏览器和 Node.js 的 message/stream transports，并满足 hot multicast Observable、多个观察者、无 replay、显式资源所有权、有序发送、本地 admission、消息稳定性、关闭与错误终态以及有界缓冲？同时决定 Connector/Acceptor Adapter 的启动契约和独立 Adapter 包必须通过的 conformance contract。
