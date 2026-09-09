/**
 * @overview Private binding authority and connection-local activity lifetime.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcCodec } from "@/modules/protocol/interfaces/rpc-codec.interface";
import type { IRpcEndpoint } from "@/modules/protocol/interfaces/rpc-endpoint.interface";
import type { IRpcProtocolRuntimePolicy } from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type { IRpcSessionBinding } from "@/modules/protocol/interfaces/rpc-session.interface";
import type {
	IRpcSessionActivity,
	RpcSessionActivityFactory,
} from "@/modules/protocol/interfaces/rpc-session-activity.interface";
import type {
	RpcActiveRecord,
	RpcMessageEnvelope,
} from "@/modules/protocol/types/rpc-wire-record.type";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export interface IRpcSessionConnection extends IRpcSessionBinding {
	readonly endpoint: IRpcEndpoint;
	readonly isActive: boolean;
	readonly activity: IRpcSessionActivity | undefined;
	sendClose(): Promise<void> | undefined;
	startActivity(): void;
	recordInboundActivity(kind: RpcActiveRecord["kind"]): void;
	stopActivity(): void;
}

export type RpcSessionConnectionFactory = (options: {
	readonly endpoint: IRpcEndpoint;
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly createActivity: RpcSessionActivityFactory;
	readonly isCurrent: (binding: IRpcSessionConnection) => boolean;
	readonly reserveRetainedBytes: IRpcSessionBinding["reserveRetainedBytes"];
	readonly onActivate: (binding: IRpcSessionConnection) => boolean;
	readonly codec: IRpcCodec;
	readonly delivery: {
		acknowledge(ackThrough: number): boolean;
		pump(): void;
		receiveEnvelope(envelope: RpcMessageEnvelope): boolean;
	};
	readonly isClosed: () => boolean;
	readonly onFault: (
		reason: RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault,
		error: Error,
	) => void;
	readonly onLoss: (cause?: Error) => void;
	readonly onPeerClose: () => void;
	readonly onReady: () => void;
}) => IRpcSessionConnection;
