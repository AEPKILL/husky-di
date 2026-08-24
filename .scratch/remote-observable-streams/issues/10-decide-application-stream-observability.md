# 决定 Application Stream 的公开观测与 telemetry

Type: grilling
Status: resolved
Blocked by: 02, 05, 09
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

重写现有“任何 public Observable 订阅都不拥有资源”的过宽不变量，逐项区分 resource-owning remote service Observable 与 resource-neutral state$/peers$/event$/connection$/message$ observations。决定现有 call-started/call-finished 是扩展为每个远程订阅的 started/finished，还是需要更精确但仍小的 closed event shape；覆盖 method/property、complete、source error、unknown-member rejection、unsubscribe/cancel、Recovery、overflow、payload-free Source Teardown Incident、force 与 ordering。继承 05 已固定的 `completed | handler-failed | canceled | terminated` outcomes 和 06 将固定的 overflow outcome/code，只决定它们在 duration/count/error code 与最小安全 event discriminants 中的公开投影，不重新定义 terminal semantics；若 Source Teardown Incident 获得公共投影，它只能折入该订阅唯一 matching finished observation，不能产生第三个 lifecycle event。公共 telemetry 必须 bounded、payload-free、无逐 item 事件、无 raw Error 或 wire/session/subscription identity。

## Answer

本决议把公开Observable分为两类，分类只取决于它从哪个Interface与seam获得，不取决于`$`后缀、hot/cold或runtime Observable形状。Remote Observable的每次`subscribe()`是resource-owning Application Stream的Caller Stream Subscription lifecycle root；`state$`/`peers$`/`event$`与Transport `connection$`/`message$`则是non-owning Observation Streams，其subscriber只拥有本地callback registration，零个、一个或多个subscriber均不启动、停止或维持被观察资源。因此Descriptor中`stream-property`的`remote.message$`是owning Remote Observable，而`IRpcConnection.message$`仍只是Transport observation。Caller Stream Subscription控制其local observation与cancel-intent lifecycle；Framework拥有admitted remote stream state、Protocol evidence、Source Subscription及其one-shot teardown attempt；application仍拥有Observable背后producer的资源与lifetime，Framework teardown不证明该producer已停止。

### 独立的side-local Application Stream observation

- 保留现有`call-started`/`call-finished`，在同一closed、owner-scoped `RpcEvent`中新增`stream-started`/`stream-finished`。Application Stream不是Logical Call，不引入`operation-started`/`operation-finished`泛化Interface、Remote Observable专属`event$`或Protocol-specific public telemetry seam。
- 一个Application Stream Observation是一侧Framework对一次qualifying stream attempt发出的payload-free started/finished pair。Subscriber Side与Source Side各自使用local-only `observationId`；两侧id不相等、不上wire互换，不是Stream Identity、correlation authority或remote-stop proof。
- Framework对每个qualifying side-local observation恰好emit一个started和一个matching finished。`event$`仍是hot、multicast、non-replaying且never-error；一个具体event subscriber可因订阅时间或自己unsubscribe看到0、1或2个observation，Framework pairing不是每subscriber的transcript保证。
- Stream method call只创建Remote Observable，stream property access只返回已有facade member；二者均保持state-neutral且不发started。Method与property在真正subscribe后进入同一lifecycle，事件不重复投影`stream-method | stream-property`的member kind。

### Pair建立与finished authority

- Outgoing `stream-started`与Local Stream Subscription Admission同一线性化点commit，并在任何Outgoing Stream Admission/Transport `send()` effect前flush。State/argument/value/capacity preflight失败都发生在Local Admission前，经Observable error channel收敛但不产生pair。
- Known incoming `stream-started`在Remote Stream Admission后commit，必须在Source Start Job dispatch、method/getter/source acquisition或`subscribe()` effect前flush。Remote Stream Semantic Rejection在safe retained terminal提交后发紧邻started/finished pair；Remote Stream Resource Rejection因从未建立Source observation而无incoming pair，已存在的Subscriber pair则以`failed(unavailable)`结束。
- `stream-finished`表达side-local lifecycle observation已结束，不表示全局Stream Terminal、Source Subscription或Protocol evidence已收敛。同一侧的unsubscribe、authoritative terminal disposition与force projection以第一个完成local finish/outcome commit者为winner。
- 首次caller unsubscribe若先于其他local finish commit，立即、幂等地选择唯一outgoing `canceled` finished。Outgoing Admission前它撤回identity-free Pending、不生成wire cancel且保证Definite Non-Execution；Admission后它只提交cooperative cancel intent，`canceled`只声明本地observation结束，不证明Source-Side cancel获胜、remote work已停止或teardown已完成。Late terminal只做suppression、receipt/ACK、capacity与evidence convergence，不发第二个finished。
- 若Subscriber Side已先commit authoritative terminal outcome与count，该commit就是first-winner线性化点：随后flush唯一`stream-finished`，最后才运行Observer `complete()`/`error()` effect。Commit到Observer effect之间的reentrant unsubscribe只能把terminal notification改为suppressed，不改winner、不发`canceled`、不生cancel intent。
- Source Side以Stream Terminal commit选择自己的finished outcome和duration cutoff，立即fence source并让terminal/wire progress继续，不等Source Teardown。Source `stream-finished`会等本地one-shot teardown attempt返回或抛出后才flush，从而可把唯一Source Teardown Incident折入该finished；这个等待不延迟terminal authority、terminal evidence或wire progress。

