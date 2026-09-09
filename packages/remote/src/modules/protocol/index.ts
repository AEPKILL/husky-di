/**
 * @overview Sole entry point for the RPC Protocol module.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */
export type {
	RpcCallFailure,
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "./types/rpc-outcome.type";

export { rpcWireIdentifierSchema } from "./schemas/rpc-wire-identifier.schema";
