# 模块化依赖注入入门

本教程将带你逐步了解如何使用 `@husky-di/module` 构建模块化、可维护的依赖注入应用。

## 什么是模块

### 模块的概念

模块是 `@husky-di/module` 中的核心构建单元。一个模块是一个自包含的依赖注入容器，它可以：

- **声明服务** - 定义本模块提供的服务
- **导入其他模块** - 使用其他模块提供的服务
- **导出服务** - 控制哪些服务对外可见

```typescript
import { createModule, createServiceIdentifier } from "@husky-di/module";

// 服务标识符是一个唯一标识服务的键
// 可以是类、Symbol 或字符串
const ILogger = createServiceIdentifier<ILogger>("ILogger");

const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    {
      serviceIdentifier: ILogger,
      useClass: ConsoleLogger,
    },
  ],
  exports: [ILogger],
});
```

### 为什么需要模块化？

在大型应用中，将所有服务注册到单个容器中会导致：

1. **容器臃肿** - 难以理解和维护
2. **隐式依赖** - 服务之间的依赖关系不清晰
3. **命名冲突** - 不同功能区域可能使用相同的服务标识符
4. **难以测试** - 无法隔离测试特定功能

模块化通过将应用划分为独立的功能单元来解决这些问题：

```typescript
// 不好的做法：所有服务在一个容器中
const appContainer = createContainer("App");
appContainer.register("logger", { useClass: Logger });
appContainer.register("database", { useClass: Database });
appContainer.register("user", { useClass: UserService });
appContainer.register("auth", { useClass: AuthService });
// ... 几十个服务

// 好的做法：按功能划分模块
const LoggerModule = createModule({ name: "LoggerModule", ... });
const DatabaseModule = createModule({ name: "DatabaseModule", ... });
const UserModule = createModule({ name: "UserModule", ... });
const AuthModule = createModule({ name: "AuthModule", ... });

const AppModule = createModule({
  name: "AppModule",
  imports: [LoggerModule, DatabaseModule, UserModule, AuthModule],
});
```

### 模块与 ES Modules 的类比

`@husky-di/module` 的设计灵感来自于 ES Modules（ESM）的导入导出机制：

| ES Modules | @husky-di/module |
|------------|------------------|
| `export` 导出 | `exports` 数组 |
| `import` 导入 | `imports` 数组 |
| `import { x as y }` 别名 | `withAliases()` |
| 模块文件 | `createModule()` |
| 未导出的内容私有 | 未导出的服务不可从外部解析 |

```typescript
// ES Modules 示例
// math.js
export const add = (a, b) => a + b;
const internalHelper = () => {}; // 私有，未导出

// app.js
import { add } from "./math.js";

// @husky-di/module 示例
// MathModule
const MathModule = createModule({
  name: "MathModule",
  declarations: [
    { serviceIdentifier: "add", useFactory: () => (a, b) => a + b },
    { serviceIdentifier: "internalHelper", useFactory: () => () => {} },
  ],
  exports: ["add"], // internalHelper 未导出，外部不可见
});

// AppModule
const AppModule = createModule({
  name: "AppModule",
  imports: [MathModule],
});

AppModule.resolve("add"); // 可以解析
AppModule.resolve("internalHelper"); // 抛出错误：未导出
```

## 开始使用

### 安装 @husky-di/module

```bash
npm install @husky-di/module @husky-di/core
```

或使用 yarn：

```bash
yarn add @husky-di/module @husky-di/core
```

或使用 pnpm：

```bash
pnpm add @husky-di/module @husky-di/core
```

> **注意**：`@husky-di/module` 依赖 `@husky-di/core`，需要一起安装。

### 创建第一个模块

让我们创建一个简单的日志模块：

```typescript
import { createModule, createServiceIdentifier } from "@husky-di/module";

// 1. 定义服务接口和标识符
interface ILogger {
  log(message: string): void;
  error(message: string): void;
}

const ILogger = createServiceIdentifier<ILogger>("ILogger");

// 2. 实现服务
class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(`[LOG] ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }
}

