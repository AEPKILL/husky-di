# VS Code Electron renderer 与 main 之间的 RPC：使用方式与设计

## 调研边界

- 源码仓库：`/Users/aepkill/repos/vscode`
- 固定版本：`f489b728ba96a9a31351e25658adf0e2b6325f3a`（2026-08-18）
- 研究对象：桌面 Workbench renderer 与 Electron main process 之间、建立在 `IChannel`/`IServerChannel` 上的双向 RPC。
- 证据范围：只使用该提交中的第一方源码和测试；没有引用网络文章、Electron 外部文档或第三方实现。
- 本文中的行号均对应上述固定提交。链接使用绝对路径，便于在本机直接打开。

## 结论先行

VS Code 的 renderer↔main RPC 不是“每个服务各自定义一个 Electron IPC channel”，而是三层叠加：

1. **通用 Channel IPC 层**把远端能力统一为 `IChannel.call(command, arg, token)` 和 `IChannel.listen(event, arg)`；服务端对应 `IServerChannel.call(ctx, ...)` / `listen(ctx, ...)`。这一层只依赖收发 `VSBuffer` 的 `IMessagePassingProtocol`，与 Electron 无关。[`src/vs/base/parts/ipc/common/ipc.ts:19–38`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:19) [`ipc.ts:99–127`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:99)
2. **Electron transport 层**把所有 Channel 消息复用到固定的 `vscode:message` 上，并用 `vscode:hello` / `vscode:disconnect` 管理连接；真正的服务名如 `nativeHost`、`update`、`urlHandler` 位于二进制消息内部，不是 Electron 顶层 channel。[`src/vs/base/parts/ipc/common/ipc.electron.ts:14–33`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.electron.ts:14) [`src/vs/base/parts/ipc/electron-browser/ipc.electron.ts:13–38`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-browser/ipc.electron.ts:13)
3. **服务适配层**有两种写法：`ProxyChannel.fromService/toService` 自动把方法和 `onXxx` 事件映射为 RPC；或者手写 `IServerChannel` + ChannelClient，以得到显式命令白名单、参数转换和客户端状态管理。[`ipc.ts:1119–1131`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1119) [`src/vs/platform/update/common/updateIpc.ts:11–89`](/Users/aepkill/repos/vscode/src/vs/platform/update/common/updateIpc.ts:11)

这条连接是**双向**的。renderer 的 `IPCClient` 既能 `getChannel` 调 main，也能 `registerChannel` 给 main 回调；main 的 `IPCServer` 既托管 main channels，也能按 renderer 的连接上下文路由到某一个 renderer channel。[`ipc.ts:820–879`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:820) [`ipc.ts:1008–1044`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1008)

## 1. 分层模型：哪些东西是通用框架，哪些才是 Electron

| 层 | 关键抽象/文件 | 职责 | 是否 Electron 专用 |
| --- | --- | --- | --- |
| 服务表面 | `IChannel`, `IServerChannel`, `ProxyChannel` | 方法、Promise、事件、参数和结果的远程映射 | 否 |
| 会话与路由 | `ChannelClient`, `ChannelServer`, `IPCClient`, `IPCServer`, `IClientRouter` | 请求关联、初始化、取消、订阅、连接上下文、多 renderer 路由 | 否 |
| renderer↔main transport | `common/ipc.electron.ts`, `electron-browser/ipc.electron.ts`, `electron-main/ipc.electron.ts` | 把 `VSBuffer` 放进 Electron `ipcRenderer`/`ipcMain`，并按 `WebContents` 隔离连接 | 是 |
| sandbox 边界 | `preload.ts`, `ipcMain.ts` | 暴露受限 renderer API；校验 channel、来源与 frame | 是 |
| 应用组合根 | `code/electron-main/app.ts`, `workbench/electron-browser/desktop.main.ts` | 创建 server/client、注册 main channels、注入 renderer 服务 | 是桌面产品代码 |

因此，看到 `IPCClient`、`ProxyChannel` 或 `IChannel` 并不等于“Electron main↔renderer”。同一套通用框架也运行在 Node socket 和 MessagePort 上，后文会单独区分。

## 2. 通用 Channel IPC 的核心抽象

### 2.1 最小接口

`IMessagePassingProtocol` 只有 `send(VSBuffer)`、`onMessage` 和可选 `drain()`，它是 transport seam。`IChannel` 把一次远程调用约束为“一个 command、至多一个 arg、一个 Promise 返回值”，事件则为“一个 event 名、至多一个 arg、一个 `Event<T>`”。服务端的 `IServerChannel` 多一个连接上下文 `ctx`。[`src/vs/base/parts/ipc/common/ipc.ts:19–38`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:19) [`ipc.ts:99–106`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:99)

这套接口刻意很窄：没有远端对象引用、流式返回值或任意数量的顶层参数。多参数方法由上层包装成一个数组；例如 `ProxyChannel.toService` 将方法参数打成 `args[]` 后只调用一次 `channel.call(propertyName, args)`。[`ipc.ts:1264–1283`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1264)

### 2.2 `IPCClient` 与 `IPCServer` 都是双向端点

`IPCClient` 同时实现 `IChannelClient` 和 `IChannelServer`：内部各持有一个 `ChannelClient` 与一个 `ChannelServer`，所以 renderer 不仅能取 main 的 channel，也能向 main 注册自己的 channel。[`ipc.ts:1008–1044`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1008)

`IPCServer` 同样有两个角色：

- 对每条连接创建 `ChannelServer`，把 main 已注册的 channels 暴露给该客户端；
- 同时创建 `ChannelClient`，让 main 能反向调用该客户端注册的 channels；
- 将每条连接保存为 `{ channelServer, channelClient, ctx }`，并发出 add/remove connection 事件。[`ipc.ts:847–879`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:847)

当 main 反向调用 renderer 时，`IPCServer.getChannel(name, router)` 用 `IClientRouter` 选连接；无自定义 router 的广播事件路径还可以把多个客户端的同名事件合并。`StaticRouter` 则反复检查现有连接，找不到时等待下一条连接后重试。[`ipc.ts:881–929`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:881) [`ipc.ts:931–982`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:931) [`ipc.ts:1095–1117`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1095)

### 2.3 两种“上下文”不要混淆

