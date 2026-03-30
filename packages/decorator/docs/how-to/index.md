# 装饰器操作指南

本指南提供 @husky-di/decorator 包的常见使用场景和解决方案，采用"问题 - 解决方案"结构组织内容。

## 基础使用

### 如何使用 @injectable() 标记类

**问题：** 如何让依赖注入容器识别并管理一个类？

**解决方案：**

1. 从 `@husky-di/decorator` 导入 `injectable` 装饰器
2. 在类定义上方使用 `@injectable()` 装饰器

```typescript
import { injectable } from "@husky-di/decorator";

@injectable()
class UserService {
  constructor() {}
}
```

**注意事项：**
- 同一个类不能重复使用 `@injectable()`，否则会抛出错误
- 被注入的依赖类也必须使用 `@injectable()` 标记

### 如何使用 @inject() 注入构造函数参数

**问题：** 如何在构造函数中声明依赖关系？

**解决方案：**

1. 从 `@husky-di/decorator` 导入 `inject` 装饰器
2. 在构造函数参数前使用 `@inject(服务标识符)`

```typescript
import { inject, injectable } from "@husky-di/decorator";

@injectable()
class LoggerService {
  log(message: string) {
    return `Logged: ${message}`;
  }
}

@injectable()
class UserService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}
}
```

**支持的服务标识符类型：**
- 类构造函数
- Symbol
- 字符串

### 如何配置 TypeScript 装饰器支持

**问题：** 如何配置 TypeScript 以支持装饰器？

**解决方案：**

在 `tsconfig.json` 中启用以下编译器选项：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

**选项说明：**
- `experimentalDecorators`: 启用装饰器语法支持
- `emitDecoratorMetadata`: 发射设计类型元数据（必需）

**完整配置示例：**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

## 注入选项

### 如何使用 optional 进行可选注入

**问题：** 如何处理可能不存在的依赖？

**解决方案：**

使用 `@inject()` 的 `optional` 选项，当依赖不存在时返回 `undefined` 而不是抛出错误。

```typescript
import { inject, injectable } from "@husky-di/decorator";

const OPTIONAL_TOKEN = Symbol("OptionalToken");

@injectable()
class TestService {
  constructor(
    @inject(OPTIONAL_TOKEN, { optional: true })
    public optionalService?: unknown
  ) {}
}

// 即使 OPTIONAL_TOKEN 未注册，也不会抛出错误
const instance = container.resolve(TestService);
console.log(instance.optionalService); // undefined
```

**使用场景：**
- 插件系统的可选功能
- 条件性功能模块
- 向后兼容的可选依赖

### 如何使用 dynamic 进行动态注入

**问题：** 如何获取服务的动态引用，使其在每次访问时重新解析？

**解决方案：**

使用 `@inject()` 的 `dynamic` 选项，返回一个动态引用对象。

```typescript
import { inject, injectable } from "@husky-di/decorator";
import type { Ref } from "@husky-di/core";

@injectable()
class ConfigService {
  value = "initial";
  
  updateValue(newValue: string) {
    this.value = newValue;
  }
}

@injectable()
class CacheService {
  constructor(
    @inject(ConfigService, { dynamic: true })
    private configRef: Ref<ConfigService>
  ) {}

  getConfigValue() {
    // 每次访问都重新解析
    return this.configRef.current.value;
  }
}
```

**注意事项：**
- `dynamic` 选项会创建闭包引用，可能导致内存泄漏
- 仅在需要时才使用此选项

### 如何使用 ref 进行引用注入

**问题：** 如何获取服务的引用包装器，用于延迟解析？

**解决方案：**

使用 `@inject()` 的 `ref` 选项，返回一个 `Ref<T>` 引用对象。

