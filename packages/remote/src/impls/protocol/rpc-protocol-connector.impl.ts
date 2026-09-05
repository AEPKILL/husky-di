/**
 * @overview Private one-to-one built-in Protocol role and binding policy.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import {
	RPC_PROFILE,
	RPC_PROTECTED_SESSION_BYTES,
} from "@/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import {
	closeUnboundConnection,
	RpcBindingAttempt,
} from "@/impls/protocol/rpc-binding-attempt.impl";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcSession,
	RpcResumeOutcome,
	RpcSessionFactory,
} from "@/interfaces/session/rpc-session.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import type {
	RpcFreshRequest,
	RpcResumeRequest,
} from "@/types/protocol/rpc-wire-record.type";

export type CreateRpcProtocolConnectorOptions = Readonly<{
	readonly host: IRpcProtocolConnectorHost;
	readonly codec: IRpcCodec;
	readonly createSession: RpcSessionFactory;
}>;

type RpcFreshSession = Readonly<{
	readonly session: IRpcSession;
	retain(): void;
}>;

/** Owns one Connector's Default Protocol Session and binding attempts. */
export class RpcProtocolConnectorImpl implements IRpcProtocolConnector {
	readonly _host: IRpcProtocolConnectorHost;
	readonly _codec: IRpcCodec;
	readonly _createSession: RpcSessionFactory;
	_attempt: RpcBindingAttempt | undefined;
	_session: IRpcSession | undefined;
	_handshakeSlotsInUse = 0;
	_closing = false;
	_forceClosing = false;
	_shutdownTask: Promise<void> | undefined;
	_cleanupTask: Promise<void> | undefined;

	public constructor(options: CreateRpcProtocolConnectorOptions) {
		this._host = options.host;
		this._codec = options.codec;
		this._createSession = options.createSession;
	}

	bind(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		let task: Promise<void>;
		try {
			task = this._bind(connection, signal);
		} catch (error) {
			return Promise.reject(error);
		}
		// A Transport or Codec failure may embed token-bearing bootstrap bytes.
		// Keep the raw failure inside the built-in Protocol boundary.
		return task.catch(() => {
			throw new Error("Default RPC Connector binding attempt failed.");
		});
	}

	shutdown(): Promise<void> {
		if (this._shutdownTask !== undefined) {
			return this._shutdownTask;
		}
		const { promise, reject, resolve } = Promise.withResolvers<void>();
		this._shutdownTask = promise;
		this._closing = true;
		try {
			const attempt = this._attempt;
			attempt?.fail(new Error("Default RPC Connector is shutting down."));
			const session = this._session;
			const sessionShutdown = session?.shutdown() ?? Promise.resolve();
			const attemptSettlement = attempt?.task.catch(() => {});
			const settlement = Promise.all([
				Promise.resolve(attemptSettlement),
				sessionShutdown,
			]).then(() => {
				const retainedSession = this._session;
				return retainedSession === undefined || retainedSession === session
					? undefined
					: retainedSession.shutdown();
			});
			void settlement.then(resolve, reject);
		} catch (error) {
			reject(error);
		}
		return promise;
	}

	close(): void {
		this._closing = true;
		this._forceClosing = true;
		this._attempt?.fail(new Error("Default RPC Connector was closed."));
		this._session?.forceClose();
	}

	cleanup(): Promise<void> {
		this._cleanupTask ??= Promise.resolve();
		return this._cleanupTask;
	}

	_bind(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		if (this._closing || this._attempt !== undefined) {
			throw new Error("Default RPC Connector is unavailable.");
		}
		if (this._handshakeSlotsInUse >= this._host.policy.maxHandshakes) {
			closeUnboundConnection(connection);
			throw new Error("Default RPC handshake capacity is full.");
		}
		const session = this._session;
		if (session !== undefined && session.reclaimDeadline === undefined) {
			throw new Error("Default RPC Connector Session is not recovering.");
		}

		this._handshakeSlotsInUse += 1;
		let attempt!: RpcBindingAttempt;
		try {
			attempt = new RpcBindingAttempt({
				connection,
				signal,
				timeoutMs: this._host.policy.bindingAttemptTimeoutMs,
				timeoutError: "Default RPC fresh binding attempt timed out.",
				abortError: "Default RPC fresh binding was aborted.",
				reserveRetainedBytes: (bytes) => this._host.reserveRetainedBytes(bytes),
				isCurrent: () => this._attempt === attempt && !this._closing,
				onSettled: () => {
					this._handshakeSlotsInUse -= 1;
					if (this._attempt === attempt) {
						this._attempt = undefined;
					}
				},
			});
		} catch (error) {
			this._handshakeSlotsInUse -= 1;
			closeUnboundConnection(connection);
			throw error;
		}
		this._attempt = attempt;
		queueMicrotask(() => {
			void this._start(attempt, session);
		});
		return attempt.task;
	}

