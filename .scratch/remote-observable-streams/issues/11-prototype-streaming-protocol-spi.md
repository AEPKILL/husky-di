# 验证 Streaming Protocol Implementor Interface 与 Transport seam

Type: prototype
Status: open
Blocked by: 04, 05, 06, 07, 08, 09
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

用可编译 throwaway TypeScript prototype、一个最小 custom Protocol Adapter 和正反 contract probes，验证 Framework 与 IRpcProtocol 之间承载远程 output stream 所需的最小 semantic ports：subscription admission、item normalization/admission、credit、terminal、unsubscribe/cancel、Recovery、同步 mutation ordering、retained ownership 与 shutdown。Interface 必须足够深，不泄漏 RxJS implementation types、默认 JSON grammar、sequence/ACK、private scheduler或为 method/property 复制两套浅 seams。同步验证 complete-message Transport Adapter seam 是否无需改变，以及 stream load/backpressure conformance 应由 Protocol 还是 Transport 证明。
