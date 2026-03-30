# 模块化依赖注入概念与设计思想

本文档深入浅出地解释 `@husky-di/module` 包的核心概念、设计思想和原理。通过类比、图表和代码示例，帮助读者理解为什么这样设计，而不仅仅是"是什么"。

## 模块化基础

### 什么是模块化？

模块化是一种将复杂系统分解为独立、可复用、可维护的单元的设计方法。每个模块都有明确的边界和职责，通过定义良好的接口与其他模块交互。

```
┌─────────────────────────────────────────────────────────┐
│                      应用程序                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   模块 A     │  │   模块 B     │  │   模块 C     │      │
│  │  ┌───────┐  │  │  ┌───────┐  │  │  ┌───────┐  │      │
│  │  │声明    │  │  │  │声明    │  │  │  │声明    │  │      │
│  │  │导入    │  │  │  │导入    │  │  │  │导入    │  │      │
│  │  │导出    │  │  │  │导出    │  │  │  │导出    │  │      │
│  │  └───────┘  │  │  └───────┘  │  │  └───────┘  │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

在传统依赖注入容器中，所有服务都注册在同一个全局容器中。随着应用规模增长，这种扁平结构会导致：

- **命名冲突**：不同团队可能使用相同的服务标识符名称
- **依赖不透明**：无法从代码层面看出模块间的依赖关系
- **难以维护**：修改一个服务可能影响整个应用
- **测试困难**：难以隔离测试单个功能模块

### 为什么需要模块化依赖注入？

模块化依赖注入将依赖注入与模块化架构结合，提供以下优势：

| 特性 | 传统 DI | 模块化 DI |
|------|---------|-----------|
| 边界 | 无明确边界 | 模块即边界 |
| 可见性 | 全部公开 | 显式导出才可见 |
| 依赖追踪 | 隐式 | 显式 imports |
| 命名冲突 | 全局风险 | 模块内隔离 |
| 可组合性 | 低 | 高 |

### 大型应用中的模块架构

在大型应用中，模块通常按业务领域或功能层次组织：

```
应用层
├── AppModule (根模块)
│   ├── 导入 CoreModule
│   ├── 导入 AuthModule
│   └── 导入 FeatureModule

核心层
├── CoreModule
│   ├── 导入 CommonModule
│   └── 导出 Logger, Config

业务层
├── AuthModule
│   ├── 导入 CoreModule
│   └── 导出 AuthService
├── UserModule
│   ├── 导入 CoreModule
│   └── 导出 UserService

共享层
└── CommonModule
    └── 导出 Pipe, Validator
```

这种分层架构确保：
1. **依赖方向一致**：上层依赖下层，下层不依赖上层
2. **关注点分离**：每个模块专注于单一职责
3. **可测试性**：可以独立测试每个模块

## 与 ES Modules 的类比

`@husky-di/module` 的设计深受 ES Modules 启发。理解这种类比有助于快速掌握模块系统。

### declarations 类比 const/class 声明

在 ES Modules 中，你声明变量和类：

```typescript
// user.service.ts
export class UserService {
  getUser() {
    return { id: 1, name: "Alice" };
  }
}

