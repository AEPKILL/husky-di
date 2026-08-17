# 决定 unary 调用、取消、错误与终止竞态

Type: grilling
Status: open
Blocked by: 04, 06, 10
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

本地 TypeScript method 应如何映射为远端 unary Promise 调用，并在正常返回、同步抛错、Promise 拒绝、caller `AbortSignal`、remote cancel、Session Recovery、owner shutdown 与 Protocol failure 同时发生时产生唯一确定的 terminal outcome？基于[决定 Call value model、identity、重放与去重](10-decide-call-delivery-state-machine.md)选定的 application value model，决定 call observation contract、handler `this`、取消注入、`RpcError` code/details、未知 service/method、definite-not-executed 与 outcome-unknown 边界、race precedence 和 late message 处理。本票唯一定义 terminal outcomes、shutdown cause 与 race precedence；[决定 Topology Owner 单向 shutdown 通知与本地收敛](18-decide-owner-shutdown-convergence.md)只决定何时、向哪些 calls 应用这些既有语义。
