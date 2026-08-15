# 决定 Remote Service Descriptor 的 identity 与类型映射

Type: prototype
Status: open
Blocked by: 01
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

Remote Service Descriptor 应如何复用 `@husky-di/core` 的 `ServiceIdentifier<T>`、携带显式 method allowlist 与稳定 wire name、保持 identifier equality 和 ADR-0003 的 metadata 非行为性，同时让 `expose()`、`resolve()` 与 `resolveAll()` 精确推导远程 Promise 方法、取消参数和结果类型？产出可编译的类型 prototype 与正反例，并保持 v1 不自动接入 Container。
