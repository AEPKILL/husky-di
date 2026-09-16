# Dependency Injection Container Specification

**Version:** 1.3.0
**Status:** Stable  
**Context:** Type-safe Dependency Injection Container for TypeScript

## 1. Abstract

This specification defines the behavioral contract and validation rules for a dependency injection container system. It establishes the semantics for service registration, resolution, lifecycle management, container hierarchy, and middleware interception. The goal is to provide a deterministic, type-safe, and introspectable dependency management system.

## 2. Terminology

The following keywords are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119): **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**.

- **ServiceIdentifier**: A unique key (class constructor, abstract constructor, string, or symbol) used to identify a service.
- **Registration**: A binding between a ServiceIdentifier and a provider strategy (class, factory, value, or alias).
- **RegistrationPlan**: A reusable ordered group of registration entries that can be applied to a container.
- **Provider**: A mechanism that defines how a service instance is created (constructor, factory function, value, or alias).
- **Lifecycle**: A strategy that determines when and how service instances are created and reused (transient, singleton, resolution).
- **Resolution**: The process of obtaining a service instance from the container.
- **Container**: A registry that manages service registrations and provides service resolution.
- **Internal Service**: A service registration created by the container itself to expose infrastructure capabilities through the standard resolution pipeline.
- **Middleware**: An interceptor function that can observe or modify the resolution process.
- **ResolveRecord**: A tree structure tracking the resolution chain for debugging and circular dependency detection.
- **ResolveContext**: A map tracking resolved instances within a single resolution scope.
- **Ref**: A lazy reference wrapper that defers service instantiation.

Public types named in this specification, including `ResolveContext`, **MUST**
be importable from the package root.

Unless a requirement explicitly says otherwise, guarantees involving multiple
containers or the package-level `resolve()` helper apply within one loaded
package module instance. Applications **MUST NOT** combine containers,
middleware objects, or resolve helpers from independently evaluated package
copies or module formats in the same resolution chain.

## 3. Data Structures

### 3.1 Service Identifier

```typescript
type ServiceIdentifier<T> =
  | AbstractConstructor<T>
  | Constructor<T>
  | string
  | symbol;

type CreatedServiceIdentifier<T> = ServiceIdentifier<T> &
  (string | symbol) &
  { readonly [internalTypeBrand]: T };

type ServiceIdentifierInstance<R extends ServiceIdentifier<unknown>> =
  R extends CreatedServiceIdentifier<infer T>
    ? T
    : R extends AbstractConstructor<infer T>
      ? T
      : unknown;
```

`createServiceIdentifier()` **MAY** associate out-of-band metadata with a
created string or symbol service identifier.

```typescript
type CreateServiceIdentifierOptions<Metadata = unknown> = {
  readonly metadata?: Metadata | undefined;
};

function createServiceIdentifier<T, Metadata = unknown>(
  id: string | symbol,
  options?: CreateServiceIdentifierOptions<Metadata>,
): CreatedServiceIdentifier<T>;

function getServiceIdentifierMetadata<Metadata = unknown>(
  serviceIdentifier: ServiceIdentifier<unknown>,
): Metadata | undefined;

function hasServiceIdentifierMetadata(
  serviceIdentifier: ServiceIdentifier<unknown>,
): boolean;
```

`CreatedServiceIdentifier` **MUST** be exported from the package root so a
downstream declaration emitter can name the factory's return type. Its type
brand **MUST NOT** expose a readable runtime property on the primitive
identifier.

`createServiceIdentifier()` **MUST** reject runtime inputs that are neither a
string nor a symbol with `E_INVALID_SERVICE_IDENTIFIER`.

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

### 3.3 Registration Plan

A registration plan **MUST** contain ordered registration entries:

```typescript
type RegistrationPlanEntry<T = unknown> = {
  readonly serviceIdentifier: ServiceIdentifier<T>;
  readonly registration: CreateRegistrationOptions<T>;
};

type RegistrationPlan = {
  readonly registrations: ReadonlyArray<RegistrationPlanEntry<unknown>>;
};

A registration plan is created through the `createRegistrationPlan` factory function:

```typescript
type RegistrationPlanConfigure = (
  register: <T>(
    serviceIdentifier: ServiceIdentifier<T>,
    registration: CreateRegistrationOptions<T>,
  ) => void,
) => void;

function createRegistrationPlan(
  configure: RegistrationPlanConfigure,
): RegistrationPlan;
```
```

### 3.4 Lifecycle Strategies

```typescript
enum LifecycleEnum {
  transient = 0, // New instance per resolution
  singleton = 1, // One instance per container
  resolution = 2, // One instance per resolution chain
}
```

### 3.5 Resolve Options

