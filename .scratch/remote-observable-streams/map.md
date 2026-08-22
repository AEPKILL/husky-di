# Wayfinder 地图：为 Remote RPC 引入可恢复 Observable 流

Label: wayfinder:map
Status: open

## Destination

清除 @husky-di/remote 为远程方法返回的 RxJS Observable 与可直接观察的远程 Observable 属性提供生产级支持前仍需作出的全部产品与架构决策。地图完成后，规范编写者应能原子改写现有 husky-di-rpc/1、caller-facing/Protocol Interface、wire assets 与验证契约，并移除 resolveAll()，而无需再发明行为、边界或权衡。

## Notes

- 权威领域词汇以根目录的 [CONTEXT.md](../../CONTEXT.md) 为准；领域词汇在相应 decision ticket 解决时同步更新。
- 每个决策会话都应使用 grilling、domain-modeling、codebase-design 和 ponytail；prototype ticket 还应使用 prototype，research ticket 应使用 research。
- [协议可替换的双向 RPC 框架](../remote-rpc-framework/map.md) 是现有 unary、Recovery、资源、安全与关闭保证的决策来源；其“streaming 不在 v1 范围内”和保留 resolveAll() 的边界由本地图有意重新打开。
- 本地图只完成规划与规范路线，不实施生产代码。后续代码变更必须使用 husky-di-code-standard，并在同一变更中更新 normative specification 与 matching specification.test.ts coverage。
- RxJS Observable 是唯一新增的 application-stream Interface。不支持 Observable 参数、AsyncIterable、ReadableStream、Promise-wrapped 或嵌套 Observable，也不提供 Subject 专属远程写入能力。
- 流成员只有两种：返回直接 Observable 的方法，以及 Descriptor 显式 allowlist 的只读 Observable 属性，例如 remote.message$。
- 返回 Observable 的远程方法是 cold 的：调用方法只创建本地 Observable；每次 subscribe 独立启动一次远程方法执行与 source subscription。
- 每次本地 subscribe 拥有一个独立远程订阅；unsubscribe 必须传播远端 teardown。Framework 不隐式 share、cache 或 replay，source 的 hot/cold/replay 行为由 application 决定。
- Framework 必须提供逐项有序、无静默丢弃、有限内存的隐藏式流控；不增加 caller-facing request(n) Interface。容量无法维持时必须以明确终止收敛。
- 同一 Logical Session 成功 Recovery 后，远程 source subscription 与订阅身份保持不变；未确认的 item/terminal 可重放，但本地 observer 不得看到重复或乱序。
- 远程 source error 不传输 raw Error、message、stack 或 cause；caller 只看到安全的 RpcException(handler-failed)，可预期的领域失败仍作为 Application Value 建模。
- 活跃远程订阅属于 graceful drain；shutdown() 等待其 complete/unsubscribe 直到现有绝对 deadline，随后走 force teardown。
- 每个远程订阅只产生 payload-free 的 started/finished 生命周期 observation；公共 telemetry 不逐项发事件。
- 保持 profile identifier husky-di-rpc/1，把当前 unary profile 视为未发布草案并原地整体替换；不兼容当前草案 wire，不新增 v2 或桥接层。
- 从公开 Interface 移除 resolveAll() 与 Remote Service Group 路线；多 peer 调用和 Observable 组合由 peers/peers$、peer.resolve()、Array.prototype.map() 与 RxJS 完成。
- 所有当前相关表面都必须闭合：Descriptor、exposure、single-peer facade、errors、events、Recovery、resources、shutdown、custom Protocol SPI、Transport seam、conformance、wire corpus、browser/package evidence 与文档。

## Decisions so far

## Not yet specified

- 若有界流控或资源核算无法完全隐藏，caller-facing policy/options 的必要最小形状；只有流控与资源 tickets 解决后才能判断是否需要。
- 若现有 RpcException/RpcEvent closed unions 无法表达 source、overflow、teardown 与 force outcomes，所需新 discriminant/code 的精确集合。
- 若现有 complete-message Transport seam 无法承载所选流控与 load conformance，需要增加的最小 Adapter 契约；当前不预设新 capacity getter。
- 若固定 v1 profile 与本地 policy 无法安全建立一致的 credit/window，是否需要新的 bootstrap 固定参数或 profile fingerprint。

## Out of scope

- 本地图内的 production implementation、规范正文改写、specification.test.ts 实施和 implementation ticket 切片。
- Observable 输入参数、client-streaming、duplex streaming 与 remote Observable capability passing。
- 新的 Remote Service Group、Group streaming 或 resolveAll() 替代 facade；移除既有 resolveAll() 本身在范围内。
- AsyncIterable、ReadableStream、Promise-wrapped/nested Observable 与 Subject mutation Interface。
- Framework 隐式 share、cache、application-level replay，或独立 notification primitive。
- husky-di-rpc/2、与当前 unary 草案兼容的桥接层、双 profile 运行模式或滚动混跑保证。
- wire fragmentation、超过既有单项 Application Value/message 上限的 stream item。
- 具体 WebSocket 或其他 Transport Adapter 包的 production 改造。
- 业务认证、授权、限流、payload diagnostics，以及 raw application error 跨线。
- 进程重启后的持久化 Stream Recovery、exactly-once 外部副作用和第二语言 SDK 实现；跨语言 wire contract 仍在范围内。
