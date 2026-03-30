# 装饰器依赖注入概念与设计思想

本文档深入解释 `@husky-di/decorator` 包的核心概念、设计思想和工作原理。

---

## 目录

- [装饰器基础](#装饰器基础)
- [元数据系统](#元数据系统)
- [@injectable() 设计思想](#injectable-设计思想)
- [@inject() 设计思想](#inject-设计思想)
- [装饰器中间件](#装饰器中间件)
- [TypeScript 装饰器限制](#typescript-装饰器限制)
- [最佳实践](#最佳实践)

---

## 装饰器基础

### TypeScript 装饰器是什么？

装饰器是一种特殊类型的声明，能够被附加到类声明、方法、访问符、属性或参数上。装饰器使用 `@expression` 这种形式，其中 `expression` 求值后必须是一个函数，在运行时被调用。

```typescript
// 装饰器的基本形式
function decorative(target: any) {
  // 对 target 进行处理
  return target;
}

@decorative
class MyClass {}
```

在依赖注入的上下文中，装饰器扮演着**元数据标记**和**自动注册**的双重角色：

```typescript
// @husky-di/decorator 中的装饰器
import { injectable, inject } from '@husky-di/decorator';

@injectable()
class UserService {
  constructor(@inject(Database) private db: Database) {}
}
```

### 装饰器的执行顺序

理解装饰器的执行顺序对于正确使用依赖注入至关重要。

```
┌─────────────────────────────────────────────────────────────┐
│                    装饰器执行顺序                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 参数装饰器 (Parameters)     ← 从右到左，从内到外         │
│  2. 方法装饰器 (Methods)        ← 从下到上，从内到外         │
│  3. 访问符装饰器 (Accessors)    ← 从下到上，从内到外         │
│  4. 属性装饰器 (Properties)     ← 从下到上，从内到外         │
│  5. 类装饰器 (Class)            ← 最后执行                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

具体示例：

```typescript
function logDecorator(name: string) {
  return function (target: any, propertyKey?: string, descriptor?: any) {
    console.log(`${name} executed`);
  };
}

@logDecorator('Class')
class Example {
  @logDecorator('Property')
  prop: string;

  constructor(
    @logDecorator('Param1') param1: string,
    @logDecorator('Param2') param2: number
  ) {
    // 输出顺序：
    // Param2 executed
    // Param1 executed
    // Class executed
  }
}
```

**关键洞察**：参数装饰器最先执行，这意味着它们可以在类装饰器之前收集依赖信息，为后续的依赖注入做准备。

### 类装饰器 vs 参数装饰器

| 特性 | 类装饰器 | 参数装饰器 |
|------|----------|------------|
| **接收参数** | `(target: Function) => void | Function` | `(target: Function, propertyKey: string | undefined, parameterIndex: number) => void` |
| **返回值** | 可以返回新的构造函数 | 必须返回 `void` |
| **执行时机** | 类定义时最后执行 | 类定义时最先执行 |
| **主要用途** | 修改类行为、自动注册 | 收集参数元数据、标记依赖 |
| **在 DI 中的角色** | 标记可注入类、处理元数据合并 | 标记构造函数参数、记录依赖关系 |

```typescript
// 类装饰器示例
function injectable() {
  return function (target: Function) {
    // 标记该类可以被容器管理
    Reflect.defineMetadata('__injectable__', true, target);
  };
}

// 参数装饰器示例
function inject(token?: any) {
  return function (target: Function, propertyKey: string | undefined, parameterIndex: number) {
    // 记录该位置的依赖令牌
    const deps = Reflect.getMetadata('__inject_deps__', target) || [];
    deps[parameterIndex] = token || Reflect.getMetadata('design:paramtypes', target, propertyKey)?.[parameterIndex];
    Reflect.defineMetadata('__inject_deps__', deps, target);
  };
}
```

---

## 元数据系统

### Reflect Metadata API 介绍

Reflect Metadata 是 TypeScript 依赖注入的基石。它提供了一个标准化的方式来存储和读取与类、方法、参数相关的元数据。

```typescript
import 'reflect-metadata';

// 定义元数据
Reflect.defineMetadata('key', 'value', target);

// 读取元数据
const value = Reflect.getMetadata('key', target);

// 检查元数据是否存在
const exists = Reflect.hasMetadata('key', target);

// 获取元数据键列表
const keys = Reflect.getMetadataKeys(target);
```

**为什么需要 Reflect Metadata？**

JavaScript/TypeScript 的类型系统在运行时会经历**类型擦除**（Type Erasure）。这意味着：

```typescript
class UserService {
  constructor(private db: Database) {}
}

// 运行时，上述代码等价于：
function UserService(db) {
  this.db = db;
}
```

类型信息 `Database` 在运行时消失，容器无法知道构造函数需要什么依赖。Reflect Metadata 通过**在运行时显式存储类型信息**来解决这个问题。

### 装饰器如何存储和读取元数据

`@husky-di/decorator` 使用一套精心设计的元数据键系统：

```
┌────────────────────────────────────────────────────────────────┐
│                     元数据存储结构                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  @injectable()                                                 │
│  ├── 'injectable' → true                                      │
│  └── 'injectable_options' → { scope, eager, ... }             │
│                                                                │
│  @inject(Database)                                             │
│  ├── 'inject' → true                                          │
│  └── 'inject_options' → { token, optional, ... }              │
│                                                                │
│  TypeScript 编译器生成                                          │
│  └── 'design:paramtypes' → [Database, Logger, ...]            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

代码实现示例：

```typescript
// 存储 @injectable 元数据
function injectable(options?: InjectableOptions) {
  return function (target: Function) {
    Reflect.defineMetadata('injectable', true, target);
    if (options) {
      Reflect.defineMetadata('injectable_options', options, target);
    }
  };
}

// 存储 @inject 元数据
function inject(token: any, options?: InjectOptions) {
  return function (target: Function, propertyKey: string | undefined, parameterIndex: number) {
    const deps = Reflect.getMetadata('__inject_deps__', target) || [];
    deps[parameterIndex] = { token, options };
    Reflect.defineMetadata('__inject_deps__', deps, target);
  };
}
```

### design:paramtypes 的作用

当 TypeScript 编译带有装饰器的类时，如果启用了 `emitDecoratorMetadata` 选项，编译器会自动生成 `design:paramtypes` 元数据：

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

```typescript
class UserService {
  constructor(
    private db: Database,
    private logger: Logger
  ) {}
}

// 编译器自动生成：
// Reflect.defineMetadata('design:paramtypes', [Database, Logger], UserService);
```

**工作原理**：

```
┌─────────────────────────────────────────────────────────────┐
│              design:paramtypes 生成流程                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TypeScript 源码      →    编译器分析    →   运行时元数据    │
│                                                             │
│  constructor(               ↓                ↓              │
│    db: Database,        读取类型          [Database,        │
│    logger: Logger       注解              Logger]           │
│  ) {}                                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**局限性**：

```typescript
// 接口类型会消失
interface IDatabase {}
class UserService {
  constructor(db: IDatabase) {}  // design:paramtypes 中为 Object
}

// 联合类型会消失
class UserService {
  constructor(option: string | number) {}  // design:paramtypes 中为 Object
}

// 泛型类型会消失
class UserService {
  constructor(list: Array<string>) {}  // design:paramtypes 中为 Array
}
```

### 自定义元数据键

`@husky-di/decorator` 定义了一套统一的元数据键：

```typescript
// 核心元数据键
export const INJECTABLE_METADATA_KEY = 'injectable';
export const INJECTABLE_OPTIONS_KEY = 'injectable_options';
export const INJECT_METADATA_KEY = 'inject';
export const INJECT_OPTIONS_KEY = 'inject_options';
export const INJECT_DEPS_KEY = '__inject_deps__';

// 容器内部使用的元数据键
export const RESOLVED_INSTANCE_KEY = '__resolved_instance__';
export const CHILD_CONTAINER_KEY = '__child_container__';
```

使用自定义键的好处：

1. **避免命名冲突**：第三方库可能使用相同的元数据键
2. **版本兼容性**：可以平滑地演进元数据结构
3. **调试友好**：清晰的键名便于开发时检查

---

## @injectable() 设计思想

### 为什么需要 @injectable()？

这是最常见的问题之一：**既然 TypeScript 可以提供 design:paramtypes，为什么还需要显式的 @injectable() 装饰器？**

#### 方案对比

**方案 A：自动推断（不使用 @injectable）**

```typescript
// 理想情况：容器自动扫描所有类
class UserService {
  constructor(private db: Database) {}
}

// 容器如何知道这个类需要被管理？
// 问题 1：需要扫描所有文件
// 问题 2：无法区分类是否应该被容器管理
// 问题 3：无法配置实例化选项（作用域、懒加载等）
```

**方案 B：显式标记（使用 @injectable）**

```typescript
@injectable({ scope: 'singleton', eager: false })
class UserService {
  constructor(private db: Database) {}
}

// 优点：
// ✓ 明确的意图表达
// ✓ 可配置的实例化选项
// ✓ 无需文件扫描
// ✓ 类型安全
```

### 元数据 Consolidation（合并）机制

`@injectable()` 的核心职责是**合并和固化元数据**。这是因为装饰器的执行顺序导致参数装饰器先于类装饰器执行。

```
┌─────────────────────────────────────────────────────────────────┐
│                  元数据合并流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  阶段 1: 参数装饰器执行                                          │
│  ├── @inject(Database) 执行                                    │
│  └── 存储到临时元数据 __inject_deps__                           │
│                                                                 │
│  阶段 2: 类装饰器执行                                            │
│  ├── @injectable() 执行                                        │
│  ├── 读取 __inject_deps__                                       │
│  ├── 读取 design:paramtypes                                    │
│  ├── 合并两种元数据                                             │
│  └── 存储到最终元数据 __resolved_deps__                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

代码实现逻辑：

```typescript
function injectable(options?: InjectableOptions) {
  return function (target: Function) {
    // 1. 标记为可注入
    Reflect.defineMetadata(INJECTABLE_METADATA_KEY, true, target);
    
    // 2. 存储选项
    if (options) {
      Reflect.defineMetadata(INJECTABLE_OPTIONS_KEY, options, target);
    }
    
    // 3. 合并依赖元数据
    const explicitDeps = Reflect.getMetadata(INJECT_DEPS_KEY, target) || [];
    const typeDeps = Reflect.getMetadata('design:paramtypes', target) || [];
    
    // 4. 优先使用显式声明的依赖，回退到类型推断
    const mergedDeps = typeDeps.map((type: any, index: number) => {
      const explicit = explicitDeps[index];
      return explicit?.token || type;
    });
    
    // 5. 存储合并后的依赖
    Reflect.defineMetadata('__resolved_deps__', mergedDeps, target);
  };
}
```

### 为什么不使用自动推断？

自动推断看似更方便，但存在多个无法解决的问题：

```typescript
// 问题 1: 循环依赖
class ServiceA {
  constructor(private b: ServiceB) {}  // 容器如何知道顺序？
}

class ServiceB {
  constructor(private a: ServiceA) {}  // 先实例化哪个？
}

// 问题 2: 多实现场景
interface Database {
  query(sql: string): any;
}

class MySQLDatabase implements Database {}
class PostgresDatabase implements Database {}

class UserService {
  constructor(private db: Database) {}  // 注入哪个实现？
}

// 问题 3: 值类型无法推断
class ConfigService {
  constructor(
    private host: string,    // string 不是类，无法实例化
    private port: number     // number 不是类，无法实例化
  ) {}
}

// 问题 4: 作用域控制
class RequestLogger {
  // 这个类应该是每次请求一个新实例，还是单例？
  // 自动推断无法表达这种意图
}
```

**设计哲学**：显式优于隐式。`@injectable()` 强制开发者明确表达意图，避免了大量隐蔽的运行时错误。

---

## @inject() 设计思想

### 显式注入 vs 隐式推断

`@inject()` 装饰器允许开发者显式指定依赖的注入令牌：

```typescript
// 隐式推断（依赖 design:paramtypes）
@injectable()
class UserService {
  constructor(private db: Database) {}  // 注入 Database 类
}

// 显式注入（使用 @inject）
@injectable()
class UserService {
  constructor(
    @inject('DATABASE') private db: Database,      // 使用字符串令牌
    @inject(MySQLDatabase) private db2: Database,  // 使用不同的类
    @inject({ factory: createDb }) private db3     // 使用工厂函数
  ) {}
}
```

### 注入选项的设计考量

`@inject()` 支持多种选项来满足不同的注入需求：

```typescript
interface InjectOptions {
  // 可选依赖：如果令牌未注册，注入 undefined 而不是抛出错误
  optional?: boolean;
  
  // 使用工厂函数创建实例
  factory?: (container: Container) => any;
  
  // 使用已存在的值
  value?: any;
  
  // 注入到属性而不是构造函数参数
  property?: string;
}
```

使用场景示例：

```typescript
// 可选依赖
@injectable()
class EmailService {
  constructor(
    @inject(SMTPClient, { optional: true }) 
    private smtp?: SMTPClient  // 如果没有注册 SMTPClient，使用 undefined
  ) {}
}

// 工厂注入
@injectable()
class ConfigService {
  constructor(
    @inject('CONFIG', { 
      factory: () => loadConfigFromEnv() 
    }) 
    private config: Config
  ) {}
}

// 值注入
@injectable()
class LoggerService {
  constructor(
    @inject('LOG_LEVEL', { value: 'debug' }) 
    private logLevel: string
  ) {}
}
```

### 为什么支持多种注入方式？

不同的场景需要不同的注入策略：

```
┌──────────────────────────────────────────────────────────────┐
│                    注入方式决策树                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                         需要注入什么？                        │
│                              │                               │
│         ┌────────────────────┼────────────────────┐          │
│         ↓                    ↓                    ↓          │
│      类实例              原始类型/配置          可选依赖       │
│         │                    │                    │          │
│         ↓                    ↓                    ↓          │
│   @inject(Service)   @inject({ value })   @inject(X,      │
│   或隐式推断         @inject({ factory })    { optional }) │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**核心设计原则**：

1. **灵活性**：支持各种注入场景
2. **渐进式**：简单场景用隐式推断，复杂场景用显式配置
3. **可预测性**：显式声明的行为总是优先于隐式推断

---

## 装饰器中间件

### decoratorMiddleware 的工作原理

装饰器中间件是装饰器系统与容器核心之间的桥梁。它实现了**装饰阶段**和**解析阶段**的分离：

```
┌─────────────────────────────────────────────────────────────────┐
│                    装饰器中间件架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  装饰阶段   │     │  中间件层   │     │  解析阶段   │       │
│  │             │     │             │     │             │       │
│  │  收集元数据 │ ──→ │  转换注册   │ ──→ │  创建实例   │       │
│  │  合并依赖   │     │  存储配置   │     │  注入依赖   │       │
│  │             │     │             │     │             │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│        ↓                   ↓                   ↓               │
│  @injectable()      decoratorMiddleware   container.get()      │
│  @inject()                               container.resolve()   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 装饰器与容器的协作流程

```typescript
// 1. 装饰阶段：定义类时执行
@injectable({ scope: 'singleton' })
class Database {
  constructor(
    @inject('DB_HOST') private host: string,
    @inject('DB_PORT') private port: number
  ) {}
}

// 此时元数据已存储到 Database 类上

// 2. 中间件处理：注册到容器时
container.use(decoratorMiddleware);
container.register(Database);  // 中间件读取元数据并转换

// 3. 解析阶段：请求实例时
const db = container.get(Database);  // 根据元数据创建并注入
```

详细流程：

```
┌─────────────────────────────────────────────────────────────────┐
│              完整协作流程（时序图）                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  装饰器          中间件            容器           用户代码       │
│    │               │               │               │            │
│    │← 定义类       │               │               │            │
│    │   @injectable │               │               │            │
│    │               │               │               │            │
│    │← 收集元数据   │               │               │            │
│    │               │               │               │            │
│    │               │← register()   │               │            │
│    │               │               │               │            │
│    │               │ 读取元数据    │               │            │
│    │               │ 创建注册配置  │               │            │
│    │               │               │               │            │
│    │               │ 存储到容器    │               │            │
│    │               │──────────────→│               │            │
│    │               │               │               │            │
│    │               │               │               │            │
│    │               │← get()        │               │            │
│    │               │               │               │            │
│    │               │ 解析依赖      │               │            │
│    │               │ 创建实例      │               │            │
│    │               │ 注入依赖      │               │            │
│    │               │──────────────→│               │            │
│    │               │               │               │            │
│    │               │← 返回实例     │               │            │
│    │               │───────────────│──────────────→│            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 装饰阶段的元数据收集

```typescript
// 伪代码：元数据收集过程
function collectMetadata(target: Function): RegistrationConfig {
  // 1. 检查是否标记为 @injectable
  const isInjectable = Reflect.getMetadata(INJECTABLE_KEY, target);
  if (!isInjectable) {
    throw new Error(`${target.name} is not injectable`);
  }
  
  // 2. 获取 @injectable 选项
  const options = Reflect.getMetadata(INJECTABLE_OPTIONS_KEY, target);
  
  // 3. 获取依赖令牌
  const deps = Reflect.getMetadata(RESOLVED_DEPS_KEY, target);
  
  // 4. 构建注册配置
  return {
    token: target,
    useClass: target,
    scope: options?.scope || 'transient',
    eager: options?.eager || false,
    dependencies: deps
  };
}
```

### 解析阶段的依赖注入

```typescript
// 伪代码：依赖解析过程
function resolve(token: Function): any {
  // 1. 获取注册配置
  const registration = container.getRegistration(token);
  
  // 2. 检查是否已有缓存实例（单例场景）
  if (registration.scope === 'singleton' && registration.instance) {
    return registration.instance;
  }
  
  // 3. 递归解析依赖
  const resolvedDeps = registration.dependencies.map((dep: any) => {
    return resolve(dep);
  });
  
  // 4. 创建实例
  const instance = new registration.useClass(...resolvedDeps);
  
  // 5. 缓存实例（如果是单例）
  if (registration.scope === 'singleton') {
    registration.instance = instance;
  }
  
  return instance;
}
```

---

## TypeScript 装饰器限制

### 为什么仅支持 TypeScript 装饰器？

`@husky-di/decorator` 仅支持 TypeScript 装饰器，原因如下：

```
┌─────────────────────────────────────────────────────────────┐
│              TypeScript vs ES 装饰器对比                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  特性               TypeScript 装饰器    ES 装饰器（提案）   │
│  ─────────────────────────────────────────────────────────  │
│  标准化状态          实验性功能           Stage 3 提案       │
│  元数据支持          emitDecoratorMetadata  无标准 API   │
│  执行语义            类装饰器可替换类     更严格的语义       │
│  工具链支持          成熟               正在演进        │
│  Babel 转换         @babel/plugin-proposal  配置复杂   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**关键原因**：`design:paramtypes` 是 TypeScript 编译器的特有功能，ES 装饰器规范没有提供等效的元数据机制。

### ES 装饰器规范的限制

当前的 ES 装饰器提案（Stage 3）与 TypeScript 装饰器有显著差异：

```typescript
// TypeScript 装饰器：可以访问 design:paramtypes
@injectable()
class UserService {
  constructor(@inject(Database) private db: Database) {}
}
// 编译器生成：design:paramtypes = [Database]

// ES 装饰器提案：没有设计时类型信息
// 装饰器只能访问运行时信息
// 无法获取参数的类型注解
```

这意味着如果使用 ES 装饰器，**所有的类型注入都必须显式声明**：

```typescript
// ES 装饰器下必须这样写
@injectable({
  dependencies: [Database, Logger, ConfigService]  // 显式列出所有依赖
})
class UserService {}
```

### 原始类型注入的问题

依赖注入系统天然适合注入**类的实例**，但原始类型的注入需要特殊处理：

```typescript
// 无法直接注入原始类型
@injectable()
class ConfigService {
  constructor(
    private host: string,    // string 没有构造函数，无法实例化
    private port: number     // number 没有构造函数，无法实例化
  ) {}
}

// 解决方案 1: 使用令牌 + 值注入
@injectable()
class ConfigService {
  constructor(
    @inject('DB_HOST') private host: string,
    @inject('DB_PORT') private port: number
  ) {}
}

// 容器配置
container.register('DB_HOST', { useValue: 'localhost' });
container.register('DB_PORT', { useValue: 5432 });

// 解决方案 2: 使用工厂函数
@injectable()
class ConfigService {
  constructor(
    @inject('CONFIG', { factory: loadConfig }) 
    private config: { host: string; port: number }
  ) {}
}

// 解决方案 3: 使用配置对象
interface DbConfig {
  host: string;
  port: number;
}

@injectable()
class ConfigService {
  constructor(@inject(DbConfig) private config: DbConfig) {}
}

container.register(DbConfig, {
  useValue: { host: 'localhost', port: 5432 }
});
```

### 接口类型的运行时消失

这是 TypeScript 依赖注入中最常见的问题：

```typescript
// 接口在运行时消失
interface Database {
  query(sql: string): any;
}

@injectable()
class UserService {
  constructor(@inject(Database) private db: Database) {}  
  // 运行时错误：Database is not defined
  // 接口在编译后被擦除，运行时不存在 Database 标识符
}

// 解决方案 1: 使用抽象类
abstract class Database {
  abstract query(sql: string): any;
}

class MySQLDatabase extends Database {
  query(sql: string): any { /* ... */ }
}

@injectable()
class UserService {
  constructor(@inject(Database) private db: Database) {}
}

container.register(Database, { useClass: MySQLDatabase });

// 解决方案 2: 使用字符串令牌
const DATABASE_TOKEN = 'DATABASE';

@injectable()
class UserService {
  constructor(@inject(DATABASE_TOKEN) private db: Database) {}
}

container.register(DATABASE_TOKEN, { useClass: MySQLDatabase });

// 解决方案 3: 使用 InjectionToken（类型安全）
class DatabaseToken extends InjectionToken<Database> {}

@injectable()
class UserService {
  constructor(@inject(DatabaseToken) private db: Database) {}
}

container.register(DatabaseToken, { useClass: MySQLDatabase });
```

**设计考量**：这个问题是 TypeScript 类型系统的设计决定的，不是 DI 容器的缺陷。容器提供了多种令牌类型来应对这个限制。

---

## 最佳实践

### 何时使用装饰器？

```
┌─────────────────────────────────────────────────────────────┐
│                  装饰器使用决策指南                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  适合使用装饰器的场景：                                   │
│  ├── 标准的业务服务类（Service、Repository 等）             │
│  ├── 需要容器管理生命周期的类                               │
│  ├── 依赖关系明确且稳定的类                                 │
│  └── 团队熟悉装饰器语法                                     │
│                                                             │
│  谨慎使用装饰器的场景：                                   │
│  ├── 简单的工具类/纯函数                                    │
│  ├── 依赖关系复杂的类（考虑重构）                           │
│  ├── 需要高度动态配置的场景                                 │
│  └── 库代码（避免强制使用者使用装饰器）                     │
│                                                             │
│  不适合使用装饰器的场景：                                 │
│  ├── 无法修改的第三方类                                     │
│  ├── 需要精确控制注册时机的场景                             │
│  └── 非 TypeScript 项目                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 装饰器 vs 手动注册

两种方式各有适用场景：

```typescript
// 方式 1: 装饰器（推荐用于标准场景）
@injectable({ scope: 'singleton' })
class UserService {
  constructor(@inject(Database) private db: Database) {}
}

container.use(decoratorMiddleware);
container.register(UserService);

// 方式 2: 手动注册（适合复杂/动态场景）
class UserService {
  constructor(private db: Database) {}
}

container.register(UserService, {
  scope: 'singleton',
  useClass: UserService,
  dependencies: [Database],
  factory: (container) => {
    const db = container.get(Database);
    return new UserService(db);
  }
});
```

**选择指南**：

| 场景 | 推荐方式 | 理由 |
|------|----------|------|
| 标准业务服务 | 装饰器 | 代码简洁、意图明确 |
| 第三方类集成 | 手动注册 | 无法修改源码添加装饰器 |
| 动态依赖 | 手动注册 | 依赖在运行时才能确定 |
| 复杂工厂逻辑 | 手动注册 | 装饰器选项不足以表达 |
| 库/框架代码 | 手动注册 | 不强制使用者用装饰器 |

### 装饰器的性能考量

装饰器的性能影响主要来自三个方面：

```
┌─────────────────────────────────────────────────────────────┐
│                    性能影响因素                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 装饰器执行开销（启动时）                                │
│     ├── 每个装饰器函数都会被调用一次                        │
│     ├── Reflect.defineMetadata 有轻微开销                   │
│     └── 影响：应用启动时间（通常 < 10ms）                   │
│                                                             │
│  2. 元数据查找开销（运行时）                                │
│     ├── 每次注册/解析时读取元数据                           │
│     ├── Map 查找操作，O(1) 复杂度                           │
│     └── 影响：首次解析时间（通常 < 1ms）                    │
│                                                             │
│  3. 内存开销                                                │
│     ├── 元数据存储在 WeakMap/Map 中                         │
│     ├── 每个装饰器类约增加 100-200 字节                     │
│     └── 影响：通常可忽略（1000 个类约 200KB）              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**优化建议**：

```typescript
// 使用单例作用域减少实例化开销
@injectable({ scope: 'singleton' })
class ExpensiveService {}

// 避免在装饰器中执行复杂逻辑
// 不推荐
@injectable({ 
  factory: () => {
    // 复杂计算不应该在装饰器选项中
    return heavyComputation();
  }
})

// 推荐：使用容器配置
@injectable()
class MyService {}

container.register(MyService, {
  factory: () => heavyComputation()
});

// 懒加载非关键服务
@injectable({ eager: false })
class AnalyticsService {}  // 仅在首次使用时实例化
```

---

## 总结

`@husky-di/decorator` 的设计遵循以下核心原则：

1. **显式优于隐式**：通过 `@injectable()` 和 `@inject()` 强制开发者明确表达意图
2. **渐进式复杂度**：简单场景用默认行为，复杂场景用选项配置
3. **类型安全**：充分利用 TypeScript 类型系统，同时提供运行时令牌作为补充
4. **关注点分离**：装饰器负责元数据收集，中间件负责转换，容器负责解析
5. **可预测性**：装饰器的行为和限制都有清晰的文档和错误提示

理解这些设计思想，可以帮助你更好地使用 `@husky-di/decorator`，并在合适的场景选择正确的注入方式。