// 3. 创建模块
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    {
      serviceIdentifier: ILogger,
      useClass: ConsoleLogger,
    },
  ],
  exports: [ILogger],
});

// 4. 从模块解析服务
const logger = LoggerModule.resolve(ILogger);
logger.log("Hello, World!"); // [LOG] Hello, World!
```

## 模块配置

`createModule()` 函数接受一个配置对象，包含以下主要选项：

```typescript
interface CreateModuleOptions {
  readonly name: string;
  readonly declarations?: Declaration<unknown>[];
  readonly imports?: Array<IModule | ModuleWithAliases>;
  readonly exports?: ServiceIdentifier<unknown>[];
}
```

### declarations - 声明服务

`declarations` 数组定义模块内部的服务。每个声明必须指定 `serviceIdentifier` 和一种注册策略：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    // useClass - 使用类
    {
      serviceIdentifier: "service1",
      useClass: MyService,
    },
    // useFactory - 使用工厂函数
    {
      serviceIdentifier: "service2",
      useFactory: () => new MyService(),
    },
    // useValue - 使用静态值
    {
      serviceIdentifier: "config",
      useValue: { apiKey: "xxx", timeout: 5000 },
    },
    // useAlias - 使用已有服务的别名
    {
      serviceIdentifier: "logger",
      useAlias: "service1",
    },
  ],
});
```

### imports - 导入其他模块

`imports` 数组允许模块使用其他模块导出的服务：

```typescript
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [/* ... */],
  exports: ["logger"],
});

const DatabaseModule = createModule({
  name: "DatabaseModule",
  declarations: [/* ... */],
  exports: ["database"],
});

// AppModule 导入 LoggerModule 和 DatabaseModule
const AppModule = createModule({
  name: "AppModule",
  imports: [LoggerModule, DatabaseModule],
  declarations: [
    {
      serviceIdentifier: "userService",
      useClass: UserService, // UserService 可以使用 logger 和 database
    },
  ],
});
```

### exports - 导出服务

`exports` 数组控制哪些服务对外可见。未导出的服务只能在模块内部使用：

```typescript
const InternalModule = createModule({
  name: "InternalModule",
  declarations: [
    { serviceIdentifier: "publicService", useClass: PublicService },
    { serviceIdentifier: "privateService", useClass: PrivateService },
  ],
  exports: ["publicService"], // 只导出 publicService
});

const App = createModule({
  name: "App",
  imports: [InternalModule],
});

App.resolve("publicService"); // 成功
App.resolve("privateService"); // 抛出错误：未导出
```

## 模块导入和导出

### 如何导入其他模块

导入模块只需将其添加到 `imports` 数组：

```typescript
const SharedModule = createModule({
  name: "SharedModule",
  declarations: [
    { serviceIdentifier: "utils", useValue: { format: (s) => s.trim() } },
  ],
  exports: ["utils"],
});

const UserModule = createModule({
  name: "UserModule",
  imports: [SharedModule], // 导入 SharedModule
  declarations: [
    {
      serviceIdentifier: "userService",
      useClass: UserService, // 可以使用 "utils"
    },
  ],
  exports: ["userService"],
});
```

### 如何导出服务

导出服务需要将其标识符添加到 `exports` 数组：

```typescript
const DatabaseModule = createModule({
  name: "DatabaseModule",
  declarations: [
    { serviceIdentifier: "connection", useClass: MySqlConnection },
    { serviceIdentifier: "queryBuilder", useClass: QueryBuilder },
  ],
  exports: ["connection", "queryBuilder"], // 导出两个服务
});
```

### 模块的可见性规则

模块的可见性遵循以下规则：

1. **导出的服务** - 可以被导入该模块的其他模块解析
2. **未导出的服务** - 仅在模块内部可用
3. **传递依赖** - 导入模块不会自动导出其依赖

