# 决定顺序、并发、缓冲与恢复资源上限

Type: grilling
Status: open
Blocked by: 07, 09, 10, 11, 12
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

RPC framework 应如何调度 message、handler 与 group work，并提供哪些 concurrency 与 backpressure guarantees？决定 Transport、Protocol record、pending call、并发 handler、断线队列、Session retention、terminal payload、dedupe evidence 与 replay state 的 finite limits、默认值、配置位置和作用域，以及 sequence exhaustion、overload、慢 handler 与 Recovery timeout 到既有 unary outcomes 的映射。group work 只调度[验证稳定 Remote Service Group](12-validate-stable-remote-service-group.md)定义的语义。
