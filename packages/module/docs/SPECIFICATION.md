# Dependency Injection Module Specification

**Version:** 1.0.0
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
2. **Local Conflict Check**: The target identifier $t$ **MUST NOT** collide with any identifier defined in the `declarations` of $M_{target}$.
   - _Error:_ `E_ALIAS_CONFLICT_LOCAL`
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

---

## 6\. Implementation Guidelines

### 6.1 Validation Sequence

To ensure data integrity, the validation logic should be executed in the following order:

1. **Declaration Validation**: Validate internal consistency of `declarations`.
2. **Import Validation**: Validate `imports` recursively (checking circular dependencies and collisions).
3. **Export Validation**: Validate `exports` against the resolved set of available declarations and imports.

### 6.2 Container Composition (The `build` Algorithm)

When constructing the Dependency Injection Container for a module:

1. **Register Locals**: Register all items from `declarations`.
2. **Process Imports**:
   - Normalize all imports into a standard format.
   - For un-aliased imports: Bridge the parent container or merge definitions.
   - For aliased imports: Register a `useAlias` provider pointing to the source container's service.
3. **Apply Export Guard**: Wrap the container with a middleware/proxy that **BLOCKS** resolution of any service identifier NOT present in the `exports` list when accessed from an external scope.

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
| `E_DUPLICATE_DECLARATION`     | `Duplicate declaration of service identifier "{0}" in module "{1}".`                                |
| `E_INVALID_REGISTRATION`      | `Invalid registration options for "{0}". Must specify useClass, useFactory, useValue, or useAlias.` |
| `E_DUPLICATE_IMPORT_MODULE`   | `Duplicate import module: "{0}" in "{1}".`                                                          |
| `E_CIRCULAR_DEPENDENCY`       | `Circular dependency detected: {0} -> ... -> {0}.`                                                  |
| `E_IMPORT_COLLISION`          | `Service identifier "{0}" is exported by multiple imported modules: {1}.`                           |
| `E_ALIAS_SOURCE_NOT_EXPORTED` | `Cannot alias "{0}" from module "{1}": it is not exported.`                                         |
| `E_ALIAS_CONFLICT_LOCAL`      | `Alias "{0}" conflicts with local declaration in module "{1}".`                                     |
| `E_EXPORT_NOT_FOUND`          | `Cannot export "{0}" from "{1}": not declared or imported.`                                         |
