/**
 * @overview Single source for RPC profile size, length, count, and runtime policy limits.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

// Platform-owned timer ceiling: 2,147,483,647 ms, also used by Reconnection.
export { RPC_MAX_PLATFORM_TIMER_DELAY_MS } from "@/shared/constants/rpc-timer.const";

// RPC-VALUE-004: byte lengths are UTF-8; compact-JSON weight includes escaping.
// Root depth is one. Primitives, arrays, and objects each count as one node.
export const RPC_MAX_MESSAGE_BYTES = 1_048_576;
export const RPC_MAX_APPLICATION_WEIGHT_BYTES = 1_000_000;
export const RPC_MAX_STRING_BYTES = 512 * 1024;
export const RPC_MIN_IDENTIFIER_BYTES = 1;
export const RPC_MAX_IDENTIFIER_BYTES = 256;
export const RPC_MAX_MEMBER_NAME_BYTES = 256;
export const RPC_MAX_OBJECT_MEMBERS = 1_024;
export const RPC_MAX_ARRAY_ELEMENTS = 8_192;
export const RPC_MAX_APPLICATION_DEPTH = 64;
export const RPC_MAX_APPLICATION_NODES = 65_536;
// An ACK-bearing Error.details record is the largest fixed Application wrapper.
export const RPC_MAX_WIRE_DEPTH = RPC_MAX_APPLICATION_DEPTH + 3;
export const RPC_MAX_WIRE_NODES = RPC_MAX_APPLICATION_NODES + 10;

// RPC-WIRE-* and RPC-SEC-002: non-empty offers, safe counters, Base64Url32.
// Profile offers also obey the common array-element cap above.
export const RPC_MIN_PROFILE_OFFERS = 1;
export const RPC_MAX_COUNTER = Number.MAX_SAFE_INTEGER;
export const RPC_MAX_CALL_ORDINAL_DIGITS = String(RPC_MAX_COUNTER).length; // 16
export const RPC_SECURITY_CARRIER_BYTES = 32;
// Canonical unpadded base64url occupies 43 ASCII characters.
export const RPC_SECURITY_CARRIER_LENGTH = Math.ceil(
	(RPC_SECURITY_CARRIER_BYTES * 4) / 3,
);
// Local bound on attempts to generate a collision-free Session ID.
export const RPC_MAX_SESSION_ID_ATTEMPTS = 8;

// RPC-RESOURCE-001/002/004/005: fixed backlog, entry charges, and reserves.
export const RPC_MAX_INGRESS_RECORDS = 64;
export const RPC_MAX_INGRESS_BYTES = 8 * 1024 * 1024;
export const RPC_ENTRY_OVERHEAD_BYTES = 256;
// Incoming ledger and protected terminal/cancel slots; outgoing invocations use
// maxPendingInvocationsPerSession from the policy below.
export const RPC_MAX_UNRETIRED_CALLS_PER_DIRECTION = 256;
export const RPC_MAX_INCOMING_JOBS = 256;
export const RPC_MAX_TERMINAL_PAYLOADS = 256;
export const RPC_TERMINAL_RESERVE_BYTES = 768;
export const RPC_CANCEL_RESERVE_BYTES = 384;
export const RPC_PROTECTED_SESSION_BYTES = 512 * 1024;
export const RPC_HANDSHAKE_TRANSIENT_BYTES = 4 * 1024 * 1024;
// Protected reserve also covers four coalesced controls at 512 B each and
// 65,536 B of Session ID/token/handshake state (not separately allocated).
// One non-borrowable Acceptor overflow-close slot is represented by one field.

// RPC-POLICY-002/003: Pending/incoming-args/terminal byte caps use
// floor(Session bytes / 4), replay uses floor(Session bytes / 2).
// Replay entries = Pending limit * 4; Connections = Sessions + handshakes * 2.
export const RPC_SESSION_BYTE_SUBCAP_DIVISOR = 4;
export const RPC_REPLAY_BYTE_SUBCAP_DIVISOR = 2;
export const RPC_REPLAY_ENTRIES_PER_PENDING_INVOCATION = 4;
export const RPC_CONNECTIONS_PER_HANDSHAKE = 2;
export const RPC_MIN_RETAINED_BYTES_PER_SESSION =
	RPC_MAX_MESSAGE_BYTES * RPC_SESSION_BYTE_SUBCAP_DIVISOR;
export const RPC_MIN_SILENCE_PROBE_INTERVALS = 3;
// Owner bytes must cover one full Session plus each sibling's protected reserve.
// Owner handlers >= Session handlers; ACK delay <= probe interval;
// binding attempt <= recovery grace; all policy fields are positive safe integers.

// RPC-COUNTER-002: reserve 512 sequences, one terminal and one cancel per call slot.
export const RPC_LAST_ORDINARY_SEQUENCE =
	RPC_MAX_COUNTER - 2 * RPC_MAX_UNRETIRED_CALLS_PER_DIRECTION;

// RPC-POLICY-001: Acceptor overrides all fields; Connector derives Sessions and
// handshakes as one, Owner bytes from Session bytes, and Owner handlers likewise.
// Counts and bytes are named explicitly; all timing values are milliseconds.
export const DEFAULT_RPC_RUNTIME_POLICY = Object.freeze({
	maxSessions: 64,
	maxHandshakes: 16,
	maxPendingInvocationsPerSession: 256,
	maxRetainedBytesPerSession: 32 * 1024 * 1024,
	maxRetainedBytesTotal: 64 * 1024 * 1024,
	maxHandlersPerSession: 16,
	maxHandlersTotal: 64,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 30_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
});
