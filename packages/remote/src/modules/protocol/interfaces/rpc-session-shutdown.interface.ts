/**
 * @overview Private graceful and counter-exhaustion drain lifetime.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcSessionConnection } from "@/modules/protocol/interfaces/rpc-session-connection.interface";
import type { IRpcSessionDelivery } from "@/modules/protocol/interfaces/rpc-session-delivery.interface";
import type { IRpcSessionIncomingCalls } from "@/modules/protocol/interfaces/rpc-session-incoming-calls.interface";
import type { IRpcSessionInvocations } from "@/modules/protocol/interfaces/rpc-session-invocations.interface";

export interface IRpcSessionShutdown {
	readonly draining: boolean;
	readonly counterDraining: boolean;
	shutdown(): Promise<void>;
	beginCounterDrain(): void;
	check(): void;
	stop(): void;
	complete(): void;
}

export type RpcSessionShutdownFactory = (options: {
	readonly deadlineMs: number;
	readonly invocations: Pick<
		IRpcSessionInvocations,
		"hasActive" | "rejectPending"
	>;
	readonly incomingCalls: Pick<IRpcSessionIncomingCalls, "hasActive">;
	readonly delivery: Pick<IRpcSessionDelivery, "hasUnsettled">;
	readonly getBinding: () => IRpcSessionConnection | undefined;
	readonly isClosed: () => boolean;
	readonly isRecovering: () => boolean;
	readonly onDraining: () => void;
	readonly onCounterClosed: (cause?: Error) => void;
	readonly onForceClose: () => void;
}) => IRpcSessionShutdown;
