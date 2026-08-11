# 为未来 streaming RPC 保留兼容 seam

Type: prototype
Status: open
Blocked by: 04, 11, 12, 13
Parent: [协议无关的双向 RPC](../map.md)

## 问题

第一版应使用哪些 public interface 与 wire interface，才能为 client streaming、server streaming 和 duplex streaming 保留清晰路径，同时不导出尚未实现的行为？prototype 应覆盖 operation identity 与 message sequence、per-operation flow control、half-close 与 terminal semantics、cancellation、method kind enum policy 和类型形状，并明确第一版会拒绝或不导出哪些内容。
