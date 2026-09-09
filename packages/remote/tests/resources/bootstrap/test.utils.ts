/**
 * @overview Shared resources/protocol-bootstrap fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Observable, Subject } from "rxjs";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
	IRpcProtocolRuntimePolicy,
	RpcFreshAccept,
	RpcJsonRecord,
	RpcProtocolSessionTransition,
	RpcResumeRequest,
	RpcSessionImpl,
} from "../../../src/modules/protocol";
import {
	createRpcProtocolAcceptor,
	createRpcProtocolConnector,
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	RpcCodecImpl,
	RpcDecodePhaseEnum,
	RpcWireRecordKindEnum,
	rpcApplicationValuesEqual,
} from "../../../src/modules/protocol";
import type { IRpcConnection } from "../../../src/modules/transport";
import { RpcRetainedBytesLedgerImpl } from "../../../src/shared/impls/rpc-retained-bytes-ledger.impl";

export type RpcSynchronousMessageTerminal =
	| Readonly<{ readonly kind: "complete" }>
	| Readonly<{ readonly kind: "error"; readonly error: Error }>;

export function createPolicy(
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

export function createAcceptorRuntime(
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
				reserveIncomingCall: () => false,
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

export function createConnectorRuntime(policy: IRpcProtocolRuntimePolicy): {
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
				reserveIncomingCall: () => false,
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

export function createBootstrapConnection(
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

export function createFreshRequest(): RpcJsonRecord {
	return {
		kind: "fresh",
		profiles: ["husky-di-rpc/1"],
	};
}

export function createResumeRequest(
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

export function createFreshAccept(
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

export function accept(
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

interface IBootstrapConnectionHarness {
	readonly connection: IRpcConnection;
	readonly responses: Readonly<Record<string, unknown>>[];
	readonly subscriptionCount: number;
	readonly closeCount: number;
	emit(record: RpcJsonRecord): void;
	complete(): void;
}

const codec = new RpcCodecImpl();

const canonicalSessionId = "A".repeat(43);

const canonicalResumeToken = `${"B".repeat(42)}E`;
