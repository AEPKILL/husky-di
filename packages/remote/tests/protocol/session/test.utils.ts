/**
 * @overview Shared protocol/rpc-session fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { vi } from "vitest";
import type {
	IRpcCodec,
	IRpcEndpoint,
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSessionHost,
	RpcProtocolSessionTransition,
	RpcSessionActivityFactory,
} from "../../../src/modules/protocol";
import {
	createRpcSessionActivity,
	createRpcSessionCallRetention,
	createRpcSessionConnection,
	createRpcSessionContinuity,
	createRpcSessionDelivery,
	createRpcSessionIncomingCalls,
	createRpcSessionInvocations,
	createRpcSessionShutdown,
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	RpcCodecImpl,
	RpcEndpointFailureEnum,
	RpcSessionImpl,
	rpcApplicationValuesEqual,
} from "../../../src/modules/protocol";
import { RpcRetainedBytesLedgerImpl } from "../../../src/shared/impls/rpc-retained-bytes-ledger.impl";

export const policy: IRpcProtocolRuntimePolicy = {
	maxSessions: 2,
	maxHandshakes: 2,
	maxPendingInvocationsPerSession: 8,
	maxRetainedBytesPerSession: 1024 * 1024,
	maxRetainedBytesTotal: 2 * 1024 * 1024,
	maxHandlersPerSession: 2,
	maxHandlersTotal: 4,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 30_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
};

export const codec = new RpcCodecImpl();

export function createSession(
	sessionId: string,
	createActivity: RpcSessionActivityFactory = createRpcSessionActivity,
	options: {
		readonly codec?: IRpcCodec;
		readonly counterExhausted?: boolean;
	} = {},
): Readonly<{
	readonly session: RpcSessionImpl;
	readonly sessionHost: IRpcProtocolSessionHost;
	readonly transitions: RpcProtocolSessionTransition[];
	readonly onTerminal: ReturnType<typeof vi.fn<() => void>>;
	readonly ownerReservationReleases: readonly ReturnType<
		typeof vi.fn<() => void>
	>[];
}> {
	const ownerLedger = new RpcRetainedBytesLedgerImpl(
		policy.maxRetainedBytesTotal,
	);
	const ownerReservationReleases: ReturnType<typeof vi.fn<() => void>>[] = [];
	const host: IRpcProtocolHost = {
		policy,
		reserveRetainedBytes(bytes) {
			const reservation = ownerLedger.reserve(bytes);
			if (reservation === undefined) return undefined;
			const release = vi.fn(() => reservation.release());
			ownerReservationReleases.push(release);
			return Object.freeze({ release });
		},
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault() {},
	};
	const transitions: RpcProtocolSessionTransition[] = [];
	const onTerminal = vi.fn<() => void>();
	return {
		session: new RpcSessionImpl(
			{
				host,
				sessionId,
				resumeToken: `${sessionId}-token`,
				onTerminal,
			},
			{
				codec: options.codec ?? codec,
				counterExhausted: options.counterExhausted,
				createActivity,
				createCallRetention: createRpcSessionCallRetention,
				createConnection: createRpcSessionConnection,
				createContinuity: createRpcSessionContinuity,
				createDelivery: createRpcSessionDelivery,
				createShutdown: createRpcSessionShutdown,
				createIncomingCalls: createRpcSessionIncomingCalls,
				createInvocations: createRpcSessionInvocations,
				retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
					policy.maxRetainedBytesPerSession,
				),
			},
		),
		sessionHost: {
			reserveIncomingCall: () => false,
			transition: (transition) => transitions.push(transition),
			fault() {},
		},
		transitions,
		onTerminal,
		ownerReservationReleases,
	};
}

export function createEndpoint(): IRpcEndpoint {
	return {
		isSendIdle: true,
		isIngressIdle: true,
		configureSendProgressTimeout() {},
		observeIngressIdle() {},
		async sendNow() {},
		fenceAndClose() {},
	};
}

export function enterRecovery(
	session: RpcSessionImpl,
	sessionHost: IRpcProtocolSessionHost,
): void {
	const binding = session.prepareFresh(sessionHost).install(createEndpoint());
	if (!binding.activate()) {
		throw new Error("Expected the fresh Session binding to activate.");
	}
	binding.fail(RpcEndpointFailureEnum.connection);
}
