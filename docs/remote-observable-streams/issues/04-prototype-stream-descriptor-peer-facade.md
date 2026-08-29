# 原型化流成员 Descriptor 与单 Peer facade Interface

Type: prototype
Status: resolved
Blocked by: 01, 02, 03
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

用可编译 throwaway prototype 确定现有 opaque Remote Service Descriptor 与 IRpcPeer.resolve() 如何以最小 Interface 同时表达 unary 方法、直接返回 Observable 的方法和只读 Observable 属性。关闭 method/property allowlist 与 wire-name namespace、then 保留名、direct Observable 与拒绝的 Observable 参数/Promise-wrapped/nested/AsyncIterable 形态、ordinary args 与 AbortSignal、property readonly/$ suffix/getter/data-property 资格、Descriptor invariance、exposure implementation 映射、runtime interaction-kind metadata、facade member identity、frozen/null-prototype/non-thenable/可解构性质，以及 draining/closed/recovering 上的读取与 subscribe preflight。原型必须体现每次 subscribe 独立且 cold，不重新引入 Group facade，并以正反类型与最小 runtime probes 证明 Interface 深度。

## Answer

### 一个成员 namespace 与三个显式 interaction kind

- `createRemoteServiceDescriptor()` 保留现有 opaque Descriptor 形态，但把分离的 unary `methods` allowlist 收敛为一个非空 `members` namespace。每个选中成员只能采用四个 exact declaration shape 之一：`{ kind: "unary" }`、`{ kind: "unary", cancelable: true }`、`{ kind: "stream-method" }` 或 `{ kind: "stream-property" }`。
- `wireName` 仍是 service-level Wire Service Name；method 与 property key 共用同一个区分大小写的 wire member namespace。声明必须是 own enumerable string data property，runtime snapshot 只保留规范化后的 interaction-kind/cancelable metadata，并冻结为 null-prototype allowlist。
- exact member name `then` 对所有 interaction kind 保留；空 allowlist、未知 member、额外 definition field、accessor definition 或错误 kind 均被 static surface 或 runtime snapshot 拒绝。
- Descriptor 同时对 service type `T` 与 exact selected member definitions 保持 invariant；它不能通过结构赋值扩大或缩小 service/member 契约。`expose()` 与 `resolve()` 都只消费这一份 opaque Descriptor 关系。
- 本票不重新讨论 Group。`IRpcAcceptor.resolveAll()`、Remote Service Group 与 `RpcPeerResult` 的删除，以及显式多 Peer 组合路线，完全继承 03 号票的既有决议。

### 允许与拒绝的 TypeScript member 形态

- `stream-method` 必须直接返回 `Observable<Item>`；调用参数只能是 ordinary Application Value candidates，且不得在任何位置包含 `AbortSignal`、`Observable` 或 `AsyncIterable`。Promise-wrapped Observable、nested Observable、Observable item 中的 Promise-like/Observable/AsyncIterable，以及直接 `AsyncIterable` 均不属于 v1 Interface。
- cancelable unary 继续使用 exact required trailing `AbortSignal` 的既有本地签名与 `{ kind: "unary", cancelable: true }` declaration；caller facade 暴露对应的 required `AbortSignal | undefined` control slot。普通 unary 与既有 Application Value result 规则不变。
- `stream-property` 在 service Interface 中必须 required、`readonly` 且 key 以 `$` 结尾。`$` 只是 stream property 的必要资格，不是对 method name 的全局保留规则；显式 kind 而非后缀负责 runtime routing。
- `RemoteServiceImplementation<T, Members>` 要求 implementation 提供每个 selected member，但不因 service Interface 的 `readonly` 而要求 data-property descriptor 必须 `writable: false`。

### Exposure source acquisition 与 Observable qualification

- unary/stream method 必须解析为 data function；exposure 捕获 function 与 implementation receiver，facade closure 不依赖调用方 `this`。
- stream data property 必须在 exposure installation 时通过本 package RxJS `isObservable()` guard；Framework 当场捕获其 source reference，之后 implementation 对可写 property 的替换不改变该 exposure。
- stream getter 必须有 getter 且没有 setter。Exposure 捕获 getter 与 receiver，但只在每次 Remote Stream Admission 后读取一次；getter throw 或返回不合格 source 时，该次流以安全 handler failure 收敛且不开始 Source Subscription。
- stream method 在每次 Remote Stream Admission 后执行一次，其直接返回值使用同一 guard。`isObservable()` 只是 local exposure misuse guard：接受当前 RxJS 的 Observable instance 或 `lift + subscribe` 形态，但不证明 wire、安全或完整 RxJS compliance。
- Framework 不用 constructor identity 限制 Observable，不调用 `from()` 扩大输入集合，也不把 `Symbol.observable`、Promise、AsyncIterable 或任意 observable interop object 提升为公共 Interface。