```typescript
import { inject, injectable } from "@husky-di/decorator";
import type { Ref } from "@husky-di/core";

@injectable()
class DependencyService {
  value = "test";
}

@injectable()
class TestService {
  constructor(
    @inject(DependencyService, { ref: true })
    public depRef: Ref<DependencyService>
  ) {}
}

const instance = container.resolve(TestService);

// 引用对象特性
console.log(instance.depRef.resolved); // false（尚未访问）
console.log(instance.depRef.current.value); // "test"
console.log(instance.depRef.resolved); // true（已解析）
```

**使用场景：**
- 打破循环依赖
- 延迟初始化重型服务
- 控制解析时机

### 如何指定特定的容器进行解析

**问题：** 如何从特定容器而非默认容器解析依赖？

**解决方案：**

使用 `@inject()` 的 `container` 选项指定目标容器。

```typescript
import { inject, injectable } from "@husky-di/decorator";
import { createContainer } from "@husky-di/core";

const childContainer = createContainer();

@injectable()
class ChildService {
  name = "child";
}

@injectable()
class ParentService {
  constructor(
    @inject(ChildService, { container: childContainer })
    public child: ChildService
  ) {}
}
```

**注意事项：**
- 指定的容器必须已注册该服务
- 容器必须在装饰器执行前创建

## 集成配置

### 如何注册 decoratorMiddleware

**问题：** 如何让装饰器中间件生效？

**解决方案：**

1. 从 `@husky-di/core` 导入 `globalMiddleware`
2. 从 `@husky-di/decorator` 导入 `decoratorMiddleware`
3. 在应用启动时注册中间件

```typescript
import { globalMiddleware } from "@husky-di/core";
import { decoratorMiddleware } from "@husky-di/decorator";

// 注册装饰器中间件（只需执行一次）
globalMiddleware.use(decoratorMiddleware);
```

**注册时机：**
- 应用启动时
- 在任何容器创建或解析之前
- 通常在入口文件的顶部

### 如何与 @husky-di/core 配合使用

**问题：** 如何将装饰器包与核心包集成？

**解决方案：**

完整集成步骤：

```typescript
import "reflect-metadata";
import { createContainer, globalMiddleware } from "@husky-di/core";
import { decoratorMiddleware, inject, injectable } from "@husky-di/decorator";

// 1. 注册装饰器中间件
globalMiddleware.use(decoratorMiddleware);

// 2. 创建容器
const container = createContainer();

// 3. 定义服务
@injectable()
class LoggerService {
  log(message: string) {
    return `[LOG]: ${message}`;
  }
}

@injectable()
class UserService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}
  
  getUser(id: string) {
    return this.logger.log(`Getting user ${id}`);
  }
}

// 4. 解析服务
const userService = container.resolve(UserService);
console.log(userService.getUser("123"));
```

### 如何在项目启用装饰器

**问题：** 如何在项目中完整启用装饰器功能？

**解决方案：**

**步骤 1：安装依赖**

```bash
pnpm add @husky-di/decorator reflect-metadata
```

**步骤 2：配置 TypeScript**

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

**步骤 3：引入 reflect-metadata**

在入口文件顶部添加：

```typescript
import "reflect-metadata";
```

**步骤 4：注册中间件**

```typescript
import { globalMiddleware } from "@husky-di/core";
import { decoratorMiddleware } from "@husky-di/decorator";

globalMiddleware.use(decoratorMiddleware);
```

**步骤 5：使用装饰器**

```typescript
import { inject, injectable } from "@husky-di/decorator";

@injectable()
class MyService {}
```

## 高级用法

### 如何处理循环依赖

**问题：** 两个服务相互依赖导致循环依赖错误？

**解决方案：**

使用 `ref` 或 `dynamic` 选项打破循环依赖链。

```typescript
import { inject, injectable } from "@husky-di/decorator";
import type { Ref } from "@husky-di/core";

@injectable()
class ServiceA {
  constructor(
    // 使用 ref 选项打破循环
    @inject("ServiceB", { ref: true })
    public serviceBRef: Ref<ServiceB>
  ) {}
  
  doSomething() {
    // 延迟访问，避免循环
    return this.serviceBRef.current.doOtherThing();
  }
}

@injectable()
class ServiceB {
  constructor(
    @inject(ServiceA) public serviceA: ServiceA
  ) {}
  
  doOtherThing() {
    return "done";
  }
}

// 注册 ServiceB 的符号标识符
container.register("ServiceB", { useClass: ServiceB });
```

