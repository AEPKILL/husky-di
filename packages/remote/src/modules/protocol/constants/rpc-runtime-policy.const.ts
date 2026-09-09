/**
 * @overview Private defaults and numeric bounds for RPC runtime policy schemas.
 * @author AEPKILL
 * @created 2026-09-04 22:24:00
 */

export const RPC_MAX_PLATFORM_TIMER_DELAY_MS = 2_147_483_647;
export const RPC_MIN_RETAINED_BYTES_PER_SESSION = 4 * 1024 * 1024;
export const RPC_HANDSHAKE_TRANSIENT_BYTES = 4 * 1024 * 1024;

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
