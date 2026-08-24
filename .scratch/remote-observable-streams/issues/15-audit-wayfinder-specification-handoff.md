# 审计 Observable 流 Wayfinder 并交接规范

Type: task
Status: resolved
Blocked by: 14
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

在所有 decision/research/prototype tickets 完成后，审计本地图是否已清空 Not yet specified、每个 child 可达且恰好索引一次、blocking graph 无环、所有 user standing constraints 与旧 unary decisions 的保留/取代关系一致，并确认 CONTEXT.md、caller-facing Interface、Protocol SPI、husky-di-rpc/1 wire、Recovery/resources/shutdown、telemetry、conformance、resolveAll removal 和 release evidence 均有唯一权威决策来源。只有当规范编写者可以在不补做产品或架构决定的前提下改写 SPECIFICATION.md、REQUIREMENTS.md、wire assets 与 matching specification.test.ts route 时，才解决本票并关闭地图。

## Comments

### 2026-08-23 — Candidate Wayfinder audit and specification handoff

这是待对手复核的候选审计，不是 resolution。Ticket 15 保持 **Status: claimed**；本 Comment
不修改地图、不关闭本票，也不声称 production 已实现。审计范围是当前 map、15 个 child tickets、
Tickets 01–14 的全部 Answer 与全部 candidate/final Comments、根 CONTEXT，以及 Ticket 14 锁定的
legacy specification 基线和 evidence contract。

#### 1. 地图、child、blocking 与链接的机械审计

机械结果：

- child 节点恰为 01–15，共 **15** 个；编号、文件、标题和 Parent 都唯一，且 Parent 全部回指同一 map。
- Blocked by 总边数为 **49**。逐票 blocker 邻接表为：

~~~text
01=[]
02=[]
03=[]
04=[01,02,03]
05=[02,04]
06=[01,02,05]
07=[01,02,05,06]
08=[05,06,07]
09=[05,07,08]
10=[02,05,09]
11=[04,05,06,07,08,09]
12=[03,05,06,07,08,09]
13=[03,04,05,06,07,08,09,10,11,12]
14=[03,10,11,12,13]
15=[14]
~~~

- 以上为 DAG；01,02,03 是且仅是 roots；01→02→…→15 是一个合法 topological
  enumeration，所有 15 个 child 均从至少一个 root 可达，没有 self-edge、重复 edge、缺失 blocker
  或指向非 child 的 edge。
- Tickets 01–14 均为 resolved，且各有恰好一个 Answer；它们各在 map 的 Decisions so far 中
  以匹配标题和匹配路径恰好索引一次。Ticket 15 为 claimed、没有 Answer，按 Wayfinder 的 map-index
  规则不应进入 Decisions so far；因此不存在 resolved child 漏索引，也不存在重复索引。
- map 的 Not yet specified 区段为空；Out of scope 与 Destination 边界完整，没有仍待毕业的 fog。
- map 与 Tickets 01–15 共解析 **94** 个本地 Markdown links，落到 **32** 个 distinct targets；
  缺失 target 为 0。四个显式 anchor 均命中实际 heading；没有悬空 prototype、research、ticket、
  map、CONTEXT 或 cross-effort authority link。
- 状态/正文一致：14 个 resolved 对应 14 个 Answer 和 14 个 map index；唯一未 resolved child
  是本票，且 blocker 14 已 resolved。map 保持 open 与本票尚待复核的事实一致。

所以 topology/index/link/status/fog 五项审计均为 PASS。

#### 2. Tickets 01–14 的 standing constraints 与覆盖顺序

以下约束全部仍 standing，规范作者不得重新选择：

1. **Ticket 01** 固定外部事实边界：RxJS 是 push/cancel、没有 demand/ACK；有限内存、任意不可暂停
   producer、任意时长无损三者不能同时无条件成立。Credit、receipt/replay 和 retained bytes 必须分层。
2. **Ticket 02** 固定领域模型：每次 subscribe 是独立 Logical Stream Subscription；owning Remote
   Observable 与 non-owning Observation Stream 分离；Local/Outgoing/Remote/Source/Item admissions、
   terminal、teardown、retirement 是不同 lifetime。CONTEXT.md 是词汇权威。
3. **Ticket 03** 固定唯一的 pre-1.0 例外：保持 husky-di-rpc/1，但整体原地取代未发布 unary 草案；
   不兼容旧 build/Session/corpus，不设 v2、fingerprint、bridge 或 dual mode。删除 resolveAll、
   Remote Service Group 与 RpcPeerResult，无 alias/shim/replacement facade；多 peer 组合归 application。
4. **Ticket 04** 固定 mixed members Descriptor 与 single-peer facade：unary、stream-method、
   stream-property 共用 exact namespace；then 保留；只允许 direct Observable；property required/readonly/$；
   stream 无 AbortSignal；facade frozen/null-prototype/non-thenable，method/property read state-neutral，
   每次 subscribe cold 且独立。
5. **Ticket 05** 固定 Route Capture、Remote Admission、Source Start Job、exactly-once source acquisition/
   subscribe、同步/重入 first-winner、ordered items-before-terminal、explicit unsubscribe cancel authority、
   one-shot teardown 与安全 error projection；unknown-method 由 unknown-member 取代，raw Error 永不跨线。
6. **Ticket 06** 固定隐藏式 item-count admission credit、cumulative horizon、非零 initial grant、Observer
   next 安全同步返回后的 re-arm，以及 zero-credit/ordinary-capacity emission 的显式 overflow；
   不新增 request(n)、public window、processing ACK 或 Transport capacity getter。
7. **Ticket 07** 固定 direction-local Stream/Item Ordinal、terminal boundary、state-before-effect
   deliver-once/suppressed disposition、唯一 cumulative Message Receipt ACK、original-seq replay、
   frozen Recovery barrier、direction-local GC 与 never-wrap counters；ACK 不证明 callback、processing、
   teardown 或双向 retirement。
8. **Ticket 08** 的 Answer 是资源/调度终局；其 Comments 中 Coordinated closure 明确取代较早
   “无 stream 子上限”等局部候选。最终是共享 Application Work 硬上限加 Active Stream 子上限、
   W=1 Receive Slot、阶段转移式 byte/evidence accounting、protected tail、barrier-first、control/progress
   alternation、unary virtual participant 与 per-stream round-robin。
9. **Ticket 09** 把 stream 纳入既有唯一 G/F termination module：G 只冻结新 admission roots，已 admit
   stream 完整 drain；F 先 Session-wide fence/选 winner，再 Direct Close 和 gate 外 effect shells。
   复用既有 absolute grace/cleanup deadlines、Direct Close、first-winner 和同一 termination task。