**替代方案：** 使用 `dynamic` 选项

```typescript
@injectable()
class ServiceA {
  constructor(
    @inject("ServiceB", { dynamic: true })
    private serviceBRef: Ref<ServiceB>
  ) {}
}
```

### 如何注入接口类型（使用 InjectionToken）

**问题：** TypeScript 接口在运行时不存在，如何注入？

**解决方案：**

使用 Symbol 或字符串作为接口类型的标识符（InjectionToken）。

```typescript
import { inject, injectable } from "@husky-di/decorator";

// 1. 创建接口
interface ILogger {
  log(message: string): void;
}

// 2. 创建 InjectionToken
const ILoggerToken = Symbol("ILogger");

// 3. 实现接口
@injectable()
class ConsoleLogger implements ILogger {
  log(message: string) {
    console.log(message);
  }
}

// 4. 注册实现
container.register(ILoggerToken, { useClass: ConsoleLogger });

// 5. 注入接口
@injectable()
class UserService {
  constructor(@inject(ILoggerToken) private logger: ILogger) {}
}
```

**使用字符串标识符：**

```typescript
// 使用字符串作为 Token
const ILoggerToken = "ILogger";

container.register(ILoggerToken, { useClass: ConsoleLogger });

@injectable()
class UserService {
  constructor(@inject(ILoggerToken) private logger: ILogger) {}
}
```

### 如何创建自定义装饰器

**问题：** 如何创建封装特定注入逻辑的自定义装饰器？

**解决方案：**

使用底层的 `tagged` 装饰器创建自定义装饰器。

```typescript
import { tagged, injectable } from "@husky-di/decorator";
import type { InjectionMetadata } from "@husky-di/decorator";

// 创建可选注入装饰器
export const injectOptional = <T>(
  serviceIdentifier: InjectionMetadata<T>["serviceIdentifier"]
) => {
  return tagged({ serviceIdentifier, optional: true });
};

// 创建懒加载注入装饰器
export const injectLazy = <T>(
  serviceIdentifier: InjectionMetadata<T>["serviceIdentifier"]
) => {
  return tagged({ serviceIdentifier, ref: true });
};

// 使用自定义装饰器
@injectable()
class TestService {
  constructor(
    @injectOptional("OptionalService") public optional?: unknown,
    @injectLazy("LazyService") public lazyRef: Ref<unknown>
  ) {}
}
```

### 如何使用 @tagged() 低级装饰器

**问题：** 如何直接操作注入元数据？

**解决方案：**

使用 `tagged` 装饰器直接附加完整的注入元数据。

```typescript
import { tagged, injectable } from "@husky-di/decorator";

@injectable()
class DependencyService {
  value = "test";
}

@injectable()
class TestService {
  constructor(
    // tagged 接受完整的 InjectionMetadata 对象
    @tagged({
      serviceIdentifier: DependencyService,
      optional: false,
      ref: true,
    })
    public depRef: Ref<DependencyService>
  ) {}
}
```

**tagged vs inject：**
- `inject`: 高层 API，接受 serviceIdentifier 和 options 参数
- `tagged`: 底层 API，直接接受完整的元数据对象

```typescript
// 等价写法
@inject(DependencyService, { ref: true })
// 等同于
@tagged({ serviceIdentifier: DependencyService, ref: true })
```

## 故障排除

### 常见错误：忘记使用 @injectable()

**错误信息：**
```
Class 'XXX' must be decorated with @Injectable()
```

**问题原因：**
被注入的类没有使用 `@injectable()` 装饰器标记。

**错误示例：**

