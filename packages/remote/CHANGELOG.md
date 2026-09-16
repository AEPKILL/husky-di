# Changelog

## 1.0.0

### Major Changes

- [`4b96648`](https://github.com/AEPKILL/husky-di/commit/4b9664833a759893188775c0298720c4556b3d17) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Publish the first stable transport-independent RPC package with the caller API,
  Protocol and Transport seams, built-in authenticated recovery Protocol,
  immutable Protocol provider factory, conformance runners, normative
  specification, public string enums, and wire corpus.

  Expose atomic outgoing `prepareInvocation()` and a synchronous scoped incoming
  reservation callback. This keeps `start()` as the outgoing identity/send gate,
  requires the Protocol to durably record incoming disposition before commit, and
  removes the redundant public sink and reserve/commit/release phase types.
  Pre-start cancellation synchronously finishes exactly once as `canceled`; a
  synchronous preparation outcome becomes caller-visible only after the returned
  control is validated and `call-started` is published.

  Change the Connector startup API from `connect(adapter)` to the extensible
  `connect({ adapter, signal? })` options record. The optional signal cancels only
  an unsettled connection attempt.

  Add the opt-in `createRpcReconnectionConnector()` supervisor, which creates its
  own cold Connector from the supplied Connector options, with a fresh Adapter
  Factory, finite configurable retry delays and attempt timeout,
  replay-latest orchestration state, payload-free attempt telemetry, and explicit
  asynchronous stop ownership.

## Unreleased

- Adopt specification 2.0.0 with breaking API changes: replace Descriptor `methods`
  with explicit `members` kinds; replace `callInterceptor`/`RpcCallInterceptor` with
  `interceptor`/`RpcInterceptor`. Legacy names are rejected.
- Add RxJS Observable methods and readonly static Observable members. Every
  subscription has independent cancellation and terminal state; captured static
  sources connect lazily and share by instance within a Peer.
- Use Observable continuations for interception of unary calls and streams. Unary
  results allow zero or one emission; stream operators retain multiple emissions.
- Introduce `husky-di-rpc/2` for streams and retain `husky-di-rpc/1` unary fallback.
  Unsupported stream subscriptions fail with `unavailable` before wire admission.
- Retain open streams and ordered items across Recovery under existing finite
  budgets; never automatically resubscribe across a new Session Incarnation.
- Add payload-free stream opening/terminal observations and extend browser and
  packed-consumer acceptance to Observable members.
