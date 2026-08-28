/**
 * @overview Default Protocol role binding manager transaction behavior.
 * @author AEPKILL
 * @created 2026-08-28 23:18:00
 */

import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { RpcEndpointFailureEnum } from "../../src/enums/protocol/rpc-endpoint-failure.enum";
import { RpcRetainedBytesLedgerImpl } from "../../src/impls/common/rpc-retained-bytes-ledger.impl";
import {
	RpcAcceptorBindingsImpl,
	RpcConnectorBindingsImpl,
} from "../../src/impls/endpoint/rpc-bindings.impl";
import { RpcEndpointImpl } from "../../src/impls/endpoint/rpc-endpoint.impl";
import type {
	IRpcConnectorBindingContext,
	RpcAcceptorBindingDecision,
} from "../../src/interfaces/endpoint/rpc-bindings.interface";
import type { IRpcEndpoint } from "../../src/interfaces/endpoint/rpc-endpoint.interface";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnectorHost,
	IRpcProtocolRuntimePolicy,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcSession,
	RpcBindingCandidate,
	RpcBindingEpoch,
} from "../../src/interfaces/session/rpc-session.interface";
import type { IRpcConnection } from "../../src/interfaces/transport/rpc-connection.interface";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "../../src/utils/rpc-application-value.util";

const policy: IRpcProtocolRuntimePolicy = Object.freeze({
	maxSessions: 8,
	maxHandshakes: 1,
	maxPendingInvocationsPerSession: 256,
	maxRetainedBytesPerSession: 32 * 1024 * 1024,
	maxRetainedBytesTotal: 64 * 1024 * 1024,
	maxHandlersPerSession: 16,
	maxHandlersTotal: 64,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 1_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
});

function createHost(): IRpcProtocolAcceptorHost {
	const retainedBytes = new RpcRetainedBytesLedgerImpl(
		policy.maxRetainedBytesTotal,
	);
	return {
		policy,
		reserveRetainedBytes: (bytes) => retainedBytes.reserve(bytes),
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault() {},
		admitSession: () => undefined,
	};
}

function createConnectorHost(): IRpcProtocolConnectorHost {
	const retainedBytes = new RpcRetainedBytesLedgerImpl(
		policy.maxRetainedBytesTotal,
	);
	return {
		policy,
		reserveRetainedBytes: (bytes) => retainedBytes.reserve(bytes),
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault() {},
		attachSession: () => undefined,
	};
}

function createConnection(): Readonly<{
	connection: IRpcConnection;
	emit(bytes: Uint8Array): void;
	readonly closeCount: number;
	readonly sendCount: number;
}>;
function createConnection(sendSettlement: Promise<void>): Readonly<{
	connection: IRpcConnection;
	emit(bytes: Uint8Array): void;
	readonly closeCount: number;
	readonly sendCount: number;
}>;
function createConnection(
	sendSettlement: Promise<void> = Promise.resolve(),
): Readonly<{
	connection: IRpcConnection;
	emit(bytes: Uint8Array): void;
	readonly closeCount: number;
	readonly sendCount: number;
}> {
	const messages = new Subject<Uint8Array>();
	let closeCount = 0;
	let sendCount = 0;
	return {
		connection: {
			message$: messages,
			send: () => {
				sendCount += 1;
				return sendSettlement;
			},
			close: () => {
				closeCount += 1;
				return Promise.resolve();
			},
		},
		emit: (bytes) => messages.next(bytes),
		get closeCount() {
			return closeCount;
		},
		get sendCount() {
			return sendCount;
		},
	};
}

function createBindingEpoch(onFailed?: () => void): Readonly<{
	readonly binding: RpcBindingEpoch;
	readonly activate: ReturnType<typeof vi.fn<() => boolean>>;
	readonly failed: ReturnType<
		typeof vi.fn<(reason: RpcEndpointFailureEnum, error?: Error) => void>
	>;
}> {
	const activate = vi.fn<() => boolean>(() => true);
	const failed = vi.fn<(reason: RpcEndpointFailureEnum, error?: Error) => void>(
		() => onFailed?.(),
	);
	return {
		binding: {
			reserveRetainedBytes: () => undefined,
			receive() {},
			failed,
			activate,
		} as unknown as RpcBindingEpoch,
		activate,
		failed,
	};
}

