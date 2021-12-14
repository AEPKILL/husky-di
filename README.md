# husky-di

lightweight & extendable dependency injection container

## Install

`npm install husky-di --save`

Modify your tsconfig.json to include the following settings:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Install `reflect-metadata`:

`npm install reflect-metadata`

Add `reflect-metadata`polyfill in your entire application:

`import "reflect-metadata";`

## Quick Start

### Basic

1. Create container

   ```typescript
   import { createContainer } from 'husky-di';

   const container = createContainer('container');
   ```

1. Define `interface` & `ServiceIdentifier`

   ```typescript
   import { createServiceIdentifier } from 'husky-di';

   interface ILog {
     log(message: string): void;
   }

   const ILog = createServiceIdentifier<ILog>('ILog');
   ```

1. Implement `ILog` interface

   ```typescript
   class Log implements ILog {
     log(message: string): void {
       console.log(message);
     }
   }
   ```

1. Register `ServiceIdentifier`

   ```typescript
   import { ClassProvider } from 'husky-di';

   container.register(
     ILog,
     new ClassProvider({
       useClass: Log,
     })
   );
   ```

1. Use `ServiceIdentifier`

   ```typescript
   const log = container.resolve(ILog);
   
   log.log('hello world');
   ```

### Circle dependencies

Use `ref` or `dynamic`  option can handle circle dependencies

```typescript
// IFoo -> IBar -> IFoo

import {createServiceIdentifier, Ref, inject, createContainer} from 'husky-di';

const container = createContainer('container');
interface IFoo {
  bar: Ref<IBar>
}
const IFoo = createServiceIdentifier<IFoo>('IFoo');

interface IBar {
  foo: IFoo
}
const IBar = createServiceIdentifier<IBar>('IBar');

class Foo implements IFoo {
  constructor(
     // inject a reference to a value
     @inject(IBar, {ref: true}) readonly bar: Ref<IBar>
    ) {}
}
class Bar implements IBar {
  constructor(
    @inject(IFoo) readonly foo: IFoo
    ) {}
}

container.register(IFoo, new ClassProvider({useClass: Foo}));
container.register(IBar, new ClassProvider({useClass: Bar}));

console.log(container.resolve(IFoo).bar.current)
```

