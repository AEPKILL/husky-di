/**
 * @overview Public Remote Service Descriptor creation and type contracts.
 * @author AEPKILL
 * @created 2026-08-11 21:07:13
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */
export type {
	RemoteMethodKey,
	RemoteService,
	RemoteServiceDescriptor,
	RemoteServiceDescriptorOptions,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/modules/peer";

export { createRemoteServiceDescriptor } from "@/modules/peer";
