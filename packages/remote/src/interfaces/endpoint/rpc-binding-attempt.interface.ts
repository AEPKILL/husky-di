/**
 * @overview Private Endpoint binding-attempt seam, creation inputs, and capabilities.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcRetainedBytesReservation } from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcSession,
	RpcBindingEpoch,
} from "@/interfaces/session/rpc-session.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

export interface IRpcBindingAttempt {
	readonly task: Promise<void>;
	readonly pending: boolean;
	send(message: Uint8Array): Promise<void>;
	ownTemporary(release: () => void): RpcBindingAttemptLease;
	ownProvisionalSession(session: IRpcSession, discard: () => void): boolean;
	holdsProvisionalSession(session: IRpcSession): boolean;
	claim(): IRpcEndpoint | undefined;
	transferProvisionalSession(session: IRpcSession): boolean;
	failInstalledBinding(binding: RpcBindingEpoch, error: Error): void;
	transferBinding(binding: RpcBindingEpoch, reply?: Uint8Array): Promise<void>;
	fail(error: unknown, reason?: RpcEndpointFailureEnum): void;
}

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

export type RpcBindingAttemptFactory = (
	options: CreateRpcBindingAttemptOptions,
) => IRpcBindingAttempt;

export type RpcBindingAttemptLease = Readonly<{
	release(): void;
	transfer(): void;
}>;