	async _start(
		attempt: RpcBindingAttempt,
		session: IRpcSession | undefined,
	): Promise<void> {
		try {
			if (session === undefined) {
				await this._bindFresh(attempt);
			} else {
				await this._resume(attempt, session);
			}
		} catch (error) {
			attempt.fail(error);
		}
	}

	async _bindFresh(attempt: RpcBindingAttempt): Promise<void> {
		const request = Object.freeze({
			kind: RpcWireRecordKindEnum.fresh,
			profiles: Object.freeze([RPC_PROFILE]),
		}) as RpcFreshRequest;
		const response = attempt.read();
		await attempt.send(this._codec.encode(request));
		const accept = this._codec.decode(
			await response,
			RpcDecodePhaseEnum.freshAccept,
		);
		if (!attempt.isCurrent) {
			return;
		}
		const prepared = this._newSession(
			attempt,
			accept.sessionId,
			accept.resumeToken,
		);
		if (prepared === undefined) {
			attempt.fail(
				new Error(
					"Default RPC owner retained-byte allowance cannot protect a Session.",
				),
			);
			return;
		}
		const sessionHost = this._host.attachSession(prepared.session);
		if (sessionHost === undefined) {
			attempt.fail(
				new Error("Framework rejected the Default RPC Connector Session."),
			);
			return;
		}
		const plan = prepared.session.prepareFresh(sessionHost);
		await attempt.bind(plan, () => {
			if (this._session !== undefined) {
				return false;
			}
			this._session = prepared.session;
			prepared.retain();
			if (this._forceClosing) {
				prepared.session.forceClose();
			}
			return true;
		});
	}

	async _resume(
		attempt: RpcBindingAttempt,
		session: IRpcSession,
	): Promise<void> {
		const resume = session.beginResume();
		const request = Object.freeze({
			kind: RpcWireRecordKindEnum.resume,
			profile: RPC_PROFILE,
			sessionId: resume.sessionId,
			resumeToken: resume.token,
			receivedThrough: resume.cursor,
			resumeAttempt: resume.attempt,
		}) as RpcResumeRequest;
		const response = attempt.read();
		await attempt.send(this._codec.encode(request));
		const outcome = this._codec.decode(
			await response,
			RpcDecodePhaseEnum.resumeOutcome,
		);
		if (!attempt.isCurrent) {
			return;
		}
		const reviewed: RpcResumeOutcome =
			outcome.kind === RpcWireRecordKindEnum.accept
				? {
						kind: "accepted",
						profile: outcome.profile,
						sessionId: outcome.sessionId,
						bindingEpoch: outcome.bindingEpoch,
						cursor: outcome.receivedThrough,
					}
				: outcome.code === RpcResumeRejectCodeEnum.resumeRejected
					? { kind: "rejected" }
					: outcome.code === RpcResumeRejectCodeEnum.continuityFailure
						? { kind: "continuity-failure" }
						: { kind: "terminated" };
		const decision = resume.review(reviewed);
		if (decision.kind === "reject") {
			attempt.fail(decision.error);
			return;
		}
		if (decision.kind === "terminate") {
			if (this._session !== session) {
				attempt.fail(new Error("Default RPC Connector Session owner changed."));
				return;
			}
			const error =
				outcome.kind === RpcWireRecordKindEnum.accept
					? new Error("Default RPC resume accept contradicts retained state.")
					: new Error(`Default RPC resume ended with ${outcome.code}.`);
			await attempt.terminate(decision.plan, error);
			return;
		}
		await attempt.bind(decision.plan, () => this._session === session);
	}

	_newSession(
		attempt: RpcBindingAttempt,
		sessionId: string,
		resumeToken: string,
	): RpcFreshSession | undefined {
		const reservation = this._host.reserveRetainedBytes(
			RPC_PROTECTED_SESSION_BYTES,
		);
		if (reservation === undefined) {
			return undefined;
		}
		const reservationLease = attempt.own(() => reservation.release());
		let session: IRpcSession | undefined;
		const onTerminal = (): void => {
			reservation.release();
			if (session !== undefined && this._session === session) {
				this._session = undefined;
			}
		};
		try {
			session = this._createSession({
				host: this._host,
				sessionId,
				resumeToken,
				onTerminal,
			});
		} catch (error) {
			reservationLease.release();
			throw error;
		}
		const created = session;
		const sessionLease = attempt.own(() => created.terminateForced());
		reservationLease.transfer();
		return Object.freeze({
			session: created,
			retain: () => sessionLease.transfer(),
		});
	}
}
