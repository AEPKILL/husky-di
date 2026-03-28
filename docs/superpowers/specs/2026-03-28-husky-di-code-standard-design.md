# husky-di-code-standard Design

## Overview

This document defines the design for the repository-private `husky-di-code-standard` skill.

The goal is not to invent a new style guide. The goal is to extract the current dominant writing habits from the `husky-di` codebase and turn them into a default rule set for future LLM-generated code, so new code continues to look like it was written by the same human author.

This design intentionally covers more than formatting. It also defines naming, placement, export boundaries, file shape, comment style, testing style, and the decision process an LLM should follow before introducing new code.

## Goals

- Make LLM-generated code look consistent with the author’s current dominant style in this repository.
- Make the rule set the default expectation for all code changes in this repository.
- Keep the repository entrypoint lightweight.
- Keep the real rule source in one place.
- Encode judgment rules that cannot be reliably enforced by Biome alone.

## Non-Goals

- This design does not try to retroactively normalize all historical files.
- This design does not replace Biome or package-level tooling.
- This design does not define product requirements or feature behavior.
- This design does not attempt to fully automate style enforcement.
- This design does not force new problems into old patterns when the old patterns are clearly a bad fit.

## Repository Evidence

The design is based on recurring patterns already present in the codebase:

- Source is organized by semantic directories such as `interfaces`, `types`, `impls`, `utils`, `factories`, `constants`, `decorators`, `middlewares`, and `shared`.
- File naming follows stable suffixes such as `*.interface.ts`, `*.type.ts`, `*.enum.ts`, `*.factory.ts`, `*.utils.ts`, and `*.const.ts`.
- Public package APIs are centralized in `src/index.ts`.
- Code strongly prefers named exports over default exports.
- Types are explicit. The repository recently enabled Biome’s `nursery/useExplicitType`.
- `import type` is used consistently.
- Classes, interfaces, utility functions, and factory functions follow recognizable naming patterns.
- Source files frequently include file header comment blocks with `@overview`, `@author`, and `@created`.
- Code comments are used for design intent, constraints, and edge cases, not to narrate obvious statements.
- `biome-ignore` is used sparingly and usually includes a reason.
- Tests follow behavioral naming and frequently use `Arrange / Act / Assert`.

## Design Summary

The final solution should use a two-layer structure:

1. A minimal root `AGENTS.md` as repository directory and enforcement entrypoint.
2. A single repository-private skill at `.agents/skills/husky-di-code-standard/SKILL.md` as the only full rule source.

This keeps the repository entrypoint lightweight while still making the rule set the default expectation.

## Layer Responsibilities

### Root `AGENTS.md`

`AGENTS.md` should be intentionally small and directory-like. It should not duplicate the full standard.

Its responsibilities are:

- State that any code modification in this repository must use `husky-di-code-standard`.
- Define code modification broadly enough to include new files, edits, refactors, tests, file moves, export changes, naming changes, and structural changes.
- Point to `.agents/skills/husky-di-code-standard/SKILL.md` as the only full standard.

It should not contain the detailed rules themselves.

### `.agents/skills/husky-di-code-standard/SKILL.md`

This file is the single source of truth for the actual standard.

It should define:

- when the skill applies
- what an LLM must inspect before changing code
- how to decide file placement
- how to decide file naming
- how to decide symbol naming
- import and export rules
- file structure rules
- implementation style rules
- type modeling rules
- comment and error message rules
- testing style rules
- final self-check rules
- what to do when the existing repository patterns do not cleanly cover a new case
- a compact checklist for fast execution
- common mistakes and repository-local examples

## Core Principle

The core principle of the standard is:

> Prefer the author’s current dominant repository habits over generic AI defaults.

This principle has several consequences:

- Do not invent new patterns when an existing repository pattern already fits.
- Do not introduce abstractions merely because they seem more general.
- Do not write code in a generic “best practices” voice when the repository already has a recognizable local style.
- Do not force a new problem into an old repository pattern if that would distort the existing structure.

## Rule Priority

When multiple constraints apply, the rule priority should be:

