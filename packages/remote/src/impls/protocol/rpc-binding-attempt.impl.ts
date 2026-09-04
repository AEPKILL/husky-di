/**
 * @overview Private transaction for one exact Physical Connection Binding attempt.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import { RpcEndpointImpl } from "@/impls/endpoint/rpc-endpoint.impl";
import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcRetainedBytesReservation } from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcBindingPlan,
	IRpcSessionBinding,
	IRpcSessionTerminationPlan,
} from "@/interfaces/session/rpc-session.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

export type CreateRpcBindingAttemptOptions = Readonly<{
	readonly connection: IRpcConnection;
	readonly signal: AbortSignal;
	readonly timeoutMs: number;
	readonly timeoutError: string;
	readonly abortError: string;
	readonly reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	readonly isCurrent: () => boolean;
	readonly onSettled: () => void;
}>;

type RpcPendingBindingFailure = Readonly<{
	readonly error: Error;
	readonly notifyBinding: boolean;
	readonly reason: RpcEndpointFailureEnum;
}>;

type RpcAttemptLease = Readonly<{
	release(): void;
	transfer(): void;
}>;

/** Owns the temporal and resource boundary of one exact binding attempt. */
export class RpcBindingAttempt {
	readonly task: Promise<void>;
	readonly _endpoint: IRpcEndpoint;
	readonly _resolve: () => void;
	readonly _reject: (error: Error) => void;
	readonly _firstMessage: Promise<Uint8Array>;
	readonly _resolveFirstMessage: (message: Uint8Array) => void;
	readonly _rejectFirstMessage: (error: Error) => void;
	readonly _options: CreateRpcBindingAttemptOptions;
	readonly _temporaryReleases = new Set<() => void>();
	_binding: IRpcSessionBinding | undefined;
	_pendingLinearizationFailure: RpcPendingBindingFailure | undefined;
	_pendingActivationFailure: RpcPendingBindingFailure | undefined;
	_timer: ReturnType<typeof setTimeout> | undefined;
	_removeAbortListener: (() => void) | undefined;
	_resourcesFinished = false;
	_firstMessageReceived = false;
	_linearizing = false;
	_activating = false;
	_ingressBeforeActivation = false;
	_activated = false;
	_terminal = false;

	public constructor(options: CreateRpcBindingAttemptOptions) {
		this._options = options;
		const task = Promise.withResolvers<void>();
		this.task = task.promise;
		this._resolve = task.resolve;
		this._reject = task.reject;
		const firstMessage = Promise.withResolvers<Uint8Array>();
		this._firstMessage = firstMessage.promise;
		this._resolveFirstMessage = firstMessage.resolve;
		this._rejectFirstMessage = firstMessage.reject;
		// A construction-time Endpoint failure can reject before the role awaits input.
		void this._firstMessage.catch(() => {});

		let endpoint: IRpcEndpoint | undefined;
		let earlyFailure:
			| Readonly<{
					reason: RpcEndpointFailureEnum;
					error?: Error;
			  }>
			| undefined;
		endpoint = new RpcEndpointImpl({
			connection: options.connection,
			reserveRetainedBytes: (bytes) => this._reserveRetainedBytes(bytes),
			onIngressAdmitted: () => this._ingressAdmitted(),
			onMessage: (message) => this._receive(message),
			onFailure: (reason, error) => {
				if (endpoint === undefined) {
					earlyFailure = error === undefined ? { reason } : { reason, error };
					return;
				}
				this._endpointFailed(reason, error);
			},
		});
		this._endpoint = endpoint;
		this._timer = setTimeout(
			() => this.fail(new Error(options.timeoutError)),
			options.timeoutMs,
		);
		const onAbort = () => this.fail(new Error(options.abortError));
		if (options.signal.aborted) {
			queueMicrotask(onAbort);
		} else {
			options.signal.addEventListener("abort", onAbort, { once: true });
			this._removeAbortListener = () =>
				options.signal.removeEventListener("abort", onAbort);
		}
		if (earlyFailure !== undefined) {
			const failure = earlyFailure;
			queueMicrotask(() => this._endpointFailed(failure.reason, failure.error));
		}
	}

