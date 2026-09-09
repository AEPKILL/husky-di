/**
 * @overview Constructor-injected Protocol creation from fixed Owner host capabilities.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type {
	IRpcProtocolAcceptor,
	IRpcProtocolConnector,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/modules/protocol";

export interface IRpcOwnerProtocolPorts {
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface IRpcOwnerProtocolConnectorPorts
	extends IRpcOwnerProtocolPorts {
	attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
}

export interface IRpcOwnerProtocolAcceptorPorts extends IRpcOwnerProtocolPorts {
	admitSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
}

export type RpcOwnerProtocolConnectorFactory = (
	ports: IRpcOwnerProtocolConnectorPorts,
) => IRpcProtocolConnector;

export type RpcOwnerProtocolAcceptorFactory = (
	ports: IRpcOwnerProtocolAcceptorPorts,
) => IRpcProtocolAcceptor;
