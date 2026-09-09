/**
 * @overview Creates owned immutable publication snapshots and payload-free topology closure events.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type {
	RpcAcceptorClosedState,
	RpcConnectorClosedState,
} from "@/modules/owner/types/rpc-caller.type";
import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import { RpcCloseOutcomeEnum } from "@/shared/enums/rpc-close-outcome.enum";
import { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";

export function snapshotOwnerState<T>(state: T): T {
	const snapshot = snapshotRecord(state, "RPC Owner state") as T & {
		readonly listener?: unknown;
	};
	if (snapshot.listener === undefined) {
		return snapshot;
	}
	return Object.freeze({
		...snapshot,
		listener: snapshotRecord(snapshot.listener, "RPC Acceptor listener state"),
	}) as T;
}

export function snapshotRecord<T>(value: T, label: string): T {
	if (typeof value !== "object" || value === null) {
		throw new TypeError(`${label} must be an object.`);
	}
	return Object.freeze({ ...value }) as T;
}

export function createTopologyClosedEvent(
	state: RpcConnectorClosedState | RpcAcceptorClosedState,
): RpcTopologyClosedEvent {
	if (state.outcome === RpcCloseOutcomeEnum.normal) {
		return {
			type: RpcEventTypeEnum.topologyClosed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: state.reason,
		};
	}
	return {
		type: RpcEventTypeEnum.topologyClosed,
		outcome: RpcCloseOutcomeEnum.failed,
		reason: state.reason,
	};
}

type RpcTopologyClosedEvent = Extract<
	RpcEvent,
	{ readonly type: RpcEventTypeEnum.topologyClosed }
>;
