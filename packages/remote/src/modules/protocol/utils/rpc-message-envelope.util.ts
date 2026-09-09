/**
 * @overview Constructs the shared sequenced wrapper for new calls, terminals, and replay.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { RpcWireRecordKindEnum } from "@/modules/protocol/enums/rpc-wire-record-kind.enum";
import type {
	RpcMessageEnvelope,
	RpcSemanticMessage,
} from "@/modules/protocol/types/rpc-wire-record.type";

export function createRpcMessageEnvelope(
	sequence: number,
	message: RpcSemanticMessage,
	ackThrough?: number,
): RpcMessageEnvelope {
	return (
		ackThrough === undefined
			? { kind: RpcWireRecordKindEnum.message, seq: sequence, message }
			: {
					kind: RpcWireRecordKindEnum.message,
					seq: sequence,
					ackThrough,
					message,
				}
	) as RpcMessageEnvelope;
}
