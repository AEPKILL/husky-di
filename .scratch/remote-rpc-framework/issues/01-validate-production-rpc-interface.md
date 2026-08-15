# 验证生产级 RPC 使用者 Interface

Type: prototype
Status: open
Blocked by:
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

现有 `packages/remote/examples/user-facing-rpc-interface` 应如何演化为最小而完整的生产 Interface，才能以使用者工作流证明每个公开 member 的必要性，并准确表达已确认的双向 unary、稳定 `RpcPeer`、Topology Owner、透明 Session Recovery、multicast Observable、Protocol 注入、独立 Transport Adapter 包和稳定 Remote Service Group？产出可编译的 throwaway prototype、常见路径 usage 与负面类型用例；不得把现有示例的声明当成答案。