1. Syntax and tool constraints.
2. Explicit rules in `husky-di-code-standard`.
3. The nearest stable repository pattern.
4. The LLM’s own general preferences.

This prevents the model from overriding local style with generic defaults.

## New Pattern Policy

The standard should not freeze the repository into permanent repetition.

The intended rule is:

- Reuse existing repository patterns by default.
- If the current repository patterns do not naturally fit the new problem, or reusing them would damage the existing structure, stop and ask before introducing a new pattern.
- Do not silently expand the repository’s naming or placement system on your own.

This keeps the codebase consistent without forcing bad fits.

## Skill Structure

The `husky-di-code-standard` skill should be organized into the following sections.

### 1. Overview

Explain that this is a repository-private code standard derived from the existing `husky-di` codebase, not a generic TypeScript style guide.

### 2. When to Use

The skill should apply to any code modification, including:

- adding files
- editing files
- refactoring
- changing exports
- changing naming
- moving files
- adding or modifying tests
- adding or modifying repository scripts or supported config files

### 3. Scope and Exclusions

Define what is covered and what is excluded.

Covered:

- package source files
- tests
- repository scripts
- supported config files
- documentation code snippets when they are authored or updated as part of code work

Excluded:

- generated artifacts
- lock files
- third-party vendored output
- files that cannot meaningfully carry the relevant style rules

### 4. Pre-Write Check

Before writing code, the model should:

- inspect neighboring files
- inspect the nearest equivalent implementation
- inspect the package entrypoint when public API may be affected
- inspect local naming suffixes and directory semantics
- inspect nearby tests when modifying behavior

The skill should explicitly forbid improvising structure before checking local examples.

### 5. Placement Rules

The skill should define the semantic meaning of key directories.

Expected directory semantics:

- `interfaces`: contracts and structural interfaces
- `types`: aliases, utility types, unions, derived type helpers
- `impls`: concrete implementations
- `utils`: mostly stateless helpers
- `factories`: creation-oriented functions that assemble or return structured objects
- `constants`: shared constants
- `decorators`: decorator functions
- `middlewares`: middleware implementations
- `shared`: intentionally shared state, refs, or shared instances

The skill should require fitting new code into the existing directory semantics unless the user approves a new pattern.

### 6. File Naming

The skill should encode the repository’s file suffix conventions, including patterns such as:

- `*.interface.ts`
- `*.type.ts`
- `*.enum.ts`
- `*.factory.ts`
- `*.utils.ts`
- `*.const.ts`

The standard should prefer these existing suffixes over newly invented alternatives.

### 7. Symbol Naming

The skill should explicitly define naming rules for symbols, including:

- classes use `PascalCase`
- interfaces use `I` prefixes such as `IContainer`
- type aliases use `PascalCase`
- enums use `PascalCaseEnum`
- factory functions use `createXxx`
- utility functions use clear verb-led names such as `getXxx`, `setXxx`, `resetXxx`, or `createXxx`
- service identifiers follow the repository’s interface-like naming pattern such as `IServiceA`
- private fields use a leading underscore such as `_name`
- internal escape-hatch names may use the existing `_internalXxx` pattern
- generic parameters should stay short and conventional unless a longer name materially improves clarity
- local variable and parameter names should prefer repository vocabulary over abstract placeholder names

### 8. Import and Export Rules

The skill should define:

- use `import type` wherever appropriate
- prefer package aliases and existing import conventions over ad hoc relative paths
- use named exports by default
- avoid default exports
- expose public package APIs through `src/index.ts`
- avoid leaking internal implementation files as public surface area unless intentionally approved

### 9. File Shape and Member Order

The skill should describe the expected shape of files and classes, including:

- file header comment block placement
- import grouping and ordering as already normalized by the repository
- placement of local types before or near the code they support
- consistent class member ordering
- predictable grouping of public API, private state, constructor, public methods, and internal helpers

The skill should prefer stable, readable ordering over clever compression.

### 10. File Header Comment Rule

This must be a hard rule.

The standard should require that any source, test, script, or config file that safely supports comments should include a file header comment block.

The default metadata should preserve the repository’s current style:

- `@overview`
- `@author`
- `@created`

