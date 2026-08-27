/**
 * @overview Defines the shared husky-di-rpc/1 wire identifier grammar.
 * @author AEPKILL
 * @created 2026-08-26 11:36:44
 */

import { z } from "zod";

export { rpcWireIdentifierSchema };

const maximumIdentifierBytes = 256;
const textEncoder = new TextEncoder();
const rpcWireIdentifierSchema = z
	.string()
	.min(1)
	.refine(
		(value) => textEncoder.encode(value).byteLength <= maximumIdentifierBytes,
	);
