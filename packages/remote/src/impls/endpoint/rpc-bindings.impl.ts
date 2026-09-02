/**
 * @overview Private role managers and shared transaction executor for Physical Connection Bindings.
 * @author AEPKILL
 * @created 2026-08-28 23:20:00
 */

import { RPC_PROTECTED_SESSION_BYTES } from "@/constants/protocol/rpc-profile.const";
import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type {
	IRpcAcceptorBindingContext,
	IRpcAcceptorBindingProgram,
	IRpcAcceptorBindings,
	IRpcConnectorBindingContext,
	IRpcConnectorBindingProgram,
	IRpcConnectorBindings,
	RpcAcceptorBindingAcceptance,
	RpcAcceptorBindingDecision,
	RpcAcceptorBindingTermination,
	RpcAcceptorPrepareFreshOptions,
	RpcBindingFailure,
	RpcBindingTarget,
	RpcBindingTerminalIntent,
	RpcConnectorBindingDecision,
	RpcConnectorBindingInstallation,
	RpcConnectorBindingTermination,
	RpcConnectorPrepareFreshOptions,
	RpcPreparedFresh,
	RpcPreparedSession,
} from "@/interfaces/endpoint/rpc-bindings.interface";
import type {
	IRpcEndpoint,
	RpcEndpointFactory,
} from "@/interfaces/endpoint/rpc-endpoint.interface";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnectorHost,
	IRpcRetainedBytesReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcSession,
	RpcBindingCandidate,
	RpcBindingEpoch,
} from "@/interfaces/session/rpc-session.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

export type CreateRpcConnectorBindingsOptions = Readonly<{
	readonly host: IRpcProtocolConnectorHost;
	readonly createEndpoint: RpcEndpointFactory;
}>;

export type CreateRpcAcceptorBindingsOptions = Readonly<{
	readonly host: IRpcProtocolAcceptorHost;
	readonly createEndpoint: RpcEndpointFactory;
}>;

/** Owns the consecutive Physical Connection Bindings of one Connector role. */
export class RpcConnectorBindingsImpl implements IRpcConnectorBindings {
	readonly _host: CreateRpcConnectorBindingsOptions["host"];
	readonly _createEndpoint: CreateRpcConnectorBindingsOptions["createEndpoint"];
	_attempt: RpcBindingTransactionExecutor | undefined;
	_session: IRpcSession | undefined;
	_handshakeSlotsInUse = 0;
	_closing = false;
	_forceClosing = false;
	_shutdownTask: Promise<void> | undefined;
	_cleanupTask: Promise<void> | undefined;

	public constructor(options: CreateRpcConnectorBindingsOptions) {
		this._host = options.host;
		this._createEndpoint = options.createEndpoint;
	}

	get session(): IRpcSession | undefined {
		return this._session;
	}

