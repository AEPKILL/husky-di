/**
 * @overview Default Protocol bootstrap transient and cryptographic job ownership.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RpcDecodePhaseEnum } from "../../src/enums/protocol/rpc-decode-phase.enum";
import { RpcProofOperationKindEnum } from "../../src/enums/protocol/rpc-proof-operation-kind.enum";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { getRpcProtocol } from "../../src/factories/rpc-protocol.factory";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import { RpcCryptographyImpl } from "../../src/impls/protocol/rpc-cryptography.impl";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorHost,
	IRpcProtocolConnectorRuntime,
	IRpcProtocolRuntimePolicy,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "../../src/interfaces/rpc-connection.interface";
import type {
	RpcFreshAccept,
	RpcJsonRecord,
} from "../../src/types/protocol/rpc-wire-record.type";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "../../src/utils/rpc-application-value.util";

const codec = new RpcCodecImpl();
const cryptography = new RpcCryptographyImpl();

interface IBootstrapConnectionHarness {
	readonly connection: IRpcConnection;
	readonly responses: Readonly<Record<string, unknown>>[];
	readonly subscriptionCount: number;
	readonly closeCount: number;
	emit(record: RpcJsonRecord): void;
}

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

function createAcceptorRuntime(policy: IRpcProtocolRuntimePolicy): {
	readonly runtime: IRpcProtocolAcceptorRuntime;
	readonly ownerFaults: string[];
	readonly admittedSessions: number[];
} {
	const ownerFaults: string[] = [];
	const admittedSessions: number[] = [];
	const host: IRpcProtocolAcceptorHost = {
		policy,
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault: (reason) => ownerFaults.push(reason),
		admitSession: () => {
			admittedSessions.push(1);
			return {
				reserveIncomingCall: () => undefined,
				transition() {},
				fault: (reason) => ownerFaults.push(reason),
			};
		},
	};
	return {
		runtime: getRpcProtocol().createAcceptor(host),
		ownerFaults,
		admittedSessions,
	};
}

function createConnectorRuntime(policy: IRpcProtocolRuntimePolicy): {
	readonly runtime: IRpcProtocolConnectorRuntime;
	readonly ownerFaults: string[];
	readonly attachedSessions: number[];
} {
	const ownerFaults: string[] = [];
	const attachedSessions: number[] = [];
	const host: IRpcProtocolConnectorHost = {
		policy,
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
		runtime: getRpcProtocol().createConnector(host),
		ownerFaults,
		attachedSessions,
	};
}

function createBootstrapConnection(): IBootstrapConnectionHarness {
	const source = new Subject<Uint8Array>();
	const responses: Readonly<Record<string, unknown>>[] = [];
	let subscriptionCount = 0;
	let closeCount = 0;
	const message$ = new Observable<Uint8Array>((subscriber) => {
		subscriptionCount += 1;
		return source.subscribe(subscriber);
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
	};
}

function createFreshRequest(): RpcJsonRecord {
	const nonce = cryptography.createRandomCarrier();
	nonce.bytes.fill(0);
	return {
		kind: "fresh",
		profiles: ["husky-di-rpc/1"],
		initiatorNonce: nonce.value,
	};
}

function createResumeRequest(): RpcJsonRecord {
	const carrier = cryptography.createRandomCarrier().value;
	return {
		kind: "resume",
		profile: "husky-di-rpc/1",
		sessionId: carrier,
		receivedThrough: 0,
		resumeAttempt: 1,
		initiatorNonce: carrier,
		proof: carrier,
	};
}

async function createFreshAccept(
	requestRecord: Readonly<Record<string, unknown>>,
): Promise<RpcFreshAccept> {
	const request = codec.decode(
		codec.encode(requestRecord as RpcJsonRecord),
		RpcDecodePhaseEnum.bootstrapRequest,
	);
	if (request.kind !== "fresh") {
		throw new Error("Expected a fresh bootstrap request.");
	}
	const sessionId = cryptography.createRandomCarrier();
	const secret = cryptography.createRandomCarrier();
	const responderNonce = cryptography.createRandomCarrier();
	const proofKey = await cryptography.deriveProofKey(
		secret.bytes,
		sessionId.value,
	);
	const acceptWithoutProof = {
		kind: RpcWireRecordKindEnum.accept,
		profile: "husky-di-rpc/1",
		sessionId: sessionId.value,
		bindingEpoch: 1,
		responderNonce: responderNonce.value,
		sessionSecret: secret.value,
	} as const;
	return {
		...acceptWithoutProof,
		proof: await cryptography.signProof({
			kind: RpcProofOperationKindEnum.freshAccept,
			proofKey,
			request,
			record: acceptWithoutProof,
		}),
	};
}

function accept(
	runtime: IRpcProtocolAcceptorRuntime,
	connection: IBootstrapConnectionHarness,
): Promise<void> {
	const task = runtime.accept(
		connection.connection,
		new AbortController().signal,
	);
	void task.catch(() => {});
	return task;
}

afterEach(() => vi.restoreAllMocks());

describe("Default RPC Protocol bootstrap resources", () => {
	it("RPC-SEC-008 overwrites controlled secret bytes and retains only a non-extractable key", async () => {
		const secret = new Uint8Array(32);
		secret.fill(7);
		const sessionId = cryptography.createRandomCarrier().value;

		const proofKey = await cryptography.deriveProofKey(secret, sessionId);

		expect(secret).toEqual(new Uint8Array(32));
		expect(proofKey.extractable).toBe(false);
	});

	it("RPC-SPI-008/RPC-SPI-012/RPC-RESOURCE-004/RPC-SEC-009/RPC-VALID-003 retains a shared slot for a never-settling digest after attempt timeout", async () => {
		vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(
			() => new Promise<ArrayBuffer>(() => {}),
		);
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const first = createBootstrapConnection();
		accept(runtime, first);
		first.emit(createFreshRequest());
		await vi.waitFor(() =>
			expect(globalThis.crypto.subtle.digest).toHaveBeenCalledTimes(1),
		);
		await vi.waitFor(() => expect(first.closeCount).toBe(1));

		const overflow = createBootstrapConnection();
		accept(runtime, overflow);

		expect(overflow.subscriptionCount).toBe(0);
		expect(overflow.closeCount).toBe(0);
		await Promise.resolve();
		expect(overflow.closeCount).toBe(1);
		expect(overflow.responses).toEqual([]);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it("RPC-SESSION-003/RPC-SESSION-004 reserves fresh Session capacity before proof work", async () => {
		const digest = vi
			.spyOn(globalThis.crypto.subtle, "digest")
			.mockImplementationOnce(() => new Promise<ArrayBuffer>(() => {}))
			.mockRejectedValue(new Error("unexpected second proof job"));
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({
				maxSessions: 1,
				maxHandshakes: 2,
				bindingAttemptTimeoutMs: 1_000,
			}),
		);
		const first = createBootstrapConnection();
		accept(runtime, first);
		first.emit(createFreshRequest());
		await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(1));

		for (let attemptIndex = 0; attemptIndex < 4; attemptIndex += 1) {
			const overflow = createBootstrapConnection();
			accept(runtime, overflow);
			overflow.emit(createFreshRequest());
			await vi.waitFor(() => expect(overflow.closeCount).toBe(1));
			expect(overflow.responses).toEqual([
				{ kind: "reject", code: "admission-rejected" },
			]);
		}

		expect(digest).toHaveBeenCalledTimes(1);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SESSION-002 reserves a provisional ID and faults after exactly eight CSPRNG collisions", async () => {
		const freshRequest = createFreshRequest();
		const random = vi
			.spyOn(globalThis.crypto, "getRandomValues")
			.mockImplementation((array) => {
				new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(
					0,
				);
				return array;
			});
		vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(
			() => new Promise<ArrayBuffer>(() => {}),
		);
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({
				maxHandshakes: 2,
				bindingAttemptTimeoutMs: 1_000,
			}),
		);
		const provisional = createBootstrapConnection();
		accept(runtime, provisional);
		provisional.emit(freshRequest);
		await vi.waitFor(() =>
			expect(globalThis.crypto.subtle.digest).toHaveBeenCalledTimes(1),
		);

		const colliding = createBootstrapConnection();
		accept(runtime, colliding);
		colliding.emit(freshRequest);
		await vi.waitFor(() => expect(colliding.closeCount).toBe(1));

		expect(random).toHaveBeenCalledTimes(11);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual(["protocol-fault"]);

		runtime.close();
	});

	it("RPC-SEC-009 retains a timed-out HMAC job until late settlement without installing its candidate RPC-CORPUS-004", async () => {
		const nativeSign = globalThis.crypto.subtle.sign.bind(
			globalThis.crypto.subtle,
		);
		let settleLateSign!: (value: ArrayBuffer) => void;
		const lateSign = new Promise<ArrayBuffer>((resolve) => {
			settleLateSign = resolve;
		});
		vi.spyOn(globalThis.crypto.subtle, "sign")
			.mockImplementationOnce(() => lateSign)
			.mockImplementation((algorithm, key, data) =>
				nativeSign(algorithm, key, data),
			);
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const stale = createBootstrapConnection();
		accept(runtime, stale);
		stale.emit(createFreshRequest());
		await vi.waitFor(() =>
			expect(globalThis.crypto.subtle.sign).toHaveBeenCalledTimes(1),
		);
		await vi.waitFor(() => expect(stale.closeCount).toBe(1));

		const blocked = createBootstrapConnection();
		accept(runtime, blocked);
		await vi.waitFor(() => expect(blocked.closeCount).toBe(1));
		expect(blocked.subscriptionCount).toBe(0);

		settleLateSign(new Uint8Array(32).buffer);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		const replacement = createBootstrapConnection();
		accept(runtime, replacement);
		expect(replacement.subscriptionCount).toBe(1);
		replacement.emit(createFreshRequest());
		await vi.waitFor(() =>
			expect(
				replacement.responses[replacement.responses.length - 1]?.kind,
			).toBe("accept"),
		);

		expect(stale.responses).toEqual([]);
		expect(admittedSessions).toEqual([1]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SPI-008/RPC-SEC-009 bounds Connector crypto orphans with the same owner handshake cap", async () => {
		const { runtime, ownerFaults, attachedSessions } = createConnectorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const controller = new AbortController();
		const stale = createBootstrapConnection();
		void runtime.bind(stale.connection, controller.signal).catch(() => {});
		await vi.waitFor(() => expect(stale.responses).toHaveLength(1));
		const acceptRecord = await createFreshAccept(stale.responses[0] ?? {});
		vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(
			() => new Promise<ArrayBuffer>(() => {}),
		);
		stale.emit(acceptRecord);
		await vi.waitFor(() =>
			expect(globalThis.crypto.subtle.digest).toHaveBeenCalledTimes(1),
		);

		controller.abort();
		await vi.waitFor(() => expect(stale.closeCount).toBe(1));
		const blocked = createBootstrapConnection();
		void runtime
			.bind(blocked.connection, new AbortController().signal)
			.catch(() => {});

		expect(blocked.subscriptionCount).toBe(0);
		expect(blocked.closeCount).toBe(0);
		await Promise.resolve();
		expect(blocked.closeCount).toBe(1);
		expect(blocked.responses).toEqual([]);
		expect(attachedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SESSION-010 RPC-CORPUS-003 discards a late initiator verification after attempt abort", async () => {
		const { runtime, ownerFaults, attachedSessions } = createConnectorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const controller = new AbortController();
		const stale = createBootstrapConnection();
		void runtime.bind(stale.connection, controller.signal).catch(() => {});
		await vi.waitFor(() => expect(stale.responses).toHaveLength(1));
		const acceptRecord = await createFreshAccept(stale.responses[0] ?? {});
		let settleVerification!: (valid: boolean) => void;
		vi.spyOn(globalThis.crypto.subtle, "verify").mockImplementation(
			() =>
				new Promise<boolean>((resolve) => {
					settleVerification = resolve;
				}),
		);
		stale.emit(acceptRecord);
		await vi.waitFor(() =>
			expect(globalThis.crypto.subtle.verify).toHaveBeenCalledTimes(1),
		);

		controller.abort();
		await vi.waitFor(() => expect(stale.closeCount).toBe(1));
		settleVerification(true);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(attachedSessions).toEqual([]);
		const replacement = createBootstrapConnection();
		void runtime
			.bind(replacement.connection, new AbortController().signal)
			.catch(() => {});
		expect(replacement.subscriptionCount).toBe(1);
		await vi.waitFor(() => expect(replacement.responses).toHaveLength(1));
		expect(replacement.responses[0]).toMatchObject({ kind: "fresh" });
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-RESOURCE-003/RPC-RESOURCE-004 shares pre-classification slots across resume and fresh", async () => {
		vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(
			() => new Promise<ArrayBuffer>(() => {}),
		);
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const resume = createBootstrapConnection();
		accept(runtime, resume);
		resume.emit(createResumeRequest());
		await vi.waitFor(() =>
			expect(globalThis.crypto.subtle.digest).toHaveBeenCalled(),
		);
		await vi.waitFor(() => expect(resume.closeCount).toBe(1));

		const fresh = createBootstrapConnection();
		accept(runtime, fresh);
		await vi.waitFor(() => expect(fresh.closeCount).toBe(1));

		expect(fresh.subscriptionCount).toBe(0);
		expect(fresh.responses).toEqual([]);
		expect(resume.responses).toEqual([]);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-RESOURCE-004/RPC-SEC-009 does not fan out an untracked digest after transcript failure", async () => {
		const digest = vi
			.spyOn(globalThis.crypto.subtle, "digest")
			.mockRejectedValueOnce(new Error("first transcript digest failed"))
			.mockImplementation(() => new Promise<ArrayBuffer>(() => {}));
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const rejected = createBootstrapConnection();
		accept(runtime, rejected);
		rejected.emit(createResumeRequest());
		await vi.waitFor(() => expect(rejected.closeCount).toBe(1));

		expect(digest).toHaveBeenCalledTimes(1);
		const replacement = createBootstrapConnection();
		accept(runtime, replacement);
		expect(replacement.subscriptionCount).toBe(1);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SESSION-004/RPC-VALID-003 keeps bounded fresh rejection attempt-scoped", async () => {
		const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const connection = createBootstrapConnection();
		accept(runtime, connection);
		connection.emit({
			...createFreshRequest(),
			profiles: ["unsupported-profile"],
		});
		await vi.waitFor(() => expect(connection.closeCount).toBe(1));

		expect(connection.responses).toEqual([
			{ kind: "reject", code: "unsupported-profile" },
		]);
		expect(digest).not.toHaveBeenCalled();
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-VALID-003 keeps an invalid unbound first record Connection-scoped", async () => {
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const connection = createBootstrapConnection();
		accept(runtime, connection);
		connection.emit({ kind: "bogus" });
		await vi.waitFor(() => expect(connection.closeCount).toBe(1));

		expect(connection.responses).toEqual([]);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});
});
