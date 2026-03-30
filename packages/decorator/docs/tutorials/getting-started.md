# 装饰器依赖注入入门

本教程将带你从零开始学习如何使用 `@husky-di/decorator` 进行依赖注入开发。

## 前置知识

### 什么是 TypeScript 装饰器？

TypeScript 装饰器是一种特殊类型的声明，它能够被附加到类声明、方法、访问符、属性或参数上。装饰器使用 `@expression` 这种形式，其中 `expression` 必须是一个函数。

```typescript
// 装饰器是一个函数
function logDecorator(target: Function) {
  console.log(`装饰了类：${target.name}`);
}

// 使用装饰器
@logDecorator
class MyClass {}
// 输出：装饰了类：MyClass
```

在依赖注入场景中，装饰器用于标记哪些类可以被容器管理，以及哪些构造函数参数需要被注入。

### 装饰器的执行顺序

当多个装饰器应用于同一个目标时，它们按照特定顺序执行：

1. **自下而上执行**：最靠近目标的装饰器先执行
2. **参数装饰器先于方法/类装饰器执行**

```typescript
function First() {
  console.log('First 装饰器执行');
  return (target: Function) => {
    console.log('First 回调执行');
  };
}

function Second() {
  console.log('Second 装饰器执行');
  return (target: Function) => {
    console.log('Second 回调执行');
  };
}

@First()
@Second()
class MyClass {}

// 执行顺序：
// Second 装饰器执行
// First 装饰器执行
// First 回调执行
// Second 回调执行
```

理解这个顺序对于 `@inject()` 装饰器很重要，因为后执行的装饰器会覆盖先执行的装饰器的元数据。

### Reflect.metadata 的作用

`reflect-metadata` 是一个 polyfill，它提供了 Reflect API 来存储和读取元数据。在依赖注入中，它用于：

1. **存储类型信息**：`design:paramtypes` 保存构造函数参数的类型
2. **存储注入配置**：保存 `@inject()` 的配置选项

```typescript
import 'reflect-metadata';

class Dependency {}

// 装饰器存储元数据
function storeMetadata(target: Function, key: string, parameterIndex: number) {
  Reflect.defineMetadata('custom:metadata', { index: parameterIndex }, target, key);
}

// 读取元数据
const metadata = Reflect.getMetadata('custom:metadata', target, key);
```

`@husky-di/decorator` 使用 `reflect-metadata` 来：
- 读取 `design:paramtypes` 获取参数的类型信息
- 存储和读取 `@inject()` 的注入配置

## 开始使用

### 安装和配置

首先安装所需的依赖包：

```bash
pnpm add @husky-di/core @husky-di/decorator reflect-metadata
```

### TypeScript 配置要求

在 `tsconfig.json` 中必须启用以下两个选项：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true
  }
}
```

配置说明：

| 选项 | 作用 |
|------|------|
| `experimentalDecorators` | 启用装饰器语法支持 |
| `emitDecoratorMetadata` | 在设计时发射类型元数据（用于依赖注入） |

### 引入 reflect-metadata

在使用装饰器之前，必须在应用入口处引入 `reflect-metadata`：

```typescript
// main.ts 或 index.ts
import 'reflect-metadata';

// 然后才能使用装饰器
import { inject, injectable } from '@husky-di/decorator';
```

> **注意**：`reflect-metadata` 必须在所有其他代码之前引入，通常放在入口文件的第一行。

## 核心装饰器

### @injectable() 装饰器 - 标记可注入类

`@injectable()` 用于标记一个类可以被依赖注入容器管理。

```typescript
import { injectable } from '@husky-di/decorator';

@injectable()
class UserService {
  constructor() {}
}
```

#### 为什么需要 @injectable()？

这是一个常见的问题。需要 `@injectable()` 的原因有两个：

1. **触发 TypeScript 发射元数据**：只有当类被装饰器修饰时，TypeScript 编译器才会发射 `design:paramtypes` 元数据。没有这个元数据，容器无法知道构造函数需要什么类型的依赖。

```typescript
// 没有 @injectable()，TypeScript 不会发射设计元数据
class UserService {
  constructor(logger: LoggerService) {} // 容器无法知道需要 LoggerService
}

