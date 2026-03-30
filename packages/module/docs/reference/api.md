# 模块 API 参考

@husky-di/module 的完整 API 参考文档。

## 核心 API

### createModule()

创建模块实例的工厂函数。

**函数签名：**

```typescript
function createModule(options: CreateModuleOptions): IModule
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `options` | [`CreateModuleOptions`](#createmoduleoptions) | 模块配置选项 |

**返回值：**

[`IModule`](#imodule) - 新创建的模块实例

**使用示例：**

```typescript
import { createModule, createServiceIdentifier } from '@husky-di/module';

const ILogger = createServiceIdentifier<ILogger>('ILogger');

// 创建基础模块
const LoggerModule = createModule({
  name: 'LoggerModule',
  declarations: [
    { serviceIdentifier: ILogger, useClass: ConsoleLogger }
  ],
  exports: [ILogger]
});

// 创建带导入的模块
const AppModule = createModule({
  name: 'AppModule',
  imports: [LoggerModule],
  declarations: [
    { serviceIdentifier: IApp, useClass: App }
  ],
  exports: [IApp]
});
```

**相关 API：**

- [`IModule`](#imodule) - 模块接口
- [`CreateModuleOptions`](#createmoduleoptions) - 创建模块选项类型

---

### IModule 接口

模块的核心接口，提供模块化依赖注入的所有功能。

**接口定义：**

```typescript
interface IModule extends 
  IUnique,
  IDisplayName,
  Pick<IContainer, 'resolve' | 'isRegistered' | 'getServiceIdentifiers' | 'use' | 'unused'> {
  readonly name: string;
  readonly declarations?: ReadonlyArray<Declaration<unknown>>;
  readonly imports?: ReadonlyArray<IModule | ModuleWithAliases>;
  readonly exports?: ReadonlyArray<ServiceIdentifier<unknown>>;
  readonly container: IContainer;
  withAliases(aliases: Alias[]): ModuleWithAliases;
}
```

**属性：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 模块的唯一标识符 |
| `name` | `string` | 模块的名称 |
| `displayName` | `string` | 模块的显示名称（格式：`name#id`） |
| `declarations` | `Declaration[]` | 模块声明的服务列表 |
| `imports` | `(IModule \| ModuleWithAliases)[]` | 导入的模块列表 |
| `exports` | `ServiceIdentifier[]` | 导出的服务标识符列表 |
| `container` | `IContainer` | 模块内部的容器实例 |

**方法：**

