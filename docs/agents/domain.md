# Domain Context

本仓库采用 single-context 领域文档布局。

## 权威入口

- 仓库级领域上下文的权威来源是根目录 `CONTEXT.md`。
- `docs/agents/domain.md` 的职责是为人和 agent 提供稳定入口，而不是复制维护另一份独立上下文。

## 使用约定

- 在做诊断、设计、TDD、架构分析、issue 拆分或文档写作前，优先读取根目录 `CONTEXT.md`。
- 如果 `domain.md` 与 `CONTEXT.md` 出现不一致，以 `CONTEXT.md` 为准。
- 如果新增长期有效的架构决策，优先写入 `docs/adr/`，并在必要时同步更新 `CONTEXT.md`。

## 相关文档

- `../../CONTEXT.md`
- `../adr/`
