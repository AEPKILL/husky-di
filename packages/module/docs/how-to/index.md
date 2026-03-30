# 模块操作指南

本指南采用"问题 - 解决方案"结构，帮助你快速找到常见任务的实现方法。

## 基础使用

### 如何创建一个模块

**问题：** 我需要创建一个新的模块来组织我的服务。

**解决方案：**

使用 `createModule()` 函数创建模块，必须提供 `name` 属性：

```typescript
import { createModule } from "@husky-di/module";

const MyModule = createModule({
  name: "MyModule",
});
```

**步骤：**

1. 导入 `createModule` 函数
2. 调用函数并传入配置对象
3. 至少指定 `name` 属性

**完整示例：**

```typescript
import { createModule, createServiceIdentifier } from "@husky-di/module";

const ILogger = createServiceIdentifier<ILogger>("ILogger");

class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(message);
  }
}

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

---

### 如何声明服务 (declarations)

**问题：** 我需要在模块中注册服务。

**解决方案：**

使用 `declarations` 数组声明服务，每个声明必须包含 `serviceIdentifier` 和一种注册策略：

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
      useFactory: (container) => new MyService(),
    },
    // useValue - 使用静态值
    {
      serviceIdentifier: "config",
      useValue: { apiKey: "xxx" },
    },
    // useAlias - 使用已有服务的别名
    {
      serviceIdentifier: "logger",
      useAlias: "service1",
    },
  ],
});
```

**步骤：**

1. 在配置对象中添加 `declarations` 数组
2. 每个声明对象包含 `serviceIdentifier` 和注册策略
3. 注册策略四选一：`useClass`、`useFactory`、`useValue`、`useAlias`

---

### 如何导出服务 (exports)

**问题：** 我需要控制哪些服务可以被其他模块访问。

**解决方案：**

使用 `exports` 数组导出服务标识符。未导出的服务只能在模块内部使用：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "publicService", useClass: PublicService },
    { serviceIdentifier: "privateService", useClass: PrivateService },
  ],
  exports: ["publicService"], // 只导出 publicService
});

// 外部模块
const AppModule = createModule({
  name: "AppModule",
  imports: [MyModule],
});

AppModule.resolve("publicService");  // 成功
AppModule.resolve("privateService"); // 错误：未导出
```

**步骤：**

1. 在配置对象中添加 `exports` 数组
2. 将需要导出的服务标识符添加到数组中
3. 确保导出的服务已在 `declarations` 或 `imports` 中定义

---

### 如何导入其他模块 (imports)

**问题：** 我需要使用其他模块提供的服务。

**解决方案：**

使用 `imports` 数组导入其他模块。导入后可以访问被导入模块导出的服务：

```typescript
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    { serviceIdentifier: "logger", useClass: ConsoleLogger },
  ],
  exports: ["logger"],
});

const DatabaseModule = createModule({
  name: "DatabaseModule",
  declarations: [
    { serviceIdentifier: "database", useClass: Database },
  ],
  exports: ["database"],
});

// 导入多个模块
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

**步骤：**

1. 在配置对象中添加 `imports` 数组
2. 将要导入的模块实例添加到数组中
3. 确保被导入模块已导出你需要的服务

---

## 模块别名

### 如何使用 withAliases()

**问题：** 我需要在导入模块时重命名服务标识符。

**解决方案：**

使用模块实例的 `withAliases()` 方法创建别名映射：

```typescript
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    { serviceIdentifier: "logger", useClass: ConsoleLogger },
  ],
  exports: ["logger"],
});

// 使用别名导入
const AppModule = createModule({
  name: "AppModule",
  imports: [
    LoggerModule.withAliases([
      { serviceIdentifier: "logger", as: "appLogger" },
    ]),
  ],
  exports: ["appLogger"],
});

const logger = AppModule.resolve("appLogger"); // 成功
// AppModule.resolve("logger"); // 原始名称不再可用
```

**步骤：**

1. 在导入模块时调用 `.withAliases()` 方法
2. 传入别名映射数组，每个映射包含 `serviceIdentifier`（源）和 `as`（目标）
3. 别名只对当前导入生效

