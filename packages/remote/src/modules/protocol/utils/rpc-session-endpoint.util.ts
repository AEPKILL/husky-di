/**
 * @overview Configures send progress and ingress-idle notifications before binding authority commits.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 00:10:00
 */

import type { IRpcEndpoint } from "@/modules/protocol/interfaces/rpc-endpoint.interface";

export function configureRpcSessionEndpoint(
	endpoint: Pick<
		IRpcEndpoint,
		"configureSendProgressTimeout" | "observeIngressIdle"
	>,
	sendProgressTimeoutMs: number,
	onIngressIdle: () => void,
): void {
	try {
		endpoint.configureSendProgressTimeout(sendProgressTimeoutMs);
		endpoint.observeIngressIdle(onIngressIdle);
	} catch (error) {
		throw error instanceof Error
			? error
			: new Error("Default RPC binding Endpoint setup failed.");
	}
}
