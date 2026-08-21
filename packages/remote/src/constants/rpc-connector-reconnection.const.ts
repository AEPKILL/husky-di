/**
 * @overview Connector Reconnection policy defaults.
 * @author AEPKILL
 * @created 2026-08-21 02:19:00
 */

export const DEFAULT_RPC_CONNECTOR_RECONNECTION_RETRY_DELAYS_MS = Object.freeze(
	[1_000, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 60_000, 60_000],
);

export const DEFAULT_RPC_CONNECTOR_RECONNECTION_ATTEMPT_TIMEOUT_MS = 30_000;