// 有 @injectable()，TypeScript 会发射设计元数据
@injectable()
class UserService {
  constructor(logger: LoggerService) {} // 容器可以从 design:paramtypes 获取类型
}
```

2. **存储注入元数据**：`@injectable()` 会收集并存储所有 `@inject()` 装饰器配置的元数据，供容器在解析时使用。

```typescript
// @injectable() 内部会执行以下逻辑：
// 1. 读取 design:paramtypes 获取参数类型
// 2. 读取 @inject() 存储的配置元数据
// 3. 合并两者，存储到 injectionMetadataMap
```

#### 错误处理

对同一个类多次使用 `@injectable()` 会抛出错误：

```typescript
// 错误：重复装饰
@injectable()
@injectable()
class DuplicateService {} 
// 抛出：Class 'DuplicateService' is already decorated with @Injectable()
```

### @inject() 装饰器 - 构造函数参数注入

`@inject()` 用于指定构造函数参数的注入配置。

```typescript
import { inject, injectable } from '@husky-di/decorator';

@injectable()
class LoggerService {
  log(message: string) {
    console.log(message);
  }
}

@injectable()
class UserService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}
}
```

#### 工作原理

1. `@inject()` 将注入元数据附加到构造函数参数的特定位置
2. 当容器解析类时，读取这些元数据来确定如何获取依赖
3. 容器根据 `serviceIdentifier` 查找或创建依赖实例
4. 将依赖实例作为参数传递给构造函数

#### ServiceIdentifier 类型

`@inject()` 的第一个参数是 `ServiceIdentifier`，它可以是：

```typescript
// 1. 类构造函数（最常用）
@inject(LoggerService) logger: LoggerService

// 2. Symbol（用于解耦）
const LOGGER_TOKEN = Symbol('LoggerService');
@inject(LOGGER_TOKEN) logger: LoggerService

// 3. 字符串（不推荐，容易冲突）
@inject('LoggerService') logger: LoggerService
```

## 完整示例

下面是一个完整的示例，演示如何使用装饰器进行依赖注入。

### 步骤 1：创建服务类

首先创建基础服务：

```typescript
import { injectable } from '@husky-di/decorator';

@injectable()
class LoggerService {
  log(message: string): string {
    return `[LOG]: ${message}`;
  }
}
```

### 步骤 2：添加依赖注入

创建依赖其他服务的服务：

```typescript
import { inject, injectable } from '@husky-di/decorator';

@injectable()
class DatabaseService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}

  query(sql: string): string {
    const logMessage = this.logger.log(`Executing SQL: ${sql}`);
    console.log(logMessage);
    return `Query result for: ${sql}`;
  }
}
```

### 步骤 3：注册装饰器中间件

在使用装饰器注入之前，必须注册 `decoratorMiddleware`：

```typescript
import 'reflect-metadata';
import { globalMiddleware } from '@husky-di/core';
import { decoratorMiddleware } from '@husky-di/decorator';

// 注册装饰器中间件（全局生效）
globalMiddleware.use(decoratorMiddleware);
```

### 步骤 4：从容器解析服务

```typescript
import { createContainer } from '@husky-di/core';

// 创建容器
const container = createContainer();

// 解析服务（容器会自动处理依赖）
const databaseService = container.resolve(DatabaseService);
const result = databaseService.query('SELECT * FROM users');
console.log(result); // "Query result for: SELECT * FROM users"
```

### 完整代码

```typescript
import 'reflect-metadata';
import { createContainer, globalMiddleware } from '@husky-di/core';
import { decoratorMiddleware, inject, injectable } from '@husky-di/decorator';

// 1. 注册中间件
globalMiddleware.use(decoratorMiddleware);

// 2. 创建容器
const container = createContainer();

// 3. 定义服务
@injectable()
class LoggerService {
  log(message: string): string {
    return `[LOG]: ${message}`;
  }
}