	bind<TState>(
		connection: IRpcConnection,
		signal: AbortSignal,
		program: IRpcConnectorBindingProgram<TState>,
	): Promise<void> {
		if (this._closing || this._attempt !== undefined) {
			throw new Error("Default RPC Connector is unavailable.");
		}
		if (this._handshakeSlotsInUse >= this._host.policy.maxHandshakes) {
			closeUnboundConnection(connection);
			throw new Error("Default RPC handshake capacity is full.");
		}
		const retainedSession = this._session;
		// A retained Connector Session can bind only while it is recovering.
		const retainedSessionIsNotRecovering =
			retainedSession !== undefined && retainedSession.recovery === undefined;
		if (retainedSessionIsNotRecovering) {
			throw new Error("Default RPC Connector Session is not recovering.");
		}

		this._handshakeSlotsInUse += 1;
		let executor!: RpcBindingTransactionExecutor;
		try {
			executor = new RpcBindingTransactionExecutor({
				connection,
				signal,
				timeoutMs: this._host.policy.bindingAttemptTimeoutMs,
				timeoutError: "Default RPC fresh binding attempt timed out.",
				abortError: "Default RPC fresh binding was aborted.",
				reserveRetainedBytes: (bytes) => this._host.reserveRetainedBytes(bytes),
				createEndpoint: this._createEndpoint,
				isCurrent: () => this._attempt === executor && !this._closing,
				isRetainedSession: (session) => this._session === session,
				retainSession: (session) => this._retainSession(executor, session),
				releaseHandshakeSlot: () => {
					this._handshakeSlotsInUse -= 1;
				},
				onTerminal: () => {
					if (this._attempt === executor) {
						this._attempt = undefined;
					}
				},
				sessionOwnerError: "Default RPC Connector Session owner changed.",
			});
		} catch (error) {
			closeUnboundConnection(connection);
			throw error;
		}
		this._attempt = executor;
		const context = Object.freeze<IRpcConnectorBindingContext>({
			prepareFresh: <TValue>(
				prepareOptions: RpcConnectorPrepareFreshOptions<TValue>,
			) => this._prepareFresh(executor, prepareOptions),
			install: (installation) =>
				executor.createConnectorDecision({
					kind: "install",
					...installation,
				}),
			terminate: (termination) =>
				executor.createConnectorDecision({
					kind: "terminate",
					termination,
				}),
			fail: (error, reason) =>
				executor.createConnectorDecision({
					kind: "fail",
					error,
					reason,
				}),
		});
		executor.runConnector(program, context);
		return executor.task;
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

	_prepareFresh<TValue>(
		executor: RpcBindingTransactionExecutor,
		options: RpcConnectorPrepareFreshOptions<TValue>,
	): RpcPreparedFresh<TValue> | undefined {
		if (!executor.canUseContext || this._session !== undefined) {
			return undefined;
		}
		const reservation = this._host.reserveRetainedBytes(
			RPC_PROTECTED_SESSION_BYTES,
		);
		if (reservation === undefined) {
			return undefined;
		}
		const reservationLease = executor.ownTemporary(() => reservation.release());
		let session: IRpcSession | undefined;
		const onTerminal = (): void => {
			reservation.release();
			if (session !== undefined && this._session === session) {
				this._session = undefined;
			}
		};
		let prepared: RpcPreparedSession<TValue>;
		try {
			prepared = options.createSession(onTerminal);
			session = prepared.session;
		} catch (error) {
			reservationLease.release();
			throw error;
		}
		if (
			!executor.ownProvisionalSession(session, () => session?.terminateForced())
		) {
			return undefined;
		}
		reservationLease.transfer();
		return executor.createPreparedFresh(session, prepared.value);
	}

	_retainSession(
		executor: RpcBindingTransactionExecutor,
		session: IRpcSession,
	): boolean {
		if (!executor.holdsProvisionalSession(session)) {
			return this._session === session;
		}
		// Retention requires both an empty role slot and the exact provisional Session.
		const cannotRetainSession =
			this._session !== undefined ||
			!executor.transferProvisionalSession(session);
		if (cannotRetainSession) {
			return false;
		}
		this._session = session;
		if (this._forceClosing) {
			session.forceClose();
		}
		return true;
	}
}

/** Owns the concurrent Physical Connection Bindings of one Acceptor role. */
export class RpcAcceptorBindingsImpl implements IRpcAcceptorBindings {
	readonly _host: CreateRpcAcceptorBindingsOptions["host"];
	readonly _createEndpoint: CreateRpcAcceptorBindingsOptions["createEndpoint"];
	readonly _attempts = new Set<RpcBindingTransactionExecutor>();
	readonly _sessions = new Map<string, IRpcSession>();
	readonly _provisionalSessionIds = new Set<string>();
	_handshakeSlotsInUse = 0;
	_freshSessionReservations = 0;
	_closing = false;
	_forceClosing = false;
	_shutdownTask: Promise<void> | undefined;
	_cleanupTask: Promise<void> | undefined;

