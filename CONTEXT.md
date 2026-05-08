# Husky DI Context

本文档记录 `husky-di` 的领域语言、设计边界和仓库约定。工程类技能在做诊断、TDD、架构分析或 issue 拆分前，应先读取本文档。

## 项目定位

`husky-di` 是一个现代 TypeScript 依赖注入框架。它的核心目标是提供一个类型安全、行为确定、可测试、可内省的依赖管理系统。

本项目采用 monorepo 结构，当前主要包包括：

- `@husky-di/core`：核心 DI 容器、注册、解析、生命周期、中间件、引用、释放能力。
- `@husky-di/decorator`：基于 TypeScript experimental decorators 和 `reflect-metadata` 的构造函数注入支持。
- `@husky-di/module`：借鉴 ESM import/export 语义的模块化 DI 系统。
- `@husky-di/website`：位于 `docs/` 的 Rspress 文档站点。

根 README 提到过 `@husky-di/react`，但当前工作区没有对应 package。不要在实现或文档中假设它已经存在。

## 核心设计原则

- 依赖由外部提供，而不是由业务对象自行创建。这是本项目对 DI 和 IoC 的基本理解。
- 优先支持构造函数注入。属性注入和方法注入不是核心模型，必要时通过 factory 或显式 `resolve` 组合完成。
- 运行时行为必须可预测。注册、解析、生命周期、模块导入导出、错误条件都应有明确规则。
- 类型安全优先。公开 API 应尽量让 TypeScript 推断出正确的解析结果，包括 `optional`、`multiple`、`ref` 和 `dynamic` 的组合。
- 容器行为应可内省。解析链、循环依赖、服务标识符名称和错误信息都要帮助用户定位问题。
- 包之间保持清晰边界。`decorator` 和 `module` 依赖 `core`，但 `core` 不依赖上层集成包。

## 领域词汇

### DI 与容器

- **Dependency Injection / DI**：依赖注入。对象通过外部传入依赖，而不是自己创建依赖。
- **IoC**：控制反转。DI 是本项目采用的 IoC 实现方式。
- **Container**：依赖注入容器。负责注册服务、解析服务、管理生命周期、执行中间件和释放资源。
- **Root Container**：`Container.rootContainer` 暴露出的根容器。工具函数 `resolve` 会使用当前解析上下文或根容器完成解析。
- **Parent Container / Child Container**：父子容器关系。解析时先查当前容器，再向父容器查找；子容器注册不会影响父容器。

### 注册与解析

- **ServiceIdentifier**：服务标识符。可以是 class constructor、abstract constructor、string 或 symbol。推荐使用 `createServiceIdentifier<T>()` 创建有类型的标识符。
- **Registration**：服务标识符与 provider 策略的绑定。
- **Provider**：服务创建策略。当前模型支持 `useClass`、`useFactory`、`useValue`、`useAlias`，并要求一次注册只使用一种策略。
- **Resolution**：解析过程。根据 `ServiceIdentifier` 从容器获取服务实例。
- **ResolveOptions**：解析选项。包括 `optional`、`defaultValue`、`multiple`、`ref`、`dynamic`。
- **ResolveContext**：一次解析链内共享的上下文，用于 resolution lifecycle 和内部解析状态。
- **ResolveRecord**：记录解析路径的树结构，用于错误信息和循环依赖检测。
- **ResolveException**：解析失败、循环依赖、非法选项等场景的核心异常类型。

### 生命周期

- **LifecycleEnum.transient**：默认生命周期。每次解析创建新实例。
- **LifecycleEnum.singleton**：容器级单例。首次解析创建实例，之后在同一容器内复用。
- **LifecycleEnum.resolution**：解析链级单例。同一次解析链中复用，解析链结束后不跨链复用。
- **Disposable / dispose**：释放容器或资源。容器释放后应拒绝后续操作；重复 `dispose()` 应保持幂等；释放父容器不会自动释放子容器。

### 引用

- **Ref**：通过 `.current` 暴露实例的引用包装器。
- **Static Ref / `ref: true`**：延迟解析并缓存引用结果，适合打破部分循环依赖或推迟实例化。
- **Dynamic Ref / `dynamic: true`**：每次访问 `.current` 都重新解析。它会持有解析记录和上下文闭包，可能造成内存泄漏；除非确有必要，不要优先使用。

### 中间件

- **Middleware**：拦截解析过程的函数对象。可以观察参数、转换结果、执行副作用，或不调用 `next()` 来短路解析。
- **Global Middleware**：通过 `globalMiddleware` 注册，对所有容器生效。
- **Local Middleware**：通过 `container.use()` 或 `module.use()` 注册，只作用于当前容器或模块容器。
- **Middleware Order**：中间件按 LIFO 执行。局部中间件位于外层，之后进入全局中间件，最后到 provider。
- **onContainerDispose**：中间件可选的释放钩子。容器释放时调用，异常应被吞掉，不能中断释放流程。

### 装饰器包

