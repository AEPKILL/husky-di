# 验证 Protocol Implementor Interface 的精确形态

Type: prototype
Status: resolved
Blocked by: 06, 07, 08, 09, 10, 11, 13, 14, 18
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

在前置行为决议完成后，`IRpcProtocol`、role-specific Connector/Acceptor runtime、
Session handle、semantic host ports、call/outcome 与 lifecycle/shutdown transition types 应具有怎样的
精确 TypeScript members、sync/async、ownership、terminal 和 fault contract？产出可编译的
throwaway prototype、一个最小自定义 Protocol、in-memory Connection usage 与正负类型用例，
验证精确 SPI 可由第三方实现且足够深，同时不公开默认 Protocol 的 Codec、Handshake、
Session、Call State 等 private Modules，也不提前决定最终 export path 或 package contract。

## Answer

采用一个 structural、role-specific、owner-scoped 的深 Protocol seam。可编译原型、最小
custom Protocol、in-memory roundtrip与正负类型 probes 固化于
`codex/prototype-protocol-implementor@672ec3f`；它们是本决策的 design evidence，不是当前
production export，也不声称示例 Protocol满足 default v1 的 security、Recovery或完整资源
conformance。

### 顶层 shape 与 construction

唯一 Protocol入口为：

```ts
interface IRpcProtocol {
  createConnector(host: IRpcProtocolConnectorHost): IRpcProtocolConnectorRuntime;
  createAcceptor(host: IRpcProtocolAcceptorHost): IRpcProtocolAcceptorRuntime;
}
```

- Protocol value是可复用的 immutable structural value；每次 `create*` 必须同步返回一个 fresh、
  owner-scoped runtime，不用 brand、registry、base class或默认实现继承。
- Runtime construction时 Framework尚未安装返回值，因此 Protocol只能读取 immutable policy并保存
  host ports；不得调用 mutation/fault/attach/admit、执行 I/O或排异步工作。同步 throw或 structurally
  invalid runtime使 caller factory在 Owner诞生前同步抛 Framework `RpcError(protocol)`。
- Framework给每个 runtime一份已经完整校验、冻结的 `IRpcProtocolRuntimePolicy`。它包含 issue 13
  决定的 session/handshake/pending/bytes/handler limits及 ACK、probe、silence、send、binding、
  Recovery、shutdown intervals；Connector所不允许 caller配置的 aggregate值仍由 Framework派生后
  以完整 required policy传入。
- Common Application Value不交给 custom Protocol扩展。Framework创建 opaque、detached、immutable
  `IRpcApplicationSnapshot` / arguments snapshot，并提供 normalization、deterministic weight与
  semantic equality ports；Protocol只能读取 snapshot后编码。`Date`、class、binary等额外值域不能
  通过换 Codec进入 caller surface。

### Role runtime 与 Connection handoff

Connector runtime提供 `bind(connection, signal)`，Acceptor runtime提供
`accept(connection, signal)`；二者共享下面三个 lifecycle members：

```ts
interface IRpcProtocolRoleRuntime {
  shutdown(): Promise<void>;
  close(): void;
  cleanup(): Promise<void>;
}
```

- Framework在 Adapter `connection$` 的 `next`栈内调用 `bind` / `accept`。方法必须在返回 Promise前
  同步订阅 hot `message$`，但 handoff notification返回前只能保存有界 provisional ingress，不能
  send、close、安装 binding或投影状态；barrier后的首个 continuation才取得 operational authority。
  这样 Connector也不会因等待 Adapter `connect()` fulfill而丢失 barrier后立即到达的首条消息。
- `bind` / `accept` fulfill表示 fresh/resume binding已经安装；以后 Connection丢失不能反悔该
  operation。Abort/reject只属于尚未安装的 attempt，必须先启动 Direct Close；Session incident改走
  retained Session host port，不能通过已兑现 Promise倒灌。
- `shutdown()` 同步关 new-work gates并开始 finite graceful drain；其 Promise只表示所有 Session
  egress shell或局部 force terminal已完成且 Direct Close已经被调用，不等待 Connection Promise
  settle。它是 Framework从 `draining`进入 `closing(graceful)`的 shell barrier。
