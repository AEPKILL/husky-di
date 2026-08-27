/**
 * @overview Private Binding Attempt construction inputs and temporary lease handle.
 * @author AEPKILL
 * @created 2026-08-22 00:00:00
 */

import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcRetainedBytesReservation } from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import type { CreateRpcEndpointOptions } from "@/types/protocol/rpc-endpoint.type";

export type CreateRpcBindingAttemptOptions = Readonly<{
	readonly connection: IRpcConnection;
	readonly signal: AbortSignal;
	readonly timeoutMs: number;
	readonly timeoutError: string;
	readonly abortError: string;
	readonly reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	readonly releaseHandshakeSlot: () => void;
	readonly onMessage: (message: Uint8Array) => Promise<void> | void;
	readonly onTerminal: () => void;
}>;

export type CreateRpcBindingAttemptImplOptions =
	CreateRpcBindingAttemptOptions &
		Readonly<{
			readonly createEndpoint: (
				options: CreateRpcEndpointOptions,
			) => IRpcEndpoint;
		}>;

export type RpcBindingAttemptLease = Readonly<{
	release(): void;
	transfer(): void;
}>;
