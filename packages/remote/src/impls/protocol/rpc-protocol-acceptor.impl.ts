/**
 * @overview Private one-to-many built-in Protocol role and binding policy.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import {
	RPC_PROFILE,
	RPC_PROTECTED_SESSION_BYTES,
} from "@/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { CreateRpcSessionOptions } from "@/factories/rpc-protocol.factory";
import {
	closeUnboundConnection,
	RpcBindingAttempt,
} from "@/impls/protocol/rpc-binding-attempt.impl";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcSession } from "@/interfaces/session/rpc-session.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import type {
	RpcFreshAccept,
	RpcFreshRequest,
	RpcResumeAccept,
	RpcResumeReject,
	RpcResumeRequest,
} from "@/types/protocol/rpc-wire-record.type";

export type CreateRpcProtocolAcceptorOptions = Readonly<{
	readonly host: IRpcProtocolAcceptorHost;
	readonly codec: IRpcCodec;
	readonly createSecurityCarrier: () => string;
	readonly createSession: (options: CreateRpcSessionOptions) => IRpcSession;
}>;

type RpcFreshSession = Readonly<{
	readonly session: IRpcSession;
	readonly resumeToken: string;
	discard(): void;
	retain(): void;
}>;

/** Owns one Acceptor's Default Protocol Sessions and binding attempts. */
export class RpcProtocolAcceptorImpl implements IRpcProtocolAcceptor {
	readonly _host: IRpcProtocolAcceptorHost;
	readonly _codec: IRpcCodec;
	readonly _createSecurityCarrier: () => string;
	readonly _createSession: (options: CreateRpcSessionOptions) => IRpcSession;
	readonly _attempts = new Set<RpcBindingAttempt>();
	readonly _sessions = new Map<string, IRpcSession>();
	readonly _provisionalSessionIds = new Set<string>();
	_handshakeSlotsInUse = 0;
	_freshSessionReservations = 0;
	_closing = false;
	_forceClosing = false;
	_shutdownTask: Promise<void> | undefined;
	_cleanupTask: Promise<void> | undefined;

	public constructor(options: CreateRpcProtocolAcceptorOptions) {
		this._host = options.host;
		this._codec = options.codec;
		this._createSecurityCarrier = options.createSecurityCarrier;
		this._createSession = options.createSession;
	}

