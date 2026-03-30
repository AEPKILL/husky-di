# 装饰器 API 参考

本文档是 `@husky-di/decorator` 包的完整 API 参考，提供装饰器函数、中间件、类型定义、元数据键和错误代码的详细说明。

---

## 装饰器函数

### @injectable()

类装饰器，用于标记一个类为可注入类，并整合其构造函数参数的依赖注入元数据。

#### 函数签名

```typescript
function injectable(): ClassDecorator
```

#### 参数

无参数。

#### 返回值

返回一个 `ClassDecorator`，应用于类定义。

#### 功能说明

- **单一应用**：同一个类不能被 `@injectable()` 装饰超过一次，否则抛出 `E_DUPLICATE_INJECTABLE` 错误
- **元数据整合**：整合所有构造函数参数的注入元数据，包括：
  - 来自 `@inject()` 或 `@tagged()` 的显式元数据
  - 来自 TypeScript `design:paramtypes` 的隐式元数据
- **参数类型验证**：对于没有显式元数据的参数，其推断类型必须是函数（类构造函数）
- **元数据存储**：将整合后的元数据存储到内部映射中供解析时使用

#### 使用示例

```typescript
import { injectable, inject } from "@husky-di/decorator";

@injectable()
class LoggerService {
  log(message: string): void {
    console.log(`[LOG]: ${message}`);
  }
}

@injectable()
class UserService {
  constructor(
    @inject(LoggerService) private logger: LoggerService,
  ) {}

  getUser(id: string): void {
    this.logger.log(`Fetching user ${id}`);
  }
}
```

#### 相关 API

