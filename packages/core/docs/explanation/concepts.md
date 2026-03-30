# 核心概念与设计思想

本文档深入解释 @husky-di/core 依赖注入库的核心概念、设计思想和内部原理。通过阅读本文，你将理解依赖注入的本质、容器架构的设计考量以及各个功能模块背后的"为什么"。

## 依赖注入基础

### 什么是依赖注入？

依赖注入（Dependency Injection，简称 DI）是一种软件设计模式，用于实现控制反转（Inversion of Control，IoC）。它的核心思想是：**对象不应该自己创建依赖，而应该由外部提供依赖**。

考虑以下对比：

```typescript
// 没有依赖注入：对象自己创建依赖
class UserService {
  private userRepository = new UserRepository();
  private logger = new Logger();
  
  getUser(id: number) {
    return this.userRepository.findById(id);
  }
}

// 使用依赖注入：依赖由外部提供
class UserService {
  constructor(
    private userRepository: UserRepository,
    private logger: Logger
  ) {}
  
  getUser(id: number) {
    return this.userRepository.findById(id);
  }
}
```

在第二个例子中，`UserService` 不再负责创建 `UserRepository` 和 `Logger`，而是通过构造函数接收这些依赖。这种设计带来了显著的优势。

### 为什么需要依赖注入？

依赖注入解决了传统编程模式中的几个核心问题：

#### 1. 紧耦合问题

没有 DI 时，类直接依赖具体实现：

```typescript
class OrderService {
  private emailNotifier = new EmailNotifier(); // 硬编码依赖
}
```

这种设计导致：
- 无法轻松替换为 `SMSNotifier`
- 难以进行单元测试（需要真实的邮件服务）
- 代码复用困难

使用 DI 后：

```typescript
class OrderService {
  constructor(private notifier: INotifier) {} // 依赖抽象
}

// 可以灵活注入任何实现
const orderService = new OrderService(new EmailNotifier());
const orderService2 = new OrderService(new SMSNotifier());
```

#### 2. 可测试性问题

DI 使得依赖可以被 mock 或 stub：

```typescript
// 测试时使用 mock 对象
const mockNotifier = {
  send: vi.fn().mockResolvedValue(true)
};
const orderService = new OrderService(mockNotifier);

// 验证交互
orderService.placeOrder(order);
expect(mockNotifier.send).toHaveBeenCalled();
```

#### 3. 生命周期管理

DI 容器可以统一管理对象的生命周期：

```typescript
// 容器确保 DatabaseConnection 是单例
container.register('db', { 
  useClass: DatabaseConnection, 
  lifecycle: LifecycleEnum.singleton 
});

// 任何地方获取的都是同一个实例
const db1 = container.resolve('db');
const db2 = container.resolve('db');
db1 === db2; // true
```

### 控制反转（IoC）与依赖注入的关系

**控制反转（IoC）** 是一个更广泛的设计原则，而 **依赖注入（DI）** 是实现 IoC 的一种具体模式。

```
IoC (控制反转)
└── DI (依赖注入) - 依赖由外部注入
    ├── 构造函数注入
    ├── 属性注入
    └── 方法注入
└── 其他 IoC 模式
    ├── 服务定位器模式
    ├── 模板方法模式
    └── 策略模式
```

**传统控制流：**

```
应用代码 → 创建对象 → 调用方法
   (应用控制一切)
```

**IoC 控制流：**

```
框架/容器 → 创建对象 → 调用应用代码
   (框架控制流程，应用被调用)
```

依赖注入通过将"创建依赖"的控制权从对象转移到外部（通常是 DI 容器），实现了控制反转。

### 依赖注入的三种方式

#### 1. 构造函数注入（Constructor Injection）

通过构造函数参数注入依赖，这是**最推荐**的方式：

```typescript
class UserService {
  constructor(
    private userRepository: UserRepository,
    private logger: Logger
  ) {}
}

// 使用
const userService = container.resolve(UserService);
```

**优点：**
- 依赖关系明确，一目了然
- 依赖不可变（readonly）
- 便于测试
- 强制依赖在对象创建时就提供

**@husky-di/core 实现：**

容器在解析类时，会自动调用其构造函数：

```typescript
// src/impls/Container.ts:491-494
case RegistrationTypeEnum.class: {
  const provider = registration.provider as Constructor<T>;
  return new provider();
}
```

#### 2. 属性注入（Property Injection）

通过公共属性注入依赖：

```typescript
class UserService {
  public userRepository!: UserRepository;
  public logger!: Logger;
}

// 容器设置属性
const service = new UserService();
service.userRepository = container.resolve(UserRepository);
service.logger = container.resolve(Logger);
```

**优点：**
- 可选依赖更容易处理
- 可以在对象创建后修改依赖

**缺点：**
- 依赖关系不够明显
- 属性可能被意外修改
- 对象可能处于不完整状态

#### 3. 方法注入（Method Injection）

通过方法参数注入依赖：

```typescript
class UserService {
  public processOrder(
    order: Order,
    paymentGateway: IPaymentGateway
  ) {
    return paymentGateway.charge(order.amount);
  }
}
```

**适用场景：**
- 依赖只在特定操作中使用
- 依赖根据上下文变化

**@husky-di/core 的设计选择：**

@husky-di/core 主要支持**构造函数注入**，因为：
1. 依赖关系最清晰
2. 类型安全性最高
3. 符合 TypeScript 最佳实践

对于属性注入和方法注入的场景，可以通过**工厂函数**实现：

```typescript
container.register('userService', {
  useFactory: (container) => {
    const service = new UserService();
    service.userRepository = container.resolve(UserRepository);
    return service;
  }
});
```

---

## 容器架构

### 容器的角色和职责

依赖注入容器是 DI 系统的核心组件，承担以下职责：

```
┌─────────────────────────────────────────────────────────┐
│                    IContainer                           │
├─────────────────────────────────────────────────────────┤
│  注册中心 (Registry)                                    │
│  - 存储服务标识符与创建的映射关系                        │
│  - 支持多种注册方式（类、值、工厂、别名）                 │
│                                                         │
│  解析引擎 (Resolver)                                    │
│  - 根据标识符创建或返回服务实例                          │
│  - 处理依赖链的自动解析                                  │
│  - 管理生命周期缓存                                      │
│                                                         │
│  生命周期管理器 (Lifecycle Manager)                     │
│  - Transient: 每次解析创建新实例                         │
│  - Singleton: 单例缓存                                   │
│  - Resolution: 作用域内单例                              │
│                                                         │
│  中间件系统 (Middleware System)                         │
│  - 拦截解析过程                                          │
│  - 支持日志、监控、缓存等横切关注点                       │
│                                                         │
│  资源管理 (Resource Manager)                            │
│  - 追踪可释放资源                                        │
│  - 统一清理生命周期                                      │
└─────────────────────────────────────────────────────────┘
```

**核心接口设计：**

