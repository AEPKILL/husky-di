# 发布指南

本文档描述了如何使用 Changesets 进行版本管理和发布。

## 基本工作流程

### 1. 开发新功能或修复 Bug

正常进行开发工作，提交代码到功能分支。

### 2. 创建 Changeset

当你的更改准备好发布时，创建一个 changeset：

```bash
pnpm changeset
```

这会引导你：

- 选择受影响的包
- 选择变更类型（patch/minor/major）
- 添加变更描述

### 3. 提交 Changeset

将生成的 changeset 文件与你的代码更改一起提交：

```bash
git add .changeset/your-changeset-file.md
git commit -m "feat: add new feature with changeset"
```

### 4. 合并到主分支

创建 PR 并合并到 `master` 分支。

### 5. 自动发布

合并后，GitHub Actions 会：

- 自动创建一个 "Version Packages" PR
- 更新版本号和 CHANGELOG
- 合并该 PR 后自动发布到 npm

## 变更类型指南

### Patch (补丁版本)

- Bug 修复
- 文档更新
- 内部重构（不影响 API）

### Minor (次版本)

- 新功能添加
- 新的 API 接口
- 向后兼容的更改

### Major (主版本)

- 破坏性变更
- API 接口删除或修改
- 不兼容的更改

## 包依赖关系

项目中的包依赖关系：

- `@husky-di/decorator` → 依赖 `@husky-di/core`
- `@husky-di/module` → 依赖 `@husky-di/core`
- `@husky-di/react` → 依赖 `@husky-di/core`, `@husky-di/decorator`, `@husky-di/module`

当 `core` 包更新时，依赖它的包会自动更新依赖版本。

## 手动发布命令

如果需要手动控制发布过程：

```bash
# 查看待发布的变更
pnpm changeset status

# 更新版本号（不发布）
pnpm changeset:version

# 发布到 npm
pnpm changeset:publish

# 创建快照版本（用于测试）
pnpm changeset:snapshot
```

## 预发布版本

创建预发布版本用于测试：

```bash
# 进入预发布模式
pnpm changeset pre enter alpha

# 创建预发布版本
pnpm changeset version
pnpm changeset publish --tag alpha

# 退出预发布模式
pnpm changeset pre exit
```

## 故障排除

### 如果 GitHub Actions 失败

1. 检查 NPM_TOKEN 是否正确配置
2. 确保包名在 npm 上可用
3. 检查包的访问权限设置

### 如果版本冲突

```bash
# 重置到最新版本
git pull origin master
pnpm changeset version
```

### 如果需要跳过某个包的发布

在 `.changeset/config.json` 中添加到 `ignore` 数组：

```json
{
  "ignore": ["@husky-di/package-name"]
}
```
