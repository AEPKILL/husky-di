# @husky-di/core Reference

Full reference for the core DI container: registration, resolution, lifecycles, middleware, references, and disposal.

## Container

### Creating Containers

```typescript
import { createContainer, rootContainer } from "@husky-di/core";

const container = createContainer();                        // defaults to rootContainer as parent
const named = createContainer("MyContainer");               // named container, rootContainer parent
const child = createContainer("Child", container);          // explicit parent
```

- Omitting `parent` attaches the container to `rootContainer`.
- `parent` is **immutable** after creation.
- A child resolves from itself first, then falls back to parent.
- A child's registrations **do not** affect the parent.

### Service Identifiers

```typescript
import { createServiceIdentifier } from "@husky-di/core";

interface IDatabase { connect(): void; }
const IDatabase = createServiceIdentifier<IDatabase>("IDatabase");

// Also valid as plain values:
const IDatabase = Symbol("IDatabase");                  // symbol
class Database {}                                        // class constructor
abstract class AbstractDatabase {}                       // abstract constructor
```

Use `createServiceIdentifier<T>()` for typed string/symbol identifiers. It preserves the generic type through resolution.

### Root Container

```typescript
import { rootContainer } from "@husky-di/core";

rootContainer.register(ILogger, { useClass: ConsoleLogger });
// `createContainer()` without `parent` attaches to rootContainer by default
```

## Registration

### Provider Strategies

A registration must specify **exactly one** of `useClass`, `useFactory`, `useValue`, or `useAlias`.

```typescript
// useClass — instantiate a class
container.register(IService, {
  useClass: ServiceImpl,
  lifecycle: LifecycleEnum.singleton,  // default: transient
});

// useFactory — call a factory function
container.register(IService, {
  useFactory: (container, resolveContext) => {
    const dep = container.resolve(IDep);
    return new ServiceImpl(dep);
  },
});

// useValue — provide a pre-built instance
const instance = new ServiceImpl();
container.register(IService, { useValue: instance });

// useAlias — delegate to another identifier
container.register(IService, { useAlias: IBetterImpl });
```

**Validation:** Only one provider property allowed. Passing none or multiple throws `E_INVALID_PROVIDER`.

### Multiple Registrations

The same `ServiceIdentifier` can be registered multiple times:

```typescript
container.register(IPlugin, { useClass: PluginA });
container.register(IPlugin, { useClass: PluginB });

container.resolve(IPlugin);                     // PluginB (last-write-wins)
container.resolve(IPlugin, { multiple: true }); // [PluginA, PluginB]
```

### Registration Disposer

Each `register()` returns a disposer:

```typescript
const unregister = container.register(ISvc, { useClass: Impl });
unregister();         // removes that one registration
unregister();         // no-op — already removed
```

`container.unregisterAll(ISvc)` removes **all** registrations for that identifier.

### Registration Plan

A `RegistrationPlan` bundles multiple registrations with rollback:

```typescript
import { createRegistrationPlan } from "@husky-di/core";

const plan = createRegistrationPlan((register) => {
  register(IA, { useClass: A });
  register(IB, { useClass: B });
});

const unregisterPlan = container.applyRegistrationPlan(plan);
// If IB's registration fails, IA is automatically rolled back.
```

`unregisterPlan()` removes only entries from this plan. Calling it again is a no-op.

## Resolution

### Basic Resolution

```typescript
const svc = container.resolve(IService); // throws E_SERVICE_NOT_FOUND if missing
```

### Resolve Options

| Option | Effect |
|---|---|
| `optional: true` | Returns `undefined` (or `defaultValue`) instead of throwing |
| `multiple: true` | Returns all registrations as `T[]` |
| `recursive: false` | Disables parent-container fallback for this resolution |
| `ref: true` | Returns `Ref<T>` — deferred, cached on first access |
| `dynamic: true` | Returns `Ref<T>` — re-resolves every `.current` access |

`ref` and `dynamic` are **mutually exclusive**. Both set to `true` throws `E_INVALID_OPTIONS`.

### Optional Resolution

```typescript
const svc = container.resolve(IOptional, { optional: true });
// svc is T | undefined

const svc = container.resolve(IOptional, { optional: true, defaultValue: fallback });
// svc is T — falls back to fallback if not found
```

`defaultValue` requires `optional: true`. If `multiple: true`, `defaultValue` must be an array.

### Reference Resolution

```typescript
// Static ref — deferred, cached
const ref = container.resolve(IHeavy, { ref: true });
// ref.current resolves on first access, then cached

// Dynamic ref — re-resolves every access
const dyn = container.resolve(IHeavy, { dynamic: true });
// dyn.current re-resolves on every access (use sparingly — leaks resolve context)
```

### Alias Resolution

```typescript
container.register(INew, { useAlias: IOld });

// With a custom container target
container.register(INew, {
  useAlias: IOld,
  getContainer: () => someOtherContainer,
});
```

