# Recommended Project Structure

Three common patterns, from simplest to most scalable. All follow the same core conventions:

- **Interfaces** live in `interfaces/` — each file contains both the TypeScript `interface IXxx` and its `createServiceIdentifier<IXXX>()` call. Files end in `*.interface.ts`.
- **Implementations** live in `impls/` — concrete classes that implement interfaces. Files end in `*.impl.ts`.

## Pattern A: Flat Core-Only

Best for small projects with a handful of manual registrations.

```
src/
├── interfaces/
│   ├── logger.interface.ts    # interface ILogger + const ILogger
│   └── database.interface.ts  # interface IDatabase + const IDatabase
├── impls/
│   ├── console-logger.impl.ts # class ConsoleLogger implements ILogger
│   └── postgres-database.impl.ts
├── di/
│   ├── container.ts           # createContainer() + bootstrap registrations
│   └── middleware.ts           # Optional: logging, profiling middleware
└── main.ts                    # Entry point
```

**interfaces/logger.interface.ts**

```typescript
import { createServiceIdentifier } from "@husky-di/core";

export interface ILogger {
  log(msg: string): void;
}
export const ILogger = createServiceIdentifier<ILogger>("ILogger");
```

**interfaces/database.interface.ts**

```typescript
import { createServiceIdentifier } from "@husky-di/core";

export interface IDatabase {
  query(sql: string): unknown[];
}
export const IDatabase = createServiceIdentifier<IDatabase>("IDatabase");
```

**impls/console-logger.impl.ts**

```typescript
import type { ILogger } from "../interfaces/logger.interface";

export class ConsoleLogger implements ILogger {
  log(msg: string) {
    console.log(msg);
  }
}
```

**impls/postgres-database.impl.ts**

```typescript
import type { ILogger } from "../interfaces/logger.interface";
import type { IDatabase } from "../interfaces/database.interface";

export class PostgresDatabase implements IDatabase {
  constructor(private logger: ILogger) {}
  query(sql: string) {
    this.logger.log(`query: ${sql}`);
    return [];
  }
}
```

**di/container.ts**

```typescript
import { createContainer, LifecycleEnum } from "@husky-di/core";
import { ILogger } from "../interfaces/logger.interface";
import { IDatabase } from "../interfaces/database.interface";
import { ConsoleLogger } from "../impls/console-logger.impl";
import { PostgresDatabase } from "../impls/postgres-database.impl";

export const container = createContainer("AppContainer");

container.register(ILogger, {
  useClass: ConsoleLogger,
  lifecycle: LifecycleEnum.singleton,
});
container.register(IDatabase, {
  useFactory: (c) => new PostgresDatabase(c.resolve(ILogger)),
  lifecycle: LifecycleEnum.singleton,
});
```

**main.ts**

```typescript
import { container } from "./di/container";
import { ILogger } from "./interfaces/logger.interface";

container.resolve(ILogger).log("started");
```

---

## Pattern B: Decorator-Based

Adds `@injectable()` / `@inject()`. Implementation classes use decorators instead of manual factories.

```
src/
├── interfaces/
│   ├── logger.interface.ts
│   ├── database.interface.ts
│   └── user-service.interface.ts
├── impls/
│   ├── console-logger.impl.ts     # @injectable()
│   ├── postgres-database.impl.ts  # @injectable(), @inject(ILogger)
│   └── user-service.impl.ts       # @injectable(), @inject(ILogger, IDatabase)
├── di/
│   ├── container.ts               # Also calls globalMiddleware.use(decoratorMiddleware)
│   └── middleware.ts
└── main.ts
```

**impls/user-service.impl.ts**

```typescript
import { injectable, inject } from "@husky-di/decorator";
import type { ILogger } from "../interfaces/logger.interface";
import { ILogger } from "../interfaces/logger.interface";
import type { IDatabase } from "../interfaces/database.interface";
import { IDatabase } from "../interfaces/database.interface";

@injectable()
export class UserService {
  constructor(
    @inject(ILogger) private logger: ILogger,
    @inject(IDatabase) private db: IDatabase,
  ) {}
  getUsers() {
    return this.db.query("SELECT * FROM users");
  }
}
```

