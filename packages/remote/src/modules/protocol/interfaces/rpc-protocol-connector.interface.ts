/**
 * @overview Owner-scoped RPC Protocol Connector lifecycle contract.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type { IRpcConnection } from "@/modules/transport";

export interface IRpcProtocolConnector {
	/** Binds one connection to a fresh or retained Session; fulfills after Binding Activation. */
	bind(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
	/** Synchronously gates new work; awaits semantic drain, not physical cleanup. */
	shutdown(): Promise<void>;
	/** Synchronously forces termination and Direct Close without a Protocol close message. */
	close(): void;
	/** Returns the cached final task for Protocol-owned resources only. */
	cleanup(): Promise<void>;
}
