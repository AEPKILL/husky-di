# 操作指南

本指南提供常见任务的问题解决指南，每个章节都是独立的，你可以根据需要直接跳转到相关章节。

## 目录

- [服务注册相关](#服务注册相关)
  - [如何注册一个类服务](#如何注册一个类服务)
  - [如何注册一个值服务](#如何注册一个值服务)
  - [如何注册一个工厂服务](#如何注册一个工厂服务)
  - [如何注册一个别名服务](#如何注册一个别名服务)
  - [如何多次注册同一个服务标识符](#如何多次注册同一个服务标识符)
- [服务解析相关](#服务解析相关)
  - [如何解析服务](#如何解析服务)
  - [如何解析多个服务实例](#如何解析多个服务实例)
  - [如何可选地解析服务](#如何可选地解析服务)
  - [如何创建服务引用（ref）](#如何创建服务引用 ref)
  - [如何创建动态服务引用（dynamic）](#如何创建动态服务引用 dynamic)
- [生命周期管理](#生命周期管理)
  - [如何配置单例生命周期](#如何配置单例生命周期)
  - [如何配置瞬态生命周期](#如何配置瞬态生命周期)
  - [如何配置作用域生命周期](#如何配置作用域生命周期)
  - [三种生命周期的区别和使用场景](#三种生命周期的区别和使用场景)
- [中间件相关](#中间件相关)
  - [如何添加中间件](#如何添加中间件)
  - [如何移除中间件](#如何移除中间件)
  - [如何使用全局中间件](#如何使用全局中间件)
  - [如何创建日志中间件](#如何创建日志中间件)
  - [如何创建性能监控中间件](#如何创建性能监控中间件)
  - [如何创建缓存中间件](#如何创建缓存中间件)
- [容器管理](#容器管理)
  - [如何创建容器](#如何创建容器)
  - [如何创建子容器](#如何创建子容器)
  - [如何检查服务是否已注册](#如何检查服务是否已注册)
  - [如何取消注册服务](#如何取消注册服务)
  - [如何获取所有已注册的服务标识符](#如何获取所有已注册的服务标识符)
  - [如何处置容器](#如何处置容器)
- [高级主题](#高级主题)
  - [如何处理循环依赖](#如何处理循环依赖)
  - [如何实现服务覆盖模拟用于测试](#如何实现服务覆盖模拟用于测试)
  - [如何在工厂函数中解析其他服务](#如何在工厂函数中解析其他服务)

---

## 服务注册相关

### 如何注册一个类服务

**问题**：我需要将一个类注册到容器中，让容器自动管理其实例化。

**解决方案**：

```typescript
import { createContainer, createServiceIdentifier } from "@husky-di/core";

// 1. 定义服务类
class Logger {
  log(message: string) {
    console.log(`[LOG]: ${message}`);
  }
}

// 2. 创建服务标识符
const ILogger = createServiceIdentifier<Logger>("ILogger");

// 3. 创建容器
const container = createContainer("AppContainer");

// 4. 使用 useClass 注册类服务（默认瞬态生命周期）
container.register(ILogger, {
  useClass: Logger,
});
```

**步骤说明**：

1. 定义需要注册的类
2. 使用 `createServiceIdentifier` 创建类型安全的服务标识符
3. 创建容器实例
4. 使用 `register` 方法，传入服务标识符和包含 `useClass` 的注册选项

**完整示例**：

```typescript
import {
  createContainer,
  createServiceIdentifier,
  LifecycleEnum,
} from "@husky-di/core";

class Database {
  connect() {
    console.log("Database connected");
  }
}

const IDatabase = createServiceIdentifier<Database>("IDatabase");
const container = createContainer("AppContainer");

// 注册为单例
container.register(IDatabase, {
  useClass: Database,
  lifecycle: LifecycleEnum.singleton,
});

// 解析使用
const db = container.resolve(IDatabase);
db.connect();
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Service identifier is not registered` | 解析前未注册服务 | 确保在 `resolve` 之前调用 `register` |
| 类型错误 | 服务标识符类型与类不匹配 | 确保 `createServiceIdentifier<T>` 的泛型类型与 `useClass` 的类类型一致 |

---

### 如何注册一个值服务

**问题**：我需要将一个已经创建好的实例或配置对象注册到容器中。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");

// 注册配置对象
container.register("AppConfig", {
  useValue: {
    apiUrl: "https://api.example.com",
    timeout: 5000,
    debug: true,
  },
});

// 注册已创建的实例
class Logger {}
const sharedLogger = new Logger();
container.register("Logger", {
  useValue: sharedLogger,
});

// 注册原始值
container.register("API_URL", {
  useValue: "https://api.example.com",
});
```

**步骤说明**：

1. 创建容器
2. 使用 `register` 方法，传入服务标识符和包含 `useValue` 的注册选项
3. `useValue` 可以是对象、实例、原始值、`null` 或 `undefined`

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 值被意外修改 | 注册的对象是引用类型 | 如需不可变，注册前使用 `Object.freeze()` |
| `undefined` 被当作未注册 | 注册了 `undefined` 值 | 使用 `optional: true` 选项解析 |

---

### 如何注册一个工厂服务

**问题**：我需要使用函数动态创建服务实例，或者在创建时需要访问其他服务。

**解决方案**：

```typescript
import { createContainer, createServiceIdentifier, resolve } from "@husky-di/core";

const container = createContainer("AppContainer");

// 简单工厂
container.register("RandomNumber", {
  useFactory: () => Math.random(),
});

// 工厂中使用其他服务（使用 resolve 工具）
const ILogger = createServiceIdentifier<Logger>("ILogger");
container.register(ILogger, { useClass: Logger });

container.register("DatabaseConnection", {
  useFactory: () => {
    // 在工厂内部使用 resolve 工具解析依赖
    const logger = resolve(ILogger);
    const config = resolve("AppConfig");
    
    logger.log(`Connecting to ${config.apiUrl}`);
    return new Database(config.apiUrl);
  },
});
```

**步骤说明**：

1. 创建容器
2. 使用 `register` 方法，传入服务标识符和包含 `useFactory` 的注册选项
3. 在工厂函数内部使用 `resolve` 工具函数解析其他依赖服务

**工厂函数签名**：

```typescript
useFactory: (container: IContainer, resolveContext: ResolveContext) => T
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `resolve` 方法无法使用 | 在容器外部调用 `resolve` | `resolve` 只能在工厂函数或解析上下文中使用 |
| 循环依赖 | 工厂中解析的服务间接依赖当前服务 | 使用 `ref` 或 `dynamic` 选项延迟解析 |

---

### 如何注册一个别名服务

**问题**：我想为已有的服务创建另一个访问名称（别名）。

**解决方案**：

```typescript
import { createContainer, createServiceIdentifier } from "@husky-di/core";

const container = createContainer("AppContainer");

// 注册原始服务
const ILogger = createServiceIdentifier<Logger>("ILogger");
container.register(ILogger, { useClass: Logger });

// 注册别名
container.register("MyLogger", {
  useAlias: ILogger,
});

// 两个标识符解析到同一个实例
const logger1 = container.resolve(ILogger);
const logger2 = container.resolve("MyLogger");
```

**步骤说明**：

1. 先注册原始服务
2. 使用 `useAlias` 选项创建别名注册
3. 别名会解析到原始服务标识符对应的实例

**跨容器别名**：

```typescript
// 别名指向另一个容器的服务
const parentContainer = createContainer("Parent");
parentContainer.register(ILogger, { useClass: Logger });

const childContainer = createContainer("Child");
childContainer.register(ILogger, {
  useAlias: ILogger,
  getContainer: () => parentContainer, // 指定从父容器解析
});
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 别名指向未注册的服务 | 原始服务标识符未注册 | 确保先注册原始服务 |
| 循环别名 | A 别名到 B，B 别名到 A | 检查别名链，确保无循环 |

---

### 如何多次注册同一个服务标识符

**问题**：我想为同一个服务标识符注册多个实现，然后根据需要获取全部或部分实例。

**解决方案**：

```typescript
import { createContainer, createServiceIdentifier } from "@husky-di/core";

const container = createContainer("AppContainer");

const ILogger = createServiceIdentifier<Logger>("ILogger");

// 多次注册同一个标识符
container.register(ILogger, { useClass: ConsoleLogger });
container.register(ILogger, { useClass: FileLogger });
container.register(ILogger, { useClass: DatabaseLogger });
```

**解析多个实例**：

```typescript
// 默认解析最后一个注册
const logger = container.resolve(ILogger); // 返回 DatabaseLogger

// 解析所有注册实例
const loggers = container.resolve(ILogger, { multiple: true });
// 返回 [ConsoleLogger, FileLogger, DatabaseLogger]
```

**使用场景**：

```typescript
// 注册多个通知服务
const INotifier = createServiceIdentifier<Notifier>("INotifier");

container.register(INotifier, { useClass: EmailNotifier });
container.register(INotifier, { useClass: SmsNotifier });
container.register(INotifier, { useClass: PushNotifier });

// 解析所有通知器并发送通知
const notifiers = container.resolve(INotifier, { multiple: true });
notifiers.forEach((notifier) => notifier.send(message));
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 只获取到最后一个实例 | 未使用 `multiple: true` 选项 | 添加 `{ multiple: true }` 选项 |
| 生命周期混乱 | 多个注册的 lifecycle 不同 | 为每个注册明确指定 lifecycle |

---

## 服务解析相关

### 如何解析服务

**问题**：我需要从容器中获取已注册的服务实例。

**解决方案**：

```typescript
import { createContainer, createServiceIdentifier } from "@husky-di/core";

const container = createContainer("AppContainer");

// 注册服务
const ILogger = createServiceIdentifier<Logger>("ILogger");
container.register(ILogger, { useClass: Logger });

// 解析服务
const logger = container.resolve(ILogger);
logger.log("Hello");
```

**解析不同类型服务**：

```typescript
// 解析类服务
const logger = container.resolve(ILogger);

// 解析值服务
const config = container.resolve("AppConfig");

// 解析工厂服务
const timestamp = container.resolve("Timestamp");
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Service identifier is not registered` | 服务未注册 | 先调用 `register` 或使用 `optional: true` |
| `Circular dependency detected` | 循环依赖 | 使用 `ref` 或 `dynamic` 选项 |

---

### 如何解析多个服务实例

**问题**：同一个服务标识符有多个注册，我想获取所有实例。

**解决方案**：

```typescript
import { createContainer, createServiceIdentifier } from "@husky-di/core";

const container = createContainer("AppContainer");

const IPlugin = createServiceIdentifier<Plugin>("IPlugin");

// 注册多个插件
container.register(IPlugin, { useClass: PluginA });
container.register(IPlugin, { useClass: PluginB });
container.register(IPlugin, { useClass: PluginC });

// 解析所有实例
const plugins = container.resolve(IPlugin, { multiple: true });
// plugins 类型为 Plugin[]
```

**带默认值的多重解析**：

```typescript
// 如果没有注册，返回空数组
const plugins = container.resolve(IPlugin, {
  multiple: true,
  optional: true,
  defaultValue: [],
});
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 只返回单个实例 | 未使用 `multiple: true` | 添加 `{ multiple: true }` 选项 |
| 类型错误 | `defaultValue` 类型不匹配 | 确保 `defaultValue` 是 `T[]` 类型 |

---

### 如何可选地解析服务

**问题**：某些服务可能未注册，我希望在解析失败时返回 `undefined` 而不是抛出异常。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");

// 可选解析 - 未注册返回 undefined
const optionalConfig = container.resolve("OptionalConfig", {
  optional: true,
});
// optionalConfig 类型为 ConfigType | undefined

// 可选解析带默认值
const config = container.resolve("Config", {
  optional: true,
  defaultValue: { apiUrl: "http://localhost:3000" },
});
```

**使用场景**：

```typescript
class NotificationService {
  // 必需依赖
  private logger = resolve(ILogger);
  
  // 可选依赖 - 邮件服务可能未配置
  private emailService = resolve(IEmailService, { optional: true });
  
  // 可选依赖带默认值
  private smsService = resolve(ISmsService, {
    optional: true,
    defaultValue: new DefaultSmsService(),
  });
  
  send(message: string) {
    this.logger.log(`Sending: ${message}`);
    
    // 安全使用可选依赖
    if (this.emailService) {
      this.emailService.sendEmail(message);
    }
    
    // 使用默认值或注册的服务
    this.smsService.sendSms(message);
  }
}
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 类型错误 | 未处理 `undefined` 情况 | 使用前检查 `if (service)` 或提供 `defaultValue` |
| `defaultValue` 与 `optional` 不匹配 | 未设置 `optional: true` 时使用 `defaultValue` | 确保 `optional: true` |

---

### 如何创建服务引用（ref）

**问题**：我需要延迟服务解析，或者需要打破循环依赖。

**解决方案**：

```typescript
import { createContainer, createServiceIdentifier } from "@husky-di/core";

const container = createContainer("AppContainer");

const ILogger = createServiceIdentifier<Logger>("ILogger");
container.register(ILogger, { useClass: Logger });

// 创建引用（惰性解析）
const loggerRef = container.resolve(ILogger, { ref: true });
// 此时服务尚未解析

// 首次访问 .current 时才解析
loggerRef.current.log("Hello");

// 后续访问返回缓存的实例
loggerRef.current.log("World");
```

**引用类型**：

```typescript
import type { Ref } from "@husky-di/core";

const loggerRef: Ref<Logger> = container.resolve(ILogger, { ref: true });

// 检查是否已解析
if (!loggerRef.resolved) {
  // 尚未解析
}

const logger = loggerRef.current; // 触发解析
```

**打破循环依赖**：

```typescript
class ServiceA {
  // 使用 ref 打破循环
  private serviceBRef = resolve(IServiceB, { ref: true });
  
  doSomething() {
    this.serviceBRef.current.doOtherThing(); // 访问时才解析
  }
}
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 同时使用 `ref` 和 `dynamic` | 两者互斥 | 选择其中之一 |
| 忘记访问 `.current` | 直接调用 ref 的方法 | 使用 `ref.current.method()` |

---

### 如何创建动态服务引用（dynamic）

**问题**：我需要在每次访问时都重新解析服务，而不是缓存实例。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");

// 注册瞬态服务
container.register("Counter", {
  useFactory: () => ({ count: 0 }),
});

// 创建动态引用
const counterRef = container.resolve("Counter", { dynamic: true });

// 每次访问都重新解析
const c1 = counterRef.current; // count: 0
const c2 = counterRef.current; // count: 0 (新实例)

// 修改不会影响后续访问
c1.count = 100;
console.log(counterRef.current.count); // 仍然是 0
```

**动态引用 vs 普通引用**：

| 特性 | Ref (`ref: true`) | Dynamic Ref (`dynamic: true`) |
|------|-------------------|-------------------------------|
| 解析时机 | 首次访问 `.current` 时 | 每次访问 `.current` 时 |
| 实例缓存 | 缓存首次解析的实例 | 不缓存，每次都新解析 |
| 内存管理 | 解析后释放闭包 | 始终持有闭包，注意内存泄漏 |

**使用场景**：

```typescript
// 需要获取最新配置的场景
class ConfigReader {
  private configRef = resolve("Config", { dynamic: true });
  
  read() {
    // 每次读取都获取最新配置
    return this.configRef.current;
  }
}
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 内存泄漏 | dynamic ref 持有闭包 | 避免长时间持有 dynamic ref |
| 同时使用 `ref` 和 `dynamic` | 两者互斥 | 选择其中之一 |

---

## 生命周期管理

### 如何配置单例生命周期

**问题**：我希望服务在整个应用生命周期内只创建一个实例。

**解决方案**：

```typescript
import { createContainer, LifecycleEnum } from "@husky-di/core";

const container = createContainer("AppContainer");

// 配置单例生命周期
container.register("Database", {
  useClass: Database,
  lifecycle: LifecycleEnum.singleton,
});

// 两次解析返回同一个实例
const db1 = container.resolve("Database");
const db2 = container.resolve("Database");

console.log(db1 === db2); // true
```

**单例特点**：

- 首次解析时创建实例
- 后续解析返回同一实例
- 实例缓存在注册对象中
- 适用于共享服务（数据库连接、配置服务等）

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 状态污染 | 单例状态被意外修改 | 使用不可变数据或明确状态管理 |
| 延迟初始化问题 | 单例依赖未就绪 | 使用工厂函数控制初始化时机 |

---

### 如何配置瞬态生命周期

**问题**：我希望每次解析都创建一个新的实例。

**解决方案**：

```typescript
import { createContainer, LifecycleEnum } from "@husky-di/core";

const container = createContainer("AppContainer");

// 配置瞬态生命周期（默认值，可省略）
container.register("UserSession", {
  useClass: UserSession,
  lifecycle: LifecycleEnum.transient, // 默认值
});

// 每次解析都创建新实例
const session1 = container.resolve("UserSession");
const session2 = container.resolve("UserSession");

console.log(session1 === session2); // false
```

**瞬态特点**：

- 每次解析创建新实例
- 无实例缓存
- 适用于无状态服务或需要隔离状态的场景

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 意外共享状态 | 误用单例 | 明确使用 `LifecycleEnum.transient` |
| 资源泄漏 | 瞬态服务持有资源未释放 | 实现 `Disposable` 接口并正确处置 |

---

### 如何配置作用域生命周期

**问题**：我希望在同一次解析链中共享实例，但不同解析链使用不同实例。

**解决方案**：

```typescript
import { createContainer, LifecycleEnum } from "@husky-di/core";

const container = createContainer("AppContainer");

// 配置作用域生命周期
container.register("UnitOfWork", {
  useClass: UnitOfWork,
  lifecycle: LifecycleEnum.resolution,
});

// 在同一次解析中共享实例
class UserService {
  private unitOfWork = resolve("UnitOfWork");
}

class OrderService {
  private unitOfWork = resolve("UnitOfWork");
}

// 解析UserService 时，UserService 和 OrderService 共享同一个 UnitOfWork
const userService = container.resolve(UserService);
```

**作用域生命周期特点**：

- 在同一次解析上下文中共享实例
- 不同解析调用创建不同实例
- 适用于工作单元（Unit of Work）、请求上下文等场景

**使用场景**：

```typescript
// 数据库工作单元 - 同一业务操作共享事务
container.register("UnitOfWork", {
  useClass: UnitOfWork,
  lifecycle: LifecycleEnum.resolution,
});

container.register("UserRepository", {
  useClass: UserRepository,
});

container.register("OrderRepository", {
  useClass: OrderRepository,
});

// 解析 UserService 时，UserRepository 和 OrderRepository
// 会共享同一个 UnitOfWork 实例
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 跨请求共享 | 误将 resolution 当 singleton 使用 | 理解 resolution 作用域限制 |
| 状态不一致 | 不同解析链的状态混合 | 确保业务逻辑在单次解析链内完成 |

---

### 三种生命周期的区别和使用场景

**问题**：我不清楚三种生命周期的区别，不知道何时使用哪种生命周期。

**解决方案**：

**生命周期对比表**：

| 生命周期 | 实例创建时机 | 实例缓存位置 | 是否共享 | 适用场景 |
|----------|--------------|--------------|----------|----------|
| `transient` | 每次解析时 | 不缓存 | 不共享 | 无状态服务、临时对象 |
| `singleton` | 首次解析时 | 注册对象 | 全局共享 | 配置服务、数据库连接 |
| `resolution` | 首次解析时（单次解析链内） | 解析上下文 | 解析链内共享 | 工作单元、请求上下文 |

**详细示例**：

```typescript
import { createContainer, LifecycleEnum } from "@husky-di/core";

const container = createContainer("AppContainer");

// Transient - 每次都新创建
container.register("TransientService", {
  useClass: TransientService,
  lifecycle: LifecycleEnum.transient,
});

const t1 = container.resolve("TransientService");
const t2 = container.resolve("TransientService");
console.log(t1 === t2); // false

// Singleton - 全局单例
container.register("SingletonService", {
  useClass: SingletonService,
  lifecycle: LifecycleEnum.singleton,
});

const s1 = container.resolve("SingletonService");
const s2 = container.resolve("SingletonService");
console.log(s1 === s2); // true

// Resolution - 解析链内共享
container.register("ResolutionService", {
  useClass: ResolutionService,
  lifecycle: LifecycleEnum.resolution,
});

const r1 = container.resolve("ResolutionService");
const r2 = container.resolve("ResolutionService");
console.log(r1 === r2); // false (不同解析调用)
```

**使用建议**：

1. **默认使用 `transient`**：最安全，避免状态共享问题
2. **需要全局共享时用 `singleton`**：配置、日志、数据库连接
3. **需要操作单元内共享时用 `resolution`**：事务、工作单元、请求上下文

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 滥用单例 | 所有服务都用 singleton | 根据实际需要选择生命周期 |
| 状态泄漏 | transient 服务持有全局状态 | 将状态移到 singleton 服务中 |
| 混淆 resolution 和 singleton | 认为 resolution 也是全局共享 | 理解 resolution 作用域限制 |

---

## 中间件相关

### 如何添加中间件

**问题**：我需要在服务解析过程中添加自定义逻辑（如日志、验证等）。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");

// 添加中间件
container.use({
  name: "logging",
  executor: (params, next) => {
    console.log(`解析服务：${params.serviceIdentifier}`);
    const result = next(params); // 继续执行下一个中间件或解析
    console.log(`解析完成：${params.serviceIdentifier}`);
    return result;
  },
});
```

**中间件执行顺序**：

```typescript
// 中间件按 LIFO（后进先出）顺序执行

container.use({ name: "A", executor: (params, next) => {
  console.log("A-before");
  const result = next(params);
  console.log("A-after");
  return result;
}});

container.use({ name: "B", executor: (params, next) => {
  console.log("B-before");
  const result = next(params);
  console.log("B-after");
  return result;
}});

// 执行顺序：
// B-before -> A-before -> 解析 -> A-after -> B-after
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 忘记调用 `next()` | 中间件中断解析链 | 确保调用 `next(params)` |
| 顺序错误 | 不理解 LIFO 顺序 | 后添加的中间件先执行 |

---

### 如何移除中间件

**问题**：我需要移除之前添加的中间件。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");

// 保存中间件引用
const loggingMiddleware = {
  name: "logging",
  executor: (params, next) => {
    console.log(`解析：${params.serviceIdentifier}`);
    return next(params);
  },
};

// 添加中间件
container.use(loggingMiddleware);

// 移除中间件（需要同一引用）
container.unused(loggingMiddleware);
```

**注意事项**：

- `unused` 需要中间件的同一引用
- 使用不同对象即使内容相同也无法移除

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 无法移除 | 使用不同对象引用 | 保存中间件引用以便移除 |
| 移除不存在 | 中间件从未添加 | 检查中间件是否正确添加 |

---

### 如何使用全局中间件

**问题**：我希望某些中间件应用到所有容器。

**解决方案**：

```typescript
import { createContainer, globalMiddleware } from "@husky-di/core";

// 添加全局中间件
globalMiddleware.use({
  name: "global-logging",
  executor: (params, next) => {
    console.log(`[全局日志] 解析：${params.serviceIdentifier}`);
    return next(params);
  },
});

// 所有容器都会应用这个中间件
const container1 = createContainer("Container1");
const container2 = createContainer("Container2");

// 两个容器都会执行 global-logging 中间件
container1.resolve("Service");
container2.resolve("Service");
```

**全局中间件特点**：

- 应用到所有容器
- 执行顺序在全局中间件内部，容器中间件包裹全局中间件
- 适用于跨应用的关注点（日志、监控等）

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 全局状态污染 | 全局中间件持有状态 | 避免在全局中间件中持有关联状态 |
| 移除困难 | 忘记保存引用 | 保存全局中间件引用以便移除 |

---

### 如何创建日志中间件

**问题**：我需要记录所有服务解析的日志。

**解决方案**：

```typescript
import { createContainer, type ResolveMiddleware } from "@husky-di/core";

const container = createContainer("AppContainer");

// 创建日志中间件
const loggingMiddleware: ResolveMiddleware<unknown, unknown> = {
  name: "logging",
  executor: (params, next) => {
    const startTime = Date.now();
    
    console.log(`[DI] 开始解析：${params.serviceIdentifier}`);
    
    try {
      const result = next(params);
      
      const duration = Date.now() - startTime;
      console.log(`[DI] 解析完成：${params.serviceIdentifier} (${duration}ms)`);
      
      return result;
    } catch (error) {
      console.error(`[DI] 解析失败：${params.serviceIdentifier}`, error);
      throw error;
    }
  },
};

container.use(loggingMiddleware);
```

**增强日志中间件**：

```typescript
// 带日志级别和上下文的日志中间件
const advancedLoggingMiddleware: ResolveMiddleware<unknown, unknown> = {
  name: "advanced-logging",
  executor: (params, next) => {
    const { serviceIdentifier, container } = params;
    const context = {
      containerName: container.name,
      timestamp: new Date().toISOString(),
    };
    
    console.log(JSON.stringify({
      ...context,
      event: "resolve-start",
      service: String(serviceIdentifier),
    }));
    
    const result = next(params);
    
    console.log(JSON.stringify({
      ...context,
      event: "resolve-end",
      service: String(serviceIdentifier),
    }));
    
    return result;
  },
};
```

---

### 如何创建性能监控中间件

**问题**：我需要监控服务解析的性能。

**解决方案**：

```typescript
import { createContainer, type ResolveMiddleware } from "@husky-di/core";

// 性能指标收集器
const metrics = new Map<string, { count: number; totalTime: number }>();

const performanceMiddleware: ResolveMiddleware<unknown, unknown> = {
  name: "performance",
  executor: (params, next) => {
    const { serviceIdentifier } = params;
    const key = String(serviceIdentifier);
    const start = performance.now();
    
    try {
      const result = next(params);
      
      const duration = performance.now() - start;
      
      // 更新指标
      const existing = metrics.get(key) || { count: 0, totalTime: 0 };
      metrics.set(key, {
        count: existing.count + 1,
        totalTime: existing.totalTime + duration,
      });
      
      // 记录慢解析
      if (duration > 100) {
        console.warn(
          `[性能警告] ${key} 解析耗时 ${duration.toFixed(2)}ms`
        );
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.error(
        `[性能错误] ${key} 解析失败 (${duration.toFixed(2)}ms)`,
        error
      );
      throw error;
    }
  },
};

// 使用
const container = createContainer("AppContainer");
container.use(performanceMiddleware);

// 查看指标
function printMetrics() {
  for (const [service, { count, totalTime }] of metrics.entries()) {
    const avg = totalTime / count;
    console.log(
      `${service}: ${count}次解析, 平均 ${avg.toFixed(2)}ms, 总计 ${totalTime.toFixed(2)}ms`
    );
  }
}
```

---

### 如何创建缓存中间件

**问题**：我想缓存某些服务的解析结果以提升性能。

**解决方案**：

```typescript
import { createContainer, type ResolveMiddleware } from "@husky-di/core";

// 简单缓存中间件
const cacheMiddleware: ResolveMiddleware<unknown, unknown> = {
  name: "cache",
  executor: (params, next) => {
    const { serviceIdentifier } = params;
    const cacheKey = `cache:${String(serviceIdentifier)}`;
    
    // 检查缓存
    const cached = (globalThis as any)[cacheKey];
    if (cached !== undefined) {
      return cached;
    }
    
    // 解析并缓存
    const result = next(params);
    (globalThis as any)[cacheKey] = result;
    
    return result;
  },
};

// 使用 WeakMap 的缓存中间件（更安全的内存管理）
const weakCacheMiddleware: ResolveMiddleware<unknown, unknown> = {
  name: "weak-cache",
  executor: (params, next) => {
    const { serviceIdentifier } = params;
    
    // 使用 WeakMap 缓存
    const cache = new WeakMap();
    
    // 注意：这里简化示例，实际需要外部存储
    // 实际应用中应使用合适的缓存策略
    return next(params);
  },
};
```

**带失效策略的缓存**：

```typescript
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const ttlCache = new Map<string, CacheEntry<unknown>>();

const ttlCacheMiddleware: ResolveMiddleware<unknown, unknown> = {
  name: "ttl-cache",
  executor: (params, next) => {
    const { serviceIdentifier } = params;
    const cacheKey = String(serviceIdentifier);
    const ttl = 60000; // 1 分钟
    
    // 检查缓存
    const entry = ttlCache.get(cacheKey);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value as unknown;
    }
    
    // 解析并缓存
    const result = next(params);
    ttlCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + ttl,
    });
    
    return result;
  },
};
```

---

## 容器管理

### 如何创建容器

**问题**：我需要创建一个新的 DI 容器。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

// 创建简单容器
const container = createContainer("MyApp");

// 容器默认以 rootContainer 为父容器
// 所有容器共享同一个根容器
```

**容器属性**：

```typescript
const container = createContainer("MyApp");

console.log(container.id); // 唯一标识符
console.log(container.name); // "MyApp"
console.log(container.displayName); // "MyApp#<id>"
console.log(container.parent); // 父容器（默认 rootContainer）
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 名称冲突 | 多个容器同名 | 名称仅用于调试，不影响功能 |
| 忘记处置 | 容器不再使用未处置 | 使用 `container.dispose()` |

---

### 如何创建子容器

**问题**：我需要创建有父子关系的容器层级。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

// 创建根容器
const rootContainer = createContainer("Root");
rootContainer.register("SharedService", { useClass: SharedService });

// 创建子容器
const childContainer = createContainer("Child", rootContainer);

// 子容器可以解析父容器的服务
const sharedService = childContainer.resolve("SharedService");
```

**覆盖父容器服务**：

```typescript
// 子容器覆盖父容器的服务
childContainer.register("SharedService", {
  useClass: ChildSharedService,
});

// 现在解析使用子容器的实现
const service = childContainer.resolve("SharedService"); // ChildSharedService
const parentService = rootContainer.resolve("SharedService"); // SharedService
```

**层级解析规则**：

```typescript
const grandparent = createContainer("Grandparent");
const parent = createContainer("Parent", grandparent);
const child = createContainer("Child", parent);

grandparent.register("Service", { useClass: GrandparentService });
parent.register("Service", { useClass: ParentService });

// 子容器优先使用最近的注册
const service = child.resolve("Service"); // ParentService

// 递归检查注册
child.isRegistered("Service"); // false（当前容器未注册）
child.isRegistered("Service", { recursive: true }); // true（父容器有）
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 预期继承但失败 | 父容器已处置 | 检查 `container.disposed` 状态 |
| 层级混乱 | 不理解就近原则 | 子容器优先覆盖父容器 |

---

### 如何检查服务是否已注册

**问题**：我想在解析前确认服务是否已注册。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");
container.register("Service", { useClass: Service });

// 检查当前容器
const isRegistered = container.isRegistered("Service"); // true
const isNotRegistered = container.isRegistered("OtherService"); // false

// 递归检查（包括父容器）
const childContainer = createContainer("Child", container);
childContainer.isRegistered("Service"); // false
childContainer.isRegistered("Service", { recursive: true }); // true
```

**使用场景**：

```typescript
function safeResolve<T>(
  container: IContainer,
  serviceIdentifier: ServiceIdentifier<T>,
  defaultValue: T
): T {
  if (container.isRegistered(serviceIdentifier, { recursive: true })) {
    return container.resolve(serviceIdentifier);
  }
  return defaultValue;
}
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 忽略递归选项 | 期望检查父容器但未设置 recursive | 使用 `{ recursive: true }` |
| 检查后状态变化 | 检查和解析间服务被移除 | 直接使用 `optional: true` 解析 |

---

### 如何取消注册服务

**问题**：我需要移除已注册的服务。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");

// 注册服务
container.register("Service", { useClass: Service });

// 取消注册
container.unregister("Service");

// 再次解析会抛出异常
try {
  container.resolve("Service");
} catch (error) {
  console.log("服务已取消注册");
}
```

**注意事项**：

- `unregister` 不影响已解析的实例
- 单例实例不会被自动处置
- 取消注册未注册的服务不会报错

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 实例未释放 | 取消注册后实例仍被引用 | 手动处置单例实例 |
| 子容器影响父容器 | 期望取消父容器服务 | unregister 只影响当前容器 |

---

### 如何获取所有已注册的服务标识符

**问题**：我想知道容器中注册了哪些服务。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");

container.register("ServiceA", { useClass: ServiceA });
container.register("ServiceB", { useClass: ServiceB });
container.register(ILogger, { useClass: Logger });

// 获取所有服务标识符
const identifiers = container.getServiceIdentifiers();

console.log(`已注册 ${identifiers.length} 个服务`);
identifiers.forEach((id) => {
  console.log(`- ${id}`);
});
```

**使用场景**：

```typescript
// 调试和诊断
function debugContainer(container: IContainer) {
  console.log(`容器：${container.displayName}`);
  console.log(`注册的服务:`);
  container.getServiceIdentifiers().forEach((id) => {
    console.log(`  - ${String(id)}`);
  });
}
```

**注意事项**：

- 只返回当前容器注册的服务
- 不包含父容器的服务
- 多次注册同一标识符只返回一次

---

### 如何处置容器

**问题**：容器不再使用时，我需要释放其占用的资源。

**解决方案**：

```typescript
import { createContainer } from "@husky-di/core";

const container = createContainer("AppContainer");

// 使用容器
container.register("Service", { useClass: Service });
const service = container.resolve("Service");

// 处置容器
container.dispose();

// 处置后无法再使用
try {
  container.resolve("Service");
} catch (error) {
  console.log("容器已处置");
}
```

**可处置服务**：

```typescript
// 实现 Disposable 接口的服务会在容器处置时被清理
class DatabaseConnection implements Disposable {
  [Symbol.dispose]() {
    console.log("数据库连接已关闭");
  }
}

container.register("Database", {
  useClass: DatabaseConnection,
  lifecycle: LifecycleEnum.singleton,
});

// 容器处置时会调用 DatabaseConnection 的 [Symbol.dispose]
container.dispose();
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 处置后继续使用 | 容器已 disposed | 检查 `container.disposed` 状态 |
| 内存泄漏 | 未处置容器 | 应用退出前处置所有容器 |
| 子容器未处置 | 只处置父容器 | 显式处置所有子容器 |

---

## 高级主题

### 如何处理循环依赖

**问题**：服务 A 依赖服务 B，服务 B 又依赖服务 A，如何解决循环依赖？

**解决方案**：

循环依赖是 DI 中的常见问题。Husky DI 提供了几种解决方案：

**方案 1：使用 ref 选项**

```typescript
import { createContainer, createServiceIdentifier, resolve } from "@husky-di/core";

const container = createContainer("AppContainer");

class ServiceA {
  // 使用 ref 延迟解析 ServiceB
  private serviceBRef = resolve(IServiceB, { ref: true });
  
  doSomething() {
    // 访问时才解析，此时 ServiceB 已创建完成
    this.serviceBRef.current.doOtherThing();
  }
}

class ServiceB {
  private serviceA = resolve(IServiceA); // 正常解析
  
  doOtherThing() {
    console.log("doing other thing");
  }
}

const IServiceA = createServiceIdentifier<ServiceA>("IServiceA");
const IServiceB = createServiceIdentifier<ServiceB>("IServiceB");

container.register(IServiceA, { useClass: ServiceA });
container.register(IServiceB, { useClass: ServiceB });

// 现在可以正常解析
const serviceA = container.resolve(IServiceA);
```

**方案 2：使用 dynamic 选项**

```typescript
class ServiceA {
  // 每次访问都重新解析
  private serviceBRef = resolve(IServiceB, { dynamic: true });
  
  doSomething() {
    this.serviceBRef.current.doOtherThing();
  }
}
```

**方案 3：重构设计（推荐）**

```typescript
// 引入第三方服务打破循环
class Mediator {
  // 协调 A 和 B 的交互
}

class ServiceA {
  private mediator = resolve(Mediator);
}

class ServiceB {
  private mediator = resolve(Mediator);
}
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 直接调用依赖方法 | 未使用 ref/dynamic | 使用 `ref.current.method()` |
| 同时使用 ref 和 dynamic | 两者互斥 | 选择其中之一 |
| 忽略设计问题 | 循环依赖表明设计可能需要重构 | 考虑引入中介者或事件系统 |

---

### 如何实现服务覆盖/模拟（用于测试）

**问题**：我想在测试中用模拟服务替换真实服务。

**解决方案**：

**方案 1：子容器覆盖**

```typescript
import { createContainer } from "@husky-di/core";

// 生产容器
const productionContainer = createContainer("Production");
productionContainer.register(ILogger, { useClass: RealLogger });
productionContainer.register(IDatabase, { useClass: RealDatabase });

// 测试容器（子容器）
const testContainer = createContainer("Test", productionContainer);

// 在测试容器中覆盖服务
testContainer.register(ILogger, {
  useValue: {
    log: vi.fn(),
    error: vi.fn(),
  },
});

testContainer.register(IDatabase, {
  useValue: {
    connect: vi.fn(),
    query: vi.fn().mockReturnValue([]),
  },
});

// 测试容器使用模拟服务
const logger = testContainer.resolve(ILogger);
logger.log("test"); // 调用 mock 函数
```

**方案 2：工厂容器**

```typescript
function createTestContainer() {
  const container = createContainer("Test");
  
  // 注册所有模拟服务
  container.register(ILogger, { useValue: createMockLogger() });
  container.register(IDatabase, { useValue: createMockDatabase() });
  
  return container;
}

// 测试中使用
const testContainer = createTestContainer();
const service = testContainer.resolve(MyService);
```

**使用 Vitest 示例**：

```typescript
import { describe, it, expect, vi } from "vitest";
import { createContainer } from "@husky-di/core";

describe("UserService", () => {
  it("should create user", () => {
    const container = createContainer("Test");
    
    const mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
    };
    
    container.register(ILogger, { useValue: mockLogger });
    container.register(IUserService, { useClass: UserService });
    
    const userService = container.resolve(IUserService);
    const user = userService.createUser("Alice");
    
    expect(user.name).toBe("Alice");
    expect(mockLogger.log).toHaveBeenCalled();
  });
});
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 污染生产容器 | 直接修改生产容器 | 使用子容器或独立测试容器 |
| Mock 类型不匹配 | 模拟对象缺少方法 | 确保 mock 实现完整接口 |
| 忘记重置 | 多次测试互相影响 | 每次测试创建新容器 |

---

### 如何在工厂函数中解析其他服务

**问题**：我需要在工厂函数内部解析其他依赖服务。

**解决方案**：

**使用 resolve 工具函数**：

```typescript
import { createContainer, createServiceIdentifier, resolve } from "@husky-di/core";

const container = createContainer("AppContainer");

const ILogger = createServiceIdentifier<Logger>("ILogger");
container.register(ILogger, { useClass: Logger });

container.register("DatabaseConnection", {
  useFactory: () => {
    // 在工厂内部使用 resolve 工具
    const logger = resolve(ILogger);
    const config = resolve("AppConfig");
    
    logger.log(`Connecting to ${config.apiUrl}`);
    return new Database(config.apiUrl);
  },
});
```

**使用工厂函数参数**：

```typescript
container.register("DatabaseConnection", {
  useFactory: (container, resolveContext) => {
    // 通过容器参数解析
    const logger = container.resolve(ILogger);
    const config = container.resolve("AppConfig");
    
    return new Database(config.apiUrl);
  },
});
```

**完整示例**：

```typescript
import { createContainer, createServiceIdentifier, resolve, LifecycleEnum } from "@husky-di/core";

const container = createContainer("AppContainer");

// 注册配置
container.register("AppConfig", {
  useValue: {
    databaseUrl: "postgres://localhost:5432/mydb",
    poolSize: 10,
  },
});

// 注册日志
container.register(ILogger, {
  useClass: Logger,
  lifecycle: LifecycleEnum.singleton,
});

// 使用工厂注册数据库连接
container.register(IDatabase, {
  useFactory: () => {
    // 使用 resolve 工具解析依赖
    const config = resolve("AppConfig");
    const logger = resolve(ILogger);
    
    logger.log("Creating database connection...");
    
    const db = new Database();
    db.connect(config.databaseUrl);
    
    return db;
  },
  lifecycle: LifecycleEnum.singleton,
});
```

**常见错误**：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `resolve` 在容器外调用 | 在工厂外使用 `resolve` | `resolve` 只能在解析上下文中使用 |
| 循环依赖 | 工厂解析的服务依赖工厂自身 | 使用 `ref` 延迟解析 |
| 容器参数未使用 | 工厂函数签名错误 | 确保 `(container, resolveContext) => {}` |

---

## 附录

### 快速参考表

**注册方法**：

| 方法 | 选项 | 用途 |
|------|------|------|
| `useClass` | `{ useClass: MyClass }` | 注册类，容器自动实例化 |
| `useValue` | `{ useValue: instance }` | 注册已创建的实例或值 |
| `useFactory` | `{ useFactory: () => {} }` | 使用工厂函数创建实例 |
| `useAlias` | `{ useAlias: OtherService }` | 创建别名指向其他服务 |

**解析选项**：

| 选项 | 类型 | 说明 |
|------|------|------|
| `multiple` | `boolean` | 解析所有注册的实例 |
| `optional` | `boolean` | 可选解析，未注册返回 undefined |
| `defaultValue` | `T` | 可选解析时的默认值 |
| `ref` | `boolean` | 返回惰性引用 |
| `dynamic` | `boolean` | 返回动态引用，每次访问重新解析 |

**生命周期**：

| 生命周期 | 枚举值 | 说明 |
|----------|--------|------|
| 瞬态 | `LifecycleEnum.transient` | 每次解析创建新实例 |
| 单例 | `LifecycleEnum.singleton` | 全局共享一个实例 |
| 作用域 | `LifecycleEnum.resolution` | 单次解析链内共享 |

### 相关文档

- [API 参考](../reference/api.md) - 详细的 API 文档
- [快速开始](../tutorials/getting-started.md) - 入门教程
- [规范说明](../SPECIFICATION.md) - 设计规范说明
