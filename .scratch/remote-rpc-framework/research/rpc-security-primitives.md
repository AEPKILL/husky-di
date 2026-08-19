# RPC security primitives and trust boundary

## Scope

- Default wire profile: `husky-di-rpc/1`.
- Runtime targets: browser and Node.js.
- Question: which existing standards can establish the protected Transport precondition and a
  bounded Session Recovery proof without inventing cryptography.
- Local implementation precedent: VS Code checkout at
  `/Users/aepkill/repos/vscode`, revision
  `f489b728ba96a9a31351e25658adf0e2b6325f3a`.

## Primary sources

### Protected Transport remains the fresh trust root

[RFC 8446](https://www.rfc-editor.org/info/rfc8446/) defines TLS 1.3 as a secure channel with
server authentication, confidentiality and integrity against an active network attacker. Client
authentication is optional, which is the same boundary required here: the RPC initiator must know
the responder endpoint, while a fresh RPC Session does not by itself identify a business user.

TLS does not decide how an application interprets certificates or starts TLS. That supports keeping
certificate/PSK configuration in a concrete Adapter/deployment rather than adding an unverifiable
`isSecure` property to `IRpcConnection`.

VS Code likewise authenticates and signs a fresh per-attempt challenge before selecting retained
state by reconnection token. Source locations and the distinction between implementation fact and
design inference are captured in
[`vscode-rpc-ipc-precedents.md`](vscode-rpc-ipc-precedents.md).

### Recovery proof uses standard HMAC and HKDF

[RFC 2104](https://www.rfc-editor.org/info/rfc2104/) defines HMAC as keyed message authentication
for parties sharing a secret and stresses random keys plus a secure key-exchange mechanism.
[RFC 5869](https://www.rfc-editor.org/info/rfc5869/) defines HKDF as an HMAC-based extract-and-expand
KDF for deriving strong keys from initial key material.

**Adopt:** deliver one random Session secret only inside the protected fresh accept, derive a
domain-separated proof key with HKDF-SHA-256, and use HMAC-SHA-256 to bind resume role, profile,
Session identity, cursor, monotonically increasing attempt and exact accept/reject transcript.

**Do not infer:** a symmetric proof key is not asymmetric endpoint identity. Anyone who compromises
the proof key has full Session continuity authority until that incarnation terminates.

### Cryptographic JSON input needs one invariant representation

[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html) defines the JSON Canonicalization Scheme
(JCS): no whitespace, ECMAScript-compatible primitive serialization, recursive property sorting by
UTF-16 code units, no duplicate names, no lone surrogates and no Unicode normalization.

**Adopt:** use JCS only for bounded handshake proof input. The transmitted JSON record remains free
to use semantically equivalent whitespace, member order and escape spelling. Every unknown tail
member is included in the canonical proof; only the exact top-level `proof` member is omitted.

The existing RPC value profile is stricter than the required I-JSON subset: it already rejects
duplicate names, non-finite numbers, negative zero and invalid Unicode before proof verification.

### Security carriers have one canonical spelling

[RFC 4648](https://www.rfc-editor.org/rfc/rfc4648.html) defines the URL-safe Base64 alphabet and
explains why unused pad bits and padding rules matter for canonical encodings.

**Adopt:** every 32-byte nonce, secret and proof uses one unpadded base64url spelling. Decode must
reject padding, wrong length/alphabet and non-zero unused bits instead of accepting multiple strings
for the same security value.

### Browser and Node share the required crypto surface

[Web Cryptography Level 2](https://www.w3.org/TR/WebCryptoAPI/) specifies HMAC, SHA and HKDF
operations. Current Node.js exposes the same Web Crypto algorithms through its
[Web Crypto API](https://nodejs.org/api/webcrypto.html).

**Adopt:** use `crypto.getRandomValues`, non-extractable keys, HKDF-SHA-256, HMAC-SHA-256 and
`subtle.verify`. These operations are asynchronous, but Recovery proof lives in the already-async,
bounded bootstrap phase; the default design deliberately does not put a second HMAC on every active
call record.

## Resulting constraints

1. Secure Recovery is conditional on a protected fresh/replacement Transport; plaintext functional
   conformance is not a security claim.
2. `sessionId` is high-entropy routing state, never authority by itself.
3. A Session proof key authenticates continuity, not a business principal.
4. A monotonically increasing initiator-owned resume attempt prevents replay without an unbounded
   nonce cache and still works after a lost accept.
5. Active ACK integrity comes from the exact protected Connection that a proof-valid Handshake binds;
   Default v1 does not duplicate Transport integrity with per-record HMAC.
6. Canonicalization is confined to small bounded proof records, and algorithms are fixed by the
   profile rather than negotiated ad hoc.