- `close()` 是无参数、同步 force primitive：返回前关闭所有 semantic gates、依据 Protocol ledger
  finish calls、fence endpoint并调用 Direct Close；它不发 Protocol Close，也不逐 Session投影
  terminal。返回后 Framework按已经线性化的 Owner winner批量写入 `forced-close` 或
  `shutdown-deadline`，从而不用让 Protocol猜 public reason。
- `cleanup()` 是 idempotent、cached且只聚合 Protocol-owned cleanup的最终 task。Framework按 resource
  identity唯一登记 Connection/listener close Promise；两边不能重复等待或重复聚合。Running handler与
  WebCrypto late sink也不属于 cleanup barrier。三段 shape直接支撑 issue 18 的 grace/cleanup两个
  deadline；一个 Promise不能同时表达 shell barrier与最终 cleanup。

### Retained Session 与 outgoing invocation

Fresh Connector Session通过 `attachSession(session)`连接稳定 peer anchor；Acceptor fresh Session通过
`admitSession(session)`原子取得新 peer/Session host。Resume复用 retained Session及其既有 host，不能
新建 public peer。

`IRpcProtocolSession`只公开：

```ts
reserveInvocation(request): IRpcProtocolInvocationReservation | undefined;
forceClose(): void;
```

Outgoing采用 `reserve -> commit(sink) -> start`：

- `reserveInvocation`只预留 Protocol/Session ordinary capacity，不分配 Call Ordinal、`seq`或调用
  `send()`；`undefined`保持 Definite Non-Execution并由 Framework生成 `unavailable`。
- Reservation的同步 `commit(sink)`创建 Framework-observable Pending Invocation，但不 send、notify或
  settle。Group先为全部 children reserve，任一失败则release；全部成功才commit全部 children、提交
  started observations，最后逐个 `start()`，所以 reentrant subscriber或capacity race不能形成部分
  fan-out。
- `IRpcProtocolInvocation`只有 `start()` / `cancel()`；Framework拥有唯一 external AbortSignal listener
  并向group children fan out cancel，Protocol request不携带 signal。`start()`之后 Protocol才可竞争
  Outgoing Admission；此前 cancellation仍不制造 wire identity。
- Outcome不是 Protocol-owned Promise。Framework提供同步 `IRpcProtocolInvocationSink.finish(outcome)`；
  Protocol在任何 Session closed projection前先finish全部相关 sinks，Framework随后按统一 batch发
  `call-finished`并settle public Promise。这避免 Promise reaction落到 `peer-closed`之后。
- `forceClose()` 是 idempotent同步 front half：依据 retained evidence选择 Pending `unavailable`、admitted
  `outcome-unknown`或已有 terminal，finish sinks、处理incoming handles、fence并调用 Direct Close。
  它不调用 host transition/fault，Connection Promise仍由 Framework登记。

### Incoming reservation 与 handler permits

Protocol先完成 fixed/security/sequence/ordinal validation并为自己的 ledger/replay/protected terminal
预留容量，再调用 Framework：

```ts
reserveIncomingCall(request):
  | { kind: "handler", reservation }
  | { kind: "unknown", code: "unknown-service" | "unknown-method", reservation }
  | undefined;
```

- Host在 exposure lookup和保留 args之前先原子检查 ordinary handler-work capacity。`undefined`只表示
  Remote Resource Rejection：Protocol释放 ordinary provisional state，从protected reserve durable写入
  `unavailable`，推进receipt；没有 Framework IncomingCall或incoming event。
- 容量成功才做 exact local lookup并返回 tagged reservation。Protocol必须先 durable提交 handler的
  Remote Request Admission或unknown route的Remote Semantic Rejection，再调用 infallible
  `reservation.commit()`；Admission前的race/fault则 `release()`，不能回滚已提交identity。
- Handler commit只捕获 selected function/object、发布 eligible queued job并排started observation，绝不
  inline dispatch。只有 Framework私有 scheduler同时取得per-Session与owner permits后才真正调用
  handler；Protocol没有绕过permits的 `startIncomingCall()`。
