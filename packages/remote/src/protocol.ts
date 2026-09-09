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
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
	IRpcProtocolHost,
	IRpcProtocolCallRequest,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolInvocation,
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
} from "@/modules/protocol";
export type { IRpcConnection } from "@/modules/transport";
export type {
	RpcProtocolAcceptorFactory,
	RpcProtocolConnectorFactory,
} from "@/modules/protocol";
export { RpcCallTerminalTypeEnum } from "@/modules/protocol";
export { RpcIncomingCallKindEnum } from "@/modules/protocol";
export { RpcProtocolSessionTransitionTypeEnum } from "@/modules/protocol";
export { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
export { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
export {
	createRpcProtocolAcceptor,
	createRpcProtocolConnector,
} from "@/modules/protocol";
