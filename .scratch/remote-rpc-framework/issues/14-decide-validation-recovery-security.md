# 决定 trust-boundary validation 与 Session Recovery 安全

Type: grilling
Status: resolved
Blocked by: 06, 09, 10, 13
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

先明确 fresh Physical Connection 对 confidentiality、integrity、endpoint identity 与 active attacker
的 Transport threat assumptions；在业务认证、授权和限流留给 application/Transport Adapter 的
前提下，RPC Protocol 必须怎样验证不可信 wire input、保护 active-session record/ACK integrity，
并保护 Session Recovery 不被冒用？决定 descriptor/wire compatibility、malformed/unknown input、
concrete resume/accept proof、proof binding 与 canonical input、key ownership/derivation、nonce 与
replay resistance、对 unauthorized/stale resume attempts 的抵抗、ACK authentication，以及
Protocol violation scope。无法接纳的 expected-`seq` record 在没有 skip/NACK 的 profile 中不得
成为每次 Recovery 重放的 poison record；必须决定何时把它定为 Session terminal。另决定
lifecycle/call telemetry 的安全暴露、redaction 与 payload-retention 约束。Session fencing state 由
[决定 Logical Session identity、incarnation、fencing 与 Recovery](09-decide-logical-session-recovery.md)
定义，精确数字上限由[决定顺序、并发、缓冲与恢复资源上限](13-decide-ordering-concurrency-resource-bounds.md)
定义。

## Answer

默认 v1 选择“**受保护 Transport + Session-scoped HMAC resume proof**”。Transport 建立 fresh
responder identity、payload confidentiality 与每条 Physical Connection 的 ordered integrity；Default
Protocol 生成一份只代表 Session continuity authority 的 secret，并用它认证 resume cursor、attempt
与 accept transcript。Active records/ACK 由已经通过 fresh 或 resume Handshake 绑定的 exact protected
Connection 认证，不再给每条 record 重复增加 Protocol MAC。

这是一项明确的条件保证，不是假装 `IRpcConnection` 可以证明 TLS。与 VS Code“先认证 transport
challenge，再用 reconnection token 找 retained state”的边界一致，证据见
[`vscode-rpc-ipc-precedents.md`](../research/vscode-rpc-ipc-precedents.md)。

### Threat model 与 Transport 前提

每条可成为 current binding 的 Physical Connection 必须由 deployment/Adapter 提供：

- 对 remote network observer 的 payload confidentiality；
- message ordering、integrity 与 connection-local anti-replay；
- initiator 对预期 responder endpoint 的认证。

典型实现是证书验证成功的 TLS/WSS，也可以是受 OS capability/ACL 保护的本地 IPC 或同一信任域内
的 `MessagePort`。`IRpcConnection` 不增加 `isSecure`、certificate、principal 或 channel-binding
member；这种 boolean 既无法由 Framework验证，也不能替代正确的 Adapter factory 配置。Plaintext、
未认证 endpoint 或恶意 Adapter 仍可通过 functional conformance，但不享有 Default Protocol 的
confidentiality、active ACK integrity 或 secure Recovery guarantee，必须在 package/deployment 文档
中明确。

RPC Protocol 不认证业务用户，不把 `RpcPeer`/Session authority 当作 account principal，也不决定
method authorization 或 abuse rate limit。Fresh initiator 可以是业务匿名方；mTLS、HTTP cookie/
header、origin policy、token validation 与每用户 rate limit仍属于 Adapter/application。Active
attacker 可以建立自己的 attempts、发送任意 bytes、观察长度/时序并 delay/drop/close Connection，
但不能读取、修改或重放另一条 protected Connection 的明文，也不能读取本地 process memory。

Default Protocol 不提供 application payload 的独立 end-to-end encryption、forward secrecy、
post-compromise security 或对恶意 local subscriber/handler/Adapter 的隔离。若数据要穿过不可信 TLS
terminator，需要带外 trust root 和逐 record protection 的新 profile/custom Protocol。

### 三种设计的取舍

1. 只依赖 secure Transport，并把一个 bearer resume token原样重传，代码最少，但 token 不绑定
   role、profile、cursor、attempt 或 exact accept；抓到/误路由的旧 request 也没有 Protocol-level
   freshness evidence，因此不采用。
