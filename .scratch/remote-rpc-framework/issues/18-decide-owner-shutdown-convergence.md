# 决定 Topology Owner 单向 shutdown 通知与本地收敛

Type: grilling
Status: open
Blocked by: 06, 08, 09, 10, 11, 13, 14
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

已确定 owner `close()` 的跨 peer 通知属于 Protocol，而不属于 Transport Adapter：每个当前连接的 Logical Session 最多发送一次单向 Session-close control，本地至多等待它完成 Local Admission，不等待 remote receipt、Message Receipt ACK 或专用 `close-ack`；receiver 收到后终止 retained Session 且不回复，sender 随后 Direct Close Physical Connection。通知可能在 Direct Close 中丢失；此时 remote 只能把断线按既有 Recovery/retention deadline 处理，这是无确认方案接受的边界。

Topology Owner shutdown 应以什么顺序停止接纳新 work，并在何时、向哪些 inbound/outbound pending calls 应用[决定 unary 调用、取消、错误与终止竞态](11-decide-unary-call-errors-cancellation.md)定义的 shutdown cause？决定无连接或 Recovery Session、repeated/concurrent close、双方同时 close 及其他 terminal races 如何依既有 precedence 本地收敛；同时决定单向 Session-close control 的 active-session phase、schema、相对 call/terminal records 的顺序、既有 validation/fault policy 的应用，以及在首份规范发布前纳入 `husky-di-rpc/1` 的方式。本票不重定义该票的 outcomes/race precedence 或其他上游 policy。
