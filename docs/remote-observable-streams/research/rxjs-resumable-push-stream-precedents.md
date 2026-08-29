# RxJS 与可恢复推送流的订阅、流控和恢复先例

核验日期：2026-08-22

## 研究问题与边界

本报告核实远端输出 `Observable` 设计所依赖的外部事实：

- RxJS Observable 的 identity、interoperability、同步通知、取消、teardown、重入与多次订阅；
- 无 demand interface 的任意 push source 能诚实获得什么有界流控保证；
- Reactive Streams、RSocket 与 gRPC 对 credit/window、取消、retention、resume/replay 和 terminal 的成熟处理方式。

只记录先例与由先例直接推出的约束，不替后续决策选择项目方案。输入流和 duplex API 除了为解释
先例所必需的事实外不在范围内。

## 证据等级与版本固定

文中使用以下标记，避免把源码偶然行为写成跨版本契约：

- **公开语义**：RxJS/gRPC 官方 API 文档或语义指南承诺的用户可见行为；
- **规范要求**：使用 MUST/SHOULD/MAY 的 Reactive Streams 或 RSocket 正式协议要求；
- **实现观察**：固定版本源码当前如何实现；升级时必须重新核验；
- **推论**：由前述事实推出的约束，不冒充来源原文。

| 资料 | 本报告固定点 | 说明 |
| --- | --- | --- |
| RxJS | [`7.8.2`, commit `e5351d0`](https://github.com/ReactiveX/rxjs/tree/7.8.2) | 当前核验的 7.8.x patch；源码事实不外推到 RxJS 8 |
| Reactive Streams JVM | [`v1.0.4`](https://github.com/reactive-streams/reactive-streams-jvm/tree/v1.0.4) | 规范/TCK 最新 1.0.x release 在该 tag 明示为 1.0.4 |
| RSocket Protocol | [commit `0f6e555`](https://github.com/rsocket/rsocket/tree/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8) | 规范仓库未给本次所需文本独立的 1.0 tag，因此固定正文 commit |
| rsocket-java | [`1.1.5`, commit `6e725d6`](https://github.com/rsocket/rsocket-java/tree/1.1.5) | reference implementation；源码把 `CURRENT_VERSION` 编码为 `1.0` |
| gRPC | [flow-control guide](https://grpc.io/docs/guides/flow-control/)，grpc-java commit [`5fda0c7`](https://github.com/grpc/grpc-java/tree/5fda0c7c35a938b2b0be05cdbe168dcb0700d64a) | gRPC 各语言 API 不完全相同；Java 只作为官方、具体的实现/API 例证 |

RSocket 的 normative 结论均来自协议正文；rsocket-java 默认值和缓存算法只算实现观察。gRPC 的
通用页面明确说只有部分语言开放手动控制，因此不能把 Java API 当作所有语言的共同契约。

## 结论摘要：后续决策不能绕过的约束

1. **RxJS `Observable` 是 push + cancellation，不是 demand protocol。** `Observer` 只有
   `next/error/complete`，订阅返回值只有 `unsubscribe`；消费方没有逐项授信入口。
2. **同步是合法且常见的。** `subscribe()` 返回前可以发生任意个 `next` 和一个 terminal；teardown
   也可能在 `subscribe()` 返回前因同步 terminal 而执行。桥接状态机不能依赖“先拿到返回的
   `Subscription`，之后才会收到事件”。
3. **Observable 类型不决定 cold/hot 或多订阅共享方式。** 每次 `subscribe` 都有独立
   `Subscriber`/取消生命周期，但 producer 可以每次新建，也可以由多个订阅共享；远端属性必须另行
   定义这一语义。
4. **没有可反压的 producer 时，credit 只能约束 bridge 之后，不能使 producer 自动减速。** 若还要
   任意时长无损保序，则 surplus 只能进入缓存；有限缓存最终必须在阻塞、丢弃/合并、溢出失败或外部
   持久化之间有明确边界。不存在“只加网络窗口就获得任意 push source 的有限内存无损保证”。
5. **credit 与 retention 是两个预算。** Reactive Streams/RSocket 的 request-n 按 item/PAYLOAD
   计数；RSocket resume position 与 reference frame store 按 encoded bytes 计量。只设其中一个
   不能推出另一个有界。
6. **取消不是成功完成。** RxJS `unsubscribe` 不调用 `complete`；Reactive Streams 的 cancel
   允许传播延迟；RSocket `CANCEL` 与 `COMPLETE`/`ERROR` 是不同的 stream 终止路径。
7. **RSocket resume 是同一 retained session 的 wire-frame continuation。** 它依赖 token、双方
   frame position、连续 retained range 和 session state；可能被拒，且规范不承诺 application
   atomicity/transactionality。它既不是 RxJS 新订阅 replay，也不是 application-level exactly-once。
8. **gRPC transport flow control/readiness 不是严格 item credit。** 写入 API 返回不代表消息已经上网；
   Java `isReady()` 只是避免 excessive buffering 的提示，忽略它仍可继续写并造成缓存。

## RxJS 7.8.2：Observable 的公开语义与实现边界

### 1. Identity 与 interoperability

**公开语义 / 实现观察。** `Observable<T>` 实现的最小消费形状是 `Subscribable<T>`：
`subscribe(observer)` 返回 `Unsubscribable`；`Observer<T>` 则只有 `next`、`error`、`complete`，没有
`request(n)`、ack 或 ready 信号。RxJS 还把 `Observable`、`InteropObservable`、iterable、promise、
async iterable 和 readable-stream-like 都列入 `ObservableInput`。来源：
[7.8.2 `types.ts` 的 subscription/observable interfaces](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/types.ts#L76-L122)、
[Observer contract](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/types.ts#L185-L223)。

RxJS 实例的 observable interop method 返回实例自身；runtime key 优先使用 `Symbol.observable`，没有时
退到字符串 `@@observable`。因此 interop identity 的核心约定是“调用 interop method 得到可订阅对象”，
不是“所有来源都必须是同一个 RxJS constructor 的实例”。来源：
[`Observable[Symbol.observable]()`](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Observable.ts#L323-L334)、
[`observable` runtime key](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/symbol/observable.ts#L1-L7)。

`from` 的内部转换对**同一个 RxJS constructor** 的 `Observable` 直接返回原对象；其他
`Symbol.observable` compatible 对象则创建一个 RxJS wrapper，并在 wrapper 被订阅时调用来源的
interop method，再把 `Subscriber` 传给来源。于是：

- 同一份 RxJS dependency 内，`from(existingRxjsObservable) === existingRxjsObservable`；
- 跨 realm、重复安装或另一 Observable implementation 不能依赖 `instanceof` identity；即使可通过
  interop 订阅，`from(...)` 也可能返回 wrapper 而非原对象；
- “属性值是直接 RxJS `Observable` 实例”比“只是 subscribable/interop-compatible”更强，这两个承诺
  不能混写。

来源：[7.8.2 `innerFrom` 的 identity fast path 与 interop wrapper](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/observable/innerFrom.ts#L15-L56)。

**实现观察。** `isObservable` 也不能充当通用 interoperability/compliance 检查：7.8.2 只在值是
同一 `Observable` constructor 的实例，或同时具有函数形态的 `lift` 与 `subscribe` 时返回 true；它
不检查 observable interop key。于是一个可被 `from` 接受的纯 interop observable 仍可能返回 false，
而伪造 `lift + subscribe` shape 的对象可能返回 true。来源：
[7.8.2 `isObservable`](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/util/isObservable.ts#L5-L12)。

### 2. `subscribe`、`next`、`complete`、`error` 可以同步发生

**公开语义。** RxJS 明确不保证 subscribe callbacks 异步；Observable 自己决定时机，`of` 默认同步。
官方指南也演示 `subscribe` 从进入到多个值通知再返回可以完全处在同一 call stack。来源：
[`Observable.subscribe` API notes](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Observable.ts#L70-L114)、
[official observable guide 的同步示例](https://github.com/ReactiveX/rxjs/blob/7.8.2/docs_app/content/guide/observable.md#L152-L194)。

**实现观察。** `subscribe()` 当场创建 `SafeSubscriber`，直接调用 operator/source/initializer，最后才
返回该 subscriber-as-subscription；initializer 抛出的异常由 `_trySubscribe` 捕获并送进
`subscriber.error(err)`。所以以下事件都可能发生在 `subscribe()` 返回前：

- 任意个同步 `next`；
- 同步 `complete` 或 handled `error`；
- terminal 引发的 teardown；
- 返回一个已经 `closed === true` 的 `Subscription`。

来源：[7.8.2 `Observable.subscribe` / `_trySubscribe`](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Observable.ts#L204-L242)。

必须区分“Observable 发送的 error”和“observer callback 自己抛错”：

- producer 调用 `subscriber.error(x)` 时，已提供的 error handler 在当前调用链被直接调用；
- 没有 error handler，或 `next/error/complete` handler 自己抛错时，默认路径通过新 job 报告 unhandled
  error，以避免下游异常干扰 producer；废弃的同步错误模式默认关闭。

因此，默认模式下 observer 的 `next` handler 抛错不会被转换成 source `error`，也不会自动停止
subscription；同步 producer 仍可继续执行并尝试发送后续值，bridge 不能把 callback throw 当作已选定的
stream terminal。

来源：[7.8.2 `ConsumerObserver` 和 error dispatch](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Subscriber.ts#L148-L185)、
[`reportUnhandledError`](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/util/reportUnhandledError.ts#L4-L24)、
[`config` defaults](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/config.ts#L8-L14)。

### 3. Terminal grammar、teardown 与 unsubscribe

**公开语义。** 一次 execution 的 grammar 是 `next*(error|complete)?`：`error` 与 `complete` 互斥且
最多一次，任一 terminal 后不再交付 `next`。finalization 保证在 `error`、`complete` 或显式
unsubscription 上发生；显式取消不会调用 `complete` callback。来源：
[official Observable grammar](https://github.com/ReactiveX/rxjs/blob/7.8.2/docs_app/content/guide/observable.md#L324-L369)、
[glossary 的 finalization/terminal 语义](https://github.com/ReactiveX/rxjs/blob/7.8.2/docs_app/content/guide/glossary-and-semantics.md#L39-L69)、
[`subscribe` 关于 cancel≠complete 的说明](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Observable.ts#L103-L114)。

**实现观察。** `Subscriber.error/complete` 先把 `isStopped` 置为 true，再调用 destination；
`_error/_complete` 在 `finally` 中 `unsubscribe()`。因此 terminal callback 发生在该 subscriber 的
teardown 之前，但即使 callback 抛错也会 teardown；terminal callback 内的重入 `next` 不会重新交付。
来源：[7.8.2 `Subscriber` terminal implementation](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Subscriber.ts#L75-L130)。

`Subscription.unsubscribe()` 以 `closed` guard 保证重复调用不重复执行 finalizer，并依次执行初始
teardown 和已登记 finalizers；若向已经 closed 的 subscription 添加 teardown，会立即执行它。这一
细节解释了同步 `complete/error` 先关闭、initializer 随后才返回 teardown 时，teardown 仍会在
`subscribe()` 返回前被执行。来源：
[7.8.2 `Subscription.unsubscribe`](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Subscription.ts#L42-L96)、
[`Subscription.add`](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Subscription.ts#L98-L136)。

取消只关闭 RxJS subscription boundary 并运行 producer 提供的 teardown；任意外部 producer 是否真正
停工，取决于 teardown 能否取消它。官方创建指南因此要求 Observable 明确定义资源释放函数，而不是把
`unsubscribe` 描述成对所有外部工作的强制中断。来源：
[official disposal guide](https://github.com/ReactiveX/rxjs/blob/7.8.2/docs_app/content/guide/observable.md#L388-L428)。

### 4. 重入与同步取消

**实现观察。** 普通 `Subscriber.next` 在未 stopped 时直接调用 `destination.next`，没有通用队列或
non-reentrancy barrier。因此 observer 在 `next` 中同步触发同一来源的下一次通知时，可以形成嵌套调用；
桥接代码必须自行串行化共享状态，不能假设 RxJS 会把重入排到当前 callback 之后。来源：
[7.8.2 `Subscriber.next/_next`](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Subscriber.ts#L61-L73)、
[`_next` direct delegation](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Subscriber.ts#L112-L130)。

同步 source 若要在下游取消后及时停止自己的 loop，必须检查 `subscriber.closed`。RxJS 的 array-like
转换每轮都检查 closed；源码同时明确承认重入代码可修改正在遍历的 array。这个例子证明“Subscriber
会丢弃取消后的交付”和“producer 会立即停止生产”是两个不同层次。来源：
[7.8.2 `fromArrayLike`](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/observable/innerFrom.ts#L59-L81)。

### 5. 多次订阅、cold/hot 与 replay 不是类型自动决定的

**公开语义。** 对 `new Observable(subscribeFn)`，每次 `subscribe` 都执行一次 setup，并得到独立的
subscription execution；但官方 glossary 同时说明 producer 可以在 subscribe 内为每个订阅新建，也可以
在外部创建后被多个订阅共享。前者是 cold/unicast，后者通常是 hot/multicast。`Observable` 这个类型本身
不携带哪一种保证。来源：
[official guide 的 per-subscription setup](https://github.com/ReactiveX/rxjs/blob/7.8.2/docs_app/content/guide/observable.md#L306-L326)、
[producer、cold 与 hot 定义](https://github.com/ReactiveX/rxjs/blob/7.8.2/docs_app/content/guide/glossary-and-semantics.md#L15-L25)、
[cold/hot 语义](https://github.com/ReactiveX/rxjs/blob/7.8.2/docs_app/content/guide/glossary-and-semantics.md#L79-L93)。

`ReplaySubject` 是 RxJS 内成熟的“retained items → 新订阅 replay”先例，但不是网络 resume：

- 可按 item count 和 time window 裁剪；默认两者都是 `Infinity`，所以只有显式设置才有界；
- 新订阅按 FIFO **同步**收到 buffer copy；随后若 subject 已 terminal，再收到原 `complete` 或 `error`；
- retention 属于共享 subject 的 application items，不含 transport frame position、ack 或断线会话 token。

来源：[7.8.2 `ReplaySubject` public semantics/config](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/ReplaySubject.ts#L7-L56)、
[`ReplaySubject` replay/trim implementation](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/ReplaySubject.ts#L58-L109)。

## 无 demand interface 的 push source：有界保证的诚实上限

RxJS 官方语义把 Observable 明确定义为 push：producer 一有值便通过注册的 `next` handler 推给
consumer；consumer 不逐项索取。来源：
[RxJS glossary: Push](https://github.com/ReactiveX/rxjs/blob/7.8.2/docs_app/content/guide/glossary-and-semantics.md#L91-L97)。

相对地，Reactive Streams 把队列边界建立在显式 demand 上：在追加 request 前，最多还能到达
`requested - processed` 个 element；对于生产速率不可控制的时钟、鼠标等来源，Publisher 仍必须
通过 buffer 或 drop 才能服从该界。来源：
[Reactive Streams 1.0.4: Subscriber controlled queue bounds](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#subscriber-controlled-queue-bounds)。

由两者可严格推出以下约束（本节余下内容均为**推论**）：

设 producer 在某段时间产生 `P` 个 items，bridge/transport/consumer 同期最多接纳 `C` 个，且 producer
没有 pause/request/ack interface。若要求无损保序，则至少有 `P-C` 个 items 必须留在某处。只要
`P-C` 对速率差和持续时间没有上界，所需 retention 就没有有限上界。

因此，一个 bridge 可以诚实承诺的有限保证取决于它实际控制的边界：

| 可诚实承诺 | 单靠 transport credit 不能承诺 |
| --- | --- |
| wire 上未被 credit 授权的 item 不会发送 | 任意 RxJS producer 会因此减速或停止产生 |
| bridge 自己最多 retention `B` items/bytes | 在 `B` 满后仍对任意时长、任意速率无损 |
| overflow 时执行已声明的 drop/coalesce/error/cancel/spill policy | 不声明 overflow policy 却保证有限内存 |
| teardown 能取消的 producer 会在取消后停止其可取消工作 | 已发生的同步/外部工作会被回滚或强制中断 |

“阻塞 producer”也只有在 producer 的调用线程允许阻塞、不会形成事件循环/双向流控 deadlock，且
阻塞确实向上游传播时才成立；它不是 RxJS Observable contract 的组成部分。gRPC 官方 flow-control
页面也专门警告双方大量同步写而不读可能死锁。来源：
[gRPC flow-control warning](https://grpc.io/docs/guides/flow-control/#overview)。

这一定理不排斥有界实现；它要求把保证说完整：**credit unit、buffer unit/limit、overflow terminal、
producer 是否可反压、取消传播时机、断线 retention 期限**都必须可观察地定义。

## Reactive Streams 1.0.4：显式 demand 的规范先例

Reactive Streams 的目标就是让异步边界的队列可有界，避免接收方被迫缓存任意数量的数据；其 API
以 mandatory non-blocking backpressure 为前提。来源：
[Reactive Streams goals and scope](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#goals-design-and-scope)。

### 1. Item credit 与信号 grammar

**规范要求。** `Publisher` 对某个 subscriber 发出的累计 `onNext` 数量，在任何时刻都不得超过该
subscription 累计请求的数量；`request(n)` 是追加 credit。Publisher 可以少发并以 terminal 结束，
但不能多发。来源：
[Publisher rules 1.1–1.2](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#1-publisher-code)、
[Subscription rules 3.8–3.9](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#3-subscription-code)。

协议序列为：

```text
onSubscribe onNext* (onError | onComplete)?
```

四种 downstream signals 必须 serial（不重叠且有 happens-before）；terminal 后不得再有 signal，且
terminal 会使 subscription 被视为 cancelled。`onComplete`/`onError` 与 demand 无关，可以在没有
`request` 时到达。来源：
[API Components / signal sequence](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#api-components)、
[Publisher rules 1.3–1.7](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#1-publisher-code)、
[Subscriber rules 2.9–2.10](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#2-subscriber-code)。

该 credit 按 **element count** 而非 bytes 计量。规范要求支持累积到 `Long.MAX_VALUE`，达到该值可被
当作 effectively unbounded；因此“采用 Reactive Streams”也不自动意味着使用者一定选择有限 demand。
来源：
[queue bounds 的计量说明](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#subscriber-controlled-queue-bounds)、
[rule 3.17](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#3-subscription-code)。

`request(n)` 只许可 Publisher 发送未来的 elements；规范没有把它定义成 element 已被接收、observer 已
处理、状态已持久化或 application effect 已完成的 acknowledgement。把 demand 当作 delivery/processing
ACK 是超出该规范的推论。

### 2. Cancellation 与 in-flight race

**规范要求。** `cancel()` 必须 non-obstructing、thread-safe、idempotent；后续 request/cancel 是 NOP。
但 cancel 只要求 Publisher **最终**停止信号并最终丢掉 subscriber reference，不要求瞬时生效；此前
已经 request 的 element 仍可能在 cancel 后到达，subscriber 必须准备处理该 race。来源：
[Subscription rules 3.5–3.13](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#3-subscription-code)、
[Subscriber rule 2.8](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#2-subscriber-code)。

这比 RxJS 单进程 `Subscriber.closed` 的即时 notification gate 更适合作为网络取消先例：网络中的
`CANCEL` 发送、peer 观察和 producer 停止是分开的时刻，不能用本地取消返回推断远端已无 in-flight
数据或工作。

### 3. 同步 request 与重入

**规范要求。** `request(n)` 允许在 `onSubscribe/onNext` 内同步调用，也允许同步触发 `onNext` 或
terminal；同时实现必须限制 request↔onNext 的同步递归深度，规范建议深度 1，以避免栈溢出和信号重排。
来源：
[Subscription rules 3.2–3.3](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#3-subscription-code)、
[rules 3.10–3.11](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#3-subscription-code)。

因此显式 credit 并没有消除同步/重入风险；成熟规范反而把 reentrancy 和 bounded recursion 明文纳入
contract。

### 4. 多订阅与 retention 范围

**规范要求。** `subscribe` 可调用多次，但每次必须用不同 Subscriber；Publisher 是否支持多个
Subscriber、每次是 unicast 还是 multicast，由实现决定。Reactive Streams 只规定活跃
Publisher–Subscriber pair 的 demand/terminal/cancel，不规定 late-subscriber replay、断线 frame
retention 或 session resume。来源：
[Publisher rules 1.10–1.11](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md#1-publisher-code)。

所以 Reactive Streams 是“有界 live delivery”先例，不是“恢复/重放”先例；后者需要额外协议状态。

## RSocket 1.0：跨网络 item credit、取消与 retained-frame resume

RSocket 明确把自己定义为跨异步二进制网络边界提供 Reactive Streams semantics 的 application
protocol。rsocket-java 1.1.5 的 `SetupFrameCodec.CURRENT_VERSION` 编码为 major 1、minor 0，因此下述
reference implementation 观察确实针对 wire protocol 1.0。来源：
[RSocket Protocol introduction](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#introduction)、
[rsocket-java 1.1.5 `SetupFrameCodec`](https://github.com/rsocket/rsocket-java/blob/1.1.5/rsocket-core/src/main/java/io/rsocket/frame/SetupFrameCodec.java#L11-L25)。

### 1. Per-stream `REQUEST_N` credit

**规范要求。** `REQUEST_STREAM` 自带一个必须大于 0 的 31-bit Initial Request N；之后的
`REQUEST_N` frame 追加 31-bit credit。credit 按可发送的 application `PAYLOAD` 数计数、不可撤回；
耗尽后 responder 必须等待新的 `REQUEST_N`。RSocket 因 wire field 只有 31 bits，不照搬 Reactive
Streams 的 `Long.MAX_VALUE` magic value。来源：
[REQUEST_STREAM frame](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#frame-request-stream)、
[REQUEST_N frame](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#frame-request-n)、
[Reactive Streams flow-control section](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#flow-control-reactive-streams)。

fragmentation 不改变 item credit：一个 application PAYLOAD 即使拆成多帧仍只消耗一个 request-n；
反过来，一个 item 可能占任意多 bytes，所以 item credit 不是 byte-memory bound。来源：
[fragmentation 的 request(n) accounting](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#fragmentation-and-reassembly)。

RSocket 还有独立的 LEASE：在 TTL 内限制 requester 可新建的 request/stream 数。它是 admission/load
control，不取代某条 stream 上的 `REQUEST_N` item flow control。来源：
[Lease semantics](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#flow-control-lease)。

### 2. `PAYLOAD` terminal 与 `CANCEL`

**规范要求。** `PAYLOAD` 的 N/C bits 把 `next`、`complete` 以及“最后一个 next 后立即 complete”编码
出来；N+C 可共用一帧。error 使用独立 ERROR frame。对 request-stream，合法路径是零或多个 PAYLOAD，
然后 ERROR、COMPLETE 或 requester CANCEL 三者之一；发送/收到这些终止事件后，对应一侧 stream
terminated。来源：
[PAYLOAD flags](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#frame-payload)、
[Request Stream sequences and lifetime](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#stream-sequences-request-stream)。

`CANCEL` 是无 payload 的独立 frame；协议把“发送 CANCEL 后 requester terminal”和“收到 CANCEL 后
responder terminal”分开描述。terminated stream ID 可被双方遗忘但不得复用。来源：
[CANCEL frame](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#frame-cancel)、
[stream lifetime rule](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#stream-sequences-and-lifetimes)。

这是一个重要边界：cancel 是终止 stream state 的控制事件，不会伪造成正常 completion，也没有
“取消后补发 complete”步骤。

### 3. Resume position 与 retained-frame window

**规范要求。** Resume 完全可选且 optimistic，默认应假定不支持/可能失败。它只为 transport
connectivity loss 设计，并假定 client/server state 在断线期间仍被保留；规范明确不对已交付 frame
对应的 application atomicity、transactionality 或 state 作任何保证。来源：
[Resuming Operation assumptions](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#resuming-operation)。

双方为 REQUEST、REQUEST_N、CANCEL、ERROR、PAYLOAD 等 resumable frames 维护方向独立的 64-bit
**byte position**；position 按 fragmentation 后、去掉 frame-length field 的 encoded frame length
累加，而不是 item sequence number。client 发 RESUME 时携带：

- 自己最后收到的 server position；
- 自己仍保留的最早 client frame position；
- 原 SETUP 使用的 resume identification token。

server 只有在双方所需的 frames 都仍位于 retained range 内时才能接受，并用 RESUME_OK 返回其最后
收到的 client position；随后规范只允许（`MAY`）双方从相应 position 重传 retained resumable
frames，并不无条件要求重传。来源：
[Implied Position](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#implied-position)、
[Resume Operation handshake](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#resume-operation)、
[RESUME/RESUME_OK fields](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#frame-resume)。

KEEPALIVE 中的 peer implied position 可以用来裁剪 retransmit buffer；server 还必须把 client session
lifetime 延长到允许 resume 的期限，但具体存活策略由实现决定。来源：
[Client Lifetime Management](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#client-lifetime-management)、
[Keepalive Position Field](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#keepalive-position-field)。

因为 retained set 包含 REQUEST_N、CANCEL、ERROR、PAYLOAD，成功 resume 后**可重传的对象**是维持同一
wire session 连续性所需的 data 和控制帧，其中也包括 terminal/cancel state。这与只缓存 application
values 的 `ReplaySubject` 有本质区别；但 acceptance、retention 和 retransmission 都有条件，不能据此
宣称 RSocket 无条件保证 terminal replay 或 exactly-once observer delivery。

### 4. rsocket-java 的有限 retention 实现观察

**实现观察（1.1.5）。** `ResumableFramesStore` 的抽象直接暴露保存 frames、按 remote implied
position 释放、从 tail 到 head 产生连续 resume stream、查询 local/implied position；若 frames 不
连续，resume stream 应 error。来源：
[`ResumableFramesStore`](https://github.com/rsocket/rsocket-java/blob/1.1.5/rsocket-core/src/main/java/io/rsocket/resume/ResumableFramesStore.java#L24-L56)。

默认 `Resume` 配置显示成熟实现把恢复能力明确预算化：

- session reconnect window 默认 2 分钟；
- frame store 默认内存缓存 100,000 bytes；满时逐步逐出最老 frames；
- reconnect 后 resume stream 的逐帧 timeout 默认 10 秒；
- store factory、期限、retry 均可替换配置。

来源：[rsocket-java 1.1.5 `Resume`](https://github.com/rsocket/rsocket-java/blob/1.1.5/rsocket-core/src/main/java/io/rsocket/core/Resume.java#L30-L114)、
[default store factory](https://github.com/rsocket/rsocket-java/blob/1.1.5/rsocket-core/src/main/java/io/rsocket/core/Resume.java#L150-L168)。

`InMemoryResumableFramesStore` 在新 frame 超过剩余 cache bytes 时从最老 frame 开始逐出；若单帧本身
无法存入，仍发送它但推进 first-available position，使将来无法越过这个洞恢复。收到 peer position 后
则释放已确认 prefix；position 与 frame boundary 不一致会 terminal error。来源：
[cache limit/eviction implementation](https://github.com/rsocket/rsocket-java/blob/1.1.5/rsocket-core/src/main/java/io/rsocket/resume/InMemoryResumableFramesStore.java#L431-L472)、
[release/mismatch checks](https://github.com/rsocket/rsocket-java/blob/1.1.5/rsocket-core/src/main/java/io/rsocket/resume/InMemoryResumableFramesStore.java#L138-L235)。

server reference implementation 仅在 peer earliest-retained position 不晚于 local received position，
且 peer last-received position 不早于 local earliest-retained position 时接受 resume；session expired、
position mismatch 或 store failure 都发送 REJECTED_RESUME 并终止该 session。来源：
[rsocket-java `ServerRSocketSession.doResume`](https://github.com/rsocket/rsocket-java/blob/1.1.5/rsocket-core/src/main/java/io/rsocket/resume/ServerRSocketSession.java#L131-L228)。

这些实现观察验证了规范的资源边界：恢复是有限 byte window × 有限 time window 的能力；window 外是
明确 rejection，不是悄悄新建 stream，也不是承诺无限 retention。

## gRPC：transport window、manual receive credit 与 readiness hint

### 1. 通用 flow-control 契约

**公开语义。** gRPC 的 flow control 用于 streaming RPC，依赖 underlying transport 判断何时可继续
发送；receiver 读取后返回 capacity acknowledgement。框架可能让 write 等待，但 application 把值交给
write 并不表示该值已经发到网络，它可能仍在 framework/OS buffer 中。来源：
[gRPC official Flow Control guide](https://grpc.io/docs/guides/flow-control/#overview)。

该页面同时限定“只有部分语言允许显式手动控制”，所以不能从 gRPC 这个名字推出统一的 item-demand
API、统一 write blocking 或统一内存上界。它提供的成熟先例是 transport-sensitive byte/window
pushback，而非所有语言共同的 Reactive Streams `request(n)`。

### 2. grpc-java 的具体 API 例证

**公开 API / 固定 commit。** Java `CallStreamObserver` 把 inbound 和 outbound 分开：

- inbound 默认在 application `onNext` 返回后自动把 token 归还 peer；关闭 auto flow control 后，
  application 必须显式 `request(count)` 才会继续收到 messages；
- outbound `isReady()` 只表示继续写“不需 excessive internal buffering”，文档明确称它是 suggestion，
  application 可忽略，但会导致 excessive buffering；
- `onReady` notification 可能因并发写而变成 spurious，handler 必须重新检查当前 `isReady()`；
- outbound observers 不保证 thread-safe，多线程写要由 application 串行化。

来源：
[`CallStreamObserver` readiness/manual-flow contract](https://github.com/grpc/grpc-java/blob/5fda0c7c35a938b2b0be05cdbe168dcb0700d64a/stub/src/main/java/io/grpc/stub/CallStreamObserver.java#L21-L126)。

server 可给 `isReady()` 设置 byte threshold，但实现可以忽略；这再次说明 readiness threshold 不是
normative hard buffer cap。来源：
[`ServerCallStreamObserver.setOnReadyThreshold`](https://github.com/grpc/grpc-java/blob/5fda0c7c35a938b2b0be05cdbe168dcb0700d64a/stub/src/main/java/io/grpc/stub/ServerCallStreamObserver.java#L69-L82)。

`StreamObserver` API 是异步的，method 可以在 operation 完成前返回，对完成速度没有保证；官方因此
建议 streaming RPC 使用上述 flow-control API 避免 excessive buffering。来源：
[`StreamObserver` async/buffering notes](https://github.com/grpc/grpc-java/blob/5fda0c7c35a938b2b0be05cdbe168dcb0700d64a/stub/src/main/java/io/grpc/stub/StreamObserver.java#L19-L44)。

因此，gRPC readiness 能成为“bridge 何时继续 drain 已有 queue”的信号，却不能单独成为任意 RxJS
push producer 的 demand：若 producer 不理会 readiness，bridge 仍需缓存或执行 overflow policy。

### 3. Cancellation 与 terminal 观察边界

**公开 API / 固定 commit。** grpc-java 的 `StreamObserver` 保证 `onError`/`onCompleted` 各最多一次并
且是最后一次；`onNext` 不会在 terminal 后调用。来源：
[`StreamObserver` notification contract](https://github.com/grpc/grpc-java/blob/5fda0c7c35a938b2b0be05cdbe168dcb0700d64a/stub/src/main/java/io/grpc/stub/StreamObserver.java#L45-L88)。

client cancel 会阻止继续接收并通知 server，但 server 可能仍不停止处理。server 的 cancellation
handler 把 timeout、显式 cancel、network error 都归入“鼓励停止工作”的信号；clean server close
也不证明 client 已收到全部 messages，因为仍有 network delay、client crash 和 cancellation race。
来源：
[`ClientCallStreamObserver.cancel`](https://github.com/grpc/grpc-java/blob/5fda0c7c35a938b2b0be05cdbe168dcb0700d64a/stub/src/main/java/io/grpc/stub/ClientCallStreamObserver.java#L21-L48)、
[`ServerCallStreamObserver` cancel/close notes](https://github.com/grpc/grpc-java/blob/5fda0c7c35a938b2b0be05cdbe168dcb0700d64a/stub/src/main/java/io/grpc/stub/ServerCallStreamObserver.java#L34-L67)、
[`setOnCloseHandler`](https://github.com/grpc/grpc-java/blob/5fda0c7c35a938b2b0be05cdbe168dcb0700d64a/stub/src/main/java/io/grpc/stub/ServerCallStreamObserver.java#L168-L189)。

本次核验的 gRPC flow-control contract 没有定义 retained-frame resume/replay。这个资料可以支持
window/readiness/cancel 的比较，但不能作为透明恢复语义的证据；恢复先例应取 RSocket 的 session +
position + retained range。

gRPC 官方 retry 也不是在途 stream resume：retry 会创建新的 call attempt 并重放保存的 call history，
收到 response headers 后该 RPC 即 committed，不再由 retry engine 重试。它不能证明一个已开始输出的
stream 保留原订阅或从中间 item 继续。来源：
[gRPC official Retry guide](https://grpc.io/docs/guides/retry/#how-grpc-client-retry-works)。

## 横向对照

| 维度 | RxJS 7.8.2 | Reactive Streams 1.0.4 | RSocket 1.0 | gRPC 通用 / grpc-java 例证 |
| --- | --- | --- | --- | --- |
| live flow-control interface | 无 demand；push + unsubscribe | `request(n)` mandatory | Initial Request N + cumulative `REQUEST_N` | transport window；部分语言 manual request/readiness |
| credit 单位 | 无 | elements | application PAYLOAD items | transport bytes；Java manual inbound count 是 messages |
| hard “不得多发” | 无 | `onNext ≤ requested` | responder 必须服从 credit | 通用 transport capacity；Java `isReady` 只是 hint |
| producer 不可控时 | RxJS 不提供上游减速机制 | buffer 或 drop 仍须服从 demand | protocol 只限制 wire sender，application adapter 仍需 policy | writer 等待/缓存取决语言 API；source 仍需适配 |
| cancellation | 本地立即 gate；teardown；不 complete | eventual stop；pending requested items 仍可能到达 | 独立 CANCEL frame，发送/收到分别终止 stream side | 通知 peer；server 可能未停止；存在 race |
| terminal | `error` xor `complete`，随后 teardown | `onError` xor `onComplete`，不依赖 demand | C/N PAYLOAD、ERROR，与 CANCEL 分离 | `onError` xor `onCompleted`；RPC cancellation/status 分离 |
| 多订阅 | cold/hot/shared 由 source 决定 | Publisher 决定 unicast/multicast | 每个 Stream ID 是一条 interaction lifetime | 每个 RPC stream 自有 lifecycle |
| retained data | `ReplaySubject` 可按 items/time；默认无限 | 未规定 | resumable frames 按 encoded-byte position 保留 | flow-control contract 未规定 resume retention |
| replay 对象 | 新 subscriber 收 application items + 已存 terminal | 未规定 | 同一 session 重传 data/control/terminal frames | 本次资料不提供该保证 |
| resume 失败边界 | 无协议 | 无协议 | optional；expired/gap/mismatch → reject/terminate | flow-control contract 未定义 |

## 对后续 tickets 的 decision-relevant constraints

以下是研究结论形成的约束清单，不是本报告替项目作出的选择：

1. **Public identity 必须说清层级。** “直接 RxJS `Observable` 实例”“可被 RxJS `from` 转换”“仅有
   `subscribe` shape”是三个不同承诺；跨重复 dependency 不能假定 constructor identity。
2. **必须定义每次 property subscription 的 ownership。** 新 remote execution、共享 live execution、
   late replay、还是拒绝第二订阅，不能从 `Observable` 类型自动得出。
3. **必须按同步 notification 设计。** `next/terminal/teardown` 都可能早于 `subscribe` 返回；状态登记、
   cancel handle、terminal cleanup 必须承受这一顺序与重入。
4. **若 public API 保持纯 RxJS Observable，就不能对 consumer 暴露 Reactive Streams 式 demand 而仍称
   它是原生 Observable contract。** 内部可以有 credit，但必须由 adapter 决定何时授信。
5. **任何“bounded/backpressure”声明必须限定边界。** 至少写明 producer 是否可停、item/byte limit、
   credit algorithm、overflow policy、最大 retained time，以及这只是 bridge/wire bound 还是端到端 bound。
6. **item credit 与 byte retention 要独立预算。** 小 credit 仍可能遇到超大 item；大批小 frames 也会
   消耗 resume store。fragment accounting 和 serialization size 都影响真实内存界。
7. **cancel、complete、error 必须是不同 terminal cause。** RxJS unsubscribe 不应凭空映射成 successful
   complete；网络 cancel 也不能证明 peer 已即时停工或没有 in-flight item。
8. **恢复 identity 必须绑定同一 session incarnation 和连续 range。** token/cursor、earliest-retained、
   last-received、expiry/mismatch rejection 都是成熟先例中的必要组成，而非一个孤立 `lastItemId`。
9. **必须区分三种 replay：** RxJS late-subscriber item replay、wire-frame retransmission、application
   outcome/dedupe replay。RSocket 只直接先例化第二种，不能用它推导第三种 exactly-once。
10. **terminal frame 也属于 resume continuity。** 若 data 已发但 complete/error/cancel 在断线处丢失，
    retained control/terminal state 决定恢复后 Observable 是否会永久 pending；不能只保留 values。
11. **恢复能力必须有明确拒绝路径。** 有限 buffer 或有限 session TTL 意味着 window 外一定存在；成熟
    先例是 reject/terminate，而不是静默当作 fresh subscription 继续。
12. **readiness signal 不是 memory proof。** 类似 grpc-java `isReady` 的提示只有在唯一 writer 遵守、
    并且所有上游 backlog 也被计入时，才能参与一个完整的有界保证。

## 尚存不确定性与不应外推之处

- RxJS 8 正在改变若干 deprecated surfaces；本报告只验证 7.8.2。`Symbol.observable` 的宿主/polyfill
  状态也会影响 cross-copy interop key，不能只靠类型声明推断运行时环境。
- RxJS 官方指南有时用“plain Observable 通常 unicast”作教学简化；glossary 和源码允许 initializer
  连接共享 producer。因此本报告采用较弱、可证明的结论：每次 subscribe 有独立 Subscriber/lifecycle，
  producer ownership 仍由 source 决定。
- RSocket Protocol 正文固定在 commit `0f6e555`；规范仓库未为该正文提供本报告可直接引用的独立
  `1.0` tag。reference implementation 1.1.5 的 wire constant 是 1.0，但它的默认 cache/timeout 是
  library policy，不是 protocol MUST。
- RSocket resume position 保证 frame-range 协商与可重传性；规范明确排除 application atomicity。
  本报告不把成功 frame replay 表述为 application exactly-once，也不推断 subscriber callback 在 crash
  边界恰好一次。
- gRPC 各语言 blocking、buffering 和 manual flow-control API 不同。本报告只把通用官网行为作为共同
  事实，把 grpc-java 固定 commit 当作具体先例，不推广成所有 gRPC runtime 的 normative contract。
