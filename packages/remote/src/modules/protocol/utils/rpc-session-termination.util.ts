/**
 * @overview Publishes committed Session termination while guaranteeing endpoint and shutdown cleanup.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 00:10:00
 */

import { RpcProtocolSessionTransitionTypeEnum } from "@/modules/protocol/enums/rpc-protocol-session-transition-type.enum";
import type { IRpcEndpoint } from "@/modules/protocol/interfaces/rpc-endpoint.interface";
import type {
	IRpcProtocolSessionHost,
	RpcProtocolSessionTransitionCloseReason,
} from "@/modules/protocol/interfaces/rpc-protocol.interface";

export function completeRpcSessionTermination(
	endpoint: Pick<IRpcEndpoint, "fenceAndClose"> | undefined,
	host: Pick<IRpcProtocolSessionHost, "transition"> | undefined,
	reason: RpcProtocolSessionTransitionCloseReason | undefined,
	cause: Error | undefined,
	onTerminal: () => void,
	onShutdownComplete: () => void,
): void {
	try {
		endpoint?.fenceAndClose();
	} catch {
		// Direct Close remains best-effort after Session termination commits.
	} finally {
		try {
			if (reason !== undefined)
				host?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.closed,
					reason,
					...(cause === undefined ? {} : { cause }),
				});
		} finally {
			try {
				onTerminal();
			} finally {
				onShutdownComplete();
			}
		}
	}
}
