# 决定 Physical Connection Adapter 契约

Type: grilling
Status: resolved
Blocked by: 01, 05
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

Transport Adapter 必须向 RPC framework 提供怎样的最小 Physical Connection Interface，才能覆盖浏览器和 Node.js 的 message/stream transports，并满足 hot multicast Observable、多个观察者、无 replay、显式资源所有权、有序发送、本地 admission、消息稳定性、关闭与错误终态以及有界缓冲？同时决定 Connector/Acceptor Adapter 的启动契约和独立 Adapter 包必须通过的 conformance contract。

## Answer

采用一个 message-oriented、structural、role-specific 的 Transport Adapter seam。Framework
只接收完整、有序的 byte messages，不认识 WebSocket、Node stream、framing 或平台资源类型；
Connector 与 Acceptor 统一使用“先订阅 connection source，再启动 Adapter”的两阶段交接，
从 Interface 上消除首条 hot message 在 owner 订阅前丢失的竞态。

```ts
export interface IRpcConnection {
	readonly message$: Observable<Uint8Array>;
	send(message: Uint8Array): Promise<void>;
	close(): Promise<void>;
}

export interface IRpcConnectorAdapter {
	readonly connection$: Observable<IRpcConnection>;
	connect(signal: AbortSignal): Promise<void>;
}

export interface IRpcAcceptorAdapter {
	readonly connection$: Observable<IRpcConnection>;
	listen(signal: AbortSignal): Promise<void>;
}
```

不增加 `activate()`、`IDisposable`、`disposed`、`ready$`、`closed$`、capacity getter、
`pause()` / `resume()`、通用 options bag、公开 framing/Codec、Transport error Code 或专用异常类。
具体 Adapter factory 可以公开其平台真正需要的配置，但 Node、WebSocket 与第三方库类型不能进入
`@husky-di/remote`。

### Observable、message 与 ownership

- 三个 Observable 都是 hot、multicast、无 next-value replay 的只读 observation source；
  零个、一个或多个订阅者都不启动、停止或拥有资源，退订也不影响资源生命周期。晚订阅者不补收
  旧值，但必须立即观察到已经落定的 `complete` 或 `error` terminal。
- 同一次 `next` 的所有观察者看到同一个 Connection 或 `Uint8Array` object identity。Adapter 在
  发出 inbound bytes 后不得修改、复用或 detach 其 backing storage；观察者也必须把 bytes 当作
  只读值。Adapter 若接收 pooled/reused platform buffer，必须先产生稳定 value。
- `message$` 的一个 value 恰好是一个完整 Transport message，并按底层 Transport 顺序发出。
  Message transport 保留原生 message boundary；byte-stream Adapter 自己负责 bounded framing、
  拆包与粘包。Default Protocol 的 JSON Codec 不参与 Transport framing。
- 正常 Physical Connection terminal 使用 `complete`；Transport、framing 或 admission-limit
  failure 使用 `error`；terminal 一旦落定便不可改判，也不能再发 `next`。不定义稳定 error Code、
  subclass 或平台错误联合类型；失败值必须是 `Error`，底层原因可以作为 `cause` 保留。
- 每个 Connection 只有一个 Topology Owner。其他 `connection$` / `message$` 观察者即使持有同一
  引用也无权调用 `send()` 或 `close()`；非 owner 操作属于 Interface contract violation，而不是
  TypeScript 可表达的 linear ownership。

### Ordered send 与 Local Admission

- Connection owner 必须串行调用 `send()`：同一 Connection 同时最多一个 unsettled send。
  Adapter 不需要为并发调用建立第二套发送调度；并发 send 属于 contract violation。
- Adapter 可以借用传入的 `Uint8Array` 直到 Promise settle；在此之前 caller 不得修改 bytes。
  Fulfillment 后 Adapter 不再借用 caller value，caller 可以安全复用或修改它。
