# 验证稳定 Remote Service Group 的批量语义

Type: prototype
Status: open
Blocked by: 08, 09, 11
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

`resolveAll()` 返回的稳定 Remote Service Group 应如何在每次方法调用时截取 Logical Peer 快照，并对加入、终止或正在 Recovery 的 Peer、空集合、结果顺序、per-peer success/failure、整体取消和调用期间的 Session 变化给出可预测语义？产出面向使用者的 prototype，验证稳定 group proxy 与每项结果关联稳定 `RpcPeer` 的 Interface 是否足够深且没有隐藏集合状态。
