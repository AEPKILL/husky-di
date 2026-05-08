# Domain Docs

本文档说明工程类技能在探索代码库时应该如何读取本仓库的领域文档。

## 探索前先读取

- 仓库根目录的 **`CONTEXT.md`**，或
- 仓库根目录的 **`CONTEXT-MAP.md`**，如果它存在，则它会指向每个上下文对应的 `CONTEXT.md`；读取与当前任务相关的上下文文档。
- **`docs/adr/`**，读取与即将修改或分析的区域相关的 ADR。在 multi-context 仓库中，也要检查 `src/<context>/docs/adr/` 中的上下文级决策。

如果这些文件不存在，**静默继续**。不要把缺失当作问题报告，也不要预先建议创建它们。生产者技能（`/grill-with-docs`）会在术语或决策真正形成时按需创建这些文档。

## 文件结构

Single-context 仓库（大多数仓库）：

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context 仓库（根目录存在 `CONTEXT-MAP.md`）：

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用 glossary 中的词汇

当输出需要命名某个领域概念时，例如 issue 标题、重构建议、假设或测试名称，请使用 `CONTEXT.md` 中定义的术语。不要漂移到 glossary 明确避免的同义词。

如果需要的概念还没有出现在 glossary 中，这是一个信号：要么你正在发明项目并不使用的语言（需要重新考虑），要么这里确实有文档缺口（记下来，交给 `/grill-with-docs` 处理）。

## 标出 ADR 冲突

如果输出内容与已有 ADR 冲突，请明确指出，而不是静默覆盖：

```text
Contradicts ADR-0007 (event-sourced orders) - but worth reopening because...
```
