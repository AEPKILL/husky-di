/**
 * @overview Connector Topology Owner implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	BehaviorSubject,
	type Observable,
	Subject,
	type Subscription,
} from "rxjs";

import { createRpcError } from "@/exceptions/rpc-error.exception";
import { RpcPeerImpl } from "@/impls/rpc-peer.impl";
import type { IRpcConnectorAdapter } from "@/interfaces/rpc-adapter.interface";
import type {
	IRpcConnector,
	RpcEvent,
} from "@/interfaces/rpc-caller.interface";
import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
import type {
	IRpcProtocolConnectorRuntime,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/rpc-protocol.interface";
import type { RpcConnectorState } from "@/types/rpc-caller.type";
import { RpcHandlerScheduler } from "@/utils/rpc-handler-scheduler.util";

type RpcConnectorClosedState = Extract<
	RpcConnectorState,
	{ readonly status: "closed" }
>;

type RpcPeerClosedEvent = Extract<RpcEvent, { readonly type: "peer-closed" }>;

interface RpcConnectorOwnedCleanup {
	readonly cleanup: () => unknown;
	task?: Promise<void>;
	error?: Error;
}

interface RpcConnectorAttempt {
	readonly abortController: AbortController;
	readonly ownerAbort: Promise<never>;
	readonly rejectOwnerAbort: (error: Error) => void;
	readonly startupCleanup: RpcConnectorOwnedCleanup;
	subscription?: Subscription;
	connection?: IRpcConnection;
	provisionalSession?: IRpcProtocolSession;
	insideHandoff: boolean;
	attached: boolean;
	cleanupRequested: boolean;
	fenced: boolean;
	ownerAborted: boolean;
}

/** Owns one stable Connector peer and one owner-scoped Protocol runtime. */
export class RpcConnectorImpl implements IRpcConnector {
	readonly #runtime: IRpcProtocolConnectorRuntime;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #stateSubject: BehaviorSubject<RpcConnectorState>;
	readonly #eventSubject = new Subject<RpcEvent>();
	readonly #faultingSessions = new Set<IRpcProtocolSession>();
	readonly #ownedConnections: IRpcConnection[] = [];
	readonly #connectionCloseTasks = new WeakMap<IRpcConnection, Promise<void>>();
	readonly #connectionCleanupEntries = new WeakMap<
		IRpcConnection,
		RpcConnectorOwnedCleanup
	>();
	readonly #connectionTerminalSubscriptions = new Map<
		IRpcConnection,
		Subscription
	>();
	readonly #cleanupLedger: RpcConnectorOwnedCleanup[] = [];
	readonly #connectionLimit: number;
	#attempt: RpcConnectorAttempt | undefined;
	#session: IRpcProtocolSession | undefined;
	#terminationTask: Promise<void> | undefined;
	#resolveTermination: (() => void) | undefined;
	#rejectTermination: ((error: unknown) => void) | undefined;
	#graceTimer: ReturnType<typeof setTimeout> | undefined;
	#cleanupTimer: ReturnType<typeof setTimeout> | undefined;
	readonly state$: Observable<RpcConnectorState>;
	readonly event$: Observable<RpcEvent>;
	readonly peer: RpcPeerImpl;

