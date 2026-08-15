# 决定 Logical Session identity、Handshake 与 Recovery

Type: grilling
Status: open
Blocked by: 03, 05, 08
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

双方如何创建、识别、验证并恢复一个跨 Physical Connection 保持稳定 `RpcPeer` 的 Logical Session？决定 Session identity、初始/恢复 Handshake、resume accepted/rejected、并发重连、旧连接替换、Peer 保留与终止、进程重启边界、exposure/proxy 延续、恢复状态可观测性，以及防止新连接冒用既有 Session 的机制。