	public constructor(options: CreateRpcAcceptorBindingsOptions) {
		this._host = options.host;
		this._createEndpoint = options.createEndpoint;
	}

	session(sessionId: string): IRpcSession | undefined {
		return this._sessions.get(sessionId);
	}

	accept(
		connection: IRpcConnection,
		signal: AbortSignal,
		program: IRpcAcceptorBindingProgram,
	): Promise<void> {
		// New handshakes require an open manager and an available handshake slot.
		const handshakeIsUnavailable =
			this._closing ||
			this._handshakeSlotsInUse >= this._host.policy.maxHandshakes;
		if (handshakeIsUnavailable) {
			closeUnboundConnection(connection);
			throw new Error("Default RPC handshake capacity is full.");
		}

		this._handshakeSlotsInUse += 1;
		let executor!: RpcBindingTransactionExecutor;
		try {
			executor = new RpcBindingTransactionExecutor({
				connection,
				signal,
				timeoutMs: this._host.policy.bindingAttemptTimeoutMs,
				timeoutError: "Default RPC fresh acceptance timed out.",
				abortError: "Default RPC fresh acceptance was aborted.",
				reserveRetainedBytes: (bytes) => this._host.reserveRetainedBytes(bytes),
				createEndpoint: this._createEndpoint,
				isCurrent: () => this._attempts.has(executor) && !this._closing,
				isRetainedSession: (session) =>
					this._sessions.get(session.sessionId) === session,
				retainSession: (session) => this._retainSession(executor, session),
				releaseHandshakeSlot: () => {
					this._handshakeSlotsInUse -= 1;
				},
				onTerminal: () => {
					this._attempts.delete(executor);
				},
				sessionOwnerError: "Default RPC Acceptor Session owner changed.",
			});
		} catch (error) {
			closeUnboundConnection(connection);
			throw error;
		}
		this._attempts.add(executor);
		const context = Object.freeze<IRpcAcceptorBindingContext>({
			prepareFresh: <TValue>(
				prepareOptions: RpcAcceptorPrepareFreshOptions<TValue>,
			) => this._prepareFresh(executor, prepareOptions),
			accept: (acceptance) =>
				executor.createAcceptorDecision({
					kind: "install",
					...acceptance,
				}),
			reject: (reply, error) =>
				executor.createAcceptorDecision({ kind: "reject", reply, error }),
			terminate: (termination) =>
				executor.createAcceptorDecision({
					kind: "terminate",
					termination,
				}),
			fail: (error, reason) =>
				executor.createAcceptorDecision({
					kind: "fail",
					error,
					reason,
				}),
		});
		executor.runAcceptor(program, context);
		return executor.task;
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

	_prepareFresh<TValue>(
		executor: RpcBindingTransactionExecutor,
		options: RpcAcceptorPrepareFreshOptions<TValue>,
	): RpcPreparedFresh<TValue> | undefined {
		if (!executor.canUseContext) {
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
				const recoveryDeadline = session.recovery?.reclaimDeadline;
				// Reclaim the live recovering Session with the earliest deadline.
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
		const freshSessionLease = executor.ownTemporary(() => {
			this._freshSessionReservations -= 1;
		});
		let protectedSessionReservation = this._host.reserveRetainedBytes(
			RPC_PROTECTED_SESSION_BYTES,
		);
		const sessionToReclaim = reclaimedSession;
		// Capacity reclamation is useful only when a Session was selected to reclaim.
		const shouldReclaimForProtectedReservation =
			protectedSessionReservation === undefined &&
			sessionToReclaim !== undefined;
		if (shouldReclaimForProtectedReservation) {
			this._reclaimSession(reclaimedSessionId, sessionToReclaim);
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
		const protectedSessionLease = executor.ownTemporary(() =>
			reservation.release(),
		);
		if (reclaimedSession !== undefined) {
			this._reclaimSession(reclaimedSessionId, reclaimedSession);
		}
		if (!executor.canUseContext) {
			protectedSessionLease.release();
			freshSessionLease.release();
			return undefined;
		}

		let sessionId: string | undefined;
		for (let candidateIndex = 0; candidateIndex < 8; candidateIndex += 1) {
			const candidate = options.createIdentity();
			// Session IDs must be unique across retained and provisional Sessions.
			const candidateIsAvailable =
				!this._sessions.has(candidate) &&
				!this._provisionalSessionIds.has(candidate);
			if (candidateIsAvailable) {
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
		executor.ownTemporary(() => this._provisionalSessionIds.delete(sessionId));

		let session: IRpcSession | undefined;
		const onTerminal = (): void => {
			reservation.release();
			if (session !== undefined && this._sessions.get(sessionId) === session) {
				this._sessions.delete(sessionId);
			}
		};
		let prepared: RpcPreparedSession<TValue>;
		try {
			prepared = options.createSession(sessionId, onTerminal);
			session = prepared.session;
			if (session.sessionId !== sessionId) {
				throw new Error("Default RPC prepared Session identity changed.");
			}
		} catch (error) {
			try {
				session?.terminateForced();
			} catch {
				// The preparation invariant failure remains authoritative.
			}
			protectedSessionLease.release();
			throw error;
		}
		if (
			!executor.ownProvisionalSession(session, () => session?.terminateForced())
		) {
			return undefined;
		}
		protectedSessionLease.transfer();
		return executor.createPreparedFresh(session, prepared.value);
	}

	_retainSession(
		executor: RpcBindingTransactionExecutor,
		session: IRpcSession,
	): boolean {
		if (!executor.holdsProvisionalSession(session)) {
			return this._sessions.get(session.sessionId) === session;
		}
		// Retention requires a unique role entry and the exact provisional Session.
		const cannotRetainSession =
			this._sessions.has(session.sessionId) ||
			!executor.transferProvisionalSession(session);
		if (cannotRetainSession) {
			return false;
		}
		this._sessions.set(session.sessionId, session);
		if (this._forceClosing) {
			session.forceClose();
		}
		return true;
	}

	_reclaimSession(sessionId: string | undefined, session: IRpcSession): void {
		if (sessionId !== undefined && this._sessions.get(sessionId) === session) {
			this._sessions.delete(sessionId);
		}
		session.terminateForced();
	}
}

type RpcBindingDecisionFacts =
	| (RpcConnectorBindingInstallation &
			Readonly<{
				readonly kind: "install";
				readonly reply?: Uint8Array;
			}>)
	| (RpcAcceptorBindingAcceptance &
			Readonly<{
				readonly kind: "install";
			}>)
	| Readonly<{
			readonly kind: "reject";
			readonly reply: Uint8Array;
			readonly error: Error;
	  }>
	| Readonly<{
			readonly kind: "terminate";
			readonly termination:
				| RpcConnectorBindingTermination
				| RpcAcceptorBindingTermination;
	  }>
	| (RpcBindingFailure & Readonly<{ readonly kind: "fail" }>);

type CreateRpcBindingTransactionExecutorOptions = Readonly<{
	readonly connection: IRpcConnection;
	readonly signal: AbortSignal;
	readonly timeoutMs: number;
	readonly timeoutError: string;
	readonly abortError: string;
	readonly reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	readonly createEndpoint: RpcEndpointFactory;
	readonly isCurrent: () => boolean;
	readonly isRetainedSession: (session: IRpcSession) => boolean;
	readonly retainSession: (session: IRpcSession) => boolean;
	readonly releaseHandshakeSlot: () => void;
	readonly onTerminal: () => void;
	readonly sessionOwnerError: string;
}>;

type RpcBindingTemporaryLease = Readonly<{
	release(): void;
	transfer(): void;
}>;

type RpcProvisionalSession = Readonly<{
	readonly session: IRpcSession;
	readonly discard: () => void;
}>;

type RpcPendingBindingFailure = Readonly<{
	readonly error: Error;
	readonly notifyBinding: boolean;
	readonly reason: RpcEndpointFailureEnum;
}>;

/** Executes one exact binding transaction without exposing Endpoint or Epoch authority. */
class RpcBindingTransactionExecutor {
	readonly task: Promise<void>;
	readonly _endpoint: IRpcEndpoint;
	readonly _resolve: () => void;
	readonly _reject: (error: Error) => void;
	readonly _options: CreateRpcBindingTransactionExecutorOptions;
	readonly _temporaryReleases = new Set<() => void>();
	readonly _decisions = new WeakMap<object, RpcBindingDecisionFacts>();
	readonly _preparedSessions = new WeakMap<object, IRpcSession>();
	_binding: RpcBindingEpoch | undefined;
	_provisionalSession: RpcProvisionalSession | undefined;
	_pendingLinearizationFailure: RpcPendingBindingFailure | undefined;
	_onBootstrap: ((message: Uint8Array) => Promise<void> | void) | undefined;
	_timer: ReturnType<typeof setTimeout> | undefined;
	_removeAbortListener: (() => void) | undefined;
	_resourcesFinished = false;
	_contextOpen = false;
	_linearizing = false;
	_ingressBeforeActivation = false;
	_activated = false;
	_terminal = false;
	_handshakeReleased = false;

	constructor(options: CreateRpcBindingTransactionExecutorOptions) {
		this._options = options;
		const { promise, reject, resolve } = Promise.withResolvers<void>();
		this.task = promise;
		this._resolve = resolve;
		this._reject = reject;

		let endpoint: IRpcEndpoint | undefined;
		let earlyFailure:
			| Readonly<{
					reason: RpcEndpointFailureEnum;
					error?: Error;
			  }>
			| undefined;
		try {
			endpoint = options.createEndpoint({
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
		} catch (error) {
			options.releaseHandshakeSlot();
			throw error;
		}
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

	get canUseContext(): boolean {
		return this._contextOpen && this._isCurrent();
	}

	runConnector<TState>(
		program: IRpcConnectorBindingProgram<TState>,
		context: IRpcConnectorBindingContext,
	): void {
		let start: ReturnType<IRpcConnectorBindingProgram<TState>["begin"]>;
		let requestAdmission: Promise<void> | undefined;
		this._onBootstrap = async (response) => {
			if (requestAdmission === undefined) {
				this.fail(
					new Error("Default RPC received a response before its request."),
				);
				return;
			}
			try {
				await requestAdmission;
			} catch (error) {
				this.fail(error);
				return;
			}
			if (!this._isCurrent()) {
				return;
			}
			let decision: RpcConnectorBindingDecision;
			this._contextOpen = true;
			try {
				decision = program.decide(context, start.state, response);
			} catch (error) {
				this.fail(error);
				return;
			} finally {
				this._contextOpen = false;
			}
			await this._settleDecision(decision);
		};
		queueMicrotask(() => {
			if (!this._isCurrent()) {
				return;
			}
			try {
				start = program.begin();
				requestAdmission = this._endpoint.sendNow(start.message);
				void requestAdmission.catch((error) => this.fail(error));
			} catch (error) {
				this.fail(error);
			}
		});
	}

	runAcceptor(
		program: IRpcAcceptorBindingProgram,
		context: IRpcAcceptorBindingContext,
	): void {
		this._onBootstrap = async (request) => {
			let decision: RpcAcceptorBindingDecision;
			this._contextOpen = true;
			try {
				decision = program.decide(context, request);
			} catch (error) {
				this.fail(error);
				return;
			} finally {
				this._contextOpen = false;
			}
			await this._settleDecision(decision);
		};
	}

	createConnectorDecision(
		facts: RpcBindingDecisionFacts,
	): RpcConnectorBindingDecision {
		return this._createDecision(facts) as RpcConnectorBindingDecision;
	}

	createAcceptorDecision(
		facts: RpcBindingDecisionFacts,
	): RpcAcceptorBindingDecision {
		return this._createDecision(facts) as RpcAcceptorBindingDecision;
	}

	createPreparedFresh<TValue>(
		session: IRpcSession,
		value: TValue,
	): RpcPreparedFresh<TValue> | undefined {
		if (!this.canUseContext || !this.holdsProvisionalSession(session)) {
			return undefined;
		}
		const prepared = Object.freeze({
			session,
			value,
		}) as RpcPreparedFresh<TValue>;
		this._preparedSessions.set(prepared, session);
		return prepared;
	}

	ownTemporary(release: () => void): RpcBindingTemporaryLease {
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

	ownProvisionalSession(session: IRpcSession, discard: () => void): boolean {
		if (this._provisionalSession !== undefined || this._terminal) {
			discard();
			return false;
		}
		this._provisionalSession = Object.freeze({ session, discard });
		return true;
	}

	holdsProvisionalSession(session: IRpcSession): boolean {
		return this._provisionalSession?.session === session;
	}

	transferProvisionalSession(session: IRpcSession): boolean {
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

	fail(
		error: unknown,
		reason: RpcEndpointFailureEnum = RpcEndpointFailureEnum.connection,
	): void {
		this._settleFailure(error, true, reason);
	}

	_createDecision(facts: RpcBindingDecisionFacts): object {
		const decision = Object.freeze({});
		if (this.canUseContext) {
			this._decisions.set(decision, facts);
		}
		return decision;
	}

	async _settleDecision(
		decision: RpcConnectorBindingDecision | RpcAcceptorBindingDecision,
	): Promise<void> {
		if (!this._isCurrent()) {
			return;
		}
		const facts = this._decisions.get(decision);
		this._decisions.delete(decision);
		if (facts === undefined) {
			this.fail(
				new Error(
					"Default RPC binding decision is foreign or already consumed.",
				),
			);
			return;
		}
		if (facts.kind === "install") {
			await this._installBinding(facts.target, facts.candidate, facts.reply);
			return;
		}
		if (facts.kind === "reject") {
			await this._rejectBinding(facts.reply, facts.error);
			return;
		}
		if (facts.kind === "terminate") {
			await this._terminateBinding(facts.termination);
			return;
		}
		this.fail(facts.error, facts.reason);
	}

	_installBinding(
		target: RpcBindingTarget,
		candidate: RpcBindingCandidate,
		reply?: Uint8Array,
	): Promise<void> {
		const session = this._resolveTarget(target);
		if (!this._isCurrent() || session === undefined) {
			this.fail(new Error(this._options.sessionOwnerError));
			return Promise.resolve();
		}
		this._linearizing = true;
		let commit: ReturnType<IRpcSession["commitBinding"]>;
		try {
			commit = session.commitBinding(candidate, this._endpoint);
		} catch (error) {
			this._linearizing = false;
			if (!this._settlePendingLinearizationFailure()) {
				this.fail(error);
			}
			return Promise.resolve();
		}
		this._linearizing = false;
		if (commit.kind === "discarded") {
			if (!this._settlePendingLinearizationFailure()) {
				this.fail(commit.error);
			}
			return Promise.resolve();
		}
		this._binding = commit.binding;
		let retained = false;
		try {
			retained = this._options.retainSession(session);
		} catch (error) {
			if (!this._settlePendingLinearizationFailure()) {
				this.fail(error);
			}
			return Promise.resolve();
		}
		if (!retained) {
			if (!this._settlePendingLinearizationFailure()) {
				this.fail(
					new Error("Default RPC provisional Session transfer failed."),
				);
			}
			return Promise.resolve();
		}
		if (this._settlePendingLinearizationFailure()) {
			return Promise.resolve();
		}
		this._finishResources();
		if (this._ingressBeforeActivation) {
			this.fail(
				new Error(
					"Default RPC active record arrived before Binding Activation.",
				),
			);
			return Promise.resolve();
		}
		if (reply === undefined) {
			this._activate(commit.binding);
			return Promise.resolve();
		}
		return this._sendReplyAndActivate(commit.binding, reply);
	}

	async _rejectBinding(reply: Uint8Array, error: Error): Promise<void> {
		this._discardProvisionalSession();
		try {
			await this._endpoint.sendNow(reply);
		} catch {
			// The intended rejection remains authoritative over reply-send failure.
		} finally {
			this.fail(error);
		}
	}

	async _terminateBinding(
		termination: RpcConnectorBindingTermination | RpcAcceptorBindingTermination,
	): Promise<void> {
		// Terminal authority belongs only to this live attempt's retained Session.
		const terminalSessionIsStale =
			!this._isCurrent() ||
			!this._options.isRetainedSession(termination.session);
		if (terminalSessionIsStale) {
			this.fail(new Error(this._options.sessionOwnerError));
			return;
		}
		let authority: ReturnType<IRpcSession["commitContinuityFailure"]>;
		try {
			authority = this._commitTerminalIntent(termination);
		} catch (error) {
			this.fail(error);
			return;
		}
		if (authority.kind === "discarded") {
			this.fail(authority.error);
			return;
		}
		if ("reply" in termination) {
			try {
				await this._endpoint.sendNow(termination.reply);
			} catch {
				// The authoritative Session terminal remains selected.
			}
		}
		this.fail(termination.error);
	}

	_commitTerminalIntent(intent: RpcBindingTerminalIntent) {
		return intent.kind === "continuity-failure"
			? intent.session.commitContinuityFailure(intent.candidate, intent.cause)
			: intent.session.terminateRemoteResume(intent.resume, intent.cause);
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
		this._activated = true;
		this._terminal = true;
		this._clearDeadline();
		this._finishResources();
		this._options.onTerminal();
		this._resolve();
	}

	_resolveTarget(target: RpcBindingTarget): IRpcSession | undefined {
		const prepared = this._preparedSessions.get(target);
		if (prepared !== undefined) {
			this._preparedSessions.delete(target);
			return this.holdsProvisionalSession(prepared) ? prepared : undefined;
		}
		return this._options.isRetainedSession(target as IRpcSession)
			? (target as IRpcSession)
			: undefined;
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
		if (this._onBootstrap === undefined) {
			this.fail(new Error("Default RPC binding program was not installed."));
			return;
		}
		return this._onBootstrap(message);
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

	_settleFailure(
		error: unknown,
		notifyBinding: boolean,
		reason: RpcEndpointFailureEnum,
	): void {
		if (this._terminal || this._pendingLinearizationFailure !== undefined) {
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
		this._terminal = true;
		this._contextOpen = false;
		this._clearDeadline();
		if (this._binding === undefined) {
			this._endpoint.fenceAndClose();
		} else if (notifyBinding) {
			this._binding.failed(reason, failure);
		}
		this._discardProvisionalSession();
		this._finishResources();
		this._options.onTerminal();
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

	_discardProvisionalSession(): void {
		const provisional = this._provisionalSession;
		this._provisionalSession = undefined;
		try {
			provisional?.discard();
		} catch {
			// Transaction settlement still owns the exact failure outcome.
		}
	}

	_isCurrent(): boolean {
		return !this._terminal && this._options.isCurrent();
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
		if (this._resourcesFinished) {
			for (const release of this._temporaryReleases) {
				release();
			}
			this._temporaryReleases.clear();
		}
		if (this._terminal && !this._handshakeReleased) {
			this._handshakeReleased = true;
			this._options.releaseHandshakeSlot();
		}
	}
}

function closeUnboundConnection(connection: IRpcConnection): void {
	queueMicrotask(() => {
		void Promise.try(() => connection.close()).catch(() => {
			// A pre-bootstrap Connection has no Session authority to report against.
		});
	});
}