export const CONFIG = { timeout: 5000 };
```

在 `@husky-di/module` 中，`declarations` 等价于这些声明：

```typescript
const UserModule = createModule({
  name: "UserModule",
  declarations: [
    {
      serviceIdentifier: IUser,
      useClass: UserService,
    },
    {
      serviceIdentifier: "CONFIG",
      useValue: { timeout: 5000 },
    },
  ],
});
```

**关键区别**：DI 中的声明是**运行时注册**，而非编译时绑定。这使得动态替换实现成为可能（例如测试时使用 Mock）。

### imports 类比 import 语句

ES Modules 导入其他模块的内容：

```typescript
// app.ts
import { UserService } from "./user.service";
import { Logger } from "./logger.service";
```

`@husky-di/module` 的 `imports` 做同样的事情：

```typescript
const AppModule = createModule({
  name: "AppModule",
  imports: [UserModule, LoggerModule],
});
```

**核心机制**：导入模块时，实际上是导入了该模块**exports** 列表中声明的所有服务标识符。

### exports 类比 export 语句

ES Modules 显式导出想要暴露的内容：

```typescript
// user.service.ts
export { UserService }; // 只导出这个
// 内部 helper 函数不导出
```

`@husky-di/module` 的 `exports` 控制模块的公共 API：

```typescript
const UserModule = createModule({
  name: "UserModule",
  declarations: [
    { serviceIdentifier: IUser, useClass: UserService },
    { serviceIdentifier: "InternalHelper", useValue: helper }, // 内部实现
  ],
  exports: [IUser], // 只暴露 IUser
});
```

**设计动机**：强制封装。未导出的服务只能被模块内部访问，外部无法解析。

### 别名类比 import { x as y }

ES Modules 支持重命名导入：

```typescript
import { Logger as CoreLogger } from "./core/logger";
import { Logger as AppLogger } from "./app/logger";
```

`@husky-di/module` 使用 `withAliases` 实现相同功能：

```typescript
const AppModule = createModule({
  name: "AppModule",
  imports: [
    CoreModule.withAliases([{ serviceIdentifier: ILogger, as: "CoreLogger" }]),
    LoggerModule.withAliases([{ serviceIdentifier: ILogger, as: "AppLogger" }]),
  ],
});
```

**使用场景**：
- 解决命名冲突（两个模块导出相同服务标识符）
- 语义化重命名（使导入的服务在当前上下文中更有意义）

## 模块设计思想

### 封装与边界

模块的核心设计思想是**封装**。每个模块都是一个独立的依赖注入容器，拥有自己的注册表：

```
┌──────────────────────────────────────────────────────┐
│                    Module A                           │
│  ┌─────────────────────────────────────────────┐     │
│  │              内部容器                         │     │
│  │  ┌─────────────┐    ┌─────────────┐         │     │
│  │  │ ServiceA    │    │ ServiceB    │         │     │
│  │  │ (已导出)     │    │ (未导出)     │         │     │
│  │  └─────────────┘    └─────────────┘         │     │
│  └─────────────────────────────────────────────┘     │
│                       ↑                               │
│                       │ exports                       │
└───────────────────────│───────────────────────────────┘
                        │
                        ↓
              ┌─────────────────┐
              │   外部访问       │
              │   只能解析       │
              │   ServiceA      │
              └─────────────────┘
```

**封装的好处**：
1. **信息隐藏**：模块内部实现细节对外部不可见
2. **重构自由**：可以修改内部实现而不影响使用者
3. **减少耦合**：模块间通过明确定义的接口通信

### 依赖倒置原则

模块系统天然支持**依赖倒置原则**（Dependency Inversion Principle）：

- **高层模块不应该依赖低层模块**，两者都应该依赖其抽象
- **抽象不应该依赖细节**，细节应该依赖抽象

```typescript
// 定义抽象
const IUserRepository = createServiceIdentifier<IUserRepository>("IUserRepository");

// 低层模块 - 具体实现
const DatabaseModule = createModule({
  name: "DatabaseModule",
  declarations: [
    {
      serviceIdentifier: IUserRepository,
      useClass: PostgresUserRepository, // 具体实现
    },
  ],
  exports: [IUserRepository],
});

// 高层模块 - 业务逻辑
const UserModule = createModule({
  name: "UserModule",
  imports: [DatabaseModule],
  declarations: [
    {
      serviceIdentifier: IUserService,
      useClass: UserService, // 依赖抽象，不关心具体实现
    },
  ],
});
```

**运行时效果**：
- `UserService` 通过 `resolve(IUserRepository)` 获取实现
- 实际注入的是 `PostgresUserRepository` 实例
- 可以轻松替换为 `MockUserRepository` 进行测试

### 模块的可见性规则

模块系统遵循严格的可见性规则：

```
可见性层次结构：

Module A (声明)
├── 模块内部：完全可见
├── 导入模块：不可见（除非导出）
└── 外部容器：不可见（除非导出）

Module B (导入 Module A)
├── 导入的服务：可见（在导入作用域内）
├── 模块内部：完全可见
└── 外部容器：不可见（除非 Module B 重新导出）
```

**代码示例**：

```typescript
const InternalModule = createModule({
  name: "InternalModule",
  declarations: [
    { serviceIdentifier: "PublicService", useValue: "public" },
    { serviceIdentifier: "InternalService", useValue: "internal" },
  ],
  exports: ["PublicService"], // 只导出一个
});

// 内部访问 - 允许
const internalModule = InternalModule;
internalModule.resolve("PublicService");   // 成功
internalModule.resolve("InternalService"); // 成功

// 外部访问
const ExternalModule = createModule({
  name: "ExternalModule",
  imports: [InternalModule],
});

