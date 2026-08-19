# 决定规范验证与 package contract

Type: grilling
Status: resolved
Blocked by: 04, 06, 07, 08, 09, 10, 11, 12, 13, 14, 17, 19
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

规范与 package contract 的 acceptance criteria 是什么？决定必须覆盖的 runtime `specification.test.ts` 场景、正负 type checks、默认 Protocol wire vectors、故障/Recovery probes、Transport Adapter conformance 和 Node/browser compatibility，以及 `@husky-di/remote` 的 exports、依赖、ESM/CJS/types、版本、文档、changeset 与独立 Adapter 包兼容性契约。本票只定义 verification/package acceptance contract；normative specification、requirement matrix 与 implementation route 由 `/to-spec` 产出。

## Answer

验收采用“一条规范要求、一个稳定 requirement ID、至少一项可重复证据”的闭环，而不是以代码覆盖率、
示例能够运行或单个 happy-path roundtrip 代替 conformance。`/to-spec` 必须为每个 normative
`MUST` / `MUST NOT` 分配稳定 ID，并在 requirement matrix 中链接下列一种或多种证据：runtime
specification test、TypeScript compile fixture、raw-wire vector、stateful transcript、instrumented resource
probe、Transport/Protocol conformance case、Node/browser consumer或packed-package check。不可从公开 seam
观察的 allocation-before-rejection、constant-space parsing等要求可以使用插桩/fuzz/审查证据，但不得只写
“由实现保证”。任何 requirement 无证据、证据被 skip，或矩阵引用不存在的文件，都阻止发布。

### Normative runtime suite

`packages/remote/tests/specification.test.ts` 是从caller-facing公共入口验证normative行为的顶层suite；可以
把fixture和大矩阵拆到同目录模块，但测试名必须携带requirement ID，且顶层suite必须实际导入它们。
测试只通过issue 19的caller API、issue 17的Protocol SPI或issue 07的Adapter seam观察行为，不依赖
private class、default Protocol内部Codec/ledger/scheduler或偶然的task/microtask数量。时间、随机数、
Physical Connection和平台crypto属于允许控制的外部边界；测试必须使用deterministic clock/random、
instrumented in-memory Adapter和raw peer，而不是放宽deadline或断言sleep后的概率结果。

Runtime matrix至少覆盖：

- Descriptor的opaque identity、allowlist、installed function snapshot、invalid member、reserved `then`，以及
  single/group facade的frozen null prototype、safe destructuring和Promise non-assimilation；
- Connector/Acceptor cold startup、subscribe-before-start/handoff barrier、single-flight/retry、stable peer、
  exposure scope、replay-latest immutable state/membership与hot/no-replay event ordering；
- required trailing `AbortSignal | undefined` control slot、零实参拒绝、cross-realm platform brand、forged
  duck rejection、hostile shadowed instance methods、already-aborted precedence和register-window复查；
- Application Value normalization的plain detached tree、finite numbers、depth/node/string/message weight边界，
  以及失败时零admission、零wire identity和零partial group child；
- Pending→Outgoing Admission、Remote Request Admission、handler snapshot/permits、at-most-once dispatch、
  returned/void/error、unknown route、resource rejection、cancel和所有first-terminal-wins races；
- group每次调用的一次common preflight、`connected | recovering` eligible snapshot、all-or-none reservation、
  snapshot-order frozen `RpcPeerResult`，以及per-peer failure不使outer Promise fail-fast；
- payload-free lifecycle/call event的封闭union与批次顺序，包括unknown-service/unknown-method metadata约束、
  Resource Rejection零event及known incoming Session loss的event-only `terminated` finished pair；
- 六态Peer及role-specific Owner/listener states、counter-exhaustion单Session drain、Acceptor sibling isolation、
  exact sticky error identity、subscriber throw不回滚Framework state；
- `shutdown()` graceful shell、`close()` immediate force、cross-mode escalation、重复调用exact same Promise、
  Protocol Close与Direct Close区别、grace/cleanup各5秒、broken send/close/handler/crypto late sink和最终
  event/state/Promise顺序。