```typescript
type ResolveOptions<T> = {
  recursive?: boolean; // Whether parent-container fallback is enabled
} & (
  | { dynamic: true; ref?: false } // Return dynamic reference
  | { dynamic?: false; ref?: boolean } // Return static reference
) & (
  | { multiple?: false; optional?: false; defaultValue?: undefined }
  | { multiple?: false; optional: true; defaultValue?: T | undefined }
  | { multiple: true; optional?: false; defaultValue?: undefined }
  | { multiple: true; optional: true; defaultValue?: T[] | undefined }
);
```

### 3.6 Resolve Helper Scope

```typescript
enum ResolveContainerScopeEnum {
  current = "current",
  origin = "origin",
}
```

### 3.7 Resolve Helper Options

```typescript
type ResolveHelperOptions<T> = ResolveOptions<T> & {
  scope?: ResolveContainerScopeEnum;
};
```

### 3.8 Disposable Registry

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
The container **MUST** support `unregisterAll(serviceIdentifier)` by `ServiceIdentifier`.

- Calling `unregisterAll(serviceIdentifier)` **MUST** remove all registrations associated with that identifier in the current container.
- Calling `unregisterAll(serviceIdentifier)` with a non-existent `ServiceIdentifier` **MUST** be a no-op.

**R2.3 Registration Plan**  
A container **MUST** support applying a `RegistrationPlan`.

- Plan entries **MUST** be registered in declaration order.
- The same `RegistrationPlan` **MAY** be applied multiple times, including to the same container.
- Applying a plan **MUST** return a disposer function.
- Calling the returned disposer **MUST** remove exactly the registrations created by that plan.
- Each plan application **MUST** return an independent disposer associated only with that application.
- Calling the returned disposer after those registrations have already been removed **MUST** be a no-op.
- The plan disposer **MUST NOT** remove unrelated registrations for the same `ServiceIdentifier`.
- If any entry fails to register, the container **MUST** remove entries already registered by that plan and rethrow the failure.

**R3. Lifecycle Default**  
If `lifecycle` is not specified, the container **MUST** default to `LifecycleEnum.transient`.

### 4.2 Service Resolution

**S1. Resolution Order**  
When resolving a ServiceIdentifier, the container **MUST** search in the following order:

1. Local registrations in the current container.
2. If not found, `parent` is defined, and `recursive !== false`, recursively search in the parent container.
3. If no registration is found and the identifier is a concrete class
   constructor, create it as a transient instance.

Parent-container fallback **MUST** remain enabled by default.

**S1.1 Service Identifier Metadata**  
Service identifier metadata **MUST NOT** affect registration, lookup,
resolution, display name extraction, or equality semantics.

- `getServiceIdentifierMetadata(serviceIdentifier)` **MUST** return the
  associated metadata value when one exists.
- `getServiceIdentifierMetadata(serviceIdentifier)` **MUST** return `undefined`
  when no metadata association exists.
- `hasServiceIdentifierMetadata(serviceIdentifier)` **MUST** return `true`
  when metadata has been associated with the identifier, even if that metadata
  value is explicitly `undefined`.
- `hasServiceIdentifierMetadata(serviceIdentifier)` **MUST** return `false`
  when no metadata association exists.
- For string identifiers, metadata association **MUST** be keyed by string
  equality.
- For symbol identifiers, metadata association **MUST** be keyed by symbol
  identity.

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
- An auto-resolved concrete class **MUST** contribute one instance and therefore
  return a single-element array.

**S5. Reference Resolution**  
When `ref: true` or `dynamic: true` is specified:

- **MUST** return a `Ref<T>` object with a `current` property providing access to the resolved instance.
- When `dynamic: true`, accessing `current` **MUST** re-resolve the service on each access.
- Accessing `current` during another active resolution **MUST** restore that
  surrounding resolution's record and resolution-scoped context afterward.
- A reference that re-enters registered-service resolution **MUST** retain the
  active container that created it. A reference created inside an ancestor
  provider **MUST** bind to that ancestor, not to the child that originated the
  outer resolution. Caching such a reference in an ancestor singleton
  **MUST NOT** bind it to the first child that resolved the singleton.
  An unresolved static reference and every dynamic-reference access **MUST**
  reject after that container is disposed.
  A static reference resolved before disposal **MUST** continue returning its
  cached value.

- _Error Code:_ `E_CONTAINER_DISPOSED`

**S6. Alias Resolution**  
For `useAlias` registrations, resolution **MUST** delegate to the target ServiceIdentifier. If `getContainer` is provided, resolution **MUST** use the returned container; otherwise, the current container **MUST** be used.

When an alias registration contributes to a `multiple: true` result, it
**MUST** contribute one value using the target identifier's ordinary single
resolution semantics; the result **MUST NOT** contain nested arrays.

