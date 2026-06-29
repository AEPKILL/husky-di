# @husky-di/decorator Reference

Full reference for constructor injection via TypeScript experimental decorators.

## Prerequisites

```jsonc
// tsconfig.json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true
}
```

```typescript
// Entry point — import once before any decorator usage
import "reflect-metadata";
```

> **Limitation:** Only TypeScript experimental decorators are supported. ES/TC39 decorators lack parameter decorators and **cannot** be used.

## @injectable()

Marks a class as injectable and consolidates constructor parameter metadata.

```typescript
import { injectable } from "@husky-di/decorator";

@injectable()
class Service {
  constructor(
    private depA: DepA,              // inferred from design:paramtypes
    private depB: DepB,
  ) {}
}
```

### Rules

- Apply **exactly once** per class. Applying twice throws `E_DUPLICATE_INJECTABLE`.
- If a parameter has no explicit `@inject()`, the type is inferred from TypeScript's `design:paramtypes` metadata.
- Inferred types **must** be class constructors (functions). Primitives (`string`, `number`, `boolean`) and interfaces cause `E_NON_CLASS_PARAMETER` — use explicit `@inject()` for those.
- After processing, every constructor parameter must have metadata. Missing metadata throws `E_INCOMPLETE_METADATA`.

### Metadata Consolidation

For each parameter:

1. If `@inject()` / `@tagged()` provided metadata, use it.
2. Otherwise, infer from `design:paramtypes`.

```typescript
@injectable()
class Service {
  constructor(
    depA: DepA,                         // inferred → { serviceIdentifier: DepA }
    @inject(DepB) depB: DepB,           // explicit → { serviceIdentifier: DepB }
    @inject(DepC, { optional: true }) c,// explicit with options
  ) {}
}
// Consolidated:
// [{ serviceIdentifier: DepA }, { serviceIdentifier: DepB }, { serviceIdentifier: DepC, optional: true }]
```

## @inject()

Attaches injection metadata to a specific constructor parameter.

```typescript
import { inject } from "@husky-di/decorator";

@injectable()
class Service {
  constructor(
    @inject(ILogger) private logger: ILogger,
    @inject(IConfig, { optional: true }) private config?: IConfig,
    @inject(IHeavy, { ref: true }) private heavyRef: Ref<IHeavy>,
    @inject(IDynamic, { dynamic: true }) private dynRef: Ref<IDynamic>,
    @inject(IDep, { scope: ResolveContainerScopeEnum.origin }) private dep: IDep,
  ) {}
}
```

### Options

| Option | Effect |
|---|---|
| `optional: true` | Returns `undefined` if not found (no throw) |
| `ref: true` | Returns `Ref<T>` — deferred, cached |
| `dynamic: true` | Returns `Ref<T>` — re-resolves each access |
| `scope` | `current` (default) or `origin` — which container perspective to use |

### Rules

- `serviceIdentifier` is **required** and must be non-null.
- Applies only to constructor parameters. Non-constructor usage is ignored.
- `ref` and `dynamic` must not both be `true` — throws `E_CONFLICTING_OPTIONS`.
- Applied multiple times to the same parameter: last application wins.

### When to use @inject()

- **Always needed** for: interfaces, string tokens, symbol tokens, primitive types.
- **Optional** for: class constructors (TypeScript can infer them).

```typescript
// Without @inject — TypeScript infers DepA and DepB from design:paramtypes
@injectable()
class Service {
  constructor(depA: DepA, depB: DepB) {} // ✓ works
}

// With interface — MUST use @inject()
const IConfig = createServiceIdentifier<IConfig>("IConfig");
@injectable()
class Service {
  constructor(@inject(IConfig) config: IConfig) {} // ✓ explicit identifier
  // Without @inject, TypeScript would try to infer IConfig, but interfaces
  // don't exist at runtime → E_NON_CLASS_PARAMETER
}
```

## @tagged()

Lower-level parameter metadata decorator. `@inject()` is a convenience wrapper around this.

```typescript
import { tagged } from "@husky-di/decorator";

@injectable()
class Service {
  constructor(
    @tagged({ serviceIdentifier: ILogger, optional: true }) private logger?: ILogger,
  ) {}
}
```

### Rules

- `metadata.serviceIdentifier` is **required** — missing throws `E_MISSING_SERVICE_IDENTIFIER`.
- Writes to `Reflect.getMetadata("husky-di.injection-metadata", targetConstructor)`.
- The metadata array is sparse: parameters without explicit metadata have `undefined` at their index.

## Enabling Decorator Injection

The `decoratorMiddleware` reads injection metadata and performs constructor injection. Register it to activate decorator-based resolution:

```typescript
import { decoratorMiddleware } from "@husky-di/decorator";
import { globalMiddleware, createContainer } from "@husky-di/core";

// Global — all containers get decorator injection
globalMiddleware.use(decoratorMiddleware);

// Or local — only this container
const container = createContainer();
container.use(decoratorMiddleware);
```

Without `decoratorMiddleware`, `@injectable()` classes can still be registered and resolved manually, but constructor parameters won't be auto-wired.

## Full Example

```typescript
import "reflect-metadata";
import { injectable, inject, decoratorMiddleware } from "@husky-di/decorator";
import { createContainer, createServiceIdentifier, globalMiddleware, LifecycleEnum } from "@husky-di/core";

// 1. Service identifiers
const ILogger = createServiceIdentifier<ILogger>("ILogger");
const IDatabase = createServiceIdentifier<IDatabase>("IDatabase");

interface ILogger { log(msg: string): void; }
interface IDatabase { query(sql: string): unknown[]; }

// 2. Implementations
@injectable()
class ConsoleLogger implements ILogger {
  log(msg: string) { console.log(`[LOG] ${msg}`); }
}

@injectable()
class PostgresDatabase implements IDatabase {
  constructor(@inject(ILogger) private logger: ILogger) {}
  query(sql: string) { this.logger.log(`query: ${sql}`); return []; }
}

@injectable()
class UserService {
  constructor(
    @inject(ILogger) private logger: ILogger,
    @inject(IDatabase) private db: IDatabase,
  ) {}
  getUsers() { return this.db.query("SELECT * FROM users"); }
}

// 3. Setup
globalMiddleware.use(decoratorMiddleware);
const container = createContainer();

container.register(ILogger, { useClass: ConsoleLogger, lifecycle: LifecycleEnum.singleton });
container.register(IDatabase, { useClass: PostgresDatabase, lifecycle: LifecycleEnum.singleton });
container.register(UserService, { useClass: UserService });

// 4. Use
const users = container.resolve(UserService);
users.getUsers();
```

## Error Reference

| Code | Message | When |
|---|---|---|
| `E_DUPLICATE_INJECTABLE` | Class "{0}" already decorated with @Injectable() | `@injectable()` applied twice |
| `E_NON_CLASS_PARAMETER` | Constructor "{0}" parameter #{1} must be a class type | Inferred type is not a function |
| `E_NOT_INJECTABLE` | Class "{0}" must be decorated with @Injectable() | Resolving a class without `@injectable()` |
| `E_MISSING_SERVICE_IDENTIFIER` | Injection metadata must include a serviceIdentifier | `@tagged()` called without `serviceIdentifier` |
| `E_INVALID_SERVICE_IDENTIFIER` | Invalid service identifier: {0} | Identifier not a function, symbol, or non-empty string |
| `E_CONFLICTING_OPTIONS` | Cannot use both "dynamic" and "ref" simultaneously | Both set to `true` |
| `E_INCOMPLETE_METADATA` | Constructor "{0}" has incomplete injection metadata | Some parameters lack metadata after consolidation |
