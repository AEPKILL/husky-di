# 决定默认 Protocol 的 wire grammar、Codec 与版本协商

Type: grilling
Status: resolved
Blocked by: 02, 05
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

内置默认 Protocol 的规范化 message grammar 应是什么，才能精确表达 Handshake、Session Recovery、unary call、ACK、cancel、result、remote error 与 terminal 状态，并在任意有序 message Transport 上安全运行？决定 envelope 字段、Codec 与语义层的关系、wire types、版本与能力协商、未知字段/消息处理和跨语言规范形式，同时避免把默认 Protocol 的细节泄漏进通用 RPC Interface。

## Answer

默认 Protocol 固定为一个专用、严格、跨语言可实现的 UTF-8 JSON Protocol Profile，首个
profile identifier 为 `husky-di-rpc/1`。Profile 是不可拆分的完整契约：它同时固定 Codec、
wire grammar 与所有 v1 semantic guarantees；不提供 Codec negotiation、capability bag、
extension registry 或可静默关闭 Recovery、去重、terminal replay 的 feature flag。默认
Protocol 的 wire types 只存在于其 private Implementation 与公开 wire specification 中，
不得进入通用 RPC Interface。

本决议采用研究中的分层思路，但把最初建议的多个语义 ACK 进一步收敛为一个统一的
Message Receipt ACK。业内证据与取舍记录见
[`wire-protocol-industry-precedents.md`](../research/wire-protocol-industry-precedents.md)。

### Codec 与 application value model

- 每个 Transport message 恰好承载一个 RFC 8259 UTF-8 JSON text，且顶层必须为 object。
  Transport Adapter 若基于 byte stream，负责把 stream framing 成完整 message；Default
  Protocol 不无条件嵌入 `Content-Length` 或其他 stream header。
- Codec 在 `Uint8Array` 与 validated wire record 之间转换，负责 lexical、JSON data-model
  与 record-shape validation；它不解释 Session、ACK、handler 或 call-state semantics。
- Wire bytes 必须是 well-formed UTF-8。sender 不发送、receiver 拒绝 leading BOM、非法
  UTF-8、未配对 Unicode surrogate、第二个尾随 JSON value 和尾随非空白数据。合法 JSON
  whitespace、object member order 与等价 escape 写法不参与语义；string/member name 不做
  Unicode normalization 或 case folding。
- 任意层 object 都禁止 duplicate member name，包括 application args/result/details；名称在
  escape 解码后比较，因此 `"a"` 与 `"\u0061"` 冲突。该检查必须发生在普通 object
  materialization 丢失重复信息之前。
- 默认 profile 不要求 canonical JSON bytes。若后续 Session Recovery proof 需要签名或 hash，
  只为对应 proof input 定义 canonicalization，不扩大为整份 JSON 的要求。
- Application value 只接受真正的 JSON data tree：递归的 `null | boolean | string |
  finite binary64 number | dense array | plain data record`。TypeScript sender 只接受 prototype
  为 `Object.prototype` 或 `null`、且仅含 own enumerable string-named data properties 的
  record；不调用 getter、`toJSON` 或 coercion。
- sender 在编码前拒绝 `undefined`、`bigint`、symbol、function、accessor、symbol key、array
  hole、cycle、`Date`、`Map`、`Set`、class instance、typed array、`NaN`、正负 Infinity 和
  `-0`。需要 binary、精确大整数或十进制定点数时，由 application 显式编码为 JSON
  string/object，或使用自定义 Protocol。
- Application JSON number 的语义域是 finite IEEE-754 binary64；发送的十进制表示必须
  round-trip 到同一 binary64 value。Protocol 自己需要精确比较的整数另外受 safe-integer
  schema 约束。
- Optional member 缺席与 member value `null` 不同；只有相应 schema 允许时才可使用
  `null`。

### Wire types 与 profile selection

- 两个发送方向分别维护从 `1` 开始、连续递增的 `seq`；`seq` 与 `ackThrough` 都是
  `1..9007199254740991` 的 JSON safe integer。sequence 不得 wrap；耗尽行为与容量边界由
  resource ticket 决定。
- `callId` 与 `sessionId` 使用 non-empty opaque JSON string carrier。Codec 不解释其组成；
  identity 的生成、作用域、复用、proof 与 fencing 由对应后续 tickets 决定。
- Wire Service Name 与 method name 是 non-empty JSON string，按 Unicode code-point sequence
  精确比较，不做 normalization。
- `ProfileId` 是 exact-match atomic string，不按 SemVer range 拆解。Fresh initiator 发送非空、
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
  ackThrough: Sequence
}
```

`FreshFields`、`ResumeFields`、`AcceptFields` 与 `RejectFields` 是后续 Session/security 决策
要填入的元变量，不是通用 property bag，也不代表线上存在同名 wrapper。最终字段平铺在
对应 tagged record 中，并由最终 profile schema 精确验证。

- 每条新 Physical Connection 的 initiator first record 只能是 `fresh` 或 `resume`；responder
  bootstrap outcome 只能是 `accept` 或 `reject`。
- Bootstrap records 使用 mandatory JSON Codec，但不进入 delivery sequence，也不要求 ACK。
  Responder 在发送 `accept` 后进入 sequenced phase；Initiator 在收到并验证 `accept` 后
  进入。进入后双方只能发送 `message` 或 `ack`；有序 Transport 保证 Initiator 先收到
  `accept`，再收到 Responder 随后发送的 active-session record。
- 已知 kind 出现在错误 phase，或出现 unknown kind，都是 Protocol fault；具体 fault scope
  由 Session/security 决策收敛。
- Malformed/invalid record 不推进 receive sequence、Message Receipt ACK 或 semantic state。

### Sequenced delivery 与统一 Message Receipt ACK

`seq` 是 retained Logical Session 内、单一发送方向上的 message identity；它与 `callId`
分离。`ackThrough: N` 是累计 Message Receipt ACK，精确表示接收方已连续接纳该方向所有
`seq <= N` 的消息。

“接纳”不是 socket/Codec 看见 bytes。ACK 只能在整条 record 完成 lexical/schema/resource
validation、sequence continuity 检查，并且相应幂等 state transition 已登记进跨 Physical
Connection 保留的 Session/Call State、留下足以识别重放的 evidence 后推进。它不证明
handler 已完成、外部副作用已提交或 dedupe evidence 已可删除。

- `SequencedMessage` 可以通过 optional `ackThrough` piggyback 当前反向 receipt；没有反向
  semantic traffic 时可发送 `AckOnly`。`AckOnly` 没有 `seq`、不被 ACK，因而不存在
  ACK-of-ACK 链。
- sender 保留所有未确认 semantic messages。已接受 Session Recovery 后以原 `seq` 和相同
  `message` 重放；piggyback `ackThrough` 可以推进到更新值。
- receiver 对 duplicate `seq` 仍处理合法的新 `ackThrough`，但不再次投递 semantic message，
  并可重发当前 receipt。重用同一 `seq` 表达不同 semantic message 是 Protocol violation。
- Stale/equal `ackThrough` 是 no-op；ACK 超过本方向最高已发送 `seq`，或收到高于期望值的
  sequence gap，都是 continuity failure。v1 不增加 retained-range exchange、byte-position
  cursor 或 replay-request message。
- ACK `call` message 表达 request admission；ACK `result`/`error` message 表达 terminal
  receipt；ACK `cancel` 只表达 cancel intent 已接纳。三者由被确认的原 message kind 区分，
  不再设置独立 `call-accepted`、`terminal-received` 或带 subtype 的通用 ACK message。
- ACK terminal message 可以支持释放较大的 terminal payload，但不能单独删除防止旧 request
  再次 dispatch 所需的 dedupe tombstone/high-watermark；完整 GC proof 留给 Call State 与
  Session tickets。

### Semantic messages 与 remote error

v1 sequenced semantic union 只包含以下四个 families：

```text
SemanticMessage
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
- Remote error 使用 stable machine-readable string `code`、required human-readable string
  `message` 与 optional JSON `details`。Wire 不直接传输 JavaScript `Error`、`stack`、`name`、
  `cause` 或任意 thrown object；具体 error code set、throw mapping 与安全 details policy 由
  unary/security tickets 决定。
