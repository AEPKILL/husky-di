# 决定远程 Observable 订阅的领域模型与生命周期

Type: grilling
Status: open
Blocked by:
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在 RPC 双方都能发起调用的前提下，为远程方法返回的 Observable、远程 Observable 属性、每次 subscribe、source observation、item、terminal 与 teardown 建立统一领域词汇和 lifetime/ownership 模型；明确它们与现有 Logical Call、Pending Invocation、Framework state$/event$/peers$ observation streams 及 Transport message$/connection$ 的关系。已确定 application stream 的 subscribe/unsubscribe 拥有远程工作，而 lifecycle/telemetry/Transport observation subscriptions 仍不拥有其所观察资源；本票应把该区别写入 CONTEXT.md，并确定各 admission linearization point 与 Framework、Protocol、RxJS source 的 ownership seam，但不决定精确 TypeScript members 或 wire record。
