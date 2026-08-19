/**
 * @overview Internal Codec phase and decoded-record types for the built-in Protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	RpcActiveRecord,
	RpcBootstrapRequest,
	RpcFreshAccept,
	RpcJsonRecord,
	RpcResumeOutcome,
} from "@/types/protocol/rpc-wire-record.type";

export type RpcDecodePhase =
	| "json"
	| "bootstrap-request"
	| "fresh-accept"
	| "resume-outcome"
	| "active";

export type RpcDecodedRecord<TPhase extends RpcDecodePhase> =
	TPhase extends "bootstrap-request"
		? RpcBootstrapRequest
		: TPhase extends "fresh-accept"
			? RpcFreshAccept
			: TPhase extends "resume-outcome"
				? RpcResumeOutcome
				: TPhase extends "active"
					? RpcActiveRecord
					: RpcJsonRecord;