ExternalModule.resolve("PublicService");   // (已导出)
ExternalModule.resolve("InternalService"); // (抛出 ResolveException)
```

### 为什么需要显式导出？

显式导出是模块系统的核心设计决策，原因如下：

1. **意图明确**：导出列表即模块的公共 API，阅读代码即可知道模块提供什么
2. **意外防护**：防止内部服务被意外使用，避免"隐式依赖"
3. **版本控制**：改变导出列表是破坏性变更，提醒使用者注意
4. **树摇优化**：未导出的服务在打包时可能被优化掉

**对比隐式导出**：

```typescript
// 隐式导出（不推荐）
// 所有声明的服务都自动可用
const BadModule = createModule({
  name: "BadModule",
  declarations: [/* 所有声明都对外可见 */],
});

// 显式导出（推荐）
// 只有明确列出的才对外可见
const GoodModule = createModule({
  name: "GoodModule",
  declarations: [/* ... */],
  exports: [/* 明确指定 */],
});
```

## 模块导入机制

### 模块依赖图

模块间的依赖关系形成**有向无环图**（DAG）：

```
                    AppModule
                       │
           ┌───────────┼───────────┐
           │           │           │
           ↓           ↓           ↓
      UserModule   AuthModule   ConfigModule
           │           │           │
           └─────┬─────┘           │
                 │                 │
                 ↓                 ↓
            DatabaseModule ← CoreModule
```

**关键特性**：
- **方向性**：箭头从依赖方指向被依赖方
- **传递性**：AppModule 间接依赖 CoreModule
- **共享依赖**：UserModule 和 AuthModule 共享 DatabaseModule

### 循环依赖检测

循环依赖是模块化架构的常见陷阱：

```
循环依赖示例：

ModuleA → ModuleB → ModuleC → ModuleA
        (形成环路，无法确定初始化顺序)
```

`@husky-di/module` 在模块构造时检测循环依赖：

```typescript
const ModuleA = createModule({
  name: "ModuleA",
  imports: [ModuleB], // 抛出 "Circular dependency detected"
});

const ModuleB = createModule({
  name: "ModuleB",
  imports: [ModuleC],
});

const ModuleC = createModule({
  name: "ModuleC",
  imports: [ModuleA], // 形成环路
});
```

**检测算法**：深度优先搜索（DFS）遍历依赖图，维护访问栈。当发现当前模块已在访问栈中时，说明存在环路。

**解决方案**：
1. **提取共享模块**：将共同依赖提取到独立模块
2. **使用事件总线**：通过事件解耦模块间通信
3. **延迟注入**：使用工厂函数延迟解析依赖

### 导入冲突解决

当多个导入模块导出相同服务标识符时，发生命名冲突：

```typescript
const ModuleA = createModule({
  name: "ModuleA",
  declarations: [{ serviceIdentifier: "Logger", useValue: "A" }],
  exports: ["Logger"],
});

const ModuleB = createModule({
  name: "ModuleB",
  declarations: [{ serviceIdentifier: "Logger", useValue: "B" }],
  exports: ["Logger"],
});

// 冲突！
const ModuleC = createModule({
  name: "ModuleC",
  imports: [ModuleA, ModuleB], // 两个模块都导出 "Logger"
});
// 抛出："Service identifier "Logger" is exported by multiple imported modules"
```

**解决方案：使用别名**

```typescript
// 使用别名解决冲突
const ModuleC = createModule({
  name: "ModuleC",
  imports: [
    ModuleA,
    ModuleB.withAliases([{ serviceIdentifier: "Logger", as: "LoggerB" }]),
  ],
  // 现在可以访问 "Logger" (来自 A) 和 "LoggerB" (来自 B)
});
```

**冲突检测机制**：
1. 收集所有导入模块的导出服务标识符
2. 应用别名映射
3. 检查是否有重复的服务标识符
4. 发现冲突时抛出异常，建议使用别名

## 别名系统设计思想

### 为什么需要别名？

别名系统解决三个核心问题：

1. **命名冲突**：多个模块导出相同名称的服务
2. **多实例场景**：同一服务的多个实例（如多个数据库连接）
3. **语义适配**：在特定上下文中使用更合适的名称

**实际场景示例**：

```typescript
// 场景：应用需要连接多个数据库
const ReadDBModule = createModule({
  name: "ReadDBModule",
  declarations: [{ serviceIdentifier: IDatabase, useClass: ReadDatabase }],
  exports: [IDatabase],
});

const WriteDBModule = createModule({
  name: "WriteDBModule",
  declarations: [{ serviceIdentifier: IDatabase, useClass: WriteDatabase }],
  exports: [IDatabase],
});