@injectable()
class DatabaseService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}

  query(sql: string): string {
    return this.logger.log(`Executing: ${sql}`);
  }
}

@injectable()
class UserService {
  constructor(
    @inject(DatabaseService) private db: DatabaseService,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  getUser(id: string): string {
    const queryResult = this.db.query(`SELECT * FROM users WHERE id = ${id}`);
    const logMessage = this.logger.log(`Got user: ${id}`);
    return `${queryResult} - ${logMessage}`;
  }
}

// 4. 使用服务
const userService = container.resolve(UserService);
console.log(userService.getUser('123'));
// 输出：[LOG]: Executing: SELECT * FROM users WHERE id = 123 - [LOG]: Got user: 123
```

## 注入选项

`@inject()` 装饰器接受第二个参数 `options`，用于配置注入行为。

### optional - 可选注入

当依赖可能不存在时，使用 `optional: true` 避免抛出错误：

```typescript
import { inject, injectable } from '@husky-di/decorator';

const OPTIONAL_TOKEN = Symbol('OptionalService');

@injectable()
class TestService {
  constructor(
    @inject(OPTIONAL_TOKEN, { optional: true })
    public optionalService?: unknown
  ) {}
}

const container = createContainer();
const instance = container.resolve(TestService);

// optionalService 为 undefined，不会抛出错误
console.log(instance.optionalService); // undefined
```

### dynamic - 动态引用

获取服务的动态引用，每次访问 `current` 属性时都会重新解析：

```typescript
import { inject, injectable, type Ref } from '@husky-di/decorator';

@injectable()
class ConfigService {
  private value = 'initial';
  
  getValue(): string {
    return this.value;
  }
  
  setValue(newValue: string): void {
    this.value = newValue;
  }
}

@injectable()
class CacheService {
  constructor(
    @inject(ConfigService, { dynamic: true })
    private configRef: Ref<ConfigService>
  ) {}

  getConfigValue(): string {
    // 每次访问 current 都会重新解析
    return this.configRef.current.getValue();
  }
}

// 使用
const container = createContainer();
const cacheService = container.resolve(CacheService);

console.log(cacheService.getConfigValue()); // "initial"

// 重新注册 ConfigService
container.register(ConfigService, { 
  useClass: class extends ConfigService {
    getValue() { return 'updated'; }
  }
});

// 动态引用会获取新的实例
console.log(cacheService.getConfigValue()); // "updated"
```

### ref - 引用注入

获取服务的引用对象，延迟解析且只能解析一次：

```typescript
import { inject, injectable, type Ref } from '@husky-di/decorator';

@injectable()
class ExpensiveService {
  constructor() {
    console.log('ExpensiveService 创建');
  }
}

@injectable()
class LazyService {
  constructor(
    @inject(ExpensiveService, { ref: true })
    public serviceRef: Ref<ExpensiveService>
  ) {}
}

const container = createContainer();
const lazyService = container.resolve(LazyService);

// 此时 ExpensiveService 还未创建
console.log('第一次访问前');

// 访问 current 时才会创建实例
const service = lazyService.serviceRef.current;
console.log('第一次访问后'); // 输出：ExpensiveService 创建

// 再次访问不会重新创建
const service2 = lazyService.serviceRef.current;
console.log(service === service2); // true
```

### 选项对比

| 选项 | 解析时机 | 是否缓存 | 使用场景 |
|------|----------|----------|----------|
| 默认 | 立即解析 | 是 | 普通依赖 |
| `dynamic: true` | 每次访问 | 否 | 需要获取最新实例 |
| `ref: true` | 首次访问 | 是 | 延迟加载、避免循环依赖 |
| `optional: true` | 立即解析 | 是 | 可选依赖 |

## 进阶示例

### 多层依赖注入

现实应用中，服务之间往往存在多层依赖关系：

```typescript
import 'reflect-metadata';
import { createContainer, globalMiddleware } from '@husky-di/core';
import { decoratorMiddleware, inject, injectable } from '@husky-di/decorator';

globalMiddleware.use(decoratorMiddleware);
const container = createContainer();

// 第一层：基础服务
@injectable()
class LoggerService {
  log(level: string, message: string): string {
    return `[${level}]: ${message}`;
  }
}

// 第二层：依赖 LoggerService
@injectable()
class DatabaseService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}

  execute(query: string): string {
    return this.logger.log('DB', `Executing: ${query}`);
  }
}

