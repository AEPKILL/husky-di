# Decorator-based Dependency Injection Specification

**Version:** 1.0.0  
**Status:** Final  
**Context:** TypeScript Decorator-based Dependency Injection System

## 1. Abstract

This specification defines a decorator-based dependency injection system that uses TypeScript experimental decorators and reflection metadata to declare and resolve constructor dependencies. It establishes the rules for marking injectable classes, declaring parameter dependencies, and the metadata structure required for dependency resolution.

## 2. Terminology

The following keywords are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119): **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **MAY**.

- **Injectable Class**: A class marked with the `@injectable()` decorator that can be instantiated by the dependency injection system.
- **Injection Metadata**: Metadata attached to a constructor parameter that describes how the dependency should be resolved.
- **Service Identifier**: A unique key (class constructor, symbol, or string) used to identify a service.
- **Parameter Index**: Zero-based index of a constructor parameter.
- **Reflection Metadata**: Runtime metadata accessible via the Reflect API, following the reflect-metadata specification.

## 3. Data Structures

### 3.1 Injection Metadata

```typescript
interface InjectionMetadata<T> {
  readonly serviceIdentifier: ServiceIdentifier<T>;
  readonly container?: Container;
  readonly dynamic?: boolean;
  readonly ref?: boolean;
  readonly optional?: boolean;
}
```

**Fields:**

- `serviceIdentifier` **(REQUIRED)**: The service identifier to resolve.
- `container` (OPTIONAL): Specific container instance to resolve from.
- `dynamic` (OPTIONAL): When `true`, return a dynamic reference instead of the resolved instance.
- `ref` (OPTIONAL): When `true`, return a reference wrapper instead of the resolved instance.
- `optional` (OPTIONAL): When `true`, resolution failure does not throw an error.

### 3.2 Metadata Storage Keys

```typescript
const DESIGN_PARAMTYPES = "design:paramtypes";
const INJECTION_METADATA = "husky-di.injection-metadata";
```

**DESIGN_PARAMTYPES**: TypeScript-emitted metadata key containing constructor parameter types.

**INJECTION_METADATA**: Custom metadata key storing the injection metadata array for a constructor.

## 4. Decorator Specifications

### 4.1 @injectable()

#### 4.1.1 Signature

```typescript
function injectable(): ClassDecorator;
```

#### 4.1.2 Semantics

The `@injectable()` decorator **MUST** mark a class as injectable and consolidate its constructor parameter metadata.

**M1. Single Application**  
A class **MUST NOT** be decorated with `@injectable()` more than once.

- _Error Code:_ `E_DUPLICATE_INJECTABLE`
- _Constraint:_ Each class constructor can have at most one `@injectable()` application.

**M2. Metadata Consolidation**  
The decorator **MUST** produce an array of `InjectionMetadata` for each constructor parameter by combining:

1. Explicit metadata from `@inject()` or `@tagged()` decorators (if present)
2. Implicit metadata derived from TypeScript's `design:paramtypes` (if no explicit metadata exists)

**M3. Parameter Type Validation**  
For parameters without explicit injection metadata, the inferred type from `design:paramtypes` **MUST** be a function (class constructor). Non-function types **MUST** result in an error.

- _Error Code:_ `E_NON_CLASS_PARAMETER`
- _Constraint:_ `typeof paramType === "function"` for all parameters without explicit metadata.

**M4. Metadata Storage**  
The resulting metadata array **MUST** be stored in an implementation-defined location accessible during resolution.

#### 4.1.3 Metadata Resolution Order

For parameter at index $i$:

$$
metadata[i] =
\begin{cases}
explicit[i] & \text{if } explicit[i] \neq \text{undefined} \\
\{ serviceIdentifier: inferred[i] \} & \text{otherwise}
\end{cases}
$$

Where:

- $explicit[i]$ = metadata set by `@inject()` or `@tagged()`
- $inferred[i]$ = type from `design:paramtypes[i]`

### 4.2 @inject()

#### 4.2.1 Signature

```typescript
type InjectOptions<T> = Omit<InjectionMetadata<T>, "serviceIdentifier">;

function inject<T>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: InjectOptions<T>
): ParameterDecorator;
```

#### 4.2.2 Semantics

The `@inject()` decorator **MUST** attach injection metadata to a specific constructor parameter.

**I1. Parameter Scope**  
The decorator **MUST** only be applicable to constructor parameters. Application to other contexts (methods, properties, classes) **MAY** be ignored or rejected.

**I2. Service Identifier Requirement**  
The `serviceIdentifier` argument **MUST** be provided and non-null.

**I3. Metadata Attachment**  
The decorator **MUST** store the complete `InjectionMetadata` object (combining `serviceIdentifier` and `options`) at the parameter's index in the class's metadata array.

