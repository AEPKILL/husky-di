# @husky-di/remote

Typed, transport-independent unary RPC for Husky DI. The package provides stable
Connector and Acceptor topology owners, bidirectional calls, bounded recovery,
explicit graceful shutdown, and a replaceable semantic Protocol interface.

The built-in `husky-di-rpc/1` Protocol is selected when `protocol` is omitted.
Physical I/O is supplied separately through a Transport Adapter such as
`@husky-di/remote-websocket`.

## Install

```bash
pnpm add @husky-di/core @husky-di/remote rxjs
```

## Define and call a remote service

```ts
import { createServiceIdentifier } from "@husky-di/core";
import {
  createRemoteServiceDescriptor,
  createRpcConnector,
} from "@husky-di/remote";

interface Calculator {
  add(left: number, right: number): number;
}

const ICalculator = createServiceIdentifier<Calculator>("ICalculator");
const calculator = createRemoteServiceDescriptor(ICalculator, {
  wireName: "example.calculator.v1",
  methods: { add: true },
});

const connector = createRpcConnector();
const remote = connector.peer.resolve(calculator);

// Supply a role-compatible Adapter before making calls.
await connector.connect(adapter);
console.log(await remote.add(20, 22));

await connector.shutdown(); // drains admitted work, then closes
// connector.close() skips the grace phase and forces convergence.
```

`IRpcPeer.expose()` registers reverse-call handlers. Acceptor owners additionally
offer current membership, topology-wide exposure, and `resolveAll()` fan-out.
Public Observables are hot read-only observations; subscribing never owns or
starts network resources.

## Public entry points

- `@husky-di/remote` — caller API and caller-required structural types.
- `@husky-di/remote/protocol` — third-party Protocol implementor SPI.
- `@husky-di/remote/transport` — Physical Connection and Adapter seams.
- `@husky-di/remote/conformance` — Protocol and Adapter conformance runners.
- `@husky-di/remote/wire/husky-di-rpc-1/*` — closed normative wire assets.

See [the Protocol guide](docs/PROTOCOL.md), [the Transport guide](docs/TRANSPORT.md),
and the [normative specification](docs/SPECIFICATION.md).

## Security

The built-in Protocol authenticates fresh and recovery transcripts. Active records
derive their authority from the protected current binding, so the Transport must
provide confidential, integrity-protected, authenticated connections to the
intended endpoint. Do not deploy it over an untrusted plaintext channel.

## License

MIT
