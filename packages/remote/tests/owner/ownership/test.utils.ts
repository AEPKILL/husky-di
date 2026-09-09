/**
 * @overview Shared owner/rpc-session-ownership fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { vi } from "vitest";
import type {
	IRpcAcceptorSessionOwnership,
	IRpcConnectorSessionOwnership,
	RpcAcceptorState,
	RpcEvent,
} from "../../../src/modules/owner";
import {
	RpcAcceptorPublisherImpl,
	RpcAcceptorSessionOwnershipImpl,
	RpcConnectorPublisherImpl,
	RpcConnectorSessionOwnershipImpl,
} from "../../../src/modules/owner";
import type {
	IRpcPeer,
	IRpcPeerHost,
	RpcPeerState,
} from "../../../src/modules/peer";
import { createRpcPeer, type RpcPeerFactory } from "../../../src/modules/peer";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolConnector,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
} from "../../../src/modules/protocol";
import { RpcStateStatusEnum } from "../../../src/shared/enums/rpc-state-status.enum";

export function createSession(forceClose = vi.fn()): IRpcProtocolSession {
	return {
		prepareInvocation: () => undefined,
		forceClose,
	};
}

export function createConnectorHarness(): ConnectorHarness {
	const publisher = new RpcConnectorPublisherImpl({
		initialState: { status: RpcStateStatusEnum.active },
	});
	const protocol: IRpcProtocolConnector = {
		bind: vi.fn(async () => {}),
		shutdown: vi.fn(async () => {}),
		close: vi.fn(),
		cleanup: vi.fn(async () => {}),
	};
	const actions: string[] = [];
	const peerConstructions: RpcPeerConstruction[] = [];
	const ownerReservedBytes: number[] = [];
	const ownerReservation: IRpcRetainedBytesReservation = {
		release: vi.fn(),
	};
	let terminationStarted = false;
	const ownership = new RpcConnectorSessionOwnershipImpl(
		{
			publisher,
			protocol,
			peerEnvironment: createPeerEnvironment((bytes) => {
				ownerReservedBytes.push(bytes);
				return ownerReservation;
			}),
			termination: {
				ensureTermination: () => {
					if (!terminationStarted) {
						terminationStarted = true;
						actions.push("termination");
					}
				},
				enterGrace: () => () => {
					actions.push("continue-grace");
				},
				enterClosing: () => () => {
					actions.push("cleanup");
				},
			},
			lifecycle: {
				abortCurrentAttempt: () => actions.push("abort-attempt"),
				failProvisionalAttachment: (_attachment, error) =>
					actions.push(
						`fail-provisional:${"code" in error ? String(error.code) : "none"}`,
					),
			},
		},
		{ createPeer: createPeerFactory(peerConstructions) },
	);
	return {
		ownership,
		publisher,
		protocol,
		actions,
		peerConstructions,
		ownerReservedBytes,
		ownerReservation,
	};
}

export function createAcceptorHarness(maximumSessions = 2): AcceptorHarness {
	const publisher = new RpcAcceptorPublisherImpl({
		initialState: {
			status: RpcStateStatusEnum.active,
			listener: { status: RpcStateStatusEnum.idle },
		},
	});
	const protocol: IRpcProtocolAcceptor = {
		accept: vi.fn(async () => {}),
		shutdown: vi.fn(async () => {}),
		close: vi.fn(),
		cleanup: vi.fn(async () => {}),
	};
	const actions: string[] = [];
	const peerConstructions: RpcPeerConstruction[] = [];
	let terminationStarted = false;
	const ownership = new RpcAcceptorSessionOwnershipImpl(
		{
			publisher,
			protocol,
			maximumSessions,
			peerEnvironment: createPeerEnvironment(),
			termination: {
				ensureTermination: () => {
					if (!terminationStarted) {
						terminationStarted = true;
						actions.push("termination");
					}
				},
				enterGrace: () => () => {
					actions.push("continue-grace");
				},
				enterClosing: () => () => {
					actions.push("cleanup");
				},
			},
			lifecycle: {
				canAdmitSession: () => true,
				abortListener: () => actions.push("abort-listener"),
			},
		},
		{ createPeer: createPeerFactory(peerConstructions) },
	);
	return { ownership, publisher, protocol, actions, peerConstructions };
}

export function attachConnector(
	harness: ConnectorHarness,
	session: IRpcProtocolSession,
): IRpcProtocolSessionHost {
	publishPeerState(harness.publisher, harness.ownership.peer, {
		status: RpcStateStatusEnum.connecting,
	});
	const attachment = harness.ownership.attach(session);
	if (attachment === undefined || !attachment.activate(() => true)) {
		throw new Error("Expected the Connector Session to attach and activate.");
	}
	return attachment.host;
}

export function admitAcceptor(
	harness: AcceptorHarness,
	session: IRpcProtocolSession,
): IRpcProtocolSessionHost {
	const host = harness.ownership.admit(session);
	if (host === undefined) {
		throw new Error("Expected the Acceptor Session to be admitted.");
	}
	return host;
}

export function publishPeerState(
	publisher: RpcConnectorPublisherImpl | RpcAcceptorPublisherImpl,
	peer: IRpcPeer,
	state: RpcPeerState,
): void {
	publisher.enqueue(() => ({
		publication: { peerStates: [{ peer, state }] },
	}));
}

export function publishAcceptorState(
	publisher: RpcAcceptorPublisherImpl,
	state: RpcAcceptorState,
): void {
	publisher.enqueue(() => ({ publication: { state } }));
}

export function collectEvents(events: RpcEvent[], event: RpcEvent): void {
	events.push(event);
}

type RpcPeerConstruction = Parameters<RpcPeerFactory>[0];

interface ConnectorHarness {
	readonly ownership: IRpcConnectorSessionOwnership;
	readonly publisher: RpcConnectorPublisherImpl;
	readonly protocol: IRpcProtocolConnector;
	readonly actions: string[];
	readonly peerConstructions: RpcPeerConstruction[];
	readonly ownerReservedBytes: number[];
	readonly ownerReservation: IRpcRetainedBytesReservation;
}

interface AcceptorHarness {
	readonly ownership: IRpcAcceptorSessionOwnership;
	readonly publisher: RpcAcceptorPublisherImpl;
	readonly protocol: IRpcProtocolAcceptor;
	readonly actions: string[];
	readonly peerConstructions: RpcPeerConstruction[];
}

function createPeerFactory(
	constructions: RpcPeerConstruction[],
): RpcPeerFactory {
	return (options): IRpcPeerHost => {
		constructions.push(options);
		return createRpcPeer(options);
	};
}

function createPeerEnvironment(
	reserveOwnerRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined = () => undefined,
) {
	return {
		findOwnerExposure: () => undefined,
		isOwnerActive: () => true,
		handlerScheduler: { enqueue: () => () => {} },
		maximumIncomingBytes: 1,
		reserveOwnerRetainedBytes,
	};
}
