# 决定流订阅的资源核算、调度与公平性

Type: grilling
Status: open
Blocked by: 05, 06, 07
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在既有 retained-byte ledgers、per-Session/Owner policy、single send slot 与 handler scheduler 上，决定 active subscription、source-side ready item、replay item、receiver delivery queue、control/terminal reserve 与 Recovery backlog 的确定性核算、上限和释放点；决定过载、protected reserve 与 counter exhaustion 的最小故障范围。同步决定 stream open/item/credit/terminal/cancel 与 unary call/ACK/probe 的调度优先级、per-stream FIFO、多 hot stream 公平性、replay barrier、同步 reentrancy、observer notification/source subscribe/teardown 的 callback 边界，以及长寿命 source subscription 是否占用现有 handler permit。优先复用现有 policy fields，只有独立调节价值被证明时才增加公开 knob。