	get isCurrent(): boolean {
		return !this._terminal && this._options.isCurrent();
	}

	read(): Promise<Uint8Array> {
		return this._firstMessage;
	}

	send(message: Uint8Array): Promise<void> {
		return this.isCurrent
			? this._endpoint.sendNow(message)
			: Promise.reject(
					new Error("Default RPC binding attempt is not current."),
				);
	}

	own(release: () => void): RpcAttemptLease {
		let owned = true;
		let finish: () => void;
		const forget = (runRelease: boolean): void => {
			if (!owned) {
				return;
			}
			owned = false;
			this._temporaryReleases.delete(finish);
			if (runRelease) {
				release();
			}
		};
		finish = () => forget(true);
		if (this._resourcesFinished) {
			finish();
		} else {
			this._temporaryReleases.add(finish);
		}
		return Object.freeze({
			release: finish,
			transfer: () => forget(false),
		});
	}

	async bind(
		plan: IRpcBindingPlan,
		retainSession: () => boolean,
		encodedReply?: Uint8Array,
	): Promise<void> {
		if (!this.isCurrent) {
			return;
		}
		this._linearizing = true;
		let binding: IRpcSessionBinding;
		try {
			binding = plan.install(this._endpoint);
		} catch (error) {
			this._linearizing = false;
			if (!this._settlePendingLinearizationFailure()) {
				this.fail(error);
			}
			return;
		}
		this._linearizing = false;
		this._binding = binding;

		let retained = false;
		try {
			retained = retainSession();
		} catch (error) {
			if (!this._settlePendingLinearizationFailure()) {
				this.fail(error);
			}
			return;
		}
		if (!retained) {
			if (!this._settlePendingLinearizationFailure()) {
				this.fail(
					new Error("Default RPC provisional Session transfer failed."),
				);
			}
			return;
		}
		if (this._settlePendingLinearizationFailure()) {
			return;
		}

		this._finishResources();
		if (this._ingressBeforeActivation) {
			this.fail(
				new Error(
					"Default RPC active record arrived before Binding Activation.",
				),
			);
			return;
		}
		if (encodedReply !== undefined) {
			try {
				await this._endpoint.sendNow(encodedReply);
			} catch (error) {
				this.fail(error);
				return;
			}
		}
		this._activate(binding);
	}

	async terminate(
		plan: IRpcSessionTerminationPlan,
		error: Error,
		encodedReply?: Uint8Array,
	): Promise<void> {
		if (!this.isCurrent) {
			return;
		}
		try {
			plan.commit(error);
		} catch (commitError) {
			this.fail(commitError);
			return;
		}
		if (encodedReply === undefined) {
			this.fail(error);
			return;
		}
		await this.reject(encodedReply, error);
	}

	async reject(reply: Uint8Array, error: Error): Promise<void> {
		if (!this.isCurrent) {
			return;
		}
		try {
			await this._endpoint.sendNow(reply);
		} catch {
			// The intended rejection remains authoritative over reply-send failure.
		} finally {
			this.fail(error);
		}
	}

	fail(
		error: unknown,
		reason: RpcEndpointFailureEnum = RpcEndpointFailureEnum.connection,
	): void {
		this._settleFailure(error, true, reason);
	}

	_receive(message: Uint8Array): Promise<void> | void {
		const binding = this._binding;
		if (binding !== undefined) {
			binding.receive(message);
			return;
		}
		if (this._terminal) {
			return;
		}
		if (this._firstMessageReceived) {
			this.fail(
				new Error("Default RPC received active ingress before binding."),
			);
			return;
		}
		this._firstMessageReceived = true;
		this._resolveFirstMessage(message);
		return this.task.catch(() => {});
	}

	_ingressAdmitted(): void {
		if (this._terminal || this._activated) {
			return;
		}
		if (this._linearizing) {
			this._ingressBeforeActivation = true;
			return;
		}
		if (this._binding !== undefined) {
			this.fail(
				new Error(
					"Default RPC active record arrived before Binding Activation.",
				),
			);
		}
	}