---

### 如何重命名导入的服务

**问题：** 导入的服务名称与现有服务冲突，或者我需要更具描述性的名称。

**解决方案：**

使用 `withAliases()` 为导入的服务创建新名称：

```typescript
// 场景 1：解决命名冲突
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
});

const userLogger = AppModule.resolve("userLogger");     // UserLogger 实例
const systemLogger = AppModule.resolve("systemLogger"); // SystemLogger 实例
```

```typescript
// 场景 2：提供更具描述性的名称
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
});

const config = AppModule.resolve("appConfig");
```

**步骤：**

1. 识别需要重命名的服务
2. 在 `withAliases()` 中创建 `{ serviceIdentifier, as }` 映射
3. 使用新名称解析服务

---

### 如何部分导入模块的服务

**问题：** 我只想导入模块中的部分服务，而不是全部。

**解决方案：**

使用 `withAliases()` 选择性地映射需要的服务，未映射的服务不会导入：

```typescript
const SharedModule = createModule({
  name: "SharedModule",
  declarations: [
    { serviceIdentifier: "utils", useValue: { format: (s) => s.trim() } },
    { serviceIdentifier: "constants", useValue: { MAX_SIZE: 100 } },
    { serviceIdentifier: "helpers", useValue: { log: console.log } },
  ],
  exports: ["utils", "constants", "helpers"],
});

// 只导入 utils 和 constants，不导入 helpers
const MyModule = createModule({
  name: "MyModule",
  imports: [
    SharedModule.withAliases([
      { serviceIdentifier: "utils", as: "utils" },
      { serviceIdentifier: "constants", as: "constants" },
      // helpers 未被映射，不会导入
    ]),
  ],
});

MyModule.resolve("utils");      // 成功
MyModule.resolve("constants");  // 成功
MyModule.resolve("helpers");    // 错误：未导入
```

**步骤：**

1. 确定需要导入的服务列表
2. 在 `withAliases()` 中只映射这些服务
3. 未映射的服务不会被导入到当前模块

---

## 模块组合

### 如何组合多个模块

**问题：** 我有多个功能模块，需要将它们组合成一个完整的应用。

**解决方案：**

创建根模块，将所有功能模块添加到 `imports` 数组：

```typescript
// 基础模块
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [{ serviceIdentifier: "logger", useClass: ConsoleLogger }],
  exports: ["logger"],
});

const ConfigModule = createModule({
  name: "ConfigModule",
  declarations: [{ serviceIdentifier: "config", useValue: { env: "prod" } }],
  exports: ["config"],
});

// 功能模块
const UserModule = createModule({
  name: "UserModule",
  imports: [LoggerModule, ConfigModule],
  declarations: [{ serviceIdentifier: "userService", useClass: UserService }],
  exports: ["userService"],
});

const AuthModule = createModule({
  name: "AuthModule",
  imports: [LoggerModule, ConfigModule],
  declarations: [{ serviceIdentifier: "authService", useClass: AuthService }],
  exports: ["authService"],
});

// 根模块 - 组合所有模块
const AppModule = createModule({
  name: "AppModule",
  imports: [UserModule, AuthModule],
  declarations: [{ serviceIdentifier: "app", useClass: Application }],
  exports: ["app"],
});

// 启动应用
const app = AppModule.resolve("app");
```

**步骤：**

1. 创建独立的功能模块
2. 创建根模块（AppModule）
3. 将所有功能模块添加到根模块的 `imports`
4. 从根模块解析入口服务

---

### 如何创建共享模块

**问题：** 多个模块需要使用相同的服务，我不想重复声明。

**解决方案：**

创建一个共享模块，导出常用服务，然后被其他模块导入：