```typescript
interface IContainer extends IDisposable {
  // 注册服务
  register<T>(id: ServiceIdentifier<T>, registration: RegistrationOptions<T>): void;
  
  // 解析服务
  resolve<T>(id: ServiceIdentifier<T>, options?: ResolveOptions): T;
  
  // 查询服务
  isRegistered<T>(id: ServiceIdentifier<T>, options?: IsRegisteredOptions): boolean;
  
  // 移除服务
  unregister<T>(id: ServiceIdentifier<T>): void;
  
  // 添加中间件
  use(middleware: ResolveMiddleware): void;
  
  // 容器层级
  readonly parent?: IContainer;
}
```

### 服务注册表的工作原理

服务注册表（Registry）是容器内部存储所有服务注册信息的数据结构。

**数据结构：**

```typescript
// src/impls/Registry.ts
class Registry implements IRegistry {
  private readonly _registrationMap = new Map<
    ServiceIdentifier<unknown>,
    Array<IRegistration<unknown>>
  >();
}
```

**设计要点：**

1. **支持多重注册**：同一个标识符可以有多个注册，以数组形式存储

```typescript
container.register('logger', { useClass: ConsoleLogger });
container.register('logger', { useClass: FileLogger });

// 默认返回最后一个（覆盖模式）
const logger = container.resolve('logger'); // FileLogger

// 获取所有实例
const allLoggers = container.resolve('logger', { multiple: true });
// [ConsoleLogger, FileLogger]
```

2. **最后写入优先**：`get()` 方法返回数组最后一个元素

```typescript
// src/impls/Registry.ts:43-48
get<T>(serviceIdentifier: ServiceIdentifier<T>): IRegistration<T> | undefined {
  const registrations = this._registrationMap.get(serviceIdentifier);
  if (registrations && registrations.length > 0) {
    return registrations[registrations.length - 1] as IRegistration<T>;
  }
  return undefined;
}
```

3. **完整 CRUD 操作**：

```typescript
// 添加
set(serviceIdentifier, registration);

// 查询
has(serviceIdentifier);
get(serviceIdentifier);
getAll(serviceIdentifier);

// 删除
remove(serviceIdentifier);
clear();

// 遍历
keys(): ServiceIdentifier[];
```

### 容器层级设计思想

容器层级（Container Hierarchy）允许创建父子容器关系，实现服务的作用域隔离和继承。

**层级结构：**

```
RootContainer (全局服务)
    │
    ├── ChildContainer A (特性 A 的服务)
    │       │
    │       └── GrandchildContainer A-1
    │
    └── ChildContainer B (特性 B 的服务)
```

**解析规则：**

```typescript
// 子容器可以访问父容器的服务
const parent = new Container('Parent');
parent.register('shared', { useClass: SharedService });

const child = new Container('Child', parent);
// 子容器未注册 'shared'，自动向父容器查找
const shared = child.resolve('shared'); // 成功
```

**实现原理：**

```typescript
// src/impls/Container.ts:638-649
private _handleUnregisteredService(...) {
  // 策略 1: 尝试从父容器解析
  const registeredInParent =
    this._parent &&
    !this._parent.disposed &&
    this._parent.isRegistered(serviceIdentifier, { recursive: true });
    
  if (registeredInParent) {
    return this._parent.resolve(serviceIdentifier, resolveOptions);
  }
  // ...其他策略
}
```

**设计考量：**

1. **单向查找**：子容器可以访问父容器，但父容器不能访问子容器
2. **独立注册**：子容器的注册不影响父容器
3. **生命周期独立**：每个容器管理自己的 singleton 缓存
4. **中间件独立**：子容器的中间件不影响父容器（详见中间件章节）

**典型应用场景：**

```typescript
// 应用级容器
const appContainer = new Container('App');
appContainer.register('database', { 
  useClass: Database, 
  lifecycle: LifecycleEnum.singleton 
});
appContainer.register('config', { useValue: appConfig });

// 请求级容器（每个请求一个）
function handleRequest(req: Request) {
  const requestContainer = new Container('Request', appContainer);
  
  // 注册请求特有的服务
  requestContainer.register('currentUser', { 
    useFactory: () => getCurrentUser(req) 
  });
  
  // 可以访问应用级服务（database, config）
  // 也可以访问请求级服务（currentUser）
  const handler = requestContainer.resolve(RequestHandler);
  return handler.handle(req);
}
```

### 父子容器的服务解析规则

服务解析遵循以下规则：

```
1. 检查当前容器的注册表
   │
   ├── 找到 → 使用当前容器的注册
   │
   └── 未找到 → 检查是否有父容器
       │
       ├── 有父容器 → 递归向父容器查找
       │   │
       │   └── 父容器解析（可能继续向上）
       │
       └── 无父容器 → 检查是否是类构造器
           │
           ├── 是类 → 自动实例化（临时 transient）
           │
           └── 不是类 → 检查是否 optional
               │
               ├── optional: true → 返回 defaultValue 或 undefined
               │
               └── optional: false → 抛出异常
```

**自动类实例化：**

```typescript
// src/impls/Container.ts:651-662
if (typeof serviceIdentifier === "function") {
  return this._resolveInternal({
    container: this,
    serviceIdentifier,
    resolveOptions,
    registration: new Registration({
      lifecycle: LifecycleEnum.transient,
      useClass: serviceIdentifier as Constructor<T>,
    }),
    resolveContext,
    resolveRecord,
  });
}
```

这个特性允许直接解析未注册的类：

```typescript
class MyService {
  constructor(private logger: Logger) {}
}

// 即使没有显式注册，也能解析（前提是依赖已注册）
const service = container.resolve(MyService);
```

---

## 生命周期详解

生命周期（Lifecycle）决定服务实例的创建时机和复用策略。@husky-di/core 支持三种生命周期：

```typescript
enum LifecycleEnum {
  transient = 0,    // 瞬态：每次解析都创建新实例
  singleton = 1,    // 单例：容器生命周期内只创建一次
  resolution = 2,   // 作用域：解析上下文内只创建一次
}
```

### Transient（瞬态）生命周期的内部机制

**行为：** 每次解析都创建新实例，不进行任何缓存。

```typescript
container.register('logger', { 
  useClass: Logger, 
  lifecycle: LifecycleEnum.transient // 默认值，可省略
});

const logger1 = container.resolve('logger');
const logger2 = container.resolve('logger');
logger1 === logger2; // false
```

**内部实现：**

```typescript
// src/impls/Container.ts:434-465
private _resolveInternal<T, O extends ResolveOptions<T>>(
  params: ResolveMiddlewareParams<T, O>
): T | Ref<T> {
  const { registration, resolveContext } = params;

  // 检查 singleton 缓存 - transient 不满足条件
  const isSingleton = registration.lifecycle === LifecycleEnum.singleton;
  if (isSingleton) { ... }

  // 检查 resolution 缓存 - transient 不满足条件
  const isResolution = registration.lifecycle === LifecycleEnum.resolution;
  if (isResolution) { ... }

  // 直接执行中间件链创建新实例
  const instance = this._resolveMiddlewareChain.execute(params);

  // transient 不缓存，直接返回
  return instance;
}
```

