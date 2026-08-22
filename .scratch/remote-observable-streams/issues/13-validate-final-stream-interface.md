# 验证最终流式 caller-facing 与 exposure Interface

Type: prototype
Status: open
Blocked by: 03, 04, 05, 06, 07, 08, 09, 10, 11, 12
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在全部行为与 Protocol decisions 完成后，产出一份可编译的最终 throwaway prototype，使规范编写者不再需要发明 caller-facing 或 exposure 行为。覆盖 mixed unary/stream Descriptor、streaming method、Observable property、single IRpcPeer expose/resolve、resolveAll/Remote Service Group exports 的移除、每次 subscribe 独立资源、无订阅无工作、teardown、errors、telemetry、Recovery、shutdown、custom Protocol projection、Node/browser consumer 与 root export inventory；包含正反类型 probes、同步 source/reentrancy runtime probes、Promise assimilation、防 thenable、跨 Recovery trace 和 peers.map 组合示例。该 prototype 不是 production implementation。
