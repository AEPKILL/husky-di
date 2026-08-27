# 决定 Remote Service Descriptor 的 identity 与类型映射

Type: prototype
Status: resolved
Blocked by: 01
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

Remote Service Descriptor 应如何复用 `@husky-di/core` 的 `ServiceIdentifier<T>`、携带显式 method allowlist 与稳定 wire name、保持 identifier equality 和 ADR-0003 的 metadata 非行为性，同时让 `expose()` 与 `resolve()` 精确推导远程 Promise 方法、取消参数和结果类型？产出可编译的类型 prototype 与正反例，并保持 v1 不自动接入 Container。

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
  `then` 是保留 property，不能成为 method key：所有 remote service proxy 的 `then`
  必须为 `undefined`，从而不会被 `Promise.resolve()`、async return 或 `await` 当成 thenable。
- Descriptor 对 service type `T` 与精确 method selection 都 invariant，且使用 private brand；
  caller 不能伪造 Descriptor，也不能借 TypeScript 的结构兼容把它替换成另一项 service 或
  allowlist。复杂 conditional helpers 不成为可导入的 public type vocabulary。
- `expose()` 只要求 allowlist 选中的 local handlers。完整 `T` 仍可结构赋值，但 properties 与
  未选 methods 不再被无意义地要求；第二个参数使用 `NoInfer`，不能反向改变 Descriptor
  已确定的 service type。
- `resolve()` 只产生选中 methods。每个同步或异步 local result 都映射为
  `Promise<Awaited<Result>>`。
- Cancelable handler 必须有一个精确、required、trailing `AbortSignal`，此前不能再出现
  `AbortSignal`，也不能使用可变长前缀。远端 proxy 去掉这个 wire argument，并在 caller 侧
  追加一个**必传**的 `AbortSignal | undefined` control slot；caller不需要取消时显式传
  `undefined`。普通 method不能标为cancelable；含signal的method不能标为普通unary。
- 该required slot是runtime可实施性要求，不只是type偏好：Descriptor没有也不应复制参数arity，
  optional trailing slot无法区分“省略signal”与“最后一个business argument”，因而无法保证signal
  shape → already-aborted → peer state → value的preflight顺序。Runtime先要求至少一个actual argument，
  再无条件取出最后一槽；`undefined`直接通过，其他值以平台 `AbortSignal` brand semantics验证；不使用
  `instanceof`、duck typing、`Function.length`、Descriptor arity metadata或额外call-options wrapper。
  v1不声称runtime验证business arity：逃逸TypeScript后若最后actual value本来想作为business
  `undefined`/`AbortSignal`，它仍按control解释；这两者本来也不属于合法Application Value参数。
  Signal listener注册与check→register race的精确intrinsic规则由issue 11统一定义，Descriptor不保存
  caller signal或新增cancellation helper。

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
- Acceptor Session 的有效 exposure namespace 是该 peer-local registry 与 Acceptor owner registry
  的 union，同一 `wireName` 不能同时出现在两处。Owner exposure 必须在一次 commit 前预检 owner
  registry 与所有当前 peer-local registry；peer exposure 同样预检两处。新 peer 直接读取 owner
  registry，不复制 entry，因而 owner cleanup 对所有当前与未来 peer 一致生效。
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
- Runtime factory 必须验证并 snapshot 非空 allowlist、拒绝 `then`，保存 immutable normalized
  data，且不保留 caller 的可变 options 引用。`expose()` 必须在修改 registry 前原子读取并验证
  所有选中成员，然后把每个 selected function reference 与原 implementation object 一起保存；
  dispatch 只能调用这些已 snapshot 的 function，并以原 implementation 作为 `this`。Exposure
  后对 implementation property 的替换、删除或 accessor 变化不构成热替换；Cleanup 后重新
  `expose()` 才能安装新 handlers。
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

2026-08-18 consistency amendment：VS Code 同类 proxy 明确保留 `then`，并以 async return / await
测试防止 Promise assimilation；本地图的固定提交证据见
[`vscode-rpc-ipc-precedents.md`](../research/vscode-rpc-ipc-precedents.md)。最终 caller Interface
prototype 必须补充 `then` 的负面类型用例、single-peer proxy 的运行时 assimilation 用例，以及
exposure 后改写 implementation property 仍调用已安装 function 的用例。原 prototype commit
只证明此前的类型映射，不能证明这些新增约束。

以下验证通过：

- `pnpm exec biome check packages/remote/examples/user-facing-rpc-interface`
- `pnpm --filter @husky-di/remote typecheck`
- `pnpm --filter @husky-di/remote test`
- `pnpm --filter @husky-di/remote build`
- `git diff --check`
