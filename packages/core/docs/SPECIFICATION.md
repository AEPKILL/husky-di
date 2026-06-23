# Dependency Injection Container Specification

**Version:** 1.1.3  
**Status:** Stable  
**Context:** Type-safe Dependency Injection Container for TypeScript

## 1. Abstract

This specification defines the behavioral contract and validation rules for a dependency injection container system. It establishes the semantics for service registration, resolution, lifecycle management, container hierarchy, and middleware interception. The goal is to provide a deterministic, type-safe, and introspectable dependency management system.

## 2. Terminology

The following keywords are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119): **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**.

- **ServiceIdentifier**: A unique key (class constructor, abstract constructor, string, or symbol) used to identify a service.
- **Registration**: A binding between a ServiceIdentifier and a provider strategy (class, factory, value, or alias).
- **Provider**: A mechanism that defines how a service instance is created (constructor, factory function, value, or alias).
- **Lifecycle**: A strategy that determines when and how service instances are created and reused (transient, singleton, resolution).
- **Resolution**: The process of obtaining a service instance from the container.
- **Container**: A registry that manages service registrations and provides service resolution.
- **Internal Service**: A service registration created by the container itself to expose infrastructure capabilities through the standard resolution pipeline.
- **Middleware**: An interceptor function that can observe or modify the resolution process.
- **ResolveRecord**: A tree structure tracking the resolution chain for debugging and circular dependency detection.
- **ResolveContext**: A map tracking resolved instances within a single resolution scope.
- **Ref**: A lazy reference wrapper that defers service instantiation.

## 3. Data Structures

### 3.1 Service Identifier

```typescript
type ServiceIdentifier<T> =
  | AbstractConstructor<T>
  | Constructor<T>
  | string
  | symbol;
```

### 3.2 Registration Options

A registration **MUST** specify exactly one provider strategy:

```typescript
type CreateRegistrationOptions<T> =
  | { useClass: Constructor<T>; lifecycle?: LifecycleEnum }
  | {
      useFactory: (container: IContainer, context: ResolveContext) => T;
      lifecycle?: LifecycleEnum;
    }
  | { useValue: T; lifecycle?: LifecycleEnum }
  | { useAlias: ServiceIdentifier<T>; getContainer?: () => IContainer };
```

### 3.3 Lifecycle Strategies

```typescript
enum LifecycleEnum {
  transient = 0, // New instance per resolution
  singleton = 1, // One instance per container
  resolution = 2, // One instance per resolution chain
}
```

### 3.4 Resolve Options

```typescript
type ResolveOptions<T> = {
  dynamic?: boolean; // Return dynamic reference
  ref?: boolean; // Return static reference
} & (
  | { multiple?: false; optional?: false; defaultValue?: never }
  | { multiple?: false; optional: true; defaultValue?: T }
  | { multiple: true; optional?: false; defaultValue?: never }
  | { multiple: true; optional: true; defaultValue?: T[] }
);
```

### 3.5 Disposable Registry

```typescript
interface IDisposableRegistry extends IDisposable {
  addDisposable(disposable: IDisposable): void;
  addCleanup(cleanup: Cleanup): void;
}
```

---

## 4. Behavioral Semantics

### 4.1 Service Registration

**R1. Provider Exclusivity**  
A registration **MUST** specify exactly one provider: `useClass`, `useFactory`, `useValue`, or `useAlias`.

- _Error Code:_ `E_INVALID_PROVIDER`
- _Constraint:_ Only one of the provider properties may be present.

**R2. Multiple Registration**  
A ServiceIdentifier **MAY** be registered multiple times in the same container.

- When resolving with `multiple: false` (or default), the container **MUST** return the instance from the latest registration (Last-write-wins).
- When resolving with `multiple: true`, the container **MUST** return all registered instances.

**R2.1 Registration Disposer**  
Each successful registration **MUST** return a disposer function associated with the registered `ServiceIdentifier`.

