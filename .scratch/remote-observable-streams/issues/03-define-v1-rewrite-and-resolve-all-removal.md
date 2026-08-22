# 界定 v1 草案原地改写与 resolveAll() 移除边界

Type: grilling
Status: open
Blocked by:
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在 profile identifier 保持 husky-di-rpc/1、当前 unary wire 草案不受兼容保证、公开 resolveAll() 路线确定移除的前提下，精确界定旧/新 package 构建混跑、滚动部署、既有 retained Session、fresh/resume、wire assets 与 source compatibility 的边界；记录本次 proposal 原地替换如何有意取代现有“新增 semantic kind 必须新 profile”的规则，并决定 package/README/CHANGELOG 应怎样表达。同步确定 Remote Service Group、RpcPeerResult 及相关 exports/tests/examples 的去留，以及 peers.map(peer => peer.resolve(...)) 作为显式组合路线需要承诺什么、不承诺什么。
