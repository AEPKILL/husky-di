/**
 * @overview Records Lab creation inputs and the normative Remote runtime policy defaults.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

export const LAB_BROWSER_RUNTIME_POLICY = {
	recoveryGraceMs: 5_000,
	bindingAttemptTimeoutMs: 3_000,
	maxPendingInvocationsPerSession: 8,
};

export const LAB_RECONNECTION_POLICY = {
	retryDelaysMs: [500, 1_000, 2_000, 5_000],
	attemptTimeoutMs: 3_000,
};

// These are documented creation defaults (RPC-POLICY-001), not internal usage.
export const LAB_RUNTIME_DEFAULTS = {
	maxSessions: 64,
	maxHandshakes: 16,
	maxPendingInvocationsPerSession: 256,
	maxRetainedBytesPerSession: 33_554_432,
	maxRetainedBytesTotal: 67_108_864,
	maxHandlersPerSession: 16,
	maxHandlersTotal: 64,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 30_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
};