### Closed event shape

`RpcEventTypeEnum`新增`streamStarted = "stream-started"`与`streamFinished = "stream-finished"`。现有call/stream observation共用一个中性`RpcEventDirectionEnum { incoming, outgoing }`，旧`RpcCallDirectionEnum`随未发布`/1`草案原地替换。Call metadata也与统一Descriptor namespace对齐为`service`/`member`，`unknown-method`原地替换为`unknown-member`；call与stream仍使用独立event discriminants和outcome unions。

Stream observation common metadata只有：

```text
type
observationId
peer
direction
service/member (only where locally canonical and safe)
```

- Outgoing与known incoming含exact-matched canonical `service` + `member`。Incoming unknown-service同时省略两者；incoming unknown-member或member-kind mismatch只保留exact-matched canonical `service`，不回显attacker spelling、member存在性或actual kind。
- Finished额外含closed `RpcStreamStatusEnum` outcome、`durationMs`及恰好一个按方向命名的item count。不使用含义不同的通用`itemCount`：outgoing使用`deliveredItemCount`，等于local finish前commit的deliver-once dispositions数；incoming使用`admittedItemCount`，等于Stream Terminal Boundary，semantic rejection固定为0。Overflow-causing Source Emission从未成为Stream Item，不计入任一count。
- `durationMs`从started commit截止side-local finish/outcome commit；notification FIFO排队、event callback、Observer terminal effect与Source Teardown attempt均不延长它。Duration/count均为floor后的非负safe integer，溢出在`Number.MAX_SAFE_INTEGER`饱和。Count不证明Observer callback成功或返回、async processing、durability、application effect或两侧count相等。
- 只有known incoming finished允许optional literal `sourceTeardownFailed?: true`；absence同时覆盖无teardown需求与teardown未失败，不增加success/not-needed笛卡尔积。该bit不跨wire、不复制Error，不改Stream Terminal、finished outcome、Session/Owner状态或termination task，不生成第三个lifecycle event。

Closed outcome/code组合为：

| Side/context | `outcome` | `code` | Count |
| --- | --- | --- | --- |
| Outgoing known | `completed` | absent | `deliveredItemCount` |
| Outgoing known | `canceled` | absent | `deliveredItemCount` |
| Outgoing known | `failed` | `unavailable \| outcome-unknown \| handler-failed \| unknown-service \| unknown-member \| overflow` | `deliveredItemCount` |
| Incoming known | `completed \| canceled \| terminated` | absent | `admittedItemCount` |
| Incoming known | `failed` | `handler-failed \| overflow` | `admittedItemCount` |
| Incoming unknown service | `failed` | exactly `unknown-service` | `admittedItemCount: 0` |
| Incoming unknown member/kind | `failed` | exactly `unknown-member` | `admittedItemCount: 0` |

`terminated`是known incoming-only的event outcome，不携带code、Error或Session reason；matching `peer-closed`表达真正Session reason。Protocol/resource fault也不进入stream finished code：Subscriber Side按admission/authority使用`unavailable`或`outcome-unknown`，Source Side保留已有winner或使用`terminated`，具体fault由peer/topology event表达。

### Ordering、Recovery与force

