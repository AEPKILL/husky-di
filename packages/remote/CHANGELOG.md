# Changelog

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