// 使用别名区分
const DatabaseModule = createModule({
  name: "DatabaseModule",
  imports: [
    ReadDBModule.withAliases([{ serviceIdentifier: IDatabase, as: IReadDatabase }]),
    WriteDBModule.withAliases([{ serviceIdentifier: IDatabase, as: IWriteDatabase }]),
  ],
  exports: [IReadDatabase, IWriteDatabase],
});
```

### 别名的重命名机制

别名在**导入时**生效，创建服务标识符的映射：

```
原始服务标识符          别名映射            导入后可用
─────────────────  →  ────────────  →  ──────────────
ILogger             →  CoreLogger   →  CoreLogger
ILogger             →  AppLogger    →  AppLogger
IDatabase           →  (无)         →  IDatabase
```

**重命名规则**：
1. 别名仅作用于当前导入作用域
2. 原始服务标识符在导入后不可用（被别名替换）
3. 可以导出别名，使重命名在服务链中传递

```typescript
// 第一层：CoreModule 导出 ILogger
const CoreModule = createModule({
  name: "CoreModule",
  declarations: [{ serviceIdentifier: ILogger, useClass: Logger }],
  exports: [ILogger],
});

// 第二层：AppModule 重命名为 CoreLogger 并导出
const AppModule = createModule({
  name: "AppModule",
  imports: [
    CoreModule.withAliases([{ serviceIdentifier: ILogger, as: "CoreLogger" }]),
  ],
  exports: ["CoreLogger"], // 导出别名
});

// 第三层：FeatureModule 看到的是 CoreLogger，不是 ILogger
const FeatureModule = createModule({
  name: "FeatureModule",
  imports: [AppModule],
});

FeatureModule.resolve("CoreLogger"); // 
FeatureModule.resolve(ILogger);      // 未定义
```

### 别名与依赖注入的结合

别名在依赖注入管道中创建**间接层**：

```
解析请求：CoreLogger
       ↓
别名映射：CoreLogger → ILogger
       ↓
实际解析：ILogger (从 CoreModule 容器)
       ↓
返回实例：Logger 实例
```

**实现机制**：
```typescript
// 内部注册逻辑
container.register(as, {
  useAlias: serviceIdentifier,
  getContainer: () => sourceModule.container,
});
```

这意味着：
- 别名是一个**代理注册**，指向源容器的服务标识符
- 解析时，通过 `getContainer` 获取源容器进行解析
- 支持跨容器的依赖解析

## 模块与容器的关系

### 模块内部容器

每个模块在创建时都会构建一个独立的依赖注入容器：

```typescript
export class Module {
  readonly container: IContainer; // 每个模块有自己的容器

  constructor(options: CreateModuleOptions) {
    // ...
    this.container = this.buildContainer();
  }

  private buildContainer(): IContainer {
    const container = createContainer(this._name);
    this.registerDeclarations(container); // 注册声明
    this.registerImports(container);      // 注册导入
    return container;
  }
}
```

**容器内容**：
```
Module 容器
├── 本地声明 (declarations)
│   ├── ServiceA → Factory/Class/Value
│   └── ServiceB → Factory/Class/Value
└── 导入映射 (imports)
    ├── ImportedService → (source: OtherModule.container)
    └── AliasedService → (source: OtherModule.container, via alias)
