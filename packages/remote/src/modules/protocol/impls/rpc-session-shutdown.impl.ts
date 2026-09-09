/**
 * @overview Owns graceful shutdown completion, counter drain admission, and its finite deadline.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type {
	IRpcSessionShutdown,
	RpcSessionShutdownFactory,
} from "@/modules/protocol/interfaces/rpc-session-shutdown.interface";

export type CreateRpcSessionShutdownOptions =
	Parameters<RpcSessionShutdownFactory>[0];

export class RpcSessionShutdownImpl implements IRpcSessionShutdown {
	readonly _options: CreateRpcSessionShutdownOptions;
	_counterDrainTimer: ReturnType<typeof setTimeout> | undefined;
	_shutdownTask: Promise<void> | undefined;
	_resolveShutdown: (() => void) | undefined;
	_draining = false;
	_counterDraining = false;
	_gracefulCloseStarted = false;

	constructor(options: CreateRpcSessionShutdownOptions) {
		this._options = Object.freeze({ ...options });
	}

	get draining(): boolean {
		return this._draining;
	}
	get counterDraining(): boolean {
		return this._counterDraining;
	}

	stop(): void {
		if (this._counterDrainTimer !== undefined) {
			clearTimeout(this._counterDrainTimer);
			this._counterDrainTimer = undefined;
		}
	}

	complete(): void {
		const resolve = this._resolveShutdown;
		this._resolveShutdown = undefined;
		resolve?.();
	}

	shutdown(): Promise<void> {
		if (this._options.isClosed()) {
			return Promise.resolve();
		}
		if (this._shutdownTask !== undefined) {
			return this._shutdownTask;
		}
		const { promise, resolve } = Promise.withResolvers<void>();
		this._shutdownTask = promise;
		this._resolveShutdown = resolve;
		this._draining = true;
		this.check();
		return this._shutdownTask;
	}
	beginCounterDrain(): void {
		if (this._options.isClosed() || this._counterDraining) {
			return;
		}
		this._counterDraining = true;
		this._draining = true;
		this._options.onDraining();
		this._counterDrainTimer = setTimeout(() => {
			this._counterDrainTimer = undefined;
			this._options.onCounterClosed(
				new Error("Default RPC counter drain deadline expired."),
			);
		}, this._options.deadlineMs);
		this._options.invocations.rejectPending();
		this.check();
	}
	check(): void {
		// Drain evaluation runs only after shutdown starts and before closure begins.
		const shouldNotCheckGracefulShutdown =
			(this._shutdownTask === undefined && !this._counterDraining) ||
			this._options.isClosed() ||
			this._gracefulCloseStarted;
		if (shouldNotCheckGracefulShutdown) {
			return;
		}
		const binding = this._options.getBinding();
		if (binding === undefined || this._options.isRecovering()) {
			if (this._counterDraining) {
				this._options.onCounterClosed();
			} else {
				this._options.onForceClose();
			}
			return;
		}
		// Graceful close waits for all retained work and binding I/O to drain.
		const drainIsIncomplete =
			this._options.invocations.hasActive ||
			this._options.incomingCalls.hasActive ||
			this._options.delivery.hasUnsettled ||
			!binding.isActive ||
			!binding.endpoint.isIngressIdle ||
			!binding.endpoint.isSendIdle;
		if (drainIsIncomplete) {
			return;
		}
		this._gracefulCloseStarted = true;
		const close = binding.sendClose();
		if (close === undefined) {
			this._options.onForceClose();
			return;
		}
		const finish = (cause?: Error): void => {
			if (this._counterDraining) this._options.onCounterClosed(cause);
			else this._options.onForceClose();
		};
		void close.then(
			() => finish(),
			(error: unknown) => finish(error instanceof Error ? error : undefined),
		);
	}
}
