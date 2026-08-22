/**
 * @overview Private built-in husky-di-rpc/1 Protocol role runtimes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	RPC_PROFILE,
	RPC_PROTECTED_SESSION_BYTES,
} from "@/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcProofOperationKindEnum } from "@/enums/protocol/rpc-proof-operation-kind.enum";
import { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { IRpcBindingAttempt } from "@/interfaces/protocol/rpc-binding-attempt.interface";
import type {
	IRpcProtocol,
	IRpcProtocolAcceptorHost,
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorHost,
	IRpcProtocolConnectorRuntime,
	IRpcRetainedBytesReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcSession } from "@/interfaces/protocol/rpc-session.interface";
import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
import type { CreateRpcProtocolOptions } from "@/types/protocol/rpc-protocol.type";
import type {
	RpcBindingCandidate,
	RpcInitiatorResume,
	RpcResponderResumeReview,
} from "@/types/protocol/rpc-session.type";
import type {
	RpcFreshAccept,
	RpcFreshRequest,
	RpcJsonRecord,
	RpcResumeAccept,
	RpcResumeReject,
	RpcResumeRequest,
} from "@/types/protocol/rpc-wire-record.type";

export class RpcProtocolImpl<TKey> implements IRpcProtocol {
	readonly _options: Readonly<CreateRpcProtocolOptions<TKey>>;

	public constructor(options: Readonly<CreateRpcProtocolOptions<TKey>>) {
		this._options = options;
	}

	public createConnector(
		host: IRpcProtocolConnectorHost,
	): IRpcProtocolConnectorRuntime {
		return new RpcConnectorRuntime(host, this._options);
	}

	public createAcceptor(
		host: IRpcProtocolAcceptorHost,
	): IRpcProtocolAcceptorRuntime {
		return new RpcAcceptorRuntime(host, this._options);
	}
}

type RpcConnectorAttemptState<TKey> = {
	readonly mode: "fresh" | "resume";
	readonly session?: IRpcSession<TKey>;
	request?: RpcFreshRequest | RpcResumeRequest;
	requestAdmission?: Promise<void>;
	resume?: RpcInitiatorResume<TKey>;
};

type RpcAcceptorAttemptState = {
	protectedSessionReservation?: IRpcRetainedBytesReservation;
	provisionalSessionId?: string;
	transferProtectedSessionReservation?: () => void;
};

type RpcResponderContinuityCandidate<TKey> = Extract<
	RpcResponderResumeReview<TKey>,
	{ readonly kind: "continuity-reject" }
>;

type RpcResponderBindingCandidate<TKey> = Extract<
	RpcResponderResumeReview<TKey>,
	{ readonly kind: "accept" }
>;

function closeUnboundConnection(connection: IRpcConnection): void {
	queueMicrotask(() => {
		void Promise.try(() => connection.close()).catch(() => {
			// A pre-bootstrap Connection has no Session authority to report against.
		});
	});
}

/** Active one-to-one Default Protocol runtime. */
class RpcConnectorRuntime<TKey> implements IRpcProtocolConnectorRuntime {
	readonly _host: IRpcProtocolConnectorHost;
	readonly _options: Readonly<CreateRpcProtocolOptions<TKey>>;
	readonly _attemptStates = new WeakMap<
		IRpcBindingAttempt<TKey>,
		RpcConnectorAttemptState<TKey>
	>();
	_attempt: IRpcBindingAttempt<TKey> | undefined;
	_session: IRpcSession<TKey> | undefined;
	_handshakeSlotsInUse = 0;
	_closing = false;
	_cleanupTask: Promise<void> | undefined;

	constructor(
		host: IRpcProtocolConnectorHost,
		options: Readonly<CreateRpcProtocolOptions<TKey>>,
	) {
		this._host = host;
		this._options = options;
	}