```typescript
const CoreModule = createModule({
  name: "CoreModule",
  declarations: [{ serviceIdentifier: "core", useClass: CoreService }],
  exports: ["core"],
});

const DataModule = createModule({
  name: "DataModule",
  imports: [CoreModule],
  declarations: [{ serviceIdentifier: "data", useClass: DataService }],
  exports: ["data"], // 未导出 "core"
});

const AppModule = createModule({
  name: "AppModule",
  imports: [DataModule],
});

AppModule.resolve("data"); // 可以解析
AppModule.resolve("core"); // 不能解析 - DataModule 未重新导出 core
```

这种设计确保模块的依赖边界清晰，避免意外的传递依赖。

## 使用别名

### 什么是别名？

别名允许在导入模块时重命名服务标识符。这在以下场景非常有用：

- 解决命名冲突
- 提供更具描述性的名称
- 支持多实例场景

### 如何使用 withAliases()

使用 `withAliases()` 方法为导入的模块创建别名映射：

```typescript
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    { serviceIdentifier: "logger", useClass: ConsoleLogger },
  ],
  exports: ["logger"],
});

// 导入时使用别名
const AppModule = createModule({
  name: "AppModule",
  imports: [
    LoggerModule.withAliases([
      { serviceIdentifier: "logger", as: "appLogger" },
    ]),
  ],
  exports: ["appLogger"],
});

const logger = AppModule.resolve("appLogger"); // 解析成功
// AppModule.resolve("logger"); // 原始名称不再可用
```

### 别名的应用场景

#### 1. 解决命名冲突

当两个模块导出相同名称的服务时，使用别名区分：

```typescript
const UserLoggerModule = createModule({
  name: "UserLoggerModule",
  declarations: [{ serviceIdentifier: "logger", useClass: UserLogger }],
  exports: ["logger"],
});

const SystemLoggerModule = createModule({
  name: "SystemLoggerModule",
  declarations: [{ serviceIdentifier: "logger", useClass: SystemLogger }],
  exports: ["logger"],
});

// 使用别名解决冲突
const AppModule = createModule({
  name: "AppModule",
  imports: [
    UserLoggerModule.withAliases([
      { serviceIdentifier: "logger", as: "userLogger" },
    ]),
    SystemLoggerModule.withAliases([
      { serviceIdentifier: "logger", as: "systemLogger" },
    ]),
  ],
  exports: ["userLogger", "systemLogger"],
});
```

#### 2. 多数据库连接

```typescript
const DatabaseModule = createModule({
  name: "DatabaseModule",
  declarations: [{ serviceIdentifier: "connection", useClass: MySqlConnection }],
  exports: ["connection"],
});

const AppModule = createModule({
  name: "AppModule",
  imports: [
    DatabaseModule.withAliases([
      { serviceIdentifier: "connection", as: "userDb" },
    ]),
    DatabaseModule.withAliases([
      { serviceIdentifier: "connection", as: "orderDb" },
    ]),
  ],
  exports: ["userDb", "orderDb"],
});
```

#### 3. 更具描述性的名称

```typescript
const ConfigModule = createModule({
  name: "ConfigModule",
  declarations: [{ serviceIdentifier: "config", useValue: { env: "prod" } }],
  exports: ["config"],
});

const AppModule = createModule({
  name: "AppModule",
  imports: [
    ConfigModule.withAliases([
      { serviceIdentifier: "config", as: "appConfig" },
    ]),
  ],
  exports: ["appConfig"],
});
```

## 完整示例

### 创建多模块应用

让我们构建一个包含多个模块的完整应用：

