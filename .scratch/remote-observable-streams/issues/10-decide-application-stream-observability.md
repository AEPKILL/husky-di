# 决定 Application Stream 的公开观测与 telemetry

Type: grilling
Status: open
Blocked by: 02, 05, 09
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

重写现有“任何 public Observable 订阅都不拥有资源”的过宽不变量，逐项区分 resource-owning remote service Observable 与 resource-neutral state$/peers$/event$/connection$/message$ observations。决定现有 call-started/call-finished 是扩展为每个远程订阅的 started/finished，还是需要更精确但仍小的 closed event shape；覆盖 method/property、complete、source error、unsubscribe/cancel、Recovery、overflow、force 与 ordering，并确定 duration/count/outcome/error code 的最小安全集合。公共 telemetry 必须 bounded、payload-free、无逐 item 事件、无 raw Error 或 wire/session/subscription identity。
