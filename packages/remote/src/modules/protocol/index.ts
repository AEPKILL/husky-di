/**
 * @overview Protocol module boundary.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type exports precede runtime exports at the module boundary. */
export type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationRecord,
	IRpcApplicationSnapshot,
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolCallRequest,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
	IRpcProtocolHost,
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
} from "./interfaces/rpc-protocol.interface";
export type { IRpcCodec } from "./interfaces/rpc-codec.interface";
export type { IRpcEndpoint } from "./interfaces/rpc-endpoint.interface";
export type {
	IRpcReplayReservation,
	IRpcRetainedTerminal,
	IRpcSessionCallRetention,
} from "./interfaces/rpc-session-call-retention.interface";
export type {
	IRpcSessionActivity,
	RpcSessionActivityFactory,
} from "./interfaces/rpc-session-activity.interface";
export type { IRpcSessionBinding } from "./interfaces/rpc-session.interface";
export type { IRpcSessionIncomingCalls } from "./interfaces/rpc-session-incoming-calls.interface";
export type {
	RpcAcceptorRuntimePolicyOptions,
	RpcConnectorRuntimePolicyOptions,
} from "./types/rpc-runtime-policy.type";
export type {
	RpcCallMessage,
	RpcFreshAccept,
	RpcFreshRequest,
	RpcJsonRecord,
	RpcJsonValue,
	RpcMessageEnvelope,
	RpcResumeRequest,
	RpcSemanticMessage,
} from "./types/rpc-wire-record.type";
export type {
	RpcProtocolAcceptorFactory,
	RpcProtocolConnectorFactory,
} from "./types/rpc-protocol-factory.type";
export type { RpcSessionInvocationsFactory } from "./interfaces/rpc-session-invocations.interface";
export {
	createRpcCounterExhaustionProtocolAcceptorForTest,
	createRpcCounterExhaustionProtocolConnectorForTest,
	createRpcProtocolAcceptor,
	createRpcProtocolConnector,
	createRpcSessionActivity,
	createRpcSessionCallRetention,
	createRpcSessionIncomingCalls,
	createRpcSessionInvocations,
} from "./factories/rpc-protocol.factory";
export { createRpcSecurityCarrier } from "./utils/rpc-base64-url-32-schema.util";
export { DEFAULT_RPC_RUNTIME_POLICY } from "./constants/rpc-runtime-policy.const";
export {
	isRpcApplicationArgumentsSnapshot,
	isRpcApplicationSnapshot,
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "./utils/rpc-application-value.util";
export {
	registerRpcSessionRetainedBytes,
	reserveRpcSessionRetainedBytes,
	unregisterRpcSessionRetainedBytes,
} from "./utils/rpc-session-retained-bytes.util";
export {
	RPC_MAX_WIRE_DEPTH,
	RPC_MAX_WIRE_NODES,
	RPC_PROFILE,
	RPC_PROTECTED_SESSION_BYTES,
} from "./constants/rpc-profile.const";
export {
	rpcAcceptorRuntimePolicyOptionsSchema,
	rpcConnectorRuntimePolicyOptionsSchema,
	rpcProtocolRuntimePolicySchema,
} from "./types/rpc-runtime-policy.type";
export { RpcCallTerminalTypeEnum } from "./enums/rpc-call-terminal-type.enum";
export { RpcCodecImpl } from "./impls/rpc-codec.impl";
export { RpcDecodePhaseEnum } from "./enums/rpc-decode-phase.enum";
export { RpcEndpointFailureEnum } from "./enums/rpc-endpoint-failure.enum";
export { RpcEndpointImpl } from "./impls/rpc-endpoint.impl";
export { RpcIncomingCallKindEnum } from "./enums/rpc-incoming-call-kind.enum";
export { RpcProtocolSessionTransitionTypeEnum } from "./enums/rpc-protocol-session-transition-type.enum";
export { RpcSessionImpl } from "./impls/rpc-session.impl";
export { RpcSessionInvocationsImpl } from "./impls/rpc-session-invocations.impl";
export { rpcWireIdentifierSchema } from "./schemas/rpc-wire-identifier.schema";
export { RpcWireRecordKindEnum } from "./enums/rpc-wire-record-kind.enum";
