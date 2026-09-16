/**
 * @overview Identifies independent originating and response lanes for stream scheduling.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 00:10:00
 */

import { RpcWireRecordKindEnum } from "@/modules/protocol/enums/rpc-wire-record-kind.enum";
import type { IRpcReplayReservation } from "@/modules/protocol/interfaces/rpc-session-call-retention.interface";
import type { RpcSemanticMessage } from "@/modules/protocol/types/rpc-wire-record.type";

export function getRpcStreamLane(
	message: RpcSemanticMessage,
): string | undefined {
	if (
		message.kind === RpcWireRecordKindEnum.streamOpen ||
		message.kind === RpcWireRecordKindEnum.streamCancel
	)
		return `origin:${message.streamId}`;
	if (
		message.kind === RpcWireRecordKindEnum.streamNext ||
		message.kind === RpcWireRecordKindEnum.streamComplete ||
		message.kind === RpcWireRecordKindEnum.streamError
	)
		return `response:${message.streamId}`;
	return undefined;
}

/** Selects one stream lane and rotates its remaining records behind other lanes. */
export function takeRpcStreamControl(
	queue: IRpcReplayReservation[],
	previousLane: string | undefined,
): IRpcReplayReservation | undefined {
	const alternate = queue.findIndex(
		(replay) => getRpcStreamLane(replay.message) !== previousLane,
	);
	const [selected] = queue.splice(alternate < 0 ? 0 : alternate, 1);
	if (selected === undefined) return undefined;
	const lane = getRpcStreamLane(selected.message);
	if (lane !== undefined) {
		const sameLane = queue.filter(
			(replay) => getRpcStreamLane(replay.message) === lane,
		);
		const otherLanes = queue.filter(
			(replay) => getRpcStreamLane(replay.message) !== lane,
		);
		queue.splice(0, queue.length, ...otherLanes, ...sameLane);
	}
	return selected;
}