function createSession(
	sessionId: string,
	onTerminal: () => void,
	commitBinding: (
		candidate: RpcBindingCandidate,
		endpoint: IRpcEndpoint,
	) => ReturnType<IRpcSession["commitBinding"]>,
): Readonly<{
	readonly session: IRpcSession;
	readonly terminateForced: ReturnType<typeof vi.fn<() => void>>;
	readonly shutdown: ReturnType<typeof vi.fn<() => Promise<void>>>;
	readonly commitBinding: ReturnType<
		typeof vi.fn<IRpcSession["commitBinding"]>
	>;
}> {
	const terminateForced = vi.fn<() => void>(() => onTerminal());
	const shutdown = vi.fn<() => Promise<void>>(() => {
		onTerminal();
		return Promise.resolve();
	});
	const commit = vi.fn<IRpcSession["commitBinding"]>(commitBinding);
	const unused = (): never => {
		throw new Error("Unexpected Session method in binding-manager test.");
	};
	return {
		session: {
			sessionId,
			recovery: undefined,
			reserveInvocation: () => undefined,
			forceClose: terminateForced,
			prepareFreshBinding: unused,
			beginInitiatorResume: unused,
			prepareInitiatorBinding: unused,
			reviewResponderResume: unused,
			commitContinuityFailure: unused,
			terminateRemoteResume: unused,
			terminateForced,
			commitBinding: commit,
			shutdown,
		},
		terminateForced,
		shutdown,
		commitBinding: commit,
	};
}

const candidate = Object.freeze({}) as RpcBindingCandidate;