```typescript
// 错误：DependencyService 没有 @injectable()
class DependencyService {}

@injectable()
class TestService {
  constructor(@inject(DependencyService) public dep: DependencyService) {}
}
```

**解决方案：**

```typescript
// 正确：添加 @injectable() 装饰器
@injectable()
class DependencyService {}

@injectable()
class TestService {
  constructor(@inject(DependencyService) public dep: DependencyService) {}
}
```

### 常见错误：未配置 reflect-metadata

**错误信息：**
```
Reflect is not defined
```
或
```
Cannot read properties of undefined (reading 'getMetadata')
```

**问题原因：**
- 未安装 `reflect-metadata` 包
- 未在代码中引入 `reflect-metadata`

**解决方案：**

1. 安装包：
```bash
pnpm add reflect-metadata
```

2. 在入口文件顶部引入：
```typescript
import "reflect-metadata";
```

3. 确保引入语句在所有依赖注入代码之前执行。

### 常见错误：TypeScript 配置不正确

**错误信息：**
```
Experimental support for decorators is a feature that is subject to change
```
或
```
Parameter type inference is not working correctly
```

**问题原因：**
`tsconfig.json` 中未正确配置装饰器选项。

**解决方案：**

确保 `tsconfig.json` 包含以下配置：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

**验证步骤：**
1. 检查 `tsconfig.json` 是否包含上述选项
2. 重启 TypeScript 语言服务器
3. 重新编译项目

### 常见错误：循环依赖错误

**错误信息：**
```
Circular dependency detected for service identifier "XXX"
```

**问题原因：**
两个或多个服务形成循环依赖链。

**错误示例：**

```typescript
// 错误：ServiceA 和 ServiceB 相互依赖
@injectable()
class ServiceA {
  constructor(@inject(ServiceB) public b: ServiceB) {}
}

@injectable()
class ServiceB {
  constructor(@inject(ServiceA) public a: ServiceA) {}
}
```

**解决方案 1：使用 ref 选项**

```typescript
@injectable()
class ServiceA {
  constructor(
    @inject(ServiceB, { ref: true })
    public bRef: Ref<ServiceB>
  ) {}
  
  doSomething() {
    return this.bRef.current.doOtherThing();
  }
}
```

**解决方案 2：使用 dynamic 选项**

```typescript
@injectable()
class ServiceA {
  constructor(
    @inject(ServiceB, { dynamic: true })
    public bRef: Ref<ServiceB>
  ) {}
}
```

**解决方案 3：重构代码结构**

```typescript
// 提取共同依赖到第三个服务
@injectable()
class SharedService {
  // 共享逻辑
}

@injectable()
class ServiceA {
  constructor(@inject(SharedService) public shared: SharedService) {}
}

@injectable()
class ServiceB {
  constructor(@inject(SharedService) public shared: SharedService) {}
}
```

### 常见错误：重复使用 @injectable()

**错误信息：**
```
Class 'XXX' is already decorated with @Injectable()
```

**问题原因：**
同一个类被多次应用 `@injectable()` 装饰器。

**错误示例：**

```typescript
// 错误：重复的装饰器
@injectable()
@injectable()
class TestService {}
```

**解决方案：**

```typescript
// 正确：只使用一次
@injectable()
class TestService {}
```

**注意：** 装饰器堆叠时要小心，确保没有重复。

### 常见错误：注入原始类型

**错误信息：**
```
Constructor 'XXX' parameter #N must be a class type
```

**问题原因：**
TypeScript 的 `design:paramtypes` 对原始类型的推断可能不正确。

**解决方案：**

对于原始类型（string、number 等），使用显式的 InjectionToken：

```typescript
// 可能出错
@injectable()
class TestService {
  constructor(public name: string) {}
}

// 正确：使用 Token
const NameToken = Symbol("Name");

@injectable()
class TestService {
  constructor(@inject(NameToken) public name: string) {}
}

container.register(NameToken, { useValue: "test" });
```
