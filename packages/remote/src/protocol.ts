/**
 * @overview Public Protocol implementation and third-party implementor entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */

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
	IRpcRetainedBytesReservation,
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
} from "@/interfaces/protocol/rpc-protocol.interface";
export type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
export { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
export { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
export { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
export { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
export { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
export { createRpcProtocol } from "@/factories/rpc-protocol.factory";