| 方法 | 说明 |
|------|------|
| [`resolve()`](#resolve-方法) | 解析模块导出的服务实例 |
| [`isRegistered()`](#isregistered-方法) | 检查服务是否在模块中注册 |
| [`getServiceIdentifiers()`](#getserviceidentifiers-方法) | 获取模块中所有服务标识符 |
| [`use()`](#use-方法) | 添加中间件到模块容器 |
| [`unused()`](#unused-方法) | 从模块容器移除中间件 |
| [`withAliases()`](#withaliases-方法) | 创建带别名的模块配置 |

**使用示例：**

```typescript
const module = createModule({
  name: 'MyModule',
  declarations: [
    { serviceIdentifier: MyService, useClass: MyService }
  ],
  exports: [MyService]
});

// 解析服务
const service = module.resolve(MyService);

// 检查服务是否注册
if (module.isRegistered(MyService)) {
  console.log('Service is registered');
}

// 获取所有服务标识符
const identifiers = module.getServiceIdentifiers();

// 访问底层容器
const container = module.container;
```

**相关 API：**

- [`createModule()`](#createmodule) - 模块工厂函数
- [`CreateModuleOptions`](#createmoduleoptions) - 创建模块选项
- [`withAliases()`](#withaliases-方法) - 创建带别名的模块

---

### resolve() 方法

从模块中解析服务实例。

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

根据选项返回不同类型：
- 默认返回 `T`
- `multiple: true` 返回 `T[]`
- `optional: true` 返回 `T \| undefined`
- `ref: true` 或 `dynamic: true` 返回 `Ref<T>`

**使用示例：**

```typescript
// 解析必需服务
const service = module.resolve(MyService);

// 解析可选服务
const optionalService = module.resolve(MyService, { optional: true });

// 解析多个服务
const services = module.resolve(MyService, { multiple: true });

// 解析为引用
const ref = module.resolve(MyService, { ref: true });
console.log(ref.value);
```

**异常：**

- `ResolveException` - 当服务无法解析且不是可选时抛出
- `ResolveException` - 当服务未从模块导出时抛出

**相关 API：**

- [`ServiceIdentifier`](#serviceidentifier) - 服务标识符类型
- [`ResolveOptions`](#resolveoptions) - 解析选项类型
- [`isRegistered()`](#isregistered-方法) - 检查服务是否注册

---

### isRegistered() 方法

检查服务是否已在模块中注册。

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
// 检查服务是否在当前模块注册
if (module.isRegistered(MyService)) {
  console.log('Service is registered in this module');
}

// 递归检查（包括模块容器的父容器）
if (module.isRegistered(MyService, { recursive: true })) {
  console.log('Service is registered in this or parent containers');
}
```

**相关 API：**

- [`resolve()`](#resolve-方法) - 解析方法
- [`getServiceIdentifiers()`](#getserviceidentifiers-方法) - 获取所有服务标识符

---

### use() 方法

向模块容器添加解析中间件。

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
module.use({
  name: 'logging',
  executor: (params, next) => {
    console.log(`[Module] 开始解析：${params.serviceIdentifier}`);
    const result = next(params);
    console.log(`[Module] 解析完成：${params.serviceIdentifier}`);
    return result;
  }
});

// 性能监控中间件
module.use({
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

---

### unused() 方法

从模块容器中移除中间件。

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
module.use(loggingMiddleware);

// ... 之后移除中间件
module.unused(loggingMiddleware);
```

**相关 API：**

- [`use()`](#use-方法) - 添加中间件方法

---

### withAliases() 方法

创建带别名的模块配置，用于解决导入命名冲突或重命名服务。

**方法签名：**

```typescript
withAliases(aliases: Alias[]): ModuleWithAliases
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `aliases` | [`Alias[]`](#alias) | 别名映射数组 |

**返回值：**

[`ModuleWithAliases`](#modulewithaliases) - 带别名的模块配置对象

**使用示例：**

```typescript
// 模块 A 导出 'logger'
const ModuleA = createModule({
  name: 'ModuleA',
  declarations: [
    { serviceIdentifier: 'logger', useClass: LoggerA }
  ],
  exports: ['logger']
});

// 模块 B 也导出 'logger'
const ModuleB = createModule({
  name: 'ModuleB',
  declarations: [
    { serviceIdentifier: 'logger', useClass: LoggerB }
  ],
  exports: ['logger']
});

// 使用别名解决冲突
const AppModule = createModule({
  name: 'AppModule',
  imports: [
    ModuleA,
    ModuleB.withAliases([
      { serviceIdentifier: 'logger', as: 'moduleLogger' }
    ])
  ],
  exports: ['logger', 'moduleLogger']
});

// 现在可以分别访问
const loggerA = AppModule.resolve('logger'); // 来自 ModuleA
const loggerB = AppModule.resolve('moduleLogger'); // 来自 ModuleB
```

**异常：**

- `E_ALIAS_SOURCE_NOT_EXPORTED` - 当别名的源服务标识符未从模块导出时抛出
- `E_DUPLICATE_ALIAS_MAP` - 当同一源服务标识符在单个别名列表中被映射多次时抛出

**相关 API：**

- [`Alias`](#alias) - 别名类型
- [`ModuleWithAliases`](#modulewithaliases) - 带别名的模块类型

---

## 类型定义

### CreateModuleOptions

创建模块时的配置选项类型。

**类型定义：**

```typescript
type CreateModuleOptions = {
  readonly name: string;
  readonly declarations?: Declaration<unknown>[];
  readonly imports?: Array<IModule | ModuleWithAliases>;
  readonly exports?: ServiceIdentifier<unknown>[];
};
```

**属性说明：**

| 属性 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 模块的名称，用于标识和调试 |
| `declarations` | [`Declaration[]`](#declaration) | 否 | 模块声明的服务列表 |
| `imports` | `(IModule \| ModuleWithAliases)[]` | 否 | 从其他模块导入的服务 |
| `exports` | `ServiceIdentifier[]` | 否 | 向外部暴露的服务标识符 |

**使用示例：**

```typescript
// 最小化模块
const EmptyModule = createModule({
  name: 'EmptyModule'
});

// 完整配置模块
const DatabaseModule = createModule({
  name: 'DatabaseModule',
  declarations: [
    { 
      serviceIdentifier: IDatabaseConfig, 
      useValue: { host: 'localhost', port: 3306 }
    },
    { 
      serviceIdentifier: IDatabase, 
      useClass: MySQLDatabase 
    }
  ],
  imports: [ConfigModule],
  exports: [IDatabase]
});
```

**相关 API：**

- [`createModule()`](#createmodule) - 模块工厂函数
- [`Declaration`](#declaration) - 声明类型
- [`IModule`](#imodule) - 模块接口

---

### ModuleDescriptor

模块描述符类型（此类型在内部使用，用于描述模块的配置）。

**类型定义：**

```typescript
type ModuleDescriptor = {
  readonly id: string;
  readonly name: string;
  readonly declarations: Declaration<unknown>[];
  readonly imports: Array<IModule | ModuleWithAliases>;
  readonly exports: ServiceIdentifier<unknown>[];
};
```

**属性说明：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 模块的唯一标识符 |
| `name` | `string` | 模块的名称 |
| `declarations` | [`Declaration[]`](#declaration) | 模块声明的服务 |
| `imports` | `(IModule \| ModuleWithAliases)[]` | 导入的模块 |
| `exports` | `ServiceIdentifier[]` | 导出的服务 |

**相关 API：**

- [`IModule`](#imodule) - 模块接口
- [`CreateModuleOptions`](#createmoduleoptions) - 创建模块选项

---

### Declaration

服务声明类型，定义如何在模块中注册服务。

**类型定义：**

```typescript
type Declaration<T> = CreateRegistrationOptions<T> & {
  readonly serviceIdentifier: ServiceIdentifier<T>;
};
```

**展开后的结构：**

```typescript
// 使用类声明
{
  serviceIdentifier: ServiceIdentifier<T>;
  useClass: Constructor<T>;
  lifecycle?: LifecycleEnum;
}

// 使用工厂声明
{
  serviceIdentifier: ServiceIdentifier<T>;
  useFactory: (container: IContainer, resolveContext: ResolveContext) => T;
  lifecycle?: LifecycleEnum;
}

// 使用值声明
{
  serviceIdentifier: ServiceIdentifier<T>;
  useValue: T;
  lifecycle?: LifecycleEnum;
}

// 使用别名声明
{
  serviceIdentifier: ServiceIdentifier<T>;
  useAlias: ServiceIdentifier<T>;
  getContainer?: () => IContainer;
}
```

**使用示例：**

```typescript
const declarations: Declaration<unknown>[] = [
  // 类声明
  { serviceIdentifier: ILogger, useClass: ConsoleLogger },
  
  // 值声明
  { serviceIdentifier: 'API_URL', useValue: 'https://api.example.com' },
  
  // 工厂声明
  { 
    serviceIdentifier: IDatabase, 
    useFactory: (container) => {
      const config = container.resolve(IDatabaseConfig);
      return new Database(config);
    }
  },
  
  // 别名声明
  { serviceIdentifier: 'MyLogger', useAlias: ILogger }
];
```

**相关 API：**

- [`CreateModuleOptions`](#createmoduleoptions) - 创建模块选项
- [`CreateRegistrationOptions`](#createregistrationoptions) - 注册选项类型

---

### Alias

别名类型，用于重命名导入的服务标识符。

**类型定义：**

```typescript
type Alias = {
  readonly serviceIdentifier: ServiceIdentifier<unknown>;
  readonly as: ServiceIdentifier<unknown>;
};
```

**属性说明：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `serviceIdentifier` | `ServiceIdentifier<unknown>` | 源服务标识符（必须已导出） |
| `as` | `ServiceIdentifier<unknown>` | 目标别名标识符 |

**使用示例：**

```typescript
// 重命名服务
const aliases: Alias[] = [
  { serviceIdentifier: 'logger', as: 'appLogger' },
  { serviceIdentifier: 'config', as: 'appConfig' }
];

// 使用别名
const moduleWithAliases = sourceModule.withAliases(aliases);

const consumerModule = createModule({
  name: 'ConsumerModule',
  imports: [moduleWithAliases],
  exports: ['appLogger', 'appConfig']
});
```

**注意事项：**

- `serviceIdentifier` 必须是源模块导出的服务
- `as` 不能与目标模块的本地声明冲突
- 同一 `serviceIdentifier` 不能在单个别名列表中映射多次

**相关 API：**

- [`withAliases()`](#withaliases-方法) - 创建带别名的模块
- [`ModuleWithAliases`](#modulewithaliases) - 带别名的模块类型

---

### ModuleWithAliases

带别名的模块配置类型。

**类型定义：**

```typescript
type ModuleWithAliases = {
  readonly module: IModule;
  readonly aliases?: Alias[];
};
```

**属性说明：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `module` | [`IModule`](#imodule) | 原始模块实例 |
| `aliases` | [`Alias[]`](#alias) | 别名映射列表 |

**使用示例：**

```typescript
const ModuleA = createModule({
  name: 'ModuleA',
  declarations: [{ serviceIdentifier: 'foo', useValue: 'foo' }],
  exports: ['foo']
});

// 创建带别名的模块配置
const aliasedModule: ModuleWithAliases = ModuleA.withAliases([
  { serviceIdentifier: 'foo', as: 'bar' }
]);

// 在导入时使用
const ModuleB = createModule({
  name: 'ModuleB',
  imports: [aliasedModule],
  exports: ['bar']
});
```

**相关 API：**

- [`IModule`](#imodule) - 模块接口
- [`Alias`](#alias) - 别名类型
- [`withAliases()`](#withaliases-方法) - 创建带别名的模块

---

## 错误代码

### E_DUPLICATE_DECLARATION

模块中包含多个具有相同 ServiceIdentifier 的声明。

**错误代码：**

```typescript
E_DUPLICATE_DECLARATION: "E_DUPLICATE_DECLARATION"
```

**触发条件：**

- 同一模块中多次声明相同的服务标识符

**错误信息格式：**

```
Duplicate declaration of service identifier "<identifier>" in module "<displayName>".
```

**使用示例：**

```typescript
// 错误示例
createModule({
  name: 'TestModule',
  declarations: [
    { serviceIdentifier: 'foo', useValue: 1 },
    { serviceIdentifier: 'foo', useValue: 2 } // 重复声明
  ]
});
// 抛出：Duplicate declaration of service identifier "foo" in module "TestModule#..."

// 正确示例
createModule({
  name: 'TestModule',
  declarations: [
    { serviceIdentifier: 'foo', useValue: 1 },
    { serviceIdentifier: 'bar', useValue: 2 } // 不同标识符
  ]
});
```

**相关 API：**

- [`CreateModuleOptions`](#createmoduleoptions) - 创建模块选项
- [`Declaration`](#declaration) - 声明类型

---

### E_INVALID_REGISTRATION

声明缺少有效的注册策略（useClass、useFactory、useValue 或 useAlias）。

**错误代码：**

```typescript
E_INVALID_REGISTRATION: "E_INVALID_REGISTRATION"
```

**触发条件：**

- 声明未指定任何注册策略

**错误信息格式：**

```
Invalid registration options for service identifier "<identifier>" in module "<displayName>": must specify useClass, useFactory, useValue, or useAlias.
```

**使用示例：**

```typescript
// 错误示例
createModule({
  name: 'TestModule',
  declarations: [
    { serviceIdentifier: 'foo' } // 缺少注册策略
  ]
});
// 抛出：Invalid registration options for service identifier "foo"...

// 正确示例
createModule({
  name: 'TestModule',
  declarations: [
    { serviceIdentifier: 'foo', useClass: FooService }
  ]
});
```

**相关 API：**

- [`Declaration`](#declaration) - 声明类型
- [`CreateRegistrationOptions`](#createregistrationoptions) - 注册选项类型

---

### E_DUPLICATE_IMPORT_MODULE

同一模块实例在单个导入列表中被多次导入。

**错误代码：**

```typescript
E_DUPLICATE_IMPORT_MODULE: "E_DUPLICATE_IMPORT_MODULE"
```

**触发条件：**

- 同一模块实例在 imports 数组中出现多次

**错误信息格式：**

```
Duplicate import module: "<displayName>" in "<targetDisplayName>".
```

**使用示例：**

```typescript
const ModuleA = createModule({ name: 'ModuleA' });

// 错误示例
createModule({
  name: 'TestModule',
  imports: [ModuleA, ModuleA] // 重复导入
});
// 抛出：Duplicate import module: "ModuleA#..." in "TestModule#..."

// 正确示例
createModule({
  name: 'TestModule',
  imports: [ModuleA]
});
```

**相关 API：**

- [`CreateModuleOptions`](#createmoduleoptions) - 创建模块选项

---

### E_CIRCULAR_DEPENDENCY

模块导入图中检测到循环依赖。

**错误代码：**

```typescript
E_CIRCULAR_DEPENDENCY: "E_CIRCULAR_DEPENDENCY"
```

**触发条件：**

- 模块 A 导入模块 B，模块 B 直接或间接导入模块 A

**错误信息格式：**

```
Circular dependency detected: <moduleChain>
```

**使用示例：**

```typescript
// 间接循环依赖示例
// ModuleA -> ModuleB -> ModuleC -> ModuleA (循环)
const ModuleA = createModule({
  name: 'ModuleA',
  imports: [ModuleC], // 在 ModuleC 创建前无法实际创建
  exports: ['a']
});

// 避免循环依赖
// ModuleA -> ModuleB -> ModuleC (线性依赖)
const ModuleA = createModule({
  name: 'ModuleA',
  declarations: [{ serviceIdentifier: 'a', useValue: 'a' }],
  exports: ['a']
});

const ModuleB = createModule({
  name: 'ModuleB',
  imports: [ModuleA],
  declarations: [{ serviceIdentifier: 'b', useValue: 'b' }],
  exports: ['b']
});

const ModuleC = createModule({
  name: 'ModuleC',
  imports: [ModuleB],
  declarations: [{ serviceIdentifier: 'c', useValue: 'c' }],
  exports: ['c']
});
```

**相关 API：**

- [`CreateModuleOptions`](#createmoduleoptions) - 创建模块选项

---

### E_IMPORT_COLLISION

多个导入的模块导出相同的服务标识符且未使用别名解决冲突。

**错误代码：**

```typescript
E_IMPORT_COLLISION: "E_IMPORT_COLLISION"
```

**触发条件：**

- 两个或多个导入的模块导出同一服务标识符
- 未使用别名重命名冲突的服务

**错误信息格式：**

```
Service identifier "<identifier>" is exported by multiple imported modules: <moduleList>. Consider using aliases to resolve the conflict.
```

**使用示例：**

```typescript
const ModuleA = createModule({
  name: 'ModuleA',
  declarations: [{ serviceIdentifier: 'foo', useValue: 'A' }],
  exports: ['foo']
});

const ModuleB = createModule({
  name: 'ModuleB',
  declarations: [{ serviceIdentifier: 'foo', useValue: 'B' }],
  exports: ['foo']
});

// 错误示例
createModule({
  name: 'ModuleC',
  imports: [ModuleA, ModuleB] // 冲突：两个模块都导出 'foo'
});
// 抛出：Service identifier "foo" is exported by multiple imported modules...

// 正确示例 - 使用别名解决冲突
createModule({
  name: 'ModuleC',
  imports: [
    ModuleA,
    ModuleB.withAliases([{ serviceIdentifier: 'foo', as: 'fooFromB' }])
  ],
  exports: ['foo', 'fooFromB']
});
```

**相关 API：**

- [`withAliases()`](#withaliases-方法) - 创建带别名的模块
- [`Alias`](#alias) - 别名类型

---

### E_ALIAS_SOURCE_NOT_EXPORTED

别名的源服务标识符未从源模块导出。

**错误代码：**

```typescript
E_ALIAS_SOURCE_NOT_EXPORTED: "E_ALIAS_SOURCE_NOT_EXPORTED"
```

**触发条件：**

- 尝试为未导出的服务创建别名

**错误信息格式：**

```
Cannot alias service identifier "<identifier>" from module "<displayName>": it is not exported from that module.
```

**使用示例：**

```typescript
const ModuleA = createModule({
  name: 'ModuleA',
  declarations: [
    { serviceIdentifier: 'foo', useValue: 'foo' },
    { serviceIdentifier: 'bar', useValue: 'bar' }
  ],
  exports: ['foo'] // 只导出 'foo'
});

// 错误示例
ModuleA.withAliases([
  { serviceIdentifier: 'bar', as: 'baz' } // 'bar' 未导出
]);
// 抛出：Cannot alias service identifier "bar" from module "ModuleA#..."

// 正确示例
ModuleA.withAliases([
  { serviceIdentifier: 'foo', as: 'baz' } // 'foo' 已导出
]);
```

**相关 API：**

- [`withAliases()`](#withaliases-方法) - 创建带别名的模块
- [`Alias`](#alias) - 别名类型

---

### E_ALIAS_CONFLICT_LOCAL

别名与导入模块中的本地声明冲突。

**错误代码：**

```typescript
E_ALIAS_CONFLICT_LOCAL: "E_ALIAS_CONFLICT_LOCAL"
```

**触发条件：**

- 别名的目标名称与模块的本地声明重复

**错误信息格式：**

```
Alias "<alias>" conflicts with local declaration in module "<displayName>".
```

**使用示例：**

```typescript
const ModuleA = createModule({
  name: 'ModuleA',
  declarations: [{ serviceIdentifier: 'foo', useValue: 'foo' }],
  exports: ['foo']
});

// 错误示例
createModule({
  name: 'ModuleB',
  declarations: [{ serviceIdentifier: 'bar', useValue: 'bar' }],
  imports: [
    ModuleA.withAliases([{ serviceIdentifier: 'foo', as: 'bar' }]) // 与本地声明冲突
  ]
});
// 抛出：Alias "bar" conflicts with local declaration in module "ModuleB#..."

// 正确示例
createModule({
  name: 'ModuleB',
  declarations: [{ serviceIdentifier: 'bar', useValue: 'bar' }],
  imports: [
    ModuleA.withAliases([{ serviceIdentifier: 'foo', as: 'fooAlias' }]) // 使用不同名称
  ]
});
```

**相关 API：**

- [`withAliases()`](#withaliases-方法) - 创建带别名的模块
- [`Declaration`](#declaration) - 声明类型

---

### E_EXPORT_NOT_FOUND

导出引用了一个既未在本地声明也未从导入模块中获取的服务标识符。

**错误代码：**

```typescript
E_EXPORT_NOT_FOUND: "E_EXPORT_NOT_FOUND"
```

**触发条件：**

- exports 列表中的服务标识符未在模块中声明或导入

**错误信息格式：**

```
Cannot export service identifier "<identifier>" from "<displayName>": it is not declared in this module or imported from any imported module.
```

**使用示例：**

```typescript
// 错误示例
createModule({
  name: 'TestModule',
  exports: ['nonexistent'] // 未声明也未导入
});
// 抛出：Cannot export service identifier "nonexistent" from "TestModule#..."

// 正确示例 - 导出本地声明
createModule({
  name: 'TestModule',
  declarations: [{ serviceIdentifier: 'foo', useValue: 'foo' }],
  exports: ['foo']
});

// 正确示例 - 导出导入的服务
const ModuleA = createModule({
  name: 'ModuleA',
  declarations: [{ serviceIdentifier: 'foo', useValue: 'foo' }],
  exports: ['foo']
});

createModule({
  name: 'ModuleB',
  imports: [ModuleA],
  exports: ['foo'] // 重新导出
});
```

**相关 API：**

- [`CreateModuleOptions`](#createmoduleoptions) - 创建模块选项

---

## 附录

### 从 @husky-di/core 继承的类型

以下类型从 `@husky-di/core` 包继承，在模块 API 中广泛使用：

**服务标识符类型：**

```typescript
type ServiceIdentifier<T> =
  | AbstractConstructor<T>
  | Constructor<T>
  | string
  | symbol;
```

**注册选项类型：**

```typescript
type CreateRegistrationOptions<T> =
  | CreateClassRegistrationOptions<T>
  | CreateFactoryRegistrationOptions<T>
  | CreateValueRegistrationOptions<T>
  | CreateAliasRegistrationOptions<T>;
```

**解析选项类型：**

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

**中间件类型：**

```typescript
type ResolveMiddleware<T, O extends ResolveOptions<T>> = Middleware<
  ResolveMiddlewareParams<T, O>,
  ResolveInstance<T, O>
>;
```

**相关文档：**

- [@husky-di/core API 参考](../../../core/docs/reference/api.md)
