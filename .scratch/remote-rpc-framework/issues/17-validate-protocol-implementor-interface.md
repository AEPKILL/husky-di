# 验证 Protocol Implementor Interface 的精确形态

Type: prototype
Status: open
Blocked by: 06, 07, 08, 09, 10, 11, 13, 14
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

在默认 wire、Physical Connection、Topology lifecycle、Logical Session Recovery、call state、
unary outcome、资源上限与 trust-boundary security 的行为决策完成后，`IRpcProtocol`、
role-specific Connector/Acceptor runtime、Session handle、semantic host ports、call/outcome 与
lifecycle transition types 应具有怎样的精确 TypeScript members、sync/async、ownership、
terminal 和 fault contract？产出可编译的 throwaway prototype、一个最小自定义 Protocol、
in-memory Connection usage 与正负类型用例，验证 public implementor seam 遵从 SOLID、足够深且
可由第三方实现，同时不公开默认 Protocol 的 Codec、Handshake、Session、Call State 等 private
Modules，也不提前决定最终 export path 或 package contract。
