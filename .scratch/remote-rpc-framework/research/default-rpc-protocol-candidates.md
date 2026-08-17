# 默认 RPC Protocol 候选调研

日期：2026-08-17

性质：research context，非 normative specification

对应 ticket：[调研默认 RPC Protocol 候选](../issues/02-research-default-rpc-protocol-candidates.md)

## 问题、范围与判定标准

本报告回答一个限定问题：在 Husky DI 已选定的任意、有序、全双工消息
`Transport` 之上，是否存在可以直接复用或只做小幅适配的开放 RPC protocol，同时提供：

- 两端都可发起的 unary call；
- 取消、结构化 result/error 与跨语言 wire contract；
- 明确的版本或能力协商；
- Physical Connection 更换后仍保留的 Logical Session；
- request replay、重复抑制、在途调用恢复，以及唯一 terminal outcome 的重放与有界保留。

“规范未定义某项语义”不等于“无法在其上扩展”。本报告分别判断：已有规范直接保证了
什么、要满足目标还必须新增什么、采用完整协议栈的成本是否与当前互操作目标相称。
来源只采用正式规范、项目官方文档和第一方源码；引用固定版本或 revision 的地方以链接
中的版本为准，访问日期为 2026-08-17。

本报告不决定具体二进制 grammar、Codec、安全证明、fencing、超时或资源上限；这些仍由
后续规范票据决定。

## 结论

**默认 Protocol 应定义专用的 unary-recovery wire contract。没有候选能直接满足全部目标，
也没有候选只需“小幅适配”即可补齐 call-level recovery。**

最接近的是 RSocket 1.0，其双向 request-response、`CANCEL`、`ERROR`、版本字段、resume
token、双向 implied position 和 retained-frame retransmission 都值得借鉴。但 resumption
是 optional、optimistic、client-initiated；position 证明的是 frame delivery 位置，不是
handler accepted/started、terminal recorded/delivered 或 retained state released。其取消
序列还会让 requester 在发送 `CANCEL` 时、responder 在接收时立即终止 stream，不能直接
形成双方都可恢复和重放的唯一 terminal outcome。

AMQP 1.0 + Link Pairing 是另一个重要近邻。它有跨 Connection 的 link/delivery 恢复、
unsettled delivery 与 settlement，但 request 和 response 仍是两次独立 message delivery；
规范没有统一的 RPC call ledger、远端取消和 terminal replay。若补齐这些语义，得到的是
“AMQP + Husky DI RPC profile”，并仍需承担完整 AMQP Connection/Session/Link/flow/
settlement 栈，超出当前最小 `Transport` seam 的需要。

JSON-RPC/LSP、gRPC、WAMP、Ice、Cap'n Proto、Avro 与 Thrift 都提供可借鉴的局部能力，
但没有改变上述结论。尤其需要两点限定：Ice 确有自动重试/at-most-once 相关机制；
Cap'n Proto 也定义了应用可选实现的 persistent capability。它们仍未直接定义本问题要求的
Logical Session、在途 call ledger、跨连接 dedupe 和 terminal replay，因此不是反例。

## 横向比较

| 候选 | 已有强项 | 决定性缺口 | 结论 |
| --- | --- | --- | --- |
| RSocket 1.0 | 双向 request-response、取消、错误、版本、可选 resume、双向位置 | resume 只到 frame 位置；无 call accepted/terminal ledger；取消不回传唯一终局 | 最接近；借鉴机制，不采用默认 wire |
| AMQP 1.0 + Link Pairing | 双向 message transport、unsettled delivery、settlement、link resume | request/response 是独立 delivery；无统一 method/cancel/result-error/call retention | 可定义 profile，但栈与扩展成本过高 |
| JSON-RPC 2.0 + LSP 3.17 | 简洁 envelope、结构化错误、cooperative cancel、capabilities | 无 Logical Session、ACK、replay、dedupe、terminal retention | 借鉴 call grammar 与取消规则 |
| gRPC over HTTP/2 | 成熟 IDL、status/details、取消、retry | client 发起；call ID 属于 HTTP/2 session；规范明确无 duplicate suppression | 不适合当前对称、可恢复 seam |
| WAMP | 全双工、应用角色可对称、RPC/cancel/capability announcement | Client-Router/Dealer 拓扑；Transport 消失即结束 Basic Session | 拓扑与生命周期不符 |
| Ice | 跨语言 RPC、双向 callback、结构化 reply、重试 | wire request ID 与 fixed proxy 依赖 connection；无本目标的 session/call ledger | 不能小幅适配 |
| Cap'n Proto RPC | 双向 capability RPC、promise pipelining、结构化异常 | connection capability 断线即失效；persistent capability 不恢复在途调用 | 不能小幅适配 |
| Avro RPC | IDL、schema handshake、request/response/error | correlation 由 transport 定义；stateful handshake 只在 connection lifetime 内有效 | 可用作 schema/Codec，不是 recovery protocol |
| Thrift | 跨语言 IDL、CALL/REPLY/EXCEPTION/ONEWAY | 无标准 session resume、cancel、replay、dedupe 或 terminal ledger | 可用作 IDL/Codec，不改变结论 |

