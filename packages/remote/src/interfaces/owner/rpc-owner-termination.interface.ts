/**
 * @overview Private Owner termination request and winning-transaction lifetime capabilities.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type { IRpcOwnerCustody } from "@/interfaces/owner/rpc-owner-custody.interface";
import type { RpcOwnerCloseReason } from "@/interfaces/owner/rpc-session-ownership.interface";
import type { RpcAcceptorState } from "@/types/common/rpc-caller.type";

export type RpcOwnerCleanupFailedState = Extract<
	RpcAcceptorState,
	{ readonly reason: RpcCloseReasonEnum.cleanupFailed }
>;

export interface IRpcOwnerTermination {
	readonly requested: boolean;
	shutdown(): Promise<void>;
	close(): Promise<void>;
}

export interface IRpcOwnerTerminationLifecycle<TClosed> {
	ensureTermination(): void;
	enterGrace(): () => void;
	enterClosing(finalState: TClosed): () => void;
}

export type RpcOwnerTerminationFactory<TClosed> = (
	options: Readonly<{
		deadlineMs: number;
		gateNewWork(): void;
		readStatus(): RpcStateStatusEnum;
		transactions: Readonly<{
			beginGracefulShutdown(): void;
			beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void;
		}>;
		protocol: Readonly<{ shutdown(): Promise<void> }>;
		custody: Pick<IRpcOwnerCustody, "finishCleanup">;
		finalization: Readonly<{
			releaseReferences(): void;
			finish(
				state: TClosed | RpcOwnerCleanupFailedState,
				settle: () => void,
			): void;
		}>;
	}>,
) => Readonly<{
	owner: IRpcOwnerTermination;
	lifecycle: IRpcOwnerTerminationLifecycle<TClosed>;
}>;