```

### 模块容器 vs 独立容器

模块容器与独立容器的关键区别：

| 特性 | 模块容器 | 独立容器 |
|------|----------|----------|
| 创建方式 | 自动创建 | 手动创建 |
| 导出守卫 | 自动注册 | 可选 |
| 可见性 | 受 exports 限制 | 完全开放 |
| 用途 | 模块化架构 | 简单场景 |

**导出守卫中间件**：模块容器自动注册导出守卫中间件，而独立容器没有。

### 导出守卫中间件的作用

导出守卫是模块系统的**安全层**，确保只有显式导出的服务才能被外部访问：

```typescript
export function createExportedGuardMiddlewareFactory(
  exports: ReadonlyArray<ServiceIdentifier<unknown>>,
): ResolveMiddleware {
  const exportedSet = new Set(exports);
  return {
    name: "ExportGuard",
    executor(params, next) {
      const { serviceIdentifier, container, resolveRecord } = params;
      const previousContainer = findPreviousContainer(resolveRecord.getPaths());

      // 内部访问：允许
      if (previousContainer === container) {
        return next(params);
      }

      // 外部访问：检查是否在导出列表中
if (!exportedSet.has(serviceIdentifier)) {
      if (container.isRegistered(serviceIdentifier, { recursive: true })) {
        throw new ResolveException(
          `Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not exported from ${container.displayName}.`,
          resolveRecord,
        );
      }
    }

    return next(params);
  },
};
```

**工作原理**：

```
解析请求流程：

外部请求：ModuleA.resolve(ServiceX)
    ↓
导出守卫检查：ServiceX 在 exports 中吗？
    ├─ 是 → 继续解析 → 返回实例
    └─ 否 → 检查是否在容器中注册
        ├─ 是 → 抛出异常 "未导出"
        └─ 否 → 继续（可能在父容器或其他地方）
```

**内部 vs 外部访问判断**：

```typescript
// 内部访问 - 允许
module.container.resolve(ServiceA); // 直接通过容器解析，允许访问所有声明

// 外部访问 - 受限制
module.resolve(ServiceA); // 通过模块 API，受导出守卫限制
```

**设计哲学**：
1. **最小权限原则**：默认拒绝，显式允许
2. **防御性编程**：在运行时拦截非法访问
3. **透明错误**：提供清晰的错误信息，帮助调试

## 最佳实践

### 模块粒度设计

模块粒度应遵循**单一职责原则**：

```
过大模块（God Module）
const BigModule = createModule({
  name: "BigModule",
  declarations: [/* 50+ 服务 */],
  exports: [/* 30+ 服务 */],
});
// 问题：难以理解、测试和维护

合适粒度
const UserModule = createModule({ name: "UserModule", /* ... */ });
const AuthModule = createModule({ name: "AuthModule", /* ... */ });
const NotificationModule = createModule({ name: "NotificationModule", /* ... */ });
```

**粒度判断标准**：
- 模块应该在**一个 sprint 内**可以被完全理解和重构
- 模块的服务数量应该**少于 10 个**（理想情况）
- 模块应该能够**独立测试**

### 何时创建新模块

以下场景适合创建新模块：

| 场景 | 建议 | 理由 |
|------|------|------|
| 新功能开发 | 创建新模块 | 隔离变化，便于迭代 |
| 第三方集成 | 创建新模块 | 封装外部依赖 |
| 跨领域共享 | 创建共享模块 | 促进复用 |
| 测试隔离 | 创建 Mock 模块 | 便于单元测试 |
| 单一服务 | 谨慎考虑 | 可能过度设计 |

**示例：封装第三方依赖**

```typescript
// 将第三方库封装为模块
const StripeModule = createModule({
  name: "StripeModule",
  declarations: [
    {
      serviceIdentifier: IPaymentGateway,
      useFactory: () => new Stripe(config.apiKey),
    },
  ],
  exports: [IPaymentGateway],
});
```

### 模块组织策略

推荐的分层组织策略：

```
src/
├── core/                  # 核心模块（无依赖）
│   ├── core.module.ts
│   └── services/
├── shared/                # 共享模块（仅依赖 core）
│   ├── shared.module.ts
│   └── utils/
├── features/              # 功能模块（依赖 core + shared）
│   ├── user/
│   │   ├── user.module.ts
│   │   └── services/
│   └── auth/
│       ├── auth.module.ts
│       └── services/
└── app.module.ts          # 根模块（组装所有模块）
```

**依赖方向规则**：
1. `core` → 无依赖
2. `shared` → 仅依赖 `core`
3. `features/*` → 依赖 `core` + `shared`
4. `app` → 依赖所有模块

### 共享模块模式

共享模块是提取公共依赖的有效模式：

```typescript
// 提取共享依赖
const SharedModule = createModule({
  name: "SharedModule",
  declarations: [
    { serviceIdentifier: ILogger, useClass: Logger },
    { serviceIdentifier: IConfig, useValue: config },
  ],
  exports: [ILogger, IConfig],
});

// 多个模块复用
const UserModule = createModule({
  name: "UserModule",
  imports: [SharedModule],
  // ...
});

const AuthModule = createModule({
  name: "AuthModule",
  imports: [SharedModule],
  // ...
});
```

**注意事项**：
1. **避免循环依赖**：共享模块不应依赖使用它的模块
2. **最小化导出**：只导出真正需要共享的服务
3. **文档化**：在共享模块中记录每个导出的用途

---

通过理解这些概念和设计思想，你可以更有效地使用 `@husky-di/module` 构建可维护、可扩展的应用架构。记住，模块化的核心目标是**降低耦合、提高内聚**，而不是增加复杂度。