## 候选详查

### RSocket 1.0：最接近，但恢复层级和取消终局不够

[RSocket 1.0 protocol（固定 revision `0f6e5554`）](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md)
把连接两端分别称为 requester/responder，并允许每个方向各有一个 requester；连接建立章节
也列出 server-side request，因此可支持对称 request-response。`SETUP` 带 major/minor、
resume token 与 data/metadata MIME；frame 集合包括 `REQUEST_RESPONSE`、`CANCEL`、
`ERROR`、`RESUME` 和 `RESUME_OK`。这一部分直接覆盖了本问题的大量表面需求。

但规范的 resumption 章节给出严格限制：

- 完全可选，双方默认应假定不支持，而且是可能失败的 optimistic operation；
- 假定断线时两端状态仍在、version/encoding 等参数不变；只能由 connection client 发起；
- 明确不对已投递 frame 与应用状态之间的 atomicity/transactionality 作任何假设；
- implied position 按被跟踪 frame 的编码长度累计，表示双方的接收/保留位置；
- `RESUME_OK` 后双方对 retained frames 的 retransmit 都是 `MAY`；retention lifetime
  的具体管理由实现决定。

所以 position 可以回答“哪些 RSocket frames 可能需要重发”，却不能回答“某 call 的
handler 是否已开始、terminal 是否已持久记录、对端是否已收到 terminal、何时可释放
dedupe evidence”。要获得本地图的保证，仍需定义 session incarnation/proof、call ID、
accepted ACK、in-progress/terminal ledger、terminal received/released 与有界 retention。

取消也不能原样使用。request-response sequence 规定 requester 发送 `CANCEL` 后 stream
终止，responder 收到后终止且 `SHOULD NOT` 再发 response。这样没有一个 responder 必须
记录并可在恢复后重放的 cancel-vs-result/error 唯一终局；Husky DI 必须另定义竞态收敛。