- Calling the returned disposer **MUST** remove exactly one registration entry.
- Calling the returned disposer after that registration has already been removed **MUST** be a no-op.

**R2.2 Unregistration Semantics**  
The container **MUST** support unregistering by `ServiceIdentifier`.

- When unregistering by `ServiceIdentifier`, the container **MUST** remove all registrations associated with that identifier in the current container.
- Unregistering a non-existent `ServiceIdentifier` **MUST** be a no-op.

**R3. Lifecycle Default**  
If `lifecycle` is not specified, the container **MUST** default to `LifecycleEnum.transient`.

### 4.2 Service Resolution

**S1. Resolution Order**  
When resolving a ServiceIdentifier, the container **MUST** search in the following order:

1. Local registrations in the current container.
2. If not found and `parent` is defined, recursively search in the parent container.

**S2. Optional Resolution**  
When `optional: true` is specified:

- If the service is not found and no `defaultValue` is provided, **MUST** return `undefined`.
- If the service is not found and `defaultValue` is provided, **MUST** return `defaultValue`.

**S3. Required Resolution**  
When `optional` is `false` or undefined, if the service is not found, the container **MUST** throw a `ResolveException`.

- _Error Code:_ `E_SERVICE_NOT_FOUND`

**S4. Multiple Resolution**  
When `multiple: true` is specified, the container **MUST** return an array containing all registered instances for the given ServiceIdentifier.

- If no instances are found and `optional: true`, **MUST** return `[]` or `defaultValue`.
- If no instances are found and `optional` is false, **MUST** throw `E_SERVICE_NOT_FOUND`.

**S5. Reference Resolution**  
When `ref: true` or `dynamic: true` is specified:

- **MUST** return a `Ref<T>` object with a `current` property providing access to the resolved instance.
- When `dynamic: true`, accessing `current` **MUST** re-resolve the service on each access.

**S6. Alias Resolution**  
For `useAlias` registrations, resolution **MUST** delegate to the target ServiceIdentifier. If `getContainer` is provided, resolution **MUST** use the returned container; otherwise, the current container **MUST** be used.

**S7. Provider Failure Reporting**  
If a provider throws while a service is being resolved, the container **MUST** wrap the failure in a `ResolveException` while preserving the active `ResolveRecord` path.

- _Error Code:_ `E_RESOLUTION_FAILED`

**S8. Resolve Context Availability**  
The package-level `resolve()` helper **MUST** only be used while a resolution context is active. If no active `ResolveRecord` or current container is available, the implementation **MUST** reject the call.

- _Error Code:_ `E_RESOLVE_CONTEXT_UNAVAILABLE`

### 4.3 Lifecycle Management

**L1. Transient Lifecycle (`LifecycleEnum.transient`)**  
The container **MUST** create a new instance every time the service is resolved.

**L2. Singleton Lifecycle (`LifecycleEnum.singleton`)**  
The container **MUST** create a new instance the first time the service is resolved, and then return the same instance for all subsequent resolutions within the same container.

**L3. Resolution Lifecycle (`LifecycleEnum.resolution`)**  
The container **MUST** create a new instance the first time the service is resolved within a resolution context, and then return the same instance for all subsequent resolutions within the same resolution context.

### 4.4 Circular Dependency Detection

**C1. Detection Requirement**  
The container **MUST** detect circular dependencies during resolution.

- _Error Code:_ `E_CIRCULAR_DEPENDENCY`
- _Detection Mechanism:_ A `ResolveRecord` tree **MUST** track the resolution path.

**C2. Detection Criteria**  
A circular dependency exists when a ServiceIdentifier appears more than once in the current resolution path from root to current node.

**C3. Error Reporting**  
When a circular dependency is detected, the container **MUST**:

1. Throw a `ResolveException`.
2. Include the complete resolution path in the error message.

### 4.5 Container Hierarchy

