# 决定 trust-boundary validation 与 Session Recovery 安全

Type: grilling
Status: open
Blocked by: 06, 09, 10, 13
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

在业务认证、授权和限流留给 application/Transport Adapter 的前提下，RPC Protocol 必须怎样验证所有不可信 wire input、限制资源消耗并保护 Session Recovery 不被冒用？决定 descriptor/wire compatibility checks、malformed/unknown message、长度与计数限制、resume proof、重放攻击、Protocol violation 后的关闭策略，以及只读生命周期/调用事件应向日志、Tracing 和 Metrics 暴露哪些安全且稳定的信息。