- Fulfillment 只表示 Local Admission：bytes 已形成稳定值并进入 bounded local Transport path。
  它不证明 flush、network delivery、remote receipt、decode、Message Receipt ACK 或 handler
  completion。
- 临时 outbound capacity pressure 让当前 send 保持 pending 并形成 backpressure；不得通过
  silent drop、overwrite 或乱序继续运行。单条消息或 owned queue 的 hard limit 被突破，或
  Transport 失败时，send rejects 且该 Connection 进入唯一 failure terminal。
- 一次 Connection failure 只建立一个 final `Error` object；`message$.error(error)`、当时受影响
  的 send 与失败的 close 复用同一 identity。正常 terminal 后的 send 和 direct close 打断的
  pending send 也必须 reject，但不需要公开稳定 error Code。

### Direct Connection Close

`close()` 是幂等的 Direct Connection Close，不是 graceful drain。调用时立即禁止新 send，
并拒绝尚未完成的 send；Adapter 随即启动平台能够提供的直接 full-connection termination。
Promise 在本地 Connection terminal 已落定、`message$` 已 terminal 且 Adapter-owned resources
已释放后 settle。正常关闭使 `message$` complete 且 close fulfill；关闭过程失败使两者复用同一
final Error。重复 close 观察同一 terminal outcome。

