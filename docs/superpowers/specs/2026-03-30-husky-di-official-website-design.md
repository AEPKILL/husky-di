# Husky-DI 官网设计文档

## 概述

构建 husky-di 依赖注入框架的官方交互式网站，整合文档、Playground、示例库和博客功能，采用极简专业风格设计。

## 目标用户

- TypeScript 开发者
- 寻找 DI 解决方案的团队
- React 开发者需要状态管理替代方案

## 技术架构

### 核心技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 框架 | TanStack Start | 基于 React Router 和 Vite |
| UI 库 | React 19+ | 函数组件 + Hooks |
| 样式 | Tailwind CSS | 原子化 CSS |
| 代码编辑器 | Monaco Editor | VS Code 同款体验 |
| 代码沙箱 | 自定义 in-browser 沙箱 | 基于 eval + Service Worker 隔离 |
| 图表 | Recharts | 性能对比可视化 |
| 部署 | GitHub Pages | 静态预渲染模式 |

### 架构约束

由于部署目标为 GitHub Pages（纯静态），采用以下策略：

1. **预渲染（Pre-rendering）**：构建时生成静态 HTML
2. **客户端 hydration**：Playground 交互逻辑在浏览器端执行
3. **无服务端 API**：所有功能不依赖后端

### 项目结构

```
husky-di/
├── apps/
│   └── website/              # 官网应用
│       ├── app/
│       │   ├── routes/       # TanStack Start 路由
│       │   │   ├── index.tsx           # 首页
│       │   │   ├── docs/               # 文档
│       │   │   │   ├── index.tsx
│       │   │   │   └── $slug.tsx       # 动态文档页
│       │   │   ├── playground/         # Playground
│       │   │   │   ├── index.tsx       # Playground 入口
│       │   │   │   ├── editor.tsx      # 代码编辑器
│       │   │   │   ├── tutorial.tsx    # 交互式教程
│       │   │   │   └── examples.tsx    # 示例库
│       │   │   ├── examples/           # 示例展示页
│       │   │   │   └── index.tsx
│       │   │   ├── blog/               # 博客
│       │   │   │   ├── index.tsx
│       │   │   │   └── $slug.tsx
│       │   ├── components/   # 共享组件
│       │   ├── styles/       # 全局样式
│       │   └── utils/        # 工具函数
│       ├── public/           # 静态资源
│       ├── package.json
│       └── tsconfig.json
├── packages/                 # 现有 husky-di 包
│   ├── core/
│   ├── decorator/
│   └── module/
└── docs/                     # 现有文档（将被替代）
```

## 页面设计

### 1. 首页（/）

**结构**：

- Hero 区域
  - 品牌名称 + Logo
  - 一句话价值主张
  - CTA 按钮（快速开始、进入 Playground）
- 特性展示（6 个特性卡片）
- 代码预览（交互式代码片段）
- 用户/采用者展示（可选）
- Footer

**视觉风格**：

- 主色调：黑白灰
- 辅助色：单一强调色（蓝色或绿色）
- 字体：系统字体 + JetBrains Mono（代码）
- 动画：微妙的过渡效果，强调专业感

### 2. 文档页（/docs）

**结构**：

- 左侧：导航树（可折叠）
- 右侧：文档内容
- 顶部：搜索框、版本选择、GitHub 链接

**内容分类**：

- 快速开始
- 核心概念
- API 参考
- 高级用法
- React 集成
- 最佳实践

**功能**：

- 全文搜索
- 代码高亮
- 深色/浅色模式切换
- 上一篇/下一篇导航

### 3. Playground（/playground）

**三个子模式**：

#### 3.1 基础编辑器模式

- 左侧：代码编辑器（Monaco）
- 右侧：实时预览面板
- 底部：控制台输出

**功能**：
- 语法高亮、自动补全
- 错误提示
- 一键运行
- 代码保存/分享（生成可分享 URL）

#### 3.2 交互式教程模式

- 分步骤引导用户学习 DI 概念
- 每个步骤包含：
  - 说明文本
  - 预置代码模板
  - 交互任务
  - 验证反馈

**教程章节**：
1. 什么是依赖注入
2. 创建第一个 Container
3. 注册和解析服务
4. 使用装饰器
5. 模块化组织
6. React 集成

#### 3.3 示例库模式

- 左侧：示例列表（分类展示）
- 右侧：可运行的示例代码
- 底部：运行结果

**示例分类**：
- 基础用法
- 装饰器模式
- 模块化
- React 集成
- 高级场景（延迟注入、作用域等）

### 4. 示例库（/examples）

- 完整可运行的应用示例
- 每个示例包含：
  - 项目说明
  - 关键代码片段
  - 在线运行入口
  - GitHub 源码链接

