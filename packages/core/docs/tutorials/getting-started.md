# 快速开始：使用 Husky DI 构建你的第一个依赖注入应用

欢迎使用 Husky DI！本教程将带你从零开始，学习如何使用这个轻量级但功能强大的依赖注入（Dependency Injection，简称 DI）库。

## 什么是依赖注入

### 传统方式的问题

在传统的编程模式中，类通常直接创建自己的依赖。让我们看一个例子：

```typescript
// 传统方式：类直接创建依赖
class Logger {
  log(message: string) {
    console.log(`[LOG]: ${message}`);
  }
}

class UserService {
  // 问题：UserService 直接创建了 Logger 实例
  private logger = new Logger();

  getUser(id: number) {
    this.logger.log(`Getting user ${id}`);
    // 获取用户的逻辑...
    return { id, name: "Alice" };
  }
}

// 使用
const userService = new UserService();
const user = userService.getUser(1);
```

这种方式存在以下问题：

1. **紧耦合**：`UserService` 和 `Logger` 紧密绑定，无法轻松替换为其他日志实现
2. **难以测试**：无法在不修改代码的情况下用模拟对象（Mock）替换 `Logger`
3. **职责不清**：`UserService` 既要处理业务逻辑，又要负责创建依赖

### 依赖注入的方式

依赖注入的核心思想是"将依赖从外部传入"，而不是在类内部创建依赖。

#### 传统方式：无依赖注入

```typescript
// 问题：类内部直接创建依赖
class UserService {
  private logger = new Logger(); // 紧耦合！
  
  getUser(id: number) {
    this.logger.log(`Getting user ${id}`);
  }
}
```

#### 改进方式：手动依赖注入

```typescript
// 改进：依赖从外部传入
class UserService {
  // 依赖通过构造函数参数接收
  constructor(private logger: Logger) {}
  
  getUser(id: number) {
    this.logger.log(`Getting user ${id}`);
  }
}

// 手动创建和注入依赖
const logger = new Logger();
const userService = new UserService(logger); // 手动传入依赖
```

这种方式解决了紧耦合问题，但仍有不足：
- 需要手动管理依赖的创建
- 依赖链复杂时，手动注入变得繁琐
- 难以统一管理生命周期

#### 更好的方式：使用 DI 容器

使用 DI 容器可以自动管理依赖的创建和注入。继续阅读了解如何使用 @husky-di/core

### 使用 DI 容器的方式

使用 DI 容器时，有三种方式注入依赖：

**方式 1：使用工厂函数（手动注入）**

```typescript
import { createContainer, createServiceIdentifier } from "@husky-di/core";

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IUserService = createServiceIdentifier<UserService>("IUserService");

const container = createContainer("AppContainer");

// 注册 Logger
container.register(ILogger, { useClass: Logger });

// 使用工厂函数手动注入依赖
container.register(IUserService, {
  useFactory: (container) => {
    const logger = container.resolve(ILogger);
    return new UserService(logger);
  }
});

const userService = container.resolve(IUserService);
```

**方式 2：使用 `resolve` 工具函数进行属性注入（推荐）**

```typescript
import { createContainer, createServiceIdentifier, resolve } from "@husky-di/core";

// 定义服务标识符
const ILogger = createServiceIdentifier<Logger>("ILogger");
const IUserService = createServiceIdentifier<UserService>("IUserService");

// 使用 resolve() 在类属性中注入依赖
class UserService {
  // 属性注入：在类属性初始化时调用 resolve()
  // 这在 container.resolve() 执行期间是有效的
  private logger = resolve(ILogger);

  getUser(id: number) {
    this.logger.log(`Getting user ${id}`);
    return { id, name: "Alice" };
  }
}

const container = createContainer("AppContainer");
container.register(ILogger, { useClass: Logger });
container.register(IUserService, { useClass: UserService });

const userService = container.resolve(IUserService);
// resolve() 成功注入 logger
```

> **说明**：当调用 `container.resolve(IUserService)` 时：
> 1. 容器设置解析上下文（resolveRecord）
> 2. 执行 `new UserService()`
> 3. 类属性 `logger = resolve(ILogger)` 被初始化
> 4. 此时解析上下文仍然存在，`resolve()` 成功返回 Logger 实例
>
> 这是 husky-di 特有的"属性注入"方式，无需装饰器支持。

