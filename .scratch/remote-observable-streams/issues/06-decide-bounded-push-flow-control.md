# 决定 RxJS push source 的有界流控契约

Type: grilling
Status: open
Blocked by: 01, 02, 05
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在 caller-facing Interface 只有 subscribe/unsubscribe、RxJS producer 又没有原生 request(n) 的条件下，决定 Framework/Protocol 如何兑现逐项有序、无静默 drop/coalesce、有限内存的外部保证。明确 credit/window 单位、初始额度与补充时点，observer 同步 next 返回能证明什么、不能证明什么，同步/reentrant burst、zero-credit source 继续 push、slow observer、Connection loss/Recovery 积压和 capacity exhaustion 如何有界收敛；不得把无法暂停的 application producer 描述成真正 producer backpressure。优先把机制隐藏在深 Protocol Module 内，只有证明 subscribe/unsubscribe 不足时才毕业新的 caller policy/options 问题。