// 第二层：依赖 LoggerService
@injectable()
class CacheService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}

  get(key: string): string {
    return this.logger.log('CACHE', `Getting: ${key}`);
  }
}

// 第三层：依赖 DatabaseService 和 CacheService
@injectable()
class UserRepository {
  constructor(
    @inject(DatabaseService) private db: DatabaseService,
    @inject(CacheService) private cache: CacheService
  ) {}

  findById(id: string): string {
    const cacheResult = this.cache.get(`user:${id}`);
    const dbResult = this.db.execute(`SELECT * FROM users WHERE id = ${id}`);
    return `${cacheResult} | ${dbResult}`;
  }
}

// 第四层：依赖 UserRepository
@injectable()
class UserService {
  constructor(
    @inject(UserRepository) private repo: UserRepository,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  getUser(id: string): string {
    const userData = this.repo.findById(id);
    const logMessage = this.logger.log('INFO', `Retrieved user: ${id}`);
    return `${userData} | ${logMessage}`;
  }
}

// 使用
const userService = container.resolve(UserService);
console.log(userService.getUser('123'));
```

输出：
```
[CACHE]: Getting: user:123 | [DB]: Executing: SELECT * FROM users WHERE id = 123 | [INFO]: Retrieved user: 123
```

### 使用装饰器构建完整应用

下面是一个完整的 Web 应用示例：

```typescript
import 'reflect-metadata';
import { createContainer, globalMiddleware } from '@husky-di/core';
import { decoratorMiddleware, inject, injectable } from '@husky-di/decorator';

// 1. 注册中间件
globalMiddleware.use(decoratorMiddleware);

// 2. 创建容器
const container = createContainer();

// 3. 配置服务
@injectable()
class ConfigService {
  private config: Record<string, string> = {
    dbUrl: 'mongodb://localhost:27017',
    port: '3000',
  };

  get(key: string): string {
    return this.config[key] || '';
  }
}

// 4. 日志服务
@injectable()
class LoggerService {
  constructor(@inject(ConfigService) private config: ConfigService) {}

