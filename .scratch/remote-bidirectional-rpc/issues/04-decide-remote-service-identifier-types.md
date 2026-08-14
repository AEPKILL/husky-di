# 决定 RemoteServiceIdentifier 的 identity 与类型映射

Type: prototype
Status: open
Blocked by: 01
Parent: [协议无关的双向 RPC](../map.md)

## 问题

`RemoteServiceIdentifier` 应当如何保留源 `ServiceIdentifier<T>` 类型、携带逐方法 descriptor map 和稳定的 Wire Service Name、兼容 core DI 用法，并避免改变既有 identifier equality？以“验证面向用户的 RPC 接口”确认的单项 `true` shorthand 与 `{ type: "unary", cancelable?: boolean }` 为 caller 输入，产出可通过编译的类型 prototype，覆盖 method key 筛选、同步与异步返回值归一化、普通方法限制、handler cancellation slot、未来 method-kind discriminated union 的扩展方式、runtime normalization 和无效配置。签名相关约束仍须收窄该泛化形态：普通 unary 只允许省略或显式 `false`，具有必填尾随 `AbortSignal` 的 handler 只允许显式 `true`。

## 验收标准

- 普通 unary method 接受 `true | { type: "unary", cancelable?: false }`；省略 `cancelable` 与显式 `false` 等价，并保留 `true` shorthand。
- 具有一个必填尾随 `AbortSignal` 的 handler 必须显式写 `{ type: "unary", cancelable: true }`；普通 handler 的 `cancelable: true`、含取消参数 handler 的省略/`false`、显式 `cancelable: undefined` 以及其他非 boolean 值均在 factory 边界失败。
- caller 输入中的 `true` 和缺失 `cancelable` 不得泄漏到 descriptor 输出；normalized 类型与 runtime value 始终是 `{ type: "unary", cancelable: boolean }`，并保留准确的字面量 `true` / `false` 推断。
- 使用 `satisfies RpcMethodDefinitions<T>` 校验预先声明的 map 时，必须保留对象实际拥有的 method key；若调用方将整个 map 宽化为 `RpcMethodDefinitions<T>`，其中的 optional key 不得被 proxy 误认为已经选择。
