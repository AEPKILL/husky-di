# 调研默认 RPC Protocol 候选

Type: research
Status: resolved
Blocked by:
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

根据官方规范、第一方文档和参考实现，现有开放 RPC Protocol 中哪些能够直接复用或小幅适配，以满足任意有序全双工 Transport 上的对称 unary 调用、取消、结构化错误、版本协商、跨语言 wire contract、Logical Session Recovery、call replay 与去重？比较候选的语义缺口与扩展成本，并回答默认 Protocol 应复用、扩展现有标准还是定义专用 wire contract；不要用二手综述替代一手来源。

## Answer

默认 Protocol 应定义一份专用的 unary-recovery wire contract。没有现有开放 RPC
Protocol 能直接满足本地图要求；当前 Destination 也没有通用 RSocket 或 AMQP
interoperability 目标，因此为复用其 wire 而继承非目标语义没有足够收益。

完整一手资料见
[`default-rpc-protocol-candidates.md`](../research/default-rpc-protocol-candidates.md)。

### 候选边界

- RSocket 1.0 是完整 RPC/application protocol 中最接近的候选：它原生提供双向
  request-response、`CANCEL`、`ERROR`、SETUP 版本字段、resume token、双向 implied
  positions 和 retained-frame retransmission。但 resumption 是 optional、optimistic、
  只能由 connection client 发起，恢复后重传也只是 `MAY`；implied position 是
  transport-level 累计位置，不是 handler accepted/started、terminal recorded/delivered
  或 retained state released 的 call-level 证据。规范还明确不保证 application state
  atomicity。
- RSocket 的取消语义也不能直接采用：requester 发出 `CANCEL` 后立即终止 stream，
  responder 收到后通常不再回复，无法让双方收敛到本地图要求的、可 replay 的唯一
  terminal outcome。Service/method、Codec、结构化 error details、resume proof、call
  ledger、terminal replay、retention 与资源上限仍必须由 Husky DI profile 定义。
- RSocket 官网把四种 interaction models、Request-N、fragmentation、keepalive 等列为
  mandatory core；只实现 unary + 自定义 recovery 不能宣称完整 RSocket conformance。
  `rsocket-js` 虽有 Node/browser Transport 与 resumable Transport，第一方源码又明确其
  resumable implementation 不能与 1.0 server 互操作，不能据此假设现成交叉语言恢复。
- AMQP 1.0 + Link Pairing 能把两个反向 Link 组成双向 request-response message
  transport，并用 termini、unsettled delivery、delivery-tag、disposition 与 settlement
  跨 Connection 恢复交付状态；这是重要近邻。但 request 和 response 仍是两次独立
  delivery，它没有统一的 RPC method、远端取消、response/error union、重复 request 的
  terminal replay，或 request settlement 与 result retention 的联合 call ledger；完整
  AMQP Connection/Session/Link/flow-control stack 对当前 Transport seam 也过重。
- JSON-RPC/LSP 只有 envelope、结构化 error、取消与 capability 模式可借鉴，没有跨连接
  Session、ACK、去重或 replay；Ice 与 Cap'n Proto 的双向状态绑定 Physical Connection；
  gRPC 绑定 HTTP/2 client-initiated call 且没有 duplicate suppression；WAMP 依赖
  Client-Router/Dealer 拓扑且 Transport 关闭会终止 Basic Session。Avro 与 Thrift 也不
  改变结论。

### 采用路线

专用 wire contract 可以借鉴 RSocket 的 implied-position 思路、AMQP 的
settlement/retention 分层和 LSP 的取消规则，但决定性语义必须由默认 Protocol 自己规范：

- call-level identity、ACK、dedupe 与 in-progress/terminal ledger；
- 取消与正常 result/error 收敛到一个可 replay terminal outcome 的状态机；
- Session incarnation、resume proof、单一 owner/fencing 与恢复拒绝；
- terminal payload、轻量 dedupe evidence、replay buffer 和 pending call 的有界保留。

若未来把通用 RSocket interoperability 加入产品目标，应作为新的 effort 评估
“RSocket wire + Husky DI profile”。公开 Protocol seam 已允许注入这种实现；当前默认
Protocol 不为未提出的 interoperability 承担完整 RSocket/AMQP 复杂度。
