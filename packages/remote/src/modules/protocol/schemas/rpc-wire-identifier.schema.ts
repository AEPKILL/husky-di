/**
 * @overview Defines the shared husky-di-rpc/1 wire identifier grammar.
 * @author AEPKILL
 * @created 2026-08-26 11:36:44
 */

import { z } from "zod";
import {
	RPC_MAX_IDENTIFIER_BYTES,
	RPC_MIN_IDENTIFIER_BYTES,
} from "@/modules/protocol/constants/rpc-limits.const";

export const rpcWireIdentifierSchema = z
	.string()
	.min(RPC_MIN_IDENTIFIER_BYTES)
	.max(RPC_MAX_IDENTIFIER_BYTES)
	.refine(
		(value) =>
			new TextEncoder().encode(value).byteLength <= RPC_MAX_IDENTIFIER_BYTES,
	);
