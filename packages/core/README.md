# @husky-di/core

`@husky-di/core` is the foundation of husky-di.
It handles the core runtime responsibilities: registering services, resolving services, managing lifecycles, and keeping the whole resolution flow predictable, testable, and inspectable.

You can think of it as the runtime base layer for the whole ecosystem:

- If you only want a clear, explicit, type-safe DI container, this package is enough.
- If you want constructor injection with decorators, add `@husky-di/decorator` on top.
- If you want module boundaries with imports and exports, add `@husky-di/module` on top.

## Is This The Right Package?

This package is a good fit when:

- you want dependencies to be registered explicitly
- you want full control over how resolution happens
- you care more about predictable runtime behavior than automatic guessing
- you need lifecycles, middleware, parent/child containers, or `ref` / `dynamic`

If what you really want is:

- "mark a class and inject constructor parameters automatically":
  see `../decorator/README.md`
- "organize services behind module boundaries with import/export validation":
  see `../module/README.md`

## What You Get

- type-safe `ServiceIdentifier`
- four registration strategies: `useClass`, `useFactory`, `useValue`, `useAlias`
- three lifecycles: `transient`, `singleton`, `resolution`
- resolution options: `optional`, `defaultValue`, `multiple`, `ref`, `dynamic`
- parent/child container lookup
- global and local resolution middleware
- reusable `RegistrationPlan`
- readable resolution paths and error messages

## Installation

```bash
pnpm add @husky-di/core
```

## Quick Start

The example below shows a common `core` style: define your own service identifiers, register classes explicitly, and use `resolve()` inside classes created by the container.

In most cases, `createServiceIdentifier<T>()` is the best default.

```typescript
import {
  createContainer,
  createServiceIdentifier,
  resolve,
} from "@husky-di/core";

interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(`[log] ${message}`);
  }
}

class UserService {
  private readonly logger = resolve(ILogger);

  getUser(id: string) {
    this.logger.log(`load user: ${id}`);
    return { id, name: "Ada" };
  }
}

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IUserService = createServiceIdentifier<UserService>("IUserService");

const container = createContainer("AppContainer");

container.register(ILogger, {
  useClass: ConsoleLogger,
});

container.register(IUserService, {
  useClass: UserService,
});

const userService = container.resolve(IUserService);
console.log(userService.getUser("u-1"));
```

`UserService` resolves `ILogger` from the active resolution context.
`@husky-di/core` does not inject constructor parameters automatically, but classes resolved by the container can use `resolve()` inside the resolution flow.

## Core Mental Model

### ServiceIdentifier

A service identifier is the key the container uses to look up a service.
It can be:

- a class constructor
- an abstract constructor
- a `string`
- a `symbol`

All of these are supported, but `createServiceIdentifier<T>()` is usually the best choice because it preserves both a runtime name and TypeScript type information.

```typescript
const ILogger = createServiceIdentifier<Logger>("ILogger");
const IConfig = createServiceIdentifier<{ apiBaseUrl: string }>("IConfig");
```

### Container

A container is responsible for:

- registering services
- resolving services
- maintaining lifecycle caches
- composing middleware chains
- falling back across parent/child container boundaries

```typescript
import { createContainer, rootContainer } from "@husky-di/core";

const app = createContainer("App");
const feature = createContainer("Feature", rootContainer);
```

`app.parent === rootContainer` because `createContainer()` attaches to `rootContainer` by default when you do not pass a parent explicitly.

## Registering Services

### `useClass`

Use this when the class can be created directly, or when dependency injection is handled by middleware or an upper-layer package.

```typescript
class ConsoleLogger {
  log(message: string) {
    console.log(message);
  }
}

container.register(ILogger, {
  useClass: ConsoleLogger,
});
```

`core` does not automatically inject constructor parameters by itself.
If you want class dependencies to be declared and injected automatically, pair it with `@husky-di/decorator`.

### `useFactory`

Use this when you want to assemble a value explicitly, return a plain object, or branch on container state at creation time.

```typescript
interface UserService {
  getUser(id: string): { id: string; name: string };
}

const IUserService = createServiceIdentifier<UserService>("IUserService");

container.register(IUserService, {
  useFactory: () => {
    const logger = resolve(ILogger);

    return {
      getUser(id: string) {
        logger.log(`load user: ${id}`);
        return { id, name: "Ada" };
      },
    };
  },
});
```