代码里有两个看似相同、实际独立的 context：

1. **连接上下文 `ctx`**：`IPCClient` 建连后的第一帧主动发送；`IPCServer` 将其反序列化，存进 `Connection.ctx`，用于 renderer 路由，并传给手写 `IServerChannel.call/listen`。[`ipc.ts:847–862`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:847) [`ipc.ts:1020–1031`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1020)
2. **`ProxyChannel.toService({ context })` 的方法参数**：它把指定值插到每个远程方法参数数组最前面；这不是 transport 身份，也不读取 `Connection.ctx`。`ProxyChannel.fromService` 的自动适配器实际上忽略其 `IServerChannel` 的第一个 `ctx` 参数。[`ipc.ts:1169–1217`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1169) [`ipc.ts:1220–1283`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1220)

桌面 renderer 将连接上下文设为 `window:<windowId>`；`nativeHost` 又把同一个 `windowId` 作为业务方法的首参数注入。它们来源相近，但机制不同。[`src/vs/platform/ipc/electron-browser/mainProcessService.ts:18–33`](/Users/aepkill/repos/vscode/src/vs/platform/ipc/electron-browser/mainProcessService.ts:18) [`src/vs/platform/native/common/nativeHostService.ts:15–27`](/Users/aepkill/repos/vscode/src/vs/platform/native/common/nativeHostService.ts:15)

## 3. 线协议：请求、响应、事件和初始化

Channel 层在一条 `VSBuffer` 中编码一个 header 和一个 body。消息码及形状如下；数字来自内部 `const enum`，不是对外 API。[`src/vs/base/parts/ipc/common/ipc.ts:40–93`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:40)

| 方向 | 码 | 含义 | header | body |
| --- | ---: | --- | --- | --- |
| client→server | `100` | Promise 调用 | `[100, id, channelName, command]` | 单个 `arg` |
| client→server | `101` | 取消 Promise | `[101, id]` | `undefined` |
| client→server | `102` | 订阅事件 | `[102, id, channelName, event]` | 单个 `arg` |
| client→server | `103` | 退订事件 | `[103, id]` | `undefined` |
| server→client | `200` | ChannelServer 已初始化 | `[200]` | `undefined` |
| server→client | `201` | Promise 成功 | `[201, id]` | 返回值 |
| server→client | `202` | `Error` 失败 | `[202, id]` | `{ message, name, stack[] }` |
| server→client | `203` | 非 `Error` 失败 | `[203, id]` | 原始 rejection 值 |
| server→client | `204` | 事件发射 | `[204, id]` | 事件值 |

`ChannelClient.sendRequest` 负责生成上述请求 header；`ChannelServer.onRawMessage` 解码后按类型分发。响应走相反路径，由客户端用 `id` 找到 handler。[`ipc.ts:394–413`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:394) [`ipc.ts:714–730`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:714) [`ipc.ts:753–783`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:753)

同一个方向上的 Promise call 和 event subscription 共用同一个 `ChannelClient.lastRequestId` 计数器，因此 id 是“该 ChannelClient 会话内、跨 call/event 类型”的关联号；两个方向各有自己的 `ChannelClient`，所以计数空间彼此独立。[`ipc.ts:542–583`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:542) [`ipc.ts:674–677`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:674) [`ipc.ts:815–818`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:815)

### 3.1 初始化握手与启动竞态

每个 `ChannelServer` 构造时立即发送 `Initialize(200)`；对端 `ChannelClient` 在收到它之前保持 `Uninitialized`，此时的调用和事件订阅会等待 `whenInitialized()`，之后才真正发送。[`ipc.ts:332–345`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:332) [`ipc.ts:635–644`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:635) [`ipc.ts:759–796`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:759)

如果请求先到而 channel 尚未注册，`ChannelServer` 会按 channel 名暂存请求；注册后异步 flush。默认等待上限是 1000ms，Promise 请求超时会返回“Unknown channel”错误。这使 server 建立和应用层 channel 注册不必严格同一时刻完成。[`ipc.ts:332–352`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:332) [`ipc.ts:482–520`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:482)

## 4. 调用、事件、取消、错误、断线

### 4.1 Promise 请求/响应

客户端为调用分配递增 `id`，先安装响应 handler，再发送请求。服务端按 `channelName` 找到 `IServerChannel`，调用其 `call(ctx, command, arg, cancellationToken)`，完成后发送 success 或 error。客户端在 success/error 时移除 handler 并 settle 原 Promise。[`ipc.ts:580–633`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:580) [`ipc.ts:416–455`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:416)

`Error` 会被压缩成 `message`、`name`、按行拆分的 `stack`，renderer 再创建一个新的 `Error` 还原这三个字段；非 `Error` rejection 则作为普通 body 发送。因此错误对象的自定义原型和额外字段不会透明穿越，但 name/message/stack 被这套 Channel 协议显式保留。[`ipc.ts:435–448`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:435) [`ipc.ts:598–617`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:598)

### 4.2 事件

`channel.listen()` 本身不会立即跨进程订阅。返回的 `Event` 在**第一个本地 listener 加入**时发送 `EventListen(102)`；**最后一个 listener 移除**时发送 `EventDispose(103)` 并删除响应 handler。服务端把 `channel.listen(...)` 返回的 Event 订阅项放入 `activeRequests`，退订消息会 dispose 它。[`ipc.ts:674–712`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:674) [`ipc.ts:458–480`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:458)

`ProxyChannel.fromService` 默认还会在服务端为可枚举的 `onXxx` 事件创建 `Event.buffer`，以免服务建立后、首个 IPC listener 建立前的事件丢失；`unbufferedEvents` 可要求真正惰性订阅。`nativeHost` 的 `onDidBlurMainWindow` 就显式设为 unbuffered，因为它有 main 内消费者但没有 IPC 消费者，默认 buffer 永远无法排空。[`ipc.ts:1144–1195`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1144) [`src/vs/code/electron-main/app.ts:1390–1397`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1390)

仓库测试覆盖了首次订阅、重订阅、退订以及 unbuffered event 的惰性行为。[`src/vs/base/parts/ipc/test/common/ipc.test.ts:316–373`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:316) [`ipc.test.ts:481–516`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:481)

### 4.3 取消

