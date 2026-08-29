# 界定 v1 草案原地改写与 resolveAll() 移除边界

Type: grilling
Status: resolved
Blocked by:
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在 profile identifier 保持 husky-di-rpc/1、当前 unary wire 草案不受兼容保证、公开 resolveAll() 路线确定移除的前提下，精确界定旧/新 package 构建混跑、滚动部署、既有 retained Session、fresh/resume、wire assets 与 source compatibility 的边界；记录本次 proposal 原地替换如何有意取代现有“新增 semantic kind 必须新 profile”的规则，并决定 package/README/CHANGELOG 应怎样表达。同步确定 Remote Service Group、RpcPeerResult 及相关 exports/tests/examples 的去留，以及 peers.map(peer => peer.resolve(...)) 作为显式组合路线需要承诺什么、不承诺什么。

## Answer

### 一次性原地替换与版本边界

- Profile identifier 保持 `husky-di-rpc/1`。当前 unary grammar、semantic contract 与 corpus 是首次公开稳定版之前的未发布草案；最终 Observable-streaming contract 在相同 identifier 和相同 package asset paths 上原地整体取代它，不创建 `husky-di-rpc/2`。
- 这是仅适用于首次 `@husky-di/remote@1.0.0` 发布前的一次性草案替换，不是已发布 Profile 的演进先例。最终 `/1` 发布后，同一 Profile 仍只能增加旧 endpoint 可安全忽略的 optional fields；新增 semantic kind、required transition、改变已知字段含义或 mandatory guarantee 必须使用新 Profile。
- npm package 的占位版本仍从 `0.0.0` 首发为 `1.0.0`，不虚构一次 `2.0.0` 迁移。互操作身份是最终 RPC Protocol Profile contract，而不是完全相同的 package build；不同版本或第三方实现只要宣称 `husky-di-rpc/1`，就必须符合最终完整 contract。

### Wire、Session 与部署兼容边界

- 旧 unary 草案不再被视为受支持的 `husky-di-rpc/1` conformer。旧/新草案在任一方向均不保证 fresh、resume、retained Session continuity、仅使用 unary 子集时的互操作，或在 bootstrap 阶段干净拒绝。
- 同名 Profile 的现有 bootstrap 没有 build/schema fingerprint；旧新混跑可能先接受 fresh/resume，随后在未知 semantic kind 或 state transition 上 Protocol fault。该混跑行为不进入 normative contract，也不获得专属错误、交付或 non-execution guarantee。
- 旧草案创建的 retained Session、proof、cursor、replay 与 call evidence 不迁移到最终 contract。部署切换必须先 drain 或 terminate 旧 Session，再同时替换所有相互通信的 endpoints，最后建立 fresh Session；滚动混跑不受支持。
- 不增加 fingerprint、capability negotiation、dual-profile mode、bridge、legacy Codec、runtime warning 或 migration mechanism。最终 `/1` conformers 之间仍必须按最终 contract 支持 fresh 与同一 retained Session 的 resume，且该保证不要求 package build 完全一致。

### Wire assets、package 与文档表达

- `wire/husky-di-rpc-1` 下的 schema、raw vectors、stateful transcripts、security known-answer vectors、requirement matrix 与 conformance evidence 在现有 export paths 原地整体替换。发布包不保留 legacy corpus、旧 schema alias、compatibility runner 或归档 subpath；Git history 足以保存被替换的草案。
- 最终 normative specification 只定义新的 `/1` contract，并重新确立发布后的 Profile evolution rule；本 ticket 唯一保存为什么本次允许原地取代旧规则的历史决策。
- README 应简短告知 commit-pinned 草案使用者：结束旧 Session、同时升级通信 endpoints、fresh reconnect；不宣称迁移路径。现有 `1.0.0` CHANGELOG 与 pending Changeset 应描述最终 caller/wire surface，并明确旧 unary 草案的 source、wire 与 Session 不兼容，而不是新增虚构的 `2.0.0` release。

### 删除 Remote Service Group 路线

- 从 caller-facing Interface 删除 `IRpcAcceptor.resolveAll()`，删除内部 `RemoteServiceGroup`、`RemoteGroupMethod`、Group invocation implementation，以及唯一服务该路线的公开 `RpcPeerResult` export/type。
- 同步删除或改写 Group-specific normative clauses、requirement rows、type/runtime/package tests、README 示例与其他文档引用；不保留 deprecated alias、shim 或替代 facade。权威 `CONTEXT.md` 不再定义 `Remote Service Group`。
- 不机械删除仍服务单-peer 调用或 telemetry 的共享表面：`RpcCallStatusEnum`、`createRpcFacade`、peer reservation/commit machinery 继续按其剩余用途判断。

### 显式多 Peer 与 Observable 组合

- Framework 只承诺 frozen `acceptor.peers` membership snapshot、replay-latest `acceptor.peers$`、稳定 `RpcPeer`、`peer.resolve()`，以及每个独立 unary call 或 Application Stream 的契约。
- Application 使用 `Array.prototype.map()`、`Promise.all()` / `Promise.allSettled()` 与所选 RxJS flattening/composition operators 显式决定 peer eligibility、filter/order、并发、取消、错误聚合、`{ peer, result }` 关联和 subscription lifetime。
- 这些组合不继承旧 Group 的 once-only common normalization、all-children atomic reservation、统一 abort listener、Framework-selected `connected | recovering` eligibility、wait-all outer Promise、snapshot-order frozen peer-associated results 或任何 Group-level resource/fairness semantics。
- README 可以提供两个非规范性配方：一次 `peers` snapshot 上的 unary Promise 组合，以及由 application 明确选择 RxJS operator 的动态 `peers$`/Remote Observable 组合；配方不得提升为新的公共 helper 或 normative Group contract。

本决议未产生新 ticket，也未使现有 fog 提前毕业；后续 Descriptor/facade prototype、wire state machine、verification 与最终 Interface tickets 分别消费这些边界。