2. secure Transport 建立一次 Session secret，resume 使用 domain-separated HMAC proof，active
   records 继续使用 Transport integrity。这是采用方案：满足现有 Adapter seam、Node/browser 与
   lost-accept Recovery，又不改变每条 call 的 Outgoing Admission 临界区。
3. 每条 active record 再做 HMAC，或在 Protocol 内做 ECDH。前者重复 protected Transport、给每条
   `send()` 增加 JCS/WebCrypto async preparation 和第二个 connection sequence；匿名 ECDH 又不能
   抵抗 active MITM，真正安全还需 pinned signing key/PSK、分发、rotation 与 revocation seam。
   这类端到端需求属于新 profile/custom Protocol，不进入 default v1。

### Security carriers 与 fresh establishment

算法在 `husky-di-rpc/1` 中固定为 CSPRNG、SHA-256、HMAC-SHA-256、HKDF-SHA-256 与 RFC 8785 JCS，
不 negotiation；改变算法必须发布新 profile。[RFC 5869](https://www.rfc-editor.org/info/rfc5869/)
定义 HKDF，[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html)定义不改变 Unicode 字符串、按
UTF-16 code units 排序 property 的 canonical JSON。现有 strict JSON value model 已拒绝 duplicate
members、lone surrogate、non-finite number 与 `-0`，是 JCS/I-JSON 所需输入的更严格子集。

`sessionId`、`sessionSecret`、`initiatorNonce`、`responderNonce` 与所有 proof raw value 均为
`32` 个 CSPRNG bytes；wire carrier 必须是 unpadded canonical base64url，decoder 拒绝错误长度、
padding、非 URL alphabet 与任何可解到相同 bytes 的替代 spelling。每个已知 security carrier 本身
都是 exact scalar shape，不接受 object、替代 alphabet 或第二种 encoding；tagged record 的普通
top-level unknown tail policy 仍然开放，且所有这些 unknown members 都进入下述 JCS proof input。

Fresh fields 固定为：

```text
fresh request
  = { kind: "fresh", profiles, initiatorNonce }

fresh accept
  = { kind: "accept", profile, sessionId, bindingEpoch: 1,
      responderNonce, sessionSecret, proof }
```

Responder 为每个新 Session 独立生成 `sessionId`、`sessionSecret` 与 nonce；不同 Session 绝不共享
secret。`sessionSecret` 只在这一次 protected fresh accept中出现。它证明“继续这个 incarnation 的
authority”，不证明任何现实身份。

生成 `sessionId` 时必须在无-await步骤检查 owner当前 retained与 provisional identity set；碰撞候选
不发送；每个 fresh attempt总共最多检查 `8` 个候选。成功候选先原子放入 provisional set再开始 async proof preparation，
避免两个 concurrent fresh attempts签出同一 active identity；install/attempt terminal后转为 retained
或释放 reservation。全部 `8` 个候选都碰撞视为 shared CSPRNG/crypto invariant failure并终止 owner，而不是
创建重复 Session。v1 不保留已释放历史 ID tombstone，历史 non-reuse只有 256-bit probabilistic保证；
新 incarnation独立 secret仍阻止旧 proof在偶然 ID碰撞时取得 authority。

Canonical proof input 只在密码学运算中使用；传输 JSON bytes 仍无需 canonical。定义：

```text
D(label)       = UTF8("husky-di-rpc/1\0" + label + "\0")
H(record)      = SHA-256(JCS(record with the exact top-level `proof` member omitted))
sessionContext = SHA-256(JCS({ profile, sessionId }))
proofKey       = HKDF-SHA-256(
                   IKM = sessionSecret,
                   salt = sessionContext,
                   info = D("proof-key"),
                   length = 32)
```

JCS input 包含 record 的所有 unknown tail members；只能删除 exact top-level `proof`，不能删除 nested
同名 data。Domain label 以 NUL terminator 分隔，后续 concatenated hashes 都是固定 `32 B`，不存在
变长拼接歧义。

```text
fresh accept proof
  = HMAC-SHA-256(proofKey,
      D("fresh-accept") || SHA-256(JCS(fresh request)) || H(fresh accept))
```

Initiator 先从 bounded accept 中取得 secret、derive non-extractable proof key，再验证 proof，验证成功
后才安装 Session。该 proof 提供 exact transcript/key confirmation，但 secret 与 proof 来自同一
Connection，所以它不能替代 fresh Transport 的 endpoint authentication。

### Resume proof、freshness 与 lost accept

Resume fields 固定为：

```text
resume request
  = { kind: "resume", profile, sessionId, receivedThrough,
      resumeAttempt, initiatorNonce, proof }

resume accept
  = { kind: "accept", profile, sessionId, bindingEpoch, receivedThrough,
      responderNonce, proof }
```

`resumeAttempt` 是 initiator-owned safe integer，从 `1` 开始严格递增、允许 gap、never reuse/wrap。
每次 resume attempt 在 proof preparation 前取得新值；request/accept 丢失、crypto/startup failure 或
timeout 都不回滚。Responder 保留 `highestAcceptedResumeAttempt`，验证 proof 后必须在 binding
linearization point重新检查 `attempt > high-watermark`，并与新 epoch、endpoint fencing、binding
install 一起原子推进。并发相同/较低 attempt 至多一个成功。

```text
resume request proof
  = HMAC-SHA-256(proofKey, D("resume-request") || H(resume request))

resume accept proof
  = HMAC-SHA-256(proofKey,
      D("resume-accept") || H(resume request) || H(resume accept))
```

Request proof 因完整 canonical record 自然绑定 initiator role、exact profile、sessionId、cursor、attempt
与 nonce；accept 再绑定同一 request、新 responder nonce、new binding epoch 与反方向 cursor。
Initiator 只要求新 epoch 严格高于自己最后**已验证**的 epoch，不要求恰好 `+1`：中间 accept 可能
已经在 responder 线性化但丢失。下一次更高 `resumeAttempt` 仍用同一 proof key恢复，因此不采用会
因 lost accept 发生 key desynchronization 的 per-resume ratchet，也不需要无界 nonce replay cache。

所有 proof 使用 WebCrypto `subtle.verify` 或等价 platform cryptographic verification；不手写
JavaScript early-exit proof-byte comparison。Web Crypto标准不承诺实现 constant-time，本 profile也不
把 timing作为 conformance guarantee。浏览器与 Node 的 Web Crypto 都提供 HMAC/HKDF/SHA-256 所需操作，规范入口见
[Web Cryptography Level 2](https://www.w3.org/TR/WebCryptoAPI/)。Crypto 是 async，但只位于 bounded
bootstrap attempt；它不改变 call `seq`/`callId` 的无-await commit boundary。

Resume request proof invalid、unknown/expired Session、wrong profile、stale attempt，或已取得 bounded
handshake workspace 后发现的 resume-specific capacity failure，都只得到 generic `resume-rejected`，
不推进 epoch/cursor、不中止 retained Session、
不重置 Recovery deadline。只有 proof 先验证成功，随后 cursor 低于 retained authenticated lower
bound 或高于 highest-sent upper bound，才返回 authoritative `continuity-failure`。

Owned-Connection cap 或全部 handshake workspace 在 first-record parse 前已经耗尽时，Owner 不能安全
分类 request、执行同形 HMAC path或发送 rejection；它直接关闭该 attempt，不创建/查询 Session，也不
声称这是 `resume-rejected`。Enumeration resistance 的同形承诺只覆盖已获得 bounded handshake slot
后的 Session lookup/proof/admission paths。

Proof verification 是 async，因此验证完成不授予可延后使用的 admission token。Responder 必须在
没有 `await` 的 binding-install linearization point重新读取并原子重查：owner/Session 尚未 terminal、
attempt endpoint 仍有效、exact profile/session 匹配、Recovery deadline 尚未赢、
`resumeAttempt > highestAcceptedResumeAttempt`、双方 cursor 仍位于**当前** retained lower bound 与
highest-sent upper bound、下一 epoch可分配且 binding/Connection reservation 仍有效。全部成功后才把
attempt high-watermark、epoch、endpoint fencing 与 binding install 一起提交；任何一步已被并发
cutoff、ACK/GC 或更高 attempt改变，就按该时刻的 authoritative/attempt scope重新判定，绝不使用旧
snapshot。Fresh accept 的 async proof preparation同样只在 owner 仍 active、attempt endpoint 与预留
Session capacity 仍有效的无-await install point创建 Session；cutoff/attempt terminal先赢则不安装。

同一规则覆盖所有 async sign/verify：crypto completion只产生 candidate，绝不携带 state authority。
Responder 在 authoritative reject 的 Session-terminal linearization 前，Initiator 在 accept install 或
authenticated-reject terminalization 前，都必须在无-await临界区重查 exact attempt endpoint、当前
owner/Session/deadline/epoch winner、request transcript和此刻 retained bounds。更高 attempt、cutoff、
timeout、endpoint fence或其他 terminal先赢时丢弃 late candidate；旧 signed reject不能终止已经由
较高 attempt继续的 Session，late verified accept/reject也不能复活或改判本地 state。

Authoritative resume reject 使用：

```text
authenticated reject
  = { kind: "reject", code: "continuity-failure" | "session-terminated",
      responderNonce, proof }

reject proof
  = HMAC-SHA-256(proofKey,
      D("resume-reject") || H(resume request) || H(authenticated reject))
```

Generic resume reject 的发送形态固定为
`{ kind: "reject", code: "resume-rejected", responderNonce, proof }`，不带 `message` 或其他 sender
field；nonce 与 dummy proof都使用同样的 32-byte canonical carrier，dummy key path执行同形 bounded
HMAC work，但该 proof不授予 Session authority。Authoritative reject 使用上面相同的四个 known fields，
只是 code 与真实 proof不同。Initiator 只有验证 authoritative proof 后才允许该 reject 终止 Session。Session
已经释放 key 后只能 generic reject；v1 不为回答旧 resume 而永久保存 secret tombstone。正常
graceful shutdown在释放 key前由 issue 18 的 protected current binding发送 Session-close；force close
不发送通知，abrupt loss或已释放 key后的 attempt只能 generic reject。

### Active record 与 ACK authentication

Fresh proof验证成功，或 responder 将 proof-valid resume 与 exact endpoint 原子绑定且 initiator验证
accept 后，该 Physical Connection 的 active records继承 protected Transport 的 integrity、ordering
与 anti-replay。Default wire 不增加 `authTag`、connection-local record number 或公开 channel
identity；current binding endpoint/epoch 是 private authority。`message`、`ack`、`ping`、`pong` 与
top-level `close` 只有从 exact current endpoint 到达、且 endpoint 尚未 fenced，才进入 Codec。
Close继承同一 protected-Transport authority，不带独立 proof；合法 Close直接 terminal Session且不
回复，强制 local `close()` 根本不发送 wire Close。

旧 endpoint callback 在读取/验证 bytes 前即按 local epoch gate 丢弃并 Direct Close。Current record
仍必须完成全部 Codec/schema/phase/semantic validation；ACK 只有在其所在完整 record成功且不超过
highest-sent boundary 后才能释放 replay/terminal evidence。Raw bytes、invalid record 与 stale
endpoint input不更新 activity。Custom Protocol 若不依赖 protected Transport，可以在自己的完整
profile中提供等价或更强的 active MAC，但不能弱化 caller-visible fencing/ACK guarantees。

### Validation pipeline 与 poison record

每个 input 固定按以下顺序处理，任一步失败都不能执行后续 state effect：

1. Adapter 在 framing/allocation/copy 前执行 native message/queue limits；
2. Connection Driver 先检查 endpoint identity/epoch，stale endpoint 不 parse；
3. Codec 在 ordinary materialization 前验证 `1 MiB`、UTF-8、BOM、syntax、duplicate member、depth、
   string/identifier/member/element/node/number limits；
4. materialize bounded tree，验证 top-level tagged-union、known field type/domain、exact scalar security
   carriers，并对 unknown tail完成相同 resource validation；
5. 验证 bootstrap/active phase。Fresh 只在 documented protected-Transport deployment assumption 下
   继续，Framework 不以 runtime boolean 猜测该前提；resume验证 proof/attempt；active input只接受
   exact protected current endpoint；
6. 执行 retained semantic validation：profile/session binding、cursor lower/upper bound、`seq`
   continuity、ACK upper bound、Call Ordinal、terminal winner、reserved `then` 等；
7. 对合法 expected call先执行 mutable capacity decision且不 lookup exposure：ordinary capacity
   不可用但 reserve可用则 Remote Resource Rejection；ordinary reservation成功后才 exact route，known
   route进入 Remote Request Admission，unknown route进入固定 Remote Semantic Rejection；protected
   invariant失败则 Session fault；
8. sequenced record只有 durable disposition后才推进 receipt/ACK；任意 record在完整 validation与合法
   semantic disposition（包括 stale/equal ACK、coalesced Ping/Pong等 idempotent no-op）后才更新
   activity与相应 state/event batch；随后释放 raw tree、unknown fields、JCS bytes与 transient digest。

Fixed profile violation不是 ordinary overload，不能回成 call-scoped `unavailable`。一个已经能归因于
protected current Session holder 的 expected-seq record若无法合法 disposition，第一次就必须
terminal Session，不能只断 binding后让同一 poison 在每次 Recovery 重放。

| Input/failure | Scope and effect |
| --- | --- |
| Adapter framing/queue/oversize terminal，或尚未绑定的 invalid first record | Connection/attempt；不创建/改变 Session。Generic Adapter error 没有足够分类信息升级 scope。 |
| pre-bootstrap Connection/handshake workspace不足 | Direct Close attempt；不 parse、不 lookup Session、不承诺 wire reject。 |
| bounded handshake slot 内的 unknown/expired Session、wrong resume profile、bad proof、stale attempt、resume-specific capacity | 固定四字段 `resume-rejected`；attempt-only。 |
| valid resume proof，但 cursor 与 retained bounds 冲突 | proof-authenticated `continuity-failure`；Session terminal。 |
| bad/unmatched accept proof | current attempt failure；fresh 回 unbound，resume 保持 recovering。 |
| proof-valid fresh accept 但 profile/epoch/transcript 自相矛盾 | fresh attempt failure；尚未安装 Session。 |
| proof-valid resume accept 但 cursor/epoch/transcript 与 retained facts矛盾 | local Session terminal；continuity 无法成立。 |
| protected current endpoint 到达、且进入 Codec 后的 lexical/schema/phase/fixed-resource/unknown-kind violation | Session-terminal Protocol fault；不 ACK、不 Recovery。 |
| protected current endpoint 的合法 active `close` | authenticated Session terminal；settle calls/handlers、禁止 Recovery并 Direct Close，不 ACK/reply。 |
| authenticated fresh `seq` gap、ACK beyond highest sent、Call Identity reuse、conflicting terminal | Session-terminal Protocol fault。 |
| valid expected call 的 ordinary work不足 | protected `terminal(unavailable)` + receipt；Definite Non-Execution。 |
| unknown service/method（`then` 除外）、handler throw/invalid result | 既有 call-scoped terminal。Reserved `then` 是 profile violation。 |
| stale fenced endpoint late input/terminal/send completion | fenced no-op；不能伤害 current Session。 |
| shared owner crypto/runtime invariant corruption | owner fault；Acceptor siblings 只有真正 shared failure 才受影响。 |

Generic Adapter terminal 只能触发既有 `connected -> recovering`，因为 public Adapter error 没有稳定
framing/oversize code。若 future Adapter seam 要把 authenticated peer oversize直接升级为 Session
fault，需要新的可信 typed diagnostic，而不是匹配 error message。

### Enumeration、descriptor 与 authority boundaries

- `sessionId` 有 256-bit entropy 且单独持有无 authority。Unknown Session lookup 使用 owner-private
  dummy key做一次同形 bounded HMAC verify；proof comparison使用平台 crypto API而非手写 early exit，
  但不据此承诺 timing constant-time。
- 已取得 handshake slot后的 unknown/expired/wrong-profile/bad-proof/stale/resume-specific-capacity
  rejection 使用相同 code、field set与 carrier length，不返回 supported profiles、Session state、
  cursor、epoch 或内部原因。JavaScript
  scheduler/cache 无法承诺严格 network constant time；高熵 id/secret、统一输出、finite handshake
  slots 与外部 rate limiting 是主要防线。
- Failed attempts 不创建 peer、不发 session-specific public event、不延长 deadline。持有 proof key
  的对端可以合法用更高 attempt抢占 binding；它已经是 Session authority，Framework 不把这当业务
  abuse control。
- Handshake 不交换 Descriptor manifest。Wire Service Name/method 精确匹配当前 exposure；普通 unknown
  name 是 call terminal，reserved `then`、非法 value 或 schema shape是 Protocol fault。Session
  authority 不授予调用某个业务 method 的 authorization。

### Telemetry、redaction 与 secret lifecycle

通用 `event$` 是 payload-free structured telemetry，不增加 redactor/interceptor。Call observation只
包含 stable peer、local `observationId`、direction、**已经 exact-match 本地 Descriptor/allowlist** 的
canonical Wire Service Name/method、由event discriminant表达的phase/outcome、safe `RpcError.code` 与
bounded duration/count；incoming Session terminal使用无code/reason的event-only `terminated`，不把
Protocol/Session cause复制进call event；
unknown service/method 的相应 name field缺席，公开 error/log也不 echo攻击方 spelling。Duration 固定为
floor 后的非负 safe-integer milliseconds，count 固定为非负 safe integer；二者溢出都 saturate 到
`Number.MAX_SAFE_INTEGER`。Lifecycle/fault event只含 coarse safe category。

通用 event、Framework log/error message 永不包含或默认记录：raw wire、args/result/details、raw
thrown value、remote message/stack/cause、sessionId/sessionSecret、callId、seq/ACK/cursor、epoch、nonce、
proof/digest/JCS bytes、unknown fields，或 Adapter URL/header/credential。Framework 不提供 telemetry
history/ring buffer、exporter、trace propagation、payload redaction callback 或 default Protocol raw
transcript facility，也不自动把 events 写入 console。需要 payload diagnostics 的 application 应在
自己拥有的 caller/handler 边界显式埋点。

Operation rejection/sticky state 可以保留 trusted local Adapter Error 作为 `cause`，但 event只投影
safe category/code，不复制 Error；Adapter/Protocol 自己也不得把 credential、secret 或攻击 raw input
拼进公开 message。Handler raw throw只用于当前 local terminal normalization，随后释放，不进入
owner event 或 responder-side public `RpcError.cause`。

Fresh decode 后双方把 root secret导入 non-extractable key、derive proof key，并对自己控制的临时
`Uint8Array` best-effort overwrite。JCS/digest/nonces只在相应 crypto Promise真实 settle后释放；
attempt timeout/fence不能取消 WebCrypto，也不能提前释放 issue 13 的 handshake permit/transient charge，
late result由 bounded sink消费。Session只保留 proof
key、attempt high-watermarks 与 current handshake metadata，全部计入 issue 13 的 `64 KiB` protected
security budget。Session terminal 释放所有 key references；JavaScript 不承诺清除 engine copy、GC
heap 或物理内存。Secret 不 export/persist/rotate，也不跨进程恢复；process restart 结束 incarnation。
Proof-key compromise允许接管整个 Session，只能终止该 incarnation并 fresh，v1 不声称自动恢复。

### Verification 与剩余边界

Issue 15 必须加入 HMAC/HKDF/JCS known-answer vectors、每个 proof 字段 mutation、base64 canonicality、
cross-role/session/profile replay、lost accept 后更高 attempt、concurrent attempt fencing、generic reject
shape、signed continuity failure、old endpoint fencing、ACK tamper at protected-Transport fixture boundary、
poison Session isolation、active/provisional sessionId collision、pre-bootstrap cap Direct Close、timeout后
crypto permit retention、graceful Close authority、secret scan 与 Node/browser WebCrypto interoperability。

本票不实现 TLS、certificate/PSK store、business auth/rate limit、payload encryption、逐 active-record
MAC、debug transcript 或 security plugin seam。正式 standards/primary-source 摘要记录在
[`rpc-security-primitives.md`](../research/rpc-security-primitives.md)。
