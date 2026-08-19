# 验证稳定 Remote Service Group 的批量语义

Type: prototype
Status: resolved
Blocked by: 08, 09, 11
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

`resolveAll()` 返回的稳定 Remote Service Group 应如何在每次方法调用时截取 eligible `RpcPeer` 快照，并对加入、终止或正在 Recovery 的 Peer、空集合、稳定 snapshot/result 顺序、per-peer success/failure、aggregate cancellation 和调用期间的 Session 变化给出可预测语义？产出面向使用者的 prototype，验证稳定 group proxy 与每项结果关联稳定 `RpcPeer` 的 Interface 是否足够深且没有隐藏集合状态。

## Answer

保留 `IRpcAcceptor.resolveAll(descriptor)`，但 Remote Service Group 只做 Framework-level
composition：一次 common preflight、一次 membership snapshot、N 个普通 unary child attempts 与
一个稳定结果数组。它不是新的 wire call kind，不进入 Protocol SPI，不拥有另一套 retry、state、
event、lifecycle 或 resource ownership。

可编译 TypeScript 与交互状态 prototype 固化于
`codex/prototype-remote-service-group@124ec9a`。它是本决策的 design evidence，不是生产导出或
runtime Implementation。

### Stable facade 与 Interface

- `resolveAll()` 返回 service-shaped `RemoteServiceGroup<T, Definitions>`；只暴露 Descriptor
  allowlist 中的 remote Promise methods。每个 method 返回
  `Promise<readonly RpcPeerResult<Awaited<Result>>[]>`；cancelable method继续只追加issue 04决定的
  required trailing `AbortSignal | undefined` control slot，显式 `undefined`表示不取消。
- Group 是稳定 facade：创建本身不读取 membership、不启动调用、不持有上一次 snapshot。重复
  `resolveAll()` 不保证同一 object identity，但任何已返回 group 都可长期复用。
- Group 不公开 `peers`、`size`、iterator、`refresh()`、`close()`、state 或 event；当前集合仍只由
  `acceptor.peers/peers$` 表达。Method closure 不依赖 `this`，可安全解构调用。
- `then` 在 Descriptor type/runtime 与 wire grammar 中保留，Group type 额外声明 `then?: never`；
  runtime 以 frozen null-prototype object 和 allowlist method closures 构造，不需要动态 Proxy。
  `group.then` 必须为 `undefined`，`await group`、async return 与 `Promise.resolve(group)` 都保留
  原 group identity。

### Common preflight 与 snapshot linearization

每次 group method invocation 在创建任何 child 前执行一次 common preflight，顺序沿用 unary 票：

1. 对cancelable method验证required dedicated `AbortSignal | undefined` control slot及平台brand；失败使
   outer Promise异步reject `TypeError`；
2. already-aborted signal 使 outer Promise reject `RpcError(canceled)`，不读取 args、不创建 child；
3. Owner 已越过 shutdown admission cutoff 时 reject `RpcError(unavailable)`，不把关闭伪装成空集合；
4. Application Value 只 normalize/snapshot 一次；失败使 outer Promise reject `TypeError`；
5. 原子截取 membership 并完成 group/child capacity reservation；common reservation 失败不允许部分
   fan-out，精确 error 与 budget 由 issue 13 定义。

Snapshot `S` 是该线性化点对 `acceptor.peers` 按原 membership顺序做一次 eligible filter所得的完整
immutable array；只包含 `connected | recovering` peers。Retained recovering peer仍可接纳 Pending
Invocation，因此必须纳入；closed peer已在同一 terminal mutation中移出；因 Protocol counter
exhaustion而 draining的 peer可在 active Owner membership中暂留，但不进入 `S`。Owner自身进入
draining后，新 group invocation在 common preflight即 `unavailable`，绝不 snapshot或新增 child。
Active owner 的 `S.length ===
0` 在 common value validation 后异步 fulfill frozen `[]`，不产生 call event、Pending Invocation、
wire identity 或 per-call capacity。

### Stable order、membership 与 Session races

