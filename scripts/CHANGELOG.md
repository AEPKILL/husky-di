# @husky-di/scripts

## 1.2.2

### Patch Changes

- [`efc48b7`](https://github.com/AEPKILL/husky-di/commit/efc48b702f3ebf202daaa5b781bce8cebc72756c) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Stabilize source file naming conventions across all packages:

  - **`.impl.ts` suffix for implementations**: `src/impls/*Impl.ts` → `src/impls/*.impl.ts` (e.g. `ContainerImpl.ts` → `container.impl.ts`). Code standard validator now enforces `.impl.ts` via suffix config instead of special-cased PascalCase logic.

  - **`.util.ts` suffix for utilities**: `src/utils/*.utils.ts` → `src/utils/*.util.ts` (e.g. `container.utils.ts` → `container.util.ts`). Validator config updated accordingly. The `test.utils.ts` exception for test directories is preserved.

  - **`husky-di-code-standard` skill**: Updated naming reference table and local examples to reflect both new suffixes.

  - **New `use-husky-di` skill**: Adds a dedicated skill with reference docs for `core`, `module`, `decorator`, and project structure, enabling agents to work effectively with husky-di APIs.

  - **Documentation**: Expanded `SPECIFICATION.md` for `core` and `module` packages.
