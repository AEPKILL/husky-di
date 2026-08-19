/**
 * @overview Private built-in husky-di-rpc/1 Protocol role runtimes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
import type {
	IRpcProtocol,
	IRpcProtocolAcceptorHost,
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorHost,
	IRpcProtocolConnectorRuntime,
} from "@/interfaces/rpc-protocol.interface";
import {
	decodeDefaultRpcRecord,
	encodeDefaultRpcRecord,
	readDefaultRpcRecordKind,
	validateDefaultRpcFreshAccept,
	validateDefaultRpcFreshRequest,
	validateDefaultRpcResumeOutcome,
	validateDefaultRpcResumeRequest,
} from "@/protocols/default/default-rpc-codec.util";
import {
	createDefaultRpcGenericRejectProof,
	createDefaultRpcRandomCarrier,
	decodeDefaultRpcBase64Url32,
	deriveDefaultRpcProofKey,
	signDefaultRpcAuthenticatedReject,
	signDefaultRpcFreshAccept,
	signDefaultRpcResumeAccept,
	signDefaultRpcResumeRequest,
	verifyDefaultRpcAuthenticatedReject,
	verifyDefaultRpcFreshAccept,
	verifyDefaultRpcResumeAccept,
	verifyDefaultRpcResumeRequest,
} from "@/protocols/default/default-rpc-crypto.util";
import {
	DefaultRpcEndpoint,
	type DefaultRpcEndpointFailure,
} from "@/protocols/default/default-rpc-endpoint.impl";
import { DEFAULT_RPC_PROFILE_ID } from "@/protocols/default/default-rpc-profile.const";
import type {
	DefaultRpcFreshAccept,
	DefaultRpcFreshRequest,
	DefaultRpcJsonRecord,
	DefaultRpcResumeAccept,
	DefaultRpcResumeReject,
	DefaultRpcResumeRequest,
} from "@/protocols/default/default-rpc-record.type";
import { DefaultRpcSession } from "@/protocols/default/default-rpc-session.impl";

interface IDefaultRpcAttempt {
	readonly endpoint: DefaultRpcEndpoint;
	readonly signal: AbortSignal;
	readonly task: Promise<void>;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
	cryptoJobCount: number;
	resourcesFinished: boolean;
	releaseHandshakeSlot?: () => void;
	freshSessionReserved?: boolean;
	provisionalSessionId?: string;
	timer?: ReturnType<typeof setTimeout>;
	removeAbortListener?: () => void;
	settled: boolean;
	session?: DefaultRpcSession;
}

interface IDefaultRpcConnectorAttempt extends IDefaultRpcAttempt {
	readonly mode: "fresh" | "resume";
	request?: DefaultRpcFreshRequest | DefaultRpcResumeRequest;
	requestAdmission?: Promise<void>;
}

function createEndpoint(
	connection: IRpcConnection,
	onMessage: (
		endpoint: DefaultRpcEndpoint,
		message: Uint8Array,
	) => Promise<void> | void,
	onFailure: (
		endpoint: DefaultRpcEndpoint,
		reason: DefaultRpcEndpointFailure,
		error?: Error,
	) => void,
): DefaultRpcEndpoint {
	let endpoint: DefaultRpcEndpoint | undefined;
	let earlyFailure:
		| { readonly reason: DefaultRpcEndpointFailure; readonly error?: Error }
		| undefined;
	endpoint = new DefaultRpcEndpoint(
		connection,
		(message) => onMessage(endpoint as DefaultRpcEndpoint, message),
		(reason, error) => {
			if (endpoint === undefined) {
				earlyFailure = error === undefined ? { reason } : { reason, error };
				return;
			}
			onFailure(endpoint, reason, error);
		},
	);
	if (earlyFailure !== undefined) {
		const failure = earlyFailure;
		queueMicrotask(() =>
			onFailure(endpoint as DefaultRpcEndpoint, failure.reason, failure.error),
		);
	}
	return endpoint;
}

function closeUnboundConnection(connection: IRpcConnection): void {
	queueMicrotask(() => {
		try {
			void Promise.resolve(connection.close()).catch(() => {});
		} catch {
			// A pre-bootstrap Connection has no Session authority to report against.
		}
	});
}

function installAttemptAbort(
	attempt: IDefaultRpcAttempt,
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

function clearAttempt(attempt: IDefaultRpcAttempt): void {
	if (attempt.timer !== undefined) {
		clearTimeout(attempt.timer);
		attempt.timer = undefined;
	}
	attempt.removeAbortListener?.();
	attempt.removeAbortListener = undefined;
}

function releaseAttemptResources(attempt: IDefaultRpcAttempt): void {
	if (!attempt.resourcesFinished || attempt.cryptoJobCount !== 0) {
		return;
	}
	const releaseHandshakeSlot = attempt.releaseHandshakeSlot;
	attempt.releaseHandshakeSlot = undefined;
	releaseHandshakeSlot?.();
}

function finishAttemptResources(attempt: IDefaultRpcAttempt): void {
	attempt.resourcesFinished = true;
	releaseAttemptResources(attempt);
}

async function runAttemptCrypto<T>(
	attempt: IDefaultRpcAttempt,
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
class DefaultRpcConnectorRuntime implements IRpcProtocolConnectorRuntime {
	readonly _host: IRpcProtocolConnectorHost;
	readonly _counterExhausted: boolean;
	_attempt: IDefaultRpcConnectorAttempt | undefined;
	_session: DefaultRpcSession | undefined;
	_handshakeSlotsInUse = 0;
	_closing = false;
	_cleanupTask: Promise<void> | undefined;

	constructor(host: IRpcProtocolConnectorHost, counterExhausted: boolean) {
		this._host = host;
		this._counterExhausted = counterExhausted;
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

		let resolve!: () => void;
		let reject!: (error: unknown) => void;
		const task = new Promise<void>((taskResolve, taskReject) => {
			resolve = taskResolve;
			reject = taskReject;
		});
		this._handshakeSlotsInUse += 1;
		let attempt: IDefaultRpcConnectorAttempt;
		let endpoint: DefaultRpcEndpoint;
		try {
			endpoint = createEndpoint(
				connection,
				(_endpoint, message) => this._receiveConnectorRecord(attempt, message),
				(_endpoint, reason, error) =>
					this._connectorEndpointFailed(attempt, reason, error),
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
			task,
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

	_startFresh(attempt: IDefaultRpcConnectorAttempt): void {
		if (!this._isCurrent(attempt)) {
			return;
		}
		let request: DefaultRpcFreshRequest;
		let encoded: Uint8Array;
		try {
			const initiatorNonce = createDefaultRpcRandomCarrier();
			initiatorNonce.bytes.fill(0);
			request = Object.freeze({
				kind: "fresh",
				profiles: Object.freeze([DEFAULT_RPC_PROFILE_ID]),
				initiatorNonce: initiatorNonce.value,
			}) as DefaultRpcFreshRequest;
			encoded = encodeDefaultRpcRecord(request);
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

	async _startResume(attempt: IDefaultRpcConnectorAttempt): Promise<void> {
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
			const initiatorNonce = createDefaultRpcRandomCarrier();
			initiatorNonce.bytes.fill(0);
			const requestWithoutProof = Object.freeze({
				kind: "resume",
				profile: DEFAULT_RPC_PROFILE_ID,
				sessionId: session.sessionId,
				receivedThrough: session.receivedThrough,
				resumeAttempt,
				initiatorNonce: initiatorNonce.value,
			}) as DefaultRpcJsonRecord;
			const proof = await runAttemptCrypto(attempt, () =>
				signDefaultRpcResumeRequest(proofKey, requestWithoutProof),
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
			}) as DefaultRpcResumeRequest;
			attempt.request = request;
			attempt.requestAdmission = attempt.endpoint.sendNow(
				encodeDefaultRpcRecord(request),
			);
			void attempt.requestAdmission.catch((error) =>
				this._failAttempt(attempt, error),
			);
		} catch (error) {
			this._failAttempt(attempt, error);
		}
	}

	_receiveConnectorRecord(
		attempt: IDefaultRpcConnectorAttempt,
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
		attempt: IDefaultRpcConnectorAttempt,
		bytes: Uint8Array,
	): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		const request = attempt.request;
		const requestAdmission = attempt.requestAdmission;
		if (
			request === undefined ||
			request.kind !== "fresh" ||
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
			const accept = validateDefaultRpcFreshAccept(
				decodeDefaultRpcRecord(bytes),
			);
			const proofKey = await runAttemptCrypto(attempt, () =>
				deriveDefaultRpcProofKey(
					decodeDefaultRpcBase64Url32(accept.sessionSecret),
					accept.sessionId,
				),
			);
			if (!this._isCurrent(attempt)) {
				return;
			}
			const valid = await runAttemptCrypto(attempt, () =>
				verifyDefaultRpcFreshAccept(proofKey, request, accept),
			);
			if (!valid || !this._isCurrent(attempt)) {
				throw new Error("Default RPC fresh accept proof is invalid or stale.");
			}

			const session = new DefaultRpcSession(
				"connector",
				this._host,
				accept.sessionId,
				proofKey,
				(terminal) => {
					if (this._session === terminal) {
						this._session = undefined;
					}
				},
				this._counterExhausted,
			);
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
			session.activateBinding();
			this._succeedAttempt(attempt);
		} catch (error) {
			this._failAttempt(attempt, error);
		}
	}

	async _receiveResumeOutcome(
		attempt: IDefaultRpcConnectorAttempt,
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
			request.kind !== "resume" ||
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
			const outcome = validateDefaultRpcResumeOutcome(
				decodeDefaultRpcRecord(bytes),
			);
			if (outcome.kind === "reject") {
				if (outcome.code === "resume-rejected") {
					throw new Error("Default RPC resume was generically rejected.");
				}
				const valid = await runAttemptCrypto(attempt, () =>
					verifyDefaultRpcAuthenticatedReject(proofKey, request, outcome),
				);
				if (!valid || !this._isCurrent(attempt)) {
					throw new Error(
						"Default RPC authenticated resume reject is invalid.",
					);
				}
				if (outcome.code === "continuity-failure") {
					session.terminateContinuityFailure();
				} else {
					session.terminateAuthenticatedRemote();
				}
				throw new Error(`Default RPC resume ended with ${outcome.code}.`);
			}

			const valid = await runAttemptCrypto(attempt, () =>
				verifyDefaultRpcResumeAccept(proofKey, request, outcome),
			);
			if (!valid || !this._isCurrent(attempt)) {
				throw new Error("Default RPC resume accept proof is invalid or stale.");
			}
			const contradictory =
				outcome.profile !== DEFAULT_RPC_PROFILE_ID ||
				outcome.sessionId !== session.sessionId ||
				outcome.bindingEpoch <= session.bindingEpoch ||
				session.classifyPeerCursor(outcome.receivedThrough) !== "valid" ||
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
		attempt: IDefaultRpcConnectorAttempt,
		reason: DefaultRpcEndpointFailure,
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

	_isCurrent(attempt: IDefaultRpcConnectorAttempt): boolean {
		return !attempt.settled && this._attempt === attempt && !this._closing;
	}

	_succeedAttempt(attempt: IDefaultRpcConnectorAttempt): void {
		if (!this._isCurrent(attempt)) {
			return;
		}
		attempt.settled = true;
		clearAttempt(attempt);
		this._attempt = undefined;
		finishAttemptResources(attempt);
		attempt.resolve();
	}

	_failAttempt(attempt: IDefaultRpcConnectorAttempt, error: unknown): void {
		if (attempt.settled) {
			return;
		}
		attempt.settled = true;
		clearAttempt(attempt);
		if (this._attempt === attempt) {
			this._attempt = undefined;
		}
		finishAttemptResources(attempt);
		attempt.endpoint.fenceAndClose();
		attempt.reject(
			error instanceof Error
				? error
				: new Error("Default RPC fresh binding failed."),
		);
	}
}

/** Passive one-to-many Default Protocol runtime. */
class DefaultRpcAcceptorRuntime implements IRpcProtocolAcceptorRuntime {
	readonly _host: IRpcProtocolAcceptorHost;
	readonly _counterExhausted: boolean;
	readonly _attempts = new Set<IDefaultRpcAttempt>();
	readonly _sessions = new Map<string, DefaultRpcSession>();
	readonly _provisionalSessionIds = new Set<string>();
	_handshakeSlotsInUse = 0;
	_freshSessionReservations = 0;
	_closing = false;
	_cleanupTask: Promise<void> | undefined;

