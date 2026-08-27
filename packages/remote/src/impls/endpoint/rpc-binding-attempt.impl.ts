/**
 * @overview Private one-shot Physical Connection Binding Attempt and exact Endpoint bridge.
 * @author AEPKILL
 * @created 2026-08-22 00:00:00
 */

import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type { IRpcBindingAttempt } from "@/interfaces/endpoint/rpc-binding-attempt.interface";
import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcSession } from "@/interfaces/session/rpc-session.interface";
import type {
	CreateRpcBindingAttemptImplOptions,
	CreateRpcBindingAttemptOptions,
	RpcBindingAttemptLease,
} from "@/types/protocol/rpc-binding-attempt.type";
import type { RpcBindingEpoch } from "@/types/protocol/rpc-session.type";

type RpcProvisionalSession<TKey> = Readonly<{
	readonly session: IRpcSession<TKey>;
	readonly discard: () => void;
}>;

/** Owns one bootstrap attempt until it transfers an exact Binding Epoch. */
export class RpcBindingAttemptImpl<TKey> implements IRpcBindingAttempt<TKey> {
	readonly task: Promise<void>;
	readonly _endpoint: IRpcEndpoint;
	readonly _resolve: () => void;
	readonly _reject: (error: Error) => void;
	readonly _reserveOwnerRetainedBytes: CreateRpcBindingAttemptOptions["reserveRetainedBytes"];
	readonly _onMessage: CreateRpcBindingAttemptOptions["onMessage"];
	readonly _onTerminal: () => void;
	readonly _releaseHandshakeSlot: () => void;
	readonly _temporaryReleases = new Set<() => void>();
	_binding: RpcBindingEpoch | undefined;
	_provisionalSession: RpcProvisionalSession<TKey> | undefined;
	_timer: ReturnType<typeof setTimeout> | undefined;
	_removeAbortListener: (() => void) | undefined;
	_cryptoJobCount = 0;
	_resourcesFinished = false;
	_bindingClaimed = false;
	_terminal = false;
	_handshakeReleased = false;

	public constructor(options: CreateRpcBindingAttemptImplOptions) {
		const {
			abortError,
			connection,
			createEndpoint,
			onMessage,
			onTerminal,
			releaseHandshakeSlot,
			reserveRetainedBytes,
			signal,
			timeoutError,
			timeoutMs,
		} = options;
		const { promise, reject, resolve } = Promise.withResolvers<void>();
		this.task = promise;
		this._resolve = resolve;
		this._reject = reject;
		this._reserveOwnerRetainedBytes = reserveRetainedBytes;
		this._onMessage = onMessage;
		this._onTerminal = onTerminal;
		this._releaseHandshakeSlot = releaseHandshakeSlot;

		let endpoint: IRpcEndpoint | undefined;
		let earlyFailure:
			| Readonly<{
					reason: RpcEndpointFailureEnum;
					error?: Error;
			  }>
			| undefined;
		try {
			endpoint = createEndpoint({
				connection,
				reserveRetainedBytes: (bytes) => this._reserveRetainedBytes(bytes),
				onMessage: (message) => this._receive(message),
				onFailure: (reason, error) => {
					if (endpoint === undefined) {
						earlyFailure = error === undefined ? { reason } : { reason, error };
						return;
					}
					this._endpointFailed(reason, error);
				},
			});
		} catch (error) {
			releaseHandshakeSlot();
			throw error;
		}
		this._endpoint = endpoint;

		this._timer = setTimeout(
			() => this.fail(new Error(timeoutError)),
			timeoutMs,
		);
		const onAbort = () => this.fail(new Error(abortError));
		if (signal.aborted) {
			queueMicrotask(onAbort);
		} else {
			signal.addEventListener("abort", onAbort, { once: true });
			this._removeAbortListener = () =>
				signal.removeEventListener("abort", onAbort);
		}
		if (earlyFailure !== undefined) {
			const failure = earlyFailure;
			queueMicrotask(() => this._endpointFailed(failure.reason, failure.error));
		}
	}

	get pending(): boolean {
		return !this._terminal;
	}

	send(message: Uint8Array): Promise<void> {
		return this._endpoint.sendNow(message);
	}

	async runCrypto<T>(operation: () => Promise<T>): Promise<T> {
		this._cryptoJobCount += 1;
		try {
			return await operation();
		} finally {
			this._cryptoJobCount -= 1;
			this._releaseFinishedResources();
		}
	}

