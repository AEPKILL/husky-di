/**
 * @overview Behavioral tests for the role-specific Logical Session–Peer ownership seams.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseOutcomeEnum } from "../../src/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/enums/rpc-state-status.enum";
import type { RpcPeerFactory } from "../../src/factories/rpc-peer.factory";
import {
	RpcAcceptorPublisherImpl,
	RpcConnectorPublisherImpl,
} from "../../src/impls/owner/rpc-owner-publisher.impl";
import {
	RpcAcceptorSessionOwnershipImpl,
	RpcConnectorSessionOwnershipImpl,
} from "../../src/impls/owner/rpc-session-ownership.impl";
import { RpcPeerImpl } from "../../src/impls/peer/rpc-peer.impl";
import type {
	IRpcAcceptorSessionOwnership,
	IRpcConnectorSessionOwnership,
} from "../../src/interfaces/owner/rpc-session-ownership.interface";
import type { IRpcPeer } from "../../src/interfaces/peer/rpc-peer.interface";
import type { IRpcPeerHost } from "../../src/interfaces/peer/rpc-peer-host.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolConnector,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolSessionTransition,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type {
	RpcAcceptorState,
	RpcPeerState,
} from "../../src/types/common/rpc-caller.type";
import type { RpcEvent } from "../../src/types/owner/rpc-event.type";
import {
	registerRpcSessionRetainedBytes,
	unregisterRpcSessionRetainedBytes,
} from "../../src/utils/rpc-session-retained-bytes.util";

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
		const peer = new RpcPeerImpl(options);
		return Object.freeze({
			peer,
			reserveIncomingCall: (
				request: Parameters<IRpcPeerHost["reserveIncomingCall"]>[0],
				consume: Parameters<IRpcPeerHost["reserveIncomingCall"]>[1],
			) => peer.reserveIncomingCall(request, consume),
			hasLocalExposure: (wireName: string) => peer.hasLocalExposure(wireName),
		});
	};
}

function createSession(forceClose = vi.fn()): IRpcProtocolSession {
	return {
		prepareInvocation: () => undefined,
		forceClose,
	};
}

function createConnectorHarness(): ConnectorHarness {
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
			lifecycle: {
				ensureTermination: () => {
					if (!terminationStarted) {
						terminationStarted = true;
						actions.push("termination");
					}
				},
				abortCurrentAttempt: () => actions.push("abort-attempt"),
				failProvisionalAttachment: (_attachment, error) =>
					actions.push(
						`fail-provisional:${"code" in error ? String(error.code) : "none"}`,
					),
				clearGraceTimer: () => actions.push("clear-timer"),
				continueGracefulShutdown: () => actions.push("continue-grace"),
				startCleanup: () => actions.push("cleanup"),
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

function createAcceptorHarness(maximumSessions = 2): AcceptorHarness {
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
			lifecycle: {
				canAdmitSession: () => true,
				ensureTermination: () => {
					if (!terminationStarted) {
						terminationStarted = true;
						actions.push("termination");
					}
				},
				clearGraceTimer: () => actions.push("clear-timer"),
				abortListener: () => actions.push("abort-listener"),
				continueGracefulShutdown: () => actions.push("continue-grace"),
				startCleanup: () => actions.push("cleanup"),
			},
		},
		{ createPeer: createPeerFactory(peerConstructions) },
	);
	return { ownership, publisher, protocol, actions, peerConstructions };
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

function attachConnector(
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

function admitAcceptor(
	harness: AcceptorHarness,
	session: IRpcProtocolSession,
): IRpcProtocolSessionHost {
	const host = harness.ownership.admit(session);
	if (host === undefined) {
		throw new Error("Expected the Acceptor Session to be admitted.");
	}
	return host;
}

function publishPeerState(
	publisher: RpcConnectorPublisherImpl | RpcAcceptorPublisherImpl,
	peer: IRpcPeer,
	state: RpcPeerState,
): void {
	publisher.enqueue(() => ({
		publication: { peerStates: [{ peer, state }] },
	}));
}

function publishAcceptorState(
	publisher: RpcAcceptorPublisherImpl,
	state: RpcAcceptorState,
): void {
	publisher.enqueue(() => ({ publication: { state } }));
}

function collectEvents(events: RpcEvent[], event: RpcEvent): void {
	events.push(event);
}

describe("Connector Session ownership", () => {
	it("owns provisional attachment, stable Peer identity, and retained-byte routing", () => {
		const harness = createConnectorHarness();
		const peer = harness.ownership.peer;
		const forceClose = vi.fn();
		const session = createSession(forceClose);
		const sessionReservation: IRpcRetainedBytesReservation = {
			release: vi.fn(),
		};
		const construction = harness.peerConstructions[0];
		if (construction === undefined) {
			throw new Error("Expected one stable Peer construction.");
		}
		expect(harness.ownership.attach({} as IRpcProtocolSession)).toBeUndefined();
		const attachment = harness.ownership.attach(session);
		expect(attachment).toBeDefined();
		expect(harness.ownership.attach(createSession())).toBeUndefined();
		expect(harness.ownership.attached).toBe(true);
		expect(construction.getSession()).toBeUndefined();
		registerRpcSessionRetainedBytes(session, () => sessionReservation);
		expect(construction.reserveRetainedBytes(3)).toBe(sessionReservation);
		unregisterRpcSessionRetainedBytes(session);

		attachment?.discard();
		expect(forceClose).toHaveBeenCalledOnce();
		expect(harness.ownership.attached).toBe(false);
		expect(harness.ownership.peer).toBe(peer);
		expect(construction.reserveRetainedBytes(2)).toBe(harness.ownerReservation);
		expect(harness.ownerReservedBytes).toEqual([2]);
	});

	it("atomically activates visibility and publishes the connected lifecycle", () => {
		const harness = createConnectorHarness();
		const session = createSession();
		const observations: string[] = [];
		const construction = harness.peerConstructions[0];
		if (construction === undefined) {
			throw new Error("Expected one stable Peer construction.");
		}
		harness.ownership.peer.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.connected) {
				observations.push(
					`state:connected:visible=${String(construction.getSession() === session)}`,
				);
			}
		});
		harness.publisher.event$.subscribe((event) =>
			observations.push(
				`event:${event.type}:state=${harness.ownership.peer.state.status}:visible=${String(construction.getSession() === session)}`,
			),
		);
		publishPeerState(harness.publisher, harness.ownership.peer, {
			status: RpcStateStatusEnum.connecting,
		});

		const attachment = harness.ownership.attach(session);
		if (attachment === undefined) {
			throw new Error("Expected a provisional attachment.");
		}
		expect(construction.getSession()).toBeUndefined();
		expect(attachment.activate(() => true)).toBe(true);
		expect(attachment.active).toBe(true);
		expect(construction.getSession()).toBe(session);
		expect(harness.ownership.peer.state.status).toBe(
			RpcStateStatusEnum.connected,
		);
		expect(observations).toEqual([
			"state:connected:visible=true",
			`event:${RpcEventTypeEnum.peerOpened}:state=${RpcStateStatusEnum.connected}:visible=true`,
		]);
	});

	it("rejects a stale activation gate without exposing or publishing the Session", () => {
		const harness = createConnectorHarness();
		const session = createSession();
		const events: RpcEvent[] = [];
		const construction = harness.peerConstructions[0];
		if (construction === undefined) {
			throw new Error("Expected one stable Peer construction.");
		}
		harness.publisher.event$.subscribe((event) => events.push(event));
		publishPeerState(harness.publisher, harness.ownership.peer, {
			status: RpcStateStatusEnum.connecting,
		});
		const attachment = harness.ownership.attach(session);
		if (attachment === undefined) {
			throw new Error("Expected a provisional attachment.");
		}

		expect(attachment.activate(() => false)).toBe(false);
		expect(attachment.active).toBe(false);
		expect(construction.getSession()).toBeUndefined();
		expect(harness.ownership.peer.state.status).toBe(
			RpcStateStatusEnum.connecting,
		);
		expect(events).toEqual([]);

		attachment.discard();
		expect(attachment.activate(() => true)).toBe(false);
		expect(harness.ownership.attached).toBe(false);
	});

	it("drives terminal release, publication, notification, and cleanup order", () => {
		const harness = createConnectorHarness();
		const events: RpcEvent[] = [];
		const session = createSession();
		const host = attachConnector(harness, session);
		harness.publisher.event$.subscribe((event) => {
			collectEvents(events, event);
			harness.actions.push(
				`event:${event.type}:attached=${String(harness.ownership.attached)}`,
			);
		});

		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});

		expect(harness.ownership.attached).toBe(false);
		expect(harness.publisher.state.status).toBe(RpcStateStatusEnum.closing);
		expect(harness.ownership.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		expect(events.map(({ type }) => type)).toEqual([
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.ownerClosing,
		]);
		expect(harness.actions).toEqual([
			"termination",
			"abort-attempt",
			`event:${RpcEventTypeEnum.peerClosed}:attached=false`,
			`event:${RpcEventTypeEnum.ownerClosing}:attached=false`,
			"cleanup",
		]);
	});

	it("projects and fences a recursive invalid-transition fault inside the adapter", () => {
		const harness = createConnectorHarness();
		let host: IRpcProtocolSessionHost | undefined;
		const forceClose = vi.fn(() =>
			host?.fault(RpcCloseReasonEnum.protocolFault, new Error("recursive")),
		);
		const session = createSession(forceClose);
		host = attachConnector(harness, session);

		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});

		expect(forceClose).toHaveBeenCalledOnce();
		expect(harness.ownership.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.protocolFault,
			error: { code: RpcExceptionCodeEnum.protocol },
		});
	});

	it("projects a provisional fault before delegating attempt failure", () => {
		const harness = createConnectorHarness();
		const session = createSession();
		const attachment = harness.ownership.attach(session);
		if (attachment === undefined) {
			throw new Error("Expected provisional attachment.");
		}

		attachment.host.fault(
			RpcCloseReasonEnum.resourceFault,
			new Error("resource"),
		);

		expect(harness.actions).toEqual([
			`fail-provisional:${RpcExceptionCodeEnum.protocol}`,
		]);
		expect(harness.ownership.attached).toBe(false);
	});
});

describe("Acceptor Session ownership", () => {
	it("atomically admits unique Sessions within capacity and publishes membership first", () => {
		const harness = createAcceptorHarness(1);
		const observations: string[] = [];
		harness.publisher.event$.subscribe((event) =>
			observations.push(
				`${event.type}:peers=${harness.publisher.peers.length}`,
			),
		);
		const session = createSession();

		expect(harness.ownership.admit({} as IRpcProtocolSession)).toBeUndefined();
		expect(harness.ownership.admit(session)).toBeDefined();
		expect(harness.ownership.admit(session)).toBeUndefined();
		expect(harness.ownership.admit(createSession())).toBeUndefined();
		expect(harness.publisher.peers).toHaveLength(1);
		expect(harness.peerConstructions[0]?.getSession()).toBe(session);
		expect(observations).toEqual([`${RpcEventTypeEnum.peerOpened}:peers=1`]);
	});

	it("owns recovery, terminal membership release, and one stale-session cutoff", () => {
		const harness = createAcceptorHarness();
		const events: RpcEvent[] = [];
		harness.publisher.event$.subscribe((event) => collectEvents(events, event));
		const forceClose = vi.fn();
		const session = createSession(forceClose);
		const host = admitAcceptor(harness, session);
		const peer = harness.publisher.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}

		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		host.transition({ type: RpcProtocolSessionTransitionTypeEnum.recovered });
		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		host.fault(RpcCloseReasonEnum.protocolFault, new Error("late"));

		expect(harness.publisher.peers).toEqual([]);
		expect(peer.state.status).toBe(RpcStateStatusEnum.closed);
		expect(forceClose).toHaveBeenCalledOnce();
		expect(events.map(({ type }) => type)).toEqual([
			RpcEventTypeEnum.peerOpened,
			RpcEventTypeEnum.peerRecovering,
			RpcEventTypeEnum.peerRecovered,
			RpcEventTypeEnum.peerClosed,
		]);
	});

	it("fences recursive Session faults and keeps the fault at the smallest scope", () => {
		const harness = createAcceptorHarness();
		let host: IRpcProtocolSessionHost | undefined;
		const forceClose = vi.fn(() =>
			host?.fault(RpcCloseReasonEnum.protocolFault, new Error("recursive")),
		);
		const session = createSession(forceClose);
		host = admitAcceptor(harness, session);
		const peer = harness.publisher.peers[0];

		host.fault(RpcCloseReasonEnum.protocolFault, new Error("primary"));

		expect(forceClose).toHaveBeenCalledOnce();
		expect(harness.publisher.state.status).toBe(RpcStateStatusEnum.active);
		expect(harness.publisher.peers).toEqual([]);
		expect(peer?.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.protocolFault,
			error: { code: RpcExceptionCodeEnum.protocol },
		});
	});

	it("fences all Sessions while a shared Protocol fault closes the topology", () => {
		const harness = createAcceptorHarness();
		admitAcceptor(harness, createSession());
		admitAcceptor(harness, createSession());
		const events: RpcEvent[] = [];
		harness.publisher.event$.subscribe((event) => {
			events.push(event);
			harness.actions.push(
				`event:${event.type}:peers=${harness.publisher.peers.length}`,
			);
		});

		harness.ownership.protocolFault(
			RpcCloseReasonEnum.protocolFault,
			new Error("shared"),
		);

		expect(harness.protocol.close).toHaveBeenCalledOnce();
		expect(harness.publisher.peers).toEqual([]);
		expect(harness.publisher.state.status).toBe(RpcStateStatusEnum.closing);
		expect(events.map(({ type }) => type)).toEqual([
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.ownerClosing,
		]);
		expect(harness.actions).toEqual([
			"termination",
			"clear-timer",
			"abort-listener",
			`event:${RpcEventTypeEnum.peerClosed}:peers=0`,
			`event:${RpcEventTypeEnum.peerClosed}:peers=0`,
			`event:${RpcEventTypeEnum.ownerClosing}:peers=0`,
			"cleanup",
		]);
	});

	it("cuts off recovering Sessions before notifying graceful shutdown", () => {
		const harness = createAcceptorHarness();
		const recoveringForceClose = vi.fn();
		admitAcceptor(harness, createSession());
		const recoveringHost = admitAcceptor(
			harness,
			createSession(recoveringForceClose),
		);
		recoveringHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		harness.ownership.beginGracefulShutdown();

		expect(recoveringForceClose).toHaveBeenCalledOnce();
		expect(harness.publisher.state.status).toBe(RpcStateStatusEnum.draining);
		expect(harness.publisher.peers).toHaveLength(1);
		expect(harness.publisher.peers[0]?.state).toMatchObject({
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		});
		expect(harness.actions).toEqual(["abort-listener", "continue-grace"]);
	});
});

type SessionOwnerStatus =
	| RpcStateStatusEnum.active
	| RpcStateStatusEnum.draining;

type TransitionCase = Readonly<{
	readonly name: string;
	readonly ownerStatus: SessionOwnerStatus;
	readonly peerState: RpcPeerState;
	readonly transition: RpcProtocolSessionTransition;
}>;

const validTransitionCases = [
	{
		name: "active connected to recovering",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
	},
	{
		name: "active recovering to recovered",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovered },
	},
	{
		name: "active connected to counter draining",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "active recovering to counter draining",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "active recovering to recovery expiry",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		},
	},
	{
		name: "active counter draining to counter exhaustion",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "active connected to remote termination",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
	},
	{
		name: "active recovering to continuity failure",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.continuityFailure,
		},
	},
	{
		name: "owner draining graceful peer to remote termination",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
	},
	{
		name: "owner draining counter peer to counter exhaustion",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
] satisfies readonly TransitionCase[];

const invalidTransitionCases = [
	{
		name: "repeats recovering",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
	},
	{
		name: "recovers a connected peer",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovered },
	},
	{
		name: "counter drains an unbound peer",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.unbound },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "expires recovery from connected",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		},
	},
	{
		name: "exhausts counters before counter drain",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "lets Protocol request graceful shutdown",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
	},
	{
		name: "changes recovery while owner drains",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
	},
	{
		name: "closes a connected peer while owner drains",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
	},
	{
		name: "expires recovery while owner drains",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		},
	},
	{
		name: "exhausts a gracefully draining peer",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
] satisfies readonly TransitionCase[];

const nonterminalProjectionCases = [
	{
		name: "projects recovery",
		peerState: { status: RpcStateStatusEnum.connected },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
		expectedState: { status: RpcStateStatusEnum.recovering },
		expectedEvent: { type: RpcEventTypeEnum.peerRecovering },
	},
	{
		name: "projects recovery completion",
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovered },
		expectedState: { status: RpcStateStatusEnum.connected },
		expectedEvent: { type: RpcEventTypeEnum.peerRecovered },
	},
	{
		name: "projects counter drain",
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		expectedState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		expectedEvent: {
			type: RpcEventTypeEnum.peerDraining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
] as const;

describe("transition policy through the Acceptor ownership adapter", () => {
	it.each(validTransitionCases)("accepts $name", ({
		ownerStatus,
		peerState,
		transition,
	}) => {
		const harness = createAcceptorHarness();
		const forceClose = vi.fn();
		const host = admitAcceptor(harness, createSession(forceClose));
		const peer = harness.publisher.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}
		publishPeerState(harness.publisher, peer, peerState);
		if (ownerStatus === RpcStateStatusEnum.draining) {
			publishAcceptorState(harness.publisher, {
				status: RpcStateStatusEnum.draining,
			});
		}

		host.transition(transition);

		expect(forceClose).not.toHaveBeenCalled();
	});

	it.each(invalidTransitionCases)("faults $name", ({
		ownerStatus,
		peerState,
		transition,
	}) => {
		const harness = createAcceptorHarness();
		const forceClose = vi.fn();
		const host = admitAcceptor(harness, createSession(forceClose));
		const peer = harness.publisher.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}
		publishPeerState(harness.publisher, peer, peerState);
		if (ownerStatus === RpcStateStatusEnum.draining) {
			publishAcceptorState(harness.publisher, {
				status: RpcStateStatusEnum.draining,
			});
		}

		host.transition(transition);

		expect(forceClose).toHaveBeenCalledOnce();
		expect(peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.protocolFault,
			error: {
				code: RpcExceptionCodeEnum.protocol,
				cause: {
					message: "Protocol requested an invalid Session transition.",
				},
			},
		});
	});

	it.each(nonterminalProjectionCases)("$name with matching state and event", ({
		peerState,
		transition,
		expectedState,
		expectedEvent,
	}) => {
		const harness = createAcceptorHarness();
		const events: RpcEvent[] = [];
		harness.publisher.event$.subscribe((event) => events.push(event));
		const host = admitAcceptor(harness, createSession());
		const peer = harness.publisher.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}
		publishPeerState(harness.publisher, peer, peerState);

		host.transition(transition);

		expect(peer.state).toEqual(expectedState);
		expect(events.at(-1)).toMatchObject({ ...expectedEvent, peer });
	});

	it("ignores callbacks after the Owner is terminal", () => {
		for (const status of [
			RpcStateStatusEnum.closing,
			RpcStateStatusEnum.closed,
		] as const) {
			const harness = createAcceptorHarness();
			const forceClose = vi.fn();
			const host = admitAcceptor(harness, createSession(forceClose));
			if (status === RpcStateStatusEnum.closing) {
				publishAcceptorState(harness.publisher, { status });
			} else {
				harness.publisher.finish(
					{
						status,
						outcome: RpcCloseOutcomeEnum.normal,
						reason: RpcCloseReasonEnum.forcedClose,
					},
					() => {},
				);
			}

			host.transition({
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.remoteTerminated,
			});

			expect(forceClose).not.toHaveBeenCalled();
		}
	});
});

const terminalTransitionCases = [
	{
		name: "remote termination",
		prelude: [] as const,
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
		outcome: RpcCloseOutcomeEnum.normal,
		code: undefined,
	},
	{
		name: "recovery expiry",
		prelude: [
			{ type: RpcProtocolSessionTransitionTypeEnum.recovering },
		] as const,
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		},
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.unavailable,
	},
	{
		name: "counter exhaustion",
		prelude: [
			{
				type: RpcProtocolSessionTransitionTypeEnum.draining,
				reason: RpcCloseReasonEnum.counterExhaustion,
			},
		] as const,
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.unavailable,
	},
	{
		name: "continuity failure",
		prelude: [] as const,
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.continuityFailure,
		},
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.protocol,
	},
] satisfies readonly Readonly<{
	name: string;
	prelude: readonly RpcProtocolSessionTransition[];
	transition: RpcProtocolSessionTransition;
	outcome: RpcCloseOutcomeEnum;
	code: RpcExceptionCodeEnum | undefined;
}>[];

describe("shared transition policy behind both role adapters", () => {
	it.each(terminalTransitionCases)("classifies $name", ({
		prelude,
		transition,
		outcome,
		code,
	}) => {
		const harness = createAcceptorHarness();
		const events: RpcEvent[] = [];
		harness.publisher.event$.subscribe((event) => events.push(event));
		const host = admitAcceptor(harness, createSession());
		const peer = harness.publisher.peers[0];
		const cause = new Error("terminal cause");
		for (const prior of prelude) {
			host.transition(prior);
		}

		host.transition({ ...transition, cause });

		expect(peer?.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome,
			reason:
				transition.type === RpcProtocolSessionTransitionTypeEnum.closed
					? transition.reason
					: undefined,
		});
		if (
			code !== undefined &&
			peer?.state.status === RpcStateStatusEnum.closed
		) {
			expect("error" in peer.state ? peer.state.error.code : undefined).toBe(
				code,
			);
			expect("error" in peer.state ? peer.state.error.cause : undefined).toBe(
				cause,
			);
		}
		expect(events.at(-1)).toMatchObject({
			type: RpcEventTypeEnum.peerClosed,
			peer,
			outcome,
		});
	});

	it.each([
		RpcCloseReasonEnum.gracefulShutdown,
		RpcCloseReasonEnum.forcedClose,
		RpcCloseReasonEnum.shutdownDeadline,
	] as const)("classifies Owner %s closure as normal", (reason) => {
		const harness = createAcceptorHarness();
		admitAcceptor(harness, createSession());
		const peer = harness.publisher.peers[0];

		harness.ownership.beginClosing(
			reason,
			reason !== RpcCloseReasonEnum.gracefulShutdown,
		);

		expect(peer?.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason,
		});
	});

	it.each([
		RpcCloseReasonEnum.protocolFault,
		RpcCloseReasonEnum.resourceFault,
	] as const)("classifies Session %s closure as Protocol failure", (reason) => {
		const harness = createAcceptorHarness();
		const cause = new Error("fault cause");
		const host = admitAcceptor(harness, createSession());
		const peer = harness.publisher.peers[0];

		host.fault(reason, cause);

		expect(peer?.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason,
			error: { code: RpcExceptionCodeEnum.protocol, cause },
		});
	});
});
