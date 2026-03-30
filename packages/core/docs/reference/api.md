# API 参考

@husky-di/core 的完整 API 参考文档。

## 核心 API

### createContainer()

创建新的容器实例的工厂函数。

**函数签名：**

```typescript
function createContainer(
  name?: string,
  parent?: IContainer
): IContainer
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | `string` | `"AnonymousContainer"` | 容器的显示名称 |
| `parent` | `IContainer` | `rootContainer` | 父容器，用于建立容器层级关系 |

**返回值：**

`IContainer` - 新创建的容器实例

**使用示例：**

```typescript
import { createContainer } from '@husky-di/core';

// 创建根容器
const rootContainer = createContainer('AppContainer');

// 创建子容器
const childContainer = createContainer('ChildContainer', rootContainer);
```

**相关 API：**

- [`IContainer`](#icontainer) - 容器接口
- [`rootContainer`](#rootcontainer) - 全局根容器实例

---

### IContainer

容器的核心接口，提供依赖注入的所有功能。

**接口定义：**

```typescript
interface IContainer extends 
  IUnique,
  IDisposable,
  IDisplayName,
  IServiceResolver,
  IServiceRegistry,
  IMiddlewareManager,
  IContainerHierarchy
```

**接口方法：**

| 方法 | 说明 |
|------|------|
| [`resolve()`](#resolve-方法) | 解析服务实例 |
| [`register()`](#register-方法) | 注册服务 |
| [`isRegistered()`](#isregistered-方法) | 检查服务是否注册 |
| [`unregister()`](#unregister-方法) | 取消注册服务 |
| [`use()`](#use-方法) | 添加中间件 |
| [`unused()`](#unused-方法) | 移除中间件 |
| [`dispose()`](#dispose-方法) | 处置容器 |
| [`getServiceIdentifiers()`](#getserviceidentifiers-方法) | 获取所有服务标识符 |

**属性：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 容器的唯一标识符 |
| `name` | `string` | 容器的名称 |
| `displayName` | `string` | 容器的显示名称 |
| `parent` | `IContainer \| undefined` | 父容器 |

**使用示例：**

```typescript
import { createContainer } from '@husky-di/core';

const container = createContainer('MyContainer');

// 注册服务
container.register(MyService, { useClass: MyService });

// 解析服务
const service = container.resolve(MyService);

// 处置容器
container.dispose();
```

**相关 API：**

- [`createContainer()`](#createcontainer) - 容器工厂函数
- [`IServiceResolver`](#iserviceresolver) - 服务解析接口
- [`IServiceRegistry`](#iserviceregistry) - 服务注册接口
- [`IMiddlewareManager`](#imiddlewaremanager) - 中间件管理接口

---

### resolve() 方法

从容器中解析服务实例。

**方法签名：**

```typescript
// 解析必需服务
resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;

// 解析服务（带选项）
resolve<T, O extends ResolveOptions<T>>(
  serviceIdentifier: ServiceIdentifier<T>,
  options: O
): ResolveInstance<T, O>;
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `serviceIdentifier` | `ServiceIdentifier<T>` | 服务的标识符 |
| `options` | `ResolveOptions<T>` | 解析选项（可选） |

**ResolveOptions 选项：**

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `multiple` | `boolean` | `false` | 是否解析多个实例 |
| `optional` | `boolean` | `false` | 是否允许返回 undefined |
| `defaultValue` | `T \| T[]` | `undefined` | 解析失败时的默认值 |
| `ref` | `boolean` | `false` | 是否返回引用包装器 |
| `dynamic` | `boolean` | `false` | 是否返回动态引用 |

**返回值：**

返回值类型由 `ResolveInstance<T, O>` 类型推断决定，具体取决于传入的选项：

| 选项组合 | 返回类型 | 类型签名 |
|----------|----------|----------|
| 无选项（默认） | `T` | `resolve<T>(id): T` |
| `{ multiple: true }` | `T[]` | `resolve<T>(id, { multiple: true }): T[]` |
| `{ optional: true }` | `T \| undefined` | `resolve<T>(id, { optional: true }): T \| undefined` |
| `{ optional: true, defaultValue: T }` | `T` | `resolve<T>(id, { optional: true, defaultValue }): T` |
| `{ ref: true }` | `Ref<T>` | `resolve<T>(id, { ref: true }): Ref<T>` |
| `{ dynamic: true }` | `Ref<T>` | `resolve<T>(id, { dynamic: true }): Ref<T>` |
| `{ multiple: true, optional: true }` | `T[]` | `resolve<T>(id, { multiple: true, optional: true }): T[]` |