**方式 3：使用装饰器自动注入（需要 @husky-di/decorator）**

```typescript
import { createContainer, createServiceIdentifier, globalMiddleware } from "@husky-di/core";
import { injectable, inject, decoratorMiddleware } from "@husky-di/decorator";

// 注册装饰器中间件
globalMiddleware.use(decoratorMiddleware);

@injectable()
class UserService {
  constructor(@inject(ILogger) private logger: Logger) {}
  
  getUser(id: number) {
    this.logger.log(`Getting user ${id}`);
    return { id, name: "Alice" };
  }
}

container.register(IUserService, { useClass: UserService });
const userService = container.resolve(IUserService); // 自动注入 logger
```

> **注意**：`@husky-di/core` 的 `useClass` 注册方式默认只调用无参数构造函数。
> 要实现自动构造函数注入，需要：
> 1. 安装 `@husky-di/decorator` 包
> 2. 使用 `@injectable()` 和 `@inject()` 装饰器
> 3. 注册 `decoratorMiddleware` 到全局中间件
> 
> 详细教程见 [装饰器依赖注入](../../decorator/docs/tutorials/getting-started.md)

### 三种注入方式对比

| 特性 | 属性注入 (core) | 构造函数注入 (decorator) | 工厂函数注入 |
|------|----------------|------------------------|--------------|
| 需要装饰器 | 否 | 是 | 否 |
| TypeScript 配置 | 无特殊要求 | 需要 experimentalDecorators | 无特殊要求 |
| 代码简洁度 | 高 | 中 | 中 |
| 类型安全 | 是 | 是 | 是 |
| 可选依赖 | 支持 | 支持 | 支持 |
| 循环依赖处理 | 使用 ref/dynamic 选项 | 使用 ref/dynamic 选项 | 手动处理 |
| 推荐场景 | 大多数应用 | Angular 风格项目 | 复杂初始化逻辑 |

**依赖注入的核心思想**：将对象的创建和使用分离，让容器负责管理对象的生命周期和依赖关系。

## 安装和设置

### 安装

使用你喜欢的包管理器安装 Husky DI：

```bash
# 使用 pnpm
pnpm add @husky-di/core

# 使用 npm
npm install @husky-di/core

# 使用 yarn
yarn add @husky-di/core
```

### 基本设置

创建你的第一个容器：

```typescript
import { createContainer } from "@husky-di/core";

// 创建一个命名容器
const container = createContainer("MyApp");

// 容器默认以 rootContainer 作为父容器
// 你也可以显式指定父容器
const childContainer = createContainer("Child", container);
```

## 创建第一个服务

让我们从一个简单的服务开始：

```typescript
// 定义一个日志服务
class Logger {
  log(message: string) {
    console.log(`[LOG]: ${message}`);
  }

  error(message: string) {
    console.error(`[ERROR]: ${message}`);
  }
}

// 创建服务标识符
// 标识符用于在容器中唯一标识一个服务
const ILogger = createServiceIdentifier<Logger>("ILogger");
```

**服务标识符的作用**：

- 作为服务的"名字"，用于在容器中查找服务
- 提供类型安全，确保解析时类型正确
- 可以是字符串，也可以是接口或类

## 创建容器并注册服务

### 注册服务

```typescript
import { createContainer, createServiceIdentifier, LifecycleEnum } from "@husky-di/core";

const container = createContainer("AppContainer");

// 方式 1：使用类注册（每次解析创建新实例 - 瞬态生命周期）
container.register(ILogger, {
  useClass: Logger,
  lifecycle: LifecycleEnum.transient, // 默认值，可省略
});

// 方式 2：使用值注册（单例）
const config = { apiUrl: "https://api.example.com" };
container.register("Config", {
  useValue: config,
});

// 方式 3：使用工厂函数注册
container.register("Timestamp", {
  useFactory: () => Date.now(),
});
```

### 生命周期说明

Husky DI 支持三种生命周期：

