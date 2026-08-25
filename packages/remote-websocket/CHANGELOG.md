# Changelog

## 1.0.0

- Add stable browser and Node WebSocket Transport Adapter entry points.
- Enforce finite message, queue, connection, and native `ws` payload limits.
- Add shared Adapter conformance and platform-specific framing/security evidence.
- Detect browser offline state before and during Connector connections.
- Publish the normative specification and secure-deployment guidance.
- Require `ws` 8.21 or newer for the upstream memory-disclosure and
  memory-exhaustion fixes.
