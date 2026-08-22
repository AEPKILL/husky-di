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
import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import { RpcPeerCursorClassificationEnum } from "@/enums/protocol/rpc-peer-cursor-classification.enum";
import { RpcProofOperationKindEnum } from "@/enums/protocol/rpc-proof-operation-kind.enum";
import { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { IRpcEndpoint } from "@/interfaces/protocol/rpc-endpoint.interface";
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

interface IRpcAttempt<TKey> {
	readonly endpoint: IRpcEndpoint;
	readonly signal: AbortSignal;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
	cryptoJobCount: number;
	resourcesFinished: boolean;
	releaseHandshakeSlot?: () => void;
	freshSessionReserved?: boolean;
	protectedSessionReservation?: IRpcRetainedBytesReservation;
	provisionalSessionId?: string;
	timer?: ReturnType<typeof setTimeout>;
	removeAbortListener?: () => void;
	settled: boolean;
	session?: IRpcSession<TKey>;
}

interface IRpcConnectorAttempt<TKey> extends IRpcAttempt<TKey> {
	readonly mode: "fresh" | "resume";
	request?: RpcFreshRequest | RpcResumeRequest;
	requestAdmission?: Promise<void>;
}

function createEndpoint<TKey>(
	factory: CreateRpcProtocolOptions<TKey>["createEndpoint"],
	connection: IRpcConnection,
	onMessage: (
		endpoint: IRpcEndpoint,
		message: Uint8Array,
	) => Promise<void> | void,
	onFailure: (
		endpoint: IRpcEndpoint,
		reason: RpcEndpointFailureEnum,
		error?: Error,
	) => void,
	reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined,
): IRpcEndpoint {
	let endpoint: IRpcEndpoint | undefined;
	let earlyFailure:
		| { readonly reason: RpcEndpointFailureEnum; readonly error?: Error }
		| undefined;
	endpoint = factory({
		connection,
		reserveRetainedBytes,
		onMessage: (message) => onMessage(endpoint as IRpcEndpoint, message),
		onFailure: (reason, error) => {
			if (endpoint === undefined) {
				earlyFailure = error === undefined ? { reason } : { reason, error };
				return;
			}
			onFailure(endpoint, reason, error);
		},
	});
	if (earlyFailure !== undefined) {
		const failure = earlyFailure;
		queueMicrotask(() =>
			onFailure(endpoint as IRpcEndpoint, failure.reason, failure.error),
		);
	}
	return endpoint;
}

function closeUnboundConnection(connection: IRpcConnection): void {
	queueMicrotask(() => {
		void Promise.try(() => connection.close()).catch(() => {
			// A pre-bootstrap Connection has no Session authority to report against.
		});
	});
}

function installAttemptAbort<TKey>(
	attempt: IRpcAttempt<TKey>,
	onAbort: () => void,
): void {
	if (attempt.signal.aborted) {
		queueMicrotask(onAbort);
		return;
	}
	attempt.signal.addEventListener("abort", onAbort, { once: true });
	attempt.removeAbortListener = () =>
		attempt.signal.removeEventListener("abort", onAbort);
}

function clearAttempt<TKey>(attempt: IRpcAttempt<TKey>): void {
	if (attempt.timer !== undefined) {
		clearTimeout(attempt.timer);
		attempt.timer = undefined;
	}
	attempt.removeAbortListener?.();
	attempt.removeAbortListener = undefined;
}

function releaseAttemptResources<TKey>(attempt: IRpcAttempt<TKey>): void {
	if (!attempt.resourcesFinished || attempt.cryptoJobCount !== 0) {
		return;
	}
	const releaseHandshakeSlot = attempt.releaseHandshakeSlot;
	attempt.releaseHandshakeSlot = undefined;
	releaseHandshakeSlot?.();
}

function finishAttemptResources<TKey>(attempt: IRpcAttempt<TKey>): void {
	attempt.resourcesFinished = true;
	releaseAttemptResources(attempt);
}

function releaseProtectedSessionReservation<TKey>(
	attempt: IRpcAttempt<TKey>,
): void {
	const reservation = attempt.protectedSessionReservation;
	attempt.protectedSessionReservation = undefined;
	reservation?.release();
}

function reserveAttemptRetainedBytes<TKey>(
	attempt: IRpcAttempt<TKey>,
	host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
	bytes: number,
): IRpcRetainedBytesReservation | undefined {
	return attempt.session === undefined
		? host.reserveRetainedBytes(bytes)
		: attempt.session.reserveRetainedBytes(bytes);
}

async function runAttemptCrypto<TKey, T>(
	attempt: IRpcAttempt<TKey>,
	operation: () => Promise<T>,
): Promise<T> {
	attempt.cryptoJobCount += 1;
	try {
		return await operation();
	} finally {
		attempt.cryptoJobCount -= 1;
		releaseAttemptResources(attempt);
	}
}

/** Active one-to-one Default Protocol runtime. */
class RpcConnectorRuntime<TKey> implements IRpcProtocolConnectorRuntime {
	readonly _host: IRpcProtocolConnectorHost;
	readonly _options: Readonly<CreateRpcProtocolOptions<TKey>>;
	_attempt: IRpcConnectorAttempt<TKey> | undefined;
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
		if (retainedSession !== undefined && !retainedSession.isRecovering) {
			return Promise.reject(
				new Error("Default RPC Connector Session is not recovering."),
			);
		}
		const mode = retainedSession === undefined ? "fresh" : "resume";

		const { promise: task, reject, resolve } = Promise.withResolvers<void>();
		this._handshakeSlotsInUse += 1;
		let attempt: IRpcConnectorAttempt<TKey>;
		let endpoint: IRpcEndpoint;
		try {
			endpoint = createEndpoint(
				this._options.createEndpoint,
				connection,
				(_endpoint, message) => this._receiveConnectorRecord(attempt, message),
				(_endpoint, reason, error) =>
					this._connectorEndpointFailed(attempt, reason, error),
				(bytes) => reserveAttemptRetainedBytes(attempt, this._host, bytes),
			);
		} catch (error) {
			this._handshakeSlotsInUse -= 1;
			closeUnboundConnection(connection);
			reject(error);
			return task;
		}
		attempt = {
			endpoint,
			signal,
			resolve,
			reject,
			cryptoJobCount: 0,
			resourcesFinished: false,
			releaseHandshakeSlot: () => {
				this._handshakeSlotsInUse -= 1;
			},
			settled: false,
			mode,
			session: retainedSession,
		};
		this._attempt = attempt;
		attempt.timer = setTimeout(
			() =>
				this._failAttempt(
					attempt,
					new Error("Default RPC fresh binding attempt timed out."),
				),
			this._host.policy.bindingAttemptTimeoutMs,
		);
		installAttemptAbort(attempt, () =>
			this._failAttempt(
				attempt,
				new Error("Default RPC fresh binding was aborted."),
			),
		);
		queueMicrotask(() =>
			mode === "fresh"
				? this._startFresh(attempt)
				: void this._startResume(attempt),
		);
		return task;
	}

	shutdown(): Promise<void> {
		this._closing = true;
		if (this._attempt !== undefined) {
			this._failAttempt(
				this._attempt,
				new Error("Default RPC Connector is shutting down."),
			);
		}
		return this._session?.shutdown() ?? Promise.resolve();
	}

	close(): void {
		this._closing = true;
		if (this._attempt !== undefined) {
			this._failAttempt(
				this._attempt,
				new Error("Default RPC Connector was closed."),
			);
		}
		this._session?.forceClose();
	}

	cleanup(): Promise<void> {
		this._cleanupTask ??= Promise.resolve();
		return this._cleanupTask;
	}

	_startFresh(attempt: IRpcConnectorAttempt<TKey>): void {
		if (!this._isCurrent(attempt)) {
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
			this._failAttempt(attempt, error);
			return;
		}
		attempt.request = request;
		attempt.requestAdmission = attempt.endpoint.sendNow(encoded);
		void attempt.requestAdmission.catch((error) =>
			this._failAttempt(attempt, error),
		);
	}

	async _startResume(attempt: IRpcConnectorAttempt<TKey>): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const session = attempt.session;
		const proofKey = session?.proofKey;
		if (session === undefined || proofKey === undefined) {
			this._failAttempt(attempt, new Error("Default RPC proof key was lost."));
			return;
		}
		try {
			const resumeAttempt = session.consumeResumeAttempt();
			const initiatorNonce = this._options.cryptography.createRandomCarrier();
			initiatorNonce.bytes.fill(0);
			const requestWithoutProof = Object.freeze({
				kind: RpcWireRecordKindEnum.resume,
				profile: RPC_PROFILE,
				sessionId: session.sessionId,
				receivedThrough: session.receivedThrough,
				resumeAttempt,
				initiatorNonce: initiatorNonce.value,
			}) as RpcJsonRecord;
			const proof = await runAttemptCrypto(attempt, () =>
				this._options.cryptography.signProof({
					kind: RpcProofOperationKindEnum.resumeRequest,
					proofKey,
					record: requestWithoutProof,
				}),
			);
			if (
				!this._isCurrent(attempt) ||
				attempt.session !== session ||
				!session.isRecovering ||
				session.proofKey !== proofKey
			) {
				return;
			}
			const request = Object.freeze({
				...requestWithoutProof,
				proof,
			}) as RpcResumeRequest;
			attempt.request = request;
			attempt.requestAdmission = attempt.endpoint.sendNow(
				this._options.codec.encode(request),
			);
			void attempt.requestAdmission.catch((error) =>
				this._failAttempt(attempt, error),
			);
		} catch (error) {
			this._failAttempt(attempt, error);
		}
	}

	_receiveConnectorRecord(
		attempt: IRpcConnectorAttempt<TKey>,
		bytes: Uint8Array,
	): Promise<void> | void {
		if (attempt.settled) {
			attempt.session?.receive(attempt.endpoint, bytes);
			return;
		}
		return attempt.mode === "fresh"
			? this._receiveFreshAccept(attempt, bytes)
			: this._receiveResumeOutcome(attempt, bytes);
	}

	async _receiveFreshAccept(
		attempt: IRpcConnectorAttempt<TKey>,
		bytes: Uint8Array,
	): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const request = attempt.request;
		const requestAdmission = attempt.requestAdmission;
		if (
			request === undefined ||
			request.kind !== RpcWireRecordKindEnum.fresh ||
			requestAdmission === undefined
		) {
			this._failAttempt(
				attempt,
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
			const proofKey = await runAttemptCrypto(attempt, () =>
				this._options.cryptography.deriveProofKey(
					this._options.cryptography.decodeBase64Url32(accept.sessionSecret),
					accept.sessionId,
				),
			);
			if (!this._isCurrent(attempt)) {
				return;
			}
			const valid = await runAttemptCrypto(attempt, () =>
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
			attempt.protectedSessionReservation = protectedSessionReservation;

			const session = this._options.createSession({
				host: this._host,
				sessionId: accept.sessionId,
				proofKey,
				codec: this._options.codec,
				onTerminal: (terminal) => {
					protectedSessionReservation.release();
					if (this._session === terminal) {
						this._session = undefined;
					}
				},
				counterExhausted: this._options.counterExhausted,
			});
			session.installBinding(attempt.endpoint, accept.bindingEpoch, 0);
			const sessionHost = this._host.attachSession(session);
			if (sessionHost === undefined || !this._isCurrent(attempt)) {
				session.forceClose();
				throw new Error(
					"Framework rejected the Default RPC Connector Session.",
				);
			}
			session.installHost(sessionHost);
			attempt.session = session;
			this._session = session;
			attempt.protectedSessionReservation = undefined;
			session.activateBinding();
			this._succeedAttempt(attempt);
		} catch (error) {
			this._failAttempt(attempt, error);
		}
	}

	async _receiveResumeOutcome(
		attempt: IRpcConnectorAttempt<TKey>,
		bytes: Uint8Array,
	): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const session = attempt.session;
		const request = attempt.request;
		const requestAdmission = attempt.requestAdmission;
		const proofKey = session?.proofKey;
		if (
			session === undefined ||
			proofKey === undefined ||
			request === undefined ||
			request.kind !== RpcWireRecordKindEnum.resume ||
			requestAdmission === undefined
		) {
			this._failAttempt(
				attempt,
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
				const valid = await runAttemptCrypto(attempt, () =>
					this._options.cryptography.verifyProof({
						kind: RpcProofOperationKindEnum.resumeReject,
						proofKey,
						request,
						record: outcome,
					}),
				);
				if (!valid || !this._isCurrent(attempt)) {
					throw new Error(
						"Default RPC authenticated resume reject is invalid.",
					);
				}
				if (outcome.code === RpcResumeRejectCodeEnum.continuityFailure) {
					session.terminateContinuityFailure();
				} else {
					session.terminateAuthenticatedRemote();
				}
				throw new Error(`Default RPC resume ended with ${outcome.code}.`);
			}

			const valid = await runAttemptCrypto(attempt, () =>
				this._options.cryptography.verifyProof({
					kind: RpcProofOperationKindEnum.resumeAccept,
					proofKey,
					request,
					record: outcome,
				}),
			);
			if (!valid || !this._isCurrent(attempt)) {
				throw new Error("Default RPC resume accept proof is invalid or stale.");
			}
			const contradictory =
				outcome.profile !== RPC_PROFILE ||
				outcome.sessionId !== session.sessionId ||
				outcome.bindingEpoch <= session.bindingEpoch ||
				session.classifyPeerCursor(outcome.receivedThrough) !==
					RpcPeerCursorClassificationEnum.valid ||
				!session.isRecovering ||
				session.proofKey !== proofKey;
			if (contradictory) {
				session.terminateContinuityFailure();
				throw new Error(
					"Default RPC resume accept contradicts retained state.",
				);
			}
			session.installBinding(
				attempt.endpoint,
				outcome.bindingEpoch,
				outcome.receivedThrough,
			);
			session.activateBinding();
			this._succeedAttempt(attempt);
		} catch (error) {
			this._failAttempt(attempt, error);
		}
	}

	_connectorEndpointFailed(
		attempt: IRpcConnectorAttempt<TKey>,
		reason: RpcEndpointFailureEnum,
		error?: Error,
	): void {
		const session = attempt.session;
		if (session?.ownsEndpoint(attempt.endpoint)) {
			session.endpointFailed(attempt.endpoint, reason, error);
			if (!attempt.settled) {
				this._failAttempt(attempt, error);
			}
			return;
		}
		this._failAttempt(
			attempt,
			error ?? new Error(`Default RPC fresh endpoint failed: ${reason}.`),
		);
	}

	_isCurrent(attempt: IRpcConnectorAttempt<TKey>): boolean {
		return !attempt.settled && this._attempt === attempt && !this._closing;
	}

	_succeedAttempt(attempt: IRpcConnectorAttempt<TKey>): void {
		if (!this._isCurrent(attempt)) {
			return;
		}
		attempt.settled = true;
		clearAttempt(attempt);
		this._attempt = undefined;
		finishAttemptResources(attempt);
		attempt.resolve();
	}

	_failAttempt(attempt: IRpcConnectorAttempt<TKey>, error: unknown): void {
		if (attempt.settled) {
			return;
		}
		attempt.settled = true;
		clearAttempt(attempt);
		if (this._attempt === attempt) {
			this._attempt = undefined;
		}
		finishAttemptResources(attempt);
		releaseProtectedSessionReservation(attempt);
		attempt.endpoint.fenceAndClose();
		attempt.reject(
			error instanceof Error
				? error
				: new Error("Default RPC fresh binding failed."),
		);
	}
}

