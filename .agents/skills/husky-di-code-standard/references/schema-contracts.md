# Schema Contracts

## Ownership And Placement

Resolve role paths using [Placement](../SKILL.md#placement).

A type-owned schema defines, validates, or normalizes the data contract of its
`.type.ts` module, including input and output forms. Auxiliary schemas specific
to that contract may stay alongside it. This also applies to generic contracts
whose runtime validation covers only part of their static constraints.

An independent schema uses `schemas/<domain>/<name>.schema.ts` in role-first
areas, or `modules/<module>/schemas/<name>.schema.ts` in module-first areas.
Omit the domain directory in role-first areas when no subsystem grouping is
needed. Types derived from the schema may stay alongside it.

For example, descriptor options and method-allowlist schemas belong with
descriptor types, while common wire-identifier grammar owns an independent
validation responsibility. Sharing a business area alone does not establish
common contract ownership.

Line count, export visibility, consumer count, and the presence of `z.input` /
`z.output` do not determine ownership. The checker enforces directory, suffix,
naming, and declaration rules; code review judges contract ownership.

## Allowed Declarations

Both `.type.ts` and `.schema.ts` files allow type aliases, interfaces, type-only
exports, and schema constants. Schema values use `const` names ending in
`Schema`, and their initializer's static type must be a Zod schema. Named runtime
re-exports are allowed only when both the source and exported names end in
`Schema` and the exported value has a Zod schema type.

Refinement and transform callbacks inside schema expressions may implement
validation and normalization. Keep standalone parsing wrappers, factories,
classes, and other runtime declarations with their owning runtime role.
