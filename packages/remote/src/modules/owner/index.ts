/**
 * @overview Owner module boundary.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type exports precede runtime exports at the module boundary. */
export type { IRpcAcceptor } from "./interfaces/rpc-acceptor.interface";
export type {
	IRpcAcceptorPublisher,
	IRpcConnectorPublisher,
} from "./interfaces/rpc-owner-publisher.interface";
export type {
	IRpcAcceptorSessionOwnership,
	IRpcConnectorSessionOwnership,
} from "./interfaces/rpc-session-ownership.interface";
export type { IRpcConnector } from "./interfaces/rpc-connector.interface";
export type {
	RpcAcceptorListenerState,
	RpcAcceptorOptions,
	RpcAcceptorState,
	RpcConnectorConnectOptions,
	RpcConnectorOptions,
	RpcConnectorState,
} from "./types/rpc-caller.type";
export type {
	RpcConnectorCommit,
	RpcConnectorPublication,
} from "./types/rpc-owner-publication.type";
export type { RpcEvent } from "./types/rpc-event.type";
export { createRpcAcceptor } from "./factories/rpc-acceptor.factory";
export { createRpcConnector } from "./factories/rpc-connector.factory";
export { RpcAcceptorListenerStopReasonEnum } from "./enums/rpc-acceptor-listener-stop-reason.enum";
export {
	RpcAcceptorPublisherImpl,
	RpcConnectorPublisherImpl,
} from "./impls/rpc-owner-publisher.impl";
export {
	RpcAcceptorSessionOwnershipImpl,
	RpcConnectorSessionOwnershipImpl,
} from "./impls/rpc-session-ownership.impl";
export { RpcHandlerSchedulerImpl } from "./impls/rpc-handler-scheduler.impl";
export { rpcConnectorConnectOptionsSchema } from "./types/rpc-caller.type";
