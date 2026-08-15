# 决定公开 Protocol Module seam

Type: grilling
Status: open
Blocked by: 01, 02
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

`@husky-di/remote` 应在何处放置一个真实而深的 Protocol seam，使 Topology Owner 与 `RpcPeer` 只依赖稳定的语义 Interface，调用者可以选择内置默认 Protocol 或自定义 Implementation，而 Handshake、Session、ACK、Codec、call state 等内部层不会膨胀公开 Interface？决定 Protocol 的创建、注入、每 Session 状态、能力协商、错误隔离和 conformance responsibilities。