- Unknown commit产生payload-free started/finished pair后立即 `finish`，不占running permit。Unknown
  service不回显两个raw names；unknown method最多保留exact matched local service。
- Incoming terminal type刻意排除 `unavailable`与 `outcome-unknown`：前者没有host handle，后者只属于
  outgoing caller-side evidence loss。Incoming handle只接受 returned/void、
  `canceled | handler-failed | unknown-service | unknown-method`或private `session-terminated`。
  Session/cancel先赢可删除queued job、abort running cancelable handler并消费non-cancelable late result，
  但不能让late settlement重写terminal。Framework把private `session-terminated`投影为仅用于known
  incoming observation的payload-free `call-finished(outcome: "terminated")`；它不扩展caller error
  taxonomy，真正Session reason由后续peer terminal表达。

### Session transition、fault scope 与原子 port contract

- Session host允许 Protocol投影 `recovering`、`recovered`、主动 `closed`，以及只用于一个
  Session counter exhaustion的 `draining(counter-exhaustion)`。Owner shutdown的bulk `G` transition
  由 Framework一次完成，Protocol不得逐 peer重复。Protocol主动closed允许
  `graceful-shutdown | forced-close | remote-terminated | recovery-expired | continuity-failure |
  counter-exhaustion`，但不允许 Framework-owned `shutdown-deadline`或fault reasons。
- `RpcSessionCloseReason`仍是caller与SPI共享的完整union；authenticated active Close和signed
  `session-terminated` reject都归一为 `remote-terminated`。Protocol/resource incident必须调用所在
  scope的 `fault(reason, error)`，不能再发第二个closed transition。
- Session `fault`启动同步、可重入 Framework transaction，Framework在返回前调用
  `session.forceClose()`，之后才投影该peer closed；owner host `fault`同理先调用 `runtime.close()`再
  投影owner/siblings。因而Protocol ledger而非Framework猜测哪些calls已经Admission。
- Framework实现、由Protocol调用的host/incoming-reservation/incoming-call/outgoing-sink ports在
  contract-valid调用下都是同步、total、no-throw；它们先stage/commit内部state，且不在
  reserve→disposition→commit或force critical transaction中直接重入user code。Framework在相关
  sinks/state全部提交后按issue 08顺序flush snapshot/event batch，最后settle operation/call Promise。
  Normalization抛 `TypeError`是唯一正常例外。Protocol实现、由Framework调用的outgoing
  reservation/invocation/runtime members若意外throw/reject，或任一invalid/double/late Protocol调用，
  都是conformance breach并按已知Session/owner scope fault，但不能回滚durable state。

### Deep-module boundary 与 alternatives

SPI不公开默认 Protocol的 Codec、JSON tree、JCS/HMAC、Handshake、ACK、sequence、proof、replay、
Call State、scheduler或wire record types。Custom Protocol可以完全替换这些内部模块，但必须实现共同
semantic value、admission、Recovery、resource、fault与shutdown profile。

已拒绝 pure reducer/effects port、公开 Codec/ACK ports和一个 `invoke(): Promise` 的浅 seam：前两者会
把default wire decomposition变成公共架构，后者既不能做group all-or-none reservation，也无法保证
terminal event排序。Incoming直接交handler callback会绕过Framework exposure snapshot与global permits；
单一 runtime shutdown Promise则无法分别界定grace shell和cleanup deadline。当前shape只暴露真正存在
Framework/Protocol ownership转换的semantic ports。

### Verification

Prototype已通过：

- scoped Biome；
- scoped TypeScript compile及negative `@ts-expect-error` probes；
- 实际 in-memory Connector↔Acceptor custom Protocol unary roundtrip；
- `git diff --check`；
- 独立逐member audit，0 blocker。

Type probes覆盖opaque snapshot不可伪造、request无AbortSignal、outgoing无outcome Promise、runtime必须有
cleanup、Owner draining/fault/deadline transition ownership、incoming failure direction与remote terminal
reason。最终export path、package format及完整conformance runner仍由issues 19/15决定。