- Unknown Wire Service Name 或 method 是已验证 call 的 call-scoped remote error，不破坏
  Logical Session。Application handler 的失败同样是 call outcome；Protocol fault 不伪装成
  remote error。

### Unknown input 与 profile evolution

Schema 对 `kind` union、required known members、known member types/value domains 和 phase
contract 是封闭的；已识别 tagged record 的额外 members 是开放尾部。

- Unknown extra member 必须先作为受限 JSON data tree 完成 lexical 与 resource validation，
  然后忽略；不保留、不 round-trip，也不得影响 required semantics。
- Known member 缺失、类型错误或越界仍是 Protocol fault，不能因“忽略 unknown fields”而
  降级。Duplicate member name 始终拒绝。
- `args`、`result.value` 与 `error.details` 是 application data；其 object members 都是数据，
  不适用 Protocol unknown-field policy。后续 security ticket 可以把 proof 等安全关键子对象
  明确规定为 closed structure。
- 同一 profile 只能增加旧 endpoint 可安全忽略的 optional fields。新增 message kind、required
  transition、改变既有字段含义或改变 mandatory guarantee 必须使用新 profile。

因此 JSON Schema 不能全局使用 `additionalProperties: false`。v1 不定义 ignorable extension
message registry；unknown message kind 保持 Protocol fault。

### 跨语言 normative artifacts

Default Protocol 的权威规范必须同时包含：

- normative prose：phase/state、每种 record 的前置条件、state effect、receipt point 与 fault
  scope；
- JSON Schema 2020-12：解码后 tagged union、required members、known value domains 与开放尾部；
- valid/invalid raw-byte vectors：UTF-8、BOM、duplicate keys、number/safe-integer boundary、
  unknown fields/kinds、phase violation 与 profile rejection；
- stateful transcript vectors：fresh、accepted/rejected resume、lost ACK/replay、duplicate/gap、
  immediate result、cancel intent 与 terminal receipt。

TypeScript declarations、generated bindings 与 Default Protocol Implementation 都不是 wire
contract 的权威来源。独立 conformance runner 的 export/CLI、package placement、版本策略与
完整验证矩阵由 [`决定规范验证与 package contract`](15-decide-verification-package-contract.md)
决定。

### 明确保留给后续 tickets

- [`决定 Physical Connection Adapter 契约`](07-decide-physical-connection-adapter-contract.md)：
  message/stream framing、send admission、关闭与 Transport conformance；
- [`决定 Logical Session identity、Handshake 与 Recovery`](09-decide-logical-session-recovery.md)：
  fresh/resume/accept/reject 的完整字段、Session incarnation、resume cursor、fencing 与恢复状态；
- [`决定 Call identity、ACK、重放与去重`](10-decide-call-delivery-state-machine.md)：call identity
  组成、精确 admission point、ledger、terminal payload 与 dedupe evidence GC；
- [`决定 unary 调用、取消、错误与终止竞态`](11-decide-unary-call-errors-cancellation.md)：error
  codes、handler mapping、cancel/result/error race 与唯一 terminal outcome；
- [`决定顺序、并发、缓冲与恢复资源上限`](13-decide-ordering-concurrency-resource-bounds.md)：
  message/depth/string limits、ACK timing、replay window、sequence exhaustion 与 backpressure；
- [`决定 trust-boundary validation 与 Session Recovery 安全`](14-decide-validation-recovery-security.md)：
  proof schema/canonicalization、认证绑定、replay resistance 与 violation fault scope。

本票不增加生产代码、不决定 private Module 的类/文件切分，也不改变 public Protocol seam。