The outer multiple resolution's `optional` and `defaultValue` aggregation
options **MUST NOT** be forwarded to an alias target. A registered alias whose
target is missing is a provider failure and **MUST** still reject resolution.

- _Error Code:_ `E_SERVICE_NOT_FOUND`

**S7. Provider Failure Reporting**  
If a provider throws while a service is being resolved, the container **MUST** wrap the failure in a `ResolveException` while preserving the active `ResolveRecord` path.

The failure detail **MUST** identify the container that owns and executes the
failing provider, including when the registration comes from an ancestor.

- _Error Code:_ `E_RESOLUTION_FAILED`

**S8. Resolve Context Availability**  
The package-level `resolve()` helper **MUST** only be used while a resolution context is active. If no active `ResolveRecord` or current container is available, the implementation **MUST** reject the call.

- _Error Code:_ `E_RESOLVE_CONTEXT_UNAVAILABLE`

**S9. Resolve Helper Container Scope**  
The package-level `resolve()` helper **MUST** support a helper-only `scope` option with the following behavior:

- When `scope` is omitted, the helper **MUST** default to `ResolveContainerScopeEnum.current`.
- When `scope` is `ResolveContainerScopeEnum.current`, the helper **MUST** continue resolution from the container currently performing the active resolution step.
- When `scope` is `ResolveContainerScopeEnum.origin`, the helper **MUST** continue resolution from the container that started the current resolution chain.
- The current-container rule **MUST** also apply while each registration in a
  `multiple: true` resolution is being resolved.
- This helper-only scope option **MUST NOT** change the semantics of `container.resolve()`.

**S10. Resolve Helper Container Access**  
When the package-level `resolve()` helper receives `IContainer` as the `ServiceIdentifier`, it **MUST** expose the scoped active container without requiring an explicit container registration.

- With the default single-resolution shape, the helper **MUST** return the scoped active container directly.
- When `multiple: true` is specified, the helper **MUST** return an array containing exactly that scoped active container.
- When `ref: true` or `dynamic: true` is specified, the helper **MUST** return a `Ref` whose `current` value follows the same single or array shape described above.
- With `dynamic: true`, each access to `current` **MUST** produce a fresh
  resolution result, including a fresh array when `multiple: true`.
- Synthetic `IContainer` references do not re-enter registered-service
  resolution and **MUST** remain readable after the originating container is
  disposed.
- The selected container for this special case **MUST** still follow `S9` and therefore honor the helper's `scope` option.

### 4.3 Lifecycle Management

**L1. Transient Lifecycle (`LifecycleEnum.transient`)**  
The container **MUST** create a new instance every time the service is resolved.

**L2. Singleton Lifecycle (`LifecycleEnum.singleton`)**  
The container **MUST** create a new instance the first time the service is resolved, and then return the same instance for all subsequent resolutions within the same container.

**L3. Resolution Lifecycle (`LifecycleEnum.resolution`)**  
The container **MUST** create a new instance the first time the service is resolved within a resolution context, and then return the same instance for all subsequent resolutions within the same resolution context.

A resolution context **MUST** be shared across every container participating in
the same resolution chain, and **MUST NOT** be reused by a later independent
resolution chain.

### 4.4 Circular Dependency Detection

**C1. Detection Requirement**  
The container **MUST** detect circular dependencies during resolution.

- _Error Code:_ `E_CIRCULAR_DEPENDENCY`
- _Detection Mechanism:_ A `ResolveRecord` tree **MUST** track the resolution path.

**C2. Detection Criteria**  
A circular dependency exists when a ServiceIdentifier appears more than once in the current resolution path from root to current node.

Using `multiple: true` **MUST NOT** exempt a resolution from this detection
criterion.

**C3. Error Reporting**  
When a circular dependency is detected, the container **MUST**:

1. Throw a `ResolveException`.
2. Include the complete resolution path in the error message.

**C4. Failed Branch Recovery**

When a nested resolution fails, that failed branch **MUST** be removed from the
active resolution path before control returns to caller code. A factory that
handles the failure **MUST** be able to continue resolving other services or
retry the failed service without a false circular-dependency error.

### 4.5 Container Hierarchy

**H1. Parent-Child Resolution**  
A child container **MUST** be able to resolve services registered in its parent container.

When `recursive: false` is specified for a resolution, that resolution **MUST** be limited to the current container and **MUST NOT** fall back to the parent container hierarchy.

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

For `multiple: true`, middleware **MUST** execute once per registration and
`next()` **MUST** return that registration's single `T` instance, not `T[]`.

For an optional single resolution without a required non-undefined default,
`next()` **MUST** be typed as `T | undefined` and **MUST** preserve the runtime
`undefined` result.

**M3. Single Global Middleware Scope**