```typescript
import { LifecycleEnum } from "@husky-di/core";

// 1. Transient（瞬态）- 默认
// 每次解析都创建新实例
container.register(ILogger, {
  useClass: Logger,
  lifecycle: LifecycleEnum.transient,
});

// 2. Singleton（单例）
// 首次解析时创建实例，之后重复使用
container.register(ILogger, {
  useClass: Logger,
  lifecycle: LifecycleEnum.singleton,
});

// 3. Resolution（解析作用域）
// 在同一次解析链中共享实例
container.register(ILogger, {
  useClass: Logger,
  lifecycle: LifecycleEnum.resolution,
});
```

## 解析和使用服务

### 基本解析

```typescript
// 解析注册的服务
const logger = container.resolve(ILogger);
logger.log("Hello, Husky DI!"); // [LOG]: Hello, Husky DI!

// 解析值
const config = container.resolve("Config");
console.log(config.apiUrl); // https://api.example.com

// 解析工厂
const timestamp = container.resolve("Timestamp");
console.log(timestamp); // 当前时间戳
```

### 可选解析

```typescript
// 解析可选服务 - 如果未注册则返回 undefined
const optionalLogger = container.resolve(ILogger, {
  optional: true,
});

// 解析可选服务并设置默认值
const safeLogger = container.resolve(ILogger, {
  optional: true,
  defaultValue: new Logger(),
});

// 解析多个实例（同一标识符有多个注册时）
const loggers = container.resolve(ILogger, {
  multiple: true, // 返回 Logger[]
});
```

### 使用引用解析

```typescript
// 获取服务的引用（惰性解析）
const loggerRef = container.resolve(ILogger, { ref: true });

// 通过 .current 访问实际实例
loggerRef.current.log("Lazy loaded!");

// 动态引用 - 每次访问都重新解析
const dynamicRef = container.resolve(ILogger, { dynamic: true });
// 每次访问 dynamicRef.current 都会重新解析
```

## 服务之间的依赖注入

这是 DI 最强大的功能 - 容器自动处理服务间的依赖关系：

```typescript
// 定义数据库连接服务
class Database {
  connect() {
    console.log("Database connected");
  }

  query(sql: string) {
    console.log(`Executing: ${sql}`);
    return [];
  }
}

// resolve 是一个工具函数，用于在类内部解析依赖
// 需要从 @husky-di/core 导入
import { resolve } from "@husky-di/core";

// 定义用户服务，依赖 Logger 和 Database
class UserService {
  // 使用 resolve 工具函数在类内部解析依赖
  private logger = resolve(ILogger);
  private database = resolve(IDatabase);

  getUser(id: number) {
    this.logger.log(`Getting user ${id}`);
    return this.database.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

// 创建标识符
const IDatabase = createServiceIdentifier<Database>("IDatabase");
const IUserService = createServiceIdentifier<UserService>("IUserService");

// 注册所有服务
container.register(IDatabase, { useClass: Database });
container.register(IUserService, { useClass: UserService });

// 解析 UserService - 容器自动注入 Logger 和 Database
const userService = container.resolve(IUserService);
const users = userService.getUser(1);
```

### 使用 resolve 工具函数

在类内部解析依赖时，使用 `resolve` 函数：

```typescript
import { resolve } from "@husky-di/core";

class EmailService {
  // 基本解析
  private logger = resolve(ILogger);

  // 可选解析
  private optionalConfig = resolve("Config", { optional: true });

  // 带默认值的可选解析
  private retryConfig = resolve("RetryConfig", {
    optional: true,
    defaultValue: { maxRetries: 3 },
  });
}
```

## 使用工厂函数注册

工厂函数提供了更灵活的服务创建方式：

```typescript
// 简单工厂
container.register("RandomNumber", {
  useFactory: () => Math.random(),
});

// 工厂中使用其他服务
container.register("DatabaseConnection", {
  useFactory: () => {
    const config = container.resolve("Config");
    const logger = container.resolve(ILogger);
    
    logger.log(`Connecting to ${config.apiUrl}`);
    return new Database(config.apiUrl);
  },
});

// 使用 resolve 工具的工厂（推荐）
container.register("DatabaseConnection", {
  useFactory: () => {
    // 在工厂内部使用 resolve 工具
    const config = resolve("Config");
    const logger = resolve(ILogger);
    return new Database(config.apiUrl);
  },
});

// 异步工厂
container.register("AsyncConfig", {
  useFactory: async () => {
    const response = await fetch("/api/config");
    return response.json();
  },
});
```

