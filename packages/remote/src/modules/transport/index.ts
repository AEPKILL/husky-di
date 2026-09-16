/**
 * @overview Transport module boundary.
 * @author AEPKILL
 * @created 2026-09-07 23:22:09
 */

/** biome-ignore-all assist/source/organizeImports: Type exports precede runtime exports at the module boundary. */
export type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "./interfaces/rpc-adapter.interface";
export type { IRpcConnection } from "./interfaces/rpc-connection.interface";