底层 `IChannel.call` 支持 `CancellationToken`：

- 调用前已取消，客户端直接以 `CancellationError` 拒绝，不发请求；
- 尚在等待 Initialize 时取消，只取消本地等待；
- 请求已发出后取消，客户端发送 `PromiseCancel(101)` 并拒绝本地 Promise；
- 服务端为每个 Promise 创建 `CancellationTokenSource`，收到 cancel 后 dispose active request，从而触发传给 `IServerChannel.call` 的 token。[`ipc.ts:580–671`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:580) [`ipc.ts:424–455`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:424) [`ipc.ts:473–480`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:473)

这是**协作式取消**：实际业务方法需要观察 token。通用 IPC 测试分别覆盖了预取消、同步取消和异步取消，并让服务端的 `neverCompleteCT` 在 token 触发时拒绝。[`src/vs/base/parts/ipc/test/common/ipc.test.ts:130–140`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:130) [`ipc.test.ts:283–314`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:283)

一个重要限制是：`ProxyChannel` 的源码注释明确写明目前不支持 `CancellationToken`。自动代理把所有业务参数放进 body，而不会把其中某个 token 传给 `IChannel.call` 的第三参数；需要跨进程取消的服务应手写 ChannelClient/ServerChannel。[`ipc.ts:1119–1131`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1119) [`ipc.ts:1264–1276`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1264)

### 4.4 断线与 dispose

通用 `IPCServer` 的连接事件携带 `onDidClientDisconnect`。触发后，它会同时 dispose 该连接的 `ChannelServer` 和 `ChannelClient`、从连接集合删除并发出 `onDidRemoveConnection`；`ChannelClient.dispose()` 会 dispose 所有活跃请求/事件并移除 protocol listener。[`ipc.ts:810–818`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:810) [`ipc.ts:847–878`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:847) [`ipc.ts:798–807`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:798)

Electron renderer client dispose 时先发送 `vscode:disconnect`，再 dispose 通用 client。main 把显式 disconnect 和“同一个 `WebContents.id` 再次 hello”都视为断线；后者会先 dispose 旧连接，再建立新连接，适合 renderer reload/reconnect。[`src/vs/base/parts/ipc/electron-browser/ipc.electron.ts:28–38`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-browser/ipc.electron.ts:28) [`src/vs/base/parts/ipc/electron-main/ipc.electron.ts:31–60`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipc.electron.ts:31)

在正常 Workbench shutdown 路径中，`onDidShutdown` 会 dispose desktop main，进而 dispose 其中注册的 `ElectronIPCMainProcessService`/client，触发上述 disconnect；main 异常 KILL 则主动 dispose 整个 Electron IPC server。[`src/vs/workbench/electron-browser/desktop.main.ts:167–172`](/Users/aepkill/repos/vscode/src/vs/workbench/electron-browser/desktop.main.ts:167) [`src/vs/code/electron-main/app.ts:703–713`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:703)

Electron `Protocol.send()` 对“系统正在退出”时的 send 异常选择吞掉，通用 Channel 的 `sendBuffer` 也把 protocol send 失败变成长度 0。**【源码推断】** 在这条实现路径中没有看到 RPC 级版本字段、交付 ACK、重试或请求重放；新的 renderer 是通过新的 hello/context/initialize 序列重新建立会话。[`src/vs/base/parts/ipc/common/ipc.electron.ts:19–33`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.electron.ts:19) [`src/vs/base/parts/ipc/common/ipc.ts:373–391`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:373)

**【源码推断】** Electron `Protocol` 自身也没有 close/error event，main 在这组文件中定义的断线信号只有显式 `vscode:disconnect` 或同一 `WebContents.id` 再次 hello。因而可以确认 orderly dispose/reconnect 会清理 pending work，但不能仅凭此实现保证任意 renderer 崩溃都会立即让所有 pending call reject。[`src/vs/base/parts/ipc/common/ipc.electron.ts:19–33`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.electron.ts:19) [`src/vs/base/parts/ipc/electron-main/ipc.electron.ts:31–60`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipc.electron.ts:31)

## 5. 序列化与 marshalling

### 5.1 Channel 内层二进制格式

Channel 层不把整个请求直接交给 Electron structured clone，而是先用自己的 serializer 编成 `VSBuffer`：

- `undefined`、字符串、原生 `Buffer`、`VSBuffer`、数组、32 位整数有独立 type tag；
- 长度和整数使用 variable-length quantity；
- 数组递归编码，因此数组里的 `VSBuffer` 仍走原生二进制路径；
- 其余值用 `JSON.stringify` 编成 Object，接收端 `JSON.parse`。[`src/vs/base/parts/ipc/common/ipc.ts:169–209`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:169) [`ipc.ts:242–325`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:242)

这里“数组递归”与“普通对象整体 JSON”是有意区分的：顶层数组中嵌套的 Buffer/VSBuffer 会再次进入 type-tag 分支；普通对象内部嵌套的 buffer 则随整个对象进入 `JSON.stringify`，不会得到 Channel serializer 的独立二进制 tag。[`ipc.ts:268–301`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:268)

每帧始终依次编码 header 和 body；发送完成或序列化抛错后，`BufferWriter` 都会释放中间 buffers，避免错误栈长期引用大块数据。测试覆盖数值 round-trip、数组中的 buffers，以及循环对象导致 `JSON.stringify` 失败时客户端 Promise 正确拒绝和清理。[`ipc.ts:373–381`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:373) [`ipc.test.ts:375–440`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:375)

Electron transport 最终只发送 `message.buffer`；也就是说，Electron structured clone 搬运的是这块已编码 buffer，而不是原始方法参数图。[`src/vs/base/parts/ipc/common/ipc.electron.ts:19–28`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.electron.ts:19)

### 5.2 `ProxyChannel` 的对象 revival

普通 JSON 会丢失类原型。`ProxyChannel.fromService` 在调用真实服务前对参数执行 `revive`，`toService` 在返回调用结果时也执行 `revive`；源码给出的自动转换边界是 `URI` 和 `RegExp`。`disableMarshalling` 关闭这一层后，调用者必须显式使用如 `UriComponents` 这样的可传输形态。[`ipc.ts:1124–1142`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1124) [`ipc.ts:1197–1212`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1197) [`ipc.ts:1275–1283`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1275)

