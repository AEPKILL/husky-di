# Husky DI Context

This document records the domain language, design boundaries, and repository conventions for `husky-di`. Engineering skills should read this document before doing diagnosis, TDD, architecture analysis, or issue breakdown.

This repository currently uses a single-context domain documentation layout: the repository-level domain context is maintained centrally in the root `CONTEXT.md`. To build a quick understanding of the project semantics and boundaries, read this document first instead of assuming an older distributed documentation layout still exists.

## Project positioning

`husky-di` is a modern TypeScript dependency injection framework. Its core goal is to provide a type-safe, deterministic, testable, and introspectable dependency management system.

This project uses a monorepo structure. The main workspaces that currently exist and are actively maintained are:

- `@husky-di/core`: The core DI container, registration, resolution, lifecycle, middleware, reference, and disposal capabilities.
- `@husky-di/decorator`: Constructor injection support built on TypeScript experimental decorators and `reflect-metadata`.
- `@husky-di/module`: A modular DI system inspired by ESM `import` / `export` semantics.
- `@husky-di/website`: A documentation workspace located at the top-level `website/` directory.

## Core design principles

- Dependencies are provided externally rather than created by business objects themselves. This is the repository's basic interpretation of DI and IoC.
- Constructor injection is the primary model. Property injection and method injection are not part of the core model; when needed, use factories or explicit `resolve` composition.
- Runtime behavior must be predictable. Registration, resolution, lifecycle, module import/export behavior, and error conditions should all have explicit rules.
- Type safety comes first. Public APIs should let TypeScript infer accurate resolution results, including combinations of `optional`, `multiple`, `ref`, and `dynamic`.
- Container behavior should be introspectable. Resolution chains, circular dependencies, service identifier names, and error messages should all help users locate problems.
- Keep clear boundaries between packages. `decorator` and `module` depend on `core`, but `core` does not depend on packages built on top of it.

## Domain vocabulary

### DI and containers

- **Dependency Injection / DI**: Objects receive dependencies from the outside instead of creating them on their own.
- **IoC**: Inversion of Control. DI is the IoC mechanism adopted by this project.
- **Container**: A dependency injection container. It registers services, resolves services, manages lifecycles, executes middleware, and disposes resources.
- **Root Container**: The root container exposed through the `rootContainer` constant. `createContainer()` attaches to it when `parent` is not passed explicitly; the `resolve` helper uses the current resolution context or the root container to perform resolution.
- **Parent Container / Child Container**: The parent-child container relationship. Resolution checks the current container first and then falls back to the parent; registrations in a child do not affect the parent.

### Registration and resolution

- **ServiceIdentifier**: A service identifier. It can be a class constructor, abstract constructor, string, or symbol. Prefer `createServiceIdentifier<T>()` to create typed identifiers.
- **Registration**: A binding between a service identifier and a provider strategy.
- **Registration Plan**: A reusable collection of registration entries. It is assembled with `createRegistrationPlan()` and applied to a container with `container.applyRegistrationPlan()`.
- **Provider**: A service creation strategy. The current model supports `useClass`, `useFactory`, `useValue`, and `useAlias`, and requires exactly one strategy per registration.
- **Resolution**: The process of obtaining a service instance from the container using a `ServiceIdentifier`.
- **ResolveOptions**: Resolution options including `optional`, `defaultValue`, `multiple`, `recursive`, `ref`, and `dynamic`.
- **ResolveContext**: The shared context for a single resolution chain, used for the resolution lifecycle and internal resolution state.
- **ResolveRecord**: A tree structure that records the resolution path for error reporting and circular dependency detection.
- **ResolveException**: The core exception type for resolution failures, circular dependencies, invalid options, and similar scenarios.

### Lifecycle

- **LifecycleEnum.transient**: The default lifecycle. Each resolution creates a new instance.
- **LifecycleEnum.singleton**: A container-scoped singleton. The first resolution creates the instance, and later resolutions in the same container reuse it.
- **LifecycleEnum.resolution**: A resolution-chain-scoped singleton. It is reused within the same resolution chain, but not across different chains.
- **Disposable / dispose**: Releasing a container or resource. A disposed container should reject subsequent operations; repeated `dispose()` calls should remain idempotent; disposing a parent container does not automatically dispose child containers.

### References

- **Ref**: A reference wrapper that exposes an instance through `.current`.
- **Static Ref / `ref: true`**: Defers resolution and caches the referenced result. It is useful for breaking some circular dependencies or delaying instantiation.
- **Dynamic Ref / `dynamic: true`**: Re-resolves on every `.current` access. It holds resolution records and context closures, which can lead to memory leaks; do not prefer it unless it is genuinely necessary.

### Middleware

- **Middleware**: A function object that intercepts resolution. It can inspect arguments, transform results, perform side effects, or short-circuit resolution by not calling `next()`.
- **Global Middleware**: Registered through `globalMiddleware` and applies to all containers.
- **Local Middleware**: Registered through `container.use()` or `module.use()` and only applies to the current container or module container.
- **Middleware Order**: Middleware runs in LIFO order. Local middleware wraps the outside, then global middleware runs, and finally the provider executes.
- **onContainerDispose**: An optional disposal hook on middleware. It is called when a container is disposed; exceptions should be swallowed and must not interrupt disposal.

### Decorator package