	_reserveRetainedBytes(
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		const binding = this._binding;
		return binding === undefined
			? this._options.reserveRetainedBytes(bytes)
			: binding.reserveRetainedBytes(bytes);
	}

	_endpointFailed(reason: RpcEndpointFailureEnum, error?: Error): void {
		const binding = this._binding;
		if (binding !== undefined) {
			binding.fail(reason, error);
			if (this._terminal) {
				return;
			}
			this._settleFailure(
				error ?? new Error(`Default RPC bound endpoint failed: ${reason}.`),
				false,
				reason,
			);
			return;
		}
		this.fail(
			error ?? new Error(`Default RPC bootstrap endpoint failed: ${reason}.`),
			reason,
		);
	}

	_settleFailure(
		error: unknown,
		notifyBinding: boolean,
		reason: RpcEndpointFailureEnum,
	): void {
		if (
			this._terminal ||
			this._pendingLinearizationFailure !== undefined ||
			this._pendingActivationFailure !== undefined
		) {
			return;
		}
		const failure =
			error instanceof Error
				? error
				: new Error("Default RPC Binding transaction failed.");
		if (this._linearizing && this._binding === undefined) {
			this._pendingLinearizationFailure = Object.freeze({
				error: failure,
				notifyBinding,
				reason,
			});
			return;
		}
		if (this._activating && this._binding !== undefined) {
			this._pendingActivationFailure = Object.freeze({
				error: failure,
				notifyBinding,
				reason,
			});
			return;
		}
		this._terminal = true;
		this._clearDeadline();
		this._rejectFirstMessage(failure);
		if (this._binding === undefined) {
			this._endpoint.fenceAndClose();
		} else if (notifyBinding) {
			this._binding.fail(reason, failure);
		}
		this._finishResources();
		this._options.onSettled();
		this._reject(failure);
	}

	_settlePendingLinearizationFailure(): boolean {
		const pending = this._pendingLinearizationFailure;
		if (pending === undefined) {
			return false;
		}
		this._pendingLinearizationFailure = undefined;
		this._settleFailure(pending.error, pending.notifyBinding, pending.reason);
		return true;
	}

	_activate(binding: IRpcSessionBinding): void {
		if (this._terminal) {
			return;
		}
		this._activating = true;
		let activated: boolean;
		try {
			activated = binding.activate();
		} catch (error) {
			this._activating = false;
			if (!this._settlePendingActivationFailure()) {
				this.fail(error);
			}
			return;
		}
		this._activating = false;
		if (!activated) {
			if (!this._settlePendingActivationFailure()) {
				this.fail(new Error("Default RPC Session Binding did not activate."));
			}
			return;
		}
		// Activation is the attempt's success point. Attempt-level failures
		// observed from a synchronous activation callback are therefore late.
		this._pendingActivationFailure = undefined;
		this._activated = true;
		this._terminal = true;
		this._clearDeadline();
		this._finishResources();
		this._options.onSettled();
		this._resolve();
	}

	_settlePendingActivationFailure(): boolean {
		const pending = this._pendingActivationFailure;
		if (pending === undefined) {
			return false;
		}
		this._pendingActivationFailure = undefined;
		this._settleFailure(pending.error, pending.notifyBinding, pending.reason);
		return true;
	}

	_clearDeadline(): void {
		if (this._timer !== undefined) {
			clearTimeout(this._timer);
			this._timer = undefined;
		}
		this._removeAbortListener?.();
		this._removeAbortListener = undefined;
	}

	_finishResources(): void {
		this._resourcesFinished = true;
		for (const release of this._temporaryReleases) {
			release();
		}
		this._temporaryReleases.clear();
	}
}

/** Closes a Connection that never acquired binding authority. */
export function closeUnboundConnection(connection: IRpcConnection): void {
	queueMicrotask(() => {
		void Promise.try(() => connection.close()).catch(() => {
			// A pre-bootstrap Connection has no Session authority to report against.
		});
	});
}
