# Code Standard Checker Specification

**Status:** Normative for schema files and module-first source placement.

This specification covers schema files and module-first source placement in the
repository checker.
The agent-facing placement and modeling guidance remains in
[husky-di-code-standard](../../.agents/skills/husky-di-code-standard/SKILL.md).
Matching behavioral evidence is in `tests/specification.test.ts`, included in
`test:code-standard` alongside the existing checker regression suite.

Contract ownership and the choice between colocation and an independent schema
module are code-review decisions under the linked skill. The checker enforces
the placement, naming, and declaration rules below; it does not infer ownership.

## SCHEMA-001: Placement and scope

The default role-first source configuration MUST recognize `schemas/` and
include its TypeScript files in normal validation. Files in this role, including
domain subdirectories, MUST use `.schema.ts`. Other roles retain their existing
suffix rules. Violations MUST report `placement/source-directory-suffix`.

## SCHEMA-002: Schema declarations

Schema files MUST participate in the existing header, import, and export checks.
They MAY contain type aliases, interfaces, imports, type-only exports, and
canonical Zod schema constants. Runtime declarations MUST be `const`, have names
ending in `Schema`, and have initializers statically assignable to the resolved
Zod schema type. `any`, `unknown`, and `never` initializer types do not constitute
schema evidence. This verification MUST work in a workspace containing only
schema files, without requiring a colocated `.type.ts` file.

Named runtime re-exports MUST resolve to a Zod schema, with both original and
exported names ending in `Schema`. Other runtime values, wildcard runtime
re-exports, functions, classes, and enums MUST be rejected using
`schema-file/exports-only`; the diagnostic MUST identify `.schema.ts`.

## SCHEMA-003: Existing type files

Adding schema files MUST preserve the existing `.type.ts` declaration rules,
including schema colocation and the `type-file/exports-only` diagnostic ID.

## PLACEMENT-001: Module-first source roots

The checker MUST support `module/role` directories in configured
`moduleSourceRoots`, which default to `packages/remote/src/modules`. It MUST collect
TypeScript files below these roots and apply the role's existing suffix and
declaration rules. Unknown roles MUST report `placement/source-directory`.
Source-root entrypoints and existing role-first placement MUST remain supported.
Other source roots MUST retain their existing collection and placement rules.
