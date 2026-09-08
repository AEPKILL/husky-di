/**
 * @overview Sole entry point for the RPC Peer module.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */
export type { IRpcPeerStateView } from "./interfaces/rpc-peer-state-view.interface";
export type { IRpcPeer, RpcPeerFactory } from "./interfaces/rpc-peer.interface";
export type {
	RemoteMethodKey,
	RemoteService,
	RemoteServiceDescriptor,
	RemoteServiceDescriptorOptions,
	RemoteServiceDescriptorOptionsSnapshot,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "./types/remote-service-descriptor.type";
export type {
	RpcCallEventSink,
	RpcPeerCallEvent,
} from "./types/rpc-peer-call-event.type";
export type {
	RpcPeerState,
	RpcSessionClosedState,
} from "./types/rpc-peer-state.type";

export { RpcCallDirectionEnum } from "./enums/rpc-call-direction.enum";
export { RpcCallStatusEnum } from "./enums/rpc-call-status.enum";
export { createRemoteServiceDescriptor } from "./factories/remote-service-descriptor.factory";
export { remoteServiceDescriptorOptionsSchema } from "./types/remote-service-descriptor.type";
