# 验证 Protocol Implementor Interface 的精确形态

Type: prototype
Status: open
Blocked by: 06, 07, 08, 09, 10, 11, 13, 14, 18
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

在前置行为决议完成后，`IRpcProtocol`、role-specific Connector/Acceptor runtime、
Session handle、semantic host ports、call/outcome 与 lifecycle/shutdown transition types 应具有怎样的
精确 TypeScript members、sync/async、ownership、terminal 和 fault contract？产出可编译的
throwaway prototype、一个最小自定义 Protocol、in-memory Connection usage 与正负类型用例，
验证精确 SPI 可由第三方实现且足够深，同时不公开默认 Protocol 的 Codec、Handshake、
Session、Call State 等 private Modules，也不提前决定最终 export path 或 package contract。
