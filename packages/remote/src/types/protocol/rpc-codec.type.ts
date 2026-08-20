/**
 * @overview Internal Codec phase and decoded-record types for the built-in Protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import type {
	RpcActiveRecord,
	RpcBootstrapRequest,
	RpcFreshAccept,
	RpcJsonRecord,
	RpcResumeOutcome,
} from "@/types/protocol/rpc-wire-record.type";

export type RpcDecodedRecord<TPhase extends RpcDecodePhaseEnum> =
	TPhase extends RpcDecodePhaseEnum.bootstrapRequest
		? RpcBootstrapRequest
		: TPhase extends RpcDecodePhaseEnum.freshAccept
			? RpcFreshAccept
			: TPhase extends RpcDecodePhaseEnum.resumeOutcome
				? RpcResumeOutcome
				: TPhase extends RpcDecodePhaseEnum.active
					? RpcActiveRecord
					: RpcJsonRecord;
