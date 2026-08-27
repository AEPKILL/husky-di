/**
 * @overview Public role-specific RPC Transport Adapter contracts.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Observable } from "rxjs";

import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

/** Creates exactly one Connector-side Physical Connection. */
export interface IRpcConnectorAdapter {
	readonly connection$: Observable<IRpcConnection>;
	connect(signal: AbortSignal): Promise<void>;
}

/** Owns one Acceptor listener and emits accepted Physical Connections. */
export interface IRpcAcceptorAdapter {
	readonly connection$: Observable<IRpcConnection>;
	listen(signal: AbortSignal): Promise<void>;
}
