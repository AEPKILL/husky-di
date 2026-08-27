/**
 * @overview Canonicalizes built-in Protocol JSON values for transcript hashing.
 * @author AEPKILL
 * @created 2026-08-27 17:59:21
 */

import type {
	RpcJsonRecord,
	RpcJsonValue,
} from "@/types/protocol/rpc-wire-record.type";

export function canonicalizeRpcJson(value: RpcJsonValue): string {
	if (value === null || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (typeof value === "string" || typeof value === "number") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalizeRpcJson(item)).join(",")}]`;
	}
	const record = value as RpcJsonRecord;
	return `{${Object.keys(record)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${canonicalizeRpcJson(record[key] as RpcJsonValue)}`,
		)
		.join(",")}}`;
}
