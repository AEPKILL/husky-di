# 决定 Remote Service Descriptor 的 identity 与类型映射

Type: prototype
Status: resolved
Blocked by: 01
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

Remote Service Descriptor 应如何复用 `@husky-di/core` 的 `ServiceIdentifier<T>`、携带显式 method allowlist 与稳定 wire name、保持 identifier equality 和 ADR-0003 的 metadata 非行为性，同时让 `expose()`、`resolve()` 与 `resolveAll()` 精确推导远程 Promise 方法、取消参数和结果类型？产出可编译的类型 prototype 与正反例，并保持 v1 不自动接入 Container。

## Answer

采用单一 `createRemoteServiceDescriptor(serviceIdentifier, options)` factory 与 opaque
`IRemoteServiceDescriptor`。Caller 只创建并传递 Descriptor；本地 identity、wire contract、
类型变换与 runtime validation 集中在 Descriptor/Proxy Module 的 Implementation 内，不拆出
contract builder、binding builder、公开 getter 或 Container glue。

可编译 throwaway prototype 固化于
`codex/prototype-remote-service-descriptor@fe94e02`。它是本决策的 primary source，不是生产
导出或 runtime Implementation。

### Public Interface 与类型映射

- Factory 原样接收 `ServiceIdentifier<T>`，并要求 `{ wireName, methods }`。`methods` 必须有
  至少一个确定选中的 string method key；每项只能是 `true` 或
  `{ readonly cancelable: true }`。Method key 同时是 v1 wire method name，不提供 alias。
- Descriptor 对 service type `T` 与精确 method selection 都 invariant，且使用 private brand；
  caller 不能伪造 Descriptor，也不能借 TypeScript 的结构兼容把它替换成另一项 service 或
  allowlist。复杂 conditional helpers 不成为可导入的 public type vocabulary。
- `expose()` 只要求 allowlist 选中的 local handlers。完整 `T` 仍可结构赋值，但 properties 与
  未选 methods 不再被无意义地要求；第二个参数使用 `NoInfer`，不能反向改变 Descriptor
  已确定的 service type。
- `resolve()` 只产生选中 methods。每个同步或异步 local result 都映射为
  `Promise<Awaited<Result>>`；`resolveAll()` 复用相同参数映射，并返回保留稳定 `RpcPeer`
  关联的 `Promise<readonly RpcPeerResult<Awaited<Result>>[]>`。
- Cancelable handler 必须有一个精确、required、trailing `AbortSignal`，此前不能再出现
  `AbortSignal`，也不能使用可变长前缀。远端 proxy 去掉这个 wire argument，并在 caller 侧
  追加 optional `AbortSignal`。普通 method 不能标为 cancelable；含 signal 的 method 不能标为
  普通 unary。

### Identity 与 equality

- Local identity 始终是传入的原始 `ServiceIdentifier`：string 按 core 的值 equality，symbol
  与 constructor 按引用 equality。Descriptor 不包装或替换它，也不改变 core registration /
  resolution 行为。
- Wire identity 始终是 caller 显式给出的 `wireName`。它不从 string identifier、class name、
  symbol description 或 metadata 推导；`ServiceIdentifier` 与其 metadata 永不编码到 wire。
- Descriptor object reference 没有 service identity 语义。Factory 不 intern Descriptor，也不
  建立进程级 `wireName` registry；同一 `ServiceIdentifier` 可以定义多个 Descriptor。
- 重复只在 active exposure namespace 内判定：同一 Logical Session 的同一个 `wireName`
  最多有一个 exposure，第二次暴露同步且原子失败，即使 Descriptor、identifier 或
  implementation 相同。`IRpcAcceptor.expose()` 必须先验证所有当前 peer，不能部分安装；
  Cleanup 后名称可重新使用，已 dispatch 调用仍使用此前捕获的 implementation。
- `resolve()` 不占用 exposure name，也不保证重复调用复用同一个 proxy object；已经返回的
  proxy 仍须跨 Physical Connection replacement 保持可用。
- ADR-0003 保持不变：`ServiceIdentifier` metadata 不参与 Descriptor 创建、wire identity、
  method selection、路由、判重或 proxy cache。

### 支持边界与 runtime responsibilities

- 精确类型保证只覆盖单一、非泛型 call signature。`any` 参数、`any` / `Promise<any>` 结果、
  RxJS `Observable` 与 `AsyncIterable` result 在类型层拒绝；普通 optional 参数与非 cancelable
  rest 参数仍可映射。
- TypeScript 无法可靠识别所有 generic 与 overloaded call signatures，既不能保证拒绝，也
  不能保持其参数—结果关系；v1 明确把二者列为 unsupported。误用 generic 通常退化为
  `unknown`，overload 通常只保留最后一个 signature。不得用会误拒普通 callable 的类型
  heuristic 假装提供静态保证；caller 应定义简单的 remote-facing service Interface。
- Runtime factory 必须验证并 snapshot 非空 allowlist，保存 immutable normalized data，且不
  保留 caller 的可变 options 引用。`expose()` 必须在修改 registry 前原子验证所有选中成员
  可调用，dispatch 只能访问 allowlist 内的方法。
- Wire value 可编码范围、`wireName` / method name grammar 与长度、handler `this`、Codec
  validation、错误与 cancellation race 仍分别由默认 Protocol wire contract 和 unary call
  票据决定；本票不提前决定它们。
- v1 不读取 Container。需要 DI 的 caller 显式组合，例如
  `peer.expose(descriptor, container.resolve(identifier))`。

### Rejected alternatives

- 拒绝两阶段 wire contract + local binding、local/wire method alias 和未来 call-kind builder：
  v1 没有第二个真实用例，额外 ceremony 与 public types 没有足够 leverage。
- 拒绝公开 `serviceIdentifier`、`wireName` 或 `methods` getter：caller 已持有定义输入，公开读取
  会把 normalized representation 变成长久 Interface。
- 拒绝要求完整 `T` 的 exposure：allowlist 已定义真实 handler surface，强制补齐未暴露成员
  只会增加测试和小型 implementation 的无关负担。
- 拒绝用 metadata 承载 wire behavior、以 Descriptor reference 路由或全局注册 `wireName`：
  它们会分别违反 ADR-0003、制造第三套 identity，或破坏独立 Module、测试与 HMR。

### Verification

以下验证通过：

- `pnpm exec biome check packages/remote/examples/user-facing-rpc-interface`
- `pnpm --filter @husky-di/remote typecheck`
- `pnpm --filter @husky-di/remote test`
- `pnpm --filter @husky-di/remote build`
- `git diff --check`
