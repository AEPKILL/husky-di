<p align="center">
  <img src="./docs/assets/logo.svg" alt="Husky DI logo" width="160" />
</p>

# Husky DI

`husky-di` is a modern TypeScript dependency injection framework.
It focuses on type safety, predictable runtime behavior, and clear package boundaries.

## Packages

- `@husky-di/core`: DI container, registrations, resolution, lifecycles, middleware, refs, and disposal
  [packages/core/README.md](./packages/core/README.md)
- `@husky-di/decorator`: constructor injection with TypeScript experimental decorators and `reflect-metadata`
  [packages/decorator/README.md](./packages/decorator/README.md)
- `@husky-di/module`: ESM-like module boundaries, imports, exports, aliases, and validation
  [packages/module/README.md](./packages/module/README.md)
- `@husky-di/remote`: descriptor-driven bidirectional RPC and connection recovery
  [packages/remote/README.md](./packages/remote/README.md)
- `@husky-di/remote-websocket`: browser and Node WebSocket Transport Adapters
  [packages/remote-websocket/README.md](./packages/remote-websocket/README.md)

Run the [Remote WebSocket example](./examples/remote-websocket/README.md) with
`pnpm --filter @husky-di/example-remote-websocket start` to explore browser ↔ Node
calls, connection recovery, and RPC lifecycle observations.

## License

MIT
