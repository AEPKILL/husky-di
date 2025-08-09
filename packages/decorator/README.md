# @husky-di/decorator

`@husky-di/decorator` 是 husky-di 的装饰器支持包，提供了基于 TypeScript 装饰器的依赖注入功能。

## 概述

该包专门为偏好使用装饰器语法的开发者设计，提供了简洁直观的依赖注入方式。**仅支持 TypeScript 装饰器**，不支持 ES 装饰器。

### 为什么仅支持 TypeScript 装饰器？

husky-di 的设计理念是**仅支持构造函数注入**，而 ES 装饰器的规范中**没有设计参数注入器**。

## 安装

```bash
pnpm add @husky-di/decorator
```

## 核心装饰器

### @injectable()

标记一个类为可注入，使其能够被依赖注入容器管理。

> 背后的原因是因为只有应用了装饰器，typescript 编译器才会触发元数据的标记。

```typescript
import { injectable } from "@husky-di/decorator";

@injectable()
class UserService {
  constructor() {}
}
```

### @inject()

用于构造函数参数注入，支持多种注入选项。

```typescript
import { inject, injectable } from "@husky-di/decorator";

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

## 注入选项

`@inject()` 装饰器支持多种注入选项：

### 动态注入 (dynamic)

获取服务的动态引用，支持延迟解析：

```typescript
@injectable()
class ConfigService {
  getValue(key: string) {
    return `config-${key}`;
  }
}

@injectable()
class CacheService {
  constructor(
    @inject(ConfigService, { dynamic: true })
    private configRef: Ref<ConfigService>
  ) {}

  get(key: string) {
    const config = this.configRef.current;
    return `cached-${config.getValue(key)}`;
  }
}
```

### 引用注入 (ref)

获取服务的引用对象：

```typescript
@injectable()
class ApiService {
  constructor(
    @inject(CacheService, { ref: true })
    public cacheRef: Ref<CacheService>
  ) {}
}
```

### 可选注入 (optional)

支持可选依赖，当依赖不存在时不会抛出错误：

```typescript
@injectable()
class TestService {
  constructor(
    @inject(ExistingService, { optional: true })
    public service: ExistingService
  ) {}
}
```

## 中间件集成

装饰器包提供了 `decoratorMiddleware` 中间件，需要注册到全局中间件中：

```typescript
import { globalMiddleware } from "@husky-di/core";
import { decoratorMiddleware } from "@husky-di/decorator";

// 注册装饰器中间件
globalMiddleware.use(decoratorMiddleware);
```

## 完整示例

```typescript
import "reflect-metadata";
import { createContainer, globalMiddleware } from "@husky-di/core";
import { decoratorMiddleware, inject, injectable } from "@husky-di/decorator";

// 注册装饰器中间件
globalMiddleware.use(decoratorMiddleware);

// 创建容器
const container = createContainer();

// 定义服务
@injectable()
class LoggerService {
  log(message: string) {
    return `Logged: ${message}`;
  }
}

@injectable()
class DatabaseService {
  constructor(@inject(LoggerService) private logger: LoggerService) {}

  query(sql: string) {
    return this.logger.log(`Executing: ${sql}`);
  }
}

@injectable()
class UserService {
  constructor(
    @inject(DatabaseService) private db: DatabaseService,
    @inject(LoggerService) private logger: LoggerService
  ) {}

  getUser(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

// 使用服务
const userService = container.resolve(UserService);
const result = userService.getUser("123");
console.log(result); // "Logged: Executing: SELECT * FROM users WHERE id = 123"
```

## 错误处理

### 常见错误

1. **重复使用 @injectable()**

   ```typescript
   // ❌ 错误：不能对同一个类使用两次 @injectable()
   @injectable()
   @injectable()
   class TestService {}
   ```

2. **注入非可注入类**

   ```typescript
   // ❌ 错误：依赖的类没有使用 @injectable()
   class NonInjectableService {}

   @injectable()
   class TestService {
     constructor(@inject(NonInjectableService) dep: NonInjectableService) {}
   }
   ```

3. **循环依赖**

   ```typescript
   // ❌ 错误：检测到循环依赖
   @injectable()
   class ServiceA {
     constructor(@inject(ServiceB) public serviceB: ServiceB) {}
   }

   @injectable()
   class ServiceB {
     constructor(@inject(ServiceA) public serviceA: ServiceA) {}
   }
   ```

## 设计原理

装饰器包使用 TypeScript 的 `reflect-metadata`或其他提供 Reflect API 的库来存储和管理注入元数据：

- `@injectable()` 收集构造函数参数的注入信息
- `@inject()` 为特定参数位置设置注入配置
- `decoratorMiddleware` 在实例化时读取元数据并执行注入

## 最佳实践

1. **始终使用 @injectable() 标记可注入类**
2. **为所有依赖参数使用 @inject() 装饰器**
3. **合理使用注入选项（dynamic、ref、optional）**
4. **避免循环依赖，必要时使用 ref 选项**
5. **在应用启动时注册 decoratorMiddleware**

## 注意事项

- 需要启用 TypeScript 的装饰器支持

> 建议在 tsconfig.json 中启用 `experimentalDecorators` 和 `emitDecoratorMetadata` 选项

- 需要引入 `reflect-metadata` 包或其他提供 Reflect API 的库
- `@inject()` 仅支持构造函数注入，不支持属性注入 (可以 `@husky-di/core` 中的 `resolve` 方法来实现属性注入)
- 装饰器中间件需要全局注册，这样才会在每个容器中都生效