	bind(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		if (this._closing || this._attempt !== undefined) {
			return Promise.reject(new Error("Default RPC Connector is unavailable."));
		}
		if (this._handshakeSlotsInUse >= this._host.policy.maxHandshakes) {
			closeUnboundConnection(connection);
			return Promise.reject(
				new Error("Default RPC handshake capacity is full."),
			);
		}
		const retainedSession = this._session;
		if (
			retainedSession !== undefined &&
			retainedSession.recovery === undefined
		) {
			return Promise.reject(
				new Error("Default RPC Connector Session is not recovering."),
			);
		}
		const mode = retainedSession === undefined ? "fresh" : "resume";
		this._handshakeSlotsInUse += 1;
		let attempt: IRpcBindingAttempt<TKey>;
		try {
			attempt = this._options.createBindingAttempt({
				connection,
				signal,
				timeoutMs: this._host.policy.bindingAttemptTimeoutMs,
				timeoutError: "Default RPC fresh binding attempt timed out.",
				abortError: "Default RPC fresh binding was aborted.",
				createEndpoint: this._options.createEndpoint,
				reserveRetainedBytes: (bytes) => this._host.reserveRetainedBytes(bytes),
				releaseHandshakeSlot: () => {
					this._handshakeSlotsInUse -= 1;
				},
				onMessage: (message) => this._receiveConnectorRecord(attempt, message),
				onTerminal: () => {
					if (this._attempt === attempt) {
						this._attempt = undefined;
					}
				},
			});
		} catch (error) {
			closeUnboundConnection(connection);
			return Promise.reject(error);
		}
		this._attemptStates.set(attempt, {
			mode,
			session: retainedSession,
		});
		this._attempt = attempt;
		queueMicrotask(() =>
			mode === "fresh"
				? this._startFresh(attempt)
				: void this._startResume(attempt),
		);
		return attempt.task;
	}

	shutdown(): Promise<void> {
		this._closing = true;
		this._attempt?.fail(new Error("Default RPC Connector is shutting down."));
		return this._session?.shutdown() ?? Promise.resolve();
	}

	close(): void {
		this._closing = true;
		this._attempt?.fail(new Error("Default RPC Connector was closed."));
		this._session?.forceClose();
	}

	cleanup(): Promise<void> {
		this._cleanupTask ??= Promise.resolve();
		return this._cleanupTask;
	}

	_startFresh(attempt: IRpcBindingAttempt<TKey>): void {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const state = this._attemptStates.get(attempt);
		if (state === undefined) {
			attempt.fail(new Error("Default RPC Connector attempt state was lost."));
			return;
		}
		let request: RpcFreshRequest;
		let encoded: Uint8Array;
		try {
			const initiatorNonce = this._options.cryptography.createRandomCarrier();
			initiatorNonce.bytes.fill(0);
			request = Object.freeze({
				kind: RpcWireRecordKindEnum.fresh,
				profiles: Object.freeze([RPC_PROFILE]),
				initiatorNonce: initiatorNonce.value,
			}) as RpcFreshRequest;
			encoded = this._options.codec.encode(request);
		} catch (error) {
			attempt.fail(error);
			return;
		}
		state.request = request;
		state.requestAdmission = attempt.send(encoded);
		void state.requestAdmission.catch((error) => attempt.fail(error));
	}

