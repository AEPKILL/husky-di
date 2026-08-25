# 决定默认 Protocol 的 wire grammar、Codec 与版本协商

Type: grilling
Status: resolved
Blocked by: 02, 05
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

内置默认 Protocol 的规范化 message grammar 应是什么，才能精确表达 Handshake、Session Recovery、unary call、ACK、cancel、result、remote error 与 terminal 状态，并在任意有序 message Transport 上安全运行？决定 envelope 字段、Codec 与语义层的关系、wire types、版本与能力协商、未知字段/消息处理和 runtime grammar source，同时避免把默认 Protocol 的细节泄漏进通用 RPC Interface。

## Answer

默认 Protocol 固定为一个专用、严格的 UTF-8 JSON Protocol Profile，首个
profile identifier 为 `husky-di-rpc/1`。Profile 是不可拆分的完整契约：它同时固定 Codec、
wire grammar 与所有 v1 semantic guarantees；不提供 Codec negotiation、capability bag、
extension registry 或可静默关闭 Recovery、去重、terminal replay 的 feature flag。默认
Protocol 的 wire types 从 package-private Zod schemas 派生，只存在于 private Implementation，
不得进入通用 RPC Interface。

本决议采用研究中的分层思路，但把最初建议的多个语义 ACK 进一步收敛为一个统一的
Message Receipt ACK。业内证据与取舍记录见
[`wire-protocol-industry-precedents.md`](../research/wire-protocol-industry-precedents.md)。

### Codec 与 application value model

- 每个 Transport message 恰好承载一个 RFC 8259 UTF-8 JSON text，且顶层必须为 object。
  Transport Adapter 若基于 byte stream，负责把 stream framing 成完整 message；Default
  Protocol 不无条件嵌入 `Content-Length` 或其他 stream header。
- 完整 encoded record 的 hard limit 是 `1,048,576` bytes，并受 resource ticket 固定的 depth、
  string、identifier、member、element、node 与 Application Value weight limits 约束。Sender 在
  identity commit 前验证最大宽度 ACK envelope；Receiver 在 ordinary object materialization 前
  验证 raw input。它们是 `husky-di-rpc/1` profile constants，不参与 negotiation。
- Codec 在 `Uint8Array` 与 validated wire record 之间转换，负责 lexical、JSON data-model
  与 record-shape validation；它不解释 Session、ACK、handler 或 call-state semantics。
- Wire bytes 必须是 well-formed UTF-8。sender 不发送、receiver 拒绝 leading BOM、非法
  UTF-8、未配对 Unicode surrogate、第二个尾随 JSON value 和尾随非空白数据。合法 JSON
  whitespace、object member order 与等价 escape 写法不参与语义；string/member name 不做
  Unicode normalization 或 case folding。
- 任意层 object 都禁止 duplicate member name，包括 application args/result/details；名称在
  escape 解码后比较，因此 `"a"` 与 `"\u0061"` 冲突。该检查必须发生在普通 object
  materialization 丢失重复信息之前。
- 默认 profile 不要求 canonical wire bytes。Fresh/resume accept、resume request 与 authoritative
  reject 的 proof input 单独使用 RFC 8785 JCS；它在 bounded parsed record 中删除 exact top-level
  `proof` 后 canonicalize，其余 unknown tail members 也参与。该要求不扩大到普通 active record。
- Application value 只接受真正的 JSON data tree：递归的 `null | boolean | string |
  finite binary64 number | dense array | plain data record`。TypeScript sender 只接受 prototype
  为 `Object.prototype` 或 `null`、且仅含 own enumerable string-named data properties 的
  record；不调用 getter、`toJSON` 或 coercion。
- sender 在编码前拒绝 `undefined`、`bigint`、symbol、function、accessor、symbol key、array
  hole、cycle、`Date`、`Map`、`Set`、class instance、typed array、`NaN`、正负 Infinity 和
  `-0`。需要 binary、精确大整数或十进制定点数时，由 application 显式编码为 JSON
  string/object。所有 conforming Protocol 的 caller-visible application value model 由
  [决定 Call value model、identity、重放与去重](10-decide-call-delivery-state-machine.md)决定，
  注入 custom Protocol 不自动扩展它。