**I4. Multiple Applications**  
If `@inject()` is applied multiple times to the same parameter, only the last application **MUST** take effect.

#### 4.2.3 Options Semantics

- **container**: If specified, resolution **MUST** occur from the specified container instead of the default.
- **dynamic**: If `true`, the resolved value **MUST** be a reference that reflects the current registration state.
- **ref**: If `true`, the resolved value **MUST** be a reference wrapper object.
- **optional**: If `true` and resolution fails, the value **MUST** be `undefined` instead of throwing an error.

### 4.3 @tagged()

#### 4.3.1 Signature

```typescript
function tagged<T>(metadata: InjectionMetadata<T>): ParameterDecorator;
```

#### 4.3.2 Semantics

The `@tagged()` decorator **MUST** attach complete injection metadata to a constructor parameter.

**T1. Low-Level Primitive**  
This decorator is the foundational metadata attachment mechanism. `@inject()` **MAY** be implemented in terms of `@tagged()`.

**T2. Complete Metadata**  
The `metadata` argument **MUST** include a valid `serviceIdentifier` field.

- _Error Code:_ `E_MISSING_SERVICE_IDENTIFIER`

**T3. Metadata Storage**  
The decorator **MUST** write the metadata object to the reflection metadata system at the key `INJECTION_METADATA`, indexed by parameter position.

**T4. Metadata Retrieval**  
The stored metadata **MUST** be retrievable using:

```typescript
Reflect.getMetadata(INJECTION_METADATA, targetConstructor);
```

**T5. Array Integrity**  
The metadata array **MUST** maintain sparse array semantics: parameters without explicit metadata have `undefined` at their index.

## 5. Validation Rules

### 5.1 Class-Level Validation

**V1. Injectable Requirement**  
A class resolved through the dependency injection system **MUST** be decorated with `@injectable()`.

- _Error Code:_ `E_NOT_INJECTABLE`
- _Trigger:_ Attempting to resolve a class without `@injectable()`

**V2. Metadata Completeness**  
After `@injectable()` processing, every constructor parameter **MUST** have a resolved `InjectionMetadata` entry.

- _Error Code:_ `E_INCOMPLETE_METADATA`

### 5.2 Parameter-Level Validation

**V3. Service Identifier Validity**  
Each parameter's `serviceIdentifier` **MUST** be one of:

- A class constructor function
- A symbol
- A non-empty string

Empty strings or `null`/`undefined` **MUST NOT** be accepted.

- _Error Code:_ `E_INVALID_SERVICE_IDENTIFIER`

**V4. Option Conflicts**  
The options `dynamic` and `ref` **MUST NOT** both be `true` simultaneously.

- _Error Code:_ `E_CONFLICTING_OPTIONS`

## 6. Metadata Lifecycle

### 6.1 Decoration Phase (Compile-time/Load-time)

1. Parameter decorators (`@inject()`, `@tagged()`) execute first, storing partial metadata
2. Class decorator (`@injectable()`) executes last, consolidating all parameter metadata

### 6.2 Resolution Phase (Runtime)

1. Retrieve consolidated metadata for the class
2. For each parameter, resolve its dependency using the stored `InjectionMetadata`
3. Instantiate the class with resolved parameters

## 7. Error Conditions

An implementation **MUST** detect and report the following error conditions:

### 7.1 E1. Duplicate Injectable Decorator

- **Code**: `E_DUPLICATE_INJECTABLE`
- **Condition**: `@injectable()` applied more than once to the same class
- **Message Template**: `"Class '{0}' is already decorated with @injectable()"`

### 7.2 E2. Non-Class Parameter Type

- **Code**: `E_NON_CLASS_PARAMETER`
- **Condition**: Constructor parameter without explicit metadata has non-function inferred type
- **Message Template**: `"Constructor '{0}' parameter #{1} must be a class type"`

### 7.3 E3. Not Injectable

- **Code**: `E_NOT_INJECTABLE`
- **Condition**: Attempting to resolve a class not decorated with `@injectable()`
- **Message Template**: `"Class '{0}' must be decorated with @injectable()"`

### 7.4 E4. Missing Service Identifier

- **Code**: `E_MISSING_SERVICE_IDENTIFIER`
- **Condition**: `@tagged()` called without a `serviceIdentifier` in metadata
- **Message Template**: `"Injection metadata must include a serviceIdentifier"`

### 7.5 E5. Invalid Service Identifier

- **Code**: `E_INVALID_SERVICE_IDENTIFIER`
- **Condition**: `serviceIdentifier` is not a function, symbol, or non-empty string
- **Message Template**: `"Invalid service identifier: {0}"`

### 7.6 E6. Conflicting Options