- Acceptor membership 以 fresh Session admission 顺序排列；新 peer 追加，Recovery/replacement 不
  换位，terminal removal 只删除本项而不重排其他 peer。无需公开 ordinal 或按 `sessionId` 排序。
- Snapshot 后加入的 peer不参与本次 invocation。Snapshot 后 terminal 的 peer仍保留原 result
  slot，并由普通 child call 的 admission/evidence 决定 `unavailable` 或 `outcome-unknown`；不能从
  result 中静默消失。
- Recovering-to-connected、connected-to-connected replacement 与调用期间再次 recovering 都保留
  stable peer、child identity 与 result index。Child 实际完成顺序不影响最终 array 顺序。

### Per-peer result 与 partial success

Common preflight 成功后，`S[i]` 恰好对应一个普通 unary child attempt和最终
`RpcPeerResult[i]`：

```text
RpcPeerResult<T>
  = { peer, status: "fulfilled", value: T }
  | { peer, status: "rejected", reason: RpcError }
```

Result entry、array 与 `peer` association 都是 immutable；rejected entry 复用该 child Promise / 同侧
`call-finished` 的同一个 `RpcError` object。Caller raw-value `TypeError` 已由 common preflight 在 outer
Promise 上处理，因此不会伪装成 per-peer result。一个 child 的 failure 不 reject outer Promise、
不回滚其他 child；outer Promise 在所有 child caller-side terminal 后 fulfill完整有序数组。Group
不承诺跨 peers atomic admission、execution 或 application effects。

### Aggregate cancellation

- Cancelable group method 对外部 signal 只注册一个 listener，再把 abort fan out 到尚未 caller-side
  terminal 的 child cancellation handles；避免 N 个 public listeners 与 Node listener warning。
- Listener使用issue 11的captured EventTarget intrinsics，并在全部children commit、安装listener后以
  AbortSignal intrinsic二次检查；窗口内abort向全部尚未terminal children fan out，不为每个child
  读取或订阅caller signal。
- Group在截取membership或创建child前先要求至少一个actual argument，再剥离并brand-check dedicated
  control slot；零actual argument或fake signal使outer Promise异步reject `TypeError`，不读取business
  args。Type layer拒绝省略slot，传 `undefined`不注册listener。
- Abort 不 fail-fast outer Promise。先前完成的 child 保留原 outcome；abort 赢得 terminal race 的
  child 产生 `rejected/canceled`；outer Promise 仍等待每项 caller-side terminal 并 fulfill完整数组。
- 全部 child caller-side terminal 后移除 group listener。`AbortSignal.reason` 不上 wire；late remote
  terminal 仍按每个 child 的 ACK/GC 规则处理，不改变已返回 result。
- Non-cancelable method 不增加 group-only cancellation parameter。

### Complexity boundary

Group 复用普通 call state 和 issue 13 的 scheduler，只证明 single snapshot、single normalization、
stable association、partial result 与 aggregate listener。明确不增加 batch message、group call id、
group event、group retry、target filter 或公开 scheduler。

三种 Interface 已独立比较：删除 Group 并使用 `peers + Promise.allSettled()` 最省代码，但无法集中
保证一次 normalization、typed peer association、aggregate listener 与统一容量；显式
`fanOut(descriptor).call("method", ...)` 消除 service-shaped facade，却增加 string selector 和类型
helpers。Frozen allowlist facade 已无动态 Proxy/thenable 风险，并保留直接 method refactoring，因此
维持既有 `resolveAll()` 是当前 scope 的更深且更小选择。

### Verification

Prototype 已通过：

- `pnpm exec biome check packages/remote/examples/user-facing-rpc-interface`
- `pnpm --filter @husky-di/remote typecheck`
- `git diff --check`
- Chrome headless load/render of `remote-service-group.prototype.html`

Type probes覆盖 method/argument/result/cancellation inference、`then` rejection 与 Promise
assimilation；交互 scenarios 覆盖 recovering inclusion、join-after-snapshot、terminal-after-snapshot、
reverse completion、empty membership 与 mixed cancellation outcome。最终 production acceptance
仍由 issue 15/19 定义。