- **Injectable Class**：被 `@injectable()` 标记、可被装饰器中间件实例化的类。
- **Injection Metadata**：构造函数参数的注入元数据，包括 `serviceIdentifier`、`container`、`dynamic`、`ref`、`optional`。
- **`@injectable()`**：类装饰器。合并构造函数参数元数据，并标记类可注入。
- **`@inject()`**：参数装饰器。为构造函数参数声明服务标识符和解析选项。
- **`@tagged()`**：底层参数元数据装饰器，`@inject()` 可视为它的便捷封装。
- **`decoratorMiddleware`**：读取 injection metadata 并参与构造函数注入的中间件。使用装饰器注入时需要注册到 `globalMiddleware` 或容器中。
- **Reflection Metadata**：通过 Reflect API 读取的 TypeScript 编译期参数类型信息。此包依赖 `reflect-metadata` 或兼容实现。

装饰器包只支持 TypeScript experimental decorators，不支持 ES decorators。原因是当前 ES decorators 规范没有参数装饰器，不能表达本项目需要的构造函数参数注入。

### 模块包

- **Module**：封装 declarations、imports、exports 的逻辑单元。
- **Declaration**：模块本地服务声明，等价于 ESM 中模块内部定义的变量或类。
- **Import**：导入其他模块暴露的服务。
- **Export**：向外暴露本模块声明或转发导入的服务。
- **Alias**：导入时重命名服务标识符，类似 `import { foo as bar }`。
- **Import Scope**：某个 Module 从 imports 中获得的可见服务集合。alias 只重命名被映射的导入项；未被 alias 映射的 imported exports 仍以原服务标识符进入 Import Scope。
- **Export Guard**：模块容器上的保护中间件，用来阻止外部解析未导出的服务。

模块系统借鉴 ESM 语义：导入必须明确，导出边界必须明确，命名冲突应在创建模块时暴露，而不是留到运行时变成歧义。

## 行为约束

- 同一个 `ServiceIdentifier` 可以在同一容器中多次注册。
- 默认解析单个服务时采用 last-write-wins，返回最新注册。
- 使用 `multiple: true` 时返回该标识符的所有注册实例。
- `optional: true` 且未找到服务时返回 `undefined` 或 `defaultValue`；非 optional 未找到服务时抛出 `ResolveException`。
- `ref` 和 `dynamic` 互斥，不能同时为 true。
- 循环依赖通过 `ResolveRecord` 检测。错误信息应包含可读的解析路径，并提示可考虑 `ref` 或 `dynamic`。
- 服务查找遵循当前容器优先、父容器兜底的顺序。
- 本地中间件不会通过父子容器关系继承；服务注册会沿父容器查找，但中间件链不随容器层级继承。
- 模块 declarations 不能重复，imports 不能重复，exports 不能重复。
- 模块 import graph 不应出现循环依赖。
- 多个 imported modules 导出同名服务时，必须通过 alias 消除冲突。
- 模块只能 export 本地 declaration、显式 import 的 export，或 alias 后可用的服务。

## 包边界

- `packages/core` 是底层包。新增核心能力时应先考虑它是否属于容器、注册、解析、生命周期、中间件、引用或释放模型。
- `packages/decorator` 只负责把 TypeScript decorator metadata 翻译成 core 的解析动作。不要把通用容器能力放进 decorator 包。
- `packages/module` 只负责模块语义、声明导入导出校验、alias、export guard 和模块容器组装。不要让 module 包绕过 core 的注册和解析模型。
- `docs/` 是文档站点，不是核心库实现。网站相关变更应与 package 文档和 README 的术语保持一致。

## 命名约定

- 服务标识符变量通常使用接口风格名称，例如 `IServiceA`、`IDatabaseConfig`。
- 结构化接口位于 `interfaces/`，命名以 `I` 开头，例如 `IContainer`、`IModule`。
- 类型别名位于 `types/`，不使用 `I` 前缀。
- enum 使用 `PascalCaseEnum`，例如 `LifecycleEnum`、`RegistrationTypeEnum`。
- 工厂函数使用 `createXxx`，例如 `createContainer`、`createModule`、`createServiceIdentifier`。
- public API 通过各 package 的 `src/index.ts` 导出。

## 术语使用建议

- 优先使用“服务标识符”描述 `ServiceIdentifier`，不要混用 “token”、“key”、“name”，除非在解释外部概念。
- 优先使用“解析”描述 `resolve` 行为，不要写成“获取依赖”来替代核心术语。
- 优先使用“注册”描述 `register` 行为，不要写成“绑定”作为主要术语。
- 优先使用“模块声明 / 导入 / 导出 / alias”描述 module 包语义，保持与 ESM 类比一致。
- 对 `ref` 与 `dynamic` 保持区分：`ref` 是延迟引用，`dynamic` 是每次访问重新解析的动态引用。

## 当前文档状态

- `packages/core/docs/SPECIFICATION.md` 是 core 行为契约的主要来源，状态为 Stable。
- `packages/decorator/docs/SPECIFICATION.md` 是 decorator 行为契约的主要来源，状态为 Final。
- `packages/module/docs/SPECIFICATION.md` 是 module 行为契约的主要来源，状态为 Proposal。
- 根目录当前没有 `docs/adr/`。如后续做出架构决策，应在 `docs/adr/` 下新增 ADR，并在需要时更新本文档。