```typescript
import { createModule, createServiceIdentifier } from "@husky-di/module";
import { resolve } from "@husky-di/core";

// ========== 服务接口定义 ==========
interface ILogger {
  log(message: string): void;
}
const ILogger = createServiceIdentifier<ILogger>("ILogger");

interface IDatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}
const IDatabaseConfig = createServiceIdentifier<IDatabaseConfig>("IDatabaseConfig");

interface IDatabase {
  connect(): string;
  query(sql: string): unknown[];
}
const IDatabase = createServiceIdentifier<IDatabase>("IDatabase");

interface IUserService {
  getUser(id: number): { id: number; name: string };
}
const IUserService = createServiceIdentifier<IUserService>("IUserService");

interface IAuthService {
  login(username: string, password: string): { token: string };
}
const IAuthService = createServiceIdentifier<IAuthService>("IAuthService");

interface IApp {
  bootstrap(): void;
}
const IApp = createServiceIdentifier<IApp>("IApp");

// ========== 服务实现 ==========
class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(`[LOG] ${message}`);
  }
}

class DatabaseService implements IDatabase {
  private readonly config = resolve(IDatabaseConfig);

  connect(): string {
    return `Connected to ${this.config.host}:${this.config.port}`;
  }

  query(sql: string): unknown[] {
    console.log(`Executing: ${sql}`);
    return [];
  }
}

class UserService implements IUserService {
  private readonly db = resolve(IDatabase);
  private readonly logger = resolve(ILogger);

  getUser(id: number): { id: number; name: string } {
    this.logger.log(`Fetching user ${id}`);
    this.db.connect();
    return { id, name: "Test User" };
  }
}

class AuthService implements IAuthService {
  private readonly logger = resolve(ILogger);

  login(username: string, password: string): { token: string } {
    this.logger.log(`Authenticating ${username}`);
    return { token: "fake-jwt-token" };
  }
}

class App implements IApp {
  private readonly userService = resolve(IUserService);
  private readonly authService = resolve(IAuthService);

  bootstrap(): void {
    console.log("Application starting...");
    const user = this.userService.getUser(1);
    console.log("User:", user);
    const auth = this.authService.login("admin", "password");
    console.log("Auth:", auth);
    console.log("Application ready!");
  }
}

// ========== 模块定义 ==========

// LoggerModule - 提供日志服务
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    {
      serviceIdentifier: ILogger,
      useClass: ConsoleLogger,
    },
  ],
  exports: [ILogger],
});

// DatabaseModule - 提供数据库服务
const DatabaseModule = createModule({
  name: "DatabaseModule",
  declarations: [
    {
      serviceIdentifier: IDatabaseConfig,
      useValue: {
        host: "localhost",
        port: 3306,
        username: "root",
        password: "secret",
      },
    },
    {
      serviceIdentifier: IDatabase,
      useClass: DatabaseService,
    },
  ],
  exports: [IDatabase], // 注意：IDatabaseConfig 未导出
});

// UserModule - 用户模块，依赖 LoggerModule 和 DatabaseModule
const UserModule = createModule({
  name: "UserModule",
  imports: [LoggerModule, DatabaseModule],
  declarations: [
    {
      serviceIdentifier: IUserService,
      useClass: UserService,
    },
  ],
  exports: [IUserService],
});

// AuthModule - 认证模块，依赖 LoggerModule
const AuthModule = createModule({
  name: "AuthModule",
  imports: [LoggerModule],
  declarations: [
    {
      serviceIdentifier: IAuthService,
      useClass: AuthService,
    },
  ],
  exports: [IAuthService],
});

// AppModule - 根模块，组合所有模块
const AppModule = createModule({
  name: "AppModule",
  imports: [UserModule, AuthModule],
  declarations: [
    {
      serviceIdentifier: IApp,
      useClass: App,
    },
  ],
  exports: [IApp],
});

// ========== 运行应用 ==========
const app = AppModule.resolve(IApp);
app.bootstrap();
```

### 模块间的依赖关系

上述示例的模块依赖关系如下：

```
                    AppModule
                   /         \
            UserModule     AuthModule
            /        \         |
     LoggerModule  DatabaseModule
         ↑
         └───────┘
```

