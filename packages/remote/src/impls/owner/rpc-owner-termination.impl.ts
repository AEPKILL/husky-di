/**
 * @overview Owns the cached termination task, absolute grace phase, and cleanup-to-final-publication lifetime.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type {
	IRpcOwnerTermination,
	IRpcOwnerTerminationLifecycle,
	RpcOwnerCleanupFailedState,
	RpcOwnerTerminationFactory,
} from "@/interfaces/owner/rpc-owner-termination.interface";

export type CreateRpcOwnerTerminationOptions<TClosed> = Parameters<
	RpcOwnerTerminationFactory<TClosed>
>[0];

/** Coordinates one Owner termination through winning Session Ownership transactions. */
export class RpcOwnerTerminationImpl<TClosed>
	implements IRpcOwnerTermination, IRpcOwnerTerminationLifecycle<TClosed>
{
	readonly #options: CreateRpcOwnerTerminationOptions<TClosed>;
	#termination: PromiseWithResolvers<void> | undefined;
	#phase: RpcOwnerTerminationPhase<TClosed> | undefined;

	constructor(options: CreateRpcOwnerTerminationOptions<TClosed>) {
		this.#options = Object.freeze({
			...options,
			transactions: Object.freeze({ ...options.transactions }),
			finalization: Object.freeze({ ...options.finalization }),
		});
	}

	get requested(): boolean {
		return this.#termination !== undefined;
	}

	shutdown(): Promise<void> {
		if (this.#termination !== undefined) {
			return this.#termination.promise;
		}
		const task = this.#requestTermination();
		this.#options.transactions.beginGracefulShutdown();
		return task;
	}

	close(): Promise<void> {
		const task = this.#requestTermination();
		const status = this.#options.readStatus();
		if (
			status === RpcStateStatusEnum.active ||
			status === RpcStateStatusEnum.draining
		) {
			this.#options.transactions.beginClosing(
				RpcCloseReasonEnum.forcedClose,
				true,
			);
		}
		return task;
	}

	ensureTermination(): void {
		this.#requestTermination();
	}

	enterGrace(): () => void {
		if (this.#phase !== undefined) {
			return this.#phase.kind === "grace" ? this.#phase.continue : () => {};
		}
		const phase: RpcOwnerGracePhase = {
			kind: "grace",
			deadline: Date.now() + this.#options.deadlineMs,
			started: false,
			continue: () => this.#continueGrace(phase),
		};
		this.#phase = phase;
		phase.timer = setTimeout(
			() => {
				if (this.#phase === phase) {
					this.#options.transactions.beginClosing(
						RpcCloseReasonEnum.shutdownDeadline,
						true,
					);
				}
			},
			Math.max(0, phase.deadline - Date.now()),
		);
		return phase.continue;
	}

	enterClosing(finalState: TClosed): () => void {
		const previous = this.#phase;
		if (previous?.kind === "closing" || previous?.kind === "finished") {
			return previous.kind === "closing" ? previous.continue : () => {};
		}
		const phase: RpcOwnerClosingPhase<TClosed> = {
			kind: "closing",
			finalState: Object.freeze({ ...finalState }),
			started: false,
			continue: () => this.#continueClosing(phase),
		};
		this.#phase = phase;
		if (previous?.kind === "grace") {
			clearTimeout(previous.timer);
		}
		return phase.continue;
	}

	#requestTermination(): Promise<void> {
		if (this.#termination === undefined) {
			this.#termination = Promise.withResolvers<void>();
			void this.#termination.promise.catch(() => {});
			this.#options.gateNewWork();
		}
		return this.#termination.promise;
	}

	#continueGrace(phase: RpcOwnerGracePhase): void {
		if (this.#phase !== phase || phase.started) {
			return;
		}
		phase.started = true;
		if (this.#expireGrace(phase)) {
			return;
		}
		try {
			const task = this.#options.protocol.shutdown();
			// Consume both settlements even if shutdown synchronously requested close.
			void Promise.resolve(task).then(
				() => this.#settleGrace(phase, true),
				() => this.#settleGrace(phase, false),
			);
			this.#expireGrace(phase);
		} catch {
			this.#settleGrace(phase, false);
		}
	}

	#expireGrace(phase: RpcOwnerGracePhase): boolean {
		if (this.#phase !== phase) {
			return true;
		}
		if (Date.now() < phase.deadline) {
			return false;
		}
		this.#options.transactions.beginClosing(
			RpcCloseReasonEnum.shutdownDeadline,
			true,
		);
		return true;
	}

	#settleGrace(phase: RpcOwnerGracePhase, fulfilled: boolean): void {
		if (this.#expireGrace(phase)) {
			return;
		}
		this.#options.transactions.beginClosing(
			fulfilled
				? RpcCloseReasonEnum.gracefulShutdown
				: RpcCloseReasonEnum.forcedClose,
			!fulfilled,
		);
	}

	#continueClosing(phase: RpcOwnerClosingPhase<TClosed>): void {
		if (this.#phase !== phase || phase.started) {
			return;
		}
		phase.started = true;
		void this.#options.custody.finishCleanup().then(
			() => this.#finish(phase),
			(error: unknown) =>
				this.#finish(
					phase,
					error instanceof Error
						? error
						: new Error("RPC Owner cleanup failed."),
				),
		);
	}

	#finish(phase: RpcOwnerClosingPhase<TClosed>, error?: Error): void {
		if (this.#phase !== phase) {
			return;
		}
		this.#phase = { kind: "finished" };
		const finalState: TClosed | RpcOwnerCleanupFailedState =
			error === undefined
				? phase.finalState
				: Object.freeze({
						status: RpcStateStatusEnum.closed,
						outcome: RpcCloseOutcomeEnum.failed,
						reason: RpcCloseReasonEnum.cleanupFailed,
						error,
					});
		this.#options.finalization.releaseReferences();
		this.#options.finalization.finish(finalState, () => {
			if (error === undefined) {
				this.#termination?.resolve();
			} else {
				this.#termination?.reject(error);
			}
		});
	}
}

type RpcOwnerTerminationPhase<TClosed> =
	| RpcOwnerGracePhase
	| RpcOwnerClosingPhase<TClosed>
	| Readonly<{ kind: "finished" }>;

type RpcOwnerGracePhase = {
	readonly kind: "grace";
	readonly deadline: number;
	readonly continue: () => void;
	started: boolean;
	timer?: ReturnType<typeof setTimeout>;
};

type RpcOwnerClosingPhase<TClosed> = {
	readonly kind: "closing";
	readonly finalState: TClosed;
	readonly continue: () => void;
	started: boolean;
};