每个默认limit都必须有 `limit - 1`、`limit`、`limit + 1` 边界，覆盖per-Session/owner bytes、calls、
handlers、handshakes、Connections、protected terminal/cancel reserve、counter最后一个合法值及never-wrap。
资源拒绝必须证明Definite Non-Execution；protected reserve或不可丢disposition失败必须证明最小scope
`resource-fault`，不得以OOM、永久Pending或无界重试作为可接受结果。Fairness测试使用有限的两个以上
Sessions、replay/control/data/Ping洪泛，证明ready work在声明的bounded turn内前进。

### Type-level evidence

独立main、Node和DOM/browser TypeScript consumer fixtures必须在strict模式编译；negative fixtures使用
`@ts-expect-error`并由CI确认确实产生错误。至少覆盖Descriptor inference/invariance、selected implementation、
property/generic/overload/`any`/stream rejection、cancelable local与remote signature的不同signal slot、遗漏
remote control slot、single/group result与peer关联、role-specific states/policies、closed discriminants、
custom Protocol/Adapter structural implementation，以及不能导入private/default Protocol symbols。

Type tests不得声称证明runtime wire validity：plain prototype、finite number、dense array、cross-realm signal、
unknown option keys和safe-integer/cross-field policy invariants仍要有runtime negative tests。Node fixture不得需要
DOM-only adapter类型；browser fixture不得因root import引入Node、WebSocket server或`Buffer`类型。

### Default Protocol wire and security evidence

发布的 `husky-di-rpc/1` corpus是normative asset而非implementation snapshot，包含JSON Schema、canonical
positive/negative raw bytes、JCS/HKDF/HMAC known-answer vectors及stateful transcripts。Schema只负责decoded
tree shape；raw vectors另行覆盖strict UTF-8、BOM、duplicate keys、trailing bytes、unsafe integer、depth/
node/string/record-size边界和oversize-before-copy。Known-answer vectors固定input bytes、salt/info/key、
canonical transcript和expected digest/tag；Node与三个browser engines都必须得到相同结果。

Transcript matrix至少覆盖fresh、lost fresh accept、normal resume、lost resume accept后更高
`resumeAttempt`、replay barrier、ACK/GC、duplicate old seq、expected seq、gap/wrong seq、wrong call ordinal、
stale/equal/future ACK、lower/upper cursor、wrong binding epoch、old Connection late record、unknown kind、
authenticated poison、wrong key/tag/profile、generic resume reject、signed `session-terminated`、Ping/Pong、
Close及counter exhaustion。每条记录同时断言双方state、handler dispatch count、caller outcome、retained
evidence与随后可发送的records，而不只断言最终Promise。

断线/状态分歧是独立发布门禁：必须故障注入“Acceptor已安装新binding而Connector丢失accept”、
“Connector仍认为connected但Acceptor已fence旧epoch”、“一方receipt已durable而另一方cursor回退”、
“双方同时重连且旧Connection继续送达”、“Close与connection loss交错”和“remote进程失去retained
secret”。合法分歧必须经更高attempt/replay收敛；无法证明continuity时必须得到规定的
`continuity-failure`、`outcome-unknown`或Recovery expiry，绝不能再次dispatch同一Logical Call。

安全negative corpus必须验证任何transcript field/tag/nonces/cursor/profile篡改、cross-Session proof、
stale attempt及malformed authenticated active record的fault scope；generic rejects只比较shape/code/长度
与authority效果，不作网络constant-time宣称。Secure-Recovery tests仅在声明满足confidentiality、ordered
integrity与responder endpoint authentication的Transport fixture上运行；functional-only Adapter不得被
误标为secure。

### Protocol and Transport conformance