- Application JSON number 的语义域是 finite IEEE-754 binary64；发送的十进制表示必须
  round-trip 到同一 binary64 value。Protocol 自己需要精确比较的整数另外受 safe-integer
  grammar 约束。
- Optional member 缺席与 member value `null` 不同；只有相应 grammar 允许时才可使用
  `null`。

### Wire types 与 profile selection

- 两个发送方向分别维护从 `1` 开始、连续递增的 `seq`；`seq` 是
  `1..9007199254740991` 的 JSON safe integer，`ackThrough` 则是
  `0..9007199254740991` 的累计 cursor，`0` 表示尚未接纳任何 sequenced message。Sequence 不得
  wrap；耗尽前必须按 resource ticket 的 control reservation 进入 Session drain。
- `callId` 使用 non-empty opaque JSON string carrier；Codec 不解释其组成，identity 的生成、作用域
  与复用由 Call State 决议定义。Default Profile 的 `sessionId` 则是 security-critical carrier：固定为
  `32` 个随机 bytes 的 unpadded canonical base64url，Codec 必须验证 exact spelling/length；其 authority、
  proof 与 fencing 仍由 Session/security 决议定义。
- Wire Service Name 与 method name 是 non-empty JSON string，按 Unicode code-point sequence
  精确比较，不做 normalization。Method name `then` 在 `husky-di-rpc/1` 中保留并拒绝，与公开
  Descriptor/proxy 的 non-thenable invariant 保持一致。
- `ProfileId` 是 non-empty、最多 `256 B` 的 exact-match atomic string，不按 SemVer range 拆解；空字符串
  是 tree-grammar violation而不是可协商的unsupported profile。Fresh initiator 发送非空、
  无重复、按自身偏好排序的 `profiles`；responder 选择列表中第一个自己支持的 exact string，
  并在 `accept` 中原样回显。没有交集必须显式 `reject`，至少使用
  `unsupported-profile` rejection code；不得回传支持列表后让对方猜测、按 package commit
  比较或静默降级。
- Profile 在 Logical Session 创建时冻结。Resume 只声明该 Session 已选定的一个 profile，
  不重新协商，也不能在 Physical Connection replacement 时更换 Codec 或 semantic guarantees。

### Bootstrap 与 active-session grammar

所有 wire records 都是以 `kind` 判别的 tagged union；不能靠可选字段组合猜测分支。概念
grammar 如下：

```text
WireRecord
  = Fresh
  | Resume
  | Accept
  | Reject
  | SequencedMessage
  | AckOnly
  | Ping
  | Pong
  | Close

Fresh  = { kind: "fresh",  profiles: [ProfileId, ...], ...FreshFields }
Resume = { kind: "resume", profile: ProfileId,          ...ResumeFields }
Accept = { kind: "accept", profile: ProfileId,          ...AcceptFields }
Reject = { kind: "reject", code: RejectionCode, message?, ...RejectFields }

SequencedMessage = {
  kind: "message",
  seq: Sequence,
  ackThrough?,
  message: SemanticMessage
}

AckOnly = {
  kind: "ack",
  ackThrough: AckCursor
}

Ping = { kind: "ping" }
Pong = { kind: "pong" }
Close = { kind: "close" }
```

这些元变量现已由 Session/security 决议填满，不是通用 property bag，也不代表线上存在同名
wrapper。最终字段平铺在 tagged record 中：fresh request 添加 `initiatorNonce`；fresh accept 添加
`sessionId`、epoch `1`、`responderNonce`、一次性 `sessionSecret` 与 transcript `proof`；resume
request 添加 `profile/sessionId/receivedThrough/resumeAttempt/initiatorNonce/proof`；resume accept
添加 `profile/sessionId/bindingEpoch/receivedThrough/responderNonce/proof`。每个 security carrier 是
exact scalar、32-byte unpadded canonical base64url；record 的普通 top-level unknown tail仍按统一规则
开放并进入 proof input，`resumeAttempt` 是 safe integer。Generic resume reject 使用同长度 dummy
nonce/proof，authoritative Session reject 的 proof 绑定 exact request。