**H1. Parent-Child Resolution**  
A child container **MUST** be able to resolve services registered in its parent container.

**H2. Registration Isolation**  
Registrations in a child container **MUST NOT** affect the parent container.

**H3. Parent Immutability**  
Once a container is created, its `parent` property **MUST** remain immutable.

### 4.6 Middleware System

**M1. Middleware Execution Order**  
Middlewares **MUST** be executed in reverse registration order (LIFO - Last In, First Out).

- The last registered middleware executes first in the resolution chain.
- This creates an onion-like execution model where later middlewares wrap earlier ones.
- Example: If middlewares are registered in order [A, B, C], they execute in order [C, B, A].

_Rationale:_ This execution order allows later-registered middlewares to intercept and potentially modify the behavior of earlier middlewares, enabling a layered approach where outer layers can control inner layers (e.g., error handling wrapping logging wrapping caching).

**M2. Middleware Chain**  
Each middleware **MUST** receive:

1. A `params` object containing resolution context.
2. A `next()` function to continue the middleware chain.

**M3. Global vs Local Middleware Strategy**

- **Scope Definition**:

  - **Global Middleware**: Applied to all containers across the entire application
  - **Local Middleware**: Applied only to a specific container instance

- **Registration API**: Implementations **MUST** provide distinct mechanisms to register middleware at different scopes:

  - **Local Registration**: `container.use(middleware)` - Registers middleware for the specific container instance and returns a disposer for that registration
  - **Global Registration**: Accessed through a shared global middleware manager (e.g., `globalMiddleware.use(middleware)`) - Registers middleware for all containers and returns a disposer for that registration

- **Execution Order**: The composition follows strict LIFO order based on registration scope:

  1. **Local Middlewares** (Executed First / Outermost Layer) - Container-specific context
  2. **Global Middlewares** (Executed Next) - Application-wide cross-cutting concerns
  3. **Core/Registration Provider** (Executed Last / Innermost Layer) - Base functionality

- **Rationale**: This design follows pure LIFO semantics where later-registered middlewares (Local, typically registered when a container is configured) wrap earlier-registered middlewares (Global, typically registered during application initialization). This ensures that container-specific logic has the ability to intercept, inspect, or short-circuit the resolution process defined by global policies.

- **Key Characteristics**:
  - **Override Capability**: Local middlewares can completely bypass global logic by not calling `next()`, enabling powerful mocking and testing scenarios.
  - **Context Enrichment**: Local middlewares can modify the resolution context before passing it to global middlewares.
  - **Isolation**: Each container's local middlewares are independent; parent-child container relationships do not automatically inherit local middlewares.
  - **Composition Flow**: `Local → Global → Provider` (simple two-layer model)

**M7. Middleware Independence from Container Hierarchy**  
Middleware execution **MUST** be independent of container parent-child relationships:

- Local middlewares are specific to a single container instance and **MUST NOT** be inherited by child containers.
- Global middlewares are shared across all container instances regardless of hierarchy.
- A child container **MUST** have its own independent local middleware chain.
- Parent container's local middlewares **MUST NOT** affect child container's resolution.
- Service resolution follows parent-child hierarchy, but middleware execution does not.

**M4. Middleware Interception**  
A middleware **MAY**:

1. Inspect and log resolution parameters.
2. Transform the resolved instance.
3. Short-circuit resolution by not calling `next()`.

**M5. Middleware Removal**  
A middleware **MAY** be removed using `unused()`. The middleware will be removed from the chain, preventing it from executing in subsequent resolutions.

- Each successful `use()` call **MUST** return a disposer function that removes only the middleware entries added by that call.
- Calling the returned disposer after its middleware entries have already been removed **MUST** be a no-op.

**M6. Middleware Disposal Hook**  
A middleware **MAY** define an optional `onContainerDispose` callback that is invoked when a container is disposed.