Factories also run inside the active resolution context, so they can use `resolve()` directly.
If you need the concrete container instance itself, the factory callback can still receive it as an argument.

### `useValue`

Use this for configuration objects, constants, or already-existing instances.

```typescript
const IConfig = createServiceIdentifier<{ apiBaseUrl: string }>("IConfig");

container.register(IConfig, {
  useValue: {
    apiBaseUrl: "https://api.example.com",
  },
});
```

### `useAlias`

Use this when you want to expose the same implementation under multiple identifiers, or forward resolution to another service identifier.

```typescript
const IAppLogger = createServiceIdentifier<Logger>("IAppLogger");

container.register(IAppLogger, {
  useAlias: ILogger,
});

const logger = container.resolve(IAppLogger);
```

You can also point an alias at another container through `getContainer`.

```typescript
const shared = createContainer("Shared");
const app = createContainer("App");

shared.register(ILogger, {
  useClass: ConsoleLogger,
  lifecycle: LifecycleEnum.singleton,
});

app.register(IAppLogger, {
  useAlias: ILogger,
  getContainer: () => shared,
});

const logger = app.resolve(IAppLogger);
logger.log("hello from shared container");
```

This works well when the current container wants to reuse a service from another container without registering that service again locally.
You can achieve the same goal with `useFactory`, but if the intent is simply "this identifier is an alias for that service in another container", `useAlias` expresses that intent more directly.

## Lifecycles

### `LifecycleEnum.transient`

This is the default lifecycle.
A new instance is created every time the service is resolved.

```typescript
container.register(ILogger, {
  useClass: ConsoleLogger,
  lifecycle: LifecycleEnum.transient,
});
```

### `LifecycleEnum.singleton`

Only one instance is created per container, then reused for subsequent resolutions in that same container.

```typescript
container.register(ILogger, {
  useClass: ConsoleLogger,
  lifecycle: LifecycleEnum.singleton,
});
```

### `LifecycleEnum.resolution`

The same instance is reused within a single resolution chain, but not across separate top-level resolutions.

This is useful for "once per request", "once per task", or "once per resolution flow" style objects.

## Resolving Services

### Default Resolution

By default, the most recently registered value wins.

```typescript
const logger = container.resolve(ILogger);
```

### Optional Resolution

```typescript
const logger = container.resolve(ILogger, {
  optional: true,
});
```

If nothing is registered, this returns `undefined`.

### Default Value

```typescript
const logger = container.resolve(ILogger, {
  optional: true,
  defaultValue: {
    log(message: string) {
      console.log(`[fallback] ${message}`);
    },
  },
});
```

`defaultValue` can only be used together with `optional: true`.

### Resolving Multiple Services

The same `ServiceIdentifier` can be registered more than once.
When you pass `multiple: true`, all registered instances are returned in registration order.

```typescript
container.register(ILogger, { useClass: ConsoleLogger });
container.register(ILogger, {
  useValue: {
    log(message: string) {
      console.log(`[audit] ${message}`);
    },
  },
});

const loggers = container.resolve(ILogger, {
  multiple: true,
});
```

### `ref`

`ref: true` returns a lazy reference with a `.current` property.
The first access resolves the value, and later accesses reuse the cached result.

```typescript
const loggerRef = container.resolve(ILogger, {
  ref: true,
});

loggerRef.current.log("hello");
```

This is often useful for partially breaking circular dependencies or delaying instantiation.

### `dynamic`

`dynamic: true` also returns a `.current` reference, but each access re-runs resolution.

```typescript
const loggerRef = container.resolve(ILogger, {
  dynamic: true,
});

loggerRef.current.log("first");
loggerRef.current.log("second");
```

Prefer `ref` unless you specifically need "re-resolve every time this value is read".
Even after a value has already been resolved, `dynamic` keeps the resolution closure and context alive.
By contrast, `ref` releases that closure after the first resolution and cached value are established, which makes it the better default in most cases.

### The `resolve()` Helper

`resolve()` lets you resolve another service from inside an active resolution context.
You will often see it in factories or inside objects instantiated by the container.