### The `resolve()` Helper

The package-level `resolve()` helper works only inside an active resolution context (e.g., inside a factory or middleware).

```typescript
import { resolve, ResolveContainerScopeEnum } from "@husky-di/core";

container.register(ISvc, {
  useFactory: (c, ctx) => {
    const dep = resolve(IDep);           // uses current container by default
    const dep2 = resolve(IDep, { scope: ResolveContainerScopeEnum.origin });
    // origin → container that started the resolution chain
    return new Svc(dep);
  },
});
```

Special case: `resolve(IContainer)` returns the active container itself (no registration needed).

## Lifecycles

| Lifecycle | Behavior |
|---|---|
| `LifecycleEnum.transient` (0) | New instance every resolution (default) |
| `LifecycleEnum.singleton` (1) | One instance per container, reused |
| `LifecycleEnum.resolution` (2) | One instance per resolution chain, dropped after |

```typescript
container.register(ISvc, { useClass: Svc, lifecycle: LifecycleEnum.singleton });

const a = container.resolve(ISvc);
const b = container.resolve(ISvc);
// a === b  (same instance)
```

```typescript
container.register(ISvc, { useClass: Svc, lifecycle: LifecycleEnum.resolution });
// Within one container.resolve() call chain, same instance;
// across separate resolve() calls, different instances.
```

## Middleware

### Registration

```typescript
import { globalMiddleware } from "@husky-di/core";

// Global — applies to ALL containers
const unuse = globalMiddleware.use(myMiddleware);

// Local — applies only to this container
const unuseLocal = container.use(myMiddleware);
```

Each `use()` returns a disposer. `unuse()` removes the middleware. Calling it again is a no-op.

### Middleware Shape

```typescript
const loggingMiddleware = {
  name: "logging",
  executor(params, next) {
    console.log("resolving:", params.serviceIdentifier);
    const result = next(params); // continue the chain
    console.log("resolved:", params.serviceIdentifier);
    return result;
  },
  // Optional: called when a container using this middleware is disposed
  onContainerDispose(container) {
    // cleanup resources, unsubscribe, etc.
    // Exceptions here are swallowed — they must not interrupt disposal.
  },
};
```

### Execution Order (LIFO)

```
Local middlewares (outermost) → Global middlewares → Provider (innermost)
```

If local middlewares are registered as `[L1, L2]` and global as `[G1, G2]`, the execution order is:

```
L2 → L1 → G2 → G1 → Provider
```

Local middlewares can short-circuit (not call `next()`) to bypass global logic — useful for mocking.

### Middleware Isolation

- Local middlewares do **not** inherit through parent-child relationships.
- A child container has its own independent local middleware chain.
- Global middlewares apply to all containers regardless of hierarchy.

### Disposal Hook

```typescript
const mw = {
  executor(params, next) { return next(params); },
  onContainerDispose(container) {
    // Called when container.dispose() runs
    // MUST NOT throw — exceptions are caught and swallowed
  },
};
```

## Circular Dependencies

The container detects circular dependencies via `ResolveRecord` and throws `E_CIRCULAR_DEPENDENCY` with the full resolution path.

**Fix strategies:**

```typescript
// Use ref to defer resolution
class A {
  constructor(@inject(IB, { ref: true }) private bRef: Ref<IB>) {}
  get b() { return this.bRef.current; }
}
```

```typescript
// Use a factory to break the cycle later
container.register(IA, {
  useFactory: (c) => {
    const b = c.resolve(IB, { ref: true });
    return new A(b);
  },
});
```

## Disposal

```typescript
container.dispose();
container.dispose();   // idempotent — safe to call again

// After disposal:
container.resolve(ISvc);      // throws E_CONTAINER_DISPOSED
container.register(ISvc, {}); // throws E_CONTAINER_DISPOSED
```

- Disposing a parent does **not** auto-dispose children. Dispose each container independently.
- Cleanup functions registered via the disposal system are idempotent (safe to call multiple times).

## Error Reference

| Code | Message | Trigger |
|---|---|---|
| `E_INVALID_PROVIDER` | Must specify exactly one provider strategy | Registration missing or has multiple providers |
| `E_SERVICE_NOT_FOUND` | Service "{id}" not registered | Required resolve when not found and not optional |
| `E_CIRCULAR_DEPENDENCY` | Circular dependency: {path} | Same identifier appears twice in resolution path |
| `E_CONTAINER_DISPOSED` | Cannot operate on a disposed container | Any operation after dispose() |
| `E_INVALID_OPTIONS` | Invalid resolve options: {reason} | `defaultValue` without `optional`, or `ref`+`dynamic` both true, etc. |
| `E_RESOLUTION_FAILED` | Failed to resolve "{id}": {reason} | Provider threw during resolution |
| `E_RESOLVE_CONTEXT_UNAVAILABLE` | No resolve context available | `resolve()` helper called outside resolution chain |
