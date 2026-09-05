/**
 * @overview Private Activity Probe lifetime and due-work contract for one active binding.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import type { IRpcProtocolRuntimePolicy } from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcActiveRecord } from "@/types/protocol/rpc-wire-record.type";

/** One cold, single-start Activity Probe lifetime per Binding Activation. */
export interface IRpcSessionActivity {
	readonly hasPendingProbe: boolean;
	/** Starts once; repeated starts cannot postpone activity or silence deadlines. */
	start(): void;
	/** Accepts only fully validated current-binding input; never requests a send inline. */
	recordInbound(kind: RpcActiveRecord["kind"]): void;
	/** Consumes one coalesced probe, preferring a Pong response over a Ping request. */
	takeProbe():
		| RpcWireRecordKindEnum.ping
		| RpcWireRecordKindEnum.pong
		| undefined;
	/** Permanently stops this lifetime and drops connection-local probe intent. */
	stop(): void;
}

export type RpcSessionActivityFactory = (options: {
	readonly policy: Pick<
		IRpcProtocolRuntimePolicy,
		"activityProbeIntervalMs" | "silenceTimeoutMs"
	>;
	readonly onProbeDue: () => void;
	readonly onSilent: () => void;
}) => IRpcSessionActivity;
