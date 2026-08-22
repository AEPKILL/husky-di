# 决定远端 source observation、终止、取消与 teardown

Type: grilling
Status: open
Blocked by: 02, 04
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

为 streaming method 与 Observable property 建立完整 source/terminal/teardown matrix：方法何时执行并验证返回 Observable，属性何时读取/快照，exposure cleanup 是否影响已 admission 订阅；一个远程 subscribe 如何对应恰好一次本地 source subscribe/teardown并保留 application 的 hot/cold/replay 语义；同步 next/complete/error、handler/getter/subscribe/teardown throw、invalid source、unknown route、资源拒绝、observer unsubscribe、可选 AbortSignal、Session terminal 与 late callback 如何竞争。明确 pre/post Admission 的 execution guarantee、first-terminal-wins、重复 unsubscribe、远端 source error 到安全 RpcException(handler-failed) 的映射，以及任何 raw application Error 均不跨线。
