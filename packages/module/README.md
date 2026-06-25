# @husky-di/module

`@husky-di/module` gives husky-di an ESM-like module system.
It builds on top of `@husky-di/core`, so groups of services can be declared, imported, exported, and validated like modules.

If `core` answers "how are services registered and resolved?", `module` answers "how are those services grouped, exposed, and kept from colliding with each other?".

## Is This The Right Package?

This package is a good fit when:

- a single flat container is no longer enough
- you want clear declaration, import, and export boundaries
- you want conflicts and invalid exports to fail during module creation instead of later at runtime

If what you currently need is only:

- a low-level DI container:
  see `../core/README.md`
- constructor injection through decorators:
  pair it with `../decorator/README.md`

## What You Get

- `createModule()` to create modules
- `declarations` for local service declarations
- `imports` for importing exports from other modules
- `exports` for defining the public boundary of a module
- `withAliases()` for renaming imported service identifiers
- creation-time validation for duplicate declarations, import conflicts, invalid exports, circular dependencies, and more

## Installation

```bash
pnpm add @husky-di/core @husky-di/module
```

## Quick Start

The example below shows the basic idea: `CoreModule` exposes shared capabilities, `UserModule` imports what it needs, then exports its own service.

```typescript
import { createServiceIdentifier, resolve } from "@husky-di/core";
import { createModule } from "@husky-di/module";

interface Config {
  apiBaseUrl: string;
}

interface Logger {
  log(message: string): void;
}

interface UserService {
  getUser(id: string): { id: string; name: string };
}

const IConfig = createServiceIdentifier<Config>("IConfig");
const ILogger = createServiceIdentifier<Logger>("ILogger");
const IUserService = createServiceIdentifier<UserService>("IUserService");

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message);
  }
}

class DefaultUserService implements UserService {
  private readonly config = resolve(IConfig);
  private readonly logger = resolve(ILogger);

  getUser(id: string) {
    this.logger.log(`GET ${this.config.apiBaseUrl}/users/${id}`);
    return { id, name: "Ada" };
  }
}

const CoreModule = createModule({
  name: "CoreModule",
  declarations: [
    {
      serviceIdentifier: IConfig,
      useValue: { apiBaseUrl: "https://api.example.com" },
    },
    {
      serviceIdentifier: ILogger,
      useClass: ConsoleLogger,
    },
  ],
  exports: [IConfig, ILogger],
});

const UserModule = createModule({
  name: "UserModule",
  imports: [CoreModule],
  declarations: [
    {
      serviceIdentifier: IUserService,
      useClass: DefaultUserService,
    },
  ],
  exports: [IUserService],
});

const userService = UserModule.resolve(IUserService);
console.log(userService.getUser("u-1"));
```

In this example:

- `CoreModule` exposes `IConfig` and `ILogger`
- `UserModule` imports the exported view of `CoreModule`
- `DefaultUserService` uses `resolve()` to access dependencies visible inside the module
- external callers can only resolve services listed in `UserModule.exports`

## Module Mental Model

A module has four main parts:

### `name`

The display name of the module, used for debugging, error messages, and circular dependency paths.

### `declarations`

Local service declarations.
Each declaration is essentially a `core.register()` configuration plus a `serviceIdentifier`.

```typescript
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    {
      serviceIdentifier: "logger",
      useValue: { log: console.log },
    },
  ],
  exports: ["logger"],
});
```

`declarations` supports the same provider strategies as `core`:

- `useClass`
- `useFactory`
- `useValue`
- `useAlias`

### `imports`

Import services exported by other modules.

```typescript
const AppModule = createModule({
  name: "AppModule",
  imports: [LoggerModule],
});
```

What gets imported is not the entire internal state of the other module.
It is only that module's exported view.

### `exports`

Defines which service identifiers this module is willing to expose to the outside.