/** Passive one-to-many Default Protocol runtime. */
class RpcAcceptorRuntime<TKey> implements IRpcProtocolAcceptorRuntime {
	readonly _host: IRpcProtocolAcceptorHost;
	readonly _options: Readonly<CreateRpcProtocolOptions<TKey>>;
	readonly _attempts = new Set<IRpcAttempt<TKey>>();
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

		const { promise: task, reject, resolve } = Promise.withResolvers<void>();
		let attempt: IRpcAttempt<TKey>;
		let endpoint: IRpcEndpoint;
		try {
			endpoint = createEndpoint(
				this._options.createEndpoint,
				connection,
				(_endpoint, message) => this._receiveBootstrap(attempt, message),
				(_endpoint, reason, error) =>
					this._acceptorEndpointFailed(attempt, reason, error),
				(bytes) => reserveAttemptRetainedBytes(attempt, this._host, bytes),
			);
		} catch (error) {
			this._handshakeSlotsInUse -= 1;
			closeUnboundConnection(connection);
			reject(error);
			return task;
		}
		attempt = {
			endpoint,
			signal,
			resolve,
			reject,
			cryptoJobCount: 0,
			resourcesFinished: false,
			releaseHandshakeSlot: () => {
				this._handshakeSlotsInUse -= 1;
			},
			settled: false,
		};
		this._attempts.add(attempt);
		attempt.timer = setTimeout(
			() =>
				this._acceptorEndpointFailed(
					attempt,
					RpcEndpointFailureEnum.connection,
					new Error("Default RPC fresh acceptance timed out."),
				),
			this._host.policy.bindingAttemptTimeoutMs,
		);
		installAttemptAbort(attempt, () =>
			this._acceptorEndpointFailed(
				attempt,
				RpcEndpointFailureEnum.connection,
				new Error("Default RPC fresh acceptance was aborted."),
			),
		);
		return task;
	}

	shutdown(): Promise<void> {
		this._closing = true;
		for (const attempt of [...this._attempts]) {
			this._failAttempt(
				attempt,
				new Error("Default RPC Acceptor is shutting down."),
			);
		}
		return Promise.all(
			[...this._sessions.values()].map((session) => session.shutdown()),
		).then(() => {});
	}

	close(): void {
		this._closing = true;
		for (const attempt of [...this._attempts]) {
			this._failAttempt(attempt, new Error("Default RPC Acceptor was closed."));
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
		attempt: IRpcAttempt<TKey>,
		bytes: Uint8Array,
	): Promise<void> | void {
		if (attempt.settled) {
			attempt.session?.receive(attempt.endpoint, bytes);
			return;
		}
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
			this._failAttempt(attempt, error);
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.fresh) {
			return this._receiveFreshRequest(attempt, record);
		}
		return this._receiveResumeRequest(attempt, record);
	}

	async _receiveFreshRequest(
		attempt: IRpcAttempt<TKey>,
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
				this._failAttempt(attempt, new Error("Default RPC Session ID failed."));
				return;
			}
			const secret = this._options.cryptography.createRandomCarrier();
			const responderNonce = this._options.cryptography.createRandomCarrier();
			responderNonce.bytes.fill(0);
			const proofKey = await runAttemptCrypto(attempt, () =>
				this._options.cryptography.deriveProofKey(secret.bytes, sessionId),
			);
			if (
				!this._isCurrent(attempt) ||
				attempt.provisionalSessionId !== sessionId
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
			const proof = await runAttemptCrypto(attempt, () =>
				this._options.cryptography.signProof({
					kind: RpcProofOperationKindEnum.freshAccept,
					proofKey,
					request,
					record: acceptWithoutProof,
				}),
			);
			if (
				!this._isCurrent(attempt) ||
				attempt.provisionalSessionId !== sessionId
			) {
				return;
			}
			const accept = Object.freeze({
				...acceptWithoutProof,
				proof,
			}) as RpcFreshAccept;
			const protectedSessionReservation = attempt.protectedSessionReservation;
			if (protectedSessionReservation === undefined) {
				throw new Error("Default RPC protected Session reservation was lost.");
			}
			const session = this._options.createSession({
				host: this._host,
				sessionId,
				proofKey,
				codec: this._options.codec,
				onTerminal: (terminal) => {
					protectedSessionReservation.release();
					if (this._sessions.get(terminal.sessionId) === terminal) {
						this._sessions.delete(terminal.sessionId);
					}
				},
				counterExhausted: this._options.counterExhausted,
			});
			const sessionHost = this._host.admitSession(session);
			if (sessionHost === undefined || !this._isCurrent(attempt)) {
				session.forceClose();
				await this._rejectFresh(attempt, "admission-rejected");
				return;
			}
			session.installHost(sessionHost);
			session.installBinding(attempt.endpoint, 1, 0);
			attempt.session = session;
			this._sessions.set(sessionId, session);
			attempt.protectedSessionReservation = undefined;
			this._releaseProvisionalSessionId(attempt);
			this._releaseFreshSession(attempt);
			try {
				await attempt.endpoint.sendNow(this._options.codec.encode(accept));
			} catch (error) {
				session.endpointFailed(
					attempt.endpoint,
					RpcEndpointFailureEnum.connection,
					error instanceof Error ? error : undefined,
				);
				this._failAttempt(attempt, error, true);
				return;
			}
			if (!this._isCurrent(attempt)) {
				return;
			}
			session.activateBinding();
			this._succeedAttempt(attempt);
		} catch (error) {
			this._failAttempt(attempt, error);
		}
	}

	async _receiveResumeRequest(
		attempt: IRpcAttempt<TKey>,
		request: RpcResumeRequest,
	): Promise<void> {
		const session = this._sessions.get(request.sessionId);
		const proofKey = session?.proofKey;
		if (
			session === undefined ||
			proofKey === undefined ||
			request.profile !== RPC_PROFILE
		) {
			await this._rejectResumeGeneric(attempt, request);
			return;
		}

		let proofValid = false;
		try {
			proofValid = await runAttemptCrypto(attempt, () =>
				this._options.cryptography.verifyProof({
					kind: RpcProofOperationKindEnum.resumeRequest,
					proofKey,
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
			return;
		}
		if (
			!proofValid ||
			session.proofKey !== proofKey ||
			!session.canAcceptResumeAttempt(request.resumeAttempt)
		) {
			await this._rejectResumeGeneric(attempt, request);
			return;
		}
		if (
			session.classifyPeerCursor(request.receivedThrough) !==
			RpcPeerCursorClassificationEnum.valid
		) {
			await this._rejectResumeContinuity(attempt, request, session, proofKey);
			return;
		}
		await this._acceptResume(attempt, request, session, proofKey);
	}

	async _acceptResume(
		attempt: IRpcAttempt<TKey>,
		request: RpcResumeRequest,
		session: IRpcSession<TKey>,
		proofKey: TKey,
	): Promise<void> {
		for (;;) {
			if (
				!this._isCurrent(attempt) ||
				this._sessions.get(request.sessionId) !== session ||
				session.proofKey !== proofKey
			) {
				return;
			}
			if (!session.canAcceptResumeAttempt(request.resumeAttempt)) {
				await this._rejectResumeGeneric(attempt, request);
				return;
			}
			if (
				session.classifyPeerCursor(request.receivedThrough) !==
				RpcPeerCursorClassificationEnum.valid
			) {
				await this._rejectResumeContinuity(attempt, request, session, proofKey);
				return;
			}
			const bindingEpoch = session.bindingEpoch + 1;
			const receivedThrough = session.receivedThrough;
			const responderNonce = this._options.cryptography.createRandomCarrier();
			responderNonce.bytes.fill(0);
			const acceptWithoutProof = Object.freeze({
				kind: RpcWireRecordKindEnum.accept,
				profile: RPC_PROFILE,
				sessionId: session.sessionId,
				bindingEpoch,
				receivedThrough,
				responderNonce: responderNonce.value,
			}) as RpcJsonRecord;
			const proof = await runAttemptCrypto(attempt, () =>
				this._options.cryptography.signProof({
					kind: RpcProofOperationKindEnum.resumeAccept,
					proofKey,
					request,
					record: acceptWithoutProof,
				}),
			);
			if (
				!this._isCurrent(attempt) ||
				this._sessions.get(request.sessionId) !== session ||
				session.proofKey !== proofKey
			) {
				return;
			}
			if (!session.canAcceptResumeAttempt(request.resumeAttempt)) {
				await this._rejectResumeGeneric(attempt, request);
				return;
			}
			if (
				session.classifyPeerCursor(request.receivedThrough) !==
				RpcPeerCursorClassificationEnum.valid
			) {
				await this._rejectResumeContinuity(attempt, request, session, proofKey);
				return;
			}
			if (
				session.bindingEpoch + 1 !== bindingEpoch ||
				session.receivedThrough !== receivedThrough
			) {
				continue;
			}
			const accept = Object.freeze({
				...acceptWithoutProof,
				proof,
			}) as RpcResumeAccept;
			try {
				const installedEpoch = session.acceptResumeBinding(
					attempt.endpoint,
					request.resumeAttempt,
					request.receivedThrough,
				);
				if (installedEpoch !== bindingEpoch) {
					throw new Error(
						"Default RPC Binding Epoch changed at linearization.",
					);
				}
				attempt.session = session;
				await attempt.endpoint.sendNow(this._options.codec.encode(accept));
			} catch (error) {
				if (session.ownsEndpoint(attempt.endpoint)) {
					session.endpointFailed(
						attempt.endpoint,
						RpcEndpointFailureEnum.connection,
						error instanceof Error ? error : undefined,
					);
				}
				this._failAttempt(attempt, error, true);
				return;
			}
			if (
				!this._isCurrent(attempt) ||
				!session.ownsEndpoint(attempt.endpoint)
			) {
				return;
			}
			session.activateBinding();
			this._succeedAttempt(attempt);
			return;
		}
	}

	async _rejectResumeGeneric(
		attempt: IRpcAttempt<TKey>,
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
			const proof = await runAttemptCrypto(attempt, () =>
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
			await attempt.endpoint.sendNow(this._options.codec.encode(reject));
		} catch {
			// Generic rejection remains attempt-scoped even if its Connection fails.
		} finally {
			this._failAttempt(
				attempt,
				new Error("Default RPC resume was generically rejected."),
			);
		}
	}

	async _rejectResumeContinuity(
		attempt: IRpcAttempt<TKey>,
		request: RpcResumeRequest,
		session: IRpcSession<TKey>,
		proofKey: TKey,
	): Promise<void> {
		try {
			const responderNonce = this._options.cryptography.createRandomCarrier();
			responderNonce.bytes.fill(0);
			const rejectWithoutProof = Object.freeze({
				kind: RpcWireRecordKindEnum.reject,
				code: RpcResumeRejectCodeEnum.continuityFailure,
				responderNonce: responderNonce.value,
			}) as RpcJsonRecord;
			const proof = await runAttemptCrypto(attempt, () =>
				this._options.cryptography.signProof({
					kind: RpcProofOperationKindEnum.resumeReject,
					proofKey,
					request,
					record: rejectWithoutProof,
				}),
			);
			if (
				!this._isCurrent(attempt) ||
				this._sessions.get(request.sessionId) !== session ||
				session.proofKey !== proofKey ||
				!session.canAcceptResumeAttempt(request.resumeAttempt) ||
				session.classifyPeerCursor(request.receivedThrough) ===
					RpcPeerCursorClassificationEnum.valid
			) {
				return;
			}
			const reject = Object.freeze({
				...rejectWithoutProof,
				proof,
			}) as RpcResumeReject;
			session.terminateContinuityFailure();
			await attempt.endpoint.sendNow(this._options.codec.encode(reject));
		} catch {
			// The authoritative Session terminal remains selected.
		} finally {
			this._failAttempt(
				attempt,
				new Error("Default RPC resume cursor violated continuity."),
			);
		}
	}

	async _rejectFresh(
		attempt: IRpcAttempt<TKey>,
		code: "unsupported-profile" | "admission-rejected",
	): Promise<void> {
		try {
			await attempt.endpoint.sendNow(
				this._options.codec.encode({
					kind: RpcWireRecordKindEnum.reject,
					code,
				}),
			);
		} finally {
			this._failAttempt(attempt, new Error(`Default RPC fresh ${code}.`));
		}
	}

	_reserveFreshSession(attempt: IRpcAttempt<TKey>): boolean {
		let reclaimedSession: IRpcSession<TKey> | undefined;
		let earliestRecoveryDeadline = Number.POSITIVE_INFINITY;
		const reclaimAt = Date.now();
		const retainedAndReserved =
			this._sessions.size + this._freshSessionReservations;
		if (retainedAndReserved > this._host.policy.maxSessions) {
			return false;
		}
		if (retainedAndReserved === this._host.policy.maxSessions) {
			for (const session of this._sessions.values()) {
				const recoveryDeadline = session.recoveryReclaimDeadline;
				if (
					recoveryDeadline !== undefined &&
					recoveryDeadline > reclaimAt &&
					recoveryDeadline < earliestRecoveryDeadline
				) {
					reclaimedSession = session;
					earliestRecoveryDeadline = recoveryDeadline;
				}
			}
			if (reclaimedSession === undefined) {
				return false;
			}
		}
		this._freshSessionReservations += 1;
		attempt.freshSessionReserved = true;
		let protectedSessionReservation = this._host.reserveRetainedBytes(
			RPC_PROTECTED_SESSION_BYTES,
		);
		if (
			protectedSessionReservation === undefined &&
			reclaimedSession !== undefined
		) {
			this._sessions.delete(reclaimedSession.sessionId);
			reclaimedSession.terminateForced();
			reclaimedSession = undefined;
			protectedSessionReservation = this._host.reserveRetainedBytes(
				RPC_PROTECTED_SESSION_BYTES,
			);
		}
		if (protectedSessionReservation === undefined) {
			this._releaseFreshSession(attempt);
			return false;
		}
		attempt.protectedSessionReservation = protectedSessionReservation;
		if (reclaimedSession !== undefined) {
			this._sessions.delete(reclaimedSession.sessionId);
			reclaimedSession.terminateForced();
		}
		if (!this._isCurrent(attempt)) {
			releaseProtectedSessionReservation(attempt);
			this._releaseFreshSession(attempt);
			return false;
		}
		return true;
	}

	_releaseFreshSession(attempt: IRpcAttempt<TKey>): void {
		if (attempt.freshSessionReserved !== true) {
			return;
		}
		attempt.freshSessionReserved = false;
		this._freshSessionReservations -= 1;
	}

	_reserveSessionId(attempt: IRpcAttempt<TKey>): string | undefined {
		for (let candidateIndex = 0; candidateIndex < 8; candidateIndex += 1) {
			const candidate = this._options.cryptography.createRandomCarrier();
			candidate.bytes.fill(0);
			if (
				!this._sessions.has(candidate.value) &&
				!this._provisionalSessionIds.has(candidate.value)
			) {
				this._provisionalSessionIds.add(candidate.value);
				attempt.provisionalSessionId = candidate.value;
				return candidate.value;
			}
		}
		return undefined;
	}

	_releaseProvisionalSessionId(attempt: IRpcAttempt<TKey>): void {
		const sessionId = attempt.provisionalSessionId;
		attempt.provisionalSessionId = undefined;
		if (sessionId !== undefined) {
			this._provisionalSessionIds.delete(sessionId);
		}
	}

	_acceptorEndpointFailed(
		attempt: IRpcAttempt<TKey>,
		reason: RpcEndpointFailureEnum,
		error?: Error,
	): void {
		const session = attempt.session;
		if (session?.ownsEndpoint(attempt.endpoint)) {
			session.endpointFailed(attempt.endpoint, reason, error);
			if (!attempt.settled) {
				this._failAttempt(attempt, error, true);
			}
			return;
		}
		this._failAttempt(
			attempt,
			error ?? new Error(`Default RPC fresh endpoint failed: ${reason}.`),
		);
	}

	_isCurrent(attempt: IRpcAttempt<TKey>): boolean {
		return !attempt.settled && this._attempts.has(attempt) && !this._closing;
	}

	_succeedAttempt(attempt: IRpcAttempt<TKey>): void {
		if (!this._isCurrent(attempt)) {
			return;
		}
		attempt.settled = true;
		clearAttempt(attempt);
		this._attempts.delete(attempt);
		this._releaseProvisionalSessionId(attempt);
		this._releaseFreshSession(attempt);
		releaseProtectedSessionReservation(attempt);
		finishAttemptResources(attempt);
		attempt.resolve();
	}

	_failAttempt(
		attempt: IRpcAttempt<TKey>,
		error: unknown,
		retainSession = false,
	): void {
		if (attempt.settled) {
			return;
		}
		attempt.settled = true;
		clearAttempt(attempt);
		this._attempts.delete(attempt);
		this._releaseProvisionalSessionId(attempt);
		this._releaseFreshSession(attempt);
		releaseProtectedSessionReservation(attempt);
		finishAttemptResources(attempt);
		if (!retainSession) {
			attempt.endpoint.fenceAndClose();
		}
		attempt.reject(
			error instanceof Error
				? error
				: new Error("Default RPC fresh acceptance failed."),
		);
	}
}