测试验证了 `URI` 经自动代理 round-trip 后仍是 `URI` 实例；也验证了 context 首参数注入。[`src/vs/base/parts/ipc/test/common/ipc.test.ts:519–524`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:519) [`ipc.test.ts:540–566`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:540)

## 6. Electron renderer↔main 的具体建连路径

### 6.1 main 侧组合根

`CodeApplication.startup()` 创建唯一的 `ElectronIPCServer`，在异常 kill 时提前 dispose。初始化服务后，`initChannels` 把真正的 main services 包成 channels 并注册；随后才设置 URL 回调等需要反向 renderer channel 的逻辑。[`src/vs/code/electron-main/app.ts:675–714`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:675) [`app.ts:740–758`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:740)

`initChannels` 是 main RPC 的主要 composition root。其模式包括：

- 手写 server channel：`policy`、`nativeManagedSettings`、文件系统、`update`、`storage`、`logger` 等；
- `ProxyChannel.fromService`：`userDataProfiles`、`process`、`encryption`、`sign`、`keyboardLayout`、`nativeHost`、`workspaces`、`url`、`webview`、pty、extension-host starter 等；
- 一部分 channel 同时注册到 shared-process client，但那是另一条 MessagePort 连接，不应当算作 Electron renderer↔main transport。[`src/vs/code/electron-main/app.ts:1313–1366`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1313) [`app.ts:1368–1422`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1368) [`app.ts:1428–1461`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1428)

### 6.2 renderer sandbox 与 client 创建

主窗口显式使用 VS Code preload，并启用 Electron sandbox。[`src/vs/platform/windows/electron-main/windowImpl.ts:697–719`](/Users/aepkill/repos/vscode/src/vs/platform/windows/electron-main/windowImpl.ts:697) [`src/vs/platform/windows/electron-main/windows.ts:142–165`](/Users/aepkill/repos/vscode/src/vs/platform/windows/electron-main/windows.ts:142)

preload 通过 `contextBridge.exposeInMainWorld('vscode', globals)` 暴露一个受限对象；renderer 获得的是 `send/invoke/on/once/removeListener` 等最小 IPC 子集，而不是完整 Electron API。所有这些入口先要求 channel 以 `vscode:` 开头。[`src/vs/base/parts/sandbox/electron-browser/preload.ts:16–22`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:16) [`preload.ts:93–147`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:93) [`preload.ts:250–255`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:250)

Workbench 初始化服务时创建 `ElectronIPCMainProcessService(windowId)` 并注入为 `IMainProcessService`。该服务内部创建 Electron `IPCClient('window:<id>')`，其 `getChannel/registerChannel` 只是转发给这条连接。[`src/vs/workbench/electron-browser/desktop.main.ts:174–203`](/Users/aepkill/repos/vscode/src/vs/workbench/electron-browser/desktop.main.ts:174) [`src/vs/platform/ipc/electron-browser/mainProcessService.ts:11–34`](/Users/aepkill/repos/vscode/src/vs/platform/ipc/electron-browser/mainProcessService.ts:11)

### 6.3 hello → context → initialize

完整握手按以下顺序发生：

```mermaid
sequenceDiagram
    participant R as "renderer workbench"
    participant P as "preload ipcRenderer facade"
    participant M as "Electron main Server"
    participant C as "generic IPCServer connection"

    R->>P: listen("vscode:message")
    R->>M: "vscode:hello"
    Note over M: bind WebContents.id scoped message/disconnect events
    R->>M: first vscode:message = serialize("window:<id>")
    M->>C: deserialize ctx; create ChannelServer + ChannelClient
    C-->>R: Initialize(200) from main ChannelServer
    R-->>C: Initialize(200) from renderer ChannelServer
    Note over R,C: both directions can now call/listen/register
```

renderer 的 Electron client 先安装 `vscode:message` listener，再发送 hello；构造通用 `IPCClient` 时，第一帧发送 `id` context，并创建本地 `ChannelClient`/`ChannelServer`。[`src/vs/base/parts/ipc/electron-browser/ipc.electron.ts:17–33`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-browser/ipc.electron.ts:17) [`src/vs/base/parts/ipc/common/ipc.ts:1020–1031`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1020)

main 监听 hello 后，以 `WebContents.id` 为 key 创建连接；`vscode:message` 与 disconnect 事件都通过 `event.sender.id === senderId` 过滤。通用 `IPCServer` 将该连接的第一条 message 单独解释为 `ctx`，之后才创建双向 channel client/server。[`src/vs/base/parts/ipc/electron-main/ipc.electron.ts:19–60`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipc.electron.ts:19) [`src/vs/base/parts/ipc/common/ipc.ts:847–864`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:847)

### 6.4 renderer 如何获得服务

renderer 常见的取用链路是：

```text
DI service
  → IMainProcessService.getChannel("channelName")
  → IChannel
  → ProxyChannel.toService(...) 或 new XxxChannelClient(channel)
  → 普通 TypeScript 服务接口
```

`registerMainProcessRemoteService` 把这一模式做成 DI 注册工具：`RemoteServiceStub` 先从 `IMainProcessService` 取 channel；若提供 `channelClientCtor` 就实例化手写 client，否则默认 `ProxyChannel.toService`。[`src/vs/platform/ipc/electron-browser/services.ts:13–31`](/Users/aepkill/repos/vscode/src/vs/platform/ipc/electron-browser/services.ts:13) [`services.ts:48–58`](/Users/aepkill/repos/vscode/src/vs/platform/ipc/electron-browser/services.ts:48)

## 7. 安全边界

### 7.1 renderer 侧

- 主窗口开启 `sandbox: true`，通过固定 preload 暴露能力。[`src/vs/platform/windows/electron-main/windows.ts:152–165`](/Users/aepkill/repos/vscode/src/vs/platform/windows/electron-main/windows.ts:152) [`src/vs/platform/windows/electron-main/windowImpl.ts:706–710`](/Users/aepkill/repos/vscode/src/vs/platform/windows/electron-main/windowImpl.ts:706)
- preload 只通过 `contextBridge` 暴露最小 IPC facade，并拒绝不以 `vscode:` 开头的 channel。[`src/vs/base/parts/sandbox/electron-browser/preload.ts:16–22`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:16) [`preload.ts:103–147`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:103) [`preload.ts:250–255`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:250)

