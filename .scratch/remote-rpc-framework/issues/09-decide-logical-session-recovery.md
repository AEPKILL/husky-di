# 决定 Logical Session identity、incarnation、fencing 与 Recovery

Type: grilling
Status: open
Blocked by: 03, 05, 06, 08
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

双方如何创建、识别并恢复一个跨 Physical Connection 保持稳定 `RpcPeer` 的 Logical Session？决定 Session identity 与 incarnation、fresh/resume/accept/reject transitions、binding epoch/lease/fencing、并发 replacement、旧连接脱离、retained/recovering/terminal transition vocabulary 与 invariants、进程重启边界、exposure/proxy 延续，以及这些状态如何投影到 Topology Owner 的 current/sticky surface。本票只规定 resume proof 必须证明的 Session continuity 与 freshness，不设计 token、key、canonicalization 或具体防冒用机制；它们归 security ticket。Owner shutdown 触发这些 transitions 的时机与顺序归 shutdown ticket。
