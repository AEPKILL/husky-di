/**
 * @overview RPC Wire Identifier validation schema.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

import { z } from "zod";

import {
	RPC_WIRE_IDENTIFIER_MAX_LENGTH,
	RPC_WIRE_IDENTIFIER_MIN_LENGTH,
} from "@/constants/protocol/rpc-size-limit.const";

/**
 * Keep the grammar portable across JSON-like protocol envelopes and logs:
 * namespace separators are allowed, whitespace and quoting-sensitive characters
 * are not.
 */
const RPC_WIRE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_.\-/:]+$/u;

/**
 * Validates peer-visible RPC identifiers such as Wire Service Names and method
 * names.
 */
export const rpcWireIdentifierSchema = z
	.string()
	.min(RPC_WIRE_IDENTIFIER_MIN_LENGTH)
	.max(RPC_WIRE_IDENTIFIER_MAX_LENGTH)
	.regex(RPC_WIRE_IDENTIFIER_PATTERN)
	.readonly();