10. **Ticket 10** 固定 payload-free side-local stream-started/stream-finished pair、方向化 count、
    terminal-commit duration cutoff、Source-only teardown incident bit、serialized FIFO，以及
    item effect→stream-finished→peer-closed→topology-closed→event completion；无逐 item telemetry。
11. **Ticket 11** 的 Answer 取代 candidate Comment，固定统一 discriminated stream request、Subscriber
    两阶段 projection、Source reserveEmission/finish 与 finish(outcome,onReleased) receipt。Transport
    仍恰为 message$/send(Uint8Array)/close；stream load/fairness/Recovery/G/F 属 Protocol conformance。
12. **Ticket 12** 的 Answer 取代其非 Answer 候选，固定 final SemanticMessage grammar、两个 start kind、
    W=1 transition、terminal matrix、direction-local identity、同一 seq/ACK、Recovery/GC、counter tail、
    最大 envelope 和四份 corpus 整体替换；unary 保持独立退化路径，不编码成 one-item stream。
13. **Ticket 13** 的 Answer 是最终 caller/exposure Interface authority；其 candidate revisions 只保留
    R1–R4/B1–B4 的审计历史。Prototype 只固定拟议合同和相对源码证据，明确不是 production、installed
    package、normative spec 或 release acceptance。
14. **Ticket 14** 的终局合同按后写覆盖前写：第三版 R1–R11，随后第一份 R7 erratum，再由
    R7 erratum-2 只替换 unary progress identity 与 rotation capture。其 Answer 认证的 pre-resolution
    历史 candidate snapshot SHA-256 为
    4b793b8365227347a3da47c22c8daf0e0150840091f280b214c191432693e479。
    ACK 必须优先 piggyback；纯 fairness participant 是 U-call,A,B,C,D；首轮可为任意 5! permutation，
    后续第 2–8 轮必须逐项重复；control-first/Adapter S07 rejection 是独立 variant。

全局 standing scope 也保持：只支持远端输出 direct RxJS Observable 方法和显式 readonly $ property；
不支持 Observable 输入、client/duplex streaming、AsyncIterable、ReadableStream、Promise-wrapped/nested
Observable、Subject 远程 mutation、隐式 share/cache/replay、wire fragmentation、进程重启 persistence、
第二语言 SDK 或具体 WebSocket Adapter production 改造。规划票不实施 production；后续代码必须使用
husky-di-code-standard，并在同一 change 更新 normative specification 与 matching specification.test.ts。

#### 3. 旧 unary preserve/retire/replacement 的穷尽闭包

Legacy authority 被以下 immutable baseline 内容寻址：

~~~text
commit = 5b2d512815b93570c881d93f35dbb570bac855b1
tree = 9b09536eedfaf1f0b05f6cfbcac4cae7d4b6e651
SPECIFICATION.md = ff5259c2d7db766076db6c36ad047351879359e7190be0f44aa50b038b95ee14
REQUIREMENTS.md = 30ebe8f28af3e12a81eb8da432691c1d99eadb3611ab441d19b9bb11eca988cf
legacy requirements = 201
~~~