```typescript
// 共享模块
const SharedModule = createModule({
  name: "SharedModule",
  declarations: [
    { serviceIdentifier: "logger", useClass: ConsoleLogger },
    { serviceIdentifier: "config", useValue: { env: "prod" } },
    { serviceIdentifier: "utils", useValue: { format: (s) => s.trim() } },
  ],
  exports: ["logger", "config", "utils"],
});

// 多个模块导入共享模块
const UserModule = createModule({
  name: "UserModule",
  imports: [SharedModule],
  declarations: [{ serviceIdentifier: "userService", useClass: UserService }],
  exports: ["userService"],
});

const OrderModule = createModule({
  name: "OrderModule",
  imports: [SharedModule],
  declarations: [{ serviceIdentifier: "orderService", useClass: OrderService }],
  exports: ["orderService"],
});

const ReportModule = createModule({
  name: "ReportModule",
  imports: [SharedModule],
  declarations: [{ serviceIdentifier: "reportService", useClass: ReportService }],
  exports: ["reportService"],
});
```

**步骤：**

1. 识别多个模块共用的服务
2. 创建共享模块并声明这些服务
3. 在 `exports` 中导出这些服务
4. 其他模块通过 `imports` 导入共享模块

---

### 如何组织大型应用的模块结构

**问题：** 我的应用有很多功能，如何组织模块结构以保持可维护性？

**解决方案：**

采用分层架构，按功能域组织模块：

```typescript
// ========== 核心层 ==========
const CoreModule = createModule({
  name: "CoreModule",
  declarations: [
    { serviceIdentifier: "logger", useClass: Logger },
    { serviceIdentifier: "config", useValue: config },
  ],
  exports: ["logger", "config"],
});

// ========== 基础设施层 ==========
const DatabaseModule = createModule({
  name: "DatabaseModule",
  imports: [CoreModule],
  declarations: [
    { serviceIdentifier: "dbConnection", useClass: MySqlConnection },
    { serviceIdentifier: "queryBuilder", useClass: QueryBuilder },
  ],
  exports: ["dbConnection", "queryBuilder"],
});

const CacheModule = createModule({
  name: "CacheModule",
  imports: [CoreModule],
  declarations: [
    { serviceIdentifier: "cache", useClass: RedisCache },
  ],
  exports: ["cache"],
});

// ========== 领域层 ==========
const UserDomainModule = createModule({
  name: "UserDomainModule",
  imports: [DatabaseModule, CacheModule],
  declarations: [
    { serviceIdentifier: "userRepository", useClass: UserRepository },
    { serviceIdentifier: "userEntity", useClass: UserEntity },
  ],
  exports: ["userRepository", "userEntity"],
});

const OrderDomainModule = createModule({
  name: "OrderDomainModule",
  imports: [DatabaseModule, CacheModule],
  declarations: [
    { serviceIdentifier: "orderRepository", useClass: OrderRepository },
    { serviceIdentifier: "orderEntity", useClass: OrderEntity },
  ],
  exports: ["orderRepository", "orderEntity"],
});

// ========== 应用层 ==========
const UserApplicationModule = createModule({
  name: "UserApplicationModule",
  imports: [UserDomainModule, CoreModule],
  declarations: [
    { serviceIdentifier: "userService", useClass: UserService },
    { serviceIdentifier: "userDto", useClass: UserDto },
  ],
  exports: ["userService"],
});

const OrderApplicationModule = createModule({
  name: "OrderApplicationModule",
  imports: [OrderDomainModule, CoreModule],
  declarations: [
    { serviceIdentifier: "orderService", useClass: OrderService },
  ],
  exports: ["orderService"],
});

// ========== 接口层 ==========
const HttpModule = createModule({
  name: "HttpModule",
  imports: [UserApplicationModule, OrderApplicationModule],
  declarations: [
    { serviceIdentifier: "userController", useClass: UserController },
    { serviceIdentifier: "orderController", useClass: OrderController },
  ],
  exports: ["userController", "orderController"],
});

// ========== 根模块 ==========
const AppModule = createModule({
  name: "AppModule",
  imports: [HttpModule],
});
```

**模块层次结构：**

```
AppModule
└── HttpModule (接口层)
    ├── UserApplicationModule (应用层)
    │   └── UserDomainModule (领域层)
    │       ├── DatabaseModule (基础设施层)
    │       │   └── CoreModule (核心层)
    │       └── CacheModule (基础设施层)
    │           └── CoreModule (核心层)
    └── OrderApplicationModule (应用层)
        └── OrderDomainModule (领域层)
            ├── DatabaseModule (基础设施层)
            └── CacheModule (基础设施层)
```