- The callback **MUST** receive the container instance as a parameter.
- The callback **MUST** be called for both local and global middlewares when a container is disposed.
- If the callback throws an error, the error **MUST** be caught and ignored to prevent disposal interruption.
- The callback **SHOULD** be used for cleanup operations such as releasing resources, unsubscribing from events, or clearing caches.

### 4.7 Resource Disposal

**D1. Disposal State**  
Once a container is disposed (`disposed === true`), it **MUST** reject all subsequent operations with an error.

- _Error Code:_ `E_CONTAINER_DISPOSED`

**D2. No Cascading**  
Disposing a container **MUST NOT** automatically dispose its child containers. Each container **MUST** be disposed independently.

**D3. Idempotency**  
Calling `dispose()` multiple times **MUST** be idempotent (safe to call repeatedly).

---

## 5. Validation Rules

A compliant implementation **MUST** validate the following constraints:

### 5.1 Registration Validation

**V1. Provider Validation**  
A registration **MUST** specify exactly one of: `useClass`, `useFactory`, `useValue`, or `useAlias`.

**V2. Class Provider Validation**  
When `useClass` is specified, it **MUST** be a valid constructor function.

**V3. Factory Provider Validation**  
When `useFactory` is specified, it **MUST** be a function accepting `(container, resolveContext)` parameters.

**V4. Alias Provider Validation**  
When `useAlias` is specified:

- It **MUST** be a valid ServiceIdentifier.
- If `getContainer` is provided, it **MUST** be a function returning an `IContainer`.

### 5.2 Resolution Validation

**V5. ServiceIdentifier Validation**  
A ServiceIdentifier **MUST** be one of: class constructor, abstract constructor, string, or symbol.

**V6. Resolve Options Validation**  
When `defaultValue` is specified:

- `optional` **MUST** be `true`.
- If `multiple: true`, `defaultValue` **MUST** be an array.
- If `multiple` is false/undefined, `defaultValue` **MUST** be a single value.
- The `dynamic` and `ref` options **MUST NOT** both be `true`.

- _Error Code:_ `E_INVALID_OPTIONS`

---

## 6. Error Reference

| Code                    | Description                                                               |
| :---------------------- | :------------------------------------------------------------------------ |
| `E_INVALID_PROVIDER`    | `E_INVALID_PROVIDER: Registration must specify exactly one provider strategy.` |
| `E_SERVICE_NOT_FOUND`   | `E_SERVICE_NOT_FOUND: Service identifier "{0}" is not registered in this container.` |
| `E_CIRCULAR_DEPENDENCY` | `E_CIRCULAR_DEPENDENCY: Circular dependency detected: {path}.`            |
| `E_CONTAINER_DISPOSED`  | `E_CONTAINER_DISPOSED: Cannot operate on a disposed container.`           |
| `E_INVALID_OPTIONS`     | `E_INVALID_OPTIONS: Invalid resolve options: {reason}.`                  |
| `E_RESOLUTION_FAILED`   | `E_RESOLUTION_FAILED: Failed to resolve service identifier "{0}" in "{1}": {reason}` |
| `E_RESOLVE_CONTEXT_UNAVAILABLE` | `E_RESOLVE_CONTEXT_UNAVAILABLE: No resolve context is available.` |

---

## 7. Non-Normative Considerations

### 7.1 Performance Recommendations

- **Singleton caching**: Implementations **SHOULD** use efficient data structures (e.g., `Map`) for instance caching.
- **Middleware overhead**: Implementations **SHOULD** optimize middleware chains to minimize overhead.

### 7.2 Type Safety

- Implementations **SHOULD** leverage TypeScript's type system to enforce compile-time safety.
- `ServiceIdentifier<T>` **SHOULD** preserve type information through the resolution process.

### 7.3 Debugging Support

- `ResolveRecord` trees **SHOULD** be human-readable for error reporting.

---

## 8. Future Considerations

The following features are explicitly **excluded** from this version but reserved for future study:

- **Async Resolution**: Support for asynchronous factory functions.
