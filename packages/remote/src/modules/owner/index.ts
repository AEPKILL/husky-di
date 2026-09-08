/**
 * @overview Sole entry point for the RPC Owner module.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */
export type { IRpcAcceptor } from "./interfaces/rpc-acceptor.interface";
export type {
	IRpcConnectorSessionLifecycle,
	IRpcConnectorSessionLifecycleAttachment,
} from "./interfaces/rpc-connector-session-lifecycle.interface";
export type {
	IRpcConnector,
	RpcConnectorConnectOptions,
} from "./interfaces/rpc-connector.interface";
export type { RpcEvent } from "./types/rpc-event.type";
export type { RpcOwnerCloseReason } from "./types/rpc-owner-close-reason.type";
export type {
	RpcAcceptorListenerState,
	RpcAcceptorState,
	RpcConnectorState,
} from "./types/rpc-owner-state.type";

export { RpcAcceptorListenerStopReasonEnum } from "./enums/rpc-acceptor-listener-stop-reason.enum";
export { RpcEventTypeEnum } from "./enums/rpc-event-type.enum";