	accept(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		try {
			return this._accept(connection, signal);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	shutdown(): Promise<void> {
		if (this._shutdownTask !== undefined) {
			return this._shutdownTask;
		}
		const { promise, reject, resolve } = Promise.withResolvers<void>();
		this._shutdownTask = promise;
		this._closing = true;
		try {
			const attempts = [...this._attempts];
			for (const attempt of attempts) {
				attempt.fail(new Error("Default RPC Acceptor is shutting down."));
			}
			const sessions = new Set(this._sessions.values());
			const sessionShutdowns = [...sessions].map((session) =>
				session.shutdown(),
			);
			const settlement = Promise.all([
				Promise.all(attempts.map((attempt) => attempt.task.catch(() => {}))),
				Promise.all(sessionShutdowns),
			])
				.then(() => {
					const lateSessions = [...this._sessions.values()].filter(
						(session) => !sessions.has(session),
					);
					return Promise.all(lateSessions.map((session) => session.shutdown()));
				})
				.then(() => {});
			void settlement.then(resolve, reject);
		} catch (error) {
			reject(error);
		}
		return promise;
	}

	close(): void {
		this._closing = true;
		this._forceClosing = true;
		for (const attempt of [...this._attempts]) {
			attempt.fail(new Error("Default RPC Acceptor was closed."));
		}
		for (const session of [...this._sessions.values()]) {
			session.forceClose();
		}
	}

	cleanup(): Promise<void> {
		this._cleanupTask ??= Promise.resolve();
		return this._cleanupTask;
	}

	_accept(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		if (
			this._closing ||
			this._handshakeSlotsInUse >= this._host.policy.maxHandshakes
		) {
			closeUnboundConnection(connection);
			throw new Error("Default RPC handshake capacity is full.");
		}

		this._handshakeSlotsInUse += 1;
		let attempt!: RpcBindingAttempt;
		try {
			attempt = new RpcBindingAttempt({
				connection,
				signal,
				timeoutMs: this._host.policy.bindingAttemptTimeoutMs,
				timeoutError: "Default RPC fresh acceptance timed out.",
				abortError: "Default RPC fresh acceptance was aborted.",
				reserveRetainedBytes: (bytes) => this._host.reserveRetainedBytes(bytes),
				isCurrent: () => this._attempts.has(attempt) && !this._closing,
				onSettled: () => {
					this._handshakeSlotsInUse -= 1;
					this._attempts.delete(attempt);
				},
			});
		} catch (error) {
			this._handshakeSlotsInUse -= 1;
			closeUnboundConnection(connection);
			throw error;
		}
		this._attempts.add(attempt);
		void this._start(attempt);
		return attempt.task;
	}

	async _start(attempt: RpcBindingAttempt): Promise<void> {
		try {
			const request = this._codec.decode(
				await attempt.read(),
				RpcDecodePhaseEnum.bootstrapRequest,
			);
			if (!attempt.isCurrent) {
				return;
			}
			if (request.kind === RpcWireRecordKindEnum.fresh) {
				await this._acceptFresh(attempt, request);
			} else {
				await this._acceptResume(attempt, request);
			}
		} catch (error) {
			attempt.fail(error);
		}
	}

	async _acceptFresh(
		attempt: RpcBindingAttempt,
		request: RpcFreshRequest,
	): Promise<void> {
		if (!request.profiles.includes(RPC_PROFILE)) {
			await this._rejectFresh(attempt, "unsupported-profile");
			return;
		}
		const prepared = this._prepareFresh(attempt);
		if (prepared === undefined) {
			await this._rejectFresh(attempt, "admission-rejected");
			return;
		}
		const sessionHost = this._host.admitSession(prepared.session);
		if (sessionHost === undefined) {
			prepared.discard();
			await this._rejectFresh(attempt, "admission-rejected");
			return;
		}

		let plan: ReturnType<IRpcSession["prepareFresh"]>;
		try {
			plan = prepared.session.prepareFresh(sessionHost);
		} catch (error) {
			// Topology admission preceded binding preparation, so unwind its Peer.
			sessionHost.transition({
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.forcedClose,
			});
			throw error;
		}
		const accept = Object.freeze({
			kind: RpcWireRecordKindEnum.accept,
			profile: RPC_PROFILE,
			sessionId: prepared.session.sessionId,
			bindingEpoch: 1,
			resumeToken: prepared.resumeToken,
		}) as RpcFreshAccept;
		await attempt.bind(
			plan,
			() => this._retainFresh(prepared),
			this._codec.encode(accept),
		);
	}

	async _acceptResume(
		attempt: RpcBindingAttempt,
		request: RpcResumeRequest,
	): Promise<void> {
		const session = this._sessions.get(request.sessionId);
		if (session === undefined || request.profile !== RPC_PROFILE) {
			await this._rejectResume(attempt);
			return;
		}
		const decision = session.reviewResume({
			token: request.resumeToken,
			attempt: request.resumeAttempt,
			cursor: request.receivedThrough,
		});
		if (decision.kind === "reject") {
			await this._rejectResume(attempt);
			return;
		}
		if (decision.kind === "terminate") {
			if (this._sessions.get(session.sessionId) !== session) {
				attempt.fail(new Error("Default RPC Acceptor Session owner changed."));
				return;
			}
			const reject = Object.freeze({
				kind: RpcWireRecordKindEnum.reject,
				code: RpcResumeRejectCodeEnum.continuityFailure,
			}) as RpcResumeReject;
			await attempt.terminate(
				decision.plan,
				new Error("Default RPC resume cursor violated continuity."),
				this._codec.encode(reject),
			);
			return;
		}
		const accept = Object.freeze({
			kind: RpcWireRecordKindEnum.accept,
			profile: RPC_PROFILE,
			sessionId: request.sessionId,
			bindingEpoch: decision.bindingEpoch,
			receivedThrough: decision.cursor,
		}) as RpcResumeAccept;
		await attempt.bind(
			decision.plan,
			() => this._sessions.get(session.sessionId) === session,
			this._codec.encode(accept),
		);
	}

	_prepareFresh(attempt: RpcBindingAttempt): RpcFreshSession | undefined {
		if (!attempt.isCurrent) {
			return undefined;
		}
		let reclaimedSession: IRpcSession | undefined;
		let reclaimedSessionId: string | undefined;
		let earliestRecoveryDeadline = Number.POSITIVE_INFINITY;
		const reclaimAt = Date.now();
		const retainedAndReserved =
			this._sessions.size + this._freshSessionReservations;
		if (retainedAndReserved > this._host.policy.maxSessions) {
			return undefined;
		}
		if (retainedAndReserved === this._host.policy.maxSessions) {
			for (const [sessionId, session] of this._sessions) {
				const recoveryDeadline = session.reclaimDeadline;
				const isEarlierReclaimCandidate =
					recoveryDeadline !== undefined &&
					recoveryDeadline > reclaimAt &&
					recoveryDeadline < earliestRecoveryDeadline;
				if (isEarlierReclaimCandidate) {
					reclaimedSession = session;
					reclaimedSessionId = sessionId;
					earliestRecoveryDeadline = recoveryDeadline;
				}
			}
			if (reclaimedSession === undefined) {
				return undefined;
			}
		}

		this._freshSessionReservations += 1;
		const freshSessionLease = attempt.own(() => {
			this._freshSessionReservations -= 1;
		});
		let protectedSessionReservation = this._host.reserveRetainedBytes(
			RPC_PROTECTED_SESSION_BYTES,
		);
		if (
			protectedSessionReservation === undefined &&
			reclaimedSession !== undefined
		) {
			this._reclaim(reclaimedSessionId, reclaimedSession);
			reclaimedSession = undefined;
			reclaimedSessionId = undefined;
			protectedSessionReservation = this._host.reserveRetainedBytes(
				RPC_PROTECTED_SESSION_BYTES,
			);
		}
		if (protectedSessionReservation === undefined) {
			freshSessionLease.release();
			return undefined;
		}
		const reservation = protectedSessionReservation;
		const reservationLease = attempt.own(() => reservation.release());
		if (reclaimedSession !== undefined) {
			this._reclaim(reclaimedSessionId, reclaimedSession);
		}
		if (!attempt.isCurrent) {
			reservationLease.release();
			freshSessionLease.release();
			return undefined;
		}

		let sessionId: string | undefined;
		for (let candidateIndex = 0; candidateIndex < 8; candidateIndex += 1) {
			const candidate = this._createSecurityCarrier();
			if (
				!this._sessions.has(candidate) &&
				!this._provisionalSessionIds.has(candidate)
			) {
				sessionId = candidate;
				break;
			}
		}
		if (sessionId === undefined) {
			this._host.fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC CSPRNG repeated eight Session identifiers."),
			);
			throw new Error("Default RPC Session ID failed.");
		}
		this._provisionalSessionIds.add(sessionId);
		attempt.own(() => this._provisionalSessionIds.delete(sessionId));

		let session: IRpcSession | undefined;
		const onTerminal = (): void => {
			reservation.release();
			if (session !== undefined && this._sessions.get(sessionId) === session) {
				this._sessions.delete(sessionId);
			}
		};
		try {
			const resumeToken = this._createSecurityCarrier();
			session = this._createSession({
				host: this._host,
				sessionId,
				resumeToken,
				onTerminal,
			});
			const created = session;
			const sessionLease = attempt.own(() => created.terminateForced());
			reservationLease.transfer();
			if (!attempt.isCurrent) {
				sessionLease.release();
				return undefined;
			}
			return Object.freeze({
				session: created,
				resumeToken,
				discard: sessionLease.release,
				retain: sessionLease.transfer,
			});
		} catch (error) {
			try {
				session?.terminateForced();
			} catch {
				// Session construction failure remains authoritative.
			}
			reservationLease.release();
			throw error;
		}
	}

	_retainFresh(prepared: RpcFreshSession): boolean {
		if (this._sessions.has(prepared.session.sessionId)) {
			return false;
		}
		this._sessions.set(prepared.session.sessionId, prepared.session);
		prepared.retain();
		if (this._forceClosing) {
			prepared.session.forceClose();
		}
		return true;
	}

	_reclaim(sessionId: string | undefined, session: IRpcSession): void {
		if (sessionId !== undefined && this._sessions.get(sessionId) === session) {
			this._sessions.delete(sessionId);
		}
		session.terminateForced();
	}

	_rejectResume(attempt: RpcBindingAttempt): Promise<void> {
		const reject = Object.freeze({
			kind: RpcWireRecordKindEnum.reject,
			code: RpcResumeRejectCodeEnum.resumeRejected,
		}) as RpcResumeReject;
		return attempt.reject(
			this._codec.encode(reject),
			new Error("Default RPC resume was generically rejected."),
		);
	}

	_rejectFresh(
		attempt: RpcBindingAttempt,
		code: "unsupported-profile" | "admission-rejected",
	): Promise<void> {
		return attempt.reject(
			this._codec.encode({
				kind: RpcWireRecordKindEnum.reject,
				code,
			}),
			new Error(`Default RPC fresh ${code}.`),
		);
	}
}