**步骤：**

1. **核心层** - 定义日志、配置等基础服务
2. **基础设施层** - 数据库、缓存、消息队列等
3. **领域层** - 业务实体、仓储
4. **应用层** - 应用服务、DTO
5. **接口层** - 控制器、API 端点
6. **根模块** - 组合所有模块

---

## 高级用法

### 如何在模块中使用中间件

**问题：** 我需要在服务解析时添加自定义逻辑（如日志、缓存、验证）。

**解决方案：**

使用模块的 `use()` 方法注册中间件：

```typescript
import { createModule } from "@husky-di/module";
import type { ResolveMiddleware } from "@husky-di/core";

const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "myService", useClass: MyService },
  ],
  exports: ["myService"],
});

// 创建中间件
const loggingMiddleware: ResolveMiddleware = async (next, context) => {
  console.log(`Resolving: ${context.serviceIdentifier}`);
  const instance = await next(context);
  console.log(`Resolved: ${context.serviceIdentifier}`);
  return instance;
};

// 注册中间件
MyModule.use(loggingMiddleware);

// 解析服务时会触发中间件
const service = MyModule.resolve("myService");
```

**步骤：**

1. 创建符合 `ResolveMiddleware` 类型的中间件函数
2. 调用模块的 `use()` 方法注册中间件
3. 中间件在服务解析时自动执行

**移除中间件：**

```typescript
// 使用 unused() 移除中间件
MyModule.unused(loggingMiddleware);
```

---

### 如何从模块解析服务

**问题：** 我需要从模块中获取服务实例。

**解决方案：**

使用模块的 `resolve()` 方法解析服务：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    {
      serviceIdentifier: "myService",
      useClass: MyService,
    },
  ],
  exports: ["myService"],
});

// 基本用法
const service = MyModule.resolve("myService");

// 使用 ServiceIdentifier
const IService = createServiceIdentifier<IMyService>("IMyService");
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: IService, useClass: MyService },
  ],
  exports: [IService],
});

const service = MyModule.resolve(IService); // 类型安全
```

**带选项解析：**

```typescript
// 解析单例（默认行为）
const singleton = MyModule.resolve("myService");

// 解析新实例（如果服务支持）
const newInstance = MyModule.resolve("myService", {
  forceNewInstance: true,
});

// 解析带参数的服务
const service = MyModule.resolve("myService", {
  args: [arg1, arg2],
});
```

**步骤：**

1. 确保服务已在模块中声明并导出
2. 调用 `resolve()` 传入服务标识符
3. 可选：传入解析选项

---

### 如何检查模块中的服务

**问题：** 我需要检查某个服务是否在模块中已注册。

**解决方案：**

使用 `isRegistered()` 和 `getServiceIdentifiers()` 方法：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "service1", useClass: Service1 },
    { serviceIdentifier: "service2", useClass: Service2 },
  ],
  exports: ["service1"],
});

// 检查服务是否已注册
const hasService1 = MyModule.isRegistered("service1"); // true
const hasService3 = MyModule.isRegistered("service3"); // false

// 获取所有已注册的服务标识符
const identifiers = MyModule.getServiceIdentifiers();
// ["service1", "service2"]
```

**步骤：**

1. 使用 `isRegistered(serviceIdentifier)` 检查特定服务
2. 使用 `getServiceIdentifiers()` 获取所有服务标识符列表

---

## 故障排除

### 常见错误：重复声明服务

**错误代码：** `E_DUPLICATE_DECLARATION`

**问题描述：** 同一服务标识符在模块中被声明多次。