### 7.2 main 侧

`validatedIpcMain` 包装 `ipcMain.on/once/handle`，执行三类检查：

1. Electron channel 必须以 `vscode:` 开头；
2. sender frame URL 的 host 必须是 `VSCODE_AUTHORITY`，开发模式下允许配置的 localhost；
3. sender 必须是主 frame，而非子 frame。

源码对 URL 缺失和 `about:blank` 有显式例外，分别用于 Playwright 测试和 DevTools reload。校验失败时事件不交给业务 listener；`handle` 返回 rejection。[`src/vs/base/parts/ipc/electron-main/ipcMain.ts:24–80`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipcMain.ts:24) [`ipcMain.ts:106–148`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipcMain.ts:106)

Channel transport 还按 `WebContents.id` 过滤每个 renderer 的 `vscode:message`，避免多个窗口共享同一 Electron channel 时串线。[`src/vs/base/parts/ipc/electron-main/ipc.electron.ts:19–24`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipc.electron.ts:19) [`ipc.electron.ts:33–59`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipc.electron.ts:33)

### 7.3 边界内仍然是受信 RPC，不是细粒度授权协议

通过以上 Electron 边界后，通用 `ChannelServer` 根据消息内的字符串 `channelName` 和 `command/event` 分派；它本身没有 capability token、每方法 ACL 或 schema 验证。手写 channel 用 `switch` 明确列出允许命令，`ProxyChannel` 则按服务属性名动态查找函数或 `onXxx` 事件。[`src/vs/base/parts/ipc/common/ipc.ts:394–428`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:394) [`ipc.ts:1171–1216`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1171)

物理 sender 身份由 Electron event 和 `WebContents.id` 约束；逻辑 `Connection.ctx` 则是 client 第一帧发送的值。实现事实是：源码在这一步不把 `ctx` 与 Electron window id 做二次校验。**【安全推断】** `ctx` 应被视为受信进程内部的路由标签，而不是不可信客户端的认证凭据；安全边界仍是此前的 sandbox/origin/main-frame/sender 校验。[`src/vs/base/parts/ipc/electron-main/ipc.electron.ts:33–59`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipc.electron.ts:33) [`src/vs/base/parts/ipc/common/ipc.ts:847–862`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:847)

还有一个容易被 TypeScript 接口掩盖的实现事实：`IPCServer.registerChannel` 会把一个 main channel 挂到所有当前及未来连接；`ProxyChannel.fromService.call` 不读取 TS interface allowlist，而是只要 `handler[command]` 在运行时是 function 就 `apply`。**【风险推断】** 一个已通过 Electron 边界的 renderer 因而能尝试调用该注册对象上所有 function-shaped 属性；敏感服务应暴露最小专用对象，或使用手写 `switch` channel 建立真正的命令白名单与参数验证。[`src/vs/base/parts/ipc/common/ipc.ts:853–861`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:853) [`ipc.ts:985–990`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:985) [`ipc.ts:1197–1216`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1197)

`validatedIpcMain` 的注释也明确把直接 Electron IPC 标为不鼓励，推荐在其上建立服务并使用 `ProxyChannel`。[`src/vs/base/parts/ipc/electron-main/ipcMain.ts:151–158`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipcMain.ts:151)

## 8. 三条具体服务的端到端路径

### 8.1 `nativeHost`：自动 ProxyChannel，方法 + 事件 + window context

这是自动代理的代表。

**main 注册：** `NativeHostMainService` 被作为 main DI service 创建；`initChannels` 用 `ProxyChannel.fromService` 包装并注册为 `nativeHost`。[`src/vs/code/electron-main/app.ts:1205–1212`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1205) [`app.ts:1390–1397`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1390)

**renderer 获取：** Workbench 的 `INativeHostService` 延迟 singleton 继承 `NativeHostService`；后者取 `mainProcessService.getChannel('nativeHost')`，用 `ProxyChannel.toService` 返回接口代理，并把当前 `windowId`：

- 作为每个方法的首参数注入；
- 作为本地只读 `windowId` property 返回，不做 RPC。[`src/vs/workbench/services/host/electron-browser/nativeHostService.ts:25–32`](/Users/aepkill/repos/vscode/src/vs/workbench/services/host/electron-browser/nativeHostService.ts:25) [`nativeHostService.ts:285–286`](/Users/aepkill/repos/vscode/src/vs/workbench/services/host/electron-browser/nativeHostService.ts:285) [`src/vs/platform/native/common/nativeHostService.ts:10–28`](/Users/aepkill/repos/vscode/src/vs/platform/native/common/nativeHostService.ts:10)

**真实入口示例：** renderer 的 `WorkbenchHostService.doOpenWindow` 最终调用 `this.nativeHostService.openWindow(toOpen, options)`；main 端 `NativeHostMainService.openWindow(windowId, ...)` 再调用 `windowsMainService.open`，并把调用者 window id 作为 `contextWindowId`。[`src/vs/workbench/services/host/electron-browser/nativeHostService.ts:118–141`](/Users/aepkill/repos/vscode/src/vs/workbench/services/host/electron-browser/nativeHostService.ts:118) [`src/vs/platform/native/electron-main/nativeHostMainService.ts:272–302`](/Users/aepkill/repos/vscode/src/vs/platform/native/electron-main/nativeHostMainService.ts:272)

**一次方法调用：** renderer 调 `nativeHostService.focusWindow(options)` 时，proxy 形成 `[windowId, options]`，发送 command `focusWindow`。main proxy revive 参数并执行 `NativeHostMainService.focusWindow(windowId, options)`；该方法以显式 target 或调用者 window id 找到窗口并聚焦。[`src/vs/base/parts/ipc/common/ipc.ts:1264–1279`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1264) [`src/vs/platform/native/electron-main/nativeHostMainService.ts:451–454`](/Users/aepkill/repos/vscode/src/vs/platform/native/electron-main/nativeHostMainService.ts:451)

