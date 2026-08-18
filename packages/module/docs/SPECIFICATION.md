# Dependency Injection Module Specification

**Version:** 1.1.0
**Status:** Proposal
**Context:** ES Module-style Dependency Injection System

## 1\. Abstract

This specification defines a modular system for Dependency Injection (DI) that emulates the semantics of ECMAScript Modules (ESM). It establishes the rules for module definition, service declaration, import/export resolution, aliasing, and validation logic. The goal is to provide a deterministic and intuitive dependency graph management system.

## 2\. Terminology

The following keywords are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119): **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**.

- **Module**: A logical unit that encapsulates providers, imports, and exports.
- **ServiceIdentifier**: A unique key (string, symbol, or class constructor) used to identify a service.
- **Declaration**: A definition of a service local to the module (equivalent to `const/class` in ESM).
- **Export**: A mechanism to make a local declaration or imported service available to consumer modules.
- **Import**: A mechanism to consume services exported by other modules.
- **Alias**: A mapping strategy that renames a service identifier during the import process (equivalent to `import { foo as bar }`).

## 3\. Data Structures

The system relies on the following core data structures. TypeScript interfaces are used here for formal definition.

### 3.1 Module Descriptor

A module is defined by a descriptor object:

```typescript
interface ModuleDescriptor {
  readonly name: string;
  readonly declarations?: Declaration[];
  readonly imports?: Array<IModule | ModuleWithAliases>;
  readonly exports?: ServiceIdentifier[];
}
```

### 3.2 Alias Definition

```typescript
interface Alias {
  readonly serviceIdentifier: ServiceIdentifier; // Source Identifier
  readonly as: ServiceIdentifier; // Target Identifier (Local Name)
}

interface ModuleWithAliases {
  readonly module: IModule;
  readonly aliases: Alias[];
}
```

---

## 4\. Semantics & Validation Rules

A compliant implementation **MUST** validate the following rules during the module creation or container build phase.

### 4.1 Declarations

**D1. Uniqueness**
A module **MUST NOT** contain multiple declarations with the same `ServiceIdentifier`.

- _Error Code:_ `E_DUPLICATE_DECLARATION`
- _Constraint:_ `declarations[i].serviceIdentifier !== declarations[j].serviceIdentifier` for all `i != j`.

**D2. Validity**
Each declaration **MUST** be a valid registration object containing exactly one of the following strategies: `useClass`, `useFactory`, `useValue`, or `useAlias`.

- _Error Code:_ `E_INVALID_REGISTRATION`

### 4.2 Imports

**I1. Module Uniqueness**
The `imports` list **MUST NOT** contain the same module instance more than once.

- _Error Code:_ `E_DUPLICATE_IMPORT_MODULE`

**I2. Circular Dependency**
The dependency graph formed by module imports **MUST NOT** contain cycles (neither direct nor transitive).

- _Error Code:_ `E_CIRCULAR_DEPENDENCY`

**I3. Namespace Collision**
If two or more imported modules export a service with the same `ServiceIdentifier`, and that identifier is not aliased to a unique name in the current scope, the implementation **MUST** raise an error.

- _Error Code:_ `E_IMPORT_COLLISION`
- _Note:_ Unlike ESM (which might allow import but fail on access), this spec enforces strict static collision detection to prevent runtime ambiguity.

**I4. Local Declaration Collision**
If an imported service is available in the target module's Import Scope with the same `ServiceIdentifier` as a local declaration, the implementation **MUST** raise an error. The imported service **MUST** be aliased to a unique local name before it can coexist with the local declaration.

- _Error Code:_ `E_IMPORT_CONFLICT_LOCAL`

### 4.3 Exports

**E1. Export Source Validity**
A module **MAY ONLY** export a `ServiceIdentifier` if it satisfies one of the following conditions:

1. It is defined in the module's `declarations`.
2. It is explicitly exported by one of the module's `imports` (Re-export).
3. It is the result of an alias mapping from an import (see Section 5).

<!-- end list -->

- _Error Code:_ `E_EXPORT_NOT_FOUND`

**E2. Export Uniqueness**
The `exports` list **MUST NOT** contain duplicate identifiers.

- _Error Code:_ `E_DUPLICATE_EXPORT`

---

## 5\. Aliasing Resolution Strategy

This section defines the behavior of `Module.withAliases([...])`.

### 5.1 Resolution Logic

When a module $M_{source}$ is imported into $M_{target}$ with a set of aliases $A$:

1. **Existence Check**: For every alias mapping $\{ s \to t \} \in A$, the identifier $s$ **MUST** exist in the `exports` list of $M_{source}$.
   - _Error:_ `E_ALIAS_SOURCE_NOT_EXPORTED`
2. **Local Conflict Check**: The target identifier $t$ participates in the target module's Import Scope and **MUST NOT** collide with any identifier defined in the `declarations` of $M_{target}$.
   - _Error:_ `E_IMPORT_CONFLICT_LOCAL`
3. **Mapping Uniqueness**: The source identifier $s$ **MUST NOT** be mapped more than once within the same import statement.
   - _Error:_ `E_DUPLICATE_ALIAS_MAP`

### 5.2 Accessibility Rules

The set of services available in $M_{target}$ from an imported $M_{source}$ with aliases $A$ is defined as:

$$
S_{imported} = \{ id \mid id \in Exports(M_{source}) \land id \notin Domain(A) \} \cup \{ t \mid \{ s \to t \} \in A \}
$$

**In plain English:**