	ownTemporary(release: () => void): RpcBindingAttemptLease {
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
		if (this._resourcesFinished && this._cryptoJobCount === 0) {
			finish();
		} else {
			this._temporaryReleases.add(finish);
		}
		return Object.freeze({
			release: finish,
			transfer: () => forget(false),
		});
	}

	ownProvisionalSession(
		session: IRpcSession<TKey>,
		discard: () => void,
	): boolean {
		if (this._provisionalSession !== undefined || this._terminal) {
			discard();
			return false;
		}
		this._provisionalSession = Object.freeze({ session, discard });
		return true;
	}

	holdsProvisionalSession(session: IRpcSession<TKey>): boolean {
		return this._provisionalSession?.session === session;
	}

	claim(): IRpcEndpoint | undefined {
		if (this._terminal || this._bindingClaimed) {
			return undefined;
		}
		this._bindingClaimed = true;
		return this._endpoint;
	}

	transferProvisionalSession(session: IRpcSession<TKey>): boolean {
		const provisional = this._provisionalSession;
		if (provisional === undefined) {
			return true;
		}
		if (provisional.session !== session) {
			return false;
		}
		this._provisionalSession = undefined;
		return true;
	}

	failInstalledBinding(binding: RpcBindingEpoch, error: Error): void {
		if (this._binding === undefined && this._bindingClaimed) {
			this._binding = binding;
		}
		this.fail(error);
	}

	transferBinding(binding: RpcBindingEpoch, reply?: Uint8Array): Promise<void> {
		// Transfer is legal exactly once after the attempt has claimed a binding.
		const cannotTransferBinding =
			this._terminal || !this._bindingClaimed || this._binding !== undefined;
		if (cannotTransferBinding) {
			return Promise.resolve();
		}
		this._binding = binding;
		this._finishResources();
		if (reply === undefined) {
			this._activate(binding);
			return Promise.resolve();
		}
		return this._sendReplyAndActivate(binding, reply);
	}

	fail(
		error: unknown,
		reason: RpcEndpointFailureEnum = RpcEndpointFailureEnum.connection,
	): void {
		this._settleFailure(error, true, reason);
	}

	_settleFailure(
		error: unknown,
		notifyBinding: boolean,
		reason: RpcEndpointFailureEnum,
	): void {
		if (this._terminal) {
			return;
		}
		this._terminal = true;
		this._clearDeadline();
		const failure =
			error instanceof Error
				? error
				: new Error("Default RPC Binding Attempt failed.");
		if (this._binding === undefined) {
			this._endpoint.fenceAndClose();
		} else if (notifyBinding) {
			this._binding.failed(reason, failure);
		}
		const provisional = this._provisionalSession;
		this._provisionalSession = undefined;
		provisional?.discard();
		this._finishResources();
		this._onTerminal();
		this._reject(failure);
	}

	async _sendReplyAndActivate(
		binding: RpcBindingEpoch,
		reply: Uint8Array,
	): Promise<void> {
		try {
			await this._endpoint.sendNow(reply);
		} catch (error) {
			this.fail(error);
			return;
		}
		this._activate(binding);
	}

	_activate(binding: RpcBindingEpoch): void {
		if (this._terminal) {
			return;
		}
		const activated = binding.activate();
		if (this._terminal) {
			return;
		}
		if (!activated) {
			this.fail(new Error("Default RPC Binding Epoch did not activate."));
			return;
		}
		this._terminal = true;
		this._clearDeadline();
		this._finishResources();
		this._onTerminal();
		this._resolve();
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
		return this._onMessage(message);
	}

	_reserveRetainedBytes(bytes: number) {
		const binding = this._binding;
		return binding === undefined
			? this._reserveOwnerRetainedBytes(bytes)
			: binding.reserveRetainedBytes(bytes);
	}

	_endpointFailed(reason: RpcEndpointFailureEnum, error?: Error): void {
		const binding = this._binding;
		if (binding !== undefined) {
			binding.failed(reason, error);
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
		this._releaseFinishedResources();
	}

	_releaseFinishedResources(): void {
		if (this._cryptoJobCount !== 0) {
			return;
		}
		if (this._resourcesFinished) {
			for (const release of this._temporaryReleases) {
				release();
			}
			this._temporaryReleases.clear();
		}
		if (this._terminal && !this._handshakeReleased) {
			this._handshakeReleased = true;
			this._releaseHandshakeSlot();
		}
	}
}
