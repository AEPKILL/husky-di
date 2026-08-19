/**
 * @overview Remote package entry point.
 * @author AEPKILL
 * @created 2026-08-11 21:07:13
 */

export { RpcException } from "@/exceptions/rpc.exception";
export { createRemoteServiceDescriptor } from "@/factories/remote-service-descriptor.factory";
export { createRpcAcceptor } from "@/factories/rpc-acceptor.factory";
export { createRpcConnector } from "@/factories/rpc-connector.factory";
export type {
	IRpcApplicationRecord,
	IRpcProtocol,
	IRpcProtocolRuntimePolicy,
	RpcApplicationValue,
	RpcCallFailure,
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
export type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
export type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@/interfaces/rpc-adapter.interface";
export type {
	IRpcAcceptor,
	IRpcConnector,
	IRpcPeer,
	RpcCallDirection,
	RpcEvent,
	RpcPeerResult,
} from "@/interfaces/rpc-caller.interface";
export type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
export type {
	RpcAcceptorListenerState,
	RpcAcceptorOptions,
	RpcAcceptorRuntimePolicyOptions,
	RpcAcceptorState,
	RpcConnectorOptions,
	RpcConnectorRuntimePolicyOptions,
	RpcConnectorState,
	RpcPeerState,
	RpcTopologyCloseReason,
} from "@/types/rpc-caller.type";
export type { RpcExceptionCode } from "@/types/rpc-exception.type";