	constructor(host: IRpcProtocolAcceptorHost, counterExhausted: boolean) {
		this._host = host;
		this._counterExhausted = counterExhausted;
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

		let resolve!: () => void;
		let reject!: (error: unknown) => void;
		const task = new Promise<void>((taskResolve, taskReject) => {
			resolve = taskResolve;
			reject = taskReject;
		});
		let attempt: IDefaultRpcAttempt;
		let endpoint: DefaultRpcEndpoint;
		try {
			endpoint = createEndpoint(
				connection,
				(_endpoint, message) => this._receiveBootstrap(attempt, message),
				(_endpoint, reason, error) =>
					this._acceptorEndpointFailed(attempt, reason, error),
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
			task,
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
					"connection",
					new Error("Default RPC fresh acceptance timed out."),
				),
			this._host.policy.bindingAttemptTimeoutMs,
		);
		installAttemptAbort(attempt, () =>
			this._acceptorEndpointFailed(
				attempt,
				"connection",
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
		attempt: IDefaultRpcAttempt,
		bytes: Uint8Array,
	): Promise<void> | void {
		if (attempt.settled) {
			attempt.session?.receive(attempt.endpoint, bytes);
			return;
		}
		if (!this._isCurrent(attempt)) {
			return;
		}
		let record: DefaultRpcJsonRecord;
		try {
			record = decodeDefaultRpcRecord(bytes);
		} catch (error) {
			this._failAttempt(attempt, error);
			return;
		}
		let kind: string;
		try {
			kind = readDefaultRpcRecordKind(record);
		} catch (error) {
			this._failAttempt(attempt, error);
			return;
		}
		if (kind === "fresh") {
			return this._receiveFreshRequest(attempt, record);
		}
		if (kind === "resume") {
			return this._receiveResumeRequest(attempt, record);
		}
		this._failAttempt(
			attempt,
			new Error("Default RPC bootstrap record kind is invalid."),
		);
	}

	async _receiveFreshRequest(
		attempt: IDefaultRpcAttempt,
		record: DefaultRpcJsonRecord,
	): Promise<void> {
		if (!this._isCurrent(attempt)) {
			return;
		}
		try {
			const request = validateDefaultRpcFreshRequest(record);
			if (!request.profiles.includes(DEFAULT_RPC_PROFILE_ID)) {
				await this._rejectFresh(attempt, "unsupported-profile");
				return;
			}
			if (!this._reserveFreshSession(attempt)) {
				await this._rejectFresh(attempt, "admission-rejected");
				return;
			}

			const sessionId = this._reserveSessionId(attempt);
			if (sessionId === undefined) {
				this._host.fault(
					"protocol-fault",
					new Error("Default RPC CSPRNG repeated eight Session identifiers."),
				);
				this._failAttempt(attempt, new Error("Default RPC Session ID failed."));
				return;
			}
			const secret = createDefaultRpcRandomCarrier();
			const responderNonce = createDefaultRpcRandomCarrier();
			responderNonce.bytes.fill(0);
			const proofKey = await runAttemptCrypto(attempt, () =>
				deriveDefaultRpcProofKey(secret.bytes, sessionId),
			);
			if (
				!this._isCurrent(attempt) ||
				attempt.provisionalSessionId !== sessionId
			) {
				return;
			}
			const acceptWithoutProof = Object.freeze({
				kind: "accept",
				profile: DEFAULT_RPC_PROFILE_ID,
				sessionId,
				bindingEpoch: 1,
				responderNonce: responderNonce.value,
				sessionSecret: secret.value,
			}) as DefaultRpcJsonRecord;
			const proof = await runAttemptCrypto(attempt, () =>
				signDefaultRpcFreshAccept(proofKey, request, acceptWithoutProof),
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
			}) as DefaultRpcFreshAccept;
			const session = new DefaultRpcSession(
				"acceptor",
				this._host,
				sessionId,
				proofKey,
				(terminal) => {
					if (this._sessions.get(terminal.sessionId) === terminal) {
						this._sessions.delete(terminal.sessionId);
					}
				},
				this._counterExhausted,
			);
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
			this._releaseProvisionalSessionId(attempt);
			this._releaseFreshSession(attempt);
			try {
				await attempt.endpoint.sendNow(encodeDefaultRpcRecord(accept));
			} catch (error) {
				session.endpointFailed(
					attempt.endpoint,
					"connection",
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
		attempt: IDefaultRpcAttempt,
		record: DefaultRpcJsonRecord,
	): Promise<void> {
		let request: DefaultRpcResumeRequest;
		try {
			request = validateDefaultRpcResumeRequest(record);
		} catch (error) {
			this._failAttempt(attempt, error);
			return;
		}
		const session = this._sessions.get(request.sessionId);
		const proofKey = session?.proofKey;
		if (
			session === undefined ||
			proofKey === undefined ||
			request.profile !== DEFAULT_RPC_PROFILE_ID
		) {
			await this._rejectResumeGeneric(attempt, request);
			return;
		}

		let proofValid = false;
		try {
			proofValid = await runAttemptCrypto(attempt, () =>
				verifyDefaultRpcResumeRequest(proofKey, request),
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
		if (session.classifyPeerCursor(request.receivedThrough) !== "valid") {
			await this._rejectResumeContinuity(attempt, request, session, proofKey);
			return;
		}
		await this._acceptResume(attempt, request, session, proofKey);
	}

	async _acceptResume(
		attempt: IDefaultRpcAttempt,
		request: DefaultRpcResumeRequest,
		session: DefaultRpcSession,
		proofKey: CryptoKey,
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
			if (session.classifyPeerCursor(request.receivedThrough) !== "valid") {
				await this._rejectResumeContinuity(attempt, request, session, proofKey);
				return;
			}
			const bindingEpoch = session.bindingEpoch + 1;
			const receivedThrough = session.receivedThrough;
			const responderNonce = createDefaultRpcRandomCarrier();
			responderNonce.bytes.fill(0);
			const acceptWithoutProof = Object.freeze({
				kind: "accept",
				profile: DEFAULT_RPC_PROFILE_ID,
				sessionId: session.sessionId,
				bindingEpoch,
				receivedThrough,
				responderNonce: responderNonce.value,
			}) as DefaultRpcJsonRecord;
			const proof = await runAttemptCrypto(attempt, () =>
				signDefaultRpcResumeAccept(proofKey, request, acceptWithoutProof),
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
			if (session.classifyPeerCursor(request.receivedThrough) !== "valid") {
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
			}) as DefaultRpcResumeAccept;
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
				await attempt.endpoint.sendNow(encodeDefaultRpcRecord(accept));
			} catch (error) {
				if (session.ownsEndpoint(attempt.endpoint)) {
					session.endpointFailed(
						attempt.endpoint,
						"connection",
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
		attempt: IDefaultRpcAttempt,
		request: DefaultRpcResumeRequest,
	): Promise<void> {
		try {
			const responderNonce = createDefaultRpcRandomCarrier();
			responderNonce.bytes.fill(0);
			const rejectWithoutProof = Object.freeze({
				kind: "reject",
				code: "resume-rejected",
				responderNonce: responderNonce.value,
			}) as DefaultRpcJsonRecord;
			const proof = await runAttemptCrypto(attempt, () =>
				createDefaultRpcGenericRejectProof(request, rejectWithoutProof),
			);
			if (!this._isCurrent(attempt)) {
				return;
			}
			const reject = Object.freeze({
				...rejectWithoutProof,
				proof,
			}) as DefaultRpcResumeReject;
			await attempt.endpoint.sendNow(encodeDefaultRpcRecord(reject));
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
		attempt: IDefaultRpcAttempt,
		request: DefaultRpcResumeRequest,
		session: DefaultRpcSession,
		proofKey: CryptoKey,
	): Promise<void> {
		try {
			const responderNonce = createDefaultRpcRandomCarrier();
			responderNonce.bytes.fill(0);
			const rejectWithoutProof = Object.freeze({
				kind: "reject",
				code: "continuity-failure",
				responderNonce: responderNonce.value,
			}) as DefaultRpcJsonRecord;
			const proof = await runAttemptCrypto(attempt, () =>
				signDefaultRpcAuthenticatedReject(
					proofKey,
					request,
					rejectWithoutProof,
				),
			);
			if (
				!this._isCurrent(attempt) ||
				this._sessions.get(request.sessionId) !== session ||
				session.proofKey !== proofKey ||
				!session.canAcceptResumeAttempt(request.resumeAttempt) ||
				session.classifyPeerCursor(request.receivedThrough) === "valid"
			) {
				return;
			}
			const reject = Object.freeze({
				...rejectWithoutProof,
				proof,
			}) as DefaultRpcResumeReject;
			session.terminateContinuityFailure();
			await attempt.endpoint.sendNow(encodeDefaultRpcRecord(reject));
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
		attempt: IDefaultRpcAttempt,
		code: "unsupported-profile" | "admission-rejected",
	): Promise<void> {
		try {
			await attempt.endpoint.sendNow(
				encodeDefaultRpcRecord({ kind: "reject", code }),
			);
		} finally {
			this._failAttempt(attempt, new Error(`Default RPC fresh ${code}.`));
		}
	}

	_reserveFreshSession(attempt: IDefaultRpcAttempt): boolean {
		if (
			this._sessions.size + this._freshSessionReservations >=
			this._host.policy.maxSessions
		) {
			return false;
		}
		this._freshSessionReservations += 1;
		attempt.freshSessionReserved = true;
		return true;
	}

	_releaseFreshSession(attempt: IDefaultRpcAttempt): void {
		if (attempt.freshSessionReserved !== true) {
			return;
		}
		attempt.freshSessionReserved = false;
		this._freshSessionReservations -= 1;
	}

	_reserveSessionId(attempt: IDefaultRpcAttempt): string | undefined {
		for (let candidateIndex = 0; candidateIndex < 8; candidateIndex += 1) {
			const candidate = createDefaultRpcRandomCarrier();
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

	_releaseProvisionalSessionId(attempt: IDefaultRpcAttempt): void {
		const sessionId = attempt.provisionalSessionId;
		attempt.provisionalSessionId = undefined;
		if (sessionId !== undefined) {
			this._provisionalSessionIds.delete(sessionId);
		}
	}

	_acceptorEndpointFailed(
		attempt: IDefaultRpcAttempt,
		reason: DefaultRpcEndpointFailure,
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

	_isCurrent(attempt: IDefaultRpcAttempt): boolean {
		return !attempt.settled && this._attempts.has(attempt) && !this._closing;
	}

	_succeedAttempt(attempt: IDefaultRpcAttempt): void {
		if (!this._isCurrent(attempt)) {
			return;
		}
		attempt.settled = true;
		clearAttempt(attempt);
		this._attempts.delete(attempt);
		this._releaseProvisionalSessionId(attempt);
		this._releaseFreshSession(attempt);
		finishAttemptResources(attempt);
		attempt.resolve();
	}

	_failAttempt(
		attempt: IDefaultRpcAttempt,
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

function createDefaultRpcProtocol(counterExhausted: boolean): IRpcProtocol {
	return Object.freeze({
		createConnector: (host: IRpcProtocolConnectorHost) =>
			new DefaultRpcConnectorRuntime(host, counterExhausted),
		createAcceptor: (host: IRpcProtocolAcceptorHost) =>
			new DefaultRpcAcceptorRuntime(host, counterExhausted),
	});
}

const protocol = createDefaultRpcProtocol(false);

/** Returns the private reusable built-in Protocol value for owner factories. */
export function getDefaultRpcProtocol(): IRpcProtocol {
	return protocol;
}

/** Returns a package-private real-ledger counter exhaustion fixture. */
export function createDefaultRpcCounterExhaustionProtocolForTest(): IRpcProtocol {
	return createDefaultRpcProtocol(true);
}
