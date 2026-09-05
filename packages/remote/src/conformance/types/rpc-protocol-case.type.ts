/**
 * @overview Private observation data shared by Protocol case work and resource ownership.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";

import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
	IRpcProtocolSession,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

export type IncomingDisposition =
	| { readonly kind: "resource" }
	| {
			readonly kind: RpcIncomingCallKindEnum.unknown;
			readonly code: RpcUnknownCallFailure;
	  }
	| {
			readonly kind: RpcIncomingCallKindEnum.handler;
			readonly outcome: RpcHandlerOutcome | Promise<RpcHandlerOutcome>;
	  };

export type ProtocolHostProbe<
	THost extends IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
> = {
	readonly host: THost;
	session: IRpcProtocolSession | undefined;
	disposition: IncomingDisposition;
	attachCount: number;
	reservationCount: number;
	commitCount: number;
	handlerOutcomeReadCount: number;
	lastRequest:
		| {
				readonly service: string;
				readonly method: string;
				readonly args: IRpcApplicationArgumentsSnapshot;
		  }
		| undefined;
	readonly incomingFinishes: RpcIncomingTerminal[];
	readonly transitions: RpcProtocolSessionTransition[];
	readonly ownerFaults: Array<{
		readonly reason: RpcProtocolFaultReason;
		readonly error: Error;
	}>;
	readonly sessionFaults: Array<{
		readonly reason: RpcProtocolFaultReason;
		readonly error: Error;
	}>;
};

export type TrackedProtocolTransport = {
	connectorConnection: IRpcConnection;
	acceptorConnection: IRpcConnection;
	connectorSubscriptions: number;
	acceptorSubscriptions: number;
	connectorSends: number;
	acceptorSends: number;
	closeCount: number;
	handoffViolation: boolean;
	connectorHandoff: boolean;
	acceptorHandoff: boolean;
};

export type ProtocolPair = {
	readonly connector: IRpcProtocolConnector;
	readonly acceptor: IRpcProtocolAcceptor;
	readonly connectorProbe: ProtocolHostProbe<IRpcProtocolConnectorHost>;
	readonly acceptorProbe: ProtocolHostProbe<IRpcProtocolAcceptorHost>;
	readonly connectorSession: IRpcProtocolSession;
	readonly transport: TrackedProtocolTransport;
};