**错误示例：**

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "logger", useClass: ConsoleLogger },
    { serviceIdentifier: "logger", useClass: FileLogger }, // 重复声明
  ],
});
```

**错误信息：**

```
E_DUPLICATE_DECLARATION: Module 'MyModule' contains multiple declarations with the same ServiceIdentifier 'logger'
```

**解决方案：**

1. 确保每个服务标识符只声明一次
2. 如果需要多个实现，使用不同的标识符：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "consoleLogger", useClass: ConsoleLogger },
    { serviceIdentifier: "fileLogger", useClass: FileLogger },
  ],
  exports: ["consoleLogger", "fileLogger"],
});
```

3. 或使用别名：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "logger", useClass: ConsoleLogger },
    { serviceIdentifier: "backupLogger", useAlias: "logger" },
  ],
});
```

---

### 常见错误：导出未声明的服务

**错误代码：** `E_EXPORT_NOT_FOUND`

**问题描述：** 导出的服务标识符未在模块中声明或从导入的模块中获取。

**错误示例：**

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "service1", useClass: Service1 },
  ],
  exports: ["service1", "service2"], // service2 未声明
});
```

**错误信息：**

```
E_EXPORT_NOT_FOUND: Export 'service2' references a ServiceIdentifier that is neither declared locally nor imported
```

**解决方案：**

1. 确保导出的服务已在 `declarations` 中声明：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "service1", useClass: Service1 },
    { serviceIdentifier: "service2", useClass: Service2 }, // 添加声明
  ],
  exports: ["service1", "service2"],
});
```

2. 或从导入的模块中获取：

```typescript
const OtherModule = createModule({
  name: "OtherModule",
  declarations: [
    { serviceIdentifier: "service2", useClass: Service2 },
  ],
  exports: ["service2"],
});

const MyModule = createModule({
  name: "MyModule",
  imports: [OtherModule],
  declarations: [
    { serviceIdentifier: "service1", useClass: Service1 },
  ],
  exports: ["service1", "service2"], // 现在可以导出 service2
});
```

---

### 常见错误：循环依赖

**错误代码：** `E_CIRCULAR_DEPENDENCY`

**问题描述：** 模块之间存在循环依赖关系。

**错误示例：**

```typescript
// 循环依赖：ModuleA -> ModuleB -> ModuleC -> ModuleA
const ModuleA = createModule({
  name: "ModuleA",
  imports: [ModuleB],
  exports: ["serviceA"],
});

const ModuleB = createModule({
  name: "ModuleB",
  imports: [ModuleC],
  exports: ["serviceB"],
});

const ModuleC = createModule({
  name: "ModuleC",
  imports: [ModuleA], // 形成循环
  exports: ["serviceC"],
});
```

**错误信息：**

```
E_CIRCULAR_DEPENDENCY: Circular dependency detected in module import graph: ModuleA -> ModuleB -> ModuleC -> ModuleA
```

**解决方案：**

1. **重构依赖关系** - 打破循环：

```typescript
// 创建共享模块包含共同依赖
const SharedModule = createModule({
  name: "SharedModule",
  declarations: [
    { serviceIdentifier: "sharedService", useClass: SharedService },
  ],
  exports: ["sharedService"],
});

const ModuleA = createModule({
  name: "ModuleA",
  imports: [SharedModule],
  exports: ["serviceA"],
});

const ModuleB = createModule({
  name: "ModuleB",
  imports: [SharedModule],
  exports: ["serviceB"],
});

const ModuleC = createModule({
  name: "ModuleC",
  imports: [SharedModule],
  exports: ["serviceC"],
});
```

2. **使用延迟依赖注入** - 在运行时解析依赖：

```typescript
const ModuleA = createModule({
  name: "ModuleA",
  declarations: [
    {
      serviceIdentifier: "serviceA",
      useFactory: (container) => {
        // 延迟解析 ModuleC 的服务
        const serviceC = container.resolve("serviceC");
        return new ServiceA(serviceC);
      },
    },
  ],
  imports: [ModuleB],
  exports: ["serviceA"],
});
```

---

### 常见错误：导入命名冲突

**错误代码：** `E_IMPORT_COLLISION`

**问题描述：** 多个导入的模块导出相同名称的服务，导致冲突。

**错误示例：**

```typescript
const LoggerModule1 = createModule({
  name: "LoggerModule1",
  declarations: [{ serviceIdentifier: "logger", useClass: Logger1 }],
  exports: ["logger"],
});