### 5. 博客（/blog）

- 版本发布日志
- 技术文章
- 最佳实践
- 社区贡献

**功能**：
- 按标签分类
- RSS 订阅
- 评论系统（可选 Giscus）

## 即时演示功能

### 1. 代码变更即时预览

**实现方案**：

```
用户输入 → 代码转换 → 沙箱执行 → 结果渲染
   │           │           │          │
 Monaco    Babel/TS   隔离环境    React 渲染
```

**技术细节**：

- 使用 Babel Standalone 进行浏览器端转译
- Service Worker 创建隔离执行环境
- 错误边界捕获运行时错误

### 2. 交互式组件演示

**DI 流程可视化**：

- 容器创建动画
- 服务注册过程
- 依赖解析链路图
- 生命周期钩子演示

**实现**：使用 Framer Motion 或 React Spring 制作动画

### 3. 性能对比演示

**对比场景**：

- DI vs 手动实例化
- 不同注入模式性能差异
- 懒加载效果展示

**可视化**：Recharts 柱状图/折线图

## 组件设计

### 核心组件列表

| 组件 | 职责 | 依赖 |
|------|------|------|
| `CodeEditor` | Monaco 封装 | monaco-editor |
| `PreviewPanel` | 沙箱渲染 | 自定义 |
| `ConsoleOutput` | 控制台日志 | 自定义 |
| `TutorialStep` | 教程步骤 | 自定义 |
| `ExampleCard` | 示例卡片 | 自定义 |
| `DocNav` | 文档导航 | 自定义 |
| `SearchBox` | 全文搜索 | FlexSearch |
| `ThemeToggle` | 主题切换 | 自定义 |

### 组件边界

每个组件应满足：
- 单一职责
- 清晰的 props 接口
- 可独立测试
- 内部实现可修改而不影响消费者

## 数据流

### 文档内容

- Markdown/MDX 源文件
- 构建时转换为 React 组件
- 支持 Frontmatter 元数据

### 示例代码

- 存储在 `apps/website/examples/` 目录
- 构建时打包为可导入模块
- 支持运行时动态加载

### 教程配置

```typescript
interface Tutorial {
  id: string;
  title: string;
  description: string;
  steps: TutorialStep[];
}

interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  initialCode: string;
  expectedOutput?: string;
  hint?: string;
}
```

## 错误处理

### Playground 错误

| 错误类型 | 处理方式 |
|----------|----------|
| 语法错误 | Monaco 实时提示 |
| 类型错误 | 构建时提示 |
| 运行时错误 | 捕获并显示在控制台面板 |
| 沙箱超时 | 显示超时提示，终止执行 |

### 网站错误

| 错误类型 | 处理方式 |
|----------|----------|
| 404 | 自定义 404 页面 |
| 加载失败 | 降级提示 + 重试按钮 |
| 浏览器不支持 | 兼容性提示 |

## 测试策略

### 单元测试

- 核心工具函数
- 组件渲染逻辑

### 集成测试

- Playground 代码执行流程
- 教程步骤验证逻辑

### E2E 测试

- 关键用户流程（使用 Playwright）
- 跨浏览器兼容性

## 构建与部署

### 构建流程

```bash
pnpm build
# 1. 转译 TypeScript
# 2. 打包 Monaco Editor
# 3. 预渲染所有路由
# 4. 生成 GitHub Pages 兼容输出
```

### GitHub Pages 部署

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./apps/website/dist
```

## 项目计划

### 阶段 1：基础架构（2 周）

- [ ] 项目初始化
- [ ] TanStack Start 配置
- [ ] Tailwind CSS 集成
- [ ] 基础布局组件

### 阶段 2：内容页面（2 周）

- [ ] 首页开发
- [ ] 文档系统
- [ ] 博客系统

### 阶段 3：Playground（3 周）

- [ ] Monaco Editor 集成
- [ ] 代码沙箱实现
- [ ] 交互式教程系统
- [ ] 示例库

### 阶段 4：演示功能（1 周）

- [ ] 即时预览
- [ ] 可视化动画
- [ ] 性能图表

### 阶段 5：优化与上线（1 周）

- [ ] 性能优化
- [ ] SEO 优化
- [ ] 部署配置
- [ ] 最终测试

## 验收标准

1. **功能完整**：所有页面和功能按设计实现
2. **性能达标**：
   - Lighthouse 性能分 ≥ 90
   - 首屏加载 < 2 秒
3. **兼容性**：
   - Chrome/Firefox/Safari/Edge 最新两个版本
   - 移动端响应式支持
4. **可访问性**：WCAG 2.1 AA 标准
5. **文档完整**：所有 API 和使用说明齐全

---

*设计文档版本：1.0*
*创建日期：2026-03-30*
