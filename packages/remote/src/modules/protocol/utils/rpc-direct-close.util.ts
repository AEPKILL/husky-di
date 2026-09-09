/**
 * @overview Closes unbound Connections and revoked Endpoints after the ownership barrier.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcEndpoint } from "@/modules/protocol/interfaces/rpc-endpoint.interface";

import type { IRpcConnection } from "@/modules/transport";

/** Closes a Connection that never acquired binding authority. */
export function closeUnboundConnection(connection: IRpcConnection): void {
	queueMicrotask(() => {
		void Promise.try(() => connection.close()).catch(() => {
			// A pre-bootstrap Connection has no Session authority to report against.
		});
	});
}

export function deferRpcEndpointClose(
	endpoint: IRpcEndpoint | undefined,
): void {
	if (endpoint === undefined) return;
	queueMicrotask(() => {
		try {
			endpoint.fenceAndClose();
		} catch {
			/* Direct Close is best-effort after binding authority is revoked. */
		}
	});
}
