# 决定默认 Protocol 的 wire grammar、Codec 与版本协商

Type: grilling
Status: open
Blocked by: 02, 05
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

内置默认 Protocol 的规范化 message grammar 应是什么，才能精确表达 Handshake、Session Recovery、unary call、ACK、cancel、result、remote error 与 terminal 状态，并在任意有序 message Transport 上安全运行？决定 envelope 字段、Codec 与语义层的关系、wire types、版本与能力协商、未知字段/消息处理和跨语言规范形式，同时避免把默认 Protocol 的细节泄漏进通用 RPC Interface。
