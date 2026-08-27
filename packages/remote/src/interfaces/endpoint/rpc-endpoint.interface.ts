/**
 * @overview Internal current Physical Connection Endpoint seam and creation inputs.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type { IRpcRetainedBytesReservation } from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

export interface IRpcEndpoint {
	readonly isSendIdle: boolean;
	readonly isIngressIdle: boolean;
	configureSendProgressTimeout(timeoutMs: number): void;
	observeIngressIdle(observer: () => void): void;
	sendNow(message: Uint8Array): Promise<void>;
	fenceAndClose(): void;
}

export type CreateRpcEndpointOptions = {
	readonly connection: IRpcConnection;
	readonly reserveRetainedBytes?: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	readonly onMessage: (message: Uint8Array) => Promise<void> | void;
	readonly onFailure: (reason: RpcEndpointFailureEnum, error?: Error) => void;
};
