/**
 * @overview Peer module boundary.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type exports precede runtime exports at the module boundary. */
export type {
	IRpcHandlerScheduler,
	RpcHandlerJob,
} from "./interfaces/rpc-handler-scheduler.interface";
export type { IRpcPeer } from "./interfaces/rpc-peer.interface";
export type {
	IRpcPeerHost,
	RpcPeerFactory,
	RpcPeerStateView,
} from "./interfaces/rpc-peer-host.interface";
export type {
	RemoteServiceDescriptor,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "./types/remote-service-descriptor.type";
export type {
	RpcCallEventSink,
	RpcPeerCallEvent,
} from "./types/rpc-peer-call-event.type";
export type {
	RpcExposure,
	RpcExposureRegistry,
} from "./types/rpc-exposure.type";
export type { RpcPeerState } from "./types/rpc-peer-state.type";
export { createRemoteServiceDescriptor } from "./factories/remote-service-descriptor.factory";
export { createRpcPeer } from "./factories/rpc-peer.factory";
export { installRpcExposure } from "./utils/rpc-exposure.util";
export { RpcCallDirectionEnum } from "./enums/rpc-call-direction.enum";
export { RpcCallStatusEnum } from "./enums/rpc-call-status.enum";
