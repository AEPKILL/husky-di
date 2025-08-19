# Husky DI

一个现代化的 TypeScript 依赖注入框架，采用 monorepo 架构，支持装饰器、模块化和 React 集成。

## 📦 包结构

- `@husky-di/core` - 核心依赖注入功能
- `@husky-di/decorator` - 装饰器支持
- `@husky-di/module` - 模块化支持
- `@husky-di/react` - React 集成组件

## 🚀 快速开始

### 安装

```bash
# 安装核心包
npm install @husky-di/core

# 使用装饰器
npm install @husky-di/decorator reflect-metadata

# 模块化支持
npm install @husky-di/module

# React 集成
npm install @husky-di/react
```

### 基本使用

```typescript
import { Container } from "@husky-di/core";

// 创建容器
const container = new Container();

// 注册服务
container.register("logger", () => new Logger());

// 解析服务
const logger = container.resolve("logger");
```

## 🛠️ 开发

### 环境要求

- Node.js >= 23
- pnpm >= 10.12.2

### 安装依赖

```bash
pnpm install
```

### 构建

```bash
pnpm build
```

### 测试

```bash
pnpm test
```

### 开发模式

```bash
pnpm dev
```

## 📋 版本管理

本项目使用 [Changesets](https://github.com/changesets/changesets) 进行版本管理。

### 贡献代码

1. 创建功能分支
2. 进行代码更改
3. 添加 changeset：`pnpm changeset`
4. 提交代码并创建 PR

详细信息请参考 [RELEASE.md](./RELEASE.md)。

## 📄 许可证

MIT License