	async _startResume(attempt: IRpcBindingAttempt<TKey>): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const state = this._attemptStates.get(attempt);
		const session = state?.session;
		if (state === undefined || session === undefined) {
			attempt.fail(new Error("Default RPC retained Session was lost."));
			return;
		}
		try {
			const resume = session.beginInitiatorResume();
			state.resume = resume;
			const initiatorNonce = this._options.cryptography.createRandomCarrier();
			initiatorNonce.bytes.fill(0);
			const requestWithoutProof = Object.freeze({
				kind: RpcWireRecordKindEnum.resume,
				profile: RPC_PROFILE,
				sessionId: resume.sessionId,
				receivedThrough: resume.receivedThrough,
				resumeAttempt: resume.resumeAttempt,
				initiatorNonce: initiatorNonce.value,
			}) as RpcJsonRecord;
			const proof = await attempt.runCrypto(() =>
				this._options.cryptography.signProof({
					kind: RpcProofOperationKindEnum.resumeRequest,
					proofKey: resume.proofKey,
					record: requestWithoutProof,
				}),
			);
			if (
				!this._isCurrent(attempt) ||
				state.session !== session ||
				!session.confirmInitiatorResume(resume)
			) {
				attempt.fail(
					new Error("Default RPC initiator resume candidate became stale."),
				);
				return;
			}
			const request = Object.freeze({
				...requestWithoutProof,
				proof,
			}) as RpcResumeRequest;
			state.request = request;
			state.requestAdmission = attempt.send(
				this._options.codec.encode(request),
			);
			void state.requestAdmission.catch((error) => attempt.fail(error));
		} catch (error) {
			attempt.fail(error);
		}
	}

	_receiveConnectorRecord(
		attempt: IRpcBindingAttempt<TKey>,
		bytes: Uint8Array,
	): Promise<void> | void {
		const state = this._attemptStates.get(attempt);
		if (state === undefined) {
			attempt.fail(new Error("Default RPC Connector attempt state was lost."));
			return;
		}
		return state.mode === "fresh"
			? this._receiveFreshAccept(attempt, bytes)
			: this._receiveResumeOutcome(attempt, bytes);
	}

	async _receiveFreshAccept(
		attempt: IRpcBindingAttempt<TKey>,
		bytes: Uint8Array,
	): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const state = this._attemptStates.get(attempt);
		const request = state?.request;
		const requestAdmission = state?.requestAdmission;
		if (
			request === undefined ||
			request.kind !== RpcWireRecordKindEnum.fresh ||
			requestAdmission === undefined
		) {
			attempt.fail(
				new Error("Default RPC received accept before sending fresh."),
			);
			return;
		}
		try {
			await requestAdmission;
			const accept = this._options.codec.decode(
				bytes,
				RpcDecodePhaseEnum.freshAccept,
			);
			const proofKey = await attempt.runCrypto(() =>
				this._options.cryptography.deriveProofKey(
					this._options.cryptography.decodeBase64Url32(accept.sessionSecret),
					accept.sessionId,
				),
			);
			if (!this._isCurrent(attempt)) {
				return;
			}
			const valid = await attempt.runCrypto(() =>
				this._options.cryptography.verifyProof({
					kind: RpcProofOperationKindEnum.freshAccept,
					proofKey,
					request,
					record: accept,
				}),
			);
			if (!valid || !this._isCurrent(attempt)) {
				throw new Error("Default RPC fresh accept proof is invalid or stale.");
			}
			const protectedSessionReservation = this._host.reserveRetainedBytes(
				RPC_PROTECTED_SESSION_BYTES,
			);
			if (protectedSessionReservation === undefined) {
				throw new Error(
					"Default RPC owner retained-byte allowance cannot protect a Session.",
				);
			}
			const protectedSessionLease = attempt.ownTemporary(() =>
				protectedSessionReservation.release(),
			);
			let session: IRpcSession<TKey>;
			session = this._options.createSession({
				host: this._host,
				sessionId: accept.sessionId,
				proofKey,
				codec: this._options.codec,
				onTerminal: () => {
					protectedSessionReservation.release();
					if (this._session === session) {
						this._session = undefined;
					}
				},
				counterExhausted: this._options.counterExhausted,
			});
			if (!attempt.ownProvisionalSession(session, () => session.forceClose())) {
				return;
			}
			protectedSessionLease.transfer();
			const sessionHost = this._host.attachSession(session);
			if (sessionHost === undefined || !this._isCurrent(attempt)) {
				throw new Error(
					"Framework rejected the Default RPC Connector Session.",
				);
			}
			const candidate = session.prepareFreshBinding(sessionHost);
			if (!this._isCurrent(attempt)) {
				return;
			}
			await this._installBinding(attempt, session, candidate);
		} catch (error) {
			attempt.fail(error);
		}
	}

	async _receiveResumeOutcome(
		attempt: IRpcBindingAttempt<TKey>,
		bytes: Uint8Array,
	): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const state = this._attemptStates.get(attempt);
		const session = state?.session;
		const resume = state?.resume;
		const request = state?.request;
		const requestAdmission = state?.requestAdmission;
		if (
			session === undefined ||
			resume === undefined ||
			request === undefined ||
			request.kind !== RpcWireRecordKindEnum.resume ||
			requestAdmission === undefined
		) {
			attempt.fail(
				new Error("Default RPC received a resume outcome before its request."),
			);
			return;
		}

		try {
			await requestAdmission;
			const outcome = this._options.codec.decode(
				bytes,
				RpcDecodePhaseEnum.resumeOutcome,
			);
			if (outcome.kind === RpcWireRecordKindEnum.reject) {
				if (outcome.code === RpcResumeRejectCodeEnum.resumeRejected) {
					throw new Error("Default RPC resume was generically rejected.");
				}
				const valid = await attempt.runCrypto(() =>
					this._options.cryptography.verifyProof({
						kind: RpcProofOperationKindEnum.resumeReject,
						proofKey: resume.proofKey,
						request,
						record: outcome,
					}),
				);
				if (
					!valid ||
					!this._isCurrent(attempt) ||
					!session.confirmInitiatorResume(resume)
				) {
					throw new Error(
						"Default RPC authenticated resume reject is invalid.",
					);
				}
				if (!this._isCurrent(attempt) || this._session !== session) {
					attempt.fail(
						new Error("Default RPC Connector Session owner changed."),
					);
					return;
				}
				if (attempt.claim() === undefined) {
					return;
				}
				const authority =
					outcome.code === RpcResumeRejectCodeEnum.continuityFailure
						? session.commitContinuityFailure(resume)
						: session.terminateAuthenticatedRemote(resume);
				if (authority.kind === "discarded") {
					attempt.fail(authority.error);
					return;
				}
				throw new Error(`Default RPC resume ended with ${outcome.code}.`);
			}

			const valid = await attempt.runCrypto(() =>
				this._options.cryptography.verifyProof({
					kind: RpcProofOperationKindEnum.resumeAccept,
					proofKey: resume.proofKey,
					request,
					record: outcome,
				}),
			);
			if (
				!valid ||
				!this._isCurrent(attempt) ||
				!session.confirmInitiatorResume(resume)
			) {
				throw new Error("Default RPC resume accept proof is invalid or stale.");
			}
			const preparation = session.prepareInitiatorBinding(resume, {
				profile: outcome.profile,
				sessionId: outcome.sessionId,
				bindingEpoch: outcome.bindingEpoch,
				peerReceivedThrough: outcome.receivedThrough,
			});
			if (preparation.kind === "stale") {
				throw preparation.error;
			}
			if (preparation.kind === "contradiction") {
				if (!this._isCurrent(attempt) || this._session !== session) {
					attempt.fail(
						new Error("Default RPC Connector Session owner changed."),
					);
					return;
				}
				if (attempt.claim() === undefined) {
					return;
				}
				const authority = session.commitContinuityFailure(preparation);
				if (authority.kind === "discarded") {
					attempt.fail(authority.error);
					return;
				}
				throw new Error(
					"Default RPC resume accept contradicts retained state.",
				);
			}
			if (!this._isCurrent(attempt)) {
				return;
			}
			await this._installBinding(attempt, session, preparation);
		} catch (error) {
			attempt.fail(error);
		}
	}

	_isCurrent(attempt: IRpcBindingAttempt<TKey>): boolean {
		return attempt.pending && this._attempt === attempt && !this._closing;
	}

	async _installBinding(
		attempt: IRpcBindingAttempt<TKey>,
		session: IRpcSession<TKey>,
		candidate: RpcBindingCandidate<TKey>,
	): Promise<void> {
		const provisional = attempt.holdsProvisionalSession(session);
		if (
			!this._isCurrent(attempt) ||
			(provisional ? this._session !== undefined : this._session !== session)
		) {
			attempt.fail(new Error("Default RPC Connector Session owner changed."));
			return;
		}
		const endpoint = attempt.claim();
		if (endpoint === undefined) {
			return;
		}
		let commit: ReturnType<IRpcSession<TKey>["commitBinding"]>;
		try {
			commit = session.commitBinding(candidate, endpoint);
		} catch (error) {
			attempt.fail(error);
			return;
		}
		if (commit.kind === "discarded") {
			attempt.fail(commit.error);
			return;
		}
		if (!attempt.transferProvisionalSession(session)) {
			attempt.failInstalledBinding(
				commit.binding,
				new Error("Default RPC provisional Session transfer failed."),
			);
			return;
		}
		this._session = session;
		await attempt.transferBinding(commit.binding);
	}
}