describe("Default RPC Connector bindings", () => {
	it("holds a response until request Local Admission and owns the retained slot", async () => {
		const bindings = new RpcConnectorBindingsImpl({
			host: createConnectorHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const request = Promise.withResolvers<void>();
		const epoch = createBindingEpoch();
		const connection = createConnection(request.promise);
		let created: ReturnType<typeof createSession> | undefined;
		const decide = vi.fn((context: IRpcConnectorBindingContext) => {
			const prepared = context.prepareFresh({
				createSession: (onTerminal) => {
					created = createSession("connector-session", onTerminal, () => ({
						kind: "installed",
						binding: epoch.binding,
					}));
					return { session: created.session, value: undefined };
				},
			});
			if (prepared === undefined) {
				throw new Error("Expected a provisional Fresh Session.");
			}
			return context.install({ target: prepared, candidate });
		});
		const task = bindings.bind(
			connection.connection,
			new AbortController().signal,
			{
				begin: () => ({ message: new Uint8Array([1]), state: undefined }),
				decide: (context) => decide(context),
			},
		);
		void task.catch(() => {});
		await expect.poll(() => connection.sendCount).toBe(1);

		connection.emit(new Uint8Array([2]));
		await Promise.resolve();
		expect(decide).not.toHaveBeenCalled();
		expect(bindings.session).toBeUndefined();

		request.resolve();
		await expect(task).resolves.toBeUndefined();
		expect(decide).toHaveBeenCalledOnce();
		expect(bindings.session).toBe(created?.session);
		expect(epoch.activate).toHaveBeenCalledOnce();

		bindings.close();
		expect(bindings.session).toBeUndefined();
	});

	it("shuts down a Session retained after shutdown reenters Binding Linearization", async () => {
		const bindings = new RpcConnectorBindingsImpl({
			host: createConnectorHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const epoch = createBindingEpoch();
		const connection = createConnection();
		let created: ReturnType<typeof createSession> | undefined;
		let shutdownTask: Promise<void> | undefined;
		const task = bindings.bind(
			connection.connection,
			new AbortController().signal,
			{
				begin: () => ({ message: new Uint8Array([1]), state: undefined }),
				decide: (context) => {
					const prepared = context.prepareFresh({
						createSession: (onTerminal) => {
							created = createSession(
								"shutdown-connector-session",
								onTerminal,
								() => {
									shutdownTask = bindings.shutdown();
									return { kind: "installed", binding: epoch.binding };
								},
							);
							return { session: created.session, value: undefined };
						},
					});
					if (prepared === undefined) {
						throw new Error("Expected a provisional Fresh Session.");
					}
					return context.install({ target: prepared, candidate });
				},
			},
		);
		void task.catch(() => {});
		await expect.poll(() => connection.sendCount).toBe(1);

		connection.emit(new Uint8Array([2]));

		await expect(task).rejects.toThrow(
			"Default RPC Connector is shutting down.",
		);
		await expect(shutdownTask).resolves.toBeUndefined();
		expect(created?.shutdown).toHaveBeenCalledOnce();
		expect(bindings.session).toBeUndefined();
		expect(epoch.failed).toHaveBeenCalledOnce();
		expect(epoch.activate).not.toHaveBeenCalled();
	});
});

describe("Default RPC Acceptor bindings", () => {
	it("keeps abort before Binding Linearization attempt-scoped and releases the slot", async () => {
		const bindings = new RpcAcceptorBindingsImpl({
			host: createHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const controller = new AbortController();
		const connection = createConnection();
		let created: ReturnType<typeof createSession> | undefined;
		const task = bindings.accept(connection.connection, controller.signal, {
			decide: (context) => {
				const prepared = context.prepareFresh({
					createIdentity: () => "provisional-session",
					createSession: (sessionId, onTerminal) => {
						created = createSession(sessionId, onTerminal, () => {
							throw new Error("Binding Linearization must not start.");
						});
						return { session: created.session, value: undefined };
					},
				});
				if (prepared === undefined) {
					throw new Error("Expected a provisional Fresh Session.");
				}
				controller.abort();
				return context.accept({
					target: prepared,
					candidate,
					reply: new Uint8Array(),
				});
			},
		});
		void task.catch(() => {});

		connection.emit(new Uint8Array([1]));

		await expect(task).rejects.toThrow(
			"Default RPC fresh acceptance was aborted.",
		);
		expect(created?.commitBinding).not.toHaveBeenCalled();
		expect(created?.terminateForced).toHaveBeenCalledTimes(1);
		expect(bindings.session("provisional-session")).toBeUndefined();
		await expect.poll(() => connection.closeCount).toBe(1);

		const replacement = createConnection();
		const replacementTask = bindings.accept(
			replacement.connection,
			new AbortController().signal,
			{
				decide: (context) =>
					context.reject(new Uint8Array(), new Error("done")),
			},
		);
		void replacementTask.catch(() => {});
		replacement.emit(new Uint8Array([1]));
		await expect(replacementTask).rejects.toThrow("done");
		bindings.close();
	});

	it("publishes and fails the exact Epoch when abort reenters Binding Linearization", async () => {
		const bindings = new RpcAcceptorBindingsImpl({
			host: createHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const controller = new AbortController();
		const epoch = createBindingEpoch();
		let created: ReturnType<typeof createSession> | undefined;
		const connection = createConnection();
		const task = bindings.accept(connection.connection, controller.signal, {
			decide: (context) => {
				const prepared = context.prepareFresh({
					createIdentity: () => "linearized-session",
					createSession: (sessionId, onTerminal) => {
						created = createSession(sessionId, onTerminal, () => {
							controller.abort();
							return { kind: "installed", binding: epoch.binding };
						});
						return { session: created.session, value: undefined };
					},
				});
				if (prepared === undefined) {
					throw new Error("Expected a provisional Fresh Session.");
				}
				return context.accept({
					target: prepared,
					candidate,
					reply: new Uint8Array(),
				});
			},
		});
		void task.catch(() => {});

		connection.emit(new Uint8Array([1]));

		await expect(task).rejects.toThrow(
			"Default RPC fresh acceptance was aborted.",
		);
		expect(bindings.session("linearized-session")).toBe(created?.session);
		expect(epoch.failed).toHaveBeenCalledOnce();
		expect(epoch.failed).toHaveBeenCalledWith(
			RpcEndpointFailureEnum.connection,
			expect.any(Error),
		);
		expect(epoch.activate).not.toHaveBeenCalled();
		expect(created?.terminateForced).not.toHaveBeenCalled();
		bindings.close();
	});

	it("shuts down a Session retained after shutdown reenters Binding Linearization", async () => {
		const bindings = new RpcAcceptorBindingsImpl({
			host: createHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const epoch = createBindingEpoch();
		let created: ReturnType<typeof createSession> | undefined;
		let shutdownTask: Promise<void> | undefined;
		const connection = createConnection();
		const task = bindings.accept(
			connection.connection,
			new AbortController().signal,
			{
				decide: (context) => {
					const prepared = context.prepareFresh({
						createIdentity: () => "shutdown-acceptor-session",
						createSession: (sessionId, onTerminal) => {
							created = createSession(sessionId, onTerminal, () => {
								shutdownTask = bindings.shutdown();
								return { kind: "installed", binding: epoch.binding };
							});
							return { session: created.session, value: undefined };
						},
					});
					if (prepared === undefined) {
						throw new Error("Expected a provisional Fresh Session.");
					}
					return context.accept({
						target: prepared,
						candidate,
						reply: new Uint8Array(),
					});
				},
			},
		);
		void task.catch(() => {});

		connection.emit(new Uint8Array([1]));

		await expect(task).rejects.toThrow(
			"Default RPC Acceptor is shutting down.",
		);
		await expect(shutdownTask).resolves.toBeUndefined();
		expect(created?.shutdown).toHaveBeenCalledOnce();
		expect(bindings.session("shutdown-acceptor-session")).toBeUndefined();
		expect(epoch.failed).toHaveBeenCalledOnce();
		expect(epoch.activate).not.toHaveBeenCalled();
	});

	it("publishes one shutdown task before binding failure can reenter shutdown", async () => {
		const bindings = new RpcAcceptorBindingsImpl({
			host: createHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		let reenteredShutdown: Promise<void> | undefined;
		const epoch = createBindingEpoch(() => {
			reenteredShutdown = bindings.shutdown();
		});
		const reply = Promise.withResolvers<void>();
		let created: ReturnType<typeof createSession> | undefined;
		const connection = createConnection(reply.promise);
		const task = bindings.accept(
			connection.connection,
			new AbortController().signal,
			{
				decide: (context) => {
					const prepared = context.prepareFresh({
						createIdentity: () => "reentrant-shutdown-session",
						createSession: (sessionId, onTerminal) => {
							created = createSession(sessionId, onTerminal, () => ({
								kind: "installed",
								binding: epoch.binding,
							}));
							return { session: created.session, value: undefined };
						},
					});
					if (prepared === undefined) {
						throw new Error("Expected a provisional Fresh Session.");
					}
					return context.accept({
						target: prepared,
						candidate,
						reply: new Uint8Array(),
					});
				},
			},
		);
		void task.catch(() => {});

		connection.emit(new Uint8Array([1]));
		await expect
			.poll(
				() =>
					created !== undefined &&
					bindings.session("reentrant-shutdown-session") === created.session,
			)
			.toBe(true);

		const shutdown = bindings.shutdown();
		expect(reenteredShutdown).toBe(shutdown);
		expect(bindings.shutdown()).toBe(shutdown);
		reply.resolve();

		await expect(task).rejects.toThrow(
			"Default RPC Acceptor is shutting down.",
		);
		await expect(shutdown).resolves.toBeUndefined();
		expect(created?.shutdown).toHaveBeenCalledOnce();
		expect(bindings.session("reentrant-shutdown-session")).toBeUndefined();
	});

	it("force-closes a Session retained after close reenters Binding Linearization", async () => {
		const bindings = new RpcAcceptorBindingsImpl({
			host: createHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const epoch = createBindingEpoch();
		let created: ReturnType<typeof createSession> | undefined;
		const connection = createConnection();
		const task = bindings.accept(
			connection.connection,
			new AbortController().signal,
			{
				decide: (context) => {
					const prepared = context.prepareFresh({
						createIdentity: () => "closed-acceptor-session",
						createSession: (sessionId, onTerminal) => {
							created = createSession(sessionId, onTerminal, () => {
								bindings.close();
								return { kind: "installed", binding: epoch.binding };
							});
							return { session: created.session, value: undefined };
						},
					});
					if (prepared === undefined) {
						throw new Error("Expected a provisional Fresh Session.");
					}
					return context.accept({
						target: prepared,
						candidate,
						reply: new Uint8Array(),
					});
				},
			},
		);
		void task.catch(() => {});

		connection.emit(new Uint8Array([1]));

		await expect(task).rejects.toThrow("Default RPC Acceptor was closed.");
		expect(created?.terminateForced).toHaveBeenCalledOnce();
		expect(bindings.session("closed-acceptor-session")).toBeUndefined();
		expect(epoch.failed).toHaveBeenCalledOnce();
		expect(epoch.activate).not.toHaveBeenCalled();
	});

	it("retains before reply Local Admission, activates afterward, and ignores late abort", async () => {
		const bindings = new RpcAcceptorBindingsImpl({
			host: createHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const controller = new AbortController();
		const reply = Promise.withResolvers<void>();
		const epoch = createBindingEpoch();
		let created: ReturnType<typeof createSession> | undefined;
		const connection = createConnection(reply.promise);
		const task = bindings.accept(connection.connection, controller.signal, {
			decide: (context) => {
				const prepared = context.prepareFresh({
					createIdentity: () => "retained-session",
					createSession: (sessionId, onTerminal) => {
						created = createSession(sessionId, onTerminal, () => ({
							kind: "installed",
							binding: epoch.binding,
						}));
						return { session: created.session, value: undefined };
					},
				});
				if (prepared === undefined) {
					throw new Error("Expected a provisional Fresh Session.");
				}
				return context.accept({
					target: prepared,
					candidate,
					reply: new Uint8Array(),
				});
			},
		});
		void task.catch(() => {});

		connection.emit(new Uint8Array([1]));
		await expect
			.poll(
				() =>
					created !== undefined &&
					bindings.session("retained-session") === created.session,
			)
			.toBe(true);
		expect(epoch.activate).not.toHaveBeenCalled();

		reply.resolve();
		await expect(task).resolves.toBeUndefined();
		expect(epoch.activate).toHaveBeenCalledOnce();
		controller.abort();
		await Promise.resolve();
		expect(epoch.failed).not.toHaveBeenCalled();
		bindings.close();
	});

	it("force-closes a Session that violates its reserved Fresh identity", async () => {
		const bindings = new RpcAcceptorBindingsImpl({
			host: createHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const epoch = createBindingEpoch();
		let created: ReturnType<typeof createSession> | undefined;
		const connection = createConnection();
		const task = bindings.accept(
			connection.connection,
			new AbortController().signal,
			{
				decide: (context) => {
					const prepared = context.prepareFresh({
						createIdentity: () => "reserved-session",
						createSession: (_sessionId, onTerminal) => {
							created = createSession("wrong-session", onTerminal, () => ({
								kind: "installed",
								binding: epoch.binding,
							}));
							return { session: created.session, value: undefined };
						},
					});
					return prepared === undefined
						? context.fail(new Error("Fresh preparation failed."))
						: context.accept({
								target: prepared,
								candidate,
								reply: new Uint8Array(),
							});
				},
			},
		);
		void task.catch(() => {});

		connection.emit(new Uint8Array([1]));

		await expect(task).rejects.toThrow(
			"Default RPC prepared Session identity changed.",
		);
		expect(created?.terminateForced).toHaveBeenCalledTimes(1);
		expect(bindings.session("wrong-session")).toBeUndefined();
		bindings.close();
	});

	it("rejects a forged opaque decision without granting transaction authority", async () => {
		const bindings = new RpcAcceptorBindingsImpl({
			host: createHost(),
			createEndpoint: (options) => new RpcEndpointImpl(options),
		});
		const connection = createConnection();
		const task = bindings.accept(
			connection.connection,
			new AbortController().signal,
			{
				decide: () => Object.freeze({}) as RpcAcceptorBindingDecision,
			},
		);
		void task.catch(() => {});

		connection.emit(new Uint8Array([1]));

		await expect(task).rejects.toThrow(
			"Default RPC binding decision is foreign or already consumed.",
		);
		await expect.poll(() => connection.closeCount).toBe(1);
		bindings.close();
	});
});