const LoggerModule2 = createModule({
  name: "LoggerModule2",
  declarations: [{ serviceIdentifier: "logger", useClass: Logger2 }],
  exports: ["logger"],
});

// 两个模块都导出 "logger"，导致冲突
const AppModule = createModule({
  name: "AppModule",
  imports: [LoggerModule1, LoggerModule2],
});
```

**错误信息：**

```
E_IMPORT_COLLISION: Multiple imported modules export the same ServiceIdentifier 'logger' without alias resolution
```

**解决方案：**

使用 `withAliases()` 为冲突的服务创建不同的名称：

```typescript
const AppModule = createModule({
  name: "AppModule",
  imports: [
    LoggerModule1.withAliases([
      { serviceIdentifier: "logger", as: "logger1" },
    ]),
    LoggerModule2.withAliases([
      { serviceIdentifier: "logger", as: "logger2" },
    ]),
  ],
});

const logger1 = AppModule.resolve("logger1"); // Logger1 实例
const logger2 = AppModule.resolve("logger2"); // Logger2 实例
```

---

### 常见错误：别名源未导出

**错误代码：** `E_ALIAS_SOURCE_NOT_EXPORTED`

**问题描述：** 尝试为未导出的服务创建别名。

**错误示例：**

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "internalService", useClass: InternalService },
    { serviceIdentifier: "publicService", useClass: PublicService },
  ],
  exports: ["publicService"], // internalService 未导出
});

// 尝试为未导出的服务创建别名
const AppModule = createModule({
  name: "AppModule",
  imports: [
    MyModule.withAliases([
      { serviceIdentifier: "internalService", as: "myInternal" },
    ]),
  ],
});
```

**错误信息：**

```
E_ALIAS_SOURCE_NOT_EXPORTED: Alias source 'internalService' is not exported by the source module 'MyModule'
```

**解决方案：**

1. 确保源服务在导出列表中：

```typescript
const MyModule = createModule({
  name: "MyModule",
  declarations: [
    { serviceIdentifier: "internalService", useClass: InternalService },
    { serviceIdentifier: "publicService", useClass: PublicService },
  ],
  exports: ["publicService", "internalService"], // 添加 internalService 到 exports
});

const AppModule = createModule({
  name: "AppModule",
  imports: [
    MyModule.withAliases([
      { serviceIdentifier: "internalService", as: "myInternal" },
    ]),
  ],
});
```

2. 或选择已导出的服务创建别名：

```typescript
const AppModule = createModule({
  name: "AppModule",
  imports: [
    MyModule.withAliases([
      { serviceIdentifier: "publicService", as: "myPublic" }, // 使用已导出的服务
    ]),
  ],
});
```

---

## 错误代码速查表

| 错误代码 | 描述 | 解决方案 |
|---------|------|---------|
| `E_DUPLICATE_DECLARATION` | 重复声明服务 | 确保每个服务标识符只声明一次 |
| `E_INVALID_REGISTRATION` | 无效的注册策略 | 使用 useClass/useFactory/useValue/useAlias 之一 |
| `E_DUPLICATE_IMPORT_MODULE` | 重复导入同一模块 | 每个模块只导入一次 |
| `E_CIRCULAR_DEPENDENCY` | 循环依赖 | 重构模块依赖关系 |
| `E_IMPORT_COLLISION` | 导入命名冲突 | 使用 withAliases() 重命名 |
| `E_ALIAS_SOURCE_NOT_EXPORTED` | 别名源未导出 | 确保源服务在 exports 中 |
| `E_ALIAS_CONFLICT_LOCAL` | 别名与本地声明冲突 | 使用不同的别名名称 |
| `E_DUPLICATE_ALIAS_MAP` | 重复的别名映射 | 每个源服务只映射一次 |
| `E_EXPORT_NOT_FOUND` | 导出未声明的服务 | 添加声明或从导入模块获取 |
| `E_DUPLICATE_EXPORT` | 重复导出同一服务 | 每个服务只导出一次 |