**di/container.ts**

```typescript
import {
  createContainer,
  globalMiddleware,
  LifecycleEnum,
} from "@husky-di/core";
import { decoratorMiddleware } from "@husky-di/decorator";
import { ILogger } from "../interfaces/logger.interface";
import { IDatabase } from "../interfaces/database.interface";
import { IUserService } from "../interfaces/user-service.interface";
import { ConsoleLogger } from "../impls/console-logger.impl";
import { PostgresDatabase } from "../impls/postgres-database.impl";
import { UserService } from "../impls/user-service.impl";

globalMiddleware.use(decoratorMiddleware);

export const container = createContainer("AppContainer");

container.register(ILogger, {
  useClass: ConsoleLogger,
  lifecycle: LifecycleEnum.singleton,
});
container.register(IDatabase, {
  useClass: PostgresDatabase,
  lifecycle: LifecycleEnum.singleton,
});
container.register(IUserService, { useClass: UserService });
```

---

## Pattern C: Module-Based

For larger apps with clear domain boundaries. Each feature area gets its own module.

```
src/
├── interfaces/                        # Shared interfaces (used across modules)
│   ├── logger.interface.ts
│   └── database.interface.ts
├── infrastructure/
│   └── logging/
│       ├── interfaces/                # Module-local interfaces
│       │   └── logger.interface.ts    # Re-exports from src/interfaces/ or defines variants
│       ├── impls/
│       │   └── console-logger.impl.ts
│       └── logging.module.ts
├── features/
│   └── user/
│       ├── interfaces/
│       │   ├── user-service.interface.ts
│       │   └── user-repository.interface.ts
│       ├── impls/
│       │   ├── user-service.impl.ts
│       │   └── user-repository.impl.ts
│       └── user.module.ts
├── di/
│   ├── modules/
│   │   └── app.module.ts              # Root module — composes all feature modules
│   └── middleware/
│       └── logging.middleware.ts
└── main.ts
```

### File conventions

- Each `interfaces/xxx.interface.ts` exports both the TS `interface IXxx` and `const IXxx`.
- Each `impls/xxx.impl.ts` exports a single concrete class.
- Each `xxx.module.ts` exports a single `const xxxModule = createModule(...)`.
- Shared interfaces go in `src/interfaces/`; feature-specific interfaces go in the feature's `interfaces/`.
- The root `app.module.ts` composes everything and is used in `main.ts`.

**interfaces/logger.interface.ts**

```typescript
import { createServiceIdentifier } from "@husky-di/core";

export interface ILogger {
  log(msg: string): void;
}
export const ILogger = createServiceIdentifier<ILogger>("ILogger");
```

**infrastructure/logging/impls/console-logger.impl.ts**

```typescript
import type { ILogger } from "../../../interfaces/logger.interface";

export class ConsoleLogger implements ILogger {
  log(msg: string) {
    console.log(msg);
  }
}
```

**infrastructure/logging/logging.module.ts**

```typescript
import { createModule } from "@husky-di/module";
import { LifecycleEnum } from "@husky-di/core";
import type { ILogger } from "../../interfaces/logger.interface";
import { ILogger } from "../../interfaces/logger.interface";
import { ConsoleLogger } from "./impls/console-logger.impl";

export const loggingModule = createModule({
  name: "LoggingModule",
  declarations: [
    {
      serviceIdentifier: ILogger,
      useClass: ConsoleLogger,
      lifecycle: LifecycleEnum.singleton,
    },
  ],
  exports: [ILogger],
});
```

**features/user/interfaces/user-repository.interface.ts**

```typescript
import { createServiceIdentifier } from "@husky-di/core";

export interface IUserRepository {
  findAll(): User[];
}
export const IUserRepository =
  createServiceIdentifier<IUserRepository>("IUserRepository");
```

**features/user/interfaces/user-service.interface.ts**

```typescript
import { createServiceIdentifier } from "@husky-di/core";

export interface IUserService {
  getUsers(): User[];
}
export const IUserService =
  createServiceIdentifier<IUserService>("IUserService");
```