The header should match the file’s responsibility. Short aggregator files may use shorter headers, but they should still preserve the repository’s metadata style.

The created timestamp format should remain consistent with the repository’s current convention.

Files that do not support comments, such as `json`, are naturally excluded.

### 11. Implementation Style

The skill should encode the repository’s broader coding style, including:

- prefer direct and readable implementation over speculative abstraction
- favor explicit types
- use `readonly` and immutability-oriented design where appropriate
- keep helpers, factories, and implementations in the roles already established by the repository
- keep comments focused on intent, constraints, and edge cases
- do not add “AI explainer” comments for obvious lines

### 12. Type Modeling Rules

The skill should clarify when to use:

- `interface`
- `type`
- `class`
- `enum`

It should also reflect the repository’s strong preference for explicit typing and type-safe public APIs.

### 13. Error Messages and Exceptions

The skill should include a rule for human-readable errors:

- errors should clearly identify what failed
- errors should include useful context
- errors should avoid vague wording
- error messages should sound consistent with current repository usage
- comments and error messages should stay linguistically consistent within the local file or package context

### 14. `biome-ignore` Policy

The skill should make this restrictive and explicit:

- prefer the narrowest possible ignore scope
- only ignore rules for a real repository-specific reason
- always explain why the ignore exists
- placeholder explanations are not acceptable

### 15. Test Style

The skill should treat tests as part of the repository style, not as an afterthought.

It should cover:

- behavioral test names
- clear `describe` organization
- local consistency with `Arrange / Act / Assert`
- helper placement
- keeping tests stylistically aligned with the package they exercise

### 16. Final Check

Before considering code complete, the skill should require a final check for:

- correct file placement
- correct file naming
- correct symbol naming
- correct exports
- correct comment/header usage
- absence of unnecessary abstraction
- local consistency with surrounding files

### 17. Quick Checklist

The skill should include a short checklist that an LLM can quickly apply while working.

The checklist should be optimized for execution, not explanation, and should cover:

- checked neighboring files first
- chose the correct directory
- used an existing file suffix pattern
- matched symbol naming
- matched import and export style
- included the correct header comment
- avoided unnecessary abstraction
- updated public exports and tests when needed

### 18. Common Mistakes

The skill should call out repository-specific failure modes, such as:

- inventing a new suffix when an existing one already fits
- using a default export
- placing implementation logic in `utils`
- adding commentary that explains obvious lines
- using `biome-ignore` without a real reason
- skipping entrypoint export updates when a public API changes

### 19. Examples

The skill should prefer concrete examples taken from repository patterns over generic examples.

Examples should demonstrate:

- good file placement
- good naming
- good header comments
- good import and export shape
- acceptable and unacceptable uses of `biome-ignore`

## Skill Description Guidance

The frontmatter description for `husky-di-code-standard` should focus on when to use it, not summarize the workflow.

A suitable description direction is:

> Use when modifying code in the husky-di repository and the change must follow the repository’s established naming, placement, structure, and comment conventions.

The final wording should stay concise and optimized for discovery.

## Success Criteria

This design is successful if:

- the repository has a lightweight enforcement entrypoint
- the full standard lives in one skill file
- the skill teaches judgment, not just formatting
- future LLM-generated code looks locally consistent with existing `husky-di` code
- the skill leaves room to ask before introducing truly new patterns

## Risks

### Over-Specification

If the skill becomes too rigid, it may encourage awkward code that mimics the repository mechanically instead of naturally.

Mitigation:

- prefer principles plus concrete local examples
- allow clarification before introducing new patterns
- avoid turning every preference into a prohibition

### Under-Specification

If the skill stays too high-level, it will not prevent generic AI code.

Mitigation:

- include concrete naming, placement, and comment rules
- include a final checklist
- encode the repository’s strongest recurring patterns explicitly

### Duplicate Source of Truth

If `AGENTS.md` grows into a second rule source, the system will drift.

Mitigation:

- keep `AGENTS.md` short
- keep the detailed rules only in `husky-di-code-standard`

## Implementation Note

This document only designs the structure and scope of the future standard. It does not yet author the final `AGENTS.md` or `husky-di-code-standard` skill itself.
