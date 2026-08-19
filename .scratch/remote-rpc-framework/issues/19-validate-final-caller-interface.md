# 验证最终 caller-facing RPC Interface

Type: prototype
Status: resolved
Blocked by: 04, 08, 09, 11, 12, 13, 14, 17, 18
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

在全部行为与 Protocol SPI 决议完成后，`@husky-di/remote` 的 caller-facing TypeScript
Interface 应具有怎样的精确 exported members、generic 关系、sync/async、ownership、state/event、
error、cancellation 与 terminal contract？产出新的可编译 throwaway prototype，覆盖 Descriptor、
Connector、Acceptor、Peer、Remote Service Group（若保留）、Protocol 注入和 Transport Adapter
usage；包含 common-path examples、正负类型用例、`then` assimilation runtime 用例、Node/browser
consumer fixtures，以及 state/Recovery/shutdown 的小型可交互 trace。最终 prototype 必须直接表达
08–18 的最终决议，不得把 issue 01 的历史 prototype 或当前 package example 当成生产答案，也不
提前决定 issue 15 所拥有的 export path、package format 或 release contract。

## Answer

最终caller-facing Interface采用两个role-specific Topology Owners、一个稳定 `IRpcPeer`、opaque
Descriptor、service-shaped single/group facades及issues 07/17已经确定的Transport/Protocol seams。
可编译原型固化于 `codex/prototype-final-rpc-interface@39fdbbd`；它是整合全部决议后的primary design
evidence，不是当前production export，也不替issue 15决定package subpath或build format。

### Public vocabulary

最终公共符号集合为：

- runtime values：`createRemoteServiceDescriptor`、`createRpcConnector`、`createRpcAcceptor`、
  `RpcError`；
- caller modules：`IRemoteServiceDescriptor`、`IRpcPeer`、`IRpcConnector`、`IRpcAcceptor`、
  `RpcPeerResult`；
- state/observation：`RpcPeerState`、`RpcConnectorState`、`RpcAcceptorListenerState`、
  `RpcAcceptorState`、`RpcTopologyCloseReason`、`RpcCallDirection`、`RpcEvent`、`RpcErrorCode`；
- Transport：`IRpcConnection`、`IRpcConnectorAdapter`、`IRpcAcceptorAdapter`；
- options：`RpcConnectorOptions`、`RpcAcceptorOptions`、`RpcConnectorRuntimePolicyOptions`、
  `RpcAcceptorRuntimePolicyOptions`；
- shared SPI vocabulary直接复用issue 17的 `IRpcProtocol`、required runtime policy、Application
  Value、call/fault/Session reason types，不定义第二套caller interpretation。

Descriptor conditional helpers、single/group mapped facade types与implementation types保持不可导入，
由 `resolve()` / `resolveAll()` inference得到。没有generic `IRpcTopologyOwner<TState>`：它没有独立caller
workflow，只为少量重复增加浅抽象。也不公开 `defaultRpcProtocol` constant；factory省略 `protocol`即选
package-private default，custom injection使用完整structural `IRpcProtocol`。

### Descriptor、facade 与 cancellation slot

- Descriptor仍原样保留local `ServiceIdentifier<T>`、显式 `wireName`及non-empty unary allowlist；type
  parameters invariant，selected implementation使用 `NoInfer`，properties、`any`、streaming result、
  invalid cancellation和reserved `then`按issue 04拒绝。Domain service signatures不被虚假约束为
  `extends RpcApplicationValue`；finite number、plain record、depth/weight等仍由runtime normalization
  证明。
- Single与Group facade都是frozen null-prototype allowlist closures；method可解构且不依赖facade
  `this`，`then === undefined`，`await` / async return / `Promise.resolve`不触发remote call。重复resolve
  不保证同一object，但已返回facade跨Recovery稳定；closed后仍可同步取得facade，调用才异步
  `unavailable`。
- Prototype发现optional trailing signal不可实施：runtime没有TypeScript business arity，无法区分
  “省略control”与最后一个business argument。Cancelable remote single/group method因此固定为
  `(...Params, signal: AbortSignal | undefined)`，control slot必传；不取消时显式传 `undefined`。Local
  handler仍接收required trailing call-private `AbortSignal`。
- Runtime先要求至少一个actual argument并剥离control；`undefined`通过，其他值用捕获的
  `AbortSignal.prototype.aborted` getter intrinsic验证，不能用 `instanceof`或duck typing。Initial
  snapshot处理already-aborted precedence；state/value/capacity与Pending/children commit后，用捕获的
  `EventTarget.prototype.addEventListener/removeEventListener` intrinsics注册，再以aborted intrinsic
  复查，封闭check→register race且不读取可shadow的instance members。Group只注册一个external
  listener再fan out。v1不反射business arity；逃逸type后的final `undefined`/real signal固定按control。

### Exact owners、peer、state 与 errors

`IRpcPeer`公开 `state/state$`、session-scoped `expose/resolve`；Connector公开stable `peer`、
`state/state$`、`event$`、`connect`、`shutdown`、`close`；Acceptor公开 `peers/peers$`、owner-scoped
`expose`、`resolveAll`、listener/start/termination members。所有state/membership snapshot按issues
08/09 frozen、replay-latest、identity-stable-until-next-mutation；events保持hot/no-replay。

