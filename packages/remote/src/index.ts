/**
 * @overview Remote package entry point.
 * @author AEPKILL
 * @created 2026-08-11 21:07:13
 */

export { RpcError, type RpcErrorCode } from "@/exceptions/rpc-error.exception";
export { createRemoteServiceDescriptor } from "@/factories/remote-service-descriptor.factory";
export { createRpcAcceptor } from "@/factories/rpc-acceptor.factory";
export { createRpcConnector } from "@/factories/rpc-connector.factory";
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
	IRpcApplicationRecord,
	IRpcProtocol,
	IRpcProtocolRuntimePolicy,
	RpcApplicationValue,
	RpcCallFailure,
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/interfaces/rpc-protocol.interface";
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
