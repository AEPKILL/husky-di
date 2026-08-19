/**
 * @overview Public third-party Protocol implementor entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
export type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationRecord,
	IRpcApplicationSnapshot,
	IRpcProtocol,
	IRpcProtocolAcceptorHost,
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorHost,
	IRpcProtocolConnectorRuntime,
	IRpcProtocolHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingCallRequest,
	IRpcProtocolIncomingCallReservation,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolInvocation,
	IRpcProtocolInvocationRequest,
	IRpcProtocolInvocationReservation,
	IRpcProtocolInvocationSink,
	IRpcProtocolRoleRuntime,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcApplicationValue,
	RpcCallFailure,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingFailure,
	RpcIncomingTerminal,
	RpcProtocolFaultReason,
	RpcProtocolIncomingCallReservation,
	RpcProtocolSessionTransition,
	RpcProtocolSessionTransitionCloseReason,
	RpcSessionCloseReason,
	RpcUnknownCallFailure,
} from "@/interfaces/rpc-protocol.interface";
