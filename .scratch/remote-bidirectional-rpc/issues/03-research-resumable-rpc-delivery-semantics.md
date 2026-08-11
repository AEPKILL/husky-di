# 研究可恢复 RPC 的 ACK 与重传先例

Type: research
Status: claimed
Blocked by:
Parent: [协议无关的双向 RPC](../map.md)

## 问题

根据成熟 RPC 或 messaging protocol 的一手规范和第一方文档，哪些 ACK、replay、deduplication、retry 与 session resume 语义已经在实践中得到验证，这些协议又明确避免承诺哪些保证？结合本工作的约束解释研究结果：Logical Session 可以跨越瞬时断线，但不能跨越任一 peer 进程重启。