- [`@inject()`](#inject) - 参数装饰器
- [`@tagged()`](#tagged) - 低级参数装饰器
- [`decoratorMiddleware`](#decoratormiddleware) - 装饰器中间件

---

### @inject()

参数装饰器，用于为构造函数参数指定服务标识符和注入选项。

#### 函数签名

```typescript
function inject<T>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: InjectOptions<T>
): ParameterDecorator
```

#### 参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `serviceIdentifier` | `ServiceIdentifier<T>` | 是 | 服务标识符，可以是类构造函数、Symbol 或非空字符串 |
| `options` | [`InjectOptions<T>`](#injectoptions) | 否 | 注入选项，包含 `container`、`dynamic`、`ref`、`optional` 等 |

#### 返回值

返回一个 `ParameterDecorator`，应用于构造函数参数。

#### 功能说明

- **参数作用域**：仅适用于构造函数参数
- **服务标识符必需**：必须提供有效的服务标识符
- **元数据附加**：将完整的 `InjectionMetadata` 对象存储到参数的元数据数组中
- **多次应用**：如果同一参数被多次装饰，仅最后一次应用生效

#### 使用示例

```typescript
import { injectable, inject } from "@husky-di/decorator";
import type { Ref } from "@husky-di/core";

const CONFIG_TOKEN = Symbol("Config");

@injectable()
class ConfigService {
  getValue(key: string): string {
    return `config-${key}`;
  }
}

@injectable()
class ApiService {
  constructor(
    // 使用类构造函数作为标识符
    @inject(ConfigService) private config: ConfigService,
    // 使用 Symbol 作为标识符
    @inject(CONFIG_TOKEN, { optional: true }) private apiKey?: string,
    // 使用动态引用
    @inject(ConfigService, { dynamic: true }) private configRef: Ref<ConfigService>,
  ) {}
}
```

#### 相关 API

- [`@injectable()`](#injectable) - 类装饰器
- [`@tagged()`](#tagged) - 低级参数装饰器
- [`InjectOptions`](#injectoptions) - 注入选项类型
- [`InjectionMetadata`](#injectionmetadata) - 注入元数据接口

---

### @tagged()

低级参数装饰器，用于直接附加完整的注入元数据到构造函数参数。

#### 函数签名

```typescript
function tagged<T>(
  metadata: InjectionMetadata<T>
): ParameterDecorator
```

#### 参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `metadata` | [`InjectionMetadata<T>`](#injectionmetadata) | 是 | 完整的注入元数据对象，必须包含 `serviceIdentifier` 字段 |

#### 返回值

返回一个 `ParameterDecorator`，应用于构造函数参数。

#### 功能说明

- **低级原语**：这是基础的元数据附加机制，`@inject()` 基于此实现
- **完整元数据**：参数必须包含有效的 `serviceIdentifier` 字段
- **元数据存储**：将元数据对象写入 Reflect 元数据系统，键为 `INJECTION_METADATA_KEY`
- **数组完整性**：元数据数组保持稀疏数组语义，没有显式元数据的参数在其索引处为 `undefined`

#### 使用示例

```typescript
import { injectable, tagged } from "@husky-di/decorator";
import type { Ref } from "@husky-di/core";

@injectable()
class DatabaseService {
  query(sql: string): string {
    return `Result of: ${sql}`;
  }
}

@injectable()
class Repository {
  constructor(
    @tagged({
      serviceIdentifier: DatabaseService,
      ref: true,
      optional: false,
    })
    private dbRef: Ref<DatabaseService>,
  ) {}

  findAll(): string {
    return this.dbRef.current.query("SELECT * FROM table");
  }
}
```

#### 相关 API

- [`@inject()`](#inject) - 参数装饰器
- [`@injectable()`](#injectable) - 类装饰器
- [`InjectionMetadata`](#injectionmetadata) - 注入元数据接口

---

## 中间件

### decoratorMiddleware

装饰器中间件，负责处理带有 `@injectable()` 装饰的类的实例化。

#### 类型定义

```typescript
const decoratorMiddleware: ResolveMiddleware
```

#### 结构

```typescript
interface ResolveMiddleware {
  name: symbol;
  executor: (params: ResolveParams, next: ResolveNext) => unknown;
}
```

#### 属性

| 属性名 | 类型 | 说明 |
|--------|------|------|
| `name` | `symbol` | 中间件名称，值为 `Symbol("DecoratorMiddleware")` |
| `executor` | `function` | 中间件执行函数 |

#### 功能说明

- **仅处理类类型**：只处理 `RegistrationTypeEnum.class` 类型的注册
- **原始构造函数**：如果提供者是原始构造函数（String、Number、Boolean、Symbol、BigInt），直接返回新实例
- **元数据验证**：检查类是否被 `@injectable()` 装饰，未装饰则抛出 `E_NOT_INJECTABLE` 错误
- **参数解析**：根据存储的元数据解析每个构造函数参数的依赖
- **实例创建**：使用解析后的参数创建类实例

#### 使用示例

```typescript
import { createContainer, globalMiddleware } from "@husky-di/core";
import { decoratorMiddleware, injectable, inject } from "@husky-di/decorator";

// 注册全局中间件
globalMiddleware.use(decoratorMiddleware);

const container = createContainer();

@injectable()
class ServiceA {
  value = "A";
}

@injectable()
class ServiceB {
  constructor(@inject(ServiceA) private serviceA: ServiceA) {}

  getValue(): string {
    return this.serviceA.value;
  }
}

// 自动使用 decoratorMiddleware 解析
const instance = container.resolve(ServiceB);
console.log(instance.getValue()); // 输出: "A"
```

#### 相关 API

- [`@injectable()`](#injectable) - 类装饰器
- [`globalMiddleware`](https://kilo.ai/docs) - 全局中间件
- [`ResolveMiddleware`](https://kilo.ai/docs) - 解析中间件类型

---

## 类型定义

### InjectionMetadata

注入元数据接口，描述如何解析构造函数参数的依赖。

#### 类型定义

```typescript
type InjectionMetadata<T> = ResolveOptions<T> & {
  serviceIdentifier: ServiceIdentifier<T>;
};
```

#### 字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `serviceIdentifier` | `ServiceIdentifier<T>` | 是 | 服务标识符，用于解析依赖 |
| `container` | `IContainer` | 否 | 指定的容器实例，用于从中解析依赖 |
| `dynamic` | `boolean` | 否 | 为 `true` 时返回动态引用，反映当前注册状态 |
| `ref` | `boolean` | 否 | 为 `true` 时返回引用包装器对象 |
| `optional` | `boolean` | 否 | 为 `true` 时解析失败返回 `undefined` 而非抛出错误 |

#### 约束条件

- `dynamic` 和 `ref` 不能同时为 `true`，否则抛出 `E_CONFLICTING_OPTIONS` 错误
- `serviceIdentifier` 必须是以下之一：
  - 类构造函数函数
  - Symbol
  - 非空字符串

#### 使用示例

```typescript
import type { InjectionMetadata, InjectOptions } from "@husky-di/decorator";
import type { ServiceIdentifier } from "@husky-di/core";

const MyServiceIdentifier: ServiceIdentifier<MyService> = MyService;

// 完整的 InjectionMetadata
const metadata: InjectionMetadata<MyService> = {
  serviceIdentifier: MyServiceIdentifier,
  dynamic: true,
  optional: false,
};

// InjectOptions 是 omit 了 serviceIdentifier 的 InjectionMetadata
const options: InjectOptions<MyService> = {
  dynamic: true,
  optional: false,
};
```

#### 相关 API

- [`InjectOptions`](#injectoptions) - 注入选项类型
- [`@inject()`](#inject) - 参数装饰器
- [`@tagged()`](#tagged) - 低级参数装饰器

---

### InjectOptions

注入选项类型，用于 `@inject()` 装饰器的可选参数。

#### 类型定义

```typescript
type InjectOptions<T> = Omit<InjectionMetadata<T>, "serviceIdentifier">;
```

#### 字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `container` | `IContainer` | 否 | 指定的容器实例 |
| `dynamic` | `boolean` | 否 | 返回动态引用 |
| `ref` | `boolean` | 否 | 返回引用包装器 |
| `optional` | `boolean` | 否 | 可选依赖 |

#### 说明

`InjectOptions<T>` 是从 [`InjectionMetadata<T>`](#injectionmetadata) 中省略 `serviceIdentifier` 字段后的类型。

#### 使用示例

```typescript
import { injectable, inject } from "@husky-di/decorator";
import type { InjectOptions } from "@husky-di/decorator";

// 定义可复用的选项
const dynamicOptions: InjectOptions<LoggerService> = {
  dynamic: true,
};

const optionalOptions: InjectOptions<ConfigService> = {
  optional: true,
};

@injectable()
class ApiService {
  constructor(
    @inject(LoggerService, dynamicOptions) private logger: unknown,
    @inject(ConfigService, optionalOptions) private config?: unknown,
  ) {}
}
```

#### 相关 API

- [`InjectionMetadata`](#injectionmetadata) - 注入元数据接口
- [`@inject()`](#inject) - 参数装饰器

---

## 元数据键

### INJECTION_METADATA_KEY

自定义元数据键，用于存储和检索类的注入元数据。

#### 类型定义

```typescript
const INJECTION_METADATA_KEY: string = "husky-di.injection-metadata";
```

#### 说明

- **用途**：作为 Reflect API 的键，存储 `Array<InjectionMetadata<T> | undefined>`
- **存储位置**：附加到被 `@injectable()` 装饰的类构造函数上
- **访问方式**：`Reflect.getMetadata(INJECTION_METADATA_KEY, targetConstructor)`

#### 使用示例

```typescript
import { injectable, inject } from "@husky-di/decorator";
import { INJECTION_METADATA_KEY } from "@husky-di/decorator";

@injectable()
class Dependency {}

@injectable()
class TestService {
  constructor(@inject(Dependency) private dep: Dependency) {}
}

// 检索元数据
const metadata = Reflect.getMetadata(
  INJECTION_METADATA_KEY,
  TestService,
);
console.log(metadata);
// 输出: [{ serviceIdentifier: Dependency }]
```

#### 相关 API

- [`DESIGN_PARAMTYPES`](#design_paramtypes) - 设计参数类型键
- [`@injectable()`](#injectable) - 类装饰器

---

### DESIGN_PARAMTYPES

TypeScript 内置的元数据键，用于存储构造函数参数类型。

#### 类型定义

```typescript
const DESIGN_PARAMTYPES: string = "design:paramtypes";
```

#### 说明

- **用途**：TypeScript 编译器在 `emitDecoratorMetadata: true` 时自动生成
- **存储内容**：构造函数参数的类型数组
- **访问方式**：`Reflect.getMetadata(DESIGN_PARAMTYPES, targetConstructor)`
- **限制**：仅包含类型信息，不包含 `@inject()` 等装饰器的选项

#### 使用示例

```typescript
import { injectable } from "@husky-di/decorator";
import { DESIGN_PARAMTYPES } from "@husky-di/decorator";

class DependencyA {}
class DependencyB {}

@injectable()
class TestService {
  constructor(depA: DependencyA, depB: DependencyB) {}
}

// 检索设计时参数类型
const paramTypes = Reflect.getMetadata(
  DESIGN_PARAMTYPES,
  TestService,
);
console.log(paramTypes);
// 输出: [Function: DependencyA, Function: DependencyB]
```

#### 相关 API

- [`INJECTION_METADATA_KEY`](#injection_metadata_key) - 注入元数据键
- [`@injectable()`](#injectable) - 类装饰器

---

## 错误代码

### E_DUPLICATE_INJECTABLE

同一个类被 `@injectable()` 装饰超过一次时抛出的错误。

#### 错误信息模板

```
Class '{className}' is already decorated with @injectable()
```

#### 触发条件

- 在同一个类上应用多个 `@injectable()` 装饰器

#### 检测阶段

装饰阶段

#### 示例

```typescript
import { injectable } from "@husky-di/decorator";

// 错误：重复装饰
@injectable()
@injectable()
class DuplicateService {}
// 抛出：Class 'DuplicateService' is already decorated with @injectable()
```

#### 解决方案

确保每个类只被 `@injectable()` 装饰一次。

#### 相关 API

- [`@injectable()`](#injectable) - 类装饰器

---

### E_NON_CLASS_PARAMETER

构造函数参数没有显式元数据且推断类型不是函数时抛出的错误。

#### 错误信息模板

```
Constructor '{className}' parameter #{index} must be a class type
```

#### 触发条件

- 参数没有 `@inject()` 或 `@tagged()` 显式装饰
- TypeScript 推断的类型不是函数（类构造函数）

#### 检测阶段

装饰阶段

#### 示例

```typescript
import { injectable } from "@husky-di/decorator";

// 错误：原始类型没有显式元数据
@injectable()
class InvalidService {
  constructor(value: string) {}
}
```

#### 解决方案

对于原始类型或接口类型，使用 `@inject()` 提供显式的 `serviceIdentifier`：

```typescript
import { injectable, inject } from "@husky-di/decorator";

const STRING_TOKEN = Symbol("String");

@injectable()
class ValidService {
  constructor(@inject(STRING_TOKEN) value: string) {}
}
```

#### 相关 API

- [`@inject()`](#inject) - 参数装饰器
- [`@tagged()`](#tagged) - 低级参数装饰器

---

### E_NOT_INJECTABLE

尝试解析未使用 `@injectable()` 装饰的类时抛出的错误。

#### 错误信息模板

```
Class '{className}' must be decorated with @injectable()
```

#### 触发条件

- 解析的类没有 `@injectable()` 装饰器

#### 检测阶段

解析阶段

#### 示例

```typescript
import { injectable, inject } from "@husky-di/decorator";

// 没有装饰的类
class NonInjectableService {}

@injectable()
class TestService {
  constructor(@inject(NonInjectableService) dep: NonInjectableService) {}
}

// 错误：解析时抛出 E_NOT_INJECTABLE
container.resolve(TestService);
```

#### 解决方案

确保所有被注入的类都使用 `@injectable()` 装饰：

```typescript
@injectable()
class InjectableService {}

@injectable()
class TestService {
  constructor(@inject(InjectableService) dep: InjectableService) {}
}
```

#### 相关 API

- [`@injectable()`](#injectable) - 类装饰器
- [`decoratorMiddleware`](#decoratormiddleware) - 装饰器中间件

---

### E_MISSING_SERVICE_IDENTIFIER

`@tagged()` 装饰器的元数据缺少 `serviceIdentifier` 字段时抛出的错误。

#### 错误信息模板

```
Injection metadata must include a serviceIdentifier
```

#### 触发条件

- `@tagged()` 的元数据对象没有 `serviceIdentifier` 字段

#### 检测阶段

装饰阶段

#### 示例

```typescript
import { injectable, tagged } from "@husky-di/decorator";

// 错误：缺少 serviceIdentifier
@injectable()
class InvalidService {
  constructor(
    @tagged({ optional: true }) dep: unknown,
  ) {}
}
```

#### 解决方案

确保 `@tagged()` 的元数据包含 `serviceIdentifier`：

```typescript
@injectable()
class ValidService {
  constructor(
    @tagged({ serviceIdentifier: Dependency, optional: true }) dep: Dependency,
  ) {}
}
```

#### 相关 API

- [`@tagged()`](#tagged) - 低级参数装饰器
- [`InjectionMetadata`](#injectionmetadata) - 注入元数据接口

---

### E_INVALID_SERVICE_IDENTIFIER

`serviceIdentifier` 不是有效的类型时抛出的错误。

#### 错误信息模板

```
Invalid service identifier: {value}
```

#### 触发条件

- `serviceIdentifier` 不是以下之一：
  - 类构造函数函数
  - Symbol
  - 非空字符串

#### 检测阶段

装饰阶段

#### 示例

```typescript
import { injectable, inject } from "@husky-di/decorator";

// 错误：空字符串
@injectable()
class InvalidService {
  constructor(@inject("") dep: unknown) {}
}

// 错误：null
@injectable()
class InvalidService2 {
  constructor(@inject(null as any) dep: unknown) {}
}
```

#### 解决方案

使用有效的服务标识符：

```typescript
@injectable()
class ValidService {
  constructor(
    @inject(Dependency) dep1: Dependency,
    @inject(Symbol("Token")) dep2: unknown,
    @inject("StringToken") dep3: unknown,
  ) {}
}
```

#### 相关 API

- [`@inject()`](#inject) - 参数装饰器
- [`@tagged()`](#tagged) - 低级参数装饰器

---

### E_CONFLICTING_OPTIONS

`dynamic` 和 `ref` 选项同时为 `true` 时抛出的错误。

#### 错误信息模板

```
Cannot use both 'dynamic' and 'ref' options simultaneously
```

#### 触发条件

- 注入元数据中 `dynamic: true` 且 `ref: true`

#### 检测阶段

装饰阶段

#### 示例

```typescript
import { injectable, inject } from "@husky-di/decorator";

// 错误：冲突的选项
@injectable()
class InvalidService {
  constructor(
    @inject(Dependency, { dynamic: true, ref: true }) dep: unknown,
  ) {}
}
```

#### 解决方案

只能使用 `dynamic` 或 `ref` 其中之一：

```typescript
@injectable()
class ValidService {
  constructor(
    @inject(Dependency, { dynamic: true }) dep1: unknown,
    @inject(Dependency, { ref: true }) dep2: unknown,
  ) {}
}
```

#### 相关 API

- [`@inject()`](#inject) - 参数装饰器
- [`InjectionMetadata`](#injectionmetadata) - 注入元数据接口

---

### E_INCOMPLETE_METADATA

`@injectable()` 处理后，某些构造函数参数缺少元数据时抛出的错误。

#### 错误信息模板

```
Constructor '{className}' has incomplete injection metadata
```

#### 触发条件

- 元数据整合后，存在参数索引没有对应的元数据

#### 检测阶段

装饰阶段

#### 示例

```typescript
import { injectable } from "@husky-di/decorator";

// 错误：元数据不完整
@injectable()
class InvalidService {
  constructor(dep: unknown) {}
}
```

#### 解决方案

确保所有参数都有元数据（显式或隐式）：

```typescript
@injectable()
class ValidService {
  constructor(@inject(Dependency) dep: Dependency) {}
}
```

#### 相关 API

- [`@injectable()`](#injectable) - 类装饰器
- [`@inject()`](#inject) - 参数装饰器

---

## 附录

### 装饰器执行顺序

TypeScript 装饰器按以下顺序执行：

1. **参数装饰器**（从内到外，从左到右）
2. **类装饰器**（最后执行）

```typescript
@injectable()
class TestService {
  constructor(
    @inject(TokenA)
    @inject(TokenB)
    dep: unknown,
  ) {}
}
// 执行顺序：@inject(TokenB) -> @inject(TokenA) -> @injectable()
// 最终元数据：TokenA（最后执行的装饰器生效）
```

### TypeScript 配置要求

使用 `@husky-di/decorator` 需要在 `tsconfig.json` 中启用以下选项：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### 运行时要求

需要确保 Reflect API 可用，通常通过以下方式之一：

- 安装 `reflect-metadata` 包
- 使用支持元数据的运行时环境

```bash
npm install reflect-metadata
```

```typescript
// 在应用入口处导入
import "reflect-metadata";
```