```typescript
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    {
      serviceIdentifier: "logger",
      useValue: { log: console.log },
    },
    {
      serviceIdentifier: "config",
      useValue: { level: "info" },
    },
  ],
  exports: ["logger"],
});
```

External callers can resolve `"logger"`, but not `"config"`.

## Declaring Services

### `useClass`

```typescript
const UserModule = createModule({
  name: "UserModule",
  declarations: [
    {
      serviceIdentifier: IUserService,
      useClass: DefaultUserService,
    },
  ],
  exports: [IUserService],
});
```

If the class depends on services inside the module, it is usually best to use `resolve()` as you would in `core`, or to assemble the dependencies explicitly with `useFactory`.

### `useFactory`

```typescript
const UserModule = createModule({
  name: "UserModule",
  imports: [CoreModule],
  declarations: [
    {
      serviceIdentifier: IUserService,
      useFactory: (container) => {
        const config = container.resolve(IConfig);
        const logger = container.resolve(ILogger);

        return {
          getUser(id: string) {
            logger.log(`GET ${config.apiBaseUrl}/users/${id}`);
            return { id, name: "Ada" };
          },
        };
      },
    },
  ],
  exports: [IUserService],
});
```

### `useValue`

```typescript
const ConfigModule = createModule({
  name: "ConfigModule",
  declarations: [
    {
      serviceIdentifier: IConfig,
      useValue: { apiBaseUrl: "https://api.example.com" },
    },
  ],
  exports: [IConfig],
});
```

### `useAlias`

You can also create aliases inside module-local declarations:

```typescript
const LoggerModule = createModule({
  name: "LoggerModule",
  declarations: [
    { serviceIdentifier: ILogger, useClass: ConsoleLogger },
    { serviceIdentifier: "appLogger", useAlias: ILogger },
  ],
  exports: ["appLogger"],
});
```

## Importing And Re-exporting

A module can import services and optionally export them again.

```typescript
const SharedModule = createModule({
  name: "SharedModule",
  imports: [ConfigModule, LoggerModule],
  exports: [IConfig, ILogger],
});
```

`SharedModule` has no local declarations here.
It simply re-exposes services exported by its imported modules.

## `withAliases()`: Renaming Imports

If multiple modules export the same identifier, or if you want a different local name in the current module, use `withAliases()`.

```typescript
const CoreModule = createModule({
  name: "CoreModule",
  declarations: [
    { serviceIdentifier: "logger", useValue: { log: () => "core" } },
    { serviceIdentifier: "config", useValue: { env: "production" } },
  ],
  exports: ["logger", "config"],
});

const AppModule = createModule({
  name: "AppModule",
  imports: [
    CoreModule.withAliases([
      { serviceIdentifier: "logger", as: "appLogger" },
    ]),
  ],
  exports: ["appLogger", "config"],
});

AppModule.resolve("appLogger");
AppModule.resolve("config");
```

Important semantics:

- an alias renames, it does not filter
- an aliased service enters the current module scope under the new name
- exports that are not aliased still enter under their original names
- once a service has been aliased, the original imported name is no longer visible in the current module scope

So in the example above:

- `"appLogger"` is visible
- `"config"` is visible
- `"logger"` is not visible

## Why Export Boundaries Matter

One of the most important behaviors in `module` is strict export-boundary enforcement.

```typescript
const DatabaseModule = createModule({
  name: "DatabaseModule",
  declarations: [
    { serviceIdentifier: "config", useValue: { host: "localhost" } },
    { serviceIdentifier: "database", useClass: DatabaseService },
  ],
  exports: ["database"],
});

DatabaseModule.resolve("database"); // ok
DatabaseModule.resolve("config"); // throws
```

Here, `"config"` is available internally, but it is not public API.

There are two layers to keep in mind:

- external callers using `module.resolve()` can only get services listed in `exports`
- the internal resolution flow can still access local declarations and imported internal dependencies

That gives you room to compose internal details without exposing them as public surface area.

## What A Module Instance Can Do

The object returned by `createModule()` is also a container facade with export-boundary protection.

