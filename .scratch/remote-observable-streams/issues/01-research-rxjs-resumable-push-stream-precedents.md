# 调研 RxJS 与可恢复推送流的订阅、流控和恢复先例

Type: research
Status: claimed
Blocked by:
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

基于 RxJS 7.8.x 官方文档与源码、Reactive Streams 规范、RSocket 1.0 规范/参考实现以及 gRPC 官方 flow-control 文档，核实本地图依赖的外部事实：Observable identity 与 interoperability、同步 subscribe/next/complete/error、unsubscribe/teardown/reentrancy、多次订阅；push source 在无 demand Interface 时能够诚实获得的有界流控保证；credit/window、取消、retained frame/item、resume/replay 与 terminal 的成熟先例。只记录一手来源支持的事实和约束，不替后续 tickets 选择项目方案；当前产品范围只有远端输出流与直接 Observable 属性，不研究输入流或 duplex Interface。
