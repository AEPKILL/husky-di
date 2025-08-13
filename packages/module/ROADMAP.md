# Husky DI 模块系统改进路线图

## 📝 概述

本文档列出了 Husky DI 模块系统的改进和扩展建议，旨在提升框架的功能性、稳定性和开发体验。

## 🎯 当前状态分析

### ✅ 已实现的功能

- 基础模块定义和创建 (`createModule`)
- 模块导入和依赖管理 (`imports`)
- 服务声明和导出 (`declarations`, `exports`)
- 别名系统支持 (`aliases`)
- 动态配置模块 (`withConfig`)
- 应用容器创建 (`createApplication`)

### ⚠️ 发现的问题

1. **API 命名不一致**：`config` vs `withConfig`
2. **缺少 exports 定义**：示例中未明确导出接口
3. **别名语法简化过度**：需要更清晰的结构
4. **应用启动接口模糊**：链式调用容易造成混淆

## 🚀 改进建议

### 优先级分类

#### 🔥 高优先级 (建议优先实现)

1. [配置验证和类型安全](#1-配置验证和类型安全)
2. [模块生命周期管理](#2-模块生命周期管理)
3. [测试工具完善](#3-测试工具完善)

#### ⭐ 中优先级 (功能增强)

4. [模块中间件支持](#4-模块中间件支持)
5. [错误恢复机制](#5-错误恢复机制)
6. [性能监控](#6-性能监控)

#### 💡 低优先级 (高级特性)

7. [依赖图可视化](#7-依赖图可视化)
8. [异步模块加载](#8-异步模块加载)
9. [热重载机制](#9-热重载机制)
10. [微服务支持](#10-微服务支持)

---

## 📋 详细设计方案

### 1. 配置验证和类型安全

**目标**：提供运行时配置验证和编译时类型安全

```typescript
import { z } from "zod"; // 或其他验证库

// 配置模式验证
const DatabaseConfigSchema = z.object({
  type: z.enum(["mysql", "postgresql", "sqlite"]),
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
  ssl: z.boolean().optional(),
  timeout: z.number().positive().default(30000),
});

const DatabaseModule = {
  withConfig<T extends z.infer<typeof DatabaseConfigSchema>>(config: T) {
    // 运行时验证
    const validatedConfig = DatabaseConfigSchema.parse(config);

    return createModule({
      name: "DatabaseModule",
      configSchema: DatabaseConfigSchema, // 保存模式用于文档生成
      declarations: [
        {
          serviceIdentifier: DatabaseConfig,
          useValue: validatedConfig,
        },
        {
          serviceIdentifier: "DatabaseService",
          useClass: DatabaseService,
        },
      ],
      exports: [DatabaseConfig, "DatabaseService"],
    });
  },
};

// 类型安全的配置
const dbModule = DatabaseModule.withConfig({
  type: "mysql", // 类型提示和验证
  host: "localhost",
  port: 3306,
  username: "root",
  password: "secret",
  database: "myapp",
  // ssl: true, // 可选字段
});
```

**实现要点**：

- 集成 Zod 或类似验证库
- 扩展 `CreateModuleOptions` 接口支持 `configSchema`
- 在模块创建时执行配置验证
- 生成配置文档和类型定义

---

### 2. 模块生命周期管理

**目标**：为模块提供初始化、启动、销毁等生命周期钩子

```typescript
interface IModuleLifecycle {
  onInit?(container: IContainer): Promise<void> | void;
  onBootstrap?(container: IContainer): Promise<void> | void;
  onDestroy?(container: IContainer): Promise<void> | void;
  onConfigChange?(newConfig: any, oldConfig: any): Promise<void> | void;
}

interface CreateModuleOptions {
  readonly name: string;
  readonly lifecycle?: IModuleLifecycle;
  readonly declarations?: Declaration<unknown>[];
  readonly imports?: Array<IModule | ModuleWithAliases>;
  readonly exports?: ServiceIdentifier<unknown>[];
}

const AppModule = createModule({
  name: "AppModule",
  lifecycle: {
    async onInit(container) {
      // 模块初始化逻辑
      console.log("AppModule initializing...");
      await setupDatabase();
    },
    async onBootstrap(container) {
      // 应用启动逻辑
      const logger = container.resolve("Logger");
      logger.info("Application started successfully");
    },
    async onDestroy(container) {
      // 清理资源
      await cleanupResources();
    },
  },
  declarations: [
    // ...
  ],
});

// 扩展应用创建函数支持生命周期
export async function createApplicationWithLifecycle(
  module: IModule
): Promise<IContainer> {
  const container = createApplication(module);

  // 执行初始化钩子
  await executeLifecycleHook(module, "onInit", container);

  return container;
}
```

**实现要点**：

- 扩展 `IModule` 接口支持 `lifecycle`
- 在 `createApplication` 中调用相应钩子
- 提供生命周期事件的类型定义
- 支持异步钩子函数

---

### 3. 测试工具完善

**目标**：提供完整的模块测试工具集

```typescript
// 模块测试工具类
class ModuleTestingUtility {
  /**
   * 创建测试用模块
   */
  static createTestModule(
    partialOptions: Partial<CreateModuleOptions>
  ): IModule {
    return createModule({
      name: "TestModule",
      ...partialOptions,
    });
  }

  /**
   * 模拟现有模块
   */
  static mockModule(module: IModule, mocks: Record<string, any>): IModule {
    const mockDeclarations = Object.entries(mocks).map(([key, value]) => ({
      serviceIdentifier: key,
      useValue: value,
    }));

    return createModule({
      name: `Mock${module.name}`,
      declarations: mockDeclarations,
      exports: module.exports,
    });
  }

  /**
   * 创建隔离的测试容器
   */
  static createIsolatedContainer(module: IModule): IContainer {
    return createApplication(module);
  }

  /**
   * 清理模块缓存
   */
  static clearModuleCache(): void {
    // 清理全局模块缓存
  }
}

// 测试辅助函数
export function createTestEnvironment() {
  return {
    beforeEach() {
      ModuleTestingUtility.clearModuleCache();
    },

    createMockModule(name: string, services: Record<string, any>) {
      return ModuleTestingUtility.createTestModule({
        name,
        declarations: Object.entries(services).map(([key, value]) => ({
          serviceIdentifier: key,
          useValue: value,
        })),
        exports: Object.keys(services),
      });
    },
  };
}

// 使用示例
describe("App Integration Tests", () => {
  const testEnv = createTestEnvironment();
  let testContainer: IContainer;

  beforeEach(() => {
    testEnv.beforeEach();

    const MockUserModule = testEnv.createMockModule("MockUserModule", {
      UserService: new MockUserService(),
      UserRepository: new InMemoryUserRepository(),
    });

    testContainer = ModuleTestingUtility.createIsolatedContainer(
      createModule({
        name: "TestAppModule",
        imports: [MockUserModule],
        declarations: [
          {
            serviceIdentifier: "AppService",
            useClass: AppService,
          },
        ],
      })
    );
  });

  it("should bootstrap application correctly", async () => {
    const app = testContainer.resolve("AppService");
    const result = await app.bootstrap();
    expect(result).toBe("Application bootstrapped successfully");
  });
});
```

**实现要点**：

- 创建 `ModuleTestingUtility` 工具类
- 提供模块模拟和隔离测试功能
- 支持测试环境的快速搭建
- 集成到现有测试框架

---

### 4. 模块中间件支持

**目标**：扩展中间件机制到模块层面

```typescript
interface ModuleMiddleware {
  name: string;
  beforeModuleInit?(
    module: IModule,
    container: IContainer
  ): Promise<void> | void;
  afterModuleInit?(
    module: IModule,
    container: IContainer
  ): Promise<void> | void;
  beforeServiceResolve?(
    serviceId: ServiceIdentifier<any>,
    module: IModule
  ): void;
  afterServiceResolve?(
    serviceId: ServiceIdentifier<any>,
    instance: any,
    module: IModule
  ): void;
}

interface CreateModuleOptions {
  // ... 现有属性
  readonly middlewares?: ModuleMiddleware[];
}

const loggingMiddleware: ModuleMiddleware = {
  name: "LoggingMiddleware",
  beforeModuleInit(module, container) {
    console.log(`Initializing module: ${module.name}`);
  },
  beforeServiceResolve(serviceId, module) {
    console.log(`Resolving ${String(serviceId)} in ${module.name}`);
  },
  afterServiceResolve(serviceId, instance, module) {
    console.log(`Resolved ${String(serviceId)} in ${module.name}`);
  },
};

const securityMiddleware: ModuleMiddleware = {
  name: "SecurityMiddleware",
  beforeServiceResolve(serviceId, module) {
    // 安全检查逻辑
    if (!hasPermission(getCurrentUser(), serviceId)) {
      throw new SecurityError(`Access denied to ${String(serviceId)}`);
    }
  },
};

const AppModule = createModule({
  name: "AppModule",
  middlewares: [loggingMiddleware, securityMiddleware],
  declarations: [
    // ...
  ],
});
```

**实现要点**：

- 扩展 `CreateModuleOptions` 支持中间件
- 在模块初始化和服务解析时调用中间件
- 提供中间件执行顺序控制
- 支持中间件的条件执行

---

### 5. 错误恢复机制

**目标**：为模块提供错误处理和恢复机制

```typescript
interface ErrorRecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  fallbackModule?: IModule;
  errorHandlers?: ModuleErrorHandler[];
  isolateErrors?: boolean; // 隔离错误，防止影响其他模块
}

interface ModuleErrorHandler {
  canHandle(error: Error, module: IModule): boolean;
  handle(
    error: Error,
    module: IModule,
    context: ErrorContext
  ): Promise<RecoveryAction>;
}

enum RecoveryAction {
  RETRY = "retry",
  FALLBACK = "fallback",
  IGNORE = "ignore",
  FAIL = "fail",
}

interface ErrorContext {
  attemptCount: number;
  retryDelay: number;
  startTime: number;
}

const DatabaseModule = createModule({
  name: "DatabaseModule",
  errorRecovery: {
    maxRetries: 3,
    retryDelay: 1000,
    fallbackModule: MockDatabaseModule,
    errorHandlers: [
      {
        canHandle: (error) => error.name === "ConnectionError",
        handle: async (error, module, context) => {
          console.warn(
            `Database connection failed (attempt ${context.attemptCount})`
          );
          await sleep(context.retryDelay);
          return RecoveryAction.RETRY;
        },
      },
      {
        canHandle: (error) => error.name === "TimeoutError",
        handle: async (error, module, context) => {
          console.warn(`Database timeout, switching to fallback`);
          return RecoveryAction.FALLBACK;
        },
      },
    ],
    isolateErrors: true,
  },
  declarations: [
    // ...
  ],
});
```

**实现要点**：

- 扩展模块接口支持错误恢复配置
- 实现重试机制和降级策略
- 提供错误隔离避免影响其他模块
- 支持自定义错误处理器

---

### 6. 性能监控

**目标**：提供模块性能监控和优化建议

```typescript
interface PerformanceMetrics {
  moduleLoadTime: number;
  serviceResolutionTime: Map<string, number>;
  memoryUsage: number;
  dependencyCount: number;
  circularDependencies: string[];
}

interface ModulePerformanceOptions {
  enableMetrics?: boolean;
  enableProfiling?: boolean;
  enableMemoryTracking?: boolean;
  slowServiceThreshold?: number; // ms
  onSlowService?: (serviceId: string, duration: number) => void;
  onMemoryWarning?: (usage: number, threshold: number) => void;
}

class ModulePerformanceMonitor {
  getMetrics(module: IModule): PerformanceMetrics {
    // 收集性能指标
  }

  startProfiling(module: IModule): void {
    // 开始性能分析
  }

  stopProfiling(module: IModule): ProfilingResult {
    // 结束分析并返回结果
  }

  optimizeDependencyResolution(module: IModule): OptimizationSuggestions {
    // 分析依赖解析并提供优化建议
  }

  generateReport(module: IModule): PerformanceReport {
    // 生成性能报告
  }
}

const AppModule = createModule({
  name: "AppModule",
  performance: {
    enableMetrics: true,
    enableProfiling: process.env.NODE_ENV === "development",
    enableMemoryTracking: true,
    slowServiceThreshold: 100,
    onSlowService: (serviceId, duration) => {
      console.warn(`Slow service resolution: ${serviceId} took ${duration}ms`);
    },
    onMemoryWarning: (usage, threshold) => {
      console.warn(`High memory usage: ${usage}MB (threshold: ${threshold}MB)`);
    },
  },
  declarations: [
    // ...
  ],
});

// 使用示例
const monitor = new ModulePerformanceMonitor();
monitor.startProfiling(AppModule);

const container = createApplication(AppModule);
// ... 应用运行

const profilingResult = monitor.stopProfiling(AppModule);
const metrics = monitor.getMetrics(AppModule);
const suggestions = monitor.optimizeDependencyResolution(AppModule);

console.log("Performance Report:", monitor.generateReport(AppModule));
```

**实现要点**：

- 集成性能监控到模块生命周期
- 提供服务解析时间统计
- 实现内存使用监控
- 生成性能报告和优化建议

---

### 7. 依赖图可视化

**目标**：提供模块依赖关系的可视化分析工具

```typescript
interface ModuleDependencyNode {
  id: string;
  name: string;
  type: "module" | "service";
  metadata?: Record<string, any>;
}

interface ModuleDependencyEdge {
  from: string;
  to: string;
  type: "imports" | "exports" | "depends";
  label?: string;
}

interface ModuleDependencyGraph {
  nodes: ModuleDependencyNode[];
  edges: ModuleDependencyEdge[];
  metadata: {
    totalModules: number;
    totalServices: number;
    circularDependencies: CircularDependency[];
  };
}

interface CircularDependency {
  path: string[];
  type: "module" | "service";
}

class ModuleDependencyAnalyzer {
  /**
   * 分析模块依赖关系
   */
  analyzeDependencies(rootModule: IModule): ModuleDependencyGraph {
    // 递归分析模块依赖
  }

  /**
   * 检测循环依赖
   */
  detectCircularDependencies(
    graph: ModuleDependencyGraph
  ): CircularDependency[] {
    // 使用深度优先搜索检测环
  }

  /**
   * 生成 Mermaid 格式的图表
   */
  generateMermaidDiagram(graph: ModuleDependencyGraph): string {
    const nodes = graph.nodes
      .map((node) => `  ${node.id}["${node.name}"]`)
      .join("\n");

    const edges = graph.edges
      .map((edge) => `  ${edge.from} --> ${edge.to}`)
      .join("\n");

    return `graph TD\n${nodes}\n${edges}`;
  }

  /**
   * 验证模块结构
   */
  validateModuleStructure(module: IModule): ValidationResult[] {
    // 检查模块结构的合理性
  }

  /**
   * 生成依赖报告
   */
  generateDependencyReport(graph: ModuleDependencyGraph): DependencyReport {
    // 生成详细的依赖分析报告
  }
}

// 使用示例
const analyzer = new ModuleDependencyAnalyzer();
const graph = analyzer.analyzeDependencies(AppModule);
const circularDeps = analyzer.detectCircularDependencies(graph);

if (circularDeps.length > 0) {
  console.warn("Found circular dependencies:", circularDeps);
}

// 生成可视化图表
const mermaidDiagram = analyzer.generateMermaidDiagram(graph);
console.log("Dependency Graph:");
console.log(mermaidDiagram);

// 生成报告
const report = analyzer.generateDependencyReport(graph);
console.log("Dependency Analysis Report:", report);
```

**实现要点**：

- 实现递归依赖分析算法
- 提供多种可视化格式支持（Mermaid、DOT 等）
- 集成循环依赖检测
- 生成依赖分析报告

---

### 8. 异步模块加载

**目标**：支持模块的异步加载和懒加载

```typescript
interface AsyncModuleOptions {
  lazy?: boolean;
  loadCondition?: () => boolean | Promise<boolean>;
  fallback?: IModule;
  timeout?: number;
  retryOnFailure?: boolean;
}

interface AsyncModule extends IModule {
  readonly isLoaded: boolean;
  readonly loadPromise: Promise<IModule>;
  load(): Promise<IModule>;
  unload(): Promise<void>;
}

function createAsyncModule(options: {
  name: string;
  loader: () => Promise<IModule>;
  asyncOptions?: AsyncModuleOptions;
}): AsyncModule {
  // 实现异步模块逻辑
}

// 使用示例
const AsyncUserModule = createAsyncModule({
  name: "UserModule",
  loader: () => import("./user.module"), // 动态导入
  asyncOptions: {
    lazy: true,
    loadCondition: () => checkFeatureFlag("user-management"),
    fallback: MockUserModule,
    timeout: 5000,
    retryOnFailure: true,
  },
});

const AppModule = createModule({
  name: "AppModule",
  imports: [
    DatabaseModule,
    AsyncUserModule, // 支持异步模块
    {
      module: () => import("./auth.module"), // 懒加载语法糖
      when: () => process.env.AUTH_ENABLED === "true",
    },
  ],
});

// 异步应用启动
export async function createApplicationAsync(
  module: IModule
): Promise<IContainer> {
  // 等待所有异步模块加载完成
  await loadAsyncModules(module);
  return createApplication(module);
}

const app = await createApplicationAsync(AppModule);
```

**实现要点**：

- 实现异步模块加载机制
- 支持条件加载和懒加载
- 提供加载超时和重试机制
- 集成到应用启动流程

---

### 9. 热重载机制

**目标**：支持开发环境下的模块热重载

```typescript
interface HotReloadOptions {
  enabled: boolean;
  watchPaths?: string[];
  ignorePatterns?: string[];
  reloadStrategy?: "graceful" | "immediate";
  onReloadStart?: (module: IModule) => void;
  onReloadComplete?: (module: IModule) => void;
  onReloadError?: (error: Error, module: IModule) => void;
}

class ModuleHotReloader {
  private watchers: Map<string, FSWatcher> = new Map();
  private reloadCallbacks: Map<string, Function[]> = new Map();

  enableHotReload(module: IModule, options: HotReloadOptions): void {
    if (!options.enabled) return;

    // 设置文件监听
    const watcher = chokidar.watch(options.watchPaths || [], {
      ignored: options.ignorePatterns || ["node_modules/**"],
    });

    watcher.on("change", (path) => {
      this.reloadModule(module, options);
    });

    this.watchers.set(module.id, watcher);
  }

  onModuleChanged(callback: (module: IModule) => void): void {
    // 注册模块变更回调
  }

  async reloadModule(
    module: IModule,
    options?: HotReloadOptions
  ): Promise<void> {
    try {
      options?.onReloadStart?.(module);

      if (options?.reloadStrategy === "graceful") {
        await this.gracefulReload(module);
      } else {
        await this.immediateReload(module);
      }

      options?.onReloadComplete?.(module);
    } catch (error) {
      options?.onReloadError?.(error as Error, module);
    }
  }

  private async gracefulReload(module: IModule): Promise<void> {
    // 优雅重载：保存状态，重新创建模块，恢复状态
  }

  private async immediateReload(module: IModule): Promise<void> {
    // 立即重载：直接重新创建模块
  }
}

// 开发环境配置
if (process.env.NODE_ENV === "development") {
  const hotReloader = new ModuleHotReloader();

  hotReloader.enableHotReload(AppModule, {
    enabled: true,
    watchPaths: ["./src/modules/**/*.ts"],
    reloadStrategy: "graceful",
    onReloadStart: (module) => {
      console.log(`🔄 Reloading module: ${module.name}`);
    },
    onReloadComplete: (module) => {
      console.log(`✅ Module reloaded: ${module.name}`);
    },
    onReloadError: (error, module) => {
      console.error(`❌ Failed to reload module ${module.name}:`, error);
    },
  });

  hotReloader.onModuleChanged(async (changedModule) => {
    console.log(`📝 Module ${changedModule.name} changed, reloading...`);
    await hotReloader.reloadModule(changedModule);
  });
}
```

**实现要点**：

- 集成文件系统监听（如 chokidar）
- 实现优雅重载和立即重载策略
- 提供重载事件回调
- 支持状态保存和恢复

---

### 10. 微服务支持

**目标**：支持分布式微服务架构

```typescript
interface RemoteModuleOptions {
  serviceUrl: string;
  protocol: "grpc" | "http" | "graphql";
  healthCheck?: {
    endpoint: string;
    interval: number;
    timeout: number;
  };
  authentication?: {
    type: "bearer" | "basic" | "apikey";
    credentials: any;
  };
  retryPolicy?: {
    maxRetries: number;
    retryDelay: number;
    backoffStrategy: "linear" | "exponential";
  };
}

function createRemoteModule(options: {
  name: string;
  exports: ServiceIdentifier<unknown>[];
  remoteOptions: RemoteModuleOptions;
}): IModule {
  // 实现远程模块代理
}

// 远程服务代理
class RemoteServiceProxy {
  constructor(
    private serviceUrl: string,
    private protocol: string,
    private options: RemoteModuleOptions
  ) {}

  async invoke(method: string, params: any[]): Promise<any> {
    // 实现远程服务调用
  }

  async healthCheck(): Promise<boolean> {
    // 健康检查
  }
}

// 使用示例
const RemoteUserModule = createRemoteModule({
  name: "RemoteUserModule",
  exports: ["UserService", "UserRepository"],
  remoteOptions: {
    serviceUrl: "http://user-service:3001",
    protocol: "http",
    healthCheck: {
      endpoint: "/health",
      interval: 30000,
      timeout: 5000,
    },
    authentication: {
      type: "bearer",
      credentials: { token: process.env.API_TOKEN },
    },
    retryPolicy: {
      maxRetries: 3,
      retryDelay: 1000,
      backoffStrategy: "exponential",
    },
  },
});

const RemoteAuthModule = createRemoteModule({
  name: "RemoteAuthModule",
  exports: ["AuthService"],
  remoteOptions: {
    serviceUrl: "grpc://auth-service:50051",
    protocol: "grpc",
  },
});

const AppModule = createModule({
  name: "AppModule",
  imports: [
    LocalDatabaseModule, // 本地模块
    RemoteUserModule, // 远程HTTP服务
    RemoteAuthModule, // 远程gRPC服务
  ],
  declarations: [
    {
      serviceIdentifier: "AppService",
      useClass: AppService,
    },
  ],
});
```

**实现要点**：

- 实现多协议支持（HTTP、gRPC、GraphQL）
- 提供服务代理和负载均衡
- 集成健康检查和故障恢复
- 支持认证和重试策略

---

## 🎯 实施优先级建议

### 第一阶段：基础完善 (1-2 个月)

1. ✅ **配置验证和类型安全**
2. 🔄 **模块生命周期管理**
3. 🧪 **测试工具完善**

### 第二阶段：功能增强 (2-3 个月)

4. ⚡ **模块中间件支持**
5. 🛡️ **错误恢复机制**
6. ⚡ **性能监控**

### 第三阶段：高级特性 (3-6 个月)

7. 🕸️ **依赖图可视化**
8. ⏳ **异步模块加载**
9. 🔥 **热重载机制**

### 第四阶段：架构扩展 (6 个月+)

10. 🌐 **微服务支持**
