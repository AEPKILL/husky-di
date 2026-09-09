/**
 * @overview Private role-specific ownership seams between Logical Sessions and stable RPC Peers.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type {
	IRpcAcceptorPublisher,
	IRpcConnectorPublisher,
} from "@/modules/owner/interfaces/rpc-owner-publisher.interface";
import type { IRpcOwnerTerminationLifecycle } from "@/modules/owner/interfaces/rpc-owner-termination.interface";
import type {
	RpcAcceptorState,
	RpcConnectorState,
} from "@/modules/owner/types/rpc-caller.type";
import type {
	IRpcHandlerScheduler,
	IRpcPeer,
	RpcExposure,
} from "@/modules/peer";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolConnector,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/modules/protocol";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import type { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";

export type RpcOwnerCloseReason =
	| RpcCloseReasonEnum.gracefulShutdown
	| RpcCloseReasonEnum.forcedClose
	| RpcCloseReasonEnum.shutdownDeadline;

export type RpcSessionPeerEnvironment = Readonly<{
	readonly findOwnerExposure: (wireName: string) => RpcExposure | undefined;
	readonly isOwnerActive: () => boolean;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly maximumIncomingBytes: number;
	readonly reserveOwnerRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
}>;

export type RpcConnectorSessionOwnershipFactory = (
	options: Readonly<{
		readonly publisher: IRpcConnectorPublisher;
		readonly protocol: IRpcProtocolConnector;
		readonly peerEnvironment: RpcSessionPeerEnvironment;
		readonly termination: IRpcOwnerTerminationLifecycle<
			Extract<RpcConnectorState, { readonly status: RpcStateStatusEnum.closed }>
		>;
		readonly lifecycle: Readonly<{
			abortCurrentAttempt(): void;
			failProvisionalAttachment(
				attachment: IRpcConnectorSessionAttachment,
				error: Error,
			): void;
		}>;
	}>,
) => IRpcConnectorSessionOwnership;

export type RpcAcceptorSessionOwnershipFactory = (
	options: Readonly<{
		readonly publisher: IRpcAcceptorPublisher;
		readonly protocol: IRpcProtocolAcceptor;
		readonly maximumSessions: number;
		readonly peerEnvironment: RpcSessionPeerEnvironment;
		readonly termination: IRpcOwnerTerminationLifecycle<
			Extract<RpcAcceptorState, { readonly status: RpcStateStatusEnum.closed }>
		>;
		readonly lifecycle: Readonly<{
			canAdmitSession(): boolean;
			abortListener(): void;
		}>;
	}>,
) => IRpcAcceptorSessionOwnership;

export interface IRpcConnectorSessionOwnership {
	readonly peer: IRpcPeer;
	readonly attached: boolean;
	attach(
		session: IRpcProtocolSession,
	): IRpcConnectorSessionAttachment | undefined;
	beginGracefulShutdown(): void;
	beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void;
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface IRpcConnectorSessionAttachment {
	readonly host: IRpcProtocolSessionHost;
	readonly active: boolean;
	activate(canActivate: () => boolean): boolean;
	discard(): void;
}

export interface IRpcAcceptorSessionOwnership {
	admit(session: IRpcProtocolSession): IRpcProtocolSessionHost | undefined;
	hasLocalExposure(wireName: string): boolean;
	beginGracefulShutdown(): void;
	beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void;
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void;
}
