# APIs

## Container

The main APIs that will be used are `register` and `resolve`.

### register

Register a service in the container.

It takes two parameters. The first parameter is the service identifier, which can be a string, symbol, or constructor function. It is recommended to use [createServiceIdentifier](#createserviceidentifier) to generate a type-safe service identifier. The second parameter is the service [provider](#providers).

e.g.

```typescript
  import { Container, ValueProvider } from 'husky-di';

  const container = new Container('Container');

  container.register('Pi', new ValueProvider({
    useValue: 3.14
  }))

 ```

It is possible to bind multiple providers to a single service identifier. For instance, in the case of a logging system, there could be multiple log records, such as local logs and remote logs.

e.g.

```typescript
  import { Container, ClassProvider } from 'husky-di';
  import { LocalLogService } from '@/services/local-log.service'
  import { RemoteLogService } from '@/services/remote-log.service'

  const container = new Container('Container');
  

  const ILog = createServiceIdentifier('ILog')

  container.register(ILog, new ClassProvider({
    useClass: LocalLogService
  }))

  container.register(ILog, new ClassProvider({
    useClass: RemoteLogService
  }))

 ```

### resolve

Resolve object from the container.

#### single object

Resolve the most recently bound provider for a given service identifier.

```typescript
const log = container.resolve('ILog')
```

#### multiple object

Resolve all providers bound to the service identifier.

```typescript
const logs = container.resolve('ILog', {
  multiple: true
})
```

#### ref

Reference an object without resolving it immediately, it is resolved only when used.

```typescript

// It does not resolve immediately.
const logRef = container.resolve('ILog', { 
  ref: true
})

// It will be resolved only when used.
logRef.current.log()

```

#### dynamic

Similar to `ref`, `dynamic` establishes a reference, but `ref` caches the resolved result, whereas `dynamic` does not cache the resolve result.

```typescript

// It does not resolve immediately.
const logRef = container.resolve('ILog', { 
  dynamic: true
})

// It will be resolved only when used.
logRef.current.log()
```

#### optional

Even if there are no providers registered for the service identifier when resolve, it does not throw exception.

#### defaultValue

If `optional` is set to true and there are no providers registered for the service identifier, resolve return the specified value.

### unRegister

Unregister a provider bound to the service identifier from the container.

e.g.

```typescript

const piProvider = new ValueProvider({
   useValue: 3.14
})

container.unRegister('Pi', piProvider)

```

Unregister all providers bound to this service identifier from the container.

e.g.

```typescript

// only pass the service identifier
container.unRegister('Pi')

```

### isRegistered

Check if the service identifier has been registered with a provider.

e.g.

```typescript

const piProvider = new ValueProvider({
   useValue: 3.14
})

// Check if any provider has been registered for the service identifier "Pi".
container.isRegistered('Pi')

// Check if a specified  provider has been registered for the service identifier "Pi".
container.isRegistered('Pi', piProvider)
```

### getProvider

Get the most recently bound provider for a given service identifier.

e.g.

```typescript

const piProvider = container.getProvider('pi')

```

### getAllProvider

Get the all bound providers for a given service identifier.

e.g.

```typescript

const logProviders = container.getAllProvider('ILog')

```

### getAllRegisteredServiceIdentifiers

Get all service identifiers registered on the container.

e.g.

```typescript

const serviceIdentifiers = container.getAllRegisteredServiceIdentifiers()

```

## Providers

### CommonOptions

#### lifecycle

- `LifecycleEnum.transient`
  
  `LifecycleEnum.transient` is the default lifecycle type.

  `LifecycleEnum.transient` means that the container will create a new instance every time it is resolved.

- `LifecycleEnum.singleton`

  `LifecycleEnum.singleton` means that the container will create a new instance the first time it is resolved, and then return the same instance every time it is resolved.

- LifecycleEnum.resolution

  `LifecycleEnum.resolution` means that the container will create a new instance every time it is resolved, and then return the same instance every time it is resolved in the same resolution context.

e.g.

```typescript
  import { Container, ClassProvider, LifecycleEnum } from 'husky-di';
  import { DatabaseService } from '@/services/database.service'
  
  const IDatabase = createServiceIdentifier('IDatabase')
  const container = new Container('Container');

  container.register(IDatabase, new ClassProvider({
    lifecycle: LifecycleEnum.singleton,
    useClass: DatabaseService
  }))

```

#### isPrivate

Indicate whether a provider is container-private. Container-private providers are not allowed to be resolved externally; they are only permitted for internal use within the container.

e.g.

```typescript

  import { Container, ClassProvider, injectable, inject, LifecycleEnum, createServiceIdentifier } from 'husky-di';
  import { DatabaseService } from '@/services/database.service'

  const container = new Container('Container');
  
  const IDatabase = createServiceIdentifier<DatabaseService>('IDatabase')


  // Register the database service as private.
  container.register(IDatabase, new ClassProvider({
    isPrivate: true,
    lifecycle: LifecycleEnum.singleton,
    useClass: DatabaseService
  }))

  @injectable()
  class BookStoreService {
    constructor(
      @inject(IDatabase) private database: IDatabase
    ) {
    }
  }
  const IBookStore = createServiceIdentifier<BookStoreService>('IBookStore')

  container.register(IBookStore, new ClassProvider({
    useClass: BookStoreService
  }))


  // Ok, `IBookStore`` is registered internally in the container, allowing the injection of the private `IDatabase` into `BookStoreService`.
  container.resolve(IBookStore);

  // Error, being registered as private disallows direct resolve.
  container.resolve(IDatabase)

```

### ClassProvider

This provider is used to resolve classes by their constructor.

e.g.

```typescript

  import { Container, ClassProvide, createServiceIdentifier } from 'husky-di';
  import { DatabaseService } from '@/services/database.service'

  const container = new Container('Container');
  const IDatabase = createServiceIdentifier<DatabaseService>('IDatabase')

  container.register(IDatabase, new ClassProvider({
    useClass: DatabaseService
  }))

```

### ValueProvider

This provider is used to resolve a given value.

```typescript

  import { Container, ValueProvide, createServiceIdentifier } from 'husky-di';

  const container = new Container('Container');
  const IPi = createServiceIdentifier<number>('IPi')

  container.register(IPi, new ValueProvider({
    useValue: 3.14
  }))

```

### FactoryProvider

This provider is used to resolve a given factory.

```typescript

  import { Container, FactoryProvide, createServiceIdentifier } from 'husky-di';

  const container = new Container('Container');
  const IPi = createServiceIdentifier<number>('IPi')

  container.register(IPi, new ValueProvider({
    useFactory() {
      return 3.14
    }
  }))

```

## Decorators

### @injectable

The `@injectable` decorator is used to indicate that a class can be injected.

e.g.

```typescript
  import { injectable } from 'husky-di';

  @injectable()
  class BasicService {}

```

> Another reason to use `@injectable` is that when a class has no decorators applied, the TypeScript compiler won't generate parameter metadata.

### @inject

The `@inject` decorator is used to inject a specified value into the constructor's parameters.

Its parameters are the same as [container.resolve](#resolve).

e.g.

```typescript
class BookStoreService {
  constructor(
    @inject(IDatabase) private readonly database: IDatabase
  ) {
    ...
  }
}
```

### @tagged

`tagged` is an internal decorator used to add metadata tags to the constructor's parameters.

## Others

### createServiceIdentifier

The service identifier can be a string, symbol, or constructor function. However, when resolving, it is not possible to determine the service type associated with the service identifier using strings and symbols alone. In such cases, it is necessary to explicitly specify a type, for example, `resolve<number>('IConstNumber')`. This introduces a new problem: the service identifier and service type lack type-safe constraints. Without careful consideration, it's possible to write code like `resolve<string>('IConstNumber')`, leading to type errors that the compiler won't catch.

To address this issue, it is highly recommended to use `createServiceIdentifier` to generate a type-safe service identifier. This helps prevent potential complications and ensures type safety, avoiding inadvertent mistakes.

e.g.

```typescript
const IConstNumber = createServiceIdentifier<number>('IConstNumber')

const constNumber = container.resolve(IConstNumber)

// The following code will result in a compilation error
// const constNumber = container.resolve<string>(IConstNumber)
```

### resolve

This is not [container.resolve](#resolve).

It must be called within a resolution context. When invoked, it will look for the current container in the resolution context and then execute the resolve.

e.g.

```typescript

  import { Container, ClassProvider, injectable, inject, LifecycleEnum, createServiceIdentifier } from 'husky-di';
  import { DatabaseService } from '@/services/database.service'

  const container = new Container('Container');
  
  const IDatabase = createServiceIdentifier<DatabaseService>('IDatabase')


  container.register(IDatabase, new ClassProvider({
    useClass: DatabaseService
  }))

  @injectable()
  class BookStoreService {
    private database: IDatabase
    constructor() {
      this.database = resolve(IDatabase)
    }
  }
  const IBookStore = createServiceIdentifier<BookStoreService>('IBookStore')
  container.register(IBookStore, new ClassProvider({
    useClass: BookStoreService
  }))

  container.resolve(IBookStore)

```

It is particularly useful when you need to choose one service from several services.

e.g.

```typescript

  // Select a database service based on certain conditions.
  @injectable()
  class BookStoreService {
    private database: IDatabase
    constructor( 
      @inject(IDatabase1) database1: IDatabase,
      @inject(IDatabase2) database2: IDatabase
    ) {
      if (supportDatabase1) {
        this.database = database1
      } else {
        this.database = database2

      }
    }
  }

```