- Services explicitly aliased are available under their **new name** ($t$).
- The **original names** ($s$) of aliased services are **hidden** (shadowed) and not imported.
- Services _not_ mentioned in the alias list are imported under their **original name**.
- `withAliases()` is a renaming mechanism, not a partial-import mechanism. An alias list **MUST NOT** be interpreted as the complete list of services to import.

---

## 6\. Implementation Guidelines

### 6.1 Validation Sequence

To ensure data integrity, the validation logic should be executed in the following order:

1. **Declaration Validation**: Validate internal consistency of `declarations`.
2. **Import Validation**: Validate `imports` recursively (checking circular dependencies and collisions).
3. **Export Validation**: Validate `exports` against the resolved set of available declarations and imports.

### 6.2 Container Composition

`createModule()` returns an `IModule`, which is a focused container facade. It exposes `resolve()`, `isRegistered()`, `getServiceIdentifiers()`, and `withAliases()` directly. There is no separate build step. Its `container` property exposes an export-guarded `IContainer` facade.

Neither `IModule` nor `IContainer` provides module-local middleware registration. Resolution middleware is shared by containers created through the current loaded `@husky-di/core` module instance and is registered through its exported `middleware` object.

Every module in one import graph **MUST** be backed by the same loaded
`@husky-di/core` module instance. Applications **MUST NOT** combine modules
whose containers come from independently evaluated package copies or module
formats.

```typescript
function createModule(options: CreateModuleOptions): IModule;
```

The container is assembled internally during `createModule()`:

1. **Register Locals**: Register all items from `declarations`.
2. **Process Imports**:
   - Normalize all imports into a standard format.
   - For un-aliased imports: Bridge the parent container or merge definitions.
   - For aliased imports: Register a `useAlias` provider pointing to the source container's service.
3. **Create Public Facade**: Wrap the internal container with the module's export check. Internal providers retain the internal container; callers and imported aliases receive the guarded facade.

### 6.3 Export Boundary

The module export check **MUST** be enforced by the module's public resolution facade before control enters the core middleware pipeline. It **MUST NOT** be implemented as container-local middleware or as an ordinary application middleware that a short-circuit can bypass.

The public facade **MUST** apply these rules on every resolution:

1. A service registered directly in a module container **MUST NOT** be resolved from outside that module unless its identifier is listed in the module's `exports`.
2. Internal providers **MUST** resolve through the internal container and **MUST** be allowed to access that module's declarations and imports.
3. A service that is not registered directly in the module container **MUST** continue through normal core resolution, including parent or root-container fallback.
4. An imported alias **MUST** resolve through the source module's guarded facade, so the source service must be exported by that source module.
5. `module.resolve()` and `module.container.resolve()` **MUST** enforce the same boundary before application middleware runs.

Rejecting a non-exported service **MUST** throw `ModuleException` with error code `E_EXPORT_NOT_FOUND`.

This boundary provides API encapsulation, not a security sandbox. The guarantee
applies to ordinary calls through `module.resolve()` and
`module.container.resolve()`. Module implementation code and middleware
registered on the active core module instance are trusted; deliberately
leaking or reflectively extracting the internal container is outside this
contract.

---

## 7\. Future Considerations (Non-Normative)

The following features are explicitly **excluded** from this version of the specification but reserved for future study:

- **Namespace Imports** (`import * as NS`): Currently handled via manual aliasing.
- **Export All** (`export *`): Excluded to enforce explicit API boundaries.
- **Default Exports**: Excluded as `ServiceIdentifier` based systems do not inherently support a "default" semantics.

---

## Appendix A: Error Reference

| Code                          | Message Template                                                                                    |
| :---------------------------- | :-------------------------------------------------------------------------------------------------- |
| `E_DUPLICATE_DECLARATION`     | `E_DUPLICATE_DECLARATION: Duplicate declaration of service identifier "{0}" in module "{1}".`                                |
| `E_INVALID_REGISTRATION`      | `E_INVALID_REGISTRATION: Invalid registration options for service identifier "{0}" in module "{1}": must specify useClass, useFactory, useValue, or useAlias.` |
| `E_DUPLICATE_IMPORT_MODULE`   | `E_DUPLICATE_IMPORT_MODULE: Duplicate import module: "{0}" in "{1}".`                                                          |
| `E_CIRCULAR_DEPENDENCY`       | `E_CIRCULAR_DEPENDENCY: Circular dependency detected: {0} -> ... -> {0}.`                                                  |
| `E_IMPORT_COLLISION`          | `E_IMPORT_COLLISION: Service identifier "{0}" is exported by multiple imported modules: {1}.`                           |
| `E_IMPORT_CONFLICT_LOCAL`     | `E_IMPORT_CONFLICT_LOCAL: Imported service identifier "{0}" conflicts with local declaration in module "{1}".`               |
| `E_ALIAS_SOURCE_NOT_EXPORTED` | `E_ALIAS_SOURCE_NOT_EXPORTED: Cannot alias service identifier "{0}" from module "{1}": it is not exported from that module.`                                         |
| `E_DUPLICATE_ALIAS_MAP`       | `E_DUPLICATE_ALIAS_MAP: Duplicate alias mapping for service identifier "{0}" in module "{1}".`                                     |
| `E_EXPORT_NOT_FOUND`          | The requested export is unavailable during validation, or a caller resolves a declaration outside the module's public exports. |
| `E_DUPLICATE_EXPORT`          | `E_DUPLICATE_EXPORT: Duplicate export of service identifier "{0}" in module "{1}".`                                         |