机械集合审计为 **153 preserve + 48 retire = 201**；preserve 与 retire 交集为 0，union 与 baseline
201 个 ID 精确相等。Preserve 的 ID 集合仍是 baseline 201 中除下列 48 项外的全部 153 项；
原“exact marker 到下一 marker”的 proposition-boundary 定义已被 Ticket 14 的
[scoped proposition-boundary erratum](14-decide-stream-verification-release-evidence.md#2026-08-24-scoped-proposition-boundary-erratum-after-implementation-discovery)
明确取代。该 Ticket 14 erratum 是此边界的唯一 authority；本审计不复制第二套定义。
48 项 retire/replacement 是：

~~~text
RPC-BASE-002 -> RPC-STREAM-001, RPC-STREAM-003, RPC-EVENT-008
RPC-PKG-007 -> RPC-PKG-010
RPC-PKG-008 -> RPC-PKG-011
RPC-PKG-009 -> RPC-PKG-012, RPC-PKG-014, RPC-PKG-015
RPC-VALUE-001 -> RPC-VALUE-007
RPC-VALUE-004 -> RPC-VALUE-008, RPC-WIRE-023
RPC-DESC-002 -> RPC-DESC-006, RPC-DESC-007, RPC-DESC-010, RPC-DESC-011, RPC-DESC-012, RPC-DESC-013
RPC-DESC-003 -> RPC-DESC-009
RPC-DESC-004 -> RPC-DESC-008, RPC-DESC-009
RPC-STATE-001 -> RPC-STATE-004
RPC-CALL-001 -> RPC-CALL-010, RPC-CALL-011, RPC-API-007
RPC-CALL-003 -> RPC-CALL-012
RPC-CALL-007 -> RPC-CALL-013, RPC-CALL-014, RPC-STREAM-010
RPC-CALL-009 -> RPC-CALL-015
RPC-GROUP-001 -> none
RPC-GROUP-002 -> none
RPC-GROUP-003 -> none
RPC-EVENT-001 -> RPC-EVENT-021, RPC-EVENT-009
RPC-EVENT-002 -> RPC-EVENT-022, RPC-EVENT-010
RPC-EVENT-003 -> RPC-EVENT-023, RPC-EVENT-010
RPC-EVENT-004 -> RPC-EVENT-012
RPC-SPI-007 -> RPC-SPI-021, RPC-SPI-022
RPC-WIRE-005 -> RPC-WIRE-025
RPC-WIRE-006 -> RPC-WIRE-016, RPC-WIRE-026
RPC-WIRE-011 -> RPC-WIRE-018, RPC-WIRE-023
RPC-WIRE-012 -> RPC-WIRE-020
RPC-VALID-007 -> RPC-VALID-010
RPC-RESOURCE-001 -> RPC-RESOURCE-007
RPC-RESOURCE-002 -> RPC-RESOURCE-008
RPC-RESOURCE-003 -> RPC-RESOURCE-007, RPC-POLICY-006, RPC-POLICY-007
RPC-RESOURCE-005 -> RPC-RESOURCE-007, RPC-RESOURCE-008
RPC-POLICY-001 -> RPC-POLICY-005, RPC-POLICY-006, RPC-POLICY-007, RPC-POLICY-008
RPC-POLICY-002 -> RPC-RESOURCE-007, RPC-RESOURCE-008
RPC-POLICY-003 -> RPC-POLICY-009
RPC-SCHEDULE-002 -> RPC-SCHEDULE-007, RPC-SCHEDULE-008
RPC-COUNTER-002 -> RPC-COUNTER-005
RPC-SHUTDOWN-001 -> RPC-SHUTDOWN-011, RPC-SHUTDOWN-012, RPC-SHUTDOWN-015
RPC-SHUTDOWN-004 -> RPC-SHUTDOWN-016
RPC-SHUTDOWN-005 -> RPC-SHUTDOWN-014
RPC-SHUTDOWN-009 -> RPC-SHUTDOWN-017
RPC-CLOSE-001 -> RPC-CLOSE-004, RPC-CLOSE-005, RPC-CLOSE-006
RPC-EVIDENCE-002 -> RPC-EVIDENCE-006, RPC-EVIDENCE-011
RPC-EVIDENCE-003 -> RPC-EVIDENCE-012
RPC-CONFORMANCE-002 -> RPC-CONFORMANCE-004
RPC-CONFORMANCE-003 -> RPC-CONFORMANCE-005
RPC-CORPUS-002 -> RPC-CORPUS-007
RPC-CORPUS-004 -> RPC-CORPUS-009
RPC-RELEASE-001 -> RPC-DESC-007, RPC-DESC-010, RPC-DESC-011, RPC-DESC-012, RPC-DESC-013,
                   RPC-RELEASE-009, RPC-RELEASE-016, RPC-RELEASE-017
~~~

新增/replacement registry 有 **190** 个 unique IDs，按 exact ranges 为：

~~~text
VALUE-007..008; DESC-006..013; STATE-004; CALL-010..015; API-007..008;
STREAM-001..015; FLOW-001..006; LEDGER-006..008; ACK-008..015;
RECOVERY-007..009; SEC-010..011; VALID-008..010; POLICY-005..009;
RESOURCE-007..020; SCHEDULE-007..009; COUNTER-005..006; SHUTDOWN-011..017;
CLOSE-004..007; CLEANUP-005; LIFE-003; EVENT-008..018,021..023;
SPI-013..022; TRANSPORT-013; CONFORMANCE-004..005; WIRE-016..026;
CORPUS-005..012; EVIDENCE-004..015; PKG-010..015; RELEASE-006..025;
MIGRATION-001..004; DOC-001..006
~~~

因此 active registry 是 153 preserved 与 190 new 的不相交 union，精确为 **343**。Legacy Case
ledger 也闭合：Protocol 14 preserve + 1 unknown-method tombstone；Adapter 24 exact legacyFormat
grandfather；raw 44 preserve + 8 tombstone；14 transcript scenarios/42 steps 全部一一 tombstone+
replacement；5 个 KAT preserve。旧 raw verdict 只 preserve 原 bytes/validity/record verdict，不倒灌
后来新增的 phase/scope/ACK/effect truth。

#### 4. 唯一 authority 映射

| Surface / question | 唯一行为 authority | 只负责收口而不重做决定的 authority |
| --- | --- | --- |
| 领域词汇与 owning/non-owning 分类 | CONTEXT.md；Ticket 02 | Tickets 05–10 只细化其各自术语 |
| v1 原地改写、兼容边界、resolveAll/Group 删除 | Ticket 03 | Ticket 13 验证最终 surface；Ticket 14 验证 packaged absence |
| Descriptor、exposure、single-peer facade | Ticket 04；最终整体 Interface 由 Ticket 13 | Ticket 14 只定义 type/package evidence |
| source acquisition、terminal、cancel、teardown | Ticket 05 | Tickets 09–11 分别消费 shutdown/telemetry/SPI projection |
| bounded flow、W=1、overflow | Ticket 06 | Tickets 08/12 编码资源与 wire |
| ACK、dedupe、replay、Recovery continuity | Ticket 07 | Ticket 12 编码 wire；Ticket 14 定 evidence |
| resource policy、accounting、scheduler、fairness | Ticket 08 Answer | Ticket 14 R7 errata 固定验证 trace，不改 scheduler semantics |
| graceful shutdown 与 force | Ticket 09 | Ticket 12 编码 G/F wire；Ticket 14 定 verification |
| public telemetry | Ticket 10 | Ticket 13 组装 Interface；Ticket 14 定 cases |
| custom Protocol SPI 与 Transport seam | Ticket 11 | Ticket 13 固定 export surface；Ticket 14 定 conformance/release |
| husky-di-rpc/1 grammar/state machine/corpus content | Ticket 12 | Ticket 03 拥有 replacement 边界；Ticket 14 拥有 evidence gate |
| final caller/exposure/export design | Ticket 13 | Ticket 14 只验证 actual package |
| requirement/case/corpus/package/browser/docs/release evidence | Ticket 14 第三版 + 两个 R7 errata | 本票只审计 handoff 闭包 |

“行为 authority”与“验证 authority”已经分层，故不存在两个 ticket 对同一产品选择并列裁决的歧义。
规范作者只需把这些裁决规范化；无需再决定 Interface、wire、failure scope、resource policy、Recovery、
shutdown、telemetry、conformance ownership、migration 或 release gate。

#### 5. Ticket 14 evidence contract 的闭合审计

最终 graph 只有 active Requirement R、canonical Case C、support-only Case S、exact Evidence E：

~~~text
keys(activeRegistry) = R = keys(matrix)
|R| = |matrix| = 343
每个 R 恰一 matrix row，且 cases 非空并只指向 C
每个 C 的 covers 非空且只含 R
C.covers 与 matrix 的 requirement-to-case edge 互为精确逆集
C.evidence 与 E.cases 互为精确逆集
每个 S 的 covers 为空，supports 非空且只指向 C
每个 reference 恰解析一次，R/C/S/E 分类互斥
cases/covers/evidence/supports arrays 全部 duplicate-free
retired IDs 只存在于 tombstones
~~~

每个 active Requirement 机械获得 specification.rpc-family-nnn 与 profile-specific verify Case；
direct cases 只追加，不替代这两条。Selector 必须使用 specification/type/runtime/protocol/transport/
schema RFC6901/raw/scenario#step/security/browser@engine/package@A-SHA/doc@commit 的 exact grammar；
递归“找第一个同名 id”、corpus 自报 covers、throwaway 或 Bundler-only 证据都不能创设 PASS edge。
所有 failed/partial/planned/missing/skipped/todo/only/flaky 必须为 0。

关键直接证据不能藏在综合 happy path：overflow-causing emission 不计数；duration 止于 terminal commit；
source-finished 等 teardown settle；terminal ACK 只退休该 sending direction；Receive Slot 在
armed→item→effect→re-arm 原位循环，credit/cancel ACK 不释放；post-G valid start 与 malformed/fixed/
stale-binding/sequence-gap/ordinal-reuse/ordinal-gap/wrong-proof 分 phase；五个 broken-Protocol mutants
必须 5/5 命中其指定 Case。

唯一 artifact authority 是 final versioned clean worktree A 生成的同一个 A_TGZ。Worktree B 只比较
canonical tar tree。A 必须满足 literal no-glob tar allowlist、pnpm pack 与 npm dry-run parity、exact
Node v23.6.0 lane、root + 3 code specialist + 4 JSON subpaths、module manifests root 18/30、
/protocol 6/51、/transport 0/3、/conformance 4/8、Node ESM/CJS、NodeNext mts/cts、
Compiler-API declarations、DOM-only + Chromium/Firefox/WebKit、offline metaschema closure、
independent oracle + A production Protocol execution、RFC8785 JCS receipt，以及
authoritative=tested=published A tgz SHA。四 corpus assets必须同 revision整体替换，不得混搭或增加
public revision/legacy subpath。

#### 6. No-orphan / no-conflict / no-ambiguity checklist

- [x] 15/15 child 文件、编号、标题、Parent 唯一；0 orphan child。
- [x] 49/49 blocker edges 指向已知 child；DAG、3 roots、15/15 reachable。
- [x] 14/14 resolved child 各 exact-one Answer、exact-one map index；Ticket 15 claimed/zero Answer/zero index。
- [x] 94/94 local links解析；32/32 targets存在；4/4 anchors命中。
- [x] Not yet specified 为空；没有尚待毕业的 decision fog。
- [x] Ticket 08/11/12/13/14 的 candidate→final 覆盖顺序均显式；没有并列 final Comment。
- [x] 旧 unary 201 IDs 被 153 preserve/48 retire 精确分割；0 duplicate、0 missing、0 intersection。
- [x] 190 new IDs unique；active 343 与 matrix target一致。
- [x] Requirement/Case/Evidence inverse、node resolution、classification 与 duplicate-free 规则闭合。
- [x] Behavior、wire encoding、verification/release 三种 authority 分层；没有冲突 owner。
- [x] Group removal 是 public/legacy-route absence，不规定 private layout；Transport 保持 stream-unaware。
- [x] Prototype、current source、packed artifact 三个证据层级没有互相冒充。
- [x] 所有 user standing constraints都落在唯一 ticket；规范作者无需补做产品或架构决定。

审计结论：**READY_FOR_OPPONENT**。对手若发现任何 ID/edge/authority 反例，应以 exact ticket、
Requirement、Case 或 selector 给出 BLOCK；不能用“production 仍 RED”把规划闭包误判为失败。

#### 7. Dirty-worktree 与 production negative boundary

本次审计发生在预先 dirty 的共享工作区：husky-di-code-standard skill、Tickets 05–14、map、
Ticket 11/13 prototypes 与 CONTEXT.md 已有其他会话的 staged/unstaged changes。它们不是本票写者的
改动或验收结果。本票写者只改 Ticket 15；不得把全仓 git diff 归因于本 Comment，也不得在此工作区
运行或声称 clean release gate。

当前 production **仍是旧 unary implementation**：仍可见 RpcCallDirectionEnum、RpcPeerResult、
resolveAll/internal Group、unknownMethod、maxPendingInvocationsPerSession、method-only Descriptor/spec/
docs；SPECIFICATION/REQUIREMENTS 仍是上述 legacy hashes，wire four-tuple、package consumers 和 release
workflow 仍是 Ticket 14 的 RED baseline。Ticket 13 prototype、Ticket 14 planning PASS 与本审计都不表示
production、specification tests、wire assets、package/docs/browser 或 publish workflow 已实现、packaged
或验收。

#### 8. 规范/TDD implementation handoff 与 RED gates

必须按 outcome dependency 顺序执行；文件布局仍由实现者决定：

1. **RED-0 identity/graph**：先落 immutable active+retired Requirement/Case ledger、343-row matrix、
   exact selector registry、inverse/no-orphan/duplicate-free/zero-incomplete audits；先证明当前 hard-coded
   201、旧 selector 和缺失 tombstones 会 RED。
2. **RED-1 normative atomicity**：逐 ID 改写 SPECIFICATION.md 与 REQUIREMENTS.md；同一 change
   更新 matching specification.test.ts。禁止 range row、重编号、复用 retired ID 或先改 public behavior
   后补规范。
3. **RED-2 public/package surface**：从 actual installed tgz 建立 mixed Descriptor、direct Observable
   capability、Subject narrowing、single-peer facade、resolveAll/legacy-name absence、exact enum/policy/
   module manifests 的 type/runtime negatives；确认 RED 后才改 production surface。
4. **RED-3 behavior layers**：按 source lifecycle/reentrancy → W=1/overflow → ACK/replay →
   resources/fairness → Recovery → G/F → telemetry → custom Protocol mutants 逐 Case RED/GREEN。
   Adapter 24 grandfather cases始终原样回归，Adapter不得理解 stream。
5. **RED-4 corpus atomicity**：schema/raw/transcripts/security、nonpublic manifest/lock、independent
   metaschema/raw/KAT/transcript oracle和A-production runner作为一个不可分割 change整体转绿；任何
   old/new mixed tuple都 BLOCK。
6. **RED-5 artifact/release**：最后才落 literal tar allowlist、worktree-A唯一tgz、Node 23.6.0、
   installed ESM/CJS/NodeNext/DOM/三浏览器、two-worktree canonical tree、docs/examples/migration、
   post-version workflow与tested/published SHA receipt。只有全部 AND gate通过才可称 production acceptance。

若实现中出现无法由上述 authority 唯一回答的行为问题，必须停止并以 exact冲突重新打开规划；
规范作者不得在 prose、test expectation、private layout 或 fixture 中暗自新增决定。

干净工作区的最低审计命令契约如下；这些 evidence scripts 是 implementation 的首批 RED targets，
当前 dirty 工作区不得伪造执行结果：

~~~sh
set -euo pipefail
test -z "$(git status --porcelain=v1 --untracked-files=all)"
test "$(node --version)" = "v23.6.0"
test "$(node -p "require('./packages/remote/package.json').version")" = "1.0.0"
test ! -e packages/remote/dist

pnpm install --frozen-lockfile --offline
pnpm --filter @husky-di/remote evidence:ledger -- \
  --legacy-preserve 153 --legacy-retire 48 --active 343 --zero-incomplete
pnpm --filter @husky-di/remote evidence:graph -- \
  --all-nodes-resolve --duplicate-free --inverse --zero-incomplete
pnpm --filter @husky-di/remote evidence:corpus-lock -- \
  --offline-metaschema-closure --output /tmp/husky-remote-corpus-lock.json
pnpm test:code-standard
pnpm check:code-standard
pnpm build
pnpm test
pnpm --filter @husky-di/remote-websocket test
pnpm --filter @husky-di/example-remote-websocket typecheck
pnpm --filter @husky-di/example-remote-websocket test
git diff --check
test -z "$(git status --porcelain=v1 --untracked-files=all)"
~~~

最终 artifact gate 还必须在同一 final commit 建立 detached clean worktrees A/B；两边离线安装并强制
build/pack，比较 canonical tree；只对 A_TGZ 运行 pack-parity、test:release 与 receipt，且只允许
npm publish A_TGZ。B、另一个 RC tgz 或从 package directory 重新 pack 的 bytes均无 authority。

#### 9. 最薄弱点

最薄弱点不是尚缺产品决定，而是 **Ticket 14 的 343 项 active registry、每项两条机械 Case和 direct
edge 目前仍只存在于规划文本，尚未转成 production machine-readable ledger/matrix**。人工转录最容易
产生单个漏 ID、重复 edge、错误 selector 或把 support-only 当 canonical 的假绿。上述 RED-0 必须成为
规范实现的第一步，并独立从 hash-locked 201-ID baseline与190 new-ID set重算，禁止复制一个自报总数。

次弱点是 exact tar allowlist 的 dist literal paths 只能在最终 implementation layout确定后填入；这不要求
新的产品/架构决定，但必须由 review 固定且 release job只比较、绝不自动更新。两点都已有机械 gate，
所以不阻塞 specification handoff，但在 gate转绿前绝不能宣称 production acceptance。

### 2026-08-23 — Candidate erratum: FORMAL BLOCK P08 exact contended trace

本 erratum **只**闭合对手的 FORMAL BLOCK P08。它不新增 Requirement、Case 或 selector，也不改变
`protocol.requirement.rpc-schedule-007` 的既有语义或 direct-cover edge；以下只是把该既有 Case 的
contention witness 固定为可逐行复算的 exact trace。唯一 direct cover 仍是 `RPC-SCHEDULE-007`。

#### 固定前置状态与记录身份

- 进入步骤 S01 前，barrier 已清空且全程保持 cleared；ACK state 是 clean：没有 ACK debt、待重放
  record、replay timer 或由未确认 item 产生的 eligibility 条件。
- control lane 的前八个可发送记录严格为 `C1`…`C8`。它们是八个 pairwise-distinct real
  identities 各自产生的真实 `kind=control` record；每条都独立可发送、没有 item dependency，且没有
  一条是 `AckOnly`。
- control lane 尾部另有 `C1+`：它是在 trace 开始前由同一个已经真实存在的 `C1` identity 经正常
  control event 产生并排在 `C8` 后面的第二条真实 `kind=control` record。`C1+` 不是第九个
  participant、不是 `AckOnly`、没有 item dependency，也不在前 16 次 selection 的 projection 中；它
  只使第 S16 次 decision 的 control ready set 仍为非空，防止以临时清空 lane 获得假 alternation。
  该 fixture tail 不规定新的 within-lane ordering policy。
- progress lane 的五个 real identities `U-call,A,B,C,D` 在 S01 前同时 ready。选中的 identity 只在其
  `send` settled 后合法 re-arm 一条新的 `kind=progress` record，并在下一次 selection 前恢复为 ready；
  因而下表每一行的 progress ready set 都精确为 `{U-call,A,B,C,D}`。
- scheduler alternation state 在 S01 固定为 **control-first**。每一行只允许一次 selection 和一次
  `send`；该 `send` settled 前不得发生下一次 `send`，而本 witness 进一步把下一行 selection 也放在
  前一行 settlement 之后，以便机械检查不存在 overlap。

#### Exact 16-selection trace

`P0`…`P7` 是本 trace 中八个被选中的 progress record occurrence，不是新 Case 或 selector。
ready sets 均是在该行 selection 立即之前采样；`re-arm` 均发生在该行 `send` settlement 之后、下一行
selection 之前。`—` 表示 control send 不消费 progress record，所以五元素 progress ready set原样保留。

| Step | control ready set | progress ready set | selected lane / identity / kind | send settlement | progress re-arm | direct-cover |
|---|---|---|---|---|---|---|
| S01 | `{C1,C2,C3,C4,C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | control / `C1` / control | `send(C1)` settled before S02 | — | `RPC-SCHEDULE-007` |
| S02 | `{C2,C3,C4,C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | progress / `U-call` / `P0` | `send(P0)` settled before S03 | `U-call` legally re-armed before S03 | `RPC-SCHEDULE-007` |
| S03 | `{C2,C3,C4,C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | control / `C2` / control | `send(C2)` settled before S04 | — | `RPC-SCHEDULE-007` |
| S04 | `{C3,C4,C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | progress / `A` / `P1` | `send(P1)` settled before S05 | `A` legally re-armed before S05 | `RPC-SCHEDULE-007` |
| S05 | `{C3,C4,C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | control / `C3` / control | `send(C3)` settled before S06 | — | `RPC-SCHEDULE-007` |
| S06 | `{C4,C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | progress / `B` / `P2` | `send(P2)` settled before S07 | `B` legally re-armed before S07 | `RPC-SCHEDULE-007` |
| S07 | `{C4,C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | control / `C4` / control | `send(C4)` settled before S08 | — | `RPC-SCHEDULE-007` |
| S08 | `{C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | progress / `C` / `P3` | `send(P3)` settled before S09 | `C` legally re-armed before S09 | `RPC-SCHEDULE-007` |
| S09 | `{C5,C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | control / `C5` / control | `send(C5)` settled before S10 | — | `RPC-SCHEDULE-007` |
| S10 | `{C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | progress / `D` / `P4` | `send(P4)` settled before S11 | `D` legally re-armed before S11 | `RPC-SCHEDULE-007` |
| S11 | `{C6,C7,C8,C1+}` | `{U-call,A,B,C,D}` | control / `C6` / control | `send(C6)` settled before S12 | — | `RPC-SCHEDULE-007` |
| S12 | `{C7,C8,C1+}` | `{U-call,A,B,C,D}` | progress / `U-call` / `P5` | `send(P5)` settled before S13 | `U-call` legally re-armed before S13 | `RPC-SCHEDULE-007` |
| S13 | `{C7,C8,C1+}` | `{U-call,A,B,C,D}` | control / `C7` / control | `send(C7)` settled before S14 | — | `RPC-SCHEDULE-007` |
| S14 | `{C8,C1+}` | `{U-call,A,B,C,D}` | progress / `A` / `P6` | `send(P6)` settled before S15 | `A` legally re-armed before S15 | `RPC-SCHEDULE-007` |
| S15 | `{C8,C1+}` | `{U-call,A,B,C,D}` | control / `C8` / control | `send(C8)` settled before S16 | — | `RPC-SCHEDULE-007` |
| S16 | `{C1+}` | `{U-call,A,B,C,D}` | progress / `B` / `P7` | `send(P7)` settled before trace exit | `B` legally re-armed before exit | `RPC-SCHEDULE-007` |

机械 projection 必须 exact-equal：

~~~text
C1,P0,C2,P1,C3,P2,C4,P3,C5,P4,C6,P5,C7,P6,C8,P7
~~~

所以 lane projection 是严格 control-first alternation；S01…S16 每次 decision 时两个 ready set 都非空，
没有任何一步通过暂时清空 control 或 progress lane 改变选择结果。测试不得用 `AckOnly` 充当 control，
不得虚构 participant，且不得在任一 `send` settled 前发出下一条 record。

该 contended trace 与既有纯 progress 的八轮 `5!` permutation trace正交，也与独立的 Adapter
failure/replay trace正交：两条既有 trace、它们的 inputs、assertions、direct-cover edges 与 selectors
全部保持不变。本 erratum 不是它们的替代或修订，也不得把三条 trace 合并成一个可互相掩盖的 fixture。

结论：`protocol.requirement.rpc-schedule-007` 现在具备 exact、non-vacuous、双 lane 始终 ready 的
control-first witness；除此之外没有产品决定发生变化。**READY_FOR_P08_REREVIEW**。

### 2026-08-23 — Later authoritative repair erratum after scoped CHAIR BLOCK

本 erratum 是比上一条 P08 candidate **更晚的 authority**。它只替换上一条的 `C1+` witness、全部
progress identity order/set/repetition assertions，以及第8节与本节冲突的 implementation handoff；其余
Ticket 15 audit不变。它不新增 Requirement、Case 或 selector，Ticket 15继续保持`Status: claimed`且没有
Answer。

Ticket 14 的 R3 authority 现按更晚的
[R3 preserved legacy evidence fan-out erratum](14-decide-stream-verification-release-evidence.md#2026-08-23-r3-preserved-legacy-evidence-fan-out-erratum-after-chair-block)
读取：legacy RW/TX/KA/BR Case identity与aggregate locator保留，Evidence必须fan-out为真实、ordered、
exact leaves；旧的synthetic scalar selector不再是authority。

#### P08 authoritative replacement：C9与纯 lane projection

上一条 P08 中的 `C1+` 全部删除并由 `C9` 替换。固定precondition为：

- barrier在S01前已经清空且S01–S16期间保持cleared；ACK全程clean，既无AckOnly eligibility，也无
  replay debt、待重放record或hidden recovery work。
- `C1`…`C9`由九个pairwise-distinct真实identities各自产生。九条都是在S01前已经dependency-ready的
  real control records；无item dependency，不是AckOnly、replay/retransmission、duplicate、同identity的
  second terminal或cancel。`C9`排在`C8`之后且不在前16次selection中被选，只作为S16时control lane仍
  非空的真实witness。
- progress lane在S01前非空，并在S01–S16每次selection前保持非空。每次progress selection实际选出的
  identity/kind必须记录；其send settled后，fixture才可按既有合法路径re-arm该实际identity，并在下一次
  selection前记录re-arm完成。不得在settlement前预发、预选或伪造ready work。
- scheduler在S01以control-first开始。每一步都记录pre-selection control/progress ready sets、selected
  lane、actual selected identity/kind、send invocation/settlement以及适用的progress re-arm。任一send
  settled前不得发生下一selection或下一send。

前16次selection唯一被断言的exact projection是lane：

```text
S01 control(C1)
S02 progress
S03 control(C2)
S04 progress
S05 control(C3)
S06 progress
S07 control(C4)
S08 progress
S09 control(C5)
S10 progress
S11 control(C6)
S12 progress
S13 control(C7)
S14 progress
S15 control(C8)
S16 progress
```

等价的machine verdict只有：

```text
control,progress,control,progress,control,progress,control,progress,
control,progress,control,progress,control,progress,control,progress
```

每个control selection后仍有下一条`Ci`或最终`C9` ready；每个progress selection前progress ready set
非空。因此S01–S16的每一个decision都在两lane同时非空时发生，不能通过临时清空某lane、制造AckOnly、
重放debt、第二terminal/cancel或虚构participant作弊。

上一条关于progress实际identity为`U-call,A,B,C,D`、`P0..P7`的顺序、集合、distinctness、rotation、
repetition或expected identity的全部断言均由本erratum删除。Runner仍记录实际被选identity，只用于证明
该send settle后对**同一实际identity**的re-arm合法；它不能参与PASS verdict的order/set/repetition比较。
此Case仍只direct-cover `RPC-SCHEDULE-007`，不得偷带`RPC-SCHEDULE-008`或
`RPC-CONFORMANCE-005`。

该lane-contention witness与Ticket 14既有纯progress八轮任意`5!` permutation trace正交；后者独立拥有
progress identity/rotation/fairness verdict。它也与独立Adapter failure/replay trace正交。三者的Case、
selector、input、assertion与direct-cover edges不得合并或互相替代。

#### Implementation handoff authoritative replacement

第8节的bulk RED分层只保留为依赖说明；本节固定实际TDD执行粒度。

**RED-0是唯一global scaffold。** 它只建立后续slice共同需要的active/retired registry schema、343-row
matrix容器、Case/Evidence registry schema、selector resolver、双向inverse/no-orphan/duplicate-free/
zero-incomplete validators和R3 fan-out能力。RED-0不得顺带实现任何产品行为、批量填充行为Cases，或用
self-reported counts/edges让registry假绿。

RED-0之后，逐atomic slice的genuine RED→minimal production GREEN适用于所有
**non-A-dependent** slices；除下述唯一corpus原子tuple外，严格一次只推进一个
atomic Requirement/Case/edge slice：

1. 在同一change先加入该exact Requirement的normative prose、matching `specification.test.ts` entry、
   一个canonical Case及其exact Case↔Requirement和Case↔Evidence edge；其余slice保持未改。
2. 保持production不变，运行该Case的exact selector，保存command、input、actual output/exit与expected的
   mismatch，形成可复现的**genuine RED**。一个测试因missing placeholder、runner不存在、无关compile error
   或人工`throw`失败，不是behavior RED。
3. 若selector在未改production时首次即绿，它不能记作“新增行为RED”，也不得伪造失败。若production已经
   满足命题，则把它作为carried-forward/regression evidence adjudicate；若selector没有真正观察完整命题，
   先在同一slice收紧到exact public-seam input/verdict，再重新取得真实RED。两种情况都不能借测试期望暗增
   新产品决定。
4. 只做让该exact selector转绿的minimal production change，然后运行该selector、matching spec test与
   已完成slice regression。全部GREEN且graph仍闭合后，才进入下一个Requirement/Case/edge slice。

唯一不可拆slice是四份corpus assets
`schema.json + raw-vectors.json + transcripts.json + known-answer-vectors.json`，连同nonpublic manifest/lock、
offline metaschema closure、independent raw/KAT/transcript oracles和A-production Codec/Protocol runners。
该slice必须以同一revision证明：完整旧tuple对final contract genuine RED；四asset与所有lock/oracle/runner
原子切换后完整新tuple GREEN；任意old/new **mixed tuple必定失败**。不得把单份asset或自报covers提前标为
verified，也不得把该唯一例外推广到public Interface、runtime、docs或package slices。

**A-dependent evidence延期例外（normative）。** 任一exact selector/Case/edge的input或verdict必须消费
installed candidate/final A digest、publish后registry bytes或final receipt时，它就是A-dependent；这包括
profile `K`及相关package/release/receipt Cases。这些Cases延期到candidate/final A阶段，不参与
生candidate之前的`ALL_SLICES_GREEN`计数，也不得在该时点伪报`verified`。
`ALL_SLICES_GREEN`只表示所有non-A-dependent slices、已完成slice regressions及会改变最终
repo/artifact bytes的工作均已GREEN；它不是final zero-incomplete或production acceptance。

该延期不得拆分四corpus implementation tuple：assets、manifest/lock、oracles与runner code仍在冻结前
同一slice原子落地，old tuple RED、source/oracle/production-tree new tuple GREEN、mixed tuple必败；
只有必须执行installed candidate/A的package/corpus evidence Case延期到下述candidate digest gate。

#### Pre-final artifact与final A authority

在TDD slice期间，为触发installed consumer/type/browser/package的RED而临时pack出的tgz只能称
`pre-final test tgz`或temporary RED stimulus。它必须存于临时目录，receipt只允许`status=red-stimulus`和
临时digest；它**不得**命名为`A_TGZ`，不得写入任何`verified` Case/Evidence，不得填充
`authoritativeTgzSha256`、`testedTgzSha256`、`publishedTgzSha256`或final/provisional release receipt，也
不得成为tag/publish输入。

最终A的无环时序固定为：

1. 先完成所有会改变最终repo/artifact bytes的implementation、runner、fixture、docs、version、
   literal allowlist及全部non-A-dependent regressions；满足上述`ALL_SLICES_GREEN`后才可冻结。
2. 冻结一个final clean/versioned commit。Detached clean worktree A只从该commit产生一份candidate
   bytes与digest；此时它还不得称为`A_TGZ`。Worktree B只验canonical tar tree
   reproducibility，不产生可验收或发布的artifact authority。
3. 对同一candidate digest运行installed Node ESM/CJS、NodeNext `.mts/.cts`、Chromium/Firefox/
   WebKit、package及corpus gates。任一失败立即废弃该digest及其全部pre-final evidence，回到
   implementation阶段；修复后必须从新的clean/versioned commit重新生成candidate，不得就地
   rebuild或repack。
4. 所有candidate-digest gates通过后，把**同一bytes**指定为唯一final `A_TGZ`。指定后禁止
   rebuild、repack或替换bytes；只能publish该A。
5. Publish后从registry回下载actual tarball并确认digest仍等于该A；只有此后才完成
   `RPC-RELEASE-020`、`RPC-RELEASE-023`、`RPC-RELEASE-024`、`RPC-RELEASE-025`及final JCS
   receipt，并把authoritative/tested/published SHA equality标为final verified。

`zero-incomplete`只是final receipt与production acceptance gate，**不是**生candidate bytes或指定其为
唯一A的前置条件。任何temporary RED stimulus、被废弃candidate、B artifact、RC或
package-directory repack都不得进入verified Case/Evidence或final receipt。

本erratum闭合scoped CHAIR BLOCK：P08只证明`RPC-SCHEDULE-007`的non-vacuous strict lane alternation，
Ticket 14 R3 fan-out与逐slice genuine RED/final-A边界均已成为更晚authority；相应 scoped review
现已由 `CHAIR ROUND2 FINAL PASS` 完成。

## Answer

圆桌主席`CHAIR PASS`后，本票按以下时间与authority顺序解决；更晚内容只在其明示范围内
覆盖更早内容：

1. `2026-08-23 — Candidate Wayfinder audit and specification handoff`是地图、依赖、standing
   constraints、legacy preserve/retire/replacement、唯一authority、evidence contract、dirty-worktree
   边界与规范/TDD handoff的基线。其`94 local links / 32 targets / 4 anchors`只是
   pre-final snapshot；最终固定快照是`107 local links / 32 resolved targets / 16 fragment links / 0 missing`，
   全部有效。保留的只是link/anchor closure PASS结论，不保留旧
   cardinality作为final事实。其中关于本票`claimed`/zero Answer/zero map index及map `open`的
   pre-resolution观察，仅由原子收尾替换为`resolved`/one Answer/one index及map
   `resolved`；其余closure PASS结论保持。
2. `2026-08-23 — Candidate erratum: FORMAL BLOCK P08 exact contended trace`为既有
   `protocol.requirement.rpc-schedule-007`增加可机械复算的双lane始终ready witness，不新增
   Requirement、Case或selector。
3. `2026-08-23 — Later authoritative repair erratum after scoped CHAIR BLOCK`是本票的最晚
   release sequencing authority：以pairwise-distinct真实`C9`取代`C1+`，只断言exact lane projection并删除
   progress identity/order/set/repetition verdict；它同时取代冲突的bulk handoff，固定唯一
   global `RED-0`、所有non-A-dependent Requirement/Case/edge的逐atomic genuine-RED切片、四corpus
   唯一不可拆tuple，以及A-dependent profile `K`/package/release/receipt Cases不计入pre-candidate
   `ALL_SLICES_GREEN`的延期例外。最晚authority的无环顺序是：全部bytes-changing工作与
   non-A regressions完成→冻结clean/versioned commit→A worktree生candidate digest且B只验
   canonical tree→同一digest跑installed/package/corpus gates→同一bytes指定为唯一A且禁止
   rebuild/repack→publish/回下载后完成四条release Cases与final JCS receipt；`zero-incomplete`只在
   final receipt/production acceptance时成为gate。
4. Proposition boundary 及由实现发现的 scoped 迁移边界，只以 Ticket 14 的
   [scoped proposition-boundary erratum](14-decide-stream-verification-release-evidence.md#2026-08-24-scoped-proposition-boundary-erratum-after-implementation-discovery)
   为最晚 authority；本票只引用它，不复制边界定义。

上游release-evidence以Ticket 14的
[R3 preserved legacy evidence fan-out erratum](14-decide-stream-verification-release-evidence.md#2026-08-23-r3-preserved-legacy-evidence-fan-out-erratum-after-chair-block)
为最终R3 authority：legacy RW/TX/KA/BR Case identity与aggregate locator保留，Evidence只能展开为
ordered exact leaves；profile `L`不得为已由`RPC-CORPUS-007` retire的`RPC-CORPUS-002`实例化active
Case/edge，preserved TX fan-out唯一来自`RPC-VALID-002`的两条locator、恰好五个exact leaves。

组合上述authority后，15个child、49条blocking edges、DAG/index/status/link/anchor/fog、legacy
`153 preserve + 48 retire`、343项active registry、领域/Interface/SPI/wire/Recovery/resources/fairness/
shutdown/telemetry/conformance/Group removal/package/release-evidence authority及实施顺序均闭合；规范
编写者无需新增产品或架构决定。因此Wayfinder的 **planning handoff已完成**。

本resolution仍然不是implementation acceptance：当前production仍是旧unary implementation，
`SPECIFICATION.md`/`REQUIREMENTS.md`、matching `specification.test.ts`、wire/corpus assets、package/docs/
browser/release workflow均尚未按本地图实现或验收。后续必须依上述原子TDD handoff取得真实
RED/GREEN与final-A evidence，不得把prototype、规划合同或pre-final tgz冒充production实现。

### 2026-08-24 — Post-resolution scoped proposition-boundary audit

本记录是对已 resolved planning handoff 的 implementation-discovered scoped erratum 审计，不新增
Answer，不改变 map 或本票的 `resolved` 状态、15 children、49 blocking edges、DAG、空fog与
无 open frontier 均保持。Ticket 14 的
[scoped proposition-boundary erratum](14-decide-stream-verification-release-evidence.md#2026-08-24-scoped-proposition-boundary-erratum-after-implementation-discovery)
是 proposition boundary 的唯一最新 authority；本票原第 131–133 行“marker 到下一 marker”审计口径
已明确 supersede，没有在此复制第二套定义。

因此，旧的“planning handoff 已完成”仍保留为 pre-erratum resolution 历史；最新 Ticket 14
authority 的 Round2 scoped planning-authority review 现已完成，planning 保持 resolved。本记录不声称 production、normative
SPEC/REQUIREMENTS、matching `specification.test.ts` 或 evidence assets 已修复或验收。
旧 `4b793b8365227347a3da47c22c8daf0e0150840091f280b214c191432693e479` 只是历史
pre-resolution snapshot，不是本 erratum 后的审核摘要。

`CHAIR ROUND2 FINAL PASS` closes scoped planning-authority erratum; R3 changes evidence fan-out; boundary erratum does not; planning remains resolved; implementation/production pending.

Round2 四 artifact SHA-256 审核摘要为：

```text
support manifest physical SHA-256 = 3b11a2432026fc4dc0833c1425041a4caf1900dea1a0afc7bfe7f3247f550b66
Ticket 14 physical SHA-256 = 7c2e74283afc78381319050146436ce60111a9aec3dae53a3dd6b60909e1498c
map physical SHA-256 = f32b76c7fc7a6034d990ed1b5632daa43c26f221140593c64eee1821edbfae03
Ticket 15 normalized-self SHA-256 = a94ea1addc843c4517dedf1962993bc8806e2603bd4771c807e00e4e966c89c2
```

`Ticket 15 normalized-self SHA-256` 的可重算定义是：读取本文件的完整 raw bytes，仅将
上述 `Ticket 15 normalized-self SHA-256 = ` 后的 64 个小写十六进制字符替换为
64 个 `0`，再对结果计算 SHA-256。该定义包含本审计记录其余全部 bytes，且不宣称
文件内能容纳自身最终 physical SHA-256，因而没有自引用哈希悖论。

### 2026-08-24 post-resolution scoped R6 and support-probe audit

本记录只审计 Ticket 14 后续
[scoped R6 public reachability and support-probe-locator erratum](14-decide-stream-verification-release-evidence.md#2026-08-24-scoped-r6-public-reachability-and-support-probe-locator-erratum)
的authority归属，不复制第二套KAT/action或graph定义。该erratum是Ticket 14 Answer原第一至第五项之后的
第六项，只后写覆盖R6不可满足的fixed-KAT public双执行量词与R11 support-only locator歧义；此前R3
fan-out、proposition boundary、Case/Requirement/selector identity和其他behavior/release authority均保留。

Handoff现精确区分：五个preserved KAT仍逐ID由installed asset与pinned independent oracle exact重算；
public A只对两个可精确归因的embedded-JCS coordinates、profile-shaped fresh/resume proofs与七个具名
security actions产生逐项production result，generic RFC HKDF/HMAC fixed inputs不经public/private injection，
且不得以`productionKatCrossChecks: 5`冒充执行。R11的runtime locator属于S自身content-addressed
`supportProbeLocator/supportProbeResult`，不实例化E、不进入Case↔Evidence inverse，也不传播C/R verdict。

本scoped修订不新增或重开child，不改变15 children、49 blocking edges、resolved statuses、DAG、map index、
空`Not yet specified`或无open frontier；Ticket 14与本票继续`resolved`。它更新implementation handoff，
不声称normative SPEC/REQUIREMENTS、matching `specification.test.ts`、machine registries、installed-A runner、
package或release receipt已经修复或验收。旧Round2 hashes仍只是其各自content-addressed历史快照，不是本
erratum之后文件的physical hash。

### 2026-08-24 post-resolution scoped raw/transcript public-observability audit

本记录只指向 Ticket 14 的最新
[scoped raw/transcript public-observability erratum](14-decide-stream-verification-release-evidence.md#2026-08-24-scoped-rawtranscript-public-observability-erratum)：
raw固定为82项independent truth + 82项public projection，transcript固定为68项independent
action-prefix truth + 62项fresh public-A projection + exact六项oracle-only selectors；phase与internal
named state只归oracle，public runner只验证稳定公开分支后果。该scoped authority不新增或重开child，
不改15 children、49 edges、resolved/DAG/空fog/无frontier，也不声明implementation或production已验收。
