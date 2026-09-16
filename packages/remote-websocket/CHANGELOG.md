# Changelog

## Unreleased

- Migrate browser and Node WebSocket Adapters to the public Remote transport seam.
- Keep implementation and native lifecycle capabilities behind module boundaries;
  consume official `ws` typings instead of a local declaration shim.
- Bound native admission, own outgoing byte snapshots, preserve inbound ordering
  across Blob conversion and close, and clean up cancellation/error races.
- Reject excess upgrades before RPC handoff while preserving healthy listeners.
- Include normative specifications, shared conformance, native boundary tests,
  installed ESM/CJS consumers, and a browser-safe package surface.
