# @husky-di/module Reference

Full reference for ESM-style modular DI: modules, declarations, imports, exports, and aliases.

## Concepts

A **Module** is a logical unit that encapsulates:

- **Declarations** — services defined locally (like `const` / `class` in ESM)
- **Imports** — services consumed from other modules
- **Exports** — services exposed to consumer modules

The module system enforces explicit boundaries: only exported services are visible externally; import conflicts are detected at build time, not runtime.

## Creating Modules

```typescript
import { createModule } from "@husky-di/module";
import { LifecycleEnum } from "@husky-di/core";

const databaseModule = createModule({
  name: "DatabaseModule",
  declarations: [
    {
      serviceIdentifier: IDatabase,
      useClass: PostgresDatabase,
      lifecycle: LifecycleEnum.singleton,
    },
    {
      serviceIdentifier: IConnectionString,
      useValue: "postgres://localhost:5432/db",
    },
  ],
  exports: [IDatabase],
});
```

### Module Descriptor Shape

```typescript
interface ModuleDescriptor {
  readonly name: string;
  readonly declarations?: Declaration[];   // local service registrations
  readonly imports?: Array<IModule | ModuleWithAliases>;
  readonly exports?: ServiceIdentifier[];  // which services are publicly visible
}
```

## Declarations

Each declaration is a registration entry — same shape as `container.register()`:

```typescript
declarations: [
  { serviceIdentifier: IFoo, useClass: Foo },
  { serviceIdentifier: IBar, useFactory: (c) => new Bar(c.resolve(IDep)) },
  { serviceIdentifier: IBaz, useValue: prebuiltInstance },
  { serviceIdentifier: IQuux, useAlias: IFoo },
]
```

### Rules

- **Uniqueness:** No two declarations with the same `ServiceIdentifier` — throws `E_DUPLICATE_DECLARATION`.
- **Validity:** Must have exactly one provider (`useClass`, `useFactory`, `useValue`, or `useAlias`) — throws `E_INVALID_REGISTRATION`.

## Imports

```typescript
const appModule = createModule({
  name: "AppModule",
  imports: [databaseModule, loggerModule],
  declarations: [{ serviceIdentifier: UserService, useClass: UserService }],
  exports: [UserService],
});
```

### Import with Aliases

```typescript
import { createModule } from "@husky-di/module";

const consumerModule = createModule({
  name: "ConsumerModule",
  imports: [
    loggerModule,
    {
      module: databaseModule,
      aliases: [
        { serviceIdentifier: IDatabase, as: ILegacyDatabase },
      ],
    },
  ],
  // ILegacyDatabase is now available (IDatabase is NOT — it's shadowed by the alias)
  // Services from loggerModule are available under their original identifiers
  // (aliases are renaming, not partial-import — unmentioned exports still come through)
});
```

### Import Rules

- **Module uniqueness:** Same module instance must not appear twice in `imports` — throws `E_DUPLICATE_IMPORT_MODULE`.
- **No circular imports:** The dependency graph must be acyclic — throws `E_CIRCULAR_DEPENDENCY`.
- **Namespace collision:** If two imported modules export the same `ServiceIdentifier` (and neither is aliased), throws `E_IMPORT_COLLISION`.
- **Local collision:** If an imported service's name conflicts with a local declaration, it must be aliased — otherwise throws `E_IMPORT_CONFLICT_LOCAL`.

**Example — collision resolved with alias:**

```typescript
const userModule = createModule({
  name: "UserModule",
  declarations: [{ serviceIdentifier: ILogger, useClass: UserLogger }],
  exports: [ILogger],
});

const appModule = createModule({
  name: "AppModule",
  imports: [userModule],  // exports ILogger
  declarations: [{ serviceIdentifier: ILogger, useClass: AppLogger }], // local ILogger
  // ❌ E_IMPORT_CONFLICT_LOCAL — imported ILogger collides with local ILogger
});
```

```typescript
// ✅ Fix with alias:
const appModule = createModule({
  name: "AppModule",
  imports: [{
    module: userModule,
    aliases: [{ serviceIdentifier: ILogger, as: IUserLogger }],
  }],
  declarations: [{ serviceIdentifier: ILogger, useClass: AppLogger }],
  // IUserLogger (from userModule) and ILogger (local) coexist cleanly
});
```

## Exports

```typescript
const module = createModule({
  name: "MyModule",
  declarations: [{ serviceIdentifier: IFoo, useClass: Foo }],
  imports: [otherModule],
  exports: [
    IFoo,              // local declaration
    IBarFromOther,     // re-export from imported module
    IBazAliased,       // alias target from import
  ],
});
```

### Rules

- **Source validity:** Every export must be either a local declaration, an export of an imported module, or the target of an alias — otherwise throws `E_EXPORT_NOT_FOUND`.
- **Uniqueness:** No duplicate identifiers in `exports` — throws `E_DUPLICATE_EXPORT`.

## Aliases Deep Dive

`withAliases()` on a module import is a **renaming** mechanism, not a filter. Unmentioned exports still flow through under their original names.

