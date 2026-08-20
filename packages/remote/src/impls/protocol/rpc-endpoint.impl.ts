/**
 * @overview Serialized ingress and single-send Physical Connection driver.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Subscription } from "rxjs";

import {
	RPC_MAX_INGRESS_BYTES,
	RPC_MAX_INGRESS_RECORDS,
	RPC_MAX_MESSAGE_BYTES,
} from "@/constants/protocol/rpc-profile.const";
import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type { IRpcEndpoint } from "@/interfaces/protocol/rpc-endpoint.interface";
import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
import type { CreateRpcEndpointOptions } from "@/types/protocol/rpc-endpoint.type";

/** Owns one exact Physical Connection endpoint and its bounded local work. */
export class RpcEndpointImpl implements IRpcEndpoint {
	readonly _connection: IRpcConnection;
	readonly _onMessage: (message: Uint8Array) => Promise<void> | void;
	readonly _onFailure: (reason: RpcEndpointFailureEnum, error?: Error) => void;
	readonly _ingress: Uint8Array[] = [];
	_subscription: Subscription | undefined;
	_ingressBytes = 0;
	_processing = false;
	_sendBusy = false;
	_sendGeneration = 0;
	_sendProgressTimeoutMs: number | undefined;
	_sendProgressExpectedFireAt = 0;
	_sendProgressTimer: ReturnType<typeof setTimeout> | undefined;
	_ingressIdleObserver: (() => void) | undefined;
	_closed = false;
	_failed = false;

	public constructor(options: CreateRpcEndpointOptions) {
		const { connection, onFailure, onMessage } = options;
		this._connection = connection;
		this._onMessage = onMessage;
		this._onFailure = onFailure;
		this._subscription = connection.message$.subscribe({
			next: (message) => this._enqueue(message),
			error: (error) =>
				this._fail(
					RpcEndpointFailureEnum.connection,
					error instanceof Error
						? error
						: new Error("RPC Connection message stream failed."),
				),
			complete: () => this._fail(RpcEndpointFailureEnum.connection),
		});
	}

	get isSendIdle(): boolean {
		return !this._closed && !this._sendBusy;
	}

	get isIngressIdle(): boolean {
		return !this._closed && !this._processing && this._ingress.length === 0;
	}

	get isClosed(): boolean {
		return this._closed;
	}

	configureSendProgressTimeout(timeoutMs: number): void {
		if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
			throw new Error("RPC endpoint send-progress timeout is invalid.");
		}
		this._sendProgressTimeoutMs = timeoutMs;
	}

	observeIngressIdle(observer: () => void): void {
		this._ingressIdleObserver = observer;
	}

	sendNow(message: Uint8Array): Promise<void> {
		if (!this.isSendIdle) {
			return Promise.reject(new Error("RPC endpoint send slot is not idle."));
		}
		this._sendBusy = true;
		this._sendGeneration += 1;
		const generation = this._sendGeneration;
		this._startSendProgressTimer(generation);
		let admission: Promise<void>;
		try {
			admission = Promise.resolve(this._connection.send(message));
		} catch (error) {
			admission = Promise.reject(error);
		}
		return admission.finally(() => {
			if (this._sendGeneration === generation) {
				this._clearSendProgressTimer();
				this._sendBusy = false;
			}
		});
	}

	fenceAndClose(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this._clearSendProgressTimer();
		this._subscription?.unsubscribe();
		this._ingress.length = 0;
		this._ingressBytes = 0;
		try {
			void Promise.resolve(this._connection.close()).catch(() => {});
		} catch {
			// Direct Close is best-effort; the exact endpoint is already fenced.
		}
	}

	_enqueue(message: Uint8Array): void {
		if (this._closed || this._failed) {
			return;
		}
		if (!(message instanceof Uint8Array)) {
			this._fail(
				RpcEndpointFailureEnum.protocol,
				new Error("RPC Connection emitted a non-byte message."),
			);
			return;
		}
		if (message.byteLength > RPC_MAX_MESSAGE_BYTES) {
			this._fail(
				RpcEndpointFailureEnum.protocol,
				new Error("RPC Connection emitted an oversized Transport message."),
			);
			return;
		}
		if (
			this._ingress.length >= RPC_MAX_INGRESS_RECORDS ||
			this._ingressBytes + message.byteLength > RPC_MAX_INGRESS_BYTES
		) {
			this._fail(
				RpcEndpointFailureEnum.resource,
				new Error("RPC Connection ingress backlog overflowed."),
			);
			return;
		}
		const snapshot = message.slice();
		this._ingress.push(snapshot);
		this._ingressBytes += snapshot.byteLength;
		if (!this._processing) {
			this._processing = true;
			queueMicrotask(() => void this._drain());
		}
	}

	async _drain(): Promise<void> {
		while (!this._closed && !this._failed) {
			const message = this._ingress.shift();
			if (message === undefined) {
				this._processing = false;
				this._ingressIdleObserver?.();
				return;
			}
			this._ingressBytes -= message.byteLength;
			try {
				await this._onMessage(message);
			} catch (error) {
				this._fail(
					RpcEndpointFailureEnum.protocol,
					error instanceof Error
						? error
						: new Error("RPC endpoint ingress processing failed."),
				);
				return;
			}
		}
	}

	_fail(reason: RpcEndpointFailureEnum, error?: Error): void {
		if (this._failed || this._closed) {
			return;
		}
		this._failed = true;
		this._onFailure(reason, error);
	}

	_startSendProgressTimer(generation: number): void {
		const timeoutMs = this._sendProgressTimeoutMs;
		if (timeoutMs === undefined) {
			return;
		}
		this._clearSendProgressTimer();
		this._sendProgressExpectedFireAt = Date.now() + timeoutMs;
		this._sendProgressTimer = setTimeout(
			() => this._sendProgressTimerFired(generation),
			timeoutMs,
		);
	}

	_sendProgressTimerFired(generation: number): void {
		this._sendProgressTimer = undefined;
		const timeoutMs = this._sendProgressTimeoutMs;
		if (
			timeoutMs === undefined ||
			this._closed ||
			this._failed ||
			!this._sendBusy ||
			this._sendGeneration !== generation
		) {
			return;
		}
		const now = Date.now();
		if (now - this._sendProgressExpectedFireAt > timeoutMs) {
			this._sendProgressExpectedFireAt = now + timeoutMs;
			this._sendProgressTimer = setTimeout(
				() => this._sendProgressTimerFired(generation),
				timeoutMs,
			);
			return;
		}
		this._fail(
			RpcEndpointFailureEnum.connection,
			new Error("RPC Connection send did not make bounded progress."),
		);
	}

	_clearSendProgressTimer(): void {
		if (this._sendProgressTimer !== undefined) {
			clearTimeout(this._sendProgressTimer);
			this._sendProgressTimer = undefined;
		}
		this._sendProgressExpectedFireAt = 0;
	}
}
