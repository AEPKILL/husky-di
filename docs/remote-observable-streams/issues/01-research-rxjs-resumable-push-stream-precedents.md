# 调研 RxJS 与可恢复推送流的订阅、流控和恢复先例

Type: research
Status: resolved
Blocked by:
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

基于 RxJS 7.8.x 官方文档与源码、Reactive Streams 规范、RSocket 1.0 规范/参考实现以及 gRPC 官方 flow-control 文档，核实本地图依赖的外部事实：Observable identity 与 interoperability、同步 subscribe/next/complete/error、unsubscribe/teardown/reentrancy、多次订阅；push source 在无 demand Interface 时能够诚实获得的有界流控保证；credit/window、取消、retained frame/item、resume/replay 与 terminal 的成熟先例。只记录一手来源支持的事实和约束，不替后续 tickets 选择项目方案；当前产品范围只有远端输出流与直接 Observable 属性，不研究输入流或 duplex Interface。

## Answer

一手来源给出的共同边界是：**RxJS Observable 只提供 push notification 与 cancellation，不提供
demand、capacity 或 acknowledgement；成熟网络协议会把 live credit、receipt/replay evidence 与
retention budget 分开建模，而且没有任何先例能单独保证“任意不可反压 push source + 有限内存 +
任意时长无损 + 无条件恢复”。**

完整事实、固定版本与逐项引用见
[`rxjs-resumable-push-stream-precedents.md`](../research/rxjs-resumable-push-stream-precedents.md)。原始研究
上下文保存在 `research/remote-observable-stream-precedents` 的 commit
`725f5a5c29db392526e289ccf82c4e2e176d048b`；主工作区报告另经独立规范与 RxJS 7.8.2 源码审计补强。

### RxJS 7.8.2 的边界

- `subscribe()`、任意个 `next`、一个 `error|complete` 以及由 terminal 触发的 teardown 都可能在
  `subscribe()` 返回前同步发生；普通 `next` 没有通用 non-reentrancy barrier。
- `unsubscribe()` 关闭本地 notification boundary 并运行已提供的 teardown，但不调用 `complete`，
  也不能证明任意外部 producer 已停止或已有工作被回滚。
- 每次 subscription 有独立 Subscriber/取消生命周期；Observable 名义类型本身不决定 producer 是
  cold、hot、shared 或 replaying。plain `new Observable(setup)` 通常每次运行 setup，Subject、shared
  producer 与 `ReplaySubject` 则是明确反例。
- Observable interop method、同一 RxJS constructor 的 identity 与 `subscribe` shape 是不同层级。
  `from` 可以包装 interop object；`isObservable` 又不检查 interop key，所以两者都不能被误写成通用
  identity/compliance proof。
- 默认模式下 observer callback throw 走 unhandled-error 报告，不自动成为 source error 或停止同步
  producer；observer delivery failure 与 source terminal 必须分层。

### 有界流控能够诚实承诺的上限

若某段时间 producer 产生 `P` 项，而 bridge/consumer 只能接纳 `C` 项，且 producer 没有 pause/demand
Interface，无损保序就至少需要保留 `P-C` 项。只要速率差和持续时间无上界，retention 也没有有限上界。
因此内部 credit 可以限制 bridge 之后何时上 wire，并把 bridge retention 限到显式 items/bytes；它不能
让任意 RxJS producer 自动减速。容量耗尽后必须由后续决策明确选择阻塞、drop/coalesce、overflow
terminal 或外部存储边界，不能同时宣称有限内存且静默无限吸收。

### 成熟先例实际证明的事实

- Reactive Streams 的 `request(n)` 是 element-count 发送许可：`onNext` 不得超过累计 demand，terminal
  不依赖 demand，cancel 只要求最终停止且仍有 in-flight race。它不是 receipt、processing、durability
  或 application-effect ACK，也没有规定 session resume。
- RSocket 用独立的 per-stream item credit 与 encoded-frame byte position。Resume 依赖原 token、双方
  positions、连续 retained range 与 session lifetime，可能被拒；成功后重传在规范中仍是 `MAY`。
  retained set 可含 PAYLOAD、REQUEST_N、CANCEL、ERROR 等 data/control/terminal frames，但规范明确
  不保证 application atomicity、terminal 必然重放或 exactly-once observer delivery。
- gRPC flow control/readiness 只能作为 transport-sensitive capacity 先例。write 返回不证明消息已上网或
  被对端消费；grpc-java `isReady()` 是避免 excessive buffering 的 hint，不是 hard item credit。
  gRPC retry 创建新 attempt 并 replay call history，也不是在同一 stream 中点恢复。

因此后续 tickets 必须分别回答 Observable member identity/ownership、同步与重入 admission、item credit、
item/byte retention、overflow terminal、cancel race、receipt ACK、terminal retention、resume refusal 与
application-level delivery claim；不能让其中任一层的信号冒充另一层的证明。本研究不替这些 tickets
选择具体 policy 或 wire grammar。