**内存图：**

```
resolve('logger')        resolve('logger')
    │                        │
    ▼                        ▼
┌─────────┐              ┌─────────┐
│ Logger  │              │ Logger  │
│ Instance│              │ Instance│
│   #1    │              │   #2    │
└─────────┘              └─────────┘
   (新创建)                 (新创建)
```

**适用场景：**
- 无状态服务
- 轻量级对象
- 需要隔离状态的场景（如每次请求的上下文）

### Singleton（单例）生命周期的内部机制

**行为：** 容器生命周期内只创建一次，后续解析返回同一实例。

```typescript
container.register('database', { 
  useClass: Database, 
  lifecycle: LifecycleEnum.singleton 
});

const db1 = container.resolve('database');
const db2 = container.resolve('database');
db1 === db2; // true
```

**内部实现：**

```typescript
// src/impls/Container.ts:441-446
const isSingleton = registration.lifecycle === LifecycleEnum.singleton;
if (isSingleton) {
  if (registration.resolved) {
    return registration.instance as T; // 返回缓存实例
  }
}

// ...创建实例...

// 缓存实例
if (isSingleton) {
  (registration as IInternalRegistration<T>)._internalSetInstance(instance);
  (registration as IInternalRegistration<T>)._internalSetResolved(true);
}
```

**内存图：**

```
resolve('database')       resolve('database')
    │                         │
    ▼                         │
┌─────────┐                  │
│Database │ ◄─────────────────┘
│ Instance│    (返回缓存)
│   #1    │
└─────────┘
   (首次创建并缓存)
```

**Registration 状态：**

```typescript
interface IRegistration<T> {
  readonly instance: T | undefined;  // 缓存的实例
  readonly resolved: boolean;         // 是否已解析过
}
```

**适用场景：**
- 数据库连接
- 配置文件读取器
- 日志写入器
- 任何需要全局共享状态的服务

**注意事项：**

1. **容器绑定**：单例是相对于容器的，每个容器有自己的单例缓存

```typescript
const parent = new Container('Parent');
parent.register('service', { 
  useClass: Service, 
  lifecycle: LifecycleEnum.singleton 
});

const child = new Container('Child', parent);

// 父容器有自己的单例
const parentService = parent.resolve('service');

// 子容器会向父容器查找，返回父容器的单例
const childService = child.resolve('service');

parentService === childService; // true (来自父容器)
```

2. **子容器覆盖**：子容器可以注册同名服务覆盖父容器

```typescript
child.register('service', { 
  useClass: ChildService, 
  lifecycle: LifecycleEnum.singleton 
});

// 现在子容器有自己的单例
const childService = child.resolve('service');
parentService === childService; // false
```

### Resolution（作用域）生命周期的内部机制

**行为：** 在单个解析上下文（Resolution Context）内只创建一次，跨解析上下文会创建新实例。

**什么是解析上下文？**

解析上下文是容器在执行一次完整解析树时创建的临时 Map，用于追踪作用域服务的实例。

```typescript
// 解析开始 → 创建新上下文
//   resolve(ServiceA)
//     → resolve(ServiceB)  // 同一个上下文
//     → resolve(ServiceB)  // 同一个上下文，返回缓存
// 解析结束 → 上下文销毁

// 下次解析 → 创建新上下文
//   resolve(ServiceA)
//     → resolve(ServiceB)  // 新上下文，创建新实例
```

**内部实现：**

```typescript
// src/impls/Container.ts:448-454
const isResolution = registration.lifecycle === LifecycleEnum.resolution;
if (isResolution) {
  if (resolveContext.has(registration)) {
    return resolveContext.get(registration) as T; // 返回上下文缓存
  }
}

// ...创建实例...

// 缓存到解析上下文
if (isResolution) {
  resolveContext.set(registration, instance);
}
```

**解析上下文获取：**

```typescript
// src/impls/Container.ts:689-695
private _getResolveContext(): ResolveContext {
  if (!this._resolveContextRef.current) {
    this._resolveContextRef.current = new Map();
  }
  return this._resolveContextRef.current;
}
```

**内存图：**

```
第一次解析树                     第二次解析树
┌─────────────────┐            ┌─────────────────┐
│ ResolutionCtx 1 │            │ ResolutionCtx 2 │
├─────────────────┤            ├─────────────────┤
│ registration →  │            │ registration →  │
│    Instance #1  │            │    Instance #2  │
└─────────────────┘            └─────────────────┘
     (销毁)                          (销毁)
```

**示例场景：**

```typescript
// 数据库会话服务 - 在一次请求中应该共享同一个会话
container.register('dbSession', {
  useClass: DatabaseSession,
  lifecycle: LifecycleEnum.resolution
});

class UserRepository {
  constructor(private session: DatabaseSession) {}
}

class OrderRepository {
  constructor(private session: DatabaseSession) {}
}

class UserService {
  constructor(
    private userRepo: UserRepository,
    private orderRepo: OrderRepository
  ) {}
  // UserRepository 和 OrderRepository 共享同一个 DatabaseSession
}

// 每次请求创建新容器或手动管理上下文
const userService = container.resolve(UserService);
// session1 = userService.userRepo.session
// session2 = userService.orderRepo.session
// session1 === session2 同一解析树内共享
```

**适用场景：**
- 数据库会话/工作单元（Unit of Work）
- HTTP 请求上下文
- 事务边界内的共享状态
- 需要在依赖树中共享但不全局共享的服务

### 三种生命周期的性能对比

| 特性 | Transient | Singleton | Resolution |
|------|-----------|-----------|------------|
| 实例创建频率 | 每次解析 | 首次解析 | 每个解析上下文 |
| 内存占用 | 高（多实例） | 低（单实例） | 中（上下文内单例） |
| GC 压力 | 高 | 无 | 中 |
| 线程安全 | 天然安全 | 需考虑并发 | 上下文隔离 |
| 状态隔离 | 完全隔离 | 全局共享 | 上下文内共享 |

**基准测试示意：**

```typescript
// 10000 次解析
console.time('transient');
for (let i = 0; i < 10000; i++) {
  container.resolve('transient-service');
}
console.timeEnd('transient'); // ~50ms (每次都创建)

console.time('singleton');
for (let i = 0; i < 10000; i++) {
  container.resolve('singleton-service');
}
console.timeEnd('singleton'); // ~5ms (缓存命中)

console.time('resolution');
for (let i = 0; i < 100; i++) {
  container.resolve('resolution-service'); // 100 个解析上下文
}
console.timeEnd('resolution'); // ~15ms
```

### 如何选择合适的生命周期

**决策树：**

