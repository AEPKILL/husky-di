# APIs

## Container

The main APIs you'll use are `register` and `resolve`.

### register

Registers a service in the container.

It takes two parameters:

1. The service identifier (a string, symbol, or constructor function)
2. The service [provider](#providers)

It's recommended to use [createServiceIdentifier](#createserviceidentifier) to generate a type-safe service identifier.

Example:

```typescript
import { Container, ValueProvider } from "husky-di";

const container = new Container("Container");

container.register(
  "Pi",
  new ValueProvider({
    useValue: 3.14
  })
);
```

You can bind multiple providers to a single service identifier. For instance, in a logging system, you might have both local and remote logs:

```typescript
import { Container, ClassProvider } from "husky-di";
import { LocalLogService } from "@/services/local-log.service";
import { RemoteLogService } from "@/services/remote-log.service";

const container = new Container("Container");

const ILog = createServiceIdentifier("ILog");

container.register(
  ILog,
  new ClassProvider({
    useClass: LocalLogService
  })
);

container.register(
  ILog,
  new ClassProvider({
    useClass: RemoteLogService
  })
);
```

### resolve

Resolves an instance from the container.

#### Single instance

Resolves the most recently bound provider for a given service identifier:

```typescript
const log = container.resolve("ILog");
```

#### Multiple instances

Resolves all providers bound to the service identifier:

```typescript
const logs = container.resolve("ILog", {
  multiple: true
});
```

#### ref

References an object without resolving it immediately. It's resolved only when used:

```typescript
// Not resolved immediately
const logRef = container.resolve("ILog", {
  ref: true
});

// Resolved when used and caches the value
logRef.current.log();
```

#### dynamic

Similar to `ref`, but doesn't cache the resolved result:

```typescript
// Not resolved immediately
const logRef = container.resolve("ILog", {
  dynamic: true
});

// Resolved when used, not cached
logRef.current.log();
```

#### optional

Doesn't throw an exception if no providers are registered for the service identifier.

#### defaultValue

If `optional` is true and no providers are registered, returns the specified default value.

### unRegister

Unregister a provider bound to the service identifier from the container:

```typescript
const piProvider = new ValueProvider({
  useValue: 3.14
});

container.unRegister("Pi", piProvider);
```

To unregister all providers bound to a service identifier:

```typescript
// Only pass the service identifier
container.unRegister("Pi");
```

### isRegistered

Checks if the service identifier has been registered with a provider:

```typescript
const piProvider = new ValueProvider({
  useValue: 3.14
});

// Check if any provider is registered for "Pi"
container.isRegistered("Pi");

// Check if a specific provider is registered for "Pi"
container.isRegistered("Pi", {
  provider: piProvider
});
```

### getProvider

Gets the most recently registered provider for a given service identifier:

```typescript
const piProvider = container.getProvider("pi");
```

### getAllProvider

Gets all registered providers for a given service identifier:

```typescript
const logProviders = container.getAllProvider("ILog");
```

### getAllRegisteredServiceIdentifiers

Gets all service identifiers registered on the container:

```typescript
const serviceIdentifiers = container.getAllRegisteredServiceIdentifiers();
```

### addMiddleware

Adds middleware to a container. Middleware can perform additional operations during the resolve handling process:

```typescript
container.addMiddleware((next) => (params) => {
  console.log("before resolve");
  const result = next(params);
  console.log("after resolve");

  return result;
});
```

`addMiddleware` returns a function that can be used to remove the middleware:

```typescript
const removeMiddleware = container.addMiddleware((next) => (params) => {
  return next(params);
});

// Remove
removeMiddleware();
```

### Container.addMiddleware

Adds middleware to all containers:

```typescript
import { Container } from "husky-di";

Container.addMiddleware((next) => (params) => {
  return next(params);
});
```

## Providers

### CommonOptions

#### lifecycle

- `LifecycleEnum.transient` (default)
  Creates a new instance every time it's resolved.

- `LifecycleEnum.singleton`
  Creates a new instance the first time it's resolved, then returns the same instance for subsequent resolutions.

- `LifecycleEnum.resolution`
  Creates a new instance for each resolution context, then returns the same instance within that context.

Example:

```typescript
import { Container, ClassProvider, LifecycleEnum } from "husky-di";
import { DatabaseService } from "@/services/database.service";

const IDatabase = createServiceIdentifier("IDatabase");
const container = new Container("Container");

container.register(
  IDatabase,
  new ClassProvider({
    lifecycle: LifecycleEnum.singleton,
    useClass: DatabaseService
  })
);
```

#### isPrivate

Indicates whether a provider is container-private. Private providers can only be used internally within the container:

```typescript
import {
  Container,
  ClassProvider,
  injectable,
  inject,
  LifecycleEnum,
  createServiceIdentifier
} from "husky-di";
import { DatabaseService } from "@/services/database.service";

const container = new Container("Container");

const IDatabase = createServiceIdentifier<DatabaseService>("IDatabase");

// Register the database service as private
container.register(
  IDatabase,
  new ClassProvider({
    isPrivate: true,
    lifecycle: LifecycleEnum.singleton,
    useClass: DatabaseService
  })
);

@injectable()
class BookStoreService {
  constructor(@inject(IDatabase) private database: IDatabase) {}
}
const IBookStore = createServiceIdentifier<BookStoreService>("IBookStore");

container.register(
  IBookStore,
  new ClassProvider({
    useClass: BookStoreService
  })
);

// OK: IBookStore is registered internally, allowing injection of private IDatabase
container.resolve(IBookStore);

// Error: IDatabase is private and can't be resolved directly
container.resolve(IDatabase);
```

### ClassProvider

Used to resolve classes by their constructor:

```typescript
import { Container, ClassProvide, createServiceIdentifier } from "husky-di";
import { DatabaseService } from "@/services/database.service";

const container = new Container("Container");
const IDatabase = createServiceIdentifier<DatabaseService>("IDatabase");

container.register(
  IDatabase,
  new ClassProvider({
    useClass: DatabaseService
  })
);
```

### ValueProvider

Used to resolve a given value:

```typescript
import { Container, ValueProvide, createServiceIdentifier } from "husky-di";

const container = new Container("Container");
const IPi = createServiceIdentifier<number>("IPi");

container.register(
  IPi,
  new ValueProvider({
    useValue: 3.14
  })
);
```

### FactoryProvider

Used to resolve a given factory:

```typescript
import { Container, FactoryProvide, createServiceIdentifier } from "husky-di";

const container = new Container("Container");
const IPi = createServiceIdentifier<number>("IPi");

container.register(
  IPi,
  new ValueProvider({
    useFactory() {
      return 3.14;
    }
  })
);
```

## Decorators

### @injectable

Indicates that a class can be injected:

```typescript
import { injectable } from "husky-di";

@injectable()
class BasicService {}
```

> Note: `@injectable` is also necessary when a class has no decorators, as TypeScript won't generate parameter metadata otherwise.

### @inject

Injects a specified value into the constructor's parameters:

```typescript
class BookStoreService {
  constructor(@inject(IDatabase) private readonly database: IDatabase) {
    // ...
  }
}
```

### @tagged

An internal decorator used to add metadata tags to the constructor's parameters.

## Utilities

### createServiceIdentifier

Creates a type-safe service identifier. This is recommended over using strings or symbols directly:

```typescript
const IConstNumber = createServiceIdentifier<number>("IConstNumber");

const constNumber = container.resolve(IConstNumber);

// This will result in a compilation error:
// const constNumber = container.resolve<string>(IConstNumber)
```

### static resolve

This is different from [container.resolve](#resolve).

It must be called within a resolution context. It looks for the current container in the context and then executes the resolve:

```typescript
import {
  Container,
  ClassProvider,
  injectable,
  inject,
  LifecycleEnum,
  createServiceIdentifier
} from "husky-di";
import { DatabaseService } from "@/services/database.service";

const container = new Container("Container");

const IDatabase = createServiceIdentifier<DatabaseService>("IDatabase");

container.register(
  IDatabase,
  new ClassProvider({
    useClass: DatabaseService
  })
);

@injectable()
class BookStoreService {
  private database: IDatabase;
  constructor() {
    // This is equivalent to calling container.resolve
    // It must be called within a resolution context
    this.database = resolve(IDatabase);
  }
}
const IBookStore = createServiceIdentifier<BookStoreService>("IBookStore");
container.register(
  IBookStore,
  new ClassProvider({
    useClass: BookStoreService
  })
);

container.resolve(IBookStore);
```

It's particularly useful when you need to choose one service from several options:

```typescript
// Select a database service based on conditions
@injectable()
class BookStoreService {
  private database: IDatabase;
  constructor() {
    if (supportDatabase1) {
      this.database = resolve(database1);
    } else {
      this.database = resolve(database2);
    }
  }
}
```

This approach is more efficient than injecting multiple services and choosing between them, as it only creates the instances you actually need.
