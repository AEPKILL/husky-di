# 决定 unary 调用、取消、错误与终止竞态

Type: grilling
Status: open
Blocked by: 04, 06, 10
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

本地 TypeScript method 应如何映射为远端 unary Promise 调用，并在正常返回、同步抛错、Promise 拒绝、caller `AbortSignal`、remote cancel、Session Recovery、owner dispose 与 Protocol failure 同时发生时产生唯一确定的 terminal outcome？决定参数/结果序列化责任、handler `this`、取消注入、错误 code 与 remote details、未知 service/method、race precedence 和 late message 处理。