- Peer六态精确为 `unbound | connecting | connected | draining | recovering | closed`；draining reason
  只有 `graceful-shutdown | counter-exhaustion`。Acceptor active membership可保留counter-draining peer，
  group snapshot只filter `connected | recovering`。
- Connector state只有owner `active | draining | closing | closed`，但其唯一Session terminal可成为
  topology reason。Acceptor active state内嵌listener `idle | starting | listening | stopped`；individual
  peer或listener terminal不关闭Owner，所以其closed union不包含remote/Recovery/continuity/counter
  reasons。Role-specific unions避免公开不可达variants。
- Session normal reasons是 `graceful-shutdown | forced-close | shutdown-deadline | remote-terminated`；
  `recovery-expired | counter-exhaustion` failed state携带 `RpcError(unavailable)`，
  `continuity-failure | protocol-fault | resource-fault`携带 `RpcError(protocol)`。Connector topology复用
  peer Error identity；Acceptor shared fault才使用Protocol/resource reason。Owner-onlycleanup failure改写
  final topology为 `cleanup-failed`及同一 `Error`/`AggregateError`，已terminal peers不改写。
- `RpcErrorCode = RpcCallFailure | "protocol"`，constructor不公开，不增加remote/details。Remote
  handler/raw wire cause永不复制；trusted local Adapter/Protocol Error可作为standard `cause`保留。

### Operation preflight 与 registry

- Factories同步snapshot并验证closed options/policy schema、positive finite safe integers及cross-field
  invariants；invalid/unknown输入抛 `TypeError`。Connector只公开10个有效knobs，Framework派生
  `maxSessions = maxHandshakes = 1`及total budgets；Acceptor公开全部14项。TypeScript只承诺literal
  excess-property帮助，runtime validation仍处理structurally assigned extra keys。
- Custom Protocol `create*` throw或invalid runtime使factory在Owner创建前同步抛
  `RpcError(protocol)`，保留trusted cause。
- `expose()`保持同步：Owner非active或peer draining/closed抛 `RpcError(unavailable)`；duplicate
  wire name、invalid selected member等caller contract错误抛 `TypeError`，先完整验证再原子安装。
  Cleanup同步、幂等、no-throw。Peer `unbound | connecting | connected | recovering`可先注册exposure。
- `connect()` / `listen()`只通过Promise reject。它们先检查Owner/peer/listener/single-flight/
  overflow gate且不读取 `adapter.connection$`；invalid state为 `RpcError(unavailable)`。通过后才做
  structural Adapter shape validation（`TypeError`）、subscribe-before-start及Protocol binding。
  Owner中断startup为 `AbortError`；ordinary timeout/profile/admission/Adapter failure为
  `RpcError(unavailable, cause)`；Protocol invariant为 `RpcError(protocol, cause)`。
- Single/group invocation严格执行control shape → initially aborted → admission state → value snapshot →
  capacity。Common group failure创建零child；active空snapshot fulfill frozen `[]`。

### Closed event union 与 termination identity

`RpcEvent`是封闭、payload-free union：owner/peer lifecycle、call started/finished；没有generic bag、raw
Error、wire event或resource-pressure duplicate event。Call metadata与outcome做相关union，而非自由笛卡尔积：

- outgoing与known incoming有canonical service+method；
- incoming unknown-service两名都缺席且finished code只能是 `unknown-service`；
- incoming unknown-method只有local exact-matched service且code只能是 `unknown-method`；
- known incoming rejection只允许 `canceled | handler-failed`，outgoing才使用完整 `RpcCallFailure`；
- Remote Resource Rejection没有pair。

已started的known incoming call若被Session force/fault terminal赢，使用event-only
`call-finished(outcome: "terminated")`，保留known metadata与bounded duration但无code/Error/reason；
随后 `peer-closed`表达Session reason。它不污染caller `RpcCallFailure`或outgoing outcomes。Phase由
`call-started | call-finished` discriminant表达，不增加重复field。

两个Owners最终都精确提供：

```ts
shutdown(): Promise<void>; // finite graceful drain
close(): Promise<void>;    // immediate force / monotonic escalation
```

第一次任一调用创建唯一cached termination Promise；所有重复、并发、cross-mode、closed-state调用都
返回exact same object。`shutdown()`同步进入draining，`close()`同步进入closing或升级；已经进入
closing(graceful)后close不重启force。G时recovering peer局部 `forced-close`，connected peers drain，
counter-draining peers保持reason加入barrier；explicit close与grace deadline分别提出
`forced-close` / `shutdown-deadline`。只有cleanup reject/timeout使task reject。

### Verification 与 rejected alternatives

Prototype已通过scoped Biome、main/browser/Node三套TypeScript consumers、Node runtime probes、真实浏览器
cross-realm AbortSignal/EventTarget intrinsic probe、可交互Recovery/counter-drain/shutdown trace、
`git diff --check`及独立audit（0 blocker）。Runtime probes还覆盖single/group Promise assimilation、
installed-handler snapshot、signal preflight/race、exact termination Promise identity及unknown/terminated
event ordering。

拒绝optional signal、Descriptor arity metadata、call-options wrapper、dynamic Proxy、generic Owner base、
default Protocol constant、raw telemetry与把全部service parameters静态递归约束为Application Value；它们
分别不可实施或增加没有独立caller价值的surface。Package entry points、tarball layout、版本与正式
acceptance runners仍由issue 15决定。