- `AppModule` 导入 `UserModule` 和 `AuthModule`
- `UserModule` 导入 `LoggerModule` 和 `DatabaseModule`
- `AuthModule` 导入 `LoggerModule`
- `LoggerModule` 被多个模块共享

### 从模块解析服务

```typescript
// 从 AppModule 解析
const app = AppModule.resolve(IApp);
app.bootstrap();

// 从 UserModule 解析（因为它导出了 IUserService）
const userService = UserModule.resolve(IUserService);

// 以下会失败，因为服务未导出
// AppModule.resolve(IDatabase); // DatabaseModule 未重新导出 IDatabase
// AppModule.resolve(ILogger); // LoggerModule 未重新导出 ILogger
```

如果需要从 `AppModule` 访问底层服务，可以重新导出：

```typescript
const AppModule = createModule({
  name: "AppModule",
  imports: [
    UserModule, // 导出 IUserService
    AuthModule, // 导出 IAuthService
    LoggerModule, // 直接导入 LoggerModule 以导出 ILogger
  ],
  declarations: [
    { serviceIdentifier: IApp, useClass: App },
  ],
  exports: [IApp, ILogger, IUserService, IAuthService], // 重新导出
});
```

## 模块层级

### 模块与容器的关系

每个模块内部都有一个独立的容器（`container` 属性）：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [/* ... */],
});

console.log(MyModule.container); // 内部容器实例
console.log(MyModule.id); // 模块唯一 ID
console.log(MyModule.displayName); // "MyModule#MODULE-xxx"
```

模块的容器管理该模块声明和导入的服务。当解析服务时：

1. 首先在模块自己的 `declarations` 中查找
2. 然后在 `imports` 导入的模块中查找
3. 未导出的服务无法从外部模块解析

### 模块组合构建大型应用

模块化设计的核心思想是**组合**：

```typescript
// 基础模块
const LoggerModule = createModule({ /* ... */ });
const ConfigModule = createModule({ /* ... */ });
const DatabaseModule = createModule({ /* ... */ });

// 功能模块 - 组合基础模块
const UserModule = createModule({
  name: "UserModule",
  imports: [LoggerModule, ConfigModule, DatabaseModule],
  // ...
});

const AuthModule = createModule({
  name: "AuthModule",
  imports: [LoggerModule, ConfigModule],
  // ...
});

const OrderModule = createModule({
  name: "OrderModule",
  imports: [LoggerModule, ConfigModule, DatabaseModule],
  // ...
});

// 共享模块 - 重新导出常用服务
const SharedModule = createModule({
  name: "SharedModule",
  imports: [LoggerModule, ConfigModule],
  exports: [ILogger, "config"],
});

// 应用根模块 - 组合所有功能模块
const AppModule = createModule({
  name: "AppModule",
  imports: [
    SharedModule,
    UserModule,
    AuthModule,
    OrderModule,
  ],
  declarations: [
    { serviceIdentifier: "app", useClass: Application },
  ],
  exports: ["app"],
});
```

这种分层架构带来以下优势：

1. **关注点分离** - 每个模块负责特定功能
2. **可复用性** - 模块可以在不同应用中复用
3. **可测试性** - 可以独立测试每个模块
4. **清晰的依赖边界** - 通过 `exports` 明确控制可见性
5. **易于维护** - 修改一个模块不影响其他模块

## 总结

通过本教程，你学习了：

- **模块的概念** - 自包含的依赖注入容器
- **模块配置** - `declarations`、`imports`、`exports`
- **导入导出机制** - 类似于 ES Modules
- **别名使用** - `withAliases()` 解决命名冲突
- **模块组合** - 通过组合构建大型应用

模块化是构建可维护、可扩展应用的关键。建议从简单模块开始，逐步构建你的应用架构。

### 下一步

- 阅读 [API 参考文档](../reference/api.md) 了解更多详细接口
- 查看 [高级概念](../explanation/concepts.md) 学习模块设计原理
- 探索 [实践指南](../how-to/index.md) 查看具体用法示例
