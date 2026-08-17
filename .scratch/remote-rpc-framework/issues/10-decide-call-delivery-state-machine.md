# 决定 Call value model、identity、重放与去重

Type: grilling
Status: open
Blocked by: 03, 04, 06, 09
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

所有 conforming v1 Protocol 应共同接受怎样的 caller-visible application value model，custom Protocol 能否改变该模型，透明 Session Recovery 下 message 与 unary call 的 delivery state machine 又是什么？决定 `seq` / `callId` 的作用域、request admission、断线期间的新调用、在途重放、Session-scoped at-most-once dispatch、terminal replay、tombstone/high-watermark 与 evidence GC prerequisites，并定义 validated normalized application values 的跨语言 semantic equality，供重复 identity 比较使用。terminal semantics、numeric bounds 与 resume proof 分别由 [决定 unary 调用、取消、错误与终止竞态](11-decide-unary-call-errors-cancellation.md)、[决定顺序、并发、缓冲与恢复资源上限](13-decide-ordering-concurrency-resource-bounds.md)和[决定 trust-boundary validation 与 Session Recovery 安全](14-decide-validation-recovery-security.md)定义。
