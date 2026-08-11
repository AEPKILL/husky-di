# 决定 error、cancellation 与终态竞态

Type: grilling
Status: open
Blocked by: 04, 09, 10, 11
Parent: [协议无关的双向 RPC](../map.md)

## 问题

哪些公开 exception、error code enum、remote error representation 和 cancellation contract，可以让 caller 区分 unavailable、rejected、canceled、timed out、retry exhausted、outcome unknown、remote application failure、protocol failure 与 disposed state？决定 `AbortSignal` 如何到达 cancelable handler、哪些 cancellation 事实只属于 cooperative cancellation，以及 result、error、cancel、disconnect 或 timeout 发生竞态时由哪个 terminal outcome 获胜。
