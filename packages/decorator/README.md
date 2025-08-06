# @husky-di/decorator

支持 TypeScript 和 ES 标准装饰器的依赖注入装饰器库。

## 特性

- ✅ 同时支持 TypeScript 装饰器和 ES 标准装饰器
- ✅ 运行时自动检测装饰器模式（参考 MobX 实现）
- ✅ 统一的 API 接口，无需修改现有代码
- ✅ 完整的 TypeScript 类型支持
- ✅ 向后兼容现有项目

## 安装

```bash
pnpm add @husky-di/decorator reflect-metadata
```

## 基本用法

### 类装饰器

```typescript
import { injectable } from "@husky-di/decorator";

@injectable()
class UserService {
  // 服务实现
}
```

### 参数装饰器

```typescript
import { injectable, inject } from "@husky-di/decorator";

@injectable()
class UserController {
  constructor(
    @inject(UserService) private userService: UserService,
    @inject(EmailService) private emailService: EmailService
  ) {}
}
```

## 装饰器模式检测

### 自动检测（推荐）

库会在运行时自动检测装饰器模式：

- **TypeScript 模式**: 使用 `experimentalDecorators` 和 `reflect-metadata`
- **ES 模式**: 使用 ES 标准装饰器语法

检测逻辑参考了 [MobX 的实现](https://github.com/mobxjs/mobx/blob/761a8dd4a658180fa5af546a155df994e78496bc/packages/mobx/src/api/decorators.ts#L83)：

```typescript
// 检测是否为 ES 装饰器
function isESDecorator(context: any): boolean {
  return typeof context === "object" && typeof context.kind === "string";
}
```

### 手动指定模式

```typescript
import { createClassDecorator, detectDecoratorMode } from "@husky-di/decorator";

// 强制使用 TypeScript 模式
const tsInjectable = () =>
  createClassDecorator(
    (target) => {
      /* TypeScript 实现 */
    },
    (element, context) => {
      /* ES 实现 */
    },
    { forceMode: "typescript" }
  );

// 强制使用 ES 模式
const esInjectable = () =>
  createClassDecorator(
    (target) => {
      /* TypeScript 实现 */
    },
    (element, context) => {
      /* ES 实现 */
    },
    { forceMode: "es" }
  );
```

## API 参考

### 装饰器

#### `injectable()`

标记一个类为可注入类。

```typescript
@injectable()
class MyService {}
```

#### `inject(serviceIdentifier, options?)`

注入依赖到构造函数参数。

```typescript
constructor(
  @inject(UserService) private userService: UserService,
  @inject(EmailService, { lifecycle: 'singleton' }) private emailService: EmailService
) {}
```

#### `tagged(metadata)`

底层参数装饰器，用于高级用法。

```typescript
constructor(
  @tagged({ serviceIdentifier: UserService, lifecycle: 'transient' })
  private userService: UserService
) {}
```

### 工具函数

#### `isESDecorator(context)`

检测是否为 ES 装饰器上下文。

```typescript
import { isESDecorator } from "@husky-di/decorator";

const isES = isESDecorator(context); // boolean
```

#### `detectDecoratorModeFromParams(firstParam)`

从装饰器参数检测模式。

```typescript
import { detectDecoratorModeFromParams } from "@husky-di/decorator";

const mode = detectDecoratorModeFromParams(firstParam); // 'typescript' | 'es'
```

#### `detectDecoratorMode()`

获取默认装饰器模式。

```typescript
import { detectDecoratorMode } from "@husky-di/decorator";

const mode = detectDecoratorMode(); // 'typescript' | 'es'
```

#### `getDecoratorConfig()`

获取当前装饰器配置信息。

```typescript
import { getDecoratorConfig } from "@husky-di/decorator";

const config = getDecoratorConfig();
// { mode: 'typescript', supportsReflectMetadata: true }
```

#### `createClassDecorator(tsImpl, esImpl, options?)`

创建支持双模式的类装饰器。

#### `createParameterDecorator(tsImpl, esImpl, options?)`

创建支持双模式的参数装饰器。

### 类型定义

```typescript
import type {
  UnifiedClassDecorator,
  UnifiedParameterDecorator,
  DecoratorMode,
  MetadataAccessor,
} from "@husky-di/decorator";
```

## 配置

### TypeScript 配置

确保在 `tsconfig.json` 中启用装饰器支持：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### 运行时依赖

确保在应用入口处导入 `reflect-metadata`：

```typescript
import "reflect-metadata";
// 其他导入...
```

## 迁移指南

### 从现有项目迁移

1. **无需修改现有代码** - 库会自动检测并使用合适的模式
2. **更新依赖** - 确保安装了 `reflect-metadata`
3. **配置 TypeScript** - 启用装饰器支持
4. **测试验证** - 运行测试确保功能正常

### 强制使用特定模式

如果需要强制使用特定模式，可以使用工厂函数：

```typescript
import { createClassDecorator } from "@husky-di/decorator";

const myInjectable = () =>
  createClassDecorator(
    // TypeScript 实现
    (target) => {
      /* ... */
    },
    // ES 实现
    (element, context) => {
      /* ... */
    },
    { forceMode: "typescript" } // 或 'es'
  );
```

## 技术实现

### 装饰器检测原理

参考 MobX 的实现方式，通过检查装饰器函数的参数来判断模式：

- **ES 装饰器**: 第一个参数是 context 对象，包含 `kind` 属性
- **TypeScript 装饰器**: 第一个参数是目标对象

```typescript
// 检测逻辑
function isESDecorator(context: any): boolean {
  return typeof context === "object" && typeof context.kind === "string";
}
```

### 运行时适配

装饰器工厂会在运行时检测模式并调用相应的实现：

```typescript
function unifiedDecorator(target: any, context?: any) {
  if (isESDecorator(context)) {
    return esDecorator(target, context);
  } else {
    return tsDecorator(target);
  }
}
```

## 注意事项

1. **ES 装饰器支持**: 目前 ES 装饰器仍处于提案阶段，支持可能不完整
2. **reflect-metadata**: TypeScript 模式需要 `reflect-metadata` 支持
3. **性能考虑**: ES 装饰器在编译时处理，性能更好
4. **兼容性**: 建议在生产环境中使用 TypeScript 模式以确保稳定性
5. **检测准确性**: 基于 MobX 的检测方式，在大多数情况下都能正确识别装饰器模式

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT
