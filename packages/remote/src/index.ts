/**
 * @overview Remote package entry point.
 * @author AEPKILL
 * @created 2026-08-11 21:07:13
 */

export { RpcAcceptorListenerStopReasonEnum } from "@/enums/rpc-acceptor-listener-stop-reason.enum";
export { RpcCallDirectionEnum } from "@/enums/rpc-call-direction.enum";
export { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
export { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
export { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
export { RpcConnectorReconnectionAttemptFailureStageEnum } from "@/enums/rpc-connector-reconnection-attempt-failure-stage.enum";
export { RpcConnectorReconnectionEventTypeEnum } from "@/enums/rpc-connector-reconnection-event-type.enum";
export { RpcConnectorReconnectionStopReasonEnum } from "@/enums/rpc-connector-reconnection-stop-reason.enum";
export { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
export { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
export { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
export { RpcException } from "@/exceptions/rpc.exception";
export { createRemoteServiceDescriptor } from "@/factories/remote-service-descriptor.factory";
export { createRpcAcceptor } from "@/factories/rpc-acceptor.factory";
export { createRpcConnector } from "@/factories/rpc-connector.factory";
export { createRpcConnectorReconnection } from "@/factories/rpc-connector-reconnection.factory";
export { createRpcProtocol } from "@/factories/rpc-protocol.factory";
export type {
	IRpcAcceptor,
	RpcPeerResult,
} from "@/interfaces/owner/rpc-acceptor.interface";
export type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
export type { IRemoteServiceDescriptor } from "@/interfaces/peer/remote-service-descriptor.interface";
export type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
export type {
	IRpcApplicationRecord,
	IRpcProtocol,
	IRpcProtocolRuntimePolicy,
	RpcApplicationValue,
	RpcCallFailure,
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
export type {
	CreateRpcConnectorReconnectionOptions,
	IRpcConnectorReconnection,
	RpcConnectorAdapterFactory,
	RpcConnectorReconnectionEvent,
	RpcConnectorReconnectionPolicyOptions,
	RpcConnectorReconnectionState,
} from "@/interfaces/reconnection/rpc-connector-reconnection.interface";
export type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@/interfaces/transport/rpc-adapter.interface";
export type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
export type { RpcEvent } from "@/types/owner/rpc-event.type";
export type {
	RpcAcceptorListenerState,
	RpcAcceptorOptions,
	RpcAcceptorRuntimePolicyOptions,
	RpcAcceptorState,
	RpcConnectorConnectOptions,
	RpcConnectorOptions,
	RpcConnectorRuntimePolicyOptions,
	RpcConnectorState,
	RpcPeerState,
} from "@/types/rpc-caller.type";