- 每条新 Physical Connection 的 initiator first record 只能是 `fresh` 或 `resume`；responder
  bootstrap outcome 只能是 `accept` 或 `reject`。
- Bootstrap records 使用 mandatory JSON Codec，但不进入 delivery sequence，也不要求 ACK。
  Responder 在发送 `accept` 后进入 sequenced phase；Initiator 在收到并验证 `accept` 后
  进入。进入后双方只能发送 `message`、`ack`、`ping`、`pong` 或 `close`；有序 Transport 保证 Initiator 先收到
  `accept`，再收到 Responder 随后发送的 active-session record。
- 已知 kind 出现在错误 phase，或出现 unknown kind，都是 Protocol fault；具体 fault scope
  由 Session/security 决策收敛。
- Malformed/invalid record 不推进 receive sequence、Message Receipt ACK 或 semantic state。

Default profile 的 security guarantee 以前置的 protected Transport 为根：fresh/replacement
Connection 必须提供 confidentiality、ordered integrity 与 initiator 所期望的 responder endpoint
authentication。Proof 使用 CSPRNG、HKDF-SHA-256 与 HMAC-SHA-256，算法不 negotiation。Fresh 或
proof-valid resume 只把其所在的 exact Connection endpoint绑定成 current authority；active
`message`/`ack`/`ping`/`pong`/`close` 不再增加第二个 per-record MAC，其完整性来自该 protected Connection
与 local epoch fencing。Plaintext/unauthenticated deployment 仍可跑 functional grammar，但不享有
secure Recovery/ACK guarantee。

### Sequenced delivery 与统一 Message Receipt ACK

`seq` 是 retained Logical Session 内、单一发送方向上的 message identity；它与 `callId`
分离。`ackThrough: N` 是累计 Message Receipt ACK，精确表示接收方已连续接纳该方向所有
`seq <= N` 的消息。

“接纳”不是 socket/Codec 看见 bytes。ACK 只能在整条 record 完成 lexical/tree-grammar/resource
validation、sequence continuity 检查，并且相应幂等 state transition 已登记进跨 Physical
Connection 保留的 Session/Call State、留下足以识别重放的 evidence 后推进。它不证明
handler 已完成、外部副作用已提交或 dedupe evidence 已可删除。

- `SequencedMessage` 可以通过 optional `ackThrough` piggyback 当前反向 receipt；没有反向
  semantic traffic 时可发送 `AckOnly`。`AckOnly` 没有 `seq`、不被 ACK，因而不存在
  ACK-of-ACK 链。第一次 receipt 变 dirty 后的 configured `ackDelayMs`（默认 `50 ms`）deadline
  不 sliding；若期间没有可 piggyback 的 semantic send，只把一次最新累计 AckOnly 标为 ready，
  实际发送等待下一个 idle send slot并受 configured send-progress deadline 约束。
- sender 保留每条未确认消息的 immutable `(seq, SemanticMessage)`，而不是完整 encoded record
  bytes。每次首次发送或重放都从该 pair 生成新的 envelope，因此必须复用原 `seq` 和相同
  `message`，同时可以把 piggyback `ackThrough` 推进到更新值。Normalized semantic value 与
  profile limits 保证重新编码不会改变意义或产生新的 fallible admission decision。
- receiver 对 duplicate `seq` 仍处理合法的新 `ackThrough`，但在 semantic dispatch 前抑制 body，
  不再次投递，并可重发当前 receipt。Sender 改写同一 `seq` 的 semantic body 仍违反 Protocol
  contract；只要比较 evidence 尚保留就必须 fault，但 `seq <= receivedThrough` 后 body 已无状态
  影响，v1 不为事后检测而永久保存 payload fingerprint。
- Stale/equal `ackThrough` 是 no-op；`ackThrough: 0` 表示 ACK sender 尚未接纳任何 sequenced
  message，即使对端已经发送但消息仍在途也合法。ACK 超过本方向最高已发送 `seq`，或收到高于
  期望值的 sequence gap，都是
  continuity failure。v1 不增加 retained-range exchange、byte-position cursor 或 replay-request
  message。