The package **MUST** export one application-wide middleware manager named
`middleware`. Middleware registered through `middleware.use(...middlewares)`
**MUST** apply to resolutions performed by every container created by that
loaded package module instance. Separately loaded package module instances
own independent middleware state; sharing state across duplicate package
copies or module formats is not part of this contract.

`IContainer` **MUST NOT** expose `use()` or `unused()`. The public middleware
management contract **MUST** expose only `use(...middlewares)`. In particular,
it **MUST NOT** expose `unused()`, `all()`, `has()`, event subscription, or
manager disposal operations.

Middleware scope **MUST NOT** vary with container hierarchy, registration
ownership, parent fallback, or explicit alias container selection. Every
container participates in the same middleware pipeline.

**M4. Middleware Interception**

A middleware **MAY**:

1. Inspect and log resolution parameters.
2. Transform the resolved instance.
3. Short-circuit resolution by not calling `next()`.

The middleware pipeline **MUST** execute whenever a registration is resolved,
including provider lifecycle-cache hits. Core **MUST NOT** lifecycle-cache a
transformed or short-circuit result produced by middleware. Provider lifecycle
values reached through `next()` **MUST** retain the identity guarantees of L2
and L3 behind the middleware pipeline.

When middleware invokes `next()` more than once, a staged singleton provider
value **MUST** be reused by every call for that registration. A staged
resolution provider value **MUST** be reused only by calls that carry the same
`ResolveContext`; different contexts **MUST** receive independent values.

Lifecycle values produced through `next()` **MUST NOT** be committed to their
singleton or resolution cache until the middleware chain completes. If a
middleware or staged cache commit fails, cache changes made by that attempt
**MUST** be rolled back without discarding context changes the middleware made
before the commit began.

**M5. Middleware Cleanup**

Each successful `middleware.use()` call **MUST** return a cleanup function.
That cleanup is the sole public authority for removing middleware added by
that call; no separate removal operation is provided.

- A cleanup **MUST** remove only middleware successfully added by its own
  `use()` call.
- Calling a cleanup more than once **MUST** be a no-op after its first call.
- Calling an old cleanup **MUST NOT** remove the same middleware object if it
  was registered again by a later `use()` call.
- The same middleware object **MUST** have at most one active registration.
  Registering that object again while it is active **MUST** be a no-op.
- Different middleware objects that share the same diagnostic `name` **MUST**
  remain distinct registrations and **MUST** both execute.

**M6. Middleware Disposal Hook**

A middleware **MAY** define an optional `onContainerDispose` callback.

- Every active middleware callback **MUST** be invoked once for each container
  when that container is disposed and **MUST** receive that container.
- Middleware removed before disposal **MUST NOT** be notified.
- Disposal **MUST** iterate a stable snapshot of active middleware. A callback
  that invokes its own cleanup **MUST NOT** prevent other middleware in that
  snapshot from being notified.
- If a callback throws, the error **MUST** be ignored and the remaining active
  callbacks **MUST** still be invoked.

### 4.7 Resource Disposal

**D1. Disposal State**  
Once a container is disposed (`disposed === true`), it **MUST** reject all subsequent operations with an error.

- _Error Code:_ `E_CONTAINER_DISPOSED`

**D2. No Cascading**  
Disposing a container **MUST NOT** automatically dispose its child containers. Each container **MUST** be disposed independently.

**D3. Idempotency**  
Calling `dispose()` multiple times **MUST** be idempotent (safe to call repeatedly).

**D4. Cleanup Idempotency**  
Any `Cleanup` function accepted by the resource disposal system **MUST** be safe to call multiple times.

- Only the first successful call **MUST** perform the actual cleanup work.
- Any subsequent call **MUST** be treated as a no-op.
- Subsequent no-op calls **MUST NOT** throw solely because the cleanup has already been executed.

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

Every string value, including the empty string, **MUST** be accepted.

Container operations that receive an invalid identifier **MUST** reject it at
the public API boundary.

- _Error Code:_ `E_INVALID_SERVICE_IDENTIFIER`

**V6. Resolve Options Validation**  
When `defaultValue` is specified:

- `optional` **MUST** be `true`.
- If `multiple: true`, `defaultValue` **MUST** be an array.
- If `multiple` is false/undefined, `defaultValue` **MUST** be a single value.
- The `dynamic` and `ref` options **MUST NOT** both be `true`.
- An explicit `defaultValue: undefined` **MUST** be treated as though the
  property were omitted.
- Rejecting invalid resolve options **MUST NOT** leave an active resolution
  context behind.
- The same validation **MUST** apply when the package-level `resolve()` helper
  resolves the special `IContainer` identifier.

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
| `E_INVALID_SERVICE_IDENTIFIER` | `E_INVALID_SERVICE_IDENTIFIER: Invalid service identifier.`     |
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
