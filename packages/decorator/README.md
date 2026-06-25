# @husky-di/decorator

`@husky-di/decorator` adds decorator support to husky-di.
It translates TypeScript decorator metadata into `@husky-di/core` resolution behavior, so you can declare dependencies directly on constructor parameters.

You can think of it as a syntax layer on top of `core`:

- it makes dependency declaration feel more natural
- it does not replace the container itself, and lifecycle, middleware, `ref`, and `dynamic` still come from `@husky-di/core`

This package currently supports TypeScript experimental decorators only, not ES decorators.
The reason is straightforward: husky-di depends on parameter decorators for constructor injection, and ES decorators do not provide that capability.

## Is This The Right Package?

This package is a good fit when:

- you want dependencies to live directly on constructor parameters
- you do not want to hand-write wiring for every class
- you are comfortable using TypeScript experimental decorators and `reflect-metadata`

If what you really want is:

- a low-level container with no decorator dependency:
  see `../core/README.md`
- module import/export boundaries:
  pair it with `../module/README.md`

## What You Get

- `@injectable()` to mark classes as instantiable through decorator-aware resolution
- `@inject()` to declare service identifiers and resolve options for constructor parameters
- `@tagged()` as the low-level metadata decorator for custom abstractions
- `decoratorMiddleware` to read injection metadata during class resolution
- stable error exports such as `DecoratorException` and `DecoratorErrorCodeEnum`

## Installation

```bash
pnpm add @husky-di/core @husky-di/decorator reflect-metadata
```

`reflect-metadata` is a peer dependency.
At runtime, you need to load it first or provide a compatible Reflect metadata implementation.

## TypeScript Configuration

Enable TypeScript experimental decorators and metadata emission:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Quick Start

The example below shows the most common setup: register the middleware once, then declare dependencies directly on constructor parameters.

```typescript
import "reflect-metadata";
import {
  createContainer,
  createServiceIdentifier,
  globalMiddleware,
} from "@husky-di/core";
import {
  decoratorMiddleware,
  inject,
  injectable,
} from "@husky-di/decorator";

interface Logger {
  log(message: string): void;
}

const ILogger = createServiceIdentifier<Logger>("ILogger");

@injectable()
class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(`[log] ${message}`);
  }
}

@injectable()
class UserService {
  constructor(@inject(ILogger) private readonly logger: Logger) {}

  getUser(id: string) {
    this.logger.log(`load user: ${id}`);
    return { id, name: "Ada" };
  }
}

globalMiddleware.use(decoratorMiddleware);

const container = createContainer("AppContainer");
container.register(ILogger, { useClass: ConsoleLogger });

const userService = container.resolve(UserService);
console.log(userService.getUser("u-1"));
```

In this example:

- `decoratorMiddleware` reads constructor parameter metadata
- `@inject(ILogger)` maps an interface dependency to a runtime-visible service identifier

With plain `@husky-di/core`, a common alternative is to resolve the dependency inside the class directly:

```typescript
import { resolve } from "@husky-di/core";

class UserService {
  private readonly logger = resolve(ILogger);

  getUser(id: string) {
    this.logger.log(`load user: ${id}`);
    return { id, name: "Ada" };
  }
}
```

## Adding It To An Existing Project

### Register Middleware Globally

This is the recommended option for most applications:

```typescript
import { globalMiddleware } from "@husky-di/core";
import { decoratorMiddleware } from "@husky-di/decorator";

globalMiddleware.use(decoratorMiddleware);
```

That enables decorator-based constructor injection for all containers.

### Register Middleware Locally

If you only want decorator support in one container, register it locally instead:

```typescript
const container = createContainer("FeatureContainer");
container.use(decoratorMiddleware);
```

## Main APIs

### `@injectable()`

Marks a class as instantiable by the decorator middleware and merges its parameter metadata into the internal metadata store.

```typescript
import { injectable } from "@husky-di/decorator";

@injectable()
class UserService {}
```

Key points:

- the same class cannot be decorated with `@injectable()` more than once
- parameters without explicit `@inject()` are inferred from `design:paramtypes`
- if inference resolves to a primitive instead of a class, resolution fails immediately

### `@inject()`

Explicitly declares the service identifier for a constructor parameter.

```typescript
@injectable()
class UserService {
  constructor(@inject(ILogger) private readonly logger: Logger) {}
}
```

The supported service identifier kinds match `core`:

- class constructor
- `symbol`
- `string`

### `@tagged()`

`@tagged()` is the lower-level metadata decorator.
It accepts the full `InjectionMetadata` object directly.

```typescript
import { tagged, injectable } from "@husky-di/decorator";

@injectable()
class UserService {
  constructor(
    @tagged({ serviceIdentifier: ILogger, optional: true })
    private readonly logger?: Logger
  ) {}
}
```

This is useful when:

- you want to build a domain-specific custom decorator
- you want full control over the metadata instead of the `@inject()` shorthand

## Cases Where You Should Explicitly Use `@inject()`

### Interface Types

Interfaces do not exist at runtime, so you must provide a runtime-visible service identifier explicitly.

