/**
 * @overview Public Protocol implementation and third-party implementor entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
export { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
export { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
export { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
export { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
export { createRpcProtocol } from "@/factories/rpc-protocol.factory";

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
	IRpcProtocolIncomingSourceReservation,
	IRpcProtocolIncomingStream,
	IRpcProtocolIncomingUnknownStreamReservation,
	IRpcProtocolInvocation,
	IRpcProtocolInvocationRequest,
	IRpcProtocolInvocationReservation,
	IRpcProtocolInvocationSink,
	IRpcProtocolProjection,
	IRpcProtocolRoleRuntime,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcProtocolSourceEmissionReservation,
	IRpcProtocolSourceSink,
	IRpcProtocolStream,
	IRpcProtocolStreamReservation,
	IRpcProtocolSubscriberSink,
	IRpcRetainedBytesReservation,
	RpcApplicationValue,
	RpcCallFailure,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingFailure,
	RpcIncomingStreamTerminal,
	RpcIncomingTerminal,
	RpcProtocolFaultReason,
	RpcProtocolIncomingCallReservation,
	RpcProtocolIncomingStreamReservation,
	RpcProtocolSessionTransition,
	RpcProtocolSessionTransitionCloseReason,
	RpcProtocolStreamRequest,
	RpcSessionCloseReason,
	RpcSourceTerminal,
	RpcStreamFailure,
	RpcStreamItemEffect,
	RpcStreamOutcome,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
export type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
