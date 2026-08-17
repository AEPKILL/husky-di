# 决定 trust-boundary validation 与 Session Recovery 安全

Type: grilling
Status: open
Blocked by: 06, 09, 10, 13
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

先明确 fresh Physical Connection 对 confidentiality、integrity、endpoint identity 与 active attacker 的 Transport threat assumptions；在业务认证、授权和限流留给 application/Transport Adapter 的前提下，RPC Protocol 必须怎样验证不可信 wire input 并保护 Session Recovery 不被冒用？决定 descriptor/wire compatibility、malformed/unknown input、concrete resume proof、proof binding 与 canonical input、replay resistance、对 unauthorized/stale resume attempts 的抵抗与 proof mechanism、Protocol violation scope，以及 lifecycle/call telemetry 的安全暴露约束。Session fencing state 由[决定 Logical Session identity、incarnation、fencing 与 Recovery](09-decide-logical-session-recovery.md)定义，精确数字上限由[决定顺序、并发、缓冲与恢复资源上限](13-decide-ordering-concurrency-resource-bounds.md)定义。