```typescript
// Source module exports: [IA, IB, IC]
const source = createModule({
  name: "Source",
  declarations: [
    { serviceIdentifier: IA, useClass: A },
    { serviceIdentifier: IB, useClass: B },
    { serviceIdentifier: IC, useClass: C },
  ],
  exports: [IA, IB, IC],
});

// Consumer aliases only IB → IBLegacy
const consumer = createModule({
  name: "Consumer",
  imports: [{
    module: source,
    aliases: [{ serviceIdentifier: IB, as: IBLegacy }],
  }],
  // Available: IA, IBLegacy, IC
  // NOT available: IB (shadowed by alias)
  exports: [IA, IBLegacy],
});
```

### Alias Validation

1. **Source must export the aliased service** — throws `E_ALIAS_SOURCE_NOT_EXPORTED`.
2. **Alias target must not collide with local declarations** — throws `E_IMPORT_CONFLICT_LOCAL`.
3. **Same source identifier must not be aliased twice in one import** — throws `E_DUPLICATE_ALIAS_MAP`.

## Using the Module Container

`IModule` extends the container interface directly — it serves as the DI container:

```typescript
const module = createModule({ ... });
// module.resolve(), module.isRegistered(), module.use() are all available
// module.container gives access to the raw IContainer if needed
```

Internally, on construction the module:

1. **Registers declarations** — all local services go into the container.
2. **Processes imports** — for unaliased imports, bridges to parent containers; for aliased, registers `useAlias` pointing to the source.
3. **Applies export guard** — middleware that blocks resolution of non-exported identifiers when accessed from outside.

```typescript
const userModule = createModule({
  name: "UserModule",
  declarations: [
    { serviceIdentifier: UserRepo, useClass: UserRepo },
    { serviceIdentifier: InternalHelper, useClass: InternalHelper },
  ],
  exports: [UserRepo],
});

userModule.resolve(UserRepo);         // ✓ exported
userModule.resolve(InternalHelper);   // ✗ blocked by export guard
```

## Validation Order

When `createModule()` is called, validation runs in this order:

1. **Declaration validation** — uniqueness, valid provider shape.
2. **Import validation** (recursive) — circular deps, collisions, aliases.
3. **Export validation** — source validity, uniqueness.

Errors surface immediately at module creation, not at resolution time.

## Full Example

```typescript
import { createModule } from "@husky-di/module";
import { createServiceIdentifier, LifecycleEnum } from "@husky-di/core";

// Identifiers
const ILogger = createServiceIdentifier<ILogger>("ILogger");
const IDatabase = createServiceIdentifier<IDatabase>("IDatabase");
const IUserService = createServiceIdentifier<IUserService>("IUserService");

// LoggerModule
const loggerModule = createModule({
  name: "LoggerModule",
  declarations: [{ serviceIdentifier: ILogger, useClass: ConsoleLogger, lifecycle: LifecycleEnum.singleton }],
  exports: [ILogger],
});

// DatabaseModule — depends on LoggerModule
const databaseModule = createModule({
  name: "DatabaseModule",
  imports: [loggerModule],
  declarations: [
    { serviceIdentifier: IDatabase, useClass: PostgresDatabase, lifecycle: LifecycleEnum.singleton },
  ],
  exports: [IDatabase],
});

// UserModule — depends on DatabaseModule, re-exports ILogger
const userModule = createModule({
  name: "UserModule",
  imports: [databaseModule, {
    module: loggerModule,
    aliases: [{ serviceIdentifier: ILogger, as: IAppLogger }],
  }],
  declarations: [{ serviceIdentifier: IUserService, useClass: UserService }],
  exports: [IUserService, IAppLogger],
});

// Use directly
const userService = userModule.resolve(IUserService);
const appLogger = userModule.resolve(IAppLogger);
```

## Error Reference

| Code | Message | Trigger |
|---|---|---|
| `E_DUPLICATE_DECLARATION` | Duplicate declaration "{id}" in module "{name}" | Two declarations with same identifier |
| `E_INVALID_REGISTRATION` | Invalid registration for "{id}" in "{name}" | Declaration missing or has multiple providers |
| `E_DUPLICATE_IMPORT_MODULE` | Duplicate import module: "{name}" in "{name}" | Same module imported twice |
| `E_CIRCULAR_DEPENDENCY` | Circular dependency: {path} | Module import graph has a cycle |
| `E_IMPORT_COLLISION` | "{id}" exported by multiple imported modules: {list} | Two imports export same unaliased identifier |
| `E_IMPORT_CONFLICT_LOCAL` | Imported "{id}" conflicts with local declaration in "{name}" | Imported name clashes with declaration |
| `E_ALIAS_SOURCE_NOT_EXPORTED` | Cannot alias "{id}" from "{name}": not exported | Alias source not in the module's exports |
| `E_DUPLICATE_ALIAS_MAP` | Duplicate alias mapping for "{id}" in "{name}" | Same source aliased twice in one import |
| `E_EXPORT_NOT_FOUND` | Cannot export "{id}" from "{name}": not declared or imported | Export references an unknown service |
| `E_DUPLICATE_EXPORT` | Duplicate export of "{id}" in "{name}" | Same identifier in exports twice |

## Anti-Patterns

- **Don't treat aliases as partial imports.** `withAliases({ aliases: [...] })` renames only; unaliased exports still flow through.
- **Don't create circular module graphs.** The system rejects them — restructure into a layered dependency hierarchy.
- **Don't export internal helpers.** Only the identifiers in `exports` are visible externally. Keep implementation details out of exports.
- **Don't forget to add `exports`.** Without it, consumers see nothing.