- ACK `call` message 表达该 request 已有 durable retained disposition：可能是允许 handler 的
  Remote Request Admission，也可能是保证不 dispatch 的 Remote Resource Rejection；只有随后的
  authoritative terminal 才区分二者。ACK `result`/`error` message 表达 terminal receipt，ACK
  `cancel` 只表达 cancel intent 已接纳。三者由被确认的原 message kind 区分，不再设置独立
  `call-accepted`、`terminal-received` 或带 subtype 的通用 ACK message。
- ACK terminal message 可以支持释放较大的 terminal payload，但不能单独删除防止旧 request
  再次 dispatch 所需的 dedupe tombstone/high-watermark；完整 GC proof 留给 Call State 与
  Session tickets。

`Ping`/`Pong` 是 active-phase、connection-local activity probe。Configured
`activityProbeIntervalMs` 的默认值为 `30 s`；`Ping` 必须得到一个 coalesced
`Pong`，`Pong` 不再触发回复；两者都不带 `seq`/ACK cursor、不进入 replay/ledger 或 public
observation。独立 kind 让两端可以使用不同 finite probe policy，而不会依赖“对端也恰好定期发送
AckOnly”或形成 ACK-of-ACK loop。Silence/send timeout 与 timer-throttling 行为由 resource ticket
固定。

`Close` 是仅供 graceful `shutdown()` 的 active-phase、connection-local Session-close。它没有
`seq`/`ackThrough`/proof/reason，不进入 replay或 ACK；sender最多调用一次 send，只等 Local Admission
后 Direct Close，receiver terminal Session且不回复。强制 `close()` 不发送它。Ordinary open-tail
validation仍适用，但 sender没有其他 known fields；精确 drain/force choreography由 issue 18定义。

### Call-related semantic messages 与 remote error

`husky-di-rpc/1` 的完整 sequenced `SemanticMessage` union恰好包含以下四个 call-related families；
v1没有第五种 sequenced semantic kind：

```text
CallRelatedMessage
  = { kind: "call",   callId, service, method, args }
  | { kind: "cancel", callId }
  | { kind: "result", callId, value? }
  | { kind: "error",  callId, error: { code, message, details? } }
```

- `call.service` 携带 Wire Service Name，`method` 携带 Descriptor allowlist 中的 wire method
  name，`args` 必须是 JSON value array。
- `result.value` 缺席表示 `void`；存在时可以是包括 `null` 在内的任意 application JSON
  value。`result` 与 `error` 是不同 message kinds，不依赖 payload shape 猜测 terminal branch。
- `cancel` 只表达 cooperative intent，不是 terminal、rollback 或 handler 未执行的证明；
  `result`/`error` 的唯一 terminal winner 与竞态由 unary-call ticket 决定。
- Remote error 的 stable machine-readable `code` 只允许 `canceled | unavailable | handler-failed |
  unknown-service | unknown-method`；`outcome-unknown`是本地 evidence-loss mapping，不能从 wire发送，
  Protocol fault也不能伪装成 call error。Error record另有 required human-readable string
  `message` 与 optional JSON `details`。Wire 不直接传输 JavaScript `Error`、`stack`、`name`、
  `cause` 或任意 thrown object；具体 error code set、throw mapping 与安全 details policy 由
  unary/security tickets 决定。
- Unknown Wire Service Name 或 method 是已验证 call 的 call-scoped remote error，不破坏
  Logical Session。Application handler 的失败同样是 call outcome；Protocol fault 不伪装成
  remote error。

### Unknown input 与 profile evolution

Schema 对 `kind` union、required known members、known member types/value domains 和 phase
contract 是封闭的；top-level wire record与nested tagged `SemanticMessage` 的额外 members是开放尾部。
Nested untagged Protocol objects（当前只有 `error` object）对known fields封闭；application
`args`/`value`/`details`中的object始终把全部members当业务数据。