`@husky-di/remote/conformance`导出不依赖Vitest/Jest的三个framework-neutral async runners：
`runRpcProtocolConformance`、`runRpcConnectorAdapterConformance`和
`runRpcAcceptorAdapterConformance`。Caller提供structural factory/fixture；runner成功时fulfill `void`，
失败时reject一个包含所有稳定case ID的 `AggregateError`。这三个runner及其options/reporting types是
public test tooling，但不是production owner lifecycle；它们不得把default Protocol private record类型
变成SPI。

2026-08-19 consistency amendment：public test-tooling shape固定为下列最小structural declarations；不加
timeout/filter/concurrency/assertion-framework/summary surface：

```ts
export type RpcConformanceFailure = Error & { readonly caseId: string };
export type RpcConformanceCaseResult =
  | { readonly caseId: string; readonly status: "passed" }
  | { readonly caseId: string; readonly status: "failed";
      readonly error: RpcConformanceFailure };
export type RpcConformanceReport = (result: RpcConformanceCaseResult) => void;
export type RpcConformanceOptions = { readonly report?: RpcConformanceReport };

export interface IRpcProtocolConformanceFixture {
  readonly protocol: IRpcProtocol;
  readonly counterExhaustionProtocol: IRpcProtocol;
  createActiveProtocolFaultMessage(): Uint8Array;
}

export interface IRpcAdapterConformanceRemote {
  sendToAdapter(message: Uint8Array): Promise<void>;
  receiveFromAdapter(): Promise<Uint8Array>;
  setAdapterSendBlocked(blocked: boolean): Promise<void>;
  closeFromRemote(): Promise<void>;
  failFromRemote(error: Error): Promise<void>;
  isAdapterClosed(): boolean;
  waitForAdapterClose(): Promise<void>;
}

export interface IRpcConnectorAdapterConformanceFixture {
  create(): Promise<{
    readonly adapter: IRpcConnectorAdapter;
    handoff(firstMessage?: Uint8Array): Promise<IRpcAdapterConformanceRemote>;
    failStartup(error: Error): Promise<void>;
    cleanup(): Promise<void>;
  }>;
}

export interface IRpcAcceptorAdapterConformanceFixture {
  create(): Promise<{
    readonly adapter: IRpcAcceptorAdapter;
    accept(firstMessage?: Uint8Array): Promise<IRpcAdapterConformanceRemote>;
    markReady(): Promise<void>;
    completeListener(): Promise<void>;
    failListener(error: Error): Promise<void>;
    cleanup(): Promise<void>;
  }>;
}

export function runRpcProtocolConformance(
  fixture: IRpcProtocolConformanceFixture,
  options?: RpcConformanceOptions,
): Promise<void>;
export function runRpcConnectorAdapterConformance(
  fixture: IRpcConnectorAdapterConformanceFixture,
  options?: RpcConformanceOptions,
): Promise<void>;
export function runRpcAcceptorAdapterConformance(
  fixture: IRpcAcceptorAdapterConformanceFixture,
  options?: RpcConformanceOptions,
): Promise<void>;
```

Protocol counter fixture是同一candidate的test-only配置，使fresh Session第一项otherwise-admissible call触发
counter drain；fault-message hook只返回candidate grammar的 `Uint8Array`，不公开built-in record types。
Adapter每个 `create()`返回fresh one-shot candidate；driver只控制remote/test side、保留传入Error identity，
`cleanup()`只释放fixture-owned external resources，不能替candidate掩盖teardown。Reporter须no-throw，每个
attempted case调用一次；失败对象与最终 `AggregateError.errors`复用identity并按稳定case顺序排列。Case ID
保持plain `string`并由conformance entry README列出，避免新增case破坏literal-union兼容性。

Protocol runner用Framework host harness验证role construction无reentrancy、handoff、value snapshot、
outgoing reserve/commit/sink、incoming resource/semantic/handler分支、fault scope、counter drain和
shutdown/close/cleanup三段。package-private default Protocol和一个最小independent custom Protocol都必须
通过semantic runner；default另外通过上述wire/security corpus。