**一次事件订阅：** `INativeHostService` 定义 `onDidFocusMainWindow` 等 `onXxx` 属性；proxy 的属性命名规则把它们识别为事件并发起 `channel.listen`。main service 将 Electron `browser-window-focus` 与窗口列表变化映射为 window id，事件值最终通过 `EventFire(204)` 回 renderer。[`src/vs/platform/native/common/native.ts:183–221`](/Users/aepkill/repos/vscode/src/vs/platform/native/common/native.ts:183) [`src/vs/base/parts/ipc/common/ipc.ts:1252–1262`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1252) [`src/vs/platform/native/electron-main/nativeHostMainService.ts:108–120`](/Users/aepkill/repos/vscode/src/vs/platform/native/electron-main/nativeHostMainService.ts:108)

这条路径展示了 ProxyChannel 的收益与代价：服务接口几乎原样跨进程，但命令名来自运行时属性、取消 token 不受支持，而且 window context 是业务参数注入，不是 transport 身份。

### 8.2 `update`：手写 Channel，显式命令表 + 客户端状态镜像

这是手写适配的代表。

**main 注册：** main 根据 OS 创建具体 `IUpdateService`，再构造 `UpdateChannel(updateService)` 并注册为 `update`。[`src/vs/code/electron-main/app.ts:1161–1181`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1161) [`app.ts:1351–1354`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1351)

**server channel：** `UpdateChannel.listen` 只允许 `onStateChange`；`call` 只允许 `checkForUpdates`、`downloadUpdate`、`applyUpdate`、`quitAndInstall`、`_getInitialState` 等显式命令，并逐个转发到真实服务。未知名字直接抛错。[`src/vs/platform/update/common/updateIpc.ts:11–37`](/Users/aepkill/repos/vscode/src/vs/platform/update/common/updateIpc.ts:11)

**renderer 获取：** `registerMainProcessRemoteService(IUpdateService, 'update', { channelClientCtor: UpdateChannelClient })` 告诉通用 remote-service stub 使用手写 client，而不是 `ProxyChannel`。[`src/vs/workbench/services/update/electron-browser/updateService.ts:6–10`](/Users/aepkill/repos/vscode/src/vs/workbench/services/update/electron-browser/updateService.ts:6) [`src/vs/platform/ipc/electron-browser/services.ts:17–31`](/Users/aepkill/repos/vscode/src/vs/platform/ipc/electron-browser/services.ts:17)

**真实入口示例：** 命令 `update.checkForUpdate` 的 action 从 DI 取 `IUpdateService` 并调用 `checkForUpdates(true)`；main 的 abstract service 检查当前状态后进入平台实现。以 Darwin 实现为例，最终调用 Electron `autoUpdater.checkForUpdates()`，状态变化则由 `setState` 发出并沿 `onStateChange` RPC 返回 renderer。[`src/vs/workbench/contrib/update/browser/update.contribution.ts:113–128`](/Users/aepkill/repos/vscode/src/vs/workbench/contrib/update/browser/update.contribution.ts:113) [`src/vs/platform/update/electron-main/abstractUpdateService.ts:120–140`](/Users/aepkill/repos/vscode/src/vs/platform/update/electron-main/abstractUpdateService.ts:120) [`abstractUpdateService.ts:404–412`](/Users/aepkill/repos/vscode/src/vs/platform/update/electron-main/abstractUpdateService.ts:404) [`src/vs/platform/update/electron-main/updateService.darwin.ts:111–136`](/Users/aepkill/repos/vscode/src/vs/platform/update/electron-main/updateService.darwin.ts:111)

**客户端行为：** `UpdateChannelClient` 构造时订阅远端 `onStateChange`，同时调用私有命令 `_getInitialState`；之后在 renderer 内维护同步的 `state` property 和本地 `onStateChange` emitter。业务方法再显式映射回对应的 `channel.call`。[`src/vs/platform/update/common/updateIpc.ts:39–89`](/Users/aepkill/repos/vscode/src/vs/platform/update/common/updateIpc.ts:39)

这条路径说明手写 ChannelClient 不只是“多写 switch”：它可以把异步远端状态塑造成符合本地接口的同步 property，并明确控制 wire contract。

### 8.3 `url` / `urlHandler`：renderer→main 后再由 main→指定 renderer

这是双向 channel 与多窗口路由的代表。

**renderer→main：** main 将自己的 `IURLService` 自动代理并注册为 `url`。renderer 的 `RelayURLService` 取这个 channel 并 `ProxyChannel.toService<IURLService>`；`open()` 遇到产品 URL protocol 时调用远端 `urlService.open(resource, options)`。[`src/vs/code/electron-main/app.ts:1411–1414`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1411) [`src/vs/workbench/services/url/electron-browser/urlService.ts:24–40`](/Users/aepkill/repos/vscode/src/vs/workbench/services/url/electron-browser/urlService.ts:24) [`urlService.ts:56–66`](/Users/aepkill/repos/vscode/src/vs/workbench/services/url/electron-browser/urlService.ts:56)

**renderer 暴露回调：** 同一个 `RelayURLService` 在 renderer 侧调用 `mainProcessService.registerChannel('urlHandler', new URLHandlerChannel(this))`。该手写 channel 只接受 `handleURL`，并在调用本地 handler 前 `URI.revive`。[`src/vs/workbench/services/url/electron-browser/urlService.ts:37–40`](/Users/aepkill/repos/vscode/src/vs/workbench/services/url/electron-browser/urlService.ts:37) [`src/vs/platform/url/common/urlIpc.ts:13–28`](/Users/aepkill/repos/vscode/src/vs/platform/url/common/urlIpc.ts:13)

**main 反向取 channel：** main 用 `mainProcessElectronServer.getChannel('urlHandler', urlHandlerRouter)` 获取一个“远端 renderer channel”，再以 `URLHandlerChannelClient` 注册到 main 的 URL service。ChannelClient 显式把 URI 转为 JSON components。[`src/vs/code/electron-main/app.ts:789–815`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:789) [`src/vs/platform/url/common/urlIpc.ts:30–37`](/Users/aepkill/repos/vscode/src/vs/platform/url/common/urlIpc.ts:30)