- **Injectable Class**: A class marked with `@injectable()` that can be instantiated by the decorator middleware.
- **Injection Metadata**: Constructor-parameter injection metadata including `serviceIdentifier`, `container`, `dynamic`, `ref`, and `optional`.
- **`@injectable()`**: A class decorator that merges constructor parameter metadata and marks the class as injectable.
- **`@inject()`**: A parameter decorator that declares the service identifier and resolution options for a constructor parameter.
- **`@tagged()`**: The lower-level parameter metadata decorator. `@inject()` can be treated as its convenience wrapper.
- **`decoratorMiddleware`**: Middleware that reads injection metadata and participates in constructor injection. When using decorator-based injection, register it in `globalMiddleware` or on the container.
- **Reflection Metadata**: TypeScript compile-time parameter type information read through the Reflect API. This package depends on `reflect-metadata` or a compatible implementation.

The decorator package supports only TypeScript experimental decorators, not ES decorators. The reason is that the current ES decorators specification does not include parameter decorators, so it cannot express the constructor parameter injection model required by this project.

### Module package

- **Module**: A logical unit that encapsulates declarations, imports, and exports.
- **Declaration**: A service declared locally within a module, equivalent to variables or classes defined inside an ESM module.
- **Import**: A service imported from another module.
- **Export**: A service exposed from the current module, either from a local declaration or by forwarding an import.
- **Alias**: Renaming a service identifier on import, similar to `import { foo as bar }`.
- **Import Scope**: The visible set of services a module receives from its imports. `alias` only renames mapped imports; imported exports that are not aliased still enter the import scope under their original service identifiers.
- **Export Guard**: A protective middleware on the module container that prevents external resolution of non-exported services.

The module system is inspired by ESM semantics: imports must be explicit, export boundaries must be explicit, and naming conflicts should surface when a module is created instead of turning into ambiguity at runtime.

## Behavioral constraints

- The same `ServiceIdentifier` can be registered multiple times in the same container.
- By default, resolving a single service uses last-write-wins and returns the most recent registration.
- Using `multiple: true` returns all registrations for that identifier.
- A registration plan composes multiple `register()` calls; on success it returns a combined cleanup, and that cleanup can remove only the registrations created by that plan.
- If applying a registration plan fails midway, already-created registrations must be rolled back so the container does not keep partial state.
- When `optional: true` is set and the service is not found, resolution returns `undefined` or `defaultValue`; when the service is not optional, it throws `ResolveException`.
- `ref` and `dynamic` are mutually exclusive and cannot both be `true`.
- Circular dependencies are detected through `ResolveRecord`. Error messages should include a readable resolution path and suggest `ref` or `dynamic` when appropriate.
- Service lookup follows current-container-first order and falls back to the parent container hierarchy unless `recursive: false` disables that fallback for the current resolution.
- Local middleware does not inherit through parent-child container relationships; service registration lookup can walk up to the parent container, but middleware chains do not inherit through the container hierarchy.
- Module declarations, imports, and exports must each be unique.
- The module import graph must not contain circular dependencies.
- When multiple imported modules export the same service name, the conflict must be resolved with aliases.
- A service identifier in the import scope must not conflict with a local declaration; if an imported service conflicts with a local declaration, the imported service must be renamed with an alias.
- A module can export only a local declaration, an explicitly imported export, or a service made available through an alias.

## Package boundaries

- `packages/core` is the foundational package. When adding new core capabilities, first decide whether they belong to the container, registration, resolution, lifecycle, middleware, reference, or disposal model.
- `packages/decorator` is only responsible for translating TypeScript decorator metadata into core resolution behavior. Do not move general container capabilities into the decorator package.
- `packages/module` is only responsible for module semantics, declaration/import/export validation, aliases, export guards, and module container assembly. Do not let the module package bypass the core registration and resolution model.
- `website/` is the documentation workspace, not a runtime library package published to npm. It is the right place for documentation browsing experience, information architecture, and reader-facing page organization.
- `docs/` currently holds ADRs rather than the source code of a standalone website package. Do not treat it as the implementation of a running documentation site; if you need to add architectural decisions or long-lived design constraints, prefer `docs/adr/`.

## Naming conventions

- Service identifier variables usually use interface-style names such as `IServiceA` and `IDatabaseConfig`.
- Structural interfaces live under `interfaces/` and use an `I` prefix, such as `IContainer` and `IModule`.
- Type aliases live under `types/` and do not use the `I` prefix.
- Enums use `PascalCaseEnum`, such as `LifecycleEnum` and `RegistrationTypeEnum`.
- Factory functions use `createXxx`, such as `createContainer`, `createModule`, and `createServiceIdentifier`.
- Public APIs are exported through each package's `src/index.ts`.

## Terminology guidance

- Prefer "service identifier" for `ServiceIdentifier`; avoid mixing in "token", "key", or "name" unless you are explaining an external concept.
- Prefer "resolve" when describing `resolve` behavior; do not replace the core term with wording like "get a dependency".
- Prefer "register" when describing `register` behavior; do not use "bind" as the primary term.
- Prefer "module declaration / import / export / alias" when describing module package semantics to keep the ESM analogy consistent.
- Keep `ref` and `dynamic` distinct: `ref` is a deferred reference, while `dynamic` re-resolves on every access.

## Current documentation status

- The root `CONTEXT.md` is the repository-level domain context entry point for the current single-context layout.
- `docs/agents/domain.md` is a stable pointer to `CONTEXT.md` for agent compatibility and quick discovery of the single-context layout.
- `packages/core/docs/SPECIFICATION.md` is the primary source for the core behavioral contract, with status `Stable`.
- `packages/decorator/docs/SPECIFICATION.md` is the primary source for the decorator behavioral contract, with status `Final`.
- `packages/module/docs/SPECIFICATION.md` is the primary source for the module behavioral contract, with status `Proposal`.
- `docs/adr/0001-registration-plan.md` already exists with status `Accepted`; when working on `RegistrationPlan` design motivation, naming, or rollback semantics, consult both that ADR and the core specification.