/** Passive one-to-many Default Protocol runtime. */
class RpcAcceptorRuntime<TKey> implements IRpcProtocolAcceptorRuntime {
	readonly _host: IRpcProtocolAcceptorHost;
	readonly _options: Readonly<CreateRpcProtocolOptions<TKey>>;
	readonly _attempts = new Set<IRpcBindingAttempt<TKey>>();
	readonly _attemptStates = new WeakMap<
		IRpcBindingAttempt<TKey>,
		RpcAcceptorAttemptState
	>();
	readonly _sessions = new Map<string, IRpcSession<TKey>>();
	readonly _provisionalSessionIds = new Set<string>();
	_handshakeSlotsInUse = 0;
	_freshSessionReservations = 0;
	_closing = false;
	_cleanupTask: Promise<void> | undefined;

	constructor(
		host: IRpcProtocolAcceptorHost,
		options: Readonly<CreateRpcProtocolOptions<TKey>>,
	) {
		this._host = host;
		this._options = options;
	}

	accept(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		if (
			this._closing ||
			this._handshakeSlotsInUse >= this._host.policy.maxHandshakes
		) {
			closeUnboundConnection(connection);
			return Promise.reject(
				new Error("Default RPC handshake capacity is full."),
			);
		}
		this._handshakeSlotsInUse += 1;
		let attempt: IRpcBindingAttempt<TKey>;
		try {
			attempt = this._options.createBindingAttempt({
				connection,
				signal,
				timeoutMs: this._host.policy.bindingAttemptTimeoutMs,
				timeoutError: "Default RPC fresh acceptance timed out.",
				abortError: "Default RPC fresh acceptance was aborted.",
				createEndpoint: this._options.createEndpoint,
				reserveRetainedBytes: (bytes) => this._host.reserveRetainedBytes(bytes),
				releaseHandshakeSlot: () => {
					this._handshakeSlotsInUse -= 1;
				},
				onMessage: (message) => this._receiveBootstrap(attempt, message),
				onTerminal: () => {
					this._attempts.delete(attempt);
				},
			});
		} catch (error) {
			closeUnboundConnection(connection);
			return Promise.reject(error);
		}
		this._attemptStates.set(attempt, {});
		this._attempts.add(attempt);
		return attempt.task;
	}

