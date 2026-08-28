# ADR-0005: Own RPC Binding Transactions in Role-Specific Managers

## Status

Accepted

## Context

The built-in RPC Protocol must coordinate bootstrap decoding, Topology Owner
admission, Session construction and retention, Physical Connection ownership,
Binding Linearization, reply Local Admission, Binding Activation, deadlines,
abort, and late terminal races. The former `RpcBindingAttempt` object combined
these concerns while allowing Protocol choreography to manipulate transaction
authority directly. That made the most race-sensitive boundary broad and made
Connector and Acceptor behavior easier to drift apart.

The roles nevertheless have different durable ownership. A Connector retains
at most one Session, while an Acceptor owns a Session map, fresh-capacity
reservations, reclamation, and per-Session lifecycle. Protocol programs, by
contrast, own the Codec, role-specific topology calls, Session construction,
and interpretation of bootstrap records.

## Decision

Replace the binding-attempt object with private role-specific binding managers:
`IRpcConnectorBindings` and `IRpcAcceptorBindings`.

Each manager owns its role's retained Session slot or map, fresh-resource
capacity, and lifecycle. A Protocol program owns Codec work, `attachSession()`
or `admitSession()`, Session construction, and preparation of a binding
candidate. Programs return only opaque, exact-attempt-bound, one-shot decisions
and typed terminal intents. Raw Endpoints, Binding Epochs, resource leases, and
arbitrary terminal callbacks do not cross the program boundary.

One file-local transaction executor shared by both managers owns the Endpoint,
deadline and abort gates, decision validation, Binding Linearization, immediate
Session retention, optional reply Local Admission, Binding Activation, and all
late races. The executor linearizes and retains an exact binding before awaiting
reply admission, but does not permit active Session work or fulfill `bind()` or
`accept()` until that binding activates. The Connector's bootstrap request must
reach Local Admission before its response can decide the transaction; the
Acceptor decides from the first request and activates only after an `accept`
reply reaches Local Admission. Fresh Acceptor topology admission remains part of
the program's provisional preparation before Binding Linearization.

Failure or cancellation before Binding Linearization remains attempt-scoped.
After Linearization, either outcome fails the exact Physical Connection Binding
without rolling back the Binding Epoch. After Binding Activation, late attempt
outcomes are ignored. Active ingress admitted for a linearized but inactive
binding fails that exact binding and cannot be followed by later activation.

## Considered Options

- Keep `RpcBindingAttempt` and reduce or rename its methods. This leaves the
  caller responsible for the same ordering and authority choreography.
- Introduce a generic request/reply Dialogue abstraction. Bootstrap is not only
  a dialogue: it also owns role-specific Session retention, topology admission,
  fencing, protected resources, and terminal authority, so the generic seam
  would either leak those details or become RPC-specific under another name.
- Use role-specific managers with one shared private executor. This keeps
  durable ownership role-aware while centralizing the exact transaction and is
  the selected option.

## Consequences

- Session ownership, fresh-capacity policy, and lifecycle stay explicit and
  role-specific.
- Both roles share one implementation of the security- and race-sensitive
  transaction ordering without publishing another extension seam.
- Protocol programs cannot retain or reuse transaction authority after their
  synchronous decision point.
- Binding Linearization and Binding Activation remain distinct observable
  protocol transitions, including the responder's reply-admission interval.
- Future binding behavior changes must preserve the opaque-decision boundary
  and update the shared executor rather than reintroducing caller-managed
  endpoint, epoch, or lease choreography.