  info(message: string): void {
    console.log(`[INFO]: ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR]: ${message}`);
  }
}

// 5. 数据库连接服务
@injectable()
class DatabaseConnection {
  constructor(
    @inject(ConfigService) private config: ConfigService,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  connect(): string {
    const url = this.config.get('dbUrl');
    this.logger.info(`Connecting to ${url}`);
    return `Connected to ${url}`;
  }
}

// 6. 数据访问层
@injectable()
class UserRepository {
  constructor(
    @inject(DatabaseConnection) private db: DatabaseConnection,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  findById(id: string): { id: string; name: string } {
    this.db.connect();
    this.logger.info(`Finding user ${id}`);
    return { id, name: 'John Doe' };
  }
}

// 7. 业务逻辑层
@injectable()
class UserService {
  constructor(
    @inject(UserRepository) private repo: UserRepository,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  getUser(id: string): { id: string; name: string } {
    this.logger.info(`Getting user ${id}`);
    return this.repo.findById(id);
  }

  createUser(name: string): { id: string; name: string } {
    this.logger.info(`Creating user ${name}`);
    return { id: 'new-id', name };
  }
}

// 8. 控制器层
@injectable()
class UserController {
  constructor(
    @inject(UserService) private userService: UserService,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  handleGetUser(id: string): string {
    try {
      const user = this.userService.getUser(id);
      return JSON.stringify(user);
    } catch (error) {
      this.logger.error(`Failed to get user: ${error}`);
      return JSON.stringify({ error: 'Failed to get user' });
    }
  }

  handleCreateUser(name: string): string {
    try {
      const user = this.userService.createUser(name);
      return JSON.stringify(user);
    } catch (error) {
      this.logger.error(`Failed to create user: ${error}`);
      return JSON.stringify({ error: 'Failed to create user' });
    }
  }
}

// 9. 应用入口
@injectable()
class Application {
  constructor(
    @inject(UserController) private userController: UserController,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  start(): void {
    this.logger.info('Application starting...');
    
    // 模拟处理请求
    const getUserResponse = this.userController.handleGetUser('123');
    console.log('GET /users/123:', getUserResponse);
    
    const createUserResponse = this.userController.handleCreateUser('Jane');
    console.log('POST /users:', createUserResponse);
    
    this.logger.info('Application started');
  }
}

// 10. 启动应用
const app = container.resolve(Application);
app.start();
```

输出：
```
[INFO]: Application starting...
[INFO]: Getting user 123
[INFO]: Finding user 123
Connecting to mongodb://localhost:27017
[INFO]: Connected to mongodb://localhost:27017
GET /users/123: {"id":"123","name":"John Doe"}
[INFO]: Creating user Jane
POST /users: {"id":"new-id","name":"Jane"}
[INFO]: Application started
```

## 装饰器与容器的配合工作

理解装饰器如何与容器配合工作非常重要。以下是完整的工作流程：

### 1. 装饰阶段（编译时/运行时）

```typescript
@injectable()
class UserService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}
}
```

执行过程：

1. `@inject(LoggerService)` 执行：
   - 将 `{ serviceIdentifier: LoggerService }` 存储到构造函数参数的元数据中
   - 使用 `Reflect.defineMetadata` 存储在目标类上

2. `@injectable()` 执行：
   - 读取 `design:paramtypes`（由 TypeScript 发射）
   - 读取 `@inject()` 存储的元数据
   - 合并两者，存储到 `injectionMetadataMap`

### 2. 解析阶段（运行时）

```typescript
const userService = container.resolve(UserService);
```

执行过程：

1. 容器调用 `decoratorMiddleware`
2. 中间件从 `injectionMetadataMap` 获取 `UserService` 的注入元数据
3. 对每个参数：
   - 根据 `serviceIdentifier` 解析依赖
   - 应用 `options`（如 `optional`、`dynamic`、`ref`）
4. 使用解析的参数调用 `new UserService(...)`
5. 返回实例

### 流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    装饰阶段                                  │
├─────────────────────────────────────────────────────────────┤
│  @inject(LoggerService)                                      │
│    ↓                                                         │
│  存储参数元数据到 Reflect                                    │
│    ↓                                                         │
│  @injectable()                                               │
│    ↓                                                         │
│  读取 design:paramtypes + @inject 元数据                     │
│    ↓                                                         │
│  存储到 injectionMetadataMap                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    解析阶段                                  │
├─────────────────────────────────────────────────────────────┤
│  container.resolve(UserService)                              │
│    ↓                                                         │
│  decoratorMiddleware 拦截                                    │
│    ↓                                                         │
│  从 injectionMetadataMap 读取元数据                          │
│    ↓                                                         │
│  解析每个参数的依赖                                          │
│    ↓                                                         │
│  new UserService(loggerInstance)                             │
│    ↓                                                         │
│  返回实例                                                    │
└─────────────────────────────────────────────────────────────┘
```

## 总结

通过本教程，你学习了：

1. **前置知识**：TypeScript 装饰器、执行顺序、Reflect.metadata 的作用
2. **环境配置**：安装依赖、配置 TypeScript、引入 reflect-metadata
3. **核心装饰器**：`@injectable()` 和 `@inject()` 的作用和用法
4. **完整示例**：从创建服务到容器解析的完整流程
5. **注入选项**：`optional`、`dynamic`、`ref` 的使用场景
6. **进阶应用**：多层依赖注入和完整应用示例
7. **工作原理**：装饰器与容器的配合工作流程

### 下一步

- 阅读 [API 参考文档](../reference/api.md) 了解更多详细接口
- 查看 [高级概念](../explanation/concepts.md) 学习更多装饰器原理
- 探索 [实践指南](../how-to/index.md) 查看具体用法示例
