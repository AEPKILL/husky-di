/**
 * @overview Defines the shared husky-di-rpc/1 wire identifier grammar.
 * @author AEPKILL
 * @created 2026-08-26 11:36:44
 */

import { z } from "zod";

export const rpcWireIdentifierSchema = z
	.string()
	.min(1)
	.max(256)
	.refine((value) => new TextEncoder().encode(value).byteLength <= 256);
