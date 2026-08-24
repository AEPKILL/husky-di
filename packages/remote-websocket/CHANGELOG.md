# Changelog

## 1.0.0

### Major Changes

- 9d1821f: Publish the first stable browser and Node WebSocket Transport Adapters with
  finite native limits, shared conformance evidence, and secure-deployment
  documentation.

### Patch Changes

- Updated dependencies [9d1821f]
  - @husky-di/remote@1.0.0

- Add stable browser and Node WebSocket Transport Adapter entry points.
- Enforce finite message, queue, connection, and native `ws` payload limits.
- Add shared Adapter conformance and platform-specific framing/security evidence.
- Detect browser offline state before and during Connector connections.
- Publish the normative specification and secure-deployment guidance.
- Require `ws` 8.21 or newer for the upstream memory-disclosure and
  memory-exhaustion fixes.
