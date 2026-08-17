# 决定 Topology Owner 启动、资源所有权与可发现状态

Type: grilling
Status: open
Blocked by: 01, 07
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

`RpcConnector` 与 `RpcAcceptor` 应如何启动并拥有 Adapter、listener、Physical Connection、retained Logical Session 与 borrowed external resource，同时让 `RpcPeer` 只负责双向 `expose()` / `resolve()`？决定重复或并发 `connect()` / `listen()`、startup failure/retry、replacement handoff、自然与 fatal terminal、subscriber exception 和事件调度；并定义最小 current/sticky state surface 及其与 event/membership mutation 的一致性，使零订阅或晚订阅 caller 仍能发现 Recovery need、当前 membership 与 terminal reason，而不依赖可能错过的 hot/no-replay event。Session-specific transition/reason 由 Session ticket 投影到该 surface；在途调用结算、grace deadline、timeout 与 Protocol 层 shutdown wire choreography 则分别由 call/resource/shutdown tickets 决定。
