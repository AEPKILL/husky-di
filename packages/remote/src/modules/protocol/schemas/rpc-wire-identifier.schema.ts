/**
 * @overview RPC Wire Identifier validation schema.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

import { z } from "zod";

import {
	RPC_WIRE_IDENTIFIER_MAX_LENGTH,
	RPC_WIRE_IDENTIFIER_MIN_LENGTH,
} from "@/modules/protocol/constants/rpc-size-limit.const";

/**
 * Validates peer-visible RPC identifiers such as Wire Service Names and method
 * names. Keep the grammar portable across JSON-like protocol envelopes and logs:
 * namespace separators are allowed, whitespace and quoting-sensitive characters
 * are not.
 */
export const rpcWireIdentifierSchema = z
	.string()
	.min(RPC_WIRE_IDENTIFIER_MIN_LENGTH)
	.max(RPC_WIRE_IDENTIFIER_MAX_LENGTH)
	.regex(/^[A-Za-z0-9_.\-/:]+$/u)
	.readonly();