```typescript
import {
  createContainer,
  createServiceIdentifier,
  resolve,
  ResolveContainerScopeEnum,
} from "@husky-di/core";

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IServiceA = createServiceIdentifier<ServiceA>("IServiceA");

class ServiceA {
  readonly loggerRef = resolve(ILogger, { ref: true });
}

const container = createContainer();
container.register(ILogger, { useClass: ConsoleLogger });
container.register(IServiceA, { useClass: ServiceA });

const serviceA = container.resolve(IServiceA);
serviceA.loggerRef.current.log("inside resolve context");
```

`resolve()` cannot be called outside the container resolution flow.
If you do, it throws `E_RESOLVE_CONTEXT_UNAVAILABLE`.

By default, `resolve()` continues from the container currently performing the
active resolution step. If you need to continue from the container that started
the current resolution chain instead, pass `scope: ResolveContainerScopeEnum.origin`.

```typescript
class Database {
  readonly options = resolve(IDatabaseOptions, {
    scope: ResolveContainerScopeEnum.origin,
  });
}
```

## Container Hierarchy

A child container checks its own registrations first, then falls back to the parent if needed.
That parent can be `rootContainer` or any other container you pass explicitly.

```typescript
const parent = createContainer("Parent");
const child = createContainer("Child", parent);

parent.register(ILogger, {
  useClass: ConsoleLogger,
  lifecycle: LifecycleEnum.singleton,
});

const logger = child.resolve(ILogger);
```

Key points:

- registrations in a child container do not affect the parent
- a child registration overrides the parent result for the same identifier
- registrations fall back across the hierarchy, but local middleware does not inherit across container boundaries

## Registration Plans

`RegistrationPlan` lets you group a set of registrations into a reusable plan.

```typescript
import {
  createContainer,
  createRegistrationPlan,
  createServiceIdentifier,
} from "@husky-di/core";

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IConfig = createServiceIdentifier<{ env: string }>("IConfig");

const plan = createRegistrationPlan((register) => {
  register(ILogger, { useClass: ConsoleLogger });
  register(IConfig, {
    useValue: { env: "production" },
  });
});

const container = createContainer("AppContainer");
const cleanup = container.applyRegistrationPlan(plan);
```

Why this is useful:

- you can reuse the same registration set across multiple containers
- `applyRegistrationPlan()` returns a cleanup function
- if one step fails while applying the plan, previously applied registrations are rolled back automatically

## Middleware

Middleware can intercept the resolution flow for logging, monitoring, caching, fallback behavior, or custom instantiation strategies.

### Local Middleware

```typescript
container.use({
  name: "timing",
  executor(params, next) {
    const start = performance.now();
    const result = next();
    console.log(params.container.name, performance.now() - start);
    return result;
  },
});
```

### Global Middleware

```typescript
import { globalMiddleware } from "@husky-di/core";

globalMiddleware.use({
  name: "logging",
  executor(params, next) {
    console.log(`resolving: ${String(params.serviceIdentifier)}`);
    return next();
  },
});
```

Middleware runs in LIFO order:

- the last registered middleware runs first
- local middleware wraps around global middleware
- if `next()` is not called, resolution can be short-circuited

## Disposal And Cleanup

Containers support disposal, which is useful at test boundaries, task boundaries, or application shutdown.

```typescript
const container = createContainer("DisposableContainer");

container.dispose();
```

After disposal:

- the container rejects future operations
- registered middleware receives `onContainerDispose`
- repeated `dispose()` calls remain idempotent

## When To Add `@husky-di/decorator`

If you want to write code like this:

```typescript
@injectable()
class UserService {
  constructor(@inject(ILogger) private readonly logger: Logger) {}
}
```

then you need to:

1. use `@husky-di/decorator`
2. register `decoratorMiddleware`
3. enable TypeScript decorator metadata

`@husky-di/core` owns the container and resolution model.
`@husky-di/decorator` translates decorator metadata into `core` resolution behavior.

## Related Docs

- behavior specification: `./docs/SPECIFICATION.md`
- decorator support: `../decorator/README.md`
- module system: `../module/README.md`

## Local Development

```bash
pnpm build
pnpm test
pnpm bench
```
