/**
 * @overview Remote package entry point.
 * @author AEPKILL
 * @created 2026-08-11 21:07:13
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */

export type { IRpcAcceptor } from "@/modules/owner";
export type { IRpcConnector } from "@/modules/owner";
export type { RemoteServiceDescriptor } from "@/modules/peer";
export type { IRpcPeer } from "@/modules/peer";
export type {
	IRpcApplicationRecord,
	IRpcProtocolRuntimePolicy,
	RpcApplicationValue,
	RpcCallFailure,
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/modules/protocol";
export type { IRpcConnectorReconnection } from "@/modules/reconnection";
export type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@/modules/transport";
export type { IRpcConnection } from "@/modules/transport";
export type { RpcEvent } from "@/modules/owner";
export type {
	RpcAcceptorListenerState,
	RpcAcceptorOptions,
	RpcAcceptorState,
	RpcConnectorConnectOptions,
	RpcConnectorOptions,
	RpcConnectorState,
} from "@/modules/owner";
export type { RpcPeerState } from "@/modules/peer";
export type {
	RpcProtocolAcceptorFactory,
	RpcProtocolConnectorFactory,
} from "@/modules/protocol";
export type {
	RpcAcceptorRuntimePolicyOptions,
	RpcConnectorRuntimePolicyOptions,
} from "@/modules/protocol";
export type {
	CreateRpcConnectorReconnectionOptions,
	RpcConnectorAdapterFactory,
	RpcConnectorReconnectionEvent,
	RpcConnectorReconnectionPolicyOptions,
	RpcConnectorReconnectionState,
} from "@/modules/reconnection";
export { RpcAcceptorListenerStopReasonEnum } from "@/modules/owner";
export { RpcCallDirectionEnum } from "@/modules/peer";
export { RpcCallStatusEnum } from "@/modules/peer";
export { RpcCloseOutcomeEnum } from "@/shared/enums/rpc-close-outcome.enum";
export { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
export { RpcConnectorReconnectionAttemptFailureStageEnum } from "@/modules/reconnection";
export { RpcConnectorReconnectionEventTypeEnum } from "@/modules/reconnection";
export { RpcConnectorReconnectionStopReasonEnum } from "@/modules/reconnection";
export { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
export { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
export { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
export { RpcException } from "@/shared/exceptions/rpc.exception";
export { createRemoteServiceDescriptor } from "@/modules/peer";
export { createRpcAcceptor } from "@/modules/owner";
export { createRpcConnector } from "@/modules/owner";
export { createRpcConnectorReconnection } from "@/modules/reconnection";
export {
	createRpcProtocolAcceptor,
	createRpcProtocolConnector,
} from "@/modules/protocol";