You can call:

- `module.resolve()`
- `module.isRegistered()`
- `module.getServiceIdentifiers()`
- `module.use()`
- `module.unused()`
- `module.withAliases()`

You can also inspect:

- `module.container`
- `module.name`
- `module.displayName`
- `module.declarations`
- `module.imports`
- `module.exports`

## What Gets Validated At Creation Time

`module` tries to surface structural problems as early as possible.

### Duplicate Declarations

The same module cannot declare the same `serviceIdentifier` twice.

### Duplicate Module Imports

The same module instance cannot appear more than once in `imports`.

### Import Name Conflicts

If two imported modules export the same service and you do not resolve the conflict with aliases, module creation fails immediately.

### Local Declaration And Import Conflicts

A locally visible imported name cannot collide with one of the module's own declarations.

### Exporting Non-existent Services

Every item in `exports` must come from:

- a local declaration
- an imported module export
- a service that entered the current module scope through aliasing

### Circular Dependencies

The module import graph cannot contain cycles.

## How It Relates To `core` And `decorator`

`@husky-di/module` does not replace `core`.
It is built directly on top of it:

- provider semantics come from `core`
- container resolution and lifecycles come from `core`
- `resolve()` still comes from `core`

If you want to keep using constructor decorator injection inside module `useClass` declarations, you can pair it with `@husky-di/decorator` as well.
The two packages solve different problems:

- `module` owns boundaries, imports, and exports
- `decorator` owns constructor-parameter injection

## Complete Example

```typescript
import { createServiceIdentifier, resolve } from "@husky-di/core";
import { createModule } from "@husky-di/module";

interface DatabaseConfig {
  type: string;
  host: string;
  port: number;
}

interface Database {
  connect(): string;
}

interface AuthService {
  authenticate(): { authenticated: true; token: string };
}

interface App {
  bootstrap(): string;
}

const IDatabaseConfig =
  createServiceIdentifier<DatabaseConfig>("IDatabaseConfig");
const IDatabase = createServiceIdentifier<Database>("IDatabase");
const IAuthService = createServiceIdentifier<AuthService>("IAuthService");
const IApp = createServiceIdentifier<App>("IApp");

class DatabaseService implements Database {
  private readonly config = resolve(IDatabaseConfig);

  connect() {
    return `Connected to ${this.config.type} at ${this.config.host}:${this.config.port}`;
  }
}

class DefaultAuthService implements AuthService {
  authenticate() {
    return { authenticated: true, token: "test-token" } as const;
  }
}

class AppService implements App {
  private readonly database = resolve(IDatabase);
  private readonly authService = resolve(IAuthService);

  bootstrap() {
    this.database.connect();
    this.authService.authenticate();
    return "Application bootstrapped successfully";
  }
}

const DatabaseModule = createModule({
  name: "DatabaseModule",
  declarations: [
    {
      serviceIdentifier: IDatabaseConfig,
      useValue: {
        type: "sqlite",
        host: "localhost",
        port: 3306,
      },
    },
    {
      serviceIdentifier: IDatabase,
      useClass: DatabaseService,
    },
  ],
  exports: [IDatabase],
});

const AuthModule = createModule({
  name: "AuthModule",
  declarations: [
    {
      serviceIdentifier: IAuthService,
      useClass: DefaultAuthService,
    },
  ],
  exports: [IAuthService],
});

const AppModule = createModule({
  name: "AppModule",
  imports: [DatabaseModule, AuthModule],
  declarations: [
    {
      serviceIdentifier: IApp,
      useClass: AppService,
    },
  ],
  exports: [IApp],
});

const app = AppModule.resolve(IApp);
console.log(app.bootstrap());
```

## Related Docs

- container and resolution model: `../core/README.md`
- module behavior specification: `./docs/SPECIFICATION.md`
- decorator support: `../decorator/README.md`

## Local Development

```bash
pnpm build
pnpm test
```
