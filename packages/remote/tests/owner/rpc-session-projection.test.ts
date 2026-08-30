/**
 * @overview Logical Session projection policy tests.
 * @author AEPKILL
 * @created 2026-08-31 01:46:19
 */

import { describe, expect, it } from "vitest";

import { RpcProtocolSessionTransitionTypeEnum } from "../../src/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseOutcomeEnum } from "../../src/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/enums/rpc-state-status.enum";
import { RpcPeerImpl } from "../../src/impls/peer/rpc-peer.impl";
import type { IRpcPeerRuntime } from "../../src/interfaces/peer/rpc-peer-runtime.interface";
import type {
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "../../src/types/common/rpc-caller.type";
import type { RpcSessionOwnerStatus } from "../../src/types/owner/rpc-session-projection.type";
import {
	isRpcSessionTerminalProjection,
	projectRpcSession,
} from "../../src/utils/rpc-session-projection.util";

type TransitionCase = Readonly<{
	readonly name: string;
	readonly ownerStatus: RpcSessionOwnerStatus;
	readonly peerState: RpcPeerState;
	readonly transition: RpcProtocolSessionTransition;
}>;

type NonterminalProjectionCase = TransitionCase &
	Readonly<{
		readonly expectedState: RpcPeerState;
		readonly expectedEvent:
			| Readonly<{
					type:
						| RpcEventTypeEnum.peerRecovering
						| RpcEventTypeEnum.peerRecovered;
			  }>
			| Readonly<{
					type: RpcEventTypeEnum.peerDraining;
					reason: RpcCloseReasonEnum.counterExhaustion;
			  }>;
	}>;

type ClosureClassificationCase = Readonly<{
	readonly reason: RpcSessionCloseReason;
	readonly outcome: RpcCloseOutcomeEnum;
	readonly code?:
		| RpcExceptionCodeEnum.unavailable
		| RpcExceptionCodeEnum.protocol;
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
	{
		name: "transitions after owner closing",
		ownerStatus: RpcStateStatusEnum.closing,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
	},
	{
		name: "transitions after owner closed",
		ownerStatus: RpcStateStatusEnum.closed,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
	},
] satisfies readonly TransitionCase[];

const nonterminalProjectionCases = [
	{
		name: "projects recovery",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
		expectedState: { status: RpcStateStatusEnum.recovering },
		expectedEvent: { type: RpcEventTypeEnum.peerRecovering },
	},
	{
		name: "projects recovery completion",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovered },
		expectedState: { status: RpcStateStatusEnum.connected },
		expectedEvent: { type: RpcEventTypeEnum.peerRecovered },
	},
	{
		name: "projects counter drain",
		ownerStatus: RpcStateStatusEnum.active,
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
] satisfies readonly NonterminalProjectionCase[];

const closureClassificationCases = [
	{
		reason: RpcCloseReasonEnum.gracefulShutdown,
		outcome: RpcCloseOutcomeEnum.normal,
	},
	{
		reason: RpcCloseReasonEnum.forcedClose,
		outcome: RpcCloseOutcomeEnum.normal,
	},
	{
		reason: RpcCloseReasonEnum.shutdownDeadline,
		outcome: RpcCloseOutcomeEnum.normal,
	},
	{
		reason: RpcCloseReasonEnum.remoteTerminated,
		outcome: RpcCloseOutcomeEnum.normal,
	},
	{
		reason: RpcCloseReasonEnum.recoveryExpired,
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.unavailable,
	},
	{
		reason: RpcCloseReasonEnum.counterExhaustion,
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.unavailable,
	},
	{
		reason: RpcCloseReasonEnum.continuityFailure,
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.protocol,
	},
	{
		reason: RpcCloseReasonEnum.protocolFault,
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.protocol,
	},
	{
		reason: RpcCloseReasonEnum.resourceFault,
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.protocol,
	},
] satisfies readonly ClosureClassificationCase[];

function createPeer(initialState: RpcPeerState): IRpcPeerRuntime {
	return new RpcPeerImpl({
		initialState,
		ownerExposureRegistry: new Map(),
		isOwnerActive: () => true,
		emitEvent() {},
		onProtocolFault() {},
		handlerScheduler: { enqueue: () => () => {} },
		maximumIncomingBytes: 1,
		reserveRetainedBytes: () => undefined,
	});
}

describe("RPC Session projection", () => {
	it.each(validTransitionCases)("accepts $name", ({
		ownerStatus,
		peerState,
		transition,
	}) => {
		const peer = createPeer(peerState);

		const projection = projectRpcSession(peer, {
			kind: "transition",
			ownerStatus,
			transition,
		});

		expect(projection.kind).toBe("commit");
		expect(peer.state).toEqual(peerState);
	});

	it.each(invalidTransitionCases)("rejects $name", ({
		ownerStatus,
		peerState,
		transition,
	}) => {
		const peer = createPeer(peerState);

		const projection = projectRpcSession(peer, {
			kind: "transition",
			ownerStatus,
			transition,
		});

		if (projection.kind !== "invalid") {
			throw new Error("Expected an invalid Session projection.");
		}
		expect(projection.fault).toMatchObject({
			reason: RpcCloseReasonEnum.protocolFault,
			error: {
				message: "Protocol requested an invalid Session transition.",
			},
		});
		expect(peer.state).toEqual(peerState);
	});

	it.each(nonterminalProjectionCases)("$name with matching state and event", ({
		ownerStatus,
		peerState,
		transition,
		expectedState,
		expectedEvent,
	}) => {
		const peer = createPeer(peerState);

		const projection = projectRpcSession(peer, {
			kind: "transition",
			ownerStatus,
			transition,
		});

		if (projection.kind !== "commit") {
			throw new Error("Expected a committed Session projection.");
		}
		expect(projection.peerMutation).toEqual({
			peer,
			state: expectedState,
		});
		expect(projection.event).toEqual({ peer, ...expectedEvent });
		expect(projection.peerMutation.terminal).toBeUndefined();
		expect(isRpcSessionTerminalProjection(projection)).toBe(false);
		expect(peer.state).toEqual(peerState);
	});

	it.each(
		closureClassificationCases,
	)("classifies $reason closure as $outcome", ({ reason, outcome, code }) => {
		const cause = new Error(`cause:${reason}`);
		const peerState = { status: RpcStateStatusEnum.connected } as const;
		const peer = createPeer(peerState);

		const projection = projectRpcSession(peer, {
			kind: "closure",
			reason,
			cause,
		});

		if (!isRpcSessionTerminalProjection(projection)) {
			throw new Error("Expected a committed Session closure projection.");
		}
		const state = projection.peerMutation.state;
		expect(projection.peerMutation.peer).toBe(peer);
		expect(projection.peerMutation.terminal).toBe(true);
		expect(state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome,
			reason,
		});
		expect(projection.event).toEqual({
			type: RpcEventTypeEnum.peerClosed,
			peer,
			outcome,
			reason,
		});
		if (code === undefined) {
			expect("error" in state).toBe(false);
		} else {
			if (!("error" in state)) {
				throw new Error("Expected a failed Peer state Error.");
			}
			expect(state.error.code).toBe(code);
			expect(state.error.cause).toBe(cause);
		}
		expect(peer.state).toEqual(peerState);
	});

	it.each([
		{
			name: "normal",
			peerState: { status: RpcStateStatusEnum.connected },
			transition: {
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.remoteTerminated,
			},
			outcome: RpcCloseOutcomeEnum.normal,
			code: undefined,
		},
		{
			name: "unavailable",
			peerState: { status: RpcStateStatusEnum.recovering },
			transition: {
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.recoveryExpired,
			},
			outcome: RpcCloseOutcomeEnum.failed,
			code: RpcExceptionCodeEnum.unavailable,
		},
		{
			name: "protocol",
			peerState: { status: RpcStateStatusEnum.connected },
			transition: {
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.continuityFailure,
			},
			outcome: RpcCloseOutcomeEnum.failed,
			code: RpcExceptionCodeEnum.protocol,
		},
	] as const)("routes $name terminal transitions through closure policy", ({
		peerState,
		transition,
		outcome,
		code,
	}) => {
		const cause = new Error(`transition:${transition.reason}`);
		const peer = createPeer(peerState);

		const projection = projectRpcSession(peer, {
			kind: "transition",
			ownerStatus: RpcStateStatusEnum.active,
			transition: { ...transition, cause },
		});

		if (!isRpcSessionTerminalProjection(projection)) {
			throw new Error("Expected a committed terminal transition projection.");
		}
		const state = projection.peerMutation.state;
		expect(projection.peerMutation.terminal).toBe(true);
		expect(state.outcome).toBe(outcome);
		expect(projection.event).toMatchObject({
			type: RpcEventTypeEnum.peerClosed,
			outcome,
			reason: transition.reason,
		});
		if (code === undefined) {
			expect("error" in state).toBe(false);
		} else {
			if (!("error" in state)) {
				throw new Error("Expected a failed Peer state Error.");
			}
			expect(state.error.code).toBe(code);
			expect(state.error.cause).toBe(cause);
		}
	});
});
