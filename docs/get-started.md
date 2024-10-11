# Getting Started

## Installation

```bash
npm install husky-di --save
```

## Configuration

1. Ensure your `tsconfig.json` includes the following configuration:

   ```json
   {
     "compilerOptions": {
       "experimentalDecorators": true,
       "emitDecoratorMetadata": true
     }
   }
   ```

   Currently, `husky-di` only supports TypeScript's experimental decorator syntax. We're working on a solution to support the new ES6 decorator syntax.

   > You can learn more about the differences between ES6 decorators and TypeScript experimental decorators [here](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#differences-with-experimental-legacy-decorators).

2. Add a polyfill for the Reflect API. We recommend using `reflect-metadata`:

   a. Add `reflect-metadata` to your project dependencies:

   ```shell
   npm install --save reflect-metadata
   ```

   b. Import `reflect-metadata` at the very beginning of your entry file:

   ```typescript
   import 'reflect-metadata'
   ```

## Basic Example

1. Create a container:

   ```typescript
   import { Container, ClassProvider, injectable, createServiceIdentifier } from 'husky-di';

   const container = new Container('BasicContainer');
   ```

2. Define a service and a service identifier:

   ```typescript
   @injectable()
   class BasicService {
     hi() {
       console.log('Hi');
     }
   }

   const IBasicService = createServiceIdentifier<BasicService>('IBasicService');
   ```

3. Register the service in the container:

   ```typescript
   container.register(
     IBasicService,
     new ClassProvider({
       useClass: BasicService,
     })
   );
   ```

4. Resolve the service:

   ```typescript
   const basic = container.resolve(IBasicService);
   basic.hi();
   ```

<iframe src="https://stackblitz.com/edit/typescript-g42uit?devToolsHeight=33&embed=1&file=index.ts&hideNavigation=1"
     style="width:100%; height: 700px; border:0; border-radius: 4px; overflow:hidden;"
     title="Basic Example"
     allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
     sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
   ></iframe>