- **Code**: `E_CONFLICTING_OPTIONS`
- **Condition**: Both `dynamic` and `ref` are `true`
- **Message Template**: `"Cannot use both 'dynamic' and 'ref' options simultaneously"`

### 7.7 E7. Incomplete Metadata

- **Code**: `E_INCOMPLETE_METADATA`
- **Condition**: After `@injectable()` processing, some parameters lack metadata
- **Message Template**: `"Constructor '{0}' has incomplete injection metadata"`

## 8. TypeScript Configuration Requirements

### 8.1 Required Compiler Options

An implementation relying on TypeScript decorators **MUST** require the following compiler options:

```json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true
}
```

**experimentalDecorators**: Enables TypeScript experimental decorator syntax.

**emitDecoratorMetadata**: Emits design-time type metadata for decorated declarations.

### 8.2 Reflection API Requirement

An implementation **MUST** ensure the Reflect API with metadata support is available in the runtime environment. This **MAY** be provided by:

- The `reflect-metadata` package
- A compatible polyfill or implementation

## 9. Constraints and Limitations

### 9.1 Decorator Type Support

**L1. ES Decorators**  
This specification applies **ONLY** to TypeScript experimental decorators. ES/TC39 decorators are explicitly **NOT** supported due to the absence of parameter decorators in that specification.

**L2. Injection Scope**  
Decorators defined in this specification **MUST** only support constructor injection. Property injection and method injection are **NOT** specified.

### 9.2 Type System Limitations

**L3. Primitive Types**  
Constructor parameters of primitive types (string, number, boolean) **MUST NOT** be automatically injectable without explicit `@inject()` metadata.

**L4. Interface Types**  
TypeScript interfaces do not exist at runtime. Parameters typed as interfaces **MUST** use explicit `@inject()` with a runtime-available service identifier (class, symbol, or string).

## 10. Appendix A: Formal Definitions

### 10.1 Metadata Consolidation Algorithm

Given:

- $C$ = class constructor
- $n$ = number of constructor parameters
- $E$ = explicit metadata array from `@inject()`/`@tagged()`
- $I$ = inferred types from `design:paramtypes`

Produce: $M$ = consolidated metadata array

```text
Algorithm: ConsolidateMetadata(C, n, E, I)
  Initialize M as empty array of length n

  For i from 0 to n-1:
    If E[i] is defined:
      M[i] ← E[i]
    Else:
      If I[i] is not a function:
        Throw E_NON_CLASS_PARAMETER
      M[i] ← { serviceIdentifier: I[i] }

  Return M
```

### 10.2 Resolution Semantics

For a parameter with metadata $m$:

- If $m.optional = true$ and resolution fails → return `undefined`
- If $m.optional = false$ (or unset) and resolution fails → throw error
- If $m.dynamic = true$ → return dynamic reference
- If $m.ref = true$ → return reference wrapper
- Otherwise → return resolved instance

## 11. Appendix B: Error Reference Table

| Code                           | Condition                              | When Detected    |
| :----------------------------- | :------------------------------------- | :--------------- |
| `E_DUPLICATE_INJECTABLE`       | Multiple `@injectable()` on same class | Decoration phase |
| `E_NON_CLASS_PARAMETER`        | Parameter type is not a function       | Decoration phase |
| `E_NOT_INJECTABLE`             | Resolving non-injectable class         | Resolution phase |
| `E_MISSING_SERVICE_IDENTIFIER` | `serviceIdentifier` not in metadata    | Decoration phase |
| `E_INVALID_SERVICE_IDENTIFIER` | Invalid identifier type                | Decoration phase |
| `E_CONFLICTING_OPTIONS`        | Both `dynamic` and `ref` are true      | Decoration phase |
| `E_INCOMPLETE_METADATA`        | Missing metadata after consolidation   | Decoration phase |

## 12. Appendix C: Example Metadata States

### C.1 Before @injectable()

```typescript
@injectable()
class Service {
  constructor(depA: DepA, @inject(DepB) depB: DepB) {}
}
```

**State after parameter decorators:**

- `design:paramtypes`: `[DepA, DepB]`
- `INJECTION_METADATA`: `[undefined, { serviceIdentifier: DepB }]`

**State after class decorator:**

- Consolidated metadata:

  ```typescript
  [{ serviceIdentifier: DepA }, { serviceIdentifier: DepB }];
  ```

### C.2 With Options

```typescript
@injectable()
class Service {
  constructor(
    @inject(Config, { optional: true }) config?: Config,
    @inject(Logger, { dynamic: true }) loggerRef: Ref<Logger>
  ) {}
}
```

**Consolidated metadata:**

```typescript
[
  { serviceIdentifier: Config, optional: true },
  { serviceIdentifier: Logger, dynamic: true },
];
```

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-28  
**Author**: AEPKILL