Adapter runners验证cold start、subscription order、恰一次Connection handoff、hot/no-replay ordered
messages、single unsettled `send()` Local Admission、send/terminal races、Direct Close、owner-only cleanup、
listener complete/error、Acceptor overflow gate及failure isolation。共享functional runner之外，每个正式
Adapter包还必须运行插桩/fuzz suite，证明frame/message/queue cap在allocation/copy前生效、backpressure
有界、close pending不会无限持有新输入，并声明是否满足secure deployment prerequisites。Core tests中的
instrumented in-memory Adapter同时作为两个role runner的reference fixture和所有RPC integration tests的
fault injector；它是test infrastructure，不加入root caller exports。

### Package and compatibility contract

首个公开稳定版本为 `@husky-di/remote@1.0.0`。发布包保留四个typed code entry points：

- `@husky-di/remote`：issue 19的caller values/types，以及caller直接需要的Protocol/Transport structural
  types；factory省略`protocol`时选择package-private default；
- `@husky-di/remote/protocol`：issue 17的完整implementor SPI，不能导出default Codec、Handshake、ACK、
  proof、ledger或scheduler；
- `@husky-di/remote/transport`：issue 07的Connection与Connector/Acceptor Adapter seams；
- `@husky-di/remote/conformance`：上述三个framework-neutral runners及fixture option types。

同一symbol可以从root和一个专门implementor subpath re-export，但必须解析到同一declaration/value，不能
形成第二套nominal identity。发布包另包含可直接读取的
`wire/husky-di-rpc-1/{schema,vectors,transcripts,security-vectors}` assets，并分别以封闭的
`./wire/husky-di-rpc-1/schema`、`./vectors`、`./transcripts`、`./security-vectors` package exports
开放；不使用wildcard暴露未来文件，wire assets也没有可执行default Protocol export。

四个code entry points都必须提供ESM `import`、CJS `require`和匹配的`.d.ts` conditional exports；
`package.json`保持`type: module`、公开access、`engines.node: ">=23.6"`、source maps和
`sideEffects: false`。Packed tarball只能包含
声明的dist、wire assets、`docs/SPECIFICATION.md`、README、CHANGELOG、LICENSE与package metadata，不能
依赖workspace source、examples或未发布path。Runtime dependencies固定为`@husky-di/core`和`rxjs`；
default Protocol使用平台Web Crypto/Encoding primitives，core包不得引入`ws`、Node-only polyfill或测试框架；
packed manifest也不得残留`workspace:*`或dev-only dependency。

正式compatibility gate为repository engine `Node.js >= 23.6`，以及由锁文件固定的Playwright Chromium、
Firefox和WebKit三套browser builds。Deno、Bun和Workers只能做非阻塞smoke evidence。CI必须从实际
`pnpm pack` tarball建立隔离consumer，分别验证Node ESM、Node CJS、Node types、DOM-only browser types、
browser bundle/roundtrip和所有公开subpath；只在workspace内直接import源码不算package验收。

Release change必须同时包含normative `packages/remote/docs/SPECIFICATION.md`、带requirement IDs的
`specification.test.ts`与matrix、caller和Protocol/Adapter README、wire corpus、CHANGELOG及把`0.0.0`
提升到`1.0.0`的Changeset。`pnpm build`、workspace test/code-standard、package typecheck、三类conformance、
wire/security corpus、packed consumers和browser matrix全部通过且无skip，才允许发布。

独立Adapter包（包括后续`@husky-di/remote-websocket`）必须把兼容的`@husky-di/remote`声明为正常
dependency或peer dependency、只从public root/transport/conformance路径导入、运行匹配版本的共享
Adapter runners及自身instrumented/security tests，并在README声明queue/frame limits与secure deployment
条件。Core不为具体Adapter添加special case；不满足`1 MiB` compatibility、ownership或bounded admission
的Adapter不能宣称v1-compatible。

拒绝以单一end-to-end test、golden snapshot、coverage百分比、只跑Node、只验证Schema或“第三方包自行
解释SPI”作为验收。它们都无法证明Recovery continuity、raw-byte边界、browser portability、资源
有限性或published artifact真实性。