**选哪个 renderer：** renderer 创建 URL 时把 `windowId` 写进 query。`URLHandlerRouter` 优先解析该值，在 `hub.connections` 中寻找 `ctx` 匹配 `window:<id>` 的连接；找不到则委托 `StaticRouter` 选择当前 active window。[`src/vs/workbench/services/url/electron-browser/urlService.ts:43–53`](/Users/aepkill/repos/vscode/src/vs/workbench/services/url/electron-browser/urlService.ts:43) [`src/vs/platform/url/common/urlIpc.ts:39–90`](/Users/aepkill/repos/vscode/src/vs/platform/url/common/urlIpc.ts:39) [`src/vs/code/electron-main/app.ts:806–814`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:806)

**renderer 最终处理：** `RelayURLService.handleURL` 调本地 URL handlers；处理成功后再经 `nativeHost` RPC 强制聚焦对应窗口。[`src/vs/workbench/services/url/electron-browser/urlService.ts:68–80`](/Users/aepkill/repos/vscode/src/vs/workbench/services/url/electron-browser/urlService.ts:68)

端到端方向可以概括为：

```text
renderer A RelayURLService.open
  → main channel "url"
  → main IURLService
  → IPCServer.getChannel("urlHandler", URLHandlerRouter)
  → renderer A/B channel "urlHandler"
  → RelayURLService.handleURL
```

## 9. 与其他 IPC/RPC 的边界

### 9.1 直接 Electron IPC 不只是 bootstrap，也不是 Channel RPC

窗口配置和 shell environment 在 preload 启动早期直接用 Electron invoke：随机的 `vscode:<uuid>` 配置 channel 与固定的 `vscode:fetchShellEnv`。它们走 `validatedIpcMain.handle` 和 Electron 自带 request/reply，不经过 `vscode:message`、`IChannel`、请求码 100/201 或 `ProxyChannel`。[`src/vs/base/parts/sandbox/electron-browser/preload.ts:36–67`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:36) [`preload.ts:71–89`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:71) [`src/vs/platform/protocol/electron-main/protocolMainService.ts:159–185`](/Users/aepkill/repos/vscode/src/vs/platform/protocol/electron-main/protocolMainService.ts:159) [`src/vs/code/electron-main/app.ts:633–650`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:633)

直接 Electron IPC 并不限于 preload/bootstrap。窗口生命周期协议仍由 main 发送 `vscode:onBeforeUnload` / `vscode:onWillUnload`，并临时生成 `vscode:okN`、`cancelN`、`replyN` 等回复 channel；renderer 直接 `ipcRenderer.on/send` 收发。窗口控制也直接监听 `vscode:runAction`、`vscode:runKeybinding`、shared-process crash 等 push 事件。[`src/vs/platform/lifecycle/electron-main/lifecycleMainService.ts:580–615`](/Users/aepkill/repos/vscode/src/vs/platform/lifecycle/electron-main/lifecycleMainService.ts:580) [`src/vs/workbench/services/lifecycle/electron-browser/lifecycleService.ts:33–76`](/Users/aepkill/repos/vscode/src/vs/workbench/services/lifecycle/electron-browser/lifecycleService.ts:33) [`src/vs/workbench/electron-browser/window.ts:157–205`](/Users/aepkill/repos/vscode/src/vs/workbench/electron-browser/window.ts:157)

所以应使用三分法理解 Electron 相关流量：服务 RPC 是 `vscode:message` 内的 Channel 帧；特定生命周期/窗口语义仍可能各自使用直接 `vscode:*` Electron channel；MessagePort 则先借 direct IPC + nonce 转移端口，之后在端口上运行 Channel RPC 或 extension-host `RPCProtocol`。

### 9.2 renderer↔shared process：同一 Channel 框架，不同 MessagePort transport

`SharedProcessService` 等到 Workbench restored（或 2 秒超时）后获取 `MessagePort`，创建通用 `MessagePortClient('window:<id>')`；其 `getChannel/registerChannel` 与 main process service 形似，但目的端是 shared utility process。[`src/vs/workbench/services/sharedProcess/electron-browser/sharedProcessService.ts:16–67`](/Users/aepkill/repos/vscode/src/vs/workbench/services/sharedProcess/electron-browser/sharedProcessService.ts:16)

MessagePort 的 `Protocol` 仍实现同一个 `IMessagePassingProtocol`，但底层是 `postMessage/onmessage`，关闭方式是 `port.close()`，不是 Electron 的 hello/message/disconnect 三 channel。[`src/vs/base/parts/ipc/common/ipc.mp.ts:37–86`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.mp.ts:37)

因此 `app.ts` 中“同一个 channel 也注册到 `sharedProcessClient`”表示复用服务适配器和 Channel 线协议，不表示 shared process 流量经过 renderer↔main 的 Electron `vscode:message` 连接。[`src/vs/code/electron-main/app.ts:1328–1349`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1328)

### 9.3 extension host：另一套 `RPCProtocol`

Workbench↔extension host 使用 `src/vs/workbench/services/extensions/common/rpcProtocol.ts` 的 `RPCProtocol`。它虽然也消费 `IMessagePassingProtocol`，但有独立的 actor/proxy identifier、响应性检测、消息格式、URI transformer 与 buffer-reference JSON 编码；不是本文的 `ChannelClient/ChannelServer/ProxyChannel` 协议。[`src/vs/workbench/services/extensions/common/rpcProtocol.ts:35–95`](/Users/aepkill/repos/vscode/src/vs/workbench/services/extensions/common/rpcProtocol.ts:35) [`rpcProtocol.ts:115–160`](/Users/aepkill/repos/vscode/src/vs/workbench/services/extensions/common/rpcProtocol.ts:115) [`rpcProtocol.ts:182–231`](/Users/aepkill/repos/vscode/src/vs/workbench/services/extensions/common/rpcProtocol.ts:182)

主线程与扩展宿主的接口由大量 `MainContext` / `ExtHostContext` proxy identifiers 定义；两端分别在 `extensionHostManager` 和 `extensionHostMain` 构造 `RPCProtocol`。[`src/vs/workbench/api/common/extHost.protocol.ts:4043–4055`](/Users/aepkill/repos/vscode/src/vs/workbench/api/common/extHost.protocol.ts:4043) [`extHost.protocol.ts:4135–4145`](/Users/aepkill/repos/vscode/src/vs/workbench/api/common/extHost.protocol.ts:4135) [`src/vs/workbench/services/extensions/common/extensionHostManager.ts:258`](/Users/aepkill/repos/vscode/src/vs/workbench/services/extensions/common/extensionHostManager.ts:258) [`src/vs/workbench/api/common/extensionHostMain.ts:176`](/Users/aepkill/repos/vscode/src/vs/workbench/api/common/extensionHostMain.ts:176)

