# Husky-DI 官网基础架构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 TanStack Start 官网项目基础架构，包含项目初始化、Tailwind CSS 集成和基础布局组件。

**Architecture:** 在 husky-di monorepo 中添加新的 `apps/website` 应用，使用 pnpm workspace 管理依赖。采用 TanStack Start 作为框架，Tailwind CSS 作为样式方案。

**Tech Stack:** TanStack Start, React 19+, TypeScript, Tailwind CSS, pnpm workspace

---

## 文件结构

### 新增文件

```
husky-di/
├── apps/
│   └── website/
│       ├── app/
│       │   ├── components/
│       │   │   └── Layout.tsx
│       │   ├── routes/
│       │   │   ├── __root.tsx
│       │   │   └── index.tsx
│       │   ├── styles/
│       │   │   └── index.css
│       │   └── routeTree.gen.ts
│       ├── public/
│       │   └── favicon.ico
│       ├── package.json
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       └── app.config.ts
├── pnpm-workspace.yaml (modify)
└── package.json (modify)
```

---

### Task 1: 初始化 apps/website 项目

**Files:**
- Create: `apps/website/package.json`
- Create: `apps/website/tsconfig.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@husky-di/website",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "preview": "vinxi preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-router": "^1.97.0",
    "@tanstack/start": "^1.97.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vinxi": "^0.5.3"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "~/*": ["./app/*"]
    }
  },
  "include": ["app/**/*", "app.config.ts"]
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/website/package.json apps/website/tsconfig.json
git commit -m "feat(website): initialize project configuration"
```

---

### Task 2: 配置 Tailwind CSS

**Files:**
- Create: `apps/website/tailwind.config.ts`
- Create: `apps/website/postcss.config.js`
- Create: `apps/website/app/styles/index.css`

- [ ] **Step 1: 创建 tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        primary: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: 创建 postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: 创建 styles/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial,
      sans-serif;
  }

  code {
    font-family: "JetBrains Mono", Monaco, Consolas, monospace;
  }
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add apps/website/tailwind.config.ts apps/website/postcss.config.js apps/website/app/styles/index.css
git commit -m "feat(website): add Tailwind CSS configuration"
```

---

### Task 3: 创建 TanStack Start 配置

**Files:**
- Create: `apps/website/app.config.ts`

- [ ] **Step 1: 创建 app.config.ts**

```typescript
import { defineConfig } from "@tanstack/start/config";

export default defineConfig({
  tsr: {
    appDirectory: "app",
    generatedRouteTree: "app/routeTree.gen.ts",
    routeFileIgnorePrefix: "_",
    quoteStyle: "double",
  },
  vite: {
    ssr: {
      noExternal: ["@husky-di/core"],
    },
  },
});
```

- [ ] **Step 2: 提交**

```bash
git add apps/website/app.config.ts
git commit -m "feat(website): add TanStack Start configuration"
```

---

### Task 4: 创建基础路由结构

**Files:**
- Create: `apps/website/app/routes/__root.tsx`
- Create: `apps/website/app/routes/index.tsx`
- Create: `apps/website/app/routeTree.gen.ts`

- [ ] **Step 1: 创建根路由 __root.tsx**

```typescript
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Meta, Scripts } from "@tanstack/start";
import "../styles/index.css";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <Meta />
      </head>
      <body className="bg-white text-gray-900 antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: 创建首页路由 index.tsx**