	shutdown(): Promise<void> {
		this._closing = true;
		for (const attempt of [...this._attempts]) {
			attempt.fail(new Error("Default RPC Acceptor is shutting down."));
		}
		return Promise.all(
			[...this._sessions.values()].map((session) => session.shutdown()),
		).then(() => {});
	}

	close(): void {
		this._closing = true;
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

	_receiveBootstrap(
		attempt: IRpcBindingAttempt<TKey>,
		bytes: Uint8Array,
	): Promise<void> | void {
		if (!this._isCurrent(attempt)) {
			return;
		}
		let record: RpcFreshRequest | RpcResumeRequest;
		try {
			record = this._options.codec.decode(
				bytes,
				RpcDecodePhaseEnum.bootstrapRequest,
			);
		} catch (error) {
			attempt.fail(error);
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.fresh) {
			return this._receiveFreshRequest(attempt, record);
		}
		return this._receiveResumeRequest(attempt, record);
	}

	async _receiveFreshRequest(
		attempt: IRpcBindingAttempt<TKey>,
		request: RpcFreshRequest,
	): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		try {
			if (!request.profiles.includes(RPC_PROFILE)) {
				await this._rejectFresh(attempt, "unsupported-profile");
				return;
			}
			if (!this._reserveFreshSession(attempt)) {
				if (this._isCurrent(attempt)) {
					await this._rejectFresh(attempt, "admission-rejected");
				}
				return;
			}

			const sessionId = this._reserveSessionId(attempt);
			if (sessionId === undefined) {
				this._host.fault(
					RpcCloseReasonEnum.protocolFault,
					new Error("Default RPC CSPRNG repeated eight Session identifiers."),
				);
				attempt.fail(new Error("Default RPC Session ID failed."));
				return;
			}
			const secret = this._options.cryptography.createRandomCarrier();
			const responderNonce = this._options.cryptography.createRandomCarrier();
			responderNonce.bytes.fill(0);
			const proofKey = await attempt.runCrypto(() =>
				this._options.cryptography.deriveProofKey(secret.bytes, sessionId),
			);
			const state = this._attemptStates.get(attempt);
			if (
				!this._isCurrent(attempt) ||
				state?.provisionalSessionId !== sessionId
			) {
				return;
			}
			const acceptWithoutProof = Object.freeze({
				kind: RpcWireRecordKindEnum.accept,
				profile: RPC_PROFILE,
				sessionId,
				bindingEpoch: 1,
				responderNonce: responderNonce.value,
				sessionSecret: secret.value,
			}) as RpcJsonRecord;
			const proof = await attempt.runCrypto(() =>
				this._options.cryptography.signProof({
					kind: RpcProofOperationKindEnum.freshAccept,
					proofKey,
					request,
					record: acceptWithoutProof,
				}),
			);
			if (
				!this._isCurrent(attempt) ||
				state?.provisionalSessionId !== sessionId
			) {
				return;
			}
			const accept = Object.freeze({
				...acceptWithoutProof,
				proof,
			}) as RpcFreshAccept;
			const protectedSessionReservation = state?.protectedSessionReservation;
			const transferProtectedSessionReservation =
				state?.transferProtectedSessionReservation;
			if (
				protectedSessionReservation === undefined ||
				transferProtectedSessionReservation === undefined
			) {
				throw new Error("Default RPC protected Session reservation was lost.");
			}
			let session: IRpcSession<TKey>;
			session = this._options.createSession({
				host: this._host,
				sessionId,
				proofKey,
				codec: this._options.codec,
				onTerminal: () => {
					protectedSessionReservation.release();
					if (this._sessions.get(sessionId) === session) {
						this._sessions.delete(sessionId);
					}
				},
				counterExhausted: this._options.counterExhausted,
			});
			if (!attempt.ownProvisionalSession(session, () => session.forceClose())) {
				return;
			}
			transferProtectedSessionReservation();
			const sessionHost = this._host.admitSession(session);
			if (sessionHost === undefined || !this._isCurrent(attempt)) {
				session.forceClose();
				if (this._isCurrent(attempt)) {
					await this._rejectFresh(attempt, "admission-rejected");
				}
				return;
			}
			const candidate = session.prepareFreshBinding(sessionHost);
			if (!this._isCurrent(attempt)) {
				return;
			}
			await this._installBinding(
				attempt,
				session,
				sessionId,
				candidate,
				this._options.codec.encode(accept),
			);
		} catch (error) {
			attempt.fail(error);
		}
	}