## 使用值注册

值注册用于注册已经创建好的实例或配置对象：

```typescript
// 注册配置对象
container.register("AppConfig", {
  useValue: {
    appName: "My App",
    version: "1.0.0",
    debug: true,
  },
});

// 注册单例实例
const sharedLogger = new Logger();
container.register(ILogger, {
  useValue: sharedLogger,
});

// 注册原始值
container.register("API_URL", {
  useValue: "https://api.example.com",
});

// 注册 null 或 undefined
container.register("NullableValue", {
  useValue: null,
});
```

## 容器层级

Husky DI 支持容器层级结构，子容器可以访问父容器的服务：

```typescript
// 创建根容器（所有容器默认以 rootContainer 为父容器）
const rootContainer = createContainer("Root");
rootContainer.register("SharedService", { useClass: SharedService });

// 创建子容器
const childContainer = createContainer("Child", rootContainer);

// 子容器可以解析父容器注册的服务
const sharedService = childContainer.resolve("SharedService");

// 子容器可以覆盖父容器的服务
childContainer.register("SharedService", {
  useClass: ChildSharedService, // 子容器自己的实现
});

// 现在解析会使用子容器的实现
const service = childContainer.resolve("SharedService");

// 父容器不受影响
const parentService = rootContainer.resolve("SharedService");
```

### 层级解析规则

```typescript
const grandparent = createContainer("Grandparent");
const parent = createContainer("Parent", grandparent);
const child = createContainer("Child", parent);

// 在 grandparent 注册
grandparent.register("Service", { useClass: GrandparentService });

// 在 parent 注册
parent.register("Service", { useClass: ParentService });

// 在 child 解析 - 优先使用最近的注册
const service = child.resolve("Service"); // 返回 ParentService 实例

// 检查注册（默认只检查当前容器）
child.isRegistered("Service"); // false

// 递归检查（包括父容器）
child.isRegistered("Service", { recursive: true }); // true
```

## 可选依赖和默认值

处理可选依赖是实际应用中的常见需求：

```typescript
class NotificationService {
  // 必需依赖 - 如果未注册会抛出异常
  private logger = resolve(ILogger);

  // 可选依赖 - 未注册时返回 undefined
  private emailService = resolve(IEmailService, { optional: true });

  // 可选依赖带默认值
  private smsService = resolve(ISmsService, {
    optional: true,
    defaultValue: new DefaultSmsService(),
  });

  sendNotification(message: string) {
    this.logger.log(`Sending: ${message}`);

    // 安全使用可选依赖
    if (this.emailService) {
      this.emailService.send(message);
    }

    // 使用默认值或注册的服务
    this.smsService.send(message);
  }
}
```

## 完整示例

让我们将所有概念整合成一个完整的应用示例：

