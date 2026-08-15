# 调研默认 RPC Protocol 候选

Type: research
Status: claimed
Blocked by:
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

根据官方规范、第一方文档和参考实现，现有开放 RPC Protocol 中哪些能够直接复用或小幅适配，以满足任意有序全双工 Transport 上的对称 unary 调用、取消、结构化错误、版本协商、跨语言 wire contract、Logical Session Recovery、call replay 与去重？比较候选的语义缺口与扩展成本，并回答默认 Protocol 应复用、扩展现有标准还是定义专用 wire contract；不要用二手综述替代一手来源。
