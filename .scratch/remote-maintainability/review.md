# Remote / WebSocket 结构检查

日期：2026-09-10。范围：`packages/remote`、`packages/remote-websocket` 的源码、类型、测试、包入口及规范证据。

## 结论

主要问题是多个职责集中在长文件中，同时存在少量冗余包装、重复类型和散落的工具逻辑。已按职责整理，公开 API 与行为保持一致。未新增依赖，也未建立跨包的通用工具包。

按包含注释和空行的物理行数检查，原有 28 个超过 500 行的 TypeScript 文件（9 个源码、19 个测试）现已全部达标。

| 范围 | 原最大文件 | 当前源码最大 | 当前测试最大 | 当前超限文件 |
| --- | ---: | ---: | ---: | ---: |
| remote | 6907 | 491 | 485 | 0 |
| remote-websocket | 397 | 326 | 397 | 0 |

## 过度抽象与职责拆分

- **Owner**：原 1524 行 Session ownership 同时实现 Connector、Acceptor、Session record 和状态转移。现分别归属角色实现、Session record 与转移工具。删除只转发字段/回调的 Attachment 类；Publisher 删除可由已有类型推导的泛型参数、未使用字段，并统一事件分发。
- **Protocol**：Session 从 1470 行降至 485 行。恢复凭据及一次性授权计划、序列与 ACK 调度、物理连接绑定、关闭排空各自拥有对应状态和生命周期，Session 保留整体协调。删除重复终止包装和队列中的重复消息字段。
- **Peer**：原 1044 行调用生命周期拆为出站调用、入站调用、协议边界验证和结果处理。保留取消、提交、回调重入及最终结果选择的顺序。
- **Conformance**：将 Connector、Acceptor、Connection 案例按测试对象归组；将 Protocol incoming disposition 案例分离；lifetime 从 607 行降至 486 行，任务归因与清理工具独立归位。
- **WebSocket**：现有 Connection、Connector、Node listener 接口承担真实平台差异和资源寿命；共享 error/policy 工具及类型归属已合理。未发现值得扩大改动的冗余，保留现有实现。

Owner 的 Publisher、Custody、Termination，以及 Protocol 的 Invocations、Incoming Calls、Retention 均承担实际状态、行为或资源寿命，因此保留其接口。文件拆分增加了内部文件数量，目的是明确职责；没有增加调用方需要理解的概念。

## 工具与类型整理

| 复用内容 | 所有者与位置 |
| --- | --- |
| 平台计时器上限 | `remote/src/shared/constants/rpc-timer.const.ts`，供 Runtime Policy 与 Reconnection 共用 |
| 启动参数校验 | `remote/src/modules/owner/utils/parse-rpc-startup.util.ts` |
| 两类启动 attempt 与相同的 cleanup rejection 策略 | `remote/src/modules/owner/factories/rpc-startup-attempt.factory.ts` |
| Session fencing、状态转移、关闭投影、发布快照 | `remote/src/modules/owner/utils/` |
| Connector connect options、Owner closed state | 复用 `rpc-caller.type.ts` 中已有合同，移除重复声明 |
| 消息 envelope、Direct Close、Session/Owner 两级字节预留 | `remote/src/modules/protocol/utils/` |
| Protocol 调用验证、观察事件标识、handler 结果处理 | `remote/src/modules/peer/schemas/`、`utils/`、`types/` |
| Conformance 操作归因、任务状态、清理 | `remote/src/conformance/rpc-protocol-case-operation.util.ts` 及对应类型文件 |
| 重复测试夹具、Codec 样本、源码图分析、打包消费者装配 | 对应行为目录下的 `test.utils.ts` |

模块专属合同保留在所属模块；仅真正跨模块的基础常量放入 `shared`，避免形成混杂的公共 utils 集合。

## 测试与规范证据

- `tests/specification.test.ts` 保留为规范总入口，导入 29 个主题套件；Vitest 排除这些套件的重复发现，类型检查显式覆盖拆分后的套件。
- 拆分保留原有 577 项运行时测试，新增 1 项两个包的 500 行限制检查，合计 578 项。
- 更新需求矩阵中 355 个证据引用；200 条规范需求的定位与公开边界检查通过。
- 内部诊断探针指向新的真实状态所有者，没有为旧测试增加生产代码转发接口。
- Owner 与 Peer/Conformance 进行了交叉审查，未发现阻塞问题；Protocol 对恢复授权、序列提交、计时器撤销及资源释放顺序进行了复核。

## 验证

| 验证 | 结果 |
| --- | --- |
| Remote 源码与测试 TypeScript | 通过 |
| Remote 类型用例 | 153 通过，无类型错误 |
| Remote 运行时用例 | 578 通过 |
| Chromium / Firefox / WebKit | 3 通过 |
| Remote 构建与打包消费者 | 9 通过 |
| WebSocket TypeScript 与运行时 | 27 通过 |
| WebSocket 构建与打包消费者 | 5 通过 |
| 两个包的 Biome 检查 | 通过 |
| 配置包类型检查、仓库结构检查 | 通过 |
| `git diff --check` | 通过 |

浏览器和原生 WebSocket 测试首次受到沙箱本地端口限制，已在允许临时回环端口的环境中重跑通过。

根命令 `pnpm check:code-standard` 曾被另一任务正在编辑的 `examples/remote-lab` 格式和 import 排序问题阻挡；该轮失败路径全部位于该示例。本次范围的 Biome、配置类型检查与结构检查均单独执行通过。未修改另一任务的示例或 README，也未暂存、提交代码。
