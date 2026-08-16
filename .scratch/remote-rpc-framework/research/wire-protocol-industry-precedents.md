# Wire Protocol 业内先例调研：VS Code 与公开协议

日期：2026-08-16

性质：research input，非规范决议

对应 ticket：[决定默认 Protocol 的 wire grammar、Codec 与版本协商](../issues/06-decide-default-protocol-wire-contract.md)

## 问题与取证边界

这份调研不再询问“能否直接采用一个现成 RPC Protocol”。
[调研默认 RPC Protocol 候选](../issues/02-research-default-rpc-protocol-candidates.md)
已经依据正式规范得出结论：当前 Destination 没有通用互操作目标，没有开放协议同时
满足双向 unary、Logical Session Recovery、call dedupe 与 terminal replay，默认
Protocol 因而应采用专用 unary-recovery wire contract。

本次问题更具体：**这份专用 contract 应借鉴哪些已经投入生产或公开标准化的机制，
又有哪些实现细节不能照搬？** 重点核验用户指定的本地 VS Code 仓库，并用公开协议补齐
跨语言 grammar、Codec、版本演化和 unknown-input policy 的证据。

取证规则如下：

- VS Code 只读核验 `/Users/aepkill/repos/vscode`，固定到
  [`microsoft/vscode@b6d86f7dea54686892c2efb61118492e199d4e8c`](https://github.com/microsoft/vscode/commit/b6d86f7dea54686892c2efb61118492e199d4e8c)。
  本地 `HEAD`、`origin/main` 与该 revision 一致；核心文件的本地内容与 GitHub raw
  内容逐一校验一致。
- 公开案例固定到 DAP `bf8a5d27`、LSP 3.17 `8b9fab8f` 与 RSocket 1.0
  `0f6e5554`；JSON-RPC、CBOR 与 CDDL 引用正式规范。
- 每个案例都分成“可借鉴机制”和“不能照搬”。实现存在某个字段或队列，不自动证明它是
  跨语言、抗不可信输入或可独立演化的规范。
- 本报告只为当前 wire-contract 决策提供输入。Session proof/fencing、call ledger、
  cancellation race、资源上限与安全规则仍由各自后续 ticket 决定。

## 结论摘要

1. **最强先例不是一个现成 wire，而是 VS Code 的三层组合。**
   `PersistentProtocol` 负责有序 frame、累计 ACK、重复抑制和 socket replacement；
   Remote Agent handshake 负责重新认证、commit gate 与 retained connection lookup；
   Extension Host `RPCProtocol` 再负责 request、request-accepted ACK、cancel、result 和
   error。三个层次没有把所有事实塞进一个通用 `ack`。
2. **VS Code 证明内存 retained Logical Session 可以跨 Physical Connection 工作。**
   重连不是创建一套新计数器：两端保留原 protocol object、游标、未确认发送队列和
   pending RPC state；新 socket 在握手期间只承载 control，确认旧 connection 后才对
   retained delivery state 放行累计 ACK 与未确认 frame replay。
3. **VS Code 的 wire 不能直接成为 Husky DI 的跨语言规范。** 它依靠 client/server
   product commit 精确相等、共享构建顺序生成的 numeric actor registry、JavaScript
   Error 与内部 JSON/buffer 编码；没有独立 wire/profile version，也没有完整 unknown
   policy 或明确的 frame/queue resource ceilings。
4. **公开 grammar 的最佳参考组合是 DAP/LSP，而不是 VS Code 私有 RPC record。**
   DAP/LSP 展示了判别 envelope、request/response correlation、result/error 互斥、
   cooperative cancellation、strict initialization phase、capability default 以及
   prose + machine-readable schema/model 的跨语言发布方式。
5. **Recovery 与 establishment 的最佳正式对照仍是 RSocket。** 它区分 SETUP/RESUME、
   要求首帧状态、冻结 version/Codec/resume parameters、规定 unknown frame criticality、
   以双向位置恢复 retained frames；但它的 byte-position resume 不等于 application
   dedupe，完整 streaming/fragmentation surface 也超出 v1。
6. **Codec 应先固定一个 mandatory wire representation，而不是协商一张任意 Codec
   矩阵。** UTF-8 JSON + machine-readable schema 是成熟、易调试路线；CBOR + CDDL
   原生区分 bytes/text/integer 并可指定 deterministic encoding，是成熟二进制路线。
   本报告保留二者为明确取舍，不替 ticket 作最终选择。
7. **建议用“分层 grammar + 固定 semantic profile + 明确 criticality”作为决策起点。**
   delivery sequence 与 call identity 分离；delivery ACK、request accepted、terminal
   received/released 分别命名；未知 optional field 可以演化，未知 required message kind
   默认拒绝；只有协商或显式标记为 ignorable 的扩展才可跳过。

## 横向比较

| 先例 | 已证明的成熟机制 | 最有价值的借鉴 | 不能推导的保证 |
| --- | --- | --- | --- |
| VS Code `PersistentProtocol` | binary frame、双向累计 ACK、duplicate suppression、replay、socket replacement、keepalive | retained Session state 与 Physical Connection 解耦；piggyback ACK；gap-triggered replay | ACK 只证明 frame 已进入 peer protocol；不证明 handler/副作用/terminal ledger |
| VS Code Remote handshake | 每次连接认证、commit gate、reconnection token lookup、fresh/reconnect 分支、grace retention | 先确认旧 Session，再开放 replay；resume identity 与 auth credential 分离 | commit equality 不是公开版本协商；UUID lookup 不是完整 resume-security 规范 |
| VS Code Extension Host RPC | 双向 request、request ACK、cancel、result/error、pending promise | 把 request accepted 与 transport ACK 分开；cancel 是 intent，仍等待 terminal | 没有独立 call dedupe/terminal GC contract；JS error/actor id 不跨语言 |
| DAP | JSON discriminated union、reverse request、capabilities、JSON Schema、best-effort cancel | 最小清晰 grammar；schema-to-binding；cancel 后原 request 仍 terminal | `seq` 没有跨连接 ACK/replay/dedupe；没有 breaking wire version handshake |
| LSP + JSON-RPC | result/error union、stable error codes、unknown request policy、strict initialize、meta model | unknown field/request/notification 分层；machine-readable model | stateless envelope；无 Logical Session、replay、ACK 或 terminal retention |
| RSocket 1.0 | binary framing、SETUP/RESUME、version/MIME、frame criticality、双向 implied positions | establishment state machine、resume accept/reject、冻结协商参数、fault scope | frame replay 不提供 handler dedupe/atomicity；完整协议 surface 过重 |
| CBOR + CDDL | 标准 binary data model、bytes/text 区分、deterministic profile、机器可检验 grammar | 公开二进制 wire 与 golden vectors 的标准基础 | CBOR 本身不定义 RPC、版本或 unknown message semantics |

## VS Code：值得借鉴的是三层协议组合

### 1. `PersistentProtocol`：frame delivery 与 socket replacement

`PersistentProtocol` 不是 RPC。它在一个 socket 上提供 regular/control/ack/disconnect/
replay-request/pause/resume/keepalive frame，并保留跨 socket 的 delivery state。
message type 与生产时间参数见
[`ipc.net.ts` L263–313](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L263-L313)：
ACK 最迟延后 2 秒，silent/unacknowledged timeout 为 20 秒，默认重连 grace 为 3 小时，
short grace 为 5 分钟，keepalive 每 5 秒发送。

实际 frame header 是固定 13 bytes：

```text
type:u8 | id:u32be | cumulativeAck:u32be | dataLength:u32be | data
```

reader 按 `HeaderLength = 13` 解析 type、id、ack 与 data length，writer 写出相同字段；
见
[`ipc.net.ts` L333–400](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L333-L400)
和
[`ipc.net.ts` L466–484](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L466-L484)。

只有 `Regular` frame 进入编号/ACK 流。对象保留 outbound unacknowledged queue、每方向
message/ack cursor 与 buffered emitters；见
[`ipc.net.ts` L812–899](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L812-L899)。
发送时自增 id、携带当前反向累计 ACK，并把完整 frame 放进 unacknowledged queue；
没有反向业务流时再发 standalone ACK。`Control` 不参与编号或自动 ACK，源码把它定位为
重连时可能重复的 early control message；见
[`ipc.net.ts` L1077–1121](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L1077-L1121)。

接收任意 frame 都可推进 piggyback cumulative ACK，并删除所有 `id <= ack` 的发送队列
项目。`Regular` 只在 `id == incoming + 1` 时向上投递：旧/重复 id 被忽略；发现 gap
则限频发送 `ReplayRequest`，对方重发全部 unacknowledged frames；见
[`ipc.net.ts` L995–1066](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L995-L1066)。
因此，在同一个 retained process/protocol object 内，ACK 丢失导致的 frame replay 不会
再次投递给上层 handler。

重连的关键不是重新创建 protocol。`beginAcceptReconnection()` 销毁旧 socket reader/
writer 并安装新 socket，但保留 sequence、ACK 与 unacknowledged queue；
`endAcceptReconnection()` 先重新声明累计接收 ACK，再重发全部未确认 regular frames；
见
[`ipc.net.ts` L952–989](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L952-L989)。
20 秒 timeout 同时检查最老 unacknowledged frame 与最后入站数据，并在 CPU 高负载时
抑制误判；idle 时 keepalive 覆盖“没有待确认业务帧”的静默断线，见
[`ipc.net.ts` L1123–1230](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L1123-L1230)。

这些行为有直接单测：

- piggyback/standalone ACK：
  [`ipc.net.test.ts` L235–329](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/test/node/ipc.net.test.ts#L235-L329)；
- reconnect 期间不误 timeout、恢复后必重发 ACK：
  [`ipc.net.test.ts` L331–476](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/test/node/ipc.net.test.ts#L331-L476)；
- unacknowledged/idle keepalive timeout：
  [`ipc.net.test.ts` L478–580](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/test/node/ipc.net.test.ts#L478-L580)。

#### 可借鉴

- Logical delivery state 属于 retained Session，而不是 socket；新 Physical Connection
  只替换 carrier。
- 每方向独立 monotonic delivery sequence + cumulative ACK 足以让重复 frame 不再次
  进入 RPC dispatcher，并可把 ACK piggyback 到反向 frame。
- reconnect 时先交换当前接收位置，再 replay 未确认历史；gap 必须显式触发补发，不能
  假定有序 Transport 永不丢边界外状态。
- timeout 与 idle liveness 分开考虑；只观察 pending sends 会漏掉空闲死连接。

#### 不能照搬

- Transport ACK 的更新点是 protocol 收到并同步投递 frame，不是 handler accepted、
  terminal recorded 或外部副作用 committed。它不能替代 call-level ledger。
- frame 没有 magic、wire version 或 flags；reader 在分配/累计前没有本 contract 可见的
  `dataLength` ceiling，unacknowledged queue 与 paused writer buffer 也没有显式窗口。
- `ack > lastSent`、u32 sequence/request-id wrap 等不可信输入边界没有形成公开规范。
- unnumbered `Control` 可以重复，却没有自动 dedupe/ACK；握手层必须自己保证重入规则。
- 最具体的警示是源码注释称 header 为“9 bytes”，字段与实现实际是 13 bytes；见
  [`ipc.net.ts` L530–546](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts#L530-L546)。
  私有同构实现能容忍这种注释漂移，公开跨语言 contract 不能；Husky DI 需要 normative
  grammar、golden bytes 与独立 decoder conformance 同时锁定。

### 2. Remote Agent handshake：重新认证后才恢复旧 Session

客户端 handshake 是 JSON tagged union：`auth`、`sign`、`connectionType`、`error`、
`ok`。`ConnectionTypeRequest` 携带 optional product `commit`、challenge response、
desired connection type 与 args；见
[`remoteAgentConnection.ts` L43–72](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/platform/remote/common/remoteAgentConnection.ts#L43-L72)。

新 socket URL 带 `reconnectionToken` 与 `reconnection=true|false`。重连时客户端先把
新 socket 暂时安装进旧 `PersistentProtocol`，但不开放 regular replay；它通过 unnumbered
Control lane 发送 connection auth token + nonce，验证 server 对 nonce 的签名，再回签
server nonce并发送 connection type/commit。完整六步流程见
[`remoteAgentConnection.ts` L228–313](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/platform/remote/common/remoteAgentConnection.ts#L228-L313)。
只有收到最终成功 control response，客户端才调用 `endAcceptReconnection()`，让旧 Session
的累计 ACK 与 replay 开始流动；见
[`remoteAgentConnection.ts` L319–340](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/platform/remote/common/remoteAgentConnection.ts#L319-L340)。

server 以明确状态机处理 `WaitingForAuth -> WaitingForConnectionType -> Done/Error`：
先验证 connection token，再 challenge/response；若两边 product commit 都存在，则要求
精确相等，否则拒绝为 version mismatch。这里没有独立 protocol version 或 capability
selection；见
[`remoteExtensionHostAgentServer.ts` L273–401](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/server/node/remoteExtensionHostAgentServer.ts#L273-L401)。
server 的 `/version` 也实际返回 product commit，而不是 protocol semver，见
[`remoteExtensionHostAgentServer.ts` L143–159](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/server/node/remoteExtensionHostAgentServer.ts#L143-L159)。

`reconnectionToken` 是 retained connection directory 的 lookup key。server 分开拒绝
never-seen 与 seen-but-expired token；fresh connection 复用 live token 也拒绝。恢复通过
临时 handshake protocol 验证后，把多读 bytes 与 raw socket 移交既有 Management 或
Extension Host connection；见
[`remoteExtensionHostAgentServer.ts` L404–503](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/server/node/remoteExtensionHostAgentServer.ts#L404-L503)。

Management connection 保留原 `PersistentProtocol` 与 IPC server，并在 grace window 内
接受 replacement socket；见
[`remoteExtensionManagement.ts` L36–127](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/server/node/remoteExtensionManagement.ts#L36-L127)。
Remote Extension Host child process 同样保留原 protocol object，接收新 socket 后执行
ACK/replay 再 `sendResume()`；见
[`extensionHostProcess.ts` L205–265](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/api/node/extensionHostProcess.ts#L205-L265)。

#### 可借鉴

- resume/session routing identity 与 connection authentication credential 是两个不同
  概念；持有 lookup key 不应免除重连认证。
- fresh establish 与 resume 是互斥路径；只有旧 retained state 确认存在且握手成功，
  才能把新 carrier 交给旧 protocol state。
- replay 不能先于身份/compatibility gate；否则攻击者或错误 peer 可以让 retained bytes
  流向错误连接。
- expired 与 never-existed recovery 可以有相同公开拒绝类别，但内部应保留可诊断原因。

#### 不能照搬

- product commit exact match 适合由同一发布物控制的两端，不适合稳定、跨语言、可独立
  发布的 wire。Husky DI 需要与 package commit 分离的 profile/version 及明确拒绝规则。
- VS Code 的签名模块、dev-mode bypass、connection token 与 UUID token 都是产品部署
  细节，不能直接升级成通用 resume proof/security 规范。
- retained state 全在进程内；grace expiry 或进程丢失即结束恢复。这支持本地图的
  Session-scoped 边界，不支持跨进程 exactly-once。
- 本地审计没有发现 malformed/auth mismatch/version mismatch/unknown-or-duplicate
  reconnection token 各拒绝分支的直接 handshake 单测；成熟测试证据主要集中在
  `PersistentProtocol` 与 `RPCProtocol`，不能扩大声称。

### 3. Extension Host `RPCProtocol`：call grammar 与三种 ACK 事实

`RPCProtocol` 只依赖 `IMessagePassingProtocol`，并被 workbench 与 Extension Host 两端
各自组装到 message protocol 上；见
[`extensionHostManager.ts` L249–269](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/extensionHostManager.ts#L249-L269)
和
[`extensionHostMain.ts` L161–185](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/api/common/extensionHostMain.ts#L161-L185)。
这使 RPC call grammar 与 socket/reconnection implementation 解耦，但 Remote Extension
Host 路径仍可借下层 retained protocol 获得跨 socket delivery replay。

RPC 层维护自己的 monotonic request id、pending replies 与 invoked cancellation handlers；
dispose 会把 outstanding caller promises 以 cancellation error 终结，见
[`rpcProtocol.ts` L115–173](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts#L115-L173)。
dispatcher 区分 JSON/mixed request（各有 with/without cancellation 变体）、RPC
`Acknowledged`、`Cancel`、多种 OK reply 与 Error reply，见
[`rpcProtocol.ts` L280–355](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts#L280-L355)。

receiver parse 并 dispatch handler 后立即发送 RPC `Acknowledged`；它只驱动 3 秒
responsiveness detection，不是 terminal success。handler Promise resolve/reject 后，才发送
correlating result/error。`Cancel` 只触发 remote `CancellationTokenSource`，不会强制终结
handler；late reply 找不到 pending id 时被忽略。见
[`rpcProtocol.ts` L358–439](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts#L358-L439)。
caller 若发现最后一个参数是 cancellation token，就不把 token 编进 args；token 后续取消
只发送 `Cancel(req)`，原 caller promise 继续等待 terminal reply，见
[`rpcProtocol.ts` L461–495](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts#L461-L495)。
单测明确锁定“remote 观察到 cancel 后仍可正常 resolve 7”，证明 cancel 是 cooperative
intent，而不是 terminal；见
[`rpcProtocol.test.ts` L120–181](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/test/common/rpcProtocol.test.ts#L120-L181)。

RPC record prefix 是 `type:u8 + requestId:u32be`；message type table见
[`rpcProtocol.ts` L516–563](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts#L516-L563)
与
[`rpcProtocol.ts` L940–953](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts#L940-L953)。
request 再带 `rpcId:u8`、short method string 与 JSON/mixed args。mixed codec 是 VS Code
内部对 `VSBuffer`、`undefined` 与 embedded buffers 的优化，见
[`rpcProtocol.ts` L758–827](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts#L758-L827)。

错误将 JavaScript Error 转成 `$isError/name/message/stack/noTelemetry/code/cause` 等 JSON，
receiver 实际只为 Error 重建 name/message/stack，其他 thrown value 原样传递；见
[`errors.ts` L139–172](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/common/errors.ts#L139-L172)
和
[`rpcProtocol.ts` L416–439](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts#L416-L439)。
wire actor identity 也不是稳定字符串：`ProxyIdentifier.nid` 按声明顺序递增，wire 只发
numeric id；见
[`proxyIdentifier.ts` L33–51](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/proxyIdentifier.ts#L33-L51)。
product commit gate 实际帮助两端共享这套隐式 registry。

#### 可借鉴

- 至少区分三种事实：
  1. delivery/replay ACK：peer protocol 已接收某个 transport frame；
  2. request-accepted ACK：peer RPC 已识别并开始 dispatch call；
  3. terminal result/error：call 有唯一 outcome。
  后续若再有 terminal-received/release ACK，也必须另行命名，不能复用一个裸 `ack`。
- request、cancel 与 terminal 都引用同一 call id；cancel 只表达 intent，terminal 仍由
  result/error/cancel race 决定。
- request 与 response 使用独立 message kinds，比依赖 payload shape 猜测分支更易做
  validation、fault scoping 与 golden-vector testing。
- 两端各自产生 request id，说明 bidirectional call identity 必须带方向/initiator scope，
  不能假设两端 numeric counter 不重叠。

#### 不能照搬

- `rpcId:u8` 的隐式 build-order registry、任意 method string/`any` args、VSBuffer mixed
  codec 与 JS Error stack 都不是稳定跨语言 contract。
- request ACK 在 handler 调用之后发出，但没有 durable call ledger；它不是 retained
  request-admission proof，也没有独立 terminal ACK/GC contract。
- cancellation 没有规范化 terminal precedence；正常 result 可以在 cancel 后获胜。
- 下层 replay queue 恰好保留已编码 terminal bytes，不等于 RPC 层已经定义了
  result ledger、tombstone 或安全回收条件。

## 公开协议案例

### 1. Debug Adapter Protocol：最小、可生成的 JSON grammar

DAP 固定 revision 为
[`microsoft/debug-adapter-protocol@bf8a5d27`](https://github.com/microsoft/debug-adapter-protocol/tree/bf8a5d27e8040044b84b863f90916e08925ee811)。
它的 canonical JSON Schema 把 wire 定义成明确判别联合：共同 `{seq,type}`；request
包含 `{command,arguments?}`；event 包含 `{event,body?}`；response 包含
`{request_seq,success,command,message?,body?}`。Request 可以由 client 或 adapter 发起，
每个 actor 自己的 `seq` 单调递增，response 通过 `request_seq` 关联；见
[`debugAdapterProtocol.json` L10–113](https://github.com/microsoft/debug-adapter-protocol/blob/bf8a5d27e8040044b84b863f90916e08925ee811/debugAdapterProtocol.json#L10-L113)。

Cancel 是 best-effort hint：cancel request 的 response 不证明原操作已终止；被取消的原
request 仍必须返回唯一 response，可以正常成功，也可以用 `message = cancelled` 失败；见
[`debugAdapterProtocol.json` L134–171](https://github.com/microsoft/debug-adapter-protocol/blob/bf8a5d27e8040044b84b863f90916e08925ee811/debugAdapterProtocol.json#L134-L171)。
这与 VS Code `RPCProtocol` 的实际 cooperative cancellation 一致，也与当前地图要求的
“cancel 不等于 rollback/未执行”一致。

DAP 的 `initialize` 必须是首个且只发送一次；双方在 initialize response 前不能自由发送
其他 request/event，并通过 arguments/response 交换 capabilities，见
[`debugAdapterProtocol.json` L921–1024](https://github.com/microsoft/debug-adapter-protocol/blob/bf8a5d27e8040044b84b863f90916e08925ee811/debugAdapterProtocol.json#L921-L1024)。
它有意不做 protocol-version handshake：每个新增功能有 capability flag，缺席即不支持；
见
[`overview.md` L110–128](https://github.com/microsoft/debug-adapter-protocol/blob/bf8a5d27e8040044b84b863f90916e08925ee811/overview.md#L110-L128)。

对于 byte stream，DAP 使用 ASCII `Content-Length` header + UTF-8 JSON，并明确 JSON
integer 的 32-bit 表示边界；见
[`overview.md` L63–108](https://github.com/microsoft/debug-adapter-protocol/blob/bf8a5d27e8040044b84b863f90916e08925ee811/overview.md#L63-L108)。
跨语言 artifact 是 prose + canonical JSON Schema，而不是某一语言实现：VS Code 的 TS
声明明确由 schema 自动生成，见
[`debugProtocol.d.ts` L6–18](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/contrib/debug/common/debugProtocol.d.ts#L6-L18)。

**可借鉴：** 小而清晰的 discriminated union；request/response correlation；严格初始化
phase；capability 缺席为 false；cancel 后原 request 仍 terminal；machine schema 生成各语言
binding。

**不能照搬：** `seq` 没有跨连接 ACK/replay/dedupe 语义，不能同时充当 call identity、
delivery sequence 与 resume position；DAP 不协商 breaking wire version；UI-oriented
structured Error `Message` 混有展示/telemetry 语义，不适合作通用 RPC。若 Physical
Connection Adapter 已保证完整 message，`Content-Length` 也应留给 stream adapter，而不是
无条件嵌入 Default Protocol。

### 2. LSP 3.17 + JSON-RPC 2.0：unknown policy 与 error union

JSON-RPC 2.0 的 request 由 `jsonrpc:"2.0"`、`id`、`method`、optional `params` 构成，
response 原样回显 id，并必须在 `result` 与 `error` 中二选一；error 有 stable numeric
`code`、human-readable `message` 与 optional `data`。Notification 没有 id，且不得产生
response；见官方
[Request](https://www.jsonrpc.org/specification#request_object)、
[Notification](https://www.jsonrpc.org/specification#notification)、
[Response](https://www.jsonrpc.org/specification#response_object) 与
[Error](https://www.jsonrpc.org/specification#error_object) 章节。

LSP 3.17 固定 revision 为
[`microsoft/language-server-protocol@8b9fab8f`](https://github.com/microsoft/language-server-protocol/tree/8b9fab8f0912b694c795d05c1d5e9d357bee0193)。
它把 JSON-RPC profile 固定为 UTF-8、Content-Length framing，并明确 integer/uinteger
范围；见
[`specification.md` L26–140](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/specification.md#L26-L140)。
`$/cancelRequest` 引用原 id；即便取消，原 request 仍必须 response，失败建议使用
`RequestCancelled`；见
[`specification.md` L332–354](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/specification.md#L332-L354)。

LSP 的 unknown policy 特别值得借鉴：未知/不可实现的 `$/` notification 可以忽略，
`$/` request 必须返回 `MethodNotFound`；普通 unknown request 由 JSON-RPC `-32601`
覆盖；unknown server capability 由 client 忽略。见
[`specification.md` L219–334](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/specification.md#L219-L334)
和
[`specification.md` L414–435](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/specification.md#L414-L435)。
initialize 也是首条/一次性，pre-init request 有明确 error，notification 被丢弃，双方
在 response 前只允许受限流量；见
[`initialize.md` L1–83](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/general/initialize.md#L1-L83)
与
[`initialize.md` L574–602](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/general/initialize.md#L574-L602)。

LSP 不只发布 TS prose，还提供描述 message direction、request/result 与类型的 machine-
readable meta model；见
[`metaModel.ts` L124–180](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/metaModel/metaModel.ts#L124-L180)
与
[`metaModel.json` L1–29](https://github.com/microsoft/language-server-protocol/blob/8b9fab8f0912b694c795d05c1d5e9d357bee0193/_specifications/lsp/3.17/metaModel/metaModel.json#L1-L29)。

**可借鉴：** result/error 互斥；stable machine error code + optional details；unknown
request 返回 call-scoped structured error，unknown notification/optional capability 可以
忽略；cancel 与 terminal 分离；prose + machine model。

**不能照搬：** JSON-RPC 自称 stateless，LSP 没有跨连接 Logical Session、ACK、replay、
dedupe 或 terminal retention；`jsonrpc:"2.0"` 只标 envelope，不是 Husky semantic
profile version；notification 不适合承载必须可恢复/确认的 control transition；LSP 的
capability flags 可以保护 additive editor features，不能静默关闭 Recovery、dedupe 或
terminal replay 等固定 v1 保证。

### 3. RSocket 1.0：establishment、criticality 与 resume 对照

RSocket 固定 revision 为
[`rsocket/rsocket@0f6e5554`](https://github.com/rsocket/rsocket/tree/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8)。
它根据 Transport 是否保留 message boundary 决定 framing：byte stream 前置 24-bit
length，message-framed Transport 必须省略；无论哪种 carrier，frame 最大
16,777,215 bytes。unknown frame 只有显式 Ignore flag 才能跳过，否则可以 connection
error + close；length mismatch 是 fatal connection error。见
[`Protocol.md` L82–179](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#L82-L179)。

SETUP 必须是首个 connection-level frame，并携带 major/minor、keepalive/lifetime、
resume flag/token 与 metadata/data MIME codec；protocol 本身不解释 MIME payload。
不支持 resume 必须明确拒绝；见
[`Protocol.md` L257–344](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#L257-L344)。
所有 major/minor 变化都先假定不兼容；client 提一个 version，server 接受、接受 lower
或拒绝，因此它也不是真正的 supported-set intersection，见
[`Protocol.md` L61–69](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#L61-L69)。

Recovery 把 Logical RSocket 与新 Transport 分开：RESUME 带 token 和双向 last/first-
available implied byte positions；RESUME_OK 后双方可以重传 retained frames，并且 resume
期间 version/Codec 不得改变。见
[`Protocol.md` L717–745](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#L717-L745)
和
[`Protocol.md` L751–840](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#L751-L840)。
resume token 应 opaque、唯一、lifetime-bound、抗预测/重放，但生成和验证仍是 implementation-
dependent guideline，见
[`Protocol.md` L848–858](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md#L848-L858)。

**可借鉴：** Transport framing 与 protocol frame 分层；无条件 message-size ceiling；
SETUP/RESUME 互斥首帧；version/Codec/recovery parameters 在 Logical Session 绑定时冻结；
unknown message criticality 显式；setup/resume/connection/application error 分 scope；双向
独立 replay cursor。

**不能照搬：** bit-packed frame、fragmentation、stream/request-N/lease 都是 unary v1
非目标；implied byte position 与 exact encoded length/fragmentation 强耦合，不一定比显式
frame sequence 易审计；单个 client-proposed version 不是双方版本集合协商；frame replay
不提供 application side-effect dedupe/atomicity；token security 只是 guideline；任意 MIME
Codec negotiation 会扩大 interoperability matrix，默认 Protocol 应先固定 mandatory codec。

## Codec 与跨语言规范形式

### 路线 A：UTF-8 JSON + machine-readable schema/model

DAP 与 LSP 已证明这条路线可支撑大量独立语言实现：wire envelope 直接可读，整数范围、
required/optional fields 与 union 分支由 JSON Schema 或 meta model 描述，再生成语言 binding。
DAP 还明确说明选择 wire protocol 而不是特定 API/client library 的跨语言价值；见
[`overview.md` L34–43](https://github.com/microsoft/debug-adapter-protocol/blob/bf8a5d27e8040044b84b863f90916e08925ee811/overview.md#L34-L43)。

优势：生态与调试工具成熟；golden vectors 人眼可读；TypeScript/browser 无额外二进制
runtime。成本：binary payload 需要额外表示；JSON `number` 不能含糊承载长寿命 u64
counter；canonical bytes 不是默认性质；严格 decoder 仍必须显式限制 depth、size、integer
range、duplicate keys 与 unknown fields。

### 路线 B：CBOR + CDDL

[RFC 8949 CBOR](https://www.rfc-editor.org/rfc/rfc8949.html) 是 IETF Standards Track。
它的 generic data model原生区分 integer、floating point、byte string、text string、array、
map 与 tag；这避免 VS Code mixed JSON/buffer codec 那种语言内部特例。
[RFC 8949 §1.1](https://www.rfc-editor.org/rfc/rfc8949.html#section-1.1)
还把 binary byte string、schema-independent decoding 与 extensibility 列为设计目标。

CBOR 并不默认保证同一值只有一种 byte encoding；若签名、hash、golden bytes 或 replay
比较需要稳定表示，application protocol 必须选择 deterministic profile。
[RFC 8949 §4.2](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2)
给出 core deterministic baseline：preferred shortest encoding、禁止 indefinite lengths、
map key 以 deterministic encoding 排序。是否需要这项约束取决于后续 security/signature
与 implementation 要求，不能仅因“binary”自动推导。

[RFC 8610 CDDL](https://www.rfc-editor.org/rfc/rfc8610.html) 同样是 Standards Track。
其目标是无歧义描述 CBOR data item、同时人可读/可编辑和机器可处理，并支持自动检查；
见 [RFC 8610 §1](https://www.rfc-editor.org/rfc/rfc8610.html#section-1)。CDDL 也能描述
JSON data structures，因此可以在 grammar 层保留相同建模方法。

优势：native bytes、整数与 text/bytes 边界明确；compact；CDDL 可作为独立实现的机器
grammar；需要时有标准 deterministic baseline。成本：需要额外 runtime/tooling；CBOR
generic extensibility 不替 application 决定 unknown field/message 行为；不同语言对大整数、
tag 与 duplicate map key 的支持仍须 profile 限制。

### Protobuf 的 unknown-field 警示

Protocol Buffers binary parsing 会保留 unknown fields，但官方 Proto3 guide 明确警告：
序列化为 JSON 或逐字段复制会丢失 unknown fields。见
[Proto3 Unknown Fields](https://protobuf.dev/programming-guides/proto3/#unknown-fields)。
因此，不能因为某个 binary Codec 支持 unknown-field preservation，就声称 JSON bridge、
日志 round-trip 或另一 Codec 有相同演化保证。unknown policy 必须绑定**具体 wire Codec
与处理路径**，不能只写在抽象 object model 上。

### Codec 取舍表

| 维度 | JSON + JSON Schema/meta model | CBOR + CDDL |
| --- | --- | --- |
| 人工诊断 | 最强；payload 直接可读 | 需要 diagnostic notation/tool |
| binary bytes | base64/side channel/custom convention | 原生 byte string |
| numeric precision | 必须限制 safe integer 或用 string | wire 可表达 u64，但 JS binding 仍须规则 |
| compactness | 较弱 | 较强 |
| machine grammar | JSON Schema/meta model 成熟 | CDDL 为 Standards Track |
| deterministic bytes | 需另定 canonical JSON profile | RFC 8949 §4.2 提供 baseline，仍需 protocol opt-in |
| unknown evolution | 由 schema/decoder policy 决定 | generic decoder 可保留 unknown item，但 application policy 仍必需 |
| 当前 evidence | DAP/LSP 大规模跨语言先例 | IETF 标准 data model 与 grammar |

本报告的建议不是同时支持两种。默认 Protocol 一旦选择，应固定一个 mandatory Codec 与
精确 profile；Codec negotiation 只在出现真实互操作需求时再扩大。否则每增加一种 Codec，
都会把 integer、unknown fields、canonicalization、golden vectors 与安全验证重新乘一遍。

## 推荐参考架构（供 wire ticket 讨论，不是规范决议）

下面是从 VS Code、DAP/LSP 与 RSocket 共同证据归纳出的**首选讨论起点**。它故意只定
layering 与 proof obligations，不定最终字段名、位宽、Session proof 或 call race。

### 1. Bootstrap / establishment grammar 独立

Physical Connection 的第一条 protocol message 只能进入 mutually exclusive 的 fresh
establish 或 resume path；在明确 accept 前禁止 application call frame。bootstrap 必须
使用固定、最小、无需先协商才能解码的 representation，并携带：

- semantic profile / wire version offer；
- mandatory Codec/profile identity；
- fresh 或 resume intent；
- 后续 Session ticket 决定的 identity/proof 与 retained-state claims；
- 只允许不改变公开 v1 guarantees 的 optional capabilities/optimizations。

接受方显式返回 accepted parameters 或 scoped rejection；恢复成功后这些参数冻结，不能在
同一 Logical Session 中换 Codec/version。这个形状借鉴 VS Code 的“握手成功后才
`endAcceptReconnection()`”与 RSocket 的 SETUP/RESUME gate，但不采用 VS Code commit
lockstep 或 RSocket client-only single-version semantics。

### 2. Delivery envelope 与 RPC message union 分离

建议把概念层至少拆成：

```text
Physical message
  = bootstrap/control message
  | delivery envelope(sequence, cumulative delivery ack, semantic message)

Semantic message
  = call request
  | request-admission fact
  | cancel intent
  | terminal result
  | terminal remote error
  | terminal-receipt/release fact
  | scoped close/fault
```

这不是最终 message list。关键约束是：

- per-direction delivery sequence 不兼任 call identity；
- delivery ACK 不兼任 request-admission 或 terminal ACK；
- call request/cancel/terminal 引用稳定 call identity，但 identity 的结构与 ledger 仍由
  [决定 Call identity、ACK、重放与去重](../issues/10-decide-call-delivery-state-machine.md)
  决定；
- error outcome 与 protocol fault 分开，前者只终结一个 call，后者按 connection/session
  scope 隔离；具体 remote error vocabulary 与竞态由
  [决定 unary 调用、取消、错误与终止竞态](../issues/11-decide-unary-call-errors-cancellation.md)
  决定。

VS Code 证明这套分层可在生产中工作；DAP/LSP 给出更适合公开规范的 discriminated union；
RSocket 则证明 recovery cursor 不应被误叫 application completion。

### 3. Version 与 capability 采用“固定保证、显式拒绝”

三个先例分别暴露了极端：VS Code commit equality 只能 lockstep；DAP/LSP 依靠 capability
flags 支持 additive features，却没有 breaking wire version negotiation；RSocket 提单一
version 给 server accept/lower/reject，不是真正的双方 supported-set selection。

因此 ticket 应优先评估：

- 独立于 npm/package/product commit 的 wire profile version；
- 双方支持集合的确定性 selection，或者更简单的 exact-major/compatible-minor 规则；
- handshake response 明确回显最终选择；无交集时明确拒绝；
- v1 的 Recovery、dedupe、terminal replay 等公开保证属于 required profile，不得由
  capability absence 静默关闭；
- capability 只承载 wire-compatible optimization 或真正 optional extension。

本报告不决定 version number 格式、major/minor 兼容算法或 extension registry；它只排除
“直接比较 package commit”和“把 required semantics 当 optional flags”两条路线。

### 4. Unknown input 按 criticality 分层

综合 LSP 的 request/notification policy 与 RSocket Ignore flag，建议 ticket 明确回答：

| Unknown input | 建议默认处理压力 |
| --- | --- |
| 已知 message 的 unknown optional field/capability | 忽略但不得改变 required semantics；是否 round-trip preservation 由 Codec/profile 明定 |
| unknown service/method/request target | 返回 call-scoped structured `not found/unsupported` error，不破坏 Session |
| unknown optional extension message | 只有握手已协商或 wire 显式标记 ignorable 才可跳过 |
| unknown required control/message kind | protocol fault；按最小确定 scope 关闭 connection 或 Session |
| malformed encoding、length/range/schema violation | 在 dispatch 前拒绝，不能交给 application handler |

“忽略 unknown fields”与“忽略 unknown message kinds”不是同一策略。前者可支持 additive
schema evolution；后者可能漏掉决定 Session/call state 的 required transition。

### 5. 跨语言交付物不只是一份 TypeScript type

无论最终选 JSON 还是 CBOR，规范交付物至少应覆盖：

- normative prose：state/phase、每种 message 的前置条件与效果、fault scope；
- machine-readable grammar：JSON Schema/meta model 或 CDDL；
- golden valid/invalid byte vectors：包括边界整数、unknown fields、malformed length、重复
  message、out-of-order sequence 与版本拒绝；
- 至少一个与 TypeScript implementation 独立的 decoder/validator 或 conformance runner；
- stateful traces：fresh handshake、accepted resume、rejected resume、lost ACK/replay、
  cancel/terminal race；
- 明确的 numeric range、UTF-8/bytes、duplicate-key、depth/size 与 canonicalization policy。

DAP/LSP 的 schema/meta-model 证明 language binding 可以从 wire artifact 派生；VS Code
13-byte/“9-byte”注释漂移则证明不能让 implementation comment 反向充当规范。

## 明确保留给后续 tickets 的问题

本报告不提前锁定以下答案：

- [决定 Logical Session identity、Handshake 与 Recovery](../issues/09-decide-logical-session-recovery.md)：
  Session incarnation、resume proof、single owner/fencing、accept/reject evidence。
- [决定 Call identity、ACK、重放与去重](../issues/10-decide-call-delivery-state-machine.md)：
  call id 结构、request-admission point、terminal ledger、ACK/GC、tombstone/high-watermark。
- [决定 unary 调用、取消、错误与终止竞态](../issues/11-decide-unary-call-errors-cancellation.md)：
  cancel/result/error/deadline/close 的 terminal winner 与公开 `RpcError` 映射。
- [决定顺序、并发、缓冲与恢复资源上限](../issues/13-decide-ordering-concurrency-resource-bounds.md)：
  frame/message/depth 上限、replay bytes、pending calls、grace/retention、backpressure。
- [决定 trust-boundary validation 与 Session Recovery 安全](../issues/14-decide-validation-recovery-security.md)：
  token/proof construction、replay resistance、authentication binding、canonical bytes/signature。
- [决定 Physical Connection Adapter 契约](../issues/07-decide-physical-connection-adapter-contract.md)：
  Adapter 是否交付完整 message；只有它未保留 message boundary 时，length framing 才属于
  adapter/connection driver 的必要责任。

当前 wire ticket 可以据此决定：message family、Codec/profile、version/capability rules、
unknown handling 与跨语言规范形式；不能借“参考 VS Code”顺手替后续状态机和安全票拍板。

## 一手来源清单

- [VS Code 固定 revision `b6d86f7d`](https://github.com/microsoft/vscode/tree/b6d86f7dea54686892c2efb61118492e199d4e8c)
  - [`PersistentProtocol`](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/base/parts/ipc/common/ipc.net.ts)
  - [Remote Agent client handshake](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/platform/remote/common/remoteAgentConnection.ts)
  - [Remote Agent server handshake](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/server/node/remoteExtensionHostAgentServer.ts)
  - [Extension Host `RPCProtocol`](https://github.com/microsoft/vscode/blob/b6d86f7dea54686892c2efb61118492e199d4e8c/src/vs/workbench/services/extensions/common/rpcProtocol.ts)
- [Debug Adapter Protocol fixed revision `bf8a5d27`](https://github.com/microsoft/debug-adapter-protocol/tree/bf8a5d27e8040044b84b863f90916e08925ee811)
- [Language Server Protocol 3.17 fixed revision `8b9fab8f`](https://github.com/microsoft/language-server-protocol/tree/8b9fab8f0912b694c795d05c1d5e9d357bee0193)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [RSocket Protocol 1.0 fixed revision `0f6e5554`](https://github.com/rsocket/rsocket/blob/0f6e5554a5f9abbb1c6c7ec2138d2f3e0ab280e8/Protocol.md)
- [RFC 8949: Concise Binary Object Representation](https://www.rfc-editor.org/rfc/rfc8949.html)
- [RFC 8610: Concise Data Definition Language](https://www.rfc-editor.org/rfc/rfc8610.html)
- [Protocol Buffers Proto3 Language Guide: Unknown Fields](https://protobuf.dev/programming-guides/proto3/#unknown-fields)
