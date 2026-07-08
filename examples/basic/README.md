# Basic Example

This example shows the smallest practical `@husky-di/core` setup with:

- `createContainer()`
- `createServiceIdentifier()`
- `resolve()` inside container-created classes
- `useValue`, `useClass`, and `useAlias`
- `LifecycleEnum.singleton`

## Run

```bash
pnpm --filter @husky-di/example-basic start
```

The `start` script builds `@husky-di/core` first, then runs `src/main.ts` with `tsx`.