完整 RSocket 还包含 fire-and-forget、request-stream、request-channel、`REQUEST_N`、
fragmentation、keepalive、lease 等 surface。即使可以实现一个只使用 unary 的 profile，
当前并无通用 RSocket interoperability 目标；为复用 wire 而引入该 surface，再叠加一层
自定义 call ledger，收益不足。这里还需限定参考实现证据：第一方 `rsocket-js` 的
[旧 `master` resumable transport](https://github.com/rsocket/rsocket-js/blob/0f3b33320da9acfe846d0194a847a6eda905378d/packages/rsocket-core/src/RSocketResumableTransport.js#L48-L53)
明确说明它面向后续协议、不能与 1.0 server 工作；当前 `1.0.x` 已有
[`FrameStore`/resume position](https://github.com/rsocket/rsocket-js/blob/285e3b47e5708d46519adfe1639c5371f55f1ec1/packages/rsocket-core/src/Resume.ts#L31-L130)
和
[`RSocketConnector` resume path](https://github.com/rsocket/rsocket-js/blob/285e3b47e5708d46519adfe1639c5371f55f1ec1/packages/rsocket-core/src/RSocketConnector.ts#L53-L129)。
因此不能泛化为“当前 rsocket-js 不支持 1.0 resume”；但实现进展也没有补入规范所缺的
call-level ledger/terminal replay，不能据此断言现成的跨语言 recovery 互操作满足本目标。

**判定：** 不采用 RSocket wire 作为当前默认值；借鉴双向位置、resume gate、参数冻结和
恢复拒绝，但把 call-level recovery 独立规范化。若未来出现通用 RSocket 互操作目标，
再单独评估“RSocket wire + Husky DI profile”。

### AMQP 1.0 + Link Pairing：交付恢复很强，但不是统一 RPC call

[OASIS Link Pairing 1.0](https://docs.oasis-open.org/amqp/linkpair/v1.0/linkpair-v1.0.html)
明确说 AMQP link 是单向 message transport，并用两个反向 link 组成双向 request-response
message transport；request 的 `reply-to = $me` 指示 response 从配对反向 link 返回。

[AMQP 1.0 Transport OASIS Standard](https://docs.oasis-open.org/amqp/core/v1.0/os/amqp-core-transport-v1.0-os.html)
定义 source/target termini、delivery-tag、unsettled delivery state、`ATTACH` 时的 unsettled
map 与 link resume。delivery-tag 在 link 上标识 delivery，而 session-scoped delivery-id
不能被当作跨新 endpoint 的稳定身份。双方可以在重新 attach 后核对 unsettled state，
继续 transfer/disposition/settlement。
[AMQP 1.0 Messaging](https://docs.oasis-open.org/amqp/core/v1.0/os/amqp-core-messaging-v1.0-os.html)
又定义 `accepted`、`rejected`、`released`、`modified` 等 terminal outcomes，和用于恢复
大消息交付的非终局 `received` state。这是成熟的 delivery recovery 设计。

缺口来自抽象层级：Link Pairing 只规定如何得到一对反向 message links；request 和
response 仍各有自己的 delivery identity、state 与 settlement。上述规范没有定义统一的
service/method、call identity、远端 cancellation、result/error union，也没有规定重复
request 应直接回放已保存 terminal、request settlement 如何与 response retention 联动。
这些都可以在 AMQP application profile 中新增，但不能称为直接复用或小幅适配。

此外 AMQP 是完整 wire/transport stack，不是放在现有任意 message `Transport` 之上的
薄 RPC envelope。采用它要保留 Connection、Session、Link、credit flow、transfer、
disposition 和 settlement 语义，和当前 seam 重叠。

**判定：** 不采用 AMQP 作为默认 wire；借鉴 delivery/call 分层、unsettled/terminal
状态与显式 settlement。未来若有 AMQP broker/container 互操作目标，再定义独立 profile。

### JSON-RPC 2.0 与 LSP 3.17：call grammar 很好，没有 recovery

[JSON-RPC 2.0](https://www.jsonrpc.org/specification) 自称 stateless、transport-agnostic，
定义 `method`、`params`、correlation `id`，以及互斥的 `result` 或结构化
`error { code, message, data? }`。同一实现可同时扮演 client/server，因而 envelope 本身
不阻止对称调用；但规范没有 cancellation、session、delivery ACK、replay 或 dedupe。

[LSP 3.17 specification（固定 revision `8b9fab8f`）](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/specification.md#L331-L353)
在 JSON-RPC 上增加 `$/cancelRequest`：取消是 cooperative，接收方可以忽略取消，但原请求
仍须返回 terminal response。LSP 还在 `initialize` 中交换 capabilities，并规定严格初始化阶段。
这些适合借鉴为取消 intent、capability defaults 和 unknown-message policy，但 LSP 的
client/server 初始化角色并不对称，也没有跨连接 session、ACK、replay、dedupe 或
terminal retention。

**判定：** 借鉴 discriminated envelope、result/error union、取消 intent 与 capability
模式；不能作为 recovery protocol。

### gRPC：成熟 RPC 与 retry，不是可恢复的对称 session

[gRPC core concepts](https://grpc.io/docs/what-is-grpc/core-concepts/) 定义 unary 与三类
streaming RPC；即便 bidirectional streaming，仍由 client 调用 server method 发起。
[cancellation guide](https://grpc.io/docs/guides/cancellation/) 把取消定义为 cooperative，
且不回滚已经产生的更改。
[retry guide](https://grpc.io/docs/guides/retry/) 说明 retry 是新 attempt/stream，客户端
保存并重放 call history，收到 response headers 后 RPC 即 committed。

更决定性的证据来自第一方
[gRPC over HTTP/2 protocol](https://github.com/grpc/grpc/blob/0a5cb6a35ff98d49d10515215bdf58685d2673ea/doc/PROTOCOL-HTTP2.md)：
规范明确写明没有 duplicate suppression；标记为 idempotent 的 call 可以发送多次；call
ID 使用 HTTP/2 stream ID，只在一个打开的 HTTP/2 session 内有意义。连接失败时 client
outstanding calls 关闭为 `UNAVAILABLE`，server 侧关闭为 `CANCELLED`，不是恢复旧 call
ledger 后继续收敛。

**判定：** gRPC 的 status/details、deadline/cancel 和 retry policy 可借鉴，但 HTTP/2
client/server 方向、connection-scoped ID 和无 dedupe 的 retry 模型不满足目标。

### WAMP：应用角色对称，但拓扑和 Session 生命周期不符

[WAMP specification](https://wamp-proto.org/wamp_latest_ietf.html) 允许一个 application
component 同时承担 Caller 与 Callee，因此在 Router fabric 之上应用角色可以对称；它也
要求 transport message-based、reliable、ordered、bidirectional。RPC 实际拓扑却是
Caller -> Dealer -> Callee，WAMP 明确不支持直接 client-to-client，连接由 Client 建到
Router。

[WAMP Basic Profile](https://wamp-proto.org/wamp_bp_latest_ietf.html) 把 request ID 限定在
session scope，并规定 Session 从 `WELCOME` 开始，在 underlying transport 消失或
`GOODBYE` 完成时结束。Advanced surface 有 call canceling；当前草案也零散提到 Session
Resumption，但没有形成可依赖的 normative recovery/call-ledger 章节。本判定因此严格限定
于 Basic Profile 与当前标准化状态，不断言未来扩展永远无法补齐。

**判定：** Router/Dealer 是产品拓扑变化，不是现有 peer-to-peer `Transport` seam 的
小幅适配；Basic Session 生命周期也直接不满足恢复目标。

### Ice：有双向 callback 与重试，但 wire 状态仍是 connection-scoped

[Ice protocol messages](https://docs.zeroc.com/ice/3.8/matlab/protocol-messages) 定义
Request/Batch Request/Reply 等消息、协议和 encoding version；非零 request ID 在
connection 上唯一，并由 Reply 回显。
[Ice bidirectional connections](https://docs.zeroc.com/ice/latest/javascript/bidirectional-connections)
允许 server 通过原有 outgoing connection 回调 client，但 fixed proxy 绑定该 connection，
连接关闭后即不能继续使用。Ice runtime 的自动重试和 at-most-once 相关规则是成熟能力，
因此不能笼统说 Ice “没有重试”；其
[AMI cancellation](https://docs.zeroc.com/ice/3.8/cpp/asynchronous-method-invocation-ami-in-c#canceling-an-asynchronous-invocation)
又明确是纯本地操作，不能当作已定义的远端取消协议。

然而新 connection 不会凭 wire request ID 自动恢复旧 callback object、in-flight call
和已完成 terminal result，也没有本目标的 resume proof、fencing、terminal retention/
release contract。若在 Ice 之上新增稳定 session/call identity 与 ledger，已是新的恢复层。

**判定：** Ice 是强 RPC 系统，但不是当前任意 message Transport 上可小幅适配的默认
recovery wire。

### Cap'n Proto RPC：断线语义明确，persistent capability 不是 call recovery

[Cap'n Proto RPC protocol](https://capnproto.org/rpc.html) 是双向 distributed-object/
capability RPC，并提供 promise pipelining。其 “Handling disconnects” 明确规定：连接
丢失时，由该连接服务的 capability 全部 disconnected；后续调用抛出 disconnected
exception，client 必须建立新连接并自行重试。capability ID 也只对传递它的 connection
有意义。

同一文档的 Level 2 确实列出 persistent capability：应用可以实现 save/restore token，
在新 connection 恢复某些 capability。这是必须保留的限定证据，但它并非所有 capability
的默认行为，而且需要 host application 支持；规范没有据此恢复旧 connection 上的在途
question、去重已执行 call 或重放唯一 terminal result。

**判定：** persistent capability 不推翻既有结论；要满足目标仍需另建 call recovery
contract，而 Cap'n Proto 的 capability/pipelining surface 也明显超出 unary v1。

### Avro RPC 与 Thrift：跨语言 IDL/Codec，不是 session recovery

[Apache Avro 1.12.0 specification](https://avro.apache.org/docs/1.12.0/specification/)
定义 protocol/message schema、request/response/error 和 schema handshake。它明确把
request-response correspondence 留给 transport：多路复用 transport 自己需要 unique
identifier。stateful transport 的成功 handshake 也只在该 connection lifetime 内省略
后续 handshake。因此 Avro 的 “stateful” 是 schema negotiation cache，不是可跨
Physical Connection 的 Logical Session、call ACK/dedupe 或 terminal replay。

[Apache Thrift type system](https://thrift.apache.org/docs/types.html) 定义跨语言 service、
named functions、typed exceptions 与 oneway；
[第一方 binary protocol 文档（固定 revision `fe5641c7`）](https://github.com/apache/thrift/blob/fe5641c7fc2d3265370d4ecfd13bc6ad41963597/doc/specs/thrift-binary-protocol.md)
定义 RPC message encoding。Thrift 标准 surface 没有 session resume、cooperative cancel、
replay/dedupe 或 terminal ledger。sequence ID/transport behavior 也不足以承载本问题的
跨连接证明。

**判定：** Avro/Thrift 都可作为 schema、IDL 或 Codec 候选；即使采用其编码，仍需完整
新增 unary-recovery protocol，所以不会改变默认 wire 的决策。