- Unknown extra member 必须先作为受限 JSON data tree 完成 lexical 与 resource validation，
  然后忽略；不保留、不 round-trip，也不得影响 required semantics。
- Known member 缺失、类型错误或越界仍是 Protocol fault，不能因“忽略 unknown fields”而
  降级。Duplicate member name 始终拒绝。
- Fresh `reject`只有 `unsupported-profile | admission-rejected`可带optional bounded `message`；resume的
  generic/authenticated reject严格使用security ticket固定的四个known fields且不带message。Receiver
  仍对所属top-level record应用普通open-tail规则。
- `args`、`result.value` 与 `error.details` 是 application data；其 object members 都是数据，
  不适用 Protocol unknown-field policy。Security决议已把每个 proof/nonce/secret carrier固定为
  exact scalar encoding；它不关闭所属 tagged record的普通 top-level unknown tail。
- Profile 发布后，同一 profile 只能增加旧 endpoint 可安全忽略的 optional fields。新增 message
  kind、required transition、改变既有字段含义或改变 mandatory guarantee 必须使用新 profile。

Zod grammar 必须让top-level wire record与nested tagged `SemanticMessage` 保持开放尾部，同时让
nested untagged Protocol object保持封闭；不能用一个全局strict/loose策略抹平差异。v1 不定义
ignorable extension message registry；unknown message kind 保持 Protocol fault。

### Normative evidence 与 runtime grammar

Default Protocol 的公开 normative evidence 包含：

- normative prose：phase/state、每种 record 的前置条件、state effect、receipt point 与 fault
  scope；
- valid/invalid raw-byte vectors：UTF-8、BOM、duplicate keys、number/safe-integer boundary、
  unknown fields/kinds、phase violation、canonical base64url、JCS/HMAC/HKDF 与 profile rejection；
- JCS/HKDF/HMAC known-answer vectors：固定 canonical transcript、derivation input 与 expected output；
- stateful transcript vectors：fresh、accepted/rejected resume、lost ACK/replay、duplicate/gap、
  lost accept 后更高 `resumeAttempt`、signed continuity failure、immediate result、cancel intent 与
  terminal receipt。

Executable decoded-tree grammar 只手写一次：由Default Protocol的package-private Zod schemas定义
tagged union、required members、known value domains、开放/封闭尾部与phase-specific record shape；
对应wire types使用 `z.output<typeof schema>` 派生，不再手写同一字段表。Zod schemas不是public
Interface或发布artifact；v1不发布`schema.json`。若未来出现具体的非TypeScript互操作需求，再从Zod
grammar生成machine-readable artifact，不维护第二份手写grammar。package placement、版本策略与完整验证矩阵由
[`决定规范验证与 package contract`](15-decide-verification-package-contract.md)决定。

### 明确保留给后续 tickets

- [`决定 Physical Connection Adapter 契约`](07-decide-physical-connection-adapter-contract.md)：
  message/stream framing、send admission、关闭与 Transport conformance；
- [`决定 Logical Session identity、Handshake 与 Recovery`](09-decide-logical-session-recovery.md)：
  fresh/resume/accept/reject 的完整字段、Session incarnation、resume cursor、fencing 与恢复状态；
- [`决定 Call value model、identity、重放与去重`](10-decide-call-delivery-state-machine.md)：call identity
  组成、精确 admission point、ledger、terminal payload 与 dedupe evidence GC；
- [`决定 unary 调用、取消、错误与终止竞态`](11-decide-unary-call-errors-cancellation.md)：error
  codes、handler mapping、cancel/result/error race 与唯一 terminal outcome；
- [`决定顺序、并发、缓冲与恢复资源上限`](13-decide-ordering-concurrency-resource-bounds.md)：
  message/depth/string limits、ACK timing、replay window、sequence exhaustion 与 backpressure；
- [`决定 trust-boundary validation 与 Session Recovery 安全`](14-decide-validation-recovery-security.md)：
  proof shape/canonicalization、认证绑定、replay resistance 与 violation fault scope。

本票不增加生产代码、不决定 private Module 的类/文件切分，也不改变 public Protocol seam。