- Owner先commit Framework state，再通知state/membership Observation Streams，最后通过一个bounded、serialized、non-reentrant FIFO/effect runner在mutation gate外flush `event$`。当前event对全部尚订阅observers广播完前，event callback重入产生的finished/peer/topology event只能追加到FIFO，不得插入当前broadcast；因此started callback内`close()`不能使其他仍订阅observer先见finished。FIFO只持有已有有限admission/event shell支撑的frozen payload-free snapshots，不是history或无界recorder。
- Event subscriber throw遵守RxJS host reporting，不回滚state、不改winner、不生cancel也不阻止后续Framework convergence。Event subscriber unsubscribe只影响它自己后续能见的hot notifications，不影响Framework已commit的pair。
- 每stream已commit的deliver-once item effect必须在该侧`stream-finished`前恰好一次完成；matching `stream-finished`必须在同peer的`peer-closed`前，再到`topology-closed`和`event$` completion。不同streams之间不承诺全局event order。
- Successful Recovery不新建pair、不替换observationId、不重置duration/count，不重新acquire/subscribe source。`peer-recovering`/`peer-recovered`已表达Session lifecycle；Source Side可在Recovery中选择terminal、teardown并先结束自己的pair，Subscriber Side在恢复后投影authoritative terminal，或在retention永久丢失时以`outcome-unknown`结束。两侧outcome/count不必相同。
- Graceful cutoff `G`只拒绝new roots，不为已started stream发finished。Force `F`继承已定matrix：identity-free outgoing Pending为`failed(unavailable)`；admitted且无authoritative terminal的active Subscriber为`failed(outcome-unknown)`；已commit Subscriber winner保持；Source Side保持已有winner，无winner才为`terminated`并执行one-shot teardown。Caller已以unsubscribe先选`canceled`时，F和late terminal均不发第二final observation。
- F先完成Session-wide fence，再运行Observer/teardown effect shells。`next()`内重入`close()`保留已commit item的唯一delivery，随后finished、再`peer-closed`；teardown(A)重入B.next时B已被fence，不产生item、terminal、finished或第三个incident event。

### Payload safety与verification closure

Application Stream observations只含stable peer、local correlation、relative direction、safe canonical service/member、phase discriminant、closed outcome/code、bounded duration/count与Source-only teardown-failure bit。它们永不包含application payload、args/item/result、raw Error/thrown value/message/stack/cause、Stream/Session/wire identity、ordinal、sequence/ACK/cursor/proof/credential或attacker-controlled unknown spelling。Framework不提供逐item event、resource-pressure duplicate event、history/ring、exporter、trace propagation、redactor或console sink；payload diagnostics仍由application在自己的caller/source边界负责。

Required traces固定为：

| Trace | Required result |
| --- | --- |
| Descriptor `remote.message$` vs Transport `connection.message$` | 前者subscribe建立owning Application Stream pair；后者只建立non-owning callback registration |
| Stream method call/property read without subscribe | 无admission、无started、无remote work |
| Local Admission -> unsubscribe before Outgoing Admission | 唯一`canceled`、`deliveredItemCount: 0`、无identity/wire/cancel，Definite Non-Execution |
| Started stream -> successful Recovery | 原pair/id/duration/count继续，无replacement pair/source subscription |
| Incoming unknown member/kind mismatch | Source发安全相邻pair，只保留canonical service，`failed(unknown-member)`/count 0 |
| Incoming Remote Resource Rejection | Source无pair/无application execution；Subscriber原pair以`failed(unavailable)`/count 0结束 |
| `W=1`, item 1 -> second emission | item 1计数；第二emission不成item，以`failed(overflow)`结束 |
| Source complete -> teardown throw -> terminal evidence lost | Source `completed` + `sourceTeardownFailed: true`；仍active Subscriber `failed(outcome-unknown)`；已unsubscribe Subscriber保持`canceled` |
| Subscriber terminal commit races unsubscribe | 谁先commit谁是local winner；terminal先则finished后unsubscribe仅suppression，unsubscribe先则唯一`canceled` |
| deliver-once item -> Observer `next()` -> reentrant `close()` | item恰好一次，回栈后finished，再`peer-closed` |
| `stream-started` subscriber callback -> reentrant `close()` | 重入events追加FIFO；其他仍订阅subscriber按started -> finished -> close观察 |
| Event subscriber throw/unsubscribe | Framework state/pair/winner不变；该subscriber可只观测部分hot pair |
| F -> teardown(A) -> reentrant B.next | Session-wide fence已生效；无B item/terminal/final event，A最多一个finished及其optional incident bit |

该Interface用两个新event discriminants、方向化count和一个optional failure bit隐藏Framework/Protocol/RxJS的分布式收敛复杂度；不增加member-kind、per-item、Recovery、wire或resource event表面。权威`CONTEXT.md`同步增加Application Stream Observation并收紧Source Teardown Incident定义；本决议不满足新建model/technology ADR的必要性，不产生新ticket，也没有新fog需要毕业。
