# Changelog

## 1.0.0

### Major Changes

- [`4b96648`](https://github.com/AEPKILL/husky-di/commit/4b9664833a759893188775c0298720c4556b3d17) Thanks [@AEPKILL](https://github.com/AEPKILL)! - Publish the first stable browser and Node WebSocket Transport Adapters with
  finite native limits, shared conformance evidence, and secure-deployment
  documentation.

### Patch Changes

- Updated dependencies [[`4b96648`](https://github.com/AEPKILL/husky-di/commit/4b9664833a759893188775c0298720c4556b3d17)]:
  - @husky-di/remote@1.0.0

## Unreleased

- Migrate browser and Node WebSocket Adapters to the public Remote transport seam.
- Keep implementation and native lifecycle capabilities behind module boundaries;
  consume official `ws` typings instead of a local declaration shim.
- Bound native admission, own outgoing byte snapshots, preserve inbound ordering
  across Blob conversion and close, and clean up cancellation/error races.
- Reject excess upgrades before RPC handoff while preserving healthy listeners.
- Include normative specifications, shared conformance, native boundary tests,
  installed ESM/CJS consumers, and a browser-safe package surface.