	async _receiveResumeRequest(
		attempt: IRpcBindingAttempt<TKey>,
		request: RpcResumeRequest,
	): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const session = this._sessions.get(request.sessionId);
		if (session === undefined || request.profile !== RPC_PROFILE) {
			await this._rejectResumeGeneric(attempt, request);
			return;
		}
		const proofCandidate = session.openResponderProof();
		if (proofCandidate === undefined) {
			await this._rejectResumeGeneric(attempt, request);
			return;
		}
		let proofValid = false;
		try {
			proofValid = await attempt.runCrypto(() =>
				this._options.cryptography.verifyProof({
					kind: RpcProofOperationKindEnum.resumeRequest,
					proofKey: proofCandidate.proofKey,
					request,
				}),
			);
		} catch {
			// A syntactically valid but unverifiable proof is a generic rejection.
		}
		if (
			!this._isCurrent(attempt) ||
			this._sessions.get(request.sessionId) !== session
		) {
			attempt.fail(new Error("Default RPC responder proof became stale."));
			return;
		}
		if (!proofValid) {
			await this._rejectResumeGeneric(attempt, request);
			return;
		}
		const review = session.reviewResponderResume(proofCandidate, {
			resumeAttempt: request.resumeAttempt,
			peerReceivedThrough: request.receivedThrough,
		});
		if (review.kind === "generic-reject") {
			await this._rejectResumeGeneric(attempt, request);
		} else if (review.kind === "continuity-reject") {
			await this._rejectResumeContinuity(attempt, request, session, review);
		} else {
			await this._acceptResume(attempt, request, session, review);
		}
	}

	async _acceptResume(
		attempt: IRpcBindingAttempt<TKey>,
		request: RpcResumeRequest,
		session: IRpcSession<TKey>,
		candidate: RpcResponderBindingCandidate<TKey>,
	): Promise<void> {
		if (
			!this._isCurrent(attempt) ||
			this._sessions.get(request.sessionId) !== session
		) {
			return;
		}
		const responderNonce = this._options.cryptography.createRandomCarrier();
		responderNonce.bytes.fill(0);
		const acceptWithoutProof = Object.freeze({
			kind: RpcWireRecordKindEnum.accept,
			profile: RPC_PROFILE,
			sessionId: request.sessionId,
			bindingEpoch: candidate.bindingEpoch,
			receivedThrough: candidate.receivedThrough,
			responderNonce: responderNonce.value,
		}) as RpcJsonRecord;
		const proof = await attempt.runCrypto(() =>
			this._options.cryptography.signProof({
				kind: RpcProofOperationKindEnum.resumeAccept,
				proofKey: candidate.proofKey,
				request,
				record: acceptWithoutProof,
			}),
		);
		if (!this._isCurrent(attempt)) {
			attempt.fail(new Error("Default RPC resume candidate became stale."));
			return;
		}
		if (this._sessions.get(request.sessionId) !== session) {
			attempt.fail(new Error("Default RPC resume candidate became stale."));
			return;
		}
		const accept = Object.freeze({
			...acceptWithoutProof,
			proof,
		}) as RpcResumeAccept;
		await this._installBinding(
			attempt,
			session,
			request.sessionId,
			candidate,
			this._options.codec.encode(accept),
		);
	}

	async _rejectResumeGeneric(
		attempt: IRpcBindingAttempt<TKey>,
		request: RpcResumeRequest,
	): Promise<void> {
		try {
			const responderNonce = this._options.cryptography.createRandomCarrier();
			responderNonce.bytes.fill(0);
			const rejectWithoutProof = Object.freeze({
				kind: RpcWireRecordKindEnum.reject,
				code: RpcResumeRejectCodeEnum.resumeRejected,
				responderNonce: responderNonce.value,
			}) as RpcJsonRecord;
			const proof = await attempt.runCrypto(() =>
				this._options.cryptography.signProof({
					kind: RpcProofOperationKindEnum.genericReject,
					request,
					record: rejectWithoutProof,
				}),
			);
			if (!this._isCurrent(attempt)) {
				return;
			}
			const reject = Object.freeze({
				...rejectWithoutProof,
				proof,
			}) as RpcResumeReject;
			await attempt.send(this._options.codec.encode(reject));
		} catch {
			// Generic rejection remains attempt-scoped even if its Connection fails.
		} finally {
			attempt.fail(new Error("Default RPC resume was generically rejected."));
		}
	}

	async _rejectResumeContinuity(
		attempt: IRpcBindingAttempt<TKey>,
		request: RpcResumeRequest,
		session: IRpcSession<TKey>,
		candidate: RpcResponderContinuityCandidate<TKey>,
	): Promise<void> {
		try {
			const responderNonce = this._options.cryptography.createRandomCarrier();
			responderNonce.bytes.fill(0);
			const rejectWithoutProof = Object.freeze({
				kind: RpcWireRecordKindEnum.reject,
				code: RpcResumeRejectCodeEnum.continuityFailure,
				responderNonce: responderNonce.value,
			}) as RpcJsonRecord;
			const proof = await attempt.runCrypto(() =>
				this._options.cryptography.signProof({
					kind: RpcProofOperationKindEnum.resumeReject,
					proofKey: candidate.proofKey,
					request,
					record: rejectWithoutProof,
				}),
			);
			if (
				!this._isCurrent(attempt) ||
				this._sessions.get(request.sessionId) !== session
			) {
				return;
			}
			if (attempt.claim() === undefined) {
				return;
			}
			let authority: ReturnType<IRpcSession<TKey>["commitContinuityFailure"]>;
			try {
				authority = session.commitContinuityFailure(candidate);
			} catch (error) {
				attempt.fail(error);
				return;
			}
			if (authority.kind === "discarded") {
				attempt.fail(authority.error);
				return;
			}
			const reject = Object.freeze({
				...rejectWithoutProof,
				proof,
			}) as RpcResumeReject;
			await attempt.send(this._options.codec.encode(reject));
		} catch {
			// The authoritative Session terminal remains selected.
		} finally {
			attempt.fail(new Error("Default RPC resume cursor violated continuity."));
		}
	}

	async _rejectFresh(
		attempt: IRpcBindingAttempt<TKey>,
		code: "unsupported-profile" | "admission-rejected",
	): Promise<void> {
		try {
			await attempt.send(
				this._options.codec.encode({
					kind: RpcWireRecordKindEnum.reject,
					code,
				}),
			);
		} finally {
			attempt.fail(new Error(`Default RPC fresh ${code}.`));
		}
	}

	_reserveFreshSession(attempt: IRpcBindingAttempt<TKey>): boolean {
		const state = this._attemptStates.get(attempt);
		if (state === undefined) {
			attempt.fail(new Error("Default RPC Acceptor attempt state was lost."));
			return false;
		}
		let reclaimedSession: IRpcSession<TKey> | undefined;
		let reclaimedSessionId: string | undefined;
		let earliestRecoveryDeadline = Number.POSITIVE_INFINITY;
		const reclaimAt = Date.now();
		const retainedAndReserved =
			this._sessions.size + this._freshSessionReservations;
		if (retainedAndReserved > this._host.policy.maxSessions) {
			return false;
		}
		if (retainedAndReserved === this._host.policy.maxSessions) {
			for (const [sessionId, session] of this._sessions) {
				const recoveryDeadline = session.recovery?.reclaimDeadline;
				if (
					recoveryDeadline !== undefined &&
					recoveryDeadline > reclaimAt &&
					recoveryDeadline < earliestRecoveryDeadline
				) {
					reclaimedSession = session;
					reclaimedSessionId = sessionId;
					earliestRecoveryDeadline = recoveryDeadline;
				}
			}
			if (reclaimedSession === undefined) {
				return false;
			}
		}
		this._freshSessionReservations += 1;
		const freshSessionLease = attempt.ownTemporary(() => {
			this._freshSessionReservations -= 1;
		});
		let protectedSessionReservation = this._host.reserveRetainedBytes(
			RPC_PROTECTED_SESSION_BYTES,
		);
		if (
			protectedSessionReservation === undefined &&
			reclaimedSession !== undefined
		) {
			if (reclaimedSessionId !== undefined) {
				this._sessions.delete(reclaimedSessionId);
			}
			reclaimedSession.terminateForced();
			reclaimedSession = undefined;
			reclaimedSessionId = undefined;
			protectedSessionReservation = this._host.reserveRetainedBytes(
				RPC_PROTECTED_SESSION_BYTES,
			);
		}
		if (protectedSessionReservation === undefined) {
			freshSessionLease.release();
			return false;
		}
		const protectedSessionLease = attempt.ownTemporary(() =>
			protectedSessionReservation.release(),
		);
		state.protectedSessionReservation = protectedSessionReservation;
		state.transferProtectedSessionReservation = () =>
			protectedSessionLease.transfer();
		if (reclaimedSession !== undefined) {
			if (reclaimedSessionId !== undefined) {
				this._sessions.delete(reclaimedSessionId);
			}
			reclaimedSession.terminateForced();
		}
		if (!this._isCurrent(attempt)) {
			protectedSessionLease.release();
			freshSessionLease.release();
			return false;
		}
		return true;
	}

	_reserveSessionId(attempt: IRpcBindingAttempt<TKey>): string | undefined {
		const state = this._attemptStates.get(attempt);
		if (state === undefined) {
			attempt.fail(new Error("Default RPC Acceptor attempt state was lost."));
			return undefined;
		}
		for (let candidateIndex = 0; candidateIndex < 8; candidateIndex += 1) {
			const candidate = this._options.cryptography.createRandomCarrier();
			candidate.bytes.fill(0);
			if (
				!this._sessions.has(candidate.value) &&
				!this._provisionalSessionIds.has(candidate.value)
			) {
				this._provisionalSessionIds.add(candidate.value);
				state.provisionalSessionId = candidate.value;
				attempt.ownTemporary(() =>
					this._provisionalSessionIds.delete(candidate.value),
				);
				return candidate.value;
			}
		}
		return undefined;
	}

	_isCurrent(attempt: IRpcBindingAttempt<TKey>): boolean {
		return attempt.pending && this._attempts.has(attempt) && !this._closing;
	}

	async _installBinding(
		attempt: IRpcBindingAttempt<TKey>,
		session: IRpcSession<TKey>,
		sessionId: string,
		candidate: RpcBindingCandidate<TKey>,
		reply: Uint8Array,
	): Promise<void> {
		const provisional = attempt.holdsProvisionalSession(session);
		const retainedSession = this._sessions.get(sessionId);
		if (
			!this._isCurrent(attempt) ||
			(provisional
				? retainedSession !== undefined
				: retainedSession !== session)
		) {
			attempt.fail(new Error("Default RPC Acceptor Session owner changed."));
			return;
		}
		const endpoint = attempt.claim();
		if (endpoint === undefined) {
			return;
		}
		let commit: ReturnType<IRpcSession<TKey>["commitBinding"]>;
		try {
			commit = session.commitBinding(candidate, endpoint);
		} catch (error) {
			attempt.fail(error);
			return;
		}
		if (commit.kind === "discarded") {
			attempt.fail(commit.error);
			return;
		}
		if (!attempt.transferProvisionalSession(session)) {
			attempt.failInstalledBinding(
				commit.binding,
				new Error("Default RPC provisional Session transfer failed."),
			);
			return;
		}
		this._sessions.set(sessionId, session);
		await attempt.transferBinding(commit.binding, reply);
	}
}