```typescript
import {
  createContainer,
  createServiceIdentifier,
  LifecycleEnum,
  resolve,
} from "@husky-di/core";

// ====================
// 1. 定义服务和接口
// ====================

// 日志服务
class Logger {
  private prefix: string;

  constructor(prefix = "APP") {
    this.prefix = prefix;
  }

  log(message: string) {
    console.log(`[${this.prefix}] ${message}`);
  }

  error(message: string) {
    console.error(`[${this.prefix}:ERROR] ${message}`);
  }
}

// 配置服务
interface AppConfig {
  apiUrl: string;
  timeout: number;
  debug: boolean;
}

// 数据库服务
class Database {
  private connected = false;

  connect(url: string) {
    console.log(`Connecting to database: ${url}`);
    this.connected = true;
  }

  query<T>(sql: string): T[] {
    if (!this.connected) {
      throw new Error("Database not connected");
    }
    console.log(`Executing query: ${sql}`);
    return [];
  }
}

// 用户模型
interface User {
  id: number;
  name: string;
  email: string;
}

// 用户服务
class UserService {
  private logger = resolve(ILogger);
  private database = resolve(IDatabase);
  private config = resolve("AppConfig");

  getUser(id: number): User | undefined {
    this.logger.log(`Fetching user ${id}`);
    
    const users = this.database.query<User>(
      `SELECT * FROM users WHERE id = ${id}`
    );
    
    return users[0];
  }

  createUser(name: string, email: string): User {
    this.logger.log(`Creating user: ${name}`);
    
    // 模拟创建
    return {
      id: Date.now(),
      name,
      email,
    };
  }
}

// 订单服务
class OrderService {
  private logger = resolve(ILogger);
  private database = resolve(IDatabase);
  private userService = resolve(IUserService);

  createOrder(userId: number, items: string[]) {
    this.logger.log(`Creating order for user ${userId}`);
    
    // 验证用户存在
    const user = this.userService.getUser(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    this.logger.log(`Order created for ${user.name}`);
    return { orderId: Date.now(), userId, items };
  }
}

// ====================
// 2. 创建服务标识符
// ====================

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IDatabase = createServiceIdentifier<Database>("IDatabase");
const IUserService = createServiceIdentifier<UserService>("IUserService");
const IOrderService = createServiceIdentifier<OrderService>("IOrderService");

// ====================
// 3. 创建容器并注册服务
// ====================

const container = createContainer("AppContainer");

// 注册配置（值注册）
container.register("AppConfig", {
  useValue: {
    apiUrl: "https://api.example.com",
    timeout: 5000,
    debug: true,
  },
});

// 注册日志服务（单例）
container.register(ILogger, {
  useClass: Logger,
  lifecycle: LifecycleEnum.singleton,
});

// 注册数据库服务（单例）
container.register(IDatabase, {
  useClass: Database,
  lifecycle: LifecycleEnum.singleton,
});

// 注册数据库初始化（工厂函数）
container.register("DatabaseInitializer", {
  useFactory: () => {
    const db = resolve(IDatabase);
    const config = resolve("AppConfig");
    const logger = resolve(ILogger);
    
    logger.log("Initializing database...");
    db.connect(config.apiUrl);
    return { initialized: true };
  },
  lifecycle: LifecycleEnum.singleton,
});

// 注册用户服务
container.register(IUserService, {
  useClass: UserService,
});

// 注册订单服务
container.register(IOrderService, {
  useClass: OrderService,
});

// ====================
// 4. 使用服务
// ====================

// 初始化数据库
container.resolve("DatabaseInitializer");

// 获取服务
const userService = container.resolve(IUserService);
const orderService = container.resolve(IOrderService);
const logger = container.resolve(ILogger);

// 使用服务
logger.log("Application started!");

const user = userService.createUser("Alice", "alice@example.com");
console.log("Created user:", user);

const order = orderService.createOrder(user.id, ["item1", "item2"]);
console.log("Created order:", order);

// ====================
// 5. 容器层级示例
// ====================

// 创建特性专用的子容器
const featureContainer = createContainer("FeatureContainer", container);

// 在子容器中注册特性特定的服务
class FeatureLogger extends Logger {
  constructor() {
    super("FEATURE");
  }
}

featureContainer.register(ILogger, {
  useClass: FeatureLogger,
  lifecycle: LifecycleEnum.singleton,
});

// 子容器使用自己的 ILogger，但仍可访问父容器的其他服务
const featureUserService = featureContainer.resolve(IUserService);
// featureUserService 会使用 FeatureLogger 而不是 Logger
```

## 总结

恭喜你完成了 Husky DI 的快速入门教程！你已经学习了：

1. **依赖注入的概念** - 理解 DI 如何解决紧耦合问题
2. **安装和设置** - 创建你的第一个容器
3. **服务注册** - 使用 `useClass`、`useFactory`、`useValue` 注册服务
4. **服务解析** - 从容器中获取服务实例
5. **依赖注入** - 服务之间自动注入依赖
6. **生命周期管理** - `transient`、`singleton`、`resolution` 三种生命周期
7. **容器层级** - 父子容器的服务继承和覆盖
8. **可选依赖** - 处理可选服务的安全方式

### 下一步

- 阅读 [API 参考文档](../reference/api.md) 了解更多详细接口
- 查看 [高级概念](../explanation/concepts.md) 学习中间件、错误处理等
- 探索 [实践指南](../how-to/index.md) 查看具体用法示例

Happy Coding!