```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-gray-900">Husky-DI</h1>
        <p className="mt-4 text-xl text-gray-600">
          一个现代化的 TypeScript 依赖注入框架
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: 生成 routeTree.gen.ts**

```bash
cd apps/website && pnpm dlx tsr generate
```

Expected: Generates `app/routeTree.gen.ts`

- [ ] **Step 4: 提交**

```bash
git add apps/website/app/routes/__root.tsx apps/website/app/routes/index.tsx apps/website/app/routeTree.gen.ts
git commit -m "feat(website): create base route structure"
```

---

### Task 5: 创建 Layout 组件

**Files:**
- Create: `apps/website/app/components/Layout.tsx`

- [ ] **Step 1: 创建 Layout 组件**

```typescript
import { Link, useLocation } from "@tanstack/react-router";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Header() {
  const location = useLocation();

  const navItems = [
    { href: "/", label: "首页" },
    { href: "/docs", label: "文档" },
    { href: "/playground", label: "Playground" },
    { href: "/examples", label: "示例" },
    { href: "/blog", label: "博客" },
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="container mx-auto px-4">
        <ul className="flex h-16 items-center space-x-8">
          <li>
            <Link to="/" className="text-xl font-bold text-gray-900">
              Husky-DI
            </Link>
          </li>
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                to={item.href as "/" | "/docs" | "/playground" | "/examples" | "/blog"}
                className={`text-sm transition-colors hover:text-gray-900 ${
                  location.pathname === item.href
                    ? "text-gray-900 font-medium"
                    : "text-gray-600"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-8">
      <div className="container mx-auto px-4 text-center text-sm text-gray-600">
        <p>&copy; {new Date().getFullYear()} Husky-DI. MIT License.</p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/website/app/components/Layout.tsx
git commit -m "feat(website): add Layout component with Header and Footer"
```

---

### Task 6: 更新根路由使用 Layout

**Files:**
- Modify: `apps/website/app/routes/__root.tsx`

- [ ] **Step 1: 修改 __root.tsx 引入 Layout**

原内容：
```typescript
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Meta, Scripts } from "@tanstack/start";
import "../styles/index.css";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}
```

修改为：
```typescript
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Meta, Scripts } from "@tanstack/start";
import { Layout } from "~/components/Layout";
import "../styles/index.css";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Layout>
        <Outlet />
      </Layout>
    </RootDocument>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/website/app/routes/__root.tsx
git commit -m "feat(website): integrate Layout into root route"
```

---

### Task 7: 更新 Workspace 配置

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

- [ ] **Step 1: 修改 pnpm-workspace.yaml**

原内容：
```yaml
packages:
  - "packages/*"
  - "docs"
  - "scripts"
```

修改为：
```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "docs"
  - "scripts"
```

- [ ] **Step 2: 提交**

```bash
git add pnpm-workspace.yaml
git commit -m "chore(website): add apps to pnpm workspace"
```

- [ ] **Step 3: 在根 package.json 添加 website 脚本**

在 scripts 中添加：
```json
"dev:website": "pnpm --filter @husky-di/website dev",
"build:website": "pnpm --filter @husky-di/website build"
```

- [ ] **Step 4: 提交**

```bash
git add package.json
git commit -m "chore(website): add website dev and build scripts"
```

---

### Task 8: 安装依赖并验证

**Files:**
- 无

- [ ] **Step 1: 安装依赖**

```bash
pnpm install
```

Expected: 成功安装所有依赖

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/website && pnpm typecheck
```

Expected: 无类型错误

- [ ] **Step 3: 启动开发服务器**

```bash
cd apps/website && pnpm dev
```

Expected: 开发服务器启动在 http://localhost:3000

- [ ] **Step 4: 验证首页渲染**

打开浏览器访问 http://localhost:3000

Expected: 看到带有 Header 和 Footer 的首页，显示 "Husky-DI" 标题

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "chore(website): verify development setup"
```

---

### Task 9: 添加基础 SEO 元数据

**Files:**
- Modify: `apps/website/app/routes/index.tsx`

- [ ] **Step 1: 修改 index.tsx 添加 Meta 组件**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { Meta } from "@tanstack/start";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen">
      <Meta
        title="Husky-DI - 现代化的 TypeScript 依赖注入框架"
        description="一个现代化的 TypeScript 依赖注入框架，采用 monorepo 架构，支持装饰器、模块化和 React 集成。"
      />
      <main className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-gray-900">Husky-DI</h1>
        <p className="mt-4 text-xl text-gray-600">
          一个现代化的 TypeScript 依赖注入框架
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/website/app/routes/index.tsx
git commit -m "feat(website): add SEO metadata to homepage"
```

---

## 自审检查

**1. Spec 覆盖检查：**
- ✅ 项目初始化 - Task 1
- ✅ TanStack Start 配置 - Task 3
- ✅ Tailwind CSS 集成 - Task 2
- ✅ 基础布局组件 - Task 4, 5, 6
- ✅ Workspace 配置 - Task 7
- ✅ 验证开发环境 - Task 8

**2. 占位符扫描：**
- ✅ 无 "TBD"、"TODO" 或未完成任务
- ✅ 所有代码块完整
- ✅ 所有命令包含预期输出

**3. 类型一致性：**
- ✅ 所有路径类型已定义 (`"/" | "/docs" | "/playground" | "/examples" | "/blog"`)
- ✅ 组件 props 接口一致
- ✅ 导入路径使用 `~/` 别名

---

**计划完成并保存到** `docs/superpowers/plans/2026-03-30-husky-di-website-phase1.md`

**两种执行选项：**

**1. Subagent-Driven（推荐）** - 每个任务派遣独立 subagent 执行，任务间审查，快速迭代

**2. Inline Execution** - 在当前 session 中使用 executing-plans 批量执行，设置检查点

选择哪种方式？