**features/user/impls/user-repository.impl.ts**

```typescript
import { injectable, inject } from "@husky-di/decorator";
import type { ILogger } from "../../../interfaces/logger.interface";
import { ILogger } from "../../../interfaces/logger.interface";
import type { IDatabase } from "../../../interfaces/database.interface";
import { IDatabase } from "../../../interfaces/database.interface";
import type { IUserRepository } from "../interfaces/user-repository.interface";

@injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @inject(ILogger) private logger: ILogger,
    @inject(IDatabase) private db: IDatabase,
  ) {}
  findAll() {
    return this.db.query("SELECT * FROM users");
  }
}
```

**features/user/impls/user-service.impl.ts**

```typescript
import { injectable, inject } from "@husky-di/decorator";
import type { IUserRepository } from "../interfaces/user-repository.interface";
import { IUserRepository } from "../interfaces/user-repository.interface";
import type { IUserService } from "../interfaces/user-service.interface";

@injectable()
export class UserService implements IUserService {
  constructor(@inject(IUserRepository) private repo: IUserRepository) {}
  getUsers() {
    return this.repo.findAll();
  }
}
```

**features/user/user.module.ts**

```typescript
import { createModule } from "@husky-di/module";
import { decoratorMiddleware } from "@husky-di/decorator";
import { LifecycleEnum } from "@husky-di/core";
import { IDatabase } from "../../interfaces/database.interface";
import { IUserRepository } from "./interfaces/user-repository.interface";
import { IUserService } from "./interfaces/user-service.interface";
import { UserRepository } from "./impls/user-repository.impl";
import { UserService } from "./impls/user-service.impl";
import { loggingModule } from "../../infrastructure/logging/logging.module";

export const userModule = createModule({
  name: "UserModule",
  imports: [loggingModule],
  declarations: [
    { serviceIdentifier: IUserRepository, useClass: UserRepository },
    { serviceIdentifier: IUserService, useClass: UserService },
  ],
  exports: [IUserService],
});

// Enable decorator-based injection within this module
userModule.use(decoratorMiddleware);
```

**di/modules/app.module.ts**

```typescript
import { createModule } from "@husky-di/module";
import { loggingModule } from "../../infrastructure/logging/logging.module";
import { userModule } from "../../features/user/user.module";

export const appModule = createModule({
  name: "AppModule",
  imports: [loggingModule, userModule],
  exports: [],
});
```

**main.ts**

```typescript
import { appModule } from "./di/modules/app.module";
import { IUserService } from "./features/user/interfaces/user-service.interface";

const userService = appModule.resolve(IUserService);
console.log(userService.getUsers());
```

### Module directory layout guidelines

| Size                      | Layout                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Single-file module        | `logging/` with `logging.module.ts` + `impls/` in a flat structure                                             |
| Small feature (2-4 files) | `user/` with `interfaces/`, `impls/`, and `user.module.ts`                                                     |
| Large feature (5+ files)  | `user/` with sub-dirs: `interfaces/`, `impls/`, `factories/`, `utils/`, `module.ts` (exported as `userModule`) |

---

## Shared vs local identifiers

**Shared** (`src/interfaces/`): Identifiers used across multiple modules (e.g., `ILogger`, `IDatabase`, `IConfig`). These sit at the top level.

**Local** (in the feature's `interfaces/`): Identifiers only relevant within one feature area (e.g., `IUserRepository` only consumed inside `UserModule`). Keep them in the feature directory to avoid polluting the shared namespace.

```typescript
// features/user/interfaces/user-repository.interface.ts
export interface IUserRepository { ... }
export const IUserRepository = createServiceIdentifier<IUserRepository>("IUserRepository");
```

## When to split into a new module

Extract a new module when:

- A group of services has a clear domain boundary (auth, payments, notifications)
- You want to enforce that consumers only access specific exports
- A module's `imports` list grows beyond 4-5 entries — consider splitting the consuming module
- You need to test the group in isolation with mock imports
