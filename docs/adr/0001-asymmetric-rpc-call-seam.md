---
status: accepted
---

# Use atomic outgoing preparation and scoped incoming reservation

The public RPC Protocol seam deliberately uses asymmetric call admission. Outgoing `prepareInvocation()` atomically creates only Pending Invocation capacity because the Framework has no fallible or asynchronous work between reservation and preparation; `start()` remains the sole Call Identity and send gate. The Framework gates a synchronous preparation-time `finish` until the control is validated and `call-started` is published, while pre-start `cancel()` synchronously selects `failed` / `canceled` and makes `start()` inert. Incoming admission instead lends a flattened tagged reservation only inside one synchronous `reserveIncomingCall()` callback, because the Protocol must durably record its semantic disposition before `commit()` may publish Framework work. The callback must commit exactly once and return `undefined`; the Framework revokes the capability on return and terminalizes committed work before faulting any post-commit violation. This preserves the two real ordering boundaries without exporting matching but fictitious reserve/commit/release ceremonies.