```
需要全局共享状态吗？
│
├── 是 → Singleton
│       (数据库连接、配置、日志器)
│
└── 否 → 需要在依赖树中共享吗？
        │
        ├── 是 → Resolution
        │       (会话、工作单元、请求上下文)
        │
        └── 否 → Transient
                (无状态服务、轻量对象、需要隔离的场景)
```

**实际案例：**

```typescript
// 应用启动时配置
container.register('config', {
  useValue: loadConfig(),
  lifecycle: LifecycleEnum.singleton
});

// 全局数据库连接池
container.register('dbPool', {
  useClass: DatabasePool,
  lifecycle: LifecycleEnum.singleton
});

// 每次请求的数据库会话
container.register('dbSession', {
  useFactory: (container) => {
    const pool = container.resolve('dbPool');
    return pool.createSession();
  },
  lifecycle: LifecycleEnum.resolution
});

// 无状态的业务服务
container.register('userService', {
  useClass: UserService,
  lifecycle: LifecycleEnum.transient // 或省略
});

// 需要隔离的上下文对象
container.register('requestContext', {
  useClass: RequestContext,
  lifecycle: LifecycleEnum.transient
});
```

---

## 中间件系统

### 中间件的设计思想（洋葱模型）

中间件（Middleware）是一种拦截和扩展解析过程的机制，采用**洋葱模型**（Onion Model）设计。

**洋葱模型图解：**

```
        请求进入
           │
           ▼
    ┌──────────────┐
    │  Middleware 1│ ← 最外层（最先执行）
    │  ┌────────┐  │
    │  │   2    │  │
    │  │  ┌───┐ │  │
    │  │  │ 3 │ │  │ ← 最内层（最后执行）
    │  │  │ ┌─┴─┴─┴──► 核心解析逻辑
    │  │  │ │ ◄─────── 返回结果
    │  │  └───┘ │  │
    │  └────────┘  │
    └──────────────┘
           │
           ▼
       结果返回
```

**中间件结构：**

```typescript
type ResolveMiddleware<T, O> = {
  name?: string;
  executor: (
    params: ResolveMiddlewareParams<T, O>,
    next: () => T
  ) => T;
  onContainerDispose?: (container: IContainer) => void;
};
```

**中间件执行示例：**

```typescript
const loggingMiddleware = {
  name: 'logging',
  executor: (params, next) => {
    console.log(`解析开始：${params.serviceIdentifier}`);
    const start = Date.now();
    
    try {
      const result = next(); // 调用下一个中间件
      console.log(`解析完成：${Date.now() - start}ms`);
      return result;
    } catch (error) {
      console.error(`解析失败：${error}`);
      throw error;
    }
  }
};

container.use(loggingMiddleware);
```

### 中间件的执行顺序（LIFO 原则）

中间件按照**后进先出**（LIFO - Last In, First Out）的顺序执行。

**注册顺序 vs 执行顺序：**

```typescript
// 注册顺序
container.use(middlewareA); // 先注册
container.use(middlewareB);
container.use(middlewareC); // 后注册

// 执行顺序（C → B → A → Core）
C.executor(params, () => 
  B.executor(params, () => 
    A.executor(params, () => 
      coreResolution() // 核心解析逻辑
    )
  )
)
```

**可视化执行流：**

```
执行流（请求）：          返回流（结果）：
    │                        ▲
    ▼                        │
┌─────────┐                  │
│   C     │ ◄── 最后注册     │
│  (先)   │                  │
└────┬────┘                  │
     ▼                       │
┌─────────┐                  │
│   B     │                  │
└────┬────┘                  │
     ▼                       │
┌─────────┐                  │
│   A     │ ◄── 最先注册     │
│  (后)   │                  │
└────┬────┘                  │
     ▼                       │
┌─────────┐                  │
│  Core   │ ────────────────┘
└─────────┘
```

**为什么选择 LIFO？**

1. **后来者优先**：后注册的中间件可以完全控制先注册的中间件
2. **测试友好**：测试时可以后注册 mock 中间件覆盖全局行为
3. **符合直觉**：类似事件冒泡，外层先处理

**示例：权限控制中间件：**

```typescript
// 全局日志中间件（先注册）
const loggingMiddleware = {
  name: 'logging',
  executor: (params, next) => {
    console.log('Log:', params.serviceIdentifier);
    return next();
  }
};

// 容器级权限中间件（后注册，先执行）
const authMiddleware = {
  name: 'auth',
  executor: (params, next) => {
    if (!hasPermission(params.serviceIdentifier)) {
      throw new Error('无权访问');
    }
    return next(); // 只有权限检查通过才继续
  }
};

globalMiddleware.use(loggingMiddleware);
container.use(authMiddleware);

// 执行：auth → logging → core
// 如果 auth 失败，logging 和 core 都不会执行
```

### 全局中间件 vs 本地中间件

**全局中间件：**

```typescript
import { globalMiddleware } from '@husky-di/core';

// 影响所有容器
globalMiddleware.use({
  name: 'global-logger',
  executor: (params, next) => {
    console.log('[Global]', params.serviceIdentifier);
    return next();
  }
});
```

**本地中间件：**

```typescript
// 只影响当前容器
container.use({
  name: 'local-cache',
  executor: (params, next) => {
    const cached = cache.get(params.serviceIdentifier);
    if (cached) return cached;
    const result = next();
    cache.set(params.serviceIdentifier, result);
    return result;
  }
});
```

**组合策略：本地包裹全局**

```
执行顺序：本地中间件 → 全局中间件 → 核心解析

┌─────────────────────────────────────────┐
│ Local Middleware (容器特定)              │
│   ┌─────────────────────────────────┐   │
│   │ Global Middleware (应用全局)     │   │
│   │   ┌─────────────────────────┐   │   │
│   │   │   Core Resolution       │   │   │
│   │   └─────────────────────────┘   │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**实现原理：**

```typescript
// src/impls/MiddlewareChain.ts:182-197
buildMiddlewareExecutor(): MiddlewareExecutor<Params, Result> {
  // 合并全局和本地中间件数组
  return [...this._globalMiddleware.middlewares, ...this.middlewares].reduce(
    (next, middleware) => {
      return (params: Params) => {
        this.emit("before", middleware, params);
        try {
          const result = middleware.executor(params, next);
          this.emit("after", middleware, params, result);
          return result;
        } catch (error: unknown) {
          this.emit("error", middleware, params, error);
          throw error;
        }
      };
    },
    this._defaultMiddlewareExecutor // 核心解析函数
  );
}
```

**关键特性：**

1. **中间件独立于容器层级**：父子容器的中间件链是独立的

```typescript
const parent = new Container('Parent');
parent.use({ name: 'parent-mw', executor: ... });

const child = new Container('Child', parent);
child.use({ name: 'child-mw', executor: ... });

