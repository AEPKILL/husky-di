# 决定 Call identity、ACK、重放与去重

Type: grilling
Status: open
Blocked by: 03, 06, 09
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

透明 Session Recovery 下每个 unary call 的状态机是什么？决定 call identity 的作用域、请求和 terminal ACK、断线期间新调用的 pending 行为、在途调用重放、handler 至多执行一次所需的去重与 terminal-result replay、双方 ledger 清理、恢复失败后的拒绝，以及调用已产生非幂等副作用但结果无法确认时必须诚实暴露的保证边界。
