/**
 * @overview Sole entry point for the RPC Protocol module.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */
export type { IRpcProtocolConnectorLifecycleHost } from "./interfaces/rpc-protocol-connector-lifecycle-host.interface";
export type { IRpcProtocolConnector } from "./interfaces/rpc-protocol-connector.interface";
export type {
	IRpcProtocolSessionLifecycle,
	IRpcProtocolSessionLifecycleHost,
} from "./interfaces/rpc-protocol-session-lifecycle.interface";
export type {
	RpcCallFailure,
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "./types/rpc-outcome.type";
export type { RpcProtocolSessionTransition } from "./types/rpc-protocol-session-transition.type";

export { RpcProtocolSessionTransitionTypeEnum } from "./enums/rpc-protocol-session-transition-type.enum";
export { rpcWireIdentifierSchema } from "./schemas/rpc-wire-identifier.schema";