// child 的中间件链：child-mw → global → core
// parent 的中间件链：parent-mw → global → core
// 父子中间件不会互相影响
```

2. **本地中间件可以短路全局中间件**

```typescript
// 测试时覆盖全局行为
const mockMiddleware = {
  name: 'mock',
  executor: (params) => mockServices.get(params.serviceIdentifier)
  // 不调用 next()，直接返回 mock，跳过后续所有中间件
};
testContainer.use(mockMiddleware);
```

### 中间件的典型应用场景

#### 1. 日志和监控

```typescript
const metricsMiddleware = {
  name: 'metrics',
  executor: (params, next) => {
    const start = performance.now();
    try {
      const result = next();
      metrics.histogram('resolve_duration', performance.now() - start);
      metrics.counter('resolve_success', { service: params.serviceIdentifier });
      return result;
    } catch (error) {
      metrics.counter('resolve_error', { service: params.serviceIdentifier });
      throw error;
    }
  }
};
```

#### 2. 缓存

```typescript
const cacheMiddleware = {
  name: 'cache',
  executor: (params, next) => {
    // 只对特定服务缓存
    if (!shouldCache(params.serviceIdentifier)) {
      return next();
    }
    
    const cacheKey = getCacheKey(params);
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const result = next();
    cache.set(cacheKey, result);
    return result;
  }
};
```

#### 3. 依赖验证

```typescript
const validationMiddleware = {
  name: 'validation',
  executor: (params, next) => {
    const result = next();
    
    // 验证解析结果
    if (result === null || result === undefined) {
      throw new Error(
        `Service ${params.serviceIdentifier} resolved to null/undefined`
      );
    }
    
    return result;
  }
};
```

#### 4. 依赖图分析

```typescript
const graphMiddleware = {
  name: 'dependency-graph',
  executor: (params, next) => {
    dependencyGraph.addEdge(
      params.currentResolvingService,
      params.serviceIdentifier
    );
    return next();
  }
};
```

#### 5. 资源清理

```typescript
const cleanupMiddleware = {
  name: 'cleanup',
  executor: (params, next) => {
    const result = next();
    
    // 注册清理回调
    if (isDisposable(result)) {
      params.container.addDisposable(result);
    }
    
    return result;
  },
  onContainerDispose: (container) => {
    // 容器销毁时的清理逻辑
    console.log(`Cleaning up resources for ${container.name}`);
  }
};
```

### 中间件执行流程图

```
┌──────────────────────────────────────────────────────────────────┐
│                     resolve(serviceId)                           │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Container.resolve()                            │
│  - 创建/获取 ResolveRecord                                       │
│  - 创建/获取 ResolveContext                                      │
│  - 检查循环依赖                                                  │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│              MiddlewareChain.execute(params)                     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Local Middleware N (最后注册)                               │  │
│  │   executor(params, () => {                                  │  │
│  │     ┌────────────────────────────────────────────────────┐  │  │
│  │     │ Local Middleware 1 (最先注册)                       │  │  │
│  │     │   executor(params, () => {                          │  │  │
│  │     │     ┌────────────────────────────────────────────┐  │  │  │
│  │     │     │ Global Middleware N                         │  │  │  │
│  │     │     │   executor(params, () => {                  │  │  │  │
│  │     │     │     ┌────────────────────────────────────┐  │  │  │  │
│  │     │     │     │ Global Middleware 1                 │  │  │  │  │
│  │     │     │     │   executor(params, () => {          │  │  │  │  │
│  │     │     │     │       ▼                             │  │  │  │  │
│  │     │     │     │  ┌──────────────────────────────┐   │  │  │  │  │
│  │     │     │     │  │  Default Executor            │   │  │  │  │  │
│  │     │     │     │  │  _resolveRegistration()      │   │  │  │  │  │
│  │     │     │     │  │  - Class → new Provider()    │   │  │  │  │  │
│  │     │     │     │  │  - Factory → Provider()      │   │  │  │  │  │
│  │     │     │     │  │  - Value → return Value      │   │  │  │  │  │
│  │     │     │     │  │  - Alias → resolve(target)   │   │  │  │  │  │
│  │     │     │     │  └──────────────────────────────┘   │  │  │  │  │
│  │     │     │     │       ▲                             │  │  │  │  │
│  │     │     │     └────────────────────────────────────┘  │  │  │  │
│  │     │     └─────────────────────────────────────────────┘  │  │  │
│  │     └───────────────────────────────────────────────────────┘  │
│  └────────────────────────────────────────────────────────────────┘
│                                 │
│                                 ▼
│                         return Result
└─────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    生命周期缓存处理                               │
│  - Singleton → registration.instance = result                    │
│  - Resolution → resolveContext.set(registration, result)         │
│  - Transient → 无缓存                                            │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
                         返回解析结果
```

---

## 依赖解析机制

### 自动依赖注入的原理

@husky-di/core 支持自动依赖注入：当解析一个类时，容器会自动解析并注入其构造函数依赖。

**示例：**

```typescript
class Logger {}

class UserRepository {
  constructor(private logger: Logger) {}
}

class UserService {
  constructor(
    private repo: UserRepository,
    private logger: Logger
  ) {}
}

// 只需注册顶层类，依赖自动解析
container.register('userService', { useClass: UserService });

const service = container.resolve('userService');
// 内部自动：
// 1. 创建 UserService 实例
// 2. 发现依赖 UserRepository，解析并注入
// 3. 发现依赖 Logger，解析并注入
```

**实现原理：**

```typescript
// src/impls/Container.ts:491-494
case RegistrationTypeEnum.class: {
  const provider = registration.provider as Constructor<T>;
  return new provider(); // TypeScript 会在编译时注入依赖
}
```

**注意：** @husky-di/core 使用 TypeScript 的元数据反射或构造函数参数类型推断来实现自动注入。具体实现取决于项目的配置。

### 循环依赖检测算法

循环依赖是 DI 系统中常见的问题：

```typescript
class ServiceA {
  constructor(private b: ServiceB) {} // A 依赖 B
}

class ServiceB {
  constructor(private a: ServiceA) {} // B 依赖 A → 循环！
}
```

**检测算法：**

```typescript
// src/impls/ResolveRecord.ts:107-131
getCycleNodeInfo(): undefined | CycleNodeInfo {
  const lastRecordNode = this._current;
  if (!isResolveServiceIdentifierRecord(lastRecordNode.value))
    return undefined;

  let tempRecordNode = lastRecordNode;
  
  // 向上遍历解析树，查找是否出现相同的标识符
  while (tempRecordNode.parent) {
    tempRecordNode = tempRecordNode.parent;

    if (!isResolveServiceIdentifierRecord(tempRecordNode.value)) 
      continue;

    const { dynamic, ref } = tempRecordNode.value.resolveOptions;
    // ref 和 dynamic 选项会打破循环
    if (dynamic || ref) {
      break;
    }

    const isEqual = isEqualServiceIdentifierResolveRecord(
      tempRecordNode.value,
      lastRecordNode.value,
    );

    if (isEqual) {
      return { cycleNode: tempRecordNode };
    }
  }
}
```

**解析树遍历：**

```
解析 UserService
    │
    ├─→ 解析 UserRepository
    │       │
    │       └─→ 解析 Logger 成功
    │
    └─→ 解析 OrderService
            │
            └─→ 解析 UserService ← 检测到循环！
                  (已在解析路径中出现)
```

**错误报告：**

```typescript
const cycleNodeInfo = resolveRecord.getCycleNodeInfo();
if (cycleNodeInfo) {
  throw new ResolveException(
    `Circular dependency detected for service identifier "${serviceId}". ` +
    `To resolve this, use either the "ref" option or the "dynamic" option.`,
    resolveRecord, // 包含完整的解析路径
  );
}
```

### 如何解决循环依赖（ref 和 dynamic 选项）

**方法 1：使用 ref 选项（延迟解析）**

```typescript
class ServiceA {
  private serviceB!: ServiceB;
  
  constructor() {
    // 使用 ref 延迟解析，避免构造时的循环
    const bRef = container.resolve(ServiceB, { ref: true });
    // 稍后访问时才真正解析
    this.serviceB = bRef.current;
  }
}
```

**ref 的工作原理：**

```typescript
// src/impls/Container.ts:575-598
private _createRefInstance(...) {
  const instance = new InstanceRef(() => {
    // 延迟执行真正的解析
    return this.resolve(serviceIdentifier, {
      ...resolveOptions,
      ref: false, // 防止无限递归
    }) as T;
  });
  return instance;
}
```

**方法 2：使用 dynamic 选项（每次访问都重新解析）**

```typescript
class ServiceA {
  constructor(private container: IContainer) {}
  
  doSomething() {
    // 每次访问都重新解析 ServiceB
    const bRef = this.container.resolve(ServiceB, { dynamic: true });
    bRef.current.doWork();
  }
}
```

**ref vs dynamic：**

| 特性 | ref | dynamic |
|------|-----|---------|
| 解析时机 | 首次访问 `current` 时 | 每次访问 `current` 时 |
| 缓存 | 缓存首次解析结果 | 不缓存 |
| 适用场景 | 打破构造时循环 | 需要最新实例 |

**推荐做法：**

```typescript
// 推荐：使用 setter 或初始化方法
class ServiceA {
  private serviceB!: ServiceB;
  
  init(bRef: Ref<ServiceB>) {
    this.serviceB = bRef.current;
  }
}

// 或使用 factory
container.register('serviceA', {
  useFactory: (container) => {
    const a = new ServiceA();
    const bRef = container.resolve(ServiceB, { ref: true });
    a.init(bRef);
    return a;
  }
});
```

### 解析记录树（ResolveRecord）的作用

解析记录树（ResolveRecord）是一个树形数据结构，用于追踪整个解析过程。

**数据结构：**

```typescript
interface ResolveRecordTreeNode<T> {
  id: string;
  value: ResolveRecordData<T>;
  children: Array<ResolveRecordTreeNode<unknown>>;
  parent?: ResolveRecordTreeNode<unknown>;
}

type ResolveRecordData<T> = 
  | { type: 'root'; container: IContainer }
  | { 
      type: 'serviceIdentifier'; 
      serviceIdentifier: ServiceIdentifier<T>;
      container: IContainer;
      resolveOptions: ResolveOptions<T>;
    }
  | { type: 'message'; message: string };
```

**树结构示例：**

```
root
├── UserService
│   ├── UserRepository
│   │   └── Logger
│   └── OrderService
│       └── ProductService
└── message: "解析完成"
```

**作用：**

1. **循环依赖检测**：通过遍历树检测相同标识符

2. **错误诊断**：提供完整的解析路径

```typescript
try {
  container.resolve(ServiceA);
} catch (error) {
  if (error instanceof ResolveException) {
    console.log(error.record.root); // 完整的解析树
    console.log(error.record.getPaths()); // 从根到当前的路径
  }
}
```

3. **依赖图生成**：可以用于可视化依赖关系

**实现细节：**

```typescript
// src/impls/ResolveRecord.ts:87-97
addRecordNode(node: ResolveRecordData<unknown>): void {
  const current = {
    id: this._generateTreeNodeId(),
    value: node,
    children: [],
    parent: this._current,
  };
  this._current.children.push(current);
  this._current = current; // 移动到新的当前节点
}
```

---

## 高级主题

### 服务标识符的设计哲学

服务标识符（Service Identifier）是 DI 容器中用于查找服务的"键"。

**支持的标识符类型：**

```typescript
type ServiceIdentifier<T> =
  | Constructor<T>        // 类构造器
  | AbstractConstructor<T> // 抽象类构造器
  | string                // 字符串
  | symbol;               // 符号
```

**设计考量：**

1. **类构造器（推荐）**：类型安全，IDE 支持最好

```typescript
container.register(UserService, { useClass: UserService });
const service = container.resolve(UserService); // 类型推断为 UserService
```

2. **字符串**：灵活但容易拼写错误

```typescript
container.register('userService', { useClass: UserService });
const service = container.resolve('userService'); // any 类型
```

3. **Symbol**：避免命名冲突

```typescript
const UserServiceToken = Symbol('UserService');
container.register(UserServiceToken, { useClass: UserService });
```

**命名约定：**

```typescript
// src/utils/service-identifier.utils.ts
function getServiceIdentifierName(id: ServiceIdentifier<unknown>): string {
  if (typeof id === 'string') return id;
  if (typeof id === 'symbol') return id.toString();
  return id.name || 'Anonymous';
}
```

### 为什么支持多种注册方式？

@husky-di/core 支持四种注册方式，每种解决不同的场景：

**1. useClass：标准类实例化**

```typescript
container.register('logger', { useClass: Logger });
// → new Logger()
```

**适用场景：** 标准的类，依赖通过构造函数注入

**2. useValue：预创建的值**

```typescript
const config = { apiUrl: '...', timeout: 5000 };
container.register('config', { useValue: config });
// → 直接返回 config
```

**适用场景：** 
- 配置对象
- 常量值
- 已经实例化的对象

**3. useFactory：工厂函数**

```typescript
container.register('database', {
  useFactory: (container) => {
    const config = container.resolve('config');
    return new Database(config.connectionString);
  }
});
```

**适用场景：**
- 需要参数化的构造函数
- 异步初始化的包装
- 条件创建实例
- 解决循环依赖

**4. useAlias：别名重定向**

```typescript
container.register('logger', { useClass: ConsoleLogger });
container.register('ILogger', { useAlias: 'logger' });

const logger = container.resolve('ILogger'); // 实际返回 ConsoleLogger
```

**适用场景：**
- 接口到实现的映射
- 向后兼容的标识符
- 多标识符指向同一服务

**设计哲学：**

多种注册方式提供了**灵活性**和**表达力**的平衡：
- `useClass`：声明式，简洁
- `useValue`：直接，无开销
- `useFactory`：灵活，可编程
- `useAlias`：间接，解耦

### 容器处置（Dispose）的设计考量

容器处置（Dispose）机制确保资源正确清理。

**处置流程：**

```typescript
// src/impls/DisposableRegistry.ts
class DisposableRegistry implements IDisposable {
  private _disposed = false;
  private _cleanupCallbacks: Array<() => void> = [];

  dispose(): void {
    if (this._disposed) return; // 幂等性
    this._disposed = true;
    
    // 倒序执行清理回调
    for (let i = this._cleanupCallbacks.length - 1; i >= 0; i--) {
      this._cleanupCallbacks[i]();
    }
  }
}
```

**Container 的清理逻辑：**

```typescript
// src/impls/Container.ts:145-158
this.addCleanup(() => {
  // 通知中间件容器即将销毁
  for (const middleware of [
    ...globalMiddleware.middlewares,
    ...this._resolveMiddlewareChain.middlewares,
  ]) {
    try {
      middleware.onContainerDispose?.(this);
    } catch {
      // 忽略清理错误
    }
  }
});

this.addCleanup(() => {
  // 清空注册表
  this._registry.clear();
});
```

**设计考量：**

1. **幂等性**：多次调用 `dispose()` 安全

```typescript
container.dispose();
container.dispose(); // 不会报错
```

2. **非级联**：销毁父容器不销毁子容器

```typescript
parent.dispose();
// child 仍然可用（除非依赖父容器的服务）
```

3. **操作保护**：销毁后拒绝新操作

```typescript
// src/utils/disposable.utils.ts
function createAssertNotDisposed(type: string) {
  return (obj: { disposed: boolean }) => {
    if (obj.disposed) {
      throw new Error(`Cannot operate on a disposed ${type}`);
    }
  };
}

// 在每个方法开头调用
public resolve<T>(...) {
  assertNotDisposed(this); // 检查是否已销毁
  // ...
}
```

4. **中间件清理钩子**：允许中间件清理资源

```typescript
const cacheMiddleware = {
  executor: (params, next) => next(),
  onContainerDispose: (container) => {
    cache.clear(); // 清理缓存
  }
};
```

### 类型安全与灵活性的平衡

TypeScript DI 容器面临的核心挑战：**如何在保持类型安全的同时提供足够的灵活性？**

**类型安全的优势：**

```typescript
// 编译时检查
container.register(UserService, { useClass: UserService });

// 自动类型推断
const service = container.resolve(UserService); // 类型：UserService
service.getUser(1); // IDE 自动补全
```

**灵活性的需求：**

```typescript
// 运行时动态解析
const serviceName = getConfig().serviceName;
const service = container.resolve(serviceName as any);
```

**@husky-di/core 的平衡策略：**

1. **泛型解析方法**

```typescript
resolve<T>(id: ServiceIdentifier<T>): T;
// T 可以从 id 推断，也可以显式指定
```

2. **可选的默认值**

```typescript
resolve<T>(id: string, options: { 
  optional: true; 
  defaultValue: T 
}): T;
```

3. **Ref 类型包装**

```typescript
resolve<T>(id: ServiceIdentifier<T>, options: { 
  ref: true 
}): Ref<T>;
```

---

## createServiceIdentifier 设计思想

### 问题场景：接口无法作为运行时标识符

在 TypeScript 中开发依赖注入系统时，一个核心挑战是：**TypeScript 接口在编译后不存在**。

考虑以下场景：

```typescript
// 定义接口
interface ILogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// 实现类
class ConsoleLogger implements ILogger {
  log(message: string) { console.log(message); }
  warn(message: string) { console.warn(message); }
  error(message: string) { console.error(message); }
}

// 错误：尝试用接口作为服务标识符
container.register(ILogger, { useClass: ConsoleLogger });
```

这段代码在运行时会失败，因为 `ILogger` 作为接口在编译后的 JavaScript 中不存在：

```javascript
// 编译后的代码（接口被擦除）
"use strict";
class ConsoleLogger {
  log(message) { console.log(message); }
  warn(message) { console.warn(message); }
  error(message) { console.error(message); }
}
// ILogger 不存在！
```

### 解决方案：createServiceIdentifier

`createServiceIdentifier` 函数创建一个**运行时存在**的标识符，同时**携带类型信息**。

**工作原理：**

```typescript
function createServiceIdentifier<T>(id: string | symbol): ServiceIdentifier<T> {
  return id as ServiceIdentifier<T>;
}
```

这个函数本质上是类型转换，但它解决了核心问题：

```typescript
// 正确：创建运行时存在的标识符
const ILogger = createServiceIdentifier<ILogger>('ILogger');

// 编译后的 JavaScript
const ILogger = 'ILogger'; // 字符串在运行时存在！

// 现在可以正常使用
container.register(ILogger, { useClass: ConsoleLogger });
const logger = container.resolve(ILogger); // 类型：ILogger
```

### 设计思想：依赖倒置原则（DIP）

`createServiceIdentifier` 的核心设计思想是实现**依赖倒置原则**（Dependency Inversion Principle, DIP）。

**DIP 的两个要点：**

1. 高层模块不应该依赖低层模块，两者都应该依赖抽象
2. 抽象不应该依赖细节，细节应该依赖抽象

**没有抽象层的问题：**

```typescript
// 直接依赖具体实现
class EmailService {
  constructor(private smtpClient: SMTPClient) {} // 依赖具体类
}

// 如果想换成 HTTP 发送邮件，需要修改 EmailService
```

**使用 createServiceIdentifier 创建抽象层：**

```typescript
// 1. 定义接口（抽象）
interface IMailClient {
  send(to: string, subject: string, body: string): Promise<void>;
}

// 2. 创建标识符（抽象的运行时代表）
const IMailClient = createServiceIdentifier<IMailClient>('IMailClient');

// 3. 实现类（细节）
class SMTPClient implements IMailClient {
  send(to: string, subject: string, body: string): Promise<void> {
    // SMTP 实现
  }
}

class HTTPMailClient implements IMailClient {
  send(to: string, subject: string, body: string): Promise<void> {
    // HTTP API 实现
  }
}

// 4. 高层模块依赖抽象
class EmailService {
  constructor(
    @inject(IMailClient) private mailClient: IMailClient // 依赖抽象
  ) {}
  
  async sendWelcomeEmail(to: string) {
    await this.mailClient.send(to, 'Welcome!', '...');
  }
}

// 5. 注册时决定使用哪个实现
container.register(IMailClient, { useClass: SMTPClient });
// 或
container.register(IMailClient, { useClass: HTTPMailClient });

// EmailService 不需要修改！
```

### 为什么不用 Symbol？

TypeScript 的 `Symbol` 也可以作为服务标识符，但 `createServiceIdentifier` 提供了更好的体验。

**Symbol 的问题：**

```typescript
// 使用 Symbol
const ILogger = Symbol('ILogger');
container.register(ILogger, { useClass: ConsoleLogger });

// 错误信息难以理解
// Error: Cannot resolve Symbol(ILogger)
```

**createServiceIdentifier 的优势：**

```typescript
// 使用字符串标识符
const ILogger = createServiceIdentifier<ILogger>('ILogger');

// 错误信息清晰
// Error: Cannot resolve ILogger
```

**调试对比：**

```typescript
// 查看标识符
console.log(Symbol('ILogger')); 
// 输出：Symbol(ILogger) - 无法直接获取字符串

console.log(createServiceIdentifier<ILogger>('ILogger'));
// 输出：'ILogger' - 清晰的字符串
```

**序列化友好：**

```typescript
// Symbol 无法序列化
JSON.stringify({ logger: Symbol('ILogger') }); 
// 输出：{} - Symbol 被忽略

// 字符串可以序列化
JSON.stringify({ logger: 'ILogger' });
// 输出：{"logger":"ILogger"}
```

### 完整使用流程

```typescript
import { 
  createContainer, 
  createServiceIdentifier, 
  LifecycleEnum,
  inject 
} from '@husky-di/core';

// ─────────────────────────────────────────────────────────────
// 步骤 1: 定义接口（编译时存在，运行时不存在）
// ─────────────────────────────────────────────────────────────
interface ConfigService {
  get(key: string): string;
  has(key: string): boolean;
}

// ─────────────────────────────────────────────────────────────
// 步骤 2: 创建标识符（运行时存在，携带类型信息）
// ─────────────────────────────────────────────────────────────
const IConfigService = createServiceIdentifier<ConfigService>('IConfigService');

// ─────────────────────────────────────────────────────────────
// 步骤 3: 实现接口（具体细节）
// ─────────────────────────────────────────────────────────────
class EnvConfigService implements ConfigService {
  get(key: string): string {
    return process.env[key] || '';
  }
  
  has(key: string): boolean {
    return key in process.env;
  }
}

// ─────────────────────────────────────────────────────────────
// 步骤 4: 注册服务（标识符与实现分离）
// ─────────────────────────────────────────────────────────────
const container = createContainer('AppContainer');

container.register(IConfigService, {
  useClass: EnvConfigService,
  lifecycle: LifecycleEnum.singleton,
});

// ─────────────────────────────────────────────────────────────
// 步骤 5: 使用服务（依赖抽象）
// ─────────────────────────────────────────────────────────────
class DatabaseService {
  constructor(
    @inject(IConfigService) 
    private config: ConfigService // 类型安全
  ) {}
  
  connect() {
    const connectionString = this.config.get('DATABASE_URL');
    // ...
  }
}

// ─────────────────────────────────────────────────────────────
// 步骤 6: 解析服务
// ─────────────────────────────────────────────────────────────
const dbService = container.resolve(DatabaseService);
// config 自动注入，类型为 ConfigService
```

### 高级用法：多实现切换

`createServiceIdentifier` 使得切换实现变得容易：

```typescript
// 定义抽象
const ICache = createServiceIdentifier<ICache>('ICache');

// 开发环境使用内存缓存
if (process.env.NODE_ENV === 'development') {
  container.register(ICache, { useClass: MemoryCache });
} else {
  // 生产环境使用 Redis
  container.register(ICache, { useClass: RedisCache });
}

// 业务代码不需要修改
class UserService {
  constructor(@inject(ICache) private cache: ICache) {}
}
```

### 与装饰器配合使用

结合 TypeScript 装饰器，可以获得更优雅的语法：

```typescript
// 自定义注入装饰器
function inject<T>(identifier: ServiceIdentifier<T>): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    // 保存标识符供容器使用
  };
}

// 使用
class OrderService {
  constructor(
    @inject(IConfigService) private config: ConfigService,
    @inject(ICache) private cache: ICache,
    @inject(IDatabase) private db: IDatabase
  ) {}
}
```

### 小结

`createServiceIdentifier` 的核心价值：

1. **解决接口运行时不存在的问题** - 创建运行时存在的标识符
2. **支持依赖倒置原则** - 面向接口编程，而非具体实现
3. **保持类型安全** - TypeScript 泛型提供编译时检查
4. **调试友好** - 字符串标识符比 Symbol 更易读
5. **灵活切换实现** - 便于测试和环境配置

**灵活性的需求：**

```typescript
// 运行时动态解析
const serviceName = getConfig().serviceName;
const service = container.resolve(serviceName as any);
```

**@husky-di/core 的平衡策略：**

1. **泛型解析方法**

```typescript
resolve<T>(id: ServiceIdentifier<T>): T;
// T 可以从 id 推断，也可以显式指定
```

2. **可选的默认值**

```typescript
resolve<T>(id: string, options: { 
  optional: true; 
  defaultValue: T 
}): T;
```

3. **Ref 类型包装**

```typescript
resolve<T>(id: ServiceIdentifier<T>, options: { 
  ref: true 
}): Ref<T>;

// Ref<T> 提供类型安全的延迟访问
const ref = container.resolve(ServiceB, { ref: true });
ref.current; // 类型：ServiceB
```

4. **多重解析的类型安全**

```typescript
resolve<T>(id: ServiceIdentifier<T>, options: { 
  multiple: true 
}): T[];
```

**妥协点：**

1. **字符串标识符损失类型信息**

```typescript
container.register('service', { useClass: UserService });
const service = container.resolve('service'); // 类型：unknown
```

解决方案：使用类型断言或类型守卫

```typescript
const service = container.resolve('service') as UserService;
```

2. **工厂函数的返回类型**

```typescript
container.register('service', {
  useFactory: (container) => {
    // 返回类型需要显式标注或由 TS 推断
    return new UserService();
  }
});
```

**最佳实践：**

```typescript
// 1. 优先使用类构造器作为标识符
container.register(UserService, { useClass: UserService });

// 2. 为字符串标识符定义类型常量
type ServiceKeys = 'userService' | 'logger';
const ServiceKeys = {
  UserService: 'userService' as const,
  Logger: 'logger' as const
};

// 3. 使用工厂函数时确保类型正确
container.register<Database>('database', {
  useFactory: (container): Database => {
    return new Database(...);
  }
});
```

---

## 总结

@husky-di/core 的设计遵循以下核心原则：

1. **类型优先**：充分利用 TypeScript 的类型系统
2. **约定优于配置**：合理的默认行为减少配置负担
3. **透明可扩展**：中间件系统允许不修改核心代码的情况下扩展功能
4. **诊断友好**：详细的错误信息和解析追踪帮助快速定位问题
5. **资源安全**：完善的处置机制确保资源正确清理

理解这些设计思想和内部机制，能够帮助你更有效地使用 @husky-di/core，并在遇到复杂场景时做出正确的设计决策。