```typescript
interface Logger {
  log(message: string): void;
}

const ILogger = createServiceIdentifier<Logger>("ILogger");

@injectable()
class UserService {
  constructor(@inject(ILogger) private readonly logger: Logger) {}
}
```

### Primitive Types

Primitive types such as `string`, `number`, and `boolean` also need an explicit identifier.

```typescript
const API_BASE_URL = Symbol("API_BASE_URL");

@injectable()
class ApiClient {
  constructor(@inject(API_BASE_URL) private readonly baseUrl: string) {}
}
```

### When You Want To Override Inference

Even if the parameter type is a class, you should still write `@inject()` or `@tagged()` when you want to:

- use a different token
- enable `optional`
- enable `ref`
- enable `dynamic`

## Injection Options

The decorator layer supports the same resolve options as `core.resolve()`.

### `optional`

Return `undefined` instead of throwing when the dependency is missing.

```typescript
@injectable()
class UserService {
  constructor(
    @inject("auditLogger", { optional: true })
    private readonly auditLogger?: { log(message: string): void }
  ) {}
}
```

### `ref`

Return a lazy reference, which is useful for deferred access or partially breaking circular dependencies.

```typescript
import type { Ref } from "@husky-di/core";

@injectable()
class UserService {
  constructor(
    @inject(ILogger, { ref: true })
    private readonly loggerRef: Ref<Logger>
  ) {}

  run() {
    this.loggerRef.current.log("run");
  }
}
```

### `dynamic`

Return a dynamic reference whose `.current` value is re-resolved on every access.

```typescript
import type { Ref } from "@husky-di/core";

@injectable()
class UserService {
  constructor(
    @inject(ILogger, { dynamic: true })
    private readonly loggerRef: Ref<Logger>
  ) {}
}
```

Prefer `ref` unless you specifically need to re-run resolution every time the value is read.

## When Automatic Inference Works

### Cases Where Type Inference Is Enough

If the parameter itself is a class, and that class is also marked with `@injectable()`, you can omit `@inject()`:

```typescript
@injectable()
class LoggerService {}

@injectable()
class UserService {
  constructor(private readonly logger: LoggerService) {}
}
```

### Cases Where You Should Not Rely On Inference

Do not rely on automatic inference in these cases:

- the parameter type is an interface
- the parameter type is a primitive
- you need `optional`
- you need `ref`
- you need `dynamic`
- you want to bind the parameter to a different token than its runtime class

## Relationship To `core`

`@husky-di/decorator` does not replace `core`.
It is a syntax layer built on top of it.

You still keep using:

- `createContainer()`
- `createServiceIdentifier()`
- `LifecycleEnum`
- `globalMiddleware`
- `resolve()` / `ref` / `dynamic`

The decorator middleware only participates in the class-instantiation phase.
Registrations such as `useValue`, `useFactory`, and `useAlias` still follow normal `core` rules.

## Common Pitfalls

### Forgetting To Register `decoratorMiddleware`

If the middleware is not registered, the container does not read decorator metadata.

### Forgetting To Import `reflect-metadata`

Without Reflect metadata at runtime, the implementation cannot access `design:paramtypes`.

### Using Interfaces Or Primitives Without `@inject()`

That leaves the metadata incomplete or points inference at the wrong runtime identifier.

### Applying `@injectable()` Twice To The Same Class

This throws `E_DUPLICATE_INJECTABLE`.

### Using `dynamic` And `ref` Together

These options are mutually exclusive and throw `E_CONFLICTING_OPTIONS`.

## Complete Example

```typescript
import "reflect-metadata";
import {
  createContainer,
  createServiceIdentifier,
  globalMiddleware,
  type Ref,
} from "@husky-di/core";
import {
  decoratorMiddleware,
  inject,
  injectable,
} from "@husky-di/decorator";

interface Config {
  apiBaseUrl: string;
}

interface Logger {
  log(message: string): void;
}

const IConfig = createServiceIdentifier<Config>("IConfig");
const ILogger = createServiceIdentifier<Logger>("ILogger");

@injectable()
class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message);
  }
}

@injectable()
class ApiClient {
  constructor(
    @inject(IConfig) private readonly config: Config,
    @inject(ILogger, { ref: true }) private readonly loggerRef: Ref<Logger>
  ) {}

  getUser(id: string) {
    this.loggerRef.current.log(`GET ${this.config.apiBaseUrl}/users/${id}`);
    return { id, name: "Ada" };
  }
}

globalMiddleware.use(decoratorMiddleware);

const container = createContainer("AppContainer");
container.register(IConfig, {
  useValue: { apiBaseUrl: "https://api.example.com" },
});
container.register(ILogger, { useClass: ConsoleLogger });

const apiClient = container.resolve(ApiClient);
console.log(apiClient.getUser("u-1"));
```

## Related Docs

- container and resolution model: `../core/README.md`
- decorator behavior specification: `./docs/SPECIFICATION.md`
- module system: `../module/README.md`

## Local Development

```bash
pnpm build
pnpm test
```
