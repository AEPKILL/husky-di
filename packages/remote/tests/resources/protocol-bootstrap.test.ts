/**
 * @overview Default Protocol bootstrap transient and bearer credential ownership.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RpcDecodePhaseEnum } from "../../src/enums/protocol/rpc-decode-phase.enum";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import {
	createRpcProtocolAcceptor,
	createRpcProtocolConnector,
} from "../../src/factories/rpc-protocol.factory";
import { RpcRetainedBytesLedgerImpl } from "../../src/impls/common/rpc-retained-bytes-ledger.impl";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import type { RpcSessionImpl } from "../../src/impls/session/rpc-session.impl";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
	IRpcProtocolRuntimePolicy,
	RpcProtocolSessionTransition,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "../../src/interfaces/transport/rpc-connection.interface";
import type {
	RpcFreshAccept,
	RpcJsonRecord,
	RpcResumeRequest,
} from "../../src/types/protocol/rpc-wire-record.type";
import { createRpcSecurityCarrier } from "../../src/utils/protocol/rpc-base64-url-32-schema.util";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "../../src/utils/rpc-application-value.util";

interface IBootstrapConnectionHarness {
	readonly connection: IRpcConnection;
	readonly responses: Readonly<Record<string, unknown>>[];
	readonly subscriptionCount: number;
	readonly closeCount: number;
	emit(record: RpcJsonRecord): void;
	complete(): void;
}

type RpcSynchronousMessageTerminal =
	| Readonly<{ readonly kind: "complete" }>
	| Readonly<{ readonly kind: "error"; readonly error: Error }>;

const codec = new RpcCodecImpl();
const canonicalSessionId = "A".repeat(43);
const canonicalResumeToken = `${"B".repeat(42)}E`;

function createPolicy(
	overrides: Partial<IRpcProtocolRuntimePolicy> = {},
): IRpcProtocolRuntimePolicy {
	return {
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
		bindingAttemptTimeoutMs: 20,
		recoveryGraceMs: 300_000,
		shutdownDeadlineMs: 5_000,
		...overrides,
	};
}

function createAcceptorRuntime(
	policy: IRpcProtocolRuntimePolicy,
	onTransition: (transition: RpcProtocolSessionTransition) => void = () => {},
	shouldAdmitSession: () => boolean = () => true,
	onAdmitSession: () => void = () => {},
): {
	readonly runtime: IRpcProtocolAcceptor;
	readonly ownerFaults: string[];
	readonly admittedSessions: number[];
	readonly retainedBytes: RpcRetainedBytesLedgerImpl;
	readonly sessionImpls: RpcSessionImpl[];
} {
	const ownerFaults: string[] = [];
	const admittedSessions: number[] = [];
	const sessionImpls: RpcSessionImpl[] = [];
	const retainedBytes = new RpcRetainedBytesLedgerImpl(
		policy.maxRetainedBytesTotal,
	);
	const host: IRpcProtocolAcceptorHost = {
		policy,
		reserveRetainedBytes: (bytes) => retainedBytes.reserve(bytes),
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault: (reason) => ownerFaults.push(reason),
		admitSession: (session) => {
			if (!shouldAdmitSession()) {
				return undefined;
			}
			admittedSessions.push(1);
			sessionImpls.push(session as RpcSessionImpl);
			onAdmitSession();
			return {
				reserveIncomingCall: () => undefined,
				transition: onTransition,
				fault: (reason) => ownerFaults.push(reason),
			};
		},
	};
	return {
		runtime: createRpcProtocolAcceptor(host),
		ownerFaults,
		admittedSessions,
		retainedBytes,
		sessionImpls,
	};
}

function createConnectorRuntime(policy: IRpcProtocolRuntimePolicy): {
	readonly runtime: IRpcProtocolConnector;
	readonly ownerFaults: string[];
	readonly attachedSessions: number[];
} {
	const ownerFaults: string[] = [];
	const attachedSessions: number[] = [];
	const retainedBytes = new RpcRetainedBytesLedgerImpl(
		policy.maxRetainedBytesTotal,
	);
	const host: IRpcProtocolConnectorHost = {
		policy,
		reserveRetainedBytes: (bytes) => retainedBytes.reserve(bytes),
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault: (reason) => ownerFaults.push(reason),
		attachSession: () => {
			attachedSessions.push(1);
			return {
				reserveIncomingCall: () => undefined,
				transition() {},
				fault: (reason) => ownerFaults.push(reason),
			};
		},
	};
	return {
		runtime: createRpcProtocolConnector(host),
		ownerFaults,
		attachedSessions,
	};
}

function createBootstrapConnection(
	sendSettlement: Promise<void> = Promise.resolve(),
	synchronousTerminal?: RpcSynchronousMessageTerminal,
): IBootstrapConnectionHarness {
	const source = new Subject<Uint8Array>();
	const responses: Readonly<Record<string, unknown>>[] = [];
	let subscriptionCount = 0;
	let closeCount = 0;
	const message$ = new Observable<Uint8Array>((subscriber) => {
		subscriptionCount += 1;
		const subscription = source.subscribe(subscriber);
		if (synchronousTerminal?.kind === "error") {
			source.error(synchronousTerminal.error);
		} else if (synchronousTerminal?.kind === "complete") {
			source.complete();
		}
		return subscription;
	});
	return {
		connection: {
			message$,
			async send(bytes) {
				responses.push(
					JSON.parse(new TextDecoder().decode(bytes)) as Readonly<
						Record<string, unknown>
					>,
				);
				await sendSettlement;
			},
			async close() {
				closeCount += 1;
			},
		},
		responses,
		get subscriptionCount() {
			return subscriptionCount;
		},
		get closeCount() {
			return closeCount;
		},
		emit(record) {
			source.next(codec.encode(record));
		},
		complete() {
			source.complete();
		},
	};
}

function createFreshRequest(): RpcJsonRecord {
	return {
		kind: "fresh",
		profiles: ["husky-di-rpc/1"],
	};
}

function createResumeRequest(
	sessionId: string = canonicalSessionId,
	resumeToken: string = canonicalResumeToken,
	resumeAttempt = 1,
): RpcResumeRequest {
	return {
		kind: RpcWireRecordKindEnum.resume,
		profile: "husky-di-rpc/1",
		sessionId,
		resumeToken,
		receivedThrough: 0,
		resumeAttempt,
	};
}

function createFreshAccept(
	requestRecord: Readonly<Record<string, unknown>>,
): RpcFreshAccept {
	const request = codec.decode(
		codec.encode(requestRecord as RpcJsonRecord),
		RpcDecodePhaseEnum.bootstrapRequest,
	);
	if (request.kind !== "fresh") {
		throw new Error("Expected a fresh bootstrap request.");
	}
	return {
		kind: RpcWireRecordKindEnum.accept,
		profile: "husky-di-rpc/1",
		sessionId: canonicalSessionId,
		bindingEpoch: 1,
		resumeToken: canonicalResumeToken,
	};
}

function accept(
	runtime: IRpcProtocolAcceptor,
	connection: IBootstrapConnectionHarness,
): Promise<void> {
	const task = runtime.accept(
		connection.connection,
		new AbortController().signal,
	);
	void task.catch(() => {});
	return task;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Default RPC Protocol bootstrap resources", () => {
	it("RPC-SEC-002 RPC-SEC-008 creates canonical 256-bit carriers and overwrites controlled temporary bytes", () => {
		const generatedBytes: Uint8Array[] = [];
		vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((
			bytes: Uint8Array,
		) => {
			bytes.fill(generatedBytes.length + 1);
			generatedBytes.push(bytes);
			return bytes;
		}) as Crypto["getRandomValues"]);

		const first = createRpcSecurityCarrier();
		const second = createRpcSecurityCarrier();

		expect(first).toMatch(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u);
		expect(second).toMatch(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u);
		expect(second).not.toBe(first);
		for (const carrier of [first, second]) {
			const padded = `${carrier.replaceAll("-", "+").replaceAll("_", "/")}=`;
			expect(atob(padded)).toHaveLength(32);
		}
		expect(generatedBytes).toHaveLength(2);
		for (const bytes of generatedBytes) {
			expect(bytes).toEqual(new Uint8Array(32));
		}
	});

	it("RPC-SPI-008 RPC-TRANSPORT-005 RPC-WIRE-009 RPC-SESSION-011 holds FreshAccept until FreshRequest Local Admission", async () => {
		const requestAdmission = Promise.withResolvers<void>();
		const { runtime, ownerFaults, attachedSessions } = createConnectorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const connection = createBootstrapConnection(requestAdmission.promise);
		let settled = false;
		const task = runtime.bind(
			connection.connection,
			new AbortController().signal,
		);
		void task.then(
			() => {
				settled = true;
			},
			() => {},
		);
		await vi.waitFor(() => expect(connection.responses).toHaveLength(1));

		connection.emit(createFreshAccept(connection.responses[0] ?? {}));
		await Promise.resolve();
		await Promise.resolve();

		expect(attachedSessions).toEqual([]);
		expect(settled).toBe(false);

		requestAdmission.resolve();
		await expect(task).resolves.toBeUndefined();
		expect(attachedSessions).toEqual([1]);
		expect(settled).toBe(true);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it("RPC-START-005 RPC-SPI-008 RPC-WIRE-009 RPC-SESSION-003 RPC-SESSION-011 retains Fresh before reply Local Admission, activates afterward, and ignores late abort", async () => {
		const replyAdmission = Promise.withResolvers<void>();
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
		);
		const controller = new AbortController();
		const connection = createBootstrapConnection(replyAdmission.promise);
		let settled = false;
		const task = runtime.accept(connection.connection, controller.signal);
		void task.then(
			() => {
				settled = true;
			},
			() => {},
		);

		connection.emit(createFreshRequest());
		await vi.waitFor(() =>
			expect(connection.responses.at(-1)).toMatchObject({ kind: "accept" }),
		);

		expect(admittedSessions).toEqual([1]);
		expect(settled).toBe(false);
		expect(transitions).toEqual([]);

		replyAdmission.resolve();
		await expect(task).resolves.toBeUndefined();
		expect(settled).toBe(true);

		controller.abort();
		await Promise.resolve();
		expect(connection.closeCount).toBe(0);
		expect(transitions).toEqual([]);

		connection.complete();
		await vi.waitFor(() =>
			expect(transitions.at(-1)).toMatchObject({ type: "recovering" }),
		);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it("RPC-START-005 RPC-SESSION-011 lets Resume Binding Activation defeat a reentrant abort", async () => {
		const replacementController = new AbortController();
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => {
				transitions.push(transition);
				if (transition.type === "recovered") {
					replacementController.abort();
				}
			},
		);
		const fresh = createBootstrapConnection();
		const freshTask = accept(runtime, fresh);
		fresh.emit(createFreshRequest());
		await expect(freshTask).resolves.toBeUndefined();
		const freshAccept = fresh.responses.at(-1) as RpcFreshAccept;
		fresh.complete();
		await vi.waitFor(() =>
			expect(transitions.at(-1)).toMatchObject({ type: "recovering" }),
		);

		const replacement = createBootstrapConnection();
		const replacementTask = runtime.accept(
			replacement.connection,
			replacementController.signal,
		);
		replacement.emit(
			createResumeRequest(freshAccept.sessionId, freshAccept.resumeToken, 1),
		);

		await expect(replacementTask).resolves.toBeUndefined();
		expect(transitions.map((transition) => transition.type)).toEqual([
			"recovering",
			"recovered",
		]);
		expect(replacement.closeCount).toBe(0);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it.each([
		"shutdown",
		"close",
	] as const)("RPC-SPI-012 RPC-SESSION-011 %s fences a pre-activation Resume and prevents late activation", async (mode) => {
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
		);
		const fresh = createBootstrapConnection();
		const freshTask = accept(runtime, fresh);
		fresh.emit(createFreshRequest());
		await expect(freshTask).resolves.toBeUndefined();
		const freshAccept = fresh.responses.at(-1) as RpcFreshAccept;
		fresh.complete();
		await vi.waitFor(() =>
			expect(transitions.at(-1)).toMatchObject({ type: "recovering" }),
		);

		const replyAdmission = Promise.withResolvers<void>();
		const replacement = createBootstrapConnection(replyAdmission.promise);
		const replacementTask = runtime.accept(
			replacement.connection,
			new AbortController().signal,
		);
		void replacementTask.catch(() => {});
		replacement.emit(
			createResumeRequest(freshAccept.sessionId, freshAccept.resumeToken, 1),
		);
		await vi.waitFor(() =>
			expect(replacement.responses.at(-1)).toMatchObject({
				kind: "accept",
				bindingEpoch: 2,
			}),
		);
		expect(
			transitions.filter((transition) => transition.type === "recovered"),
		).toEqual([]);

		let termination: Promise<void>;
		if (mode === "shutdown") {
			termination = runtime.shutdown();
		} else {
			runtime.close();
			termination = Promise.resolve();
		}

		await expect(replacementTask).rejects.toThrow();
		await expect(termination).resolves.toBeUndefined();
		await vi.waitFor(() => expect(replacement.closeCount).toBe(1));

		replyAdmission.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(
			transitions.filter((transition) => transition.type === "recovered"),
		).toEqual([]);
		expect(ownerFaults).toEqual([]);
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it.each([
		"error",
		"complete",
	] as const)("RPC-SPI-008 RPC-TRANSPORT-001 RPC-TRANSPORT-003 RPC-SESSION-011 RPC-RESOURCE-004 releases the handshake slot after synchronous message$ %s", async (terminalKind) => {
		const terminalError = new Error("Synchronous message source failed.");
		const synchronousTerminal: RpcSynchronousMessageTerminal =
			terminalKind === "error"
				? { kind: "error", error: terminalError }
				: { kind: "complete" };
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const terminal = createBootstrapConnection(
			Promise.resolve(),
			synchronousTerminal,
		);
		const terminalTask = runtime.accept(
			terminal.connection,
			new AbortController().signal,
		);
		void terminalTask.catch(() => {});

		await expect(terminalTask).rejects.toThrow();
		await vi.waitFor(() => expect(terminal.closeCount).toBe(1));

		const replacement = createBootstrapConnection();
		const replacementTask = accept(runtime, replacement);
		expect(replacement.subscriptionCount).toBe(1);
		replacement.emit(createResumeRequest());
		await expect(replacementTask).rejects.toThrow(
			"Default RPC resume was generically rejected.",
		);

		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);
		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it("RPC-SPI-008 RPC-SPI-012 RPC-RESOURCE-004 RPC-SEC-009 retains the shared handshake permit until a Resume reject send settles", async () => {
		let releaseResumeReply!: () => void;
		const resumeReply = new Promise<void>((resolve) => {
			releaseResumeReply = resolve;
		});
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const resume = createBootstrapConnection(resumeReply);
		const resumeTask = accept(runtime, resume);
		resume.emit(createResumeRequest());
		await vi.waitFor(() =>
			expect(resume.responses).toEqual([
				{ kind: "reject", code: "resume-rejected" },
			]),
		);

		const overflow = createBootstrapConnection();
		const overflowTask = accept(runtime, overflow);
		await expect(overflowTask).rejects.toThrow(
			"Default RPC handshake capacity is full.",
		);
		expect(overflow.subscriptionCount).toBe(0);
		await vi.waitFor(() => expect(overflow.closeCount).toBe(1));

		releaseResumeReply();
		await expect(resumeTask).rejects.toThrow(
			"Default RPC resume was generically rejected.",
		);
		const replacement = createBootstrapConnection();
		accept(runtime, replacement);
		expect(replacement.subscriptionCount).toBe(1);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it("RPC-SESSION-003 RPC-SESSION-004 RPC-RESOURCE-003 reserves capacity before random generation and releases it on cleanup", async () => {
		const protectedBytes = 512 * 1024;
		const totalBytes = 4 * 1024 * 1024;
		const created = createAcceptorRuntime(
			createPolicy({
				maxSessions: 1,
				maxRetainedBytesPerSession: totalBytes,
				maxRetainedBytesTotal: totalBytes,
				bindingAttemptTimeoutMs: 1_000,
			}),
		);
		const occupied = created.retainedBytes.reserve(totalBytes - protectedBytes);
		if (occupied === undefined) {
			throw new Error("Expected ordinary bytes beside the protected Session.");
		}
		let generation = 0;
		const random = vi
			.spyOn(globalThis.crypto, "getRandomValues")
			.mockImplementation(((bytes: Uint8Array) => {
				expect(created.retainedBytes.reserve(1)).toBeUndefined();
				generation += 1;
				bytes.fill(generation);
				return bytes;
			}) as Crypto["getRandomValues"]);
		const retained = createBootstrapConnection();
		const retainedTask = accept(created.runtime, retained);
		retained.emit(createFreshRequest());
		await expect(retainedTask).resolves.toBeUndefined();

		expect(random).toHaveBeenCalledTimes(2);
		expect(retained.responses[0]).toMatchObject({
			kind: "accept",
			profile: "husky-di-rpc/1",
			bindingEpoch: 1,
			sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
			resumeToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
		});
		expect(retained.responses[0]?.sessionId).not.toBe(
			retained.responses[0]?.resumeToken,
		);
		const retainedSession = created.sessionImpls[0];
		expect(retainedSession?._resumeToken).toBe(
			retained.responses[0]?.resumeToken,
		);

		const overflow = createBootstrapConnection();
		const overflowTask = accept(created.runtime, overflow);
		overflow.emit(createFreshRequest());
		await expect(overflowTask).rejects.toThrow(
			"Default RPC fresh admission-rejected.",
		);
		expect(overflow.responses).toEqual([
			{ kind: "reject", code: "admission-rejected" },
		]);
		expect(random).toHaveBeenCalledTimes(2);
		expect(created.retainedBytes.reserve(1)).toBeUndefined();

		created.runtime.close();
		expect(retainedSession?._resumeToken).toBeUndefined();
		const released = created.retainedBytes.reserve(protectedBytes);
		expect(released).toBeDefined();
		released?.release();
		occupied.release();
	});

	it("RPC-RESOURCE-006 holds Fresh capacity across reentrant victim termination", async () => {
		const totalBytes = 4 * 1024 * 1024;
		const policy = createPolicy({
			maxSessions: 1,
			maxHandshakes: 3,
			maxRetainedBytesPerSession: totalBytes,
			maxRetainedBytesTotal: totalBytes,
			bindingAttemptTimeoutMs: 1_000,
		});
		let runtime: IRpcProtocolAcceptor;
		let replacementStarted = false;
		const reentrant = createBootstrapConnection();
		const created = createAcceptorRuntime(policy, (transition) => {
			if (transition.type !== "closed" || replacementStarted) {
				return;
			}
			replacementStarted = true;
			accept(runtime, reentrant);
			reentrant.emit(createFreshRequest());
		});
		runtime = created.runtime;
		const retained = createBootstrapConnection();
		const retainedTask = accept(runtime, retained);
		retained.emit(createFreshRequest());
		await expect(retainedTask).resolves.toBeUndefined();
		const occupied = created.retainedBytes.reserve(totalBytes - 512 * 1024);
		if (occupied === undefined) {
			throw new Error("Expected ordinary bytes beside the protected Session.");
		}
		retained.complete();

		const fresh = createBootstrapConnection();
		const freshTask = accept(runtime, fresh);
		fresh.emit(createFreshRequest());
		await expect(freshTask).resolves.toBeUndefined();
		await vi.waitFor(() => expect(reentrant.closeCount).toBe(1));

		expect(reentrant.responses).toEqual([
			{ kind: "reject", code: "admission-rejected" },
		]);
		expect(created.admittedSessions).toEqual([1, 1]);
		expect(created.ownerFaults).toEqual([]);

		runtime.close();
		occupied.release();
	});

	it("RPC-SESSION-002 faults after exactly eight retained Session ID collisions", async () => {
		const random = vi
			.spyOn(globalThis.crypto, "getRandomValues")
			.mockImplementation(((bytes: Uint8Array) => {
				bytes.fill(0);
				return bytes;
			}) as Crypto["getRandomValues"]);
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const retained = createBootstrapConnection();
		const retainedTask = accept(runtime, retained);
		retained.emit(createFreshRequest());
		await expect(retainedTask).resolves.toBeUndefined();

		const colliding = createBootstrapConnection();
		const collidingTask = accept(runtime, colliding);
		colliding.emit(createFreshRequest());
		await expect(collidingTask).rejects.toThrow(
			"Default RPC Session ID failed.",
		);

		expect(random).toHaveBeenCalledTimes(10);
		expect(colliding.responses).toEqual([]);
		expect(admittedSessions).toEqual([1]);
		expect(ownerFaults).toEqual(["protocol-fault"]);

		runtime.close();
	});

	it("RPC-SESSION-002 RPC-SESSION-004 releases provisional identity and Session ownership after admission rejection", async () => {
		const fills = [1, 2, 1, 3];
		let generation = 0;
		const random = vi
			.spyOn(globalThis.crypto, "getRandomValues")
			.mockImplementation(((bytes: Uint8Array) => {
				bytes.fill(fills[generation] ?? 4);
				generation += 1;
				return bytes;
			}) as Crypto["getRandomValues"]);
		let admissionAttempt = 0;
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ maxSessions: 1, bindingAttemptTimeoutMs: 1_000 }),
			() => {},
			() => {
				admissionAttempt += 1;
				return admissionAttempt > 1;
			},
		);
		const rejected = createBootstrapConnection();
		const rejectedTask = accept(runtime, rejected);
		rejected.emit(createFreshRequest());
		await expect(rejectedTask).rejects.toThrow(
			"Default RPC fresh admission-rejected.",
		);
		expect(rejected.responses).toEqual([
			{ kind: "reject", code: "admission-rejected" },
		]);

		const replacement = createBootstrapConnection();
		const replacementTask = accept(runtime, replacement);
		replacement.emit(createFreshRequest());
		await expect(replacementTask).resolves.toBeUndefined();

		expect(random).toHaveBeenCalledTimes(4);
		expect(replacement.responses.at(-1)).toMatchObject({ kind: "accept" });
		expect(admittedSessions).toEqual([1]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SESSION-006 RPC-SESSION-007 RPC-SESSION-009 RPC-SEC-009 ignores late reply admission from a lower raw-token attempt", async () => {
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults } = createAcceptorRuntime(
			createPolicy({ maxHandshakes: 2, bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
		);
		const fresh = createBootstrapConnection();
		const freshTask = accept(runtime, fresh);
		fresh.emit(createFreshRequest());
		await expect(freshTask).resolves.toBeUndefined();
		const freshAccept = fresh.responses.at(-1) as RpcFreshAccept;
		fresh.complete();
		await vi.waitFor(() =>
			expect(transitions.at(-1)).toMatchObject({ type: "recovering" }),
		);

		let releaseFirstReply!: () => void;
		const firstReply = new Promise<void>((resolve) => {
			releaseFirstReply = resolve;
		});
		const first = createBootstrapConnection(firstReply);
		const firstController = new AbortController();
		const firstTask = runtime.accept(first.connection, firstController.signal);
		void firstTask.catch(() => {});
		first.emit(
			createResumeRequest(freshAccept.sessionId, freshAccept.resumeToken, 1),
		);
		await vi.waitFor(() =>
			expect(first.responses.at(-1)).toMatchObject({
				kind: "accept",
				bindingEpoch: 2,
			}),
		);
		firstController.abort();
		await expect(firstTask).rejects.toThrow(
			"Default RPC fresh acceptance was aborted.",
		);
		await vi.waitFor(() => expect(first.closeCount).toBe(1));

		const winner = createBootstrapConnection();
		const winnerTask = accept(runtime, winner);
		winner.emit(
			createResumeRequest(freshAccept.sessionId, freshAccept.resumeToken, 2),
		);
		await expect(winnerTask).resolves.toBeUndefined();
		expect(winner.responses.at(-1)).toMatchObject({
			kind: "accept",
			bindingEpoch: 3,
		});

		releaseFirstReply();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(
			transitions.filter((transition) => transition.type === "recovered"),
		).toHaveLength(1);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-WIRE-009 RPC-SESSION-011 RPC-RECOVERY-002 rejects active ingress before reply Local Admission and never activates", async () => {
		let releaseReply!: () => void;
		const replySettlement = new Promise<void>((resolve) => {
			releaseReply = resolve;
		});
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
		);
		const connection = createBootstrapConnection(replySettlement);
		const task = accept(runtime, connection);
		connection.emit(createFreshRequest());
		await vi.waitFor(() =>
			expect(connection.responses.at(-1)).toMatchObject({ kind: "accept" }),
		);

		connection.emit({ kind: RpcWireRecordKindEnum.ping });
		releaseReply();

		await expect(task).rejects.toThrow(
			"Default RPC active record arrived before Binding Activation.",
		);
		await vi.waitFor(() => expect(connection.closeCount).toBe(1));
		expect(transitions.at(-1)).toMatchObject({ type: "recovering" });
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("rolls back a Fresh Peer when abort reenters Topology admission", async () => {
		const controller = new AbortController();
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
			() => true,
			() => controller.abort(),
		);
		const connection = createBootstrapConnection();
		const task = runtime.accept(connection.connection, controller.signal);
		void task.catch(() => {});

		connection.emit(createFreshRequest());

		await expect(task).rejects.toThrow(
			"Default RPC fresh acceptance was aborted.",
		);
		expect(admittedSessions).toEqual([1]);
		expect(transitions).toEqual([{ type: "closed", reason: "forced-close" }]);
		expect(connection.responses).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SESSION-003 RPC-SESSION-010 RPC-SEC-009 discards Fresh admission after attempt abort while request admission is late", async () => {
		let releaseRequest!: () => void;
		const requestSettlement = new Promise<void>((resolve) => {
			releaseRequest = resolve;
		});
		const { runtime, ownerFaults, attachedSessions } = createConnectorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const controller = new AbortController();
		const stale = createBootstrapConnection(requestSettlement);
		const staleTask = runtime.bind(stale.connection, controller.signal);
		void staleTask.catch(() => {});
		await vi.waitFor(() => expect(stale.responses).toHaveLength(1));
		const acceptRecord = createFreshAccept(stale.responses[0] ?? {});
		stale.emit(acceptRecord);

		controller.abort();
		await expect(staleTask).rejects.toThrow(
			"Default RPC Connector binding attempt failed.",
		);
		await vi.waitFor(() => expect(stale.closeCount).toBe(1));
		const replacement = createBootstrapConnection();
		const replacementTask = runtime.bind(
			replacement.connection,
			new AbortController().signal,
		);
		void replacementTask.catch(() => {});
		expect(replacement.subscriptionCount).toBe(1);
		await vi.waitFor(() => expect(replacement.responses).toHaveLength(1));

		releaseRequest();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(attachedSessions).toEqual([]);
		expect(replacement.responses[0]).toEqual(createFreshRequest());
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SESSION-004 RPC-VALID-003 rejects an unsupported Fresh profile before random generation", async () => {
		const random = vi.spyOn(globalThis.crypto, "getRandomValues");
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const connection = createBootstrapConnection();
		const task = accept(runtime, connection);
		connection.emit({
			...createFreshRequest(),
			profiles: ["unsupported-profile"],
		});
		await expect(task).rejects.toThrow(
			"Default RPC fresh unsupported-profile.",
		);

		expect(connection.responses).toEqual([
			{ kind: "reject", code: "unsupported-profile" },
		]);
		expect(random).not.toHaveBeenCalled();
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-VALID-003 keeps an invalid unbound first record Connection-scoped", async () => {
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const connection = createBootstrapConnection();
		const task = accept(runtime, connection);
		connection.emit({ kind: "bogus" });
		await expect(task).rejects.toThrow();

		expect(connection.responses).toEqual([]);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});
});