### 9.4 第二实例→第一实例：同一 Channel 框架，不同 Node IPC transport

`launch` 和 `diagnostics` 被注册到 `mainProcessNodeIpcServer`，专供第二个应用实例连接第一个实例；源码注释明确说明 Electron IPC 在这里不适用。第二实例仍可用 `ProxyChannel.toService`，但底层是 Node IPC socket，不是 renderer↔main。[`src/vs/code/electron-main/app.ts:1313–1326`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1313) [`src/vs/code/electron-main/main.ts:432–440`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/main.ts:432)

## 10. 设计判断

### 优点

- **transport 与服务协议解耦。** 同一个 `IServerChannel` 可以挂到 Electron、MessagePort 或 Node socket；应用服务不需要依赖 Electron。[`src/vs/base/parts/ipc/common/ipc.ts:99–127`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:99) [`src/vs/base/parts/ipc/common/ipc.mp.ts:37–71`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.mp.ts:37)
- **同一连接原生双向。** renderer 可注册 channel，main 可按 `ctx` 路由，URL 回调不需要另建一套 IPC。[`src/vs/base/parts/ipc/common/ipc.ts:820–879`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:820)
- **Promise 与 Event 有统一生命周期。** request id、初始化屏障、订阅/退订、协作式取消和连接 dispose 都在框架层实现，而非散落到每个服务。[`ipc.ts:332–530`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:332) [`ipc.ts:542–807`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:542)
- **允许在便利和显式 wire contract 之间选择。** 大量简单服务使用 ProxyChannel；update、URL、文件系统等需要状态塑形或参数控制的服务手写 channel。[`src/vs/code/electron-main/app.ts:1313–1461`](/Users/aepkill/repos/vscode/src/vs/code/electron-main/app.ts:1313)
- **核心服务 RPC 的 Electron 攻击面集中。** renderer 只看到 preload facade，main 统一做来源与 frame 校验；大部分 main service 不必各自管理 Electron request/reply。生命周期与窗口 push 仍保留少量直接 `vscode:*` channel，如 9.1 所示。[`src/vs/base/parts/sandbox/electron-browser/preload.ts:103–147`](/Users/aepkill/repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:103) [`src/vs/base/parts/ipc/electron-main/ipcMain.ts:106–158`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipcMain.ts:106)

### 明确的取舍/限制

- `ProxyChannel` 依赖属性名约定，事件必须是 `onXxx` / `onDynamicXxx`；它不支持 CancellationToken，自动 revival 只承诺 URI/RegExp。[`src/vs/base/parts/ipc/common/ipc.ts:1119–1131`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1119) [`ipc.ts:1291–1299`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1291)
- 通用 object body 仍受 JSON 约束；循环对象会失败，类原型需要上层 revival 或显式 DTO。[`ipc.ts:268–325`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:268) [`src/vs/base/parts/ipc/test/common/ipc.test.ts:409–440`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/test/common/ipc.test.ts:409)
- RPC 内层没有独立授权模型。尤其 `ProxyChannel.fromService` 没有 runtime 方法 allowlist：TypeScript interface 不参与授权，accepted renderer 的可调用面由 main 实际注册的对象决定，任何 function-shaped `handler[command]` 都会被 `apply`。安全假设建立在 sandbox preload、origin/main-frame 校验和可信 Workbench renderer 上；敏感面应使用最小对象或手写 channel 做命令白名单、参数验证和显式转换。[`src/vs/base/parts/ipc/electron-main/ipcMain.ts:106–148`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipcMain.ts:106) [`src/vs/base/parts/ipc/common/ipc.ts:1197–1216`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1197) [`src/vs/platform/url/common/urlIpc.ts:13–28`](/Users/aepkill/repos/vscode/src/vs/platform/url/common/urlIpc.ts:13)
- Electron transport 对退出期 send 错误选择容忍，并用 dispose/reconnect 清理会话，而不是提供交付确认或自动重试。[`src/vs/base/parts/ipc/common/ipc.electron.ts:19–33`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.electron.ts:19) [`src/vs/base/parts/ipc/electron-main/ipc.electron.ts:31–60`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipc.electron.ts:31)

## 11. 一次 renderer→main 调用的压缩心智模型

以 `nativeHost.focusWindow(options)` 为例：

1. renderer DI 返回的其实是 `ProxyChannel.toService` 生成的 JS Proxy；
2. Proxy 把调用变成 `channel.call('focusWindow', [windowId, options])`；
3. `ChannelClient` 编码 `[100, requestId, 'nativeHost', 'focusWindow'] + argsBody`；
4. Electron Protocol 用 `ipcRenderer.send('vscode:message', buffer)` 发给 main；
5. main transport 按 sender id 过滤，`ChannelServer` 解码并找到 `nativeHost`；
6. `ProxyChannel.fromService` revive 参数并调用 `NativeHostMainService.focusWindow(windowId, options)`；
7. 结果编码为 `[201, requestId] + body`，经同一 `WebContents` 返回；
8. renderer `ChannelClient` 用 request id settle 原 Promise。

对应代码入口依次是：[`nativeHostService.ts:15–27`](/Users/aepkill/repos/vscode/src/vs/platform/native/common/nativeHostService.ts:15)、[`ipc.ts:1264–1279`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1264)、[`ipc.ts:580–633`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:580)、[`ipc.electron.ts:19–28`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.electron.ts:19)、[`electron-main/ipc.electron.ts:19–60`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/electron-main/ipc.electron.ts:19)、[`ipc.ts:394–455`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:394)、[`ipc.ts:1197–1216`](/Users/aepkill/repos/vscode/src/vs/base/parts/ipc/common/ipc.ts:1197)、[`nativeHostMainService.ts:451–454`](/Users/aepkill/repos/vscode/src/vs/platform/native/electron-main/nativeHostMainService.ts:451)。