Direct Connection Close 不等待 RPC calls、Protocol ACK、remote close confirmation 或业务
完成，也不承诺排空或丢弃已经 Local Admission 的 bytes。已 fulfill 的 send 不改判，相关 bytes
最终可能送达也可能丢失；例如浏览器
[WebSocket `close()`](https://websockets.spec.whatwg.org/#dom-websocket-close) 不丢弃此前
`send()` 的 messages，而 Node stream destruction 可以停止未完成 I/O。Topology Owner shutdown
因此属于 Framework、Session 与 Protocol 的更高层 choreography，由
[决定 Topology Owner 强制关闭与优雅停机](18-decide-owner-shutdown-convergence.md)决定，
不在 `IRpcConnection` 增加第二个关闭 member。

### Security deployment boundary

Structural Adapter conformance 只证明 bytes、ordering、ownership、limits 与 lifecycle，不自动证明
network security。Default Protocol 要对 Session Recovery 与 active ACK 作安全声明时，每条 fresh/
replacement Connection 的 deployment还必须提供 confidentiality、ordered integrity、anti-replay 与
initiator 所期望的 responder endpoint authentication，例如正确验证 certificate 的 TLS/WSS、受
OS capability/ACL 保护的 IPC 或可信同进程 channel。

`IRpcConnection` 不增加 `isSecure`、certificate、principal、channel binding、header 或 credential
member；Framework 无法验证这种 boolean，浏览器 WebSocket 也没有可移植 TLS exporter。具体
Adapter factory负责 URL/certificate/PSK/origin/credential 配置并在 package security contract 中
说明。Plaintext Adapter 可以满足 functional conformance，但必须明确不提供 secure Recovery；业务
principal认证/授权/限流仍不进入 core seam。

### Connector Adapter lifecycle

- 一个 Connector Adapter value 表示一次 connection attempt，只能启动一次，且 `connect()`
  调用前不得 I/O 或发出 Connection。Caller 选择每次 attempt 的新 Adapter；Connector 从不拥有
  Adapter，只拥有成功交接的 Connection。
- Framework 先订阅 `connection$`，再调用 `connect(signal)`。成功时 source 恰好 `next` 一条
  Connection；所有同步 observers 从该 notification 返回构成 handoff barrier，之后 Connection
  才能发出首条 `message$`。Source 随即 complete，最后 `connect()` fulfill。
- Handoff barrier 后 ownership 不可撤回；随后断线只由该 Connection 的 `message$` 表达，不能
  让已成功的 `connect()` 或已 complete 的 source 反悔。Attempt signal 此后也不再控制 Connection。
- Handoff 前 abort 必须清理半开资源、让 source 无 value 地 complete，并让 `connect()` reject
  `AbortError`。其他 startup failure 让 source error 且 Promise 以同一个 Error reject；late
  Connection 必须由 Adapter 自行关闭，不能交给 Connector。

### Acceptor Adapter lifecycle

- 一个 Acceptor Adapter value 表示一个 listener，只能 `listen()` 一次。Framework 先订阅
  `connection$`，再调用 `listen(signal)`；调用前 source 不得 emit，调用后可以在 ready Promise
  settle 前发出已经接受的 Connections。
- 每条 accepted Connection 由 source 恰好 emit 一次；notification 返回构成该 Connection 的
  handoff barrier，随后 ownership 属于 Acceptor。非 owner observers 只观察相同 identity。
- `listen()` fulfillment 只表示 listener 已 ready，不等待其 lifetime terminal。Signal 在整个
  listener lifetime 有效并是唯一 teardown control，因此 Adapter 不继承 `IDisposable`。Abort
  before ready 使 Promise reject `AbortError` 且 source complete；abort after ready 只使 source
  正常 complete。若 Owner 在一次 `connection$` notification内 abort，Adapter 必须在该 notification
  返回前同步关闭 future-acceptance gate；已由平台接受但尚未 emit的 Connection仍属 Adapter并由它
  关闭，source不得再 `next`。这使 Owner能以一个 emergency overflow-close slot停止 push handoff，
  而无需在 core seam增加 pull/backpressure method。
- Startup failure 让 `listen()` 与 source 复用同一个 Error；ready 后的 listener failure 只由
  source error 表达。Source terminal 只终止未来 acceptance，不自动关闭已经交给 Acceptor 的
  Connections；它们的处置属于 Topology Owner。
- Acceptor 普通 Connection budget满时，下一次合法 emission只可占用预留的唯一 overflow-close slot。
  Owner在该 notification内只同步占用 slot并 abort listener/future-acceptance gate；notification返回
  完成 handoff后，Owner排队的第一个 continuation才取得 ownership并 Direct Close该 Connection，
  不得在 barrier前越权调用 `close()`。若 overflow发生在 ready前，Adapter-level与 Owner-level
  `listen()` 都按既有 abort规则 reject同一个 `AbortError`，owner listener snapshot可记录 intentional
  normal stopped/resource-pressure；ready后 listen已fulfill，source只 normal complete。Caller可在容量
  恢复后提供新 Adapter重启，overflow close settle前不得重启 listener。
  Abort后继续 emit属于 Adapter conformance violation，不扩大 Framework的 finite-resource guarantee。
- Adapter 只释放自己拥有的 listener resources。HTTP Server 等明确 borrowed 的外部资源不会因
  Adapter 或 Acceptor teardown 被关闭。

### Transport Admission Limits

Transport Adapter 是不可信 raw input 的第一道 controllable trust boundary。每个 Adapter 必须
在最早可控制的位置执行 finite per-message、queued-message 与 queued-byte limits；不得提供
unbounded mode，也不得把超限 input 先复制或发给 `message$` 再验证。

所有 conforming Adapter 共享一个固定 compatibility floor：在 Connection 正常且本地发送路径为空
时，任意不超过 `1,048,576` bytes 的完整 message 都必须可被一次 `send()` 接纳，single-message
hard limit 不得更小；inbound framing 也不得仅因 payload 在该范围内而拒绝。Adapter 可以配置更大
的 native cap，但所有 conforming v1 Protocol 每次 `send()` 仍不得超过 `1 MiB`，因此
`IRpcConnection` 不需要 capacity getter 或 limit negotiation。

- Message transport 应优先配置底层实现的 native max-payload limit，并在额外复制或 emit 前复查。
- Byte-stream framing 必须在依据不可信 length 分配完整 payload 前验证长度；任意 chunk split 与
  coalescing 都必须保持 exact message boundary。
- Inbound capacity 能暂停时必须 backpressure；无法暂停且即将超限时必须失败并直接关闭该
  Physical Connection。Oversized、truncated、invalid-frame 或 overflow input 不得 partial emit。
- 若平台在 Adapter callback 前已经 materialize 整条 message，Adapter 不能承诺撤回平台内部
  allocation，但必须避免第二次 unbounded copy 并立即终止 Connection。
- 一个 Acceptor Connection 的 Transport limit failure 不得终止 listener 或 sibling Connections。

Native payload 与 inbound/outbound queue caps 的精确默认值仍由具体 Adapter package 的 typed
factory options 决定并进入其 acceptance artifacts；它们必须 finite 且不得提供 unbounded mode，
因为 message transport 与 stream 的合理 queue 数值并不相同。Core 只固定上述 `1 MiB` seam
compatibility。Decoded Protocol records 的长度、深度、计数和安全关闭策略由
[决定 trust-boundary validation 与 Session Recovery 安全](14-decide-validation-recovery-security.md)
决定。业务 rate limiting 仍属于 application/Transport Adapter。

### Adapter conformance contract

每个独立 Adapter package 必须通过同一 public-Interface-only black-box conformance suite，才能
声明符合 `@husky-di/remote` Transport Adapter 的 observable behavior contract。Suite 不读取内部
状态、不要求特定类或文件结构，也不建立官方 registry、certification brand 或 nominal marker。
它可以证明 terminal、顺序、bounded growth trend 与超限 failure，但不能仅从 public Interface
证明“第一次 copy/allocation 前”执行检查。Adapter package 还必须用贴近其 framing/platform 入口的
instrumented allocation tests、boundary/property fuzzing 与实现审查证明早期 admission 要求；这类
安全证据是 conformance release gate，但不伪装成通用黑盒断言。

Package 的 private test fixture 必须能创建 fresh Connector/Acceptor Adapters、驱动 remote side、
注入 messages、制造 backpressure、normal/failure terminals 与 startup abort/failure，并观察真实
remote bytes。Fixture 的精确 TypeScript Interface、runner export 与版本策略留给 package-contract
ticket；这里固定如下 mandatory behavior matrix：

1. subscribe-before-start、zero/one/many Connection emissions、Connector exactly-one、handoff
   barrier、ready Promise、abort/failure races、same object identity 与 ownership transfer；
2. complete ordered messages、hot multicast/no next replay、sticky terminal、stable backing bytes、
   normal complete、failure error 与 no late emission；
3. single in-flight send、argument borrowing、post-fulfillment stability、temporary backpressure、
   `1 MiB` compatibility boundary、hard-limit failure、no silent loss/overwrite/reordering 与
   local-admission-only semantics；
4. direct-close gate、pending-send rejection、idempotent terminal、fulfilled-send non-revocation，且允许
   already-admitted bytes 最终送达或丢失；
5. finite admission limits、oversized/flood/overflow resistance、observable bounded growth、failure
   isolation，以及 listener terminal 不接管 transferred Connections；
6. message transports 的 one-native-message/one-Transport-message mapping，byte streams 对任意
   fragmentation/coalescing 的 framing 与 truncated/invalid/oversized failures，并在每个声称支持的
   runtime 上执行真实 startup、bidirectional transfer 与 close smoke tests。

若 Adapter package 声明可承载 Default Protocol 的 secure Recovery，还必须在真实 runtime 验证其
protected mode 的 endpoint authentication、confidentiality/integrity 配置与 plaintext downgrade
边界；generic black-box Connection suite本身不能证明这些平台事实。

该 black-box suite 不验证入口内部首次 allocation/copy 的先后、JSON Codec、Handshake、ACK、
Session Recovery、call state、Adapter package-specific queue numbers、
Topology Owner 对 listener terminal 的策略、平台 error taxonomy 或 conformance runner packaging；
这些分别属于后续 tickets。本票不实现任何正式 Adapter package。

2026-08-18 consistency amendment：把可执行 public behavior conformance 与必须通过插桩/fuzz/审查
证明的入口资源安全分开，避免黑盒 suite 声称不可观察的性质。