### Single-Peer facade shape 与 identity

- `IRpcPeer.resolve(descriptor)` 同步、eager 地创建 frozen、null-prototype facade；它只包含 selected own enumerable data members，`then === undefined`，因此 `await`、async return 与 `Promise.resolve()` 不会启动 RPC。
- method closure 不依赖 facade `this`，可以安全解构。同一个 resolved facade 内 unary/stream method closure identity 稳定；每次调用 stream method 都返回一个新的 Remote Observable。
- 同一个 resolved facade 内 stream property 在 facade construction 时创建一次 Remote Observable，重复读取保持 identity。不同 `resolve()` 调用不承诺复用 facade、closure 或 property Observable identity。
- Facade、closure 与已经取得的 Remote Observable 在 successful Session Recovery 前后保持原对象；`resolve()`、method call、property read 与对象保留均不执行远程工作，也不因 Peer 正在 recovering、draining 或已经 closed 而抛出状态错误。

### Cold subscribe、preflight 与状态边界

- stream method call 捕获本次调用的 ordinary argument references，但不读取或归一化它们；每次 `subscribe()` 独立地把这些引用归一化为 detached immutable Application Value snapshot。因此同一个 Remote Observable 的不同订阅拥有独立 Caller Stream Subscription，也可能在订阅前 mutation 后得到不同 snapshot。
- 每次订阅的 preflight 顺序固定为：建立本地 RxJS Subscriber；检查 Owner/Peer/retained Session availability；归一化 ordinary arguments；取得 finite Pending capacity；提交 Local Stream Subscription Admission；有 current binding 时才进入 Outgoing Stream Admission。
- `connected` 允许正常 admission。`recovering` 允许完成 local preflight 并保留 finite、identity-free Pending Stream Subscription，直到 current binding 可接受 Outgoing Admission；成功 Recovery 不替换已存在的 facade/Observable，也不重建已经 admitted 的 Source Subscription。
- `unbound`、`connecting`、`draining` 与 `closed` 的新订阅通过 Observable error channel 通知安全的 `RpcException(unavailable)`。状态失败发生在 argument inspection 之前；preflight `TypeError` 或 `RpcException` 不从 property read 或 stream-method call 同步抛出。
- 失败在 Local Stream Subscription Admission 前不创建 Stream Identity、wire work、member execution、property getter read 或 Source Subscription。每次成功订阅严格独立；Framework 不隐式 share、cache 或 replay application items/source。

### 取消边界

- Application Stream 不增加 `AbortSignal` control path。Caller Stream Subscription 的 `unsubscribe()` 是唯一 caller-facing stream cancellation mechanism；Outgoing Stream Admission 前撤回保留 Definite Non-Execution，之后取消进入既有 cooperative remote teardown 生命周期。
- Unary 的 `AbortSignal` contract 不被 stream Interface 改写。原型只复用并验证安全 control-slot preflight、captured platform getter/listener、check-register-recheck，以及 caller signal 到独立 Framework-owned handler signal 的映射；完整 unary Pending、Recovery、capacity 与 terminal 状态机仍由现有 contract 定义。

### Prototype evidence

- throwaway branch：`codex/prototype-remote-observable-facade`
- evidence commit：`b3fe85d prototype(remote): explore observable service facade`
- artifacts：`packages/remote/examples/remote-observable-facade/README.md`、`remote-observable-facade.prototype.ts`、`subscription-preflight.prototype.html` 与独立 `tsconfig.json`
- compile-time probes 覆盖 positive facade inference，以及 empty/then、mutable/non-`$` property、Observable parameter、Promise-wrapped/nested Observable、AsyncIterable、stream `AbortSignal`、service/member Descriptor invariance 等 negative cases。
- runtime probes 覆盖 Descriptor/facade freeze/null prototype/non-thenable/destructuring、member identity、data/getter acquisition、每次 subscribe 独立 cold source、recovering Pending、unavailable-state error-channel preflight，以及 unary Framework-owned signal mapping。原型经 TypeScript、runtime probes、Biome、repository code-standard 与 HTML script parse 验证通过。

本决议不产生新 ticket；source terminal/teardown、capacity、Recovery delivery、resource fairness 与 wire state machine 仍由现有后续 tickets 依赖本 Interface 继续决定。