类型推断规则：
- `ref` 和 `dynamic` 选项会返回 `Ref<T>` 类型，包含 `current` 和 `resolved` 属性
- `multiple` 选项会返回数组类型
- `optional` 选项会使返回值包含 `undefined`，除非提供了 `defaultValue`

**使用示例：**

```typescript
// 解析必需服务
const service = container.resolve(MyService);

// 解析可选服务
const optionalService = container.resolve(MyService, { optional: true });

// 解析多个服务
const services = container.resolve(MyService, { multiple: true });

// 解析为引用
const ref = container.resolve(MyService, { ref: true });
console.log(ref.current);

// 使用默认值
const withDefault = container.resolve(MyService, {
  optional: true,
  defaultValue: new MyService()
});
```

**异常：**

- `ResolveException` - 当服务无法解析且不是可选时抛出

**相关 API：**

- [`ServiceIdentifier`](#serviceidentifier) - 服务标识符类型
- [`ResolveOptions`](#resolveoptions) - 解析选项类型
- [`ResolveException`](#resolveexception) - 解析异常

---

### register() 方法

向容器注册服务。

**方法签名：**

```typescript
register<T>(
  serviceIdentifier: ServiceIdentifier<T>,
  registration: CreateRegistrationOptions<T>
): void
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `serviceIdentifier` | `ServiceIdentifier<T>` | 服务的标识符 |
| `registration` | `CreateRegistrationOptions<T>` | 注册选项 |

**注册选项类型：**

```typescript
// 使用类注册
{ useClass: Constructor<T>; lifecycle?: LifecycleEnum }

// 使用工厂注册
{ useFactory: (container, resolveContext) => T; lifecycle?: LifecycleEnum }

// 使用值注册
{ useValue: T; lifecycle?: LifecycleEnum }

// 使用别名注册
{ useAlias: ServiceIdentifier<T>; getContainer?: () => IContainer }
```

**使用示例：**

```typescript
// 使用类注册（transient 生命周期）
container.register(MyService, { useClass: MyService });

// 使用类注册（singleton 生命周期）
container.register(Config, { 
  useClass: Config, 
  lifecycle: LifecycleEnum.singleton 
});

// 使用工厂注册
container.register(Database, { 
  useFactory: () => new Database(config) 
});

// 使用值注册
container.register('API_URL', { useValue: 'https://api.example.com' });

// 使用别名注册
container.register('MyAlias', { useAlias: MyService });
```

**相关 API：**

- [`CreateRegistrationOptions`](#createregistrationoptions) - 注册选项类型
- [`LifecycleEnum`](#lifecycleenum) - 生命周期枚举
- [`unregister()`](#unregister-方法) - 取消注册方法

---

### isRegistered() 方法

检查服务是否已在容器中注册。

**方法签名：**

```typescript
isRegistered<T>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: IsRegisteredOptions
): boolean
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `serviceIdentifier` | `ServiceIdentifier<T>` | - | 服务的标识符 |
| `options.recursive` | `boolean` | `false` | 是否在父容器中递归查找 |

**返回值：**

`boolean` - 服务已注册返回 `true`，否则返回 `false`

**使用示例：**

```typescript
// 检查当前容器
if (container.isRegistered(MyService)) {
  console.log('Service is registered');
}

// 递归检查（包括父容器）
if (container.isRegistered(MyService, { recursive: true })) {
  console.log('Service is registered in this or parent containers');
}
```

**相关 API：**

- [`register()`](#register-方法) - 注册方法
- [`unregister()`](#unregister-方法) - 取消注册方法

---

### unregister() 方法

从容器中取消注册服务。

**方法签名：**

```typescript
unregister<T>(serviceIdentifier: ServiceIdentifier<T>): void
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `serviceIdentifier` | `ServiceIdentifier<T>` | 要取消注册的服务标识符 |

**说明：**

- 如果服务未注册，此方法不执行任何操作
- 不影响已解析的实例

**使用示例：**

```typescript
container.register(MyService, { useClass: MyService });
console.log(container.isRegistered(MyService)); // true

container.unregister(MyService);
console.log(container.isRegistered(MyService)); // false
```

**相关 API：**

- [`register()`](#register-方法) - 注册方法
- [`isRegistered()`](#isregistered-方法) - 检查注册方法

---

### use() 方法

向容器添加解析中间件。

**方法签名：**

```typescript
use(middleware: ResolveMiddleware<any, any>): void
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `middleware` | `ResolveMiddleware` | 中间件对象，包含 name 和 executor |

**中间件结构：**

```typescript
{
  name: string;
  executor: (params: ResolveMiddlewareParams<T, O>, next: () => T) => T;
}
```

**执行顺序：**

中间件按 **LIFO**（后进先出）顺序执行，即最后注册的中间件最先执行。

**使用示例：**

```typescript
// 日志中间件
container.use({
  name: 'logging',
  executor: (params, next) => {
    console.log(`开始解析：${params.serviceIdentifier}`);
    const result = next(params);
    console.log(`解析完成：${params.serviceIdentifier}`);
    return result;
  }
});

// 性能监控中间件
container.use({
  name: 'perf-monitor',
  executor: (params, next) => {
    const start = performance.now();
    const result = next(params);
    const duration = performance.now() - start;
    console.log(`解析耗时：${duration}ms`);
    return result;
  }
});
```

**相关 API：**

- [`unused()`](#unused-方法) - 移除中间件方法
- [`ResolveMiddleware`](#resolvemiddleware) - 中间件类型
- [`globalMiddleware`](#globalmiddleware) - 全局中间件

---

### unused() 方法

从容器中移除中间件。

**方法签名：**

```typescript
unused(middleware: ResolveMiddleware<any, any>): void
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `middleware` | `ResolveMiddleware` | 要移除的中间件对象（同一实例） |

**使用示例：**

```typescript
const loggingMiddleware = {
  name: 'logging',
  executor: (params, next) => {
    console.log(`解析：${params.serviceIdentifier}`);
    return next(params);
  }
};

// 添加中间件
container.use(loggingMiddleware);

// ... 之后移除中间件
container.unused(loggingMiddleware);
```

**相关 API：**

- [`use()`](#use-方法) - 添加中间件方法

---

### dispose() 方法

处置容器，释放所有资源。

**方法签名：**

```typescript
dispose(): void
```

**说明：**

- 释放容器管理的所有单例实例
- 清理解析上下文
- 处置后容器不应再使用

**使用示例：**

```typescript
const container = createContainer('MyContainer');

// ... 使用容器

// 使用完毕后处置
container.dispose();
```

**相关 API：**

- [`IDisposable`](#idisposable) - 可处置接口

---

### getServiceIdentifiers() 方法

获取容器中所有已注册的服务标识符。

**方法签名：**

```typescript
getServiceIdentifiers(): ServiceIdentifier<unknown>[]
```

**返回值：**

`ServiceIdentifier<unknown>[]` - 当前容器中所有已注册的服务标识符数组

**说明：**

- 仅返回当前容器注册的标识符
- 不包括父容器中的服务

**使用示例：**

```typescript
container.register(ServiceA, { useClass: ServiceA });
container.register(ServiceB, { useClass: ServiceB });

const identifiers = container.getServiceIdentifiers();
console.log(identifiers); // [ServiceA, ServiceB]
```

**相关 API：**

- [`ServiceIdentifier`](#serviceidentifier) - 服务标识符类型

---

## 类型定义

### ServiceIdentifier

服务标识符类型，用于标识和解析服务。

**类型定义：**

```typescript
type ServiceIdentifier<T> =
  | AbstractConstructor<T>
  | Constructor<T>
  | string
  | symbol;
```

**相关类型：**

```typescript
// 从服务标识符提取实例类型
type ServiceIdentifierInstance<R extends ServiceIdentifier<unknown>> =
  R extends ServiceIdentifier<infer T> ? T : unknown;
```

**使用示例：**

```typescript
// 使用类作为标识符
class UserService {}
container.resolve(UserService);

// 使用字符串作为标识符
container.resolve('API_URL');

// 使用 Symbol 作为标识符
const TOKEN = Symbol('TOKEN');
container.resolve(TOKEN);
```

**相关 API：**

- [`Constructor`](#constructor--abstractconstructor) - 构造函数类型
- [`createServiceIdentifier()`](#createserviceidentifier) - 创建服务标识符工具

---

### Constructor / AbstractConstructor

构造函数类型定义。

**类型定义：**

```typescript
// 普通构造函数
type Constructor<Instance, Args extends any[] = any[]> = 
  new (...args: Args) => Instance;

// 抽象构造函数
type AbstractConstructor<T> = 
  abstract new (...args: any[]) => T;
```

**使用示例：**

```typescript
class MyService {
  constructor(private config: Config) {}
}

// Constructor<MyService> 类型
container.register(MyService, { useClass: MyService });
```

**相关 API：**

- [`ServiceIdentifier`](#serviceidentifier) - 服务标识符类型

---

### Ref / MutableRef

引用类型定义，用于延迟解析服务。

**类型定义：**

```typescript
// 不可变引用
type Ref<T> = {
  readonly current: T;
  readonly resolved: boolean;
};

// 可变引用（内部使用）
type MutableRef<T> = {
  current?: T;
};
```

**使用示例：**

```typescript
// 解析为引用
const ref = container.resolve(MyService, { ref: true });

// 访问实例
console.log(ref.current);

// 检查是否已解析
console.log(ref.resolved);
```

**相关 API：**

- [`resolve()`](#resolve-方法) - 解析方法（使用 `ref` 选项）

---

### ResolveOptions

解析服务的选项类型。

**类型定义：**

```typescript
type ResolveOptions<T> = {
  dynamic?: boolean;
  ref?: boolean;
} & (
  | { multiple?: false; optional?: false; defaultValue?: never }
  | { multiple?: false; optional: true; defaultValue?: T }
  | { multiple: true; optional?: false; defaultValue?: never }
  | { multiple: true; optional: true; defaultValue?: T[] }
);
```

**选项说明：**

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `dynamic` | `boolean` | `false` | 返回动态引用，每次访问重新解析 |
| `ref` | `boolean` | `false` | 返回引用包装器 |
| `multiple` | `boolean` | `false` | 解析多个实例 |
| `optional` | `boolean` | `false` | 允许返回 undefined |
| `defaultValue` | `T \| T[]` | `undefined` | 默认值 |

**使用示例：**

```typescript
// 必需单个服务
container.resolve(MyService);

// 可选服务
container.resolve(MyService, { optional: true });

// 多个服务
container.resolve(MyService, { multiple: true });

// 引用
container.resolve(MyService, { ref: true });
```

**相关 API：**

- [`resolve()`](#resolve-方法) - 解析方法
- [`ResolveInstance`](#resolveinstance) - 解析结果类型

---

### CreateRegistrationOptions

创建服务注册的选项类型。

**类型定义：**

```typescript
// 基础选项
type CreateRegistrationBaseOptions = {
  readonly lifecycle?: LifecycleEnum;
};

// 类注册
type CreateClassRegistrationOptions<T> = {
  readonly useClass: Constructor<T>;
} & CreateRegistrationBaseOptions;

// 工厂注册
type CreateFactoryRegistrationOptions<T> = {
  readonly useFactory: (
    container: IContainer,
    resolveContext: ResolveContext
  ) => T;
} & CreateRegistrationBaseOptions;

// 值注册
type CreateValueRegistrationOptions<T> = {
  readonly useValue: T;
} & CreateRegistrationBaseOptions;

// 别名注册
type CreateAliasRegistrationOptions<T> = {
  readonly useAlias: ServiceIdentifier<T>;
  readonly getContainer?: () => IContainer;
};

// 联合类型
type CreateRegistrationOptions<T> =
  | CreateClassRegistrationOptions<T>
  | CreateFactoryRegistrationOptions<T>
  | CreateValueRegistrationOptions<T>
  | CreateAliasRegistrationOptions<T>;
```

**使用示例：**

```typescript
// 类注册
container.register(Service, { useClass: Service });

// 工厂注册
container.register(Service, { 
  useFactory: (container) => new Service(container.resolve(Config))
});

// 值注册
container.register('config', { useValue: { apiUrl: '...' } });

// 别名注册
container.register('MyService', { useAlias: Service });
```

**相关 API：**

- [`register()`](#register-方法) - 注册方法
- [`LifecycleEnum`](#lifecycleenum) - 生命周期枚举

---

## 枚举

### LifecycleEnum

服务生命周期枚举。

**枚举定义：**

```typescript
enum LifecycleEnum {
  transient = 0,    // 瞬态（默认）
  singleton = 1,    // 单例
  resolution = 2    // 解析作用域
}
```

**生命周期说明：**

| 值 | 说明 |
|----|------|
| `transient` | 每次解析都创建新实例（默认） |
| `singleton` | 容器内只创建一次，所有解析共享同一实例 |
| `resolution` | 在单次解析链中共享实例 |

**使用示例：**

```typescript
// 瞬态 - 每次都是新实例
container.register(Service, { 
  useClass: Service,
  lifecycle: LifecycleEnum.transient 
});

// 单例 - 全局共享
container.register(Config, { 
  useClass: Config,
  lifecycle: LifecycleEnum.singleton 
});

// 解析作用域 - 单次解析链内共享
container.register(SharedService, { 
  useClass: SharedService,
  lifecycle: LifecycleEnum.resolution 
});
```

**相关 API：**

- [`CreateRegistrationOptions`](#createregistrationoptions) - 注册选项

---

### RegistrationTypeEnum

注册类型枚举。

**枚举定义：**

```typescript
enum RegistrationTypeEnum {
  class = 'class',      // 类注册
  factory = 'factory',  // 工厂注册
  value = 'value',      // 值注册
  alias = 'alias'       // 别名注册
}
```

**使用示例：**

```typescript
// 根据注册方式，内部会设置对应的 type
const registration = container.register(Service, { 
  useClass: Service 
});
// registration.type === RegistrationTypeEnum.class
```

**相关 API：**

- [`IRegistration`](#iregistration) - 注册接口

---

### ResolveRecordTypeEnum

解析记录类型枚举，用于追踪解析过程。

**枚举定义：**

```typescript
enum ResolveRecordTypeEnum {
  root = 0,             // 根节点
  serviceIdentifier = 1, // 服务标识符节点
  message = 2           // 消息节点
}
```

**使用示例：**

```typescript
// 解析记录用于追踪解析链和检测循环依赖
// 通常在异常信息中使用
```

**相关 API：**

- [`ResolveException`](#resolveexception) - 解析异常
- [`ResolveRecordData`](#resolverecorddata) - 解析记录类型

---

## 工具函数

### resolve()

在解析上下文中解析服务的工具函数。

**函数签名：**

```typescript
function resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;
function resolve<T, O extends ResolveOptions<T>>(
  serviceIdentifier: ServiceIdentifier<T>,
  options: O
): ResolveInstance<T, O>;
```

**说明：**

- 只能在解析上下文中使用（如工厂函数内部）
- 使用当前解析记录访问活动容器

**使用示例：**

```typescript
// 在工厂函数中使用
container.register(ServiceA, {
  useFactory: () => {
    const dependency = resolve(ServiceB);
    return new ServiceA(dependency);
  }
});
```

**异常：**

- `Error` - 在解析上下文外调用时抛出
- `ResolveException` - 解析失败时抛出

**相关 API：**

- [`IContainer.resolve()`](#resolve-方法) - 容器解析方法

---

### createServiceIdentifier()

创建类型安全的服务标识符。

**背景和理由：**

在依赖注入容器中，服务标识符（ServiceIdentifier）是用来唯一标识一个服务的键。它可以是类构造函数、字符串或 Symbol。

**为什么需要 createServiceIdentifier？**

1. **接口无法作为运行时标识符**

TypeScript 接口在编译后不存在，无法直接用作服务标识符：

```typescript
// 错误：接口在运行时不存在
interface ILogger {
  log(message: string): void;
}

// 这行代码在运行时会报错，因为 ILogger 只是类型，运行时不存在
container.register(ILogger, { useClass: Logger });
```

2. **解决方案：创建运行时存在的标识符**

```typescript
// 创建一个运行时存在的标识符
const ILogger = createServiceIdentifier<ILogger>('ILogger');

// 现在可以正常使用了
container.register(ILogger, { useClass: Logger });
const logger = container.resolve(ILogger);
```

3. **支持依赖倒置原则（DIP）**

`createServiceIdentifier` 让你可以创建"抽象"的标识符，符合依赖倒置原则：

```typescript
// 定义接口
interface DatabaseAdapter {
  connect(): Promise<void>;
  query(sql: string): Promise<any[]>;
}

// 创建标识符（代表抽象）
const IDatabaseAdapter = createServiceIdentifier<DatabaseAdapter>('IDatabaseAdapter');

// 注册具体实现
container.register(IDatabaseAdapter, { useClass: MySQLAdapter });

// 使用时依赖抽象，而非具体实现
class UserService {
  constructor(@inject(IDatabaseAdapter) private db: DatabaseAdapter) {}
}
```

4. **相比 Symbol 的优势**

```typescript
// Symbol 也可以，但调试时不易读
const ILogger = Symbol('ILogger');
// 错误信息：Cannot resolve Symbol(ILogger)

// createServiceIdentifier 内部使用字符串，提供更好的调试体验
const ILogger = createServiceIdentifier<ILogger>('ILogger');
// 错误信息：Cannot resolve ILogger（更清晰）
```

**使用场景对比：**

| 场景 | 推荐方式 | 理由 |
|------|---------|------|
| 类作为服务 | 直接用类 | 简单直观 |
| 接口作为服务 | createServiceIdentifier | 接口运行时不存在 |
| 需要抽象层 | createServiceIdentifier | 符合依赖倒置原则 |
| 需要替换实现 | createServiceIdentifier | 便于切换不同实现 |
| 循环依赖 | createServiceIdentifier + ref | 打破循环引用 |

**函数签名：**

```typescript
function createServiceIdentifier<T>(
  id: string | symbol
): ServiceIdentifier<T>
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string \| symbol` | 标识符字符串或 Symbol |

**返回值：**

`ServiceIdentifier<T>` - 类型安全的服务标识符

**完整示例：**

```typescript
import { createContainer, createServiceIdentifier, LifecycleEnum } from '@husky-di/core';

// 1. 定义接口（运行时不存在）
interface ConfigService {
  get(key: string): string;
}

// 2. 创建标识符（运行时存在，携带类型信息）
const IConfigService = createServiceIdentifier<ConfigService>('IConfigService');

// 3. 实现类
class EnvConfigService implements ConfigService {
  get(key: string): string {
    return process.env[key] || '';
  }
}

// 4. 注册时，标识符和实现可以不同
const container = createContainer('AppContainer');
container.register(IConfigService, {
  useClass: EnvConfigService,
  lifecycle: LifecycleEnum.singleton,
});

// 5. 使用时，依赖的是抽象标识符
class DatabaseService {
  constructor(
    @inject(IConfigService) private config: ConfigService
  ) {}
}
```

**相关 API：**

- [`ServiceIdentifier`](#serviceidentifier) - 服务标识符类型
- [`getServiceIdentifierName()`](#getserviceidentifiername) - 获取标识符名称

---

### getServiceIdentifierName()

获取服务标识符的人类可读名称。

**函数签名：**

```typescript
function getServiceIdentifierName(
  serviceIdentifier: ServiceIdentifier<unknown>
): string
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `serviceIdentifier` | `ServiceIdentifier<unknown>` | 服务标识符 |

**返回值：**

`string` - 可读的名称字符串

**使用示例：**

```typescript
// 字符串标识符
const name1 = getServiceIdentifierName('UserService'); 
// 'UserService'

// Symbol 标识符
const name2 = getServiceIdentifierName(Symbol('token')); 
// 'Symbol(token)' 或 'token'

// 类标识符
const name3 = getServiceIdentifierName(MyClass); 
// 'MyClass'
```

**相关 API：**

- [`ServiceIdentifier`](#serviceidentifier) - 服务标识符类型
- [`createServiceIdentifier()`](#createserviceidentifier) - 创建服务标识符

---

## 异常

### ResolveException

服务解析失败时抛出的异常。

**类定义：**

```typescript
class ResolveException extends Error {
  constructor(message: string, resolveRecord: IResolveRecord);
  
  static isResolveException(error: unknown): error is ResolveException;
}
```

**构造参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `message` | `string` | 错误描述信息 |
| `resolveRecord` | `IResolveRecord` | 解析记录，包含解析路径和循环依赖信息 |

**静态方法：**

| 方法 | 说明 |
|------|------|
| `isResolveException(error)` | 类型守卫，检查错误是否为 ResolveException |

**使用示例：**

```typescript
import { ResolveException } from '@husky-di/core';

try {
  const service = container.resolve(MyService);
} catch (error) {
  if (ResolveException.isResolveException(error)) {
    console.error('解析失败:', error.message);
    // 错误信息包含完整的解析路径
  }
}
```

**错误信息包含：**

- 解析失败的原因
- 完整的解析路径
- 循环依赖信息（如果存在）

**相关 API：**

- [`resolve()`](#resolve-方法) - 解析方法
- [`ResolveRecordData`](#resolverecorddata) - 解析记录类型

---

## 全局实例

### globalMiddleware

全局中间件管理器。

**类型：**

```typescript
const globalMiddleware: IMiddlewareManager<
  ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
  any
>
```

**说明：**

- 在此注册的中间件会应用到所有容器的所有解析
- 用于全局日志、性能监控等横切关注点

**使用示例：**

```typescript
import { globalMiddleware } from '@husky-di/core';

// 全局日志中间件
globalMiddleware.use({
  name: 'global-logging',
  executor: (params, next) => {
    console.log(`[全局] 解析：${params.serviceIdentifier}`);
    return next(params);
  }
});
```

**相关 API：**

- [`use()`](#use-方法) - 添加中间件
- [`IMiddlewareManager`](#imiddlewaremanager) - 中间件管理接口

---

### rootContainer

根容器实例。

**类型：**

```typescript
const rootContainer: IContainer
```

**说明：**

- 所有未指定父容器的容器都默认使用此容器作为父容器
- 是容器层级的根节点

**使用示例：**

```typescript
import { rootContainer, createContainer } from '@husky-di/core';

// 在全局根容器注册服务
rootContainer.register(Config, { useClass: Config });

// 创建的子容器可以访问根容器的服务
const childContainer = createContainer('Child');
const config = childContainer.resolve(Config); // 从根容器解析
```

**相关 API：**

- [`createContainer()`](#createcontainer) - 容器工厂函数
- [`IContainer`](#icontainer) - 容器接口

---

## 附录

### IServiceResolver

服务解析接口。

```typescript
interface IServiceResolver {
  resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;
  resolve<T, O extends ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options: O
  ): ResolveInstance<T, O>;
}
```

### IServiceRegistry

服务注册接口。

```typescript
interface IServiceRegistry {
  register<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    registration: CreateRegistrationOptions<T>
  ): void;
  isRegistered<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: IsRegisteredOptions
  ): boolean;
  unregister<T>(serviceIdentifier: ServiceIdentifier<T>): void;
  getServiceIdentifiers(): ServiceIdentifier<unknown>[];
}
```

### IMiddlewareManager

中间件管理接口。

```typescript
interface IMiddlewareManager<Params = any, Result = any> {
  use(middleware: Middleware<Params, Result>): void;
  unused(middleware: Middleware<Params, Result>): void;
}
```

### IRegistration

注册接口。

```typescript
interface IRegistration<T> {
  readonly id: string;
  readonly type: RegistrationTypeEnum;
  readonly lifecycle: LifecycleEnum;
  readonly instance: T | undefined;
  readonly resolved: boolean;
  readonly provider: Constructor<T> | ((...) => T) | T | ServiceIdentifier<T>;
  readonly getContainer?: () => IContainer;
}
```

### ResolveMiddleware

解析中间件类型。

```typescript
type ResolveMiddleware<T, O extends ResolveOptions<T>> = Middleware<
  ResolveMiddlewareParams<T, O>,
  ResolveInstance<T, O>
>;
```

### ResolveMiddlewareParams

中间件参数类型。

```typescript
type ResolveMiddlewareParams<T, O extends ResolveOptions<T>> = {
  serviceIdentifier: ServiceIdentifier<T>;
  resolveOptions: O;
  container: IContainer;
  resolveRecord: IInternalResolveRecord;
  registration: IRegistration<T>;
  resolveContext: ResolveContext;
};
```
