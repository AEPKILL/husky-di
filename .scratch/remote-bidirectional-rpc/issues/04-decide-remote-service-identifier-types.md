# 决定 RemoteServiceIdentifier 的 identity 与类型映射

Type: prototype
Status: open
Blocked by: 01
Parent: [协议无关的双向 RPC](../map.md)

## 问题

`RemoteServiceIdentifier` 应当如何保留源 `ServiceIdentifier<T>` 类型、携带已选择的 method contract 和稳定的 Wire Service Name、兼容 core DI 用法，并避免改变既有 identifier equality？产出可通过编译的类型 prototype，覆盖 method key 筛选、同步与异步返回值归一化、普通方法限制、cancelable method metadata、runtime representation 和无效配置。
