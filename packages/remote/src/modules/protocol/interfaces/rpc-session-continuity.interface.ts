/**
 * @overview Private retained continuity authority and one-shot binding preparation.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcEndpoint } from "@/modules/protocol/interfaces/rpc-endpoint.interface";
import type { IRpcProtocolSessionHost } from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type {
	IRpcSession,
	IRpcSessionBinding,
} from "@/modules/protocol/interfaces/rpc-session.interface";
import type { IRpcSessionConnection } from "@/modules/protocol/interfaces/rpc-session-connection.interface";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export interface IRpcSessionContinuity
	extends Pick<IRpcSession, "prepareFresh" | "beginResume" | "reviewResume"> {
	readonly host: IRpcProtocolSessionHost | undefined;
	terminate(): void;
}

/** Immutable observations used to detect stale continuity decisions. */
export interface IRpcSessionContinuityState {
	readonly closed: boolean;
	readonly binding: IRpcSessionConnection | undefined;
	readonly highestSentSequence: number;
	readonly peerReceivedThrough: number;
	readonly receivedThrough: number;
	readonly recovering: boolean;
	readonly recoveryDeadline: number | undefined;
}

export type RpcSessionContinuityFactory = (options: {
	readonly sessionId: string;
	readonly resumeToken: string;
	readonly inspect: () => IRpcSessionContinuityState;
	/** Configure the Endpoint before synchronously committing retained authority and selection. */
	readonly installBinding: (
		endpoint: IRpcEndpoint,
		commitAuthority: () => void,
		peerReceivedThrough: number,
		cancelRecoveryDeadline: boolean,
	) => IRpcSessionBinding;
	readonly onTerminate: (
		reason:
			| RpcCloseReasonEnum.continuityFailure
			| RpcCloseReasonEnum.remoteTerminated,
		cause?: Error,
	) => void;
}) => IRpcSessionContinuity;
