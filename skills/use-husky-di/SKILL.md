---
name: husky-di
description: Type-safe dependency injection for TypeScript using husky-di. Use when setting up DI containers, registering services, resolving dependencies, adding decorator-based injection, building modular DI graphs, debugging circular dependencies, or choosing between transient/singleton/resolution lifecycles.
---

# husky-di

Type-safe, introspectable DI for TypeScript. Three composable packages:
`@husky-di/core` (container + resolution), `@husky-di/decorator` (constructor injection), `@husky-di/module` (ESM-style modules).

## Quick Start

### Core — manual wiring

```typescript
import { createContainer, createServiceIdentifier } from "@husky-di/core";
const ILogger = createServiceIdentifier<ILogger>("ILogger");
const c = createContainer();
c.register(ILogger, { useClass: ConsoleLogger });
c.resolve(ILogger).log("Hello DI");
```

### Decorator — auto-wired constructors

> requires: `tsconfig.json` → `"experimentalDecorators": true, "emitDecoratorMetadata": true`; entry point → `import "reflect-metadata"`

```typescript
import { injectable, inject, decoratorMiddleware } from "@husky-di/decorator";
import { createContainer, globalMiddleware } from "@husky-di/core";
@injectable()
class Svc { constructor(@inject(ILogger) private l: ILogger) {} run() { this.l.log("ok"); } }
globalMiddleware.use(decoratorMiddleware);
const c = createContainer(); c.register(ILogger, { useClass: ConsoleLogger });
c.resolve(Svc).run();
```

### Module — ESM-style boundaries

```typescript
import { createModule } from "@husky-di/module";
const logMod = createModule({ name: "Log", declarations: [{ serviceIdentifier: ILogger, useClass: ConsoleLogger }], exports: [ILogger] });
const app = createModule({ name: "App", imports: [logMod], declarations: [{ serviceIdentifier: Svc, useClass: Svc }], exports: [Svc] });
app.resolve(Svc).run();
```

## Package Decision Guide

| Goal | Package(s) |
|---|---|
| Manual wiring for a few services | `@husky-di/core` |
| Auto-wire constructor params via decorators | core + `@husky-di/decorator` |
| ESM-style modules with import/export boundaries | core + `@husky-di/module` |
| Large app with layered dependency graphs | all three |

`decorator` and `module` depend on `core`; they compose naturally.

## Key Patterns

**Provider strategies** (exactly one per registration):

| Strategy | Usage |
|---|---|
| `useClass` | `{ useClass: Impl, lifecycle?: LifecycleEnum }` |
| `useFactory` | `{ useFactory: (c, ctx) => new X(c.resolve(IDep)) }` |
| `useValue` | `{ useValue: prebuiltInstance }` |
| `useAlias` | `{ useAlias: OtherID, getContainer?: () => IContainer }` |

**Lifecycles:** `transient` (default, fresh each time) · `singleton` (once per container) · `resolution` (once per resolve chain)

**Resolution flags:** `optional: true` → `undefined` on miss · `multiple: true` → `T[]` · `ref: true` → deferred/cached `Ref<T>` · `dynamic: true` → re-resolves each `.current` access

**Middleware:** Global (`globalMiddleware.use(mw)`) or local (`container.use(mw)`). Runs LIFO: local wraps global wraps provider. Local middlewares do **not** inherit through parent-child relationships.

**Registration plans:** `createRegistrationPlan(register => { register(ID, opts); })` → `container.applyRegistrationPlan(plan)` — all-or-nothing with rollback.

## Anti-Patterns

- **Avoid `dynamic`** — re-resolves every `.current` access and leaks resolve context. Prefer `ref`.
- **Don't skip `@injectable()`** → `E_NOT_INJECTABLE`. Apply exactly once per class.
- **Don't inject primitives/interfaces without `@inject()`** — `design:paramtypes` only preserves class constructors.
- **Don't skip `optional` on nullable deps** → `E_SERVICE_NOT_FOUND` on miss.
- **No circular module imports** — rejected at build time.
- **Don't treat aliases as partial imports** — `withAliases` renames only; unaliased exports still flow through.

## Error Quick Lookup

| Symptom | Error | See |
|---|---|---|
| Service not registered | `E_SERVICE_NOT_FOUND` | [core.md](core.md) |
| Circular dependency | `E_CIRCULAR_DEPENDENCY` | [core.md](core.md) |
| Container disposed | `E_CONTAINER_DISPOSED` | [core.md](core.md) |
| Missing `@injectable()` | `E_NOT_INJECTABLE` | [decorator.md](decorator.md) |
| Duplicate module export | `E_DUPLICATE_EXPORT` | [module.md](module.md) |
| Import collision | `E_IMPORT_COLLISION` | [module.md](module.md) |

## Reference Files

- **[core.md](core.md)** — Container, registration, resolution, lifecycles, middleware, references, disposal, error codes.
- **[decorator.md](decorator.md)** — `@injectable()`, `@inject()`, `@tagged()`, TS config, metadata lifecycle, error codes.
- **[module.md](module.md)** — Modules, declarations, imports, exports, aliases, build, error codes.
- **[project-structure.md](project-structure.md)** — Recommended directory layouts: flat core, decorator-based, and module-based.