	constructor(
		runtime: IRpcProtocolConnectorRuntime,
		policy: IRpcProtocolRuntimePolicy,
	) {
		this.#runtime = runtime;
		this.#policy = policy;
		this.#connectionLimit = policy.maxSessions + 2 * policy.maxHandshakes;
		this.#stateSubject = new BehaviorSubject(
			Object.freeze<RpcConnectorState>({ status: "active" }),
		);
		this.state$ = this.#stateSubject.asObservable();
		this.event$ = this.#eventSubject.asObservable();
		const handlerScheduler = new RpcHandlerScheduler(
			policy.maxHandlersTotal,
			policy.maxHandlersPerSession,
		);
		this.peer = new RpcPeerImpl(
			{ status: "unbound" },
			new Map(),
			() => this.state.status === "active",
			(event) => this.#eventSubject.next(event),
			(error) => this.protocolFault("protocol-fault", error),
			handlerScheduler,
			Math.floor(policy.maxRetainedBytesPerSession / 4),
		);
	}

	get state(): RpcConnectorState {
		return this.#stateSubject.value;
	}

	connect(adapter: IRpcConnectorAdapter): Promise<void> {
		try {
			return this.#connect(adapter);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	#connect(adapter: IRpcConnectorAdapter): Promise<void> {
		if (
			this.state.status !== "active" ||
			(this.peer.state.status !== "unbound" &&
				this.peer.state.status !== "recovering") ||
			this.#attempt !== undefined ||
			this.#ownedConnections.length >= this.#connectionLimit
		) {
			return Promise.reject(createRpcError("unavailable"));
		}
		if (typeof adapter !== "object" || adapter === null) {
			return Promise.reject(new TypeError("adapter must be an object."));
		}

		const connectionSource = Reflect.get(adapter, "connection$") as
			| Observable<IRpcConnection>
			| undefined;
		const connect = Reflect.get(adapter, "connect");
		if (
			connectionSource === undefined ||
			typeof Reflect.get(connectionSource, "subscribe") !== "function" ||
			typeof connect !== "function"
		) {
			return Promise.reject(new TypeError("adapter has an invalid shape."));
		}

		const fresh = this.peer.state.status === "unbound";
		if (fresh) {
			this.peer.commitState({ status: "connecting" });
		}
		let rejectOwnerAbort!: (error: Error) => void;
		const ownerAbort = new Promise<never>((_resolve, reject) => {
			rejectOwnerAbort = reject;
		});
		void ownerAbort.catch(() => {});
		let resolveAdapterStartup!: (value?: unknown) => void;
		let rejectAdapterStartup!: (error: unknown) => void;
		const adapterStartup = new Promise<unknown>((resolve, reject) => {
			resolveAdapterStartup = resolve;
			rejectAdapterStartup = reject;
		});
		let attempt!: RpcConnectorAttempt;
		const startupCleanupTask = adapterStartup.then(
			() => undefined,
			(error: unknown) => {
				if (
					attempt.cleanupRequested &&
					!(error instanceof DOMException && error.name === "AbortError")
				) {
					throw error;
				}
			},
		);
		void startupCleanupTask.catch(() => {});
		const startupCleanup = this.#admitOwnedCleanup(() => startupCleanupTask);
		attempt = {
			abortController: new AbortController(),
			ownerAbort,
			rejectOwnerAbort,
			startupCleanup,
			insideHandoff: false,
			attached: false,
			cleanupRequested: false,
			fenced: false,
			ownerAborted: false,
		};
		this.#attempt = attempt;

		let resolveSource!: () => void;
		let rejectSource!: (error: unknown) => void;
		const sourceTerminal = new Promise<void>((resolve, reject) => {
			resolveSource = resolve;
			rejectSource = reject;
		});
		let resolveBinding!: () => void;
		let rejectBinding!: (error: unknown) => void;
		const binding = new Promise<void>((resolve, reject) => {
			resolveBinding = resolve;
			rejectBinding = reject;
		});

		try {
			attempt.subscription = connectionSource.subscribe({
				next: (connection) => {
					this.#ownConnection(connection);
					if (attempt.fenced || this.#attempt !== attempt) {
						this.#directClose(connection);
						return;
					}
					if (attempt.connection !== undefined) {
						this.#directClose(connection);
						rejectBinding(
							new Error("Connector Adapter emitted multiple Connections."),
						);
						return;
					}
					attempt.connection = connection;
					attempt.insideHandoff = true;
					try {
						const result = this.#runtime.bind(
							connection,
							attempt.abortController.signal,
						);
						Promise.resolve(result).then(resolveBinding, rejectBinding);
					} catch (error) {
						rejectBinding(error);
					} finally {
						attempt.insideHandoff = false;
					}
				},
				error: rejectSource,
				complete: () => {
					if (attempt.connection === undefined) {
						rejectBinding(
							new Error("Connector Adapter completed without a Connection."),
						);
					}
					resolveSource();
				},
			});
		} catch (error) {
			resolveAdapterStartup();
			this.#finishFailedAttempt(attempt, fresh);
			return Promise.reject(error);
		}

		try {
			Promise.resolve(
				Reflect.apply(connect, adapter, [attempt.abortController.signal]),
			).then(resolveAdapterStartup, rejectAdapterStartup);
		} catch (error) {
			rejectAdapterStartup(error);
		}

		return Promise.race([
			Promise.all([adapterStartup, sourceTerminal, binding]),
			attempt.ownerAbort,
		])
			.then(() => {
				if (attempt.connection === undefined) {
					throw new Error("Protocol did not attach a Connector Session.");
				}
				if (fresh) {
					const session = attempt.provisionalSession;
					if (
						session === undefined ||
						attempt.fenced ||
						this.#attempt !== attempt ||
						this.state.status !== "active" ||
						!this.peer.attachProtocolSession(session)
					) {
						throw new Error("Protocol did not attach a Connector Session.");
					}
					attempt.provisionalSession = undefined;
					this.#session = session;
					this.peer.commitState({ status: "connected" });
					this.#eventSubject.next({ type: "peer-opened", peer: this.peer });
					return;
				}
				if (
					this.#session === undefined ||
					this.peer.state.status !== "connected"
				) {
					throw new Error("Protocol did not attach a Connector Session.");
				}
			})
			.catch((error: unknown) => {
				this.#finishFailedAttempt(attempt, fresh);
				if (attempt.ownerAborted) {
					throw error;
				}
				throw createRpcError(
					"unavailable",
					error instanceof Error ? error : undefined,
				);
			})
			.finally(() => {
				attempt.subscription?.unsubscribe();
				this.#startOwnedCleanup(attempt.startupCleanup);
				if (this.#attempt === attempt) {
					this.#attempt = undefined;
				}
			});
	}

	#finishFailedAttempt(
		attempt: RpcConnectorAttempt,
		fresh: boolean,
		ownerAbort?: Error,
	): void {
		if (!attempt.fenced) {
			attempt.fenced = true;
			attempt.subscription?.unsubscribe();
			if (ownerAbort !== undefined) {
				attempt.cleanupRequested = true;
				attempt.ownerAborted = true;
				attempt.rejectOwnerAbort(ownerAbort);
			}
			attempt.abortController.abort();
		}
		const provisionalSession = attempt.provisionalSession;
		attempt.provisionalSession = undefined;
		if (provisionalSession !== undefined) {
			try {
				provisionalSession.forceClose();
			} catch {
				// The startup failure remains authoritative.
			}
		}
		if (attempt.connection !== undefined) {
			this.#directClose(attempt.connection);
		}
		if (fresh && this.#session === undefined) {
			this.peer.commitState({ status: "unbound" });
		}
	}

	#ownConnection(connection: IRpcConnection): void {
		if (
			this.#ownedConnections.includes(connection) ||
			this.#connectionCloseTasks.has(connection)
		) {
			return;
		}
		this.#ownedConnections.push(connection);
		const cleanup = this.#admitOwnedCleanup(() =>
			this.#directClose(connection),
		);
		this.#connectionCleanupEntries.set(connection, cleanup);
		const subscription = connection.message$.subscribe({
			error: () => this.#directClose(connection),
			complete: () => this.#directClose(connection),
		});
		this.#connectionTerminalSubscriptions.set(connection, subscription);
	}

	#directClose(connection: IRpcConnection): Promise<void> {
		const retained = this.#connectionCloseTasks.get(connection);
		if (retained !== undefined) {
			return retained;
		}
		this.#ownConnection(connection);

		let resolveClose!: () => void;
		let rejectClose!: (error: unknown) => void;
		const task = new Promise<void>((resolve, reject) => {
			resolveClose = resolve;
			rejectClose = reject;
		});
		this.#connectionCloseTasks.set(connection, task);
		const cleanup = this.#connectionCleanupEntries.get(connection);
		if (cleanup !== undefined) {
			this.#retainOwnedCleanup(cleanup, task);
		}
		try {
			Promise.resolve(connection.close()).then(resolveClose, rejectClose);
		} catch (error) {
			rejectClose(error);
		}
		void task.catch(() => {});
		void task.then(
			() => this.#releaseOwnedConnection(connection),
			() => {},
		);
		return task;
	}

	#admitOwnedCleanup(cleanup: () => unknown): RpcConnectorOwnedCleanup {
		const entry: RpcConnectorOwnedCleanup = { cleanup };
		this.#cleanupLedger.push(entry);
		return entry;
	}

	#startOwnedCleanup(entry: RpcConnectorOwnedCleanup): Promise<void> {
		if (entry.task !== undefined) {
			return entry.task;
		}
		let cleanup: unknown;
		try {
			cleanup = entry.cleanup();
		} catch (error) {
			cleanup = Promise.reject(error);
		}
		return this.#retainOwnedCleanup(entry, cleanup);
	}

	#retainOwnedCleanup(
		entry: RpcConnectorOwnedCleanup,
		cleanup: unknown,
	): Promise<void> {
		if (entry.task !== undefined) {
			return entry.task;
		}
		const task = Promise.resolve(cleanup).then(
			() => undefined,
			(error: unknown) => {
				entry.error ??=
					error instanceof Error
						? error
						: new Error("RPC Owner cleanup failed.");
				throw entry.error;
			},
		);
		entry.task = task;
		void task.catch(() => {});
		void task.then(
			() => this.#releaseSettledOwnedCleanup(entry),
			() => {},
		);
		return task;
	}

	#releaseSettledOwnedCleanup(entry: RpcConnectorOwnedCleanup): void {
		if (this.#terminationTask !== undefined || entry.error !== undefined) {
			return;
		}
		const index = this.#cleanupLedger.indexOf(entry);
		if (index >= 0) {
			this.#cleanupLedger.splice(index, 1);
		}
	}

	#releaseOwnedConnection(connection: IRpcConnection): void {
		const index = this.#ownedConnections.indexOf(connection);
		if (index >= 0) {
			this.#ownedConnections.splice(index, 1);
		}
		this.#connectionTerminalSubscriptions.get(connection)?.unsubscribe();
		this.#connectionTerminalSubscriptions.delete(connection);
	}

	/** Package-private Protocol attachment port. */
	attachProtocolSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined {
		const attempt = this.#attempt;
		if (
			attempt === undefined ||
			attempt.fenced ||
			attempt.insideHandoff ||
			attempt.attached ||
			this.#session !== undefined ||
			typeof session !== "object" ||
			session === null ||
			typeof session.reserveInvocation !== "function" ||
			typeof session.forceClose !== "function"
		) {
			return undefined;
		}

		attempt.attached = true;
		attempt.provisionalSession = session;
		return Object.freeze<IRpcProtocolSessionHost>({
			reserveIncomingCall: (request) =>
				this.peer.reserveIncomingProtocolCall(request),
			transition: (transition) => this.#transitionSession(session, transition),
			fault: (reason, error) => this.#faultSession(session, reason, error),
		});
	}

	#faultSession(
		session: IRpcProtocolSession,
		reason: RpcProtocolFaultReason,
		error: Error,
	): void {
		const attempt = this.#attempt;
		const provisional = attempt?.provisionalSession === session;
		if (
			(this.#session !== session && !provisional) ||
			this.peer.state.status === "closed" ||
			this.#faultingSessions.has(session)
		) {
			return;
		}
		this.#faultingSessions.add(session);
		try {
			if (provisional && attempt !== undefined) {
				this.#finishFailedAttempt(
					attempt,
					true,
					createRpcError("protocol", error),
				);
				return;
			}
			try {
				session.forceClose();
			} catch {
				// The original Session fault remains authoritative.
			}
			if (this.#session === session) {
				this.#closeFromSession(reason, error);
			}
		} finally {
			this.#faultingSessions.delete(session);
		}
	}

	#transitionSession(
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	): void {
		if (this.#faultingSessions.has(session)) {
			return;
		}
		if (this.#session !== session || this.peer.state.status === "closed") {
			return;
		}
		if (!this.#isSessionTransitionAllowed(transition)) {
			this.#faultSession(
				session,
				"protocol-fault",
				new Error("Protocol requested an invalid Session transition."),
			);
			return;
		}
		if (transition.type === "recovering") {
			this.peer.commitState({ status: "recovering" });
			this.#eventSubject.next({ type: "peer-recovering", peer: this.peer });
			return;
		}
		if (transition.type === "recovered") {
			this.peer.commitState({ status: "connected" });
			this.#eventSubject.next({ type: "peer-recovered", peer: this.peer });
			return;
		}
		if (transition.type === "draining") {
			this.peer.commitState({
				status: "draining",
				reason: "counter-exhaustion",
			});
			this.#eventSubject.next({
				type: "peer-draining",
				peer: this.peer,
				reason: "counter-exhaustion",
			});
			return;
		}
		this.#closeFromSession(transition.reason, transition.cause);
	}

	#isSessionTransitionAllowed(
		transition: RpcProtocolSessionTransition,
	): boolean {
		const peerState = this.peer.state;
		if (this.state.status === "draining") {
			return (
				transition.type === "closed" &&
				peerState.status === "draining" &&
				transition.reason !== "recovery-expired" &&
				(transition.reason !== "counter-exhaustion" ||
					peerState.reason === "counter-exhaustion")
			);
		}
		if (this.state.status !== "active") {
			return false;
		}
		if (transition.type === "recovering") {
			return peerState.status === "connected";
		}
		if (transition.type === "recovered") {
			return peerState.status === "recovering";
		}
		if (transition.type === "draining") {
			return (
				peerState.status === "connected" || peerState.status === "recovering"
			);
		}
		if (transition.reason === "recovery-expired") {
			return peerState.status === "recovering";
		}
		if (transition.reason === "counter-exhaustion") {
			return (
				peerState.status === "draining" &&
				peerState.reason === "counter-exhaustion"
			);
		}
		return transition.reason !== "graceful-shutdown";
	}

	#closeFromSession(reason: RpcSessionCloseReason, cause?: Error): void {
		if (this.state.status === "closing" || this.state.status === "closed") {
			return;
		}
		this.#abortCurrentAttempt();
		if (this.#terminationTask === undefined) {
			this.#createTerminationTask();
		}
		const failed =
			reason === "recovery-expired" ||
			reason === "counter-exhaustion" ||
			reason === "continuity-failure" ||
			reason === "protocol-fault" ||
			reason === "resource-fault";
		let finalState: RpcConnectorClosedState;
		let peerEvent: RpcPeerClosedEvent;
		if (!failed) {
			finalState = Object.freeze({
				status: "closed",
				outcome: "normal",
				reason,
			});
			peerEvent = {
				type: "peer-closed",
				peer: this.peer,
				outcome: "normal",
				reason,
			};
		} else if (
			reason === "recovery-expired" ||
			reason === "counter-exhaustion"
		) {
			const error = createRpcError("unavailable", cause);
			finalState = Object.freeze({
				status: "closed",
				outcome: "failed",
				reason,
				error,
			});
			peerEvent = {
				type: "peer-closed",
				peer: this.peer,
				outcome: "failed",
				reason,
			};
		} else {
			const error = createRpcError("protocol", cause);
			finalState = Object.freeze({
				status: "closed",
				outcome: "failed",
				reason,
				error,
			});
			peerEvent = {
				type: "peer-closed",
				peer: this.peer,
				outcome: "failed",
				reason,
			};
		}
		this.peer.stageState(finalState);
		this.#session = undefined;
		this.#stateSubject.next(Object.freeze({ status: "closing" }));
		this.peer.flushState();
		this.#eventSubject.next(peerEvent);
		this.peer.completeState();
		this.#eventSubject.next({ type: "owner-closing" });
		this.#startCleanup(finalState);
	}

	/** Package-private shared Protocol fault port. */
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		try {
			this.#session?.forceClose();
		} catch {
			// The original Protocol fault remains authoritative.
		}
		try {
			this.#runtime.close();
		} catch {
			// The original Protocol fault remains authoritative.
		}
		this.#closeFromSession(reason, error);
	}

	shutdown(): Promise<void> {
		if (this.#terminationTask !== undefined) {
			return this.#terminationTask;
		}
		const task = this.#createTerminationTask();
		this.#beginGracefulShutdown();
		return task;
	}

	close(): Promise<void> {
		const task = this.#terminationTask ?? this.#createTerminationTask();
		if (this.state.status === "active" || this.state.status === "draining") {
			this.#beginClosing("forced-close", true);
		}
		return task;
	}

	#createTerminationTask(): Promise<void> {
		const task = new Promise<void>((resolve, reject) => {
			this.#resolveTermination = resolve;
			this.#rejectTermination = reject;
		});
		this.#terminationTask = task;
		void task.catch(() => {});
		return task;
	}

	#beginGracefulShutdown(): void {
		if (this.state.status !== "active") {
			return;
		}
		this.#stateSubject.next(Object.freeze({ status: "draining" }));
		const peerStatus = this.peer.state.status;
		let terminalPeerReason: "graceful-shutdown" | "forced-close" | undefined;
		if (peerStatus === "connected") {
			this.peer.commitState({
				status: "draining",
				reason: "graceful-shutdown",
			});
		} else if (peerStatus === "recovering") {
			try {
				this.#session?.forceClose();
			} catch {
				// Force remains selected even when custom Protocol code misbehaves.
			}
			terminalPeerReason = "forced-close";
			this.peer.commitState({
				status: "closed",
				outcome: "normal",
				reason: terminalPeerReason,
			});
		} else if (peerStatus === "unbound" || peerStatus === "connecting") {
			this.#abortCurrentAttempt();
			terminalPeerReason = "graceful-shutdown";
			this.peer.commitState({
				status: "closed",
				outcome: "normal",
				reason: terminalPeerReason,
			});
		}
		this.#eventSubject.next({ type: "owner-draining" });
		if (this.peer.state.status === "draining") {
			this.#eventSubject.next({
				type: "peer-draining",
				peer: this.peer,
				reason: this.peer.state.reason,
			});
		} else if (terminalPeerReason !== undefined) {
			this.#eventSubject.next({
				type: "peer-closed",
				peer: this.peer,
				outcome: "normal",
				reason: terminalPeerReason,
			});
			this.#session = undefined;
			this.peer.completeState();
		}

		this.#graceTimer = setTimeout(
			() => this.#beginClosing("shutdown-deadline", true),
			this.#policy.shutdownDeadlineMs,
		);
		let grace: Promise<unknown>;
		try {
			grace = Promise.resolve(this.#runtime.shutdown());
		} catch {
			this.#beginClosing("forced-close", true);
			return;
		}
		grace.then(
			() => {
				if (this.state.status === "draining") {
					this.#beginClosing("graceful-shutdown", false);
				}
			},
			() => this.#beginClosing("forced-close", true),
		);
	}

	#abortCurrentAttempt(): void {
		const attempt = this.#attempt;
		if (attempt === undefined) {
			return;
		}
		this.#finishFailedAttempt(
			attempt,
			true,
			new DOMException(
				"The connection was aborted by its owner.",
				"AbortError",
			),
		);
		this.#attempt = undefined;
	}

	#beginClosing(
		reason: "graceful-shutdown" | "forced-close" | "shutdown-deadline",
		forced: boolean,
	): void {
		if (this.state.status === "closing" || this.state.status === "closed") {
			return;
		}
		if (this.#graceTimer !== undefined) {
			clearTimeout(this.#graceTimer);
			this.#graceTimer = undefined;
		}
		this.#abortCurrentAttempt();
		if (forced) {
			try {
				this.#runtime.close();
			} catch {
				// Only cleanup failure rejects the shared termination task.
			}
		}
		const closure = this.#stagePeerForOwnerClose(reason);
		this.#stateSubject.next(Object.freeze({ status: "closing" }));
		this.peer.flushState();
		if (closure.event !== undefined) {
			this.#eventSubject.next(closure.event);
		}
		this.peer.completeState();
		this.#eventSubject.next({ type: "owner-closing" });
		this.#startCleanup(closure.finalState);
	}

	#stagePeerForOwnerClose(
		reason: "graceful-shutdown" | "forced-close" | "shutdown-deadline",
	): {
		readonly finalState: RpcConnectorClosedState;
		readonly event?: RpcPeerClosedEvent;
	} {
		if (this.peer.state.status === "closed") {
			return {
				finalState: Object.freeze({
					status: "closed",
					outcome: "normal",
					reason,
				}),
			};
		}
		let finalState: RpcConnectorClosedState;
		let event: RpcPeerClosedEvent;
		if (
			reason === "graceful-shutdown" &&
			this.peer.state.status === "draining" &&
			this.peer.state.reason === "counter-exhaustion"
		) {
			finalState = Object.freeze({
				status: "closed",
				outcome: "failed",
				reason: "counter-exhaustion",
				error: createRpcError("unavailable"),
			});
			event = {
				type: "peer-closed",
				peer: this.peer,
				outcome: "failed",
				reason: "counter-exhaustion",
			};
		} else {
			finalState = Object.freeze({
				status: "closed",
				outcome: "normal",
				reason,
			});
			event = {
				type: "peer-closed",
				peer: this.peer,
				outcome: "normal",
				reason,
			};
		}
		this.peer.stageState(finalState);
		this.#session = undefined;
		return { finalState, event };
	}

	#startCleanup(finalState: RpcConnectorClosedState): void {
		this.#admitOwnedCleanup(() => this.#runtime.cleanup());
		const cleanups = this.#cleanupLedger.map((entry) =>
			this.#startOwnedCleanup(entry),
		);
		this.#cleanupTimer = setTimeout(() => {
			const errors = this.#collectOwnedCleanupErrors();
			errors.push(new Error("RPC Owner cleanup exceeded its deadline."));
			this.#finishCleanupFailure(this.#combineOwnedCleanupErrors(errors));
		}, this.#policy.shutdownDeadlineMs);
		void Promise.allSettled(cleanups).then((settlements) => {
			if (this.state.status !== "closing") {
				return;
			}
			void settlements;
			const errors = this.#collectOwnedCleanupErrors();
			if (errors.length === 0) {
				this.#finishCleanupSuccess(finalState);
			} else {
				this.#finishCleanupFailure(this.#combineOwnedCleanupErrors(errors));
			}
		});
	}

	#collectOwnedCleanupErrors(): Error[] {
		const errors: Error[] = [];
		for (const entry of this.#cleanupLedger) {
			if (entry.error !== undefined) {
				errors.push(entry.error);
			}
		}
		return errors;
	}

	#combineOwnedCleanupErrors(errors: readonly Error[]): Error {
		return errors.length === 1
			? (errors[0] as Error)
			: new AggregateError(errors, "RPC Owner cleanup failed.");
	}

	#finishCleanupSuccess(finalState: RpcConnectorClosedState): void {
		if (this.state.status !== "closing") {
			return;
		}
		this.#clearCleanupTimer();
		this.#stateSubject.next(finalState);
		this.#detachOwnedCleanupState();
		this.#stateSubject.complete();
		if (finalState.outcome === "normal") {
			this.#eventSubject.next({
				type: "topology-closed",
				outcome: "normal",
				reason: finalState.reason,
			});
		} else {
			this.#eventSubject.next({
				type: "topology-closed",
				outcome: "failed",
				reason: finalState.reason,
			});
		}
		this.#eventSubject.complete();
		this.#resolveTermination?.();
	}

	#finishCleanupFailure(value: unknown): void {
		if (this.state.status !== "closing") {
			return;
		}
		this.#clearCleanupTimer();
		const error =
			value instanceof Error ? value : new Error("RPC Owner cleanup failed.");
		this.#stateSubject.next(
			Object.freeze({
				status: "closed",
				outcome: "failed",
				reason: "cleanup-failed",
				error,
			}),
		);
		this.#detachOwnedCleanupState();
		this.#stateSubject.complete();
		this.#eventSubject.next({
			type: "topology-closed",
			outcome: "failed",
			reason: "cleanup-failed",
		});
		this.#eventSubject.complete();
		this.#rejectTermination?.(error);
	}

	#detachOwnedCleanupState(): void {
		for (const subscription of this.#connectionTerminalSubscriptions.values()) {
			try {
				subscription.unsubscribe();
			} catch {
				// Final cleanup has already selected its authoritative outcome.
			}
		}
		this.#connectionTerminalSubscriptions.clear();
		this.#ownedConnections.splice(0);
		this.#cleanupLedger.splice(0);
	}

	#clearCleanupTimer(): void {
		if (this.#cleanupTimer !== undefined) {
			clearTimeout(this.#cleanupTimer);
			this.#cleanupTimer = undefined;
		}
	}
}
